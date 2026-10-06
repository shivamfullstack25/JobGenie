package com.jobgenie.shared.security;

/**
 * How strictly identity is enforced, set by {@code AUTH_ENFORCEMENT}. {@code report-only} exists
 * as the rollback position: everything is verified and logged, nothing is blocked.
 */
public enum AuthMode {
  OFF,
  REPORT_ONLY,
  ENFORCE;

  public static AuthMode parse(String value) {
    if (value == null) {
      return ENFORCE;
    }
    switch (value.trim().toLowerCase()) {
      case "off":
        return OFF;
      case "report-only":
      case "report_only":
        return REPORT_ONLY;
      case "enforce":
      case "":
        return ENFORCE;
      default:
        throw new IllegalArgumentException(
            "AUTH_ENFORCEMENT must be one of off, report-only, enforce — got '" + value + "'");
    }
  }
}
