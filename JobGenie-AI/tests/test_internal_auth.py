"""Tests for the AI service's identity enforcement (app/core/internal_auth.py).

Run from JobGenie-AI/:  python -m pytest tests -q
Only needs starlette + httpx + pytest; no LLM, Redis or network.
"""

import time

import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route, WebSocketRoute
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core import internal_auth
from app.core.internal_auth import InternalAuthMiddleware, sign

SECRET = "test-secret-test-secret-test-secret-0123"


def signed(user_id="7", role="user", uid="uid-7", ts=None, secret=SECRET):
    ts = str(int(ts if ts is not None else time.time()))
    return {
        "X-Auth-User-Id": user_id,
        "X-Auth-Role": role,
        "X-Auth-Uid": uid,
        "X-Auth-Ts": ts,
        "X-Auth-Signature": sign(secret, user_id, role, uid, ts),
    }


async def echo(request):
    principal = request.scope.get("state", {}).get("principal")
    return JSONResponse({"user": principal.user_id if principal else None})


async def socket(websocket):
    await websocket.accept()
    await websocket.send_text("ok")
    await websocket.close()


def make_client(mode="enforce"):
    paths = [
        "/health",
        "/api/chat",
        "/api/notifications/history/{user_id}",
        "/api/notifications/send",
        "/api/schedule/job-search",
        "/api/schedule/{schedule_id}/pause",
        "/api/search-jobs",
        "/api/schedule-interview",
    ]
    routes = [Route(p, echo, methods=["GET", "POST"]) for p in paths]
    routes.append(WebSocketRoute("/ws/notifications/{user_id}", socket))
    app = Starlette(routes=routes)
    return TestClient(InternalAuthMiddleware(app, mode=mode, secret=SECRET))


def test_signature_matches_the_java_implementation():
    # Fixed vector: InternalAuth.sign("k", "7", "user", "uid-7", "1700000000") on the Java side
    # is HMAC-SHA256 over "7\nuser\nuid-7\n1700000000", lower-case hex.
    import hashlib
    import hmac as hmac_lib

    expected = hmac_lib.new(b"k", b"7\nuser\nuid-7\n1700000000", hashlib.sha256).hexdigest()
    assert sign("k", "7", "user", "uid-7", "1700000000") == expected


def test_health_is_public():
    assert make_client().get("/health").status_code == 200


def test_request_without_identity_is_rejected():
    response = make_client().post("/api/chat")
    assert response.status_code == 401
    assert response.json()["error"] == "UNAUTHENTICATED"


def test_forged_headers_are_rejected():
    headers = signed()
    headers["X-Auth-Role"] = "service"  # escalate after signing
    assert make_client().post("/api/chat", headers=headers).status_code == 401

    wrong_key = signed(secret="another-secret-another-secret-another-0")
    assert make_client().post("/api/chat", headers=wrong_key).status_code == 401


def test_stale_signature_is_rejected():
    headers = signed(ts=time.time() - 600)
    assert make_client().post("/api/chat", headers=headers).status_code == 401


def test_signed_user_reaches_ordinary_endpoints():
    response = make_client().post("/api/chat", headers=signed())
    assert response.status_code == 200
    assert response.json() == {"user": "7"}


def test_user_cannot_read_another_users_notifications():
    client = make_client()
    assert client.get("/api/notifications/history/7", headers=signed()).status_code == 200
    assert client.get("/api/notifications/history/8", headers=signed()).status_code == 403
    assert client.post("/api/chat?user_id=8", headers=signed()).status_code == 403


@pytest.mark.parametrize(
    "path",
    [
        "/api/notifications/send",
        "/api/schedule/job-search",
        "/api/schedule/schedule_8_1/pause",
        "/api/search-jobs",
    ],
)
def test_internal_endpoints_reject_end_users_but_accept_services(path):
    client = make_client()
    assert client.post(path, headers=signed()).status_code == 403
    assert client.post(path, headers=signed(role="admin")).status_code == 403
    assert client.post(path, headers=signed(user_id="0", role="service", uid="")).status_code == 200


def test_service_only_prefix_does_not_swallow_similarly_named_paths():
    # "/api/schedule-interview" merely starts with the text "/api/schedule".
    assert make_client().post("/api/schedule-interview", headers=signed()).status_code == 200


def test_websocket_requires_a_signed_identity_for_that_user():
    client = make_client()
    with client.websocket_connect("/ws/notifications/7", headers=signed()) as ws:
        assert ws.receive_text() == "ok"
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/notifications/8", headers=signed()):
            pass
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/notifications/7"):
            pass


def test_report_only_never_blocks():
    client = make_client(mode="report-only")
    assert client.post("/api/chat").status_code == 200
    assert client.get("/api/notifications/history/8", headers=signed()).status_code == 200


def test_enforcing_without_a_secret_refuses_to_start():
    with pytest.raises(RuntimeError):
        InternalAuthMiddleware(Starlette(), mode="enforce", secret="")
    InternalAuthMiddleware(Starlette(), mode="off", secret="")


def test_service_headers_round_trip():
    headers = {k.lower(): v for k, v in internal_auth.service_headers(SECRET).items()}
    principal = internal_auth.verify(SECRET, headers)
    assert principal is not None and principal.is_service
