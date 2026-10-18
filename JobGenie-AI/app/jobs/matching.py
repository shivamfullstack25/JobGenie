"""Hybrid, explainable job matching.

Tiers, cheapest first; a later tier runs only if the earlier ones leave the job worth the cost:

1. Rules — location, work authorization, seniority. Free, and they can rule a job out.
2. Skills and role keywords — profile vs. posting. Free.
3. Embeddings (optional, injected) — semantic closeness of profile and posting text.
4. LLM reasoning (optional, injected) — a short written assessment, only for the top slice.

Two honesty rules shape the score. A factor with no data is *left out* and the remaining weights are
renormalised, rather than counted as good or bad; ``confidence`` says how much of the weight had real
data behind it. And every number is accompanied by the evidence that produced it, so the result can
be argued with.
"""

import math
import re
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from app.jobs.normalized import NormalizedJob, normalize_title

WEIGHTS = {"skills": 45, "role": 20, "location": 15, "experience": 10, "salary": 5, "semantic": 5}

STRONG, GOOD, PARTIAL, WEAK, NOT_ELIGIBLE = "STRONG_MATCH", "GOOD_MATCH", "PARTIAL_MATCH", "WEAK_MATCH", "NOT_ELIGIBLE"

# Tier 3/4 are only spent on jobs at least this good after tiers 1-2.
SEMANTIC_MIN_SCORE = 40
REASONER_MIN_SCORE = 60
REASONER_TOP_N = 5

_SENIOR = re.compile(r"\b(senior|sr\.?|staff|principal|lead|head|director|vp|architect|manager)\b", re.I)
_JUNIOR = re.compile(r"\b(junior|jr\.?|intern|trainee|graduate|entry[- ]level|associate)\b", re.I)


def _profile_skills(profile: Dict[str, Any]) -> List[str]:
    return [str(s).strip() for s in (profile.get("skills") or []) if str(s).strip()]


def _has(text: str, term: str) -> bool:
    return bool(re.search(r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])", text.lower()))


def profile_years(profile: Dict[str, Any]) -> Optional[float]:
    """Total years across roles, from the start/end years the candidate gave. None if undeterminable."""
    from datetime import date

    spans = []
    for entry in profile.get("experience") or []:
        if not isinstance(entry, dict):
            continue
        start = re.search(r"(?:19|20)\d{2}", str(entry.get("start") or ""))
        end_text = str(entry.get("end") or "").strip().lower()
        end = re.search(r"(?:19|20)\d{2}", end_text)
        if not start:
            continue
        end_year = int(end.group()) if end else (date.today().year if end_text in ("", "present", "current", "now", "ongoing") else None)
        if end_year is not None and end_year >= int(start.group()):
            spans.append((int(start.group()), end_year))
    if not spans:
        return None
    spans.sort()
    merged = [list(spans[0])]
    for start, end in spans[1:]:  # overlapping roles are not counted twice
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return float(sum(e - s for s, e in merged))


# ------------------------------------------------------------------------------------- factors


def _skills_factor(profile: Dict[str, Any], job: NormalizedJob) -> Tuple[Optional[float], Dict[str, Any]]:
    wanted = [s for s in dict.fromkeys(job.required_skills + job.preferred_skills)]
    if not wanted:
        return None, {"note": "The posting names no recognised skills"}
    mine = _profile_skills(profile)
    if not mine:
        return None, {"note": "Your profile lists no skills yet", "missing": wanted}
    matched = [w for w in wanted if any(_has(w, m) or _has(m, w) for m in mine)]
    missing = [w for w in wanted if w not in matched]
    return len(matched) / len(wanted), {"matched": matched, "missing": missing}


def _role_factor(profile: Dict[str, Any], job: NormalizedJob) -> Tuple[Optional[float], str, Dict[str, Any]]:
    targets = [str(t) for t in (profile.get("preferences.targetRoles") or []) if str(t).strip()]
    if not targets:
        return None, "unknown", {"note": "No target roles set in your profile"}
    title = normalize_title(job.title)
    title_tokens = set(title.split())
    best, best_role = 0.0, ""
    for role in targets:
        tokens = set(normalize_title(role).split())
        if not tokens:
            continue
        overlap = len(tokens & title_tokens) / len(tokens)
        if overlap > best:
            best, best_role = overlap, role
    label = "aligned" if best >= 0.75 else "adjacent" if best >= 0.4 else "off-target"
    return best, label, {"closest_target_role": best_role or None, "overlap": round(best, 2)}


