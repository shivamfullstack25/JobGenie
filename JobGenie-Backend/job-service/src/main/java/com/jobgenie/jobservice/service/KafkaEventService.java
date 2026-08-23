package com.jobgenie.jobservice.service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(name = "spring.kafka.enabled", havingValue = "true")
public class KafkaEventService {

  private final KafkaTemplate<String, Object> kafkaTemplate;
  private final ObjectMapper objectMapper;

  // Topic names
  private static final String ATS_ANALYSIS_TOPIC = "ats-analysis-complete";
  private static final String SKILLS_ANALYSIS_TOPIC = "skills-analysis-complete";
  private static final String JOB_APPLICATION_TOPIC = "job-application-submitted";
  private static final String JOB_MATCH_TOPIC = "job-match-found";

  /** Listen for ATS analysis completion events from AI service */
  @KafkaListener(topics = ATS_ANALYSIS_TOPIC, groupId = "job-service-group")
  @SuppressWarnings("unchecked")
  public void handleATSAnalysisComplete(Map<String, Object> event) {
    try {
      log.info("Received ATS analysis completion event: {}", event);

      String userId = (String) event.get("userId");
      String resumeId = (String) event.get("resumeId");
      Integer atsScore = (Integer) event.get("atsScore");

      // Update user's job matching preferences based on ATS score
      if (atsScore != null && atsScore >= 80) {
        // Trigger enhanced job matching for high ATS score resumes
        publishJobMatchEvent(userId, resumeId, "high_ats_score", atsScore);
      }

      // Send real-time notification to user
      publishNotificationEvent(
          userId,
          "ats_analysis",
          String.format("ATS analysis complete! Your resume scored %d/100", atsScore));

    } catch (Exception e) {
      log.error("Error handling ATS analysis event: {}", e.getMessage(), e);
    }
  }

  /** Listen for skills analysis completion events from AI service */
  @KafkaListener(topics = SKILLS_ANALYSIS_TOPIC, groupId = "job-service-group")
  @SuppressWarnings("unchecked")
  public void handleSkillsAnalysisComplete(Map<String, Object> event) {
    try {
      log.info("Received skills analysis completion event: {}", event);

      String userId = (String) event.get("userId");
      String analysisType = (String) event.get("analysisType");
      Map<String, Object> skillsData = (Map<String, Object>) event.get("skillsData");

      // Update job search criteria based on skills analysis
      if (skillsData != null) {
        // Extract recommended job titles and skills
        publishJobMatchEvent(userId, null, "skills_updated", skillsData);
      }

    } catch (Exception e) {
      log.error("Error handling skills analysis event: {}", e.getMessage(), e);
    }
  }

  /** Publish job application submitted event */
  public void publishJobApplicationEvent(
      String userId, String jobId, String platform, String status) {
    try {
      Map<String, Object> event = new HashMap<>();
      event.put("userId", userId);
      event.put("jobId", jobId);
      event.put("platform", platform);
      event.put("status", status);
      event.put("timestamp", LocalDateTime.now().toString());
      event.put("eventType", "job_application");

      kafkaTemplate.send(JOB_APPLICATION_TOPIC, userId, event);
      log.info("Published job application event for user: {} job: {}", userId, jobId);

    } catch (Exception e) {
      log.error("Error publishing job application event: {}", e.getMessage(), e);
    }
  }

  /** Publish job match found event */
  public void publishJobMatchEvent(
      String userId, String resumeId, String matchType, Object matchData) {
    try {
      Map<String, Object> event = new HashMap<>();
      event.put("userId", userId);
      event.put("resumeId", resumeId);
      event.put("matchType", matchType);
      event.put("matchData", matchData);
      event.put("timestamp", LocalDateTime.now().toString());
      event.put("eventType", "job_match");

      kafkaTemplate.send(JOB_MATCH_TOPIC, userId, event);
      log.info("Published job match event for user: {} type: {}", userId, matchType);

    } catch (Exception e) {
      log.error("Error publishing job match event: {}", e.getMessage(), e);
    }
  }

  /** Publish notification event for WebSocket delivery */
  private void publishNotificationEvent(String userId, String type, String message) {
    try {
      Map<String, Object> notification = new HashMap<>();
      notification.put("userId", userId);
      notification.put("type", type);
      notification.put("message", message);
      notification.put("timestamp", LocalDateTime.now().toString());

      kafkaTemplate.send("user-notifications", userId, notification);
      log.info("Published notification event for user: {}", userId);

    } catch (Exception e) {
      log.error("Error publishing notification event: {}", e.getMessage(), e);
    }
  }

  /** Publish automation progress event */
  public void publishAutomationProgressEvent(
      String userId, String taskType, int progress, String status) {
    try {
      Map<String, Object> event = new HashMap<>();
      event.put("userId", userId);
      event.put("taskType", taskType);
      event.put("progress", progress);
      event.put("status", status);
      event.put("timestamp", LocalDateTime.now().toString());
      event.put("eventType", "automation_progress");

      kafkaTemplate.send("automation-progress", userId, event);
      log.info("Published automation progress event for user: {} progress: {}%", userId, progress);

    } catch (Exception e) {
      log.error("Error publishing automation progress event: {}", e.getMessage(), e);
    }
  }
}
