"""Per-room chat messages (host, players, and SYSTEM lines)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base

# Mirror of ``Literal[...]`` used in schemas — kept here as a tuple so the model
# layer can validate without importing pydantic.
CHAT_ROLES: tuple[str, ...] = ("HOST", "PLAYER", "SYSTEM")
CHAT_MESSAGE_MAX_LENGTH = 500
CHAT_SENDER_NAME_MAX_LENGTH = 120


class ChatMessage(Base):
    """One message posted to a game room's live chat.

    ``sender_id`` is ``NULL`` for ``SYSTEM`` messages and for ``HOST`` messages
    (the host is identified by PIN, not by a row in ``players``). ``sender_name``
    is captured at write time so chat history stays readable even if a player
    record is later renamed or removed.
    """

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sender_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sender_name: Mapped[str] = mapped_column(
        String(CHAT_SENDER_NAME_MAX_LENGTH),
        nullable=False,
    )
    sender_role: Mapped[str] = mapped_column(String(16), nullable=False)
    message: Mapped[str] = mapped_column(
        String(CHAT_MESSAGE_MAX_LENGTH),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    game: Mapped["Game"] = relationship(back_populates="chat_messages")
