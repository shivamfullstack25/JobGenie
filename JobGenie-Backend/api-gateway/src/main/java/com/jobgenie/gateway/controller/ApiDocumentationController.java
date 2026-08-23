package com.jobgenie.gateway.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/docs")
@Tag(name = "API Documentation", description = "API Gateway documentation and route information")
public class ApiDocumentationController {

  @Autowired private RestTemplate restTemplate;

  @GetMapping("/routes")
  @Operation(
      summary = "Get all API routes",
      description =
          "Returns a comprehensive list of all available API routes and their destinations")
  public ResponseEntity<Map<String, Object>> getAllRoutes() {
    Map<String, Object> routes = new HashMap<>();

    // Microservice Routes
    Map<String, String> microserviceRoutes = new HashMap<>();
    microserviceRoutes.put(
        "/api/auth/**", "user-service (Port 8081) — Firebase verify/refresh/logout");
    microserviceRoutes.put("/api/auth/linkedin/**", "api-gateway (Port 8080) — LinkedIn OAuth");
    microserviceRoutes.put("/api/users/**", "user-service (Port 8081)");
    microserviceRoutes.put("/api/resumes/**", "resume-service (Port 8083)");
    microserviceRoutes.put("/api/jobs/**", "job-service (Port 8082)");
    microserviceRoutes.put("/api/automation/**", "job-service (Port 8082)");
    microserviceRoutes.put("/api/schedules/**", "job-service (Port 8082)");
    microserviceRoutes.put(
        "/api/notifications/email|sms|push|job-application|generic|health",
        "notification-service (Port 8084)");

    // AI Service Routes
    Map<String, String> aiRoutes = new HashMap<>();
    aiRoutes.put("/api/advanced-auto-apply", "ai-service (Port 8000)");
    aiRoutes.put("/api/auto-apply/batch", "ai-service (Port 8000)");
    aiRoutes.put("/api/auto-apply/linkedin", "ai-service (Port 8000)");
    aiRoutes.put("/api/auto-apply/indeed", "ai-service (Port 8000)");
    aiRoutes.put("/api/auto-apply/naukri", "ai-service (Port 8000)");
    aiRoutes.put("/api/jobs/search-and-apply", "ai-service (Port 8000)");
    aiRoutes.put("/api/market-intelligence/**", "ai-service (Port 8000)");
    aiRoutes.put("/api/job-aggregator/**", "ai-service (Port 8000)");
    aiRoutes.put("/api/career-mentor/**", "ai-service (Port 8000)");
    aiRoutes.put("/api/notifications/send|history|stats|read|webhook", "ai-service (Port 8000)");

    // Scheduling Routes
    Map<String, String> schedulingRoutes = new HashMap<>();
    schedulingRoutes.put("/api/schedule/job-search", "ai-service (Port 8000)");
    schedulingRoutes.put("/api/schedule/auto-apply", "ai-service (Port 8000)");
    schedulingRoutes.put("/api/schedule/user/**", "ai-service (Port 8000)");
    schedulingRoutes.put("/api/schedule/*/pause", "ai-service (Port 8000)");
    schedulingRoutes.put("/api/schedule/*/resume", "ai-service (Port 8000)");
    schedulingRoutes.put("/api/schedule/**", "ai-service (Port 8000)");
    schedulingRoutes.put("/api/schedule/stats", "ai-service (Port 8000)");

    // Gateway Routes
    Map<String, String> gatewayRoutes = new HashMap<>();
    gatewayRoutes.put("/api/gateway/**", "api-gateway (Port 8080)");
    gatewayRoutes.put("/api/admin/**", "api-gateway (Port 8080)");
    gatewayRoutes.put("/api/analytics/**", "api-gateway (Port 8080)");
    gatewayRoutes.put("/api/websocket/**", "api-gateway (Port 8080)");

    // WebSocket Routes
    Map<String, String> websocketRoutes = new HashMap<>();
    websocketRoutes.put("/ws/notifications/**", "ai-service (Port 8000)");

    routes.put("microservices", microserviceRoutes);
    routes.put("ai_services", aiRoutes);
    routes.put("scheduling", schedulingRoutes);
    routes.put("gateway", gatewayRoutes);
    routes.put("websocket", websocketRoutes);

    return ResponseEntity.ok(routes);
  }

