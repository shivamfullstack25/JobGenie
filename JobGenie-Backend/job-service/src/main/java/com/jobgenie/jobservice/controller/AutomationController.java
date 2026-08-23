package com.jobgenie.jobservice.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping("/api/automation")
@Tag(name = "Job Automation", description = "Advanced job automation and scheduling endpoints")
@CrossOrigin(origins = "*")
@Slf4j
@RequiredArgsConstructor
public class AutomationController {

  @Value("${ai.service.url:http://ai-service:8000}")
  private String aiServiceUrl;

  private final RestTemplate restTemplate;

  @PostMapping("/schedule-advanced")
  @Operation(
      summary = "Create advanced automation schedule",
      description = "Set up automated job search and application schedule")
  public ResponseEntity<Map<String, Object>> createAdvancedSchedule(
      @RequestBody Map<String, Object> scheduleRequest) {
    try {
      log.info("Creating advanced automation schedule for user: {}", scheduleRequest.get("userId"));

      // Transform frontend request to AI service format
      Map<String, Object> aiRequest = transformToAIScheduleRequest(scheduleRequest);

      // Call AI service scheduling endpoint
      String endpoint = "/api/schedule/job-search";
      if (Boolean.TRUE.equals(scheduleRequest.get("autoApplyEnabled"))) {
        endpoint = "/api/schedule/auto-apply";
      }

      Map<String, Object> response =
          restTemplate.postForObject(aiServiceUrl + endpoint, aiRequest, Map.class);

      return ResponseEntity.ok(response != null ? response : Map.of("success", true));

    } catch (Exception e) {
      log.error("Error creating advanced schedule: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("success", false, "error", e.getMessage()));
    }
  }

  @PostMapping("/run-advanced/{scheduleId}")
  @Operation(
      summary = "Run advanced automation",
      description = "Execute automated job search and application process")
  public ResponseEntity<Map<String, Object>> runAdvancedAutomation(
      @PathVariable String scheduleId) {
    try {
      log.info("Running advanced automation for schedule: {}", scheduleId);

      // For immediate execution, call the batch auto-apply endpoint
      Map<String, Object> batchRequest =
          Map.of(
              "max_applications",
              10,
              "delay_between_applications",
              60,
              "user_credentials",
              Map.of(),
              "resume_path",
              "");

      Map<String, Object> response =
          restTemplate.postForObject(
              aiServiceUrl + "/api/auto-apply/batch", batchRequest, Map.class);

      // Transform response to expected format
      Map<String, Object> result = new HashMap<>();
      if (response != null) {
        result.put("jobsFound", response.getOrDefault("total_jobs", 0));
        result.put("applicationsSubmitted", response.getOrDefault("successful_applications", 0));
        result.put("success", true);
      } else {
        result.put("jobsFound", 0);
        result.put("applicationsSubmitted", 0);
        result.put("success", false);
      }

      return ResponseEntity.ok(result);

    } catch (Exception e) {
      log.error("Error running advanced automation: {}", e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(
              Map.of(
                  "success",
                  false,
                  "error",
                  e.getMessage(),
                  "jobsFound",
                  0,
                  "applicationsSubmitted",
                  0));
    }
  }

  @GetMapping("/schedules")
  @Operation(
      summary = "Get automation schedules",
      description = "Retrieve all automation schedules for user")
  public ResponseEntity<List<Map<String, Object>>> getAutomationSchedules(
      @RequestParam(required = false) String userId) {
    try {
      log.info("Getting automation schedules for user: {}", userId);

      // Call AI service to get schedules
      String url = aiServiceUrl + "/api/schedule/user/" + (userId != null ? userId : "default");
      Map<String, Object> response = restTemplate.getForObject(url, Map.class);

      @SuppressWarnings("unchecked")
      List<Map<String, Object>> schedules =
          (List<Map<String, Object>>)
              (response != null ? response.getOrDefault("schedules", List.of()) : List.of());

      return ResponseEntity.ok(schedules);

    } catch (Exception e) {
      log.error("Error getting schedules: {}", e.getMessage(), e);
      return ResponseEntity.ok(List.of());
    }
  }

  @PatchMapping("/schedules/{scheduleId}")
  @Operation(
      summary = "Toggle schedule status",
      description = "Enable or disable an automation schedule")
  public ResponseEntity<Map<String, Object>> toggleSchedule(
      @PathVariable String scheduleId, @RequestBody Map<String, Object> request) {
    try {
      log.info("Toggling schedule {} to: {}", scheduleId, request.get("isActive"));

      boolean isActive = Boolean.TRUE.equals(request.get("isActive"));
      String endpoint = isActive ? "/resume" : "/pause";

      Map<String, Object> response =
          restTemplate.postForObject(
              aiServiceUrl + "/api/schedule/" + scheduleId + endpoint, Map.of(), Map.class);

      return ResponseEntity.ok(response != null ? response : Map.of("success", true));

    } catch (Exception e) {
      log.error("Error toggling schedule: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("success", false, "error", e.getMessage()));
    }
  }

  @PostMapping("/run/{scheduleId}")
  @Operation(
      summary = "Run automation schedule",
      description = "Execute a specific automation schedule immediately")
  public ResponseEntity<Map<String, Object>> runAutomationSchedule(
      @PathVariable String scheduleId) {
    try {
      log.info("Running automation schedule: {}", scheduleId);

      // For backward compatibility, use the advanced automation endpoint
      return runAdvancedAutomation(scheduleId);

    } catch (Exception e) {
      log.error("Error running schedule: {}", e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(
              Map.of(
                  "success",
                  false,
                  "error",
                  e.getMessage(),
                  "jobsFound",
                  0,
                  "applicationsSubmitted",
                  0));
    }
  }

  @GetMapping("/status")
  @Operation(
      summary = "Get automation status",
      description = "Get current automation status and statistics")
  public ResponseEntity<Map<String, Object>> getAutomationStatus(
      @RequestParam(required = false) String userId) {
    try {
      log.info("Getting automation status for user: {}", userId);

      // Call AI service for schedule statistics
      String url = aiServiceUrl + "/api/schedule/stats";
      if (userId != null) {
        url += "?user_id=" + userId;
      }

      Map<String, Object> response = restTemplate.getForObject(url, Map.class);

      // Transform to expected format
      Map<String, Object> status = new HashMap<>();
      if (response != null) {
        status.put("isRunning", response.getOrDefault("active_schedules", 0));
        status.put("totalSchedules", response.getOrDefault("total_schedules", 0));
        status.put("totalRuns", response.getOrDefault("total_runs", 0));
        status.put("successfulRuns", response.getOrDefault("successful_runs", 0));
        status.put("lastRunTime", null);
        status.put("nextRunTime", null);
      } else {
        status.put("isRunning", false);
        status.put("totalSchedules", 0);
        status.put("totalRuns", 0);
        status.put("successfulRuns", 0);
      }

      return ResponseEntity.ok(status);

    } catch (Exception e) {
      log.error("Error getting automation status: {}", e.getMessage(), e);
      return ResponseEntity.ok(
          Map.of(
              "isRunning", false,
              "totalSchedules", 0,
              "totalRuns", 0,
              "successfulRuns", 0));
    }
  }

  @PostMapping("/schedule")
  @Operation(
      summary = "Create automation schedule",
      description = "Create a basic automation schedule")
  public ResponseEntity<Map<String, Object>> createSchedule(
      @RequestBody Map<String, Object> scheduleRequest) {
    try {
      log.info("Creating automation schedule for user: {}", scheduleRequest.get("userId"));

      // Transform to advanced schedule format
      Map<String, Object> advancedRequest = new HashMap<>(scheduleRequest);
      advancedRequest.put("autoApplyEnabled", false); // Basic schedule without auto-apply

      return createAdvancedSchedule(advancedRequest);

    } catch (Exception e) {
      log.error("Error creating schedule: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("success", false, "error", e.getMessage()));
    }
  }

  @PostMapping("/browser-automation")
  @Operation(
      summary = "Run browser automation",
      description = "Execute browser-based job application automation")
  public ResponseEntity<Map<String, Object>> runBrowserAutomation(
      @RequestBody Map<String, Object> automationRequest) {
    try {
      // Never log the raw request — it carries plaintext job-site credentials.
      log.info("Running browser automation for platforms: {}", automationRequest.get("platforms"));

      // Extract platforms and credentials
      @SuppressWarnings("unchecked")
      List<String> platforms =
          (List<String>) automationRequest.getOrDefault("platforms", List.of());

      Map<String, Object> response = new HashMap<>();
      int totalApplications = 0;
      int successfulApplications = 0;

      // Process each platform
      for (String platform : platforms) {
        try {
          Map<String, Object> platformRequest =
              Map.of(
                  "job_url",
                  "https://" + platform + ".com/jobs",
                  "platform",
                  platform,
                  "user_credentials",
                  automationRequest.getOrDefault("credentials", Map.of()),
                  "resume_path",
                  automationRequest.getOrDefault("resumePath", ""),
                  "cover_letter",
                  "");

          Map<String, Object> platformResponse =
              restTemplate.postForObject(
                  aiServiceUrl + "/api/auto-apply/" + platform, platformRequest, Map.class);

          if (platformResponse != null && Boolean.TRUE.equals(platformResponse.get("success"))) {
            successfulApplications++;
          }
          totalApplications++;

        } catch (Exception e) {
          log.error("Error with platform {}: {}", platform, e.getMessage());
          totalApplications++;
        }
      }

      response.put("totalApplications", totalApplications);
      response.put("successfulApplications", successfulApplications);
      response.put("success", true);
      response.put("results", List.of());

      return ResponseEntity.ok(response);

    } catch (Exception e) {
      log.error("Error running browser automation: {}", e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(
              Map.of(
                  "success",
                  false,
                  "error",
                  e.getMessage(),
                  "totalApplications",
                  0,
                  "successfulApplications",
                  0));
    }
  }

  private Map<String, Object> transformToAIScheduleRequest(Map<String, Object> frontendRequest) {
    Map<String, Object> aiRequest = new HashMap<>();

    // Map frontend fields to AI service fields
    aiRequest.put("user_id", frontendRequest.get("userId"));
    aiRequest.put("frequency", frontendRequest.getOrDefault("frequency", "daily"));
    aiRequest.put("search_time", "09:00");

    // Extract job preferences
    @SuppressWarnings("unchecked")
    Map<String, Object> jobPreferences =
        (Map<String, Object>) frontendRequest.get("jobPreferences");
    if (jobPreferences != null) {
      @SuppressWarnings("unchecked")
      List<String> keywords = (List<String>) jobPreferences.get("keywords");
      @SuppressWarnings("unchecked")
      List<String> locations = (List<String>) jobPreferences.get("locations");

      aiRequest.put("keywords", keywords != null ? keywords : List.of());
      aiRequest.put("location", locations != null && !locations.isEmpty() ? locations.get(0) : "");
    }

    @SuppressWarnings("unchecked")
    List<String> platforms = (List<String>) frontendRequest.get("platforms");
    aiRequest.put("platforms", platforms != null ? platforms : List.of("linkedin", "indeed"));

    aiRequest.put("max_jobs_per_search", frontendRequest.getOrDefault("maxJobsPerSearch", 50));

    // Add filters
    Map<String, Object> filters = new HashMap<>();
    if (jobPreferences != null) {
      filters.put("min_salary", jobPreferences.get("salaryMin"));
      filters.put("max_salary", jobPreferences.get("salaryMax"));
      filters.put("remote_only", "remote".equals(jobPreferences.get("remotePreference")));
      filters.put("experience_level", jobPreferences.get("experienceLevel"));
    }
    aiRequest.put("filters", filters);

    return aiRequest;
  }
}
