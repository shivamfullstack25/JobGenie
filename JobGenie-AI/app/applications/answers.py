"""AnswerPolicy: answer application-form questions from the profile — or say plainly that we can't.

Every answer states where it came from (the profile field), how sure we are, and whether a person
must approve it before use. Anything the profile does not contain is the literal string
``USER_INPUT_REQUIRED``; nothing is ever fabricated. Open-ended questions ("why us?") are never
auto-answered: the user gets the most relevant evidence from their own profile to write from.
"""

import re
from dataclasses import asdict, dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.agents.resume_agent import _by_relevance, _has_term, _terms_for
from app.jobs.matching import profile_years

USER_INPUT_REQUIRED = "USER_INPUT_REQUIRED"

FILLED, NEEDS_INPUT, DRAFT_ONLY = "FILLED", "USER_INPUT_REQUIRED", "DRAFT_ONLY"

# Answers about these are consequential or legally meaningful: a person always approves them.
ALWAYS_APPROVE = {"salary", "work_authorization", "sponsorship", "relocation", "notice_period"}


@dataclass
class Answer:
    question: str
    topic: str
    answer: Any
    source: Optional[str]
    confidence: float
    requires_approval: bool
    status: str
    note: Optional[str] = None
    evidence: Optional[List[str]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _present(value: Any) -> bool:
    return value not in (None, "", [], {}, USER_INPUT_REQUIRED)


def _money(expect: Dict[str, Any]) -> Optional[str]:
    low, high = expect.get("min"), expect.get("max")
    cur, period = expect.get("currency") or "", expect.get("period") or "year"
    if not isinstance(low, (int, float)) and not isinstance(high, (int, float)):
        return None
    span = f"{low:,.0f}–{high:,.0f}" if isinstance(low, (int, float)) and isinstance(high, (int, float)) else f"{(low if isinstance(low, (int, float)) else high):,.0f}"
    return f"{cur} {span} per {period}".strip()


def _current_role(profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    for entry in profile.get("experience") or []:
        if isinstance(entry, dict) and str(entry.get("end") or "").strip().lower() in ("present", "current", "now", "ongoing", ""):
            return entry
    return None


# topic -> (question pattern, resolver(profile) -> (value, source field) )
def _simple(field: str, transform: Callable[[Any], Any] = lambda v: v):
    return lambda p: (transform(p.get(field)), field) if _present(p.get(field)) else (None, field)


def _years(p: Dict[str, Any]) -> Tuple[Any, str]:
    years = profile_years(p)
    return (str(int(years)) if years is not None else None), "experience"


def _sponsorship(p: Dict[str, Any]) -> Tuple[Any, str]:
    visa = p.get("workAuthorization.visa")
    if isinstance(visa, dict) and isinstance(visa.get("sponsorshipNeeded"), bool):
        return ("Yes" if visa["sponsorshipNeeded"] else "No"), "workAuthorization.visa"
    return None, "workAuthorization.visa"


def _name_part(index: int) -> Callable[[Dict[str, Any]], Tuple[Any, str]]:
    def resolve(p: Dict[str, Any]) -> Tuple[Any, str]:
        parts = str(p.get("identity.fullName") or "").split()
        if len(parts) < 2:
            return None, "identity.fullName"
        return (parts[0] if index == 0 else " ".join(parts[1:])), "identity.fullName"

    return resolve


RULES: List[Tuple[str, str, Callable[[Dict[str, Any]], Tuple[Any, str]]]] = [
    ("sponsorship", r"sponsor", _sponsorship),
    ("work_authorization", r"authori[sz]ed to work|work authori[sz]ation|legally (able|eligible|permitted)|right to work|eligible to work|work permit|visa status", _simple("workAuthorization.status")),
    ("salary", r"salary|compensation|ctc|expected pay|pay expectation|remuneration", lambda p: (_money(p["preferences.salaryExpectation"]) if isinstance(p.get("preferences.salaryExpectation"), dict) else None, "preferences.salaryExpectation")),
    ("notice_period", r"notice period|how soon can you (start|join)|earliest (start|joining)|availability to (start|join)", _simple("preferences.noticePeriod")),
    ("relocation", r"relocat", _simple("preferences.willingToRelocate")),
    ("remote_preference", r"remote|hybrid|on-?site|work arrangement", _simple("preferences.remotePreference")),
    ("years_experience", r"years of (professional |total |relevant )?experience|how many years|total experience|work experience in years", _years),
    ("first_name", r"first name|given name", _name_part(0)),
    ("last_name", r"last name|surname|family name", _name_part(1)),
    ("full_name", r"full name|your name|legal name", _simple("identity.fullName")),
    ("email", r"e-?mail", _simple("contact.email")),
    ("phone", r"phone|mobile|contact number", _simple("contact.phone")),
    ("location", r"current (location|city)|where are you (based|located)|city of residence|location", _simple("location.current")),
    ("linkedin", r"linkedin", _simple("links.linkedin")),
    ("github", r"github", _simple("links.github")),
    ("portfolio", r"portfolio|personal (website|site)|website", _simple("links.portfolio")),
    ("current_company", r"current (employer|company)|present (employer|company)|where do you (currently )?work", lambda p: ((_current_role(p) or {}).get("company"), "experience")),
    ("current_title", r"current (job )?title|current (role|position)|present (role|position)", lambda p: ((_current_role(p) or {}).get("title"), "experience")),
    ("education", r"highest (level of )?(education|qualification)|degree", lambda p: (next((f"{e.get('degree')}, {e.get('institution')}" for e in (p.get("education") or []) if isinstance(e, dict) and e.get("degree")), None), "education")),
]

OPEN_ENDED = re.compile(r"why (do you|are you|would you|us|this)|tell us about|describe (a|your|how)|what (makes|excites|motivates)|cover letter|additional information|anything else|strengths|weakness|proud", re.I)


def _evidence(profile: Dict[str, Any], question: str, job_text: str, n: int = 3) -> List[str]:
    bullets: List[str] = []
    for entry in profile.get("experience") or []:
        if isinstance(entry, dict):
            bullets += [str(b) for b in (entry.get("achievements") or [])]
    terms = _terms_for("software_engineer", f"{question} {job_text}")
    return _by_relevance(bullets, str, terms)[:n]


def answer_question(
    profile: Dict[str, Any],
    question: str,
    provenance: Optional[Dict[str, str]] = None,
    job_text: str = "",
) -> Answer:
    q = question.strip()
    lowered = q.lower()
    provenance = provenance or {}

    # "How many years of experience do you have with Kafka?" is about one technology. The profile
    # holds total years, not per-skill years, so answering with the total would overstate it.
    per_skill = re.search(r"years?(?: of)? (?:\w+ )?experience[^?.]{0,30}\b(?:with|in|using|on)\s+[a-z]", lowered)
    if per_skill and not re.search(r"\b(total|overall|professional|relevant)\b", lowered):
        tech = re.search(r"\b(?:with|in|using|on)\s+([A-Za-z0-9.+#/ -]{2,30}?)(?:\?|$|\.|,)", q)
        return Answer(
            q, "skill_experience", USER_INPUT_REQUIRED, None, 0.0, True, NEEDS_INPUT,
            note="Your profile has total years, not years per technology, so JobGenie will not guess. Evidence from your history is attached.",
            evidence=_evidence(profile, tech.group(1) if tech else q, job_text),
        )

    for topic, pattern, resolve in RULES:
        if not re.search(pattern, lowered):
            continue
        value, source = resolve(profile)
        if not _present(value):
            return Answer(q, topic, USER_INPUT_REQUIRED, source, 0.0, True, NEEDS_INPUT, note=f"Your profile has no '{source}' yet — add it on My Profile.")
        stated = provenance.get(source) in (None, "FACT", "USER_APPROVED")
        derived = topic in ("years_experience", "first_name", "last_name", "current_company", "current_title", "education")
        confidence = 1.0 if stated and not derived else 0.7 if stated else 0.5
        return Answer(
            q, topic, value, source, confidence,
            requires_approval=topic in ALWAYS_APPROVE or not stated or derived,
            status=FILLED,
            note=None if stated else "Taken from your resume, not yet confirmed by you.",
        )

    if OPEN_ENDED.search(lowered):
        return Answer(
            q, "open_ended", USER_INPUT_REQUIRED, None, 0.0, True, DRAFT_ONLY,
            note="This needs your own words. These are your most relevant achievements to draw on.",
            evidence=_evidence(profile, q, job_text),
        )
    return Answer(q, "unknown", USER_INPUT_REQUIRED, None, 0.0, True, NEEDS_INPUT, note="JobGenie doesn't recognise this question, so it will not guess.")
