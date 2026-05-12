"""In-memory WebSocket fan-out per game (single-server; no Redis yet).

The HTTP handlers that change game state call ``schedule_broadcast`` so this
module can push JSON events to every browser tab connected to that game.
The asyncio loop is registered at app startup so sync SQL routes can safely
queue sends from worker threads.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy.orm import Session
from starlette.websockets import WebSocket, WebSocketState

from app.models import Game
from app.schemas import BingoClaimResponse, CalledItemResponse
from app.services.leaderboard import get_game_leaderboard

logger = logging.getLogger(__name__)

# game_id -> active WebSocket connections for that room
_connections: dict[int, set[WebSocket]] = {}
_lock = asyncio.Lock()
_main_loop: asyncio.AbstractEventLoop | None = None


def set_broadcast_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Called from FastAPI lifespan so sync routes can schedule broadcasts."""
    global _main_loop
    _main_loop = loop


async def connect(game_id: int, websocket: WebSocket) -> None:
    async with _lock:
        if game_id not in _connections:
            _connections[game_id] = set()
        _connections[game_id].add(websocket)


async def disconnect(game_id: int, websocket: WebSocket) -> None:
    async with _lock:
        bucket = _connections.get(game_id)
        if not bucket:
            return
        bucket.discard(websocket)
        if not bucket:
            del _connections[game_id]


async def broadcast_to_game(game_id: int, message: dict[str, Any]) -> None:
    """Send one JSON message to every live client in the room."""
    async with _lock:
        sockets = list(_connections.get(game_id, ()))

    stale: list[WebSocket] = []
    for ws in sockets:
        try:
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.send_json(message)
        except Exception:
            stale.append(ws)

    for ws in stale:
        await disconnect(game_id, ws)


def schedule_broadcast(game_id: int, message: dict[str, Any]) -> None:
    """Queue ``broadcast_to_game`` on the main event loop (safe from sync code)."""
    if _main_loop is None:
        logger.warning("WebSocket broadcast skipped: event loop not registered.")
        return

    async def _run() -> None:
        await broadcast_to_game(game_id, message)

    future = asyncio.run_coroutine_threadsafe(_run(), _main_loop)

    def _log_failure(fut: asyncio.Future[Any]) -> None:
        try:
            fut.result()
        except Exception:
            logger.exception("WebSocket broadcast failed for game_id=%s", game_id)

    future.add_done_callback(_log_failure)


def notify_new_called_item(game_id: int, item: CalledItemResponse) -> None:
    payload = item.model_dump(mode="json")
    schedule_broadcast(
        game_id,
        {"type": "NEW_CALLED_ITEM", "payload": payload},
    )


def notify_card_cell_updated(
    game_id: int, player_id: int, cell_id: int, is_marked: bool
) -> None:
    schedule_broadcast(
        game_id,
        {
            "type": "CARD_CELL_UPDATED",
            "payload": {
                "player_id": player_id,
                "cell_id": cell_id,
                "is_marked": is_marked,
            },
        },
    )


def notify_bingo_claimed(game_id: int, result: BingoClaimResponse) -> None:
    schedule_broadcast(
        game_id,
        {
            "type": "BINGO_CLAIMED",
            "payload": result.model_dump(mode="json"),
        },
    )


def notify_leaderboard_updated(game_id: int, game: Game, db: Session) -> None:
    board = get_game_leaderboard(game=game, db=db)
    winners = [w.model_dump(mode="json") for w in board.winners]
    schedule_broadcast(
        game_id,
        {
            "type": "LEADERBOARD_UPDATED",
            "payload": {
                "game_id": board.game_id,
                "game_title": board.game_title,
                "game_status": board.game_status,
                "winners": winners,
            },
        },
    )


def notify_game_completed(game_id: int) -> None:
    schedule_broadcast(
        game_id,
        {
            "type": "GAME_COMPLETED",
            "payload": {"game_id": game_id, "status": "COMPLETED"},
        },
    )


def notify_audit_event_created(game_id: int, payload: dict[str, Any]) -> None:
    """Push a new timeline row to every host/player tab watching this game."""
    schedule_broadcast(
        game_id,
        {"type": "AUDIT_EVENT_CREATED", "payload": payload},
    )


def notify_prize_notification_created(game_id: int, payload: dict[str, Any]) -> None:
    """Tell clients to show the on-screen winner / prize banner."""
    schedule_broadcast(
        game_id,
        {"type": "PRIZE_NOTIFICATION_CREATED", "payload": payload},
    )


__all__ = [
    "broadcast_to_game",
    "connect",
    "disconnect",
    "notify_audit_event_created",
    "notify_bingo_claimed",
    "notify_card_cell_updated",
    "notify_game_completed",
    "notify_leaderboard_updated",
    "notify_new_called_item",
    "notify_prize_notification_created",
    "schedule_broadcast",
    "set_broadcast_loop",
]
