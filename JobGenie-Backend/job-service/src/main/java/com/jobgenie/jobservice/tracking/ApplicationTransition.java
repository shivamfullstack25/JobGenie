package com.jobgenie.jobservice.tracking;

import java.time.LocalDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Index;
import javax.persistence.PrePersist;
import javax.persistence.Table;

import lombok.Data;
import lombok.NoArgsConstructor;

/** One step in an application's history. Append-only: rows are never updated or deleted. */
@Entity
@Table(
    name = "application_transitions",
    indexes = @Index(name = "idx_app_transitions_app", columnList = "application_id, created_at"))
@Data
@NoArgsConstructor
public class ApplicationTransition {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "application_id", nullable = false)
  private Long applicationId;

  @Column(name = "user_id", nullable = false)
  private String userId;

  /** Null for the first state an application is ever given. */
  @Column(name = "from_state")
  private String fromState;

  @Column(name = "to_state", nullable = false)
  private String toState;

  /** {@code user}, or the name of the process that moved it. */
  @Column(nullable = false)
  private String actor;

  @Column(columnDefinition = "TEXT")
  private String reason;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  @PrePersist
  void onCreate() {
    createdAt = LocalDateTime.now();
  }
}
