"""Job intelligence: normalization, adapters, deduplication, safety, matching, policy, discovery."""

import asyncio

import pytest

from app.jobs import dedup, safety
from app.jobs.adapters import AshbyAdapter, GreenhouseAdapter, LeverAdapter, parse_board_spec
from app.jobs.automation import Mode, POLICIES, Switches, effective_mode, policy_for
from app.jobs.discovery import JobDiscovery
from app.jobs.matching import NOT_ELIGIBLE, rank_jobs, score_job
from app.jobs.normalized import (
    NormalizedJob,
    canonical_url,
    detect_ats,
    infer_visa_sponsorship,
    parse_experience_years,
    strip_html,
)


def run(coro):
    return asyncio.run(coro)


def job(**kw) -> NormalizedJob:
    base = dict(source="test", source_job_id=None, url="https://example.com/j/1", company="Acme", title="Backend Engineer", description="We use Java and Kafka.", location="Pune, India")
    base.update(kw)
    return NormalizedJob(**base)


# ------------------------------------------------------------------------------ fixtures

GREENHOUSE = {
    "jobs": [
        {"id": 101, "title": "Senior Backend Engineer", "updated_at": "2026-10-01T10:00:00Z", "absolute_url": "https://boards.greenhouse.io/acme/jobs/101?gh_src=abc&utm_source=x",
         "location": {"name": "Pune, India"},
         "content": "&lt;p&gt;We need 5+ years of experience with &lt;b&gt;Java&lt;/b&gt;, Spring Boot and Kafka.&lt;/p&gt;&lt;p&gt;Visa sponsorship is available.&lt;/p&gt;"},
        {"id": 102, "title": "Office Manager", "updated_at": "2026-09-01T10:00:00Z", "absolute_url": "https://boards.greenhouse.io/acme/jobs/102", "location": {"name": "London"}, "content": "&lt;p&gt;Run the office.&lt;/p&gt;"},
    ]
}
LEVER = [
    {"id": "abc-1", "text": "Backend Engineer", "hostedUrl": "https://jobs.lever.co/zeta/abc-1", "applyUrl": "https://jobs.lever.co/zeta/abc-1/apply",
     "categories": {"location": "Remote", "commitment": "Full-time"}, "workplaceType": "remote", "createdAt": 1759300000000,
     "descriptionPlain": "Python and Docker on AWS. Min 3 years experience.", "salaryRange": {"min": 4000000, "max": 6000000, "currency": "INR", "interval": "per-year-salary"}},
]
ASHBY = {"jobs": [{"id": "z9", "title": "Platform Engineer", "jobUrl": "https://jobs.ashbyhq.com/ramp/z9", "applyUrl": "https://jobs.ashbyhq.com/ramp/z9/application", "location": "Berlin, Germany", "isRemote": False,
                   "employmentType": "FullTime", "descriptionPlain": "Kubernetes and Terraform. We do not offer visa sponsorship.", "publishedAt": "2026-10-02T00:00:00Z"}]}


def fetcher(mapping):
    async def fetch(url):
        for fragment, payload in mapping.items():
            if fragment in url:
                if isinstance(payload, Exception):
                    raise payload
                return payload
        raise AssertionError(f"unexpected fetch {url}")
    return fetch


# ---------------------------------------------------------------------------- normalization


def test_url_canonicalisation_drops_tracking_and_keeps_identity():
    assert canonical_url("HTTPS://Boards.Greenhouse.io/acme/jobs/101/?gh_src=a&utm_medium=b#top") == "https://boards.greenhouse.io/acme/jobs/101"
    assert canonical_url("https://x.com/jobs?id=7&utm_source=n") == "https://x.com/jobs?id=7"


def test_ats_detection_covers_the_named_systems():
    cases = {
        "https://boards.greenhouse.io/a/jobs/1": "greenhouse", "https://jobs.lever.co/a/1": "lever", "https://jobs.ashbyhq.com/a/1": "ashby",
        "https://acme.wd5.myworkdayjobs.com/en/x": "workday", "https://careers-acme.icims.com/jobs/1": "icims", "https://jobs.smartrecruiters.com/A/1": "smartrecruiters",
        "https://apply.workable.com/a/j/1": "workable", "https://acme.taleo.net/careersection/1": "taleo", "https://jobs.jobvite.com/a/job/1": "jobvite",
        "https://career5.successfactors.eu/x": "successfactors", "https://abc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience": "oracle_recruiting",
    }
    for url, expected in cases.items():
        assert detect_ats(url) == expected, url
    assert detect_ats("https://acme.com/careers") is None
    assert detect_ats("https://notgreenhouse.io.evil.com/x") is None


