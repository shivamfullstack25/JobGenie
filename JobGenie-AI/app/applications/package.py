"""ApplicationAgent: assemble everything needed to apply to one job, from the candidate's own profile.

A package is a *proposal*. It carries a tailored resume, a cover letter, answers to the screening
questions, a short recruiter message, the checks that were run, and what is still missing. Nothing is
sent anywhere; ``submission`` always says the user applies on the employer's site. Every claim about
the candidate comes from the profile and is re-checked for anything the profile does not support.
"""

import re
from datetime import date
from typing import Any, Callable, Dict, Iterable, List, Optional

from app.agents import resume_agent
from app.applications import answers as answer_policy
from app.applications.decision import decide
from app.jobs.automation import Switches, effective_mode, policy_for
from app.jobs.matching import score_job
from app.jobs.normalized import NormalizedJob
from app.jobs import safety as safety_agent

# (pattern on the job title / skills, preset), first match wins.
_PRESET_RULES = [
    (r"engineering manager|head of engineering|tech lead manager|\bmanager\b", "engineering_manager"),
    (r"genai|gen ai|llm|machine learning|\bml\b|\bai\b engineer|ai/ml", "genai"),
    (r"full[- ]?stack", "full_stack"),
    (r"spring boot", "spring_boot"),
    (r"microservice", "microservices"),
    (r"cloud|devops|\bsre\b|platform|infrastructure", "cloud"),
    (r"java|backend|back-end", "java_backend"),
    (r"senior|staff|principal|lead", "senior_software_engineer"),
]


def choose_preset(job: NormalizedJob) -> Dict[str, str]:
    haystack = f"{job.title}".lower()
    for pattern, preset in _PRESET_RULES:
        if re.search(pattern, haystack):
            return {"preset": preset, "reason": f"Job title matches '{pattern}'"}
    skills = " ".join(job.required_skills).lower()
    for pattern, preset in _PRESET_RULES[1:7]:
        if re.search(pattern, skills):
            return {"preset": preset, "reason": f"Required skills match '{pattern}'"}
    return {"preset": "software_engineer", "reason": "No role-specific signal in the posting"}


# ------------------------------------------------------------------------------- cover letter


def _first_sentences(text: str, limit: int = 320) -> str:
    out = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        if out and len(out) + len(sentence) > limit:
            break
        out = f"{out} {sentence}".strip()
    return out


def build_cover_letter(
    profile: Dict[str, Any],
    job: NormalizedJob,
    match: Optional[Dict[str, Any]],
    rewriter: Optional[Callable[[str], str]] = None,
) -> Dict[str, Any]:
    """A letter assembled from the candidate's own words. Paragraphs that make claims about the
    candidate are checked against the profile; the opening and closing only name the role."""
    name = profile.get("identity.fullName") or ""
    bullets: List[str] = []
    for entry in profile.get("experience") or []:
        if isinstance(entry, dict):
            bullets += [str(b).strip() for b in (entry.get("achievements") or []) if str(b).strip()]
    terms = resume_agent._terms_for("software_engineer", f"{job.title} {job.description}") + [s.lower() for s in job.required_skills]
    best = resume_agent._by_relevance(bullets, str, terms)[:3]

    matched = ((match or {}).get("evidence", {}).get("skills", {}) or {}).get("matched") or []
    summary = _first_sentences(str(profile.get("identity.summary") or ""))

    claims: List[str] = []
    if summary:
        claims.append(summary)
    if best:
        claims.append("Examples of work most relevant to this role: " + " ".join(b if b.endswith(".") else b + "." for b in best))
    if matched:
        claims.append("The skills you ask for that I bring: " + ", ".join(matched[:8]) + ".")

    discarded: List[str] = []
    if rewriter:
        for i, paragraph in enumerate(claims):
            try:
                candidate = (rewriter(paragraph) or "").strip()
            except Exception:
                continue
            problems = resume_agent.find_unsupported_claims(candidate, profile) if candidate else ["empty"]
            if candidate and not problems:
                claims[i] = candidate
            elif candidate:
                discarded.append(f"{paragraph[:50]}…: rewrite added {', '.join(problems)}")

    greeting = f"Dear {job.company} hiring team,"
    opening = f"I am applying for the {job.title} role at {job.company}."
    closing = "I would welcome the chance to discuss how I can contribute. Thank you for your time and consideration."
    text = "\n\n".join([greeting, opening, *claims, closing, f"Sincerely,\n{name}".strip()])

    unsupported = [c for paragraph in claims for c in resume_agent.find_unsupported_claims(paragraph, profile)]
    return {"text": text, "unsupported_claims": unsupported, "discarded_rewrites": discarded, "evidence_used": best}


