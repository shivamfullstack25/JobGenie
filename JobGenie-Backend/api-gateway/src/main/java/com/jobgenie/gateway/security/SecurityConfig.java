package com.jobgenie.gateway.security;

import java.time.Duration;
import java.util.Arrays;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

  /**
   * Phase 2: Permit API traffic through the gateway while Firebase auth is handled by user-service
   * at /api/auth/verify. Gateway-level JWT enforcement will be added once the frontend propagates
   * Authorization headers on every request.
   */
  @Bean
  public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
    return http.cors(cors -> cors.configurationSource(corsConfigurationSource()))
        .csrf(ServerHttpSecurity.CsrfSpec::disable)
        .httpBasic(ServerHttpSecurity.HttpBasicSpec::disable)
        .formLogin(ServerHttpSecurity.FormLoginSpec::disable)
        .authorizeExchange(
            exchanges ->
                exchanges
                    // Infrastructure & documentation
                    .pathMatchers("/actuator/health", "/actuator/info")
                    .permitAll()
                    .pathMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**")
                    .permitAll()
                    .pathMatchers("/api/docs/**", "/api/health/**", "/api/health")
                    .permitAll()

                    // Firebase auth (proxied to user-service) + LinkedIn OAuth (local gateway)
                    .pathMatchers("/api/auth/**")
                    .permitAll()

                    // WebSocket
                    .pathMatchers("/ws/**")
                    .permitAll()

                    // Gateway-local controllers (admin, analytics, gateway stats)
                    .pathMatchers("/api/admin/**", "/api/analytics/**", "/api/gateway/**")
                    .permitAll()

                    // All proxied microservice and AI routes
                    .pathMatchers("/api/**", "/ai/**")
                    .permitAll()
                    .anyExchange()
                    .permitAll())
        .build();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();

    if (isProduction()) {
      configuration.setAllowedOrigins(
          Arrays.asList(
              "https://jobgenie.com", "https://www.jobgenie.com", "https://app.jobgenie.com"));
    } else {
      configuration.setAllowedOrigins(
          Arrays.asList(
              "http://localhost:3000",
              "http://localhost:5173",
              "http://127.0.0.1:3000",
              "http://localhost:8080"));
    }

    configuration.setAllowedMethods(
        Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
    configuration.setAllowedHeaders(
        Arrays.asList(
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "Accept",
            "Origin",
            "Access-Control-Request-Method",
            "Access-Control-Request-Headers",
            "X-API-Key",
            "X-Client-Version",
            "X-Request-ID",
            "X-User-Id"));
    configuration.setExposedHeaders(
        Arrays.asList(
            "Access-Control-Allow-Origin",
            "Access-Control-Allow-Credentials",
            "X-Rate-Limit-Remaining",
            "X-Rate-Limit-Retry-After",
            "X-Request-ID"));
    configuration.setAllowCredentials(true);
    configuration.setMaxAge(Duration.ofMinutes(30));

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }

  private boolean isProduction() {
    return "production".equals(System.getProperty("spring.profiles.active", "development"));
  }
}
