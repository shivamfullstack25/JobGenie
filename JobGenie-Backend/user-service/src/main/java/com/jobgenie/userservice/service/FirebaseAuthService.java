package com.jobgenie.userservice.service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.jobgenie.shared.entities.User;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class FirebaseAuthService {

  private final UserService userService;
  private final ObjectMapper objectMapper = new ObjectMapper();

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

  public User getOrCreateUserFromToken(String idToken) {
    FirebaseAuth auth = firebaseAuthOrNull();
    if (auth != null) {
      try {
        FirebaseToken decodedToken = auth.verifyIdToken(idToken);
        return getOrCreateFromFirebaseToken(decodedToken);
      } catch (Exception e) {
        log.warn("Firebase verify failed, attempting local JWT fallback: {}", e.getMessage());
      }
    } else {
      log.warn("Firebase Admin unavailable — using local JWT claim fallback");
    }

    return getOrCreateFromLocalJwt(idToken);
  }

  private User getOrCreateFromFirebaseToken(FirebaseToken decodedToken) {
    try {
      User existingUser = userService.getUserByFirebaseUid(decodedToken.getUid());
      if (existingUser != null) {
        existingUser.setLastLoginAt(LocalDateTime.now());
        return userService.saveUser(existingUser);
      }
    } catch (Exception e) {
      log.info("User not found by Firebase UID: {}, creating new user", decodedToken.getUid());
    }

    return userService.saveUser(createUserFromFirebaseToken(decodedToken));
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

  private User createUserFromFirebaseToken(FirebaseToken token) {
    Map<String, Object> claims = token.getClaims();

    User user =
        User.builder()
            .email(token.getEmail())
            .name(token.getName() != null ? token.getName() : token.getEmail())
            .authProvider("firebase")
            .role("user")
            .isEmailVerified(token.isEmailVerified())
            .lastLoginAt(LocalDateTime.now())
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();

    user.setFirebaseUid(token.getUid());

    if (claims != null) {
      if (claims.containsKey("picture")) {
        user.setProfileImageUrl(claims.get("picture").toString());
      }
      if (claims.containsKey("given_name") && claims.containsKey("family_name")) {
        user.setFirstName(claims.get("given_name").toString());
        user.setLastName(claims.get("family_name").toString());
      }
    }

    log.info("Created new user from Firebase token: {}", user.getEmail());
    return user;
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
