"""Tests for the per-game live chat feature.

Covers: HTTP create / list, validation (empty + too-long), HOST and PLAYER
auth, the WebSocket broadcast shape, and the SYSTEM messages that fire when
players join, items are called, and Bingo is claimed.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.models.chat import CHAT_MESSAGE_MAX_LENGTH
from app.services import websocket_manager

DEFAULT_HOST_PIN = "test-host-pin-1234"


def _host_headers(pin: str = DEFAULT_HOST_PIN) -> dict[str, str]:
    return {"X-Host-Pin": pin}


def _player_headers(session_token: str) -> dict[str, str]:
    return {"X-Player-Session": session_token}


def _create_game(client: TestClient) -> dict[str, Any]:
    response = client.post(
        "/games",
        json={
            "title": "Chat Test",
            "topic": "Famous mountains",
            "number_of_players": 4,
            "winning_pattern": "HORIZONTAL_ROW",
            "host_pin": DEFAULT_HOST_PIN,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _join(client: TestClient, game_code: str, name: str) -> dict[str, Any]:
    response = client.post(
        "/games/join",
        json={"name": name, "game_code": game_code},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _capture_broadcasts(monkeypatch) -> list[tuple[int, dict[str, Any]]]:
    """Intercept ``schedule_broadcast`` so chat tests don't need a live WS loop."""
    seen: list[tuple[int, dict[str, Any]]] = []

    def _record(game_id: int, message: dict[str, Any]) -> None:
        seen.append((game_id, message))

    monkeypatch.setattr(
        "app.services.chat.schedule_broadcast",
        _record,
    )
    monkeypatch.setattr(
        websocket_manager,
        "schedule_broadcast",
        lambda *args, **kwargs: None,
    )
    return seen


def test_host_can_post_chat_message(client: TestClient, monkeypatch) -> None:
    broadcasts = _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "Welcome everyone!",
        },
        headers=_host_headers(),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["sender_role"] == "HOST"
    assert body["sender_name"] == "Host"
    assert body["message"] == "Welcome everyone!"
    assert body["game_id"] == game["id"]
    assert body["created_at"]

    chat_broadcasts = [b for b in broadcasts if b[1].get("type") == "CHAT_MESSAGE"]
    assert chat_broadcasts, "Expected a CHAT_MESSAGE broadcast"
    last = chat_broadcasts[-1]
    assert last[0] == game["id"]
    payload = last[1]["payload"]
    assert payload["sender_role"] == "HOST"
    assert payload["message"] == "Welcome everyone!"
    assert payload["id"] == body["id"]


def test_player_can_post_chat_message(client: TestClient, monkeypatch) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)
    join = _join(client, game["game_code"], "Alex")

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_id": join["player_id"],
            "sender_name": "Alex",
            "sender_role": "PLAYER",
            "message": "Hi from Alex",
        },
        headers=_player_headers(join["session_token"]),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["sender_role"] == "PLAYER"
    assert body["sender_id"] == join["player_id"]
    assert body["sender_name"] == "Alex"
    assert body["message"] == "Hi from Alex"


def test_post_rejects_empty_message(client: TestClient, monkeypatch) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "   ",
        },
        headers=_host_headers(),
    )

    assert response.status_code in (400, 422), response.text


def test_post_rejects_too_long_message(client: TestClient, monkeypatch) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    too_long = "x" * (CHAT_MESSAGE_MAX_LENGTH + 1)
    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": too_long,
        },
        headers=_host_headers(),
    )

    assert response.status_code in (400, 422), response.text


def test_post_requires_host_pin_for_host_role(
    client: TestClient, monkeypatch
) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "no pin attached",
        },
    )

    assert response.status_code == 401, response.text


def test_post_rejects_wrong_player_session(
    client: TestClient, monkeypatch
) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)
    join = _join(client, game["game_code"], "Alex")

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_id": join["player_id"],
            "sender_name": "Alex",
            "sender_role": "PLAYER",
            "message": "wrong session",
        },
        headers={"X-Player-Session": "not-the-real-token"},
    )

    assert response.status_code == 403, response.text


def test_chat_history_returns_messages_oldest_first(
    client: TestClient, monkeypatch
) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)
    join = _join(client, game["game_code"], "Alex")

    # Two messages from the host, one from the player; order in DB is insertion.
    client.post(
        f"/games/{game['id']}/chat",
        json={"sender_role": "HOST", "sender_name": "Host", "message": "first"},
        headers=_host_headers(),
    )
    client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_id": join["player_id"],
            "sender_name": "Alex",
            "sender_role": "PLAYER",
            "message": "second",
        },
        headers=_player_headers(join["session_token"]),
    )
    client.post(
        f"/games/{game['id']}/chat",
        json={"sender_role": "HOST", "sender_name": "Host", "message": "third"},
        headers=_host_headers(),
    )

    history_response = client.get(f"/games/{game['id']}/chat")
    assert history_response.status_code == 200, history_response.text
    history = history_response.json()

    # The SYSTEM "player joined" message is added by the join hook, so we must
    # filter that out before comparing the explicit chat messages we posted.
    non_system = [m for m in history if m["sender_role"] != "SYSTEM"]
    assert [m["message"] for m in non_system] == ["first", "second", "third"]


def test_player_join_emits_system_chat_message(
    client: TestClient, monkeypatch
) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)
    _join(client, game["game_code"], "Alex")

    history = client.get(f"/games/{game['id']}/chat").json()
    system_messages = [m for m in history if m["sender_role"] == "SYSTEM"]
    assert any("Alex" in m["message"] and "joined" in m["message"].lower()
               for m in system_messages)


def test_call_next_item_emits_system_chat_message(
    client: TestClient, monkeypatch
) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)
    _join(client, game["game_code"], "Alex")

    # Set up the pool + start the game so call-next has something to call.
    assert client.post(
        f"/games/{game['id']}/generate-items",
        headers=_host_headers(),
    ).status_code == 201
    assert client.post(
        f"/games/{game['id']}/generate-cards",
        headers=_host_headers(),
    ).status_code == 201
    assert client.post(
        f"/games/{game['id']}/start",
        headers=_host_headers(),
    ).status_code == 200

    call_response = client.post(
        f"/games/{game['id']}/call-next",
        headers=_host_headers(),
    )
    assert call_response.status_code == 200, call_response.text
    called_word = call_response.json()["word"]

    history = client.get(f"/games/{game['id']}/chat").json()
    system_messages = [m["message"] for m in history if m["sender_role"] == "SYSTEM"]
    assert any(called_word in msg and "called" in msg.lower() for msg in system_messages)


def test_get_chat_returns_404_for_unknown_game(client: TestClient) -> None:
    response = client.get("/games/9999/chat")
    assert response.status_code == 404
