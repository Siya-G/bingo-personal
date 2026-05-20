"""Tests for chat moderation.

Covers both the pure-Python ``moderate_chat_message`` decisions and the
end-to-end behaviour through ``POST /games/{game_id}/chat``:

* safe messages still send + broadcast,
* blocked messages return a structured 422,
* blocked messages do NOT appear in chat history,
* blocked messages do NOT trigger a CHAT_MESSAGE broadcast,
* a row is appended to ``chat_moderation_events`` for host/admin audit.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import ChatMessage, ModerationEvent
from app.services import websocket_manager
from app.services.chat_moderation import (
    ModerationDecision,
    moderate_chat_message,
    reload_blocked_terms,
)

DEFAULT_HOST_PIN = "test-host-pin-1234"


def _host_headers(pin: str = DEFAULT_HOST_PIN) -> dict[str, str]:
    return {"X-Host-Pin": pin}


def _create_game(client: TestClient) -> dict[str, Any]:
    response = client.post(
        "/games",
        json={
            "title": "Moderation Test",
            "topic": "Famous mountains",
            "number_of_players": 4,
            "winning_pattern": "HORIZONTAL_ROW",
            "host_pin": DEFAULT_HOST_PIN,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _capture_broadcasts(monkeypatch) -> list[tuple[int, dict[str, Any]]]:
    """Intercept ``schedule_broadcast`` so blocked-message broadcasts can be
    asserted absent."""
    seen: list[tuple[int, dict[str, Any]]] = []

    def _record(game_id: int, message: dict[str, Any]) -> None:
        seen.append((game_id, message))

    monkeypatch.setattr("app.services.chat.schedule_broadcast", _record)
    monkeypatch.setattr(
        websocket_manager,
        "schedule_broadcast",
        lambda *args, **kwargs: None,
    )
    return seen


@pytest.fixture(autouse=True)
def _reset_blocked_terms_cache():
    """Each test should see the bundled default word list."""
    reload_blocked_terms()
    yield
    reload_blocked_terms()


# ---------------------------------------------------------------------------
# Pure function: moderate_chat_message
# ---------------------------------------------------------------------------


def test_safe_message_is_allowed() -> None:
    decision = moderate_chat_message(
        message="Good luck everyone!", sender_role="PLAYER"
    )
    assert decision.allowed is True
    assert decision.reason is None


def test_blocked_term_is_rejected() -> None:
    decision = moderate_chat_message(message="fuck this", sender_role="PLAYER")
    assert decision.allowed is False
    assert decision.reason == "inappropriate_language"


def test_blocked_term_with_digit_obfuscation_is_rejected() -> None:
    # Digits are folded to letters in normalization (0->o, 1->i, ...). This
    # catches the most common numeric bypasses; arbitrary censor symbols (@/*)
    # for non-mapped letters are left to the optional AI moderation layer.
    decision = moderate_chat_message(message="b1tch", sender_role="PLAYER")
    assert decision.allowed is False
    assert decision.reason == "inappropriate_language"


def test_blocked_phrase_with_extra_spaces_is_rejected() -> None:
    decision = moderate_chat_message(message="kill   yourself", sender_role="PLAYER")
    assert decision.allowed is False
    assert decision.reason == "inappropriate_language"


def test_word_boundary_avoids_false_positive_on_substrings() -> None:
    # "shitake" contains "shit" but should NOT trigger the blocked-term match.
    decision = moderate_chat_message(
        message="I love shitake mushrooms", sender_role="PLAYER"
    )
    assert decision.allowed is True


def test_html_injection_is_rejected() -> None:
    decision = moderate_chat_message(
        message="hello <script>alert(1)</script>", sender_role="PLAYER"
    )
    assert decision.allowed is False
    assert decision.reason == "html_or_script"


def test_html_attribute_handler_is_rejected() -> None:
    decision = moderate_chat_message(
        message='<img src=x onerror="x">', sender_role="PLAYER"
    )
    assert decision.allowed is False
    assert decision.reason == "html_or_script"


def test_spam_repetition_is_rejected() -> None:
    decision = moderate_chat_message(message="aaaaaaaaaaaaaaaaa", sender_role="PLAYER")
    assert decision.allowed is False
    assert decision.reason == "spam_repetition"


def test_system_role_bypasses_blocked_terms() -> None:
    # Internal SYSTEM lines must not be filtered by the slur list, otherwise a
    # word like "called" inside a future system message could be flagged. They
    # are still subject to HTML/script guards (tested below).
    decision = moderate_chat_message(message="fuck", sender_role="SYSTEM")
    assert decision.allowed is True


def test_system_role_still_blocked_for_html() -> None:
    decision = moderate_chat_message(
        message="<script>x()</script>", sender_role="SYSTEM"
    )
    assert decision.allowed is False
    assert decision.reason == "html_or_script"


def test_empty_message_returns_block() -> None:
    decision = moderate_chat_message(message="   ", sender_role="PLAYER")
    assert decision.allowed is False
    assert decision.reason == "inappropriate_language"


def test_blocked_words_file_override(tmp_path, monkeypatch) -> None:
    """The ``CHAT_BLOCKED_WORDS_FILE`` env var should replace the default list."""
    custom = tmp_path / "blocked.json"
    custom.write_text('{"blocked_terms": ["bananaword"]}', encoding="utf-8")
    monkeypatch.setenv("CHAT_BLOCKED_WORDS_FILE", str(custom))
    reload_blocked_terms()

    blocked = moderate_chat_message(message="bananaword", sender_role="PLAYER")
    assert blocked.allowed is False
    assert blocked.reason == "inappropriate_language"

    # Words that were on the default list should NOT be blocked anymore because
    # the override fully replaced the list.
    allowed = moderate_chat_message(message="fuck", sender_role="PLAYER")
    assert allowed.allowed is True


# ---------------------------------------------------------------------------
# HTTP route: POST /games/{game_id}/chat
# ---------------------------------------------------------------------------


def test_safe_message_still_sends_and_broadcasts(client: TestClient, monkeypatch) -> None:
    broadcasts = _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "Good luck everyone!",
        },
        headers=_host_headers(),
    )
    assert response.status_code == 201, response.text
    assert any(b[1].get("type") == "CHAT_MESSAGE" for b in broadcasts)


def test_blocked_message_returns_structured_422(
    client: TestClient, monkeypatch
) -> None:
    broadcasts = _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "fuck this",
        },
        headers=_host_headers(),
    )
    assert response.status_code == 422, response.text
    body = response.json()
    detail = body.get("detail")
    assert isinstance(detail, dict), detail
    assert detail["error"] == "Message blocked by chat moderation."
    assert detail["reason"] == "inappropriate_language"

    # No CHAT_MESSAGE broadcast for the blocked content.
    chat_broadcasts = [b for b in broadcasts if b[1].get("type") == "CHAT_MESSAGE"]
    assert chat_broadcasts == []


def test_blocked_message_not_in_history(client: TestClient, monkeypatch) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    blocked = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "fuck this",
        },
        headers=_host_headers(),
    )
    assert blocked.status_code == 422

    history_response = client.get(f"/games/{game['id']}/chat")
    assert history_response.status_code == 200
    history = history_response.json()
    # No HOST/PLAYER message containing the blocked text. SYSTEM "joined"
    # lines are unrelated and unaffected.
    for message in history:
        assert "fuck" not in message["message"].lower()


def test_blocked_message_records_moderation_audit_row(
    client: TestClient, monkeypatch
) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "fuck this",
        },
        headers=_host_headers(),
    )
    assert response.status_code == 422

    # Read the audit row directly from the DB to assert the audit-trail invariant.
    from app.database.connection import SessionLocal

    with SessionLocal() as db:
        events = list(
            db.scalars(
                select(ModerationEvent).where(ModerationEvent.game_id == game["id"])
            )
        )
        assert len(events) == 1
        event = events[0]
        assert event.sender_role == "HOST"
        assert event.sender_name == "Host"
        assert event.original_message == "fuck this"
        assert event.reason == "inappropriate_language"

        # And confirm no chat row was created for the blocked content.
        chat_rows = list(
            db.scalars(
                select(ChatMessage).where(
                    ChatMessage.game_id == game["id"],
                    ChatMessage.message == "fuck this",
                )
            )
        )
        assert chat_rows == []


def test_html_injection_in_chat_is_blocked(client: TestClient, monkeypatch) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "<script>alert('xss')</script>",
        },
        headers=_host_headers(),
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["reason"] == "html_or_script"


def test_too_long_message_still_rejected(client: TestClient, monkeypatch) -> None:
    _capture_broadcasts(monkeypatch)
    game = _create_game(client)

    response = client.post(
        f"/games/{game['id']}/chat",
        json={
            "sender_role": "HOST",
            "sender_name": "Host",
            "message": "x" * 501,
        },
        headers=_host_headers(),
    )
    # Pydantic already rejects at validation layer (422); just confirm rejected.
    assert response.status_code in (400, 422)


def test_moderation_decision_helpers() -> None:
    allow = ModerationDecision.allow()
    block = ModerationDecision.block("ai_moderation", detail="some detail")
    assert allow.allowed is True and allow.reason is None
    assert block.allowed is False and block.reason == "ai_moderation"
    assert block.detail == "some detail"
