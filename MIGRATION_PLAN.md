# JobGenie — Migration Plan

**Date:** 2026-10-06 · Companion to `PROJECT_AUDIT.md`, `ARCHITECTURE_MAP.md`, `docs/platform-compliance.md`.

## Principles

1. **Additive first.** New tables, new endpoints, new pages land beside the old ones. Old paths are removed only after the new path has been the default for a full phase.
2. **The core loop stays usable at every commit:** sign in → upload resume → see matches → save → track.
3. **Every schema change is a Flyway migration** with a written down-path.
4. **Every phase ends with the gate:** tests run, core loop smoke-tested on the live stack, docs updated, migration notes written, changed/remaining reported. A critical regression blocks the next phase.
5. **Nothing is submitted to any third party** by JobGenie until Phase 6, and then only where `platform_policies` allows. `DRY_RUN=true` and `GLOBAL_AUTOMATION_ENABLED=false` are the shipped defaults.

## Deviations from the requested phase order, and why

| Requested | Planned | Reason |
|---|---|---|
| Phase 1 = profile, versioning, resume, DB | Phase 1 opens with **1A Safety Net**: track the AI code, add test harnesses, baseline migrations, enforce authentication | The profile will hold visa status, salary and contact details. Today any caller can read or delete any user (audit S1–S4). There are no tests to detect regressions, and the AI service is not in version control. |
| Scrapers kept as fallback (CLAUDE.md) | Scrapers retired in Phase 2 once ATS adapters return results | They breach the sites' terms and produce unstable job IDs. This revises a locked CLAUDE.md decision and needs the owner's sign-off (Decision D2). |
| `FULLY_AUTOMATED` applications | Mode exists in the model; no platform is assigned to it | No platform researched permits candidate-side automated submission. |

## Decisions needed from the product owner

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Approve putting authentication enforcement (1A) ahead of the profile work | Yes | Phase 1 |
| D2 | Retire the five HTML scrapers in Phase 2 (revises CLAUDE.md "cached scrape fallback") | Yes | Phase 2 |
| D3 | Supply the candidate's real resume/profile source for `profile/master-profile.yaml`. None exists in the workspace. Until then the file ships as a schema-valid template with every fact marked `USER_INPUT_REQUIRED`. Also: should that file, containing personal data, be committed or git-ignored? | Supply a resume; git-ignore the populated file, commit `master-profile.example.yaml` | Real content in Phase 1B |
| D4 | Single-user tool or multi-user product? `master-profile.yaml` implies one canonical candidate; the database supports many | Database is the source of truth per user; YAML is an import/export format for one user's profile | Phase 1B design detail |
| D5 | Commit the 25 uncommitted files and the untracked AI code as the baseline before any migration work | Yes, as its own commit on a branch | Phase 1A |
| D6 | Rotate the keys in `.env` and delete the two CAPTCHA-solver keys | Yes | — |
| D7 | Register an Adzuna key (free) so a licensed source is live | Yes | Phase 2 quality |

---

## Phase 1A — Safety net

### 1A.1 Put the AI service under version control
- **CURRENT:** `.gitignore:378` (`app/`) hides `JobGenie-AI/app/`.
- **TARGET:** Narrow the rule to `/app/secrets/`; `JobGenie-AI/app/**` tracked. Build logs and lock files ignored.
- **STRATEGY:** Fix `.gitignore`; scan the newly tracked files with gitleaks before staging; commit the baseline (with D5).
- **RISKS:** A secret hard-coded in those files gets committed.
- **ROLLBACK:** `git revert`; nothing at runtime changes.

### 1A.2 Test harnesses and CI
- **CURRENT:** Zero runnable tests; CI runs `-DskipTests`.
- **TARGET:** JUnit 5 + Testcontainers Postgres per Spring service; pytest + `httpx` ASGI client with a mocked LLM and mocked HTTP for the AI service; Vitest + Testing Library for the frontend (replacing the unconfigured Jest). CI runs all three. Characterization tests pin the core loop's current behaviour before it is changed.
- **STRATEGY:** Add harness and one smoke test per service first; then characterization tests for upload, matches, save, apply, status update.
- **RISKS:** Testcontainers needs Docker in CI (available on GitHub runners); slow local builds.
- **ROLLBACK:** Tests are additive. CI test stage can be made non-blocking by one flag.

