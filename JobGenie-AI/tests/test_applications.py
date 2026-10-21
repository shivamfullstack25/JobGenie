"""Application intelligence: answers, the apply/don't-apply decision, and the package."""

from dataclasses import replace
from datetime import date

import pytest

from app.applications import answers as ap
from app.applications import decision as dec
from app.applications.package import build_package, choose_preset
from app.jobs import automation
from app.jobs.automation import Mode, PlatformPolicy, Switches
from app.jobs.normalized import NormalizedJob

TODAY = date(2026, 10, 21)

PROFILE = {
    "identity.fullName": "Asha Rao",
    "identity.headline": "Senior backend engineer | Java, Kafka",
    "identity.summary": "Backend engineer with 6 years building Java services. Focused on reliability.",
    "contact.email": "asha@example.com",
    "contact.phone": "+91 90000 00000",
    "location.current": "Pune",
    "location.country": "India",
    "workAuthorization.status": "Indian citizen",
    "workAuthorization.visa": {"sponsorshipNeeded": True},
    "preferences.targetRoles": ["Senior Backend Engineer"],
    "preferences.noticePeriod": "60 days",
    "preferences.salaryExpectation": {"currency": "INR", "min": 3500000, "max": 4500000, "period": "year"},
    "preferences.willingToRelocate": "Yes",
    "links.github": "https://github.com/asha",
    "skills": ["Java", "Spring Boot", "Kafka", "Docker"],
    "experience": [
        {"company": "Acme", "title": "Senior Engineer", "start": "Jan 2020", "end": "Present",
         "achievements": ["Cut report latency by 40% with Kafka batching", "Mentored 3 engineers", "Built Spring Boot services for payments"]},
        {"company": "Beta", "title": "Developer", "start": "Jan 2016", "end": "Dec 2019", "achievements": ["Maintained internal tools"]},
    ],
    "education": [{"institution": "VIT", "degree": "B.Tech"}],
}


def job(**kw) -> NormalizedJob:
    base = dict(
        source="greenhouse", source_job_id="1", url="https://boards.greenhouse.io/acme/jobs/1", company="Zeta", title="Senior Backend Engineer",
        description="Build Java and Kafka services for payments. 5+ years experience required. " * 3, location="Pune, India", country="India",
        required_skills=["java", "kafka"], posted_date="2026-10-10",
    )
    base.update(kw)
    return NormalizedJob(**base)


# ------------------------------------------------------------------------------------ answers


def ans(question, profile=None, provenance=None):
    return ap.answer_question(profile or PROFILE, question, provenance)


def test_factual_answers_come_from_the_profile_with_their_source():
    a = ans("What is your email address?")
    assert (a.answer, a.source, a.status, a.requires_approval, a.confidence) == ("asha@example.com", "contact.email", ap.FILLED, False, 1.0)
    assert ans("GitHub profile URL").answer == "https://github.com/asha"
    assert ans("Current location / city").answer == "Pune"


def test_consequential_answers_always_need_approval():
    for question, expected in [
        ("What is your notice period?", "60 days"),
        ("What are your salary expectations?", "INR 3,500,000–4,500,000 per year"),
        ("Are you authorized to work in India?", "Indian citizen"),
        ("Are you willing to relocate?", "Yes"),
        ("Will you now or in future require visa sponsorship?", "Yes"),
    ]:
        a = ans(question)
        assert a.answer == expected and a.requires_approval and a.status == ap.FILLED, question


def test_unknown_information_is_never_made_up():
    sparse = {"identity.fullName": "Asha Rao"}
    for question in ("What is your notice period?", "Expected CTC?", "Are you authorised to work in the UK?", "Phone number"):
        a = ans(question, sparse)
        assert a.answer == ap.USER_INPUT_REQUIRED and a.status == ap.NEEDS_INPUT and a.requires_approval, question
        assert "My Profile" in a.note
    assert ans("What colour is your parachute?").status == ap.NEEDS_INPUT


def test_total_experience_is_derived_but_per_technology_experience_is_not():
    closed = dict(PROFILE, experience=[
        {"company": "Beta", "title": "Developer", "start": "Jan 2016", "end": "Dec 2019"},
        {"company": "Acme", "title": "Engineer", "start": "Jan 2020", "end": "Dec 2025"},
    ])
    total = ans("Total years of professional experience?", closed)
    assert total.answer == "10" and total.requires_approval, "back-to-back roles add up; derived, so a person confirms"

    for q in ("How many years of experience do you have with Kafka?", "Years of experience in Kubernetes?"):
        a = ans(q)
        assert a.answer == ap.USER_INPUT_REQUIRED and a.topic == "skill_experience", q
        assert a.evidence, "relevant evidence from the profile is offered instead"


