"""NormalizedJob: one shape for a job, whatever source it came from, plus the helpers that fill it."""

import hashlib
import html
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from app.agents.lexicon import SKILL_KEYWORDS

REMOTE, HYBRID, ONSITE, UNKNOWN = "REMOTE", "HYBRID", "ONSITE", "UNKNOWN"

_TRACKING_PARAMS = {"gh_src", "source", "src", "ref", "referrer", "lever-source", "lever-origin", "trk", "fbclid", "gclid", "mc_cid", "mc_eid"}

_COMPANY_SUFFIXES = {
    "inc", "llc", "ltd", "limited", "pvt", "private", "corp", "corporation", "co", "gmbh", "plc", "sa", "bv", "ag", "pte", "llp",
}

# Host fragment -> ATS. Detecting an ATS says nothing about being allowed to automate it.
_ATS_SIGNATURES = [
    ("greenhouse", ("greenhouse.io",)),
    ("lever", ("lever.co",)),
    ("ashby", ("ashbyhq.com",)),
    ("workday", ("myworkdayjobs.com", "myworkdaysite.com", "workday.com")),
    ("icims", ("icims.com",)),
    ("smartrecruiters", ("smartrecruiters.com",)),
    ("workable", ("workable.com",)),
    ("taleo", ("taleo.net",)),
    ("jobvite", ("jobvite.com",)),
    ("successfactors", ("successfactors.com", "successfactors.eu")),
    ("oracle_recruiting", ("oraclecloud.com",)),
]


@dataclass
class NormalizedJob:
    source: str
    source_job_id: Optional[str]
    url: str
    company: str
    title: str
    description: str = ""
    location: str = ""
    country: Optional[str] = None
    remote_type: str = UNKNOWN
    employment_type: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: Optional[str] = None
    salary_period: Optional[str] = None
    experience_min_years: Optional[int] = None
    required_skills: List[str] = field(default_factory=list)
    preferred_skills: List[str] = field(default_factory=list)
    education: Optional[str] = None
    visa_sponsorship: Optional[bool] = None
    posted_date: Optional[str] = None
    deadline: Optional[str] = None
    application_url: Optional[str] = None
    ats_type: Optional[str] = None
    company_domain: Optional[str] = None
    status: str = "ACTIVE"
    fingerprint: str = ""
    job_id: str = ""
    duplicate_of: Optional[str] = None

    def __post_init__(self) -> None:
        self.url = canonical_url(self.url)
        if self.application_url:
            self.application_url = canonical_url(self.application_url)
        self.application_url = self.application_url or self.url
        self.ats_type = self.ats_type or detect_ats(self.application_url) or detect_ats(self.url)
        self.fingerprint = self.fingerprint or fingerprint(self.company, self.title, self.location)
        self.job_id = self.job_id or (
            f"{self.source}:{self.source_job_id}" if self.source_job_id else f"{self.source}:{self.fingerprint[:16]}"
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ------------------------------------------------------------------------------------ text helpers


def strip_html(text: Optional[str]) -> str:
    if not text:
        return ""
    unescaped = html.unescape(text)
    unescaped = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</div>|</h\d>", "\n", unescaped)
    unescaped = re.sub(r"(?i)<li[^>]*>", "• ", unescaped)
    unescaped = re.sub(r"<[^>]+>", " ", unescaped)
    lines = [re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in unescaped.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def canonical_url(url: Optional[str]) -> str:
    """Same job, same URL: lower-cased host, no fragment, no tracking parameters, no trailing slash."""
    if not url:
        return ""
    parsed = urlparse(url.strip())
    query = urlencode(
        [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() not in _TRACKING_PARAMS and not k.lower().startswith("utm_")]
    )
    path = parsed.path.rstrip("/") or ""
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path, "", query, ""))


def normalize_company(name: Optional[str]) -> str:
    words = re.sub(r"[^a-z0-9 ]+", " ", (name or "").lower()).split()
    while words and words[-1] in _COMPANY_SUFFIXES:
        words.pop()
    return " ".join(words)


def normalize_title(title: Optional[str]) -> str:
    cleaned = re.sub(r"\((?:m|f|d|w|x|/|\s)+\)", " ", (title or "").lower())  # gender markers: (m/f/d)
    return " ".join(re.sub(r"[^a-z0-9+#. ]+", " ", cleaned).split())


def city_of(location: Optional[str]) -> str:
    text = (location or "").lower().strip()
    if not text or "remote" in text:
        return "remote" if "remote" in text else ""
    return re.sub(r"[^a-z0-9 ]+", "", text.split(",")[0]).strip()


def fingerprint(company: str, title: str, location: str) -> str:
    key = f"{normalize_company(company)}|{normalize_title(title)}|{city_of(location)}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def detect_ats(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    host = urlparse(url).netloc.lower()
    for name, fragments in _ATS_SIGNATURES:
        if any(host == f or host.endswith("." + f) for f in fragments):
            return name
    return None


def extract_skills(text: str) -> List[str]:
    lowered = (text or "").lower()
    found = []
    for skill in SKILL_KEYWORDS:
        match = re.search(r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])", lowered)
        if match:
            found.append((match.start(), skill))
    return [skill for _, skill in sorted(found)]


def infer_remote_type(location: str, description: str, flag: Optional[bool] = None) -> str:
    text = f"{location} {description[:600]}".lower()
    if flag is True or re.search(r"\bfully remote\b|\bremote[- ]first\b|\b100% remote\b", text) or location.strip().lower() in ("remote", "anywhere"):
        return REMOTE
    if re.search(r"\bhybrid\b", text):
        return HYBRID
    if flag is False or re.search(r"\bon-?site\b|\bin[- ]office\b", text):
        return ONSITE
    if "remote" in text:
        return REMOTE
    return UNKNOWN


def parse_experience_years(description: str) -> Optional[int]:
    """Smallest 'N years' figure stated alongside the word experience, or None."""
    candidates = []
    for match in re.finditer(r"(\d{1,2})\s*\+?\s*(?:-|to)?\s*(?:\d{1,2}\s*)?(?:years?|yrs?)\b", description or "", flags=re.I):
        window = description[max(0, match.start() - 60) : match.end() + 60].lower()
        if "experience" in window and 0 < int(match.group(1)) <= 25:
            candidates.append(int(match.group(1)))
    return min(candidates) if candidates else None


def infer_visa_sponsorship(description: str) -> Optional[bool]:
    text = (description or "").lower()
    if re.search(r"(unable|not able|cannot|can't|won't|will not|do not|does not|don't|not)\s+(to\s+)?(offer\s+|provide\s+)?(visa\s+)?sponsor|no\s+(visa\s+)?sponsorship|without\s+(visa\s+)?sponsorship|must be (legally )?(authorized|eligible) to work", text):
        return False
    if re.search(r"visa sponsorship (is )?(available|provided|offered|possible)|(we|will)\s+(offer|provide|sponsor)\s+(visa|relocation and visa|work visa)|sponsorship (is )?available|relocation (and|&) visa", text):
        return True
    return None
