package com.jobgenie.gateway.websocket;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class NotificationWebSocketHandler implements WebSocketHandler {

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final Map<String, WebSocketSession> userSessions = new ConcurrentHashMap<>();

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    String userId = extractUserIdFromPath(session.getUri().getPath());
    if (userId != null) {
      userSessions.put(userId, session);
      log.info("WebSocket connection established for user: {}", userId);

      // Send welcome message
      sendMessage(
          userId,
          Map.of(
              "type", "system_update",
              "data",
                  Map.of(
                      "message",
                      "Real-time updates connected successfully",
                      "connectedAt",
                      LocalDateTime.now().toString()),
              "timestamp", LocalDateTime.now().toString()));
    }
  }

  @Override
  public void handleMessage(WebSocketSession session, WebSocketMessage<?> message)
      throws Exception {
    String userId = extractUserIdFromPath(session.getUri().getPath());
    log.debug("Received WebSocket message from user {}: {}", userId, message.getPayload());

    try {
      if (message instanceof TextMessage) {
        String payload = ((TextMessage) message).getPayload();
        Map<String, Object> messageData = objectMapper.readValue(payload, Map.class);

        String messageType = (String) messageData.get("type");
        if ("heartbeat".equals(messageType)) {
          // Respond to heartbeat
          session.sendMessage(
              new TextMessage(
                  objectMapper.writeValueAsString(
                      Map.of(
                          "type",
                          "heartbeat_response",
                          "timestamp",
                          LocalDateTime.now().toString()))));
        }
      }
    } catch (Exception e) {
      log.error("Error handling WebSocket message: {}", e.getMessage(), e);
    }
  }

  @Override
  public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
    String userId = extractUserIdFromPath(session.getUri().getPath());
    log.error(
        "WebSocket transport error for user {}: {}", userId, exception.getMessage(), exception);
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus)
      throws Exception {
    String userId = extractUserIdFromPath(session.getUri().getPath());
    if (userId != null) {
      userSessions.remove(userId);
      log.info("WebSocket connection closed for user: {} with status: {}", userId, closeStatus);
    }
  }

  @Override
  public boolean supportsPartialMessages() {
    return false;
  }

  public void sendJobMatchNotification(String userId, Map<String, Object> jobMatchData) {
    sendMessage(
        userId,
        Map.of(
            "type",
            "job_match",
            "data",
            jobMatchData,
            "timestamp",
            LocalDateTime.now().toString()));
  }

  public void sendApplicationUpdateNotification(
      String userId, Map<String, Object> applicationData) {
    sendMessage(
        userId,
        Map.of(
            "type",
            "application_update",
            "data",
            applicationData,
            "timestamp",
            LocalDateTime.now().toString()));
  }

  public void sendGeneralNotification(String userId, String title, String message) {
    sendMessage(
        userId,
        Map.of(
            "type", "notification",
            "data",
                Map.of(
                    "title", title,
                    "message", message),
            "timestamp", LocalDateTime.now().toString()));
  }

  public void sendAIAnalysisComplete(String userId, String analysisType, int score) {
    sendMessage(
        userId,
        Map.of(
            "type", "ai_analysis_complete",
            "data",
                Map.of(
                    "analysisType", analysisType,
                    "score", score),
            "timestamp", LocalDateTime.now().toString()));
  }

  public void broadcastSystemUpdate(String message) {
    Map<String, Object> systemMessage =
        Map.of(
            "type", "system_update",
            "data", Map.of("message", message),
            "timestamp", LocalDateTime.now().toString());

    userSessions
        .values()
        .forEach(
            session -> {
              try {
                if (session.isOpen()) {
                  session.sendMessage(
                      new TextMessage(objectMapper.writeValueAsString(systemMessage)));
                }
              } catch (IOException e) {
                log.error("Error broadcasting system update: {}", e.getMessage());
              }
            });
  }

  private void sendMessage(String userId, Map<String, Object> message) {
    WebSocketSession session = userSessions.get(userId);
    if (session != null && session.isOpen()) {
      try {
        String jsonMessage = objectMapper.writeValueAsString(message);
        session.sendMessage(new TextMessage(jsonMessage));
        log.debug("Sent WebSocket message to user {}: {}", userId, message.get("type"));
      } catch (IOException e) {
        log.error("Error sending WebSocket message to user {}: {}", userId, e.getMessage());
      }
    } else {
      log.debug("No active WebSocket session for user: {}", userId);
    }
  }

  private String extractUserIdFromPath(String path) {
    if (path != null && path.contains("/ws/notifications/")) {
      String[] pathParts = path.split("/");
      if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1];
      }
    }
    return null;
  }

  public boolean isUserConnected(String userId) {
    WebSocketSession session = userSessions.get(userId);
    return session != null && session.isOpen();
  }

  public int getConnectedUsersCount() {
    return (int) userSessions.values().stream().filter(WebSocketSession::isOpen).count();
  }
}
