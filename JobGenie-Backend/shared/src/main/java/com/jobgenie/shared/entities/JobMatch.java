package com.jobgenie.shared.entities;

import java.time.LocalDateTime;
import java.util.List;
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
@Table(name = "job_matches")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class JobMatch {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "job_id", nullable = false)
  private Job job;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(name = "resume_id", nullable = false)
  private Long resumeId;

  @Column(name = "match_score")
  private Integer matchScore;

  @Type(type = "jsonb")
  @Column(name = "matching_skills", columnDefinition = "jsonb")
  private List<String> matchingSkills;

  @Type(type = "jsonb")
  @Column(name = "match_reasons", columnDefinition = "jsonb")
  private Map<String, Object> matchReasons;

  @Column(name = "created_at")
  private LocalDateTime createdAt;

  @PrePersist
  protected void onCreate() {
    createdAt = LocalDateTime.now();
  }
}
