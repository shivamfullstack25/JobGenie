package com.jobgenie.gateway.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.WebFilterChain;

import com.jobgenie.shared.security.AuthMode;
import com.jobgenie.shared.security.AuthPrincipal;
import com.jobgenie.shared.security.FirebaseTokenVerifier.InvalidTokenException;
import com.jobgenie.shared.security.FirebaseTokenVerifier.VerifiedToken;
import com.jobgenie.shared.security.InternalAuth;

import reactor.core.publisher.Mono;

class GatewayAuthFilterTest {

  private static final String SECRET = "test-secret-test-secret-test-secret-0123";

  /** "good-<n>" verifies as Firebase UID "uid-<n>"; anything else is an invalid token. */
  private static VerifiedToken verify(String token) {
    if (token.startsWith("good-")) {
      return new VerifiedToken("uid-" + token.substring(5), "u@example.com", "U", true, null);
    }
    throw new InvalidTokenException("bad token");
  }

  /** uid-1 is an admin, uid-7 a normal user, uid-99 has signed in but has no account row yet. */
  private static Optional<AuthPrincipal> resolve(String uid) {
    switch (uid) {
      case "uid-1":
        return Optional.of(new AuthPrincipal("1", "admin", uid));
      case "uid-7":
        return Optional.of(new AuthPrincipal("7", "user", uid));
      default:
        return Optional.empty();
    }
  }

  private static GatewayAuthFilter filter(AuthMode mode) {
    return new GatewayAuthFilter(mode, SECRET, GatewayAuthFilterTest::verify, GatewayAuthFilterTest::resolve);
  }

  /** Runs the filter and returns the request the downstream chain saw, or null if it was blocked. */
  private static ServerHttpRequest forwarded(
      GatewayAuthFilter filter, MockServerWebExchange exchange) {
    AtomicReference<ServerHttpRequest> seen = new AtomicReference<>();
    WebFilterChain chain =
        downstream -> {
          seen.set(downstream.getRequest());
          return Mono.empty();
        };
    filter.filter(exchange, chain).block(Duration.ofSeconds(5));
    return seen.get();
  }

  private static MockServerWebExchange exchange(MockServerHttpRequest.BaseBuilder<?> request) {
    return MockServerWebExchange.from(request.build());
  }

  private static AuthPrincipal principalOf(ServerHttpRequest request) {
    HttpHeaders h = request.getHeaders();
    return InternalAuth.verify(
        SECRET,
        h.getFirst(InternalAuth.HEADER_USER_ID),
        h.getFirst(InternalAuth.HEADER_ROLE),
        h.getFirst(InternalAuth.HEADER_UID),
        h.getFirst(InternalAuth.HEADER_TIMESTAMP),
        h.getFirst(InternalAuth.HEADER_SIGNATURE));
  }

  @Test
  void requestWithoutATokenIsRejected() {
    MockServerWebExchange exchange = exchange(MockServerHttpRequest.get("/api/jobs/saved?userId=7"));

    assertNull(forwarded(filter(AuthMode.ENFORCE), exchange));
    assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
  }

  @Test
  void invalidTokenIsRejected() {
    MockServerWebExchange exchange =
        exchange(
            MockServerHttpRequest.get("/api/jobs/saved").header("Authorization", "Bearer forged"));

    assertNull(forwarded(filter(AuthMode.ENFORCE), exchange));
    assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
  }

  @Test
  void validTokenIsForwardedWithASignedIdentity() {
    MockServerWebExchange exchange =
        exchange(
            MockServerHttpRequest.get("/api/jobs/saved?userId=7")
                .header("Authorization", "Bearer good-7"));

    ServerHttpRequest downstream = forwarded(filter(AuthMode.ENFORCE), exchange);

    assertNotNull(downstream);
    AuthPrincipal principal = principalOf(downstream);
    assertNotNull(principal, "downstream signature must verify");
    assertEquals("7", principal.getUserId());
    assertEquals("user", principal.getRole());
    assertEquals("uid-7", downstream.getHeaders().getFirst("X-User-Id"));
  }

  /** The old admin check trusted a client-sent X-User-Id; it must now be impossible to supply. */
  @Test
  void clientSuppliedIdentityHeadersAreReplacedNotTrusted() {
    MockServerWebExchange exchange =
        exchange(
            MockServerHttpRequest.get("/api/users")
                .header("Authorization", "Bearer good-7")
                .header("X-User-Id", "uid-1")
                .header(InternalAuth.HEADER_USER_ID, "1")
                .header(InternalAuth.HEADER_ROLE, "admin")
                .header(InternalAuth.HEADER_SIGNATURE, "anything"));

    ServerHttpRequest downstream = forwarded(filter(AuthMode.ENFORCE), exchange);

    assertNotNull(downstream);
    assertEquals("uid-7", downstream.getHeaders().getFirst("X-User-Id"));
    assertEquals(1, downstream.getHeaders().get("X-User-Id").size());
    assertEquals("user", principalOf(downstream).getRole());
  }

