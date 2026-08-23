package com.jobgenie.gateway.security;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Bucket4j;
import io.github.bucket4j.Refill;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;

@Component
@Slf4j
public class RateLimitingFilter implements WebFilter {

  private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

  // Rate limiting configuration
  private static final int REQUESTS_PER_MINUTE = 100;
  private static final int BURST_CAPACITY = 20;

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
    String clientIp = getClientIp(exchange);

    Bucket bucket = buckets.computeIfAbsent(clientIp, this::createBucket);

    if (bucket.tryConsume(1)) {
      // Request allowed
      exchange
          .getResponse()
          .getHeaders()
          .add("X-Rate-Limit-Remaining", String.valueOf(bucket.getAvailableTokens()));
      return chain.filter(exchange);
    } else {
      // Rate limit exceeded
      log.warn("Rate limit exceeded for IP: {}", clientIp);
      exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
      exchange.getResponse().getHeaders().add("X-Rate-Limit-Retry-After", "60");
      return exchange.getResponse().setComplete();
    }
  }

  private Bucket createBucket(String clientId) {
    Bandwidth limit =
        Bandwidth.classic(
            REQUESTS_PER_MINUTE, Refill.intervally(REQUESTS_PER_MINUTE, Duration.ofMinutes(1)));
    Bandwidth burst =
        Bandwidth.classic(BURST_CAPACITY, Refill.greedy(BURST_CAPACITY, Duration.ofMinutes(1)));

    return Bucket4j.builder().addLimit(limit).addLimit(burst).build();
  }

  private String getClientIp(ServerWebExchange exchange) {
    String xForwardedFor = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
    if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
      return xForwardedFor.split(",")[0].trim();
    }

    String xRealIp = exchange.getRequest().getHeaders().getFirst("X-Real-IP");
    if (xRealIp != null && !xRealIp.isEmpty()) {
      return xRealIp;
    }

    return exchange.getRequest().getRemoteAddress() != null
        ? exchange.getRequest().getRemoteAddress().getHostString()
        : "unknown";
  }
}
