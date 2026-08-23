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
@Table(name = "notification_history")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationHistory {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "notification_id", unique = true, nullable = false)
  private String notificationId;

  @Column(name = "user_id", nullable = false)
  private String userId;

  @Enumerated(EnumType.STRING)
  @Column(name = "notification_type", nullable = false)
  private NotificationType notificationType;

  @Enumerated(EnumType.STRING)
  @Column(name = "delivery_channel", nullable = false)
  private DeliveryChannel deliveryChannel;

  @Column(name = "title", nullable = false)
  private String title;

  @Column(name = "message", columnDefinition = "TEXT", nullable = false)
  private String message;

  @Column(name = "html_content", columnDefinition = "TEXT")
  private String htmlContent;

  @Column(name = "recipient_email")
  private String recipientEmail;

  @Column(name = "recipient_phone")
  private String recipientPhone;

  @Column(name = "subject")
  private String subject;

  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false)
  private NotificationStatus status;

  @Column(name = "priority")
  private Integer priority; // 1 = highest, 5 = lowest

  @Column(name = "category")
  private String category; // job_match, application_status, system_alert, etc.

  @Column(name = "related_entity_type")
  private String relatedEntityType; // job, application, schedule, etc.

  @Column(name = "related_entity_id")
  private String relatedEntityId;

  @Column(name = "template_name")
  private String templateName;

  @Column(name = "template_data", columnDefinition = "TEXT")
  private String templateData; // JSON data used for template rendering

  @Column(name = "is_read")
  private Boolean isRead;

  @Column(name = "read_at")
  private LocalDateTime readAt;

  @Column(name = "sent_at")
  private LocalDateTime sentAt;

  @Column(name = "delivered_at")
  private LocalDateTime deliveredAt;

  @Column(name = "failed_at")
  private LocalDateTime failedAt;

  @Column(name = "retry_count")
  private Integer retryCount;

  @Column(name = "max_retries")
  private Integer maxRetries;

  @Column(name = "next_retry_at")
  private LocalDateTime nextRetryAt;

  @Column(name = "error_message", columnDefinition = "TEXT")
  private String errorMessage;

  @Column(name = "external_message_id")
  private String externalMessageId; // ID from email service, SMS service, etc.

  @Column(name = "tracking_data", columnDefinition = "TEXT")
  private String trackingData; // JSON object for tracking information

  @Column(name = "action_buttons", columnDefinition = "TEXT")
  private String actionButtons; // JSON array of action buttons

  @Column(name = "action_taken")
  private String actionTaken;

  @Column(name = "action_taken_at")
  private LocalDateTime actionTakenAt;

  @Column(name = "expires_at")
  private LocalDateTime expiresAt;

  @Column(name = "metadata", columnDefinition = "TEXT")
  private String metadata; // JSON object for additional data

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private LocalDateTime createdAt;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  private LocalDateTime updatedAt;

  public enum NotificationType {
    JOB_MATCH,
    APPLICATION_SENT,
    APPLICATION_STATUS_UPDATE,
    SCHEDULE_COMPLETED,
    SCHEDULE_FAILED,
    ATS_RESUME_GENERATED,
    COVER_LETTER_GENERATED,
    AUTOMATION_SUMMARY,
    SYSTEM_ALERT,
    ERROR_NOTIFICATION,
    WELCOME,
    REMINDER,
    PROMOTIONAL,
    SECURITY_ALERT
  }

  public enum DeliveryChannel {
    EMAIL,
    SMS,
    PUSH_NOTIFICATION,
    IN_APP,
    WEBSOCKET,
    WEBHOOK
  }

  public enum NotificationStatus {
    PENDING,
    SENT,
    DELIVERED,
    READ,
    FAILED,
    EXPIRED,
    CANCELLED,
    RETRY_SCHEDULED
  }
}
