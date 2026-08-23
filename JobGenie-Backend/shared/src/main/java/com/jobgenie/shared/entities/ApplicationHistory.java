package com.jobgenie.shared.entities;

import java.time.LocalDateTime;

import javax.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "application_history")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApplicationHistory {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "application_id", unique = true, nullable = false)
  private String applicationId;

  @Column(name = "user_id", nullable = false)
  private String userId;

  @Column(name = "schedule_id")
  private String scheduleId;

  @Column(name = "job_id", nullable = false)
  private String jobId;

  @Column(name = "job_title")
  private String jobTitle;

  @Column(name = "company_name")
  private String companyName;

  @Column(name = "job_url", columnDefinition = "TEXT")
  private String jobUrl;

  @Column(name = "platform", nullable = false)
  private String platform;

  @Column(name = "resume_id")
  private String resumeId;

  @Column(name = "cover_letter_id")
  private String coverLetterId;

  @Enumerated(EnumType.STRING)
  @Column(name = "application_method", nullable = false)
  private ApplicationMethod applicationMethod;

  @Enumerated(EnumType.STRING)
  @Column(name = "application_status", nullable = false)
  private ApplicationStatus applicationStatus;

  @Column(name = "match_score")
  private Integer matchScore;

  @Column(name = "salary_offered")
  private String salaryOffered;

  @Column(name = "location")
  private String location;

  @Column(name = "job_type")
  private String jobType;

  @Column(name = "experience_level")
  private String experienceLevel;

  @Column(name = "is_remote")
  private Boolean isRemote;

  @Column(name = "automation_success")
  private Boolean automationSuccess;

  @Column(name = "automation_error", columnDefinition = "TEXT")
  private String automationError;

  @Column(name = "browser_automation_used")
  private Boolean browserAutomationUsed;

  @Column(name = "captcha_encountered")
  private Boolean captchaEncountered;

  @Column(name = "captcha_solved")
  private Boolean captchaSolved;

  @Column(name = "oauth_login_required")
  private Boolean oauthLoginRequired;

  @Column(name = "multi_step_form")
  private Boolean multiStepForm;

  @Column(name = "external_portal_redirect")
  private Boolean externalPortalRedirect;

  @Column(name = "external_portal_url")
  private String externalPortalUrl;

  @Column(name = "application_time_seconds")
  private Integer applicationTimeSeconds;

  @Column(name = "retry_count")
  private Integer retryCount;

  @Column(name = "last_retry_at")
  private LocalDateTime lastRetryAt;

  @Column(name = "response_received")
  private Boolean responseReceived;

  @Column(name = "response_type")
  private String responseType; // REJECTION, INTERVIEW_INVITE, etc.

  @Column(name = "response_date")
  private LocalDateTime responseDate;

  @Column(name = "interview_scheduled")
  private Boolean interviewScheduled;

  @Column(name = "interview_date")
  private LocalDateTime interviewDate;

  @Column(name = "follow_up_required")
  private Boolean followUpRequired;

  @Column(name = "follow_up_date")
  private LocalDateTime followUpDate;

  @Column(name = "notes", columnDefinition = "TEXT")
  private String notes;

  @Column(name = "metadata", columnDefinition = "TEXT")
  private String metadata; // JSON object for additional data

  @Column(name = "notification_sent")
  private Boolean notificationSent;

  @Column(name = "email_notification_sent")
  private Boolean emailNotificationSent;

  @CreationTimestamp
  @Column(name = "applied_at", nullable = false, updatable = false)
  private LocalDateTime appliedAt;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  private LocalDateTime updatedAt;

  public enum ApplicationMethod {
    MANUAL,
    AUTO_APPLY_BASIC,
    AUTO_APPLY_ADVANCED,
    BROWSER_AUTOMATION,
    API_INTEGRATION
  }

  public enum ApplicationStatus {
    PENDING,
    SUBMITTED,
    DELIVERED,
    VIEWED,
    UNDER_REVIEW,
    INTERVIEW_SCHEDULED,
    REJECTED,
    ACCEPTED,
    WITHDRAWN,
    EXPIRED,
    ERROR,
    FAILED
  }
}
