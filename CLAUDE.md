# Working on JobGenie

Read `README.md` first, then `docs/architecture.md` for how the pieces fit. Product scope and
remaining work: `docs/roadmap.md`. Platform rules: `docs/platform-compliance.md`.

## Product rules (do not change without the owner's explicit decision)

1. **JobGenie never holds the pen.** No auto-apply, no browser automation that submits, no stored
   third-party passwords, no CAPTCHA/MFA/anti-bot circumvention. "Apply" = open the employer's page
   + the user marks it applied. An application only reaches `SUBMITTED` by a user action.
2. **No invented facts.** Profile changes from software are `INFERRED`/`AI_GENERATED` or become
   proposals; only the user creates `FACT`/`USER_APPROVED`. Generated resumes, cover letters and
   answers may only select/rephrase profile content and are re-checked; unknowns are
   `USER_INPUT_REQUIRED`.
3. **Only permitted sources.** Job search uses public ATS feeds (Greenhouse, Lever, Ashby) and
   licensed APIs (Adzuna). LinkedIn/Indeed/Naukri/Instahyre/Cutshort are draft-only
   (`JobGenie-AI/app/jobs/automation.py`). Unknown platforms default to blocked.
4. **Honest labels.** Anything heuristic or sample data is labelled as such in the UI.

## Engineering rules

- **Identity comes from the gateway, never from the request.** `GatewayAuthFilter` verifies the
  Firebase token and forwards HMAC-signed `X-Auth-*` headers; services verify them
  (`shared/.../security`, `JobGenie-AI/app/core/internal_auth.py`). A `userId` parameter must equal
  the caller unless admin/service. For ids in a JSON body or other keys (resume, schedule,
  approval), check ownership in the controller/service. New public or service-only paths go in the
  path lists of those filters.
- The gateway is reactive (WebFlux): no servlet-only config there; build `RestTemplate` directly.
- Spring Data repositories must be top-level interfaces (nested ones are not detected).
- Keep the microservice boundaries; the AI service holds no durable data.
- Optional dependencies (LLM providers) must degrade gracefully, never crash a service.
- Don't add code, dependencies or files that nothing uses.

## Verify a change

- Backend: `docker run --rm -v "$PWD/JobGenie-Backend":/w -v jobgenie-m2:/root/.m2 -w /w maven:3.9.6-eclipse-temurin-17 mvn -B test`
- AI: `cd JobGenie-AI && pip install -r requirements-dev.txt && python -m pytest tests -q` (Python 3.11)
- Frontend: `cd JobGenie-Frontend && npm test && npm run build`
- Live: `bash start.sh`, then `bash scripts/smoke-auth.sh`, then sign in and use My Profile → Discover → Approvals → History.
- Docker Desktop on the owner's machine has ~4 GB: build images one at a time (`start.sh` does).
