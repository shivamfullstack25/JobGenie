"""Identity enforcement for the AI service.

The AI service never sees end-user tokens. The API gateway verifies those and forwards the caller's
identity as HMAC-signed ``X-Auth-*`` headers; the Spring services sign their own calls the same way
with role ``service``. This module is the Python counterpart of
``com.jobgenie.shared.security.InternalAuth`` / ``InternalAuthFilter`` and must stay
byte-compatible with it (same header names, same signed payload, same skew window).

Before this existed the service accepted any request from anywhere: it was published on a host
port with ``allow_origins=["*"]`` and no authentication at all.
"""

import hashlib
import hmac
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Dict, Optional

logger = logging.getLogger(__name__)

HEADER_USER_ID = "x-auth-user-id"
HEADER_ROLE = "x-auth-role"
HEADER_UID = "x-auth-uid"
HEADER_TIMESTAMP = "x-auth-ts"
HEADER_SIGNATURE = "x-auth-signature"

MAX_SKEW_SECONDS = 300

ROLE_SERVICE = "service"
ROLE_ADMIN = "admin"

MODE_OFF = "off"
MODE_REPORT_ONLY = "report-only"
MODE_ENFORCE = "enforce"

# Health for Docker/Eureka, and Prometheus scraping from inside the network.
PUBLIC_PATHS = {"/", "/health", "/metrics"}

# Only another JobGenie service may call these. End users reach the same features through
# job-service / resume-service, which apply ownership checks the AI service has no data to make
# (e.g. it cannot know who owns a schedule, or whom a notification may be sent to).
SERVICE_ONLY_PREFIXES = (
    "/api/schedule",
    "/api/scheduler",
    "/api/notifications/send",
    "/api/notifications/webhook",
    "/api/search-jobs",
    "/api/job-matches",
    "/api/enhanced-job-matches",
    "/ai/job/search",
)

# Paths whose capture group is a user id the caller must own.
USER_ID_PATHS = (
    re.compile(r"^/api/notifications/(?:history|stats)/([^/]+)$"),
    re.compile(r"^/ws/notifications/([^/]+)$"),
)


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str
    firebase_uid: str

    @property
    def is_service(self) -> bool:
        return self.role == ROLE_SERVICE

    @property
    def is_privileged(self) -> bool:
        return self.role in (ROLE_SERVICE, ROLE_ADMIN)

    def can_act_for(self, owner_user_id) -> bool:
        if self.is_privileged:
            return True
        return bool(self.user_id) and owner_user_id is not None and self.user_id == str(owner_user_id)


def parse_mode(value: Optional[str]) -> str:
    normalized = (value or MODE_ENFORCE).strip().lower().replace("_", "-")
    if normalized in ("", MODE_ENFORCE):
        return MODE_ENFORCE
    if normalized in (MODE_OFF, MODE_REPORT_ONLY):
        return normalized
    raise ValueError(f"AUTH_ENFORCEMENT must be one of off, report-only, enforce — got '{value}'")


def sign(secret: str, user_id: str, role: str, uid: str, timestamp: str) -> str:
    # Newline-delimited, identical to InternalAuth.sign() on the Java side.
    payload = f"{user_id}\n{role}\n{uid}\n{timestamp}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def service_headers(secret: str, now: Optional[int] = None) -> Dict[str, str]:
    """Headers for the AI service's own outbound calls to other JobGenie services."""
    ts = str(int(now if now is not None else time.time()))
    return {
        "X-Auth-User-Id": "0",
        "X-Auth-Role": ROLE_SERVICE,
        "X-Auth-Uid": "",
        "X-Auth-Ts": ts,
        "X-Auth-Signature": sign(secret, "0", ROLE_SERVICE, "", ts),
    }


