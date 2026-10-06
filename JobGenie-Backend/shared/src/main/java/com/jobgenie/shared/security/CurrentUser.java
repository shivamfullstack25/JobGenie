package com.jobgenie.shared.security;

import javax.servlet.http.HttpServletRequest;

/**
 * Controller-side access to the caller established by {@link InternalAuthFilter}, for ownership
 * checks the filter cannot make itself (a user id inside a JSON body, or data addressed by a
 * resume/schedule id).
 */
public final class CurrentUser {

  /** A request that never passed the filter is treated as nobody, not as everybody. */
  private static final AuthPrincipal ANONYMOUS = new AuthPrincipal("", "", "");

  private CurrentUser() {}

  public static AuthPrincipal of(HttpServletRequest request) {
    Object attribute = request == null ? null : request.getAttribute(InternalAuth.REQUEST_ATTRIBUTE);
    return attribute instanceof AuthPrincipal ? (AuthPrincipal) attribute : ANONYMOUS;
  }

  /** True when the caller may read or change data owned by {@code ownerUserId}. */
  public static boolean canActFor(HttpServletRequest request, Object ownerUserId) {
    return of(request).canActFor(ownerUserId);
  }
}
