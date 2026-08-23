package com.jobgenie.notificationservice.service;

import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(name = "spring.kafka.enabled", havingValue = "true")
public class KafkaNotificationService {

  private final SimpMessagingTemplate messagingTemplate;
  private final RestTemplate restTemplate;

  /** Handle user notifications and send via WebSocket */
  @KafkaListener(topics = "user-notifications", groupId = "notification-service-group")
  public void handleUserNotification(Map<String, Object> notification) {
    try {
      String userId = (String) notification.get("userId");
      String type = (String) notification.get("type");
      String message = (String) notification.get("message");

      log.info("Processing notification for user {}: {}", userId, message);

      // Create WebSocket message with enhanced format
      Map<String, Object> wsMessage = new HashMap<>();
      wsMessage.put("type", mapToWebSocketType(type));
      wsMessage.put("data", createNotificationData(notification));
      wsMessage.put("timestamp", notification.get("timestamp"));
      wsMessage.put("priority", "medium");

      // Send to user-specific WebSocket channel
      messagingTemplate.convertAndSendToUser(userId, "/queue/notifications", wsMessage);

      log.info("Sent WebSocket notification to user: {}", userId);

    } catch (Exception e) {
      log.error("Error processing user notification: {}", e.getMessage(), e);
    }
  }

  /** Handle job application events */
  @KafkaListener(topics = "job-application-submitted", groupId = "notification-service-group")
  public void handleJobApplicationEvent(Map<String, Object> event) {
    try {
      String userId = (String) event.get("userId");
      String jobId = (String) event.get("jobId");
      String platform = (String) event.get("platform");
      String status = (String) event.get("status");

      Map<String, Object> wsMessage = new HashMap<>();
      wsMessage.put("type", "application_update");
      wsMessage.put(
          "data",
          Map.of(
              "jobId", jobId,
              "platform", platform,
              "status", status,
              "message", String.format("Application %s on %s", status, platform)));
      wsMessage.put("timestamp", event.get("timestamp"));
      wsMessage.put("priority", "high");

      messagingTemplate.convertAndSendToUser(userId, "/queue/notifications", wsMessage);
      log.info("Sent job application notification to user: {}", userId);

    } catch (Exception e) {
      log.error("Error processing job application event: {}", e.getMessage(), e);
    }
  }

  /** Handle job match events */
  @KafkaListener(topics = "job-match-found", groupId = "notification-service-group")
  public void handleJobMatchEvent(Map<String, Object> event) {
    try {
      String userId = (String) event.get("userId");
      String matchType = (String) event.get("matchType");
      Object matchData = event.get("matchData");

      Map<String, Object> wsMessage = new HashMap<>();
      wsMessage.put("type", "real_time_match");
      wsMessage.put(
          "data",
          Map.of(
              "matchType", matchType,
              "matchData", matchData,
              "message", "New job matches found based on your profile!"));
      wsMessage.put("timestamp", event.get("timestamp"));
      wsMessage.put("priority", "high");

      messagingTemplate.convertAndSendToUser(userId, "/queue/notifications", wsMessage);
      log.info("Sent job match notification to user: {}", userId);

    } catch (Exception e) {
      log.error("Error processing job match event: {}", e.getMessage(), e);
    }
  }

  /** Handle automation progress events */
  @KafkaListener(topics = "automation-progress", groupId = "notification-service-group")
  public void handleAutomationProgressEvent(Map<String, Object> event) {
    try {
      String userId = (String) event.get("userId");
      String taskType = (String) event.get("taskType");
      Integer progress = (Integer) event.get("progress");
      String status = (String) event.get("status");

      Map<String, Object> wsMessage = new HashMap<>();
      wsMessage.put("type", "automation_progress");
      wsMessage.put(
          "data",
          Map.of(
              "taskType", taskType,
              "progress", progress,
              "status", status,
              "message", String.format("%s: %d%% complete", taskType, progress)));
      wsMessage.put("timestamp", event.get("timestamp"));
      wsMessage.put("priority", "medium");

      messagingTemplate.convertAndSendToUser(userId, "/queue/notifications", wsMessage);
      log.info("Sent automation progress notification to user: {} - {}%", userId, progress);

    } catch (Exception e) {
      log.error("Error processing automation progress event: {}", e.getMessage(), e);
    }
  }

  /** Handle market insights events */
  @KafkaListener(topics = "market-insights", groupId = "notification-service-group")
  public void handleMarketInsightsEvent(Map<String, Object> event) {
    try {
      String userId = (String) event.get("userId");
      String insightType = (String) event.get("insightType");
      Object insightData = event.get("insightData");

      Map<String, Object> wsMessage = new HashMap<>();
      wsMessage.put("type", "market_update");
      wsMessage.put(
          "data",
          Map.of(
              "insightType", insightType,
              "insightData", insightData,
              "message", "New market insights available for your field!"));
      wsMessage.put("timestamp", event.get("timestamp"));
      wsMessage.put("priority", "low");

      messagingTemplate.convertAndSendToUser(userId, "/queue/notifications", wsMessage);
      log.info("Sent market insights notification to user: {}", userId);

    } catch (Exception e) {
      log.error("Error processing market insights event: {}", e.getMessage(), e);
    }
  }

  /** Map Kafka event types to WebSocket message types */
  private String mapToWebSocketType(String kafkaType) {
    return switch (kafkaType) {
      case "ats_analysis" -> "ai_analysis_complete";
      case "skills_analysis" -> "skill_recommendation";
      case "job_application" -> "application_update";
      case "job_match" -> "real_time_match";
      case "automation" -> "automation_progress";
      case "market_insight" -> "market_update";
      default -> "notification";
    };
  }

  /** Create structured notification data for WebSocket */
  private Map<String, Object> createNotificationData(Map<String, Object> notification) {
    Map<String, Object> data = new HashMap<>();
    data.put("title", getNotificationTitle((String) notification.get("type")));
    data.put("message", notification.get("message"));
    data.put("type", notification.get("type"));
    data.put("userId", notification.get("userId"));
    return data;
  }

  /** Get user-friendly notification titles */
  private String getNotificationTitle(String type) {
    return switch (type) {
      case "ats_analysis" -> "🤖 ATS Analysis Complete";
      case "skills_analysis" -> "📊 Skills Analysis Ready";
      case "job_application" -> "✅ Application Update";
      case "job_match" -> "🎯 New Job Matches";
      case "automation" -> "⚙️ Automation Progress";
      case "market_insight" -> "📈 Market Insights";
      default -> "📬 Notification";
    };
  }
}
