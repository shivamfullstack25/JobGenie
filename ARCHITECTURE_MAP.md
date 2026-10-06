# JobGenie — Architecture Map

**Date:** 2026-10-06. Sections 1–6 describe the system **as it is**. Section 7 describes the target. Evidence and defects are in `PROJECT_AUDIT.md`.

---

## 1. Layer map (current)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ FRONTEND   React 18 + Vite   :3000 (nginx in Docker)                     │
│   Firebase JS SDK (Google/GitHub popup) ──► Firebase Auth                │
│   Firestore (users/{uid} doc)           ──► Firebase  [second user store]│
└───────────────┬──────────────────────────────────────────────────────────┘
                │ HTTP JSON, no Authorization header, userId in query/body
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ BACKEND                                                                  │
│  API Gateway :8080  (WebFlux; filters: SecurityHeaders, InputValidation, │
│                      RateLimiting[in-mem], ThreatDetection[Redis])       │
│   local: /api/admin, /api/analytics, /api/gateway, /api/health,          │
│          /api/auth/linkedin*, /ws/**                                     │
│        │ lb:// via Eureka :8761                                          │
│        ├──► user-service :8081          ──► PG jobgenie_users            │
│        ├──► job-service :8082           ──► PG jobgenie_jobs             │
│        ├──► resume-service :8083        ──► PG jobgenie_resumes          │
│        ├──► notification-service :8084  (no DB; SMTP)                    │
│        └──► ai-service :8000  (also proxied directly)                    │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ RestTemplate, JSON, no service auth
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ AGENT SERVICE   FastAPI :8000                                            │
│   CrewAIService (7 single-task agents) · JobAggregator · SchedulerAgent  │
│   NotificationService (in-memory) · heuristic fallbacks                  │
│   State: Redis (job-search cache) + process memory (schedules, notifs)   │
└───────┬───────────────────────────────────────┬──────────────────────────┘
        ▼                                       ▼
┌──────────────────────────┐   ┌───────────────────────────────────────────┐
│ LLM                      │   │ EXTERNAL JOB SOURCES                      │
│ Groq → Gemini → OpenAI   │   │ Adzuna API (if keyed; never keyed here)   │
│ → Ollama → heuristics    │   │ HTML scrape: LinkedIn, Indeed, Naukri,    │
│ (OpenAI-compatible HTTP) │   │ Glassdoor, Monster → else sample jobs     │
└──────────────────────────┘   └───────────────────────────────────────────┘

DATABASE: one Postgres 15 container, five databases (users, jobs, resumes,
notifications[unused tables], ai[empty]). Redis 7: gateway threat state +
AI job-search cache. Kafka: configured, disabled.
```

Every box except Eureka's dashboard is also reachable directly from the host: compose publishes 5432, 6379, 8000, 8081–8084 and 8761.

---

## 2. Authentication (current)

```
Browser ── signInWithPopup ──► Firebase ── ID token ──► Browser
Browser ── POST /api/auth/verify {idToken} ──► gateway ──► user-service
   user-service: FirebaseAuth.verifyIdToken()
        ├─ ok   → get-or-create User by firebase_uid
        └─ fail or Firebase not configured
                → decode JWT payload WITHOUT signature check → get-or-create User
   ◄── full User entity (id, role, firebaseUid, …)
Browser keeps backendUser.id in React state.
Every later call: ?userId={backendUser.id}   — no token, nothing verified.
Admin calls:      X-User-Id: {firebaseUid}   — header, nothing verified.
Service-to-service: none.
```

There is no session, no token validation after login, and no trust boundary between services.

---

## 3. API boundaries

### 3.1 Frontend → Gateway (path prefix → destination)

| Prefix | Destination | Used by frontend |
|---|---|---|
| `/api/auth/verify\|refresh\|logout\|me` | user-service | Yes |
| `/api/auth/linkedin`, `/linkedin/callback` | gateway-local | No UI entry point found |
| `/api/users/**`, `/api/profile/**`, `/api/preferences/**` | user-service | Yes |
| `/api/resumes/**` | resume-service | Yes |
| `/api/jobs/**` | job-service | Yes |
| `/api/automation/**`, `/api/schedules/**` | job-service | Yes |
| `/api/job-aggregator/**`, `/api/market-intelligence/**`, `/api/career-mentor/**` | **ai-service directly** | Yes |
| `/api/schedule/**`, `/api/notifications/{send,history,read,stats,webhook}` | **ai-service directly** | Yes (notifications) |
| `/api/notifications/{email,sms,push,job-application,generic}` | notification-service | No |
| `/ai/**`, `/api/ai/**`, `/ws/notifications/**` | ai-service | `/ai/crew/*` called, does not exist |
| `/api/admin/**`, `/api/analytics/**`, `/api/gateway/**` | gateway-local | Yes (admin) |
| `/api/auto-apply/*`, `/api/advanced-auto-apply`, `/api/jobs/search-and-apply`, `/api/schedule/auto-apply` | ai-service | **Dead routes** (targets deleted) |

### 3.2 user-service

`POST /api/auth/verify`, `/refresh`, `/logout` · `GET /api/auth/me?firebaseUid=` · `GET|DELETE /api/users/me?userId=` · `GET /api/users/me/export` · `PUT /api/users/profile`, `/profile/settings` · `GET /api/users/{id}` · `GET /api/users` (admin) · `DELETE /api/users/{id}` (admin) · `PUT /api/users/{id}/role` (admin) · `GET /api/users/count` · `POST /api/users/audit-log` · `GET|PUT /api/profile`, `PUT /api/profile/settings` · `GET|PUT /api/preferences`.

### 3.3 resume-service

`POST /api/resumes/upload` (multipart, `userId`) · `GET /api/resumes/user/{userId}` · `GET|DELETE /api/resumes/{id}` · `PUT /api/resumes/{id}/activate` · `GET /api/resumes/{id}/content` · `PUT /api/resumes/parsed?userId=` · `GET /api/resumes/{id}/export/{pdf|json}` · `POST /api/resumes/export/bulk` · `GET /api/resumes/user/{userId}/export` · `GET /api/resumes/{id}/analytics/export` · `POST /api/resumes/{id}/export/ats` · `POST /api/resumes/insights`, `/optimize-ats`, `/generate-cover-letter`, `/chat` · `GET /api/resumes/count`.

### 3.4 job-service

`GET /api/jobs/search` · `GET /api/jobs/matches?userId=&resumeId=` · `GET /api/jobs/user/{id}/matches` · `POST /api/jobs/apply` · `GET /api/jobs/applications` · `PATCH /api/jobs/applications/{id}/status` · `POST|GET|DELETE /api/jobs/saved` · `POST /api/jobs/automation/start` (broken) · `GET /api/jobs/automation/status` · `GET /api/jobs/{matches|applications}/count` · `/api/automation/{schedule-advanced, run-advanced/{id}, schedules, schedules/{id}, run/{id}, status, schedule}` · `/api/schedules` (GET, POST), `/{id}` (GET, DELETE), `/{id}/toggle`, `/{id}/run`, `/stats`.

### 3.5 Backend → Agent service

| Caller | AI endpoint | Purpose |
|---|---|---|
| resume-service `AIServiceUtil` | `POST /api/resume-insights` (twice per upload) | Parse + insights |
| resume-service `AIServiceClient` | `/api/resume-insights`, `/api/ats-resume`, `/api/generate-cover-letter`, `/api/chat` | On-demand AI |
| job-service `JobServiceImpl` | `POST /api/search-jobs`, `POST /api/job-matches` | Search, match |
| job-service `JobServiceImpl` | `POST /api/scheduler/setup` (broken), `GET /api/schedule/user/{id}` | Automation |
| job-service `AutomationController`, `ScheduleController` | `/api/schedule/job-search`, `/user/{id}`, `/{id}/pause\|resume\|run`(missing), `DELETE /{id}`, `/stats`, `/api/scheduler/{id}/status`(broken) | Schedules |
| AI `NotificationService` → gateway | `POST /api/notifications/webhook`, user lookup | Routed back to itself |

Contracts are untyped `Map` payloads on the Java side and partly `dict` on the Python side. There is no shared schema or contract test.

### 3.6 Service ↔ service (Spring)

job-service → resume-service (`/api/resumes/{id}`, `/user/{id}`) and → user-service (`/api/users/{id}` for role and email-verified checks, `/api/users/audit-log`). user-service → resume-service and job-service (account deletion cleanup). gateway → all services (`/count` endpoints for admin).

### 3.7 Agent service → outside

LLM: `api.groq.com/openai/v1`, `generativelanguage.googleapis.com/v1beta/openai/`, OpenAI, Ollama. Jobs: `api.adzuna.com`; HTML GETs to linkedin.com, indeed.com, naukri.com, glassdoor.com, monster.com with a spoofed Chrome 91 User-Agent. Email: SendGrid or SMTP. Eureka registration.

### 3.8 OpenAPI

springdoc on the five Spring services (`/swagger-ui.html`, `/v3/api-docs`); FastAPI at `/docs`. The gateway additionally serves hand-written, out-of-date documentation from `SwaggerController` and `ApiDocumentationController`.

---

## 4. Data flows (current)

**Resume upload.** Browser → `POST /api/resumes/upload` → resume-service opens a transaction → ensure stub user row → PDFBox/POI text extraction → insert `resumes` → `POST /api/resume-insights` → AI: LLM crew or regex heuristic → normalized into `metadata` → the same call again for `insights` → `skills`, `experience`, `education` JSONB written → commit → response. The original file is not stored.

**Job matches.** Browser → `GET /api/jobs/matches?userId=` → job-service fetches the user's first active resume → first five skills become keywords, parsed location becomes location → `POST /api/job-matches` → AI: Redis hit, else Adzuna, else scrape, else samples; score = keyword coverage → job-service upserts each `jobs` row by external ID and **inserts** a new `job_matches` row → response.

**Save / apply / track.** `POST /api/jobs/saved` denormalizes title, company, URL into `saved_jobs`. `POST /api/jobs/apply` checks email-verified via user-service, rejects duplicates, inserts `job_applications` with status `APPLIED`. `PATCH …/status` overwrites status. The browser opens the job URL in a new tab.

**Cover letter / ATS.** Browser → resume-service → AI → LLM free text or template. Nothing is stored; `cover_letters` and `ats_resumes` tables are never written.

**Account deletion.** user-service lists and soft-deletes resumes, deletes saved jobs, deletes the Firebase user, deletes the `users` row, writes an audit line. Applications, matches, and resume text remain.

---

## 5. Asynchronous workflows (current)

| Workflow | Mechanism | Durable | Works |
|---|---|---|---|
| Scheduled job search | APScheduler in the AI process; state in a dict | No | Creation needs an LLM; run-now is 404; stats never update |
| Job-search notification after a scheduled run | In-process call → email if SMTP/SendGrid set, WebSocket if connected, else webhook to the gateway | No | Unverified |
| Real-time notifications | WebSocket `/ws/notifications/{userId}` (AI) and a separate gateway WebSocket handler | No | Unauthenticated; user ID in path |
| Eureka heartbeat | asyncio task | n/a | Yes |
| Kafka events | Producers in job-service and notification-service behind `KAFKA_ENABLED=false` | — | Off |
| Resume parsing | **Synchronous**, despite a code comment saying it should be async | — | Yes, slow |

There is no queue, no outbox, no retry, and no worker process.

---

## 6. Deployment (current)

`docker-compose.yml`, one replica each, `restart: always`. Health checks on all services. The gateway waits for job, user and resume services to be healthy. Secrets arrive as environment variables from `.env`. CI builds artifacts and validates compose; it does not test or deploy.

---

## 7. Target architecture

Same services, same databases, same deployment. The changes are: identity enforced at the edge and re-checked in each service; one canonical profile; a persisted, normalized job corpus fed by adapters; an orchestrated agent layer with schema-validated I/O; an approval gate in front of every outbound action.

```
Frontend ── Authorization: Bearer <Firebase ID token> on every call
   ▼
Gateway ── verifies token (Firebase public keys), strips client X-User-* headers,
           injects X-Auth-User-Id / X-Auth-Role, signs an internal header
   ▼
user-service      + CandidateProfile, ProfileVersion, ProfileFact provenance,
                    PlatformProfile drafts, Credential vault, AuditLog v2
resume-service    + ResumeVersion, file storage, tailored variants, CoverLetter,
                    ApplicationDocument
job-service       + NormalizedJob corpus, JobSource, Company, fingerprint dedup,
                    JobMatch (explainable), Application lifecycle + transitions,
                    ApplicationAnswer, ApprovalRequest, Interview, Offer,
                    PlatformPolicy, AutomationRun, schedules (moved from AI)
notification-svc  + persisted Notification, delivery log
   ▼  internal token, typed contracts
ai-service        CareerOrchestrator
                    ├ ResumeAgent · CandidateProfileAgent · ProfileOptimizationAgent
                    ├ JobDiscoveryAgent → JobSourceAdapter[Adzuna, Greenhouse, Lever,
                    │                      Ashby, SmartRecruiters, …]
                    ├ JobNormalization · JobDeduplication · JobSafety · JobMatching
                    ├ ApplicationPreparation · ApplicationForm · ApplicationDecision
                    └ BrowserAutomation (Phase 6, policy-gated) · Analytics · Notification
                  LLMProvider (OpenAI | Anthropic | Google | OpenRouter | Groq | Ollama)
                    structured outputs · untrusted-content isolation · result cache
                  PolicyGate: GLOBAL_AUTOMATION_ENABLED · per-platform switch · DRY_RUN
```

### 7.1 Ownership rules

| Data | Owner | Others get it by |
|---|---|---|
| Account, CandidateProfile, versions, platform drafts, credentials | user-service | API, never direct DB |
| Resume files, versions, cover letters, documents | resume-service | API |
| Jobs, matches, applications, approvals, interviews, offers, policies, schedules, automation runs | job-service | API |
| Notifications | notification-service | API |
| Nothing durable | ai-service | Stateless; cache only |

The AI service holding no durable state is a deliberate change: it removes the in-memory schedules and notifications and makes agents replaceable.

### 7.2 Target authentication

1. Browser attaches the Firebase ID token to every request.
2. Gateway validates signature, issuer, audience and expiry; rejects otherwise. Public paths: health, auth verify, static docs in non-production.
3. Gateway removes any inbound `X-User-Id`, `X-Auth-*` headers, then sets `X-Auth-User-Id` (numeric, resolved once and cached), `X-Auth-Role`, and an HMAC over them with a shared internal secret.
4. Each service verifies the HMAC and takes identity **only** from those headers. `userId` request parameters are accepted during migration but must equal the authenticated ID, else 403.
5. Service-to-service calls carry the same signed header pair with a service identity.
6. Backend ports are no longer published to the host.
7. The unsigned-JWT fallback exists only under an explicit `dev-insecure-auth` profile.

### 7.3 Target asynchronous workflows

| Workflow | Mechanism |
|---|---|
| Resume parse, job ingestion, match scoring, package preparation | Postgres-backed job table + worker loop in the owning service (outbox pattern). No new infrastructure. |
| Scheduled discovery | Spring `@Scheduled` reading `schedules` in job-service; survives restarts |
| Notifications | Outbox row → notification-service → channel |
| Approval | `ApprovalRequest` row; nothing proceeds until a human sets `APPROVED` |

Kafka stays off until there is more than one consumer that needs the same event.

### 7.4 Target data flow (one job, end to end)

```
adapter.searchJobs ─► NormalizedJob ─► fingerprint ─► dedup/merge ─► safety score
   ─► match (rules → keywords → embeddings → LLM, each tier only if the
             previous one leaves the job in contention)
   ─► DISCOVERED ─► user shortlists ─► PREPARING
   ─► ApplicationPreparation: tailored resume + cover letter + answers,
        every statement traced to a CandidateProfile fact
   ─► ApplicationDecision (duplicate? fresh? policy? risk? eligible? complete?)
   ─► AWAITING_APPROVAL ─► human: approve / edit / reject
   ─► READY_TO_SUBMIT ─► submission by the mode the platform policy allows
        (today, for every platform: user opens the application URL)
   ─► SUBMITTED ─► SCREENING ─► INTERVIEW … ─► OFFER | REJECTED | CLOSED
   every transition ─► application_transitions + audit_log
```
