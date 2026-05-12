"""Shared game loading helpers for routes and dependencies."""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Game


def get_game_or_404(game_id: int, db: Session) -> Game:
    game = db.get(Game, game_id)
    if game is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No game exists with this ID. Check the ID and try again.",
        )
    return game