  @Test
  void identityHeadersAreStrippedEvenOnPublicPaths() {
    MockServerWebExchange exchange =
        exchange(
            MockServerHttpRequest.post("/api/auth/verify")
                .header("X-User-Id", "uid-1")
                .header(InternalAuth.HEADER_ROLE, "service"));

    ServerHttpRequest downstream = forwarded(filter(AuthMode.ENFORCE), exchange);

    assertNotNull(downstream, "login exchange must stay reachable without a token");
    assertFalse(downstream.getHeaders().containsKey("X-User-Id"));
    assertFalse(downstream.getHeaders().containsKey(InternalAuth.HEADER_ROLE));
  }

  @Test
  void adminAreaRequiresAnAdmin() {
    MockServerWebExchange asUser =
        exchange(
            MockServerHttpRequest.get("/api/admin/dashboard")
                .header("Authorization", "Bearer good-7"));
    assertNull(forwarded(filter(AuthMode.ENFORCE), asUser));
    assertEquals(HttpStatus.FORBIDDEN, asUser.getResponse().getStatusCode());

    MockServerWebExchange asAdmin =
        exchange(
            MockServerHttpRequest.get("/api/admin/dashboard")
                .header("Authorization", "Bearer good-1"));
    assertNotNull(forwarded(filter(AuthMode.ENFORCE), asAdmin));
  }

  @Test
  void anyUserCanReportAClientErrorButNotReadAnalytics() {
    MockServerWebExchange report =
        exchange(
            MockServerHttpRequest.post("/api/analytics/errors/report")
                .header("Authorization", "Bearer good-7"));
    assertNotNull(forwarded(filter(AuthMode.ENFORCE), report));

    MockServerWebExchange read =
        exchange(
            MockServerHttpRequest.get("/api/analytics/dashboard")
                .header("Authorization", "Bearer good-7"));
    assertNull(forwarded(filter(AuthMode.ENFORCE), read));
    assertEquals(HttpStatus.FORBIDDEN, read.getResponse().getStatusCode());
  }

  @Test
  void signedInButUnregisteredUserIsToldToFinishSetup() {
    MockServerWebExchange exchange =
        exchange(
            MockServerHttpRequest.get("/api/jobs/saved").header("Authorization", "Bearer good-99"));

    assertNull(forwarded(filter(AuthMode.ENFORCE), exchange));
    assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
  }

  @Test
  void webSocketHandshakeMayCarryTheTokenAsAQueryParameterButRestCallsMayNot() {
    MockServerWebExchange socket =
        exchange(MockServerHttpRequest.get("/ws/notifications/7?access_token=good-7"));
    assertNotNull(forwarded(filter(AuthMode.ENFORCE), socket));

    MockServerWebExchange rest =
        exchange(MockServerHttpRequest.get("/api/jobs/saved?access_token=good-7"));
    assertNull(forwarded(filter(AuthMode.ENFORCE), rest));
  }

  @Test
  void healthStaysPublicAndOtherActuatorEndpointsDoNot() {
    assertNotNull(
        forwarded(filter(AuthMode.ENFORCE), exchange(MockServerHttpRequest.get("/actuator/health"))));

    MockServerWebExchange metrics =
        exchange(
            MockServerHttpRequest.get("/actuator/prometheus")
                .header("Authorization", "Bearer good-7"));
    assertNull(forwarded(filter(AuthMode.ENFORCE), metrics));
    assertEquals(HttpStatus.FORBIDDEN, metrics.getResponse().getStatusCode());
  }

  @Test
  void reportOnlyForwardsEverythingButStillStripsSpoofedHeaders() {
    MockServerWebExchange exchange =
        exchange(MockServerHttpRequest.get("/api/jobs/saved").header("X-User-Id", "uid-1"));

    ServerHttpRequest downstream = forwarded(filter(AuthMode.REPORT_ONLY), exchange);

    assertNotNull(downstream);
    assertFalse(downstream.getHeaders().containsKey("X-User-Id"));
  }

  @Test
  void offModeIsExactlyTheLegacyBehaviour() {
    MockServerWebExchange exchange =
        exchange(MockServerHttpRequest.get("/api/users").header("X-User-Id", "uid-1"));

    ServerHttpRequest downstream = forwarded(filter(AuthMode.OFF), exchange);

    assertNotNull(downstream);
    assertTrue(downstream.getHeaders().containsKey("X-User-Id"));
  }
}
