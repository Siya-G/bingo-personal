"""Tests for topic-level item cache (generate-items + admin clear)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.services.item_generator import GeneratedItem
from app.services.llm_items import ItemGenerationOutcome

DEFAULT_PIN = "test-pin-9999"


def _host_headers(pin: str = DEFAULT_PIN) -> dict[str, str]:
    return {"X-Host-Pin": pin}


def _create_game(client: TestClient, topic: str = "AI Concepts") -> int:
    response = client.post(
        "/games",
        json={
            "title": "Cache Test Room",
            "topic": topic,
            "number_of_players": 4,
            "winning_pattern": "HORIZONTAL_ROW",
            "host_pin": DEFAULT_PIN,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _mock_outcome(topic: str = "AI Concepts") -> ItemGenerationOutcome:
    items = [
        GeneratedItem(word=f"Item {i}", description=f"Desc {i}")
        for i in range(1, 76)
    ]
    return ItemGenerationOutcome(items=items, warning=None)


# ── Cache miss → hit ─────────────────────────────────────────────────────────

def test_first_generate_is_cache_miss(client: TestClient) -> None:
    """First generate-items call for a topic returns cached=False."""
    game_id = _create_game(client, topic="AI Concepts")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome(),
    ) as mock_generate:
        response = client.post(
            f"/games/{game_id}/generate-items",
            headers=_host_headers(),
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["cached"] is False
    assert body["actual_count"] == 75
    mock_generate.assert_called_once()


def test_second_game_same_topic_is_cache_hit(client: TestClient) -> None:
    """Second game with the same topic returns cached=True without calling the AI."""
    # Seed the cache with game 1.
    game1 = _create_game(client, topic="AI Concepts")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome(),
    ) as mock_first:
        r1 = client.post(f"/games/{game1}/generate-items", headers=_host_headers())
    assert r1.status_code == 201
    assert r1.json()["cached"] is False
    mock_first.assert_called_once()

    # Game 2 — same topic — should hit the cache.
    game2 = _create_game(client, topic="AI Concepts")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome(),
    ) as mock_second:
        r2 = client.post(f"/games/{game2}/generate-items", headers=_host_headers())
    assert r2.status_code == 201
    body2 = r2.json()
    assert body2["cached"] is True
    assert body2["actual_count"] == 75
    # AI must NOT have been called a second time.
    mock_second.assert_not_called()


# ── Topic normalisation ───────────────────────────────────────────────────────

def test_topic_normalization_produces_cache_hit(client: TestClient) -> None:
    """'AI Concepts ' and 'ai concepts' resolve to the same cache key."""
    game1 = _create_game(client, topic="AI Concepts ")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome("AI Concepts"),
    ):
        client.post(f"/games/{game1}/generate-items", headers=_host_headers())

    game2 = _create_game(client, topic="ai concepts")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome("ai concepts"),
    ) as mock_ai:
        r2 = client.post(f"/games/{game2}/generate-items", headers=_host_headers())

    assert r2.json()["cached"] is True
    mock_ai.assert_not_called()


def test_different_topic_is_cache_miss(client: TestClient) -> None:
    """A different topic never reuses the cache."""
    game1 = _create_game(client, topic="Famous Mountains")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome("Famous Mountains"),
    ):
        client.post(f"/games/{game1}/generate-items", headers=_host_headers())

    game2 = _create_game(client, topic="Ocean Life")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome("Ocean Life"),
    ) as mock_ai:
        r2 = client.post(f"/games/{game2}/generate-items", headers=_host_headers())

    assert r2.json()["cached"] is False
    mock_ai.assert_called_once()


# ── Idempotent re-generate for the same game ─────────────────────────────────

def test_second_generate_same_game_returns_existing_items(client: TestClient) -> None:
    """Re-generating items for the same game returns existing BingoItem rows (not cached flag)."""
    game_id = _create_game(client)
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome(),
    ):
        r1 = client.post(f"/games/{game_id}/generate-items", headers=_host_headers())
    assert r1.status_code == 201

    # Second call — no AI, returns existing rows. The endpoint always uses 201.
    with patch(
        "app.routes.games.resolve_generated_items_for_game"
    ) as mock_ai:
        r2 = client.post(f"/games/{game_id}/generate-items", headers=_host_headers())
    assert r2.status_code == 201
    mock_ai.assert_not_called()


# ── Admin: DELETE /admin/cache/topics ────────────────────────────────────────

def test_admin_clear_cache_requires_secret(client: TestClient) -> None:
    """Missing or wrong admin secret → 403."""
    r_no_header = client.delete("/admin/cache/topics")
    assert r_no_header.status_code == 403

    r_wrong = client.delete(
        "/admin/cache/topics",
        headers={"X-Admin-Secret": "wrong-secret"},
    )
    assert r_wrong.status_code == 403


def test_admin_clear_cache_disabled_when_unconfigured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When ADMIN_SECRET is empty the endpoint always returns 403."""
    from app import config

    monkeypatch.setattr(config.settings, "admin_secret", "")
    r = client.delete(
        "/admin/cache/topics",
        headers={"X-Admin-Secret": "anything"},
    )
    assert r.status_code == 403


def test_admin_clear_cache_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Correct secret clears the cache and returns the deleted count."""
    from app import config

    monkeypatch.setattr(config.settings, "admin_secret", "super-secret-123")

    # Seed the cache by generating items for a game.
    game_id = _create_game(client, topic="Space Exploration")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome("Space Exploration"),
    ):
        client.post(f"/games/{game_id}/generate-items", headers=_host_headers())

    # Clear the cache.
    r = client.delete(
        "/admin/cache/topics",
        headers={"X-Admin-Secret": "super-secret-123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["deleted"] == 1

    # Next generate-items call must miss the cache again.
    game2 = _create_game(client, topic="Space Exploration")
    with patch(
        "app.routes.games.resolve_generated_items_for_game",
        return_value=_mock_outcome("Space Exploration"),
    ) as mock_ai:
        r2 = client.post(f"/games/{game2}/generate-items", headers=_host_headers())
    assert r2.json()["cached"] is False
    mock_ai.assert_called_once()


def test_admin_clear_empty_cache(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Clearing an already-empty cache returns deleted=0."""
    from app import config

    monkeypatch.setattr(config.settings, "admin_secret", "my-secret")
    r = client.delete(
        "/admin/cache/topics",
        headers={"X-Admin-Secret": "my-secret"},
    )
    assert r.status_code == 200
    assert r.json()["deleted"] == 0