def test_text_parsers():
    assert strip_html("&lt;p&gt;Hi &lt;b&gt;there&lt;/b&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;") == "Hi there\n• One"
    assert parse_experience_years("Requires 5+ years of professional experience") == 5
    assert parse_experience_years("We have been around for 10 years") is None
    assert infer_visa_sponsorship("Visa sponsorship is available") is True
    assert infer_visa_sponsorship("We are unable to sponsor visas") is False
    assert infer_visa_sponsorship("Great team") is None


def test_identity_is_stable_and_source_scoped():
    a = job(source="lever", source_job_id="1")
    assert a.job_id == "lever:1"
    assert job(company="Acme Inc.", title="Backend Engineer (m/f/d)").fingerprint == job(company="ACME", title="backend engineer").fingerprint


# ------------------------------------------------------------------------------- adapters


def test_greenhouse_adapter_normalises_a_recorded_board():
    jobs = run(GreenhouseAdapter("acme", fetcher({"boards-api.greenhouse.io": GREENHOUSE})).list_jobs())

    first = jobs[0]
    assert (first.source, first.source_job_id, first.company, first.title) == ("greenhouse", "101", "Acme", "Senior Backend Engineer")
    assert first.url == "https://boards.greenhouse.io/acme/jobs/101"
    assert first.ats_type == "greenhouse" and first.visa_sponsorship is True and first.experience_min_years == 5
    assert {"java", "spring boot", "kafka"} <= set(first.required_skills)
    assert "<" not in first.description


def test_lever_and_ashby_adapters_carry_salary_remote_and_apply_urls():
    lever = run(LeverAdapter("zeta", fetcher({"api.lever.co": LEVER})).list_jobs())[0]
    assert lever.remote_type == "REMOTE" and (lever.salary_min, lever.currency) == (4000000, "INR") and lever.posted_date == "2025-10-01"
    assert lever.application_url.endswith("/apply")

    ashby = run(AshbyAdapter("ramp", fetcher({"api.ashbyhq.com": ASHBY})).list_jobs())[0]
    assert ashby.visa_sponsorship is False and ashby.remote_type == "UNKNOWN"
    assert ashby.application_url.endswith("/application")


def test_adapters_never_submit_and_declare_their_policy():
    adapter = GreenhouseAdapter("acme", fetcher({}))
    assert adapter.get_capabilities().submit_application is False
    assert adapter.get_compliance_policy().apply == Mode.BROWSER_ASSISTED
    assert adapter.get_application_url(run(GreenhouseAdapter("acme", fetcher({"greenhouse": GREENHOUSE})).list_jobs())[0]).startswith("https://boards.greenhouse.io")


def test_search_filters_by_keyword_and_location():
    adapter = GreenhouseAdapter("acme", fetcher({"greenhouse": GREENHOUSE}))
    assert [j.source_job_id for j in run(adapter.search_jobs(["kafka"]))] == ["101"]
    assert [j.source_job_id for j in run(adapter.search_jobs([], "London"))] == ["102"]
    assert run(adapter.get_job("102")).title == "Office Manager"


def test_board_spec_refuses_platforms_without_a_permitted_adapter():
    assert [a.platform for a in parse_board_spec("greenhouse:stripe,lever:netflix:Netflix,ashby:ramp", fetcher({}))] == ["greenhouse", "lever", "ashby"]
    for bad in ("linkedin:acme", "indeed:x", "greenhouse"):
        with pytest.raises(ValueError):
            parse_board_spec(bad, fetcher({}))


# ---------------------------------------------------------------------------- compliance


