"""Topic-level Bingo item cache — avoids calling the AI for duplicate topics."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class TopicItemCache(Base):
    """One cached item pool per normalized topic string.

    ``topic_key`` is the lowercase-stripped topic (e.g. ``"ai concepts"``).
    ``items`` is a JSON array of ``{"word": str, "description": str}`` objects.
    ``hit_count`` tracks how many games reused this entry instead of calling the AI.
    """

    __tablename__ = "topic_item_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topic_key: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    items: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
