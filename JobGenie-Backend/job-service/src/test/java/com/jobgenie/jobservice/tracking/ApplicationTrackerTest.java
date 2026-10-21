package com.jobgenie.jobservice.tracking;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.jobgenie.jobservice.repository.JobApplicationRepository;
import com.jobgenie.shared.entities.JobApplication;
import com.jobgenie.shared.exception.JobGenieException;

class ApplicationTrackerTest {

  private final Map<Long, JobApplication> store = new HashMap<>();
  private final List<ApplicationTransition> log = new ArrayList<>();
  private ApplicationTracker tracker;

  @BeforeEach
  void setUp() {
    JobApplicationRepository applications = mock(JobApplicationRepository.class);
    when(applications.findById(anyLong()))
        .thenAnswer(call -> Optional.ofNullable(store.get(call.<Long>getArgument(0))));
    when(applications.save(any(JobApplication.class)))
        .thenAnswer(
            call -> {
              JobApplication saved = call.getArgument(0);
              store.put(saved.getId(), saved);
              return saved;
            });
    ApplicationTransitionRepository transitions = mock(ApplicationTransitionRepository.class);
    when(transitions.save(any(ApplicationTransition.class)))
        .thenAnswer(
            call -> {
              ApplicationTransition row = call.getArgument(0);
              row.setCreatedAt(LocalDateTime.now().plusSeconds(log.size()));
              log.add(row);
              return row;
            });
    when(transitions.findByApplicationIdOrderByCreatedAtAscIdAsc(anyLong()))
        .thenAnswer(
            call ->
                log.stream()
                    .filter(t -> t.getApplicationId().equals(call.getArgument(0)))
                    .collect(Collectors.toList()));
    tracker = new ApplicationTracker(applications, transitions);
  }

  private JobApplication app(long id, String user, String status) {
    JobApplication application =
        JobApplication.builder().id(id).jobId("job-" + id).userId(user).platform("greenhouse").status(status).appliedAt(LocalDateTime.now().minusDays(3)).build();
    store.put(id, application);
    return application;
  }

  // ------------------------------------------------------------------ the machine itself

  @Test
  void legacyNamesAreAliasesOfTheNewStates() {
    assertEquals("SUBMITTED", ApplicationLifecycle.canonical(" applied "));
    assertEquals("INTERVIEW", ApplicationLifecycle.canonical("Interviewing"));
    assertTrue(ApplicationLifecycle.isKnown("APPLIED") && ApplicationLifecycle.isKnown("INTERVIEWING"));
    assertFalse(ApplicationLifecycle.isKnown("BANANA"));
    assertFalse(ApplicationLifecycle.isKnown(null));
    assertEquals(15, ApplicationLifecycle.states().size());
  }

  @Test
  void theHappyPathIsAllowedStepByStep() {
    String[] path = {"DISCOVERED", "SHORTLISTED", "PREPARING", "AWAITING_APPROVAL", "READY_TO_SUBMIT", "SUBMITTED", "SCREENING", "INTERVIEW", "TECHNICAL_ROUND", "HR_ROUND", "OFFER"};
    for (int i = 0; i + 1 < path.length; i++) {
      assertTrue(ApplicationLifecycle.canTransition(path[i], path[i + 1]), path[i] + " -> " + path[i + 1]);
    }
  }

  @Test
  void stagesCannotBeSkippedBeforeSubmission() {
    assertFalse(ApplicationLifecycle.canTransition("DISCOVERED", "SUBMITTED"));
    assertFalse(ApplicationLifecycle.canTransition("SHORTLISTED", "READY_TO_SUBMIT"));
    assertFalse(ApplicationLifecycle.canTransition("PREPARING", "SUBMITTED"), "nothing is submitted without approval");
    assertFalse(ApplicationLifecycle.canTransition("AWAITING_APPROVAL", "SUBMITTED"));
  }

  @Test
  void afterSubmissionRealLifeOrderIsAllowedToBeUntidy() {
    assertTrue(ApplicationLifecycle.canTransition("SUBMITTED", "OFFER"));
    assertTrue(ApplicationLifecycle.canTransition("APPLIED", "REJECTED"));
    assertTrue(ApplicationLifecycle.canTransition("HR_ROUND", "TECHNICAL_ROUND"));
  }

