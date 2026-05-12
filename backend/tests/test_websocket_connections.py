"""Regression: multiple browser tabs must register as separate WebSocket peers."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_websocket_room_tracks_multiple_connections_same_game(
    client: TestClient,
) -> None:
    from app.services import websocket_manager as wm

    game_id = 4242
    wm._connections.pop(game_id, None)
    try:
        with client.websocket_connect(f"/ws/games/{game_id}") as _ws1:
            with client.websocket_connect(f"/ws/games/{game_id}") as _ws2:
                bucket = wm._connections.get(game_id)
                assert bucket is not None
                assert len(bucket) == 2
    finally:
        wm._connections.pop(game_id, None)
