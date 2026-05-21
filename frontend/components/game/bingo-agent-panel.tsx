"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalledItemsList } from "@/components/game/called-items-list";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { getAiCallerLabel } from "@/lib/narrate-called-item";
import { speakCalledItem } from "@/lib/speak-item";
import { prewarmSpeechSynthesisForUserGesture } from "@/lib/speak-bingo-item";
import { NARRATION_UNAVAILABLE_MESSAGE } from "@/lib/speak-bingo-item";
import type { CalledItem } from "@/types/gameplay";
import type { HostVoiceProfilePublic } from "@/types/host-voice";

type BingoAgentPanelProps = Readonly<{
  items: CalledItem[];
  title?: string;
  /** Compact, scroll-friendly layout used by the Host page's sticky column. */
  compact?: boolean;
  /** Total items in the shared pool (for the "X / Y called" counter). */
  totalItemCount?: number;
  /** Optional host action wired into the compact panel header area. */
  onCallNext?: () => void;
  callNextLabel?: string;
  isCallingNext?: boolean;
  callNextDisabled?: boolean;
  /** Number of previous calls visible at a glance in compact mode (default: 5). */
  previewSize?: number;
  /** Optional note rendered under the Call Next button (e.g. "Game completed"). */
  bottomNote?: ReactNode;
  /** Host voice profile for narration mode and demo label (host gameplay only). */
  hostVoiceProfile?: HostVoiceProfilePublic | null;
  gameId?: string;
  hostPin?: string;
}>;

