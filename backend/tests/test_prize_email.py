"""Tests for POST /games/{game_id}/prize/send."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.services.smtp_mailer import SmtpSendError
from tests.test_game_flow import _create_game, assert_ok


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _prize_url(game_id: int) -> str:
    return f"/games/{game_id}/prize/send"


def _valid_payload(**overrides: Any) -> dict:
    base = {
        "player_name": "Siya",
        "player_email": "winner@example.com",
        "placement": 1,
    }
    base.update(overrides)
    return base


@pytest.fixture
def smtp_live(monkeypatch: pytest.MonkeyPatch) -> None:
    """Configure settings so SMTP looks available without real network calls."""
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com", raising=False)
    monkeypatch.setattr(settings, "smtp_port", 587, raising=False)
    monkeypatch.setattr(settings, "smtp_username", "u@example.com", raising=False)
    monkeypatch.setattr(settings, "smtp_password", "secret", raising=False)
    monkeypatch.setattr(settings, "smtp_from", "noreply@example.com", raising=False)
    monkeypatch.setattr(settings, "smtp_use_tls", True, raising=False)
    monkeypatch.setattr(settings, "smtp_use_ssl", False, raising=False)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_prize_email_send_success(
    client: TestClient, smtp_live: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Valid request with SMTP configured sends one email and returns success."""
    game = _create_game(client)

    sent: list[dict[str, Any]] = []

    def fake_send(cfg, *, to_addr: str, subject: str, text_body: str, **kw: Any) -> None:
        sent.append({"to": to_addr, "subject": subject, "body": text_body})

    with patch("app.routes.prize.send_email", side_effect=fake_send):
        r = client.post(_prize_url(game["id"]), json=_valid_payload())

    assert_ok(r, 200)
    data = r.json()
    assert data["success"] is True
    assert data["error"] is None

    assert len(sent) == 1
    assert sent[0]["to"] == "winner@example.com"
    assert "🎉 You won Bingo!" in sent[0]["subject"]
    assert "Siya" in sent[0]["body"]
    assert "1st" in sent[0]["body"]
    assert game["title"] in sent[0]["body"]


def test_prize_email_placement_labels(
    client: TestClient, smtp_live: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Placements 1, 2, 3 produce the correct ordinal labels in the email body."""
    game = _create_game(client)

    for placement, expected_label in [(1, "1st"), (2, "2nd"), (3, "3rd")]:
        sent: list[dict] = []

        def fake_send(cfg, *, to_addr: str, subject: str, text_body: str, **kw: Any) -> None:
            sent.append({"body": text_body})

        with patch("app.routes.prize.send_email", side_effect=fake_send):
            r = client.post(
                _prize_url(game["id"]),
                json=_valid_payload(placement=placement),
            )

        assert_ok(r, 200)
        assert r.json()["success"] is True
        assert expected_label in sent[0]["body"], (
            f"Expected '{expected_label}' in body for placement={placement}"
        )


def test_prize_email_smtp_failure_returns_success_false(
    client: TestClient, smtp_live: None
) -> None:
    """When SMTP raises SmtpSendError, the endpoint returns success=false (not 500)."""
    game = _create_game(client)

    with patch(
        "app.routes.prize.send_email",
        side_effect=SmtpSendError("Connection refused"),
    ):
        r = client.post(_prize_url(game["id"]), json=_valid_payload())

    assert_ok(r, 200)
    data = r.json()
    assert data["success"] is False
    assert data["error"] == "Email could not be sent"


def test_prize_email_smtp_not_configured_returns_success_false(
    client: TestClient,
) -> None:
    """Without SMTP configured, send_email raises SmtpSendError → success=false."""
    game = _create_game(client)
    # conftest blanks SMTP vars, so is_smtp_configured() returns False and
    # send_email() raises SmtpSendError immediately — no monkeypatching needed.
    r = client.post(_prize_url(game["id"]), json=_valid_payload())
    assert_ok(r, 200)
    data = r.json()
    assert data["success"] is False
    assert data["error"] == "Email could not be sent"


def test_prize_email_invalid_email_format_returns_400(client: TestClient) -> None:
    """Malformed email address is rejected before SMTP is attempted."""
    game = _create_game(client)
    for bad_email in ["not-an-email", "missing@", "@nodomain.com", "spaces @x.com"]:
        r = client.post(
            _prize_url(game["id"]),
            json=_valid_payload(player_email=bad_email),
        )
        assert r.status_code == 422, f"Expected 422 for {bad_email!r}, got {r.status_code}"


def test_prize_email_game_not_found_returns_404(client: TestClient) -> None:
    """Non-existent game ID returns 404."""
    r = client.post(_prize_url(999_999), json=_valid_payload())
    assert r.status_code == 404


def test_prize_email_missing_player_name_returns_422(client: TestClient) -> None:
    """Blank player_name is rejected by the schema validator."""
    game = _create_game(client)
    r = client.post(_prize_url(game["id"]), json=_valid_payload(player_name="   "))
    assert r.status_code == 422


def test_prize_email_body_never_logged(
    client: TestClient, smtp_live: None, caplog: pytest.LogCaptureFixture
) -> None:
    """The recipient address must not appear in any log output from the route."""
    game = _create_game(client)

    with patch("app.routes.prize.send_email", return_value=None):
        with caplog.at_level("DEBUG", logger="app.routes.prize"):
            client.post(_prize_url(game["id"]), json=_valid_payload())

    prize_logs = " ".join(caplog.messages)
    assert "winner@example.com" not in prize_logs, (
        "Email address was leaked into prize route log output"
    )
