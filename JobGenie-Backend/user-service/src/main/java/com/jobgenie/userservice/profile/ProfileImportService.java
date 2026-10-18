package com.jobgenie.userservice.profile;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.jobgenie.shared.exception.JobGenieException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Brings outside material into a profile — always as inference or proposal, never as fact. */
@Service
@Slf4j
@RequiredArgsConstructor
public class ProfileImportService {

  /** Heuristic resume parsing is a good guess, not a certainty. */
  static final double RESUME_CONFIDENCE = 0.6;

  private final CandidateProfileService profileService;
  private final RestTemplate restTemplate;

  @Value("${resume.service.url:http://resume-service:8083}")
  private String resumeServiceUrl;

  /**
   * Reads the user's active resume from resume-service and records what it says as {@code INFERRED}
   * facts. Where the user has already stated something different, a proposal is raised instead.
   */
  @SuppressWarnings("unchecked")
  public Map<String, Object> importFromResume(Long userId) {
    List<Map<String, Object>> resumes;
    try {
      resumes = restTemplate.getForObject(resumeServiceUrl + "/api/resumes/user/" + userId, List.class);
    } catch (Exception e) {
      log.warn("Could not reach resume-service for user {}: {}", userId, e.getMessage());
      throw new JobGenieException("Resume service is unavailable", "RESUME_SERVICE_UNAVAILABLE", 503);
    }
    if (resumes == null || resumes.isEmpty()) {
      throw new JobGenieException("Upload a resume first", "NO_RESUME", 404);
    }
    Map<String, Object> resume = resumes.get(0);
    for (Map<String, Object> candidate : resumes) {
      if (Boolean.TRUE.equals(candidate.get("isActive"))) {
        resume = candidate;
        break;
      }
    }
    String source = "resume:" + resume.get("id");

    Map<String, Object> personal = new LinkedHashMap<>();
    Object metadata = resume.get("metadata");
    if (metadata instanceof Map && ((Map<?, ?>) metadata).get("personal_info") instanceof Map) {
      personal = (Map<String, Object>) ((Map<?, ?>) metadata).get("personal_info");
    }

    Map<String, Object> candidates = new LinkedHashMap<>();
    candidates.put("identity.fullName", personal.get("name"));
    candidates.put("contact.email", personal.get("email"));
    candidates.put("contact.phone", personal.get("phone"));
    candidates.put("location.current", personal.get("location"));
    candidates.put("skills", cleanStrings(resume.get("skills")));
    candidates.put("experience", asObjects(resume.get("experience")));
    candidates.put("education", asObjects(resume.get("education")));

    List<CandidateProfileService.ChangeResult> results = new ArrayList<>();
    for (Map.Entry<String, Object> entry : candidates.entrySet()) {
      Object value = entry.getValue();
      if (ProfileSchema.isMissing(value)) {
        continue;
      }
      results.add(
          profileService.setByAgent(
              userId,
              entry.getKey(),
              value,
              Provenance.INFERRED,
              source,
              RESUME_CONFIDENCE,
              "Imported from resume"));
    }
    return summarize(results, new ArrayList<>());
  }

  /**
   * Applies a master-profile YAML. With {@code confirm=false} (the default) it is treated like any
   * other outside source: values become INFERRED, and any claim of {@code FACT} inside the file is
   * ignored. With {@code confirm=true} the signed-in user is declaring the file to be their own
   * statement, so values are recorded as their facts.
   */
  public Map<String, Object> importYaml(Long userId, String yaml, boolean confirm) {
    ProfileYaml.Parsed parsed = ProfileYaml.parse(yaml);
    List<CandidateProfileService.ChangeResult> results = new ArrayList<>();
    for (ProfileYaml.Entry entry : parsed.entries) {
      if (confirm) {
        results.add(
            profileService.setByUser(userId, entry.field, entry.value, "Imported from master-profile.yaml"));
      } else {
        Provenance provenance =
            entry.claimedProvenance == Provenance.AI_GENERATED
                ? Provenance.AI_GENERATED
                : Provenance.INFERRED;
        results.add(
            profileService.setByAgent(
                userId,
                entry.field,
                entry.value,
                provenance,
                "master-profile.yaml",
                entry.confidence == null ? 0.5 : entry.confidence,
                "Imported from master-profile.yaml"));
      }
    }
    return summarize(results, parsed.errors);
  }

  private static Map<String, Object> summarize(
      List<CandidateProfileService.ChangeResult> results, List<String> errors) {
    int applied = 0;
    int proposed = 0;
    int unchanged = 0;
    for (CandidateProfileService.ChangeResult result : results) {
      switch (result.getOutcome()) {
        case APPLIED:
          applied++;
          break;
        case PROPOSED:
          proposed++;
          break;
        default:
          unchanged++;
      }
    }
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("applied", applied);
    summary.put("proposed", proposed);
    summary.put("unchanged", unchanged);
    summary.put("errors", errors);
    return summary;
  }

  private static List<String> cleanStrings(Object raw) {
    List<String> out = new ArrayList<>();
    if (raw instanceof List) {
      for (Object item : (List<?>) raw) {
        if (item != null && !item.toString().trim().isEmpty()) {
          out.add(item.toString().trim());
        }
      }
    }
    return out;
  }

  /** Resume sections hold objects, but older records hold plain strings. */
  private static List<Object> asObjects(Object raw) {
    List<Object> out = new ArrayList<>();
    if (raw instanceof List) {
      for (Object item : (List<?>) raw) {
        if (item instanceof Map) {
          if (!((Map<?, ?>) item).isEmpty()) {
            out.add(item);
          }
        } else if (item != null && !item.toString().trim().isEmpty()) {
          Map<String, Object> wrapped = new LinkedHashMap<>();
          wrapped.put("description", item.toString().trim());
          out.add(wrapped);
        }
      }
    }
    return out;
  }
}
