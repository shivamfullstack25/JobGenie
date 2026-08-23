package com.jobgenie.userservice.service;

import java.util.List;
import java.util.Map;

import com.jobgenie.shared.entities.AuditLog;
import com.jobgenie.shared.entities.User;
import com.jobgenie.userservice.dto.UserProfileUpdateRequest;

public interface UserService {
  User getUserById(String userId);

  User getUserByFirebaseUid(String firebaseUid);

  User updateUserProfile(String userId, UserProfileUpdateRequest request);

  User updateUserSettings(String userId, Map<String, Object> settings);

  List<User> getAllUsers();

  void deleteUser(String userId);

  User saveUser(User user);

  AuditLog saveAuditLog(AuditLog auditLog);

  long getUserCount();

  User updateUserRole(String userId, String role);
}
