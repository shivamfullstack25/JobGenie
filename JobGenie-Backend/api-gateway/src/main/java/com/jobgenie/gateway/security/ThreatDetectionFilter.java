package com.jobgenie.gateway.security;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;

import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;
import reactor.util.function.Tuples;

/**
 * Threat detection at the gateway edge.
 *
 * <p>State (IP blacklist, per-minute request counters, client behavior profiles) lives in Redis via
 * {@link ReactiveStringRedisTemplate} rather than per-JVM in-memory maps, so it converges across
 * gateway replicas instead of resetting/diverging per instance. All Redis access here is
 * non-blocking (reactive) — this is a WebFlux app, and blocking Redis calls (RedisTemplate/Jedis)
 * on this code path would stall the reactive event loop under load.
 *
 * <p>The detection RULES themselves (regex threat patterns, thresholds) are unchanged from the
 * previous in-memory version — only where the mutable state is stored has changed.
 */
@Component
@Slf4j
public class ThreatDetectionFilter implements WebFilter {

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final ReactiveStringRedisTemplate redisTemplate;

  public ThreatDetectionFilter(ReactiveStringRedisTemplate redisTemplate) {
    this.redisTemplate = redisTemplate;
    // ClientSecurityProfile has no getters/setters (private fields only) — read/write them
    // directly rather than requiring bean-style accessors just for Redis JSON (de)serialization.
    this.objectMapper.setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY);
  }

  // Threat detection patterns
  private static final List<Pattern> SQL_INJECTION_PATTERNS =
      Arrays.asList(
          Pattern.compile("(?i).*(\\bunion\\b.*\\bselect\\b|\\bselect\\b.*\\bunion\\b).*"),
          Pattern.compile("(?i).*(\\bor\\b.*\\b=\\b.*\\bor\\b).*"),
          Pattern.compile("(?i).*(\\bdrop\\b.*\\btable\\b|\\bdelete\\b.*\\bfrom\\b).*"),
          Pattern.compile("(?i).*(\\binsert\\b.*\\binto\\b|\\bupdate\\b.*\\bset\\b).*"),
          Pattern.compile("(?i).*('|\")(\\s)*(or|and)(\\s)*('|\"|\\d).*"),
          Pattern.compile("(?i).*(\\bexec\\b|\\bexecute\\b|\\bsp_\\b).*"));

  private static final List<Pattern> XSS_PATTERNS =
      Arrays.asList(
          Pattern.compile("(?i).*<script[^>]*>.*</script>.*"),
          Pattern.compile("(?i).*javascript:.*"),
          Pattern.compile("(?i).*on(load|error|click|mouseover)\\s*=.*"),
          Pattern.compile("(?i).*<iframe[^>]*>.*"),
          Pattern.compile("(?i).*<object[^>]*>.*"),
          Pattern.compile("(?i).*<embed[^>]*>.*"),
          Pattern.compile("(?i).*<img[^>]*onerror.*"),
          Pattern.compile("(?i).*data:text/html.*"));

  // NOTE: '&' is intentionally excluded — it is the standard query-string parameter
  // separator and appears in virtually every legitimate multi-param request (e.g.
  // "?keywords=x&location=y"); flagging it as command injection blocked all such traffic.
  //
  // NOTE: the (wget|curl|nc|netcat|telnet|ssh) alternation must use \b word boundaries.
  // Without them it matches these as bare substrings anywhere in the URL — "nc" alone matched
  // inside "preferences", "finance", "balance", etc., so every request to /api/preferences
  // (a path segment containing "...nc..." nowhere close to a shell command) was unconditionally
  // blocked with 403 HIGH_THREAT_DETECTED. Same bug class as the "//" in "http://" false
  // positive fixed earlier in PATH_TRAVERSAL_PATTERNS usage above — a short/generic substring
  // pattern matching inside ordinary words rather than the intended standalone token.
  private static final List<Pattern> COMMAND_INJECTION_PATTERNS =
      Arrays.asList(
          Pattern.compile("(?i).*(;|\\||`|\\$\\(|\\$\\{).*"),
          Pattern.compile("(?i).*(\\.\\.\\\\/|[\\\\/]etc[\\\\/]|[\\\\/]bin[\\\\/]).*"),
          Pattern.compile("(?i).*\\b(wget|curl|nc|netcat|telnet|ssh)\\b.*"),
          Pattern.compile("(?i).*(rm\\s+-rf|chmod|chown|su\\s+|sudo\\s+).*"));

  private static final List<Pattern> PATH_TRAVERSAL_PATTERNS =
      Arrays.asList(
          Pattern.compile(".*\\.\\.[\\\\/].*"),
          Pattern.compile(".*([\\\\/]){2,}.*"),
          Pattern.compile(".*%2e%2e[\\\\/].*"),
          Pattern.compile(".*\\.\\.%2f.*"),
          Pattern.compile(".*%c0%af.*"),
          Pattern.compile(".*%252e%252e.*"));

  // Suspicious user agents
  private static final List<Pattern> SUSPICIOUS_USER_AGENTS =
      Arrays.asList(
          Pattern.compile("(?i).*(bot|crawler|scanner|spider|scraper|hack|exploit).*"),
          Pattern.compile("(?i).*(sqlmap|nikto|nmap|masscan|zap|burp).*"),
          Pattern.compile("(?i).*(curl|wget|python-requests|libwww-perl).*"),
          Pattern.compile("(?i).*script.*"));

  // Redis key prefixes for distributed threat-detection state (shared across gateway replicas).
  private static final String BLACKLIST_KEY_PREFIX = "gateway:threat:blacklist:";
  private static final String RATE_COUNT_KEY_PREFIX = "gateway:threat:ratecount:";
  private static final String PROFILE_KEY_PREFIX = "gateway:threat:profile:";

  // TTLs. Blacklist entries expire after a day so a transient burst doesn't ban an IP forever;
  // rate-window counters expire shortly after their 1-minute bucket rolls over; client profiles
  // (rolling threat/anomaly scores) use a sliding TTL refreshed on every update, so an IP that
  // goes quiet stops occupying Redis memory instead of accumulating state indefinitely.
  private static final Duration BLACKLIST_TTL = Duration.ofHours(24);
  private static final Duration RATE_WINDOW_TTL = Duration.ofSeconds(90);
  private static final Duration PROFILE_TTL = Duration.ofHours(1);

  // Configuration
  private static final int MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB
  private static final int MAX_REQUESTS_PER_MINUTE = 100;
  private static final int ANOMALY_THRESHOLD = 3;

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
    ServerHttpRequest request = exchange.getRequest();
    String path = request.getPath().value();
    // Bypass threat detection for infrastructure, auth, and documentation endpoints
    if (shouldBypassSecurityFilters(path)) {
      return chain.filter(exchange);
    }
    String clientIp = getClientIp(request);
    String userAgent = request.getHeaders().getFirst("User-Agent");
    String requestId = UUID.randomUUID().toString();

    // Add request ID to headers
    exchange.getResponse().getHeaders().add("X-Request-ID", requestId);

    // Check if IP is blacklisted
    return isBlacklisted(clientIp)
        .flatMap(
            blacklisted -> {
              if (Boolean.TRUE.equals(blacklisted)) {
                log.warn("Blocked request from blacklisted IP: {}", clientIp);
                return blockRequest(exchange, "IP_BLACKLISTED", requestId);
              }

              // Analyze request, then update the client's rolling security profile
              return analyzeRequest(request, clientIp, userAgent)
                  .flatMap(
                      analysis ->
                          updateClientProfile(clientIp, analysis)
                              .map(profile -> Tuples.of(analysis, profile)))
                  .flatMap(
                      tuple -> {
                        ThreatAnalysis analysis = tuple.getT1();
                        ClientSecurityProfile profile = tuple.getT2();

                        // Check for immediate threats
                        if (analysis.threatLevel == ThreatLevel.HIGH) {
                          log.error(
                              "HIGH THREAT detected from IP {}: {}", clientIp, analysis.threats);
                          return blockRequest(exchange, "HIGH_THREAT_DETECTED", requestId);
                        }

                        // Check for medium threats with rate limiting
                        if (analysis.threatLevel == ThreatLevel.MEDIUM) {
                          log.warn(
                              "MEDIUM THREAT detected from IP {}: {}", clientIp, analysis.threats);
                          // Implement progressive response delay
                          return Mono.delay(Duration.ofMillis(500)).then(chain.filter(exchange));
                        }

                        // Check for anomalous behavior
                        if (profile.anomalyScore > ANOMALY_THRESHOLD) {
                          log.info("Anomalous behavior detected from IP {}", clientIp);
                          // Add monitoring headers
                          exchange.getResponse().getHeaders().add("X-Security-Level", "MONITORED");
                        }

                        // Continue with normal processing
                        return chain.filter(exchange);
                      });
            });
  }

  private Mono<ThreatAnalysis> analyzeRequest(
      ServerHttpRequest request, String clientIp, String userAgent) {
    ThreatAnalysis analysis = new ThreatAnalysis();

    // Check request size
    if (request.getHeaders().getContentLength() > MAX_REQUEST_SIZE) {
      analysis.addThreat("LARGE_REQUEST_SIZE", ThreatLevel.MEDIUM);
    }

    // Analyze URL and parameters — use path+query only, NOT the full absolute URI.
    // request.getURI().toString() includes the "http://" scheme, whose "//" was
    // false-positively matching the path-traversal double-slash pattern below,
    // blocking every non-bypassed request through the gateway.
    String rawQuery = request.getURI().getRawQuery();
    String uri = request.getPath().value() + (rawQuery != null ? "?" + rawQuery : "");
    analyzeUrlThreats(uri, analysis);

    // Analyze headers
    analyzeHeaderThreats(request.getHeaders(), analysis);

    // Analyze user agent
    analyzeUserAgentThreats(userAgent, analysis);

    // Check request frequency (Redis-backed, shared across replicas)
    return analyzeRequestFrequency(clientIp, analysis).thenReturn(analysis);
  }

  private void analyzeUrlThreats(String uri, ThreatAnalysis analysis) {
    // SQL Injection detection
    for (Pattern pattern : SQL_INJECTION_PATTERNS) {
      if (pattern.matcher(uri).matches()) {
        analysis.addThreat("SQL_INJECTION_ATTEMPT", ThreatLevel.HIGH);
        break;
      }
    }

    // XSS detection
    for (Pattern pattern : XSS_PATTERNS) {
      if (pattern.matcher(uri).matches()) {
        analysis.addThreat("XSS_ATTEMPT", ThreatLevel.HIGH);
        break;
      }
    }

    // Command injection detection
    for (Pattern pattern : COMMAND_INJECTION_PATTERNS) {
      if (pattern.matcher(uri).matches()) {
        analysis.addThreat("COMMAND_INJECTION_ATTEMPT", ThreatLevel.HIGH);
        break;
      }
    }

    // Path traversal detection
    for (Pattern pattern : PATH_TRAVERSAL_PATTERNS) {
      if (pattern.matcher(uri).matches()) {
        analysis.addThreat("PATH_TRAVERSAL_ATTEMPT", ThreatLevel.HIGH);
        break;
      }
    }

    // Check for suspicious file extensions
    if (uri.matches(".*\\.(php|asp|jsp|cgi|pl|py|rb|sh|bat|cmd|exe).*")) {
      analysis.addThreat("SUSPICIOUS_FILE_ACCESS", ThreatLevel.MEDIUM);
    }

    // Check for admin/sensitive paths
    if (uri.matches("(?i).*(admin|config|backup|database|db|sql|log|secret|private|internal).*")) {
      analysis.addThreat("SENSITIVE_PATH_ACCESS", ThreatLevel.MEDIUM);
    }
  }

  private void analyzeHeaderThreats(
      org.springframework.http.HttpHeaders headers, ThreatAnalysis analysis) {
    // Check for suspicious headers
    String authorization = headers.getFirst("Authorization");
    if (authorization != null && authorization.contains("../")) {
      analysis.addThreat("MALICIOUS_AUTH_HEADER", ThreatLevel.HIGH);
    }

    // Check for header injection
    headers.forEach(
        (name, values) -> {
          for (String value : values) {
            if (value.contains("\r") || value.contains("\n")) {
              analysis.addThreat("HEADER_INJECTION", ThreatLevel.HIGH);
              return;
            }
          }
        });

    // Check for missing security headers (for responses)
    String referer = headers.getFirst("Referer");
    if (referer != null && !referer.startsWith("https://")) {
      analysis.addThreat("INSECURE_REFERER", ThreatLevel.LOW);
    }
  }

  private void analyzeUserAgentThreats(String userAgent, ThreatAnalysis analysis) {
    if (userAgent == null || userAgent.trim().isEmpty()) {
      analysis.addThreat("MISSING_USER_AGENT", ThreatLevel.LOW);
      return;
    }

    for (Pattern pattern : SUSPICIOUS_USER_AGENTS) {
      if (pattern.matcher(userAgent).matches()) {
        analysis.addThreat("SUSPICIOUS_USER_AGENT", ThreatLevel.MEDIUM);
        break;
      }
    }

    // Check for extremely long user agent
    if (userAgent.length() > 500) {
      analysis.addThreat("ABNORMAL_USER_AGENT_LENGTH", ThreatLevel.MEDIUM);
    }
  }

  /**
   * Increments a per-IP, per-minute request counter in Redis (INCR on a minute-bucketed key, with
   * the key's TTL set on first creation) and flags the analysis if the client is over the
   * threshold. This is what makes rate detection converge across gateway replicas — every instance
   * increments the same Redis key for a given IP+minute.
   */
  private Mono<Void> analyzeRequestFrequency(String clientIp, ThreatAnalysis analysis) {
    long minuteBucket = System.currentTimeMillis() / 60000;
    String key = RATE_COUNT_KEY_PREFIX + clientIp + ":" + minuteBucket;

    return redisTemplate
        .opsForValue()
        .increment(key)
        .flatMap(
            count -> {
              Mono<Boolean> expireStep =
                  count == 1L ? redisTemplate.expire(key, RATE_WINDOW_TTL) : Mono.just(true);

              return expireStep.doOnNext(
                  ignored -> {
                    if (count > MAX_REQUESTS_PER_MINUTE) {
                      analysis.addThreat("RATE_LIMIT_EXCEEDED", ThreatLevel.HIGH);
                    } else if (count > MAX_REQUESTS_PER_MINUTE * 0.8) {
                      analysis.addThreat("HIGH_REQUEST_FREQUENCY", ThreatLevel.MEDIUM);
                    }
                  });
            })
        .then();
  }

  /**
   * Reads the client's security profile from Redis (or starts a fresh one if absent/expired),
   * applies this request's analysis to it, writes it back with a refreshed sliding TTL, and
   * blacklists the IP if its threat score has crossed the threshold. Returns the updated profile so
   * the caller can make the anomaly-detection decision without a second Redis round trip.
   *
   * <p>This is a read-modify-write over a plain string key (JSON-serialized profile), same as the
   * original in-memory version's non-atomic mutation of a shared object — concurrent requests from
   * the same IP can still race here exactly as they could before; this migration changes WHERE the
   * state lives, not its concurrency guarantees.
   */
  private Mono<ClientSecurityProfile> updateClientProfile(
      String clientIp, ThreatAnalysis analysis) {
    String key = PROFILE_KEY_PREFIX + clientIp;

    return redisTemplate
        .opsForValue()
        .get(key)
        .defaultIfEmpty("")
        .map(this::deserializeProfile)
        .flatMap(
            profile -> {
              profile.updateProfile(analysis);
              String json = serializeProfile(profile);
              Mono<Boolean> save = redisTemplate.opsForValue().set(key, json, PROFILE_TTL);

              Mono<Void> blacklistStep =
                  profile.threatScore > 100
                      ? blacklistIp(clientIp, "HIGH_THREAT_SCORE")
                      : Mono.empty();

              return save.then(blacklistStep).thenReturn(profile);
            });
  }

  private ClientSecurityProfile deserializeProfile(String json) {
    if (json == null || json.isEmpty()) {
      return new ClientSecurityProfile();
    }
    try {
      return objectMapper.readValue(json, ClientSecurityProfile.class);
    } catch (Exception e) {
      log.warn(
          "Failed to deserialize client security profile from Redis, resetting: {}",
          e.getMessage());
      return new ClientSecurityProfile();
    }
  }

  private String serializeProfile(ClientSecurityProfile profile) {
    try {
      return objectMapper.writeValueAsString(profile);
    } catch (Exception e) {
      log.warn("Failed to serialize client security profile for Redis: {}", e.getMessage());
      return "";
    }
  }

  private Mono<Void> blacklistIp(String ip, String reason) {
    return redisTemplate
        .opsForValue()
        .set(BLACKLIST_KEY_PREFIX + ip, reason, BLACKLIST_TTL)
        .doOnNext(ok -> log.error("IP {} blacklisted due to: {}", ip, reason))
        .then();
  }

  private Mono<Boolean> isBlacklisted(String ip) {
    return redisTemplate.hasKey(BLACKLIST_KEY_PREFIX + ip).defaultIfEmpty(false);
  }

  private String getClientIp(ServerHttpRequest request) {
    String xForwardedFor = request.getHeaders().getFirst("X-Forwarded-For");
    if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
      return xForwardedFor.split(",")[0].trim();
    }

    String xRealIp = request.getHeaders().getFirst("X-Real-IP");
    if (xRealIp != null && !xRealIp.isEmpty()) {
      return xRealIp;
    }

    return request.getRemoteAddress() != null
        ? request.getRemoteAddress().getAddress().getHostAddress()
        : "unknown";
  }

  private boolean shouldBypassSecurityFilters(String path) {
    return path.startsWith("/actuator")
        || path.startsWith("/swagger-ui")
        || path.startsWith("/v3/api-docs")
        || path.startsWith("/api/docs")
        || path.startsWith("/api/health")
        || path.startsWith("/api/auth")
        || path.startsWith("/api/gateway")
        || path.startsWith("/api/admin")
        || path.startsWith("/ws/");
  }

  private Mono<Void> blockRequest(ServerWebExchange exchange, String reason, String requestId) {
    ServerHttpResponse response = exchange.getResponse();
    response.setStatusCode(HttpStatus.FORBIDDEN);
    response.getHeaders().add("Content-Type", "application/json");
    response.getHeaders().add("X-Block-Reason", reason);
    response.getHeaders().add("X-Request-ID", requestId);

    Map<String, Object> errorResponse =
        Map.of(
            "error",
            "Request blocked by security policy",
            "reason",
            reason,
            "requestId",
            requestId,
            "timestamp",
            LocalDateTime.now().toString());

    try {
      String responseBody = objectMapper.writeValueAsString(errorResponse);
      DataBuffer buffer =
          response.bufferFactory().wrap(responseBody.getBytes(StandardCharsets.UTF_8));
      return response.writeWith(Mono.just(buffer));
    } catch (Exception e) {
      log.error("Error writing blocked request response", e);
      return response.setComplete();
    }
  }

  // Inner classes for threat analysis
  private static class ThreatAnalysis {
    private ThreatLevel threatLevel = ThreatLevel.LOW;
    private List<String> threats = new ArrayList<>();

    public void addThreat(String threat, ThreatLevel level) {
      threats.add(threat);
      if (level.ordinal() > threatLevel.ordinal()) {
        threatLevel = level;
      }
    }
  }

  /**
   * Per-client rolling security profile, JSON-serialized into a single Redis string value (key
   * {@code gateway:threat:profile:<ip>}, sliding {@link #PROFILE_TTL}). Timestamps are stored as
   * epoch millis rather than LocalDateTime to avoid requiring the jackson-datatype-jsr310 module on
   * this filter's private ObjectMapper instance.
   */
  private static class ClientSecurityProfile {
    private int requestCount = 0;
    private int threatCount = 0;
    private double threatScore = 0.0;
    private double anomalyScore = 0.0;
    private long firstSeenEpochMillis = System.currentTimeMillis();
    private long lastSeenEpochMillis = System.currentTimeMillis();
    private Set<String> observedThreats = new HashSet<>();

    public void updateProfile(ThreatAnalysis analysis) {
      requestCount++;
      lastSeenEpochMillis = System.currentTimeMillis();

      if (!analysis.threats.isEmpty()) {
        threatCount++;
        observedThreats.addAll(analysis.threats);

        // Calculate threat score
        double newThreatScore = analysis.threatLevel.ordinal() * 10.0;
        threatScore = (threatScore * 0.9) + (newThreatScore * 0.1);

        // Calculate anomaly score
        if (threatCount > 0) {
          double threatRatio = (double) threatCount / requestCount;
          anomalyScore = threatRatio * observedThreats.size();
        }
      }
    }
  }

  private enum ThreatLevel {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
  }
}
