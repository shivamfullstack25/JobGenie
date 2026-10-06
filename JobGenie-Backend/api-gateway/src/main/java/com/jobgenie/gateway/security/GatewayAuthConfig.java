package com.jobgenie.gateway.security;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import com.jobgenie.shared.security.AuthMode;
import com.jobgenie.shared.security.AuthPrincipal;
import com.jobgenie.shared.security.FirebaseTokenVerifier;

import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class GatewayAuthConfig {

  /** How long a resolved user (id + role) is reused before user-service is asked again. */
  private static final long PRINCIPAL_CACHE_MILLIS = 60_000;

  @Bean
  public GatewayAuthFilter gatewayAuthFilter(
      @Value("${AUTH_ENFORCEMENT:enforce}") String enforcement,
      @Value("${INTERNAL_AUTH_SECRET:}") String secret,
      @Value("${FIREBASE_PROJECT_ID:jobgenie-d95c7}") String firebaseProjectId,
      @Value("${USER_SERVICE_URL:http://user-service:8081}") String userServiceUrl,
      RestTemplate restTemplate) {
    AuthMode mode = AuthMode.parse(enforcement);
    log.info("Gateway authentication mode: {}", mode);
    FirebaseTokenVerifier verifier = new FirebaseTokenVerifier(firebaseProjectId);
    UserPrincipalResolver resolver = new UserPrincipalResolver(restTemplate, userServiceUrl);
    return new GatewayAuthFilter(mode, secret, verifier::verify, resolver::resolve);
  }

  /**
   * Looks up the JobGenie user behind a verified Firebase UID. Blocking by design: the filter
   * calls it on the bounded-elastic scheduler, and the short cache keeps it off the hot path.
   */
  static class UserPrincipalResolver {

    private final RestTemplate restTemplate;
    private final String userServiceUrl;
    private final Map<String, CachedPrincipal> cache = new ConcurrentHashMap<>();

    UserPrincipalResolver(RestTemplate restTemplate, String userServiceUrl) {
      this.restTemplate = restTemplate;
      this.userServiceUrl = userServiceUrl;
    }

    @SuppressWarnings("unchecked")
    Optional<AuthPrincipal> resolve(String firebaseUid) {
      long now = System.currentTimeMillis();
      CachedPrincipal cached = cache.get(firebaseUid);
      if (cached != null && cached.expiresAt > now) {
        return Optional.of(cached.principal);
      }
      Map<String, Object> user;
      try {
        user =
            restTemplate.getForObject(
                UriComponentsBuilder.fromHttpUrl(userServiceUrl + "/api/auth/me")
                    .queryParam("firebaseUid", firebaseUid)
                    .build()
                    .toUri(),
                Map.class);
      } catch (HttpClientErrorException.NotFound notRegistered) {
        return Optional.empty();
      }
      if (user == null || user.get("id") == null) {
        return Optional.empty();
      }
      Object role = user.get("role");
      AuthPrincipal principal =
          new AuthPrincipal(
              String.valueOf(user.get("id")), role == null ? "user" : role.toString(), firebaseUid);
      if (cache.size() > 10_000) {
        cache.clear();
      }
      cache.put(firebaseUid, new CachedPrincipal(principal, now + PRINCIPAL_CACHE_MILLIS));
      return Optional.of(principal);
    }

    private static final class CachedPrincipal {
      private final AuthPrincipal principal;
      private final long expiresAt;

      private CachedPrincipal(AuthPrincipal principal, long expiresAt) {
        this.principal = principal;
        this.expiresAt = expiresAt;
      }
    }
  }
}
