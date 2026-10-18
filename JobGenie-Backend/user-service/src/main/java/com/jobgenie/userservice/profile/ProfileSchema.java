package com.jobgenie.userservice.profile;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The fields a CandidateProfile may hold. Anything else is rejected, never stored. */
public final class ProfileSchema {

  public enum Kind {
    SCALAR,
    LIST,
    OBJECT
  }

  /** Written in place of a value the user still has to supply. Counts as missing. */
  public static final String USER_INPUT_REQUIRED = "USER_INPUT_REQUIRED";

  private static final Map<String, Kind> FIELDS = new LinkedHashMap<>();

  /** Needed before JobGenie can prepare an application on the user's behalf. */
  public static final List<String> REQUIRED_FOR_APPLICATIONS =
      List.of(
          "identity.fullName",
          "contact.email",
          "location.current",
          "workAuthorization.status",
          "preferences.targetRoles",
          "preferences.noticePeriod",
          "experience",
          "skills");

  static {
    FIELDS.put("identity.fullName", Kind.SCALAR);
    FIELDS.put("identity.headline", Kind.SCALAR);
    FIELDS.put("identity.summary", Kind.SCALAR);
    FIELDS.put("contact.email", Kind.SCALAR);
    FIELDS.put("contact.phone", Kind.SCALAR);
    FIELDS.put("location.current", Kind.SCALAR);
    FIELDS.put("location.country", Kind.SCALAR);
    FIELDS.put("workAuthorization.status", Kind.SCALAR);
    FIELDS.put("workAuthorization.visa", Kind.OBJECT);
    FIELDS.put("preferences.targetRoles", Kind.LIST);
    FIELDS.put("preferences.targetLocations", Kind.LIST);
    FIELDS.put("preferences.salaryExpectation", Kind.OBJECT);
    FIELDS.put("preferences.noticePeriod", Kind.SCALAR);
    FIELDS.put("preferences.remotePreference", Kind.SCALAR);
    FIELDS.put("preferences.willingToRelocate", Kind.SCALAR);
    FIELDS.put("experience", Kind.LIST);
    FIELDS.put("education", Kind.LIST);
    FIELDS.put("certifications", Kind.LIST);
    FIELDS.put("skills", Kind.LIST);
    FIELDS.put("projects", Kind.LIST);
    FIELDS.put("achievements", Kind.LIST);
    FIELDS.put("links.portfolio", Kind.SCALAR);
    FIELDS.put("links.github", Kind.SCALAR);
    FIELDS.put("links.linkedin", Kind.SCALAR);
    FIELDS.put("links.naukri", Kind.SCALAR);
    FIELDS.put("links.cutshort", Kind.SCALAR);
    FIELDS.put("links.instahyre", Kind.SCALAR);
    FIELDS.put("links.wellfound", Kind.SCALAR);
    FIELDS.put("links.other", Kind.LIST);
  }

  private ProfileSchema() {}

  public static Map<String, Kind> fields() {
    return Collections.unmodifiableMap(FIELDS);
  }

  public static boolean isKnown(String field) {
    return FIELDS.containsKey(field);
  }

  /** Checks the value's shape matches the field; returns an error message or {@code null}. */
  public static String validate(String field, Object value) {
    Kind kind = FIELDS.get(field);
    if (kind == null) {
      return "Unknown profile field '" + field + "'";
    }
    if (value == null) {
      return "A value is required for '" + field + "'";
    }
    if (USER_INPUT_REQUIRED.equals(value)) {
      return null;
    }
    switch (kind) {
      case SCALAR:
        return value instanceof Map || value instanceof List
            ? "'" + field + "' takes a single value"
            : null;
      case LIST:
        return value instanceof List ? null : "'" + field + "' takes a list";
      case OBJECT:
        return value instanceof Map ? null : "'" + field + "' takes an object";
      default:
        return null;
    }
  }

  /** True when the value is absent, blank, empty or the USER_INPUT_REQUIRED marker. */
  public static boolean isMissing(Object value) {
    if (value == null || USER_INPUT_REQUIRED.equals(value)) {
      return true;
    }
    if (value instanceof String) {
      return ((String) value).trim().isEmpty();
    }
    if (value instanceof List) {
      return ((List<?>) value).isEmpty();
    }
    if (value instanceof Map) {
      return ((Map<?, ?>) value).isEmpty();
    }
    return false;
  }
}