def test_policy_defaults_deny_and_encode_the_researched_terms():
    for platform in ("linkedin", "indeed", "naukri", "instahyre", "cutshort"):
        assert policy_for(platform).search == Mode.BLOCKED
        assert policy_for(platform).apply == Mode.DRAFT_ONLY
    assert policy_for("some-new-board").apply == Mode.BLOCKED
    assert all(p.apply < Mode.HUMAN_APPROVAL for p in POLICIES.values()), "no platform permits unattended submission"


def test_a_stale_policy_review_degrades_to_draft_only():
    gh = policy_for("greenhouse")
    assert effective_mode(gh, "search", today="2026-12-01") == Mode.FULLY_AUTOMATED
    assert effective_mode(gh, "search", today="2027-06-01") == Mode.DRAFT_ONLY


def test_kill_switches_default_to_safe():
    s = Switches()
    assert not s.global_automation_enabled and s.dry_run
    assert not s.may_run_unattended("greenhouse")
    assert not s.may_submit("greenhouse", Mode.FULLY_AUTOMATED), "dry run and global switch both block submission"
    assert not Switches(global_automation_enabled=True, dry_run=False).may_submit("greenhouse", Mode.BROWSER_ASSISTED)
    assert Switches(global_automation_enabled=True, dry_run=False).may_submit("greenhouse", Mode.HUMAN_APPROVAL)
    assert not Switches(global_automation_enabled=True, dry_run=False, disabled_platforms=frozenset({"greenhouse"})).may_submit("greenhouse", Mode.HUMAN_APPROVAL)


def test_switches_read_the_environment(monkeypatch):
    monkeypatch.setenv("GLOBAL_AUTOMATION_ENABLED", "true")
    monkeypatch.setenv("DRY_RUN", "false")
    monkeypatch.setenv("DISABLED_PLATFORMS", "lever, ashby")
    s = Switches.from_env()
    assert s.global_automation_enabled and not s.dry_run and s.disabled_platforms == {"lever", "ashby"}
    monkeypatch.delenv("GLOBAL_AUTOMATION_ENABLED"); monkeypatch.delenv("DRY_RUN")
    assert Switches.from_env().dry_run


# -------------------------------------------------------------------------------- dedup


def test_same_job_from_two_sources_is_linked_not_deleted():
    employer = job(source="greenhouse", source_job_id="101", url="https://boards.greenhouse.io/acme/jobs/101", description="Build services in Java and Kafka for payments. " * 5)
    aggregator = job(source="adzuna", source_job_id="9", url="https://www.adzuna.in/land/ad/9", title="Backend Engineer (m/f/d)", company="Acme Inc.", description="Build services in Java and Kafka for payments. " * 5)

    result = dedup.deduplicate([aggregator, employer])

    assert [j.source for j in result["jobs"]] == ["greenhouse"], "the employer's own copy survives"
    assert aggregator.duplicate_of == employer.job_id and employer.duplicate_of is None
    assert result["groups"][0]["duplicates"] == [aggregator.job_id]


def test_different_jobs_are_not_merged():
    a = job(title="Backend Engineer", description="Java services " * 20)
    b = job(title="Backend Engineer", url="https://example.com/j/2", location="London, UK", description="Java services " * 20)
    c = job(title="Data Scientist", url="https://example.com/j/3", description="Modelling " * 20)
    d = job(company="Other Co", url="https://example.com/j/4")

    assert len(dedup.deduplicate([a, b, c, d])["jobs"]) == 4


def test_same_url_and_same_ats_id_are_duplicates():
    assert dedup.are_duplicates(job(), job(title="Different")) == "same URL"
    x = job(url="https://a.com/1", source_job_id="7", title="A", ats_type="greenhouse")
    y = job(url="https://b.com/2", source_job_id="7", title="Z", company="Else", ats_type="greenhouse")
    assert dedup.are_duplicates(x, y) == "same ATS job id"


def test_semantic_tier_can_merge_reworded_descriptions():
    a = job(url="https://a.com/1", title="Senior Backend Engineer Payments Platform", description="alpha beta gamma delta epsilon zeta eta theta")
    b = job(url="https://b.com/2", title="Senior Backend Engineer Payments Platform Team", description="completely different wording about the same role entirely")
    assert dedup.are_duplicates(a, b) is None
    assert dedup.are_duplicates(a, b, embed=lambda text: [1.0, 0.0]) == "same company, similar title, semantically identical description"


