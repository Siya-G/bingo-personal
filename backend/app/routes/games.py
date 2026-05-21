import json
import logging
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.dependencies.game_auth import host_pin_protected_game, player_session_protected
from app.config import settings
from app.models import BingoItem, Game, Player
from app.schemas import (
    AuditEventResponse,
    BingoCardCellResponse,
    BingoCardResponse,
    BingoClaimResponse,
    BingoItemResponse,
    CalledItemResponse,
    GameCreate,
    GenerateItemsResponse,
    GameInvitesRequest,
    GameInvitesResponse,
    GameLeaderboardResponse,
    GameResponse,
    PlayerCreate,
    PlayerCreatedWithSession,
    PlayerJoinRequest,
    PlayerJoinResponse,
    PlayerResponse,
    PlayerWinnerStatusResponse,
    PrizeNotificationResponse,
)
from app.services.card_generator import generate_cards_for_game, get_player_card
from app.services.game_invites import process_game_invites
from app.services.gameplay import call_next_item, get_called_items, start_game
from app.services.llm_items import resolve_generated_items_for_game
from app.services.topic_cache import get_cached_items, save_cached_items
from app.services.player_join import join_game
from app.services.audit_log import (
    audit_event_to_response,
    create_audit_event,
    list_audit_events_for_game,
)
from app.services.chat import create_system_chat_message
from app.services.bingo_validation import claim_bingo, get_player_winner_status
from app.services.card_marking import toggle_card_cell_mark
from app.services.game_lookup import get_game_or_404
from app.services.item_generation_errors import ItemGenerationError
from app.services.leaderboard import get_game_leaderboard
from app.services.prize_notification import (
    list_prize_notifications_for_game,
    mark_prize_notification_displayed,
    prize_notification_to_response,
)
from app.services.secret_hashes import hash_secret
from app.services.websocket_manager import (
    notify_bingo_claimed,
    notify_card_cell_updated,
    notify_cards_generated,
    notify_game_completed,
    notify_leaderboard_updated,
    notify_new_called_item,
)

router = APIRouter(prefix="/games", tags=["games"])
logger = logging.getLogger(__name__)

GAME_CODE_LENGTH = 6


def _generate_items_response(
    bingo_items: list[BingoItem],
    *,
    target_count: int,
    minimum_count: int,
    warning: str | None,
    cached: bool = False,
) -> GenerateItemsResponse:
    return GenerateItemsResponse(
        items=[BingoItemResponse.model_validate(row) for row in bingo_items],
        target_count=target_count,
        actual_count=len(bingo_items),
        minimum_count=minimum_count,
        warning=warning,
        cached=cached,
    )


def _pool_shortfall_warning(actual: int, target: int) -> str | None:
    if actual >= target:
        return None
    return (
        f"Generated {actual} items instead of target {target}. "
        "The game can still continue."
    )


def generate_game_code(db: Session) -> str:
    """Generate a short unique code players can use to join a game."""
    alphabet = string.ascii_uppercase + string.digits

    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(GAME_CODE_LENGTH))
        existing_game = db.scalar(select(Game).where(Game.game_code == code))
        if existing_game is None:
            return code


