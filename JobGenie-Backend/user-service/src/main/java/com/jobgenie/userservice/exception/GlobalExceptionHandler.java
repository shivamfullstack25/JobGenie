package com.jobgenie.userservice.exception;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;

import com.jobgenie.shared.exception.JobGenieException;
import com.jobgenie.shared.exception.UserNotFoundException;
import com.jobgenie.shared.exception.ValidationException;

import lombok.extern.slf4j.Slf4j;

/** Global exception handler for User Service */
@ControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

  /** Handle JobGenie custom exceptions */
  @ExceptionHandler(JobGenieException.class)
  public ResponseEntity<ErrorResponse> handleJobGenieException(
      JobGenieException ex, WebRequest request) {
    log.error("JobGenie Exception: {}", ex.getMessage(), ex);

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(ex.getHttpStatus())
            .error(ex.getErrorCode())
            .message(ex.getMessage())
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(ex.getHttpStatus()).body(errorResponse);
  }

  /** Handle UserNotFoundException */
  @ExceptionHandler(UserNotFoundException.class)
  public ResponseEntity<ErrorResponse> handleUserNotFoundException(
      UserNotFoundException ex, WebRequest request) {
    log.error("User Not Found Exception: {}", ex.getMessage(), ex);

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(404)
            .error("USER_NOT_FOUND")
            .message(ex.getMessage())
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(404).body(errorResponse);
  }

  /** Handle ValidationException */
  @ExceptionHandler(ValidationException.class)
  public ResponseEntity<ErrorResponse> handleValidationException(
      ValidationException ex, WebRequest request) {
    log.error("Validation Exception: {}", ex.getMessage(), ex);

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(400)
            .error("VALIDATION_ERROR")
            .message(ex.getMessage())
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(400).body(errorResponse);
  }

  /** Handle validation errors from @Valid annotations */
  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ErrorResponse> handleValidationErrors(
      MethodArgumentNotValidException ex, WebRequest request) {
    log.error("Validation Errors: {}", ex.getMessage(), ex);

    Map<String, String> fieldErrors = new HashMap<>();
    ex.getBindingResult()
        .getAllErrors()
        .forEach(
            error -> {
              String fieldName = ((FieldError) error).getField();
              String errorMessage = error.getDefaultMessage();
              fieldErrors.put(fieldName, errorMessage);
            });

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(400)
            .error("VALIDATION_ERROR")
            .message("Validation failed")
            .details(fieldErrors)
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(400).body(errorResponse);
  }

  /**
   * Handle Spring's {@link ResponseStatusException} (e.g. thrown by UserController's
   * requireAdmin/getUserOrThrow helpers for 403/404 responses). Without this handler it fell
   * through to the generic Exception handler below, which hardcodes status 500 — turning deliberate
   * 403 FORBIDDEN / 404 NOT_FOUND responses into an opaque 500 for every admin-only endpoint (GET
   * /api/users, DELETE /api/users/{userId}).
   */
  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<ErrorResponse> handleResponseStatusException(
      ResponseStatusException ex, WebRequest request) {
    log.warn("Response Status Exception: {}", ex.getMessage());

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(ex.getStatus().value())
            .error(ex.getStatus().name())
            .message(ex.getReason() != null ? ex.getReason() : ex.getStatus().getReasonPhrase())
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(ex.getStatus()).body(errorResponse);
  }

  /**
   * Handle a missing required {@code @RequestHeader} (e.g. X-User-Id on the admin-only endpoints).
   * This is a client error, not a server error — without this handler it fell through to the
   * generic Exception handler and returned 500 instead of 400.
   */
  @ExceptionHandler(MissingRequestHeaderException.class)
  public ResponseEntity<ErrorResponse> handleMissingRequestHeaderException(
      MissingRequestHeaderException ex, WebRequest request) {
    log.warn("Missing Request Header Exception: {}", ex.getMessage());

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(400)
            .error("MISSING_REQUEST_HEADER")
            .message("Missing required header: " + ex.getHeaderName())
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(400).body(errorResponse);
  }

  /**
   * Handle a missing required {@code @RequestParam} (e.g. userId on GET/PUT /api/preferences,
   * /api/profile, /api/users/me). This is a client error — without this handler it fell through to
   * the generic Exception handler and returned 500 instead of 400.
   */
  @ExceptionHandler(MissingServletRequestParameterException.class)
  public ResponseEntity<ErrorResponse> handleMissingServletRequestParameterException(
      MissingServletRequestParameterException ex, WebRequest request) {
    log.warn("Missing Request Parameter Exception: {}", ex.getMessage());

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(400)
            .error("MISSING_REQUEST_PARAMETER")
            .message("Missing required parameter: " + ex.getParameterName())
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(400).body(errorResponse);
  }

  /** Handle generic exceptions */
  @ExceptionHandler(Exception.class)
  public ResponseEntity<ErrorResponse> handleGenericException(Exception ex, WebRequest request) {
    log.error("Generic Exception: {}", ex.getMessage(), ex);

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(500)
            .error("INTERNAL_SERVER_ERROR")
            .message("An unexpected error occurred")
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(500).body(errorResponse);
  }

  /** Handle IllegalArgumentException */
  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<ErrorResponse> handleIllegalArgumentException(
      IllegalArgumentException ex, WebRequest request) {
    log.error("Illegal Argument Exception: {}", ex.getMessage(), ex);

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(400)
            .error("INVALID_ARGUMENT")
            .message(ex.getMessage())
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(400).body(errorResponse);
  }

  /** Handle NumberFormatException */
  @ExceptionHandler(NumberFormatException.class)
  public ResponseEntity<ErrorResponse> handleNumberFormatException(
      NumberFormatException ex, WebRequest request) {
    log.error("Number Format Exception: {}", ex.getMessage(), ex);

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(400)
            .error("INVALID_NUMBER_FORMAT")
            .message("Invalid number format provided")
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(400).body(errorResponse);
  }
}
