"""HTTP endpoints for per-game chat.

Reuses the existing host PIN / player session credentials so an HTTP client
cannot impersonate another role:

* ``sender_role == "HOST"``   → requires a valid ``X-Host-Pin`` for this game
* ``sender_role == "PLAYER"`` → requires a valid ``X-Player-Session`` matching
  ``sender_id`` for this game

This intentionally mirrors the other host/player routes so the frontend can
forward the credentials it already stores in localStorage / sessionStorage.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models import Player
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse
from app.services.chat import (
    ChatValidationError,
    create_chat_message,
    list_chat_messages,
)
from app.services.game_lookup import get_game_or_404
from app.services.secret_hashes import verify_secret

router = APIRouter(prefix="/games", tags=["chat"])


def _require_host(game, x_host_pin: str | None) -> None:
    if game.host_pin_hash is None or game.host_pin_salt is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This game was created before host PIN protection was enabled. "
                "Create a new game to use host chat."
            ),
        )
    if x_host_pin is None or not str(x_host_pin).strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Host PIN is required. Send it in the X-Host-Pin header.",
        )
    if not verify_secret(
        str(x_host_pin).strip(), game.host_pin_salt, game.host_pin_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That host PIN does not match this game.",
        )


def _require_player(
    db: Session, game_id: int, sender_id: int | None, x_player_session: str | None
) -> Player:
    if sender_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PLAYER messages must include sender_id.",
        )
    player = db.scalar(
        select(Player).where(Player.id == sender_id, Player.game_id == game_id)
    )
    if player is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No player was found for this game and sender_id.",
        )
    if player.session_token_hash is None or player.session_token_salt is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "This player has no session token on file. Join the game again "
                "to receive a fresh session token."
            ),
        )
    if x_player_session is None or not str(x_player_session).strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Player session token is required. Send the token from your "
                "join response in the X-Player-Session header."
            ),
        )
    if not verify_secret(
        str(x_player_session).strip(),
        player.session_token_salt,
        player.session_token_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That session token does not match this player.",
        )
    return player


@router.get(
    "/{game_id}/chat",
    response_model=list[ChatMessageResponse],
)
def get_chat_history(
    game_id: int,
    db: Session = Depends(get_db),
) -> list[ChatMessageResponse]:
    """Return the oldest-to-newest chat for this room.

    Open to anyone who knows the game ID — the room itself is gated by needing
    the game code to join, and chat content is only visible inside the app.
    """
    get_game_or_404(game_id, db)
    return list(list_chat_messages(db=db, game_id=game_id))


@router.post(
    "/{game_id}/chat",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_chat_message(
    game_id: int,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    x_host_pin: str | None = Header(default=None, alias="X-Host-Pin"),
    x_player_session: str | None = Header(default=None, alias="X-Player-Session"),
) -> ChatMessageResponse:
    game = get_game_or_404(game_id, db)

    if payload.sender_role == "HOST":
        _require_host(game, x_host_pin)
        sender_id: int | None = None
    else:
        player = _require_player(db, game_id, payload.sender_id, x_player_session)
        sender_id = player.id

    try:
        return create_chat_message(
            db=db,
            game_id=game_id,
            sender_role=payload.sender_role,
            sender_name=payload.sender_name,
            sender_id=sender_id,
            message=payload.message,
        )
    except ChatValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
