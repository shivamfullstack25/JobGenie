package com.jobgenie.jobservice.approval;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.jobgenie.jobservice.repository.JobApplicationRepository;
import com.jobgenie.jobservice.tracking.ApplicationTracker;
import com.jobgenie.jobservice.tracking.ApplicationTransition;
import com.jobgenie.jobservice.tracking.ApplicationTransitionRepository;
import com.jobgenie.shared.entities.JobApplication;
import com.jobgenie.shared.exception.JobGenieException;

class ApprovalServiceTest {

  private final List<ApprovalRequest> requestStore = new ArrayList<>();
  private final Map<Long, JobApplication> applicationStore = new HashMap<>();
  private final List<ApplicationTransition> log = new ArrayList<>();
  private ApprovalService service;

  @BeforeEach
  @SuppressWarnings("unchecked")
  void setUp() {
    ApprovalRequestRepository requests = mock(ApprovalRequestRepository.class);
    when(requests.save(any(ApprovalRequest.class)))
        .thenAnswer(
            call -> {
              ApprovalRequest saved = call.getArgument(0);
              if (saved.getId() == null) {
                saved.setId((long) requestStore.size() + 1);
                requestStore.add(saved);
              }
              return saved;
            });
    when(requests.findById(anyLong()))
        .thenAnswer(call -> requestStore.stream().filter(r -> r.getId().equals(call.getArgument(0))).findFirst());
    when(requests.findFirstByUserIdAndJobIdAndStatusIn(anyString(), anyString(), any()))
        .thenAnswer(
            call ->
                requestStore.stream()
                    .filter(r -> r.getUserId().equals(call.getArgument(0)) && r.getJobId().equals(call.getArgument(1)))
                    .filter(r -> ((java.util.Collection<ApprovalRequest.Status>) call.getArgument(2)).contains(r.getStatus()))
                    .findFirst());

    when(requests.findByUserIdOrderByCreatedAtDesc(anyString()))
        .thenAnswer(call -> requestStore.stream().filter(r -> r.getUserId().equals(call.getArgument(0))).collect(java.util.stream.Collectors.toList()));
    when(requests.findByUserIdAndStatusOrderByCreatedAtDesc(anyString(), any()))
        .thenAnswer(
            call ->
                requestStore.stream()
                    .filter(r -> r.getUserId().equals(call.getArgument(0)) && r.getStatus() == call.getArgument(1))
                    .collect(java.util.stream.Collectors.toList()));

    JobApplicationRepository applications = mock(JobApplicationRepository.class);
    when(applications.existsByUserIdAndJobId(anyString(), anyString()))
        .thenAnswer(call -> applicationStore.values().stream().anyMatch(a -> a.getUserId().equals(call.getArgument(0)) && a.getJobId().equals(call.getArgument(1))));
    when(applications.save(any(JobApplication.class)))
        .thenAnswer(
            call -> {
              JobApplication saved = call.getArgument(0);
              if (saved.getId() == null) {
                saved.setId((long) applicationStore.size() + 1);
              }
              applicationStore.put(saved.getId(), saved);
              return saved;
            });
    when(applications.findById(anyLong())).thenAnswer(call -> Optional.ofNullable(applicationStore.get(call.<Long>getArgument(0))));

    ApplicationTransitionRepository transitions = mock(ApplicationTransitionRepository.class);
    when(transitions.save(any(ApplicationTransition.class))).thenAnswer(call -> {
      log.add(call.getArgument(0));
      return call.getArgument(0);
    });

    service = new ApprovalService(requests, applications, new ApplicationTracker(applications, transitions));
  }

