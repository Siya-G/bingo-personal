"use client";

import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

const SAMPLE_PHRASE =
  "Welcome to Bingo. I will call each word with a short fun fact.";

export function HostVoiceSettings() {
  const speech = useSpeechSynthesis();

  function handleTestVoice() {
    speech.cancel();
    speech.speak(SAMPLE_PHRASE, { force: true });
  }

  return (
    <div className="rounded-3xl bg-slate-950/50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Host Voice Settings</h2>
          <p className="mt-2 text-sm text-slate-300">
            Pick a browser voice for the Bingo Agent. Players use the same
            saved voice when they replay calls.
          </p>
        </div>
        <button
          className="rounded-full bg-yellow-300 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!speech.supported}
          onClick={handleTestVoice}
          type="button"
        >
          Test Host Voice
        </button>
      </div>

      {!speech.supported ? (
        <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
          Speech synthesis is not available in this browser.
        </p>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
            Voice
          </span>
          <select
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-white outline-none focus:border-yellow-300/70"
            disabled={!speech.supported}
            onChange={(event) => speech.setVoiceName(event.target.value)}
            value={speech.settings.voiceName}
          >
            <option value="">Default browser voice</option>
            {speech.voices.map((voice) => (
              <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4">
          <label className="block">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
              Rate ({speech.settings.rate.toFixed(1)})
            </span>
            <input
              className="mt-2 w-full accent-yellow-300"
              disabled={!speech.supported}
              max={1.6}
              min={0.5}
              onChange={(event) =>
                speech.setRate(Number.parseFloat(event.target.value))
              }
              step={0.1}
              type="range"
              value={speech.settings.rate}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
              Pitch ({speech.settings.pitch.toFixed(1)})
            </span>
            <input
              className="mt-2 w-full accent-yellow-300"
              disabled={!speech.supported}
              max={1.6}
              min={0.5}
              onChange={(event) =>
                speech.setPitch(Number.parseFloat(event.target.value))
              }
              step={0.1}
              type="range"
              value={speech.settings.pitch}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
              Volume ({speech.settings.volume.toFixed(1)})
            </span>
            <input
              className="mt-2 w-full accent-yellow-300"
              disabled={!speech.supported}
              max={1}
              min={0}
              onChange={(event) =>
                speech.setVolume(Number.parseFloat(event.target.value))
              }
              step={0.05}
              type="range"
              value={speech.settings.volume}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
