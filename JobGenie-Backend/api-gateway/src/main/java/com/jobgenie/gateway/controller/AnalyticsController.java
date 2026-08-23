package com.jobgenie.gateway.controller;

import java.time.LocalDateTime;
import java.util.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping("/api/analytics")
@Tag(name = "Analytics", description = "Analytics and reporting endpoints")
@Slf4j
public class AnalyticsController {

  @Autowired private RestTemplate restTemplate;

  private long countFrom(String url) {
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> response = restTemplate.getForObject(url, Map.class);
      return response != null && response.get("count") != null
          ? ((Number) response.get("count")).longValue()
          : 0L;
    } catch (Exception e) {
      log.warn("Analytics: could not reach {}: {}", url, e.getMessage());
      return 0L;
    }
  }

  @GetMapping
  @Operation(
      summary = "Get analytics data",
      description = "Get comprehensive analytics data for the specified time range")
  public ResponseEntity<Map<String, Object>> getAnalytics(
      @RequestParam(defaultValue = "7d") String timeRange) {
    log.info("Fetching analytics data for timeRange: {}", timeRange);

    try {
      Map<String, Object> analyticsData = generateAnalyticsData(timeRange);
      return ResponseEntity.ok(analyticsData);
    } catch (Exception e) {
      log.error("Error fetching analytics data: {}", e.getMessage(), e);
      return ResponseEntity.internalServerError().build();
    }
  }

  @GetMapping("/realtime")
  @Operation(
      summary = "Get real-time metrics",
      description = "Get real-time system metrics and performance data")
  public ResponseEntity<Map<String, Object>> getRealtimeMetrics() {
    try {
      long totalUsers = countFrom("http://user-service:8081/api/users/count");
      Map<String, Object> realtimeData =
          Map.of(
              // No session/presence tracking exists yet, so "active" is an estimate off the
              // real user count rather than a fabricated constant.
              "activeUsers",
              Math.round(totalUsers * 0.2),
              "currentApplications",
              countFrom("http://job-service:8082/api/jobs/applications/count"),
              "aiProcessing",
              0,
              "systemLoad",
              0,
              "isEstimate",
              true,
              "timestamp",
              LocalDateTime.now().toString());
      return ResponseEntity.ok(realtimeData);
    } catch (Exception e) {
      log.error("Error fetching realtime metrics: {}", e.getMessage(), e);
      return ResponseEntity.internalServerError().build();
    }
  }

  @PostMapping("/errors/report")
  public ResponseEntity<Map<String, Object>> reportError(
      @RequestBody Map<String, Object> errorReport) {
    log.error("Frontend error reported: {}", errorReport);

    // In a real implementation, you would:
    // 1. Store error in database
    // 2. Send to error tracking service (Sentry, etc.)
    // 3. Trigger alerts if critical

    return ResponseEntity.ok(
        Map.of(
            "status", "received",
            "errorId", errorReport.get("errorId"),
            "timestamp", LocalDateTime.now().toString()));
  }

  private Map<String, Object> generateAnalyticsData(String timeRange) {
    // "overview" is real, queried live from each service. The trend/prediction sections
    // below need a real events/time-series store that doesn't exist yet — until that's
    // built they're clearly-labeled sample data rather than fabricated numbers presented
    // as live telemetry.
    // NOTE: bare "http://<service>" hostnames without a port previously relied on
    // @LoadBalanced RestTemplate resolving the instance via Eureka, but that resolution
    // wasn't actually happening in this deployment — calls fell through to plain Docker DNS
    // on default port 80 and got "Connection refused" (caught in countFrom(), returning 0
    // for every metric even though real data exists). Using the literal Docker Compose
    // hostname:port (same pattern as AuthController/JobController's fixed service URLs) fixes it.
    long totalUsers = countFrom("http://user-service:8081/api/users/count");
    long totalResumes = countFrom("http://resume-service:8083/api/resumes/count");
    long totalMatches = countFrom("http://job-service:8082/api/jobs/matches/count");
    long totalApplications = countFrom("http://job-service:8082/api/jobs/applications/count");

    Map<String, Object> overview = new HashMap<>();
    overview.put("totalApplications", totalApplications);
    overview.put("activeJobs", totalMatches);
    overview.put("totalUsers", totalUsers);
    overview.put("aiAnalysisCount", totalResumes);
    overview.put(
        "successRate",
        totalApplications > 0
            ? Math.round((totalApplications / (double) Math.max(totalMatches, 1)) * 1000) / 10.0
            : 0.0);

    List<Map<String, Object>> applicationTrends = generateTrendData("applications", timeRange);
    List<Map<String, Object>> jobMatchTrends = generateTrendData("jobMatches", timeRange);
    List<Map<String, Object>> userActivityTrends = generateTrendData("userActivity", timeRange);

    Map<String, Object> trends =
        Map.of(
            "applications", applicationTrends,
            "jobMatches", jobMatchTrends,
            "userActivity", userActivityTrends,
            "isSampleData", true);

    List<Map<String, Object>> topSkills =
        List.of(
            Map.of("skill", "JavaScript", "demand", 85, "growth", 12),
            Map.of("skill", "Python", "demand", 78, "growth", 18),
            Map.of("skill", "React", "demand", 72, "growth", 15),
            Map.of("skill", "Java", "demand", 68, "growth", 8),
            Map.of("skill", "AWS", "demand", 65, "growth", 22));

    List<Map<String, Object>> industryTrends =
        List.of(
            Map.of("industry", "Technology", "jobs", 1247, "avgSalary", 95000),
            Map.of("industry", "Finance", "jobs", 892, "avgSalary", 87000),
            Map.of("industry", "Healthcare", "jobs", 634, "avgSalary", 78000),
            Map.of("industry", "Consulting", "jobs", 456, "avgSalary", 92000));

    List<Map<String, Object>> locationData =
        List.of(
            Map.of("location", "San Francisco", "jobs", 2341, "competition", 8.5),
            Map.of("location", "New York", "jobs", 1987, "competition", 7.2),
            Map.of("location", "Seattle", "jobs", 1456, "competition", 6.8),
            Map.of("location", "Austin", "jobs", 987, "competition", 5.9));

    // Skill/industry/location benchmarks require a labor-market data source (e.g. a
    // licensed jobs API) this deployment doesn't have — sample data until that's wired up.
    Map<String, Object> performance =
        Map.of(
            "topSkills", topSkills,
            "industryTrends", industryTrends,
            "locationData", locationData,
            "isSampleData", true);

    List<Map<String, Object>> marketTrends =
        List.of(
            Map.of("trend", "Remote work increasing", "impact", 15, "confidence", 87),
            Map.of("trend", "AI skills in demand", "impact", 23, "confidence", 92),
            Map.of("trend", "Healthcare sector growth", "impact", 12, "confidence", 78));

    List<Map<String, Object>> recommendedActions =
        List.of(
            Map.of("action", "Focus on AI/ML skill development", "priority", "high", "impact", 85),
            Map.of("action", "Expand remote job targeting", "priority", "medium", "impact", 67),
            Map.of("action", "Improve ATS optimization", "priority", "high", "impact", 78),
            Map.of("action", "Enhance networking features", "priority", "low", "impact", 45));

    // Forecasting requires a trained/historical model this deployment doesn't have yet.
    Map<String, Object> predictions =
        Map.of(
            "nextWeekApplications", totalApplications,
            "marketTrends", marketTrends,
            "recommendedActions", recommendedActions,
            "isSampleData", true);

    Map<String, Object> realtime = new HashMap<>();
    realtime.put("activeUsers", Math.round(totalUsers * 0.2));
    realtime.put("currentApplications", totalApplications);
    realtime.put("aiProcessing", 0);
    realtime.put("systemLoad", 0);
    realtime.put("isEstimate", true);

    return Map.of(
        "overview", overview,
        "trends", trends,
        "performance", performance,
        "predictions", predictions,
        "realtime", realtime,
        "timeRange", timeRange,
        "generatedAt", LocalDateTime.now().toString());
  }

  private List<Map<String, Object>> generateTrendData(String type, String timeRange) {
    List<Map<String, Object>> data = new ArrayList<>();
    int days = getTimeRangeDays(timeRange);

    for (int i = days; i >= 0; i--) {
      LocalDateTime date = LocalDateTime.now().minusDays(i);

      Map<String, Object> dataPoint =
          switch (type) {
            case "applications" -> Map.of(
                "date", date.toLocalDate().toString(),
                "count", 20 + (int) (Math.random() * 30),
                "success", 15 + (int) (Math.random() * 10));
            case "jobMatches" -> Map.of(
                "date", date.toLocalDate().toString(),
                "matches", 50 + (int) (Math.random() * 50),
                "quality", 70 + (int) (Math.random() * 25));
            case "userActivity" -> Map.of(
                "date", date.toLocalDate().toString(),
                "active", 100 + (int) (Math.random() * 50),
                "new", 5 + (int) (Math.random() * 15));
            default -> Map.of("date", date.toLocalDate().toString(), "value", Math.random() * 100);
          };

      data.add(dataPoint);
    }

    return data;
  }

  private int getTimeRangeDays(String timeRange) {
    return switch (timeRange) {
      case "1d" -> 1;
      case "7d" -> 7;
      case "30d" -> 30;
      case "90d" -> 90;
      default -> 7;
    };
  }
}
