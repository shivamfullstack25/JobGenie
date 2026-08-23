package com.jobgenie.gateway.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

  @Override
  public void configureMessageBroker(MessageBrokerRegistry config) {
    // Enable simple broker for destinations prefixed with "/topic" and "/queue"
    config.enableSimpleBroker("/topic", "/queue", "/user");
    // Set application destination prefix for messages bound for @MessageMapping
    config.setApplicationDestinationPrefixes("/app");
    // Enable user-specific destinations
    config.setUserDestinationPrefix("/user");
  }

  @Override
  public void registerStompEndpoints(StompEndpointRegistry registry) {
    // Register WebSocket endpoint with SockJS fallback
    registry.addEndpoint("/ws").setAllowedOriginPatterns("*").withSockJS();
  }
}
