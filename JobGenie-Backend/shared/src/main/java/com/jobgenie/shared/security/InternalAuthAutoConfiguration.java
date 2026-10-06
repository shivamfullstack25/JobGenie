package com.jobgenie.shared.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.client.RestTemplateCustomizer;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * Wires identity enforcement into every JobGenie service that has the shared module on its
 * classpath, so no service can forget to turn it on.
 *
 * <p>{@code AUTH_ENFORCEMENT} = {@code enforce} (default) | {@code report-only} | {@code off}.
 * {@code INTERNAL_AUTH_SECRET} must be the same value in the gateway, every service, and the AI
 * service.
 */
@Configuration
public class InternalAuthAutoConfiguration {

  @Value("${AUTH_ENFORCEMENT:enforce}")
  private String enforcement;

  @Value("${INTERNAL_AUTH_SECRET:}")
  private String secret;

  private AuthMode mode() {
    AuthMode mode = AuthMode.parse(enforcement);
    if (mode != AuthMode.OFF && (secret == null || secret.trim().length() < 32)) {
      // Fail closed: a service that cannot verify callers must not start as if it could.
      throw new IllegalStateException(
          "INTERNAL_AUTH_SECRET must be set to a random value of at least 32 characters (the"
              + " same in every JobGenie service) when AUTH_ENFORCEMENT is '"
              + enforcement
              + "'. For isolated local development of a single service, set"
              + " AUTH_ENFORCEMENT=off.");
    }
    return mode;
  }

  /** Applied to every RestTemplate built from the injected RestTemplateBuilder. */
  @Bean
  public RestTemplateCustomizer serviceAuthRestTemplateCustomizer() {
    mode();
    ServiceAuthInterceptor interceptor = new ServiceAuthInterceptor(secret);
    return restTemplate -> restTemplate.getInterceptors().add(interceptor);
  }

  @Configuration
  @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
  static class ServletAuthConfiguration {

    @Bean
    public FilterRegistrationBean<InternalAuthFilter> internalAuthFilter(
        @Value("${AUTH_ENFORCEMENT:enforce}") String enforcement,
        @Value("${INTERNAL_AUTH_SECRET:}") String secret) {
      FilterRegistrationBean<InternalAuthFilter> registration =
          new FilterRegistrationBean<>(new InternalAuthFilter(AuthMode.parse(enforcement), secret));
      registration.addUrlPatterns("/*");
      registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
      return registration;
    }
  }
}
