package com.jobgenie.gateway.config;

import java.util.concurrent.TimeUnit;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.web.servlet.HandlerInterceptor;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class RateLimitInterceptor implements HandlerInterceptor {

  private final RedisTemplate<String, String> redisTemplate;
  private final int maxRequestsPerMinute = 100; // Configurable limit
  private final int windowSizeInSeconds = 60;

  public RateLimitInterceptor(RedisTemplate<String, String> redisTemplate) {
    this.redisTemplate = redisTemplate;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
      throws Exception {
    String clientId = getClientIdentifier(request);
    String key = "rate_limit:" + clientId;

    try {
      String currentRequests = redisTemplate.opsForValue().get(key);
      int requestCount = currentRequests != null ? Integer.parseInt(currentRequests) : 0;

      if (requestCount >= maxRequestsPerMinute) {
        log.warn("Rate limit exceeded for client: {}, requests: {}", clientId, requestCount);
        response.setStatus(429); // Too Many Requests
        response.setHeader("X-RateLimit-Limit", String.valueOf(maxRequestsPerMinute));
        response.setHeader("X-RateLimit-Remaining", "0");
        response
            .getWriter()
            .write("{\"error\":\"Rate limit exceeded\",\"limit\":" + maxRequestsPerMinute + "}");
        return false;
      }

      // Increment counter
      redisTemplate.opsForValue().increment(key);
      if (requestCount == 0) {
        // Set expiration only for new keys
        redisTemplate.expire(key, windowSizeInSeconds, TimeUnit.SECONDS);
      }

      // Add rate limit headers
      response.setHeader("X-RateLimit-Limit", String.valueOf(maxRequestsPerMinute));
      response.setHeader(
          "X-RateLimit-Remaining",
          String.valueOf(Math.max(0, maxRequestsPerMinute - requestCount - 1)));

    } catch (Exception e) {
      log.error("Error checking rate limit for client: {}", clientId, e);
      // Allow request if Redis is down
    }

    return true;
  }

  private String getClientIdentifier(HttpServletRequest request) {
    // Try to get user ID from header first
    String userId = request.getHeader("X-User-Id");
    if (userId != null && !userId.isEmpty()) {
      return "user:" + userId;
    }

    // Fall back to IP address
    String xForwardedFor = request.getHeader("X-Forwarded-For");
    if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
      return "ip:" + xForwardedFor.split(",")[0].trim();
    }

    return "ip:" + request.getRemoteAddr();
  }
}
