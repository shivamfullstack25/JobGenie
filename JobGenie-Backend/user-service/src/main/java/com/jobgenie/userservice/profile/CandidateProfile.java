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
import javax.persistence.PreUpdate;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonBinaryType;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * The canonical record of who the candidate is. One per user. Every fact carries provenance,
 * source, confidence, last-updated and a verified-by-user flag; every accepted change is also
 * snapshotted as a {@link ProfileVersion}.
 */
@Entity
@Table(name = "candidate_profiles")
@Data
@NoArgsConstructor
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class CandidateProfile {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false, unique = true)
  private Long userId;

  @Column(name = "current_version", nullable = false)
  private int currentVersion;

  /** Field path (see {@link ProfileSchema}) to a fact map. */
  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb", nullable = false)
  private Map<String, Map<String, Object>> facts = new LinkedHashMap<>();

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  @PrePersist
  @PreUpdate
  void touch() {
    updatedAt = LocalDateTime.now();
  }
}
