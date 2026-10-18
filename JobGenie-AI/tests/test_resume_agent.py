"""ResumeAgent: tailoring may reorder and select, and must never add anything the profile lacks."""

import pytest

from app.agents import resume_agent as agent

PROFILE = {
    "identity.fullName": "Asha Rao",
    "identity.headline": "Backend engineer",
    "identity.summary": "Backend engineer with 6 years building Java services.",
    "contact.email": "asha@example.com",
    "location.current": "Pune",
    "location.country": "India",
    "workAuthorization.status": "Indian citizen; needs sponsorship for the EU",
    "links.github": "https://github.com/asha",
    "skills": ["Excel", "React", "Java", "Spring Boot", "Kafka", "Docker"],
    "experience": [
        {
            "company": "Beta Labs",
            "title": "Developer",
            "start": "2016",
            "end": "2019",
            "description": "Built internal dashboards in React.\nSupported 12 users.",
        },
        {
            "company": "Acme",
            "title": "Senior Engineer",
            "start": "2019",
            "end": "Present",
            "achievements": [
                "Cut report latency by 40% with Kafka batching",
                "Mentored 3 engineers",
                "Maintained Excel exports",
            ],
        },
    ],
    "education": [{"institution": "VIT", "degree": "B.Tech", "year": "2015"}],
    "certifications": ["AWS Certified Developer"],
}


def test_every_preset_builds_a_clean_document():
    for preset in agent.ROLE_PRESETS:
        document = agent.tailor(PROFILE, preset)
        assert document["violations"] == [], (preset, document["violations"])
        assert document["header"]["name"] == "Asha Rao"


def test_unknown_preset_is_rejected():
    with pytest.raises(ValueError):
        agent.tailor(PROFILE, "astronaut")


def test_role_reorders_skills_without_adding_or_dropping_any():
    backend = agent.tailor(PROFILE, "java_backend")["skills"]
    frontend = agent.tailor(PROFILE, "full_stack")["skills"]

    assert set(backend) == set(PROFILE["skills"]) == set(frontend)
    assert backend.index("Java") < backend.index("Excel")
    assert frontend.index("React") < frontend.index("Excel")
    assert backend != frontend


def test_job_description_steers_order_but_never_adds_a_skill():
    document = agent.tailor(PROFILE, "software_engineer", job_description="We use Kafka and Go and Terraform daily.")

    assert document["skills"].index("Kafka") < document["skills"].index("Excel")
    assert "Go" not in document["skills"] and "Terraform" not in document["skills"]
    assert document["violations"] == []


def test_experience_is_reverse_chronological_whatever_the_relevance():
    document = agent.tailor(PROFILE, "full_stack")  # React favours the older job
    assert [e["company"] for e in document["experience"]] == ["Acme", "Beta Labs"]


def test_bullets_come_from_description_lines_and_are_ordered_by_relevance():
    acme = agent.tailor(PROFILE, "microservices")["experience"][0]
    assert acme["bullets"][0] == "Cut report latency by 40% with Kafka batching"
    assert set(acme["bullets"]) == set(PROFILE["experience"][1]["achievements"])

    beta = agent.tailor(PROFILE, "full_stack")["experience"][1]
    assert "Built internal dashboards in React." in beta["bullets"]


def test_max_skills_trims_to_the_most_relevant():
    skills = agent.tailor(PROFILE, "java_backend", max_skills=3)["skills"]
    assert len(skills) == 3 and "Excel" not in skills


def test_missing_data_is_reported_never_filled_in():
    sparse = {"identity.fullName": "Asha Rao", "skills": ["Java"], "contact.email": "USER_INPUT_REQUIRED"}
    document = agent.tailor(sparse, "java_backend")

    assert document["header"]["email"] is None
    assert set(document["missing"]) == {"contact.email", "experience"}
    assert document["experience"] == []


def test_unverified_fields_are_surfaced():
    document = agent.tailor(PROFILE, "java_backend", provenance={"skills": "INFERRED", "identity.fullName": "FACT"})
    assert document["unverified_fields"] == ["skills"]


# ------------------------------------------------------------------ the no-invention guarantee


def test_a_rewrite_that_invents_a_metric_is_discarded():
    def inflate(text: str) -> str:
        return text.replace("40%", "90%")

    document = agent.tailor(PROFILE, "microservices", rewriter=inflate)

    bullets = document["experience"][0]["bullets"]
    assert "Cut report latency by 40% with Kafka batching" in bullets
    assert not any("90%" in b for b in bullets)
    assert any("90%" in note for note in document["discarded_rewrites"])
    assert document["violations"] == []


def test_a_rewrite_that_invents_a_technology_is_discarded():
    document = agent.tailor(PROFILE, "cloud", rewriter=lambda t: t + " using Kubernetes and Terraform")

    assert not any("Kubernetes" in b for e in document["experience"] for b in e["bullets"])
    assert document["discarded_rewrites"]


def test_a_harmless_rewrite_is_kept():
    document = agent.tailor(PROFILE, "microservices", rewriter=lambda t: t.replace("Mentored", "Coached"))

    assert "Coached 3 engineers" in document["experience"][0]["bullets"]
    assert document["discarded_rewrites"] == []


def test_a_failing_model_does_not_break_generation():
    def broken(_: str) -> str:
        raise RuntimeError("LLM down")

    document = agent.tailor(PROFILE, "cloud", rewriter=broken)

    assert document["violations"] == []
    assert "Mentored 3 engineers" in document["experience"][0]["bullets"]


def test_a_number_is_not_vouched_for_by_a_longer_one():
    # "4" appears inside "2024"/"40%" but is not a number the profile contains.
    assert agent.find_unsupported_claims("Managed 4 people", PROFILE) == ["number '4'"]
    assert agent.find_unsupported_claims("Mentored 3 engineers", PROFILE) == []


def test_validator_catches_a_tampered_document():
    document = agent.tailor(PROFILE, "java_backend")
    document["skills"].append("Rust")
    document["experience"].append({"company": "Google", "title": "Staff Engineer", "start": "2020", "end": "2024", "bullets": []})
    document["experience"][0]["bullets"].append("Led a team of 25 using Go")
    document["education"].append({"institution": "MIT", "degree": "PhD"})
    document["summary"] = "Backend engineer with 15 years of Rust."

    problems = " | ".join(agent.validate_document(document, PROFILE))

    for expected in ("skill not in profile: Rust", "Google", "number '25'", "skill 'go'", "MIT", "number '15'", "skill 'rust'"):
        assert expected in problems, (expected, problems)


def test_compare_flags_resume_skills_the_profile_does_not_back():
    result = agent.compare_to_profile(["Java", "Rust"], PROFILE)

    assert result["unsupported_by_profile"] == ["Rust"]
    assert "Kafka" in result["missing_from_resume"] and "Java" not in result["missing_from_resume"]


def test_international_preset_adds_work_authorization_from_the_profile_only():
    document = agent.tailor(PROFILE, "international")

    assert document["international"]["workAuthorization"] == PROFILE["workAuthorization.status"]
    assert "visa" not in document["international"], "no visa in the profile, so none is stated"


def test_text_rendering_contains_the_content_and_nothing_else():
    text = agent.to_text(agent.tailor(PROFILE, "java_backend"))

    assert text.startswith("ASHA RAO")
    assert "Senior Engineer — Acme — 2019 – Present" in text
    assert "Cut report latency by 40% with Kafka batching" in text
    assert "Rust" not in text
