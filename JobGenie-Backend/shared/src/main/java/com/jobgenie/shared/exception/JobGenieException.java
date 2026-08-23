package com.jobgenie.shared.exception;

import lombok.Getter;

/** Base exception class for JobGenie application */
@Getter
public class JobGenieException extends RuntimeException {

  private final String errorCode;
  private final int httpStatus;

  public JobGenieException(String message) {
    super(message);
    this.errorCode = "JOBGENIE_ERROR";
    this.httpStatus = 500;
  }

  public JobGenieException(String message, String errorCode) {
    super(message);
    this.errorCode = errorCode;
    this.httpStatus = 500;
  }

  public JobGenieException(String message, String errorCode, int httpStatus) {
    super(message);
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
  }

  public JobGenieException(String message, Throwable cause) {
    super(message, cause);
    this.errorCode = "JOBGENIE_ERROR";
    this.httpStatus = 500;
  }

  public JobGenieException(String message, String errorCode, Throwable cause) {
    super(message, cause);
    this.errorCode = errorCode;
    this.httpStatus = 500;
  }
}