def test_open_ended_questions_give_evidence_not_a_fabricated_essay():
    a = ans("Why do you want to work at Zeta?")
    assert a.status == ap.DRAFT_ONLY and a.answer == ap.USER_INPUT_REQUIRED
    assert any("Kafka" in e for e in a.evidence) and len(a.evidence) <= 3


def test_unconfirmed_facts_are_flagged_and_names_are_split():
    a = ans("Email", provenance={"contact.email": "INFERRED"})
    assert a.requires_approval and a.confidence == 0.5 and "not yet confirmed" in a.note
    assert (ans("First name").answer, ans("Last name").answer) == ("Asha", "Rao")


def test_sponsorship_is_not_guessed_from_other_fields():
    assert ans("Do you require visa sponsorship?", dict(PROFILE, **{"workAuthorization.visa": {"country": "DE"}})).status == ap.NEEDS_INPUT


# ----------------------------------------------------------------------------------- decision


def run_decide(j=None, profile=None, match="auto", safety="auto", **kw):
    from app.jobs import safety as safety_agent
    from app.jobs.matching import score_job

    j = j or job()
    profile = profile or PROFILE
    return dec.decide(
        profile, j,
        score_job(profile, j) if match == "auto" else match,
        safety_agent.assess(j) if safety == "auto" else safety,
        switches=kw.pop("switches", Switches()), today=TODAY, **kw,
    )


def test_a_good_job_goes_to_the_user_for_approval_never_straight_through():
    result = run_decide()
    assert result["decision"] == dec.APPLY_WITH_APPROVAL, result


def test_scams_are_never_applied_to_whatever_the_score():
    scam = job(description="Pay a refundable registration fee and message us on Telegram. Earn $500 per day! Java Kafka.")
    result = run_decide(scam, match={"match_score": 100, "recommendation": "STRONG_MATCH"})
    assert result["decision"] == dec.DO_NOT_APPLY and "scam" in result["reasons"][0]


def test_platforms_that_forbid_it_are_blocked():
    assert run_decide(job(source="linkedin", url="https://www.linkedin.com/jobs/1"))["decision"] == dec.BLOCKED_BY_PLATFORM
    assert run_decide(job(source="indeed", url="https://www.indeed.com/viewjob?jk=1"))["decision"] == dec.BLOCKED_BY_PLATFORM


def test_ineligible_duplicate_and_stale_jobs_are_handled():
    visa_blocked = job(country="Germany", location="Berlin", visa_sponsorship=False)
    assert run_decide(visa_blocked)["decision"] == dec.DO_NOT_APPLY

    j = job()
    assert run_decide(j, applied_job_ids=[j.job_id])["decision"] == dec.DO_NOT_APPLY
    assert run_decide(job(posted_date="2026-07-01"))["decision"] == dec.SAVE_FOR_REVIEW


def test_missing_information_is_asked_for_not_guessed():
    result = run_decide(profile={k: v for k, v in PROFILE.items() if k != "preferences.noticePeriod"})
    assert result["decision"] == dec.MISSING_INFORMATION and "preferences.noticePeriod" in result["reasons"][0]
    assert run_decide(unanswered_required=2)["decision"] == dec.MISSING_INFORMATION


def test_a_weak_match_is_saved_not_pursued():
    weak = job(title="Florist", required_skills=["excel"], description="Arrange flowers daily. " * 8, location="Paris", country="France", visa_sponsorship=True)
    assert run_decide(weak)["decision"] == dec.SAVE_FOR_REVIEW


def test_match_score_alone_never_triggers_applying():
    perfect = {"match_score": 100, "recommendation": "STRONG_MATCH", "evidence": {}}
    assert run_decide(match=perfect, safety={"level": "LOW", "reasons": []})["decision"] != dec.APPLY_AUTOMATICALLY


