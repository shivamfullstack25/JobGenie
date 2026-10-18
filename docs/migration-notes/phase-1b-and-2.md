# Phase 1B + 2 migration notes — profile, resume agent, job intelligence

Branch `overhaul/phase-1a-safety-net`. Everything here is additive: no existing table, endpoint or page was changed except where listed under "Changed behaviour".

## What now exists

| Area | Where | Entry points |
|---|---|---|
| Candidate profile (provenance, versions, proposals, rollback, YAML) | `user-service/.../profile/` | `GET/PUT /api/candidate-profile…`, page **My Profile** (`/candidate-profile`) |
| Resume tailoring (cannot invent) | `JobGenie-AI/app/agents/resume_agent.py` | `POST /ai/v2/resume/tailor`, `GET /ai/v2/resume/presets` |
| NormalizedJob, dedup, safety, matching, policy, adapters | `JobGenie-AI/app/jobs/` | `POST /ai/v2/jobs/discover`, `POST /ai/v2/jobs/match`, `GET /ai/v2/platforms/policies`, page **Discover** (`/job-discovery`) |
| Master profile template | `profile/master-profile.example.yaml` | export/import via the profile page |

## New tables (created by Hibernate `ddl-auto=update` in jobgenie_users)

`candidate_profiles`, `profile_versions`, `profile_proposals`. Nothing existing is altered. Rollback: drop those three tables; no other code reads them.

## Operating it

1. **Rebuild**: `user-service`, `api-gateway`, `job-service`, `ai-service`, `frontend`. Build them one at a time (`docker compose build <svc>`); building all at once crashed Docker Desktop on this machine.
2. **Boards**: set `JOB_BOARDS` in `.env`, or type boards into the Discover page, as `platform:company-token` (greenhouse, lever, ashby). The token is the company's slug in its careers URL, e.g. `boards.greenhouse.io/stripe` → `greenhouse:stripe`. Board tokens are not discoverable via any API; you choose which employers to follow.
3. **Switches** (all default safe): `GLOBAL_AUTOMATION_ENABLED=false`, `DRY_RUN=true`, `DISABLED_PLATFORMS=`. Nothing in this phase submits anything anywhere regardless of these; they gate scheduled searches now and any future submission.
4. **Try it**: sign in → *My Profile* → "Fill from my resume" → confirm what is right → *Discover* → add a board → Search.

## The guarantees, and where they are tested

| Guarantee | Enforced in | Test |
|---|---|---|
| Software can never write `FACT`/`USER_APPROVED`; stated facts change only via an approved proposal | `CandidateProfileService.setByAgent` | `CandidateProfileServiceTest` (23) |
| Every change is a version + audit record with before/after; rollback never rewrites history | `commit`, `rollback` | same |
| A YAML file cannot declare itself true unless the signed-in user confirms; hostile YAML is not executed | `ProfileYaml` (SafeConstructor, 200 KB cap), `ProfileImportService` | same |
| A tailored resume contains nothing absent from the profile; LLM rewrites that add a number/year/skill are discarded | `resume_agent.tailor`, `validate_document` | `test_resume_agent.py` (18) |
| Restricted platforms have no adapter and default-deny policy; no platform permits unattended submission | `adapters.parse_board_spec`, `automation.POLICIES` | `test_jobs.py` |
| HIGH-risk postings are never matched for automation | `discovery.discover` | `test_jobs.py` |
| Unknown data is excluded from a score, not guessed; visa ineligibility caps the score | `matching.score_job` | `test_jobs.py` |

Totals at this commit: 61 Java tests, 65 Python tests, 8 frontend tests, frontend builds.

## Changed behaviour

- `POST /api/jobs/apply` accepts an optional `platform` and records it. Previously every application whose job was not already stored was labelled **LinkedIn**. With no platform and no stored job it now records `Unknown`.
- Account export and account deletion now include the candidate profile.
- `crew_ai_service.py` imports its skill list from `app/agents/lexicon.py` (same list, one definition).
- Gateway: `/api/candidate-profile/**` routes to user-service.

## Not done yet (honest list)

| Item | Note |
|---|---|
| **Live verification** | Nothing from 1A, 1B or 2 has been run against the Docker stack, and a real Firebase sign-in has not been exercised. Unit and integration-style tests only. First thing to do: `docker compose build` each service in turn, `bash lean-start.sh`, `bash scripts/smoke-auth.sh`, then sign in and use *My Profile* and *Discover*. |
| Flyway baseline; Testcontainers characterization tests | Still on `ddl-auto=update` (1A.3, 1A.2) |
| Resume upload still parses synchronously and calls the LLM twice | 1B.4 async parse; `ResumeVersion` storage of tailored output |
| `LLMProvider` abstraction (Anthropic, OpenRouter) and structured outputs | 1B.5. The tailor and match paths accept an injected rewriter/embedder/reasoner but none is wired to a model yet, so today they run on rules only |
| Embeddings | `embed` hook exists in dedup and matching; no embedding provider is connected |
| Adzuna adapter in the new pipeline | The old aggregator still serves Adzuna; it needs an adapter plus the required "Adzuna" attribution label |
| Old HTML scrapers | Still present and still used by `/api/search-jobs`; to be removed once Discover has replaced the Jobs page (decision D2) |
| Phase 3 onward | Application packages, answers, approval queue, lifecycle states, platform drafts (LinkedIn/Naukri/Cutshort/Instahyre), analytics |
| Profile facts are single-valued per field | Multi-country work authorization is stored as free text in `workAuthorization.status` |
