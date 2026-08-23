package com.jobgenie.gateway.security;

import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;

@Component
@Slf4j
public class SecurityHeadersFilter implements WebFilter {

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
    ServerHttpResponse response = exchange.getResponse();

    // Add security headers
    addSecurityHeaders(response);

    return chain.filter(exchange);
  }

  private void addSecurityHeaders(ServerHttpResponse response) {
    // Prevent clickjacking
    response.getHeaders().add("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    response.getHeaders().add("X-Content-Type-Options", "nosniff");

    // Enable XSS protection
    response.getHeaders().add("X-XSS-Protection", "1; mode=block");

    // Content Security Policy
    response
        .getHeaders()
        .add(
            "Content-Security-Policy",
            "default-src 'self'; "
                + "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com; "
                + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                + "font-src 'self' https://fonts.gstatic.com; "
                + "img-src 'self' data: https: http:; "
                + "connect-src 'self' https://api.openai.com ws: wss:; "
                + "frame-src 'self' https://accounts.google.com; "
                + "object-src 'none'; "
                + "base-uri 'self'");

    // Referrer Policy
    response.getHeaders().add("Referrer-Policy", "strict-origin-when-cross-origin");

    // HTTP Strict Transport Security (HSTS) - only for production HTTPS
    if (isProduction()) {
      response
          .getHeaders()
          .add("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    // Permissions Policy (formerly Feature Policy)
    response
        .getHeaders()
        .add("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");

    // Cross-Origin Embedder Policy
    response.getHeaders().add("Cross-Origin-Embedder-Policy", "require-corp");

    // Cross-Origin Opener Policy
    response.getHeaders().add("Cross-Origin-Opener-Policy", "same-origin");

    // Cross-Origin Resource Policy
    response.getHeaders().add("Cross-Origin-Resource-Policy", "cross-origin");

    // Cache Control for security-sensitive responses
    response.getHeaders().add("Cache-Control", "no-cache, no-store, must-revalidate");
    response.getHeaders().add("Pragma", "no-cache");
    response.getHeaders().add("Expires", "0");

    // Server information hiding
    response.getHeaders().add("Server", "JobGenie-Gateway");

    // Custom security headers
    response.getHeaders().add("X-Powered-By", "JobGenie");
    response.getHeaders().add("X-Security-Policy", "Enhanced");
  }

  private boolean isProduction() {
    return "production".equals(System.getProperty("spring.profiles.active", "development"));
  }
}
