package com.jobgenie.shared.security;

import java.net.URL;
import java.util.Collections;
import java.util.Date;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.util.DefaultResourceRetriever;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;

/**
 * Verifies Firebase ID tokens the way Firebase documents for third-party JWT libraries: RS256
 * signature against Google's published keys, issuer {@code
 * https://securetoken.google.com/<projectId>}, audience {@code <projectId>}, not expired, non-empty
 * subject. Needs no service-account file, so it works in every environment — which is what lets the
 * old "decode the payload and trust it" fallback be switched off.
 */
public class FirebaseTokenVerifier {

  public static final String GOOGLE_JWKS_URL =
      "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

  private static final long CLOCK_SKEW_MILLIS = 60_000;

  private final String projectId;
  private final DefaultJWTProcessor<SecurityContext> processor;

  public FirebaseTokenVerifier(String projectId) {
    this(projectId, defaultKeySource());
  }

  /** Test seam: verify against a caller-supplied key set instead of Google's. */
  public FirebaseTokenVerifier(String projectId, JWKSource<SecurityContext> keySource) {
    if (projectId == null || projectId.trim().isEmpty()) {
      throw new IllegalArgumentException("Firebase project id is required to verify ID tokens");
    }
    this.projectId = projectId.trim();
    this.processor = new DefaultJWTProcessor<>();
    // Only RS256 is accepted: "alg":"none" and HMAC-signed tokens are rejected outright.
    this.processor.setJWSKeySelector(
        new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, keySource));
    // Claims are checked explicitly in verify() so each failure has a precise reason.
    this.processor.setJWTClaimsSetVerifier((claims, context) -> {});
  }

  private static JWKSource<SecurityContext> defaultKeySource() {
    try {
      // RemoteJWKSet caches the key set and refetches when it meets an unknown key id.
      return new RemoteJWKSet<>(
          new URL(GOOGLE_JWKS_URL), new DefaultResourceRetriever(5000, 5000, 1024 * 1024));
    } catch (Exception e) {
      throw new IllegalStateException("Invalid Firebase JWKS URL", e);
    }
  }

  public VerifiedToken verify(String idToken) {
    if (idToken == null || idToken.trim().isEmpty()) {
      throw new InvalidTokenException("Missing ID token");
    }
    JWTClaimsSet claims;
    try {
      claims = processor.process(idToken.trim(), null);
    } catch (Exception e) {
      throw new InvalidTokenException("ID token signature or format is invalid: " + e.getMessage());
    }

    long now = System.currentTimeMillis();
    Date expiry = claims.getExpirationTime();
    if (expiry == null || expiry.getTime() + CLOCK_SKEW_MILLIS < now) {
      throw new InvalidTokenException("ID token has expired");
    }
    Date issuedAt = claims.getIssueTime();
    if (issuedAt == null || issuedAt.getTime() - CLOCK_SKEW_MILLIS > now) {
      throw new InvalidTokenException("ID token issue time is missing or in the future");
    }
    if (!("https://securetoken.google.com/" + projectId).equals(claims.getIssuer())) {
      throw new InvalidTokenException("ID token was not issued for this Firebase project");
    }
    if (claims.getAudience() == null
        || !claims.getAudience().equals(Collections.singletonList(projectId))) {
      throw new InvalidTokenException("ID token audience does not match this Firebase project");
    }
    String uid = claims.getSubject();
    if (uid == null || uid.trim().isEmpty()) {
      throw new InvalidTokenException("ID token has no subject");
    }

    return new VerifiedToken(
        uid,
        stringClaim(claims, "email"),
        stringClaim(claims, "name"),
        Boolean.TRUE.equals(claims.getClaim("email_verified")),
        stringClaim(claims, "picture"));
  }

  private static String stringClaim(JWTClaimsSet claims, String name) {
    Object value = claims.getClaim(name);
    return value == null ? null : value.toString();
  }

  /** The identity facts JobGenie takes from a verified Firebase ID token. */
  public static final class VerifiedToken {
    private final String uid;
    private final String email;
    private final String name;
    private final boolean emailVerified;
    private final String picture;

    public VerifiedToken(
        String uid, String email, String name, boolean emailVerified, String picture) {
      this.uid = uid;
      this.email = email;
      this.name = name;
      this.emailVerified = emailVerified;
      this.picture = picture;
    }

    public String getUid() {
      return uid;
    }

    public String getEmail() {
      return email;
    }

    public String getName() {
      return name;
    }

    public boolean isEmailVerified() {
      return emailVerified;
    }

    public String getPicture() {
      return picture;
    }
  }

  public static class InvalidTokenException extends RuntimeException {
    public InvalidTokenException(String message) {
      super(message);
    }
  }
}
