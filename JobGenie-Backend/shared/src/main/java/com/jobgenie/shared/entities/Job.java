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
@Table(name = "jobs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class Job {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "job_id", unique = true, nullable = false)
  private String jobId; // External job ID from job platforms

  @Column(nullable = false)
  private String title;

  @Column(nullable = false)
  private String company;

  @Column(nullable = false)
  private String location;

  @Column(columnDefinition = "TEXT")
  private String description;

  private String salary;

  private String type; // FULL_TIME, PART_TIME, CONTRACT, etc.

  @Column(name = "posted_at")
  private LocalDateTime postedAt;

  @ElementCollection
  @CollectionTable(name = "job_required_skills", joinColumns = @JoinColumn(name = "job_id"))
  @Column(name = "skill")
  private List<String> requiredSkills;

  private String platform; // LinkedIn, Indeed, etc.

  private String url;

  @Column(name = "is_remote")
  private Boolean isRemote;

  @Column(name = "experience_level")
  private String experienceLevel; // ENTRY, MID, SENIOR, etc.

  @Column(name = "created_at")
  private LocalDateTime createdAt;

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb")
  private Map<String, Object> metadata;

  @PrePersist
  protected void onCreate() {
    createdAt = LocalDateTime.now();
    updatedAt = LocalDateTime.now();
    postedAt = LocalDateTime.now();
  }

  @PreUpdate
  protected void onUpdate() {
    updatedAt = LocalDateTime.now();
  }
}
