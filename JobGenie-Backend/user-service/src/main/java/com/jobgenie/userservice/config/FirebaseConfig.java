package com.jobgenie.userservice.config;

import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import javax.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class FirebaseConfig {

  @Value("${firebase.project-id:jobgenie-d95c7}")
  private String projectId;

  @Value("${firebase.service-account-key:firebase-service-account.json}")
  private String serviceAccountKeyPath;

  @PostConstruct
  public void initFirebase() {
    try {
      if (!FirebaseApp.getApps().isEmpty()) {
        log.info("Firebase Admin SDK already initialized");
        return;
      }

      InputStream serviceAccount = openServiceAccountStream(serviceAccountKeyPath);
      if (serviceAccount == null) {
        log.warn(
            "Firebase credentials not found at {} — auth will use local JWT fallback",
            serviceAccountKeyPath);
        return;
      }

      FirebaseOptions options =
          FirebaseOptions.builder()
              .setCredentials(GoogleCredentials.fromStream(serviceAccount))
              .setProjectId(projectId)
              .build();
      FirebaseApp.initializeApp(options);
      log.info("Firebase Admin SDK initialized for project: {}", projectId);
    } catch (Exception e) {
      log.warn(
          "Firebase initialization failed ({}). Local JWT auth fallback enabled.", e.getMessage());
    }
  }

  private InputStream openServiceAccountStream(String keyPath) {
    try {
      Path filesystemPath = Paths.get(keyPath);
      if (filesystemPath.isAbsolute() && Files.isRegularFile(filesystemPath)) {
        return new FileInputStream(filesystemPath.toFile());
      }
      if (Files.isRegularFile(Paths.get(keyPath))) {
        return new FileInputStream(keyPath);
      }
      ClassPathResource resource = new ClassPathResource(keyPath);
      if (resource.exists()) {
        return resource.getInputStream();
      }
    } catch (Exception e) {
      log.debug("Could not open Firebase credentials: {}", e.getMessage());
    }
    return null;
  }
}
