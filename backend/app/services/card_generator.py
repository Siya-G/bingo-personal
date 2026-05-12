import random
import secrets

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.models import BingoCard, BingoCardCell, BingoItem, Game, Player
from app.schemas import BingoCardResponse

from app.services.card_marking import bingo_card_cell_to_response

CARD_SIZE = 5


def _card_cell_count() -> int:
    """Cells per card (5×5 = 25). Kept in settings for env tuning / documentation."""
    return settings.bingo_card_cell_count


def generate_cards_for_game(game: Game, db: Session) -> list[BingoCardResponse]:
    """Create one 5x5 Bingo card for each player in a game.

    Existing cards are returned as-is to keep repeated calls idempotent during
    development and avoid accidentally replacing player cards.
    """
    existing_cards = get_assigned_cards_for_game(game.id, db)
    if existing_cards:
        return [build_card_response(card) for card in existing_cards]

    players = list(
        db.scalars(
            select(Player).where(Player.game_id == game.id).order_by(Player.id.asc())
        )
    )
    if not players:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot generate cards because this game has no players.",
        )

    items = get_available_items_for_game(game.id, db)
    cell_count = _card_cell_count()

    created_cards: list[BingoCard] = []
    used_layouts: set[tuple[int, ...]] = set()

    for player in players:
        card = create_card_for_player(
            game_id=game.id,
            player_id=player.id,
            items=items,
            used_layouts=used_layouts,
            cell_count=cell_count,
            db=db,
        )
        created_cards.append(card)

    db.commit()

    return [
        build_card_response(card)
        for card in get_cards_for_game(game.id, db)
        if card.id in {created_card.id for created_card in created_cards}
    ]


def assign_card_to_player(
    game_id: int,
    player_id: int,
    db: Session,
) -> BingoCardResponse:
    """Assign an existing unclaimed card or create a fresh unique card."""
    existing_player_card = get_player_card(game_id=game_id, player_id=player_id, db=db)
    if existing_player_card is not None:
        return existing_player_card

    unassigned_card = db.scalar(
        select(BingoCard)
        .options(selectinload(BingoCard.cells).selectinload(BingoCardCell.item))
        .where(BingoCard.game_id == game_id, BingoCard.player_id.is_(None))
        .order_by(BingoCard.id.asc())
    )
    if unassigned_card is not None:
        unassigned_card.player_id = player_id
        db.commit()
        return get_required_player_card(game_id=game_id, player_id=player_id, db=db)

    items = get_available_items_for_game(game_id=game_id, db=db)
    used_layouts = get_existing_layouts_for_game(game_id=game_id, db=db)
    card = create_card_for_player(
        game_id=game_id,
        player_id=player_id,
        items=items,
        used_layouts=used_layouts,
        cell_count=_card_cell_count(),
        db=db,
    )
    db.commit()

    return get_required_player_card(game_id=game_id, player_id=card.player_id, db=db)


def get_player_card(
    game_id: int,
    player_id: int,
    db: Session,
) -> BingoCardResponse | None:
    card = db.scalar(
        select(BingoCard)
        .options(selectinload(BingoCard.cells).selectinload(BingoCardCell.item))
        .where(BingoCard.game_id == game_id, BingoCard.player_id == player_id)
    )
    if card is None:
        return None

    return build_card_response(card)


def get_required_player_card(
    game_id: int,
    player_id: int | None,
    db: Session,
) -> BingoCardResponse:
    if player_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Assigned card is missing a player.",
        )

    card = get_player_card(game_id=game_id, player_id=player_id, db=db)
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Assigned card could not be loaded.",
        )

    return card


def get_cards_for_game(game_id: int, db: Session) -> list[BingoCard]:
    return list(
        db.scalars(
            select(BingoCard)
            .options(selectinload(BingoCard.cells).selectinload(BingoCardCell.item))
            .where(BingoCard.game_id == game_id)
            .order_by(BingoCard.player_id.asc())
        )
    )


def get_assigned_cards_for_game(game_id: int, db: Session) -> list[BingoCard]:
    return list(
        db.scalars(
            select(BingoCard)
            .options(selectinload(BingoCard.cells).selectinload(BingoCardCell.item))
            .where(BingoCard.game_id == game_id, BingoCard.player_id.is_not(None))
            .order_by(BingoCard.player_id.asc())
        )
    )


def get_available_items_for_game(game_id: int, db: Session) -> list[BingoItem]:
    items = list(
        db.scalars(
            select(BingoItem)
            .where(BingoItem.game_id == game_id)
            .order_by(BingoItem.id.asc())
        )
    )
    need = settings.bingo_card_cell_count
    if len(items) < need:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"The shared Bingo pool has {len(items)} items; each 5×5 card needs "
                f"{need} unique cells. Generate the item pool first (default target "
                f"{settings.bingo_item_pool_size} items)."
            ),
        )

    return items


def get_existing_layouts_for_game(game_id: int, db: Session) -> set[tuple[int, ...]]:
    layouts: set[tuple[int, ...]] = set()
    for card in get_cards_for_game(game_id=game_id, db=db):
        sorted_cells = sorted(card.cells, key=lambda cell: (cell.row, cell.column))
        layouts.add(tuple(cell.item_id for cell in sorted_cells))

    return layouts


def create_card_for_player(
    game_id: int,
    player_id: int,
    items: list[BingoItem],
    used_layouts: set[tuple[int, ...]],
    cell_count: int,
    db: Session,
) -> BingoCard:
    shuffled_items = _unique_shuffled_items(
        items,
        used_layouts,
        cell_count=cell_count,
    )
    card = BingoCard(game_id=game_id, player_id=player_id)
    db.add(card)
    db.flush()

    for index, item in enumerate(shuffled_items):
        db.add(
            BingoCardCell(
                card_id=card.id,
                item_id=item.id,
                row=index // CARD_SIZE,
                column=index % CARD_SIZE,
                is_marked=False,
            )
        )

    return card


def build_card_response(card: BingoCard) -> BingoCardResponse:
    if card.player_id is None:
        raise ValueError("Cannot serialize an unassigned card as a player card.")

    sorted_cells = sorted(card.cells, key=lambda cell: (cell.row, cell.column))
    rows: list[list[BingoCardCellResponse]] = [[] for _ in range(CARD_SIZE)]

    for cell in sorted_cells:
        rows[cell.row].append(bingo_card_cell_to_response(cell))

    return BingoCardResponse(
        card_id=card.id,
        player_id=card.player_id,
        grid=rows,
    )


def _unique_shuffled_items(
    items: list[BingoItem],
    used_layouts: set[tuple[int, ...]],
    *,
    cell_count: int,
) -> list[BingoItem]:
    """Pick ``cell_count`` distinct items from the shared pool with per-card randomness."""
    if len(items) < cell_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot build a card: pool has {len(items)} items but {cell_count} "
                "distinct cells are required."
            ),
        )

    rng = random.Random(secrets.randbits(128))
    selected_items = rng.sample(items, cell_count)

    for _ in range(40):
        rng.shuffle(selected_items)
        layout = tuple(item.id for item in selected_items)
        if layout not in used_layouts:
            used_layouts.add(layout)
            return selected_items

    layout = tuple(item.id for item in selected_items)
    used_layouts.add(layout)
    return selected_items
