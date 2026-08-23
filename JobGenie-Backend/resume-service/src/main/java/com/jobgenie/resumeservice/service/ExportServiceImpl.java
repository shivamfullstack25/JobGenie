package com.jobgenie.resumeservice.service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.itextpdf.html2pdf.HtmlConverter;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.jobgenie.resumeservice.repository.ResumeRepository;
import com.jobgenie.shared.entities.Resume;
import com.jobgenie.shared.exception.ResumeNotFoundException;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class ExportServiceImpl implements ExportService {

  @Autowired private ResumeRepository resumeRepository;

  @Autowired private ObjectMapper objectMapper;

  @Override
  public Resource exportResumeToPdf(Long resumeId, String format) {
    log.info("Exporting resume {} to PDF format: {}", resumeId, format);

    try {
      Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
      if (resumeOpt.isEmpty()) {
        throw ResumeNotFoundException.forResumeId(String.valueOf(resumeId));
      }

      Resume resume = resumeOpt.get();

      ByteArrayOutputStream baos = new ByteArrayOutputStream();
      PdfWriter writer = new PdfWriter(baos);
      PdfDocument pdf = new PdfDocument(writer);
      Document document = new Document(pdf);

      // Generate HTML content based on format
      String htmlContent = generateResumeHtml(resume, format);

      // Convert HTML to PDF using iText7
      HtmlConverter.convertToPdf(htmlContent, baos);

      log.info("Successfully exported resume {} to PDF", resumeId);
      return new ByteArrayResource(baos.toByteArray());

    } catch (ResumeNotFoundException e) {
      // Let this propagate with its 404 status instead of being flattened into a
      // generic 500 by the catch-all below (that was the previous behavior: exporting
      // a nonexistent resume returned "500 Internal Server Error" instead of 404).
      throw e;
    } catch (Exception e) {
      log.error("Error exporting resume {} to PDF: {}", resumeId, e.getMessage(), e);
      throw new RuntimeException("Failed to export resume to PDF", e);
    }
  }

  @Override
  public String exportResumeToJson(Long resumeId) {
    log.info("Exporting resume {} to JSON", resumeId);

    try {
      Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
      if (resumeOpt.isEmpty()) {
        throw ResumeNotFoundException.forResumeId(String.valueOf(resumeId));
      }

      Resume resume = resumeOpt.get();

      // Resume#uploadedAt/mimeType are separate DB columns from createdAt/fileType and are
      // never populated by the upload flow (ResumeServiceImpl only sets createdAt/fileType),
      // so reading them always exported null instead of the real upload date/type.
      Map<String, Object> exportData = new HashMap<>();
      exportData.put("id", resume.getId());
      exportData.put("fileName", resume.getFileName());
      exportData.put("uploadedAt", resume.getCreatedAt());
      exportData.put("metadata", resume.getMetadata());
      exportData.put("isActive", resume.getIsActive());
      exportData.put("fileSize", resume.getFileSize());
      exportData.put("mimeType", resume.getFileType());
      exportData.put("exportedAt", LocalDateTime.now());
      exportData.put("exportVersion", "1.0");

      String json = objectMapper.writeValueAsString(exportData);
      log.info("Successfully exported resume {} to JSON", resumeId);
      return json;

    } catch (ResumeNotFoundException e) {
      throw e;
    } catch (Exception e) {
      log.error("Error exporting resume {} to JSON: {}", resumeId, e.getMessage(), e);
      throw new RuntimeException("Failed to export resume to JSON", e);
    }
  }

  @Override
  public Resource exportMultipleResumesToZip(List<Long> resumeIds) {
    log.info("Exporting {} resumes to ZIP", resumeIds.size());

    try {
      ByteArrayOutputStream baos = new ByteArrayOutputStream();
      ZipOutputStream zipOut = new ZipOutputStream(baos);

      for (Long resumeId : resumeIds) {
        try {
          Resource pdfResource = exportResumeToPdf(resumeId, "professional");

          Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
          String fileName =
              resumeOpt.isPresent()
                  ? resumeOpt.get().getFileName().replaceFirst("[.][^.]+$", "") + ".pdf"
                  : "resume_" + resumeId + ".pdf";

          ZipEntry zipEntry = new ZipEntry(fileName);
          zipOut.putNextEntry(zipEntry);
          zipOut.write(pdfResource.getInputStream().readAllBytes());
          zipOut.closeEntry();

        } catch (Exception e) {
          log.warn("Failed to include resume {} in ZIP: {}", resumeId, e.getMessage());
        }
      }

      zipOut.close();
      log.info("Successfully created ZIP with {} resumes", resumeIds.size());
      return new ByteArrayResource(baos.toByteArray());

    } catch (Exception e) {
      log.error("Error creating ZIP export: {}", e.getMessage(), e);
      throw new RuntimeException("Failed to create ZIP export", e);
    }
  }

  @Override
  public String exportUserResumeData(Long userId) {
    log.info("Exporting all resume data for user {}", userId);

    try {
      List<Resume> userResumes = resumeRepository.findByUserId(userId);

      Map<String, Object> exportData = new HashMap<>();
      exportData.put("userId", userId);
      exportData.put("exportedAt", LocalDateTime.now());
      exportData.put("totalResumes", userResumes.size());

      List<Map<String, Object>> resumesData = new ArrayList<>();
      for (Resume resume : userResumes) {
        Map<String, Object> resumeData = new HashMap<>();
        resumeData.put("id", resume.getId());
        resumeData.put("fileName", resume.getFileName());
        resumeData.put("uploadedAt", resume.getCreatedAt());
        resumeData.put("metadata", resume.getMetadata());
        resumeData.put("isActive", resume.getIsActive());
        resumesData.add(resumeData);
      }

      exportData.put("resumes", resumesData);

      String json = objectMapper.writeValueAsString(exportData);
      log.info("Successfully exported data for {} resumes of user {}", userResumes.size(), userId);
      return json;

    } catch (Exception e) {
      log.error("Error exporting user {} resume data: {}", userId, e.getMessage(), e);
      throw new RuntimeException("Failed to export user resume data", e);
    }
  }

  @Override
  public String exportResumeAnalytics(Long resumeId) {
    log.info("Exporting analytics for resume {}", resumeId);

    try {
      Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
      if (resumeOpt.isEmpty()) {
        throw ResumeNotFoundException.forResumeId(String.valueOf(resumeId));
      }

      Resume resume = resumeOpt.get();
      Map<String, Object> metadata = resume.getMetadata();

      Map<String, Object> analytics = new HashMap<>();
      analytics.put("resumeId", resumeId);
      analytics.put("fileName", resume.getFileName());
      analytics.put("uploadedAt", resume.getCreatedAt());
      analytics.put("fileSize", resume.getFileSize());
      analytics.put("analysisData", metadata);
      analytics.put("exportedAt", LocalDateTime.now());

      // Add some computed analytics
      if (metadata != null) {
        analytics.put("skillsCount", getSkillsCount(metadata));
        analytics.put("experienceYears", getExperienceYears(metadata));
        analytics.put("educationLevel", getEducationLevel(metadata));
        analytics.put("atsScore", getATSScore(metadata));
      }

      String json = objectMapper.writeValueAsString(analytics);
      log.info("Successfully exported analytics for resume {}", resumeId);
      return json;

    } catch (ResumeNotFoundException e) {
      throw e;
    } catch (Exception e) {
      log.error("Error exporting analytics for resume {}: {}", resumeId, e.getMessage(), e);
      throw new RuntimeException("Failed to export resume analytics", e);
    }
  }

  @Override
  public Resource exportATSOptimizedResume(Long resumeId, String jobDescription) {
    log.info("Exporting ATS-optimized resume {} for job description", resumeId);

    try {
      Optional<Resume> resumeOpt = resumeRepository.findById(resumeId);
      if (resumeOpt.isEmpty()) {
        throw ResumeNotFoundException.forResumeId(String.valueOf(resumeId));
      }

      Resume resume = resumeOpt.get();

      // Generate ATS-optimized version
      String optimizedHtml = generateATSOptimizedHtml(resume, jobDescription);

      ByteArrayOutputStream baos = new ByteArrayOutputStream();
      HtmlConverter.convertToPdf(optimizedHtml, baos);

      log.info("Successfully exported ATS-optimized resume {}", resumeId);
      return new ByteArrayResource(baos.toByteArray());

    } catch (ResumeNotFoundException e) {
      throw e;
    } catch (Exception e) {
      log.error("Error exporting ATS-optimized resume {}: {}", resumeId, e.getMessage(), e);
      throw new RuntimeException("Failed to export ATS-optimized resume", e);
    }
  }

  private String generateResumeHtml(Resume resume, String format) {
    StringBuilder html = new StringBuilder();
    html.append("<!DOCTYPE html><html><head>");
    html.append("<meta charset='UTF-8'>");
    html.append("<style>");
    html.append("body { font-family: Arial, sans-serif; margin: 20px; }");
    html.append("h1 { color: #2c3e50; border-bottom: 2px solid #3498db; }");
    html.append("h2 { color: #34495e; margin-top: 25px; }");
    html.append(".section { margin-bottom: 20px; }");
    html.append(
        ".skills { display: inline-block; margin: 2px; padding: 4px 8px; background: #ecf0f1; border-radius: 3px; }");
    html.append("</style></head><body>");

    Map<String, Object> metadata = resume.getMetadata();
    if (metadata != null) {
      html.append("<h1>")
          .append(getStringValue(metadata, "name", "Professional Resume"))
          .append("</h1>");
      html.append("<div class='section'>");
      html.append("<h2>Contact Information</h2>");
      html.append("<p>Email: ").append(getStringValue(metadata, "email", "N/A")).append("</p>");
      html.append("<p>Phone: ").append(getStringValue(metadata, "phone", "N/A")).append("</p>");
      html.append("<p>Location: ")
          .append(getStringValue(metadata, "location", "N/A"))
          .append("</p>");
      html.append("</div>");

      // Add more sections based on metadata
      addSectionToHtml(html, "Skills", metadata, "skills");
      addSectionToHtml(html, "Experience", metadata, "experience");
      addSectionToHtml(html, "Education", metadata, "education");
    }

    html.append("<hr><p><small>Generated on ")
        .append(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
        .append("</small></p>");
    html.append("</body></html>");

    return html.toString();
  }

  private String generateATSOptimizedHtml(Resume resume, String jobDescription) {
    // Similar to generateResumeHtml but optimized for ATS scanning
    StringBuilder html = new StringBuilder();
    html.append("<!DOCTYPE html><html><head>");
    html.append("<meta charset='UTF-8'>");
    html.append("<style>");
    html.append("body { font-family: 'Times New Roman', serif; margin: 20px; line-height: 1.4; }");
    html.append("h1, h2 { font-weight: bold; }");
    html.append(".ats-section { margin-bottom: 15px; }");
    html.append("</style></head><body>");

    Map<String, Object> metadata = resume.getMetadata();
    if (metadata != null) {
      html.append("<h1>").append(getStringValue(metadata, "name", "John Doe")).append("</h1>");
      html.append("<div class='ats-section'>");
      html.append(getStringValue(metadata, "email", "")).append(" | ");
      html.append(getStringValue(metadata, "phone", "")).append(" | ");
      html.append(getStringValue(metadata, "location", ""));
      html.append("</div>");

      // ATS-optimized sections
      addATSSectionToHtml(html, "PROFESSIONAL SUMMARY", metadata, "summary");
      addATSSectionToHtml(html, "CORE COMPETENCIES", metadata, "skills");
      addATSSectionToHtml(html, "PROFESSIONAL EXPERIENCE", metadata, "experience");
      addATSSectionToHtml(html, "EDUCATION", metadata, "education");
    }

    html.append("</body></html>");
    return html.toString();
  }

  private void addSectionToHtml(
      StringBuilder html, String sectionTitle, Map<String, Object> metadata, String key) {
    Object value = metadata.get(key);
    if (value != null) {
      html.append("<div class='section'>");
      html.append("<h2>").append(sectionTitle).append("</h2>");
      if (value instanceof List) {
        List<?> items = (List<?>) value;
        for (Object item : items) {
          html.append("<p>").append(item.toString()).append("</p>");
        }
      } else {
        html.append("<p>").append(value.toString()).append("</p>");
      }
      html.append("</div>");
    }
  }

  private void addATSSectionToHtml(
      StringBuilder html, String sectionTitle, Map<String, Object> metadata, String key) {
    Object value = metadata.get(key);
    if (value != null) {
      html.append("<div class='ats-section'>");
      html.append("<h2>").append(sectionTitle).append("</h2>");
      if (value instanceof List) {
        List<?> items = (List<?>) value;
        for (Object item : items) {
          html.append("<p>").append(item.toString()).append("</p>");
        }
      } else {
        html.append("<p>").append(value.toString()).append("</p>");
      }
      html.append("</div>");
    }
  }

  private String getStringValue(Map<String, Object> map, String key, String defaultValue) {
    Object value = map.get(key);
    return value != null ? value.toString() : defaultValue;
  }

  private int getSkillsCount(Map<String, Object> metadata) {
    Object skills = metadata.get("skills");
    if (skills instanceof List) {
      return ((List<?>) skills).size();
    }
    return 0;
  }

  private String getExperienceYears(Map<String, Object> metadata) {
    Object experience = metadata.get("experience");
    if (experience != null) {
      String expStr = experience.toString().toLowerCase();

      // Try to extract years from experience text using patterns
      if (expStr.contains("10+") || expStr.contains("10 years") || expStr.contains("decade")) {
        return "10+ years";
      } else if (expStr.contains("8") || expStr.contains("9")) {
        return "8-9 years";
      } else if (expStr.contains("5") || expStr.contains("6") || expStr.contains("7")) {
        return "5-7 years";
      } else if (expStr.contains("3") || expStr.contains("4")) {
        return "3-4 years";
      } else if (expStr.contains("1")
          || expStr.contains("2")
          || expStr.contains("junior")
          || expStr.contains("entry")) {
        return "1-2 years";
      } else if (expStr.contains("fresh")
          || expStr.contains("graduate")
          || expStr.contains("intern")) {
        return "0-1 years";
      }

      // Fallback: try to count work experiences if they're in list format
      if (experience instanceof List) {
        List<?> experiences = (List<?>) experience;
        int count = experiences.size();
        if (count >= 5) return "10+ years";
        if (count >= 3) return "5-7 years";
        if (count >= 2) return "3-4 years";
        return "1-2 years";
      }

      return "Multiple years";
    }
    return "Not specified";
  }

  private String getEducationLevel(Map<String, Object> metadata) {
    Object education = metadata.get("education");
    if (education != null) {
      String eduStr = education.toString().toLowerCase();
      if (eduStr.contains("phd") || eduStr.contains("doctorate")) return "Doctorate";
      if (eduStr.contains("master") || eduStr.contains("mba")) return "Master's";
      if (eduStr.contains("bachelor") || eduStr.contains("degree")) return "Bachelor's";
      return "Other";
    }
    return "Not specified";
  }

  private double getATSScore(Map<String, Object> metadata) {
    // Simple ATS score calculation based on completeness
    double score = 0.0;
    String[] requiredFields = {"name", "email", "phone", "skills", "experience"};

    for (String field : requiredFields) {
      if (metadata.containsKey(field) && metadata.get(field) != null) {
        score += 20.0; // Each field worth 20 points
      }
    }

    return score;
  }
}
