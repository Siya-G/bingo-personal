from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class PrizeNotification(Base):
    """On-screen prize / winner notice for MVP (no email or gift card delivery yet)."""

    __tablename__ = "prize_notifications"
    __table_args__ = (
        UniqueConstraint("winner_id", name="uq_prize_notifications_winner"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    winner_id: Mapped[int] = mapped_column(
        ForeignKey("winners.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="PENDING", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    game: Mapped["Game"] = relationship(back_populates="prize_notifications")
    player: Mapped["Player"] = relationship(back_populates="prize_notifications")
    winner: Mapped["Winner"] = relationship(back_populates="prize_notification")
