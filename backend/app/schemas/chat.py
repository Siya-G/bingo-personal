"""Schemas for per-room live chat (host, players, system)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.chat import CHAT_MESSAGE_MAX_LENGTH, CHAT_SENDER_NAME_MAX_LENGTH

SenderRole = Literal["HOST", "PLAYER", "SYSTEM"]


class ChatMessageCreate(BaseModel):
    """Body for POST /games/{game_id}/chat.

    ``sender_role`` is restricted to ``HOST`` or ``PLAYER`` over HTTP — SYSTEM
    messages are only produced server-side via ``create_system_chat_message``.
    """

    sender_id: int | None = Field(
        default=None,
        description="Player ID for PLAYER messages; null for HOST messages.",
    )
    sender_name: str = Field(..., min_length=1, max_length=CHAT_SENDER_NAME_MAX_LENGTH)
    sender_role: Literal["HOST", "PLAYER"]
    message: str = Field(..., min_length=1, max_length=CHAT_MESSAGE_MAX_LENGTH)

    @field_validator("sender_name", "message")
    @classmethod
    def strip_required(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("This field cannot be empty or whitespace only.")
        return stripped


class ChatMessageResponse(BaseModel):
    """Shape returned by GET /games/{game_id}/chat and the WebSocket broadcast."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    game_id: int
    sender_id: int | None
    sender_name: str
    sender_role: SenderRole
    message: str
    created_at: datetime