# Critical path: Create Game. If imports or schema changes break this endpoint,
# the entire host flow breaks. Run test_create_game_success after any model/schema change.
@router.post("", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
def create_game(game_data: GameCreate, db: Session = Depends(get_db)) -> Game:
    logger.info(
        "POST /games received: title=%r topic=%r number_of_players=%s patterns=%s",
        game_data.title,
        game_data.topic,
        game_data.number_of_players,
        game_data.resolved_winning_patterns(),
    )
    pin_salt, pin_hash = hash_secret(game_data.host_pin)
    patterns = game_data.resolved_winning_patterns()
    game = Game(
        title=game_data.title,
        topic=game_data.topic,
        number_of_players=game_data.number_of_players,
        winning_pattern=patterns[0],
        winning_patterns_json=json.dumps(patterns),
        game_code=generate_game_code(db),
        status="WAITING",
        host_pin_salt=pin_salt,
        host_pin_hash=pin_hash,
    )

    db.add(game)
    db.commit()
    db.refresh(game)

    topic_phrase = game.topic or game.title
    create_audit_event(
        db,
        game.id,
        "GAME_CREATED",
        f"Game created for topic: {topic_phrase}",
        {
            "title": game.title,
            "topic": game.topic,
            "game_code": game.game_code,
            "winning_pattern": game.winning_pattern,
            "winning_patterns": patterns,
            "number_of_players": game.number_of_players,
        },
    )

    return game


@router.post(
    "/join",
    response_model=PlayerJoinResponse,
    status_code=status.HTTP_201_CREATED,
)
def join_game_by_code(
    join_data: PlayerJoinRequest,
    db: Session = Depends(get_db),
) -> PlayerJoinResponse:
    response = join_game(join_data=join_data, db=db)
    create_audit_event(
        db,
        response.game_id,
        "PLAYER_JOINED",
        f"Player joined: {response.player_name}",
        {
            "player_id": response.player_id,
            "player_name": response.player_name,
        },
    )
    create_system_chat_message(
        db=db,
        game_id=response.game_id,
        message=f"{response.player_name} joined the room.",
    )
    return response


@router.get("/{game_id}", response_model=GameResponse)
def get_game(game_id: int, db: Session = Depends(get_db)) -> Game:
    return get_game_or_404(game_id, db)


@router.get(
    "/{game_id}/leaderboard",
    response_model=GameLeaderboardResponse,
)
def read_game_leaderboard(
    game_id: int,
    db: Session = Depends(get_db),
) -> GameLeaderboardResponse:
    game = get_game_or_404(game_id, db)
    return get_game_leaderboard(game=game, db=db)


@router.get(
    "/{game_id}/audit-events",
    response_model=list[AuditEventResponse],
)
def list_game_audit_events(
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
) -> list[AuditEventResponse]:
    rows = list_audit_events_for_game(game_id=game.id, db=db)
    return [audit_event_to_response(row) for row in rows]


@router.get(
    "/{game_id}/prize-notifications",
    response_model=list[PrizeNotificationResponse],
)
def list_game_prize_notifications(
    game_id: int,
    db: Session = Depends(get_db),
) -> list[PrizeNotificationResponse]:
    get_game_or_404(game_id, db)
    rows = list_prize_notifications_for_game(game_id=game_id, db=db)
    return [prize_notification_to_response(row) for row in rows]


@router.patch(
    "/{game_id}/prize-notifications/{notification_id}/displayed",
    response_model=PrizeNotificationResponse,
)
def patch_prize_notification_displayed(
    game_id: int,
    notification_id: int,
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
) -> PrizeNotificationResponse:
    row = mark_prize_notification_displayed(
        game_id=game.id,
        notification_id=notification_id,
        db=db,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prize notification not found for this game",
        )
    return prize_notification_to_response(row)


@router.post("/{game_id}/start", response_model=GameResponse)
def start_game_by_id(
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
) -> Game:
    started = start_game(game=game, db=db)
    create_system_chat_message(
        db=db,
        game_id=started.id,
        message="The host started the game. Good luck!",
    )
    return started


@router.post("/{game_id}/call-next", response_model=CalledItemResponse)
def call_next_game_item(
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
) -> CalledItemResponse:
    result = call_next_item(game=game, db=db)
    create_audit_event(
        db,
        game.id,
        "ITEM_CALLED",
        f"Called item: {result.word}",
        {
            "item_id": result.item_id,
            "word": result.word,
            "called_order": result.called_order,
        },
    )
    create_system_chat_message(
        db=db,
        game_id=game.id,
        message=f"{result.word} was called.",
    )
    notify_new_called_item(game.id, result)
    return result


@router.get("/{game_id}/called-items", response_model=list[CalledItemResponse])
def list_called_items(
    game_id: int,
    db: Session = Depends(get_db),
) -> list[CalledItemResponse]:
    get_game_or_404(game_id, db)
    return get_called_items(game_id=game_id, db=db)


@router.post(
    "/{game_id}/generate-items",
    response_model=GenerateItemsResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_items(
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
) -> GenerateItemsResponse:
    pool_target = settings.bingo_item_pool_size
    min_count = settings.bingo_min_item_pool_size

    existing_items = list(
        db.scalars(
            select(BingoItem)
            .where(BingoItem.game_id == game.id)
            .order_by(BingoItem.id.asc())
        )
    )
    if existing_items:
        actual = len(existing_items)
        if actual < min_count:
            warn = (
                f"This game has only {actual} items; the configured minimum pool is "
                f"{min_count}. Add items or start a new game with a broader topic."
            )
        else:
            warn = _pool_shortfall_warning(actual, pool_target)
        return _generate_items_response(
            existing_items,
            target_count=pool_target,
            minimum_count=min_count,
            warning=warn,
        )

    topic = game.topic or game.title

    # ── Topic cache check ────────────────────────────────────────────────────
    cached_generated = get_cached_items(db, topic)
    from_cache = cached_generated is not None

    if from_cache:
        generated_items = cached_generated
        generation_warning: str | None = None
        logger.info(
            "Topic cache HIT for game_id=%s topic=%r", game.id, topic
        )
    else:
        # Cache miss — call the AI (or mock) as normal.
        try:
            outcome = resolve_generated_items_for_game(
                topic=topic,
                count=pool_target,
                settings=settings,
            )
        except ItemGenerationError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc

        generated_items = outcome.items
        generation_warning = outcome.warning

        n = len(generated_items)
        if n < settings.bingo_card_cell_count:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    f"Only {n} valid unique items were produced; each Bingo card needs "
                    f"{settings.bingo_card_cell_count} distinct cells. Try a broader topic."
                ),
            )
        if n < min_count:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    f"Only {n} valid unique items were produced; the minimum pool for this "
                    f"game is {min_count}. Try a broader topic or adjust BINGO_MIN_ITEM_POOL_SIZE."
                ),
            )

        # Persist to cache so the next game with the same topic skips the AI.
        save_cached_items(db, topic, generated_items)

    bingo_items = [
        BingoItem(
            game_id=game.id,
            word=item.word,
            description=item.description,
            is_called=False,
            called_order=None,
        )
        for item in generated_items
    ]

    db.add_all(bingo_items)
    db.commit()

    for item in bingo_items:
        db.refresh(item)

    audit_meta: dict = {"item_count": len(bingo_items), "cached": from_cache}
    if generation_warning:
        audit_meta["warning"] = generation_warning

    create_audit_event(
        db,
        game.id,
        "ITEMS_GENERATED",
        "Items generated successfully",
        audit_meta,
    )

    return _generate_items_response(
        bingo_items,
        target_count=pool_target,
        minimum_count=min_count,
        warning=generation_warning,
        cached=from_cache,
    )


