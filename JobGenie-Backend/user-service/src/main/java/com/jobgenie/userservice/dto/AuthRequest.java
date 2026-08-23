package com.jobgenie.userservice.dto;

import javax.validation.constraints.NotBlank;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthRequest {

  @NotBlank(message = "Firebase ID token is required")
  private String idToken;

  // Optional fields for additional context
  private String deviceId;
  private String userAgent;
}
