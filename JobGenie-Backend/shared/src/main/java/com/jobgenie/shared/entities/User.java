package com.jobgenie.shared.entities;

import java.time.LocalDateTime;
import java.util.Map;

import javax.persistence.*;
import javax.validation.constraints.*;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonBinaryType;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class User {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Email
  @Column(nullable = false, unique = true)
  private String email;

  @Column(nullable = false)
  private String name;

  @Column private String phone;

  @Column private String avatar;

  @Column(name = "created_at")
  private LocalDateTime createdAt;

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  // Deliberately no @OneToMany to Resume here: User is a shared entity mapped against every
  // service's own "users" table, but only resume-service's database actually has a "resumes"
  // table. A JPA relationship spanning that boundary would try to cascade persist/delete
  // against a table that doesn't exist in the other services' databases. This field was never
  // read anywhere in the codebase — resume-service already looks up resumes by user_id
  // directly instead.

  @Column(name = "first_name")
  private String firstName;

  @Column(name = "last_name")
  private String lastName;

  @Column(name = "profile_image_url")
  private String profileImageUrl;

  @Column(columnDefinition = "TEXT")
  private String bio;

  @Column(name = "phone_number")
  private String phoneNumber;

  private String location;
  private String website;

  @Column(name = "linkedin_url")
  private String linkedinUrl;

  @Column(name = "github_url")
  private String githubUrl;

  @Column(name = "auth_provider")
  @Builder.Default
  private String authProvider = "local";

  @Column(name = "firebase_uid", unique = true)
  private String firebaseUid;

  @Builder.Default private String role = "user";

  @Column(name = "is_email_verified")
  @Builder.Default
  private Boolean isEmailVerified = false;

  @Column(name = "last_login_at")
  private LocalDateTime lastLoginAt;

  @Type(type = "jsonb")
  @Column(columnDefinition = "jsonb")
  private Map<String, Object> settings;

  // Custom methods
  public String getFullName() {
    if (firstName != null && lastName != null) {
      return firstName + " " + lastName;
    }
    return name;
  }

  public boolean isAdmin() {
    return "admin".equals(role);
  }

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
