"""WebSocket endpoint for live game updates."""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.websocket_manager import connect, disconnect

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/games/{game_id}")
async def game_events_socket(websocket: WebSocket, game_id: int) -> None:
    """One connection per tab; all tabs for the same ``game_id`` share events.

    Clients may send occasional ping text; we only need the socket open to
    receive server pushes.
    """
    await websocket.accept()
    await connect(game_id, websocket)
    logger.debug("WebSocket connected game_id=%s", game_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected game_id=%s", game_id)
    finally:
        await disconnect(game_id, websocket)
