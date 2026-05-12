import random

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import BingoItem, CalledItem, Game
from app.schemas import CalledItemResponse


def start_game(game: Game, db: Session) -> Game:
    """Move a waiting game into active play.

    Starting an already-active game is idempotent so a host can safely retry.
    Completed games cannot be restarted in this phase.
    """
    if game.status == "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completed games cannot be started again.",
        )

    if game.status == "WAITING":
        game.status = "ACTIVE"
        db.commit()
        db.refresh(game)

    return game


def call_next_item(game: Game, db: Session) -> CalledItemResponse:
    if game.status == "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This game is completed. No more items can be called.",
        )

    if game.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Items can only be called after the game is active.",
        )

    uncalled_items = list(
        db.scalars(
            select(BingoItem)
            .where(BingoItem.game_id == game.id, BingoItem.is_called.is_(False))
            .order_by(BingoItem.id.asc())
        )
    )
    if not uncalled_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No uncalled Bingo items remain for this game.",
        )

    next_order = (
        db.scalar(
            select(func.max(CalledItem.call_order)).where(CalledItem.game_id == game.id)
        )
        or 0
    ) + 1
    item = random.choice(uncalled_items)
    item.is_called = True
    item.called_order = next_order

    called_item = CalledItem(
        game_id=game.id,
        bingo_item_id=item.id,
        call_order=next_order,
    )
    db.add(called_item)
    db.commit()
    db.refresh(called_item)
    db.refresh(item)

    return CalledItemResponse(
        item_id=item.id,
        word=item.word,
        description=item.description,
        called_order=called_item.call_order,
        called_at=called_item.called_at,
    )


def get_called_items(game_id: int, db: Session) -> list[CalledItemResponse]:
    called_items = list(
        db.scalars(
            select(CalledItem)
            .options(selectinload(CalledItem.bingo_item))
            .where(CalledItem.game_id == game_id)
            .order_by(CalledItem.call_order.asc())
        )
    )

    return [
        CalledItemResponse(
            item_id=called_item.bingo_item_id,
            word=called_item.bingo_item.word,
            description=called_item.bingo_item.description,
            called_order=called_item.call_order,
            called_at=called_item.called_at,
        )
        for called_item in called_items
    ]
