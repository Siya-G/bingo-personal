from pathlib import Path
from typing import Self

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load ``backend/.env`` (next to the ``app/`` package), not ``./.env`` from cwd.
# Uvicorn is often started from the monorepo root; a cwd-relative ``.env`` misses the key.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ENV_FILE = BACKEND_ROOT / ".env"

_DEV_BROWSER_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env.

    Keep operational settings here so the app can move from local SQLite to
    managed infrastructure without changing route or service code.
    """

    app_name: str = "AI Bingo API"
    environment: str = "development"
    database_url: str = "sqlite:///./bingo.db"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    # Public Bingo UI origin for invite links (no secrets).
    frontend_base_url: str = "http://127.0.0.1:3000"
    # Optional SMTP — when ``smtp_host`` is empty, invites stay preview-only.
    # Both ``SMTP_USERNAME`` (preferred) and legacy ``SMTP_USER`` are accepted.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = Field(
        default="",
        validation_alias=AliasChoices("smtp_username", "smtp_user"),
    )
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = Field(default=20, ge=1, le=120)
    # OpenAI (server-side only — never expose to the browser).
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_tts_model: str = "tts-1"
    openai_tts_voice: str = "nova"
    use_mock_llm: bool = False
    # Bingo: shared pool target (e.g. 75), minimum acceptable unique items (e.g. 40),
    # and 5×5 card cell count (25). Cards sample ``bingo_card_cell_count`` items from the pool.
    bingo_card_cell_count: int = Field(default=25, ge=25, le=25)
    bingo_item_pool_size: int = Field(default=75, ge=25, le=200)
    bingo_min_item_pool_size: int = Field(default=40, ge=25, le=200)
    # Opt-in host voice / Bingo Agent narration provider routing.
    voice_provider: str = Field(default="demo")
    voice_profile_ttl_hours: int = Field(default=24, ge=1, le=24 * 30)
    elevenlabs_api_key: str = ""
    # Admin secret for cache-management endpoints. Leave empty to disable.
    admin_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=BACKEND_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def ensure_local_dev_cors(self) -> Self:
        """`localhost` and `127.0.0.1` are different browser origins; merge both in dev.

        A `.env` that only lists one of them breaks the UI when opened on the other.
        """
        if self.environment != "development":
            return self
        seen: set[str] = set()
        merged: list[str] = []
        for origin in [*self.cors_origins, *_DEV_BROWSER_ORIGINS]:
            if origin not in seen:
                seen.add(origin)
                merged.append(origin)
        self.cors_origins = merged
        return self

    @model_validator(mode="after")
    def normalize_bingo_pool_settings(self) -> Self:
        """Keep target ≥ card size, min ≥ card size, and min ≤ target."""
        if self.bingo_item_pool_size < self.bingo_card_cell_count:
            self.bingo_item_pool_size = self.bingo_card_cell_count
        if self.bingo_min_item_pool_size < self.bingo_card_cell_count:
            self.bingo_min_item_pool_size = self.bingo_card_cell_count
        if self.bingo_min_item_pool_size > self.bingo_item_pool_size:
            self.bingo_min_item_pool_size = self.bingo_item_pool_size
        return self


settings = Settings()
