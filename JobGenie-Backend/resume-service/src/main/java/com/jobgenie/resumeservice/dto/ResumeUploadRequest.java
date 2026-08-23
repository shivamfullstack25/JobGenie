package com.jobgenie.resumeservice.dto;

import lombok.Data;

@Data
public class ResumeUploadRequest {
  private Long userId;
  private String fileName;
  private String fileType;
  private Long fileSize;
}
