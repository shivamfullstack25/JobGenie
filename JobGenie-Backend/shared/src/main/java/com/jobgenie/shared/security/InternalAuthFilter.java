package com.jobgenie.shared.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.springframework.web.filter.OncePerRequestFilter;

import lombok.extern.slf4j.Slf4j;

/**
 * Establishes who is calling a service. Identity comes only from the gateway-signed (or
 * peer-service-signed) {@code X-Auth-*} headers — never from a {@code userId} the client typed.
 *
 * <p>Every controller in this codebase historically took {@code userId} as a request parameter or
 * path segment. Rather than trusting it, this filter rejects any request where that value differs
 * from the authenticated user, unless the caller is an admin or another JobGenie service. That
 * closes the read/update/delete-anyone hole without rewriting each controller's signature.
 * Endpoints that carry the user id in a JSON body, or that address data by another key (resume id,
 * schedule id), check ownership themselves via {@link CurrentUser}.
 */
@Slf4j
public class InternalAuthFilter extends OncePerRequestFilter {

  /** Reachable without identity: health probes, API docs, and the login exchange itself. */
  private static final List<Pattern> PUBLIC_PATHS =
      List.of(
          Pattern.compile("^/actuator(/.*)?$"),
          Pattern.compile("^/error$"),
          Pattern.compile("^/v3/api-docs(/.*)?$"),
          Pattern.compile("^/swagger-ui(/.*|\\.html)?$"),
          Pattern.compile("^/api/[a-z-]+/health$"),
          Pattern.compile("^/api/auth/(verify|refresh)$"));

  /** Paths whose first capture group is a user id the caller must own. */
  private static final List<Pattern> USER_ID_PATHS =
      List.of(
          Pattern.compile("^/api/users/(\\d+)$"),
          Pattern.compile("^/api/resumes/user/(\\d+)(/export)?$"),
          Pattern.compile("^/api/jobs/user/(\\d+)/matches$"));

  /** Callable only by another JobGenie service, never by an end user through the gateway. */
  private static final List<Pattern> SERVICE_ONLY_PATHS =
      List.of(Pattern.compile("^/api/users/audit-log$"));

  private static final String[] USER_ID_PARAMS = {"userId", "user_id"};

  private final AuthMode mode;
  private final String secret;

  public InternalAuthFilter(AuthMode mode, String secret) {
    this.mode = mode;
    this.secret = secret;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (mode == AuthMode.OFF) {
      request.setAttribute(InternalAuth.REQUEST_ATTRIBUTE, AuthPrincipal.UNENFORCED);
      chain.doFilter(request, response);
      return;
    }

    String path = request.getRequestURI();
    if ("OPTIONS".equalsIgnoreCase(request.getMethod()) || matchesAny(PUBLIC_PATHS, path)) {
      chain.doFilter(request, response);
      return;
    }

    AuthPrincipal principal =
        InternalAuth.verify(
            secret,
            request.getHeader(InternalAuth.HEADER_USER_ID),
            request.getHeader(InternalAuth.HEADER_ROLE),
            request.getHeader(InternalAuth.HEADER_UID),
            request.getHeader(InternalAuth.HEADER_TIMESTAMP),
            request.getHeader(InternalAuth.HEADER_SIGNATURE));

    String denial = principal == null ? null : ownershipViolation(request, path, principal);

    if (mode == AuthMode.REPORT_ONLY) {
      if (principal == null) {
        log.warn("[auth report-only] unauthenticated {} {}", request.getMethod(), path);
      } else if (denial != null) {
        log.warn("[auth report-only] would deny {} {}: {}", request.getMethod(), path, denial);
      }
      // Report-only never changes behaviour: downstream code sees the legacy permissive caller.
      request.setAttribute(InternalAuth.REQUEST_ATTRIBUTE, AuthPrincipal.UNENFORCED);
      chain.doFilter(request, response);
      return;
    }

    if (principal == null) {
      reject(response, HttpServletResponse.SC_UNAUTHORIZED, "UNAUTHENTICATED", "Sign in required");
      return;
    }
    if (denial != null) {
      log.warn(
          "Denied {} {} for user {}: {}", request.getMethod(), path, principal.getUserId(), denial);
      reject(response, HttpServletResponse.SC_FORBIDDEN, "FORBIDDEN", denial);
      return;
    }

    request.setAttribute(InternalAuth.REQUEST_ATTRIBUTE, principal);
    chain.doFilter(request, response);
  }

  /** Returns why this caller may not make this request, or {@code null} if they may. */
  private String ownershipViolation(HttpServletRequest request, String path, AuthPrincipal who) {
    if (who.isService()) {
      return null;
    }
    if (matchesAny(SERVICE_ONLY_PATHS, path)) {
      return "This endpoint is internal";
    }
    if (who.isAdmin()) {
      return null;
    }
    for (String param : USER_ID_PARAMS) {
      String[] values = request.getParameterValues(param);
      if (values == null) {
        continue;
      }
      for (String value : values) {
        if (!who.canActFor(value)) {
          return "You can only access your own data";
        }
      }
    }
    String firebaseUid = request.getParameter("firebaseUid");
    if (firebaseUid != null && !firebaseUid.equals(who.getFirebaseUid())) {
      return "You can only access your own data";
    }
    for (Pattern pattern : USER_ID_PATHS) {
      Matcher matcher = pattern.matcher(path);
      if (matcher.matches() && !who.canActFor(matcher.group(1))) {
        return "You can only access your own data";
      }
    }
    return null;
  }

  private static boolean matchesAny(List<Pattern> patterns, String path) {
    for (Pattern pattern : patterns) {
      if (pattern.matcher(path).matches()) {
        return true;
      }
    }
    return false;
  }

  private static void reject(HttpServletResponse response, int status, String code, String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json");
    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
    response.getWriter().write("{\"error\":\"" + code + "\",\"message\":\"" + message + "\"}");
  }
}
