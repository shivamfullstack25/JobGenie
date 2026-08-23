package com.jobgenie.shared.dto;

import java.time.LocalDateTime;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobDto {
  private String id;
  private String title;
  private String company;
  private String location;
  private String description;
  private String salary;
  private String type;
  private LocalDateTime postedAt;
  private List<String> requiredSkills;
  private String platform;
  private String url;
  private Boolean isRemote;
  private String experienceLevel;
}
