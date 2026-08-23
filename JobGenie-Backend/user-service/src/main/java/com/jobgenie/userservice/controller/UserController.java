package com.jobgenie.userservice.controller;

import java.util.List;
import java.util.Map;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import com.jobgenie.shared.entities.AuditLog;
import com.jobgenie.shared.entities.User;
import com.jobgenie.userservice.dto.UserProfileUpdateRequest;
import com.jobgenie.userservice.service.AccountService;
import com.jobgenie.userservice.service.UserService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api/users")
@Tag(name = "User Management", description = "User registration and profile management endpoints")
@CrossOrigin(origins = "*")
public class UserController {

  @Autowired private UserService userService;
  @Autowired private AccountService accountService;

  @GetMapping("/me")
  @Operation(
      summary = "Get current user profile",
      description = "Retrieve the profile of the current user")
  public ResponseEntity<User> getCurrentUser(@RequestParam String userId) {
    log.info("Fetching current user profile for userId={}", userId);
    // No try/catch here: userService.getUserById throws UserNotFoundException for a missing
    // user and IllegalArgumentException for a malformed userId — both are mapped to their
    // correct status codes (404 / 400) by GlobalExceptionHandler. The previous blanket
    // catch(Exception) turned a "user not found" into a bare 500, masking the real error.
    User user = userService.getUserById(userId);
    log.info("Successfully fetched user profile for userId={}", userId);
    return ResponseEntity.ok(user);
  }

  @DeleteMapping("/me")
  @Operation(
      summary = "Delete my account",
      description =
          "Self-service account deletion for the authenticated user. Best-effort cleans up"
              + " resumes and saved jobs in other services and removes the Firebase auth"
              + " record, then deletes the user-service record. This is permanent.")
  public ResponseEntity<Map<String, Object>> deleteOwnAccount(@RequestParam String userId) {
    log.info("Self-service account deletion requested for userId={}", userId);
    Map<String, Object> result = accountService.deleteOwnAccount(userId);
    log.info("Self-service account deletion completed for userId={}", userId);
    return ResponseEntity.ok(result);
  }

  @GetMapping("/me/export")
  @Operation(
      summary = "Export my data",
      description = "Export the profile data user-service holds for the authenticated user")
  public ResponseEntity<Map<String, Object>> exportOwnData(@RequestParam String userId) {
    log.info("Data export requested for userId={}", userId);
    Map<String, Object> export = accountService.exportUserData(userId);
    return ResponseEntity.ok(export);
  }

  @PutMapping("/profile")
  @Operation(
      summary = "Update user profile",
      description = "Update the profile of the specified user")
  public ResponseEntity<User> updateProfile(
      @Valid @RequestBody UserProfileUpdateRequest request, @RequestParam String userId) {
    User updatedUser = userService.updateUserProfile(userId, request);
    return ResponseEntity.ok(updatedUser);
  }

  @PutMapping("/profile/settings")
  @Operation(summary = "Update user settings", description = "Update user preferences and settings")
  public ResponseEntity<User> updateSettings(
      @RequestBody Map<String, Object> settings, @RequestParam String userId) {
    User updatedUser = userService.updateUserSettings(userId, settings);
    return ResponseEntity.ok(updatedUser);
  }

  @GetMapping("/{userId}")
  @Operation(summary = "Get user by ID", description = "Retrieve user information by user ID")
  public ResponseEntity<User> getUserById(@PathVariable String userId) {
    User user = userService.getUserById(userId);
    return ResponseEntity.ok(user);
  }

