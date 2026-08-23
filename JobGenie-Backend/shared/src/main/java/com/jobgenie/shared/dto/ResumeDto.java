package com.jobgenie.shared.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResumeDto {
  private Long id;
  private Long userId;
  private String fileName;
  private String originalFileName;
  private String content;
  private Map<String, Object> metadata;
  private Map<String, Object> insights;
  private List<String> skills;
  private List<Map<String, Object>> experience;
  private List<Map<String, Object>> education;
  private Long fileSize;
  private String fileType;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;
  private Boolean isActive;
  private Boolean isProcessed;
}
