package com.jobgenie.jobservice.exception;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;

import com.jobgenie.shared.exception.JobGenieException;
import com.jobgenie.shared.exception.JobNotFoundException;
import com.jobgenie.shared.exception.ValidationException;

import lombok.extern.slf4j.Slf4j;

/** Global exception handler for Job Service */
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

  /** Handle JobNotFoundException */
  @ExceptionHandler(JobNotFoundException.class)
  public ResponseEntity<ErrorResponse> handleJobNotFoundException(
      JobNotFoundException ex, WebRequest request) {
    log.error("Job Not Found Exception: {}", ex.getMessage(), ex);

    ErrorResponse errorResponse =
        ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(404)
            .error("JOB_NOT_FOUND")
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
   * Handle ResponseStatusException so it keeps its intended status (e.g. 403, 404) instead of
   * falling through to the generic 500 handler below.
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
            .message(ex.getReason())
            .path(request.getDescription(false))
            .build();

    return ResponseEntity.status(ex.getStatus()).body(errorResponse);
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
