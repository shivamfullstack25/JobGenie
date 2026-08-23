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
@Table(name = "resumes")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class Resume {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @Column(nullable = false)
  private String fileName;

  @Column(nullable = false)
  private String originalFileName;

  @Column(columnDefinition = "TEXT")
  private String content;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb")
  private Map<String, Object> metadata;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb")
  private Map<String, Object> insights;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb")
  private List<String> skills;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb")
  private List<Object> experience;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb")
  private List<Object> education;

  @Column(name = "file_size")
  private Long fileSize;

  @Column(name = "file_type")
  private String fileType;

  @Column(name = "mime_type")
  private String mimeType;

  @Column(name = "created_at")
  private LocalDateTime createdAt;

  @Column(name = "uploaded_at")
  private LocalDateTime uploadedAt;

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  @Column(name = "is_active")
  @Builder.Default
  private Boolean isActive = true;

  @Column(name = "is_processed")
  @Builder.Default
  private Boolean isProcessed = false;

  @PrePersist
  protected void onCreate() {
    createdAt = LocalDateTime.now();
    updatedAt = LocalDateTime.now();
  }

  @PreUpdate
  protected void onUpdate() {
    updatedAt = LocalDateTime.now();
  }
}