  /**
   * Looks up the calling admin by X-User-Id and requires an admin role. X-User-Id carries the
   * caller's Firebase UID here, not the numeric user-service ID — this previously called
   * userService.getUserById(adminUserId), which does Long.valueOf(adminUserId) internally. The only
   * real caller (admin-dashboard.tsx) sends the Firebase auth uid ("X-User-Id": user.uid) in this
   * header, so every call hit IllegalArgumentException ("Invalid user ID format") and a 400 instead
   * of ever reaching the admin check — the entire admin user-management UI (list users, change
   * role, delete user) was unusable. getUserByFirebaseUid matches what's actually sent.
   */
  private void requireAdmin(String adminFirebaseUid) {
    User user = userService.getUserByFirebaseUid(adminFirebaseUid);
    if (user == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
    }
    if (!"admin".equals(user.getRole())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin access required");
    }
  }

  @GetMapping
  @Operation(summary = "Get all users", description = "Retrieve all users (admin only)")
  public ResponseEntity<List<User>> getAllUsers(@RequestHeader("X-User-Id") String adminUserId) {
    requireAdmin(adminUserId);
    List<User> users = userService.getAllUsers();
    return ResponseEntity.ok(users);
  }

  @DeleteMapping("/{userId}")
  @Operation(summary = "Delete user", description = "Delete a user account (admin only)")
  public ResponseEntity<Map<String, String>> deleteUser(
      @PathVariable String userId, @RequestHeader("X-User-Id") String adminUserId) {
    requireAdmin(adminUserId);
    userService.deleteUser(userId);
    return ResponseEntity.ok(Map.of("message", "User deleted successfully"));
  }

  @GetMapping("/count")
  @Operation(
      summary = "Get total user count",
      description = "Get the total number of registered users")
  public ResponseEntity<Map<String, Object>> getUserCount() {
    log.info("Getting total user count");
    try {
      long count = userService.getUserCount();
      return ResponseEntity.ok(Map.of("count", count));
    } catch (Exception e) {
      log.error("Error getting user count: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("count", 0, "error", e.getMessage()));
    }
  }

  @PutMapping("/{userId}/role")
  @Operation(summary = "Update user role", description = "Update user role (admin only)")
  public ResponseEntity<User> updateUserRole(
      @PathVariable String userId,
      @RequestParam String role,
      @RequestHeader("X-User-Id") String adminUserId) {

    log.info("Admin {} updating role for user {} to {}", adminUserId, userId, role);

    // Reuse the same requireAdmin helper as the other admin-only endpoints (GET /api/users,
    // DELETE /api/users/{userId}) instead of the ad hoc getUserByFirebaseUid + manual 403 that
    // used to live here — this previously duplicated (and, before requireAdmin's own fix,
    // mismatched) the admin check. Let ResponseStatusException/UserNotFoundException propagate
    // to GlobalExceptionHandler instead of collapsing every failure into a bare 500.
    requireAdmin(adminUserId);

    User updatedUser = userService.updateUserRole(userId, role);
    log.info("Successfully updated user {} role to {}", userId, role);
    return ResponseEntity.ok(updatedUser);
  }

  @GetMapping("/health")
  @Operation(summary = "Health check", description = "Check if the user service is running")
  public ResponseEntity<Map<String, String>> healthCheck() {
    return ResponseEntity.ok(Map.of("status", "UP", "service", "user-service"));
  }

  @PostMapping("/audit-log")
  @Operation(
      summary = "Create audit log",
      description = "Create an audit log entry (used by other services)")
  public ResponseEntity<AuditLog> createAuditLog(@RequestBody AuditLog auditLog) {
    log.info(
        "Creating audit log: userId={}, action={}", auditLog.getUserId(), auditLog.getAction());
    try {
      // Set timestamp if not provided
      if (auditLog.getTimestamp() == null) {
        auditLog.setTimestamp(java.time.LocalDateTime.now());
      }
      AuditLog saved = userService.saveAuditLog(auditLog);
      log.info("Successfully created audit log with ID: {}", saved.getId());
      return ResponseEntity.ok(saved);
    } catch (Exception e) {
      log.error("Error creating audit log: {}", e.getMessage(), e);
      return ResponseEntity.status(500).build();
    }
  }
}
