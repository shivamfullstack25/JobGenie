package com.jobgenie.jobservice.approval;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.jobgenie.jobservice.repository.JobApplicationRepository;
import com.jobgenie.jobservice.tracking.ApplicationLifecycle;
import com.jobgenie.jobservice.tracking.ApplicationTracker;
import com.jobgenie.shared.entities.JobApplication;
import com.jobgenie.shared.exception.JobGenieException;

import lombok.RequiredArgsConstructor;

/**
 * The human approval gate. A package the AI service prepares sits here, unchanged by software,
 * until its owner approves, edits, saves or rejects it. Approving creates the application in
 * {@code READY_TO_SUBMIT}; it never moves it to {@code SUBMITTED}, because JobGenie does not submit
 * — the user applies on the employer's site and then says so.
 */
@Service
@RequiredArgsConstructor
public class ApprovalService {

  /** Packages are a few KB; this only stops someone using the endpoint as free storage. */
  static final int MAX_PACKAGE_CHARS = 400_000;

  private final ApprovalRequestRepository requests;
  private final JobApplicationRepository applications;
  private final ApplicationTracker tracker;

  // ----------------------------------------------------------------------------- create

  @Transactional
  public ApprovalRequest submit(String userId, Map<String, Object> pkg) {
    Map<String, Object> job = map(pkg.get("job"));
    String jobId = str(job.get("job_id"));
    if (jobId == null) {
      throw bad("The package has no job to apply to", "INVALID_PACKAGE");
    }
    if (pkg.toString().length() > MAX_PACKAGE_CHARS) {
      throw new JobGenieException("Package is too large", "PACKAGE_TOO_LARGE", 413);
    }
    String decision = str(pkg.get("decision"));
    if ("DO_NOT_APPLY".equals(decision)) {
      throw new JobGenieException(
          "JobGenie advises against applying: " + firstReason(pkg), "DO_NOT_APPLY", 409);
    }
    if ("MISSING_INFORMATION".equals(decision)) {
      throw new JobGenieException(
          "Complete the missing information first: " + firstReason(pkg), "MISSING_INFORMATION", 409);
    }
    if (applications.existsByUserIdAndJobId(userId, jobId)) {
      throw new JobGenieException("You have already applied to this job", "DUPLICATE_APPLICATION", 409);
    }

    // A second package for the same job replaces the pending one rather than stacking up.
    ApprovalRequest request =
        requests
            .findFirstByUserIdAndJobIdAndStatusIn(
                userId, jobId, EnumSet.of(ApprovalRequest.Status.PENDING, ApprovalRequest.Status.SAVED))
            .orElseGet(ApprovalRequest::new);
    request.setUserId(userId);
    request.setJobId(jobId);
    request.setJobTitle(str(job.get("title")));
    request.setCompany(str(job.get("company")));
    request.setLocation(str(job.get("location")));
    request.setSource(str(job.get("source")));
    request.setApplicationUrl(str(map(pkg.get("submission")).get("url")));
    request.setDecision(decision);
    Object score = map(pkg.get("match")).get("match_score");
    request.setMatchScore(score instanceof Number ? ((Number) score).intValue() : null);
    request.setRiskLevel(str(map(pkg.get("safety")).get("level")));
    request.setStatus(ApprovalRequest.Status.PENDING);
    request.setPackageData(new LinkedHashMap<>(pkg));
    request.setEditedByUser(false);
    return requests.save(request);
  }

  // ------------------------------------------------------------------------- reads

  public List<ApprovalRequest> list(String userId, ApprovalRequest.Status status) {
    return status == null
        ? requests.findByUserIdOrderByCreatedAtDesc(userId)
        : requests.findByUserIdAndStatusOrderByCreatedAtDesc(userId, status);
  }

  public ApprovalRequest get(String userId, Long id) {
    return owned(userId, id);
  }

  // ------------------------------------------------------------------------ decisions

