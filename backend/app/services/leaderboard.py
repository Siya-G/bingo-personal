"""Build leaderboard payloads for a game."""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Game, Winner
from app.schemas.game import GameLeaderboardResponse, LeaderboardWinnerEntry


def get_game_leaderboard(game: Game, db: Session) -> GameLeaderboardResponse:
    """Return game metadata and winners ordered by rank (ascending)."""
    winners = list(
        db.scalars(
            select(Winner)
            .options(selectinload(Winner.player))
            .where(Winner.game_id == game.id)
            .order_by(Winner.rank.asc())
        )
    )

    entries: list[LeaderboardWinnerEntry] = []
    for row in winners:
        player_name = row.player.name if row.player is not None else "Unknown"
        entries.append(
            LeaderboardWinnerEntry(
                rank=row.rank,
                player_id=row.player_id,
                player_name=player_name,
                created_at=row.created_at,
            )
        )

    return GameLeaderboardResponse(
        game_id=game.id,
        game_title=game.title,
        game_status=game.status,
        winners=entries,
    )
