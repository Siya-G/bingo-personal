"use client";

import { FormEvent, useEffect, useState, type Dispatch, type SetStateAction, startTransition } from "react";
import { getPlayerCard, toggleCardCell } from "@/lib/api/cards";
import {
  claimBingo,
  getBingoWinStatus,
  getGame,
  getPrizeNotifications,
} from "@/lib/api/games";
import { readPlayerGameSession } from "@/lib/player-session";
import { formatWinningPatternsList } from "@/lib/winning-patterns";
import { ButtonLink } from "@/components/ui/button-link";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import { useGameSocket } from "@/hooks/useGameSocket";
import type { BingoCard, BingoCardCell } from "@/types/card";
import type { PlayerBingoWinStatus } from "@/types/bingo";
import type { PrizeNotification } from "@/types/prize";
import type { PlayerGameSession } from "@/types/player";

const emptyWinStatus: PlayerBingoWinStatus = {
  won: false,
  rank: null,
  player_id: null,
  player_name: null,
};

function pickLatestPrizeForPlayer(
  rows: PrizeNotification[],
  playerNumericId: number,
): PrizeNotification | null {
  const mine = rows.filter((row) => row.player_id === playerNumericId);
  if (mine.length === 0) {
    return null;
  }
  return [...mine].sort((a, b) => b.id - a.id)[0] ?? null;
}

function readSessionTokenForPlayer(gId: string, pId: string): string | null {
  const stored = readPlayerGameSession();
  if (
    stored &&
    String(stored.game_id) === gId.trim() &&
    String(stored.player_id) === pId.trim()
  ) {
    return stored.session_token;
  }
  return null;
}

