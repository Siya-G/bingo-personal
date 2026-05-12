#!/usr/bin/env python3
"""Seed a sample game for workplace demos (Famous mountains + sample players).

Run from the ``backend`` directory so imports resolve::

    cd backend
    source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
    PYTHONPATH=. python scripts/seed_demo_game.py

Uses ``DATABASE_URL`` from the environment (same as the API). By default that is
``sqlite:///./bingo.db`` — this script writes to whatever database your API uses,
so use a disposable copy if you do not want to touch your dev file.

Environment:

- ``DEMO_HOST_PIN`` — host PIN stored for the game (default: ``demo-host-1234``).
  Use this value in the Host dashboard ``X-Host-Pin`` / Host PIN field.

The script creates a waiting game, inserts mock mountain items (same count as
``bingo_item_pool_size`` in settings, default 75), and joins three sample players
so each has a card and session token (printed to stdout).
It does **not** start the game or call items — that is for your live demo.
"""

from __future__ import annotations

import os
import secrets
import string
import sys
from pathlib import Path

# Allow ``python scripts/seed_demo_game.py`` from backend/
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal, create_database_tables
from app.config import settings
from app.models import BingoItem, Game
from app.schemas import PlayerJoinRequest
from app.services.item_generator import generate_mock_items
from app.services.player_join import join_game
from app.services.secret_hashes import hash_secret

GAME_CODE_LENGTH = 6
DEMO_TOPIC = "Famous mountains"
DEMO_PLAYERS = ("Alex Summit", "Jordan Ridge", "Sam Valley")


def _generate_game_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(GAME_CODE_LENGTH))
        if db.scalar(select(Game).where(Game.game_code == code)) is None:
            return code


def main() -> None:
    host_pin = os.environ.get("DEMO_HOST_PIN", "demo-host-1234")
    if len(host_pin) < 4:
        print("DEMO_HOST_PIN must be at least 4 characters.", file=sys.stderr)
        sys.exit(1)

    create_database_tables()

    db = SessionLocal()
    try:
        pin_salt, pin_hash = hash_secret(host_pin)
        game = Game(
            title="Demo — Famous Mountains",
            topic=DEMO_TOPIC,
            number_of_players=12,
            winning_pattern="HORIZONTAL_ROW",
            game_code=_generate_game_code(db),
            status="WAITING",
            host_pin_salt=pin_salt,
            host_pin_hash=pin_hash,
        )
        db.add(game)
        db.flush()

        generated = generate_mock_items(
            topic=DEMO_TOPIC,
            count=settings.bingo_item_pool_size,
        )
        for item in generated:
            db.add(
                BingoItem(
                    game_id=game.id,
                    word=item.word,
                    description=item.description,
                    is_called=False,
                    called_order=None,
                )
            )
        db.commit()
        db.refresh(game)
        game_id = game.id
        game_code = game.game_code
    finally:
        db.close()

    join_results: list[dict[str, str | int]] = []
    for name in DEMO_PLAYERS:
        s2 = SessionLocal()
        try:
            resp = join_game(
                PlayerJoinRequest(name=name, game_code=game_code),
                db=s2,
            )
            join_results.append(
                {
                    "name": resp.player_name,
                    "player_id": resp.player_id,
                    "session_token": resp.session_token,
                }
            )
        finally:
            s2.close()

    print()
    print("========== DEMO GAME READY ==========")
    print(f"Game ID:     {game_id}")
    print(f"Game code:   {game_code}")
    print(f"Host PIN:    {host_pin}")
    print()
    print("Host dashboard → Live Gameplay: enter Game ID + Host PIN, then Start game / Call next item.")
    print("Players → Join: use game code and one of the names below (each name once).")
    print()
    print("Sample players (already joined — open /game on this browser after joining as each,")
    print("or use Player ID + session token for API/testing):")
    for row in join_results:
        print(
            f"  • {row['name']}  player_id={row['player_id']}  "
            f"session_token={row['session_token']}"
        )
    print()
    print("Topic:", DEMO_TOPIC, "— mock descriptions (curated list for this topic).")
    print("======================================")
    print()


if __name__ == "__main__":
    main()
