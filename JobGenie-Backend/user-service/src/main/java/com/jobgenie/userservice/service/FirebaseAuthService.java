package com.jobgenie.userservice.service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.jobgenie.shared.entities.User;
import com.jobgenie.shared.security.FirebaseTokenVerifier;
import com.jobgenie.shared.security.FirebaseTokenVerifier.InvalidTokenException;
import com.jobgenie.shared.security.FirebaseTokenVerifier.VerifiedToken;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class FirebaseAuthService {

  private final UserService userService;
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Value("${firebase.project-id:jobgenie-d95c7}")
  private String firebaseProjectId;

  /** Offline-development escape hatch only. Never enable in a deployed environment. */
  @Value("${jobgenie.auth.insecure-local-jwt:false}")
  private boolean insecureLocalJwt;

  private volatile FirebaseTokenVerifier tokenVerifier;

  /** Test seam. */
  void setTokenVerifier(FirebaseTokenVerifier tokenVerifier) {
    this.tokenVerifier = tokenVerifier;
  }

  void setInsecureLocalJwt(boolean insecureLocalJwt) {
    this.insecureLocalJwt = insecureLocalJwt;
  }

  private FirebaseAuth firebaseAuthOrNull() {
    try {
      if (FirebaseApp.getApps().isEmpty()) {
        return null;
      }
      return FirebaseAuth.getInstance();
    } catch (Exception e) {
      return null;
    }
  }

  public FirebaseToken verifyIdToken(String idToken) {
    FirebaseAuth auth = firebaseAuthOrNull();
    if (auth == null) {
      throw new IllegalStateException("Firebase Admin is not configured");
    }
    try {
      FirebaseToken decodedToken = auth.verifyIdToken(idToken);
      log.info("Firebase token verified successfully for UID: {}", decodedToken.getUid());
      return decodedToken;
    } catch (Exception e) {
      log.error("Failed to verify Firebase ID token", e);
      throw new RuntimeException("Invalid Firebase token", e);
    }
  }

  /**
   * Verifies the ID token's signature and claims, then returns the matching user, creating the
   * account on first sign-in.
   *
   * <p>Verification uses Google's public keys ({@link FirebaseTokenVerifier}), so it works whether
   * or not a Firebase service-account file is present. This replaces the earlier behaviour, where
   * any verification failure — or simply a missing service account — fell through to decoding the
   * token payload and trusting it unsigned, which let anyone sign in as any user. That decode-only
   * path now runs solely when {@code jobgenie.auth.insecure-local-jwt=true} is set for offline
   * development, and is off by default.
   */
  public User getOrCreateUserFromToken(String idToken) {
    try {
      return getOrCreateFromVerifiedToken(tokenVerifier().verify(idToken));
    } catch (InvalidTokenException e) {
      if (insecureLocalJwt) {
        log.warn(
            "INSECURE: accepting an unverified token because jobgenie.auth.insecure-local-jwt=true"
                + " ({})",
            e.getMessage());
        return getOrCreateFromLocalJwt(idToken);
      }
      throw e;
    }
  }

  private FirebaseTokenVerifier tokenVerifier() {
    FirebaseTokenVerifier current = tokenVerifier;
    if (current == null) {
      current = new FirebaseTokenVerifier(firebaseProjectId);
      tokenVerifier = current;
    }
    return current;
  }

  private User getOrCreateFromVerifiedToken(VerifiedToken token) {
    User existing = null;
    try {
      existing = userService.getUserByFirebaseUid(token.getUid());
    } catch (Exception ignored) {
      // not found — created below
    }
    if (existing != null) {
      existing.setLastLoginAt(LocalDateTime.now());
      // Was only ever set at account creation, so a user who verified their email afterwards
      // stayed "unverified" here forever and could never pass the apply/automation gate.
      if (token.isEmailVerified() && !Boolean.TRUE.equals(existing.getIsEmailVerified())) {
        existing.setIsEmailVerified(true);
      }
      return userService.saveUser(existing);
    }

    String email = token.getEmail();
    if (email == null || email.isBlank()) {
      email = token.getUid() + "@jobgenie.local";
    }
    String name = token.getName();
    if (name == null || name.isBlank()) {
      name = email;
    }
    User user =
        User.builder()
            .email(email)
            .name(name)
            .firebaseUid(token.getUid())
            .authProvider("firebase")
            .role("user")
            .isEmailVerified(token.isEmailVerified())
            .lastLoginAt(LocalDateTime.now())
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();
    if (token.getPicture() != null) {
      user.setProfileImageUrl(token.getPicture());
    }
    log.info("Created user from verified Firebase token: {}", email);
    return userService.saveUser(user);
  }

  @SuppressWarnings("unchecked")
  private User getOrCreateFromLocalJwt(String idToken) {
    try {
      String[] parts = idToken.split("\\.");
      if (parts.length < 2) {
        throw new IllegalArgumentException("Invalid token format");
      }
      String payloadJson =
          new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
      Map<String, Object> claims = objectMapper.readValue(payloadJson, Map.class);

      String uid = stringClaim(claims, "user_id", "sub", "uid");
      String email = stringClaim(claims, "email");
      String name = stringClaim(claims, "name");
      if (uid == null || uid.isBlank()) {
        throw new IllegalArgumentException("Token missing uid/sub claim");
      }
      if (email == null || email.isBlank()) {
        email = uid + "@jobgenie.local";
      }
      if (name == null || name.isBlank()) {
        name = email;
      }

      try {
        User existing = userService.getUserByFirebaseUid(uid);
        if (existing != null) {
          existing.setLastLoginAt(LocalDateTime.now());
          return userService.saveUser(existing);
        }
      } catch (Exception ignored) {
        // create below
      }

      User user =
          User.builder()
              .email(email)
              .name(name)
              .firebaseUid(uid)
              .authProvider("firebase-local")
              .role("user")
              .isEmailVerified(Boolean.TRUE.equals(claims.get("email_verified")))
              .lastLoginAt(LocalDateTime.now())
              .createdAt(LocalDateTime.now())
              .updatedAt(LocalDateTime.now())
              .build();

      if (claims.get("picture") != null) {
        user.setProfileImageUrl(claims.get("picture").toString());
      }

      log.info("Created local-fallback user from JWT claims: {}", email);
      return userService.saveUser(user);
    } catch (Exception e) {
      throw new RuntimeException("Local auth fallback failed: " + e.getMessage(), e);
    }
  }

  private String stringClaim(Map<String, Object> claims, String... keys) {
    for (String key : keys) {
      Object value = claims.get(key);
      if (value != null && !value.toString().isBlank()) {
        return value.toString();
      }
    }
    return null;
  }

  public User updateUserFromFirebase(String firebaseUid, FirebaseToken token) {
    User user = userService.getUserByFirebaseUid(firebaseUid);
    if (user == null) {
      throw new RuntimeException("User not found for Firebase UID: " + firebaseUid);
    }

    user.setEmail(token.getEmail());
    user.setName(token.getName() != null ? token.getName() : user.getName());
    user.setIsEmailVerified(token.isEmailVerified());
    user.setLastLoginAt(LocalDateTime.now());
    user.setUpdatedAt(LocalDateTime.now());

    Map<String, Object> claims = token.getClaims();
    if (claims != null && claims.containsKey("picture")) {
      user.setProfileImageUrl(claims.get("picture").toString());
    }

    return userService.saveUser(user);
  }

  /**
   * Deletes the Firebase auth record for this UID. Returns {@code true} only if a Firebase account
   * was actually deleted, {@code false} if there was nothing to do because Firebase Admin isn't
   * configured in this environment (local-JWT-fallback deployments). Callers must not treat a
   * {@code false} return as failure — it means "skipped", not "errored"; actual errors are reported
   * via the thrown exception.
   */
  public boolean deleteFirebaseUser(String firebaseUid) {
    FirebaseAuth auth = firebaseAuthOrNull();
    if (auth == null) {
      log.warn("Firebase Admin unavailable — skip delete for {}", firebaseUid);
      return false;
    }
    try {
      auth.deleteUser(firebaseUid);
      log.info("Deleted Firebase user: {}", firebaseUid);
      return true;
    } catch (Exception e) {
      log.error("Failed to delete Firebase user: {}", firebaseUid, e);
      throw new RuntimeException("Failed to delete Firebase user", e);
    }
  }
}
