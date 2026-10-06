package com.jobgenie.shared.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.jobgenie.shared.security.FirebaseTokenVerifier.InvalidTokenException;
import com.jobgenie.shared.security.FirebaseTokenVerifier.VerifiedToken;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

class FirebaseTokenVerifierTest {

  private static final String PROJECT = "jobgenie-test";

  private static RSAKey googleKey;
  private static RSAKey attackerKey;
  private static FirebaseTokenVerifier verifier;

  @BeforeAll
  static void keys() throws Exception {
    googleKey = new RSAKeyGenerator(2048).keyID("google-1").generate();
    attackerKey = new RSAKeyGenerator(2048).keyID("google-1").generate();
    verifier =
        new FirebaseTokenVerifier(
            PROJECT, new ImmutableJWKSet<>(new JWKSet(googleKey.toPublicJWK())));
  }

  private static JWTClaimsSet.Builder validClaims() {
    long now = System.currentTimeMillis();
    return new JWTClaimsSet.Builder()
        .issuer("https://securetoken.google.com/" + PROJECT)
        .audience(PROJECT)
        .subject("firebase-uid-123")
        .issueTime(new Date(now - 10_000))
        .expirationTime(new Date(now + 3_600_000))
        .claim("email", "asha@example.com")
        .claim("email_verified", true)
        .claim("name", "Asha Rao");
  }

  private static String sign(JWTClaimsSet claims, RSAKey key) throws Exception {
    SignedJWT jwt =
        new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims);
    jwt.sign(new RSASSASigner(key));
    return jwt.serialize();
  }

  @Test
  void acceptsAProperlySignedToken() throws Exception {
    VerifiedToken token = verifier.verify(sign(validClaims().build(), googleKey));

    assertEquals("firebase-uid-123", token.getUid());
    assertEquals("asha@example.com", token.getEmail());
    assertEquals("Asha Rao", token.getName());
    assertTrue(token.isEmailVerified());
  }

  /** The exact attack the old local-JWT fallback allowed: a payload with no real signature. */
  @Test
  void rejectsAnUnsignedTokenWithForgedClaims() {
    Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
    String header = b64.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8));
    String payload =
        b64.encodeToString(
            ("{\"sub\":\"victim-uid\",\"email\":\"victim@example.com\",\"email_verified\":true,"
                    + "\"iss\":\"https://securetoken.google.com/"
                    + PROJECT
                    + "\",\"aud\":\""
                    + PROJECT
                    + "\",\"exp\":9999999999,\"iat\":1}")
                .getBytes(StandardCharsets.UTF_8));

    assertThrows(InvalidTokenException.class, () -> verifier.verify(header + "." + payload + "."));
    assertThrows(
        InvalidTokenException.class, () -> verifier.verify(header + "." + payload + ".AAAA"));
  }

  @Test
  void rejectsATokenSignedByAnotherKeyWithTheSameKeyId() throws Exception {
    String forged = sign(validClaims().build(), attackerKey);
    assertThrows(InvalidTokenException.class, () -> verifier.verify(forged));
  }

  @Test
  void rejectsAnHmacTokenSignedWithThePublicKey() throws Exception {
    SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), validClaims().build());
    jwt.sign(new MACSigner(googleKey.toPublicJWK().toJSONString().getBytes(StandardCharsets.UTF_8)));
    assertThrows(InvalidTokenException.class, () -> verifier.verify(jwt.serialize()));
  }

  @Test
  void rejectsAnExpiredToken() throws Exception {
    long now = System.currentTimeMillis();
    String expired =
        sign(
            validClaims()
                .issueTime(new Date(now - 7_200_000))
                .expirationTime(new Date(now - 3_600_000))
                .build(),
            googleKey);
    assertThrows(InvalidTokenException.class, () -> verifier.verify(expired));
  }

  @Test
  void rejectsATokenForAnotherFirebaseProject() throws Exception {
    String otherAudience = sign(validClaims().audience("someone-elses-project").build(), googleKey);
    String otherIssuer =
        sign(
            validClaims().issuer("https://securetoken.google.com/someone-elses-project").build(),
            googleKey);

    assertThrows(InvalidTokenException.class, () -> verifier.verify(otherAudience));
    assertThrows(InvalidTokenException.class, () -> verifier.verify(otherIssuer));
  }

  @Test
  void rejectsMissingSubjectAndGarbage() throws Exception {
    String noSubject = sign(validClaims().subject(null).build(), googleKey);

    assertThrows(InvalidTokenException.class, () -> verifier.verify(noSubject));
    assertThrows(InvalidTokenException.class, () -> verifier.verify("not-a-jwt"));
    assertThrows(InvalidTokenException.class, () -> verifier.verify(""));
    assertThrows(InvalidTokenException.class, () -> verifier.verify(null));
  }
}
