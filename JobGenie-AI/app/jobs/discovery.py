"""JobDiscoveryAgent: adapters -> normalize -> deduplicate -> safety -> match, with result caching.

Cost control is built in: each board is fetched at most once per TTL, and a job's safety assessment
is computed once per unchanged posting (keyed by fingerprint + description hash), so repeat searches
re-use work instead of repeating it.
"""

import asyncio
import hashlib
import time
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from app.jobs import safety
from app.jobs.adapters import JobSourceAdapter
from app.jobs.automation import Mode, Switches, effective_mode
from app.jobs.dedup import deduplicate
from app.jobs.matching import rank_jobs
from app.jobs.normalized import NormalizedJob


class JobDiscovery:
    def __init__(
        self,
        adapters: List[JobSourceAdapter],
        switches: Optional[Switches] = None,
        embed: Optional[Callable[[str], Sequence[float]]] = None,
        reasoner: Optional[Callable[..., str]] = None,
        ttl_seconds: float = 900,
        clock: Callable[[], float] = time.time,
    ):
        self.adapters = adapters
        self.switches = switches or Switches.from_env()
        self.embed = embed
        self.reasoner = reasoner
        self.ttl = ttl_seconds
        self._clock = clock
        self._boards: Dict[str, Tuple[float, List[NormalizedJob]]] = {}
        self._safety: Dict[str, Dict[str, Any]] = {}

    async def _board_jobs(self, adapter: JobSourceAdapter) -> List[NormalizedJob]:
        key = f"{adapter.platform}:{getattr(adapter, 'board_token', None) or getattr(adapter, 'site', None) or getattr(adapter, 'board', '')}"
        cached = self._boards.get(key)
        if cached and cached[0] > self._clock():
            return cached[1]
        jobs = await adapter.list_jobs()
        self._boards[key] = (self._clock() + self.ttl, jobs)
        return jobs

    def _assess(self, job: NormalizedJob) -> Dict[str, Any]:
        key = hashlib.sha256(f"{job.fingerprint}|{job.description}".encode("utf-8")).hexdigest()
        if key not in self._safety:
            self._safety[key] = safety.assess(job)
        return self._safety[key]

    async def discover(
        self,
        keywords: List[str],
        location: str = "",
        profile: Optional[Dict[str, Any]] = None,
        trigger: str = "user",
        limit: int = 50,
    ) -> Dict[str, Any]:
        """``trigger`` is "user" for a person's own search, "scheduled" for background runs. Only
        scheduled runs are subject to the global automation switch."""
        skipped: List[Dict[str, str]] = []
        runnable: List[JobSourceAdapter] = []
        for adapter in self.adapters:
            policy = adapter.get_compliance_policy()
            if effective_mode(policy, "search") == Mode.BLOCKED:
                skipped.append({"platform": adapter.platform, "reason": "search not permitted by the platform's terms"})
            elif not self.switches.platform_enabled(adapter.platform):
                skipped.append({"platform": adapter.platform, "reason": "disabled by the operator"})
            elif trigger == "scheduled" and not self.switches.may_run_unattended(adapter.platform):
                skipped.append({"platform": adapter.platform, "reason": "automation is switched off"})
            else:
                runnable.append(adapter)

        async def one(adapter: JobSourceAdapter):
            jobs = await self._board_jobs(adapter)
            terms = [k.lower() for k in keywords if k and k.strip()]
            place = (location or "").strip().lower()
            picked = []
            for job in jobs:
                text = f"{job.title} {job.description}".lower()
                if terms and not any(t in text for t in terms):
                    continue
                if place and place not in ("remote", "anywhere") and place not in job.location.lower() and job.remote_type != "REMOTE":
                    continue
                picked.append(job)
            return picked

        results = await asyncio.gather(*(one(a) for a in runnable), return_exceptions=True)
        errors: List[Dict[str, str]] = []
        found: List[NormalizedJob] = []
        for adapter, result in zip(runnable, results):
            if isinstance(result, Exception):
                errors.append({"platform": adapter.platform, "error": str(result)[:200]})
            else:
                found.extend(result)

        # Copies, so linking duplicates never mutates what the board cache holds.
        import copy

        deduped = deduplicate([copy.copy(j) for j in found], self.embed)
        survivors: List[NormalizedJob] = deduped["jobs"]
        assessments = {j.job_id: self._assess(j) for j in survivors}

        ranked: Dict[str, Dict[str, Any]] = {}
        if profile:
            eligible = [j for j in survivors if not assessments[j.job_id]["blocks_automation"]]
            ranked = {m["job_id"]: m for m in rank_jobs(profile, eligible, self.embed, self.reasoner)}

        entries = [{"job": j.to_dict(), "safety": assessments[j.job_id], "match": ranked.get(j.job_id)} for j in survivors]
        if profile:
            entries.sort(key=lambda e: -(e["match"]["match_score"] if e["match"] else -1))
        return {
            "total": len(entries),
            "jobs": entries[:limit],
            "duplicate_groups": deduped["groups"],
            "skipped": skipped,
            "errors": errors,
        }
