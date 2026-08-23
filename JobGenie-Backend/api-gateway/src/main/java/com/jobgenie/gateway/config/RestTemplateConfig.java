package com.jobgenie.gateway.config;

import java.time.Duration;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class RestTemplateConfig {

  // NOT injected: Spring Boot's RestTemplateBuilder auto-configuration only applies to
  // servlet web apps. This gateway is reactive (spring.main.web-application-type=reactive
  // for Spring Cloud Gateway), so no RestTemplateBuilder bean exists to inject — building
  // one directly here works in both web application types.
  @Bean
  @LoadBalanced
  public RestTemplate restTemplate() {
    return new RestTemplateBuilder()
        .setConnectTimeout(Duration.ofSeconds(5))
        .setReadTimeout(Duration.ofSeconds(10))
        .build();
  }
}
