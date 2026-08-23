package com.jobgenie.shared.exception;

/** Exception thrown when a user is not found */
public class UserNotFoundException extends JobGenieException {

  public UserNotFoundException(String message) {
    super(message, "USER_NOT_FOUND", 404);
  }

  public static UserNotFoundException forUserId(String userId) {
    return new UserNotFoundException("User not found with ID: " + userId);
  }
}
