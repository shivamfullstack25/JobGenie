"""ResumeAgent: builds role-specific resumes from a CandidateProfile — and cannot invent anything.

The rule this module exists to enforce: a tailored resume may *select and reorder* what is in the
profile, and may (optionally) let a language model *reword* a line, but nothing that is not in the
profile can appear in the output. Two independent checks make that more than a promise:

* ``tailor`` only ever copies items out of the profile, so by construction it adds nothing.
* ``find_unsupported_claims`` / ``validate_document`` re-check any output — including text a model
  rewrote — and a rewrite that introduces a number, year or skill the profile does not contain is
  discarded in favour of the original line.

The profile is passed in as a flat ``{"identity.fullName": ..., "skills": [...], ...}`` mapping
(the values from the Candidate Profile; the service holds no data of its own).
"""

import re
from typing import Any, Callable, Dict, Iterable, List, Optional, Set

from app.agents.lexicon import SKILL_KEYWORDS

# Preset id -> label and the terms that make a profile item more relevant for that role. These
# only influence ORDER. A preset never adds a skill the profile lacks.
ROLE_PRESETS: Dict[str, Dict[str, Any]] = {
    "java_backend": {"label": "Java Backend", "keywords": ["java", "spring", "spring boot", "sql", "postgresql", "mysql", "rest api", "kafka", "microservices", "hibernate", "jpa", "maven"]},
    "spring_boot": {"label": "Spring Boot", "keywords": ["spring boot", "spring", "java", "rest api", "jpa", "hibernate", "microservices", "security", "actuator"]},
    "microservices": {"label": "Microservices", "keywords": ["microservices", "kafka", "rabbitmq", "docker", "kubernetes", "rest api", "grpc", "api gateway", "service discovery", "event-driven", "distributed"]},
    "full_stack": {"label": "Full Stack", "keywords": ["react", "angular", "vue", "typescript", "javascript", "node.js", "node", "html", "css", "rest api", "sql", "graphql"]},
    "software_engineer": {"label": "Software Engineer", "keywords": ["python", "java", "go", "c++", "algorithms", "data structures", "system design", "testing", "git", "ci/cd", "sql"]},
    "senior_software_engineer": {"label": "Senior Software Engineer", "keywords": ["architecture", "system design", "led", "mentored", "designed", "scaled", "performance", "reliability", "microservices", "ownership", "reviewed"]},
    "engineering_manager": {"label": "Engineering Manager", "keywords": ["led", "managed", "mentored", "hired", "team", "roadmap", "stakeholders", "delivery", "leadership", "agile", "scrum", "project management", "coached"]},
    "genai": {"label": "GenAI", "keywords": ["llm", "rag", "prompt", "embeddings", "vector", "langchain", "openai", "transformers", "machine learning", "deep learning", "pytorch", "fine-tuning", "python"]},
    "cloud": {"label": "Cloud", "keywords": ["aws", "azure", "gcp", "terraform", "kubernetes", "docker", "ci/cd", "jenkins", "infrastructure", "cloudformation", "serverless", "linux"]},
    "international": {"label": "International", "keywords": []},
}

# A tailored resume that lists every skill is not tailored. Callers can pass max_skills=0 for all.
DEFAULT_MAX_SKILLS = 30

_NUMBER = re.compile(r"\d[\d,.]*%?")


def list_presets() -> List[Dict[str, str]]:
    return [{"id": key, "label": value["label"]} for key, value in ROLE_PRESETS.items()]


# ----------------------------------------------------------------------------- claim checking


def _flatten(value: Any) -> Iterable[str]:
    if value is None:
        return
    if isinstance(value, dict):
        for key, inner in value.items():
            yield str(key)
            yield from _flatten(inner)
    elif isinstance(value, (list, tuple, set)):
        for inner in value:
            yield from _flatten(inner)
    else:
        yield str(value)


