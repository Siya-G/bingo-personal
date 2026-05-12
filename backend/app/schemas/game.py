from datetime import datetime
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class GameCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    topic: str = Field(..., min_length=1, max_length=160)
    number_of_players: int = Field(..., ge=1, le=500)
    winning_pattern: Literal[
        "HORIZONTAL_ROW",
        "VERTICAL_COLUMN",
        "DIAGONAL",
        "FULL_HOUSE",
    ]
    host_pin: str = Field(..., min_length=4, max_length=128)

    @field_validator("title", "topic", "host_pin")
    @classmethod
    def strip_required(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("This field cannot be empty or whitespace only.")
        return stripped


class GameResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    topic: str | None
    game_code: str
    status: str
    winning_pattern: str
    number_of_players: int
    created_at: datetime


class BingoItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    game_id: int
    word: str
    description: str | None
    is_called: bool
    called_order: int | None
    created_at: datetime


class GenerateItemsResponse(BaseModel):
    """Result of POST /games/{id}/generate-items (idempotent: may return existing rows)."""

    items: list[BingoItemResponse]
    target_count: int
    actual_count: int
    minimum_count: int
    warning: str | None = None


class CalledItemResponse(BaseModel):
    item_id: int
    word: str
    description: str | None
    called_order: int
    called_at: datetime


class BingoCardCellResponse(BaseModel):
    cell_id: int
    item_id: int
    word: str
    description: str | None
    row: int
    column: int
    is_marked: bool
    is_item_called: bool


class BingoCardResponse(BaseModel):
    card_id: int
    player_id: int
    grid: list[list[BingoCardCellResponse]]


class PlayerJoinRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    game_code: str = Field(..., min_length=4, max_length=16)

    @field_validator("name")
    @classmethod
    def strip_player_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Display name cannot be empty.")
        return stripped

    @field_validator("game_code")
    @classmethod
    def normalize_game_code(cls, value: str) -> str:
        stripped = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]+", stripped):
            raise ValueError(
                "Game codes may only contain letters and numbers (no spaces or symbols)."
            )
        return stripped


class PlayerJoinResponse(BaseModel):
    game_id: int
    player_id: int
    player_name: str
    game_title: str
    game_status: str
    card_id: int
    grid: list[list[BingoCardCellResponse]]
    session_token: str


class PlayerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def strip_create_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Player name cannot be empty.")
        return stripped


class PlayerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    game_id: int
    name: str
    created_at: datetime


class PlayerCreatedWithSession(PlayerResponse):
    """Returned when a host API creates a player — includes a fresh session token."""

    session_token: str


class BingoClaimResponse(BaseModel):
    success: bool
    message: str
    player_id: int | None = None
    player_name: str | None = None
    rank: int | None = None


class PlayerWinnerStatusResponse(BaseModel):
    won: bool
    rank: int | None = None
    player_id: int | None = None
    player_name: str | None = None


class LeaderboardWinnerEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rank: int
    player_id: int
    player_name: str
    created_at: datetime


class GameLeaderboardResponse(BaseModel):
    game_id: int
    game_title: str
    game_status: str
    winners: list[LeaderboardWinnerEntry]


class AuditEventResponse(BaseModel):
    """One row in the host-visible audit timeline."""

    id: int
    event_type: str
    message: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class PrizeNotificationResponse(BaseModel):
    """MVP on-screen prize line for a confirmed winner."""

    id: int
    game_id: int
    player_id: int
    player_name: str
    winner_id: int
    rank: int
    message: str
    status: str
    created_at: datetime


class GameInviteRecipientResponse(BaseModel):
    email: str
    invite_status: Literal["PREVIEW", "SENT", "FAILED"]


class GameInvitesRequest(BaseModel):
    participant_emails: list[str] = Field(..., min_length=1, max_length=100)
    teams_join_url: str = Field(..., min_length=8, max_length=2000)
    scheduled_start_time: datetime | None = None

    @field_validator("participant_emails")
    @classmethod
    def strip_email_list(cls, value: list[str]) -> list[str]:
        cleaned = [str(v).strip() for v in value if str(v).strip()]
        if not cleaned:
            raise ValueError("Provide at least one participant email.")
        return cleaned

    @field_validator("teams_join_url")
    @classmethod
    def https_teams_link(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped.startswith("https://"):
            raise ValueError("Teams meeting link must start with https://")
        return stripped


class GameInvitesResponse(BaseModel):
    mode: Literal["preview", "sent"]
    game_id: str
    room_code: str
    bingo_join_url: str
    teams_join_url: str
    recipients: list[GameInviteRecipientResponse]
    subject: str
    body_preview: str
