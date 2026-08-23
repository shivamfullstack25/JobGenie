package com.jobgenie.gateway.security;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;

@Component
@Slf4j
public class InputValidationFilter implements WebFilter {

  // Maximum request size (10MB)
  private static final long MAX_REQUEST_SIZE = 10 * 1024 * 1024;

  // Maximum URL length
  private static final int MAX_URL_LENGTH = 2048;

  // Maximum header value length
  private static final int MAX_HEADER_LENGTH = 8192;

  // Dangerous patterns to block
  private static final List<Pattern> BLOCKED_PATTERNS =
      List.of(
          Pattern.compile("(?i).*<script[^>]*>.*", Pattern.DOTALL),
          Pattern.compile("(?i).*javascript:.*", Pattern.DOTALL),
          Pattern.compile("(?i).*vbscript:.*", Pattern.DOTALL),
          Pattern.compile("(?i).*data:text/html.*", Pattern.DOTALL),
          Pattern.compile(".*[\u0000-\u001F\u007F-\u009F].*"), // Control characters
          Pattern.compile(".*\\.\\.[\\\\/].*"), // Path traversal
          Pattern.compile(
              "(?i).*(union|select|insert|update|delete|drop|exec|execute)\\s+.*", Pattern.DOTALL));

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
    ServerHttpRequest request = exchange.getRequest();
    String path = request.getPath().value();

    // Bypass input validation for infrastructure and documentation endpoints
    if (path.startsWith("/actuator")
        || path.startsWith("/swagger-ui")
        || path.startsWith("/v3/api-docs")
        || path.startsWith("/api/docs")
        || path.startsWith("/api/health")
        || path.startsWith("/api/auth")
        || path.startsWith("/api/gateway")
        || path.startsWith("/api/admin")
        || path.startsWith("/ws/")) {
      return chain.filter(exchange);
    }

    // Validate request size
    if (request.getHeaders().getContentLength() > MAX_REQUEST_SIZE) {
      log.warn("Request size too large: {} bytes", request.getHeaders().getContentLength());
      return blockRequest(exchange, "Request size too large");
    }

    // Validate URL length
    String uri = request.getURI().toString();
    if (uri.length() > MAX_URL_LENGTH) {
      log.warn("URL too long: {} characters", uri.length());
      return blockRequest(exchange, "URL too long");
    }

    // Validate URL content
    if (containsDangerousContent(uri)) {
      log.warn("Dangerous content in URL: {}", uri);
      return blockRequest(exchange, "Invalid URL content");
    }

    // Validate headers
    for (String headerName : request.getHeaders().keySet()) {
      List<String> headerValues = request.getHeaders().get(headerName);
      if (headerValues != null) {
        for (String headerValue : headerValues) {
          if (headerValue.length() > MAX_HEADER_LENGTH) {
            log.warn(
                "Header value too long: {} = {}",
                headerName,
                headerValue.substring(0, 100) + "...");
            return blockRequest(exchange, "Header value too long");
          }

          if (containsDangerousContent(headerValue)) {
            log.warn("Dangerous content in header: {} = {}", headerName, headerValue);
            return blockRequest(exchange, "Invalid header content");
          }
        }
      }
    }

    // Validate query parameters
    String query = request.getURI().getQuery();
    if (query != null && containsDangerousContent(query)) {
      log.warn("Dangerous content in query parameters: {}", query);
      return blockRequest(exchange, "Invalid query parameters");
    }

    return chain.filter(exchange);
  }

  private boolean containsDangerousContent(String content) {
    if (content == null || content.isEmpty()) {
      return false;
    }

    String decodedContent = java.net.URLDecoder.decode(content, StandardCharsets.UTF_8);

    for (Pattern pattern : BLOCKED_PATTERNS) {
      if (pattern.matcher(content).matches() || pattern.matcher(decodedContent).matches()) {
        return true;
      }
    }

    return false;
  }

  private Mono<Void> blockRequest(ServerWebExchange exchange, String reason) {
    exchange.getResponse().setStatusCode(HttpStatus.BAD_REQUEST);
    exchange.getResponse().getHeaders().add("X-Block-Reason", reason);

    String errorBody = "{\"error\":\"Invalid request\",\"reason\":\"" + reason + "\"}";
    DataBuffer buffer =
        exchange.getResponse().bufferFactory().wrap(errorBody.getBytes(StandardCharsets.UTF_8));

    return exchange.getResponse().writeWith(Mono.just(buffer));
  }
}
