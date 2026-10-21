# Phase 3 + 4 migration notes — application packages, approval, lifecycle

Additive. The one behavioural change to existing code is how application status changes are validated (below).

## What exists

| Piece | Where | Entry point |
|---|---|---|
| Answer policy (`USER_INPUT_REQUIRED`, per-answer source/confidence/approval) | `JobGenie-AI/app/applications/answers.py` | via package |
| Application decision agent (6 outcomes, never score-only) | `.../applications/decision.py` | via package |
| Application package (resume + cover letter + answers + recruiter message + checks) | `.../applications/package.py` | `POST /ai/v2/applications/package` |
| Approval queue (PENDING / APPROVED / SAVED / REJECTED, edits, ownership) | `job-service/.../approval/` | `/api/approvals`, page **Approvals** |
| Lifecycle state machine + append-only transition log | `job-service/.../tracking/` | `PATCH /api/jobs/applications/{id}/status`, `GET /api/approvals/applications/{id}/history` |

## New tables (Hibernate `ddl-auto=update`, jobgenie_jobs)

`approval_requests`, `application_transitions`. Rollback: drop both; nothing else reads them except `ApplicationTracker`/`ApprovalService`.

## The flow

Discover → **Prepare application** → package built from your profile → queued in **Approvals** → you review/edit/approve → application is created `READY_TO_SUBMIT` → you open the posting and apply on the employer's site → click **I've applied** → `SUBMITTED` → you track it on History.

JobGenie performs no submission at any step. `SUBMITTED` is reachable only by a user action, and a test pins that `PREPARING`/`AWAITING_APPROVAL` cannot jump to it.

## Guarantees and their tests

| Guarantee | Test |
|---|---|
| Unknown answers are the literal `USER_INPUT_REQUIRED`; per-technology experience is never answered with total years; open-ended questions get evidence, not an essay | `test_applications.py` |
| Salary, work authorization, sponsorship, relocation and notice period always require approval | same |
| Cover letter uses the candidate's own achievements verbatim; an LLM rewrite that adds a number/skill is discarded | same |
| Decision never rests on score alone; scams, ineligible, duplicate, stale and missing-info cases are caught first | same |
| `APPLY_AUTOMATICALLY` is unreachable today even with every switch on, and only becomes reachable if a platform policy is changed *and* operator switches allow it | `test_automatic_application_is_unreachable_today…` |
| Packages the agent advises against / cannot finish are not queued; a second package replaces the pending one; double-approve creates one application; other users get 403 | `ApprovalServiceTest` |
| Every state change is checked against the machine and logged in the same transaction; illegal jumps refused with nothing written | `ApplicationTrackerTest` |

## Changed behaviour

- `PATCH /api/jobs/applications/{id}/status` now accepts the 15 lifecycle states and the old `APPLIED`/`INTERVIEWING` (aliases of `SUBMITTED`/`INTERVIEW`), enforces the transition rules (`409 INVALID_TRANSITION` for an illegal jump), and logs each change. Previously any of five statuses could be set from any other. Stored values for the two aliases become `SUBMITTED`/`INTERVIEW` after an update; existing rows are untouched.
- Applications logged through "Apply on site & log" get an initial transition record.
- The History page lists the full lifecycle and treats old rows' `APPLIED`/`INTERVIEWING` as `SUBMITTED`/`INTERVIEW`.
- Experience years are now computed to the month (was by year): back-to-back roles no longer lose a year, `Present` means today.

## Not done

- Application form *reading* and any browser assistance (Phase 6) — deliberately not started; needs explicit re-approval.
- Interview and Offer records (`interviews`, `offers` tables), notifications on transitions (Phase 4 remainder).
- Notifications are still the old split between the AI service and notification-service.
- Not yet verified against the live stack; see the status in `../roadmap.md`.
