"""Header-based MVP auth for host and player actions.

Replace with OAuth2 / session cookies, hardware keys, and server-side session
stores before exposing this service on the public internet at scale.
"""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models import Game, Player
from app.services.game_lookup import get_game_or_404
from app.services.secret_hashes import verify_secret


def host_pin_protected_game(
    game_id: int,
    db: Session = Depends(get_db),
    x_host_pin: str | None = Header(
        default=None,
        alias="X-Host-Pin",
        description="Host PIN set when the game was created.",
    ),
) -> Game:
    game = get_game_or_404(game_id, db)
    if game.host_pin_hash is None or game.host_pin_salt is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This game was created before host PIN protection was enabled. "
                "Create a new game from the host dashboard to use host controls."
            ),
        )
    if x_host_pin is None or not str(x_host_pin).strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Host PIN is required. Send it in the X-Host-Pin header.",
        )
    if not verify_secret(
        str(x_host_pin).strip(),
        game.host_pin_salt,
        game.host_pin_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That host PIN does not match this game.",
        )
    return game


def player_session_protected(
    game_id: int,
    player_id: int,
    db: Session = Depends(get_db),
    x_player_session: str | None = Header(
        default=None,
        alias="X-Player-Session",
        description="Opaque session token returned from POST /games/join.",
    ),
) -> Player:
    get_game_or_404(game_id, db)
    player = db.scalar(
        select(Player).where(Player.id == player_id, Player.game_id == game_id)
    )
    if player is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No player was found for this game and player ID.",
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
                "Player session token is required. Send the token from your join "
                "response in the X-Player-Session header."
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
