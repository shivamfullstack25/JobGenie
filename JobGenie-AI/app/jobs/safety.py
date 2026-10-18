"""JobSafetyAgent: score how likely a posting is to be a scam, with the reasons.

Rules only, on purpose: they are free, instant, explainable, and catch the common patterns (advance
fees, chat-app-only contact, free-mail "recruiters", implausible pay). A language model can be added
for the ambiguous middle later; it must not be the first line of defence.

The score is advisory for people and binding for software: a HIGH-risk job can never be a candidate
for any automated step (``blocks_automation``).
"""

import re
from typing import Any, Dict, List, Tuple
from urllib.parse import urlparse

from app.jobs.normalized import NormalizedJob, normalize_company

HIGH, MEDIUM, LOW = "HIGH", "MEDIUM", "LOW"
HIGH_THRESHOLD, MEDIUM_THRESHOLD = 60, 30

_FREE_MAIL = {"gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "rediffmail.com", "proton.me", "protonmail.com", "aol.com"}
_SUSPICIOUS_TLDS = {".top", ".xyz", ".click", ".work", ".loan", ".win", ".cfd", ".icu", ".buzz", ".gq", ".tk", ".ml"}

# (pattern, points, reason)
_TEXT_RULES: List[Tuple[str, int, str]] = [
    (r"registration fee|security deposit|processing fee|training fee|pay (a )?fee|refundable (deposit|fee)|buy (your own )?(laptop|equipment|kit)|purchase (a )?starter kit|application fee", 60, "Asks you to pay money (fee, deposit or equipment) — real employers do not charge to hire you"),
    (r"send (us )?(your )?(bank|aadhaar|passport|ssn|social security|card)|bank (account|details) (to|for) (receive|process)|share your otp|\botp\b", 55, "Asks for sensitive personal or banking details before any interview"),
    (r"(whatsapp|telegram|signal)\b[^.\n]{0,60}(contact|apply|message|reach|join)|(contact|apply|message|reach|join)[^.\n]{0,60}(whatsapp|telegram|signal)\b|t\.me/|wa\.me/", 40, "Moves the conversation to WhatsApp/Telegram"),
    (r"earn\s*(up to\s*)?[$₹€£]?\s*\d[\d,]*\s*(/|per|a)\s*(day|week|hour)|daily payout|weekly payout|guaranteed (income|salary|job|placement)|100% (job )?guarantee", 40, "Promises implausible or guaranteed earnings"),
    (r"no (experience|interview|skills?) (needed|required)[^.\n]{0,80}(salary|earn|pay)|without (any )?interview|instant(ly)? (hired|selection|joining)|immediate joining[^.\n]{0,40}no interview", 35, "Offers a job with no interview or qualifications"),
    (r"data entry[^.\n]{0,60}(work from home|home[- ]based)|(work from home|home[- ]based)[^.\n]{0,60}data entry|typing job|copy[- ]paste job|like and (share|subscribe)|rate (products|videos)", 25, "Matches common work-from-home scam templates"),
    (r"limited (seats|slots|vacancies)|apply (now|immediately) before|\bhurry\b|only \d+ (seats|slots|positions) left|urgent(ly)? (hiring|requirement)!{2,}", 15, "Uses pressure and urgency"),
]


def _host(url: str) -> str:
    return (urlparse(url or "").netloc or "").lower().split(":")[0]


def _emails(text: str) -> List[str]:
    return [d.rstrip(".") for d in re.findall(r"[\w.+-]+@([\w-]+\.[\w.-]+)", text or "")]


def assess(job: NormalizedJob) -> Dict[str, Any]:
    text = f"{job.title}\n{job.description}"
    score = 0
    reasons: List[str] = []

    def add(points: int, reason: str) -> None:
        nonlocal score
        score += points
        reasons.append(reason)

    lowered = text.lower()
    for pattern, points, reason in _TEXT_RULES:
        if re.search(pattern, lowered):
            add(points, reason)

    domains = _emails(job.description)
    free = sorted({d.lower() for d in domains if d.lower() in _FREE_MAIL})
    if free and not job.ats_type:
        add(30, f"Contact is a free email address ({', '.join(free)}) rather than a company domain")

    for url in {job.url, job.application_url}:
        host = _host(url)
        if any(host.endswith(tld) for tld in _SUSPICIOUS_TLDS):
            add(25, f"Apply link goes to a suspicious domain ({host})")
        if re.search(r"bit\.ly|tinyurl|cutt\.ly|t\.co|rb\.gy|shorturl", host):
            add(20, "Apply link is a URL shortener that hides the destination")

    if job.company_domain and job.application_url and not job.ats_type:
        host = _host(job.application_url)
        if host and not (host == job.company_domain or host.endswith("." + job.company_domain)):
            add(15, f"Apply link ({host}) is not on the company's domain ({job.company_domain})")

    if len((job.description or "").strip()) < 80 and not job.ats_type:
        add(10, "Very little description for a real role")

    if not normalize_company(job.company) or normalize_company(job.company) in ("confidential", "hiring", "company", "n a", "na"):
        add(15, "Employer is not named")

    # Pay far out of line with any real market is itself a signal (checked in the posted currency).
    if job.salary_max and job.currency in ("USD", "EUR", "GBP") and job.salary_max > 1_000_000 and (job.salary_period or "year") == "year":
        add(25, f"Stated pay ({int(job.salary_max):,} {job.currency}/year) is implausibly high")

    score = min(100, score)
    level = HIGH if score >= HIGH_THRESHOLD else MEDIUM if score >= MEDIUM_THRESHOLD else LOW
    return {
        "risk_score": score,
        "level": level,
        "reasons": reasons,
        # Binding on software: nothing automated may touch a HIGH-risk job.
        "blocks_automation": level == HIGH,
    }
