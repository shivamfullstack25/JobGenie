package com.jobgenie.userservice.dto;

import com.jobgenie.shared.entities.User;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthResponse {

  private boolean success;
  private String message;
  private User user;
  private String token; // Optional JWT token if needed
  private Long expiresAt; // Optional expiration timestamp
}
