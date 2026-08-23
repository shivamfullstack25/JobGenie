package com.jobgenie.userservice.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.jobgenie.shared.entities.User;
import com.jobgenie.userservice.service.UserService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/preferences")
@RequiredArgsConstructor
@Tag(name = "Preferences", description = "User preference endpoints (frontend alias)")
@CrossOrigin(origins = "*")
public class PreferencesController {

  private final UserService userService;

  @GetMapping
  @Operation(summary = "Get user preferences")
  public ResponseEntity<?> getPreferences(@RequestParam String userId) {
    User user = userService.getUserById(userId);
    return ResponseEntity.ok(user.getSettings() != null ? user.getSettings() : Map.of());
  }

  @PutMapping
  @Operation(summary = "Update user preferences")
  public ResponseEntity<User> updatePreferences(
      @RequestParam String userId, @RequestBody Map<String, Object> settings) {
    return ResponseEntity.ok(userService.updateUserSettings(userId, settings));
  }
}
