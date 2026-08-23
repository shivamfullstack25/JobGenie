package com.jobgenie.resumeservice.controller;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.jobgenie.resumeservice.client.AIServiceClient;
import com.jobgenie.resumeservice.dto.ResumeUploadResponse;
import com.jobgenie.resumeservice.service.ExportService;
import com.jobgenie.resumeservice.service.ResumeService;
import com.jobgenie.shared.dto.ResumeDto;
import com.jobgenie.shared.exception.ResumeNotFoundException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api/resumes")
@Tag(name = "Resume Management", description = "Resume upload, processing, and management APIs")
@CrossOrigin(origins = "*")
public class ResumeController {

  @Autowired private ResumeService resumeService;
  @Autowired private AIServiceClient aiServiceClient;
  @Autowired private ExportService exportService;

  @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @Operation(
      summary = "Upload and process resume",
      description = "Upload a resume file and extract metadata")
  public ResponseEntity<ResumeUploadResponse> uploadResume(
      @RequestParam("file") MultipartFile file, @RequestParam("userId") Long userId) {
    log.info(
        "Received resume upload for userId={}, fileName={}", userId, file.getOriginalFilename());
    try {
      ResumeUploadResponse response = resumeService.uploadAndProcessResume(file, userId);
      log.info("Resume upload processed for userId={}, success={}", userId, response.isSuccess());
      return ResponseEntity.ok(response);
    } catch (Exception e) {
      log.error("Error uploading resume for userId={}: {}", userId, e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(ResumeUploadResponse.builder().success(false).error(e.getMessage()).build());
    }
  }

  @GetMapping("/user/{userId}")
  @Operation(summary = "Get user resumes", description = "Retrieve all resumes for a specific user")
  public ResponseEntity<List<ResumeDto>> getUserResumes(@PathVariable Long userId) {
    List<ResumeDto> resumes = resumeService.getUserResumes(userId);
    return ResponseEntity.ok(resumes);
  }

  @GetMapping("/{resumeId}")
  @Operation(
      summary = "Get resume details",
      description = "Retrieve detailed information about a specific resume")
  public ResponseEntity<ResumeDto> getResume(@PathVariable Long resumeId) {
    ResumeDto resume = resumeService.getResume(resumeId);
    if (resume != null) {
      return ResponseEntity.ok(resume);
    } else {
      return ResponseEntity.notFound().build();
    }
  }

  @DeleteMapping("/{resumeId}")
  @Operation(summary = "Delete resume", description = "Delete a specific resume")
  public ResponseEntity<Void> deleteResume(@PathVariable Long resumeId) {
    boolean deleted = resumeService.deleteResume(resumeId);
    if (deleted) {
      return ResponseEntity.ok().build();
    } else {
      return ResponseEntity.notFound().build();
    }
  }

  @PutMapping("/{resumeId}/activate")
  @Operation(summary = "Activate resume", description = "Set a resume as active")
  public ResponseEntity<Void> activateResume(@PathVariable Long resumeId) {
    boolean activated = resumeService.activateResume(resumeId);
    if (activated) {
      return ResponseEntity.ok().build();
    } else {
      return ResponseEntity.notFound().build();
    }
  }

  @GetMapping("/{resumeId}/content")
  @Operation(summary = "Get resume content", description = "Retrieve the text content of a resume")
  public ResponseEntity<String> getResumeContent(@PathVariable Long resumeId) {
    String content = resumeService.getResumeContent(resumeId);
    if (content != null) {
      return ResponseEntity.ok(content);
    } else {
      return ResponseEntity.notFound().build();
    }
  }

  @PutMapping("/parsed")
  @Operation(
      summary = "Update parsed resume data",
      description = "Update the latest active resume for a user with reviewed parsed data")
  @SuppressWarnings("unchecked")
  public ResponseEntity<Void> updateParsedResumeData(
      @RequestParam Long userId, @RequestBody Map<String, Object> parsedData) {
    log.info("Received request to update parsed resume data for userId={}", userId);
    try {
      resumeService.updateParsedResumeData(userId, parsedData);
      log.info("Successfully updated parsed resume data for userId={}", userId);
      return ResponseEntity.ok().build();
    } catch (Exception e) {
      log.error("Failed to update parsed resume data for userId={}: {}", userId, e.getMessage(), e);
      return ResponseEntity.status(500).build();
    }
  }

  @GetMapping("/health")
  @Operation(summary = "Health check", description = "Check if the resume service is healthy")
  public ResponseEntity<String> health() {
    return ResponseEntity.ok("Resume Service is healthy");
  }

  @GetMapping("/count")
  @Operation(
      summary = "Get total resume count",
      description = "Get the total number of uploaded resumes")
  public ResponseEntity<Map<String, Object>> getResumeCount() {
    log.info("Getting total resume count");
    try {
      long count = resumeService.getResumeCount();
      return ResponseEntity.ok(Map.of("count", count));
    } catch (Exception e) {
      log.error("Error getting resume count: {}", e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("count", 0, "error", e.getMessage()));
    }
  }

  // Export Endpoints
  @GetMapping("/{resumeId}/export/pdf")
  @Operation(summary = "Export resume as PDF", description = "Export a resume as a PDF document")
  public ResponseEntity<Resource> exportResumeToPdf(
      @Parameter(description = "Resume ID") @PathVariable Long resumeId,
      @Parameter(description = "Format template") @RequestParam(defaultValue = "professional")
          String format) {
    log.info("Exporting resume {} to PDF format: {}", resumeId, format);
    try {
      Resource pdfResource = exportService.exportResumeToPdf(resumeId, format);
      return ResponseEntity.ok()
          .header(
              HttpHeaders.CONTENT_DISPOSITION,
              "attachment; filename=\"resume_" + resumeId + ".pdf\"")
          .contentType(MediaType.APPLICATION_PDF)
          .body(pdfResource);
    } catch (ResumeNotFoundException e) {
      log.warn("PDF export requested for missing resume {}", resumeId);
      return ResponseEntity.notFound().build();
    } catch (Exception e) {
      log.error("Error exporting resume {} to PDF: {}", resumeId, e.getMessage(), e);
      return ResponseEntity.status(500).build();
    }
  }

  @GetMapping("/{resumeId}/export/json")
  @Operation(summary = "Export resume as JSON", description = "Export resume data as JSON")
  public ResponseEntity<String> exportResumeToJson(
      @Parameter(description = "Resume ID") @PathVariable Long resumeId) {
    log.info("Exporting resume {} to JSON", resumeId);
    try {
      String jsonData = exportService.exportResumeToJson(resumeId);
      return ResponseEntity.ok()
          .header(
              HttpHeaders.CONTENT_DISPOSITION,
              "attachment; filename=\"resume_" + resumeId + ".json\"")
          .contentType(MediaType.APPLICATION_JSON)
          .body(jsonData);
    } catch (ResumeNotFoundException e) {
      log.warn("JSON export requested for missing resume {}", resumeId);
      return ResponseEntity.status(404).body("{\"error\":\"Resume not found\"}");
    } catch (Exception e) {
      log.error("Error exporting resume {} to JSON: {}", resumeId, e.getMessage(), e);
      return ResponseEntity.status(500).body("{\"error\":\"Export failed\"}");
    }
  }

  @PostMapping("/export/bulk")
  @Operation(
      summary = "Export multiple resumes as ZIP",
      description = "Export multiple resumes as a ZIP file containing PDFs")
  public ResponseEntity<Resource> exportMultipleResumes(
      @Parameter(description = "List of resume IDs") @RequestBody List<Long> resumeIds) {
    log.info("Exporting {} resumes to ZIP", resumeIds.size());
    try {
      Resource zipResource = exportService.exportMultipleResumesToZip(resumeIds);
      return ResponseEntity.ok()
          .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"resumes_export.zip\"")
          .contentType(MediaType.APPLICATION_OCTET_STREAM)
          .body(zipResource);
    } catch (Exception e) {
      log.error("Error exporting multiple resumes: {}", e.getMessage(), e);
      return ResponseEntity.status(500).build();
    }
  }