  private static Map<String, Object> pkg(String jobId, String decision) {
    Map<String, Object> job = new LinkedHashMap<>();
    job.put("job_id", jobId);
    job.put("title", "Senior Backend Engineer");
    job.put("company", "Zeta");
    job.put("location", "Pune");
    job.put("source", "greenhouse");
    Map<String, Object> pkg = new LinkedHashMap<>();
    pkg.put("job", job);
    pkg.put("decision", decision);
    pkg.put("decision_reasons", List.of("Good fit"));
    pkg.put("match", Map.of("match_score", 87));
    pkg.put("safety", Map.of("level", "LOW"));
    pkg.put("submission", Map.of("method", "CLICK_OUT", "url", "https://boards.greenhouse.io/zeta/jobs/1"));
    pkg.put("cover_letter", new LinkedHashMap<>(Map.of("text", "Dear Zeta")));
    pkg.put("recruiter_message", "Hi");
    List<Map<String, Object>> answers = new ArrayList<>();
    answers.add(new LinkedHashMap<>(Map.of("question", "Notice period?", "answer", "USER_INPUT_REQUIRED", "status", "USER_INPUT_REQUIRED", "requires_approval", true)));
    pkg.put("answers", answers);
    return pkg;
  }

  private static String code(Runnable action) {
    return assertThrows(JobGenieException.class, action::run).getErrorCode();
  }

  // ------------------------------------------------------------------------------- queueing

  @Test
  void aPackageIsQueuedPendingWithItsHeadlineFactsExtracted() {
    ApprovalRequest request = service.submit("7", pkg("greenhouse:1", "APPLY_WITH_APPROVAL"));

    assertEquals(ApprovalRequest.Status.PENDING, request.getStatus());
    assertEquals("Zeta", request.getCompany());
    assertEquals(87, request.getMatchScore());
    assertEquals("LOW", request.getRiskLevel());
    assertEquals("https://boards.greenhouse.io/zeta/jobs/1", request.getApplicationUrl());
    assertNull(request.getApplicationId(), "no application exists until the user approves");
    assertTrue(applicationStore.isEmpty());
  }

  @Test
  void packagesTheAgentAdvisesAgainstOrCannotFinishAreNotQueued() {
    assertEquals("DO_NOT_APPLY", code(() -> service.submit("7", pkg("j", "DO_NOT_APPLY"))));
    assertEquals("MISSING_INFORMATION", code(() -> service.submit("7", pkg("j", "MISSING_INFORMATION"))));
    assertEquals("INVALID_PACKAGE", code(() -> service.submit("7", new LinkedHashMap<>())));
    assertTrue(requestStore.isEmpty());
  }

