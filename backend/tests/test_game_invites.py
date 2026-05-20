"""Tests for demo Teams-style invite batch (preview vs SMTP)."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.services import game_invites as invites_module
from app.services.smtp_mailer import SmtpSendError
from tests.test_game_flow import (
    DEFAULT_HOST_PIN,  # noqa: F401 — re-exported for use by other invite tests
    assert_ok,
    create_game_payload,
    host_headers,
)


def test_invites_preview_stores_rows_and_returns_body(client: TestClient) -> None:
    """Without SMTP, invites are PREVIEW and join URL uses FRONTEND_BASE_URL."""
    r = client.post("/games", json=create_game_payload())
    assert_ok(r, 201)
    game = r.json()

    res = client.post(
        f"/games/{game['id']}/invites",
        headers=host_headers(),
        json={
            "participant_emails": ["Alex@Example.com", "alex@example.com", "b@example.com"],
            "teams_join_url": "https://teams.microsoft.com/l/meetup-join/test",
            "scheduled_start_time": "2026-06-01T15:00:00Z",
        },
    )
    assert_ok(res, 200)
    data = res.json()
    assert data["mode"] == "preview"
    assert data["smtp_configured"] is False
    assert data["sent_count"] == 0
    assert data["failed_count"] == 0
    assert data["room_code"] == game["game_code"]
    assert data["game_id"] == str(game["id"])
    assert "Virtual Bingo Invite:" in data["subject"]
    assert "Join the Teams meeting:" in data["body_preview"]
    assert "join?code=" in data["bingo_join_url"]
    assert len(data["recipients"]) == 2
    assert {x["email"] for x in data["recipients"]} == {"alex@example.com", "b@example.com"}
    assert all(x["invite_status"] == "PREVIEW" for x in data["recipients"])
    assert all(x["error_message"] is None for x in data["recipients"])
    assert all(x["sent_at"] is None for x in data["recipients"])


@pytest.fixture
def smtp_live(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force SMTP to look configured without making real network calls."""
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com", raising=False)
    monkeypatch.setattr(settings, "smtp_port", 587, raising=False)
    monkeypatch.setattr(settings, "smtp_username", "u@example.com", raising=False)
    monkeypatch.setattr(settings, "smtp_password", "x", raising=False)
    monkeypatch.setattr(settings, "smtp_from", "noreply@example.com", raising=False)
    monkeypatch.setattr(settings, "smtp_use_tls", True, raising=False)
    monkeypatch.setattr(settings, "smtp_use_ssl", False, raising=False)


def test_invites_smtp_send_all_success(
    client: TestClient, smtp_live: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, Any]] = []

    def fake_send(_settings: Any, **kwargs: Any) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(invites_module, "send_email", fake_send)

    r = client.post("/games", json=create_game_payload())
    assert_ok(r, 201)
    game = r.json()

    res = client.post(
        f"/games/{game['id']}/invites",
        headers=host_headers(),
        json={
            "participant_emails": ["a@example.com", "b@example.com"],
            "teams_join_url": "https://teams.microsoft.com/l/meetup-join/x",
        },
    )
    assert_ok(res, 200)
    data = res.json()
    assert data["mode"] == "sent"
    assert data["smtp_configured"] is True
    assert data["smtp_host"] == "smtp.example.com"
    assert data["sent_count"] == 2
    assert data["failed_count"] == 0
    assert all(x["invite_status"] == "SENT" for x in data["recipients"])
    assert all(x["error_message"] is None for x in data["recipients"])
    assert all(x["sent_at"] is not None for x in data["recipients"])
    assert len(calls) == 2
    # Confirm the mailer received both HTML and plain text bodies.
    assert calls[0].get("text_body") and calls[0].get("html_body")


