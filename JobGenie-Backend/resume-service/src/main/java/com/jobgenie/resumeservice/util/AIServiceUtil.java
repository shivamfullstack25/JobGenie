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

import lombok.extern.slf4j.Slf4j;

/**
 * Resume parsing at upload time. On-demand AI features (insights, ATS, cover letter, chat) go
 * through {@code AIServiceClient}.
 */
@Slf4j
@Component
public class AIServiceUtil {

  @Value("${ai.service.url:http://localhost:8000}")
  private String aiServiceUrl;

  private final RestTemplate restTemplate;

  public AIServiceUtil(RestTemplateBuilder builder) {
    this.restTemplate =
        builder
            .setConnectTimeout(Duration.ofSeconds(10))
            .setReadTimeout(Duration.ofSeconds(45))
            .build();
  }

  /** What one analysis of a resume produced: structured fields, plus the narrative insights. */
  public static final class Analysis {
    private final Map<String, Object> metadata;
    private final Map<String, Object> insights;

    Analysis(Map<String, Object> metadata, Map<String, Object> insights) {
      this.metadata = metadata;
      this.insights = insights;
    }

    public Map<String, Object> getMetadata() {
      return metadata;
    }

    public Map<String, Object> getInsights() {
      return insights;
    }
  }

  /**
   * Parses a resume with ONE call to the AI service. Upload used to make two calls with the same
   * text (a basic parse and a detailed one), paying for the LLM twice; the detailed response
   * already contains everything the basic one did, so both results now come from it. On failure
   * both parts are empty and the upload still succeeds without AI fields.
   */
  @SuppressWarnings("unchecked")
  public Analysis analyze(String resumeContent) {
    try {
      Map<String, Object> request = new HashMap<>();
      request.put("resume_text", resumeContent);
      request.put("detailed", true);
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      ResponseEntity<Map> response =
          restTemplate.postForEntity(
              aiServiceUrl + "/api/resume-insights", new HttpEntity<>(request, headers), Map.class);
      Map<String, Object> body = response.getBody();
      if (!response.getStatusCode().is2xxSuccessful() || body == null) {
        return new Analysis(new HashMap<>(), new HashMap<>());
      }
      return new Analysis(normalizeResumeMetadata(body), insightsFrom(body));
    } catch (Exception e) {
      log.warn("AI resume analysis failed: {}", e.getMessage());
      return new Analysis(new HashMap<>(), new HashMap<>());
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> insightsFrom(Map<String, Object> body) {
    Map<String, Object> insights = new HashMap<>();
    if (body.get("insights") instanceof Map) {
      insights.putAll((Map<String, Object>) body.get("insights"));
    } else if (body.get("analysis") instanceof Map) {
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

  @SuppressWarnings("unchecked")
  private static Map<String, Object> normalizeResumeMetadata(Map<String, Object> body) {
    Map<String, Object> normalized = new HashMap<>(body);
    if (!normalized.containsKey("personal_info")
        && !normalized.containsKey("skills")
        && !normalized.containsKey("experience")) {
      Object rawResult = normalized.get("raw_result");
      if (rawResult != null) {
        normalized.put("summary", rawResult.toString());
      }
    }
    if (normalized.get("insights") instanceof Map) {
      normalized.putAll((Map<String, Object>) normalized.get("insights"));
    }
    return normalized;
  }
}