### 1A.3 Schema baseline with Flyway
- **CURRENT:** `ddl-auto=update`; SQL init scripts disagree with entities.
- **TARGET:** Flyway per service. `V1__baseline.sql` is a dump of the schema Hibernate actually produced. `ddl-auto=validate`. `sql/init-databases.sql` reduced to creating databases and the role.
- **STRATEGY:** Dump each live database schema → V1; `baseline-on-migrate=true` so existing volumes adopt it without change; switch to `validate` in the same release; delete orphan table DDL (`cover_letters`, `ats_resumes`, `user_sessions`, `notifications`, `notification_templates`) from the init script only, leaving existing tables in place until a later migration reuses or drops them.
- **RISKS:** `validate` fails on a column-type mismatch nobody noticed and a service will not start.
- **ROLLBACK:** Set `spring.flyway.enabled=false` and `ddl-auto=update` via environment variables; no data is touched by a baseline.

### 1A.4 Enforce authentication
- **CURRENT:** No enforcement anywhere; unsigned-JWT fallback; spoofable admin header.
- **TARGET:** As `ARCHITECTURE_MAP.md` §7.2.
- **STRATEGY, in four releasable steps:**
  1. Frontend: one `authFetch` wrapper attaches the Firebase ID token to every request (replaces scattered `fetch` calls). Harmless while the backend ignores it.
  2. Gateway: verify the token in **report-only** mode: log would-be rejections, enforce nothing. Run until the log is clean.
  3. Gateway: enforce. Strip inbound identity headers, inject signed `X-Auth-User-Id`/`X-Auth-Role`. Services: a shared filter (in `shared`) verifies the signature; a helper resolves the effective user and returns 403 when a supplied `userId` differs. Resume endpoints gain ownership checks. Admin endpoints use `X-Auth-Role`.
  4. Remove host port mappings for backend services, Postgres and Redis from the default compose file (kept in `docker-compose.dev.yml`). Unsigned-JWT fallback moves behind the `dev-insecure-auth` profile. AI service accepts only the internal signed header; CORS restricted.
- **RISKS:** Locking users out; breaking service-to-service calls (job→user, user→resume); the Firebase service-account file is absent on this machine, so the gateway must verify with Google's public JWKS rather than the Admin SDK.
- **ROLLBACK:** `AUTH_ENFORCEMENT=report-only` environment flag returns the gateway to step 2 without a redeploy of the services.

### 1A.5 Remove auto-apply residue and stop the bleeding
- **CURRENT:** Dead gateway routes, CAPTCHA keys, `AUTO_APPLY_*` config, LinkedIn OAuth that overwrites profile data.
- **TARGET:** Removed or disabled. LinkedIn OAuth endpoints return 410 until rebuilt as sign-in only.
- **STRATEGY:** Delete after the characterization tests are green.
- **RISKS:** Low; nothing live calls them.
- **ROLLBACK:** `git revert`.

**Gate 1A:** all harnesses green in CI; core loop passes with enforcement on; an unauthenticated request and a cross-user request both return 401/403 in automated tests.

---

## Phase 1B — Foundation: profile, versions, resume intelligence

### 1B.1 CandidateProfile
- **CURRENT:** Flat `User` plus per-resume JSONB; no provenance.
- **TARGET (user-service, new tables):**
  - `candidate_profiles` (one per user: identity, contact, location, work authorization, visa, preferences, salary expectation, notice period, links).
  - `profile_experiences`, `profile_education`, `profile_certifications`, `profile_skills`, `profile_projects`, `profile_achievements`.
  - `platform_profiles` (LinkedIn, Naukri, Cutshort, Instahyre, Wellfound, GitHub, portfolio, other): URL and drafts only, no credentials.
  - Every fact-bearing row carries `provenance` (`FACT | INFERRED | AI_GENERATED | USER_APPROVED`), `source`, `confidence`, `last_updated`, `verified_by_user`.
  - **Invariant enforced in the service layer and tested:** a write originating from an agent can never set `FACT` or `verified_by_user=true`, and can never overwrite a row whose provenance is `FACT` or `USER_APPROVED`; it creates a pending proposal instead.
- **STRATEGY:** New endpoints under `/api/candidate-profile`. Backfill job: seed each user's profile from `User` (provenance `FACT`, source `account`) and from the active resume's parsed data (provenance `INFERRED`, source `resume:{id}`, unverified). `User` and existing profile endpoints are untouched. New "Candidate Profile" page; the old `/profile` page keeps working.
- **RISKS:** Backfill mislabels parsed data as fact; two profile UIs confuse users.
- **ROLLBACK:** Drop the new tables (migration `U`-script); feature flag `CANDIDATE_PROFILE_ENABLED=false` hides the page. No existing table is altered.

