package com.jobgenie.jobservice.client;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import com.jobgenie.shared.dto.ResumeDto;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@RequiredArgsConstructor
public class ResumeServiceClient {

  @Value("${resume.service.url:http://resume-service:8083}")
  private String resumeServiceUrl;

  private final RestTemplate restTemplate;

  public ResumeDto getResume(Long resumeId) {
    try {
      return restTemplate.getForObject(
          resumeServiceUrl + "/api/resumes/" + resumeId, ResumeDto.class);
    } catch (Exception e) {
      log.warn("Failed to fetch resume {}: {}", resumeId, e.getMessage());
      return null;
    }
  }

  public List<ResumeDto> getUserResumes(Long userId) {
    try {
      ResponseEntity<List<ResumeDto>> response =
          restTemplate.exchange(
              resumeServiceUrl + "/api/resumes/user/" + userId,
              HttpMethod.GET,
              null,
              new ParameterizedTypeReference<List<ResumeDto>>() {});

      return response.getBody() != null ? response.getBody() : Collections.emptyList();
    } catch (Exception e) {
      log.warn("Failed to fetch resumes for user {}: {}", userId, e.getMessage());
      return Collections.emptyList();
    }
  }

  public ResumeDto resolveResumeForUser(Long userId, Long resumeId) {
    if (resumeId != null) {
      ResumeDto resume = getResume(resumeId);
      if (resume != null) {
        return resume;
      }
    }

    List<ResumeDto> resumes = getUserResumes(userId);
    return resumes.isEmpty() ? null : resumes.get(0);
  }

  @SuppressWarnings("unchecked")
  public List<String> extractSkills(ResumeDto resume) {
    if (resume == null) {
      return Collections.emptyList();
    }

    if (resume.getSkills() != null && !resume.getSkills().isEmpty()) {
      return resume.getSkills();
    }

    Map<String, Object> metadata = resume.getMetadata();
    if (metadata == null) {
      return Collections.emptyList();
    }

    Object skills = metadata.get("skills");
    if (skills instanceof List) {
      return (List<String>) skills;
    }

    return Collections.emptyList();
  }

  public String extractPreferredLocation(ResumeDto resume) {
    if (resume == null || resume.getMetadata() == null) {
      return "Remote";
    }

    Object personalInfo = resume.getMetadata().get("personal_info");
    if (personalInfo instanceof Map) {
      Object location = ((Map<String, Object>) personalInfo).get("location");
      if (location != null && !location.toString().isBlank()) {
        return location.toString();
      }
    }

    Object location = resume.getMetadata().get("location");
    return location != null ? location.toString() : "Remote";
  }

  public List<String> buildSearchKeywords(ResumeDto resume, List<String> fallback) {
    List<String> skills = extractSkills(resume);
    if (!skills.isEmpty()) {
      return skills.size() > 5 ? skills.subList(0, 5) : skills;
    }
    return fallback;
  }
}
