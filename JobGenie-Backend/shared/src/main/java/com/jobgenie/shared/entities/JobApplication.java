package com.jobgenie.shared.entities;

import java.time.LocalDateTime;
import java.util.Map;

import javax.persistence.*;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonBinaryType;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "job_applications")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class JobApplication {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "job_id", nullable = false)
  private String jobId;

  @Column(name = "user_id", nullable = false)
  private String userId;

  @Column(name = "resume_id")
  private String resumeId;

  @Column(name = "cover_letter_id")
  private String coverLetterId;

  @Column(nullable = false)
  private String platform; // LinkedIn, Indeed, etc.

  @Column(nullable = false)
  private String status; // APPLIED, PENDING, ACCEPTED, REJECTED

  @Column(name = "applied_at", nullable = false)
  private LocalDateTime appliedAt;

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb")
  private Map<String, Object> metadata;

  @PrePersist
  protected void onCreate() {
    appliedAt = LocalDateTime.now();
    updatedAt = LocalDateTime.now();
  }

  @PreUpdate
  protected void onUpdate() {
    updatedAt = LocalDateTime.now();
  }
}
