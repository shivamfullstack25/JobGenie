package com.jobgenie.userservice.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.jobgenie.shared.entities.User;
import com.jobgenie.shared.security.FirebaseTokenVerifier;
import com.jobgenie.shared.security.FirebaseTokenVerifier.InvalidTokenException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

class FirebaseAuthServiceTest {

  private static final String PROJECT = "jobgenie-test";
  private static RSAKey key;

  private UserService userService;
  private FirebaseAuthService authService;

  @BeforeAll
  static void generateKey() throws Exception {
    key = new RSAKeyGenerator(2048).keyID("k1").generate();
  }

  @BeforeEach
  void setUp() {
    userService = mock(UserService.class);
    when(userService.saveUser(any(User.class))).thenAnswer(call -> call.getArgument(0));
    authService = new FirebaseAuthService(userService);
    authService.setTokenVerifier(
        new FirebaseTokenVerifier(PROJECT, new ImmutableJWKSet<>(new JWKSet(key.toPublicJWK()))));
  }

  private static String signedToken(String uid, String email, boolean emailVerified)
      throws Exception {
    long now = System.currentTimeMillis();
    JWTClaimsSet claims =
        new JWTClaimsSet.Builder()
            .issuer("https://securetoken.google.com/" + PROJECT)
            .audience(PROJECT)
            .subject(uid)
            .issueTime(new Date(now - 1000))
            .expirationTime(new Date(now + 3_600_000))
            .claim("email", email)
            .claim("email_verified", emailVerified)
            .claim("name", "Asha Rao")
            .build();
    SignedJWT jwt =
        new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("k1").build(), claims);
    jwt.sign(new RSASSASigner(key));
    return jwt.serialize();
  }

  /** A token anyone can write by hand: valid-looking claims, no real signature. */
  private static String forgedUnsignedToken(String uid) {
    Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
    String header = b64.encodeToString("{\"alg\":\"RS256\"}".getBytes(StandardCharsets.UTF_8));
    String payload =
        b64.encodeToString(
            ("{\"user_id\":\""
                    + uid
                    + "\",\"sub\":\""
                    + uid
                    + "\",\"email\":\"victim@example.com\",\"email_verified\":true}")
                .getBytes(StandardCharsets.UTF_8));
    return header + "." + payload + ".not-a-signature";
  }

  @Test
  void firstSignInWithAVerifiedTokenCreatesTheAccount() throws Exception {
    User user = authService.getOrCreateUserFromToken(signedToken("uid-1", "asha@example.com", true));

    assertEquals("uid-1", user.getFirebaseUid());
    assertEquals("asha@example.com", user.getEmail());
    assertEquals("user", user.getRole());
    assertTrue(user.getIsEmailVerified());
  }

  @Test
  void forgedTokenIsRejectedAndNoAccountIsTouched() {
    assertThrows(
        InvalidTokenException.class,
        () -> authService.getOrCreateUserFromToken(forgedUnsignedToken("victim-uid")));

    verify(userService, never()).saveUser(any(User.class));
    verify(userService, never()).getUserByFirebaseUid(any());
  }

  @Test
  void forgedTokenCannotSignInAsAnExistingUser() {
    User victim = User.builder().id(42L).email("victim@example.com").firebaseUid("victim-uid").build();
    when(userService.getUserByFirebaseUid("victim-uid")).thenReturn(victim);

    assertThrows(
        InvalidTokenException.class,
        () -> authService.getOrCreateUserFromToken(forgedUnsignedToken("victim-uid")));
  }

  @Test
  void theInsecureFallbackOnlyRunsWhenExplicitlySwitchedOn() {
    authService.setInsecureLocalJwt(true);

    User user = authService.getOrCreateUserFromToken(forgedUnsignedToken("dev-uid"));

    assertEquals("dev-uid", user.getFirebaseUid());
  }

  @Test
  void returningUserWhoHasSinceVerifiedTheirEmailBecomesVerified() throws Exception {
    User existing =
        User.builder().id(7L).email("asha@example.com").firebaseUid("uid-1").isEmailVerified(false).build();
    when(userService.getUserByFirebaseUid("uid-1")).thenReturn(existing);

    User user = authService.getOrCreateUserFromToken(signedToken("uid-1", "asha@example.com", true));

    assertEquals(7L, user.getId());
    assertTrue(user.getIsEmailVerified());
  }

  @Test
  void signInNeverDowngradesOrChangesAnExistingUsersRole() throws Exception {
    User admin =
        User.builder().id(1L).email("root@example.com").firebaseUid("uid-9").role("admin").isEmailVerified(true).build();
    when(userService.getUserByFirebaseUid("uid-9")).thenReturn(admin);

    User user = authService.getOrCreateUserFromToken(signedToken("uid-9", "root@example.com", false));

    assertEquals("admin", user.getRole());
    assertTrue(user.getIsEmailVerified());
    assertFalse(user.getEmail().isEmpty());
  }
}
