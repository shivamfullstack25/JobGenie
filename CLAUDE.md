# JobGenie — Architecture & Production Roadmap

> Source: Architecture & Scale Review (2026-08-23). Read this file before making changes.
> Workspace: `JobGenie-modifications` (Windows, Docker Compose, Spring Boot microservices, FastAPI AI, React/Vite).

## Product goal (E2E flow that must work)

1. Sign up / log in (Firebase Auth + backend user record)
2. Upload resume (PDF/DOCX)
3. Parse resume → structured data in PostgreSQL
4. AI enrichment (skills, experience metadata)
5. Search & match jobs
6. Save jobs + application history in React UI

**Status:** Core loop verified live during review. Do not break it while hardening.

## Stack map

| Layer | Path | Port |
|-------|------|------|
| Frontend | `JobGenie-Frontend/` | 3000 (dev) |
| API Gateway | `JobGenie-Backend/api-gateway/` | 8080 |
| User service | `JobGenie-Backend/user-service/` | 8081 |
| Job service | `JobGenie-Backend/job-service/` | 8082 |
| Resume service | `JobGenie-Backend/resume-service/` | 8083 |
| Notification service | `JobGenie-Backend/notification-service/` | 8084 |
| Eureka | `JobGenie-Backend/eureka-server/` | 8761 |
| AI service | `JobGenie-AI/` | 8000 |
| Infra | `docker-compose.yml`, `sql/` | postgres, redis |

**Note:** Duplicate nested copy at `JobGenie-modifications/JobGenie-modifications/` — edit root-level services only.

---

## ALREADY FIXED — do not re-do or regress

These were fixed during the 2026-08-23 review. Verify they still work; don't revert.