def build_recruiter_message(profile: Dict[str, Any], job: NormalizedJob) -> str:
    name = profile.get("identity.fullName") or ""
    headline = str(profile.get("identity.headline") or "").split("|")[0].strip()
    who = f"I'm {name}, {headline[:1].lower() + headline[1:]}." if headline else f"I'm {name}."
    return f"Hi, {who} I've applied for the {job.title} role at {job.company} and would be glad to talk if it looks like a fit."


# ----------------------------------------------------------------------------------- package


def build_package(
    profile: Dict[str, Any],
    job: NormalizedJob,
    questions: Optional[List[str]] = None,
    provenance: Optional[Dict[str, str]] = None,
    applied_job_ids: Iterable[str] = (),
    match: Optional[Dict[str, Any]] = None,
    safety: Optional[Dict[str, Any]] = None,
    switches: Optional[Switches] = None,
    rewriter: Optional[Callable[[str], str]] = None,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    today = today or date.today()
    match = match or score_job(profile, job)
    safety = safety or safety_agent.assess(job)
    switches = switches or Switches.from_env()

    chosen = choose_preset(job)
    resume = resume_agent.tailor(profile, chosen["preset"], f"{job.title}\n{job.description}", provenance=provenance, rewriter=rewriter)
    letter = build_cover_letter(profile, job, match, rewriter)
    answers = [answer_policy.answer_question(profile, q, provenance, f"{job.title} {job.description}").to_dict() for q in (questions or [])]
    unanswered = sum(1 for a in answers if a["status"] == answer_policy.NEEDS_INPUT)

    decision = decide(profile, job, match, safety, applied_job_ids, switches, today, unanswered_required=unanswered)

    policy = policy_for(job.source)
    checks = [
        {"name": "Resume contains nothing outside your profile", "passed": not resume["violations"], "detail": "; ".join(resume["violations"][:3])},
        {"name": "Cover letter contains nothing outside your profile", "passed": not letter["unsupported_claims"], "detail": "; ".join(letter["unsupported_claims"][:3])},
        {"name": "Every answer is from your profile or left for you", "passed": all(a["status"] != answer_policy.FILLED or a["source"] for a in answers), "detail": ""},
        {"name": "Posting passed the scam check", "passed": safety["level"] != "HIGH", "detail": "; ".join(safety["reasons"][:2])},
        {"name": "Not already applied", "passed": not decision["checks"]["duplicate_application"], "detail": ""},
        {"name": "Posting is recent", "passed": decision["checks"]["fresh"], "detail": f"{decision['checks']['job_age_days']} days old" if decision["checks"]["job_age_days"] is not None else ""},
    ]
    unconfirmed = sorted(set(resume["unverified_fields"]) | {a["source"] for a in answers if a["status"] == answer_policy.FILLED and a["source"] and a["requires_approval"] and (provenance or {}).get(a["source"]) in ("INFERRED", "AI_GENERATED")})

    return {
        "job": {"job_id": job.job_id, "title": job.title, "company": job.company, "location": job.location, "source": job.source},
        "decision": decision["decision"],
        "decision_reasons": decision["reasons"],
        "preset": chosen,
        "resume": {"document": resume, "text": resume_agent.to_text(resume)},
        "cover_letter": letter,
        "recruiter_message": build_recruiter_message(profile, job),
        "answers": answers,
        "match": match,
        "safety": safety,
        "checks": checks,
        "needs_confirmation": unconfirmed,
        "missing_information": decision["checks"]["missing_profile_fields"] + [a["question"] for a in answers if a["status"] == answer_policy.NEEDS_INPUT],
        # JobGenie never submits: the user applies on the employer's own site.
        "submission": {"method": "CLICK_OUT", "url": job.application_url, "platform_mode": effective_mode(policy, "apply", today.isoformat()).name},
        # Where this package starts in the application lifecycle.
        "suggested_state": {
            "MISSING_INFORMATION": "PREPARING",
            "DO_NOT_APPLY": "CLOSED",
            "BLOCKED_BY_PLATFORM": "SHORTLISTED",
            "SAVE_FOR_REVIEW": "SHORTLISTED",
        }.get(decision["decision"], "AWAITING_APPROVAL"),
    }
