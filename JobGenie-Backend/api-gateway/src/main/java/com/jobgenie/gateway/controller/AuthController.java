package com.jobgenie.gateway.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * LinkedIn OAuth is disabled.
 *
 * <p>The previous handler here was removed rather than patched because it was unsafe in three
 * independent ways: it generated an OAuth {@code state} and never validated it on the callback
 * (login CSRF), it took the target {@code userId} from the query string (so a callback could be
 * bound to any account), and on success it overwrote the user's name and email with whatever
 * LinkedIn returned — a platform profile silently replacing the master profile. It also requested
 * the retired {@code r_liteprofile}/{@code r_emailaddress} scopes, so it could not have completed
 * against LinkedIn's current API.
 *
 * <p>If LinkedIn sign-in is reintroduced it must be OpenID Connect ({@code openid profile email}),
 * bound to the authenticated session, with a server-stored state, and it must only propose profile
 * changes for the user to approve. See docs/platform-compliance.md.
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Authentication and authorization endpoints")
public class AuthController {

  private static final Map<String, String> GONE =
      Map.of(
          "error", "GONE",
          "message", "LinkedIn account linking is not available. Add your LinkedIn URL on your profile instead.");

  @GetMapping("/linkedin")
  @Operation(summary = "LinkedIn OAuth (disabled)", description = "Always returns 410 Gone.")
  public ResponseEntity<Map<String, String>> redirectToLinkedIn() {
    return ResponseEntity.status(HttpStatus.GONE).body(GONE);
  }

  @GetMapping("/linkedin/callback")
  @Operation(summary = "LinkedIn OAuth callback (disabled)", description = "Always returns 410 Gone.")
  public ResponseEntity<Map<String, String>> handleLinkedInCallback() {
    return ResponseEntity.status(HttpStatus.GONE).body(GONE);
  }
}