def _corpus(profile: Dict[str, Any]) -> str:
    return "\n".join(_flatten(profile)).lower()


def _skill_pattern(skill: str) -> "re.Pattern[str]":
    # Lookarounds instead of \b, which does not work around symbol-only tokens like "c++" / "c#".
    return re.compile(r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])")


def _has_term(text_lower: str, term: str) -> bool:
    return bool(_skill_pattern(term.lower()).search(text_lower))


def find_unsupported_claims(text: str, profile: Dict[str, Any]) -> List[str]:
    """What ``text`` asserts that the profile does not contain.

    Checked: every number / percentage / year, and every skill from the shared lexicon. This is
    deliberately conservative — it flags things a reviewer would call fabrication (a new metric, a
    new technology) and ignores ordinary rewording.
    """
    corpus = _corpus(profile)
    known_numbers = {n.rstrip(".,") for n in _NUMBER.findall(corpus)}
    claims: List[str] = []
    lowered = text.lower()
    for number in _NUMBER.findall(text):
        token = number.rstrip(".,")
        # Whole-token comparison: "4" must not be vouched for by "2024".
        if token and token not in known_numbers:
            claims.append(f"number '{token}'")
    for skill in SKILL_KEYWORDS:
        if _has_term(lowered, skill) and not _has_term(corpus, skill):
            claims.append(f"skill '{skill}'")
    seen: Set[str] = set()
    return [c for c in claims if not (c in seen or seen.add(c))]


# --------------------------------------------------------------------------------- relevance


def _terms_for(preset_id: str, job_description: Optional[str]) -> List[str]:
    terms = list(ROLE_PRESETS[preset_id]["keywords"])
    if job_description:
        lowered = job_description.lower()
        terms += [skill for skill in SKILL_KEYWORDS if _has_term(lowered, skill)]
        # Plain words from the posting count too, so non-lexicon domains still order sensibly.
        terms += [w for w in re.findall(r"[a-z][a-z+#.\-]{3,}", lowered) if w not in _STOPWORDS]
    seen: Set[str] = set()
    return [t for t in terms if not (t in seen or seen.add(t))]


_STOPWORDS = {
    "with", "that", "this", "from", "have", "will", "your", "about", "their", "they", "work",
    "team", "role", "years", "experience", "ability", "strong", "skills", "required", "preferred",
    "looking", "join", "must", "including", "responsibilities", "requirements", "company", "good",
}


def _score(text: str, terms: List[str]) -> int:
    lowered = text.lower()
    return sum(1 for term in terms if _has_term(lowered, term))


def _by_relevance(items: List[Any], text_of: Callable[[Any], str], terms: List[str]) -> List[Any]:
    # sorted() is stable, so equally relevant items keep the order the candidate gave them.
    return sorted(items, key=lambda item: -_score(text_of(item), terms))


# ------------------------------------------------------------------------------------ tailor


def _bullets(entry: Dict[str, Any]) -> List[str]:
    bullets = [str(b).strip() for b in (entry.get("achievements") or []) if str(b).strip()]
    description = entry.get("description")
    if description:
        for line in re.split(r"\n+|(?<=[.!?])\s+(?=[A-Z•\-*])", str(description)):
            cleaned = line.strip(" \t•-*")
            if cleaned:
                bullets.append(cleaned)
    return bullets