  @Test
  void aNewPackageForTheSameJobReplacesThePendingOne() {
    ApprovalRequest first = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));
    ApprovalRequest second = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));

    assertEquals(first.getId(), second.getId());
    assertEquals(1, requestStore.size());
  }

  // ------------------------------------------------------------------------------ approving

  @Test
  void approvingCreatesTheApplicationReadyToSubmitButNeverSubmitted() {
    ApprovalRequest request = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));

    ApprovalRequest approved = service.decide("7", request.getId(), "approve", null, "looks right");

    assertEquals(ApprovalRequest.Status.APPROVED, approved.getStatus());
    assertNotNull(approved.getApplicationId());
    JobApplication application = applicationStore.get(approved.getApplicationId());
    assertEquals("READY_TO_SUBMIT", application.getStatus());
    assertEquals("greenhouse", application.getPlatform());
    assertEquals(1, log.size());
    assertNull(log.get(0).getFromState());
    assertEquals("READY_TO_SUBMIT", log.get(0).getToState());
    assertEquals("user", log.get(0).getActor());
    assertNotNull(approved.getDecidedAt());
  }

  @Test
  void aDecidedRequestCannotBeDecidedAgain() {
    ApprovalRequest request = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));
    service.decide("7", request.getId(), "APPROVE", null, null);

    assertEquals("ALREADY_DECIDED", code(() -> service.decide("7", request.getId(), "APPROVE", null, null)));
    assertEquals("ALREADY_DECIDED", code(() -> service.decide("7", request.getId(), "REJECT", null, null)));
    assertEquals(1, applicationStore.size(), "approving twice must not create two applications");
  }

  @Test
  void approvalIsRefusedIfTheJobWasAlreadyAppliedTo() {
    ApprovalRequest request = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));
    applicationStore.put(50L, JobApplication.builder().id(50L).jobId("j").userId("7").platform("x").status("APPLIED").build());

    assertEquals("DUPLICATE_APPLICATION", code(() -> service.decide("7", request.getId(), "APPROVE", null, null)));
    assertEquals(ApprovalRequest.Status.PENDING, request.getStatus());
  }

  // -------------------------------------------------------------------- reject / save / edit

  @Test
  void rejectingCreatesNoApplication() {
    ApprovalRequest request = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));

    ApprovalRequest rejected = service.decide("7", request.getId(), "REJECT", null, "not interested");

    assertEquals(ApprovalRequest.Status.REJECTED, rejected.getStatus());
    assertEquals("not interested", rejected.getNote());
    assertTrue(applicationStore.isEmpty());
  }

  @Test
  void savingKeepsItForLaterAndItCanStillBeApproved() {
    ApprovalRequest request = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));

    assertEquals(ApprovalRequest.Status.SAVED, service.decide("7", request.getId(), "SAVE", null, null).getStatus());
    assertEquals(ApprovalRequest.Status.APPROVED, service.decide("7", request.getId(), "APPROVE", null, null).getStatus());
    assertEquals(1, service.list("7", null).size());
  }

  @Test
  @SuppressWarnings("unchecked")
  void editsAreTheUsersWordsAndMarkTheAnswerAsTheirOwn() {
    ApprovalRequest request = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));
    Map<String, Object> edits = new LinkedHashMap<>();
    edits.put("coverLetterText", "Dear Zeta, my own words.");
    edits.put("recruiterMessage", "Hello!");
    edits.put("answers", List.of(Map.of("question", "Notice period?", "answer", "45 days")));

    ApprovalRequest edited = service.decide("7", request.getId(), "EDIT", edits, null);

    assertEquals(ApprovalRequest.Status.PENDING, edited.getStatus(), "editing is not deciding");
    assertTrue(edited.isEditedByUser());
    Map<String, Object> data = edited.getPackageData();
    assertEquals("Dear Zeta, my own words.", ((Map<String, Object>) data.get("cover_letter")).get("text"));
    assertEquals("Hello!", data.get("recruiter_message"));
    Map<String, Object> answer = ((List<Map<String, Object>>) data.get("answers")).get(0);
    assertEquals("45 days", answer.get("answer"));
    assertEquals("FILLED", answer.get("status"));
    assertEquals("user", answer.get("source"));
    assertEquals(false, answer.get("requires_approval"));
  }

  @Test
  void anEditThatChangesNothingIsRejected() {
    ApprovalRequest request = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));
    assertEquals("NO_EDITS", code(() -> service.decide("7", request.getId(), "EDIT", new HashMap<>(), null)));
    assertEquals("INVALID_ACTION", code(() -> service.decide("7", request.getId(), "SUBMIT_FOR_ME", null, null)));
    assertFalse(request.isEditedByUser());
  }

  // ----------------------------------------------------------------------------- ownership

  @Test
  void otherUsersCannotSeeOrDecideARequest() {
    ApprovalRequest request = service.submit("7", pkg("j", "APPLY_WITH_APPROVAL"));

    assertEquals("APPROVAL_ACCESS_DENIED", code(() -> service.get("8", request.getId())));
    assertEquals("APPROVAL_ACCESS_DENIED", code(() -> service.decide("8", request.getId(), "APPROVE", null, null)));
    assertEquals("APPROVAL_NOT_FOUND", code(() -> service.get("7", 999L)));
    assertTrue(applicationStore.isEmpty());
  }

  @Test
  void listingFiltersByStatus() {
    ApprovalRequest a = service.submit("7", pkg("a", "APPLY_WITH_APPROVAL"));
    service.submit("7", pkg("b", "APPLY_WITH_APPROVAL"));
    service.decide("7", a.getId(), "REJECT", null, null);

    assertEquals(2, service.list("7", null).size());
    assertEquals(1, service.list("7", ApprovalRequest.Status.PENDING).size());
    assertEquals(1, service.list("7", ApprovalRequest.Status.REJECTED).size());
    assertTrue(service.list("8", null).isEmpty());
  }
}
