"""Players can join before the host has generated items.

Covers the "waiting room" flow added to address join failing when the shared
Bingo pool was still empty.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

DEFAULT_HOST_PIN = "test-host-pin-1234"


def _host_headers(pin: str = DEFAULT_HOST_PIN) -> dict[str, str]:
    return {"X-Host-Pin": pin}


def _player_headers(session_token: str) -> dict[str, str]:
    return {"X-Player-Session": session_token}


def _create_game(client: TestClient) -> dict:
    response = client.post(
        "/games",
        json={
            "title": "Waiting Room Test",
            "topic": "Famous mountains",
            "number_of_players": 4,
            "winning_pattern": "HORIZONTAL_ROW",
            "host_pin": DEFAULT_HOST_PIN,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _join(client: TestClient, game_code: str, name: str) -> dict:
    response = client.post(
        "/games/join",
        json={"name": name, "game_code": game_code},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_player_can_join_before_host_generates_items(client: TestClient) -> None:
    """Old behaviour was a 500/422 with "pool has 0 items". Now the player is
    accepted and put in a waiting state with a session token."""
    game = _create_game(client)

    body = _join(client, game["game_code"], "Alex")

    assert body["player_status"] == "WAITING_FOR_CARDS"
    assert body["card_id"] is None
    assert body["grid"] == []
    assert body["session_token"]
    assert body["game_id"] == game["id"]
    assert body["player_name"] == "Alex"


def test_get_card_returns_waiting_envelope_when_no_card_yet(
    client: TestClient,
) -> None:
    """GET .../card must succeed with card_id=None for joined-but-waiting players
    so the UI can distinguish "waiting" from real errors."""
    game = _create_game(client)
    join = _join(client, game["game_code"], "Alex")

    card_response = client.get(
        f"/games/{game['id']}/players/{join['player_id']}/card",
        headers=_player_headers(join["session_token"]),
    )
    assert card_response.status_code == 200, card_response.text
    payload = card_response.json()
    assert payload["card_id"] is None
    assert payload["grid"] == []
    assert payload["player_id"] == join["player_id"]


def test_generate_cards_issues_cards_for_waiting_players(client: TestClient) -> None:
    """After players have joined, the host runs generate-items then
    generate-cards; every waiting player must end up with exactly one card."""
    game = _create_game(client)
    join_a = _join(client, game["game_code"], "Alex")
    join_b = _join(client, game["game_code"], "Sam")

    items = client.post(
        f"/games/{game['id']}/generate-items",
        headers=_host_headers(),
    )
    assert items.status_code == 201, items.text

    cards_response = client.post(
        f"/games/{game['id']}/generate-cards",
        headers=_host_headers(),
    )
    assert cards_response.status_code == 201, cards_response.text
    cards = cards_response.json()
    assert len(cards) == 2
    player_ids = {c["player_id"] for c in cards}
    assert player_ids == {join_a["player_id"], join_b["player_id"]}
    assert all(c["card_id"] is not None for c in cards)
    assert all(len(c["grid"]) == 5 for c in cards)

    # The waiting player's individual card endpoint now returns a real grid.
    card_a = client.get(
        f"/games/{game['id']}/players/{join_a['player_id']}/card",
        headers=_player_headers(join_a["session_token"]),
    )
    assert card_a.status_code == 200
    payload = card_a.json()
    assert payload["card_id"] is not None
    assert len(payload["grid"]) == 5


def test_player_joining_after_items_exist_gets_card_immediately(
    client: TestClient,
) -> None:
    """Late joiners (after generate-items) skip the waiting room and receive a
    READY card in the join response."""
    game = _create_game(client)
    items = client.post(
        f"/games/{game['id']}/generate-items",
        headers=_host_headers(),
    )
    assert items.status_code == 201, items.text

    body = _join(client, game["game_code"], "LateJoiner")

    assert body["player_status"] == "READY"
    assert body["card_id"] is not None
    assert len(body["grid"]) == 5


def test_generate_cards_is_idempotent_for_same_player(client: TestClient) -> None:
    """Calling generate-cards twice must not create duplicate cards."""
    game = _create_game(client)
    join = _join(client, game["game_code"], "Alex")
    client.post(
        f"/games/{game['id']}/generate-items",
        headers=_host_headers(),
    )

    first = client.post(
        f"/games/{game['id']}/generate-cards",
        headers=_host_headers(),
    )
    assert first.status_code == 201, first.text
    second = client.post(
        f"/games/{game['id']}/generate-cards",
        headers=_host_headers(),
    )
    assert second.status_code == 201, second.text

    first_cards = first.json()
    second_cards = second.json()
    assert len(first_cards) == 1
    assert len(second_cards) == 1
    # Card ID and grid layout must be stable across calls (no replacement).
    assert first_cards[0]["card_id"] == second_cards[0]["card_id"]
    assert first_cards[0]["player_id"] == join["player_id"]


def test_mixed_waiting_and_late_joiners_all_get_one_card(client: TestClient) -> None:
    """One player joins waiting, host generates items + cards (waiting player
    gets a card), a third player joins later and gets a card on join."""
    game = _create_game(client)
    waiting = _join(client, game["game_code"], "EarlyAlex")

    client.post(
        f"/games/{game['id']}/generate-items",
        headers=_host_headers(),
    )
    client.post(
        f"/games/{game['id']}/generate-cards",
        headers=_host_headers(),
    )

    late = _join(client, game["game_code"], "LateSam")
    assert late["player_status"] == "READY"
    assert late["card_id"] is not None

    # Each player has exactly one card.
    waiting_card = client.get(
        f"/games/{game['id']}/players/{waiting['player_id']}/card",
        headers=_player_headers(waiting["session_token"]),
    ).json()
    late_card = client.get(
        f"/games/{game['id']}/players/{late['player_id']}/card",
        headers=_player_headers(late["session_token"]),
    ).json()
    assert waiting_card["card_id"] != late_card["card_id"]
    assert waiting_card["card_id"] is not None
    assert late_card["card_id"] is not None
