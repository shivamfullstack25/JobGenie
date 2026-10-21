package com.jobgenie.jobservice.approval;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.jobgenie.jobservice.tracking.ApplicationTracker;
import com.jobgenie.jobservice.tracking.ApplicationTransition;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

/** Approval Center and application history. Ownership: the shared filter pins {@code userId}. */
@RestController
@RequestMapping("/api/approvals")
@Tag(name = "Approval Center", description = "Review, edit and approve application packages")
@RequiredArgsConstructor
public class ApprovalController {

  private final ApprovalService approvals;
  private final ApplicationTracker tracker;

  @PostMapping
  @Operation(summary = "Queue an application package for your approval")
  public ApprovalRequest submit(@RequestParam String userId, @RequestBody Map<String, Object> pkg) {
    return approvals.submit(userId, pkg);
  }

  @GetMapping
  @Operation(summary = "Your requests, newest first (optionally one status)")
  public List<ApprovalRequest> list(
      @RequestParam String userId, @RequestParam(required = false) ApprovalRequest.Status status) {
    return approvals.list(userId, status);
  }

  @GetMapping("/{id}")
  public ApprovalRequest get(@RequestParam String userId, @PathVariable Long id) {
    return approvals.get(userId, id);
  }

  @PostMapping("/{id}/decision")
  @Operation(
      summary = "APPROVE, EDIT, SAVE or REJECT",
      description =
          "APPROVE creates the application as READY_TO_SUBMIT. JobGenie never submits: you apply on"
              + " the employer's site, then mark it submitted.")
  public ApprovalRequest decide(
      @RequestParam String userId, @PathVariable Long id, @RequestBody Map<String, Object> body) {
    @SuppressWarnings("unchecked")
    Map<String, Object> edits = body.get("edits") instanceof Map ? (Map<String, Object>) body.get("edits") : null;
    return approvals.decide(
        userId,
        id,
        body.get("action") == null ? null : body.get("action").toString(),
        edits,
        body.get("note") == null ? null : body.get("note").toString());
  }

  @GetMapping("/applications/{applicationId}/history")
  @Operation(summary = "Every state change of one application, oldest first")
  public List<ApplicationTransition> history(@RequestParam String userId, @PathVariable Long applicationId) {
    return tracker.history(applicationId, userId);
  }
}
