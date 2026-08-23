package com.jobgenie.jobservice.service;

import java.util.List;

public interface JobService {
  List<com.jobgenie.shared.dto.JobDto> searchJobs(
      String keywords, String location, int page, int size);

  List<com.jobgenie.shared.dto.JobMatchDto> getJobMatches(String userId, String resumeId);

  java.util.Map<String, Object> getJobMatchesResponse(String userId, String resumeId);

  com.jobgenie.shared.dto.JobApplicationDto applyToJob(
      String jobId, String userId, String resumeId, String coverLetterId);

  List<com.jobgenie.shared.dto.JobApplicationDto> getUserApplications(
      String userId, int page, int size);

  java.util.Map<String, Object> startAutomation(
      String userId, java.util.Map<String, Object> config);

  java.util.Map<String, Object> getAutomationStatus(String userId);

  long getJobMatchesCount();

  long getJobApplicationsCount();
}
