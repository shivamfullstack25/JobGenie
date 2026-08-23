package com.jobgenie.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class RateLimitingConfig implements WebMvcConfigurer {

  @Bean
  public RateLimitInterceptor rateLimitInterceptor(RedisTemplate<String, String> redisTemplate) {
    return new RateLimitInterceptor(redisTemplate);
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(rateLimitInterceptor(null))
        .addPathPatterns("/api/**")
        .excludePathPatterns("/api/health", "/api/admin/health");
  }
}