def verify(secret: str, headers: Dict[str, str], now: Optional[int] = None) -> Optional[Principal]:
    """Return the principal the headers assert, or None if missing, forged or stale."""
    role = (headers.get(HEADER_ROLE) or "").strip()
    timestamp = (headers.get(HEADER_TIMESTAMP) or "").strip()
    signature = (headers.get(HEADER_SIGNATURE) or "").strip()
    if not secret or not role or not timestamp or not signature:
        return None
    try:
        ts = int(timestamp)
    except ValueError:
        return None
    current = int(now if now is not None else time.time())
    if abs(current - ts) > MAX_SKEW_SECONDS:
        return None
    user_id = headers.get(HEADER_USER_ID) or ""
    uid = headers.get(HEADER_UID) or ""
    expected = sign(secret, user_id, role, uid, timestamp)
    if not hmac.compare_digest(expected, signature):
        return None
    return Principal(user_id=user_id, role=role, firebase_uid=uid)


def ownership_violation(principal: Principal, path: str, query_string: str) -> Optional[str]:
    """Why this caller may not make this request, or None if they may."""
    if principal.is_service:
        return None
    if any(path == prefix or path.startswith(prefix + "/") for prefix in SERVICE_ONLY_PREFIXES):
        return "This endpoint is internal"
    if principal.role == ROLE_ADMIN:
        return None
    for pattern in USER_ID_PATHS:
        match = pattern.match(path)
        if match and not principal.can_act_for(match.group(1)):
            return "You can only access your own data"
    for pair in (query_string or "").split("&"):
        key, _, value = pair.partition("=")
        if key in ("user_id", "userId") and not principal.can_act_for(value):
            return "You can only access your own data"
    return None


class InternalAuthMiddleware:
    """Pure ASGI middleware so WebSocket handshakes are covered as well as HTTP requests
    (Starlette's BaseHTTPMiddleware never sees WebSocket scopes)."""

    def __init__(self, app, mode: Optional[str] = None, secret: Optional[str] = None):
        self.app = app
        self.mode = parse_mode(mode if mode is not None else os.getenv("AUTH_ENFORCEMENT"))
        self.secret = secret if secret is not None else os.getenv("INTERNAL_AUTH_SECRET", "")
        if self.mode != MODE_OFF and len(self.secret.strip()) < 32:
            # Fail closed: a service that cannot verify callers must not start as if it could.
            raise RuntimeError(
                "INTERNAL_AUTH_SECRET must be set to a random value of at least 32 characters "
                "(the same in every JobGenie service) unless AUTH_ENFORCEMENT=off."
            )
        logger.info("AI service authentication mode: %s", self.mode)

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket") or self.mode == MODE_OFF:
            return await self.app(scope, receive, send)

        path = scope.get("path", "")
        if scope["type"] == "http" and (scope.get("method") == "OPTIONS" or path in PUBLIC_PATHS):
            return await self.app(scope, receive, send)

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        principal = verify(self.secret, headers)
        denial = None
        if principal is not None:
            query = scope.get("query_string", b"").decode("latin-1")
            denial = ownership_violation(principal, path, query)

        if self.mode == MODE_REPORT_ONLY:
            if principal is None:
                logger.warning("[auth report-only] unauthenticated %s %s", scope.get("method", "WS"), path)
            elif denial:
                logger.warning("[auth report-only] would deny %s: %s", path, denial)
            return await self.app(scope, receive, send)

        if principal is None:
            return await self._reject(scope, send, 401, "UNAUTHENTICATED", "Sign in required")
        if denial:
            logger.warning("Denied %s for user %s: %s", path, principal.user_id, denial)
            return await self._reject(scope, send, 403, "FORBIDDEN", denial)

        scope.setdefault("state", {})["principal"] = principal
        return await self.app(scope, receive, send)

    @staticmethod
    async def _reject(scope, send, status: int, code: str, message: str):
        if scope["type"] == "websocket":
            # Closing before accept makes the server answer the handshake with HTTP 403.
            await send({"type": "websocket.close", "code": 4401 if status == 401 else 4403})
            return
        body = json.dumps({"error": code, "message": message}).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