export function PlayerCardPanel() {
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [session, setSession] = useState<PlayerGameSession | null>(null);
  const [card, setCard] = useState<BingoCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [winStatus, setWinStatus] = useState<PlayerBingoWinStatus | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [gameStatus, setGameStatus] = useState<string | null>(null);
  const [winningPatternsSummary, setWinningPatternsSummary] = useState<
    string | null
  >(null);
  const [roomMessage, setRoomMessage] = useState<string | null>(null);
  const [playerPrizeNotice, setPlayerPrizeNotice] =
    useState<PrizeNotification | null>(null);

  const gameCompleted = gameStatus === "COMPLETED";

  const { lastEvent, status: wsStatus } = useGameSocket(gameId);

  async function hydratePrizeNotice(gId: string, pId: string) {
    const gid = gId.trim();
    const pidStr = pId.trim();
    if (!gid || !pidStr) {
      return;
    }
    const numericPid = Number(pidStr);
    if (Number.isNaN(numericPid)) {
      return;
    }
    try {
      const rows = await getPrizeNotifications(gid);
      const match = pickLatestPrizeForPlayer(rows, numericPid);
      setPlayerPrizeNotice(match);
    } catch {
      // Prize list is auxiliary; winner UI still works from the Bingo claim response.
    }
  }

  useEffect(() => {
    if (!roomMessage) {
      return;
    }
    const timer = setTimeout(() => setRoomMessage(null), 7000);
    return () => clearTimeout(timer);
  }, [roomMessage]);

  useEffect(() => {
    if (!gameId.trim()) {
      startTransition(() => {
        setGameStatus(null);
        setWinningPatternsSummary(null);
      });
      return;
    }

    let cancelled = false;
    void getGame(gameId.trim())
      .then((game) => {
        if (!cancelled) {
          setGameStatus(game.status);
          const list =
            Array.isArray(game.winning_patterns) && game.winning_patterns.length > 0
              ? game.winning_patterns
              : [String(game.winning_pattern)];
          setWinningPatternsSummary(formatWinningPatternsList(list));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGameStatus(null);
          setWinningPatternsSummary(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!lastEvent) {
      return;
    }

    const pid = Number(playerId);
    if (!playerId.trim() || Number.isNaN(pid)) {
      return;
    }

    queueMicrotask(() => {
      switch (lastEvent.type) {
        case "CARDS_GENERATED": {
          // Host just generated the item pool + cards. Waiting players refetch
          // so the waiting-room UI swaps out for their real card.
          const gid = gameId.trim();
          if (!gid) {
            break;
          }
          void getPlayerCard(gid, playerId.trim(), readSessionTokenForPlayer(gid, playerId))
            .then((next) => {
              setCard(next);
              setError(null);
            })
            .catch(() => {
              // Stay in waiting room if the refetch fails transiently.
            });
          break;
        }
        case "NEW_CALLED_ITEM": {
          const gid = gameId.trim();
          if (!gid) {
            break;
          }
          void getPlayerCard(gid, playerId.trim(), readSessionTokenForPlayer(gid, playerId))
            .then(setCard)
            .catch(() => {
              // Card may not be loaded yet; ignore.
            });
          break;
        }
        case "CARD_CELL_UPDATED": {
          if (lastEvent.payload.player_id !== pid) {
            break;
          }
          const { cell_id: updatedCellId, is_marked: nextMarked } =
            lastEvent.payload;
          setCard((prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              grid: prev.grid.map((row) =>
                row.map((cell) =>
                  cell.cell_id === updatedCellId
                    ? { ...cell, is_marked: nextMarked }
                    : cell,
                ),
              ),
            };
          });
          break;
        }
        case "BINGO_CLAIMED": {
          const claim = lastEvent.payload;
          if (claim.player_id != null && claim.player_id !== pid) {
            const rankSuffix =
              claim.success && claim.rank != null ? ` (#${claim.rank})` : "";
            setRoomMessage(
              `${claim.player_name ?? "Player"}: ${claim.message}${rankSuffix}`,
            );
          }
          break;
        }
        case "LEADERBOARD_UPDATED":
          setGameStatus(lastEvent.payload.game_status);
          break;
        case "GAME_COMPLETED":
          setGameStatus("COMPLETED");
          break;
        case "PRIZE_NOTIFICATION_CREATED": {
          const prize = lastEvent.payload;
          if (prize.player_id !== pid) {
            break;
          }
          setPlayerPrizeNotice({
            id: prize.id,
            game_id: prize.game_id,
            player_id: prize.player_id,
            player_name: prize.player_name,
            winner_id: prize.winner_id,
            rank: prize.rank,
            message: prize.message,
            status: prize.status,
            created_at: prize.created_at,
          });
          break;
        }
        default:
          break;
      }
    });
  }, [lastEvent, gameId, playerId]);

  useEffect(() => {
    queueMicrotask(() => {
      const storedSession = readPlayerGameSession();
      if (!storedSession) {
        return;
      }

      const storedGameId = String(storedSession.game_id);
      const storedPlayerId = String(storedSession.player_id);
      setSession(storedSession);
      setGameId(storedGameId);
      setPlayerId(storedPlayerId);
      setError(null);
      setCard(null);
      setWinStatus(null);
      setClaimFeedback(null);
      setIsLoading(true);

      void (async () => {
        const token = readSessionTokenForPlayer(storedGameId, storedPlayerId);
        const [cardRes, statusRes] = await Promise.allSettled([
          getPlayerCard(storedGameId, storedPlayerId, token),
          getBingoWinStatus(storedGameId, storedPlayerId, token),
        ]);

        if (cardRes.status === "fulfilled") {
          setCard(cardRes.value);
        } else {
          const reason =
            cardRes.reason instanceof Error
              ? cardRes.reason.message
              : "Unable to load this Bingo card.";
          setError(reason);
        }

        if (statusRes.status === "fulfilled") {
          setWinStatus(statusRes.value);
          if (statusRes.value.won) {
            void hydratePrizeNotice(storedGameId, storedPlayerId);
          } else {
            setPlayerPrizeNotice(null);
          }
        } else {
          setWinStatus(emptyWinStatus);
          setPlayerPrizeNotice(null);
        }

        setIsLoading(false);
      })();
    });
  }, []);

  async function loadCard(nextGameId = gameId, nextPlayerId = playerId) {
    setError(null);
    setCard(null);
    setWinStatus(null);
    setClaimFeedback(null);
    setPlayerPrizeNotice(null);

    if (!nextGameId || !nextPlayerId) {
      setError("Enter a game ID and player ID to load a card.");
      return;
    }

    setIsLoading(true);
    try {
      const token = readSessionTokenForPlayer(nextGameId, nextPlayerId);
      const [cardRes, statusRes] = await Promise.allSettled([
        getPlayerCard(nextGameId, nextPlayerId, token),
        getBingoWinStatus(nextGameId, nextPlayerId, token),
      ]);

      if (cardRes.status === "fulfilled") {
        setCard(cardRes.value);
      } else {
        const reason =
          cardRes.reason instanceof Error
            ? cardRes.reason.message
            : "Unable to load this Bingo card.";
        setError(reason);
      }

      if (statusRes.status === "fulfilled") {
        setWinStatus(statusRes.value);
        if (statusRes.value.won) {
          void hydratePrizeNotice(nextGameId, nextPlayerId);
        } else {
          setPlayerPrizeNotice(null);
        }
      } else {
        setWinStatus(emptyWinStatus);
        setPlayerPrizeNotice(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleClaimBingo() {
    if (!gameId || !playerId || claimLoading || winStatus?.won) {
      return;
    }

    setClaimLoading(true);
    setClaimFeedback(null);
    try {
      const token = readSessionTokenForPlayer(gameId, playerId);
      const result = await claimBingo(gameId, playerId, token);
      const successText =
        result.rank != null
          ? `${result.message} Your rank is #${result.rank}.`
          : result.message;
      setClaimFeedback({
        tone: "success",
        text: successText,
      });
      setWinStatus({
        won: true,
        rank: result.rank ?? null,
        player_id: result.player_id,
        player_name: result.player_name,
      });
      void hydratePrizeNotice(gameId, playerId);
      try {
        const game = await getGame(gameId);
        setGameStatus(game.status);
      } catch {
        // Status will refresh on the next poll.
      }
    } catch (caughtError) {
      setClaimFeedback({
        tone: "error",
        text:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to submit your Bingo claim.",
      });
    } finally {
      setClaimLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCard();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-white">Your Bingo Card</h2>
        <p className="mt-2 text-sm text-slate-300">
          {session
            ? `${session.player_name}, you are playing ${session.game_title}.`
            : "Load a generated card by player and game ID."}{" "}
          Tap a square after the host calls that word to mark it, then press Bingo
          when your card completes <strong>any</strong> of this room&apos;s winning
          patterns.
        </p>
        {winningPatternsSummary ? (
          <p className="mt-2 text-xs font-semibold text-slate-400">
            Winning patterns for this room:{" "}
            <span className="text-slate-100">{winningPatternsSummary}</span>
          </p>
        ) : null}
        {gameId.trim() ? (
          <p className="mt-2 text-xs font-semibold text-cyan-200/85">
            {wsStatus === "open"
              ? "Live updates: connected"
              : wsStatus === "connecting"
                ? "Live updates: connecting…"
                : wsStatus === "error"
                  ? "Live updates: error (retrying)"
                  : "Live updates: reconnecting…"}
          </p>
        ) : null}
      </div>

      {session ? (
        <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          <span className="font-black uppercase tracking-[0.12em] text-emerald-200">
            Session ready
          </span>
          <span className="mt-1 block text-emerald-50/95">
            Playing as <strong className="text-white">{session.player_name}</strong> in{" "}
            <strong className="text-white">{session.game_title}</strong>. Your token is
            stored in this browser for card and Bingo actions.
          </span>
        </div>
      ) : null}

      {gameCompleted ? (
        <div className="rounded-3xl border border-fuchsia-400/40 bg-fuchsia-500/15 p-4 text-center text-sm font-bold text-fuchsia-100">
          Game completed — the host cannot call new items and new Bingo claims are
          closed for players who have not already won.
        </div>
      ) : null}

      {roomMessage ? (
        <div className="rounded-3xl border border-cyan-400/35 bg-cyan-500/10 p-3 text-center text-sm font-semibold text-cyan-100">
          Room update: {roomMessage}
        </div>
      ) : null}

      {winStatus?.won && gameId ? (
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink
            href={`/leaderboard?gameId=${encodeURIComponent(gameId)}`}
            variant="secondary"
          >
            View leaderboard
          </ButtonLink>
        </div>
      ) : null}

      {winStatus?.won ? (
        <div className="relative overflow-hidden rounded-3xl border-2 border-amber-300/55 bg-gradient-to-br from-amber-500/25 via-slate-900/90 to-slate-950 p-6 text-center shadow-xl shadow-amber-900/20 ring-1 ring-white/10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-amber-400/20 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-10 -left-6 size-28 rounded-full bg-yellow-300/15 blur-2xl"
          />
          <p className="relative text-xs font-black uppercase tracking-[0.28em] text-amber-200">
            Winner
          </p>
          <p className="relative mt-3 text-lg font-black text-white sm:text-xl">
            {playerPrizeNotice?.message ??
              (typeof winStatus.rank === "number"
                ? `Congratulations! You placed #${winStatus.rank}.`
                : "Congratulations! You won this round.")}
          </p>
          {typeof winStatus.rank === "number" ? (
            <p className="relative mt-2 text-sm font-bold text-amber-100/95">
              Your rank: #{winStatus.rank}
            </p>
          ) : null}
          <p className="relative mt-4 text-sm font-semibold text-slate-200">
            Prize details will be shared by the host.
          </p>
          <p className="relative mt-2 text-xs text-slate-500">
            {/* TODO(Phase 14+): wire email_notification + gift_card_workflow when prizes leave MVP. */}
            On-screen notice only — no payment or gift card data is collected here.
          </p>
        </div>
      ) : null}

      {gameId.trim() && playerId.trim() && !readSessionTokenForPlayer(gameId, playerId) ? (
        <p className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          No session token matches this game and player ID. Join the room again from
          the join page (or use the same device where you joined) so your browser can
          send the secure player token with each request.
        </p>
      ) : null}

      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={handleSubmit}>
        <input
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
          inputMode="numeric"
          onChange={(event) => setGameId(event.target.value)}
          placeholder="Game ID"
          type="text"
          value={gameId}
        />
        <input
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
          inputMode="numeric"
          onChange={(event) => setPlayerId(event.target.value)}
          placeholder="Player ID"
          type="text"
          value={playerId}
        />
        <button
          className="rounded-full bg-yellow-300 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? "Loading..." : "Load Card"}
        </button>
      </form>

      <LoadingState active={isLoading} label="Loading your card…" />

      <div className="mt-3">
        <ErrorMessage message={error} title="Could not load card" />
      </div>

      {card && card.card_id !== null ? (
        <BingoCardGrid
          card={card as BingoCard & { card_id: number }}
          claimFeedback={claimFeedback}
          claimLoading={claimLoading}
          gameCompleted={gameCompleted}
          gameId={gameId}
          onClaimBingo={() => void handleClaimBingo()}
          playerId={playerId}
          sessionToken={readSessionTokenForPlayer(gameId, playerId)}
          setCard={setCard}
          winStatus={winStatus}
        />
      ) : card && card.card_id === null ? (
        <WaitingRoom
          gameTitle={session?.game_title ?? null}
          playerName={session?.player_name ?? null}
          wsStatus={wsStatus}
        />
      ) : null}
    </div>
  );
}

type WaitingRoomProps = Readonly<{
  gameTitle: string | null;
  playerName: string | null;
  wsStatus: string;
}>;

function WaitingRoom({ gameTitle, playerName, wsStatus }: WaitingRoomProps) {
  return (
    <div
      className="rounded-3xl border border-cyan-300/30 bg-cyan-500/10 p-6 text-center"
      role="status"
      aria-live="polite"
      data-testid="player-waiting-room"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200">
        You’re in the room
      </p>
      <p className="mt-3 text-lg font-black text-white sm:text-xl">
        Waiting for the host to generate bingo cards.
      </p>
      <p className="mt-3 text-sm font-semibold text-slate-200">
        {playerName ? (
          <>
            Joined as <strong className="text-white">{playerName}</strong>
            {gameTitle ? (
              <>
                {" "}
                in <strong className="text-white">{gameTitle}</strong>
              </>
            ) : null}
            .
          </>
        ) : (
          "You can leave this tab open — your card will appear here as soon as the host is ready."
        )}
      </p>
      <div className="mt-5 flex items-center justify-center gap-3 text-xs font-semibold text-cyan-200/85">
        <span
          aria-hidden
          className="inline-block size-3 animate-pulse rounded-full bg-cyan-300"
        />
        <span>
          {wsStatus === "open"
            ? "Listening for the host to generate cards…"
            : "Reconnecting to the room…"}
        </span>
      </div>
    </div>
  );
}

function mergeCellIntoCard(card: BingoCard, updated: BingoCardCell): BingoCard {
  return {
    ...card,
    grid: card.grid.map((row) =>
      row.map((cell) =>
        cell.cell_id === updated.cell_id ? { ...cell, ...updated } : cell,
      ),
    ),
  };
}

type BingoCardGridProps = Readonly<{
  card: BingoCard;
  claimFeedback: { tone: "success" | "error"; text: string } | null;
  claimLoading: boolean;
  gameCompleted: boolean;
  gameId: string;
  onClaimBingo: () => void;
  playerId: string;
  sessionToken: string | null;
  setCard: Dispatch<SetStateAction<BingoCard | null>>;
  winStatus: PlayerBingoWinStatus | null;
}>;

function BingoCardGrid({
  card,
  claimFeedback,
  claimLoading,
  gameCompleted,
  gameId,
  onClaimBingo,
  playerId,
  sessionToken,
  setCard,
  winStatus,
}: BingoCardGridProps) {
  const [togglingCellId, setTogglingCellId] = useState<number | null>(null);
  const [cellError, setCellError] = useState<string | null>(null);
  const isBusy = togglingCellId !== null;

  async function handleCellClick(cell: BingoCardCell) {
    if (isBusy) {
      return;
    }

    setCellError(null);

    if (!cell.is_item_called) {
      setCellError("This item has not been called yet.");
      return;
    }

    if (!gameId || !playerId) {
      setCellError("Game ID and player ID are required to mark cells.");
      return;
    }

    setTogglingCellId(cell.cell_id);
    try {
      const updated = await toggleCardCell(
        gameId,
        playerId,
        cell.cell_id,
        sessionToken,
      );
      setCard((prev) => (prev ? mergeCellIntoCard(prev, updated) : prev));
    } catch (caughtError) {
      setCellError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update this cell.",
      );
    } finally {
      setTogglingCellId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-yellow-200">
          Card #{card.card_id}
        </p>
        <p className="text-sm font-semibold text-slate-300">
          Player #{card.player_id}
        </p>
      </div>

      {cellError ? (
        <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-100">
          {cellError}
        </div>
      ) : null}

      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {card.grid.flat().map((cell) => {
          const isToggling = togglingCellId === cell.cell_id;
          const uncalled = !cell.is_item_called;
          const calledUnmarked = cell.is_item_called && !cell.is_marked;

          return (
            <button
              key={cell.cell_id}
              className={[
                "relative flex aspect-square min-h-20 flex-col items-center justify-center rounded-2xl border p-2 text-center shadow-lg shadow-slate-950/20 transition",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300",
                cell.is_marked
                  ? "border-emerald-400/70 bg-emerald-500/25 ring-2 ring-emerald-300/50"
                  : calledUnmarked
                    ? "border-yellow-300/35 bg-yellow-300/10"
                    : "border-white/10 bg-gradient-to-br from-white/15 to-white/5",
                uncalled ? "opacity-55" : "hover:border-yellow-300/50",
                isBusy && !isToggling ? "pointer-events-none opacity-50" : "",
              ].join(" ")}
              disabled={isBusy}
              onClick={() => void handleCellClick(cell)}
              title={cell.description ?? cell.word}
              type="button"
            >
              {cell.is_marked ? (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-emerald-400 text-xs font-black text-slate-950"
                >
                  ✓
                </span>
              ) : null}
              <span className="line-clamp-3 text-xs font-black text-white sm:text-sm">
                {cell.word}
              </span>
              {isToggling ? (
                <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-yellow-200">
                  …
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-3">
        {claimFeedback ? (
          <div
            className={
              claimFeedback.tone === "success"
                ? "rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-100"
                : "rounded-2xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-semibold text-red-100"
            }
          >
            {claimFeedback.text}
          </div>
        ) : null}

        <button
          className="w-full rounded-full bg-yellow-300 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={
            claimLoading ||
            isBusy ||
            winStatus?.won === true ||
            winStatus === null ||
            (gameCompleted && Boolean(winStatus) && !winStatus.won)
          }
          onClick={onClaimBingo}
          type="button"
        >
          {claimLoading
            ? "Validating Bingo…"
            : winStatus?.won
              ? "Already a winner"
              : gameCompleted && !winStatus?.won
                ? "Game ended"
                : winStatus === null
                  ? "Loading…"
                  : "Bingo"}
        </button>
      </div>
    </div>
  );
}
