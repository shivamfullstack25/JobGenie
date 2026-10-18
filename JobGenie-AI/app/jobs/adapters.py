"""JobSourceAdapter and the adapters for sources whose terms permit reading them.

Only public, documented job-board APIs are implemented (Greenhouse, Lever, Ashby). LinkedIn, Indeed,
Naukri, Instahyre, Cutshort and the rest are deliberately absent: their terms prohibit automated
access (docs/platform-compliance.md), and ``get_compliance_policy`` makes that machine-readable.

HTTP is injected as an async ``fetch(url) -> parsed JSON`` so adapters are tested against recorded
payloads and never touch the network in CI.
"""

import asyncio
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.jobs.automation import Mode, PlatformPolicy, policy_for
from app.jobs.normalized import (
    NormalizedJob,
    extract_skills,
    infer_remote_type,
    infer_visa_sponsorship,
    parse_experience_years,
    strip_html,
)

Fetch = Callable[[str], Awaitable[Any]]


@dataclass(frozen=True)
class Capabilities:
    search: bool
    job_details: bool
    salary: bool
    application_url: bool
    submit_application: bool = False  # never true for any adapter in this codebase


class HttpFetcher:
    """Polite JSON GETs: identifies itself, times out, and waits between calls to one host."""

    USER_AGENT = "JobGenie/1.0 (job search aggregator; respects published API terms)"

    def __init__(self, timeout_seconds: float = 8.0, min_interval_seconds: float = 1.0):
        self.timeout_seconds = timeout_seconds
        self.min_interval_seconds = min_interval_seconds
        self._last_call: Dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def __call__(self, url: str) -> Any:
        import aiohttp
        from urllib.parse import urlparse

        host = urlparse(url).netloc
        async with self._lock:
            wait = self._last_call.get(host, 0.0) + self.min_interval_seconds - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call[host] = time.monotonic()
        timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
        async with aiohttp.ClientSession(headers={"User-Agent": self.USER_AGENT}, timeout=timeout) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise RuntimeError(f"{url} returned {response.status}")
                return await response.json(content_type=None)


class JobSourceAdapter(ABC):
    platform: str = ""

    def __init__(self, fetch: Fetch):
        self._fetch = fetch

    @abstractmethod
    async def list_jobs(self) -> List[NormalizedJob]:
        """Every published job on this adapter's board."""

    async def search_jobs(self, keywords: List[str], location: str = "", limit: int = 50) -> List[NormalizedJob]:
        """The board's jobs that mention any keyword (all jobs if none are given), optionally
        narrowed to a location. These APIs have no server-side search, so this filters locally."""
        terms = [k.lower() for k in keywords if k and k.strip()]
        place = (location or "").strip().lower()
        matches = []
        for job in await self.list_jobs():
            haystack = f"{job.title} {job.description}".lower()
            if terms and not any(term in haystack for term in terms):
                continue
            if place and place not in ("remote", "anywhere") and place not in job.location.lower() and job.remote_type != "REMOTE":
                continue
            matches.append(job)
        return matches[:limit]

    async def get_job(self, source_job_id: str) -> Optional[NormalizedJob]:
        return next((j for j in await self.list_jobs() if j.source_job_id == str(source_job_id)), None)

    async def get_job_details(self, source_job_id: str) -> Optional[NormalizedJob]:
        return await self.get_job(source_job_id)

    def get_application_url(self, job: NormalizedJob) -> str:
        """Where the user applies themselves. JobGenie never submits on the user's behalf."""
        return job.application_url or job.url

    @abstractmethod
    def get_capabilities(self) -> Capabilities:
        ...

    def get_compliance_policy(self) -> PlatformPolicy:
        return policy_for(self.platform)

    def _require_search_allowed(self) -> None:
        if self.get_compliance_policy().search == Mode.BLOCKED:
            raise PermissionError(f"Searching {self.platform} is not permitted by its published terms")


def _iso_from_millis(value: Any) -> Optional[str]:
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _build(source: str, company: str, raw: Dict[str, Any], **fields: Any) -> NormalizedJob:
    description = fields.pop("description", "")
    location = fields.pop("location", "") or ""
    skills = extract_skills(f"{fields.get('title', '')} {description}")
    return NormalizedJob(
        source=source,
        company=company,
        description=description,
        location=location,
        remote_type=fields.pop("remote_type", None) or infer_remote_type(location, description),
        experience_min_years=parse_experience_years(description),
        required_skills=skills,
        visa_sponsorship=infer_visa_sponsorship(description),
        **fields,
    )


