"use client";

import { CalledItemsList } from "@/components/game/called-items-list";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import type { CalledItem } from "@/types/gameplay";

type BingoAgentPanelProps = Readonly<{
  items: CalledItem[];
  title?: string;
}>;

export function BingoAgentPanel({
  items,
  title = "Bingo Agent",
}: BingoAgentPanelProps) {
  const speech = useSpeechSynthesis();
  const currentItem = items.at(-1) ?? null;

  function handleReplay() {
    if (!currentItem) {
      return;
    }
    speech.cancel();
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
          Speech synthesis is not available in this browser. You can still see
          calls on screen.
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
