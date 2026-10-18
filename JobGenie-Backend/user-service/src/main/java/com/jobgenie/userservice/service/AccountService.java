package com.jobgenie.userservice.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import com.jobgenie.shared.entities.AuditLog;
import com.jobgenie.shared.entities.User;
import com.jobgenie.userservice.profile.CandidateProfileService;
import com.jobgenie.userservice.repository.AuditLogRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Self-service account actions (export + deletion) performed by a user on their own record —
 * distinct from the admin-only user management in {@link UserController}.
 *
 * <p>Kept as its own service rather than folded into {@link UserServiceImpl} because account
 * deletion needs to (a) call {@link FirebaseAuthService} to remove the Firebase auth record and (b)
 * make best-effort HTTP calls to resume-service and job-service to clean up cross-service data.
 * Wiring FirebaseAuthService into UserServiceImpl would create a circular bean dependency, since
 * FirebaseAuthService already depends on UserService for user lookups.
 *
 * <p>User-service owns the "users" table; resume-service and job-service own their own databases
 * (see the note on User's removed cross-service @OneToMany). There is no distributed transaction
 * across services, so cross-service cleanup here is best-effort: a downstream failure is logged and
 * reported back to the caller, but never blocks deletion of the primary user-service record.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AccountService {

  private final UserService userService;
  private final AuditLogRepository auditLogRepository;
  private final FirebaseAuthService firebaseAuthService;
  private final RestTemplate restTemplate;
  private final CandidateProfileService candidateProfileService;

  @Value("${resume.service.url:http://resume-service:8083}")
  private String resumeServiceUrl;

  @Value("${job.service.url:http://job-service:8082}")
  private String jobServiceUrl;

  /** Simple JSON dump of the profile data user-service itself owns for this account. */
  public Map<String, Object> exportUserData(String userId) {
    User user = userService.getUserById(userId);

    Map<String, Object> profile = new HashMap<>();
    profile.put("id", user.getId());
    profile.put("email", user.getEmail());
    profile.put("name", user.getName());
    profile.put("firstName", user.getFirstName());
    profile.put("lastName", user.getLastName());
    profile.put("phone", user.getPhone());
    profile.put("phoneNumber", user.getPhoneNumber());
    profile.put("avatar", user.getAvatar());
    profile.put("profileImageUrl", user.getProfileImageUrl());
    profile.put("bio", user.getBio());
    profile.put("location", user.getLocation());
    profile.put("website", user.getWebsite());
    profile.put("linkedinUrl", user.getLinkedinUrl());
    profile.put("githubUrl", user.getGithubUrl());
    profile.put("authProvider", user.getAuthProvider());
    profile.put("role", user.getRole());
    profile.put("isEmailVerified", user.getIsEmailVerified());
    profile.put("settings", user.getSettings());
    profile.put("createdAt", user.getCreatedAt());
    profile.put("updatedAt", user.getUpdatedAt());
    profile.put("lastLoginAt", user.getLastLoginAt());

    Map<String, Object> export = new HashMap<>();
    export.put("exportedAt", LocalDateTime.now());
    export.put("source", "user-service");
    export.put("profile", profile);
    export.put("candidateProfile", candidateProfileService.view(user.getId()));
    return export;
  }

  /**
   * Deletes the caller's own account. Best-effort cleans up resumes (resume-service) and saved jobs
   * (job-service) via their existing REST endpoints, and removes the Firebase auth record, before
   * deleting the user-service row itself. Any downstream failure is logged and returned as a
   * warning, but never blocks the primary deletion.
   */
  @Transactional
  public Map<String, Object> deleteOwnAccount(String userId) {
    User user = userService.getUserById(userId);

    List<String> warnings = new ArrayList<>();
    int resumesDeleted = deleteResumesBestEffort(userId, warnings);
    int savedJobsDeleted = deleteSavedJobsBestEffort(userId, warnings);
    boolean firebaseDeleted = deleteFirebaseUserBestEffort(user, warnings);

    candidateProfileService.deleteAll(user.getId());
    userService.deleteUser(userId);

    AuditLog entry =
        AuditLog.builder()
            .userId(userId)
            .action("selfDeleteAccount")
            .details(
                String.format(
                    "Self-service account deletion. resumesDeleted=%d, savedJobsDeleted=%d,"
                        + " firebaseAccountDeleted=%b, warnings=%s",
                    resumesDeleted, savedJobsDeleted, firebaseDeleted, warnings))
            .timestamp(LocalDateTime.now())
            .build();
    auditLogRepository.save(entry);

    Map<String, Object> result = new HashMap<>();
    result.put("deleted", true);
    result.put("resumesDeleted", resumesDeleted);
    result.put("savedJobsDeleted", savedJobsDeleted);
    result.put("firebaseAccountDeleted", firebaseDeleted);
    result.put("warnings", warnings);
    return result;
  }

  @SuppressWarnings("unchecked")
  private int deleteResumesBestEffort(String userId, List<String> warnings) {
    try {
      String listUrl = resumeServiceUrl + "/api/resumes/user/" + userId;
      List<Map<String, Object>> resumes = restTemplate.getForObject(listUrl, List.class);
      if (resumes == null || resumes.isEmpty()) {
        return 0;
      }

      int deleted = 0;
      for (Map<String, Object> resume : resumes) {
        Object resumeId = resume.get("id");
        if (resumeId == null) {
          continue;
        }
        try {
          restTemplate.delete(resumeServiceUrl + "/api/resumes/" + resumeId);
          deleted++;
        } catch (Exception e) {
          log.warn(
              "Failed to delete resume {} for user {} during account deletion: {}",
              resumeId,
              userId,
              e.getMessage());
          warnings.add("Could not delete resume " + resumeId);
        }
      }
      return deleted;
    } catch (Exception e) {
      log.warn(
          "Failed to reach resume-service to clean up resumes for user {}: {}",
          userId,
          e.getMessage());
      warnings.add("Could not reach resume-service to clean up resumes");
      return 0;
    }
  }

  @SuppressWarnings("unchecked")
  private int deleteSavedJobsBestEffort(String userId, List<String> warnings) {
    try {
      String listUrl = jobServiceUrl + "/api/jobs/saved?userId=" + userId;
      List<Map<String, Object>> savedJobs = restTemplate.getForObject(listUrl, List.class);
      if (savedJobs == null || savedJobs.isEmpty()) {
        return 0;
      }

      int deleted = 0;
      for (Map<String, Object> savedJob : savedJobs) {
        Object jobId = savedJob.get("jobId");
        if (jobId == null) {
          continue;
        }
        try {
          restTemplate.delete(
              jobServiceUrl + "/api/jobs/saved?userId=" + userId + "&jobId=" + jobId);
          deleted++;
        } catch (Exception e) {
          log.warn(
              "Failed to unsave job {} for user {} during account deletion: {}",
              jobId,
              userId,
              e.getMessage());
          warnings.add("Could not remove saved job " + jobId);
        }
      }
      return deleted;
    } catch (Exception e) {
      log.warn(
          "Failed to reach job-service to clean up saved jobs for user {}: {}",
          userId,
          e.getMessage());
      warnings.add("Could not reach job-service to clean up saved jobs");
      return 0;
    }
  }

  private boolean deleteFirebaseUserBestEffort(User user, List<String> warnings) {
    if (user.getFirebaseUid() == null || user.getFirebaseUid().isBlank()) {
      return false;
    }
    try {
      return firebaseAuthService.deleteFirebaseUser(user.getFirebaseUid());
    } catch (Exception e) {
      log.warn(
          "Failed to delete Firebase auth account for user {}: {}", user.getId(), e.getMessage());
      warnings.add("Could not delete Firebase authentication account");
      return false;
    }
  }
}
