# Phase 1A migration notes — Safety net

Branch: `overhaul/phase-1a-safety-net`. Plan reference: `MIGRATION_PLAN.md` §Phase 1A.

## What changed for anyone running the stack

1. **`.env` needs `INTERNAL_AUTH_SECRET`** (32+ random characters). Services refuse to start without it. A value was generated into the local `.env`; other environments must set their own:
   `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
2. **Every API call needs a signed-in user.** The frontend now sends the Firebase ID token automatically. Scripts and `curl` against `:8080` need `-H "Authorization: Bearer <id token>"`. Public: `/actuator/health`, `/api/health`, `/api/auth/verify`, `/api/auth/refresh`, Swagger.
3. **Internal ports are loopback-only.** Postgres, Redis, Eureka, the four services and the AI service are bound to `127.0.0.1`. They still answer on `localhost` from this machine, but service APIs return 401 without a signed identity (health endpoints stay open).
4. **Frontend tests are `npm test` (Vitest).** Jest was listed but never configured.
5. **Backend and AI tests run in containers** (no host Maven or Python 3.11): commands are in `CLAUDE.md`, constraint 9.

## Rollback

| Symptom | Action |
|---|---|
| Users locked out, or a legitimate call returns 401/403 | Set `AUTH_ENFORCEMENT=report-only` in `.env`, `docker compose up -d`. Everything is still verified and logged (`[auth report-only] …`) and nothing is blocked. Fix forward from the log. |
| Need the exact pre-change behaviour | `AUTH_ENFORCEMENT=off`. |
| Sign-in fails with "ID token … invalid" on a machine with no internet access to `googleapis.com` | The gateway and user-service fetch Google's public keys. For offline development only: `AUTH_ENFORCEMENT=off` plus `JOBGENIE_AUTH_INSECURE_LOCAL_JWT=true` on user-service. Never in a deployed environment. |
| Code rollback | `git revert a223342` (auth) — the baseline commit `ce8a25a` is independent. |

No database schema or data was changed in this phase, so there is nothing to migrate back.

## Behaviour changes worth knowing

- **Login no longer accepts unverifiable tokens.** Previously a missing service-account file, or any verification error, made user-service trust the token's payload unsigned.
- **`isEmailVerified` now updates on sign-in.** It used to be written once at account creation, so users who verified later stayed blocked from "apply".
- **LinkedIn "Connect" is gone** (`/api/auth/linkedin*` → 410, button removed). The LinkedIn URL field on the profile remains.
- **Direct browser access to some AI routes is closed.** `/api/schedule/**`, `/api/notifications/send`, `/api/notifications/webhook` are service-only; the UI already reaches schedules through `/api/schedules` and `/api/automation` (job-service).
- **Schedule ownership** is derived from the id format `schedule_<userId>_<ts>`. Schedules created before this change under the user id `default` are no longer reachable by ordinary users.
- **Seven gateway routes to deleted auto-apply endpoints were removed.**

## Known gaps left open in 1A (carried forward)

| Gap | Why deferred | Where it lands |
|---|---|---|
| Flyway baseline (`ddl-auto=update` still in use) | Needs a schema dump from the live databases and a soak with `validate`; kept out of the same change as auth so a startup failure has one possible cause | Next 1A step |
| Characterization tests for upload → match → save → apply | Need Testcontainers Postgres; harnesses exist now | Next 1A step |
| `LocationSearch.test.tsx` quarantined (16 cases, stale against the current component) | Never ran before; rewriting UI tests is not auth work | 1A.2 |
| AI `NotificationService` webhook fallback posts to the gateway and will now get 401 | The route looped back to the AI service and did nothing useful | Phase 4 (notifications move to notification-service) |
| Rate limiting still keyed on client `X-Forwarded-For` | Separate fix (audit S9) | 1A follow-up |
| Listing schedules without `userId` reads the shared `default` bucket; `/api/schedule/stats` returns global counts | Schedules are replaced wholesale in Phase 2 | Phase 2 |
| Java sources added here are not Spotless-formatted | CI runs with `-Dspotless.skip=true`; a repo-wide `spotless:apply` would bury this diff | Housekeeping commit |
| CAPTCHA-solver and auto-apply keys still present in the local `.env` | Left for the owner to delete and rotate; nothing reads them | Owner |