# --------------------------------------------------------------------------------- safety


def test_a_fee_for_a_job_is_high_risk_and_blocks_automation():
    scam = job(company="Global Careers", description="Easy data entry work from home. Pay a refundable registration fee of 2000. Message us on WhatsApp to apply. Earn $500 per day!")
    result = safety.assess(scam)

    assert result["level"] == "HIGH" and result["blocks_automation"] and result["risk_score"] >= 60
    assert any("pay money" in r for r in result["reasons"]) and any("WhatsApp" in r for r in result["reasons"])


def test_ordinary_postings_are_low_risk():
    real = job(source="greenhouse", description="We are hiring a backend engineer to build payment services in Java. " * 4)
    assert safety.assess(real) == {"risk_score": 0, "level": "LOW", "reasons": [], "blocks_automation": False}
    assert safety.assess(job(description="Our footprint is growing; hotpot lunches on Fridays. " * 3))["level"] == "LOW"


def test_free_mail_contact_and_odd_domains_add_risk():
    free = safety.assess(job(description="Apply by sending your CV to hr.acme.jobs@gmail.com. " * 3))
    assert free["risk_score"] >= 30 and free["level"] == "MEDIUM"
    odd = safety.assess(job(url="https://apply-now.top/job", description="x" * 120))
    assert any("suspicious domain" in r for r in odd["reasons"])


# -------------------------------------------------------------------------------- matching

PROFILE = {
    "skills": ["Java", "Spring Boot", "Kafka", "Docker"],
    "preferences.targetRoles": ["Senior Backend Engineer"],
    "preferences.targetLocations": ["Pune", "Remote"],
    "preferences.salaryExpectation": {"currency": "INR", "min": 3500000, "max": 5000000},
    "location.current": "Pune", "location.country": "India", "workAuthorization.status": "Indian citizen",
    "experience": [{"company": "A", "title": "Dev", "start": "2016", "end": "2020"}, {"company": "B", "title": "Eng", "start": "2020", "end": "2026"}],
}


def test_a_good_match_explains_itself():
    gh = run(GreenhouseAdapter("acme", fetcher({"greenhouse": GREENHOUSE})).list_jobs())[0]
    gh.country = "India"
    result = score_job(PROFILE, gh)

    assert result["recommendation"] in ("STRONG_MATCH", "GOOD_MATCH") and result["match_score"] >= 75
    assert result["career_fit"] == "aligned" and result["location_fit"] == "in your target locations" and result["visa_fit"] == "ok"
    assert any("Matches" in s for s in result["strengths"])
    assert result["tiers_used"] == ["rules", "keywords"] and result["evidence"]["skills"]["matched"]


def test_missing_skills_and_salary_are_reported():
    j = job(title="Backend Engineer", required_skills=["java", "go", "terraform"], salary_min=1000000, salary_max=1500000, currency="INR")
    result = score_job(PROFILE, j)

    assert result["missing_skills"] == ["go", "terraform"]
    assert result["salary_fit"] == "below your expectation"
    assert any("Pay is below" in w for w in result["weaknesses"])


def test_visa_ineligibility_caps_the_score_whatever_the_skills():
    j = job(title="Senior Backend Engineer", country="Germany", location="Berlin", required_skills=["java", "kafka", "spring boot"], visa_sponsorship=False)
    result = score_job(PROFILE, j)

    assert result["recommendation"] == NOT_ELIGIBLE and result["visa_fit"] == "not_eligible" and result["match_score"] <= 25


def test_unknown_data_is_left_out_not_counted_as_good_or_bad():
    sparse = {"skills": ["Java"]}
    result = score_job(sparse, job(required_skills=["java"]))

    assert result["career_fit"] == "unknown" and result["salary_fit"] == "unknown"
    assert result["confidence"] < 0.6, "most factors had no data"
    assert result["match_score"] == 100 and "Matches" in result["strengths"][0]


def test_unknown_visa_status_is_not_assumed_eligible():
    result = score_job(PROFILE, job(country="Germany", location="Berlin", visa_sponsorship=None))
    assert result["visa_fit"] == "unknown" and result["recommendation"] != NOT_ELIGIBLE


