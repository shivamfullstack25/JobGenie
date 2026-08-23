package com.jobgenie.gateway.websocket;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class NotificationWebSocketConfig implements WebSocketConfigurer {

  private final NotificationWebSocketHandler notificationHandler;

  public NotificationWebSocketConfig(NotificationWebSocketHandler notificationHandler) {
    this.notificationHandler = notificationHandler;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry
        .addHandler(notificationHandler, "/ws/notifications/{userId}")
        .setAllowedOrigins("*") // Configure properly for production
        .withSockJS();

    registry.addHandler(notificationHandler, "/ws/notifications/{userId}").setAllowedOrigins("*");
  }
}
