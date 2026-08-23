package com.jobgenie.userservice.controller;

import java.util.Map;

import javax.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.jobgenie.shared.entities.User;
import com.jobgenie.userservice.dto.UserProfileUpdateRequest;
import com.jobgenie.userservice.service.UserService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
@Tag(name = "Profile", description = "User profile endpoints (frontend alias)")
@CrossOrigin(origins = "*")
public class ProfileController {

  private final UserService userService;

  @GetMapping
  @Operation(summary = "Get user profile")
  public ResponseEntity<User> getProfile(@RequestParam String userId) {
    return ResponseEntity.ok(userService.getUserById(userId));
  }

  @PutMapping
  @Operation(summary = "Update user profile")
  public ResponseEntity<User> updateProfile(
      @RequestParam String userId, @Valid @RequestBody UserProfileUpdateRequest request) {
    return ResponseEntity.ok(userService.updateUserProfile(userId, request));
  }

  @PutMapping("/settings")
  @Operation(summary = "Update profile settings")
  public ResponseEntity<User> updateSettings(
      @RequestParam String userId, @RequestBody Map<String, Object> settings) {
    return ResponseEntity.ok(userService.updateUserSettings(userId, settings));
  }
}
