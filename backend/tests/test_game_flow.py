"""
End-to-end style API tests for the main Bingo game flow.

These tests call the real FastAPI routes backed by an isolated SQLite file
(see ``tests/conftest.py``). Read each test name as a short story of what the
host or player is trying to do.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.services.item_generator import GeneratedItem
from app.services.llm_items import ItemGenerationOutcome

DEFAULT_HOST_PIN = "test-host-pin-1234"


def host_headers(pin: str = DEFAULT_HOST_PIN) -> dict[str, str]:
    return {"X-Host-Pin": pin}


def create_game_payload(
    *,
    topic: str = "Famous mountains",
    pattern: str = "HORIZONTAL_ROW",
    pin: str = DEFAULT_HOST_PIN,
) -> dict:
    return {
        "title": "Pytest Room",
        "topic": topic,
        "number_of_players": 12,
        "winning_pattern": pattern,
        "host_pin": pin,
    }


def assert_ok(response, code: int = 200) -> None:
    assert response.status_code == code, response.text


def _create_game(client: TestClient, **kwargs) -> dict:
    response = client.post("/games", json=create_game_payload(**kwargs))
    assert_ok(response, 201)
    return response.json()


def test_create_game_success(client: TestClient) -> None:
    """POST /games with the host UI payload must return 201 and a room code."""
    response = client.post(
        "/games",
        json={
            "title": "Friday Night Bingo",
            "topic": "Famous mountains",
            "number_of_players": 12,
            "winning_patterns": ["HORIZONTAL_ROW"],
            "winning_pattern": "HORIZONTAL_ROW",
            "host_pin": DEFAULT_HOST_PIN,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "WAITING"
    assert isinstance(body.get("game_code"), str)
    assert len(body["game_code"]) == 6
    assert body["title"] == "Friday Night Bingo"
    assert body["topic"] == "Famous mountains"
    assert body["number_of_players"] == 12


def _generate_items(client: TestClient, game_id: int) -> dict:
    response = client.post(
        f"/games/{game_id}/generate-items",
        headers=host_headers(),
    )
    assert_ok(response, 201)
    return response.json()


def _start_game(client: TestClient, game_id: int) -> None:
    response = client.post(f"/games/{game_id}/start", headers=host_headers())
    assert_ok(response, 200)


def _call_next(client: TestClient, game_id: int) -> dict:
    response = client.post(f"/games/{game_id}/call-next", headers=host_headers())
    assert_ok(response, 200)
    return response.json()


def _called_item_ids(client: TestClient, game_id: int) -> set[int]:
    response = client.get(f"/games/{game_id}/called-items")
    assert_ok(response)
    return {row["item_id"] for row in response.json()}


def _call_until_items_called(
    client: TestClient,
    game_id: int,
    required_item_ids: set[int],
    *,
    max_calls: int = 80,
) -> None:
    """Host keeps calling random items until every ``required_item_id`` has been drawn."""
    for _ in range(max_calls):
        if required_item_ids.issubset(_called_item_ids(client, game_id)):
            return
        _call_next(client, game_id)
    pytest.fail(
        f"Could not call all required items within {max_calls} draws: {required_item_ids}"
    )


def test_01_game_creation_returns_code_and_pin_protected_setup(client: TestClient) -> None:
    """Creating a game stores metadata and exposes a joinable game code."""
    game = _create_game(client)
    assert "id" in game and "game_code" in game
    assert len(game["game_code"]) >= 4
    assert game["status"] == "WAITING"


def test_02_item_generation_creates_configured_pool_size(client: TestClient) -> None:
    """Host generates the shared Bingo item pool (default 75) before cards or play."""
    game = _create_game(client)
    body = _generate_items(client, game["id"])
    items = body["items"]
    assert len(items) == settings.bingo_item_pool_size
    assert body["actual_count"] == settings.bingo_item_pool_size
    assert body["target_count"] == settings.bingo_item_pool_size
    assert body["minimum_count"] == settings.bingo_min_item_pool_size
    assert body.get("warning") in (None, "")
    assert all("word" in item for item in items)


def _join_player(client: TestClient, game_code: str, name: str) -> dict:
    response = client.post(
        "/games/join",
        json={"name": name, "game_code": game_code},
    )
    assert_ok(response, 201)
    return response.json()


def _card_item_ids(
    client: TestClient, game_id: int, player_id: int, session_token: str
) -> set[int]:
    response = client.get(
        f"/games/{game_id}/players/{player_id}/card",
        headers={"X-Player-Session": session_token},
    )
    assert_ok(response)
    ids: set[int] = set()
    for row in response.json()["grid"]:
        for cell in row:
            ids.add(cell["item_id"])
    return ids


def test_02b_three_player_cards_sample_from_pool(client: TestClient) -> None:
    """Each 5×5 card uses 25 distinct IDs from the larger shared pool; layouts differ."""
    game = _create_game(client)
    body = _generate_items(client, game["id"])
    items = body["items"]
    pool_ids = {it["id"] for it in items}
    assert len(pool_ids) == body["actual_count"] == settings.bingo_item_pool_size

    code = game["game_code"]
    joined = [_join_player(client, code, name) for name in ("P1", "P2", "P3")]

    r_cards = client.post(
        f"/games/{game['id']}/generate-cards",
        headers=host_headers(),
    )
    assert_ok(r_cards, 201)

    card_sets = [
        _card_item_ids(
            client,
            game["id"],
            row["player_id"],
            row["session_token"],
        )
        for row in joined
    ]
    need = settings.bingo_card_cell_count
    assert all(len(s) == need for s in card_sets)
    assert all(s.issubset(pool_ids) for s in card_sets)
    assert not (card_sets[0] == card_sets[1] == card_sets[2])
def test_03_card_generation_requires_players_and_items(client: TestClient) -> None:
    """Host cannot print cards until players exist and items are ready."""
    game = _create_game(client)
    # No items yet → should fail with a helpful message.
    r = client.post(f"/games/{game['id']}/players", json={"name": "Alex"})
    assert_ok(r, 201)
    r2 = client.post(
        f"/games/{game['id']}/generate-cards",
        headers=host_headers(),
    )
    assert r2.status_code == 400

    _generate_items(client, game["id"])
    r3 = client.post(
        f"/games/{game['id']}/generate-cards",
        headers=host_headers(),
    )
    assert_ok(r3, 201)
    cards = r3.json()
    assert len(cards) == 1


def test_04_player_join_returns_session_and_card(client: TestClient) -> None:
    """A player can join with the room code and receives a session token."""
    game = _create_game(client)
    _generate_items(client, game["id"])
    r = client.post(
        "/games/join",
        json={"name": "Jamie", "game_code": game["game_code"]},
    )
    assert_ok(r, 201)
    body = r.json()
    assert body["game_id"] == game["id"]
    assert "session_token" in body and len(body["session_token"]) > 10
    assert body["player_name"] == "Jamie"


def test_05_call_next_requires_active_game(client: TestClient) -> None:
    """Calling an item before the round starts is rejected."""
    game = _create_game(client)
    _generate_items(client, game["id"])
    r = client.post(f"/games/{game['id']}/call-next", headers=host_headers())
    assert r.status_code == 400
    assert "active" in r.json()["detail"].lower()


def test_06_player_cannot_mark_square_before_host_calls_word(client: TestClient) -> None:
    """The marking rule: only called items may be toggled on the card."""
    game = _create_game(client)
    _generate_items(client, game["id"])
    join = client.post(
        "/games/join",
        json={"name": "Riley", "game_code": game["game_code"]},
    ).json()
    player_id = join["player_id"]
    token = join["session_token"]
    card = client.get(
        f"/games/{game['id']}/players/{player_id}/card",
        headers={"X-Player-Session": token},
    ).json()
    cell_id = card["grid"][0][0]["cell_id"]

    r = client.patch(
        f"/games/{game['id']}/players/{player_id}/card/cells/{cell_id}/toggle",
        headers={"X-Player-Session": token},
    )
    assert r.status_code == 400
    assert "not been called" in r.json()["detail"].lower()


def test_07_bingo_claim_fails_until_pattern_is_complete(client: TestClient) -> None:
    """Invalid Bingo claims return HTTP 400 with an explanatory message."""
    game = _create_game(client, pattern="HORIZONTAL_ROW")
    _generate_items(client, game["id"])
    join = client.post(
        "/games/join",
        json={"name": "Taylor", "game_code": game["game_code"]},
    ).json()
    pid, token = join["player_id"], join["session_token"]
    _start_game(client, game["id"])

    card = client.get(
        f"/games/{game['id']}/players/{pid}/card",
        headers={"X-Player-Session": token},
    ).json()
    row0 = card["grid"][0]
    required = {cell["item_id"] for cell in row0}

    _call_until_items_called(client, game["id"], required)

    bad = client.post(
        f"/games/{game['id']}/players/{pid}/claim-bingo",
        headers={"X-Player-Session": token},
    )
    assert bad.status_code == 400

    for cell in row0:
        assert_ok(
            client.patch(
                f"/games/{game['id']}/players/{pid}/card/cells/{cell['cell_id']}/toggle",
                headers={"X-Player-Session": token},
            ),
        )

    good = client.post(
        f"/games/{game['id']}/players/{pid}/claim-bingo",
        headers={"X-Player-Session": token},
    )
    assert_ok(good)
    body = good.json()
    assert body["success"] is True
    assert body["rank"] == 1


def test_08_leaderboard_shows_recorded_winner(client: TestClient) -> None:
    """After a win, the public leaderboard lists rank and player name."""
    game = _create_game(client, pattern="HORIZONTAL_ROW")
    _generate_items(client, game["id"])
    join = client.post(
        "/games/join",
        json={"name": "Morgan", "game_code": game["game_code"]},
    ).json()
    pid, token = join["player_id"], join["session_token"]
    _start_game(client, game["id"])
    card = client.get(
        f"/games/{game['id']}/players/{pid}/card",
        headers={"X-Player-Session": token},
    ).json()
    row0 = card["grid"][0]
    required = {cell["item_id"] for cell in row0}
    _call_until_items_called(client, game["id"], required)
    for cell in row0:
        client.patch(
            f"/games/{game['id']}/players/{pid}/card/cells/{cell['cell_id']}/toggle",
            headers={"X-Player-Session": token},
        )
    client.post(
        f"/games/{game['id']}/players/{pid}/claim-bingo",
        headers={"X-Player-Session": token},
    )

    board = client.get(f"/games/{game['id']}/leaderboard").json()
    assert board["winners"][0]["rank"] == 1
    assert board["winners"][0]["player_name"] == "Morgan"


def test_09_game_completes_after_three_winners(client: TestClient) -> None:
    """When three different players win, the game status becomes COMPLETED."""
    game = _create_game(client, pattern="HORIZONTAL_ROW")
    gid = game["id"]
    _generate_items(client, gid)

    winners: list[tuple[int, str]] = []
    for name in ("P1", "P2", "P3"):
        join = client.post(
            "/games/join",
            json={"name": name, "game_code": game["game_code"]},
        ).json()
        winners.append((join["player_id"], join["session_token"]))

    _generate_cards = client.post(
        f"/games/{gid}/generate-cards",
        headers=host_headers(),
    )
    assert_ok(_generate_cards, 201)

    _start_game(client, gid)

    for player_id, token in winners:
        card = client.get(
            f"/games/{gid}/players/{player_id}/card",
            headers={"X-Player-Session": token},
        ).json()
        row0 = card["grid"][0]
        required = {cell["item_id"] for cell in row0}
        _call_until_items_called(client, gid, required)
        for cell in row0:
            client.patch(
                f"/games/{gid}/players/{player_id}/card/cells/{cell['cell_id']}/toggle",
                headers={"X-Player-Session": token},
            )
        r = client.post(
            f"/games/{gid}/players/{player_id}/claim-bingo",
            headers={"X-Player-Session": token},
        )
        assert_ok(r)

    state = client.get(f"/games/{gid}").json()
    assert state["status"] == "COMPLETED"


def test_10_invalid_game_code_returns_404(client: TestClient) -> None:
    """Joining with a code that does not exist is rejected clearly."""
    r = client.post(
        "/games/join",
        json={"name": "Alex", "game_code": "ZZZZZZ"},
    )
    assert r.status_code == 404


def test_11_duplicate_player_name_in_same_game_returns_409(client: TestClient) -> None:
    """Two players cannot share the same display name in one room."""
    game = _create_game(client)
    _generate_items(client, game["id"])
    first = client.post(
        "/games/join",
        json={"name": "Casey", "game_code": game["game_code"]},
    )
    assert_ok(first, 201)
    second = client.post(
        "/games/join",
        json={"name": "casey", "game_code": game["game_code"]},
    )
    assert second.status_code == 409


def test_12_not_enough_items_blocks_card_generation(client: TestClient) -> None:
    """Card generation needs at least bingo_card_cell_count items in the database."""
    game = _create_game(client)
    client.post(f"/games/{game['id']}/players", json={"name": "OnlyOne"})
    r = client.post(
        f"/games/{game['id']}/generate-cards",
        headers=host_headers(),
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert str(settings.bingo_card_cell_count) in detail


def test_item_generation_mock_failure_returns_503(client: TestClient) -> None:
    """Reserved topic simulates a generator outage (no real LLM keys)."""
    game = _create_game(client, topic="__mock_generation_failure__")
    r = client.post(
        f"/games/{game['id']}/generate-items",
        headers=host_headers(),
    )
    assert r.status_code == 503


@patch("app.routes.games.resolve_generated_items_for_game")
def test_generate_items_accepts_short_pool_with_warning(
    mock_resolve: object,
    client: TestClient,
) -> None:
    """Route persists a sub-target pool when still at or above the configured minimum."""
    items_74 = [
        GeneratedItem(word=f"W{i}", description=f"Accurate description line {i} here.")
        for i in range(74)
    ]
    mock_resolve.return_value = ItemGenerationOutcome(
        items=items_74,
        warning=(
            "Generated 74 items instead of target 75. The game can still continue."
        ),
    )
    game = _create_game(client)
    r = client.post(
        f"/games/{game['id']}/generate-items",
        headers=host_headers(),
    )
    assert_ok(r, 201)
    data = r.json()
    assert len(data["items"]) == 74
    assert data["actual_count"] == 74
    assert data["target_count"] == settings.bingo_item_pool_size
    assert data["warning"]


@patch("app.routes.games.resolve_generated_items_for_game")
def test_generate_items_rejects_pool_below_minimum_even_if_mocked(
    mock_resolve: object,
    client: TestClient,
) -> None:
    """Defensive guard: never persist a pool smaller than ``bingo_min_item_pool_size``."""
    items_30 = [
        GeneratedItem(word=f"x{i}", description=f"Description for mock row {i}.")
        for i in range(30)
    ]
    mock_resolve.return_value = ItemGenerationOutcome(items=items_30, warning=None)
    game = _create_game(client)
    r = client.post(
        f"/games/{game['id']}/generate-items",
        headers=host_headers(),
    )
    assert r.status_code == 503
    assert "30" in r.json()["detail"]


def test_audit_trail_requires_host_pin(client: TestClient) -> None:
    """Host-only audit endpoint rejects missing PIN."""
    game = _create_game(client)
    r = client.get(f"/games/{game['id']}/audit-events")
    assert r.status_code == 401
