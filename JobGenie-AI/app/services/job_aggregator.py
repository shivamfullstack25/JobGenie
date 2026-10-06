import aiohttp
import asyncio
import hashlib
import json
import logging
import os
import re
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

try:
    from redis import asyncio as aioredis
except ImportError:  # pragma: no cover - redis is expected to be installed, but
    # the AI service must never crash on an optional dependency being absent.
    aioredis = None

logger = logging.getLogger(__name__)

# Per-platform scrape timeout so one slow/hanging site can't stall the whole
# search. The overall request used to take 15-20+ seconds because scrapes ran
# with no timeout at all.
PLATFORM_SCRAPE_TIMEOUT_SECONDS = float(os.getenv("JOB_SEARCH_PLATFORM_TIMEOUT_SECONDS", "8"))

# Cache-aside settings for job search results.
JOB_SEARCH_CACHE_TTL_SECONDS = int(os.getenv("JOB_SEARCH_CACHE_TTL_SECONDS", "900"))  # 15 minutes
JOB_SEARCH_CACHE_PREFIX = "job_search:v1"

# Adzuna Jobs API - licensed source, used as the primary source when
# ADZUNA_APP_ID / ADZUNA_APP_KEY are both configured (see CLAUDE.md "Product
# decisions (locked)"). India-first product, so default to the "in" country
# code, but stay overridable for other deployments.
ADZUNA_BASE_URL = os.getenv("ADZUNA_BASE_URL", "https://api.adzuna.com/v1/api/jobs")
ADZUNA_COUNTRY = os.getenv("ADZUNA_COUNTRY", "in")
ADZUNA_TIMEOUT_SECONDS = float(os.getenv("ADZUNA_TIMEOUT_SECONDS", "8"))
ADZUNA_MAX_RESULTS_PER_PAGE = 50


def _compute_match_score(keywords: List[str], title: str, description: str,
                          company: str = "", skills_required: Optional[List[str]] = None) -> int:
    """Compute a real match score (0-100) from keyword overlap between the
    search query and the scraped job's own text, instead of a flat
    per-platform constant. Simple by design: fraction of query terms found
    in the job's title/description/company/skills text, with a small bonus
    when a term hits the title specifically (a stronger relevance signal)."""
    query_terms = {kw.strip().lower() for kw in (keywords or []) if kw and kw.strip()}
    if not query_terms:
        return 50  # neutral baseline - nothing to compare against

    job_text = " ".join([
        title or "",
        description or "",
        company or "",
        " ".join(skills_required or [])
    ]).lower()

    if not job_text.strip():
        return 40  # low-confidence baseline - platform gave us almost no text to score

    matched = sum(1 for term in query_terms if term in job_text)
    coverage = matched / len(query_terms)

    title_text = (title or "").lower()
    title_bonus = min(15, sum(1 for term in query_terms if term in title_text) * 5)

    score = int(round(coverage * 85)) + title_bonus
    return max(30, min(100, score))


def _find_matching_keywords(keywords: List[str], title: str, description: str,
                             company: str = "", skills_required: Optional[List[str]] = None) -> List[str]:
    """Which of the search query's keywords were actually found in this job's own
    text. Used to make "Keyword Match" mean something concrete in the UI (e.g.
    "Matches: python, react") instead of just restating the job title — previously
    this was always an empty list regardless of the real overlap _compute_match_score
    was scoring against."""
    query_terms = [kw.strip().lower() for kw in (keywords or []) if kw and kw.strip()]
    if not query_terms:
        return []
    job_text = " ".join([
        title or "", description or "", company or "", " ".join(skills_required or [])
    ]).lower()
    return [term for term in query_terms if term in job_text]


