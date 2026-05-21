"""Lightweight SQLite column additions for local dev.

Production should use Alembic or another migration runner instead of
imperative ALTER statements.
"""

from __future__ import annotations

import json

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
            if "winning_patterns_json" not in game_cols:
                conn.execute(
                    text("ALTER TABLE games ADD COLUMN winning_patterns_json TEXT")
                )

        game_cols_after = {c["name"] for c in inspect(engine).get_columns("games")}
        if "winning_patterns_json" in game_cols_after:
            with engine.begin() as conn:
                rows = conn.execute(
                    text(
                        "SELECT id, winning_pattern FROM games "
                        "WHERE winning_patterns_json IS NULL "
                        "OR TRIM(winning_patterns_json) = ''"
                    )
                ).mappings()
                for row in rows:
                    payload = json.dumps([row["winning_pattern"]])
                    conn.execute(
                        text(
                            "UPDATE games SET winning_patterns_json = :payload "
                            "WHERE id = :id"
                        ),
                        {"payload": payload, "id": row["id"]},
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

    if insp.has_table("game_invites"):
        invite_cols = {c["name"] for c in insp.get_columns("game_invites")}
        with engine.begin() as conn:
            if "error_message" not in invite_cols:
                conn.execute(
                    text("ALTER TABLE game_invites ADD COLUMN error_message TEXT")
                )
            if "sent_at" not in invite_cols:
                conn.execute(
                    text("ALTER TABLE game_invites ADD COLUMN sent_at DATETIME")
                )

    # ``chat_messages`` is created by ``Base.metadata.create_all`` for fresh dev
    # DBs. Older bingo.db files exist for some developers; create the table on
    # demand so they don't need to drop and recreate the file.
    if not inspect(engine).has_table("chat_messages"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id INTEGER PRIMARY KEY,
                        game_id INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
                        sender_id INTEGER,
                        sender_name VARCHAR(120) NOT NULL,
                        sender_role VARCHAR(16) NOT NULL,
                        message VARCHAR(500) NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_chat_messages_game_id "
                    "ON chat_messages (game_id)"
                )
            )

    # Opt-in host voice profile (consent + provider routing + TTL). The
    # service/endpoint layer is not wired yet — this milestone only ships the
    # schema so future work can persist consent records without a follow-up
    # migration.
    if not inspect(engine).has_table("host_voice_profiles"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS host_voice_profiles (
                        id INTEGER PRIMARY KEY,
                        game_id INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
                        consent_given BOOLEAN NOT NULL DEFAULT 0,
                        consent_timestamp DATETIME,
                        consent_text VARCHAR(2000),
                        voice_mode VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
                        provider VARCHAR(32) NOT NULL DEFAULT 'DEMO',
                        provider_voice_id VARCHAR(128),
                        sample_audio_path TEXT,
                        active BOOLEAN NOT NULL DEFAULT 0,
                        expires_at DATETIME,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_host_voice_profiles_game_id "
                    "ON host_voice_profiles (game_id)"
                )
            )

    # Moderation audit table — never shown to players. Blocked messages are
    # stored here instead of in ``chat_messages`` so they can be reviewed by
    # the host/admin out-of-band without leaking into room history.
    if not inspect(engine).has_table("chat_moderation_events"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS chat_moderation_events (
                        id INTEGER PRIMARY KEY,
                        game_id INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
                        sender_id INTEGER,
                        sender_name VARCHAR(120) NOT NULL,
                        sender_role VARCHAR(16) NOT NULL,
                        original_message VARCHAR(500) NOT NULL,
                        reason VARCHAR(64) NOT NULL,
                        detail VARCHAR(240),
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_chat_moderation_events_game_id "
                    "ON chat_moderation_events (game_id)"
                )
            )

    # Topic-level item cache — avoids calling the AI when the same topic is used
    # across multiple games. ``create_all`` handles fresh DBs; this block ensures
    # existing bingo.db files gain the table without a manual drop-and-recreate.
    if not inspect(engine).has_table("topic_item_cache"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS topic_item_cache (
                        id INTEGER PRIMARY KEY,
                        topic_key VARCHAR(200) NOT NULL,
                        items TEXT NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        hit_count INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_topic_item_cache_topic_key "
                    "ON topic_item_cache (topic_key)"
                )
            )