class GreenhouseAdapter(JobSourceAdapter):
    platform = "greenhouse"

    def __init__(self, board_token: str, fetch: Fetch, company_name: Optional[str] = None):
        super().__init__(fetch)
        self.board_token = board_token
        self.company_name = company_name or board_token.replace("-", " ").title()

    async def list_jobs(self) -> List[NormalizedJob]:
        self._require_search_allowed()
        payload = await self._fetch(f"https://boards-api.greenhouse.io/v1/boards/{self.board_token}/jobs?content=true")
        jobs = []
        for raw in (payload or {}).get("jobs", []):
            jobs.append(
                _build(
                    "greenhouse",
                    self.company_name,
                    raw,
                    source_job_id=str(raw.get("id")),
                    url=raw.get("absolute_url", ""),
                    title=raw.get("title", ""),
                    description=strip_html(raw.get("content")),
                    location=(raw.get("location") or {}).get("name", ""),
                    posted_date=(raw.get("updated_at") or "")[:10] or None,
                )
            )
        return jobs

    def get_capabilities(self) -> Capabilities:
        return Capabilities(search=True, job_details=True, salary=False, application_url=True)


class LeverAdapter(JobSourceAdapter):
    platform = "lever"

    def __init__(self, site: str, fetch: Fetch, company_name: Optional[str] = None, eu: bool = False):
        super().__init__(fetch)
        self.site = site
        self.company_name = company_name or site.replace("-", " ").title()
        self.base = "https://api.eu.lever.co" if eu else "https://api.lever.co"

    async def list_jobs(self) -> List[NormalizedJob]:
        self._require_search_allowed()
        payload = await self._fetch(f"{self.base}/v0/postings/{self.site}?mode=json")
        jobs = []
        for raw in payload or []:
            categories = raw.get("categories") or {}
            salary = raw.get("salaryRange") or {}
            jobs.append(
                _build(
                    "lever",
                    self.company_name,
                    raw,
                    source_job_id=str(raw.get("id")),
                    url=raw.get("hostedUrl", ""),
                    application_url=raw.get("applyUrl"),
                    title=raw.get("text", ""),
                    description=raw.get("descriptionPlain") or strip_html(raw.get("description")),
                    location=categories.get("location", ""),
                    employment_type=categories.get("commitment"),
                    remote_type={"remote": "REMOTE", "hybrid": "HYBRID", "on-site": "ONSITE"}.get(str(raw.get("workplaceType", "")).lower()),
                    salary_min=salary.get("min"),
                    salary_max=salary.get("max"),
                    currency=salary.get("currency"),
                    salary_period=salary.get("interval"),
                    posted_date=_iso_from_millis(raw.get("createdAt")),
                )
            )
        return jobs

    def get_capabilities(self) -> Capabilities:
        return Capabilities(search=True, job_details=True, salary=True, application_url=True)


class AshbyAdapter(JobSourceAdapter):
    platform = "ashby"

    def __init__(self, board: str, fetch: Fetch, company_name: Optional[str] = None):
        super().__init__(fetch)
        self.board = board
        self.company_name = company_name or board.replace("-", " ").title()

    async def list_jobs(self) -> List[NormalizedJob]:
        self._require_search_allowed()
        payload = await self._fetch(f"https://api.ashbyhq.com/posting-api/job-board/{self.board}?includeCompensation=true")
        jobs = []
        for raw in (payload or {}).get("jobs", []):
            comp = (raw.get("compensation") or {}).get("summaryComponents") or []
            salary = next((c for c in comp if str(c.get("compensationType", "")).lower() == "salary"), {})
            jobs.append(
                _build(
                    "ashby",
                    self.company_name,
                    raw,
                    source_job_id=str(raw.get("id")),
                    url=raw.get("jobUrl", ""),
                    application_url=raw.get("applyUrl"),
                    title=raw.get("title", ""),
                    description=raw.get("descriptionPlain") or strip_html(raw.get("descriptionHtml")),
                    location=raw.get("location", ""),
                    employment_type=raw.get("employmentType"),
                    remote_type="REMOTE" if raw.get("isRemote") else None,
                    salary_min=salary.get("minValue"),
                    salary_max=salary.get("maxValue"),
                    currency=salary.get("currencyCode"),
                    salary_period=salary.get("interval"),
                    posted_date=(raw.get("publishedAt") or "")[:10] or None,
                )
            )
        return jobs

    def get_capabilities(self) -> Capabilities:
        return Capabilities(search=True, job_details=True, salary=True, application_url=True)


def parse_board_spec(spec: str, fetch: Fetch) -> List[JobSourceAdapter]:
    """``"greenhouse:stripe,lever:netflix:Netflix,ashby:ramp"`` -> adapters. Unknown platforms are
    refused rather than guessed at, so a typo cannot silently widen what is fetched."""
    adapters: List[JobSourceAdapter] = []
    for item in (s.strip() for s in spec.split(",") if s.strip()):
        parts = item.split(":")
        platform, token = parts[0].lower(), (parts[1] if len(parts) > 1 else "")
        name = parts[2] if len(parts) > 2 else None
        if not token:
            raise ValueError(f"Board '{item}' needs a token: platform:token[:Company Name]")
        if platform == "greenhouse":
            adapters.append(GreenhouseAdapter(token, fetch, name))
        elif platform == "lever":
            adapters.append(LeverAdapter(token, fetch, name))
        elif platform == "ashby":
            adapters.append(AshbyAdapter(token, fetch, name))
        else:
            raise ValueError(f"No permitted adapter for '{platform}' (supported: greenhouse, lever, ashby)")
    return adapters