  @GetMapping("/user/{userId}/export")
  @Operation(
      summary = "Export user resume data",
      description = "Export all resume data for a user as JSON")
  public ResponseEntity<String> exportUserResumeData(
      @Parameter(description = "User ID") @PathVariable Long userId) {
    log.info("Exporting all resume data for user {}", userId);
    try {
      String jsonData = exportService.exportUserResumeData(userId);
      return ResponseEntity.ok()
          .header(
              HttpHeaders.CONTENT_DISPOSITION,
              "attachment; filename=\"user_" + userId + "_resumes.json\"")
          .contentType(MediaType.APPLICATION_JSON)
          .body(jsonData);
    } catch (Exception e) {
      log.error("Error exporting user {} resume data: {}", userId, e.getMessage(), e);
      return ResponseEntity.status(500).body("{\"error\":\"Export failed\"}");
    }
  }

  @GetMapping("/{resumeId}/analytics/export")
  @Operation(
      summary = "Export resume analytics",
      description = "Export detailed analytics for a resume as JSON")
  public ResponseEntity<String> exportResumeAnalytics(
      @Parameter(description = "Resume ID") @PathVariable Long resumeId) {
    log.info("Exporting analytics for resume {}", resumeId);
    try {
      String analyticsData = exportService.exportResumeAnalytics(resumeId);
      return ResponseEntity.ok()
          .header(
              HttpHeaders.CONTENT_DISPOSITION,
              "attachment; filename=\"resume_" + resumeId + "_analytics.json\"")
          .contentType(MediaType.APPLICATION_JSON)
          .body(analyticsData);
    } catch (ResumeNotFoundException e) {
      log.warn("Analytics export requested for missing resume {}", resumeId);
      return ResponseEntity.status(404).body("{\"error\":\"Resume not found\"}");
    } catch (Exception e) {
      log.error("Error exporting analytics for resume {}: {}", resumeId, e.getMessage(), e);
      return ResponseEntity.status(500).body("{\"error\":\"Export failed\"}");
    }
  }

