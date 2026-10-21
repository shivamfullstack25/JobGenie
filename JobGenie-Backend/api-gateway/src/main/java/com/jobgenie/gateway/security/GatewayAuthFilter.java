package com.jobgenie.gateway.security;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;

import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import com.jobgenie.shared.security.AuthMode;
import com.jobgenie.shared.security.AuthPrincipal;
import com.jobgenie.shared.security.FirebaseTokenVerifier.VerifiedToken;
import com.jobgenie.shared.security.InternalAuth;

import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * The single place end-user identity is established. Verifies the Firebase ID token on every
 * request, resolves it to a JobGenie user, and forwards that identity downstream as HMAC-signed
 * {@code X-Auth-*} headers (see {@link InternalAuth}). Any identity header the client sent is
 * removed first, so nothing the browser claims about who it is ever reaches a service.
 */
@Slf4j
public class GatewayAuthFilter implements WebFilter, Ordered {

  /** Legacy admin header: now always overwritten with the verified Firebase UID. */
  static final String LEGACY_USER_HEADER = "X-User-Id";

  private static final List<String> IDENTITY_HEADERS =
      List.of(
          InternalAuth.HEADER_USER_ID,
          InternalAuth.HEADER_ROLE,
          InternalAuth.HEADER_UID,
          InternalAuth.HEADER_TIMESTAMP,
          InternalAuth.HEADER_SIGNATURE,
          LEGACY_USER_HEADER);

  private static final List<Pattern> PUBLIC_PATHS =
      List.of(
          Pattern.compile("^/actuator/(health|info)(/.*)?$"),
          Pattern.compile("^/api/health(/.*)?$"),
          Pattern.compile("^/api/gateway/health$"),
          Pattern.compile("^/api/[a-z-]+/health$"),
          Pattern.compile("^/api/auth/(verify|refresh)$"),
          Pattern.compile("^/swagger-ui(/.*|\\.html)?$"),
          Pattern.compile("^/v3/api-docs(/.*)?$"),
          Pattern.compile("^/webjars/.*$"));

  private static final List<Pattern> ADMIN_ONLY_PATHS =
      List.of(
          Pattern.compile("^/api/admin(/.*)?$"),
          Pattern.compile("^/api/analytics(/.*)?$"),
          Pattern.compile("^/api/gateway/(routes|services)$"),
          Pattern.compile("^/actuator(/.*)?$"));

  private final AuthMode mode;
  private final String secret;
  private final Function<String, VerifiedToken> tokenVerifier;
  private final Function<String, Optional<AuthPrincipal>> principalResolver;

  /**
   * @param tokenVerifier verifies a Firebase ID token or throws
   * @param principalResolver maps a verified Firebase UID to the JobGenie user, empty if that
   *     account has not been created yet (the client must call /api/auth/verify first)
   */
  public GatewayAuthFilter(
      AuthMode mode,
      String secret,
      Function<String, VerifiedToken> tokenVerifier,
      Function<String, Optional<AuthPrincipal>> principalResolver) {
    this.mode = mode;
    this.secret = secret;
    this.tokenVerifier = tokenVerifier;
    this.principalResolver = principalResolver;
  }

  /** After Spring Security's chain (-100, which answers CORS preflights), before everything else. */
  @Override
  public int getOrder() {
    return -50;
  }

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
    if (mode == AuthMode.OFF) {
      return chain.filter(exchange);
    }

    ServerHttpRequest stripped =
        exchange
            .getRequest()
            .mutate()
            .headers(headers -> IDENTITY_HEADERS.forEach(headers::remove))
            .build();
    ServerWebExchange clean = exchange.mutate().request(stripped).build();

    String path = stripped.getPath().value();
    if (stripped.getMethod() == HttpMethod.OPTIONS || matchesAny(PUBLIC_PATHS, path)) {
      return chain.filter(clean);
    }

    String token = extractToken(stripped, path);
    return Mono.fromCallable(() -> authenticate(token, path))
        .subscribeOn(Schedulers.boundedElastic())
        .flatMap(
            outcome -> {
              if (outcome.principal == null) {
                if (mode == AuthMode.REPORT_ONLY) {
                  log.warn(
                      "[auth report-only] would reject {} {}: {}",
                      stripped.getMethod(),
                      path,
                      outcome.message);
                  return chain.filter(clean);
                }
                return reject(clean, outcome.status, outcome.code, outcome.message);
              }
              ServerHttpRequest signed =
                  stripped
                      .mutate()
                      .headers(
                          headers -> {
                            InternalAuth.signedHeaders(secret, outcome.principal)
                                .forEach(headers::set);
                            headers.set(LEGACY_USER_HEADER, outcome.principal.getFirebaseUid());
                          })
                      .build();
              return chain.filter(clean.mutate().request(signed).build());
            });
  }

  private Outcome authenticate(String token, String path) {
    if (token == null || token.isEmpty()) {
      return Outcome.denied(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Sign in required");
    }
    VerifiedToken verified;
    try {
      verified = tokenVerifier.apply(token);
    } catch (Exception e) {
      return Outcome.denied(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Session is invalid or expired");
    }
    Optional<AuthPrincipal> principal;
    try {
      principal = principalResolver.apply(verified.getUid());
    } catch (Exception e) {
      log.error("Could not resolve user for a verified token: {}", e.getMessage());
      return Outcome.denied(
          HttpStatus.SERVICE_UNAVAILABLE, "AUTH_UNAVAILABLE", "Sign-in is temporarily unavailable");
    }
    if (principal.isEmpty()) {
      return Outcome.denied(
          HttpStatus.UNAUTHORIZED, "USER_NOT_REGISTERED", "Account setup has not completed");
    }
    if (matchesAny(ADMIN_ONLY_PATHS, path) && !principal.get().isAdmin()) {
      return Outcome.denied(HttpStatus.FORBIDDEN, "FORBIDDEN", "Admin access required");
    }
    return Outcome.allowed(principal.get());
  }

  private static String extractToken(ServerHttpRequest request, String path) {
    String authorization = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
    if (authorization != null && authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
      return authorization.substring(7).trim();
    }
    // Browsers cannot set headers on a WebSocket handshake, so sockets pass the token as a query
    // parameter. Accepted for /ws/ only, to keep tokens out of ordinary request URLs and logs.
    if (path.startsWith("/ws/")) {
      return request.getQueryParams().getFirst("access_token");
    }
    return null;
  }

  private static boolean matchesAny(List<Pattern> patterns, String path) {
    for (Pattern pattern : patterns) {
      if (pattern.matcher(path).matches()) {
        return true;
      }
    }
    return false;
  }

  private static Mono<Void> reject(
      ServerWebExchange exchange, HttpStatus status, String code, String message) {
    exchange.getResponse().setStatusCode(status);
    exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
    byte[] body =
        ("{\"error\":\"" + code + "\",\"message\":\"" + message + "\"}")
            .getBytes(StandardCharsets.UTF_8);
    DataBuffer buffer = exchange.getResponse().bufferFactory().wrap(body);
    return exchange.getResponse().writeWith(Mono.just(buffer));
  }

  private static final class Outcome {
    private final AuthPrincipal principal;
    private final HttpStatus status;
    private final String code;
    private final String message;

    private Outcome(AuthPrincipal principal, HttpStatus status, String code, String message) {
      this.principal = principal;
      this.status = status;
      this.code = code;
      this.message = message;
    }

    static Outcome allowed(AuthPrincipal principal) {
      return new Outcome(principal, null, null, null);
    }

    static Outcome denied(HttpStatus status, String code, String message) {
      return new Outcome(null, status, code, message);
    }
  }
}