  @GetMapping("/services")
  @Operation(
      summary = "Get service information",
      description = "Returns information about all microservices in the system")
  public ResponseEntity<Map<String, Object>> getServicesInfo() {
    Map<String, Object> services = new HashMap<>();

    Map<String, Object> serviceInfo = new HashMap<>();

    // User Service
    Map<String, Object> userService = new HashMap<>();
    userService.put("name", "user-service");
    userService.put("port", 8081);
    userService.put("description", "User management and authentication");
    userService.put(
        "endpoints",
        new String[] {
          "POST /api/users/register",
          "POST /api/users/login",
          "GET /api/users/{id}",
          "PUT /api/users/{id}",
          "DELETE /api/users/{id}"
        });
    serviceInfo.put("user-service", userService);

    // Job Service
    Map<String, Object> jobService = new HashMap<>();
    jobService.put("name", "job-service");
    jobService.put("port", 8082);
    jobService.put("description", "Job management and matching");
    jobService.put(
        "endpoints",
        new String[] {
          "GET /api/jobs",
          "POST /api/jobs",
          "GET /api/jobs/{id}",
          "PUT /api/jobs/{id}",
          "DELETE /api/jobs/{id}",
          "GET /api/jobs/matches"
        });
    serviceInfo.put("job-service", jobService);

    // Resume Service
    Map<String, Object> resumeService = new HashMap<>();
    resumeService.put("name", "resume-service");
    resumeService.put("port", 8083);
    resumeService.put("description", "Resume management and parsing");
    resumeService.put(
        "endpoints",
        new String[] {
          "POST /api/resumes/upload",
          "GET /api/resumes/{id}",
          "PUT /api/resumes/{id}",
          "DELETE /api/resumes/{id}",
          "GET /api/resumes/user/{userId}"
        });
    serviceInfo.put("resume-service", resumeService);

    // Notification Service
    Map<String, Object> notificationService = new HashMap<>();
    notificationService.put("name", "notification-service");
    notificationService.put("port", 8084);
    notificationService.put("description", "Notification management");
    notificationService.put(
        "endpoints",
        new String[] {
          "POST /api/notifications/send",
          "GET /api/notifications/user/{userId}",
          "PUT /api/notifications/{id}/read",
          "DELETE /api/notifications/{id}"
        });
    serviceInfo.put("notification-service", notificationService);

    // AI Service
    Map<String, Object> aiService = new HashMap<>();
    aiService.put("name", "ai-service");
    aiService.put("port", 8000);
    aiService.put("description", "AI-powered job search and automation");
    aiService.put(
        "endpoints",
        new String[] {
          "POST /api/advanced-auto-apply",
          "POST /api/auto-apply/batch",
          "POST /api/jobs/search-and-apply",
          "POST /api/schedule/job-search",
          "POST /api/schedule/auto-apply"
        });
    serviceInfo.put("ai-service", aiService);

    services.put("services", serviceInfo);
    services.put("total_services", 5);
    services.put("gateway_port", 8080);
    services.put("eureka_port", 8761);

    return ResponseEntity.ok(services);
  }

  @GetMapping("/health/status")
  @Operation(
      summary = "Get system health status",
      description = "Returns the health status of all microservices")
  public ResponseEntity<Map<String, Object>> getSystemHealth() {
    // Previously this returned "UP"/"HEALTHY" for every service unconditionally — fabricated
    // status presented as a live check. Now performs real /actuator/health calls (literal
    // Docker Compose hostname:port — see AdminController/AnalyticsController for why bare
    // service-name URLs relying on @LoadBalanced resolution don't actually work here).
    Map<String, Object> health = new HashMap<>();

    Map<String, String> serviceHealth = new HashMap<>();
    serviceHealth.put("api-gateway", "UP");
    serviceHealth.put("eureka-server", checkHealth("http://eureka-server:8761/actuator/health"));
    serviceHealth.put("user-service", checkHealth("http://user-service:8081/actuator/health"));
    serviceHealth.put("job-service", checkHealth("http://job-service:8082/actuator/health"));
    serviceHealth.put("resume-service", checkHealth("http://resume-service:8083/actuator/health"));
    serviceHealth.put(
        "notification-service", checkHealth("http://notification-service:8084/actuator/health"));
    serviceHealth.put("ai-service", checkHealth("http://ai-service:8000/health"));

    boolean allUp = serviceHealth.values().stream().allMatch("UP"::equals);

    health.put("overall_status", allUp ? "HEALTHY" : "DEGRADED");
    health.put("services", serviceHealth);
    health.put("timestamp", System.currentTimeMillis());

    return ResponseEntity.ok(health);
  }

  private String checkHealth(String healthUrl) {
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> response = restTemplate.getForObject(healthUrl, Map.class);
      return response != null && "UP".equals(response.get("status")) ? "UP" : "DOWN";
    } catch (Exception e) {
      return "DOWN";
    }
  }
}
