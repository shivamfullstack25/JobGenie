package com.jobgenie.shared.entities;

import java.time.LocalDateTime;

import javax.persistence.*;

import lombok.*;

@Entity
@Table(name = "audit_logs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String userId;

  @Column(nullable = false)
  private String action;

  @Column(columnDefinition = "TEXT")
  private String details;

  @Column(nullable = false)
  private LocalDateTime timestamp;
}
