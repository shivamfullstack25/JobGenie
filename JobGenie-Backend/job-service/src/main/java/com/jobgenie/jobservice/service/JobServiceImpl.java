package com.jobgenie.jobservice.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import com.jobgenie.jobservice.client.ResumeServiceClient;
import com.jobgenie.jobservice.repository.JobApplicationRepository;
import com.jobgenie.jobservice.repository.JobMatchRepository;
import com.jobgenie.jobservice.repository.JobRepository;
import com.jobgenie.shared.dto.JobApplicationDto;
import com.jobgenie.shared.dto.JobDto;
import com.jobgenie.shared.dto.JobMatchDto;
import com.jobgenie.shared.dto.ResumeDto;
import com.jobgenie.shared.entities.Job;
import com.jobgenie.shared.entities.JobApplication;
import com.jobgenie.shared.entities.JobMatch;
import com.jobgenie.shared.exception.JobGenieException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class JobServiceImpl implements JobService {

  @Value("${ai.service.url:http://ai-service:8000}")
  private String aiServiceUrl;

  private final RestTemplate restTemplate;
  private final JobRepository jobRepository;
  private final JobMatchRepository jobMatchRepository;
  private final JobApplicationRepository jobApplicationRepository;
  private final ResumeServiceClient resumeServiceClient;

  /**
   * Without an explicit JSON Content-Type, RestTemplate's converter selection could pick
   * jackson-dataformat-xml (when present on the classpath) over Jackson JSON for a raw Map body,
   * serializing requests to the AI service as XML instead of JSON and causing every AI call to fail
   * with a 422. Always force JSON explicitly.
   */
  private ResponseEntity<Map> postJson(String url, Map<String, Object> body) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    return restTemplate.postForEntity(url, new HttpEntity<>(body, headers), Map.class);
  }

  @Override
  @Transactional
  public List<JobDto> searchJobs(String keywords, String location, int page, int size) {
    try {
      log.info(
          "Searching jobs with keywords: {}, location: {}, page: {}, size: {}",
          keywords,
          location,
          page,
          size);

      Map<String, Object> request = new HashMap<>();
      request.put("keywords", parseKeywords(keywords));
      request.put("location", location != null && !location.isBlank() ? location : "Remote");
      request.put("max_jobs", size > 0 ? size : 20);

      ResponseEntity<Map> response = postJson(aiServiceUrl + "/api/search-jobs", request);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        Map<String, Object> result = response.getBody();
        List<Map<String, Object>> jobs =
            (List<Map<String, Object>>) result.getOrDefault("jobs", Collections.emptyList());

        if (jobs.isEmpty()) {
          throw new JobGenieException("No jobs found", "NO_JOBS_FOUND");
        }

        return jobs.stream()
            .map(this::persistJobFromAiResult)
            .map(this::mapEntityToDto)
            .collect(Collectors.toList());
      }
    } catch (JobGenieException e) {
      throw e;
    } catch (Exception e) {
      log.error("Failed to search jobs: {}", e.getMessage(), e);
      throw new JobGenieException("Failed to search jobs: " + e.getMessage(), "JOB_SEARCH_ERROR");
    }

    throw new JobGenieException("No jobs found", "NO_JOBS_FOUND");
  }

  @Override
  @Transactional
  public List<JobMatchDto> getJobMatches(String userId, String resumeId) {
    return getJobMatchesResponse(userId, resumeId).entrySet().stream()
        .filter(entry -> "matches".equals(entry.getKey()))
        .map(entry -> (List<Map<String, Object>>) entry.getValue())
        .findFirst()
        .orElse(Collections.emptyList())
        .stream()
        .map(this::mapStoredMatchToDto)
        .collect(Collectors.toList());
  }

  @Transactional
  @Override
  public Map<String, Object> getJobMatchesResponse(String userId, String resumeId) {
    try {
      Long userIdLong = Long.parseLong(userId);
      Long resumeIdLong = resumeId != null && !resumeId.isBlank() ? Long.parseLong(resumeId) : null;

      ResumeDto resume = resumeServiceClient.resolveResumeForUser(userIdLong, resumeIdLong);
      if (resume == null) {
        throw new JobGenieException("No resume found for user", "RESUME_NOT_FOUND");
      }

      Long effectiveResumeId = resume.getId();
      List<String> keywords =
          resumeServiceClient.buildSearchKeywords(
              resume, List.of("software engineer", "developer"));
      String location = resumeServiceClient.extractPreferredLocation(resume);

      Map<String, Object> request = new HashMap<>();
      request.put("keywords", keywords);
      request.put("location", location);
      request.put("max_jobs", 20);

      ResponseEntity<Map> response = postJson(aiServiceUrl + "/api/job-matches", request);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        Map<String, Object> result = response.getBody();
        List<Map<String, Object>> matches =
            (List<Map<String, Object>>) result.getOrDefault("matches", Collections.emptyList());

        List<Map<String, Object>> enrichedMatches = new ArrayList<>();
        for (Map<String, Object> matchData : matches) {
          Job job = persistJobFromAiResult(matchData);
          JobMatch jobMatch = persistJobMatch(job, userIdLong, effectiveResumeId, matchData);
          enrichedMatches.add(buildEnrichedMatchResponse(job, jobMatch, matchData));
        }

        if (enrichedMatches.isEmpty()) {
          enrichedMatches = loadStoredMatches(userIdLong, effectiveResumeId);
        }

        return Map.of(
            "status", "success", "total", enrichedMatches.size(), "matches", enrichedMatches);
      }
    } catch (JobGenieException e) {
      throw e;
    } catch (Exception e) {
      log.error("Failed to get job matches: {}", e.getMessage(), e);
      List<Map<String, Object>> stored = loadStoredMatchesSafe(userId, resumeId);
      if (!stored.isEmpty()) {
        return Map.of("status", "success", "total", stored.size(), "matches", stored);
      }
      throw new JobGenieException(
          "Failed to get job matches: " + e.getMessage(), "JOB_MATCH_ERROR");
    }

    throw new JobGenieException("No job matches found", "NO_JOB_MATCHES");
  }

  @Override
  public JobApplicationDto applyToJob(
      String jobId, String userId, String resumeId, String coverLetterId) {
    try {
      log.info(
          "Applying to job: jobId={}, userId={}, resumeId={}, coverLetterId={}",
          jobId,
          userId,
          resumeId,
          coverLetterId);

      if (jobApplicationRepository.existsByUserIdAndJobId(userId, jobId)) {
        throw new JobGenieException(
            "User has already applied to this job", "DUPLICATE_APPLICATION");
      }

      // The AI /api/auto-apply endpoint requires resume_content and cover_letter fields — it
      // does not accept bare IDs. Fetch the actual resume content from resume-service so the
      // application isn't submitted with nothing behind it.
      ResumeDto resume = resumeServiceClient.getResume(Long.parseLong(resumeId));
      String resumeContent = resume != null ? resume.getContent() : null;
      if (resumeContent == null || resumeContent.isBlank()) {
        throw new JobGenieException(
            "No resume content found for resumeId=" + resumeId, "RESUME_CONTENT_NOT_FOUND");
      }

      // Was hardcoded to "LinkedIn" regardless of where the job actually came from, mislabeling
      // every Indeed/Naukri/etc. application in the applications table and history UI.
      String platform =
          jobRepository
              .findByJobId(jobId)
              .map(Job::getPlatform)
              .filter(p -> p != null && !p.isBlank())
              .orElse("LinkedIn");

      Map<String, Object> request = new HashMap<>();
      request.put("job_id", jobId);
      request.put("platform", platform);
      request.put("user_id", userId);
      request.put("resume_id", resumeId);
      request.put("cover_letter_id", coverLetterId);
      request.put("resume_content", resumeContent);
      // resume-service's cover-letter generation endpoint has a parameter-order bug (out of
      // this vertical's scope — see JobGenie-Backend/resume-service) and can't be called
      // safely yet, and no cover-letter storage exists to resolve coverLetterId against. Send
      // an empty string rather than fabricate content that would look AI-generated when it
      // isn't.
      request.put("cover_letter", "");

      ResponseEntity<Map> response = postJson(aiServiceUrl + "/api/auto-apply", request);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        Map<String, Object> result = response.getBody();

        JobApplication application =
            JobApplication.builder()
                .jobId(jobId)
                .userId(userId)
                .resumeId(resumeId)
                .coverLetterId(coverLetterId)
                .platform(platform)
                .status("APPLIED")
                .appliedAt(LocalDateTime.now())
                .metadata(result)
                .build();

        JobApplication savedApplication = jobApplicationRepository.save(application);
        return mapToJobApplicationDto(savedApplication);
      }
    } catch (JobGenieException e) {
      throw e;
    } catch (Exception e) {
      log.error("Failed to apply to job: {}", e.getMessage(), e);
      throw new JobGenieException(
          "Failed to apply to job: " + e.getMessage(), "JOB_APPLICATION_ERROR");
    }

    throw new JobGenieException("Application failed", "APPLICATION_FAILED");
  }

  @Override
  public List<JobApplicationDto> getUserApplications(String userId, int page, int size) {
    log.info("Getting user applications for userId: {}, page: {}, size: {}", userId, page, size);

    try {
      Page<JobApplication> applicationsPage =
          jobApplicationRepository.findByUserId(userId, PageRequest.of(page - 1, size));

      return applicationsPage.getContent().stream()
          .map(this::mapToJobApplicationDto)
          .collect(Collectors.toList());
    } catch (Exception e) {
      log.error("Failed to get user applications: {}", e.getMessage(), e);
      throw new JobGenieException(
          "Failed to get user applications: " + e.getMessage(), "GET_APPLICATIONS_ERROR");
    }
  }

  @Override
  public Map<String, Object> startAutomation(String userId, Map<String, Object> config) {
    try {
      log.info("Starting automation for userId: {}", userId);

      Map<String, Object> request = new HashMap<>();
      request.put("user_id", userId);
      request.put("schedule_type", "daily");
      request.put("search_criteria", config);

      ResponseEntity<Map> response = postJson(aiServiceUrl + "/api/scheduler/setup", request);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }
    } catch (Exception e) {
      log.error("Failed to start automation: {}", e.getMessage(), e);
      throw new JobGenieException(
          "Failed to start automation: " + e.getMessage(), "AUTOMATION_START_ERROR");
    }

    throw new JobGenieException("Automation setup failed", "AUTOMATION_SETUP_FAILED");
  }

  @Override
  public Map<String, Object> getAutomationStatus(String userId) {
    try {
      log.info("Getting automation status for userId: {}", userId);

      ResponseEntity<Map> response =
          restTemplate.getForEntity(aiServiceUrl + "/api/schedule/user/" + userId, Map.class);

      if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
        return response.getBody();
      }
    } catch (Exception e) {
      log.error("Failed to get automation status: {}", e.getMessage(), e);
      throw new JobGenieException(
          "Failed to get automation status: " + e.getMessage(), "AUTOMATION_STATUS_ERROR");
    }

    throw new JobGenieException("Automation status not available", "AUTOMATION_STATUS_UNAVAILABLE");
  }

  @Override
  public long getJobMatchesCount() {
    log.info("Getting total job matches count");
    return jobMatchRepository.count();
  }

  @Override
  public long getJobApplicationsCount() {
    log.info("Getting total job applications count");
    return jobApplicationRepository.count();
  }

  private Job persistJobFromAiResult(Map<String, Object> jobData) {
    String externalJobId = stringValue(jobData.get("id"));
    if (externalJobId == null) {
      externalJobId = stringValue(jobData.get("job_id"));
    }
    if (externalJobId == null) {
      externalJobId =
          (stringValue(jobData.get("title")) + "_" + stringValue(jobData.get("company")))
              .replaceAll("\\s+", "_")
              .toLowerCase();
    }

    final String jobIdKey = externalJobId;
    Job job =
        jobRepository
            .findByJobId(jobIdKey)
            .orElseGet(
                () ->
                    Job.builder()
                        .jobId(jobIdKey)
                        .title(stringValue(jobData.get("title")))
                        .company(stringValue(jobData.get("company")))
                        .location(stringValue(jobData.get("location")))
                        .build());

    job.setTitle(stringValue(jobData.get("title")));
    job.setCompany(stringValue(jobData.get("company")));
    job.setLocation(
        stringValue(jobData.get("location")) != null
            ? stringValue(jobData.get("location"))
            : "Remote");
    job.setDescription(stringValue(jobData.get("description")));
    job.setSalary(stringValue(jobData.get("salary")));
    job.setType(stringValue(jobData.get("type")));
    job.setPlatform(stringValue(jobData.get("platform")));
    job.setUrl(stringValue(jobData.get("url")));
    job.setIsRemote(booleanValue(jobData.get("is_remote"), jobData.get("isRemote")));
    job.setExperienceLevel(stringValue(jobData.get("experience_level")));
    job.setMetadata(jobData);

    Object skillsObj = jobData.get("skills_required");
    if (skillsObj == null) {
      skillsObj = jobData.get("required_skills");
    }
    if (skillsObj instanceof List) {
      @SuppressWarnings("unchecked")
      List<String> skills = (List<String>) skillsObj;
      job.setRequiredSkills(skills);
    }

    return jobRepository.save(job);
  }

  private JobMatch persistJobMatch(
      Job job, Long userId, Long resumeId, Map<String, Object> matchData) {
    Integer matchScore = toInteger(matchData.get("match_score"), matchData.get("matchScore"));

    @SuppressWarnings("unchecked")
    List<String> matchingSkills =
        matchData.get("skills_required") instanceof List
            ? (List<String>) matchData.get("skills_required")
            : Collections.emptyList();

    Map<String, Object> matchReasons = new HashMap<>();
    matchReasons.put("reason", buildMatchReason(matchData));
    matchReasons.put("platform", job.getPlatform());

    return jobMatchRepository.save(
        JobMatch.builder()
            .job(job)
            .userId(userId)
            .resumeId(resumeId)
            .matchScore(matchScore)
            .matchingSkills(matchingSkills)
            .matchReasons(matchReasons)
            .build());
  }

  private Map<String, Object> buildEnrichedMatchResponse(
      Job job, JobMatch jobMatch, Map<String, Object> matchData) {
    Map<String, Object> enriched = new HashMap<>();
    enriched.put("id", job.getJobId());
    enriched.put("jobId", job.getJobId());
    enriched.put("title", job.getTitle());
    enriched.put("company", job.getCompany());
    enriched.put("location", job.getLocation());
    enriched.put("description", job.getDescription());
    enriched.put("salary", job.getSalary());
    enriched.put("platform", job.getPlatform());
    enriched.put("url", job.getUrl());
    enriched.put("remote", job.getIsRemote());
    enriched.put("matchScore", jobMatch.getMatchScore());
    enriched.put("matchPercentage", jobMatch.getMatchScore());
    enriched.put("matchingSkills", jobMatch.getMatchingSkills());
    enriched.put("recommendation", buildMatchReason(matchData));
    enriched.put("reason", buildMatchReason(matchData));
    enriched.put("resumeId", jobMatch.getResumeId());
    return enriched;
  }

  private List<Map<String, Object>> loadStoredMatches(Long userId, Long resumeId) {
    List<JobMatch> stored =
        resumeId != null
            ? jobMatchRepository.findByUserIdAndResumeIdOrderByMatchScoreDesc(userId, resumeId)
            : jobMatchRepository.findByUserIdOrderByCreatedAtDesc(userId);

    return stored.stream()
        .map(
            match ->
                buildEnrichedMatchResponse(
                    match.getJob(),
                    match,
                    match.getMatchReasons() != null ? match.getMatchReasons() : Map.of()))
        .collect(Collectors.toList());
  }

  private List<Map<String, Object>> loadStoredMatchesSafe(String userId, String resumeId) {
    try {
      Long userIdLong = Long.parseLong(userId);
      Long resumeIdLong = resumeId != null && !resumeId.isBlank() ? Long.parseLong(resumeId) : null;
      return loadStoredMatches(userIdLong, resumeIdLong);
    } catch (NumberFormatException e) {
      return Collections.emptyList();
    }
  }

  private JobMatchDto mapStoredMatchToDto(Map<String, Object> match) {
    return JobMatchDto.builder()
        .jobId(stringValue(match.get("jobId")))
        .matchScore(toDouble(match.get("matchScore")))
        .matchingSkills((List<String>) match.get("matchingSkills"))
        .recommendation(stringValue(match.get("recommendation")))
        .reason(stringValue(match.get("reason")))
        .build();
  }

  private List<String> parseKeywords(String keywords) {
    if (keywords == null || keywords.isBlank()) {
      return List.of("software engineer", "developer");
    }
    return Arrays.stream(keywords.split(","))
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .collect(Collectors.toList());
  }

  private JobDto mapEntityToDto(Job job) {
    return JobDto.builder()
        .id(job.getJobId())
        .title(job.getTitle())
        .company(job.getCompany())
        .location(job.getLocation())
        .description(job.getDescription())
        .salary(job.getSalary())
        .type(job.getType())
        .postedAt(job.getPostedAt())
        .requiredSkills(job.getRequiredSkills())
        .platform(job.getPlatform())
        .url(job.getUrl())
        .isRemote(job.getIsRemote())
        .experienceLevel(job.getExperienceLevel())
        .build();
  }

  private String buildMatchReason(Map<String, Object> matchData) {
    Object reasons = matchData.get("match_reasons");
    if (reasons != null) {
      return reasons.toString();
    }
    String company = stringValue(matchData.get("company"));
    String title = stringValue(matchData.get("title"));
    if (company != null && title != null) {
      return title + " at " + company;
    }
    return stringValue(matchData.get("reason"));
  }

  private String stringValue(Object value) {
    return value == null ? null : value.toString();
  }

  private Double toDouble(Object... values) {
    for (Object value : values) {
      if (value == null) {
        continue;
      }
      if (value instanceof Number) {
        return ((Number) value).doubleValue();
      }
      try {
        return Double.parseDouble(value.toString());
      } catch (NumberFormatException ignored) {
        // try next value
      }
    }
    return 0.0;
  }

  private Integer toInteger(Object... values) {
    for (Object value : values) {
      if (value == null) {
        continue;
      }
      if (value instanceof Number) {
        return ((Number) value).intValue();
      }
      try {
        return Integer.parseInt(value.toString());
      } catch (NumberFormatException ignored) {
        // try next value
      }
    }
    return 0;
  }

  private Boolean booleanValue(Object... values) {
    for (Object value : values) {
      if (value instanceof Boolean) {
        return (Boolean) value;
      }
      if (value != null) {
        return Boolean.parseBoolean(value.toString());
      }
    }
    return false;
  }

  private JobApplicationDto mapToJobApplicationDto(JobApplication application) {
    return JobApplicationDto.builder()
        .id(application.getId().toString())
        .jobId(application.getJobId())
        .userId(application.getUserId())
        .platform(application.getPlatform())
        .status(application.getStatus())
        .appliedAt(application.getAppliedAt())
        .build();
  }
}