def _location_factor(profile: Dict[str, Any], job: NormalizedJob) -> Tuple[Optional[float], str, Dict[str, Any]]:
    prefs = [str(t).lower() for t in (profile.get("preferences.targetLocations") or []) if str(t).strip()]
    remote_pref = str(profile.get("preferences.remotePreference") or "").lower()
    here = str(profile.get("location.current") or "").lower()
    where = job.location.lower()
    if job.remote_type == "REMOTE":
        if remote_pref in ("onsite", "on-site"):
            return 0.3, "remote role, but you prefer onsite", {}
        return 1.0, "remote", {}
    if not where:
        return None, "unknown", {"note": "The posting gives no location"}
    wanted = prefs + ([here] if here else [])
    if not wanted:
        return None, "unknown", {"note": "No target locations set in your profile"}
    if any(w in where or where.split(",")[0].strip() in w for w in wanted if w):
        return 1.0, "in your target locations", {}
    if str(profile.get("preferences.willingToRelocate") or "").lower() in ("yes", "true", "open"):
        return 0.5, "outside your target locations, but you are open to relocating", {}
    return 0.1, "outside your target locations", {}


def _visa_factor(profile: Dict[str, Any], job: NormalizedJob) -> Tuple[str, bool, str]:
    """(label, blocks, explanation). Never assumes authorization: unknown stays unknown."""
    home = str(profile.get("location.country") or "").strip().lower()
    job_country = (job.country or "").strip().lower()
    authorization = str(profile.get("workAuthorization.status") or "").lower()
    if not job_country or not home:
        if job.visa_sponsorship is False and job.remote_type != "REMOTE":
            return "unknown", False, "The posting says it cannot sponsor visas; check you are eligible to work there"
        return "unknown", False, "Not enough information to check work authorization"
    if home == job_country:
        return "ok", False, f"The role is in {job.country}, where you are based"
    if job_country in authorization:
        return "ok", False, f"Your profile states work authorization covering {job.country}"
    if job.remote_type == "REMOTE":
        return "unknown", False, "Remote role in another country; check whether they hire from your country"
    if job.visa_sponsorship is True:
        return "sponsorship_offered", False, f"The role is in {job.country} and the posting offers visa sponsorship"
    if job.visa_sponsorship is False:
        return "not_eligible", True, f"The role is in {job.country}, the posting offers no sponsorship, and your profile does not state authorization there"
    return "unknown", False, f"The role is in {job.country}; the posting does not say whether it sponsors visas"


def _experience_factor(profile: Dict[str, Any], job: NormalizedJob) -> Tuple[Optional[float], Dict[str, Any]]:
    have = profile_years(profile)
    need = job.experience_min_years
    seniority = "senior" if _SENIOR.search(job.title) else "junior" if _JUNIOR.search(job.title) else "mid"
    if have is None or (need is None and seniority == "mid"):
        return None, {"note": "Not enough information to compare experience", "have_years": have, "need_years": need}
    if need is None:
        need = 5 if seniority == "senior" else 0
    if have >= need:
        over = have - need
        return (0.8 if over > 8 and seniority == "junior" else 1.0), {"have_years": have, "need_years": need}
    return max(0.0, 1 - (need - have) / max(need, 1)), {"have_years": have, "need_years": need, "gap_years": need - have}


def _salary_factor(profile: Dict[str, Any], job: NormalizedJob) -> Tuple[Optional[float], str]:
    expect = profile.get("preferences.salaryExpectation")
    if not isinstance(expect, dict) or not (job.salary_min or job.salary_max):
        return None, "unknown"
    cur, jcur = str(expect.get("currency") or "").upper(), (job.currency or "").upper()
    if not cur or not jcur or cur != jcur:
        return None, "unknown (different or unstated currency)"
    low, high = expect.get("min"), expect.get("max") or expect.get("min")
    jmin, jmax = job.salary_min or job.salary_max, job.salary_max or job.salary_min
    if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
        return None, "unknown"
    if jmax < low:
        return 0.0, "below your expectation"
    if jmin > high:
        return 1.0, "above your expectation"
    return 1.0, "within your expectation"


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


# -------------------------------------------------------------------------------------- match


