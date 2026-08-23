package com.jobgenie.gateway.config;

import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.ReactiveRedisConnectionFactory;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;

import reactor.core.publisher.Mono;

/**
 * spring.cloud.gateway.filter.request-rate-limiter.redis-rate-limiter.* was already declared in
 * application.properties, and the Redis dependency was already on the classpath, but no KeyResolver
 * bean existed and the filter was never applied to any route — so despite being "configured," no
 * distributed rate limiting was actually happening anywhere. The only throttling in effect was
 * ThreatDetectionFilter's in-memory per-instance counter, which doesn't converge across replicas.
 *
 * <p>A prior attempt this session to wire up Spring Cloud Gateway's built-in RequestRateLimiter
 * (default-filters[0].name=RequestRateLimiter + this KeyResolver bean) crash-looped the gateway
 * with "IllegalArgumentException: Unable to find GatewayFilterFactory with name RequestRateLimiter"
 * on every Eureka route refresh. On Spring Cloud Gateway 2021.0.8 (this project's pinned version,
 * from spring-cloud-dependencies in the parent pom) that filter factory ships in
 * org.springframework.cloud:spring-cloud-gateway-server, which IS pulled in transitively by
 * spring-cloud-starter-gateway here — but RequestRateLimiterGatewayFilterFactory is only registered
 * by GatewayAutoConfiguration when a RedisRateLimiter bean (or another RateLimiter bean) is already
 * on the context; nothing in this app ever defined one, only the KeyResolver. Declaring a
 * RedisRateLimiter bean here now (backed by the reactive connection factory added below) would very
 * plausibly fix it, but that requires rebuilding, redeploying, and soak-testing the gateway to
 * confirm no crash-loop, which is out of scope for this pass (this session is only migrating
 * ThreatDetectionFilter's in-memory maps to Redis). Left reverted/unused, as decided earlier this
 * session — a working gateway without the built-in rate limiter beats a broken one. The KeyResolver
 * bean below is kept as-is (harmless, still unused) for whoever picks this up.
 */
@Configuration
public class RateLimitConfig {

  @Bean
  public KeyResolver ipKeyResolver() {
    return exchange -> {
      String xForwardedFor = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
      if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
        return Mono.just(xForwardedFor.split(",")[0].trim());
      }
      String xRealIp = exchange.getRequest().getHeaders().getFirst("X-Real-IP");
      if (xRealIp != null && !xRealIp.isEmpty()) {
        return Mono.just(xRealIp);
      }
      return Mono.just(
          exchange.getRequest().getRemoteAddress() != null
              ? exchange.getRequest().getRemoteAddress().getAddress().getHostAddress()
              : "unknown");
    };
  }

  /**
   * Reactive Redis wiring for ThreatDetectionFilter's distributed state (IP blacklist, per-minute
   * rate counters, client behavior profiles). Spring Boot's own Redis autoconfiguration backs off
   * from creating a ReactiveRedisConnectionFactory bean because RedisConfig already declares a
   * RedisConnectionFactory bean (its @Bean method's declared return type doesn't
   * satisfy @ConditionalOnBean(ReactiveRedisConnectionFactory.class) at the condition-evaluation
   * stage), so without this, no reactive Redis client exists in the app at all. This filter must
   * never use the blocking RedisTemplate/Jedis in the request path — that would block the reactive
   * event loop under load.
   *
   * <p>Rather than standing up a second LettuceConnectionFactory (tried first — it also satisfies
   * RedisConnectionFactory, since Lettuce implements both interfaces, which made it a second
   * candidate for RedisConfig's unqualified RedisConnectionFactory-typed autowiring and crash-
   * looped the app with NoUniqueBeanDefinitionException), this reuses RedisConfig's existing
   * RedisConnectionFactory bean and casts it: LettuceConnectionFactory already implements
   * ReactiveRedisConnectionFactory too, so the same connection factory (and its connection pool)
   * backs both the blocking RedisTemplate elsewhere and this reactive template, with only one
   * RedisConnectionFactory-typed bean in the context.
   */
  @Bean
  public ReactiveStringRedisTemplate reactiveStringRedisTemplate(
      RedisConnectionFactory redisConnectionFactory) {
    if (!(redisConnectionFactory instanceof ReactiveRedisConnectionFactory)) {
      throw new IllegalStateException(
          "Configured RedisConnectionFactory ("
              + redisConnectionFactory.getClass().getName()
              + ") does not support the reactive Redis driver; ThreatDetectionFilter requires a"
              + " Lettuce-based factory.");
    }
    return new ReactiveStringRedisTemplate((ReactiveRedisConnectionFactory) redisConnectionFactory);
  }
}
