package com.jobgenie.shared.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Signed identity headers passed between the gateway and the services. The gateway is the only
 * component that validates end-user tokens; it then asserts who the caller is with an HMAC over
 * these headers, keyed by a secret shared by all JobGenie services. A service trusts identity only
 * when the signature verifies, so a caller cannot simply send {@code X-Auth-User-Id} themselves.
 */
public final class InternalAuth {

  public static final String HEADER_USER_ID = "X-Auth-User-Id";
  public static final String HEADER_ROLE = "X-Auth-Role";
  public static final String HEADER_UID = "X-Auth-Uid";
  public static final String HEADER_TIMESTAMP = "X-Auth-Ts";
  public static final String HEADER_SIGNATURE = "X-Auth-Signature";

  /** Request attribute holding the verified {@link AuthPrincipal}. */
  public static final String REQUEST_ATTRIBUTE = "jobgenie.auth.principal";

  /** How far a signature's timestamp may drift from now before it is rejected as a replay. */
  public static final long MAX_SKEW_SECONDS = 300;

  private static final String HMAC = "HmacSHA256";

  private InternalAuth() {}

  public static Map<String, String> signedHeaders(String secret, AuthPrincipal principal) {
    return signedHeaders(secret, principal, Instant.now().getEpochSecond());
  }

  static Map<String, String> signedHeaders(
      String secret, AuthPrincipal principal, long epochSecond) {
    String ts = Long.toString(epochSecond);
    Map<String, String> headers = new LinkedHashMap<>();
    headers.put(HEADER_USER_ID, principal.getUserId());
    headers.put(HEADER_ROLE, principal.getRole());
    headers.put(HEADER_UID, principal.getFirebaseUid());
    headers.put(HEADER_TIMESTAMP, ts);
    headers.put(
        HEADER_SIGNATURE,
        sign(secret, principal.getUserId(), principal.getRole(), principal.getFirebaseUid(), ts));
    return headers;
  }

  public static Map<String, String> serviceHeaders(String secret) {
    return signedHeaders(secret, new AuthPrincipal("0", AuthPrincipal.ROLE_SERVICE, ""));
  }

  /**
   * Returns the principal these headers assert, or {@code null} if anything is missing, the
   * signature does not match, or the timestamp is outside the allowed window.
   */
  public static AuthPrincipal verify(
      String secret, String userId, String role, String uid, String timestamp, String signature) {
    return verify(secret, userId, role, uid, timestamp, signature, Instant.now().getEpochSecond());
  }

  static AuthPrincipal verify(
      String secret,
      String userId,
      String role,
      String uid,
      String timestamp,
      String signature,
      long nowEpochSecond) {
    if (isBlank(secret) || isBlank(role) || isBlank(timestamp) || isBlank(signature)) {
      return null;
    }
    long ts;
    try {
      ts = Long.parseLong(timestamp.trim());
    } catch (NumberFormatException e) {
      return null;
    }
    if (Math.abs(nowEpochSecond - ts) > MAX_SKEW_SECONDS) {
      return null;
    }
    String safeUserId = userId == null ? "" : userId;
    String safeUid = uid == null ? "" : uid;
    String expected = sign(secret, safeUserId, role, safeUid, timestamp.trim());
    boolean matches =
        MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.UTF_8),
            signature.trim().getBytes(StandardCharsets.UTF_8));
    return matches ? new AuthPrincipal(safeUserId, role, safeUid) : null;
  }

  static String sign(String secret, String userId, String role, String uid, String timestamp) {
    try {
      Mac mac = Mac.getInstance(HMAC);
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC));
      // Newline-delimited so no field can be shifted into its neighbour to forge a match.
      String payload = userId + "\n" + role + "\n" + uid + "\n" + timestamp;
      byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(raw.length * 2);
      for (byte b : raw) {
        hex.append(String.format("%02x", b));
      }
      return hex.toString();
    } catch (Exception e) {
      throw new IllegalStateException("Unable to sign internal auth headers", e);
    }
  }

  private static boolean isBlank(String value) {
    return value == null || value.trim().isEmpty();
  }
}