def score_job(
    profile: Dict[str, Any],
    job: NormalizedJob,
    embed: Optional[Callable[[str], Sequence[float]]] = None,
) -> Dict[str, Any]:
    """Tiers 1-3 for one job."""
    tiers = ["rules", "keywords"]
    strengths: List[str] = []
    weaknesses: List[str] = []
    evidence: Dict[str, Any] = {}
    parts: Dict[str, Optional[float]] = {}

    skills, skills_ev = _skills_factor(profile, job)
    parts["skills"], evidence["skills"] = skills, skills_ev
    role, career_fit, role_ev = _role_factor(profile, job)
    parts["role"], evidence["role"] = role, role_ev
    location, location_fit, loc_ev = _location_factor(profile, job)
    parts["location"], evidence["location"] = location, {"fit": location_fit, **loc_ev}
    experience, exp_ev = _experience_factor(profile, job)
    parts["experience"], evidence["experience"] = experience, exp_ev
    salary, salary_fit = _salary_factor(profile, job)
    parts["salary"], evidence["salary"] = salary, {"fit": salary_fit}
    visa_fit, blocks, visa_note = _visa_factor(profile, job)
    evidence["visa"] = {"fit": visa_fit, "note": visa_note}

    def partial() -> float:
        known = {k: v for k, v in parts.items() if v is not None}
        total = sum(WEIGHTS[k] for k in known)
        return 100 * sum(WEIGHTS[k] * v for k, v in known.items()) / total if total else 0.0

    score = partial()
    if embed is not None and score >= SEMANTIC_MIN_SCORE:
        tiers.append("embeddings")
        mine = " ".join([str(profile.get("identity.headline") or ""), str(profile.get("identity.summary") or ""), " ".join(_profile_skills(profile))])
        if mine.strip() and job.description.strip():
            similarity = max(0.0, _cosine(embed(mine[:2000]), embed(job.description[:2000])))
            parts["semantic"] = similarity
            evidence["semantic"] = {"similarity": round(similarity, 3)}
            score = partial()

    known_weight = sum(WEIGHTS[k] for k, v in parts.items() if v is not None)
    confidence = round(known_weight / sum(WEIGHTS[k] for k in parts), 2)

    if skills_ev.get("matched"):
        strengths.append(f"Matches {len(skills_ev['matched'])} of the skills asked for: {', '.join(skills_ev['matched'][:6])}")
    if career_fit == "aligned":
        strengths.append(f"Title lines up with your target role '{role_ev.get('closest_target_role')}'")
    if location_fit in ("remote", "in your target locations"):
        strengths.append(f"Location fits ({location_fit})")
    if salary_fit in ("within your expectation", "above your expectation"):
        strengths.append(f"Pay is {salary_fit}")
    if exp_ev.get("have_years") is not None and not exp_ev.get("gap_years") and exp_ev.get("need_years"):
        strengths.append(f"Your {exp_ev['have_years']:.0f} years cover the {exp_ev['need_years']} asked for")

    if skills_ev.get("missing") and skills is not None:
        weaknesses.append(f"Skills asked for that are not on your profile: {', '.join(skills_ev['missing'][:6])}")
    if career_fit == "off-target":
        weaknesses.append("Title is unlike any role you are targeting")
    if location_fit.startswith("outside"):
        weaknesses.append(f"Location: {location_fit}")
    if salary_fit == "below your expectation":
        weaknesses.append("Pay is below your expectation")
    if exp_ev.get("gap_years"):
        weaknesses.append(f"Asks for {exp_ev['need_years']} years; your profile shows {exp_ev['have_years']:.0f}")
    if visa_fit == "not_eligible":
        weaknesses.append(visa_note)
    elif visa_fit == "unknown" and "check" in visa_note.lower():
        weaknesses.append(visa_note)

    if blocks:
        recommendation = NOT_ELIGIBLE
        score = min(score, 25.0)
    else:
        recommendation = STRONG if score >= 75 else GOOD if score >= 60 else PARTIAL if score >= 40 else WEAK

    return {
        "job_id": job.job_id,
        "match_score": round(score),
        "recommendation": recommendation,
        "confidence": confidence,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "missing_skills": skills_ev.get("missing", []) if skills is not None else [],
        "salary_fit": salary_fit,
        "location_fit": location_fit,
        "visa_fit": visa_fit,
        "career_fit": career_fit,
        "tiers_used": tiers,
        "evidence": evidence,
    }


def rank_jobs(
    profile: Dict[str, Any],
    jobs: List[NormalizedJob],
    embed: Optional[Callable[[str], Sequence[float]]] = None,
    reasoner: Optional[Callable[[Dict[str, Any], NormalizedJob, Dict[str, Any]], str]] = None,
) -> List[Dict[str, Any]]:
    """Score every job (tiers 1-3), best first, then spend the LLM only on the top few."""
    results = [score_job(profile, job, embed) for job in jobs]
    order = sorted(range(len(jobs)), key=lambda i: -results[i]["match_score"])
    if reasoner:
        for i in order[:REASONER_TOP_N]:
            if results[i]["match_score"] < REASONER_MIN_SCORE or results[i]["recommendation"] == NOT_ELIGIBLE:
                continue
            try:
                note = reasoner(profile, jobs[i], results[i])
            except Exception:  # an unavailable model never fails a search
                continue
            if note:
                results[i]["reasoning"] = note
                results[i]["tiers_used"].append("llm")
    return [results[i] for i in order]
