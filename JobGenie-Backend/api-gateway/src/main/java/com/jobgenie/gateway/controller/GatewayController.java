package com.jobgenie.gateway.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/gateway")
@Tag(name = "API Gateway", description = "Gateway management and health check endpoints")
public class GatewayController {

  @Autowired private DiscoveryClient discoveryClient;

  @GetMapping("/health")
  @Operation(
      summary = "Gateway health check",
      description = "Check if the API Gateway is running and healthy")
  public ResponseEntity<Map<String, Object>> healthCheck() {
    Map<String, Object> response = new HashMap<>();
    response.put("status", "UP");
    response.put("service", "api-gateway");
    response.put("timestamp", System.currentTimeMillis());
    return ResponseEntity.ok(response);
  }

  @GetMapping("/services")
  @Operation(
      summary = "Get registered services",
      description = "Get list of all registered microservices")
  public ResponseEntity<Map<String, Object>> getRegisteredServices() {
    // Previously a hardcoded stub list with "will be implemented" — this deployment has
    // had a working Eureka DiscoveryClient the whole time, so return the actual registry.
    Map<String, Object> response = new HashMap<>();
    try {
      response.put("services", discoveryClient.getServices());
    } catch (Exception e) {
      response.put("services", java.util.List.of());
      response.put("error", e.getMessage());
    }
    return ResponseEntity.ok(response);
  }

  @GetMapping("/stats")
  @Operation(
      summary = "Get system statistics",
      description = "Get overall system statistics for dashboard")
  public ResponseEntity<Map<String, Object>> getSystemStats(@Autowired RestTemplate restTemplate) {
    Map<String, Object> stats = new HashMap<>();

    try {
      // Get basic counts from each service
      Map<String, Object> userCount = getUserCountFromService(restTemplate);
      Map<String, Object> resumeCount = getResumeCountFromService(restTemplate);
      Map<String, Object> jobMatchesCount = getJobMatchesCountFromService(restTemplate);
      Map<String, Object> jobApplicationsCount = getJobApplicationsCountFromService(restTemplate);

      stats.put("totalUsers", userCount != null ? userCount.get("count") : 0);
      stats.put("totalResumes", resumeCount != null ? resumeCount.get("count") : 0);
      stats.put("totalJobMatches", jobMatchesCount != null ? jobMatchesCount.get("count") : 0);
      stats.put(
          "totalJobApplications",
          jobApplicationsCount != null ? jobApplicationsCount.get("count") : 0);
      stats.put("systemHealth", "UP");
      stats.put("timestamp", System.currentTimeMillis());

    } catch (Exception e) {
      stats.put("error", e.getMessage());
      stats.put("totalUsers", 0);
      stats.put("totalResumes", 0);
      stats.put("totalJobMatches", 0);
      stats.put("totalJobApplications", 0);
    }

    return ResponseEntity.ok(stats);
  }

  @GetMapping("/job-matches")
  @Operation(summary = "Get job matches", description = "Get job matches from job service")
  public ResponseEntity<Map<String, Object>> getJobMatches(@Autowired RestTemplate restTemplate) {
    try {
      String jobServiceUrl =
          "http://job-service:8082/api/jobs/matches?userId=1"; // Default user for now
      Map<String, Object> response = restTemplate.getForObject(jobServiceUrl, Map.class);
      return ResponseEntity.ok(
          response != null ? response : Map.of("matches", java.util.List.of()));
    } catch (Exception e) {
      return ResponseEntity.ok(Map.of("matches", java.util.List.of(), "error", e.getMessage()));
    }
  }

  private Map<String, Object> getUserCountFromService(RestTemplate restTemplate) {
    try {
      return restTemplate.getForObject("http://user-service:8081/api/users/count", Map.class);
    } catch (Exception e) {
      return Map.of("count", 0);
    }
  }

  private Map<String, Object> getResumeCountFromService(RestTemplate restTemplate) {
    try {
      return restTemplate.getForObject("http://resume-service:8083/api/resumes/count", Map.class);
    } catch (Exception e) {
      return Map.of("count", 0);
    }
  }

  private Map<String, Object> getJobMatchesCountFromService(RestTemplate restTemplate) {
    try {
      return restTemplate.getForObject("http://job-service:8082/api/jobs/matches/count", Map.class);
    } catch (Exception e) {
      return Map.of("count", 0);
    }
  }

  private Map<String, Object> getJobApplicationsCountFromService(RestTemplate restTemplate) {
    try {
      return restTemplate.getForObject(
          "http://job-service:8082/api/jobs/applications/count", Map.class);
    } catch (Exception e) {
      return Map.of("count", 0);
    }
  }

  @GetMapping("/routes")
  @Operation(summary = "Get gateway routes", description = "Get all configured gateway routes")
  public ResponseEntity<Map<String, Object>> getRoutes() {
    Map<String, Object> response = new HashMap<>();
    response.put("message", "Route configuration functionality will be implemented");
    response.put(
        "routes",
        new String[] {
          "/api/users/** -> user-service",
          "/api/resumes/** -> resume-service",
          "/api/jobs/** -> job-service",
          "/api/notifications/** -> notification-service"
        });
    return ResponseEntity.ok(response);
  }
}
