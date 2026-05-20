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

from app.models import ChatMessage, ModerationEvent
from app.models.chat import (
    CHAT_MESSAGE_MAX_LENGTH,
    CHAT_ROLES,
    CHAT_SENDER_NAME_MAX_LENGTH,
    MODERATION_DETAIL_MAX_LENGTH,
)
from app.schemas.chat import ChatMessageResponse, SenderRole
from app.services.chat_moderation import (
    ModerationDecision,
    moderate_chat_message,
)
from app.services.websocket_manager import schedule_broadcast

logger = logging.getLogger(__name__)


class ChatValidationError(ValueError):
    """Raised when the chat input fails server-side validation.

    The chat route maps this to ``422`` so the frontend can surface the
    underlying reason ("message is empty", "too long", ...) directly.
    """


class ChatModerationBlocked(Exception):
    """Raised when the moderation pipeline rejects a chat message.

    The chat route catches this and returns a 422 with a structured detail
    payload (``error`` + ``reason``) so the frontend can show a sender-only
    moderation notice without leaking the blocked content to the room.
    """

    def __init__(self, decision: ModerationDecision) -> None:
        super().__init__(
            f"Message blocked by chat moderation (reason={decision.reason})"
        )
        self.decision = decision


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


def record_moderation_event(
    *,
    db: Session,
    game_id: int,
    sender_role: str,
    sender_name: str,
    sender_id: int | None,
    original_message: str,
    decision: ModerationDecision,
) -> ModerationEvent:
    """Persist a blocked-message audit row. Never appears in chat history."""
    clean_name = (sender_name or "").strip()[:CHAT_SENDER_NAME_MAX_LENGTH] or "Unknown"
    safe_original = (original_message or "")[:CHAT_MESSAGE_MAX_LENGTH]
    detail = (
        decision.detail[:MODERATION_DETAIL_MAX_LENGTH]
        if decision.detail is not None
        else None
    )
    row = ModerationEvent(
        game_id=game_id,
        sender_id=sender_id,
        sender_name=clean_name,
        sender_role=sender_role,
        original_message=safe_original,
        reason=decision.reason or "inappropriate_language",
        detail=detail,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_chat_message(
    *,
    db: Session,
    game_id: int,
    sender_role: SenderRole,
    sender_name: str,
    sender_id: int | None,
    message: str,
) -> ChatMessageResponse:
    """Validate, moderate, persist, broadcast — used by HTTP and SYSTEM helpers.

    Callers must ensure the game exists; the route layer enforces that with
    ``get_game_or_404`` so we don't redundantly hit the DB here.

    Moderation runs *before* persistence. When the decision is "block" we
    raise :class:`ChatModerationBlocked` with the decision so the route layer
    can both record an audit event and return a structured 422 response. The
    blocked message is never written to ``chat_messages`` and never reaches
    the WebSocket broadcaster.
    """
    if sender_role not in CHAT_ROLES:
        raise ChatValidationError(
            f"Invalid sender role; expected one of {', '.join(CHAT_ROLES)}."
        )
    clean_message = _normalize_message(message)
    clean_name = _normalize_sender_name(sender_name)

    decision = moderate_chat_message(
        message=clean_message,
        sender_role=sender_role,
    )
    if not decision.allowed:
        raise ChatModerationBlocked(decision)

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

    Returns ``None`` (instead of raising) when validation/moderation fails —
    system events are best-effort and must not break the underlying action.
    Moderation still runs against SYSTEM messages so a bug that injects raw
    HTML never reaches the DB.
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
    except ChatModerationBlocked as exc:
        logger.warning(
            "Blocked SYSTEM chat message game_id=%s reason=%s message=%r",
            game_id,
            exc.decision.reason,
            message,
        )
        return None
    except Exception:
        logger.exception(
            "Unexpected error creating SYSTEM chat message game_id=%s", game_id
        )
        return None


__all__ = [
    "ChatModerationBlocked",
    "ChatValidationError",
    "create_chat_message",
    "create_system_chat_message",
    "list_chat_messages",
    "record_moderation_event",
]
