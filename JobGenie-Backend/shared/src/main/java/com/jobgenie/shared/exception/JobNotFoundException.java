package com.jobgenie.shared.exception;

/** Exception thrown when a job is not found */
public class JobNotFoundException extends JobGenieException {

  public JobNotFoundException(String message) {
    super(message, "JOB_NOT_FOUND", 404);
  }

  public static JobNotFoundException forJobId(String jobId) {
    return new JobNotFoundException("Job not found with ID: " + jobId);
  }
}
