"""Topic-level item cache: read, write, clear."""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.topic_item_cache import TopicItemCache
from app.services.item_generator import GeneratedItem

logger = logging.getLogger(__name__)


def normalize_topic_key(topic: str) -> str:
    """Canonical cache key: lowercase, stripped whitespace.

    ``"AI Concepts "`` → ``"ai concepts"``
    """
    return topic.strip().lower()


def get_cached_items(db: Session, topic: str) -> list[GeneratedItem] | None:
    """Return cached items for *topic* and increment hit_count, or None on miss."""
    key = normalize_topic_key(topic)
    row = db.scalar(
        select(TopicItemCache).where(TopicItemCache.topic_key == key)
    )
    if row is None:
        return None

    row.hit_count += 1
    db.commit()

    data = json.loads(row.items)
    return [
        GeneratedItem(word=item["word"], description=item["description"])
        for item in data
    ]


def save_cached_items(
    db: Session,
    topic: str,
    items: list[GeneratedItem],
) -> None:
    """Enqueue a new cache row for *topic* into the session (write-once).

    This function deliberately does NOT call ``db.commit()`` — the caller is
    expected to commit the session after all related inserts are complete.
    Keeping everything in a single transaction avoids SQLite write-lock
    contention and ensures atomicity with the BingoItem rows.
    """
    key = normalize_topic_key(topic)
    existing = db.scalar(
        select(TopicItemCache).where(TopicItemCache.topic_key == key)
    )
    if existing is not None:
        # Already cached (possible if two games share a topic in the same
        # session).  Leave the existing entry untouched.
        return

    row = TopicItemCache(
        topic_key=key,
        items=json.dumps(
            [{"word": i.word, "description": i.description} for i in items]
        ),
        hit_count=0,
    )
    db.add(row)
    logger.info("Topic cache row queued for key=%r (%d items)", key, len(items))


def clear_all_topic_cache(db: Session) -> int:
    """Delete every cached topic entry. Returns the number of rows deleted."""
    rows = list(db.scalars(select(TopicItemCache)))
    count = len(rows)
    for row in rows:
        db.delete(row)
    db.commit()
    logger.info("Topic cache cleared: %d entries removed", count)
    return count
