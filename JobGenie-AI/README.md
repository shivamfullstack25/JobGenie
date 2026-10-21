# JobGenie AI service

FastAPI service for resume analysis, job intelligence and application packages. It holds no
durable data: the Spring services own all records and call this service with signed requests
(see `app/core/internal_auth.py`).

| Area | Code | Endpoints |
|---|---|---|
| Resume parse / ATS / cover letter / career chat | `app/services/crew_ai_service.py` (LLM, with rule-based fallback) | `/ai/resume/analyze`, `/api/resume-insights`, `/api/ats-resume`, `/api/generate-cover-letter`, `/api/chat` |
| Role-specific resumes (cannot invent) | `app/agents/resume_agent.py` | `/ai/v2/resume/*` |
| Job discovery, dedup, safety, matching, platform policy | `app/jobs/` | `/ai/v2/jobs/*`, `/ai/v2/platforms/policies` |
| Application packages and decisions | `app/applications/` | `/ai/v2/applications/package` |
| Legacy search (Adzuna + cached scrapers) | `app/services/job_aggregator.py` | `/api/search-jobs`, `/api/job-matches`, `/api/job-aggregator/*` |
| Scheduled searches, notifications | `app/services/scheduler_agent.py`, `notification_service.py` | `/api/schedule/*`, `/api/notifications/*` |

LLM provider order with `LLM_PROVIDER=auto`: Groq → Gemini → OpenAI → Ollama → rules only.

Tests: `pip install -r requirements-dev.txt && python -m pytest tests -q`