  @Test
  void terminalStatesHaveNoWayBack() {
    assertTrue(ApplicationLifecycle.isTerminal("CLOSED"));
    assertFalse(ApplicationLifecycle.canTransition("CLOSED", "SUBMITTED"));
    assertFalse(ApplicationLifecycle.canTransition("REJECTED", "INTERVIEW"));
    assertTrue(ApplicationLifecycle.canTransition("REJECTED", "CLOSED"));
    assertTrue(ApplicationLifecycle.canTransition("ERROR", "PREPARING"));
  }

  // ------------------------------------------------------------------------- the tracker

  @Test
  void aTransitionUpdatesTheStateAndWritesTheLogInOneStep() {
    app(1, "7", "READY_TO_SUBMIT");

    JobApplication moved = tracker.transition(1L, "7", "SUBMITTED", "user", "I applied");

    assertEquals("SUBMITTED", moved.getStatus());
    assertEquals(1, log.size());
    assertEquals("READY_TO_SUBMIT", log.get(0).getFromState());
    assertEquals("SUBMITTED", log.get(0).getToState());
    assertEquals("I applied", log.get(0).getReason());
    assertEquals("user", log.get(0).getActor());
  }

  @Test
  void markingSubmittedStampsWhenTheUserActuallyApplied() {
    JobApplication application = app(1, "7", "READY_TO_SUBMIT");
    LocalDateTime before = application.getAppliedAt();

    tracker.transition(1L, "7", "SUBMITTED", "user", null);

    assertTrue(store.get(1L).getAppliedAt().isAfter(before));
  }

  @Test
  void theOldHistoryPageVocabularyStillWorks() {
    app(1, "7", "APPLIED");

    assertEquals("INTERVIEW", tracker.transition(1L, "7", "INTERVIEWING", "user", null).getStatus());
    assertEquals("OFFER", tracker.transition(1L, "7", "offer", "user", null).getStatus());
    assertEquals(List.of("APPLIED", "INTERVIEW"), log.stream().map(ApplicationTransition::getFromState).collect(Collectors.toList()));
  }

  @Test
  void anIllegalJumpIsRefusedAndNothingIsWritten() {
    app(1, "7", "DISCOVERED");

    JobGenieException error = assertThrows(JobGenieException.class, () -> tracker.transition(1L, "7", "OFFER", "user", null));

    assertEquals("INVALID_TRANSITION", error.getErrorCode());
    assertEquals("DISCOVERED", store.get(1L).getStatus());
    assertTrue(log.isEmpty());
  }

  @Test
  void aRowInAnUnrecognisedLegacyStateCanStillBeMovedOn() {
    app(1, "7", "PENDING");
    assertEquals("SUBMITTED", tracker.transition(1L, "7", "SUBMITTED", "user", null).getStatus());
  }

  @Test
  void anotherUsersApplicationCannotBeTouchedOrRead() {
    app(1, "7", "SUBMITTED");

    assertEquals("APPLICATION_ACCESS_DENIED", assertThrows(JobGenieException.class, () -> tracker.transition(1L, "8", "REJECTED", "user", null)).getErrorCode());
    assertEquals("APPLICATION_ACCESS_DENIED", assertThrows(JobGenieException.class, () -> tracker.history(1L, "8")).getErrorCode());
    assertEquals("SUBMITTED", store.get(1L).getStatus());
  }

  @Test
  void unknownStatusAndMissingApplicationAreClearErrors() {
    app(1, "7", "SUBMITTED");
    assertEquals("INVALID_STATUS", assertThrows(JobGenieException.class, () -> tracker.transition(1L, "7", "BANANA", "user", null)).getErrorCode());
    assertEquals("APPLICATION_NOT_FOUND", assertThrows(JobGenieException.class, () -> tracker.transition(99L, "7", "OFFER", "user", null)).getErrorCode());
  }

  @Test
  void repeatingTheCurrentStateIsNotATransition() {
    app(1, "7", "SUBMITTED");
    tracker.transition(1L, "7", "APPLIED", "user", null);
    assertTrue(log.isEmpty());
  }

  @Test
  void historyIsOrderedAndStartsWithTheInitialState() {
    JobApplication application = app(1, "7", "READY_TO_SUBMIT");
    tracker.recordInitial(application, "user", "Package approved");
    tracker.transition(1L, "7", "SUBMITTED", "user", null);
    tracker.transition(1L, "7", "SCREENING", "user", null);

    List<ApplicationTransition> history = tracker.history(1L, "7");

    assertEquals(3, history.size());
    assertNull(history.get(0).getFromState());
    assertEquals("READY_TO_SUBMIT", history.get(0).getToState());
    assertEquals("SCREENING", history.get(2).getToState());
    assertNotNull(history.get(1).getCreatedAt());
  }
}