def test_invites_smtp_partial_failure_continues_batch(
    client: TestClient, smtp_live: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_send(_settings: Any, **kwargs: Any) -> None:
        to_addr = str(kwargs["to_addr"])
        if to_addr.startswith("bad@"):
            raise SmtpSendError(
                f"Recipient address rejected by SMTP server: {to_addr}",
                recipient=to_addr,
            )

    monkeypatch.setattr(invites_module, "send_email", fake_send)

    r = client.post("/games", json=create_game_payload())
    assert_ok(r, 201)
    game = r.json()

    res = client.post(
        f"/games/{game['id']}/invites",
        headers=host_headers(),
        json={
            "participant_emails": ["good@example.com", "bad@example.com"],
            "teams_join_url": "https://teams.microsoft.com/l/meetup-join/x",
        },
    )
    assert_ok(res, 200)
    data = res.json()
    assert data["mode"] == "sent"
    assert data["sent_count"] == 1
    assert data["failed_count"] == 1
    by_email = {row["email"]: row for row in data["recipients"]}
    assert by_email["good@example.com"]["invite_status"] == "SENT"
    assert by_email["good@example.com"]["sent_at"] is not None
    assert by_email["bad@example.com"]["invite_status"] == "FAILED"
    assert "rejected" in (by_email["bad@example.com"]["error_message"] or "").lower()
    assert by_email["bad@example.com"]["sent_at"] is None


def test_invites_smtp_all_failed_records_errors(
    client: TestClient, smtp_live: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_send(*_args: Any, **_kwargs: Any) -> None:
        raise SmtpSendError(
            "SMTP authentication failed. Verify SMTP_USERNAME and SMTP_PASSWORD."
        )

    monkeypatch.setattr(invites_module, "send_email", fake_send)

    r = client.post("/games", json=create_game_payload())
    assert_ok(r, 201)
    game = r.json()

    res = client.post(
        f"/games/{game['id']}/invites",
        headers=host_headers(),
        json={
            "participant_emails": ["a@example.com"],
            "teams_join_url": "https://teams.microsoft.com/l/meetup-join/x",
        },
    )
    assert_ok(res, 200)
    data = res.json()
    assert data["mode"] == "sent"
    assert data["sent_count"] == 0
    assert data["failed_count"] == 1
    only = data["recipients"][0]
    assert only["invite_status"] == "FAILED"
    assert "authentication failed" in (only["error_message"] or "").lower()


def test_invites_require_host_pin(client: TestClient) -> None:
    r = client.post("/games", json=create_game_payload())
    assert_ok(r, 201)
    game = r.json()
    res = client.post(
        f"/games/{game['id']}/invites",
        json={
            "participant_emails": ["a@example.com"],
            "teams_join_url": "https://teams.microsoft.com/l/meetup-join/x",
        },
    )
    assert res.status_code == 401


def test_invites_reject_non_https_teams_url(client: TestClient) -> None:
    r = client.post("/games", json=create_game_payload())
    assert_ok(r, 201)
    game = r.json()
    res = client.post(
        f"/games/{game['id']}/invites",
        headers=host_headers(),
        json={
            "participant_emails": ["a@example.com"],
            "teams_join_url": "http://teams.microsoft.com/l/meetup-join/x",
        },
    )
    assert res.status_code == 422


def test_invites_reject_invalid_email(client: TestClient) -> None:
    r = client.post("/games", json=create_game_payload())
    assert_ok(r, 201)
    game = r.json()
    res = client.post(
        f"/games/{game['id']}/invites",
        headers=host_headers(),
        json={
            "participant_emails": ["not-an-email"],
            "teams_join_url": "https://teams.microsoft.com/l/meetup-join/x",
        },
    )
    assert res.status_code == 422
    assert "Invalid email" in res.json()["detail"]


def test_invites_wrong_pin_forbidden(client: TestClient) -> None:
    r = client.post("/games", json=create_game_payload())
    assert_ok(r, 201)
    game = r.json()
    res = client.post(
        f"/games/{game['id']}/invites",
        headers={"X-Host-Pin": "wrong-pin-9999"},
        json={
            "participant_emails": ["a@example.com"],
            "teams_join_url": "https://teams.microsoft.com/l/meetup-join/x",
        },
    )
    assert res.status_code == 403
