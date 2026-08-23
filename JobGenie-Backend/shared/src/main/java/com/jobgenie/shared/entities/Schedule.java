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
@Table(name = "schedules")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Schedule {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "schedule_id", unique = true, nullable = false)
  private String scheduleId;

  @Column(name = "user_id", nullable = false)
  private String userId;

  @Enumerated(EnumType.STRING)
  @Column(name = "schedule_type", nullable = false)
  private ScheduleType scheduleType;

  @Enumerated(EnumType.STRING)
  @Column(name = "frequency", nullable = false)
  private ScheduleFrequency frequency;

  @Column(name = "search_time")
  private String searchTime;

  @Column(name = "platforms", columnDefinition = "TEXT")
  private String platforms; // JSON array of platform names

  @Column(name = "keywords", columnDefinition = "TEXT")
  private String keywords; // JSON array of search keywords

  @Column(name = "location")
  private String location;

  @Column(name = "max_jobs_per_search")
  private Integer maxJobsPerSearch;

  @Column(name = "max_applications_per_run")
  private Integer maxApplicationsPerRun;

  @Column(name = "min_match_score")
  private Integer minMatchScore;

  @Column(name = "filters", columnDefinition = "TEXT")
  private String filters; // JSON object with additional filters

  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false)
  private ScheduleStatus status;

  @Column(name = "auto_apply_enabled")
  private Boolean autoApplyEnabled;

  @Column(name = "require_cover_letter")
  private Boolean requireCoverLetter;

  @Column(name = "last_run_at")
  private LocalDateTime lastRunAt;

  @Column(name = "next_run_at")
  private LocalDateTime nextRunAt;

  @Column(name = "total_runs")
  private Integer totalRuns;

  @Column(name = "successful_runs")
  private Integer successfulRuns;

  @Column(name = "total_applications")
  private Integer totalApplications;

  @Column(name = "successful_applications")
  private Integer successfulApplications;

  @Column(name = "cron_expression")
  private String cronExpression;

  @Column(name = "metadata", columnDefinition = "TEXT")
  private String metadata; // JSON object for additional data

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private LocalDateTime createdAt;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  private LocalDateTime updatedAt;

  public enum ScheduleType {
    JOB_SEARCH,
    AUTO_APPLY,
    COMBINED
  }

  public enum ScheduleFrequency {
    HOURLY,
    DAILY,
    TWICE_DAILY,
    WEEKLY,
    MONTHLY,
    CUSTOM
  }

  public enum ScheduleStatus {
    ACTIVE,
    PAUSED,
    STOPPED,
    ERROR
  }
}
