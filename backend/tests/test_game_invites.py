"""Tests for demo Teams-style invite batch (preview vs SMTP)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_game_flow import (
    DEFAULT_HOST_PIN,
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
    assert data["room_code"] == game["game_code"]
    assert data["game_id"] == str(game["id"])
    assert "Virtual Bingo Invite:" in data["subject"]
    assert "Join the Teams meeting:" in data["body_preview"]
    assert "join?code=" in data["bingo_join_url"]
    assert len(data["recipients"]) == 2
    assert {x["email"] for x in data["recipients"]} == {"alex@example.com", "b@example.com"}
    assert all(x["invite_status"] == "PREVIEW" for x in data["recipients"])


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