| Issue | Location | Fix |
|-------|----------|-----|
| Plaintext credentials in logs | `AutomationController.java`, `ScheduleController.java` | Log only non-secret fields |
| False "encrypted storage" UI claims | `automation.tsx`, `about.tsx` | Copy matches reality |
| Gateway blocking all traffic | `ThreatDetectionFilter.java` | Path traversal / injection regex fixed |
| Fake analytics as live metrics | `AnalyticsController.java`, `AdminController.java` | Live queries + `isSampleData` flag for samples |
| `totalATSResumes` bug | `AnalyticsController.java` | Reads resume count, not user count |
| No RestTemplate timeouts | 5 services | Explicit connect/read timeouts per call type |
| Gateway RestTemplateBuilder crash | `api-gateway/.../RestTemplateConfig.java` | `new RestTemplateBuilder()` directly (reactive app) |
| Admin actions no-op in Docker | `JobController.java` | Correct Docker hostname + shared RestTemplate |
| Cascade delete landmine | `shared/entities/User.java` | Removed `@OneToMany resumes` |
| Malformed resume JSON 500 | `ResumeServiceImpl.convertToDto` | Handles both object/array shapes |
| Missing saved_jobs index | `sql/` init scripts | Composite index on `(user_id, saved_at DESC)` |
| Default Hikari pools | job/resume/user-service | Explicit `hikari.*` settings |
| AI graceful degradation | `JobGenie-AI/main.py` | `/health` UP when degraded; 503 not 500 |
| Distributed rate limiter | `RateLimitConfig.java` | **Attempted, reverted** — RequestRateLimiter bean missing; gateway crash-looped |
| CrewAI never actually ran, all session, regardless of key validity | `crew_ai_service.py` `select_llm()` | Was returning a raw langchain `ChatOpenAI`, which fails Pydantic validation when passed to `Agent(llm=...)` in the installed crewai 1.15.17 — silently caught, forced heuristic-only mode. Fixed: return `crewai.LLM` instead, with eager `.call()` validation so a genuinely bad key still degrades gracefully (doesn't just move the failure to request time). |
| Three more crewai 1.15.17 compatibility gaps, found only once agents could actually construct | `crew_ai_service.py` | `Task(...)` now requires `expected_output` (6 call sites were missing it) · `crew.kickoff()` is refused inside FastAPI's running event loop, needs `await crew.kickoff_async()` (8 call sites) · that returns a `CrewOutput` object, not a string — extract `.raw` before returning/parsing (same 8 call sites). All fixed and verified live with real Groq output. |
| 3-tier LLM provider chain, cost-ascending | `crew_ai_service.py`, `docker-compose.yml`, `.env` | Auto priority: GROQ (free, `GROQ_API_KEY`) → GEMINI (free tier, `GEMINI_API_KEY`) → OPENAI (paid, `OPENAI_API_KEY`) → Ollama. None have native crewai support without `litellm` (not installed) except Ollama — Groq and Gemini are routed through crewai's native `openai` provider dispatch pointed at their own OpenAI-compatible endpoints instead (Groq: `api.groq.com/openai/v1`; Gemini: `generativelanguage.googleapis.com/v1beta/openai/`, model `gemini-3.6-flash` — Google retired `gemini-2.5-flash` for new users mid-2026, check `ai.google.dev/gemini-api/docs/models` if this 404s again later). All three keys in `.env` are confirmed live and working as of 2026-08-23. Force one with `LLM_PROVIDER=groq\|gemini\|openai`. |
| ATS-export formatting bug: `Map.toString()` leaking into PDFs | `ExportServiceImpl.java` | Experience/education entries are `{"description": "..."}` objects (not plain strings) — calling `.toString()` on them for PDF export produced literal `{description=...}` text instead of the actual content. Added `itemToDisplayText()` to extract real text either way, plus HTML-escaping so resume content with `<`/`>`/`&` can't break the generated markup. Verified live: exported PDF text is now clean. |
| `optimize-ats` NPE on missing `resumeContent` | `ResumeController.java`, `AIServiceClient.java` | `Map.of()` throws a bare `NullPointerException` on any null value (not just missing keys), surfacing as an opaque "AI service call failed" 500. Added a 400 validation check in the controller and swapped to a null-safe `HashMap` in the client for defense in depth. |

---

## Product decisions (locked) — 2026-08-24

Made as product owner, per explicit instruction not to re-ask. Supersedes Phase 2 below (now DECIDED). Do not reopen without the user explicitly asking to revisit.

### The positioning: JobGenie is Skyscanner-for-jobs, not an auto-apply bot

Skyscanner aggregates flight offers, lets the user compare, then clicks them out to the airline/OTA to actually complete the purchase — it never logs into British Airways as the user. JobGenie works the same way:

- **JobGenie = the comparison/prep layer**: resume parsing, job aggregation across sources, match scoring, a tailored resume/cover-letter packet, and an application tracker.
- **LinkedIn / Indeed / Naukri / company career pages = the "airlines"**: the user completes the actual application there, in their own logged-in session.
- **JobGenie never holds the pen**: no third-party job-site passwords stored, no Playwright/Puppeteer driving a browser to click Apply on the user's behalf.

Why: credential-based auto-apply (a) violates every major job board's ToS and gets the user's account banned, (b) is a real security liability (plaintext or "encrypted" third-party passwords sitting in our DB is a breach waiting to happen — see the credential-logging bug already fixed once this session), (c) was never actually functional here anyway — Playwright isn't a deployed dependency, `real-automation.tsx`'s endpoints (`/api/automation/test-credentials`, `/api/automation/run-job-search`) don't exist on any backend service, and the CrewAI "auto-apply" path that *does* run is an LLM writing a fictional narrative about applying, not a real submission. Cutting it removes fake functionality, not real functionality.

"Apply" going forward means: **click-out** (open the job's real URL in a new tab) plus **manual application logging** (user marks it "Applied" in JobGenie, which the history page tracks). This is honest, ToS-safe, and matches what every real job board aggregator (Indeed itself, Adzuna, Google for Jobs) actually does.

### Job data sourcing: licensed API primary, cached scrape fallback — both off the request path

- **Primary, when configured**: [Adzuna Jobs API](https://developer.adzuna.com/) — free tier (~1000 calls/month), explicit India coverage (`country=in`), no ToS risk. Set `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` env vars to enable. Endpoint shape: `GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id=&app_key=&what=&where=&results_per_page=`.
- **Fallback, when no key configured**: the existing Redis-cached scraper output (already fixed to run off the request path this session, 15-min TTL cache-aside in `job_aggregator.py`) — kept because it's real functionality with no per-request ToS exposure (nothing scrapes synchronously inside a user's HTTP request), and ripping it out would remove working search results for zero benefit in an environment where no Adzuna key exists yet.
- Every job result carries an honest `source` field: `"adzuna"`, `"cache"`, or `"sample"` — never presented as one undifferentiated "live" feed.
- Match scores are **keyword-overlap based**, labeled `"Keyword Match"` in the UI — never "AI Match %" unless a real LLM actually scored it (it doesn't, currently — no working LLM key in this environment).

### KEEP / CUT / REBUILD

**Frontend routes** (`JobGenie-Frontend/src/App.tsx`, `components/navigation.tsx`)

| Route | Decision | Why |
|---|---|---|
| `/`, `/login`, `/dashboard`, `/profile`, `/preferences`, `/notifications` | KEEP | Core account loop |
| `/resume-assistant` | KEEP | Resume upload/parse/chat |
| `/job-matches`, `/job-aggregator` | REBUILD | Replace "Auto Apply" with click-out Apply + "Mark Applied"; add `source`/`Keyword Match` labels |
| `/application-history` | KEEP | Now the record of manual applications too |
| `/cover-letters`, `/ats-generator` | KEEP, relabel | Already honestly labeled "rule-based fallback" when no LLM (fixed earlier this session) — keep, demote in nav |
| `/career-mentor`, `/market-intelligence` | KEEP, relabel | Same — already say heuristic/no-LLM honestly; demote from primary nav to a secondary "Insights" area |
| `/automation` | REBUILD | Strip the credential form (LinkedIn/Indeed/Naukri username+password) and the `browser-automation` trigger; keep schedule-a-search (no credentials, no auto-apply) if the underlying schedule-job-search endpoint works standalone |
| `/real-automation` ("Browser Bot") | **CUT** | Entirely credential-based; its own backend endpoints don't exist; pure legal/security liability with zero real functionality |
| `/admin`, `/analytics` | KEEP | Already real live queries + `isSampleData` flags |
| `/about`, `/demo` | KEEP | Marketing/demo pages, already fixed for false claims earlier this session |

**Backend — job-service**

| Endpoint | Decision | Why |
|---|---|---|
| `/api/jobs/search`, `/matches`, `/saved` (GET/POST/DELETE) | KEEP | Core loop |
| `/api/jobs/apply` | REBUILD | Stop calling AI service's CrewAI auto-apply; instead just record a manual application (status `applied`, no AI call, no resume-content round-trip needed) |
| `/api/jobs/automation/start`, `/api/jobs/automation/status` | KEEP, narrow | Should mean "job-search schedule", not auto-apply |
| `AutomationController./schedule-advanced`, `/run-advanced`, `/schedules`, `/schedule`, `/status` | KEEP | Job-search scheduling only, once decoupled from auto-apply |
| `AutomationController./browser-automation` | **CUT** | Credential-based Playwright trigger |

**Backend — AI service (`JobGenie-AI/main.py` + `app/services/`)**

| Module/endpoint | Decision | Why |
|---|---|---|
| `job_aggregator.py` | REBUILD | Add Adzuna as primary source (graceful fallback to existing cache path); keep the Redis cache-aside layer already built this session |
| `/api/search-jobs`, `/api/job-matches`, `/api/job-aggregator/search` | KEEP, rebuild internals | Same file, new sourcing |
| `crew_ai_service.py`, `/ai/resume/analyze`, `/api/ats-*`, `/api/generate-cover-letter`, `/api/career-advice`, `/api/career-mentor/*`, `/api/market-intelligence/*` | KEEP | Already honestly labeled heuristic-fallback this session |
| `auto_apply_agent.py`, `advanced_auto_apply.py`, `robust_auto_apply.py` | **CUT** | Playwright/CrewAI "auto-apply" simulation — not real submission, not shippable |
| `/api/auto-apply`, `/api/auto-apply/{linkedin,indeed,naukri,batch}`, `/api/advanced-auto-apply`, `/api/jobs/search-and-apply` | **CUT** | Same — remove or 410/404 them, stop any frontend from calling them |
| `scheduler_agent.py`: `/api/schedule/job-search` | KEEP | Search-only scheduling, no credentials |
| `scheduler_agent.py`: `/api/schedule/auto-apply` | **CUT** | Auto-apply variant of scheduling |

Old Phase 2 table below: **DECIDED** as of this section. Business model / billing / multi-tenancy / K8s remain explicitly out of scope for this pass per the user's direct instruction — not reopened.

### Own-research additions (beyond the original ask, decided same pass)

Researched what a metasearch/tracker product needs beyond the locked spec above, found two real, cheap, high-value gaps and closed them:

1. **Match reasons and `matchingSkills` were always empty.** `_compute_match_score()` computed a real keyword-overlap score but never surfaced *which* keywords matched — `skills_required` was hardcoded `[]` at all 7 job-construction sites in `job_aggregator.py`, so the "Keyword Match" label had no evidence behind it in the UI. Fixed: added `_find_matching_keywords()`, wired into every job source (Adzuna, all 5 scrapers, cache-replay), and a `match_reasons` string (e.g. "Matches: python, react") that job-service's existing `buildMatchReason()` already preferred over its generic "Title at Company" fallback — zero Java changes needed for this part.
2. **No way to track an application past "Applied."** The product's own positioning is "comparison layer + **tracker**," but `JobApplication.status` was set once at creation and never updatable — there was no path from Applied → Interviewing → Offer → Rejected. Added `PATCH /api/jobs/applications/{id}/status` (job-service), validated against `APPLIED|INTERVIEWING|OFFER|REJECTED|WITHDRAWN`, ownership-checked. This is what actually makes "application history" a tracker rather than a one-way log.

Considered and deliberately deferred (lower ROI for this pass, noted for later): email job-alert notifications wired to search schedules (schedule-of-search exists, but nothing emails the user when it finds new jobs — `notification_service` and `scheduler_agent` both exist and could be wired together); a GIN index on JSONB skill columns (already tracked in Phase 3 below); broad mobile/accessibility audit (no signal that's currently broken, would be speculative work without a specific complaint).

---

## OPEN WORK — prioritized roadmap

### Phase 1: Build next (no business decisions required)

#### 1.1 Move job search off the request path (Weeks 1–2) — **HIGHEST IMPACT**
- **Problem:** `job_aggregator.py` scrapes 5 sites synchronously per request (15–20s). No cache, no queue. Match scores for 4/5 platforms are hardcoded constants.
- **Files:** `JobGenie-AI/app/services/job_aggregator.py`, scrapers under `app/services/`
- **Target:** Queue-based scraping or cached results; search returns from cache in ms. Real scoring or honest labeling.
- **Do not:** Block the HTTP response on live scraping.

#### 1.2 Observability — Micrometer + Prometheus + structured logs (Weeks 1–2)
- **Problem:** No metrics export, no tracing, no error tracking. Only `/actuator/health`.
- **Files:** All Spring Boot `pom.xml`, `application.properties`, `JobGenie-AI/main.py`
- **Target:** Prometheus scrape endpoints, basic dashboards, structured JSON logs.

#### 1.3 Redis-backed threat/rate state (Weeks 2–3)
- **Problem:** `ThreatDetectionFilter.java` uses in-memory `ConcurrentHashMap` — doesn't work across replicas.
- **Files:** `ThreatDetectionFilter.java`, `RateLimitConfig.java`, `docker-compose.yml`
- **Target:** Move IP blacklist, rate counters, client profiles to Redis. Fix RequestRateLimiter wiring if dependency combo allows.

#### 1.4 Email verification + self-service account deletion (Weeks 3–4)
- **Problem:** `isEmailVerified` stored but never enforced. No user-initiated delete/export.
- **Files:** `user-service`, `JobGenie-Frontend` auth flows
- **Target:** Gate features on verified email; add delete-my-account endpoint + UI.

### Phase 2: DECIDED — see "Product decisions (locked)" above (2026-08-24)

| Decision | Resolution |
|----------|------------|
| Job data sourcing | Adzuna API (primary, when keyed) + existing Redis-cached scraper (fallback) — both off the request path |
| Business model | Out of scope this pass — stay B2C, no Stripe |
| Browser automation | **Cut.** Click-out apply + manual "mark applied" logging replaces it |
| Infra | Stay on docker-compose — no K8s trigger (still 1 replica) |

### Phase 3: Structural debt (address after Phase 1)

- **JSONB skill columns** — no GIN index; matching loads rows into app. Add GIN indexes when corpus grows.
- **Billing/monetization** — no Stripe, no plan tiers. Design when business model decided.
- **Multi-tenancy** — only user/admin roles. Org/team entity needed for B2B.
- **CI/CD** — `.github/workflows/ci.yml` builds but doesn't deploy. No K8s/Helm/Terraform.
- **AI matching honesty** — LLM path unreachable without valid OpenAI key; falls back to keyword matching. Label UI accordingly or fix key/routing.

---

## Engineering constraints

1. **Gateway is reactive** — don't inject `RestTemplateBuilder` as a bean in api-gateway; construct directly.
2. **Firebase service account optional** — ID tokens are verified against Google's public keys (`shared/.../FirebaseTokenVerifier`), which needs no `firebase-service-account.json`. The old unsigned "local JWT fallback" is OFF by default and must stay off outside offline dev (`jobgenie.auth.insecure-local-jwt=true`). The service account is only needed to delete Firebase users on account deletion.
3. **Docker Desktop** — builds are slow; use `lean-start.ps1` for incremental bring-up.
4. **KAFKA_ENABLED=false** in `.env` — Kafka not required for core flow.
5. **Graceful degradation** — optional imports (Playwright, CrewAI) must not crash the AI service.
6. **Don't collapse microservices** — boundaries are sound; fix internals.
7. **Identity comes from the gateway, never from the request** — `GatewayAuthFilter` verifies the Firebase ID token and forwards HMAC-signed `X-Auth-*` headers; every service (`InternalAuthFilter`, auto-configured from `shared`) and the AI service (`app/core/internal_auth.py`) reject requests without a valid signature. A `userId` param/path segment must equal the authenticated user unless the caller is an admin or a service. For a user id in a JSON body, or data addressed by another id (resume, schedule), check ownership in the controller with `CurrentUser`. New endpoints that are public or service-only must be added to the path lists in those three files.
8. **`INTERNAL_AUTH_SECRET` is required** (same value everywhere, ≥32 chars, in `.env`). Rollback switch: `AUTH_ENFORCEMENT=report-only` (verify + log, block nothing) or `off`.
9. **No host Maven/Python 3.11** — run backend tests with `docker run --rm -v <repo>/JobGenie-Backend:/w -v jobgenie-m2:/root/.m2 -w /w maven:3.9.6-eclipse-temurin-17 mvn -B test -Dspotless.check.skip=true`; AI tests in `python:3.11-slim` with `requirements-dev.txt`; frontend with `npm test` (Vitest).

---

## Verification checklist (run after any change)

```powershell
# Infra + services
docker compose ps
curl http://localhost:8080/actuator/health
curl http://localhost:8000/health

# Frontend
cd JobGenie-Frontend; npm run dev   # :3000

# E2E smoke
# Login → Upload resume → View matches → Save job → Check history
```

---

## Overhaul in progress (started 2026-10-06)

Target: "AI Career Operating System". Read `PROJECT_AUDIT.md`, `ARCHITECTURE_MAP.md`, `MIGRATION_PLAN.md`, `docs/platform-compliance.md` first; per-phase notes live in `docs/migration-notes/`. Phase order is strict: 1A safety net → 1B profile/versions/resume → 2 job intelligence → 3 application packages → 4 approval + tracking → 5 platform adapters → 6 browser assistance (needs explicit re-approval) → 7 analytics. Owner decisions on 2026-10-06: security-first ordering approved; HTML scrapers to be retired in Phase 2 (this supersedes "cached scrape fallback" above).

## How to work in this repo

1. Read this file and the service you're touching before editing.
2. Fix one roadmap item at a time; verify E2E still works.
3. Don't re-implement Section "ALREADY FIXED" items.
4. Phase 2 is DECIDED (see "Product decisions (locked)") — implement per that table, don't re-ask.
5. Prefer minimal, focused diffs. Match existing code style.
6. Test with live stack when possible — don't trust code review alone.

## Current session defaults

- OmniRoute profile: `groq-qwen-coding` (not `auto/best-coding` — Gemini tool-casing bug breaks agent mode)
- Press `Shift+Tab` for auto-accept mode in Claude Code
- Use `/init` only if regenerating this file
