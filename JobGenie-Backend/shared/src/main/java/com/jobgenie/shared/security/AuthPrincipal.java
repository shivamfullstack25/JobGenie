package com.jobgenie.shared.security;

/**
 * The authenticated caller of a request, as established by the API gateway (end users) or by a
 * peer service (role {@code service}). Never built from client-supplied values.
 */
public final class AuthPrincipal {

  public static final String ROLE_SERVICE = "service";
  public static final String ROLE_ADMIN = "admin";

  /** Used only when enforcement is switched off, so legacy behaviour is preserved exactly. */
  static final AuthPrincipal UNENFORCED = new AuthPrincipal("", "", "", false);

  private final String userId;
  private final String role;
  private final String firebaseUid;
  private final boolean enforced;

  public AuthPrincipal(String userId, String role, String firebaseUid) {
    this(userId, role, firebaseUid, true);
  }

  private AuthPrincipal(String userId, String role, String firebaseUid, boolean enforced) {
    this.userId = userId == null ? "" : userId;
    this.role = role == null ? "" : role;
    this.firebaseUid = firebaseUid == null ? "" : firebaseUid;
    this.enforced = enforced;
  }

  public String getUserId() {
    return userId;
  }

  public String getRole() {
    return role;
  }

  public String getFirebaseUid() {
    return firebaseUid;
  }

  public boolean isService() {
    return ROLE_SERVICE.equals(role);
  }

  public boolean isAdmin() {
    return ROLE_ADMIN.equals(role);
  }

  /** Services and admins may act on any user's data; everyone else only on their own. */
  public boolean isPrivileged() {
    return !enforced || isService() || isAdmin();
  }

  /** True when this caller may read or change data owned by {@code ownerUserId}. */
  public boolean canActFor(Object ownerUserId) {
    if (isPrivileged()) {
      return true;
    }
    return ownerUserId != null && !userId.isEmpty() && userId.equals(String.valueOf(ownerUserId));
  }
}
