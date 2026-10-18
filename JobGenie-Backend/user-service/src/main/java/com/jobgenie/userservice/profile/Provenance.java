package com.jobgenie.userservice.profile;

/**
 * Where a profile fact came from. The invariant the whole profile rests on: only a person can
 * produce {@link #FACT} or {@link #USER_APPROVED}; software can only ever produce the other two,
 * and an inference is never silently promoted to a fact.
 */
public enum Provenance {
  /** Stated by the user. */
  FACT,
  /** Derived by rules or parsing from a document (e.g. a resume). Unverified. */
  INFERRED,
  /** Written by a language model. Unverified. */
  AI_GENERATED,
  /** Proposed by software, then explicitly confirmed by the user. */
  USER_APPROVED;

  public boolean isUserVouched() {
    return this == FACT || this == USER_APPROVED;
  }
}
