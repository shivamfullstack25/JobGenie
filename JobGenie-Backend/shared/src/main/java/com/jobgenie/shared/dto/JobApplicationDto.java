package com.jobgenie.shared.dto;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobApplicationDto {
  private String id;
  private String jobId;
  private String userId;
  private String platform;
  private String status; // applied, pending, rejected, etc.
  private LocalDateTime appliedAt;
}
