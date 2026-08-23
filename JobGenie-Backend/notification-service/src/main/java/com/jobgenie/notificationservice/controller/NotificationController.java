package com.jobgenie.notificationservice.controller;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import com.jobgenie.notificationservice.service.NotificationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/notifications")
@Tag(name = "Notifications", description = "Endpoints for sending notifications (email, SMS, push)")
@CrossOrigin(origins = "*")
public class NotificationController {

  @Autowired private NotificationService notificationService;

  private boolean isAdmin(String userId) {
    // Call user-service to get user and check role
    RestTemplate restTemplate = new RestTemplate();
    String url =
        System.getenv().getOrDefault("USER_SERVICE_URL", "http://localhost:8081")
            + "/api/users/"
            + userId;
    try {
      Map user = restTemplate.getForObject(url, Map.class);
      return "admin".equals(user.get("role"));
    } catch (Exception e) {
      return false;
    }
  }

  private void requireAdmin(String userId, String action) {
    if (!isAdmin(userId)) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin access required");
    }
    // Audit log
    System.out.println(
        "[AUDIT] Admin action: "
            + action
            + ", by userId="
            + userId
            + ", at "
            + LocalDateTime.now());
  }

  @PostMapping("/email")
  @Operation(
      summary = "Send email notification",
      description = "Send an email notification to a user")
  public ResponseEntity<Map<String, Object>> sendEmail(
      @RequestHeader("X-User-Id") String adminUserId, @RequestBody Map<String, String> payload) {
    requireAdmin(adminUserId, "sendEmail");
    String to = payload.get("to");
    String subject = payload.getOrDefault("subject", "JobGenie Notification");
    String body = payload.getOrDefault("body", "This is a notification from JobGenie.");

    Map<String, Object> response = new HashMap<>();
    boolean success = notificationService.sendEmailNotification(to, subject, body);
    if (success) {
      response.put("status", "sent");
      response.put("to", to);
      return ResponseEntity.ok(response);
    } else {
      response.put("status", "error");
      response.put("error", "Failed to send email");
      return ResponseEntity.status(500).body(response);
    }
  }

  @PostMapping("/sms")
  @Operation(summary = "Send SMS notification", description = "Send an SMS notification to a user")
  public ResponseEntity<Map<String, Object>> sendSMS(
      @RequestHeader("X-User-Id") String adminUserId, @RequestBody Map<String, String> payload) {
    requireAdmin(adminUserId, "sendSMS");
    String phoneNumber = payload.get("phoneNumber");
    String message = payload.getOrDefault("message", "This is a notification from JobGenie.");

    Map<String, Object> response = new HashMap<>();
    boolean success = notificationService.sendSMSNotification(phoneNumber, message);
    if (success) {
      response.put("status", "sent");
      response.put("phoneNumber", phoneNumber);
      return ResponseEntity.ok(response);
    } else {
      response.put("status", "error");
      response.put("error", "Failed to send SMS");
      return ResponseEntity.status(500).body(response);
    }
  }

  @PostMapping("/push")
  @Operation(summary = "Send push notification", description = "Send a push notification to a user")
  public ResponseEntity<Map<String, Object>> sendPush(
      @RequestHeader("X-User-Id") String adminUserId, @RequestBody Map<String, String> payload) {
    requireAdmin(adminUserId, "sendPush");
    String userId = payload.get("userId");
    String title = payload.getOrDefault("title", "JobGenie Notification");
    String message = payload.getOrDefault("message", "This is a notification from JobGenie.");

    Map<String, Object> response = new HashMap<>();
    boolean success = notificationService.sendPushNotification(userId, title, message);
    if (success) {
      response.put("status", "sent");
      response.put("userId", userId);
      return ResponseEntity.ok(response);
    } else {
      response.put("status", "error");
      response.put("error", "Failed to send push notification");
      return ResponseEntity.status(500).body(response);
    }
  }

  @PostMapping("/job-application")
  @Operation(
      summary = "Send job application notification",
      description = "Send a notification for job application submission")
  public ResponseEntity<Map<String, Object>> sendJobApplicationNotification(
      @RequestHeader("X-User-Id") String adminUserId, @RequestBody Map<String, String> payload) {
    requireAdmin(adminUserId, "notifyJobApplication");
    String userId = payload.get("userId");
    String jobTitle = payload.get("jobTitle");
    String companyName = payload.get("companyName");

    Map<String, Object> response = new HashMap<>();
    boolean success =
        notificationService.sendJobApplicationNotification(userId, jobTitle, companyName);
    if (success) {
      response.put("status", "sent");
      response.put("userId", userId);
      return ResponseEntity.ok(response);
    } else {
      response.put("status", "error");
      response.put("error", "Failed to send job application notification");
      return ResponseEntity.status(500).body(response);
    }
  }

  @PostMapping("/generic")
  @Operation(
      summary = "Send generic notification",
      description = "Send a generic notification based on type")
  public ResponseEntity<Map<String, Object>> sendGenericNotification(
      @RequestHeader("X-User-Id") String adminUserId, @RequestBody Map<String, Object> payload) {
    requireAdmin(adminUserId, "sendGeneric");
    String userId = payload.get("userId").toString();

    Map<String, Object> response = new HashMap<>();
    boolean success = notificationService.sendGenericNotification(userId, payload);
    if (success) {
      response.put("status", "sent");
      response.put("userId", userId);
      return ResponseEntity.ok(response);
    } else {
      response.put("status", "error");
      response.put("error", "Failed to send generic notification");
      return ResponseEntity.status(500).body(response);
    }
  }

  @GetMapping("/health")
  @Operation(summary = "Health check", description = "Check if the notification service is running")
  public ResponseEntity<Map<String, String>> healthCheck() {
    return ResponseEntity.ok(Map.of("status", "UP", "service", "notification-service"));
  }
}
