package com.jobgenie.shared.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class InternalAuthFilterTest {

  private static final String SECRET = "test-secret-test-secret-test-secret-0123";

  private final InternalAuthFilter enforcing = new InternalAuthFilter(AuthMode.ENFORCE, SECRET);

  private static MockHttpServletRequest request(String method, String path) {
    MockHttpServletRequest request = new MockHttpServletRequest(method, path);
    request.setRequestURI(path);
    return request;
  }

  private static void signAs(MockHttpServletRequest request, AuthPrincipal principal) {
    InternalAuth.signedHeaders(SECRET, principal).forEach(request::addHeader);
  }

  private static AuthPrincipal user(String id) {
    return new AuthPrincipal(id, "user", "uid-" + id);
  }

  /** Runs the filter; returns the response. {@code chain.getRequest()} is null if blocked. */
  private MockHttpServletResponse run(
      InternalAuthFilter filter, MockHttpServletRequest request, MockFilterChain chain)
      throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();
    filter.doFilter(request, response, chain);
    return response;
  }

  @Test
  void requestWithoutIdentityIsRejected() throws Exception {
    MockFilterChain chain = new MockFilterChain();
    MockHttpServletResponse response = run(enforcing, request("GET", "/api/jobs/saved"), chain);

    assertEquals(401, response.getStatus());
    assertNull(chain.getRequest());
  }

  @Test
  void clientSuppliedIdentityHeadersWithoutAValidSignatureAreRejected() throws Exception {
    MockHttpServletRequest request = request("GET", "/api/users/1");
    request.addHeader(InternalAuth.HEADER_USER_ID, "1");
    request.addHeader(InternalAuth.HEADER_ROLE, "admin");
    request.addHeader(InternalAuth.HEADER_TIMESTAMP, Long.toString(Instant.now().getEpochSecond()));
    request.addHeader(InternalAuth.HEADER_SIGNATURE, "deadbeef");
    MockFilterChain chain = new MockFilterChain();

    assertEquals(401, run(enforcing, request, chain).getStatus());
    assertNull(chain.getRequest());
  }

  @Test
  void escalatingRoleAfterSigningInvalidatesTheSignature() throws Exception {
    MockHttpServletRequest request = request("GET", "/api/users");
    Map<String, String> headers = InternalAuth.signedHeaders(SECRET, user("7"));
    headers.put(InternalAuth.HEADER_ROLE, "admin");
    headers.forEach(request::addHeader);

    assertEquals(401, run(enforcing, request, new MockFilterChain()).getStatus());
  }

  @Test
  void staleSignatureIsRejected() throws Exception {
    MockHttpServletRequest request = request("GET", "/api/jobs/saved");
    long tenMinutesAgo = Instant.now().getEpochSecond() - 600;
    InternalAuth.signedHeaders(SECRET, user("7"), tenMinutesAgo).forEach(request::addHeader);

    assertEquals(401, run(enforcing, request, new MockFilterChain()).getStatus());
  }

  @Test
  void userMayUseTheirOwnUserIdParameter() throws Exception {
    MockHttpServletRequest request = request("GET", "/api/jobs/saved");
    request.setParameter("userId", "7");
    signAs(request, user("7"));
    MockFilterChain chain = new MockFilterChain();

    assertEquals(200, run(enforcing, request, chain).getStatus());
    assertNotNull(chain.getRequest());
    assertEquals("7", CurrentUser.of(request).getUserId());
  }

  @Test
  void userMayNotPassSomeoneElsesUserId() throws Exception {
    for (String param : new String[] {"userId", "user_id"}) {
      MockHttpServletRequest request = request("DELETE", "/api/users/me");
      request.setParameter(param, "8");
      signAs(request, user("7"));
      MockFilterChain chain = new MockFilterChain();

      assertEquals(403, run(enforcing, request, chain).getStatus(), param);
      assertNull(chain.getRequest(), param);
    }
  }

  @Test
  void userMayNotReadAnotherUsersPathScopedData() throws Exception {
    for (String path :
        new String[] {
          "/api/users/8", "/api/resumes/user/8", "/api/resumes/user/8/export",
          "/api/jobs/user/8/matches"
        }) {
      MockHttpServletRequest request = request("GET", path);
      signAs(request, user("7"));
      assertEquals(403, run(enforcing, request, new MockFilterChain()).getStatus(), path);
    }

    MockHttpServletRequest own = request("GET", "/api/resumes/user/7");
    signAs(own, user("7"));
    assertEquals(200, run(enforcing, own, new MockFilterChain()).getStatus());
  }

  @Test
  void userMayNotLookUpAnotherFirebaseUid() throws Exception {
    MockHttpServletRequest request = request("GET", "/api/auth/me");
    request.setParameter("firebaseUid", "uid-8");
    signAs(request, user("7"));

    assertEquals(403, run(enforcing, request, new MockFilterChain()).getStatus());
  }

  @Test
  void adminAndServiceCallersMayActForAnyUser() throws Exception {
    MockHttpServletRequest admin = request("GET", "/api/users/8");
    signAs(admin, new AuthPrincipal("1", AuthPrincipal.ROLE_ADMIN, "uid-1"));
    assertEquals(200, run(enforcing, admin, new MockFilterChain()).getStatus());

    MockHttpServletRequest service = request("GET", "/api/resumes/user/8");
    InternalAuth.serviceHeaders(SECRET).forEach(service::addHeader);
    assertEquals(200, run(enforcing, service, new MockFilterChain()).getStatus());
    assertTrue(CurrentUser.of(service).isService());
  }

  @Test
  void internalEndpointsRejectEndUsersIncludingAdmins() throws Exception {
    MockHttpServletRequest asAdmin = request("POST", "/api/users/audit-log");
    signAs(asAdmin, new AuthPrincipal("1", AuthPrincipal.ROLE_ADMIN, "uid-1"));
    assertEquals(403, run(enforcing, asAdmin, new MockFilterChain()).getStatus());

    MockHttpServletRequest asService = request("POST", "/api/users/audit-log");
    InternalAuth.serviceHeaders(SECRET).forEach(asService::addHeader);
    assertEquals(200, run(enforcing, asService, new MockFilterChain()).getStatus());
  }

  @Test
  void healthAndLoginExchangeStayPublic() throws Exception {
    for (String path :
        new String[] {"/actuator/health", "/api/users/health", "/api/auth/verify", "/v3/api-docs"}) {
      MockFilterChain chain = new MockFilterChain();
      assertEquals(200, run(enforcing, request("POST", path), chain).getStatus(), path);
      assertNotNull(chain.getRequest(), path);
    }
  }

  @Test
  void reportOnlyLogsButNeverBlocks() throws Exception {
    InternalAuthFilter reportOnly = new InternalAuthFilter(AuthMode.REPORT_ONLY, SECRET);
    MockHttpServletRequest request = request("DELETE", "/api/users/me");
    request.setParameter("userId", "8");
    MockFilterChain chain = new MockFilterChain();

    assertEquals(200, run(reportOnly, request, chain).getStatus());
    assertNotNull(chain.getRequest());
    assertTrue(CurrentUser.canActFor(request, 8));
  }

  @Test
  void aRequestThatNeverPassedTheFilterIsNobody() {
    MockHttpServletRequest request = request("GET", "/api/resumes/5");
    assertFalse(CurrentUser.canActFor(request, 5));
  }

  @Test
  void serviceSignatureIsOnlyAttachedToInternalHosts() {
    assertTrue(ServiceAuthInterceptor.isInternalHost("user-service"));
    assertTrue(ServiceAuthInterceptor.isInternalHost("localhost"));
    assertFalse(ServiceAuthInterceptor.isInternalHost("www.linkedin.com"));
    assertFalse(ServiceAuthInterceptor.isInternalHost("api.adzuna.com"));
    assertFalse(ServiceAuthInterceptor.isInternalHost(null));
  }
}
