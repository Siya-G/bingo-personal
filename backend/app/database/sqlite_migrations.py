"""Lightweight SQLite column additions for local dev.

Production should use Alembic or another migration runner instead of
imperative ALTER statements.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def apply_sqlite_runtime_migrations(engine: Engine) -> None:
    if not str(engine.url).startswith("sqlite"):
        return

    insp = inspect(engine)
    if insp.has_table("games"):
        game_cols = {c["name"] for c in insp.get_columns("games")}
        with engine.begin() as conn:
            if "host_pin_salt" not in game_cols:
                conn.execute(
                    text("ALTER TABLE games ADD COLUMN host_pin_salt VARCHAR(64)")
                )
            if "host_pin_hash" not in game_cols:
                conn.execute(
                    text("ALTER TABLE games ADD COLUMN host_pin_hash VARCHAR(128)")
                )
            if "teams_join_url" not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN teams_join_url TEXT"))
            if "scheduled_start_time" not in game_cols:
                conn.execute(
                    text(
                        "ALTER TABLE games ADD COLUMN scheduled_start_time DATETIME"
                    )
                )
            if "invites_sent_at" not in game_cols:
                conn.execute(
                    text("ALTER TABLE games ADD COLUMN invites_sent_at DATETIME")
                )

    if insp.has_table("players"):
        player_cols = {c["name"] for c in insp.get_columns("players")}
        with engine.begin() as conn:
            if "session_token_salt" not in player_cols:
                conn.execute(
                    text(
                        "ALTER TABLE players ADD COLUMN session_token_salt VARCHAR(64)"
                    )
                )
            if "session_token_hash" not in player_cols:
                conn.execute(
                    text(
                        "ALTER TABLE players ADD COLUMN session_token_hash VARCHAR(128)"
                    )
                )
