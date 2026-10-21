# JobGenie

JobGenie is a personal career assistant. It keeps one verified profile of who you are, finds jobs
from sources that permit it, explains how well each one fits, and prepares a tailored application
for you to review. You then apply on the employer's own site, and JobGenie tracks what happens next.

It is deliberately **not** an auto-apply bot: it never logs into job sites for you, never stores
third-party passwords, never scrapes sites whose terms forbid it, and never submits an application.

## What it does

| Page | Purpose |
|---|---|
| **My Profile** | Your canonical profile. Every fact is marked as stated by you, inferred from a document, AI-written, or approved by you; software can only *propose* changes to anything you stated. Full version history with rollback. Fill it from your resume, or import/export `master-profile.yaml`. |
| **Discover** | Searches public employer job boards (Greenhouse, Lever, Ashby), removes duplicates, flags likely scams, and scores each job against your profile with the reasons (skills matched and missing, location, pay, work authorization, seniority). |
| **Approvals** | Application packages wait here: a role-tailored resume, a cover letter built from your own achievements, answers to screening questions, and a short recruiter note. Edit, approve, save or reject. Nothing is invented: anything your profile can't answer is left for you. |
| **History** | Every application through its lifecycle (applied → screening → interview rounds → offer / rejected / withdrawn), with each change recorded. |
| **Resume Assistant, ATS, Cover Letters, Career Mentor, Market Insights** | On-demand AI help. Works with a configured LLM; falls back to clearly labelled rule-based output without one. |
| **Admin, Analytics** | Live counts for administrators. |

Platform rules are documented in [`docs/platform-compliance.md`](docs/platform-compliance.md):
LinkedIn, Indeed, Naukri and similar sites are draft-only (JobGenie writes, you paste and apply).

## Architecture

```
Browser (React)  ──►  API Gateway :8080  ──►  user-service      ──► PostgreSQL
  Firebase sign-in      verifies the            job-service           (one database
                        Firebase token,         resume-service         per service)
                        forwards a signed       notification-service
                        identity                      │
                                                      ▼
                                               AI service (FastAPI) ──► LLM (optional)
                                                                    ──► job boards / Adzuna
                                               Redis (cache)  ·  Eureka (discovery)
```

| Component | Path | Tech | Port |
|---|---|---|---|
| Frontend | `JobGenie-Frontend/` | React 18, Vite, TypeScript, Tailwind | 3000 |
| API Gateway | `JobGenie-Backend/api-gateway` | Spring Cloud Gateway | 8080 |
| User service (accounts, profile) | `JobGenie-Backend/user-service` | Spring Boot 2.7, JPA | 8081 |
| Job service (jobs, applications, approvals) | `JobGenie-Backend/job-service` | Spring Boot 2.7, JPA | 8082 |
| Resume service | `JobGenie-Backend/resume-service` | Spring Boot 2.7, PDFBox, POI | 8083 |
| Notification service | `JobGenie-Backend/notification-service` | Spring Boot 2.7 | 8084 |
| Service discovery | `JobGenie-Backend/eureka-server` | Eureka | 8761 |
| AI service | `JobGenie-AI/` | Python 3.11, FastAPI, CrewAI | 8000 |
| Data | `docker-compose.yml`, `sql/` | PostgreSQL 15, Redis 7 | 5432, 6379 |

Only the frontend (3000) and gateway (8080) are exposed beyond this machine; everything else is
bound to `127.0.0.1`. More detail: [`docs/architecture.md`](docs/architecture.md).

## Getting started

**Prerequisites:** Docker Desktop (give it 6 GB of memory or more), Git, and Bash or PowerShell.

```bash
git clone https://github.com/shivamfullstack25/JobGenie.git
cd JobGenie
cp .env.example .env
# Set INTERNAL_AUTH_SECRET in .env:
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then build and start (first build takes a while; images are built one at a time on purpose):

```bash
bash start.sh          # macOS / Linux / Git Bash
.\start.ps1            # Windows PowerShell
```

Open http://localhost:3000, sign in with Google or GitHub, and start on **My Profile**.

Later starts without rebuilding: `bash start.sh --no-build` or `.\start.ps1 -NoBuild`.
Stop everything: `docker compose down` (add `-v` to also delete the database).

### Configuration

All settings live in `.env`; [`.env.example`](.env.example) documents each one. The ones worth knowing:

| Variable | Purpose |
|---|---|
| `INTERNAL_AUTH_SECRET` | **Required.** Lets the services trust each other's requests. |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | Optional LLM keys, tried in that order. Without any, AI features use labelled rule-based fallbacks. |
| `JOB_BOARDS` | Employer boards to search, e.g. `greenhouse:stripe,lever:netflix`. You can also type them on the Discover page. |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Optional licensed job-listings API. |
| `AUTH_ENFORCEMENT` | `enforce` (default). `report-only` logs auth problems without blocking: use it if sign-in misbehaves. |
| `FIREBASE_PROJECT_ID` | Firebase project for sign-in; must match `JobGenie-Frontend/src/firebase.ts`. |

## Security model

- The gateway verifies the Firebase ID token on every request and forwards an HMAC-signed identity.
  Each service rejects requests without a valid signature and checks that you only touch your own data.
- No third-party credentials are stored anywhere.
- Résumé text, job descriptions and web content are treated as data, never as instructions.
- Automation kill switches default to safe (`GLOBAL_AUTOMATION_ENABLED=false`, `DRY_RUN=true`).

## Development

```bash
# Frontend (from JobGenie-Frontend/)
npm ci && npm run dev        # http://localhost:3000, proxies /api to the gateway
npm test                     # Vitest

# AI service (from JobGenie-AI/, Python 3.11)
pip install -r requirements-dev.txt && python -m pytest tests -q

# Backend (from JobGenie-Backend/, Java 17 + Maven, or via Docker:)
docker run --rm -v "$PWD":/w -w /w maven:3.9.6-eclipse-temurin-17 mvn -B test
mvn spotless:apply           # format Java (Google Java Format)
```

CI (`.github/workflows/ci.yml`) builds and tests all three on every push and pull request.
`scripts/smoke-auth.sh` checks authentication end to end against a running stack.

## Project status

Working: authentication, the candidate profile, resume tailoring, job discovery and matching,
application packages, the Approval Center and application tracking.

Planned: interview and offer records, notifications on status changes, moving scheduled searches
into the database, retiring the legacy job scrapers, and connecting an embeddings provider. See
[`docs/roadmap.md`](docs/roadmap.md) and the change notes in [`docs/migration-notes/`](docs/migration-notes/).
