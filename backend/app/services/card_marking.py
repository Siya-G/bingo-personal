from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import BingoCardCell, Player
from app.schemas import BingoCardCellResponse


def bingo_card_cell_to_response(cell: BingoCardCell) -> BingoCardCellResponse:
    """Map an ORM cell (with `item` loaded) to the public API shape."""
    return BingoCardCellResponse(
        cell_id=cell.id,
        item_id=cell.item_id,
        word=cell.item.word,
        description=cell.item.description,
        row=cell.row,
        column=cell.column,
        is_marked=cell.is_marked,
        is_item_called=cell.item.is_called,
    )


def toggle_card_cell_mark(
    game_id: int,
    player_id: int,
    cell_id: int,
    db: Session,
) -> BingoCardCellResponse:
    """Toggle a card cell's mark only when its Bingo item has been called."""
    player = db.scalar(
        select(Player).where(Player.id == player_id, Player.game_id == game_id)
    )
    if player is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Player not found for this game",
        )

    cell = db.scalar(
        select(BingoCardCell)
        .options(
            selectinload(BingoCardCell.card),
            selectinload(BingoCardCell.item),
        )
        .where(BingoCardCell.id == cell_id)
    )
    if cell is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card cell not found",
        )

    card = cell.card
    if card is None or card.game_id != game_id or card.player_id != player_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card cell not found for this player",
        )

    if not cell.item.is_called:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This item has not been called yet.",
        )

    cell.is_marked = not cell.is_marked
    db.commit()
    db.refresh(cell)

    return bingo_card_cell_to_response(cell)
