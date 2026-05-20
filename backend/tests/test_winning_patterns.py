"""Winning pattern normalization and multi-pattern Bingo evaluation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services.bingo_validation import first_matching_winning_pattern
from app.services.winning_pattern_rules import canonicalize_winning_pattern


def _empty_grid() -> list[list[bool]]:
    return [[False] * 5 for _ in range(5)]


def test_canonicalize_row_column_aliases() -> None:
    assert canonicalize_winning_pattern("ROW") == "HORIZONTAL_ROW"
    assert canonicalize_winning_pattern("column") == "VERTICAL_COLUMN"


def test_canonicalize_rejects_unknown() -> None:
    with pytest.raises(ValueError, match="Invalid winning pattern"):
        canonicalize_winning_pattern("ZIGZAG")


def test_row_only_matches_row() -> None:
    valid = _empty_grid()
    for c in range(5):
        valid[2][c] = True
    assert first_matching_winning_pattern(["HORIZONTAL_ROW"], valid) == "HORIZONTAL_ROW"
    assert first_matching_winning_pattern(["VERTICAL_COLUMN"], valid) is None


def test_column_only_matches_column() -> None:
    valid = _empty_grid()
    for r in range(5):
        valid[r][3] = True
    assert first_matching_winning_pattern(["VERTICAL_COLUMN"], valid) == "VERTICAL_COLUMN"


def test_row_or_column_accepts_either() -> None:
    row_win = _empty_grid()
    for c in range(5):
        row_win[0][c] = True
    assert first_matching_winning_pattern(
        ["HORIZONTAL_ROW", "VERTICAL_COLUMN"], row_win
    ) == "HORIZONTAL_ROW"

    col_win = _empty_grid()
    for r in range(5):
        col_win[r][1] = True
    assert first_matching_winning_pattern(
        ["HORIZONTAL_ROW", "VERTICAL_COLUMN"], col_win
    ) == "VERTICAL_COLUMN"


def test_diagonal_plus_full_house_prefers_first_in_list() -> None:
    """First configured pattern that matches wins (order preserved)."""
    valid = _empty_grid()
    for i in range(5):
        valid[i][i] = True
    assert first_matching_winning_pattern(["DIAGONAL", "FULL_HOUSE"], valid) == "DIAGONAL"

    full = [[True] * 5 for _ in range(5)]
    assert first_matching_winning_pattern(["DIAGONAL", "FULL_HOUSE"], full) == "DIAGONAL"


def test_full_house_only_rejects_partial_row() -> None:
    valid = _empty_grid()
    for c in range(5):
        valid[0][c] = True
    assert first_matching_winning_pattern(["FULL_HOUSE"], valid) is None


def test_four_corners() -> None:
    valid = _empty_grid()
    valid[0][0] = valid[0][4] = valid[4][0] = valid[4][4] = True
    assert first_matching_winning_pattern(["FOUR_CORNERS"], valid) == "FOUR_CORNERS"
    assert first_matching_winning_pattern(["HORIZONTAL_ROW"], valid) is None


def test_create_game_accepts_winning_patterns_array(client: TestClient) -> None:
    r = client.post(
        "/games",
        json={
            "title": "Multi pattern room",
            "topic": "Trivia",
            "number_of_players": 8,
            "winning_patterns": ["HORIZONTAL_ROW", "VERTICAL_COLUMN"],
            "host_pin": "test-host-pin-1234",
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["winning_pattern"] == "HORIZONTAL_ROW"
    assert data["winning_patterns"] == ["HORIZONTAL_ROW", "VERTICAL_COLUMN"]


def test_create_game_legacy_single_winning_pattern(client: TestClient) -> None:
    r = client.post(
        "/games",
        json={
            "title": "Legacy room",
            "topic": "Trivia",
            "number_of_players": 4,
            "winning_pattern": "DIAGONAL",
            "host_pin": "test-host-pin-1234",
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["winning_patterns"] == ["DIAGONAL"]


def test_create_game_rejects_invalid_pattern_name(client: TestClient) -> None:
    r = client.post(
        "/games",
        json={
            "title": "Bad pattern",
            "topic": "Trivia",
            "number_of_players": 4,
            "winning_patterns": ["HORIZONTAL_ROW", "INVALID_THING"],
            "host_pin": "test-host-pin-1234",
        },
    )
    assert r.status_code == 422


def test_create_game_accepts_current_frontend_payload(client: TestClient) -> None:
    """The host UI sends BOTH ``winning_patterns`` (preferred) and ``winning_pattern``
    (legacy, first entry of the list). The backend must accept this dual-key
    shape so existing browser tabs and the current build keep working."""
    r = client.post(
        "/games",
        json={
            "title": "Test",
            "topic": "Famous mountains",
            "number_of_players": 1,
            "winning_patterns": ["HORIZONTAL_ROW"],
            "winning_pattern": "HORIZONTAL_ROW",
            "host_pin": "demo-host-1234",
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["title"] == "Test"
    assert data["topic"] == "Famous mountains"
    assert data["number_of_players"] == 1
    assert data["winning_pattern"] == "HORIZONTAL_ROW"
    assert data["winning_patterns"] == ["HORIZONTAL_ROW"]
    assert data["game_code"]
    assert data["status"] == "WAITING"
