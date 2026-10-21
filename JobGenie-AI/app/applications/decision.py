"""ApplicationDecisionAgent: what to do about a job — never decided on match score alone.

Order matters: hard stops first (platform, safety, eligibility, duplicate, staleness), then missing
information, then fit. ``APPLY_AUTOMATICALLY`` exists in the vocabulary but is only reachable when an
operator has switched automation on, turned dry-run off, the platform's own policy permits unattended
submission, and the job is both low-risk and a strong match. Today no platform's policy does, so it
cannot be returned; a test pins that.
"""

from datetime import date
from typing import Any, Dict, Iterable, List, Optional

from app.jobs.automation import Mode, Switches, effective_mode, policy_for
from app.jobs.normalized import NormalizedJob

APPLY_AUTOMATICALLY = "APPLY_AUTOMATICALLY"
APPLY_WITH_APPROVAL = "APPLY_WITH_APPROVAL"
SAVE_FOR_REVIEW = "SAVE_FOR_REVIEW"
DO_NOT_APPLY = "DO_NOT_APPLY"
BLOCKED_BY_PLATFORM = "BLOCKED_BY_PLATFORM"
MISSING_INFORMATION = "MISSING_INFORMATION"

STALE_AFTER_DAYS = 60
MIN_SCORE_TO_PURSUE = 50
REQUIRED_FIELDS = (
    "identity.fullName", "contact.email", "location.current", "workAuthorization.status",
    "preferences.targetRoles", "preferences.noticePeriod", "experience", "skills",
)


def _missing(profile: Dict[str, Any]) -> List[str]:
    return [f for f in REQUIRED_FIELDS if profile.get(f) in (None, "", [], {}, "USER_INPUT_REQUIRED")]


def decide(
    profile: Dict[str, Any],
    job: NormalizedJob,
    match: Optional[Dict[str, Any]],
    safety: Optional[Dict[str, Any]],
    applied_job_ids: Iterable[str] = (),
    switches: Optional[Switches] = None,
    today: Optional[date] = None,
    unanswered_required: int = 0,
) -> Dict[str, Any]:
    """Returns ``{"decision": ..., "reasons": [...], "checks": {...}}``."""
    switches = switches or Switches.from_env()
    today = today or date.today()
    policy = policy_for(job.source)
    apply_mode = effective_mode(policy, "apply", today.isoformat())
    reasons: List[str] = []
    checks: Dict[str, Any] = {}

    applied = {str(j) for j in applied_job_ids}
    checks["duplicate_application"] = job.job_id in applied or (job.duplicate_of in applied if job.duplicate_of else False)
    age = None
    if job.posted_date:
        try:
            age = (today - date.fromisoformat(job.posted_date[:10])).days
        except ValueError:
            age = None
    checks["job_age_days"] = age
    checks["fresh"] = age is None or age <= STALE_AFTER_DAYS
    checks["platform_apply_mode"] = apply_mode.name
    checks["safety_level"] = (safety or {}).get("level", "UNKNOWN")
    checks["eligible"] = not match or match.get("recommendation") != "NOT_ELIGIBLE"
    checks["missing_profile_fields"] = _missing(profile)
    checks["unanswered_required_questions"] = unanswered_required

    def done(decision: str) -> Dict[str, Any]:
        return {"decision": decision, "reasons": reasons, "checks": checks}

    if apply_mode <= Mode.DRAFT_ONLY:
        reasons.append(f"{job.source} restricts automated activity (or its policy is unreviewed), so JobGenie only prepares drafts. Open the posting and apply yourself.")
        return done(BLOCKED_BY_PLATFORM)
    if checks["safety_level"] == "HIGH":
        reasons.append("The posting looks like a scam: " + "; ".join((safety or {}).get("reasons", [])[:2]))
        return done(DO_NOT_APPLY)
    if not checks["eligible"]:
        reasons.append((match or {}).get("evidence", {}).get("visa", {}).get("note") or "You don't appear eligible for this role.")
        return done(DO_NOT_APPLY)
    if checks["duplicate_application"]:
        reasons.append("You have already applied to this job (or to a duplicate of it).")
        return done(DO_NOT_APPLY)
    if not checks["fresh"]:
        reasons.append(f"Posted {age} days ago; it may already be filled. Confirm it is still open before applying.")
        return done(SAVE_FOR_REVIEW)
    if checks["missing_profile_fields"] or unanswered_required:
        if checks["missing_profile_fields"]:
            reasons.append("Your profile is missing: " + ", ".join(checks["missing_profile_fields"]))
        if unanswered_required:
            reasons.append(f"{unanswered_required} required question(s) need your own answer.")
        return done(MISSING_INFORMATION)
    if match is None or match.get("match_score", 0) < MIN_SCORE_TO_PURSUE:
        reasons.append("The match is weak or unscored; saved so you can decide.")
        return done(SAVE_FOR_REVIEW)
    if checks["safety_level"] == "MEDIUM":
        reasons.append("The posting has some warning signs; review them before applying.")
        return done(APPLY_WITH_APPROVAL)

    strong = match.get("recommendation") == "STRONG_MATCH"
    if strong and checks["safety_level"] == "LOW" and switches.may_submit(job.source, apply_mode):
        reasons.append("Strong match, low risk, and this platform permits unattended submission.")
        return done(APPLY_AUTOMATICALLY)

    reasons.append("Good fit with no blockers. Review the package, then apply on the employer's site.")
    return done(APPLY_WITH_APPROVAL)
