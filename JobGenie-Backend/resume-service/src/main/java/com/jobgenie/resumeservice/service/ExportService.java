package com.jobgenie.resumeservice.service;

import java.util.List;

import org.springframework.core.io.Resource;

public interface ExportService {

  /** Export resume as PDF */
  Resource exportResumeToPdf(Long resumeId, String format);

  /** Export resume data as JSON */
  String exportResumeToJson(Long resumeId);

  /** Export multiple resumes as ZIP containing PDFs */
  Resource exportMultipleResumesToZip(List<Long> resumeIds);

  /** Export user's complete resume data as JSON */
  String exportUserResumeData(Long userId);

  /** Export resume analytics data */
  String exportResumeAnalytics(Long resumeId);

  /** Export ATS-optimized resume versions */
  Resource exportATSOptimizedResume(Long resumeId, String jobDescription);
}