def tailor(
    profile: Dict[str, Any],
    preset: str,
    job_description: Optional[str] = None,
    provenance: Optional[Dict[str, str]] = None,
    rewriter: Optional[Callable[[str], str]] = None,
    max_skills: Optional[int] = DEFAULT_MAX_SKILLS,
) -> Dict[str, Any]:
    """Build a role-specific resume document from ``profile``.

    ``rewriter`` is an optional ``line -> line`` function (typically an LLM). Its output is used only
    if it introduces no claim the profile lacks; otherwise the original line is kept.
    """
    if preset not in ROLE_PRESETS:
        raise ValueError(f"Unknown role preset '{preset}'")
    terms = _terms_for(preset, job_description)
    discarded: List[str] = []

    def present(value: Any) -> bool:
        return value not in (None, "", [], {}, "USER_INPUT_REQUIRED")

    def get(field: str) -> Any:
        value = profile.get(field)
        return value if present(value) else None

    def line(text: str) -> str:
        if not rewriter:
            return text
        try:
            candidate = (rewriter(text) or "").strip()
        except Exception:  # a failing model must never break resume generation
            return text
        if not candidate or candidate == text:
            return text
        unsupported = find_unsupported_claims(candidate, profile)
        if unsupported:
            discarded.append(f"{text!r}: rewrite added {', '.join(unsupported)}")
            return text
        return candidate

    experience: List[Dict[str, Any]] = []
    for entry in _by_relevance([e for e in (get("experience") or []) if isinstance(e, dict)], lambda e: " ".join(_flatten(e)), terms):
        bullets = _by_relevance(_bullets(entry), str, terms)
        experience.append(
            {
                "company": entry.get("company"),
                "title": entry.get("title"),
                "start": entry.get("start"),
                "end": entry.get("end"),
                "bullets": [line(b) for b in bullets],
            }
        )
    # Reverse-chronological order is what readers and ATS parsers expect; relevance only breaks
    # ties between roles with the same dates, so re-sort by end date (present first).
    experience.sort(key=lambda e: _recency(e))

    skills = [str(s) for s in (get("skills") or []) if str(s).strip()]
    skills = _by_relevance(skills, str, terms)
    if max_skills:  # None or 0 means "keep them all"
        skills = skills[:max_skills]

    document: Dict[str, Any] = {
        "preset": preset,
        "label": ROLE_PRESETS[preset]["label"],
        "header": {
            "name": get("identity.fullName"),
            "email": get("contact.email"),
            "phone": get("contact.phone"),
            "location": get("location.current"),
            "links": {
                key.split(".", 1)[1]: get(key)
                for key in ("links.linkedin", "links.github", "links.portfolio")
                if get(key)
            },
        },
        "headline": get("identity.headline"),
        "summary": line(get("identity.summary")) if get("identity.summary") else None,
        "skills": skills,
        "experience": experience,
        "projects": _by_relevance([p for p in (get("projects") or [])], lambda p: " ".join(_flatten(p)), terms),
        "education": list(get("education") or []),
        "certifications": list(get("certifications") or []),
    }
    if preset == "international":
        document["international"] = {
            "country": get("location.country"),
            "workAuthorization": get("workAuthorization.status"),
            "visa": get("workAuthorization.visa"),
            "willingToRelocate": get("preferences.willingToRelocate"),
            "noticePeriod": get("preferences.noticePeriod"),
        }
        document["international"] = {k: v for k, v in document["international"].items() if v}

    used_fields = [f for f in profile if present(profile[f])]
    unverified = sorted(
        f for f in used_fields if provenance and provenance.get(f) in ("INFERRED", "AI_GENERATED")
    )
    document["unverified_fields"] = unverified
    document["missing"] = [
        f for f in ("identity.fullName", "contact.email", "experience", "skills") if get(f) is None
    ]
    document["discarded_rewrites"] = discarded
    document["violations"] = validate_document(document, profile)
    return document


def _year(text: Any) -> int:
    match = re.search(r"(?:19|20)\d{2}", str(text or ""))
    return int(match.group()) if match else 0


def _recency(entry: Dict[str, Any]) -> tuple:
    """Sort key: current roles first (newest start first), then past roles by end year, newest first."""
    end = str(entry.get("end") or "").strip().lower()
    if end in ("", "present", "current", "now", "ongoing"):
        return (0, -_year(entry.get("start")))
    return (1, -_year(end))


# --------------------------------------------------------------------------------- validation


