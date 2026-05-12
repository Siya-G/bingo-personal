"""Append-only audit trail for host-facing game history."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent
from app.schemas.game import AuditEventResponse
from app.services.websocket_manager import notify_audit_event_created

logger = logging.getLogger(__name__)


def create_audit_event(
    db: Session,
    game_id: int,
    event_type: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    """Persist one audit row, commit, and push it to WebSocket subscribers."""
    meta = metadata or {}
    safe_message = message[:500] if len(message) > 500 else message
    row = AuditEvent(
        game_id=game_id,
        event_type=event_type,
        message=safe_message,
        metadata_json=json.dumps(meta, default=str),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    try:
        notify_audit_event_created(game_id, audit_event_to_ws_payload(row))
    except Exception:
        logger.exception("Failed to broadcast audit event game_id=%s", game_id)

    return row


def audit_event_to_ws_payload(event: AuditEvent) -> dict[str, Any]:
    """Shape used by both HTTP responses and the AUDIT_EVENT_CREATED WebSocket."""
    return {
        "id": event.id,
        "event_type": event.event_type,
        "message": event.message,
        "metadata": json.loads(event.metadata_json or "{}"),
        "created_at": event.created_at.isoformat(),
    }


def audit_event_to_response(event: AuditEvent) -> AuditEventResponse:
    """Map ORM row to API schema (metadata is stored as JSON text in SQLite)."""
    return AuditEventResponse(
        id=event.id,
        event_type=event.event_type,
        message=event.message,
        metadata=json.loads(event.metadata_json or "{}"),
        created_at=event.created_at,
    )


def list_audit_events_for_game(game_id: int, db: Session) -> list[AuditEvent]:
    """Newest events first — natural order for a live host timeline."""
    return list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.game_id == game_id)
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        )
    )
