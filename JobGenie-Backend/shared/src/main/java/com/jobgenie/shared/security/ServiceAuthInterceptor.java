package com.jobgenie.shared.security;

import java.io.IOException;

import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

/**
 * Signs outgoing service-to-service calls so the receiving service's {@link InternalAuthFilter}
 * accepts them. The signature is a short-lived credential, so it is attached only to calls bound
 * for JobGenie's own services (single-label Docker hostnames such as {@code user-service}, or
 * localhost) and never to an external host such as an OAuth provider or a job board.
 */
public class ServiceAuthInterceptor implements ClientHttpRequestInterceptor {

  private final String secret;

  public ServiceAuthInterceptor(String secret) {
    this.secret = secret;
  }

  @Override
  public ClientHttpResponse intercept(
      HttpRequest request, byte[] body, ClientHttpRequestExecution execution) throws IOException {
    if (secret != null && !secret.isEmpty() && isInternalHost(request.getURI().getHost())) {
      InternalAuth.serviceHeaders(secret).forEach(request.getHeaders()::set);
    }
    return execution.execute(request, body);
  }

  static boolean isInternalHost(String host) {
    if (host == null || host.isEmpty()) {
      return false;
    }
    return !host.contains(".") || "127.0.0.1".equals(host);
  }
}
