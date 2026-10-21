package com.jobgenie.jobservice.tracking;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * The application lifecycle as a state machine.
 *
 * <p>Two older names are kept as aliases so existing rows and the existing history page keep
 * working: {@code APPLIED} is {@code SUBMITTED}, {@code INTERVIEWING} is {@code INTERVIEW}. Either
 * spelling is accepted on input; what is stored is whatever the caller sent, and every comparison
 * goes through {@link #canonical}.
 *
 * <p>JobGenie never submits an application itself, so {@code SUBMITTED} means "the user says they
 * applied" and is only reached by a user action.
 */
public final class ApplicationLifecycle {

  public static final String DISCOVERED = "DISCOVERED";
  public static final String SHORTLISTED = "SHORTLISTED";
  public static final String PREPARING = "PREPARING";
  public static final String AWAITING_APPROVAL = "AWAITING_APPROVAL";
  public static final String READY_TO_SUBMIT = "READY_TO_SUBMIT";
  public static final String SUBMITTED = "SUBMITTED";
  public static final String SCREENING = "SCREENING";
  public static final String INTERVIEW = "INTERVIEW";
  public static final String TECHNICAL_ROUND = "TECHNICAL_ROUND";
  public static final String HR_ROUND = "HR_ROUND";
  public static final String OFFER = "OFFER";
  public static final String REJECTED = "REJECTED";
  public static final String WITHDRAWN = "WITHDRAWN";
  public static final String CLOSED = "CLOSED";
  public static final String ERROR = "ERROR";

  private static final Map<String, String> ALIASES = Map.of("APPLIED", SUBMITTED, "INTERVIEWING", INTERVIEW);

  /** Where each state may go next. Terminal states other than REJECTED have no way out. */
  private static final Map<String, Set<String>> NEXT = new LinkedHashMap<>();

  static {
    NEXT.put(DISCOVERED, set(SHORTLISTED, CLOSED));
    NEXT.put(SHORTLISTED, set(PREPARING, CLOSED));
    NEXT.put(PREPARING, set(AWAITING_APPROVAL, SHORTLISTED, CLOSED, ERROR));
    NEXT.put(AWAITING_APPROVAL, set(READY_TO_SUBMIT, PREPARING, CLOSED));
    NEXT.put(READY_TO_SUBMIT, set(SUBMITTED, AWAITING_APPROVAL, CLOSED, ERROR));
    // Real life is not tidy: people hear back out of order, so a submitted application may jump.
    NEXT.put(SUBMITTED, set(SCREENING, INTERVIEW, TECHNICAL_ROUND, HR_ROUND, OFFER, REJECTED, WITHDRAWN, CLOSED));
    NEXT.put(SCREENING, set(INTERVIEW, TECHNICAL_ROUND, HR_ROUND, OFFER, REJECTED, WITHDRAWN, CLOSED));
    NEXT.put(INTERVIEW, set(TECHNICAL_ROUND, HR_ROUND, OFFER, REJECTED, WITHDRAWN, CLOSED));
    NEXT.put(TECHNICAL_ROUND, set(INTERVIEW, HR_ROUND, OFFER, REJECTED, WITHDRAWN, CLOSED));
    NEXT.put(HR_ROUND, set(INTERVIEW, TECHNICAL_ROUND, OFFER, REJECTED, WITHDRAWN, CLOSED));
    NEXT.put(OFFER, set(REJECTED, WITHDRAWN, CLOSED)); // declined, withdrawn, or done
    NEXT.put(REJECTED, set(CLOSED));
    NEXT.put(WITHDRAWN, set(CLOSED));
    NEXT.put(CLOSED, set());
    NEXT.put(ERROR, set(PREPARING, CLOSED));
  }

  private ApplicationLifecycle() {}

  private static Set<String> set(String... values) {
    Set<String> out = new LinkedHashSet<>();
    Collections.addAll(out, values);
    return Collections.unmodifiableSet(out);
  }

  public static Set<String> states() {
    return Collections.unmodifiableSet(NEXT.keySet());
  }

  /** Upper-cased, trimmed, aliases resolved; {@code null} if blank. */
  public static String canonical(String state) {
    if (state == null || state.trim().isEmpty()) {
      return null;
    }
    String upper = state.trim().toUpperCase();
    return ALIASES.getOrDefault(upper, upper);
  }

  /** Accepts the lifecycle states and the two legacy aliases. */
  public static boolean isKnown(String state) {
    String canonical = canonical(state);
    return canonical != null && NEXT.containsKey(canonical);
  }

  public static Set<String> nextStates(String from) {
    String canonical = canonical(from);
    return canonical == null ? Collections.emptySet() : NEXT.getOrDefault(canonical, Collections.emptySet());
  }

  /** Same state, or one the machine allows. */
  public static boolean canTransition(String from, String to) {
    String f = canonical(from);
    String t = canonical(to);
    if (f == null || t == null || !NEXT.containsKey(f) || !NEXT.containsKey(t)) {
      return false;
    }
    return f.equals(t) || NEXT.get(f).contains(t);
  }

  /** True once nothing further can happen. */
  public static boolean isTerminal(String state) {
    return nextStates(state).isEmpty();
  }
}
