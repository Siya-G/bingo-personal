"use client";

import { FormEvent, Suspense, useEffect, useState, startTransition } from "react";
import { useSearchParams } from "next/navigation";
import { getLeaderboard, getPrizeNotifications } from "@/lib/api/games";
import { useGameSocket } from "@/hooks/useGameSocket";
import { ButtonLink } from "@/components/ui/button-link";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { GameLeaderboard, LeaderboardWinner } from "@/types/leaderboard";
import type { PrizeNotification } from "@/types/prize";

function winnerAtRank(
  winners: LeaderboardWinner[],
  rank: number,
): LeaderboardWinner | undefined {
  return winners.find((entry) => entry.rank === rank);
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function prizeMessageForWinner(
  prizes: PrizeNotification[],
  winner: LeaderboardWinner | undefined,
): string | null {
  if (!winner) {
    return null;
  }
  const row = prizes.find(
    (p) => p.player_id === winner.player_id && p.rank === winner.rank,
  );
  return row?.message ?? null;
}

function PodiumCard({
  placeLabel,
  prizeMessage,
  winner,
}: Readonly<{
  placeLabel: string;
  prizeMessage: string | null;
  winner: LeaderboardWinner | undefined;
}>) {
  return (
    <div className="flex flex-col rounded-3xl border border-white/10 bg-slate-950/55 p-6 text-center shadow-lg shadow-slate-950/30">
      <span className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
        {placeLabel}
      </span>
      {winner ? (
        <div className="mt-4 flex flex-1 flex-col gap-2">
          <p className="text-2xl font-black text-white">{winner.player_name}</p>
          <p className="text-sm text-slate-400">Player #{winner.player_id}</p>
          {prizeMessage ? (
            <p className="mt-2 text-xs font-medium italic leading-relaxed text-amber-100/90">
              {prizeMessage}
            </p>
          ) : null}
          <p className="mt-auto text-xs text-slate-500">{formatWhen(winner.created_at)}</p>
        </div>
      ) : (
        <p className="mt-6 flex-1 text-sm font-semibold text-slate-500">
          Waiting for a winner…
        </p>
      )}
    </div>
  );
}

function LeaderboardInner() {
  const searchParams = useSearchParams();
  const initialFromUrl = searchParams.get("gameId") ?? "";

  const [gameIdInput, setGameIdInput] = useState(initialFromUrl);
  const [activeGameId, setActiveGameId] = useState(initialFromUrl.trim());
  const [data, setData] = useState<GameLeaderboard | null>(null);
  const [prizeRows, setPrizeRows] = useState<PrizeNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { status: wsStatus, lastEvent } = useGameSocket(activeGameId);

  useEffect(() => {
    const trimmed = initialFromUrl.trim();
    if (trimmed) {
      startTransition(() => {
        setGameIdInput(initialFromUrl);
        setActiveGameId(trimmed);
      });
    }
  }, [initialFromUrl]);

  useEffect(() => {
    if (!activeGameId) {
      startTransition(() => {
        setData(null);
        setPrizeRows([]);
      });
      return;
    }

    let cancelled = false;

    async function runFetch() {
      setLoading(true);
      setError(null);
      try {
        const [board, prizes] = await Promise.all([
          getLeaderboard(activeGameId),
          getPrizeNotifications(activeGameId).catch(() => [] as PrizeNotification[]),
        ]);
        if (!cancelled) {
          setData(board);
          setPrizeRows(prizes);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setData(null);
          setPrizeRows([]);
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load the leaderboard.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void runFetch();
    return () => {
      cancelled = true;
    };
  }, [activeGameId]);

  useEffect(() => {
    if (!lastEvent) {
      return;
    }
    queueMicrotask(() => {
      if (lastEvent.type === "LEADERBOARD_UPDATED") {
        const payload = lastEvent.payload;
        if (String(payload.game_id) !== String(activeGameId)) {
          return;
        }
        setData({
          game_id: payload.game_id,
          game_title: payload.game_title,
          game_status: payload.game_status,
          winners: payload.winners,
        });
        setError(null);
      }
      if (lastEvent.type === "PRIZE_NOTIFICATION_CREATED") {
        const payload = lastEvent.payload;
        if (String(payload.game_id) !== String(activeGameId)) {
          return;
        }
        setPrizeRows((prev) => {
          if (prev.some((row) => row.id === payload.id)) {
            return prev;
          }
          const row: PrizeNotification = {
            id: payload.id,
            game_id: payload.game_id,
            player_id: payload.player_id,
            player_name: payload.player_name,
            winner_id: payload.winner_id,
            rank: payload.rank,
            message: payload.message,
            status: payload.status,
            created_at: payload.created_at,
          };
          return [row, ...prev];
        });
      }
      if (lastEvent.type === "GAME_COMPLETED") {
        if (String(lastEvent.payload.game_id) !== String(activeGameId)) {
          return;
        }
        setData((current) =>
          current ? { ...current, game_status: "COMPLETED" } : current,
        );
      }
    });
  }, [lastEvent, activeGameId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveGameId(gameIdInput.trim());
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Leaderboard"
        title="Top three on the podium."
        description="Enter a game ID to see validated Bingo winners, live status, and when each placement was recorded. After loading, the podium updates live over the WebSocket."
        actions={
          <>
            <ButtonLink href="/game">Player game</ButtonLink>
            <ButtonLink href="/host" variant="secondary">
              Host dashboard
            </ButtonLink>
          </>
        }
      />

      <Panel>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={handleSubmit}
        >
          <div className="flex-1">
            <label
              className="text-xs font-black uppercase tracking-[0.18em] text-slate-400"
              htmlFor="leaderboard-game-id"
            >
              Game ID
            </label>
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
              id="leaderboard-game-id"
              inputMode="numeric"
              onChange={(event) => setGameIdInput(event.target.value)}
              placeholder="e.g. 1"
              type="text"
              value={gameIdInput}
            />
          </div>
          <button
            className="rounded-full bg-yellow-300 px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </form>

        {!activeGameId ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/50 p-8 text-center">
            <h3 className="text-lg font-black text-white">No game loaded yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Enter a game ID and press <strong className="text-slate-200">Load</strong>{" "}
              to see the podium, or open this page with{" "}
              <code className="rounded bg-white/10 px-2 py-0.5 text-yellow-100">
                ?gameId=…
              </code>{" "}
              in the URL.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/host">Host dashboard</ButtonLink>
              <ButtonLink href="/join" variant="secondary">
                Join a game
              </ButtonLink>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs font-semibold text-cyan-200/85">
            {wsStatus === "open"
              ? "Live updates: connected"
              : wsStatus === "connecting"
                ? "Live updates: connecting…"
                : wsStatus === "error"
                  ? "Live updates: error (retrying)"
                  : "Live updates: reconnecting…"}
          </p>
        )}

        <LoadingState active={loading && !data} label="Loading leaderboard…" />

        <div className="mt-4">
          <ErrorMessage message={error} title="Could not load leaderboard" />
        </div>

        {data ? (
          <div className="mt-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-white">{data.game_title}</h2>
                <p className="mt-1 text-sm text-slate-400">Game #{data.game_id}</p>
              </div>
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-yellow-100">
                {data.game_status}
              </span>
            </div>

            {data.game_status === "COMPLETED" ? (
              <div className="rounded-3xl border border-fuchsia-400/40 bg-fuchsia-500/15 p-4 text-center text-sm font-bold text-fuchsia-100">
                Game completed — this round is closed.
              </div>
            ) : null}

            {data.winners.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-8 text-center">
                <h3 className="text-lg font-black text-white">No winners yet</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
                  When validated Bingo claims are recorded, first through third place
                  appear here. Keep this page open — the podium updates over the
                  WebSocket after each win.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <PodiumCard
                placeLabel="1st place"
                prizeMessage={prizeMessageForWinner(
                  prizeRows,
                  winnerAtRank(data.winners, 1),
                )}
                winner={winnerAtRank(data.winners, 1)}
              />
              <PodiumCard
                placeLabel="2nd place"
                prizeMessage={prizeMessageForWinner(
                  prizeRows,
                  winnerAtRank(data.winners, 2),
                )}
                winner={winnerAtRank(data.winners, 2)}
              />
              <PodiumCard
                placeLabel="3rd place"
                prizeMessage={prizeMessageForWinner(
                  prizeRows,
                  winnerAtRank(data.winners, 3),
                )}
                winner={winnerAtRank(data.winners, 3)}
              />
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

export function LeaderboardClient() {
  return (
    <Suspense
      fallback={
        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-10 text-center text-slate-300">
          Loading leaderboard…
        </div>
      }
    >
      <LeaderboardInner />
    </Suspense>
  );
}
