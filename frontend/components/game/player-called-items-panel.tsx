"use client";

import { useEffect, useState } from "react";
import { BingoAgentPanel } from "@/components/game/bingo-agent-panel";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import { ButtonLink } from "@/components/ui/button-link";
import { getCalledItems } from "@/lib/api/games";
import { mergeCalledItems } from "@/lib/merge-called-items";
import { readPlayerGameSession } from "@/lib/player-session";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import type { CalledItem } from "@/types/gameplay";

export function PlayerCalledItemsPanel() {
  const speech = useSpeechSynthesis();
  const [gameId, setGameId] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [calledItems, setCalledItems] = useState<CalledItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { status: wsStatus, lastEvent } = useGameSocket(gameId);

  useEffect(() => {
    queueMicrotask(() => {
      const session = readPlayerGameSession();
      if (!session) {
        setHasSession(false);
        return;
      }

      setHasSession(true);
      const storedGameId = String(session.game_id);
      setGameId(storedGameId);
      setError(null);
      setIsLoading(true);
      getCalledItems(storedGameId)
        .then((items) => setCalledItems(items))
        .catch((caughtError: unknown) => {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to refresh called items.",
          );
        })
        .finally(() => setIsLoading(false));
    });
  }, []);

  // Live calls from the host arrive on the WebSocket (no polling).
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== "NEW_CALLED_ITEM") {
      return;
    }
    const item = lastEvent.payload;
    queueMicrotask(() => {
      setCalledItems((prev) => mergeCalledItems(prev, item));
      if (speech.settings.narrationEnabled) {
        speech.speakCalledItem(item);
      }
    });
  }, [lastEvent, speech]);

  async function refreshCalledItems(nextGameId = gameId) {
    if (!nextGameId) {
      setError("Join a game first or enter a game ID to view called items.");
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const items = await getCalledItems(nextGameId);
      setCalledItems(items);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to refresh called items.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const socketLabel =
    gameId.trim() === ""
      ? null
      : wsStatus === "open"
        ? "Live updates: connected"
        : wsStatus === "connecting"
          ? "Live updates: connecting…"
          : wsStatus === "error"
            ? "Live updates: error (retrying)"
            : "Live updates: reconnecting…";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Live calls</h2>
          <p className="mt-2 text-sm text-slate-300">
            New calls appear automatically when the host draws a word. Use
            Refresh only if you think you are out of sync.
          </p>
          {socketLabel ? (
            <p className="mt-2 text-xs font-semibold text-cyan-200/85">
              {socketLabel}
            </p>
          ) : null}
        </div>
        <button
          className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading || !gameId}
          onClick={() => void refreshCalledItems()}
          type="button"
        >
          {isLoading ? "Refreshing…" : "Refresh calls"}
        </button>
      </div>

      <LoadingState active={isLoading} label="Loading called items…" />

      <ErrorMessage message={error} title="Could not refresh calls" />

      {!hasSession ? (
        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-8 text-center">
          <h3 className="text-lg font-black text-white">No player session in this tab</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Join a room first so this browser can subscribe to the right game ID and
            show the call history alongside your card.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/join">Join a game</ButtonLink>
            <ButtonLink href="/host" variant="secondary">
              Host dashboard
            </ButtonLink>
          </div>
        </div>
      ) : calledItems.length === 0 && !isLoading && !error ? (
        <div className="rounded-3xl border border-yellow-300/20 bg-yellow-500/5 p-8 text-center">
          <h3 className="text-lg font-black text-yellow-100">Waiting for the first call</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            The host has not called an item yet, or you opened this page before the
            round started. Stay on this tab — the list fills automatically when calls
            go live.
          </p>
        </div>
      ) : (
        <BingoAgentPanel items={calledItems} />
      )}
    </div>
  );
}