  /**
   * @param action APPROVE | REJECT | SAVE | EDIT
   * @param edits for EDIT: {@code coverLetterText}, {@code recruiterMessage}, and {@code answers}
   *     (a list of {question, answer}); these are the user's own words and replace the draft's.
   */
  @Transactional
  public ApprovalRequest decide(String userId, Long id, String action, Map<String, Object> edits, String note) {
    ApprovalRequest request = owned(userId, id);
    if (request.getStatus() == ApprovalRequest.Status.APPROVED
        || request.getStatus() == ApprovalRequest.Status.REJECTED) {
      throw new JobGenieException("This request was already decided", "ALREADY_DECIDED", 409);
    }
    String verb = action == null ? "" : action.trim().toUpperCase();
    switch (verb) {
      case "EDIT":
        applyEdits(request, edits);
        return requests.save(request);
      case "SAVE":
        request.setStatus(ApprovalRequest.Status.SAVED);
        request.setNote(note);
        return requests.save(request);
      case "REJECT":
        request.setStatus(ApprovalRequest.Status.REJECTED);
        request.setNote(note);
        request.setDecidedAt(LocalDateTime.now());
        return requests.save(request);
      case "APPROVE":
        return approve(request, note);
      default:
        throw bad("action must be APPROVE, EDIT, SAVE or REJECT", "INVALID_ACTION");
    }
  }

  private ApprovalRequest approve(ApprovalRequest request, String note) {
    if (applications.existsByUserIdAndJobId(request.getUserId(), request.getJobId())) {
      throw new JobGenieException("You have already applied to this job", "DUPLICATE_APPLICATION", 409);
    }
    Map<String, Object> metadata = new LinkedHashMap<>();
    metadata.put("approvalRequestId", request.getId());
    metadata.put("editedByUser", request.isEditedByUser());

    JobApplication application =
        JobApplication.builder()
            .jobId(request.getJobId())
            .userId(request.getUserId())
            .platform(request.getSource() == null ? "Unknown" : request.getSource())
            .status(ApplicationLifecycle.READY_TO_SUBMIT)
            .metadata(metadata)
            .build();
    JobApplication saved = applications.save(application);
    tracker.recordInitial(saved, "user", "Package approved");

    request.setStatus(ApprovalRequest.Status.APPROVED);
    request.setApplicationId(saved.getId());
    request.setNote(note);
    request.setDecidedAt(LocalDateTime.now());
    return requests.save(request);
  }

  @SuppressWarnings("unchecked")
  private void applyEdits(ApprovalRequest request, Map<String, Object> edits) {
    if (edits == null || edits.isEmpty()) {
      throw bad("Nothing to edit", "NO_EDITS");
    }
    Map<String, Object> pkg = new LinkedHashMap<>(request.getPackageData());
    if (edits.get("coverLetterText") instanceof String) {
      Map<String, Object> letter = new LinkedHashMap<>(map(pkg.get("cover_letter")));
      letter.put("text", edits.get("coverLetterText"));
      pkg.put("cover_letter", letter);
    }
    if (edits.get("recruiterMessage") instanceof String) {
      pkg.put("recruiter_message", edits.get("recruiterMessage"));
    }
    if (edits.get("answers") instanceof List) {
      List<Map<String, Object>> merged = new ArrayList<>();
      for (Object existing : list(pkg.get("answers"))) {
        merged.add(new LinkedHashMap<>(map(existing)));
      }
      for (Object edit : (List<Object>) edits.get("answers")) {
        Map<String, Object> change = map(edit);
        for (Map<String, Object> answer : merged) {
          if (answer.get("question") != null && answer.get("question").equals(change.get("question"))) {
            answer.put("answer", change.get("answer"));
            // The user wrote or confirmed this one themselves.
            answer.put("status", "FILLED");
            answer.put("requires_approval", false);
            answer.put("source", "user");
            answer.put("confidence", 1.0);
          }
        }
      }
      pkg.put("answers", merged);
    }
    request.setPackageData(pkg);
    request.setEditedByUser(true);
  }

  // ------------------------------------------------------------------------ helpers

  private ApprovalRequest owned(String userId, Long id) {
    ApprovalRequest request =
        requests
            .findById(id)
            .orElseThrow(() -> new JobGenieException("Request not found", "APPROVAL_NOT_FOUND", 404));
    if (!request.getUserId().equals(userId)) {
      throw new JobGenieException("Request does not belong to this user", "APPROVAL_ACCESS_DENIED", 403);
    }
    return request;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Object value) {
    return value instanceof Map ? (Map<String, Object>) value : new LinkedHashMap<>();
  }

  private static List<?> list(Object value) {
    return value instanceof List ? (List<?>) value : new ArrayList<>();
  }

  private static String str(Object value) {
    return value == null || value.toString().isBlank() ? null : value.toString();
  }

  private static String firstReason(Map<String, Object> pkg) {
    List<?> reasons = list(pkg.get("decision_reasons"));
    return reasons.isEmpty() ? "see the package" : String.valueOf(reasons.get(0));
  }

  private static JobGenieException bad(String message, String code) {
    return new JobGenieException(message, code, 400);
  }
}
