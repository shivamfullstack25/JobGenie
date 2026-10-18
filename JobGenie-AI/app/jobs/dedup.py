"""JobDeduplicationService: recognise the same job arriving from different places.

Signals, strongest first: identical canonical URL; identical (ATS, source id); identical
fingerprint (company + title + city); and — for the rest — same company with a near-identical title
in a compatible location whose descriptions overlap. Duplicates are *linked* (``duplicate_of``), never
deleted, so a wrong merge is reversible by clearing one field.

Semantic similarity can be added through ``embed`` (text -> vector); without it the rule tiers above
decide, which costs nothing and handles the common case of one posting syndicated to several boards.
"""

import math
import re
from typing import Callable, Dict, List, Optional, Sequence

from app.jobs.normalized import NormalizedJob, city_of, normalize_company, normalize_title

# Where a copy is most trustworthy: the employer's own ATS, then licensed APIs, then aggregators.
SOURCE_PRIORITY = {"greenhouse": 0, "lever": 0, "ashby": 0, "smartrecruiters": 0, "adzuna": 2}

TITLE_SIMILARITY = 0.8
DESCRIPTION_SIMILARITY = 0.6
SEMANTIC_SIMILARITY = 0.92


def _tokens(text: str) -> set:
    return set(re.findall(r"[a-z0-9+#]{2,}", text.lower()))


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def shingles(text: str, size: int = 4) -> set:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(words[i : i + size]) for i in range(max(0, len(words) - size + 1))}


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def _locations_compatible(a: NormalizedJob, b: NormalizedJob) -> bool:
    ca, cb = city_of(a.location), city_of(b.location)
    if not ca or not cb or "remote" in (ca, cb):
        return True  # unknown or remote on either side does not rule a match out
    return ca == cb


def are_duplicates(a: NormalizedJob, b: NormalizedJob, embed: Optional[Callable[[str], Sequence[float]]] = None) -> Optional[str]:
    """Why ``a`` and ``b`` are the same job, or None."""
    if a.url and a.url == b.url:
        return "same URL"
    if a.application_url and a.application_url == b.application_url:
        return "same application URL"
    if a.ats_type and a.ats_type == b.ats_type and a.source_job_id and a.source_job_id == b.source_job_id:
        return "same ATS job id"
    if a.fingerprint == b.fingerprint:
        return "same company, title and city"
    if normalize_company(a.company) != normalize_company(b.company) or not normalize_company(a.company):
        return None
    if jaccard(_tokens(normalize_title(a.title)), _tokens(normalize_title(b.title))) < TITLE_SIMILARITY:
        return None
    if not _locations_compatible(a, b):
        return None
    if a.description and b.description:
        if jaccard(shingles(a.description), shingles(b.description)) >= DESCRIPTION_SIMILARITY:
            return "same company, similar title, near-identical description"
        if embed and _cosine(embed(a.description[:2000]), embed(b.description[:2000])) >= SEMANTIC_SIMILARITY:
            return "same company, similar title, semantically identical description"
        return None
    return "same company and similar title (no description to compare)"


def _preference(job: NormalizedJob) -> tuple:
    return (SOURCE_PRIORITY.get(job.source, 1), -len(job.description or ""))


def deduplicate(jobs: List[NormalizedJob], embed: Optional[Callable[[str], Sequence[float]]] = None) -> Dict[str, object]:
    """Group duplicates. Returns the surviving jobs (one per group, best source and fullest
    description) and the groups. Each non-surviving job has ``duplicate_of`` set to the survivor."""
    parent = list(range(len(jobs)))
    reasons: Dict[int, str] = {}

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    # Bucket by normalized company so only plausible pairs are compared (not every pair of N).
    by_company: Dict[str, List[int]] = {}
    for index, job in enumerate(jobs):
        by_company.setdefault(normalize_company(job.company) or f"?{index}", []).append(index)
    by_url: Dict[str, List[int]] = {}
    for index, job in enumerate(jobs):
        for url in {job.url, job.application_url}:
            if url:
                by_url.setdefault(url, []).append(index)

    candidate_pairs = {(min(i, j), max(i, j)) for group in by_company.values() for i in group for j in group if i < j}
    candidate_pairs |= {(min(i, j), max(i, j)) for group in by_url.values() for i in group for j in group if i < j}
    for i, j in sorted(candidate_pairs):
        if find(i) == find(j):
            continue
        reason = are_duplicates(jobs[i], jobs[j], embed)
        if reason:
            parent[find(j)] = find(i)
            reasons[j] = reason

    groups: Dict[int, List[int]] = {}
    for index in range(len(jobs)):
        groups.setdefault(find(index), []).append(index)

    survivors: List[NormalizedJob] = []
    out_groups = []
    for members in groups.values():
        best = min(members, key=lambda m: _preference(jobs[m]))
        for m in members:
            jobs[m].duplicate_of = None if m == best else jobs[best].job_id
        survivors.append(jobs[best])
        if len(members) > 1:
            out_groups.append(
                {
                    "survivor": jobs[best].job_id,
                    "duplicates": [jobs[m].job_id for m in members if m != best],
                    "reasons": sorted({reasons[m] for m in members if m in reasons}),
                }
            )
    survivors.sort(key=lambda j: jobs.index(j))
    return {"jobs": survivors, "groups": out_groups}
