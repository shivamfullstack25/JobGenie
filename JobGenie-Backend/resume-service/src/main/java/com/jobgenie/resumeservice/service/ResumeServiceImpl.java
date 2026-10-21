package com.jobgenie.resumeservice.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.jobgenie.resumeservice.dto.ResumeUploadResponse;
import com.jobgenie.resumeservice.repository.ResumeRepository;
import com.jobgenie.resumeservice.repository.UserRepository;
import com.jobgenie.resumeservice.util.AIServiceUtil;
import com.jobgenie.resumeservice.util.FileProcessor;
import com.jobgenie.shared.dto.ResumeDto;
import com.jobgenie.shared.entities.Resume;
import com.jobgenie.shared.entities.User;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class ResumeServiceImpl implements ResumeService {

  private final ResumeRepository resumeRepository;
  private final UserRepository userRepository;
  private final FileProcessor fileProcessor;
  private final AIServiceUtil aiServiceClient;

  @PersistenceContext private EntityManager entityManager;

  @Override
  @Transactional
  public ResumeUploadResponse uploadAndProcessResume(MultipartFile file, Long userId) {
    try {
      log.info(
          "Processing resume upload for userId: {}, fileName: {}",
          userId,
          file.getOriginalFilename());

      // Validate file
      if (file.isEmpty()) {
        log.warn("Empty file uploaded for userId: {}", userId);
        return ResumeUploadResponse.builder().success(false).error("File is empty").build();
      }

      // Get user — auto-provision a stub in resume-service DB if missing
      Optional<User> userOpt = userRepository.findById(userId);
      User user;
      if (userOpt.isEmpty()) {
        log.warn("User {} not found in resume DB — creating stub user for upload", userId);
        entityManager
            .createNativeQuery(
                "INSERT INTO users (id, email, name, auth_provider, created_at, updated_at) "
                    + "VALUES (?, ?, ?, 'synced', NOW(), NOW()) "
                    + "ON CONFLICT (id) DO NOTHING")
            .setParameter(1, userId)
            .setParameter(2, "user" + userId + "@jobgenie.local")
            .setParameter(3, "User " + userId)
            .executeUpdate();
        entityManager.flush();
        user =
            userRepository
                .findById(userId)
                .orElseThrow(() -> new RuntimeException("Failed to provision user " + userId));
      } else {
        user = userOpt.get();
      }

      // Process file content
      String content = fileProcessor.extractText(file);
      if (content == null || content.trim().isEmpty()) {
        log.warn("Could not extract text from file for userId: {}", userId);
        return ResumeUploadResponse.builder()
            .success(false)
            .error("Could not extract text from file")
            .build();
      }

      // Generate unique filename
      String originalFileName = file.getOriginalFilename();
      String fileExtension = originalFileName.substring(originalFileName.lastIndexOf("."));
      String fileName = UUID.randomUUID().toString() + fileExtension;

      // Create resume entity
      Resume resume =
          Resume.builder()
              .user(user)
              .fileName(fileName)
              .originalFileName(originalFileName)
              .content(content)
              .fileSize(file.getSize())
              .fileType(file.getContentType())
              .createdAt(LocalDateTime.now())
              .updatedAt(LocalDateTime.now())
              .isActive(true)
              .build();

      // Save resume
      Resume savedResume = resumeRepository.save(resume);
      log.info("Resume saved with id: {} for userId: {}", savedResume.getId(), userId);

      // Process with AI and return enriched resume data
      processResumeWithAI(savedResume);
      Resume refreshedResume = resumeRepository.findById(savedResume.getId()).orElse(savedResume);

      ResumeDto resumeDto = convertToDto(refreshedResume);

      return ResumeUploadResponse.builder()
          .success(true)
          .message("Resume uploaded successfully")
          .resume(resumeDto)
          .build();

    } catch (Exception e) {
      log.error("Error processing resume for userId: {}", userId, e);
      return ResumeUploadResponse.builder()
          .success(false)
          .error("Error processing resume: " + e.getMessage())
          .build();
    }
  }

  @Override
  public List<ResumeDto> getUserResumes(Long userId) {
    log.info("Getting resumes for userId: {}", userId);
    List<Resume> resumes = resumeRepository.findByUserIdAndIsActiveTrue(userId);
    return resumes.stream().map(this::convertToDto).collect(Collectors.toList());
  }

  @Override
  public ResumeDto getResume(Long resumeId) {
    log.info("Getting resume with id: {}", resumeId);
    Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
    return resumeOpt.map(this::convertToDto).orElse(null);
  }

  @Override
  public boolean deleteResume(Long resumeId) {
    log.info("Deleting resume with id: {}", resumeId);
    Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
    if (resumeOpt.isPresent()) {
      Resume resume = resumeOpt.get();
      resume.setIsActive(false);
      resumeRepository.save(resume);
      return true;
    }
    return false;
  }

  @Override
  public boolean activateResume(Long resumeId) {
    log.info("Activating resume with id: {}", resumeId);
    Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
    if (resumeOpt.isPresent()) {
      Resume resume = resumeOpt.get();
      resume.setIsActive(true);
      resumeRepository.save(resume);
      return true;
    }
    return false;
  }

  @Override
  public String getResumeContent(Long resumeId) {
    log.info("Getting resume content for id: {}", resumeId);
    Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
    return resumeOpt.map(Resume::getContent).orElse(null);
  }

  @Override
  public void updateParsedResumeData(Long userId, Map<String, Object> parsedData) {
    log.info("Updating parsed resume data for userId: {}", userId);
    try {
      // Find the latest active resume for the user
      List<Resume> userResumes = resumeRepository.findByUserIdAndIsActiveTrue(userId);
      if (!userResumes.isEmpty()) {
        Resume latestResume = userResumes.get(0);

        // Update metadata and structured fields from parsed data
        latestResume.setMetadata(parsedData);
        applyStructuredFieldsFromMetadata(latestResume, parsedData);
        latestResume.setUpdatedAt(LocalDateTime.now());

        resumeRepository.save(latestResume);
        log.info(
            "Updated parsed resume data for userId: {}, resumeId: {}",
            userId,
            latestResume.getId());
      } else {
        log.warn("No active resume found for userId: {}", userId);
      }
    } catch (Exception e) {
      log.error("Error updating parsed resume data for userId: {}", userId, e);
      throw new RuntimeException("Failed to update parsed resume data", e);
    }
  }

  @Override
  public long getResumeCount() {
    log.info("Getting total resume count");
    return resumeRepository.count();
  }

  private void processResumeWithAI(Resume resume) {
    // This would be called asynchronously in a real implementation
    try {
      log.info("Processing resume with AI for resumeId: {}", resume.getId());

      AIServiceUtil.Analysis analysis = aiServiceClient.analyze(resume.getContent());
      Map<String, Object> metadata = analysis.getMetadata();
      Map<String, Object> insights = analysis.getInsights();

      resume.setMetadata(metadata);
      resume.setInsights(insights);
      applyStructuredFieldsFromMetadata(resume, metadata);
      resume.setIsProcessed(true);

      resumeRepository.save(resume);
      log.info("AI processing completed for resumeId: {}", resume.getId());
    } catch (Exception e) {
      log.error("Error processing resume with AI for resumeId: {}", resume.getId(), e);
    }
  }

  @SuppressWarnings("unchecked")
  private void applyStructuredFieldsFromMetadata(Resume resume, Map<String, Object> metadata) {
    if (metadata == null) {
      return;
    }

    Object skills = metadata.get("skills");
    if (skills instanceof List) {
      resume.setSkills((List<String>) skills);
    }

    Object experience = metadata.get("experience");
    if (experience instanceof List) {
      resume.setExperience((List<Object>) experience);
    }

    Object education = metadata.get("education");
    if (education instanceof List) {
      resume.setEducation((List<Object>) education);
    }
  }

  /**
   * Experience/education list items are normally objects, but older records (or an LLM response
   * that didn't follow the expected shape) can contain plain strings — a blind cast there
   * previously threw and 500'd the entire resume list for one bad record.
   */
  private Map<String, Object> toStringObjectMap(Object obj) {
    if (obj instanceof Map) {
      @SuppressWarnings("unchecked")
      Map<String, Object> map = (Map<String, Object>) obj;
      return map;
    }
    return Map.of("description", String.valueOf(obj));
  }

  private ResumeDto convertToDto(Resume resume) {
    return ResumeDto.builder()
        .id(resume.getId())
        .userId(resume.getUser().getId())
        .fileName(resume.getFileName())
        .originalFileName(resume.getOriginalFileName())
        .content(resume.getContent())
        .metadata(resume.getMetadata())
        .insights(resume.getInsights())
        .skills(resume.getSkills())
        .experience(
            resume.getExperience() == null
                ? null
                : resume.getExperience().stream()
                    .map(this::toStringObjectMap)
                    .collect(Collectors.toList()))
        .education(
            resume.getEducation() == null
                ? null
                : resume.getEducation().stream()
                    .map(this::toStringObjectMap)
                    .collect(Collectors.toList()))
        .fileSize(resume.getFileSize())
        .fileType(resume.getFileType())
        .createdAt(resume.getCreatedAt())
        .updatedAt(resume.getUpdatedAt())
        .isActive(resume.getIsActive())
        .isProcessed(resume.getIsProcessed())
        .build();
  }
}