def validate_document(document: Dict[str, Any], profile: Dict[str, Any]) -> List[str]:
    """Every problem that makes ``document`` say something the profile does not. Empty means clean."""
    problems: List[str] = []
    corpus = _corpus(profile)

    profile_skills = {str(s).strip().lower() for s in (profile.get("skills") or [])}
    for skill in document.get("skills", []):
        if str(skill).strip().lower() not in profile_skills:
            problems.append(f"skill not in profile: {skill}")

    profile_entries = [e for e in (profile.get("experience") or []) if isinstance(e, dict)]
    for entry in document.get("experience", []):
        match = next(
            (
                p
                for p in profile_entries
                if p.get("company") == entry.get("company")
                and p.get("title") == entry.get("title")
                and p.get("start") == entry.get("start")
                and p.get("end") == entry.get("end")
            ),
            None,
        )
        if match is None:
            problems.append(f"experience not in profile: {entry.get('title')} at {entry.get('company')}")
            continue
        for bullet in entry.get("bullets", []):
            unsupported = find_unsupported_claims(bullet, profile)
            if unsupported:
                problems.append(f"{entry.get('company')}: '{bullet[:60]}' asserts {', '.join(unsupported)}")

    for key in ("education", "certifications"):
        for item in document.get(key, []):
            if any(token and token.lower() not in corpus for token in map(str, _flatten(item))):
                problems.append(f"{key} entry not in profile: {item}")

    summary = document.get("summary")
    if summary:
        unsupported = find_unsupported_claims(summary, profile)
        if unsupported:
            problems.append(f"summary asserts {', '.join(unsupported)}")
    return problems


def compare_to_profile(resume_skills: List[str], profile: Dict[str, Any]) -> Dict[str, List[str]]:
    """How a resume's skills differ from the profile — what the resume claims that the profile
    doesn't back, and what the profile has that the resume leaves out."""
    profile_skills = [str(s) for s in (profile.get("skills") or [])]
    p = {s.lower() for s in profile_skills}
    r = {s.lower() for s in resume_skills}
    return {
        "unsupported_by_profile": sorted(s for s in resume_skills if s.lower() not in p),
        "missing_from_resume": sorted(s for s in profile_skills if s.lower() not in r),
    }


# --------------------------------------------------------------------------------- rendering


def to_text(document: Dict[str, Any]) -> str:
    """Plain-text rendering (ATS-friendly: no tables, no columns)."""
    out: List[str] = []
    header = document.get("header", {})
    if header.get("name"):
        out.append(str(header["name"]).upper())
    contact = [str(v) for v in (header.get("email"), header.get("phone"), header.get("location")) if v]
    contact += [str(v) for v in header.get("links", {}).values()]
    if contact:
        out.append(" | ".join(contact))
    if document.get("headline"):
        out.append(str(document["headline"]))
    if document.get("summary"):
        out += ["", "SUMMARY", str(document["summary"])]
    intl = document.get("international")
    if intl:
        out += ["", "WORK AUTHORIZATION & LOCATION"] + [f"{k}: {v}" for k, v in intl.items()]
    if document.get("skills"):
        out += ["", "SKILLS", ", ".join(map(str, document["skills"]))]
    if document.get("experience"):
        out += ["", "EXPERIENCE"]
        for e in document["experience"]:
            dates = " – ".join(str(x) for x in (e.get("start"), e.get("end")) if x)
            out.append(" — ".join(str(x) for x in (e.get("title"), e.get("company"), dates) if x))
            out += [f"  • {b}" for b in e.get("bullets", [])]
    for key, title in (("projects", "PROJECTS"), ("education", "EDUCATION"), ("certifications", "CERTIFICATIONS")):
        items = document.get(key) or []
        if items:
            out += ["", title]
            for item in items:
                out.append("  • " + (" — ".join(str(v) for v in item.values() if v) if isinstance(item, dict) else str(item)))
    return "\n".join(out).strip() + "\n"
