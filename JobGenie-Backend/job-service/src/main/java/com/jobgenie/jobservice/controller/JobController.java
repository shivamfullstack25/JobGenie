package com.jobgenie.jobservice.controller;

import java.util.List;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import com.jobgenie.jobservice.repository.SavedJobRepository;
import com.jobgenie.jobservice.service.JobService;
import com.jobgenie.shared.dto.JobApplicationDto;
import com.jobgenie.shared.dto.JobDto;
import com.jobgenie.shared.dto.JobMatchDto;
import com.jobgenie.shared.entities.SavedJob;

import com.jobgenie.shared.security.CurrentUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api/jobs")
@Tag(name = "Job Management", description = "Job search, matching, and application endpoints")
@CrossOrigin(origins = "*")
public class JobController {

  @Autowired private JobService jobService;
  @Autowired private SavedJobRepository savedJobRepository;
  @Autowired private RestTemplate restTemplate;

  // Was defaulting to "http://localhost:8081", which doesn't resolve inside the job-service
  // container — isAdmin() and audit logging silently failed on every call in Docker.
  @Value("${user.service.url:http://user-service:8081}")
  private String userServiceUrl;

  private boolean isAdmin(String userId) {
    // Call user-service to get user and check role
    String url = userServiceUrl + "/api/users/" + userId;
    try {
      Map user = restTemplate.getForObject(url, Map.class);
      return "admin".equals(user.get("role"));
    } catch (Exception e) {
      return false;
    }
  }

  // Server-side enforcement to back the frontend's email-verification gate — the frontend
  // check alone can be bypassed by calling this API directly.
  private boolean isEmailVerified(String userId) {
    String url = userServiceUrl + "/api/users/" + userId;
    try {
      Map user = restTemplate.getForObject(url, Map.class);
      return Boolean.TRUE.equals(user.get("isEmailVerified"));
    } catch (Exception e) {
      log.warn("Could not verify email status for userId={}: {}", userId, e.getMessage());
      return false;
    }
  }

  private void persistAdminAuditLog(String userId, String action, String details) {
    try {
      String url = userServiceUrl + "/api/users/audit-log";

      // Create AuditLog object with proper structure
      Map<String, Object> auditLogPayload =
          Map.of(
              "userId", userId,
              "action", action,
              "details", details,
              "timestamp", java.time.LocalDateTime.now().toString());

      restTemplate.postForEntity(url, auditLogPayload, Void.class);
      log.info("Successfully persisted admin audit log: userId={}, action={}", userId, action);
    } catch (Exception e) {
      // Fallback to console log if DB fails
      log.error("Failed to persist audit log, falling back to console: {}", e.getMessage());
      System.out.println(
          "[AUDIT][FALLBACK] " + action + ", by userId=" + userId + ", details=" + details);
    }
  }

