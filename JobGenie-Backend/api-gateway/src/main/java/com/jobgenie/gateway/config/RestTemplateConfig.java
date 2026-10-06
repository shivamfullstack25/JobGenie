package com.jobgenie.gateway.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import com.jobgenie.shared.security.ServiceAuthInterceptor;

@Configuration
public class RestTemplateConfig {

  // NOT injected: Spring Boot's RestTemplateBuilder auto-configuration only applies to
  // servlet web apps. This gateway is reactive (spring.main.web-application-type=reactive
  // for Spring Cloud Gateway), so no RestTemplateBuilder bean exists to inject — building
  // one directly here works in both web application types.
  //
  // Deliberately NOT @LoadBalanced: every controller in this codebase that uses this bean
  // (AdminController, AnalyticsController, GatewayController, AuthController) calls other
  // services with literal Docker Compose host:port URLs (e.g. "http://user-service:8081/..."),
  // never Eureka service-ID URLs — so load-balanced resolution is never actually needed. Worse,
  // leaving @LoadBalanced on caused Spring Cloud LoadBalancer to still intercept these literal
  // URLs and attempt reactive service-instance resolution, which bridges to blocking via
  // internal .block() calls — and that throws when the request happens to be handled on a
  // Reactor Schedulers.parallel() thread ("block()/blockFirst()/blockLast() are blocking, which
  // is not supported in thread parallel-1"), silently caught by each caller and returning 0/DOWN
  // for every count. Removing @LoadBalanced makes this a plain blocking RestTemplate again.
  //
  // Because the builder is constructed here rather than injected, the shared module's
  // RestTemplateCustomizer does not reach it — so the service-signature interceptor (which lets
  // the gateway's own calls to user/job/resume-service pass their InternalAuthFilter) is added
  // explicitly.
  @Bean
  public RestTemplate restTemplate(@Value("${INTERNAL_AUTH_SECRET:}") String internalAuthSecret) {
    return new RestTemplateBuilder()
        .setConnectTimeout(Duration.ofSeconds(5))
        .setReadTimeout(Duration.ofSeconds(10))
        .additionalInterceptors(new ServiceAuthInterceptor(internalAuthSecret))
        .build();
  }
}
