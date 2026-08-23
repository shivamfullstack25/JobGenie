package com.jobgenie.resumeservice.util;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class AIServiceUtil {

  @Value("${ai.service.url:http://localhost:8000}")
  private String aiServiceUrl;

  private final RestTemplate restTemplate;
  private final ObjectMapper objectMapper;

  public AIServiceUtil(RestTemplateBuilder builder) {
    this.restTemplate =
        builder
            .setConnectTimeout(Duration.ofSeconds(10))
            .setReadTimeout(Duration.ofSeconds(45))
            .build();
    this.objectMapper = new ObjectMapper();
  }

  public Map<String, Object> extractMetadata(String resumeContent) {
    try {
      Map<String, Object> request = new HashMap<>();
      request.put("resume_text", resumeContent);
      request.put("detailed", false);

      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/resume-insights", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return normalizeResumeMetadata(response.getBody());
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for metadata extraction: " + e.getMessage());
      return new HashMap<>();
    }
  }

  public Map<String, Object> generateInsights(String resumeContent) {
    try {
      Map<String, Object> request = new HashMap<>();
      request.put("resume_text", resumeContent);
      request.put("detailed", true);

      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/resume-insights", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        Map<String, Object> body = response.getBody();

        Map<String, Object> insights = new HashMap<>();

        if (body.containsKey("insights")) {
          insights.putAll((Map<String, Object>) body.get("insights"));
        } else if (body.containsKey("analysis")) {
          Map<String, Object> analysis = (Map<String, Object>) body.get("analysis");
          insights.put("summary", analysis.get("summary"));
          insights.put("strengths", analysis.get("strengths"));
          insights.put("improvements", analysis.get("improvements"));
          insights.put("recommendations", analysis.get("recommendations"));
        } else {
          insights.put("summary", body.get("summary"));
          insights.put("strengths", body.get("strengths"));
          insights.put("improvements", body.get("improvements"));
          insights.put("recommendations", body.get("recommendations"));
        }

        return insights;
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for insights generation: " + e.getMessage());
      return new HashMap<>();
    }
  }

  public Map<String, Object> generateCoverLetter(Map<String, Object> request) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(
              aiServiceUrl + "/api/generate-cover-letter", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for cover letter generation: " + e.getMessage());
      return new HashMap<>();
    }
  }

  public Map<String, Object> optimizeATSResume(Map<String, Object> request) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/ats-resume", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for ATS optimization: " + e.getMessage());
      return new HashMap<>();
    }
  }

  public Map<String, Object> getCareerAdvice(Map<String, Object> request) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/chat", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for career advice: " + e.getMessage());
      return new HashMap<>();
    }
  }

  public Map<String, Object> getResumeInsights(
      String resumeContent, Boolean detailed, String format) {
    try {
      Map<String, Object> request = new HashMap<>();
      request.put("resume_text", resumeContent);
      request.put("detailed", detailed != null ? detailed : false);
      if (format != null) {
        request.put("format", format);
      }

      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/resume-insights", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for resume insights: " + e.getMessage());
      return new HashMap<>();
    }
  }

  public Map<String, Object> optimizeForATS(
      String resumeContent, String jobDescription, Integer maxLength) {
    try {
      Map<String, Object> request = new HashMap<>();
      request.put("resume_content", resumeContent);
      request.put("job_description", jobDescription);
      request.put("target_score", maxLength != null ? maxLength : 80);

      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/ats-resume", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for ATS optimization: " + e.getMessage());
      return new HashMap<>();
    }
  }

  public Map<String, Object> generateCoverLetter(
      String resumeContent, String jobDescription, String companyName, String position) {
    try {
      Map<String, Object> request = new HashMap<>();
      request.put("resume_text", resumeContent);
      request.put("job_description", jobDescription);
      request.put("company_name", companyName);
      request.put("position", position);

      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(
              aiServiceUrl + "/api/generate-cover-letter", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for cover letter generation: " + e.getMessage());
      return new HashMap<>();
    }
  }

  public Map<String, Object> getChatResponse(String message, Map<String, Object> context) {
    try {
      Map<String, Object> request = new HashMap<>();
      request.put("question", message);
      if (context != null) {
        request.put("user_context", context);
      }

      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(aiServiceUrl + "/api/chat", entity, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }

      return new HashMap<>();
    } catch (Exception e) {
      System.err.println("Error calling AI service for chat response: " + e.getMessage());
      return new HashMap<>();
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> normalizeResumeMetadata(Map<String, Object> body) {
    Map<String, Object> normalized = new HashMap<>(body);

    if (!normalized.containsKey("personal_info")
        && !normalized.containsKey("skills")
        && !normalized.containsKey("experience")) {
      Object rawResult = normalized.get("raw_result");
      if (rawResult != null) {
        normalized.put("summary", rawResult.toString());
      }
    }

    if (normalized.containsKey("insights") && normalized.get("insights") instanceof Map) {
      normalized.putAll((Map<String, Object>) normalized.get("insights"));
    }

    return normalized;
  }
}