  private void requireAdmin(String userId, String action) {
    if (!isAdmin(userId)) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin access required");
    }
    persistAdminAuditLog(userId, action, "Admin action: " + action);
  }

  @GetMapping("/search")
  @Operation(
      summary = "Search for jobs",
      description = "Search for jobs based on criteria like location, skills, and keywords")
  public ResponseEntity<List<JobDto>> searchJobs(
      @Parameter(description = "Job keywords or title") @RequestParam(required = false)
          String keywords,
      @Parameter(description = "Job location") @RequestParam(required = false) String location,
      @Parameter(description = "Page number") @RequestParam(defaultValue = "1") int page,
      @Parameter(description = "Page size") @RequestParam(defaultValue = "10") int size) {
    log.info(
        "Searching jobs with keywords={}, location={}, page={}, size={}",
        keywords,
        location,
        page,
        size);
    List<JobDto> jobs = jobService.searchJobs(keywords, location, page, size);
    log.info(
        "Successfully searched jobs with keywords={}, location={}, page={}, size={}",
        keywords,
        location,
        page,
        size);
    return ResponseEntity.ok(jobs);
  }

  @GetMapping("/matches")
  @Operation(
      summary = "Get AI job matches for user",
      description = "Retrieve AI-powered job matches based on user resume skills")
  public ResponseEntity<Map<String, Object>> getJobMatchesByQuery(
      @Parameter(description = "User ID") @RequestParam String userId,
      @Parameter(description = "Resume ID") @RequestParam(required = false) String resumeId) {
    log.info("Fetching job matches for userId={}, resumeId={}", userId, resumeId);
    try {
      Map<String, Object> response = jobService.getJobMatchesResponse(userId, resumeId);
      return ResponseEntity.ok(response);
    } catch (Exception e) {
      log.error("Error fetching job matches for userId={}: {}", userId, e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("error", e.getMessage(), "matches", List.of()));
    }
  }

  @GetMapping("/user/{userId}/matches")
  @Operation(summary = "Get job matches for user", description = "Retrieve job matches for a user")
  public ResponseEntity<List<JobMatchDto>> getJobMatches(@PathVariable Long userId) {
    log.info("Fetching job matches for userId={}", userId);
    try {
      List<JobMatchDto> matches = jobService.getJobMatches(userId.toString(), null);
      log.info("Successfully fetched job matches for userId={}", userId);
      return ResponseEntity.ok(matches);
    } catch (Exception e) {
      log.error("Error fetching job matches for userId={}: {}", userId, e.getMessage(), e);
      return ResponseEntity.status(500).build();
    }
  }

  @PostMapping("/apply")
  @Operation(
      summary = "Log a job application",
      description =
          "Record that the user applied to a job. JobGenie is a metasearch/click-out product"
              + " (see CLAUDE.md) — the user applies on the destination site themselves; this"
              + " just tracks it in their history. No AI or browser automation involved.")
  public ResponseEntity<JobApplicationDto> applyToJob(
      @Parameter(description = "Job ID") @RequestParam String jobId,
      @Parameter(description = "User ID") @RequestParam String userId,
      @Parameter(description = "Resume ID used, if any") @RequestParam(required = false)
          String resumeId,
      @Parameter(description = "Cover letter ID, if any") @RequestParam(required = false)
          String coverLetterId,
      @Parameter(description = "Platform the user applied through, if known")
          @RequestParam(required = false)
          String platform) {
    log.info(
        "Applying to job with jobId={}, userId={}, resumeId={}, coverLetterId={}",
        jobId,
        userId,
        resumeId,
        coverLetterId);
    if (!isEmailVerified(userId)) {
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Please verify your email to use this feature");
    }
    JobApplicationDto application =
        jobService.applyToJob(jobId, userId, resumeId, coverLetterId, platform);
    log.info(
        "Successfully applied to job with jobId={}, userId={}, resumeId={}, coverLetterId={}",
        jobId,
        userId,
        resumeId,
        coverLetterId);
    return ResponseEntity.ok(application);
  }

  @GetMapping("/applications")
  @Operation(summary = "Get user applications", description = "Get all job applications for a user")
  public ResponseEntity<List<JobApplicationDto>> getUserApplications(
      @Parameter(description = "User ID") @RequestParam String userId,
      @Parameter(description = "Page number") @RequestParam(defaultValue = "1") int page,
      @Parameter(description = "Page size") @RequestParam(defaultValue = "10") int size) {
    log.info("Getting applications for userId={}, page={}, size={}", userId, page, size);
    List<JobApplicationDto> applications = jobService.getUserApplications(userId, page, size);
    log.info("Successfully got applications for userId={}, page={}, size={}", userId, page, size);
    return ResponseEntity.ok(applications);
  }

  @PatchMapping("/applications/{applicationId}/status")
  @Operation(
      summary = "Update application status",
      description =
          "Move a logged application through the tracker: APPLIED, INTERVIEWING, OFFER,"
              + " REJECTED, or WITHDRAWN.")
  public ResponseEntity<JobApplicationDto> updateApplicationStatus(
      @PathVariable Long applicationId,
      @Parameter(description = "User ID") @RequestParam String userId,
      @Parameter(description = "New status") @RequestParam String status) {
    log.info(
        "Updating application status: applicationId={}, userId={}, status={}",
        applicationId,
        userId,
        status);
    JobApplicationDto updated = jobService.updateApplicationStatus(applicationId, userId, status);
    return ResponseEntity.ok(updated);
  }

  @PostMapping("/saved")
  @Operation(summary = "Save a job", description = "Bookmark a job for later")
  public ResponseEntity<Map<String, Object>> saveJob(
      @RequestBody Map<String, Object> payload, HttpServletRequest request) {
    // userId arrives in the JSON body here, where the auth filter can't see it.
    if (!CurrentUser.canActFor(request, payload.get("userId"))) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN)
          .body(Map.of("error", "You can only save jobs to your own account"));
    }
    try {
      Long userId = Long.parseLong(String.valueOf(payload.get("userId")));
      String jobId = String.valueOf(payload.get("jobId"));
      if (savedJobRepository.existsByUserIdAndJobId(userId, jobId)) {
        return ResponseEntity.ok(Map.of("status", "exists", "message", "Job already saved"));
      }
      SavedJob saved =
          savedJobRepository.save(
              SavedJob.builder()
                  .userId(userId)
                  .jobId(jobId)
                  .title(payload.get("title") != null ? payload.get("title").toString() : null)
                  .company(
                      payload.get("company") != null ? payload.get("company").toString() : null)
                  .location(
                      payload.get("location") != null ? payload.get("location").toString() : null)
                  .platform(
                      payload.get("platform") != null ? payload.get("platform").toString() : null)
                  .url(payload.get("url") != null ? payload.get("url").toString() : null)
                  .matchScore(
                      payload.get("matchScore") instanceof Number
                          ? ((Number) payload.get("matchScore")).intValue()
                          : null)
                  .build());
      return ResponseEntity.ok(
          Map.of("status", "success", "id", saved.getId(), "jobId", saved.getJobId()));
    } catch (Exception e) {
      log.error("Error saving job: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
    }
  }

  @GetMapping("/saved")
  @Operation(summary = "List saved jobs", description = "Get all saved/bookmarked jobs for a user")
  public ResponseEntity<?> getSavedJobs(@RequestParam String userId) {
    try {
      Long userIdLong = Long.parseLong(userId);
      return ResponseEntity.ok(savedJobRepository.findByUserIdOrderBySavedAtDesc(userIdLong));
    } catch (Exception e) {
      log.error("Error listing saved jobs: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
    }
  }

  @DeleteMapping("/saved")
  @Operation(summary = "Unsave a job", description = "Remove a bookmarked job")
  public ResponseEntity<Map<String, Object>> unsaveJob(
      @RequestParam String userId, @RequestParam String jobId) {
    try {
      Long userIdLong = Long.parseLong(userId);
      savedJobRepository.deleteByUserIdAndJobId(userIdLong, jobId);
      return ResponseEntity.ok(Map.of("status", "success"));
    } catch (Exception e) {
      log.error("Error unsaving job: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
    }
  }

  @PostMapping("/automation/start")
  @Operation(
      summary = "Start job automation",
      description = "Start automated job search and application process")
  public ResponseEntity<Map<String, Object>> startAutomation(
      @RequestBody Map<String, Object> config, HttpServletRequest request) {
    log.info("Starting job automation");
    if (!CurrentUser.canActFor(request, config.get("userId"))) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN)
          .body(Map.of("error", "You can only manage your own automation"));
    }
    try {
      // Extract config parameters
      String userId = (String) config.get("userId");

      if (userId != null && !isEmailVerified(userId)) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(Map.of("error", "Please verify your email to use this feature"));
      }

      // Start automation using the job service
      Map<String, Object> result = jobService.startAutomation(userId, config);

      return ResponseEntity.ok(result);
    } catch (Exception e) {
      log.error("Error starting automation: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
    }
  }

  @GetMapping("/automation/status")
  @Operation(
      summary = "Get automation status",
      description = "Get current status of job automation for a user")
  public ResponseEntity<Map<String, Object>> getAutomationStatus(@RequestParam String userId) {
    log.info("Getting automation status for user: {}", userId);
    try {
      Map<String, Object> status = jobService.getAutomationStatus(userId);
      return ResponseEntity.ok(status);
    } catch (Exception e) {
      log.error("Error getting automation status: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
    }
  }

  @GetMapping("/matches/count")
  @Operation(summary = "Get job matches count", description = "Get the total number of job matches")
  public ResponseEntity<Map<String, Object>> getJobMatchesCount() {
    log.info("Getting total job matches count");
    try {
      long count = jobService.getJobMatchesCount();
      return ResponseEntity.ok(Map.of("count", count));
    } catch (Exception e) {
      log.error("Error getting job matches count: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("count", 0, "error", e.getMessage()));
    }
  }

  @GetMapping("/applications/count")
  @Operation(
      summary = "Get job applications count",
      description = "Get the total number of job applications")
  public ResponseEntity<Map<String, Object>> getJobApplicationsCount() {
    log.info("Getting total job applications count");
    try {
      long count = jobService.getJobApplicationsCount();
      return ResponseEntity.ok(Map.of("count", count));
    } catch (Exception e) {
      log.error("Error getting job applications count: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("count", 0, "error", e.getMessage()));
    }
  }
}
