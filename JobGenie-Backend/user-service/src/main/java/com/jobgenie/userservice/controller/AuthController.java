package com.jobgenie.userservice.controller;

import java.util.Map;

import javax.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.jobgenie.shared.entities.User;
import com.jobgenie.userservice.dto.AuthRequest;
import com.jobgenie.userservice.dto.AuthResponse;
import com.jobgenie.userservice.service.FirebaseAuthService;
import com.jobgenie.userservice.service.UserService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Firebase authentication endpoints")
@CrossOrigin(origins = "*")
@Slf4j
@RequiredArgsConstructor
public class AuthController {

  private final FirebaseAuthService firebaseAuthService;
  private final UserService userService;

  @PostMapping("/verify")
  @Operation(
      summary = "Verify Firebase token and get user",
      description = "Verify Firebase ID token and return user information")
  public ResponseEntity<AuthResponse> verifyToken(@Valid @RequestBody AuthRequest request) {
    try {
      log.info("Verifying Firebase token for authentication");

      // Verify token and get/create user
      User user = firebaseAuthService.getOrCreateUserFromToken(request.getIdToken());

      AuthResponse response =
          AuthResponse.builder()
              .success(true)
              .user(user)
              .message("Authentication successful")
              .build();

      log.info("Authentication successful for user: {}", user.getEmail());
      return ResponseEntity.ok(response);

    } catch (Exception e) {
      log.error("Authentication failed: {}", e.getMessage(), e);

      AuthResponse response =
          AuthResponse.builder()
              .success(false)
              .message("Authentication failed: " + e.getMessage())
              .build();

      return ResponseEntity.status(401).body(response);
    }
  }

  @PostMapping("/refresh")
  @Operation(
      summary = "Refresh user session",
      description = "Update user information from Firebase token")
  public ResponseEntity<AuthResponse> refreshUser(@Valid @RequestBody AuthRequest request) {
    try {
      log.info("Refreshing user session");
      User user = firebaseAuthService.getOrCreateUserFromToken(request.getIdToken());

      AuthResponse response =
          AuthResponse.builder()
              .success(true)
              .user(user)
              .message("User session refreshed successfully")
              .build();

      log.info("User session refreshed for: {}", user.getEmail());
      return ResponseEntity.ok(response);

    } catch (Exception e) {
      log.error("Session refresh failed: {}", e.getMessage(), e);

      AuthResponse response =
          AuthResponse.builder()
              .success(false)
              .message("Session refresh failed: " + e.getMessage())
              .build();

      return ResponseEntity.status(401).body(response);
    }
  }

  @GetMapping("/me")
  @Operation(
      summary = "Get current user",
      description = "Get current user information by Firebase UID")
  public ResponseEntity<User> getCurrentUser(@RequestParam String firebaseUid) {
    try {
      log.info("Getting current user for Firebase UID: {}", firebaseUid);

      User user = userService.getUserByFirebaseUid(firebaseUid);
      if (user == null) {
        return ResponseEntity.notFound().build();
      }

      return ResponseEntity.ok(user);

    } catch (Exception e) {
      log.error("Failed to get current user: {}", e.getMessage(), e);
      return ResponseEntity.status(500).build();
    }
  }

  @PostMapping("/logout")
  @Operation(
      summary = "Logout user",
      description = "Handle user logout (optional server-side cleanup)")
  public ResponseEntity<Map<String, String>> logout(@RequestParam String firebaseUid) {
    try {
      log.info("User logout for Firebase UID: {}", firebaseUid);

      // Update last login time (optional cleanup)
      User user = userService.getUserByFirebaseUid(firebaseUid);
      if (user != null) {
        // Could add logout timestamp or other cleanup here
        log.info("User logged out: {}", user.getEmail());
      }

      return ResponseEntity.ok(Map.of("message", "Logout successful"));

    } catch (Exception e) {
      log.error("Logout failed: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("error", "Logout failed"));
    }
  }

  @GetMapping("/health")
  @Operation(
      summary = "Auth service health check",
      description = "Check if the authentication service is running")
  public ResponseEntity<Map<String, String>> healthCheck() {
    return ResponseEntity.ok(Map.of("status", "UP", "service", "auth-service"));
  }
}
