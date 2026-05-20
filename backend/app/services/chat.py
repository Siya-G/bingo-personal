"""Persistence + broadcast for per-room live chat.

Used by the HTTP endpoints in ``app.routes.chat`` and by the game/gameplay
routes to emit ``SYSTEM`` messages ("player joined", "Everest was called", ...)
without pulling chat logic into every route.
"""

from __future__ import annotations

import logging
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChatMessage
from app.models.chat import (
    CHAT_MESSAGE_MAX_LENGTH,
    CHAT_ROLES,
    CHAT_SENDER_NAME_MAX_LENGTH,
)
from app.schemas.chat import ChatMessageResponse, SenderRole
from app.services.websocket_manager import schedule_broadcast

logger = logging.getLogger(__name__)


class ChatValidationError(ValueError):
    """Raised when the chat input fails server-side validation.

    The chat route maps this to ``422`` so the frontend can surface the
    underlying reason ("message is empty", "too long", ...) directly.
    """


def _normalize_message(raw: str) -> str:
    stripped = (raw or "").strip()
    if not stripped:
        raise ChatValidationError("Message cannot be empty or whitespace only.")
    if len(stripped) > CHAT_MESSAGE_MAX_LENGTH:
        raise ChatValidationError(
            f"Message is too long (max {CHAT_MESSAGE_MAX_LENGTH} characters)."
        )
    return stripped


def _normalize_sender_name(raw: str) -> str:
    stripped = (raw or "").strip()
    if not stripped:
        raise ChatValidationError("Sender name cannot be empty.")
    if len(stripped) > CHAT_SENDER_NAME_MAX_LENGTH:
        stripped = stripped[:CHAT_SENDER_NAME_MAX_LENGTH]
    return stripped


def _to_response(row: ChatMessage) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=row.id,
        game_id=row.game_id,
        sender_id=row.sender_id,
        sender_name=row.sender_name,
        sender_role=row.sender_role,  # type: ignore[arg-type]
        message=row.message,
        created_at=row.created_at,
    )


def _broadcast(message: ChatMessageResponse) -> None:
    """Push the chat row to every WebSocket client in the game room.

    Intentionally fire-and-forget — POST already returns the saved row, so a
    broadcast failure must never undo a successful save.
    """
    try:
        schedule_broadcast(
            message.game_id,
            {
                "type": "CHAT_MESSAGE",
                "payload": message.model_dump(mode="json"),
            },
        )
    except Exception:
        logger.exception(
            "Failed to broadcast chat message id=%s game_id=%s",
            message.id,
            message.game_id,
        )


def create_chat_message(
    *,
    db: Session,
    game_id: int,
    sender_role: SenderRole,
    sender_name: str,
    sender_id: int | None,
    message: str,
) -> ChatMessageResponse:
    """Validate, persist, broadcast — used by HTTP and by SYSTEM helpers.

    Callers must ensure the game exists; the route layer enforces that with
    ``get_game_or_404`` so we don't redundantly hit the DB here.
    """
    if sender_role not in CHAT_ROLES:
        raise ChatValidationError(
            f"Invalid sender role; expected one of {', '.join(CHAT_ROLES)}."
        )
    clean_message = _normalize_message(message)
    clean_name = _normalize_sender_name(sender_name)

    row = ChatMessage(
        game_id=game_id,
        sender_id=sender_id,
        sender_name=clean_name,
        sender_role=sender_role,
        message=clean_message,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    response = _to_response(row)
    _broadcast(response)
    return response


def list_chat_messages(
    *,
    db: Session,
    game_id: int,
    limit: int = 200,
) -> Sequence[ChatMessageResponse]:
    """Recent messages in chronological order (oldest first).

    We cap at ``limit`` newest rows in SQL, then re-sort ascending in Python so
    the UI can append new messages to the end without resorting.
    """
    rows = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.game_id == game_id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit)
        )
    )
    rows.reverse()
    return [_to_response(row) for row in rows]


def create_system_chat_message(
    *,
    db: Session,
    game_id: int,
    message: str,
) -> ChatMessageResponse | None:
    """Wrapper used by game/gameplay routes for "player joined", "Bingo!", etc.

    Returns ``None`` (instead of raising) when validation fails — system events
    are best-effort and must not break the underlying action.
    """
    try:
        return create_chat_message(
            db=db,
            game_id=game_id,
            sender_role="SYSTEM",
            sender_name="System",
            sender_id=None,
            message=message,
        )
    except ChatValidationError:
        logger.warning(
            "Skipping invalid SYSTEM chat message game_id=%s message=%r",
            game_id,
            message,
        )
        return None
    except Exception:
        logger.exception(
            "Unexpected error creating SYSTEM chat message game_id=%s", game_id
        )
        return None


__all__ = [
    "ChatValidationError",
    "create_chat_message",
    "create_system_chat_message",
    "list_chat_messages",
]
