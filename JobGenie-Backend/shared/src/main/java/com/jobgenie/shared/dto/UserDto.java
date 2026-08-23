package com.jobgenie.shared.dto;

import java.time.LocalDateTime;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserDto {
  private Long id;
  private String email;
  private String name;
  private String phone;
  private String avatar;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;
  private Map<String, Object> settings;
}
