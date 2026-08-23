package com.jobgenie.resumeservice.dto;

import java.util.Map;

import com.jobgenie.shared.dto.ResumeDto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResumeUploadResponse {
  private boolean success;
  private String message;
  private String error;
  private ResumeDto resume;
  private Map<String, Object> metadata;
  private Map<String, Object> insights;
}