### 1B.2 ProfileVersion and audit
- **CURRENT:** In-place overwrite; `audit_logs` has four columns.
- **TARGET:** `profile_versions` (monotonic `v1, v2…`, full JSON snapshot, author, reason, parent). Every accepted change set creates a version. Rollback = new version copied from an old snapshot (history is never rewritten). `audit_logs` extended with `actor_type`, `entity_type`, `entity_id`, `before`, `after`, `reason`, `run_id`.
- **STRATEGY:** Snapshot-on-write inside the same transaction as the change. Additive columns on `audit_logs`, nullable.
- **RISKS:** Snapshot size growth (bounded: one user's profile is kilobytes).
- **ROLLBACK:** Versions are append-only and unused by old code; disable the write hook by flag.

### 1B.3 master-profile.yaml
- **CURRENT:** Does not exist.
- **TARGET:** `/profile/master-profile.yaml` conforming to a published JSON Schema; import (`YAML → proposals → user confirms → new version`) and export (`current version → YAML`). Import never bypasses the provenance invariant.
- **STRATEGY:** Ship schema, example file, CLI/endpoint for validate, import, export. Real content waits on D3.
- **RISKS:** Personal data committed to git.
- **ROLLBACK:** Delete the file; database is unaffected.

### 1B.4 Resume intelligence
- **CURRENT:** Single stored text per upload; parse twice per upload; free-text LLM output; original file discarded.
- **TARGET:** `resume_versions` (parent resume, kind `ORIGINAL | EDITED | TAILORED`, target role, content, derived-from profile version); original bytes stored (local volume now, object storage later); `ResumeAgent` operations `parse, validate, extract, compare, optimize, generate, tailor` returning schema-validated JSON; one LLM call per upload; parse moved off the request (status polling). Tailoring may reorder, select and rephrase profile facts and **may not introduce an employer, title, date, degree, certification or metric absent from the profile**; a validator diff-checks output entities against the profile and rejects on any unknown.
- **STRATEGY:** New AI endpoints under `/v2/resume/*` beside the old ones; resume-service switches per operation behind flags; role presets (Java Backend, Spring Boot, Microservices, Full Stack, SWE, Senior SWE, Engineering Manager, GenAI, Cloud, International) are data, not code.
- **RISKS:** Structured-output support varies by provider (Groq/Gemini via OpenAI-compatible endpoints); async parse changes the upload UX.
- **ROLLBACK:** Flags route back to the v1 endpoints, which are not deleted in this phase.

### 1B.5 LLMProvider and injection defence (needed by 1B.4)
- **CURRENT:** CrewAI-bound; prompts interpolate untrusted text.
- **TARGET:** `LLMProvider` interface with `complete_structured(schema, system, trusted, untrusted)`; implementations for OpenAI, Anthropic, Google, OpenRouter, plus existing Groq and Ollama. Untrusted content is passed in delimited data blocks with a fixed system instruction that it is data; outputs are schema-validated; a tool-less call path for anything that reads untrusted text. Result cache keyed by `hash(model, schema, inputs)`.
- **STRATEGY:** New module; `select_llm` chain order preserved; CrewAI paths migrate one at a time.
- **RISKS:** Injection defence is mitigation, not proof; keep humans in the approval path.
- **ROLLBACK:** Old `CrewAIService` remains until Phase 3.

**Gate 1B:** provenance invariant tests; version/rollback tests; tailoring validator tests with adversarial resumes; core loop unchanged.

---

## Phase 2 — Job intelligence

| Change | CURRENT | TARGET | STRATEGY | RISKS | ROLLBACK |
|---|---|---|---|---|---|
| Adapters | One class, five scrapers + Adzuna | `JobSourceAdapter` (`searchJobs, getJob, getJobDetails, getApplicationUrl, getCapabilities, getCompliancePolicy`); adapters: Adzuna, Greenhouse, Lever, Ashby, SmartRecruiters | Wrap existing Adzuna code first; add ATS adapters with recorded-fixture tests; curated employer list | Employer list is manual; feeds change shape | Per-adapter enable flag |
| Scraper retirement (D2) | Fallback | Removed | Disable by flag for one phase, then delete | Fewer results without an Adzuna key (D7) | Re-enable flag during the grace phase |
| Normalization | Ad hoc dict | `NormalizedJob` in job-service (`jobs` extended: source, source_job_id, country, remote_type, employment_type, salary min/max/currency, experience, required/preferred skills, visa_sponsorship, posted_date, deadline, application_url, ats_type, company_domain, status, fingerprint) | Additive nullable columns; new `job_sources`, `companies` | Sparse fields from some sources | Columns unused by old code |
| Stable identity | Positional IDs for scraped jobs | `source + source_job_id`, else content fingerprint | Migration marks legacy positional-ID rows `legacy=true`; saved jobs and applications keep their denormalized title/company/URL | Legacy rows cannot be re-linked | None needed; data preserved |
| Corpus + ingestion | Search-time only | Scheduled ingestion into `jobs`; search reads the corpus first | Schedules move to job-service (`schedules` table, `@Scheduled`); AI scheduler endpoints deprecated | Double-running during cut-over | Flag selects scheduler owner |
| Deduplication | Exact title+company | `JobDeduplicationService`: canonical URL → ATS ID → normalized (company, title, location) → description similarity (shingles) → embedding similarity; duplicates linked, best source kept | Offline evaluation on a labeled sample before enabling merge | False merges hide real jobs | Merge is a link, not a delete; unlink is one update |
| Freshness | "Posted today" always | Real `posted_date`; `STALE` after N days; re-verify URL before preparing an application | — | Sources without dates | Treat unknown as unknown, never as fresh |
| Safety | None | `JobSafetyAgent`: rules first (payment requests, Telegram/WhatsApp-only contact, free-mail recruiter domains, domain/company mismatch, compensation outliers, duplicate spam), LLM only for the ambiguous middle; `risk_score` + reasons; high risk can never reach `APPLY_*` | Rules ship first | False positives | Threshold is config; score is advisory in UI until tuned |
| Matching | Keyword coverage of query terms | Hybrid: hard rules (location, authorization, visa, seniority) → keyword/skill overlap → embeddings → LLM reasoning for the top slice; output `matchScore, strengths, weaknesses, missingSkills, salaryFit, locationFit, visaFit, careerFit, recommendation`, each with evidence | New `/v2/match`; old score kept as the keyword tier; one `job_matches` row per (user, job, profile version), upserted | Embedding provider cost; score drift vs. today's | Flag returns the UI to the keyword score |
| ATS detection | None | URL/DOM-signature detection for the eleven listed systems, stored as `ats_type` | Pure function + tests | Misclassification | Informational only |
| Global search | India-biased defaults | Country, currency, remote eligibility, sponsorship, relocation on job and on profile preferences | Additive | Sponsorship rarely stated explicitly | Shown as "not stated" |

**Gate 2:** adapter contract tests against fixtures; compliance tests (blocked actions make no network call); dedup precision measured; core loop on the new corpus.

## Phase 3 — Application intelligence

- **CURRENT:** Cover letter and ATS text generated from pasted resume text, not stored.
- **TARGET:** `ApplicationPreparationAgent` builds a package per (user, job): tailored `ResumeVersion`, `CoverLetter`, `ApplicationAnswer` set (salary, notice period, work authorization, visa, relocation, screening questions), recruiter message. `AnswerPolicy`: each answer has `source` (profile fact ID), `confidence`, `requiresApproval`; anything not derivable is the literal `USER_INPUT_REQUIRED`. `ApplicationDocument` links files to an application.
- **STRATEGY:** New tables in resume-service and job-service; new "Prepare application" action on a job; existing cover-letter and ATS pages keep working and gain "save to application".
- **RISKS:** Fabrication. Mitigated by the entity validator from 1B.4 applied to every generated artifact, and by mandatory approval.
- **ROLLBACK:** Feature flag hides the action; tables are additive.

## Phase 4 — Approval and tracking

- **CURRENT:** Five statuses, no history, no approval concept.
- **TARGET:** Lifecycle `DISCOVERED → SHORTLISTED → PREPARING → AWAITING_APPROVAL → READY_TO_SUBMIT → SUBMITTED → SCREENING → INTERVIEW → TECHNICAL_ROUND → HR_ROUND → OFFER | REJECTED | WITHDRAWN | CLOSED | ERROR` as a validated state machine; `application_transitions` log; `approval_requests` (applications, profile changes, resume changes, cover letters, answers) with APPROVE / EDIT / REJECT / SAVE / OPEN IN BROWSER; `ApplicationDecisionAgent` returning `APPLY_AUTOMATICALLY | APPLY_WITH_APPROVAL | SAVE_FOR_REVIEW | DO_NOT_APPLY | BLOCKED_BY_PLATFORM | MISSING_INFORMATION` after the safety checks (duplicate, freshness, platform policy, company risk, eligibility, visa, completeness, quality); `interviews`, `offers`; persisted notifications in notification-service; kill switch (`GLOBAL_AUTOMATION_ENABLED`, per-platform flag) with a **STOP ALL AUTOMATIONS** control on the dashboard.
- **STRATEGY:** Status migration maps `APPLIED→SUBMITTED`, `INTERVIEWING→INTERVIEW`; the PATCH endpoint accepts both vocabularies for one phase. `APPLY_AUTOMATICALLY` is computed but, with no platform permitting it, always downgraded to `APPLY_WITH_APPROVAL` by the policy gate. Schedule pause/resume state is read from the same kill switch.
- **RISKS:** Status mapping loses nuance; UI churn on the history page.
- **ROLLBACK:** Down-migration maps statuses back; old values retained in a shadow column for one phase.

## Phase 5 — Platform adapters

- **TARGET:** `NaukriProfileAgent`, `CutshortAdapter`, `InstahyreAdapter`, `LinkedInProfileDraft` and company-career-page handling, all in the modes fixed by `docs/platform-compliance.md` (drafts and user-driven steps). Pages: LinkedIn, Naukri, Cutshort, Instahyre, Platforms. `platform_policies` table seeded from the compliance document, with expiry.
- **STRATEGY:** Each adapter ships with its compliance test before its feature code. Primary terms re-read at build time.
- **RISKS:** Users expect automation these platforms forbid. The UI states the mode and the reason on every action.
- **ROLLBACK:** Per-platform flag.

## Phase 6 — Browser automation (permitted workflows only)

- **CURRENT:** None.
- **TARGET:** `BrowserAutomationService` (Playwright) with `navigate, inspect, detect forms, fill, upload, extract, screenshot`, used only where a `platform_policies` row allows it, in a session the user launched, with `DRY_RUN` on by default and a hard stop on CAPTCHA, MFA, login wall or unknown challenge. No stored third-party passwords; a credential abstraction separates OAuth tokens, API keys, browser sessions and application credentials, encrypted at rest with a key outside the database.
- **STRATEGY:** Start with form *reading* (`ApplicationFormAgent` maps fields to prepared answers and shows the user what goes where). Filling comes only after a platform-specific review. Submission is always the user's click.
- **RISKS:** This is the phase with the most legal and account-ban exposure, and it reverses part of the CLAUDE.md "never holds the pen" position. It should be re-approved explicitly when reached.
- **ROLLBACK:** Service is a separate optional module; removing it leaves Phases 1–5 intact.

## Phase 7 — Analytics and career intelligence

- **TARGET:** Funnel (discovered → shortlisted → applied → interview → offer), response rate, performance by platform, resume version, company, role, location and salary band; `AnalyticsAgent` recommendations with stated sample sizes. All derived from `application_transitions`, so it needs Phase 4 data to exist first.
- **RISKS:** Drawing conclusions from tiny samples; every insight shows its n.
- **ROLLBACK:** Read-only feature; flag.

---

## Frontend page migration

| Target page | From | Phase |
|---|---|---|
| Dashboard | `dashboard.tsx` + kill switch | 4 |
| Jobs, Job Details | `job-matches.tsx`, `job-aggregator.tsx` merged; new details page | 2 |
| Applications, Application Details | `application-history.tsx`; new details page | 4 |
| Candidate Profile | New; `/profile` stays as Account | 1B |
| Resumes | `resume-assistant.tsx`, `ats-generator.tsx` | 1B |
| Cover Letters | `cover-letters.tsx` | 3 |
| Approval Queue | New | 4 |
| LinkedIn, Naukri, Cutshort, Instahyre, Platforms | New | 5 |
| Analytics | `analytics.tsx` (admin) + new personal analytics | 7 |
| Settings | `preferences.tsx` | 1B |
| Automation | Renamed "Saved searches" | 2 |

Existing routes keep working and redirect once their replacement is the default.

## Sequencing and size

Order is strict: 1A → 1B → 2 → 3 → 4 → 5 → 6 → 7. Rough relative size, in units of "Phase 1A": 1A = 1, 1B = 1.5, 2 = 2, 3 = 1, 4 = 1.5, 5 = 1, 6 = 1.5 (if approved), 7 = 0.5. These are effort ratios, not calendar estimates.
