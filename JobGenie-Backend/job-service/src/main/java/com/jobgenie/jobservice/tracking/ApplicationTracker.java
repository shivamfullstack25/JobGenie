package com.jobgenie.jobservice.tracking;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.jobgenie.jobservice.repository.JobApplicationRepository;
import com.jobgenie.shared.entities.JobApplication;
import com.jobgenie.shared.exception.JobGenieException;

import lombok.RequiredArgsConstructor;

/**
 * The only place an application's state changes. Every change is checked against
 * {@link ApplicationLifecycle} and written to the append-only transition log in the same
 * transaction, so history cannot disagree with the current state.
 */
@Service
@RequiredArgsConstructor
public class ApplicationTracker {

  private final JobApplicationRepository applications;
  private final ApplicationTransitionRepository transitions;

  /** Logs the state a new application starts in. */
  @Transactional
  public void recordInitial(JobApplication application, String actor, String reason) {
    log(application, null, application.getStatus(), actor, reason);
  }

  @Transactional
  public JobApplication transition(
      Long applicationId, String userId, String to, String actor, String reason) {
    if (!ApplicationLifecycle.isKnown(to)) {
      throw new JobGenieException(
          "Invalid status. Must be one of: " + ApplicationLifecycle.states(), "INVALID_STATUS", 400);
    }
    JobApplication application =
        applications
            .findById(applicationId)
            .orElseThrow(
                () ->
                    new JobGenieException(
                        "Application not found: " + applicationId, "APPLICATION_NOT_FOUND", 404));
    if (!application.getUserId().equals(userId)) {
      throw new JobGenieException(
          "Application does not belong to this user", "APPLICATION_ACCESS_DENIED", 403);
    }

    String from = application.getStatus();
    String target = ApplicationLifecycle.canonical(to);
    if (ApplicationLifecycle.canonical(from) != null && ApplicationLifecycle.canonical(from).equals(target)) {
      return application; // already there: not a transition
    }
    if (ApplicationLifecycle.isKnown(from) && !ApplicationLifecycle.canTransition(from, target)) {
      throw new JobGenieException(
          "An application in "
              + ApplicationLifecycle.canonical(from)
              + " can move to: "
              + ApplicationLifecycle.nextStates(from),
          "INVALID_TRANSITION",
          409);
    }

    application.setStatus(target);
    if (ApplicationLifecycle.SUBMITTED.equals(target)) {
      application.setAppliedAt(LocalDateTime.now()); // when the user says they actually applied
    }
    JobApplication saved = applications.save(application);
    log(saved, from, saved.getStatus(), actor, reason);
    return saved;
  }

  public List<ApplicationTransition> history(Long applicationId, String userId) {
    JobApplication application =
        applications
            .findById(applicationId)
            .orElseThrow(
                () ->
                    new JobGenieException(
                        "Application not found: " + applicationId, "APPLICATION_NOT_FOUND", 404));
    if (!application.getUserId().equals(userId)) {
      throw new JobGenieException(
          "Application does not belong to this user", "APPLICATION_ACCESS_DENIED", 403);
    }
    return transitions.findByApplicationIdOrderByCreatedAtAscIdAsc(applicationId);
  }

  private void log(JobApplication application, String from, String to, String actor, String reason) {
    ApplicationTransition row = new ApplicationTransition();
    row.setApplicationId(application.getId());
    row.setUserId(application.getUserId());
    row.setFromState(from);
    row.setToState(to);
    row.setActor(actor);
    row.setReason(reason);
    transitions.save(row);
  }
}
