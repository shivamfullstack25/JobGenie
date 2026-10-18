package com.jobgenie.userservice.profile;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.PrePersist;
import javax.persistence.Table;
import javax.persistence.UniqueConstraint;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonBinaryType;

import lombok.Data;
import lombok.NoArgsConstructor;

/** Immutable full snapshot of a profile at one version number. Rollback copies, never rewrites. */
@Entity
@Table(
    name = "profile_versions",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "version"}))
@Data
@NoArgsConstructor
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class ProfileVersion {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(nullable = false)
  private int version;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb", nullable = false)
  private Map<String, Map<String, Object>> snapshot = new LinkedHashMap<>();

  /** {@code user}, or the name of the agent/import that made the change. */
  @Column(nullable = false)
  private String author;

  @Column(columnDefinition = "TEXT")
  private String reason;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  @PrePersist
  void onCreate() {
    createdAt = LocalDateTime.now();
  }
}
