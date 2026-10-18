package com.jobgenie.userservice.profile;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.jobgenie.shared.exception.JobGenieException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

/**
 * The master profile. Ownership is enforced by the shared auth filter: every endpoint takes the
 * caller's own {@code userId}, and a request naming anyone else's is rejected with 403.
 */
@RestController
@RequestMapping("/api/candidate-profile")
@Tag(name = "Candidate Profile", description = "Canonical, versioned candidate profile with provenance")
@RequiredArgsConstructor
public class CandidateProfileController {

  private final CandidateProfileService profileService;
  private final ProfileImportService importService;

  @GetMapping
  @Operation(summary = "Get the profile with provenance on every fact")
  public Map<String, Object> get(@RequestParam Long userId) {
    return profileService.view(userId);
  }

  @GetMapping("/schema")
  @Operation(summary = "The fields a profile can hold")
  public Map<String, Object> schema() {
    return Map.of(
        "fields", ProfileSchema.fields(), "requiredForApplications", ProfileSchema.REQUIRED_FOR_APPLICATIONS);
  }

  @PutMapping("/fields")
  @Operation(summary = "State a fact (recorded as FACT, verified by you)")
  public CandidateProfileService.ChangeResult set(
      @RequestParam Long userId, @RequestBody Map<String, Object> body) {
    return profileService.setByUser(
        userId, string(body.get("field")), body.get("value"), string(body.get("reason")));
  }

  @PostMapping("/fields/approve")
  @Operation(summary = "Confirm an inferred or AI-written value as correct")
  public CandidateProfileService.ChangeResult approve(
      @RequestParam Long userId, @RequestBody Map<String, Object> body) {
    return profileService.approve(userId, string(body.get("field")));
  }

  @GetMapping("/proposals")
  @Operation(summary = "Changes software proposed to facts you have already stated")
  public List<ProfileProposal> proposals(@RequestParam Long userId) {
    return profileService.pendingProposals(userId);
  }

  @PostMapping("/proposals/{id}/decision")
  @Operation(summary = "Approve or reject a proposal")
  public CandidateProfileService.ChangeResult decide(
      @RequestParam Long userId,
      @org.springframework.web.bind.annotation.PathVariable Long id,
      @RequestBody Map<String, Object> body) {
    return profileService.decideProposal(userId, id, Boolean.TRUE.equals(body.get("approve")));
  }

  @GetMapping("/versions")
  @Operation(summary = "Version history, newest first")
  public List<ProfileVersion> versions(@RequestParam Long userId) {
    return profileService.versions(userId);
  }

  @PostMapping("/rollback")
  @Operation(summary = "Make an earlier version current again (as a new version)")
  public Map<String, Object> rollback(
      @RequestParam Long userId, @RequestBody Map<String, Object> body) {
    Object version = body.get("version");
    if (!(version instanceof Number)) {
      throw new JobGenieException("version is required", "INVALID_VERSION", 400);
    }
    return Map.of("currentVersion", profileService.rollback(userId, ((Number) version).intValue()));
  }

  @PostMapping("/import-resume")
  @Operation(summary = "Record what your active resume says as inferred facts")
  public Map<String, Object> importResume(@RequestParam Long userId) {
    return importService.importFromResume(userId);
  }

  @GetMapping(value = "/export", produces = "application/x-yaml")
  @Operation(summary = "Download the master profile as YAML")
  public ResponseEntity<String> export(@RequestParam Long userId) {
    Map<String, Object> view = profileService.view(userId);
    @SuppressWarnings("unchecked")
    String yaml =
        ProfileYaml.export(
            (Integer) view.get("version"), (Map<String, Map<String, Object>>) view.get("facts"));
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"master-profile.yaml\"")
        .contentType(MediaType.parseMediaType("application/x-yaml"))
        .body(yaml);
  }

  @PostMapping(value = "/import", consumes = {"application/x-yaml", "text/plain", "text/yaml"})
  @Operation(
      summary = "Import a master-profile YAML",
      description =
          "Default: values are recorded as inferred, and conflicts with facts you stated become"
              + " proposals. confirm=true declares the file to be your own statement.")
  public Map<String, Object> importYaml(
      @RequestParam Long userId,
      @RequestParam(defaultValue = "false") boolean confirm,
      @RequestBody String yaml) {
    return importService.importYaml(userId, yaml, confirm);
  }

  private static String string(Object value) {
    return value == null ? null : value.toString();
  }
}
