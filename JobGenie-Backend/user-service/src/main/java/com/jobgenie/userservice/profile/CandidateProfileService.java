package com.jobgenie.userservice.profile;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jobgenie.shared.entities.AuditLog;
import com.jobgenie.shared.exception.JobGenieException;
import com.jobgenie.userservice.repository.AuditLogRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Owns every write to a CandidateProfile and enforces its two rules:
 *
 * <ol>
 *   <li><b>Software never creates a fact.</b> {@link #setByAgent} can only record {@code INFERRED}
 *       or {@code AI_GENERATED} values. If the user has already vouched for a field and the agent
 *       disagrees, the agent's value becomes a {@link ProfileProposal} and the profile is left
 *       alone. Only {@link #setByUser}, {@link #approve} and {@link #decideProposal} — all user
 *       actions — can produce {@code FACT} or {@code USER_APPROVED}.
 *   <li><b>Every change is recoverable.</b> Each accepted change writes a new immutable
 *       {@link ProfileVersion} and an audit record with before/after. {@link #rollback} adds a new
 *       version copied from an old one; history is never rewritten.
 * </ol>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CandidateProfileService {

  public enum Outcome {
    APPLIED,
    UNCHANGED,
    PROPOSED
  }

  /** What happened to one requested change. */
  public static final class ChangeResult {
    private final String field;
    private final Outcome outcome;
    private final Long proposalId;

    ChangeResult(String field, Outcome outcome, Long proposalId) {
      this.field = field;
      this.outcome = outcome;
      this.proposalId = proposalId;
    }

    public String getField() {
      return field;
    }

    public Outcome getOutcome() {
      return outcome;
    }

    public Long getProposalId() {
      return proposalId;
    }
  }

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final CandidateProfileRepository profiles;
  private final ProfileVersionRepository versions;
  private final ProfileProposalRepository proposals;
  private final AuditLogRepository auditLogs;

  // ------------------------------------------------------------------ reads

  @Transactional
  public Map<String, Object> view(Long userId) {
    CandidateProfile profile = load(userId);
    List<String> missing = new ArrayList<>();
    for (String field : ProfileSchema.REQUIRED_FOR_APPLICATIONS) {
      Map<String, Object> fact = profile.getFacts().get(field);
      if (fact == null || ProfileSchema.isMissing(fact.get("value"))) {
        missing.add(field);
      }
    }
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("userId", userId);
    view.put("version", profile.getCurrentVersion());
    view.put("updatedAt", profile.getUpdatedAt());
    view.put("facts", profile.getFacts());
    view.put("missingRequired", missing);
    view.put(
        "pendingProposals",
        proposals.findByUserIdAndStatusOrderByCreatedAtDesc(userId, ProfileProposal.Status.PENDING)
            .size());
    return view;
  }

  public List<ProfileVersion> versions(Long userId) {
    return versions.findByUserIdOrderByVersionDesc(userId);
  }

  public List<ProfileProposal> pendingProposals(Long userId) {
    return proposals.findByUserIdAndStatusOrderByCreatedAtDesc(
        userId, ProfileProposal.Status.PENDING);
  }

  // ----------------------------------------------------------- user writes

  /** The user states a fact. The only path that creates {@code FACT}. */
  @Transactional
  public ChangeResult setByUser(Long userId, String field, Object value, String reason) {
    requireValid(field, value);
    CandidateProfile profile = load(userId);
    Map<String, Object> before = profile.getFacts().get(field);
    if (before != null
        && Objects.equals(before.get("value"), value)
        && Provenance.FACT.name().equals(before.get("provenance"))) {
      return new ChangeResult(field, Outcome.UNCHANGED, null);
    }
    profile.getFacts().put(field, fact(value, Provenance.FACT, "user", 1.0, true));
    commit(profile, "user", reason, field, before);
    return new ChangeResult(field, Outcome.APPLIED, null);
  }

  /** The user confirms an inferred or AI-written value as correct. */
  @Transactional
  public ChangeResult approve(Long userId, String field) {
    CandidateProfile profile = load(userId);
    Map<String, Object> before = profile.getFacts().get(field);
    if (before == null || ProfileSchema.isMissing(before.get("value"))) {
      throw bad("There is nothing to approve for '" + field + "'", "NOTHING_TO_APPROVE");
    }
    Provenance current = Provenance.valueOf(String.valueOf(before.get("provenance")));
    if (current.isUserVouched()) {
      return new ChangeResult(field, Outcome.UNCHANGED, null);
    }
    profile
        .getFacts()
        .put(
            field,
            fact(
                before.get("value"),
                Provenance.USER_APPROVED,
                String.valueOf(before.get("source")),
                number(before.get("confidence"), 1.0),
                true));
    commit(profile, "user", "Approved " + current + " value", field, before);
    return new ChangeResult(field, Outcome.APPLIED, null);
  }

  @Transactional
  public ChangeResult decideProposal(Long userId, Long proposalId, boolean approve) {
    ProfileProposal proposal =
        proposals
            .findById(proposalId)
            .filter(p -> p.getUserId().equals(userId))
            .orElseThrow(() -> new JobGenieException("Proposal not found", "PROPOSAL_NOT_FOUND", 404));
    if (proposal.getStatus() != ProfileProposal.Status.PENDING) {
      throw bad("This proposal was already decided", "PROPOSAL_DECIDED");
    }
    proposal.setDecidedAt(LocalDateTime.now());
    if (!approve) {
      proposal.setStatus(ProfileProposal.Status.REJECTED);
      proposals.save(proposal);
      audit(userId, "profile.proposal.rejected", proposal.getField(), proposal.getCurrentValue(), proposal.getProposedValue(), proposal.getReason(), "user");
      return new ChangeResult(proposal.getField(), Outcome.UNCHANGED, proposalId);
    }
    CandidateProfile profile = load(userId);
    Map<String, Object> before = profile.getFacts().get(proposal.getField());
    profile
        .getFacts()
        .put(
            proposal.getField(),
            fact(
                proposal.getProposedValue(),
                Provenance.USER_APPROVED,
                proposal.getSource(),
                proposal.getConfidence() == null ? 1.0 : proposal.getConfidence(),
                true));
    proposal.setStatus(ProfileProposal.Status.APPROVED);
    proposals.save(proposal);
    commit(profile, "user", "Approved proposal #" + proposalId, proposal.getField(), before);
    return new ChangeResult(proposal.getField(), Outcome.APPLIED, proposalId);
  }

  /** Makes version {@code target} current again, as a new version. */
  @Transactional
  public int rollback(Long userId, int target) {
    ProfileVersion old =
        versions
            .findByUserIdAndVersion(userId, target)
            .orElseThrow(() -> new JobGenieException("No such version", "VERSION_NOT_FOUND", 404));
    CandidateProfile profile = load(userId);
    if (target == profile.getCurrentVersion()) {
      return target;
    }
    Map<String, Map<String, Object>> before = copy(profile.getFacts());
    profile.setFacts(copy(old.getSnapshot()));
    commit(profile, "user", "Rolled back to v" + target, "*", before);
    return profile.getCurrentVersion();
  }

  // ---------------------------------------------------------- agent writes

  /**
   * Software proposes a value. Never produces a fact: {@code provenance} must be {@code INFERRED}
   * or {@code AI_GENERATED}, and a field the user has vouched for is only ever changed through a
   * proposal the user approves.
   */
  @Transactional
  public ChangeResult setByAgent(
      Long userId,
      String field,
      Object value,
      Provenance provenance,
      String source,
      double confidence,
      String reason) {
    if (provenance == null || provenance.isUserVouched()) {
      throw bad("Software may only write INFERRED or AI_GENERATED values", "PROVENANCE_FORBIDDEN");
    }
    requireValid(field, value);
    if (ProfileSchema.isMissing(value)) {
      return new ChangeResult(field, Outcome.UNCHANGED, null);
    }
    CandidateProfile profile = load(userId);
    Map<String, Object> existing = profile.getFacts().get(field);

    if (existing != null && Objects.equals(existing.get("value"), value)) {
      return new ChangeResult(field, Outcome.UNCHANGED, null);
    }

    boolean userHasVouched =
        existing != null
            && !ProfileSchema.isMissing(existing.get("value"))
            && Provenance.valueOf(String.valueOf(existing.get("provenance"))).isUserVouched();
    if (userHasVouched) {
      for (ProfileProposal pending : pendingProposals(userId)) {
        if (pending.getField().equals(field) && Objects.equals(pending.getProposedValue(), value)) {
          return new ChangeResult(field, Outcome.PROPOSED, pending.getId());
        }
      }
      ProfileProposal proposal = new ProfileProposal();
      proposal.setUserId(userId);
      proposal.setField(field);
      proposal.setProposedValue(value);
      proposal.setCurrentValue(existing.get("value"));
      proposal.setProvenance(provenance);
      proposal.setSource(source);
      proposal.setConfidence(confidence);
      proposal.setReason(reason);
      proposal = proposals.save(proposal);
      audit(userId, "profile.proposal.created", field, existing.get("value"), value, reason, source);
      return new ChangeResult(field, Outcome.PROPOSED, proposal.getId());
    }

    profile.getFacts().put(field, fact(value, provenance, source, confidence, false));
    commit(profile, source, reason, field, existing);
    return new ChangeResult(field, Outcome.APPLIED, null);
  }

  /** Removes everything held for a user (account deletion). */
  @Transactional
  public void deleteAll(Long userId) {
    profiles.deleteByUserId(userId);
    versions.deleteByUserId(userId);
    proposals.deleteByUserId(userId);
  }

  // ---------------------------------------------------------------- internals

  private CandidateProfile load(Long userId) {
    return profiles
        .findByUserId(userId)
        .orElseGet(
            () -> {
              CandidateProfile fresh = new CandidateProfile();
              fresh.setUserId(userId);
              return profiles.save(fresh);
            });
  }

  private void commit(
      CandidateProfile profile, String author, String reason, String field, Object before) {
    profile.setCurrentVersion(profile.getCurrentVersion() + 1);
    profiles.save(profile);

    ProfileVersion version = new ProfileVersion();
    version.setUserId(profile.getUserId());
    version.setVersion(profile.getCurrentVersion());
    version.setSnapshot(copy(profile.getFacts()));
    version.setAuthor(author);
    version.setReason(reason);
    versions.save(version);

    Object after = "*".equals(field) ? profile.getFacts() : profile.getFacts().get(field);
    audit(profile.getUserId(), "profile.updated", field, before, after, reason, author);
  }

  private void audit(
      Long userId,
      String action,
      String field,
      Object before,
      Object after,
      String reason,
      String actor) {
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("actor", actor);
    details.put("entity", "candidate_profile");
    details.put("field", field);
    details.put("before", before);
    details.put("after", after);
    details.put("reason", reason);
    try {
      auditLogs.save(
          AuditLog.builder()
              .userId(String.valueOf(userId))
              .action(action)
              .details(MAPPER.writeValueAsString(details))
              .timestamp(LocalDateTime.now())
              .build());
    } catch (JsonProcessingException e) {
      log.warn("Could not serialise audit details for {}: {}", action, e.getMessage());
    }
  }

  static Map<String, Object> fact(
      Object value, Provenance provenance, String source, double confidence, boolean verified) {
    Map<String, Object> fact = new LinkedHashMap<>();
    fact.put("value", value);
    fact.put("provenance", provenance.name());
    fact.put("source", source);
    fact.put("confidence", confidence);
    fact.put("lastUpdated", LocalDateTime.now().toString());
    fact.put("verifiedByUser", verified);
    return fact;
  }

  private static Map<String, Map<String, Object>> copy(Map<String, Map<String, Object>> facts) {
    return MAPPER.convertValue(
        facts, new TypeReference<LinkedHashMap<String, Map<String, Object>>>() {});
  }

  private static double number(Object value, double fallback) {
    return value instanceof Number ? ((Number) value).doubleValue() : fallback;
  }

  private static void requireValid(String field, Object value) {
    String error = ProfileSchema.validate(field, value);
    if (error != null) {
      throw bad(error, "INVALID_PROFILE_FIELD");
    }
  }

  private static JobGenieException bad(String message, String code) {
    return new JobGenieException(message, code, 400);
  }
}