@router.post(
    "/{game_id}/generate-cards",
    response_model=list[BingoCardResponse],
    status_code=status.HTTP_201_CREATED,
)
def generate_cards(
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
) -> list[BingoCardResponse]:
    cards = generate_cards_for_game(game=game, db=db)
    item_count = (
        db.scalar(
            select(func.count(BingoItem.id)).where(BingoItem.game_id == game.id)
        )
        or 0
    )
    notify_cards_generated(
        game_id=game.id,
        item_count=int(item_count),
        card_count=len(cards),
    )
    return cards


@router.post(
    "/{game_id}/players",
    response_model=PlayerCreatedWithSession,
    status_code=status.HTTP_201_CREATED,
)
def create_player(
    game_id: int,
    player_data: PlayerCreate,
    db: Session = Depends(get_db),
) -> PlayerCreatedWithSession:
    get_game_or_404(game_id, db)

    taken = db.scalar(
        select(Player).where(
            Player.game_id == game_id,
            func.lower(Player.name) == player_data.name.lower(),
        )
    )
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That player name is already used in this game. Choose another name.",
        )

    player = Player(
        game_id=game_id,
        name=player_data.name,
    )
    db.add(player)
    db.flush()

    session_plain = secrets.token_urlsafe(32)
    salt, digest = hash_secret(session_plain)
    player.session_token_salt = salt
    player.session_token_hash = digest

    db.commit()
    db.refresh(player)

    return PlayerCreatedWithSession(
        id=player.id,
        game_id=player.game_id,
        name=player.name,
        created_at=player.created_at,
        session_token=session_plain,
    )


@router.get("/{game_id}/players", response_model=list[PlayerResponse])
def list_players(game_id: int, db: Session = Depends(get_db)) -> list[Player]:
    get_game_or_404(game_id, db)

    return list(
        db.scalars(
            select(Player)
            .where(Player.game_id == game_id)
            .order_by(Player.created_at.asc(), Player.id.asc())
        )
    )


