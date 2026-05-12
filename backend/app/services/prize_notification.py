"""Create and list on-screen prize notices for winners (MVP — no outbound email yet)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import PrizeNotification
from app.schemas.game import PrizeNotificationResponse
from app.services.audit_log import create_audit_event
from app.services.websocket_manager import notify_prize_notification_created


def _place_label(rank: int) -> str:
    """Human-readable placement for ranks 1–3 (this game caps at three winners)."""
    labels = {1: "1st", 2: "2nd", 3: "3rd"}
    return labels.get(rank, f"{rank}th")


def create_prize_notification_for_new_winner(
    db: Session,
    *,
    game_id: int,
    player_id: int,
    player_name: str,
    winner_id: int,
    rank: int,
) -> PrizeNotification:
    """Insert a pending prize row, audit it, and broadcast to WebSocket clients."""
    place = _place_label(rank)
    message = (
        f"Congratulations {player_name}! You won {place} place. "
        "Prize details will be shared by the host."
    )
    row = PrizeNotification(
        game_id=game_id,
        player_id=player_id,
        winner_id=winner_id,
        rank=rank,
        message=message[:500],
        status="PENDING",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    create_audit_event(
        db,
        game_id,
        "PRIZE_NOTIFICATION_CREATED",
        f"Prize notice created for {player_name} (rank {rank}).",
        {
            "notification_id": row.id,
            "winner_id": winner_id,
            "player_id": player_id,
            "rank": rank,
        },
    )

    notify_prize_notification_created(
        game_id,
        {
            "id": row.id,
            "game_id": game_id,
            "player_id": player_id,
            "player_name": player_name,
            "winner_id": winner_id,
            "rank": rank,
            "message": row.message,
            "status": row.status,
            "created_at": row.created_at.isoformat(),
        },
    )

    return row


def list_prize_notifications_for_game(game_id: int, db: Session) -> list[PrizeNotification]:
    return list(
        db.scalars(
            select(PrizeNotification)
            .options(selectinload(PrizeNotification.player))
            .where(PrizeNotification.game_id == game_id)
            .order_by(PrizeNotification.created_at.desc(), PrizeNotification.id.desc())
        )
    )


def prize_notification_to_response(row: PrizeNotification) -> PrizeNotificationResponse:
    player_name = row.player.name if row.player is not None else "Unknown"
    return PrizeNotificationResponse(
        id=row.id,
        game_id=row.game_id,
        player_id=row.player_id,
        player_name=player_name,
        winner_id=row.winner_id,
        rank=row.rank,
        message=row.message,
        status=row.status,
        created_at=row.created_at,
    )


def mark_prize_notification_displayed(
    game_id: int, notification_id: int, db: Session
) -> PrizeNotification | None:
    row = db.scalar(
        select(PrizeNotification).where(
            PrizeNotification.id == notification_id,
            PrizeNotification.game_id == game_id,
        )
    )
    if row is None:
        return None
    row.status = "DISPLAYED"
    db.commit()
    db.refresh(row)
    return row