def test_embeddings_and_llm_are_spent_only_where_they_can_matter():
    calls = {"embed": 0, "reason": 0}

    def embed(text):
        calls["embed"] += 1
        return [1.0, 0.0]

    def reasoner(profile, j, result):
        calls["reason"] += 1
        return "Strong backend overlap."

    strong = job(source_job_id="1", url="https://e.com/1", title="Senior Backend Engineer", required_skills=["java", "kafka"])
    weak = job(source_job_id="2", url="https://e.com/2", title="Florist", required_skills=["excel"], location="Paris", description="Flowers.")
    ranked = rank_jobs(PROFILE | {"identity.summary": "Backend"}, [weak, strong], embed=embed, reasoner=reasoner)

    assert [r["job_id"] for r in ranked][0] == strong.job_id
    assert "embeddings" in ranked[0]["tiers_used"] and "llm" in ranked[0]["tiers_used"]
    assert "embeddings" not in ranked[1]["tiers_used"] and "reasoning" not in ranked[1]
    assert calls["reason"] == 1


def test_a_failing_reasoner_does_not_fail_the_search():
    def broken(*_):
        raise RuntimeError("down")

    strong = job(title="Senior Backend Engineer", required_skills=["java", "kafka"])
    assert rank_jobs(PROFILE, [strong], reasoner=broken)[0]["match_score"] > 0


# ------------------------------------------------------------------------------ discovery


def make_discovery(**kw):
    fetch = fetcher({"greenhouse.io": GREENHOUSE, "api.lever.co": LEVER, "ashbyhq.com": ASHBY})
    adapters = [GreenhouseAdapter("acme", fetch), LeverAdapter("zeta", fetch), AshbyAdapter("ramp", fetch)]
    return JobDiscovery(adapters, Switches(), **kw)


def test_discovery_returns_normalised_assessed_and_ranked_jobs():
    result = run(make_discovery().discover(["engineer"], profile=PROFILE))

    titles = [e["job"]["title"] for e in result["jobs"]]
    assert "Senior Backend Engineer" in titles and "Office Manager" not in titles
    assert all(e["safety"]["level"] == "LOW" for e in result["jobs"])
    scores = [e["match"]["match_score"] for e in result["jobs"]]
    assert scores == sorted(scores, reverse=True)
    assert result["errors"] == [] and result["skipped"] == []


def test_one_failing_board_does_not_lose_the_others():
    fetch = fetcher({"greenhouse.io": RuntimeError("boom"), "api.lever.co": LEVER})
    discovery = JobDiscovery([GreenhouseAdapter("acme", fetch), LeverAdapter("zeta", fetch)], Switches())

    result = run(discovery.discover([]))

    assert [e["job"]["source"] for e in result["jobs"]] == ["lever"]
    assert result["errors"][0]["platform"] == "greenhouse"


def test_boards_are_cached_and_scheduled_runs_obey_the_kill_switch():
    count = {"n": 0}

    async def counting(url):
        count["n"] += 1
        return GREENHOUSE

    discovery = JobDiscovery([GreenhouseAdapter("acme", counting)], Switches(), ttl_seconds=900, clock=lambda: 1000.0)
    run(discovery.discover([])); run(discovery.discover(["java"]))
    assert count["n"] == 1, "second search must reuse the cached board"

    scheduled = run(discovery.discover([], trigger="scheduled"))
    assert scheduled["jobs"] == [] and scheduled["skipped"][0]["reason"] == "automation is switched off"

    enabled = JobDiscovery([GreenhouseAdapter("acme", counting)], Switches(global_automation_enabled=True))
    assert run(enabled.discover([], trigger="scheduled"))["jobs"]


def test_high_risk_jobs_are_shown_but_never_matched_for_automation():
    scam_board = {"jobs": [{"id": 1, "title": "Home Typist", "absolute_url": "https://x.top/1", "location": {"name": "Remote"},
                            "content": "Pay a registration fee of 500 and message us on Telegram to start. Earn $300 per day!"}]}
    discovery = JobDiscovery([GreenhouseAdapter("shady", fetcher({"greenhouse": scam_board}))], Switches())

    entry = run(discovery.discover([], profile=PROFILE))["jobs"][0]

    assert entry["safety"]["level"] == "HIGH" and entry["match"] is None
