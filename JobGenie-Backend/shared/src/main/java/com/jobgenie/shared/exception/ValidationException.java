package com.jobgenie.shared.exception;

/** Exception thrown when validation fails */
public class ValidationException extends JobGenieException {

  public ValidationException(String message) {
    super(message, "VALIDATION_ERROR", 400);
  }

  public ValidationException(String field, String message) {
    super("Validation error for field '" + field + "': " + message, "VALIDATION_ERROR", 400);
  }
}
