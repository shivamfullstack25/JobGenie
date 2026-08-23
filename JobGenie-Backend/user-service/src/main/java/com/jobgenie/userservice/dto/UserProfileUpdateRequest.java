package com.jobgenie.userservice.dto;

import javax.validation.constraints.Email;
import javax.validation.constraints.Size;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserProfileUpdateRequest {

  @Size(min = 2, max = 50, message = "Name must be between 2 and 50 characters")
  private String name;

  @Email(message = "Invalid email format")
  private String email;

  private String phone;
  private String avatar;
  private String bio;
  private String location;
  private String website;
  private String linkedinUrl;
  private String githubUrl;
}
