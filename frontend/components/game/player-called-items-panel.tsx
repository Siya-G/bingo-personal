"use client";

import { useEffect, useRef, useState } from "react";
import { BingoAgentPanel } from "@/components/game/bingo-agent-panel";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import { ButtonLink } from "@/components/ui/button-link";
import { getCalledItems } from "@/lib/api/games";
import { mergeCalledItems } from "@/lib/merge-called-items";
import { readPlayerGameSession } from "@/lib/player-session";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { postPlayerVoiceSpeak } from "@/lib/api/player-voice";
import { resolveVoiceAudioUrl } from "@/lib/api/host-voice-speak";
import { buildNarrationText, speakNarrationText } from "@/lib/speak-bingo-item";
import type { CalledItem } from "@/types/gameplay";

export function PlayerCalledItemsPanel() {
  const speech = useSpeechSynthesis();
  // Pre-rendered audio element so Chrome allows play() after user interaction.
  const audioRef = useRef<HTMLAudioElement>(null);
  const [gameId, setGameId] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [calledItems, setCalledItems] = useState<CalledItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Gate audio.play() behind a prior user gesture (Chrome autoplay policy).
  // Always a boolean — never undefined — so the dep array size is constant.
  const [hasInteracted, setHasInteracted] = useState(false);

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

  // Track the first click anywhere on the page.
  // Clicking "Enable narration" (or any other element) sets this flag,
  // which is then used to gate audio.play() calls safely.
  useEffect(() => {
    const handler = () => setHasInteracted(true);
    document.addEventListener("click", handler, { once: true });
    return () => document.removeEventListener("click", handler);
  }, []);

  // Live calls from the host arrive on the WebSocket (no polling).
  // Dep array is always exactly [lastEvent, speech, gameId, hasInteracted].
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== "NEW_CALLED_ITEM") {
      return;
    }
    const item = lastEvent.payload;
    queueMicrotask(() => {
      setCalledItems((prev) => mergeCalledItems(prev, item));

      if (!speech.settings.narrationEnabled || !hasInteracted) {
        return;
      }
      const text = buildNarrationText(item.word, item.description);
      if (!text || !gameId.trim()) {
        return;
      }

      // Use the pre-rendered <audio> element so Chrome allows play().
      const audioEl = audioRef.current;
      void postPlayerVoiceSpeak(gameId.trim(), text)
        .then((data) => {
          if (data.audio_url && audioEl) {
            audioEl.src = resolveVoiceAudioUrl(data.audio_url);
            audioEl.load();
            return audioEl.play().catch(() => {
              speakNarrationText(text, { force: true });
            });
          }
          // No cloned voice active — fall back to browser TTS.
          speakNarrationText(text, { force: true });
        })
        .catch(() => {
          speakNarrationText(text, { force: true });
        });
    });
  }, [lastEvent, speech, gameId, hasInteracted]);

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
      {/* Hidden persistent audio element — must exist in DOM from first render
          so Chrome's autoplay policy allows play() after user interaction. */}
      <audio ref={audioRef} preload="auto" className="hidden" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Live calls</h2>
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
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/join">Join a game</ButtonLink>
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
        <BingoAgentPanel items={calledItems} gameId={gameId} />
      )}
    </div>
  );
}
