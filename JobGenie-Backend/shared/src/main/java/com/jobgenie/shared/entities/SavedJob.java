package com.jobgenie.shared.entities;

import java.time.LocalDateTime;

import javax.persistence.*;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
    name = "saved_jobs",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "job_id"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SavedJob {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(name = "job_id", nullable = false)
  private String jobId;

  private String title;
  private String company;
  private String location;
  private String platform;
  private String url;

  @Column(name = "match_score")
  private Integer matchScore;

  @Column(name = "saved_at")
  private LocalDateTime savedAt;

  @PrePersist
  protected void onCreate() {
    savedAt = LocalDateTime.now();
  }
}
