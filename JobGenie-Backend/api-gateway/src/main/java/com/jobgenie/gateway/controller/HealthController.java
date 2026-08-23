package com.jobgenie.gateway.controller;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/health")
@Tag(name = "Health", description = "Health check endpoints")
public class HealthController {

  @GetMapping
  @Operation(
      summary = "API Gateway Health",
      description = "Check the health status of the API Gateway")
  public ResponseEntity<Map<String, Object>> health() {
    Map<String, Object> health = new HashMap<>();
    health.put("status", "UP");
    health.put("service", "JobGenie API Gateway");
    health.put("timestamp", LocalDateTime.now().toString());
    health.put("version", "1.0.0");
    health.put("environment", "development");

    return ResponseEntity.ok(health);
  }

  @GetMapping("/ping")
  @Operation(summary = "Ping", description = "Simple ping endpoint to test connectivity")
  public ResponseEntity<Map<String, String>> ping() {
    Map<String, String> response = new HashMap<>();
    response.put("message", "pong");
    response.put("timestamp", LocalDateTime.now().toString());

    return ResponseEntity.ok(response);
  }
}