class JobAggregator:
    def __init__(self):
        self.session = None
        self.redis_client = None
        self.platforms = {
            'linkedin': LinkedInJobScraper(),
            'indeed': IndeedJobScraper(),
            'naukri': NaukriJobScraper(),
            'glassdoor': GlassdoorJobScraper(),
            'monster': MonsterJobScraper()
        }

    async def initialize(self):
        """Initialize the job aggregator with HTTP session"""
        self.session = aiohttp.ClientSession(
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        )
        await self._init_redis()

    async def _init_redis(self):
        """Best-effort Redis connection for the job search cache. Never raises -
        any failure here just leaves caching disabled and search falls back to
        the uncached scrape path."""
        if aioredis is None:
            logger.warning("redis package not available - job search caching disabled")
            self.redis_client = None
            return

        try:
            redis_url = os.getenv("REDIS_URL")
            if redis_url:
                client = aioredis.from_url(
                    redis_url,
                    socket_connect_timeout=2,
                    socket_timeout=2,
                    decode_responses=True,
                )
            else:
                client = aioredis.Redis(
                    host=os.getenv("REDIS_HOST", "redis"),
                    port=int(os.getenv("REDIS_PORT", "6379")),
                    socket_connect_timeout=2,
                    socket_timeout=2,
                    decode_responses=True,
                )
            await client.ping()
            self.redis_client = client
            logger.info("Job search cache connected to Redis")
        except Exception as e:
            logger.warning(f"Redis unavailable for job search cache, falling back to uncached scraping: {e}")
            self.redis_client = None

    def _build_cache_key(self, keywords: List[str], location: str,
                          platforms: List[str], max_jobs: int) -> str:
        """Normalize search params into a stable cache key so equivalent
        searches (same keywords/location/platforms/max_jobs, regardless of
        order or casing) hit the same cache entry."""
        normalized = {
            "keywords": sorted({(k or "").strip().lower() for k in (keywords or []) if k and k.strip()}),
            "location": (location or "").strip().lower(),
            "platforms": sorted({(p or "").strip().lower() for p in (platforms or []) if p and p.strip()}),
            "max_jobs": max_jobs,
        }
        digest = hashlib.sha256(json.dumps(normalized, sort_keys=True).encode("utf-8")).hexdigest()
        return f"{JOB_SEARCH_CACHE_PREFIX}:{digest}"

    async def _get_cached_results(self, cache_key: str) -> Optional[List[Dict[str, Any]]]:
        """Cache read. Any Redis failure is treated as a cache miss, never raised."""
        if not self.redis_client:
            return None
        try:
            cached = await self.redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Job search cache read failed, falling back to live scrape: {e}")
        return None

    async def _set_cached_results(self, cache_key: str, jobs: List[Dict[str, Any]]) -> None:
        """Cache write. Any Redis failure is logged and swallowed - it must
        never take down a search that already succeeded."""
        if not self.redis_client:
            return
        try:
            await self.redis_client.set(cache_key, json.dumps(jobs), ex=JOB_SEARCH_CACHE_TTL_SECONDS)
        except Exception as e:
            logger.warning(f"Job search cache write failed: {e}")

    async def _search_platform_with_timeout(self, platform: str, keywords: List[str],
                                             location: str, max_jobs: int) -> List[Dict[str, Any]]:
        """Run one platform's scrape with a hard timeout so a slow/hanging
        site can't stall the whole search. Returns [] (not raised) on
        timeout or any other error - other platforms' results are unaffected."""
        try:
            return await asyncio.wait_for(
                self.platforms[platform].search_jobs(self.session, keywords, location, max_jobs),
                timeout=PLATFORM_SCRAPE_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning(f"{platform} job search timed out after {PLATFORM_SCRAPE_TIMEOUT_SECONDS}s - skipping")
            return []
        except Exception as e:
            logger.error(f"Error searching {platform} jobs: {e}")
            return []

    def _get_adzuna_credentials(self) -> Optional[Dict[str, str]]:
        """Read Adzuna credentials fresh on every call (not cached at import
        time) so enabling/disabling the integration via env vars takes effect
        without a restart-sensitive module reload. Adzuna is only used as the
        primary source when BOTH vars are set and non-empty."""
        app_id = (os.getenv("ADZUNA_APP_ID") or "").strip()
        app_key = (os.getenv("ADZUNA_APP_KEY") or "").strip()
        if not app_id or not app_key:
            return None
        return {"app_id": app_id, "app_key": app_key}

    async def _search_adzuna(self, keywords: List[str], location: str, max_jobs: int,
                              credentials: Dict[str, str]) -> List[Dict[str, Any]]:
        """Query the licensed Adzuna Jobs API - a single fast call, so unlike
        the 5-site scrape this can run inline on the request path (still
        cache-first via search_jobs, so repeat searches don't even reach
        Adzuna). Raises on any failure; the caller falls back to the scraper
        path rather than surfacing an error to the user."""
        results_per_page = max(1, min(int(max_jobs) or 20, ADZUNA_MAX_RESULTS_PER_PAGE))
        country = (os.getenv("ADZUNA_COUNTRY") or ADZUNA_COUNTRY or "in").strip().lower()
        url = f"{ADZUNA_BASE_URL}/{country}/search/1"
        params = {
            "app_id": credentials["app_id"],
            "app_key": credentials["app_key"],
            "what": " ".join(keywords or []),
            "where": location or "",
            "results_per_page": results_per_page,
            "content-type": "application/json",
        }

        async with self.session.get(
            url, params=params, timeout=aiohttp.ClientTimeout(total=ADZUNA_TIMEOUT_SECONDS)
        ) as response:
            if response.status != 200:
                body = await response.text()
                raise RuntimeError(f"Adzuna API returned {response.status}: {body[:200]}")
            data = await response.json(content_type=None)

        results = data.get("results", []) if isinstance(data, dict) else []
        return [self._map_adzuna_job(item, keywords, idx) for idx, item in enumerate(results)]

    def _map_adzuna_job(self, item: Dict[str, Any], keywords: List[str], idx: int) -> Dict[str, Any]:
        """Map one Adzuna result into this file's internal job shape so
        downstream code (scoring, dedup, sorting, API responses) doesn't need
        to know the difference between an Adzuna job and a scraped one."""
        title = item.get("title", "") or ""
        company = (item.get("company") or {}).get("display_name", "") or ""
        location_name = (item.get("location") or {}).get("display_name", "") or ""
        description = item.get("description", "") or ""
        url = item.get("redirect_url", "") or ""  # real click-out URL

        salary_min = item.get("salary_min")
        salary_max = item.get("salary_max")
        salary_range = ""
        if salary_min and salary_max:
            salary_range = f"{salary_min:,.0f} - {salary_max:,.0f}"
        elif salary_min or salary_max:
            salary_range = f"{(salary_min or salary_max):,.0f}"

        created = item.get("created", "") or ""
        posted_date = created[:10] if len(created) >= 10 else datetime.now().strftime('%Y-%m-%d')

        adzuna_id = item.get("id")
        job_id = f"adzuna_{adzuna_id}" if adzuna_id else f"adzuna_{idx}"

        return {
            'id': job_id,
            'title': title,
            'company': company,
            'location': location_name,
            'platform': 'Adzuna',
            'url': url,
            'posted_date': posted_date,
            'description': description,
            'salary_range': salary_range,
            'match_score': _compute_match_score(keywords, title, description, company),
            'skills_required': _find_matching_keywords(keywords, title, description, company),
            'source': 'adzuna',
        }

    def _sample_jobs(self, keywords: List[str], location: str, max_jobs: int) -> List[Dict[str, Any]]:
        """Small, clearly-labeled placeholder result used only when neither
        Adzuna nor any scraper produced anything (e.g. everything is down).
        Never presented as live data - source is always 'sample'."""
        query = " ".join(keywords or []).strip() or "Software Engineer"
        title_case_query = query.title()
        templates = [
            ("{q}", "Sample Employer A"),
            ("Senior {q}", "Sample Employer B"),
            ("{q} (Remote)", "Sample Employer C"),
        ]
        samples = []
        for i, (title_tpl, company) in enumerate(templates[:max(1, min(max_jobs, len(templates)))]):
            title = title_tpl.format(q=title_case_query)
            description = (
                f"No live job data was available for this search. This is a placeholder "
                f"result standing in for a real '{query}' listing."
            )
            samples.append({
                'id': f"sample_{i}",
                'title': title,
                'company': company,
                'location': location or 'Remote',
                'platform': 'Sample',
                'url': '',
                'posted_date': datetime.now().strftime('%Y-%m-%d'),
                'description': description,
                'salary_range': '',
                'match_score': _compute_match_score(keywords, title, description, company),
                'skills_required': _find_matching_keywords(keywords, title, description, company),
                'source': 'sample',
            })
        return samples

    async def search_jobs(self, keywords: List[str], location: str,
                         platforms: List[str] = None, max_jobs: int = 50) -> List[Dict[str, Any]]:
        """Search jobs, using a Redis cache-aside strategy so repeat searches
        return in milliseconds. Sourcing priority on a cache miss:
        1. Adzuna Jobs API (licensed, ToS-safe) when ADZUNA_APP_ID/APP_KEY are set.
        2. The existing multi-site scraper path (off the request path via the
           per-platform timeouts below) when Adzuna isn't configured or fails.
        3. A small labeled sample/placeholder result if both of the above come
           back empty, so a search never returns nothing or 500s.
        Every job carries a 'source' field ('adzuna' | '<platform>' | 'sample')
        and a 'served_from_cache' bool, so callers can be honest with users
        about where a listing really came from."""
        if not self.session:
            await self.initialize()

        if not platforms:
            platforms = ['linkedin', 'indeed', 'naukri']

        cache_key = self._build_cache_key(keywords, location, platforms, max_jobs)
        cached_jobs = await self._get_cached_results(cache_key)
        if cached_jobs is not None:
            logger.info(f"Job search cache hit ({cache_key})")
            return [{**job, 'served_from_cache': True} for job in cached_jobs]

        final_jobs: List[Dict[str, Any]] = []
        is_fallback_sample = False

        # 1. Try Adzuna first when configured - a single fast licensed API
        # call, safe to run inline. Any failure (missing keys, timeout, bad
        # response) falls through to the scraper path below rather than
        # erroring out the search.
        adzuna_credentials = self._get_adzuna_credentials()
        if adzuna_credentials:
            try:
                adzuna_jobs = await self._search_adzuna(keywords, location, max_jobs, adzuna_credentials)
                if adzuna_jobs:
                    final_jobs = self._sort_by_relevance(adzuna_jobs, keywords)[:max_jobs]
                    logger.info(f"Adzuna search returned {len(final_jobs)} jobs")
                else:
                    logger.info("Adzuna search returned no results - falling back to scraper path")
            except Exception as e:
                logger.warning(f"Adzuna search failed, falling back to scraper path: {e}")

        # 2. Fall back to the existing multi-site scraper path (each platform
        # bounded by its own timeout, run concurrently) when Adzuna isn't
        # configured or didn't produce anything.
        if not final_jobs:
            all_jobs = []
            tasks = []
            for platform in platforms:
                if platform in self.platforms:
                    task = self._search_platform_with_timeout(
                        platform, keywords, location, max_jobs // len(platforms)
                    )
                    tasks.append(task)

            results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, list):
                    all_jobs.extend(result)
                elif isinstance(result, Exception):
                    logger.error(f"Error fetching jobs: {result}")

            for job in all_jobs:
                job.setdefault('source', str(job.get('platform', '')).lower())

            unique_jobs = self._remove_duplicates(all_jobs)
            sorted_jobs = self._sort_by_relevance(unique_jobs, keywords)
            final_jobs = sorted_jobs[:max_jobs]

        # 3. If genuinely nothing came back from either source, return a
        # small labeled sample set instead of an empty result or an error.
        if not final_jobs:
            logger.warning("No jobs from Adzuna or scraper platforms - returning sample placeholder jobs")
            final_jobs = self._sample_jobs(keywords, location, max_jobs)
            is_fallback_sample = True

        for job in final_jobs:
            job['served_from_cache'] = False
            # Honest, concrete "why this matched" — job-service's buildMatchReason()
            # already prefers a 'match_reasons' string when present, over the generic
            # "Title at Company" fallback it otherwise builds.
            matched = job.get('skills_required') or []
            job['match_reasons'] = (
                f"Matches: {', '.join(matched)}" if matched
                else "General match - no direct keyword overlap found"
            )

        # Don't lock in a degenerate "everything is down" result for the full
        # TTL - only cache real (Adzuna or scraped) results.
        if not is_fallback_sample:
            await self._set_cached_results(cache_key, final_jobs)

        return final_jobs

    def _remove_duplicates(self, jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate jobs based on title and company"""
        seen = set()
        unique_jobs = []
        
        for job in jobs:
            # Create a unique identifier for each job
            job_id = f"{job.get('title', '').lower()}_{job.get('company', '').lower()}"
            
            if job_id not in seen:
                seen.add(job_id)
                unique_jobs.append(job)
        
        return unique_jobs
    
    def _sort_by_relevance(self, jobs: List[Dict[str, Any]], keywords: List[str]) -> List[Dict[str, Any]]:
        """Sort jobs by relevance to search keywords"""
        def calculate_relevance(job):
            score = 0
            job_text = f"{job.get('title', '')} {job.get('description', '')} {job.get('company', '')}".lower()
            
            for keyword in keywords:
                if keyword.lower() in job_text:
                    score += 1
                    
            return score
        
        return sorted(jobs, key=calculate_relevance, reverse=True)
    
    async def cleanup(self):
        """Clean up resources"""
        if self.session:
            await self.session.close()
        if self.redis_client:
            try:
                await self.redis_client.close()
            except Exception as e:
                logger.warning(f"Error closing job search Redis client: {e}")


class LinkedInJobScraper:
    """LinkedIn job scraper using their API and web scraping"""
    
    async def search_jobs(self, session: aiohttp.ClientSession, keywords: List[str], 
                         location: str, max_jobs: int) -> List[Dict[str, Any]]:
        """Search jobs on LinkedIn"""
        try:
            # LinkedIn API endpoint (requires authentication)
            # For demo purposes, we'll use web scraping approach
            search_query = f"{' '.join(keywords)} {location}"
            
            # LinkedIn job search URL
            url = f"https://www.linkedin.com/jobs/search/?keywords={search_query.replace(' ', '%20')}"
            
            async with session.get(url) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_linkedin_jobs(html, max_jobs, keywords)
                else:
                    logger.warning(f"LinkedIn search failed: {response.status}")
                    return []

        except Exception as e:
            logger.error(f"Error searching LinkedIn jobs: {e}")
            return []

    def _parse_linkedin_jobs(self, html: str, max_jobs: int, keywords: List[str] = None) -> List[Dict[str, Any]]:
        """Parse LinkedIn job listings from HTML"""
        jobs = []
        soup = BeautifulSoup(html, 'html.parser')
        
        # Find job cards
        job_cards = soup.find_all('div', class_='job-search-card')
        
        for card in job_cards[:max_jobs]:
            try:
                title_elem = card.find('h3', class_='base-search-card__title')
                company_elem = card.find('h4', class_='base-search-card__subtitle')
                location_elem = card.find('span', class_='job-search-card__location')
                
                if title_elem and company_elem:
                    title = title_elem.get_text(strip=True)
                    company = company_elem.get_text(strip=True)
                    description = self._extract_description(card)
                    job = {
                        'id': f"linkedin_{len(jobs)}",
                        'title': title,
                        'company': company,
                        'location': location_elem.get_text(strip=True) if location_elem else '',
                        'platform': 'LinkedIn',
                        'url': self._extract_job_url(card),
                        'posted_date': datetime.now().strftime('%Y-%m-%d'),
                        'description': description,
                        'salary_range': '',
                        'match_score': _compute_match_score(keywords, title, description, company),
                        'skills_required': _find_matching_keywords(keywords, title, description, company)
                    }
                    jobs.append(job)
            except Exception as e:
                logger.error(f"Error parsing LinkedIn job card: {e}")
                continue
        
        return jobs
    
    def _extract_job_url(self, card) -> str:
        """Extract job URL from card"""
        link_elem = card.find('a', class_='base-card__full-link')
        if link_elem:
            href = link_elem.get('href', '')
            # LinkedIn's job cards return a full absolute URL here, not a relative
            # path — prefixing the domain again produced a duplicated, broken URL.
            if href.startswith('http'):
                return href
            return f"https://www.linkedin.com{href}"
        return ""
    
    def _extract_description(self, card) -> str:
        """Extract job description from card"""
        desc_elem = card.find('div', class_='job-search-card__snippet')
        if desc_elem:
            return desc_elem.get_text(strip=True)
        return ""


class IndeedJobScraper:
    """Indeed job scraper"""
    
    async def search_jobs(self, session: aiohttp.ClientSession, keywords: List[str], 
                         location: str, max_jobs: int) -> List[Dict[str, Any]]:
        """Search jobs on Indeed"""
        try:
            search_query = f"{' '.join(keywords)} {location}"
            url = f"https://www.indeed.com/jobs?q={search_query.replace(' ', '+')}&l={location.replace(' ', '+')}"
            
            async with session.get(url) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_indeed_jobs(html, max_jobs, keywords)
                else:
                    logger.warning(f"Indeed search failed: {response.status}")
                    return []

        except Exception as e:
            logger.error(f"Error searching Indeed jobs: {e}")
            return []

    def _parse_indeed_jobs(self, html: str, max_jobs: int, keywords: List[str] = None) -> List[Dict[str, Any]]:
        """Parse Indeed job listings from HTML"""
        jobs = []
        soup = BeautifulSoup(html, 'html.parser')
        
        # Find job cards
        job_cards = soup.find_all('div', class_='job_seen_beacon')
        
        for card in job_cards[:max_jobs]:
            try:
                title_elem = card.find('h2', class_='jobTitle')
                company_elem = card.find('span', class_='companyName')
                location_elem = card.find('div', class_='companyLocation')
                
                if title_elem and company_elem:
                    title = title_elem.get_text(strip=True)
                    company = company_elem.get_text(strip=True)
                    description = self._extract_description(card)
                    job = {
                        'id': f"indeed_{len(jobs)}",
                        'title': title,
                        'company': company,
                        'location': location_elem.get_text(strip=True) if location_elem else '',
                        'platform': 'Indeed',
                        'url': self._extract_job_url(card),
                        'posted_date': datetime.now().strftime('%Y-%m-%d'),
                        'description': description,
                        'salary_range': self._extract_salary(card),
                        'match_score': _compute_match_score(keywords, title, description, company),
                        'skills_required': _find_matching_keywords(keywords, title, description, company)
                    }
                    jobs.append(job)
            except Exception as e:
                logger.error(f"Error parsing Indeed job card: {e}")
                continue
        
        return jobs
    
    def _extract_job_url(self, card) -> str:
        """Extract job URL from card"""
        link_elem = card.find('a', class_='jcs-JobTitle')
        if link_elem:
            return f"https://www.indeed.com{link_elem.get('href', '')}"
        return ""
    
    def _extract_description(self, card) -> str:
        """Extract job description from card"""
        desc_elem = card.find('div', class_='job-snippet')
        if desc_elem:
            return desc_elem.get_text(strip=True)
        return ""
    
    def _extract_salary(self, card) -> str:
        """Extract salary information from card"""
        salary_elem = card.find('div', class_='salary-snippet')
        if salary_elem:
            return salary_elem.get_text(strip=True)
        return ""


class NaukriJobScraper:
    """Naukri.com job scraper"""
    
    async def search_jobs(self, session: aiohttp.ClientSession, keywords: List[str], 
                         location: str, max_jobs: int) -> List[Dict[str, Any]]:
        """Search jobs on Naukri.com"""
        try:
            search_query = f"{' '.join(keywords)} {location}"
            url = f"https://www.naukri.com/jobs-in-{location.replace(' ', '-')}?k={search_query.replace(' ', '+')}"
            
            async with session.get(url) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_naukri_jobs(html, max_jobs, keywords)
                else:
                    logger.warning(f"Naukri search failed: {response.status}")
                    return []

        except Exception as e:
            logger.error(f"Error searching Naukri jobs: {e}")
            return []

    def _parse_naukri_jobs(self, html: str, max_jobs: int, keywords: List[str] = None) -> List[Dict[str, Any]]:
        """Parse Naukri job listings from HTML"""
        jobs = []
        soup = BeautifulSoup(html, 'html.parser')
        
        # Find job cards
        job_cards = soup.find_all('div', class_='jobTuple')
        
        for card in job_cards[:max_jobs]:
            try:
                title_elem = card.find('a', class_='title')
                company_elem = card.find('a', class_='subTitle')
                location_elem = card.find('span', class_='location')
                
                if title_elem and company_elem:
                    title = title_elem.get_text(strip=True)
                    company = company_elem.get_text(strip=True)
                    description = self._extract_description(card)
                    job = {
                        'id': f"naukri_{len(jobs)}",
                        'title': title,
                        'company': company,
                        'location': location_elem.get_text(strip=True) if location_elem else '',
                        'platform': 'Naukri',
                        'url': self._extract_job_url(card),
                        'posted_date': datetime.now().strftime('%Y-%m-%d'),
                        'description': description,
                        'salary_range': self._extract_salary(card),
                        'match_score': _compute_match_score(keywords, title, description, company),
                        'skills_required': _find_matching_keywords(keywords, title, description, company)
                    }
                    jobs.append(job)
            except Exception as e:
                logger.error(f"Error parsing Naukri job card: {e}")
                continue
        
        return jobs
    
    def _extract_job_url(self, card) -> str:
        """Extract job URL from card"""
        link_elem = card.find('a', class_='title')
        if link_elem:
            return f"https://www.naukri.com{link_elem.get('href', '')}"
        return ""
    
    def _extract_description(self, card) -> str:
        """Extract job description from card"""
        desc_elem = card.find('div', class_='job-description')
        if desc_elem:
            return desc_elem.get_text(strip=True)
        return ""
    
    def _extract_salary(self, card) -> str:
        """Extract salary information from card"""
        salary_elem = card.find('span', class_='salary')
        if salary_elem:
            return salary_elem.get_text(strip=True)
        return ""


class GlassdoorJobScraper:
    """Glassdoor job scraper"""
    
    async def search_jobs(self, session: aiohttp.ClientSession, keywords: List[str], 
                         location: str, max_jobs: int) -> List[Dict[str, Any]]:
        """Search jobs on Glassdoor"""
        try:
            search_query = f"{' '.join(keywords)} {location}"
            url = f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={search_query.replace(' ', '+')}&locT=N&locId=1&jobType=&fromAge=-1&minSalary=0&includeNoSalaryJobs=true&cityId=-1&minRating=0.0&industryId=-1&sgId=c0d7e3f6-4c7a-4d65-9c9e-4744a3e5f3b1&seniorityType=all&companyId=-1&employerSizes=0&applicationType=0&remoteWorkType=0"
            
            async with session.get(url) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_glassdoor_jobs(html, max_jobs, keywords)
                else:
                    logger.warning(f"Glassdoor search failed: {response.status}")
                    return []

        except Exception as e:
            logger.error(f"Error searching Glassdoor jobs: {e}")
            return []

    def _parse_glassdoor_jobs(self, html: str, max_jobs: int, keywords: List[str] = None) -> List[Dict[str, Any]]:
        """Parse Glassdoor job listings from HTML"""
        jobs = []
        soup = BeautifulSoup(html, 'html.parser')
        
        # Find job cards
        job_cards = soup.find_all('li', class_='react-job-listing')
        
        for card in job_cards[:max_jobs]:
            try:
                title_elem = card.find('a', class_='jobLink')
                company_elem = card.find('a', class_='job-search-key-l2wjgv')
                location_elem = card.find('span', class_='location')
                
                if title_elem and company_elem:
                    title = title_elem.get_text(strip=True)
                    company = company_elem.get_text(strip=True)
                    description = self._extract_description(card)
                    job = {
                        'id': f"glassdoor_{len(jobs)}",
                        'title': title,
                        'company': company,
                        'location': location_elem.get_text(strip=True) if location_elem else '',
                        'platform': 'Glassdoor',
                        'url': self._extract_job_url(card),
                        'posted_date': datetime.now().strftime('%Y-%m-%d'),
                        'description': description,
                        'salary_range': '',
                        'match_score': _compute_match_score(keywords, title, description, company),
                        'skills_required': _find_matching_keywords(keywords, title, description, company)
                    }
                    jobs.append(job)
            except Exception as e:
                logger.error(f"Error parsing Glassdoor job card: {e}")
                continue
        
        return jobs
    
    def _extract_job_url(self, card) -> str:
        """Extract job URL from card"""
        link_elem = card.find('a', class_='jobLink')
        if link_elem:
            return f"https://www.glassdoor.com{link_elem.get('href', '')}"
        return ""
    
    def _extract_description(self, card) -> str:
        """Extract job description from card"""
        desc_elem = card.find('div', class_='job-search-key-srfzjx')
        if desc_elem:
            return desc_elem.get_text(strip=True)
        return ""


class MonsterJobScraper:
    """Monster job scraper"""
    
    async def search_jobs(self, session: aiohttp.ClientSession, keywords: List[str], 
                         location: str, max_jobs: int) -> List[Dict[str, Any]]:
        """Search jobs on Monster"""
        try:
            search_query = f"{' '.join(keywords)} {location}"
            url = f"https://www.monster.com/jobs/search?q={search_query.replace(' ', '+')}&where={location.replace(' ', '+')}"
            
            async with session.get(url) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_monster_jobs(html, max_jobs, keywords)
                else:
                    logger.warning(f"Monster search failed: {response.status}")
                    return []

        except Exception as e:
            logger.error(f"Error searching Monster jobs: {e}")
            return []

    def _parse_monster_jobs(self, html: str, max_jobs: int, keywords: List[str] = None) -> List[Dict[str, Any]]:
        """Parse Monster job listings from HTML"""
        jobs = []
        soup = BeautifulSoup(html, 'html.parser')
        
        # Find job cards
        job_cards = soup.find_all('section', class_='card-content')
        
        for card in job_cards[:max_jobs]:
            try:
                title_elem = card.find('h2', class_='title')
                company_elem = card.find('div', class_='company')
                location_elem = card.find('div', class_='location')
                
                if title_elem and company_elem:
                    title = title_elem.get_text(strip=True)
                    company = company_elem.get_text(strip=True)
                    description = self._extract_description(card)
                    job = {
                        'id': f"monster_{len(jobs)}",
                        'title': title,
                        'company': company,
                        'location': location_elem.get_text(strip=True) if location_elem else '',
                        'platform': 'Monster',
                        'url': self._extract_job_url(card),
                        'posted_date': datetime.now().strftime('%Y-%m-%d'),
                        'description': description,
                        'salary_range': '',
                        'match_score': _compute_match_score(keywords, title, description, company),
                        'skills_required': _find_matching_keywords(keywords, title, description, company)
                    }
                    jobs.append(job)
            except Exception as e:
                logger.error(f"Error parsing Monster job card: {e}")
                continue
        
        return jobs
    
    def _extract_job_url(self, card) -> str:
        """Extract job URL from card"""
        link_elem = card.find('a', class_='jobTitle')
        if link_elem:
            return f"https://www.monster.com{link_elem.get('href', '')}"
        return ""
    
    def _extract_description(self, card) -> str:
        """Extract job description from card"""
        desc_elem = card.find('div', class_='job-snippet')
        if desc_elem:
            return desc_elem.get_text(strip=True)
        return "" 