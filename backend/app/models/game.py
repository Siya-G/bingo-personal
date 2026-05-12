from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class Game(Base):
    """A hosted Bingo game room."""

    __tablename__ = "games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    topic: Mapped[str | None] = mapped_column(String(160), nullable=True)
    game_code: Mapped[str] = mapped_column(
        String(16),
        unique=True,
        index=True,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), default="WAITING", nullable=False)
    winning_pattern: Mapped[str] = mapped_column(String(64), nullable=False)
    number_of_players: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    host_pin_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    host_pin_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    teams_join_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_start_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    invites_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    players: Mapped[list["Player"]] = relationship(
        back_populates="game",
        cascade="all, delete-orphan",
    )
    bingo_items: Mapped[list["BingoItem"]] = relationship(
        back_populates="game",
        cascade="all, delete-orphan",
    )
    bingo_cards: Mapped[list["BingoCard"]] = relationship(
        back_populates="game",
        cascade="all, delete-orphan",
    )
    called_items: Mapped[list["CalledItem"]] = relationship(
        back_populates="game",
        cascade="all, delete-orphan",
    )
    winners: Mapped[list["Winner"]] = relationship(
        back_populates="game",
        cascade="all, delete-orphan",
    )
    audit_events: Mapped[list["AuditEvent"]] = relationship(
        "AuditEvent",
        back_populates="game",
        cascade="all, delete-orphan",
    )
    prize_notifications: Mapped[list["PrizeNotification"]] = relationship(
        "PrizeNotification",
        back_populates="game",
        cascade="all, delete-orphan",
    )
    game_invites: Mapped[list["GameInvite"]] = relationship(
        "GameInvite",
        back_populates="game",
        cascade="all, delete-orphan",
    )


class GameInvite(Base):
    """Demo workplace invite row (email preview or SMTP delivery)."""

    __tablename__ = "game_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invite_status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    game: Mapped["Game"] = relationship(back_populates="game_invites")


class Player(Base):
    """A participant connected to one game."""

    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    session_token_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    session_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    game: Mapped["Game"] = relationship(back_populates="players")
    bingo_cards: Mapped[list["BingoCard"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )
    wins: Mapped[list["Winner"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )
    prize_notifications: Mapped[list["PrizeNotification"]] = relationship(
        "PrizeNotification",
        back_populates="player",
        cascade="all, delete-orphan",
    )


class BingoItem(Base):
    """A word or phrase that can appear on cards and be called during play."""

    __tablename__ = "bingo_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    word: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_called: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    called_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    game: Mapped["Game"] = relationship(back_populates="bingo_items")
    calls: Mapped[list["CalledItem"]] = relationship(
        back_populates="bingo_item",
        cascade="all, delete-orphan",
    )
    card_cells: Mapped[list["BingoCardCell"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
    )


class BingoCard(Base):
    """A generated card assigned to one player in a game."""

    __tablename__ = "bingo_cards"
    __table_args__ = (
        UniqueConstraint("game_id", "player_id", name="uq_bingo_cards_game_player"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    player_id: Mapped[int | None] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    game: Mapped["Game"] = relationship(back_populates="bingo_cards")
    player: Mapped["Player | None"] = relationship(back_populates="bingo_cards")
    cells: Mapped[list["BingoCardCell"]] = relationship(
        back_populates="card",
        cascade="all, delete-orphan",
    )


class BingoCardCell(Base):
    """One item placement on a player's 5x5 Bingo card."""

    __tablename__ = "bingo_card_cells"
    __table_args__ = (
        UniqueConstraint("card_id", "row", "column", name="uq_card_cell_position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("bingo_cards.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    item_id: Mapped[int] = mapped_column(
        ForeignKey("bingo_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    column: Mapped[int] = mapped_column(Integer, nullable=False)
    is_marked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    card: Mapped["BingoCard"] = relationship(back_populates="cells")
    item: Mapped["BingoItem"] = relationship(back_populates="card_cells")


class CalledItem(Base):
    """A historical record of an item called during a game."""

    __tablename__ = "called_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    bingo_item_id: Mapped[int] = mapped_column(
        ForeignKey("bingo_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    call_order: Mapped[int] = mapped_column(Integer, nullable=False)
    called_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    game: Mapped["Game"] = relationship(back_populates="called_items")
    bingo_item: Mapped["BingoItem"] = relationship(back_populates="calls")


class Winner(Base):
    """A winner placement for a completed or in-progress game."""

    __tablename__ = "winners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    game: Mapped["Game"] = relationship(back_populates="winners")
    player: Mapped["Player"] = relationship(back_populates="wins")
    prize_notification: Mapped["PrizeNotification | None"] = relationship(
        "PrizeNotification",
        back_populates="winner",
        uselist=False,
        cascade="all, delete-orphan",
    )
