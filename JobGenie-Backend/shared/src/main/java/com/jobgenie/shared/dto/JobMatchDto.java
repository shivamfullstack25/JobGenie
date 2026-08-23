package com.jobgenie.shared.dto;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobMatchDto {
  private String jobId;
  private Double matchScore;
  private List<String> matchingSkills;
  private List<String> missingSkills;
  private String recommendation;
  private String reason;
}
