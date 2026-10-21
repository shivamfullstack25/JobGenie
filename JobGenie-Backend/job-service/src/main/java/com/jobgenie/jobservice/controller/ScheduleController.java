package com.jobgenie.jobservice.controller;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import com.jobgenie.shared.security.AuthPrincipal;
import com.jobgenie.shared.security.CurrentUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping("/api/schedules")
@Tag(name = "Schedule Management", description = "Job search and application scheduling endpoints")
@CrossOrigin(origins = "*")
@Slf4j
@RequiredArgsConstructor
public class ScheduleController {

  @Value("${ai.service.url:http://ai-service:8000}")
  private String aiServiceUrl;

  private final RestTemplate restTemplate;

  /**
   * Schedules are held by the AI service and addressed by an id of the form
   * {@code schedule_<userId>_<timestamp>}. That embedded user id is the only ownership record
   * there is, so it is what gets checked: without it any caller could pause, run or delete
   * anyone's schedule by guessing the id.
   */
  private static boolean ownsSchedule(HttpServletRequest request, String scheduleId) {
    AuthPrincipal caller = CurrentUser.of(request);
    if (caller.isPrivileged()) {
      return true;
    }
    return scheduleId != null
        && !caller.getUserId().isEmpty()
        && scheduleId.startsWith("schedule_" + caller.getUserId() + "_");
  }

  private static ResponseEntity<Map<String, Object>> forbidden() {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(Map.of("success", false, "error", "You can only manage your own schedules"));
  }

  @GetMapping
  @Operation(summary = "Get all schedules", description = "Retrieve all automation schedules")
  @SuppressWarnings("unchecked")
  public ResponseEntity<List<Map<String, Object>>> getAllSchedules(
      @RequestParam(required = false) String userId) {
    try {
      log.info("Getting all schedules for user: {}", userId);

      // Call AI service to get schedules
      String url = aiServiceUrl + "/api/schedule/user/" + (userId != null ? userId : "default");
      Map<String, Object> response = restTemplate.getForObject(url, Map.class);

      List<Map<String, Object>> schedules =
          (List<Map<String, Object>>)
              (response != null ? response.getOrDefault("schedules", List.of()) : List.of());

      // Transform schedules to expected frontend format
      schedules.forEach(this::transformScheduleToFrontendFormat);

      return ResponseEntity.ok(schedules);

    } catch (Exception e) {
      log.error("Error getting schedules: {}", e.getMessage(), e);
      return ResponseEntity.ok(List.of());
    }
  }

