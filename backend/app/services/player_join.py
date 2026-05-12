import secrets

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Game, Player
from app.schemas import PlayerJoinRequest, PlayerJoinResponse
from app.services.card_generator import assign_card_to_player
from app.services.secret_hashes import hash_secret


def join_game(join_data: PlayerJoinRequest, db: Session) -> PlayerJoinResponse:
    """Create a player from a game code and assign a ready-to-play card."""
    player_name = join_data.name
    game_code = join_data.game_code

    game = db.scalar(select(Game).where(Game.game_code == game_code))
    if game is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That game code was not found. Ask the host to confirm the code.",
        )

    if game.status == "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This game is already completed and no longer accepts new players.",
        )

    existing_player = db.scalar(
        select(Player).where(
            Player.game_id == game.id,
            func.lower(Player.name) == player_name.lower(),
        )
    )
    if existing_player is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That display name is already taken in this game. Pick a different name.",
        )

    player = Player(game_id=game.id, name=player_name)
    db.add(player)
    db.flush()

    session_plain = secrets.token_urlsafe(32)
    salt, digest = hash_secret(session_plain)
    player.session_token_salt = salt
    player.session_token_hash = digest
    db.flush()

    try:
        card = assign_card_to_player(game_id=game.id, player_id=player.id, db=db)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "We could not finish creating your Bingo card. "
                "Ask the host to generate items first, then try joining again."
            ),
        ) from exc

    return PlayerJoinResponse(
        game_id=game.id,
        player_id=player.id,
        player_name=player.name,
        game_title=game.title,
        game_status=game.status,
        card_id=card.card_id,
        grid=card.grid,
        session_token=session_plain,
    )