def test_automatic_application_is_unreachable_today_even_with_every_switch_on(monkeypatch):
    wide_open = Switches(global_automation_enabled=True, dry_run=False)
    perfect = {"match_score": 100, "recommendation": "STRONG_MATCH", "evidence": {}}
    low = {"level": "LOW", "reasons": []}

    assert all(p.apply < Mode.HUMAN_APPROVAL for p in automation.POLICIES.values())
    assert run_decide(match=perfect, safety=low, switches=wide_open)["decision"] == dec.APPLY_WITH_APPROVAL

    # It becomes reachable only if a platform's reviewed policy is changed to permit it AND the
    # operator has switched everything on — and still not in dry run, or with the platform disabled.
    gh = automation.POLICIES["greenhouse"]
    monkeypatch.setitem(automation.POLICIES, "greenhouse", replace(gh, apply=Mode.HUMAN_APPROVAL))
    assert run_decide(match=perfect, safety=low, switches=wide_open)["decision"] == dec.APPLY_AUTOMATICALLY
    assert run_decide(match=perfect, safety=low, switches=Switches(global_automation_enabled=True, dry_run=True))["decision"] == dec.APPLY_WITH_APPROVAL
    assert run_decide(match=perfect, safety=low, switches=Switches(True, False, frozenset({"greenhouse"})))["decision"] == dec.APPLY_WITH_APPROVAL


# ------------------------------------------------------------------------------------ package


def package(**kw):
    kw.setdefault("today", TODAY)
    kw.setdefault("switches", Switches())
    return build_package(PROFILE, kw.pop("job", job()), **kw)


def test_preset_follows_the_posting():
    cases = {"Engineering Manager, Payments": "engineering_manager", "GenAI Engineer": "genai", "Full Stack Developer": "full_stack",
             "Spring Boot Developer": "spring_boot", "Platform Engineer": "cloud", "Java Developer": "java_backend", "Staff Engineer": "senior_software_engineer"}
    for title, expected in cases.items():
        assert choose_preset(job(title=title))["preset"] == expected, title
    assert choose_preset(job(title="Wizard", required_skills=[]))["preset"] == "software_engineer"


def test_a_package_has_everything_and_every_check_passes():
    p = package(questions=["What is your notice period?", "Why do you want to work here?"])

    assert p["decision"] == dec.APPLY_WITH_APPROVAL and p["suggested_state"] == "AWAITING_APPROVAL"
    assert p["resume"]["document"]["violations"] == []
    assert all(c["passed"] for c in p["checks"]), [c for c in p["checks"] if not c["passed"]]
    assert p["answers"][0]["answer"] == "60 days"
    assert p["answers"][1]["status"] == ap.DRAFT_ONLY
    assert "Zeta" in p["recruiter_message"] and "Senior Backend Engineer" in p["recruiter_message"]


def test_nothing_is_ever_submitted_by_jobgenie():
    p = package()
    assert p["submission"] == {"method": "CLICK_OUT", "url": "https://boards.greenhouse.io/acme/jobs/1", "platform_mode": "BROWSER_ASSISTED"}


def test_cover_letter_uses_the_candidates_own_words_and_adds_nothing():
    letter = package()["cover_letter"]

    assert letter["unsupported_claims"] == []
    assert "Cut report latency by 40% with Kafka batching" in letter["text"]
    assert "Senior Backend Engineer role at Zeta" in letter["text"] and letter["text"].rstrip().endswith("Asha Rao")
    assert "Rust" not in letter["text"]


def test_a_rewrite_that_inflates_a_claim_is_discarded_in_the_cover_letter():
    letter = package(rewriter=lambda t: t.replace("40%", "90%").replace("6 years", "12 years"))["cover_letter"]

    assert "90%" not in letter["text"] and "12 years" not in letter["text"]
    assert "40%" in letter["text"] and letter["discarded_rewrites"]


def test_missing_profile_data_stops_the_package_at_preparing():
    sparse = {k: v for k, v in PROFILE.items() if k not in ("preferences.noticePeriod", "workAuthorization.status")}
    p = build_package(sparse, job(), questions=["Are you authorized to work in India?"], today=TODAY, switches=Switches())

    assert p["decision"] == dec.MISSING_INFORMATION and p["suggested_state"] == "PREPARING"
    assert "preferences.noticePeriod" in p["missing_information"]
    assert "Are you authorized to work in India?" in p["missing_information"]


def test_unconfirmed_facts_used_are_listed_for_the_user():
    p = package(questions=["Email address"], provenance={"skills": "INFERRED", "contact.email": "INFERRED"})
    assert {"skills", "contact.email"} <= set(p["needs_confirmation"])


def test_restricted_platform_packages_are_drafts_the_user_applies_with_themselves():
    p = package(job=job(source="linkedin", url="https://www.linkedin.com/jobs/view/1"))
    assert p["decision"] == dec.BLOCKED_BY_PLATFORM and p["suggested_state"] == "SHORTLISTED"
    assert p["submission"]["platform_mode"] == "DRAFT_ONLY"