  @PostMapping
  @Operation(summary = "Create schedule", description = "Create a new automation schedule")
  @SuppressWarnings("unchecked")
  public ResponseEntity<Map<String, Object>> createSchedule(
      @RequestBody Map<String, Object> scheduleRequest, HttpServletRequest httpRequest) {
    if (!CurrentUser.canActFor(httpRequest, scheduleRequest.get("userId"))) {
      return forbidden();
    }
    try {
      // Never log the raw request — it can carry plaintext job-site credentials.
      log.info("Creating schedule for user: {}", scheduleRequest.get("userId"));

      // Transform frontend request to AI service format
      Map<String, Object> aiRequest = transformToAIScheduleRequest(scheduleRequest);

      // Search-only: the auto-apply schedule variant was removed (see CLAUDE.md
      // "Product decisions (locked)" — JobGenie doesn't apply on the user's behalf).
      Map<String, Object> response =
          restTemplate.postForObject(
              aiServiceUrl + "/api/schedule/job-search", aiRequest, Map.class);

      // Transform response to frontend format
      Map<String, Object> result = new HashMap<>();
      if (response != null) {
        result.put("id", response.getOrDefault("schedule_id", UUID.randomUUID().toString()));
        result.put("status", response.getOrDefault("status", "created"));
        result.put("nextRun", response.get("next_run"));
        result.put(
            "frequency", response.getOrDefault("frequency", scheduleRequest.get("frequency")));
        result.put("success", true);
      } else {
        result.put("success", false);
        result.put("error", "Failed to create schedule");
      }

      return ResponseEntity.ok(result);

    } catch (Exception e) {
      log.error("Error creating schedule: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("success", false, "error", e.getMessage()));
    }
  }

  @PostMapping("/{scheduleId}/toggle")
  @Operation(summary = "Toggle schedule", description = "Enable or disable a schedule")
  @SuppressWarnings("unchecked")
  public ResponseEntity<Map<String, Object>> toggleSchedule(@PathVariable String scheduleId, HttpServletRequest httpRequest) {
    if (!ownsSchedule(httpRequest, scheduleId)) {
      return forbidden();
    }
    try {
      log.info("Toggling schedule: {}", scheduleId);

      // For simplicity, we'll assume we're pausing the schedule
      // In a real implementation, you'd check current status first
      Map<String, Object> response =
          restTemplate.postForObject(
              aiServiceUrl + "/api/schedule/" + scheduleId + "/pause", Map.of(), Map.class);

      return ResponseEntity.ok(response != null ? response : Map.of("success", true));

    } catch (Exception e) {
      log.error("Error toggling schedule: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("success", false, "error", e.getMessage()));
    }
  }

  @DeleteMapping("/{scheduleId}")
  @Operation(summary = "Delete schedule", description = "Delete an automation schedule")
  public ResponseEntity<Map<String, Object>> deleteSchedule(@PathVariable String scheduleId, HttpServletRequest httpRequest) {
    if (!ownsSchedule(httpRequest, scheduleId)) {
      return forbidden();
    }
    try {
      log.info("Deleting schedule: {}", scheduleId);

      restTemplate.delete(aiServiceUrl + "/api/schedule/" + scheduleId);

      return ResponseEntity.ok(Map.of("success", true));

    } catch (Exception e) {
      log.error("Error deleting schedule: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("success", false, "error", e.getMessage()));
    }
  }

  @GetMapping("/{scheduleId}")
  @Operation(summary = "Get schedule", description = "Get details of a specific schedule")
  @SuppressWarnings("unchecked")
  public ResponseEntity<Map<String, Object>> getSchedule(
      @PathVariable String scheduleId, HttpServletRequest httpRequest) {
    if (!ownsSchedule(httpRequest, scheduleId)) {
      return forbidden();
    }
    // Schedule ids are schedule_<userId>_<timestamp>; the AI service lists schedules per user.
    // (This used to call an AI endpoint that never existed and, on the inevitable failure,
    // returned an invented "daily / linkedin, indeed" schedule.)
    String[] parts = scheduleId.split("_");
    if (parts.length < 3) {
      return ResponseEntity.status(404).body(Map.of("error", "Schedule not found"));
    }
    try {
      Map<String, Object> response =
          restTemplate.getForObject(aiServiceUrl + "/api/schedule/user/" + parts[1], Map.class);
      List<Map<String, Object>> schedules =
          (List<Map<String, Object>>)
              (response != null ? response.getOrDefault("schedules", List.of()) : List.of());
      for (Map<String, Object> schedule : schedules) {
        if (scheduleId.equals(schedule.get("schedule_id"))) {
          Map<String, Object> result = new HashMap<>(schedule);
          transformScheduleToFrontendFormat(result);
          return ResponseEntity.ok(result);
        }
      }
      return ResponseEntity.status(404).body(Map.of("error", "Schedule not found"));
    } catch (Exception e) {
      log.error("Error getting schedule {}: {}", scheduleId, e.getMessage());
      return ResponseEntity.status(502).body(Map.of("error", "Schedules are unavailable right now"));
    }
  }

  @PostMapping("/{scheduleId}/run")
  @Operation(summary = "Run schedule", description = "Execute a job-search schedule immediately")
  public ResponseEntity<Map<String, Object>> runSchedule(@PathVariable String scheduleId, HttpServletRequest httpRequest) {
    if (!ownsSchedule(httpRequest, scheduleId)) {
      return forbidden();
    }
    try {
      log.info("Running job-search schedule now: {}", scheduleId);

      Map<String, Object> response =
          restTemplate.postForObject(
              aiServiceUrl + "/api/schedule/" + scheduleId + "/run", Map.of(), Map.class);

      Map<String, Object> result = new HashMap<>();
      if (response != null) {
        result.put("jobsFound", response.getOrDefault("jobs_found", 0));
        result.put("success", true);
      } else {
        result.put("jobsFound", 0);
        result.put("success", false);
      }

      return ResponseEntity.ok(result);

    } catch (Exception e) {
      log.error("Error running job-search schedule: {}", e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(Map.of("success", false, "error", e.getMessage(), "jobsFound", 0));
    }
  }

  @GetMapping("/stats")
  @Operation(summary = "Get schedule statistics", description = "Get overall schedule statistics")
  public ResponseEntity<Map<String, Object>> getScheduleStats(
      @RequestParam(required = false) String userId) {
    try {
      log.info("Getting schedule stats for user: {}", userId);

      // Call AI service for statistics
      String url = aiServiceUrl + "/api/schedule/stats";
      if (userId != null) {
        url += "?user_id=" + userId;
      }

      Map<String, Object> response = restTemplate.getForObject(url, Map.class);

      return ResponseEntity.ok(
          response != null
              ? response
              : Map.of(
                  "total_schedules", 0,
                  "active_schedules", 0,
                  "total_runs", 0,
                  "successful_runs", 0));

    } catch (Exception e) {
      log.error("Error getting schedule stats: {}", e.getMessage(), e);
      return ResponseEntity.ok(
          Map.of(
              "total_schedules", 0,
              "active_schedules", 0,
              "total_runs", 0,
              "successful_runs", 0));
    }
  }

  private void transformScheduleToFrontendFormat(Map<String, Object> schedule) {
    // Transform AI service schedule format to frontend expected format
    if (!schedule.containsKey("id") && schedule.containsKey("schedule_id")) {
      schedule.put("id", schedule.get("schedule_id"));
    }

    // Add default values if missing
    schedule.putIfAbsent("frequency", "daily");
    schedule.putIfAbsent("status", "active");
    schedule.putIfAbsent("platforms", List.of("linkedin", "indeed"));
    schedule.putIfAbsent(
        "jobPreferences",
        Map.of("keywords", List.of(), "location", "", "salaryMin", 0, "salaryMax", 200000));
  }

  private Map<String, Object> transformToAIScheduleRequest(Map<String, Object> frontendRequest) {
    Map<String, Object> aiRequest = new HashMap<>();

    // Map frontend fields to AI service fields
    aiRequest.put("user_id", frontendRequest.getOrDefault("userId", "default"));
    aiRequest.put("frequency", frontendRequest.getOrDefault("frequency", "daily"));
    aiRequest.put("search_time", "09:00");

    // Extract and transform platform selections
    @SuppressWarnings("unchecked")
    List<String> selectedPlatforms = (List<String>) frontendRequest.get("selectedPlatforms");
    aiRequest.put(
        "platforms", selectedPlatforms != null ? selectedPlatforms : List.of("linkedin", "indeed"));

    // Add default job search parameters
    aiRequest.put("keywords", List.of("software", "developer"));
    aiRequest.put("location", "");
    aiRequest.put("max_jobs_per_search", 50);

    // Add filters
    Map<String, Object> filters = new HashMap<>();
    filters.put("remote_only", false);
    filters.put("experience_level", "mid");
    aiRequest.put("filters", filters);

    return aiRequest;
  }
}
