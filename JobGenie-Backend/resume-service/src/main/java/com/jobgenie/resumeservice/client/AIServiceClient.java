package com.jobgenie.resumeservice.client;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class AIServiceClient {

  @Value("${ai.service.url:http://localhost:8000}")
  private String aiServiceUrl;

  private final RestTemplate restTemplate;

  public AIServiceClient(RestTemplateBuilder builder) {
    // No timeout previously meant a hung AI-service call could block a resume-service
    // thread forever. Read timeout is generous since AI resume analysis is LLM-bound.
    this.restTemplate =
        builder
            .setConnectTimeout(Duration.ofSeconds(10))
            .setReadTimeout(Duration.ofSeconds(45))
            .build();
  }

  public Map<String, Object> getResumeInsights(
      String resumeText, Boolean detailed, String jobDescription) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      Map<String, Object> request =
          Map.of(
              "resume_text", resumeText,
              "detailed", detailed != null ? detailed : false,
              "job_description", jobDescription != null ? jobDescription : "");

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/resume-insights", entity, Map.class);

      return response.getBody();
    } catch (Exception e) {
      log.error("Error calling AI service for resume insights: {}", e.getMessage());
      throw new RuntimeException("AI service call failed", e);
    }
  }

  public Map<String, Object> optimizeForATS(
      String resumeContent, String jobDescription, Integer targetScore) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      // Map.of() throws NullPointerException on any null value (not just missing keys) —
      // build with a mutable map instead so a null resumeContent surfaces as a normal
      // downstream error rather than a bare NPE.
      Map<String, Object> request = new HashMap<>();
      request.put("resume_content", resumeContent != null ? resumeContent : "");
      request.put("job_description", jobDescription != null ? jobDescription : "");
      request.put("target_score", targetScore != null ? targetScore : 80);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/ats-resume", entity, Map.class);

      return response.getBody();
    } catch (Exception e) {
      log.error("Error calling AI service for ATS optimization: {}", e.getMessage());
      throw new RuntimeException("AI service call failed", e);
    }
  }

  public Map<String, Object> generateCoverLetter(
      String resumeContent,
      String jobDescription,
      String companyName,
      String position,
      String tone) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      // AI service's CoverLetterRequest requires job_title, company_name, job_description,
      // and resume_content (personal_statement is optional). Previously this method's
      // parameters were bound positionally to the wrong request fields (e.g. the resume text
      // was sent as job_title) and job_description was omitted entirely, causing the AI
      // service to reject every call with a 422 that surfaced here as a generic 500.
      Map<String, Object> request =
          Map.of(
              "job_title", position != null ? position : "",
              "company_name", companyName != null ? companyName : "",
              "job_description", jobDescription != null ? jobDescription : "",
              "resume_content", resumeContent != null ? resumeContent : "",
              "personal_statement", tone != null ? tone : "professional");

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(
              aiServiceUrl + "/api/generate-cover-letter", entity, Map.class);

      return response.getBody();
    } catch (Exception e) {
      log.error("Error calling AI service for cover letter generation: {}", e.getMessage());
      throw new RuntimeException("AI service call failed", e);
    }
  }

  public Map<String, Object> getChatResponse(String question, Map<String, Object> userContext) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      Map<String, Object> request =
          Map.of(
              "question", question, "user_context", userContext != null ? userContext : Map.of());

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/chat", entity, Map.class);

      return response.getBody();
    } catch (Exception e) {
      log.error("Error calling AI service for chat: {}", e.getMessage());
      throw new RuntimeException("AI service call failed", e);
    }
  }

  public Map<String, Object> analyzeResume(String resumeText) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      Map<String, Object> request = Map.of("resume_text", resumeText);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/resume-insights", entity, Map.class);

      return response.getBody();
    } catch (Exception e) {
      log.error("Error calling AI service for resume analysis: {}", e.getMessage());
      throw new RuntimeException("AI service call failed", e);
    }
  }
}
