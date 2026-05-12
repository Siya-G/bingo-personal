"""Server-side Bingo pattern validation for player claims."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import BingoCard, BingoCardCell, Game, Player, Winner
from app.schemas.game import BingoClaimResponse, PlayerWinnerStatusResponse
from app.services.prize_notification import create_prize_notification_for_new_winner


def _valid_mark(cell: BingoCardCell) -> bool:
    """A square counts only if it is marked and the item was called."""
    return bool(cell.is_marked and cell.item.is_called)


def _build_validity_grid(cells: list[BingoCardCell]) -> list[list[bool]]:
    """5x5 grid indexed [row][column]."""
    grid: list[list[bool]] = [[False] * 5 for _ in range(5)]
    for cell in cells:
        grid[cell.row][cell.column] = _valid_mark(cell)
    return grid


def _has_full_row(valid: list[list[bool]]) -> bool:
    return any(all(valid[r][c] for c in range(5)) for r in range(5))


def _has_full_column(valid: list[list[bool]]) -> bool:
    return any(all(valid[r][c] for r in range(5)) for c in range(5))


def _has_main_diagonal(valid: list[list[bool]]) -> bool:
    return all(valid[i][i] for i in range(5))


def _has_anti_diagonal(valid: list[list[bool]]) -> bool:
    return all(valid[i][4 - i] for i in range(5))


def _has_full_house(valid: list[list[bool]]) -> bool:
    return all(valid[r][c] for r in range(5) for c in range(5))


def _pattern_satisfied(pattern: str, valid: list[list[bool]]) -> bool:
    key = pattern.strip().upper().replace(" ", "_")

    if key == "HORIZONTAL_ROW":
        return _has_full_row(valid)
    if key == "VERTICAL_COLUMN":
        return _has_full_column(valid)
    if key == "DIAGONAL":
        return _has_main_diagonal(valid) or _has_anti_diagonal(valid)
    if key == "FULL_HOUSE":
        return _has_full_house(valid)

    return False


def claim_bingo(game: Game, player: Player, db: Session) -> BingoClaimResponse:
    """Validate a Bingo claim and record a winner when appropriate."""
    existing = db.scalar(
        select(Winner).where(
            Winner.game_id == game.id,
            Winner.player_id == player.id,
        )
    )
    if existing is not None:
        return BingoClaimResponse(
            success=True,
            message="You already have a winning placement for this game.",
            player_id=player.id,
            player_name=player.name,
            rank=existing.rank,
        )

    if game.status == "COMPLETED":
        return BingoClaimResponse(
            success=False,
            message="This game is completed. No new Bingo claims are accepted.",
        )

    card = db.scalar(
        select(BingoCard)
        .options(
            selectinload(BingoCard.cells).selectinload(BingoCardCell.item),
        )
        .where(
            BingoCard.game_id == game.id,
            BingoCard.player_id == player.id,
        )
    )
    if card is None or not card.cells:
        return BingoClaimResponse(
            success=False,
            message="No Bingo card was found for this player.",
        )

    winner_count = int(
        db.scalar(select(func.count()).select_from(Winner).where(Winner.game_id == game.id))
        or 0
    )
    if winner_count >= 3:
        return BingoClaimResponse(
            success=False,
            message="This game already has three winners.",
        )

    valid = _build_validity_grid(list(card.cells))
    if not _pattern_satisfied(game.winning_pattern, valid):
        return BingoClaimResponse(
            success=False,
            message=(
                "Your card does not complete the required winning pattern "
                "with squares that are both marked and called."
            ),
        )

    new_rank = winner_count + 1
    winner = Winner(
        game_id=game.id,
        player_id=player.id,
        rank=new_rank,
    )
    db.add(winner)
    db.commit()
    db.refresh(winner)

    create_prize_notification_for_new_winner(
        db,
        game_id=game.id,
        player_id=player.id,
        player_name=player.name,
        winner_id=winner.id,
        rank=new_rank,
    )

    total_winners = int(
        db.scalar(select(func.count()).select_from(Winner).where(Winner.game_id == game.id))
        or 0
    )
    if total_winners >= 3:
        game.status = "COMPLETED"
        db.commit()
        db.refresh(game)

    return BingoClaimResponse(
        success=True,
        message="Bingo! Your claim is valid.",
        player_id=player.id,
        player_name=player.name,
        rank=new_rank,
    )


def get_player_winner_status(
    game_id: int, player_id: int, db: Session
) -> PlayerWinnerStatusResponse:
    """Return whether this player already has a recorded win."""
    player = db.scalar(
        select(Player).where(Player.id == player_id, Player.game_id == game_id)
    )
    if player is None:
        return PlayerWinnerStatusResponse(won=False)

    winner = db.scalar(
        select(Winner).where(
            Winner.game_id == game_id,
            Winner.player_id == player_id,
        )
    )
    if winner is None:
        return PlayerWinnerStatusResponse(won=False)

    return PlayerWinnerStatusResponse(
        won=True,
        rank=winner.rank,
        player_id=player.id,
        player_name=player.name,
    )