export function BingoAgentPanel({
  items,
  title = "Bingo Agent",
  compact = false,
  totalItemCount,
  onCallNext,
  callNextLabel = "Call Next Item",
  isCallingNext = false,
  callNextDisabled = false,
  previewSize = 5,
  bottomNote,
  hostVoiceProfile = null,
  gameId = "",
  hostPin = "",
}: BingoAgentPanelProps) {
  const speech = useSpeechSynthesis();
  const currentItem = items.at(-1) ?? null;
  const previousItems = useMemo(
    () => items.slice(0, -1).reverse(),
    [items],
  );
  const recentPrevious = previousItems.slice(0, Math.max(0, previewSize));

  const [historyQuery, setHistoryQuery] = useState("");
  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) {
      return previousItems;
    }
    return previousItems.filter((item) => {
      return (
        item.word.toLowerCase().includes(q) ||
        (item.description?.toLowerCase() ?? "").includes(q)
      );
    });
  }, [historyQuery, previousItems]);

  const aiCallerLabel =
    Boolean(currentItem) ? getAiCallerLabel(hostVoiceProfile) : null;

  function handleReplay() {
    if (!currentItem) {
      return;
    }
    prewarmSpeechSynthesisForUserGesture();
    speech.cancel();
    if (gameId.trim()) {
      void speakCalledItem(currentItem, gameId.trim(), hostPin.trim());
      return;
    }
    speech.speakCalledItem(currentItem, { force: true });
  }

  const narrationLabel = speech.settings.narrationEnabled
    ? "Narration on"
    : "Narration off";

  const statusLabel = !speech.supported
    ? "Unavailable"
    : speech.isSpeaking
      ? "Speaking"
      : "Idle";

  const calledCount = items.length;
  const counterLabel =
    typeof totalItemCount === "number" && totalItemCount > 0
      ? `${calledCount} / ${totalItemCount} called`
      : `${calledCount} called`;

  if (!compact) {
    return (
      <div className="space-y-5 rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">{title}</h2>
            <p className="mt-2 text-sm text-slate-300">
              Host-chosen browser voice. Replay reads the current call aloud.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-100">
              {narrationLabel}
            </span>
            <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-100">
              {statusLabel}
            </span>
          </div>
        </div>

        {!speech.supported ? (
          <p className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
            {NARRATION_UNAVAILABLE_MESSAGE} You can still see calls on screen.
          </p>
        ) : null}

        <CalledItemsList items={items} />

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm font-bold text-white">
            <input
              checked={speech.settings.narrationEnabled}
              className="size-4 accent-yellow-300"
              onChange={(event) =>
                speech.setNarrationEnabled(event.target.checked)
              }
              type="checkbox"
            />
            Enable narration for new calls
          </label>

          <button
            className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!speech.supported || !currentItem}
            onClick={handleReplay}
            type="button"
          >
            Replay current item
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="mt-1 text-xs text-slate-300/90">
            Always-visible call control during a live round.
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">
          {counterLabel}
        </span>
      </div>

      {!speech.supported ? (
        <p className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-100">
          {NARRATION_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}

      <div className="rounded-2xl border border-yellow-200/25 bg-yellow-300 p-4 text-slate-950 shadow-lg shadow-yellow-500/20">
        <p className="text-[11px] font-black uppercase tracking-[0.24em]">
          Now Calling
        </p>
        <p className="mt-2 text-3xl font-black leading-tight">
          {currentItem?.word ?? "Waiting"}
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-800">
          {currentItem?.description ??
            "Start the game and call the first item when everyone is ready."}
        </p>
        {currentItem ? (
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700">
            Call #{currentItem.called_order}
          </p>
        ) : null}
        {aiCallerLabel ? (
          <p className="mt-2 text-xs font-semibold text-slate-800">
            {aiCallerLabel}
          </p>
        ) : null}
      </div>

      {onCallNext ? (
        <button
          className="w-full rounded-full bg-fuchsia-400 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-fuchsia-500/30 transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={callNextDisabled || isCallingNext}
          onClick={onCallNext}
          type="button"
        >
          {isCallingNext ? "Calling next item…" : callNextLabel}
        </button>
      ) : null}

      {bottomNote ? (
        <div className="text-xs font-semibold text-slate-300/90">{bottomNote}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]">
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-cyan-100">
          {narrationLabel}
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-fuchsia-100">
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-xs font-bold text-white">
          <input
            checked={speech.settings.narrationEnabled}
            className="size-4 accent-yellow-300"
            onChange={(event) =>
              speech.setNarrationEnabled(event.target.checked)
            }
            type="checkbox"
          />
          Narrate new calls
        </label>
        <button
          className="rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!speech.supported || !currentItem}
          onClick={handleReplay}
          type="button"
        >
          Replay
        </button>
      </div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
          Last {Math.min(previewSize, recentPrevious.length) || previewSize} calls
        </h3>
        <ul className="mt-2 space-y-1.5">
          {recentPrevious.length > 0 ? (
            recentPrevious.map((item) => (
              <li
                key={`recent-${item.called_order}-${item.item_id}`}
                className="flex items-baseline gap-3 rounded-xl bg-slate-950/45 px-3 py-2"
              >
                <span className="min-w-[2.25rem] text-[11px] font-black uppercase tracking-[0.16em] text-yellow-200">
                  #{item.called_order}
                </span>
                <span className="truncate text-sm font-bold text-white">
                  {item.word}
                </span>
              </li>
            ))
          ) : (
            <li className="rounded-xl bg-slate-950/45 px-3 py-2 text-xs font-semibold text-slate-300">
              No previous calls yet.
            </li>
          )}
        </ul>
      </div>

      <details className="group rounded-2xl border border-white/10 bg-slate-950/40 open:bg-slate-950/55">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-200">
          <span>
            View full call history ({previousItems.length})
          </span>
          <span className="text-slate-500 transition group-open:rotate-90">›</span>
        </summary>
        <div className="space-y-3 border-t border-white/10 px-4 py-3">
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Search word or description…"
            type="search"
            value={historyQuery}
          />
          <div className="max-h-72 overflow-auto pr-1">
            {filteredHistory.length === 0 ? (
              <p className="rounded-xl bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
                {previousItems.length === 0
                  ? "No previous calls yet."
                  : "No matches for that search."}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredHistory.map((item) => (
                  <li
                    key={`history-${item.called_order}-${item.item_id}`}
                    className="rounded-xl bg-slate-950/55 px-3 py-2"
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-yellow-200">
                      Call #{item.called_order}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-white">
                      {item.word}
                    </p>
                    {item.description ? (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {item.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