  @PostMapping("/{resumeId}/export/ats")
  @Operation(
      summary = "Export ATS-optimized resume",
      description = "Export an ATS-optimized version of the resume as PDF")
  public ResponseEntity<Resource> exportATSOptimizedResume(
      @Parameter(description = "Resume ID") @PathVariable Long resumeId,
      @Parameter(description = "Job description for optimization") @RequestBody
          String jobDescription) {
    log.info("Exporting ATS-optimized resume {} for job description", resumeId);
    try {
      Resource pdfResource = exportService.exportATSOptimizedResume(resumeId, jobDescription);
      return ResponseEntity.ok()
          .header(
              HttpHeaders.CONTENT_DISPOSITION,
              "attachment; filename=\"resume_" + resumeId + "_ats_optimized.pdf\"")
          .contentType(MediaType.APPLICATION_PDF)
          .body(pdfResource);
    } catch (ResumeNotFoundException e) {
      log.warn("ATS-optimized export requested for missing resume {}", resumeId);
      return ResponseEntity.notFound().build();
    } catch (Exception e) {
      log.error("Error exporting ATS-optimized resume {}: {}", resumeId, e.getMessage(), e);
      return ResponseEntity.status(500).build();
    }
  }

  @PostMapping("/insights")
  @Operation(
      summary = "Get AI-powered resume insights",
      description = "Analyze resume and provide detailed insights and recommendations")
  @SuppressWarnings("unchecked")
  public ResponseEntity<Map<String, Object>> getResumeInsights(
      @RequestBody Map<String, Object> request) {
    log.info("Getting AI-powered resume insights");
    try {
      String resumeText = (String) request.get("resumeText");
      Boolean detailed = (Boolean) request.get("detailed");
      String jobDescription = (String) request.get("jobDescription");

      Map<String, Object> insights =
          aiServiceClient.getResumeInsights(resumeText, detailed, jobDescription);
      return ResponseEntity.ok(insights);
    } catch (Exception e) {
      log.error("Error getting resume insights: {}", e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(Map.of("error", "Failed to get resume insights: " + e.getMessage()));
    }
  }

  @PostMapping("/optimize-ats")
  @Operation(
      summary = "Optimize resume for ATS",
      description = "Optimize resume content for Applicant Tracking Systems")
  @SuppressWarnings("unchecked")
  public ResponseEntity<Map<String, Object>> optimizeForATS(
      @RequestBody Map<String, Object> request) {
    log.info("Optimizing resume for ATS");
    try {
      String resumeContent = (String) request.get("resumeContent");
      String jobDescription = (String) request.get("jobDescription");
      Integer targetScore = (Integer) request.get("targetScore");

      Map<String, Object> optimization =
          aiServiceClient.optimizeForATS(resumeContent, jobDescription, targetScore);
      return ResponseEntity.ok(optimization);
    } catch (Exception e) {
      log.error("Error optimizing resume for ATS: {}", e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(Map.of("error", "Failed to optimize resume: " + e.getMessage()));
    }
  }

  @PostMapping("/generate-cover-letter")
  @Operation(
      summary = "Generate AI cover letter",
      description = "Generate personalized cover letter based on job and resume")
  @SuppressWarnings("unchecked")
  public ResponseEntity<Map<String, Object>> generateCoverLetter(
      @RequestBody Map<String, Object> request) {
    log.info("Generating AI cover letter");
    try {
      String resumeContent = (String) request.get("resumeContent");
      String jobDescription = (String) request.get("jobDescription");
      String companyName = (String) request.get("companyName");
      String position = (String) request.get("position");
      String tone = (String) request.get("tone");

      Map<String, Object> coverLetter =
          aiServiceClient.generateCoverLetter(
              resumeContent, jobDescription, companyName, position, tone);
      return ResponseEntity.ok(coverLetter);
    } catch (Exception e) {
      log.error("Error generating cover letter: {}", e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(Map.of("error", "Failed to generate cover letter: " + e.getMessage()));
    }
  }

  @PostMapping("/chat")
  @Operation(
      summary = "Chat with AI resume assistant",
      description = "Get personalized career advice and answers about your resume")
  @SuppressWarnings("unchecked")
  public ResponseEntity<Map<String, Object>> chatWithAI(@RequestBody Map<String, Object> request) {
    log.info("Processing AI chat request");
    try {
      String message = (String) request.get("message");
      Map<String, Object> context = (Map<String, Object>) request.get("context");

      Map<String, Object> response = aiServiceClient.getChatResponse(message, context);
      return ResponseEntity.ok(response);
    } catch (Exception e) {
      log.error("Error in AI chat: {}", e.getMessage(), e);
      return ResponseEntity.status(500)
          .body(Map.of("error", "Failed to process chat: " + e.getMessage()));
    }
  }
}
