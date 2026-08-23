package com.jobgenie.userservice.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.jobgenie.shared.entities.AuditLog;
import com.jobgenie.shared.entities.User;
import com.jobgenie.shared.exception.UserNotFoundException;
import com.jobgenie.userservice.dto.UserProfileUpdateRequest;
import com.jobgenie.userservice.repository.AuditLogRepository;
import com.jobgenie.userservice.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

  private final UserRepository userRepository;
  private final AuditLogRepository auditLogRepository;

  private Long parseUserId(String userId) {
    if (userId == null || userId.trim().isEmpty()) {
      log.warn("User ID is null or empty");
      throw new IllegalArgumentException("User ID cannot be null or empty");
    }
    try {
      return Long.valueOf(userId);
    } catch (NumberFormatException e) {
      log.warn("Invalid user ID format: {}", userId);
      throw new IllegalArgumentException("Invalid user ID format: " + userId);
    }
  }

  private void logAdminAction(String adminUserId, String action, String details) {
    AuditLog log =
        AuditLog.builder()
            .userId(adminUserId)
            .action(action)
            .details(details)
            .timestamp(LocalDateTime.now())
            .build();
    auditLogRepository.save(log);
  }

  @Override
  public User getUserById(String userId) {
    Long id = parseUserId(userId);
    log.info("Getting user by ID: {}", id);
    Optional<User> userOpt = userRepository.findById(id);
    if (userOpt.isPresent()) {
      return userOpt.get();
    }
    log.warn("User not found for ID: {}", id);
    throw new UserNotFoundException(userId);
  }

  @Override
  public User getUserByFirebaseUid(String firebaseUid) {
    log.info("Getting user by Firebase UID: {}", firebaseUid);
    Optional<User> userOpt = userRepository.findByFirebaseUid(firebaseUid);
    if (userOpt.isPresent()) {
      return userOpt.get();
    }
    log.warn("User not found for Firebase UID: {}", firebaseUid);
    return null; // Return null instead of throwing exception for new user creation
  }

  @Override
  @Transactional
  public User updateUserProfile(String userId, UserProfileUpdateRequest request) {
    if (request == null) {
      log.warn("UserProfileUpdateRequest is null for userId: {}", userId);
      throw new IllegalArgumentException("Profile update request cannot be null");
    }
    Long id = parseUserId(userId);
    log.info("Updating user profile for userId: {}", id);
    Optional<User> userOpt = userRepository.findById(id);
    if (userOpt.isPresent()) {
      User user = userOpt.get();

      if (request.getName() != null) {
        user.setName(request.getName());
      }
      if (request.getEmail() != null) {
        user.setEmail(request.getEmail());
      }
      if (request.getPhone() != null) {
        user.setPhone(request.getPhone());
      }
      if (request.getAvatar() != null) {
        user.setAvatar(request.getAvatar());
      }
      if (request.getBio() != null) {
        user.setBio(request.getBio());
      }
      if (request.getLocation() != null) {
        user.setLocation(request.getLocation());
      }
      if (request.getWebsite() != null) {
        user.setWebsite(request.getWebsite());
      }
      if (request.getLinkedinUrl() != null) {
        user.setLinkedinUrl(request.getLinkedinUrl());
      }
      if (request.getGithubUrl() != null) {
        user.setGithubUrl(request.getGithubUrl());
      }

      user.setUpdatedAt(LocalDateTime.now());
      return userRepository.save(user);
    }
    log.warn("User not found for update, ID: {}", id);
    throw new UserNotFoundException(userId);
  }

  @Override
  @Transactional
  public User updateUserSettings(String userId, Map<String, Object> settings) {
    if (settings == null) {
      log.warn("Settings map is null for userId: {}", userId);
      throw new IllegalArgumentException("Settings cannot be null");
    }
    Long id = parseUserId(userId);
    log.info("Updating user settings for userId: {}", id);
    Optional<User> userOpt = userRepository.findById(id);
    if (userOpt.isPresent()) {
      User user = userOpt.get();
      user.setSettings(settings);
      user.setUpdatedAt(LocalDateTime.now());
      return userRepository.save(user);
    }
    log.warn("User not found for settings update, ID: {}", id);
    throw new UserNotFoundException(userId);
  }

  @Override
  public List<User> getAllUsers() {
    log.info("Getting all users");
    return userRepository.findAll();
  }

  @Override
  @Transactional
  public void deleteUser(String userId) {
    Long id = parseUserId(userId);
    log.info("Deleting user with ID: {}", id);
    Optional<User> userOpt = userRepository.findById(id);
    if (userOpt.isPresent()) {
      userRepository.delete(userOpt.get());
      logAdminAction(userId, "deleteUser", "Deleted user with ID: " + userId);
    } else {
      log.warn("User not found for delete, ID: {}", id);
      throw new UserNotFoundException(userId);
    }
  }

  @Override
  public User saveUser(User user) {
    // Generic persist used by the auth flow (login/create/update-from-token) — NOT an
    // admin action. It used to unconditionally write an "updateUserRole" audit log entry
    // here, which meant every ordinary login falsely showed up in the audit trail as a role
    // change. Actual role changes are audited in updateUserRole() below, which is the only
    // code path that should log them.
    return userRepository.save(user);
  }

  @Override
  public AuditLog saveAuditLog(AuditLog auditLog) {
    log.info("Saving audit log: userId={}, action={}", auditLog.getUserId(), auditLog.getAction());
    return auditLogRepository.save(auditLog);
  }

  @Override
  public long getUserCount() {
    log.info("Getting total user count");
    return userRepository.count();
  }

  @Override
  @Transactional
  public User updateUserRole(String userId, String role) {
    Long id = parseUserId(userId);
    log.info("Updating user role for userId: {} to role: {}", id, role);

    Optional<User> userOpt = userRepository.findById(id);
    if (userOpt.isPresent()) {
      User user = userOpt.get();
      user.setRole(role);
      user.setUpdatedAt(LocalDateTime.now());
      User updated = userRepository.save(user);
      logAdminAction(userId, "updateUserRole", "Role changed to: " + role);
      return updated;
    }

    log.warn("User not found for role update, ID: {}", id);
    throw new UserNotFoundException(userId);
  }
}
