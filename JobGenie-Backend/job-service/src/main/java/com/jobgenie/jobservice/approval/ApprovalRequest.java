package com.jobgenie.jobservice.approval;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.EnumType;
import javax.persistence.Enumerated;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Index;
import javax.persistence.PrePersist;
import javax.persistence.PreUpdate;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonBinaryType;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * An application package waiting for a person's decision. Nothing about an application proceeds
 * until the user approves it here; the package itself is the AI service's proposal, plus any edits
 * the user made.
 */
@Entity
@Table(
    name = "approval_requests",
    indexes = @Index(name = "idx_approval_user_status", columnList = "user_id, status, created_at"))
@Data
@NoArgsConstructor
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class ApprovalRequest {

  public enum Status {
    PENDING,
    APPROVED,
    REJECTED,
    SAVED
  }

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private String userId;

  @Column(name = "job_id", nullable = false)
  private String jobId;

  @Column(name = "job_title")
  private String jobTitle;

  private String company;

  private String location;

  /** Where the job came from, e.g. {@code greenhouse}. */
  private String source;

  @Column(name = "application_url", columnDefinition = "TEXT")
  private String applicationUrl;

  /** The decision agent's verdict, e.g. APPLY_WITH_APPROVAL. */
  private String decision;

  @Column(name = "match_score")
  private Integer matchScore;

  @Column(name = "risk_level")
  private String riskLevel;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Status status = Status.PENDING;

  @Type(type = "jsonb")
  @Column(name = "package_data", columnDefinition = "jsonb", nullable = false)
  private Map<String, Object> packageData = new LinkedHashMap<>();

  @Column(name = "edited_by_user", nullable = false)
  private boolean editedByUser;

  /** Set once the request is approved and an application row exists. */
  @Column(name = "application_id")
  private Long applicationId;

  @Column(columnDefinition = "TEXT")
  private String note;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  @Column(name = "decided_at")
  private LocalDateTime decidedAt;

  @PrePersist
  void onCreate() {
    createdAt = LocalDateTime.now();
    updatedAt = createdAt;
  }

  @PreUpdate
  void onUpdate() {
    updatedAt = LocalDateTime.now();
  }
}
