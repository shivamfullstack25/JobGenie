package com.jobgenie.gateway.controller;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.extern.slf4j.Slf4j;

@Controller
@Slf4j
public class WebSocketController {

  @Autowired private SimpMessagingTemplate messagingTemplate;

  @MessageMapping("/job-search/start")
  @SendTo("/topic/job-search/updates")
  public Map<String, Object> startJobSearch(
      @Payload Map<String, Object> searchParams, SimpMessageHeaderAccessor headerAccessor) {
    log.info("Starting job search for user: {}", headerAccessor.getUser());

    // Broadcast search started message
    return Map.of(
        "type",
        "SEARCH_STARTED",
        "message",
        "Job search initiated",
        "progress",
        0,
        "timestamp",
        System.currentTimeMillis());
  }

  @MessageMapping("/automation/start")
  @SendTo("/topic/automation/updates")
  public Map<String, Object> startAutomation(
      @Payload Map<String, Object> automationConfig, SimpMessageHeaderAccessor headerAccessor) {
    log.info("Starting automation for user: {}", headerAccessor.getUser());

    return Map.of(
        "type",
        "AUTOMATION_STARTED",
        "message",
        "Automation process initiated",
        "progress",
        0,
        "timestamp",
        System.currentTimeMillis());
  }

  @MessageMapping("/dashboard/subscribe")
  public void subscribeToDashboard(SimpMessageHeaderAccessor headerAccessor) {
    String userId =
        headerAccessor.getUser() != null ? headerAccessor.getUser().getName() : "anonymous";
    log.info("User {} subscribed to dashboard updates", userId);

    // Send initial dashboard data
    messagingTemplate.convertAndSendToUser(
        userId,
        "/queue/dashboard",
        Map.of(
            "type", "DASHBOARD_INIT",
            "message", "Connected to real-time dashboard",
            "timestamp", System.currentTimeMillis()));
  }

  // REST endpoints for services to push updates
  @RestController
  @RequestMapping("/api/websocket")
  public static class WebSocketNotificationController {

    @Autowired private SimpMessagingTemplate messagingTemplate;

    @PostMapping("/job-search/progress")
    public void updateJobSearchProgress(@RequestBody Map<String, Object> update) {
      log.info("Broadcasting job search progress: {}", update);
      messagingTemplate.convertAndSend("/topic/job-search/updates", update);
    }

    @PostMapping("/automation/progress")
    public void updateAutomationProgress(@RequestBody Map<String, Object> update) {
      log.info("Broadcasting automation progress: {}", update);
      messagingTemplate.convertAndSend("/topic/automation/updates", update);
    }

    @PostMapping("/notification")
    public void sendNotification(@RequestBody Map<String, Object> notification) {
      String userId = (String) notification.get("userId");
      log.info("Sending notification to user {}: {}", userId, notification);

      if (userId != null) {
        messagingTemplate.convertAndSendToUser(userId, "/queue/notifications", notification);
      } else {
        messagingTemplate.convertAndSend("/topic/notifications", notification);
      }
    }

    @PostMapping("/dashboard/update")
    public void updateDashboard(@RequestBody Map<String, Object> dashboardUpdate) {
      log.info("Broadcasting dashboard update: {}", dashboardUpdate);
      messagingTemplate.convertAndSend("/topic/dashboard/updates", dashboardUpdate);
    }
  }
}
