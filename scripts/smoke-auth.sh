#!/usr/bin/env bash
# Live smoke test for identity enforcement. Run from the repo root with the stack up:
#   bash scripts/smoke-auth.sh
#
# It cannot obtain a real Firebase ID token (that needs an interactive Google/GitHub sign-in), so
# the "valid token through the gateway" path is covered by GatewayAuthFilterTest, not here. What
# this does prove against the running containers:
#   - the gateway rejects missing and forged tokens, and login rejects a forged token
#   - every service and the AI service reject unsigned and badly signed requests
#   - a correctly signed user can reach their own data and not another user's
#   - service-to-service calls (job -> resume, job -> user, user -> resume) are signed correctly
set -uo pipefail
cd "$(dirname "$0")/.."

SECRET=$(grep -E '^INTERNAL_AUTH_SECRET=' .env | head -1 | cut -d= -f2-)
[ -n "$SECRET" ] || { echo "INTERNAL_AUTH_SECRET missing from .env"; exit 2; }

GW=http://localhost:8080 USERS=http://localhost:8081 JOBS=http://localhost:8082
RESUMES=http://localhost:8083 AI=http://localhost:8000

pass=0; fail=0
# sig <userId> <role> <uid>  -> prints curl -H args for a correctly signed identity
sig() {
  python - "$SECRET" "$1" "$2" "$3" <<'PY'
import hashlib, hmac, sys, time
secret, user, role, uid = sys.argv[1:5]
ts = str(int(time.time()))
s = hmac.new(secret.encode(), f"{user}\n{role}\n{uid}\n{ts}".encode(), hashlib.sha256).hexdigest()
print(f"-H X-Auth-User-Id:{user} -H X-Auth-Role:{role} -H X-Auth-Uid:{uid} -H X-Auth-Ts:{ts} -H X-Auth-Signature:{s}")
PY
}
# check <description> <expected status (regex)> <curl args...>
check() {
  local desc="$1" want="$2"; shift 2
  local got
  got=$(curl -s -o /dev/null -m 60 -w '%{http_code}' "$@")
  if [[ "$got" =~ ^($want)$ ]]; then pass=$((pass+1)); printf '  ok    %-74s %s\n' "$desc" "$got"
  else fail=$((fail+1)); printf '  FAIL  %-74s got %s, want %s\n' "$desc" "$got" "$want"; fi
}

# Two real user ids to act as "me" and "someone else".
read -r ME OTHER < <(docker compose exec -T postgres psql -U jobgenie_user -d jobgenie_users -At \
  -c "select string_agg(id::text, ' ') from (select id from users order by id limit 2) t" 2>/dev/null)
ME=${ME:-1}; OTHER=${OTHER:-999999}
[ "$ME" = "$OTHER" ] && OTHER=999999
echo "acting as user $ME; other user $OTHER"

FORGED="eyJhbGciOiJSUzI1NiJ9.$(printf '{"sub":"x","user_id":"x","email":"victim@example.com","email_verified":true}' | base64 | tr -d '=\n' | tr '+/' '-_').AAAA"

echo "== gateway"
check "health is public"                                   200 "$GW/actuator/health"
check "no token -> 401"                                    401 "$GW/api/jobs/saved?userId=$ME"
check "forged token -> 401"                                401 -H "Authorization: Bearer $FORGED" "$GW/api/jobs/saved?userId=$ME"
check "spoofed X-User-Id without token -> 401"             401 -H "X-User-Id: anything" "$GW/api/users"
check "spoofed X-Auth-* without token -> 401"              401 -H "X-Auth-User-Id: $ME" -H "X-Auth-Role: admin" "$GW/api/users/$ME"
check "login with forged token -> 401"                     401 -X POST -H 'Content-Type: application/json' -d "{\"idToken\":\"$FORGED\"}" "$GW/api/auth/verify"
check "admin area without token -> 401"                    401 "$GW/api/admin/dashboard"
check "delete-account without token -> 401"                401 -X DELETE "$GW/api/users/me?userId=$OTHER"
check "disabled LinkedIn OAuth without token -> 401"       401 "$GW/api/auth/linkedin?userId=$ME"

echo "== services, called directly (bypassing the gateway)"
check "user-service: unsigned -> 401"                      401 "$USERS/api/users/$ME"
check "user-service: bad signature -> 401"                 401 -H "X-Auth-User-Id: $ME" -H "X-Auth-Role: admin" -H "X-Auth-Ts: $(date +%s)" -H "X-Auth-Signature: deadbeef" "$USERS/api/users/$ME"
check "user-service: health stays public"                  200 "$USERS/actuator/health"
check "user-service: own record"                           200 $(sig "$ME" user uid) "$USERS/api/users/$ME"
check "user-service: someone else's record -> 403"         403 $(sig "$ME" user uid) "$USERS/api/users/$OTHER"
check "user-service: delete someone else -> 403"           403 -X DELETE $(sig "$ME" user uid) "$USERS/api/users/me?userId=$OTHER"
check "user-service: list users as non-admin -> 403"       403 $(sig "$ME" user uid) -H "X-User-Id: uid" "$USERS/api/users"
check "user-service: forge audit entry as user -> 403"     403 -X POST -H 'Content-Type: application/json' -d '{"userId":"1","action":"x"}' $(sig "$ME" user uid) "$USERS/api/users/audit-log"
check "resume-service: unsigned -> 401"                    401 "$RESUMES/api/resumes/user/$ME"
check "resume-service: own resumes"                        200 $(sig "$ME" user uid) "$RESUMES/api/resumes/user/$ME"
check "resume-service: someone else's resumes -> 403"      403 $(sig "$ME" user uid) "$RESUMES/api/resumes/user/$OTHER"
check "job-service: unsigned -> 401"                       401 "$JOBS/api/jobs/saved?userId=$ME"
check "job-service: own saved jobs"                        200 $(sig "$ME" user uid) "$JOBS/api/jobs/saved?userId=$ME"
check "job-service: someone else's saved jobs -> 403"      403 $(sig "$ME" user uid) "$JOBS/api/jobs/saved?userId=$OTHER"
check "job-service: save job into another account -> 403"  403 -X POST -H 'Content-Type: application/json' -d "{\"userId\":$OTHER,\"jobId\":\"smoke\"}" $(sig "$ME" user uid) "$JOBS/api/jobs/saved"
check "job-service: pause another user's schedule -> 403"  403 -X POST $(sig "$ME" user uid) "$JOBS/api/schedules/schedule_${OTHER}_1/toggle"

echo "== AI service, called directly"
check "health is public"                                   200 "$AI/health"
check "unsigned -> 401"                                    401 -X POST -H 'Content-Type: application/json' -d '{"question":"hi"}' "$AI/api/chat"
check "internal endpoint as end user -> 403"               403 -X POST -H 'Content-Type: application/json' -d '{}' $(sig "$ME" user uid) "$AI/api/notifications/send"
check "another user's notifications -> 403"                403 $(sig "$ME" user uid) "$AI/api/notifications/history/$OTHER"

echo "== service-to-service signing (a 401/403 here means a signed hop is broken)"
check "job-service -> resume-service + AI (matches)"       '200|500' $(sig "$ME" user uid) "$JOBS/api/jobs/matches?userId=$ME"
check "job-service -> user-service (apply gate)"           '200|403|500' -X POST $(sig "$ME" user uid) "$JOBS/api/jobs/apply?jobId=smoke-nonexistent-$RANDOM&userId=$ME"
check "user-service export (own data)"                     200 $(sig "$ME" user uid) "$USERS/api/users/me/export?userId=$ME"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]