@router.get(
    "/{game_id}/players/{player_id}/card",
    response_model=BingoCardResponse,
)
def get_card_for_player(
    game_id: int,
    player_id: int,
    player: Player = Depends(player_session_protected),
    db: Session = Depends(get_db),
) -> BingoCardResponse:
    """Return the player's card, or a waiting-room envelope when the host has
    not generated cards yet.

    Returning 200 with ``card_id=null`` (rather than 404) lets the player UI
    distinguish "joined but waiting" from real errors (wrong session token,
    deleted game) without parsing error strings.
    """
    card = get_player_card(game_id=game_id, player_id=player.id, db=db)
    if card is None:
        return BingoCardResponse(card_id=None, player_id=player.id, grid=[])

    return card


@router.patch(
    "/{game_id}/players/{player_id}/card/cells/{cell_id}/toggle",
    response_model=BingoCardCellResponse,
)
def toggle_player_card_cell(
    game_id: int,
    player_id: int,
    cell_id: int,
    player: Player = Depends(player_session_protected),
    db: Session = Depends(get_db),
) -> BingoCardCellResponse:
    result = toggle_card_cell_mark(
        game_id=game_id,
        player_id=player.id,
        cell_id=cell_id,
        db=db,
    )
    notify_card_cell_updated(game_id, player.id, result.cell_id, result.is_marked)
    return result


@router.post(
    "/{game_id}/players/{player_id}/claim-bingo",
    response_model=BingoClaimResponse,
)
def claim_bingo_for_player(
    game_id: int,
    player_id: int,
    player: Player = Depends(player_session_protected),
    db: Session = Depends(get_db),
) -> BingoClaimResponse:
    game = get_game_or_404(game_id, db)
    result = claim_bingo(game=game, player=player, db=db)
    db.refresh(game)

    player_label = result.player_name or player.name
    create_audit_event(
        db,
        game_id,
        "BINGO_CLAIMED",
        f"Bingo claimed by {player_label}",
        {
            "success": result.success,
            "detail": result.message,
            "player_id": player.id,
            "rank": result.rank,
        },
    )
    if (
        result.success
        and result.rank is not None
        and "already" not in result.message.lower()
    ):
        create_audit_event(
            db,
            game_id,
            "WINNER_CONFIRMED",
            f"Winner confirmed: {player_label}, Rank {result.rank}",
            {"player_id": player.id, "rank": result.rank},
        )
    if game.status == "COMPLETED":
        create_audit_event(
            db,
            game_id,
            "GAME_COMPLETED",
            "Game completed after 3 winners.",
            {"status": "COMPLETED"},
        )

    notify_bingo_claimed(game_id, result)
    if result.success:
        notify_leaderboard_updated(game_id, game, db)
        if result.rank is not None and "already" not in result.message.lower():
            create_system_chat_message(
                db=db,
                game_id=game_id,
                message=f"{player_label} claimed Bingo! (Rank #{result.rank})",
            )
    if game.status == "COMPLETED":
        notify_game_completed(game_id)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message,
        )

    return result


@router.post(
    "/{game_id}/invites",
    response_model=GameInvitesResponse,
    status_code=status.HTTP_200_OK,
)
def send_game_invites(
    game_id: int,
    invite_data: GameInvitesRequest,
    db: Session = Depends(get_db),
    game: Game = Depends(host_pin_protected_game),
) -> GameInvitesResponse:
    """Demo Teams-style invites: preview in UI, or SMTP when configured."""
    try:
        payload = process_game_invites(
            db,
            game,
            participant_emails=invite_data.participant_emails,
            teams_join_url=invite_data.teams_join_url,
            scheduled_start_time=invite_data.scheduled_start_time,
            settings=settings,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    create_audit_event(
        db,
        game_id,
        "INVITES_DISPATCHED",
        f"Invite batch ({payload['mode']}): {len(payload['recipients'])} recipients",
        {
            "mode": payload["mode"],
            "recipient_count": len(payload["recipients"]),
        },
    )
    return GameInvitesResponse.model_validate(payload)


@router.get(
    "/{game_id}/players/{player_id}/bingo-win-status",
    response_model=PlayerWinnerStatusResponse,
)
def read_player_bingo_win_status(
    game_id: int,
    player_id: int,
    player: Player = Depends(player_session_protected),
    db: Session = Depends(get_db),
) -> PlayerWinnerStatusResponse:
    return get_player_winner_status(game_id=game_id, player_id=player.id, db=db)
