package com.jobgenie.userservice.profile;

import java.time.LocalDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.EnumType;
import javax.persistence.Enumerated;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.PrePersist;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonBinaryType;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A change software wanted to make to a fact the user has already vouched for. It waits here until
 * the user approves or rejects it; nothing about the profile changes in the meantime.
 */
@Entity
@Table(name = "profile_proposals")
@Data
@NoArgsConstructor
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class ProfileProposal {

  public enum Status {
    PENDING,
    APPROVED,
    REJECTED
  }

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(nullable = false)
  private String field;

  @Type(type = "jsonb")
  @Column(name = "proposed_value", columnDefinition = "jsonb")
  private Object proposedValue;

  @Type(type = "jsonb")
  @Column(name = "current_value", columnDefinition = "jsonb")
  private Object currentValue;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Provenance provenance;

  @Column(nullable = false)
  private String source;

  private Double confidence;

  @Column(columnDefinition = "TEXT")
  private String reason;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Status status = Status.PENDING;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  @Column(name = "decided_at")
  private LocalDateTime decidedAt;

  @PrePersist
  void onCreate() {
    createdAt = LocalDateTime.now();
  }
}
