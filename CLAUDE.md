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

### Phase 2: Needs product/legal decision first — **ASK USER before implementing**

| Decision | Options | Impact |
|----------|---------|--------|
| Job data sourcing | Licensed API (Adzuna, etc.) vs scraping | Legal exposure, product shape |
| Business model | B2C subscriptions vs B2B recruiter seats | Data model, auth, billing |
| Browser automation | Keep credential-based auto-apply vs cut/narrow | Legal risk, Playwright not deployed |
| Infra | Stay on docker-compose vs K8s | Trigger: need >1 replica |

### Phase 3: Structural debt (address after Phase 1)

- **JSONB skill columns** — no GIN index; matching loads rows into app. Add GIN indexes when corpus grows.
- **Billing/monetization** — no Stripe, no plan tiers. Design when business model decided.
- **Multi-tenancy** — only user/admin roles. Org/team entity needed for B2B.
- **CI/CD** — `.github/workflows/ci.yml` builds but doesn't deploy. No K8s/Helm/Terraform.
- **AI matching honesty** — LLM path unreachable without valid OpenAI key; falls back to keyword matching. Label UI accordingly or fix key/routing.

---

## Engineering constraints

1. **Gateway is reactive** — don't inject `RestTemplateBuilder` as a bean in api-gateway; construct directly.
2. **Firebase optional** — `firebase-service-account.json` missing → JWT fallback in user-service.
3. **Docker Desktop** — builds are slow; use `lean-start.ps1` for incremental bring-up.
4. **KAFKA_ENABLED=false** in `.env` — Kafka not required for core flow.
5. **Graceful degradation** — optional imports (Playwright, CrewAI) must not crash the AI service.
6. **Don't collapse microservices** — boundaries are sound; fix internals.

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

## How to work in this repo

1. Read this file and the service you're touching before editing.
2. Fix one roadmap item at a time; verify E2E still works.
3. Don't re-implement Section "ALREADY FIXED" items.
4. For Phase 2 items, stop and ask the user which direction to take.
5. Prefer minimal, focused diffs. Match existing code style.
6. Test with live stack when possible — don't trust code review alone.

## Current session defaults

- OmniRoute profile: `groq-qwen-coding` (not `auto/best-coding` — Gemini tool-casing bug breaks agent mode)
- Press `Shift+Tab` for auto-accept mode in Claude Code
- Use `/init` only if regenerating this file
