package com.jobgenie.shared.exception;

/** Exception thrown when a resume is not found */
public class ResumeNotFoundException extends JobGenieException {

  public ResumeNotFoundException(String message) {
    super(message, "RESUME_NOT_FOUND", 404);
  }

  public static ResumeNotFoundException forResumeId(String resumeId) {
    return new ResumeNotFoundException("Resume not found with ID: " + resumeId);
  }
}
