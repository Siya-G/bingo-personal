"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import { createGame } from "@/lib/api/games";
import { saveHostPinForGame } from "@/lib/host-credentials";
import {
  WINNING_PATTERN_OPTIONS,
  formatWinningPatternsList,
  sortPatternsByOptionOrder,
  type WinningPattern,
} from "@/lib/winning-patterns";
import { TeamsInvitesPanel } from "@/components/host/teams-invites-panel";
import type { Game } from "@/types/game";

const initialFormState = {
  title: "",
  topic: "Famous mountains",
  numberOfPlayers: "12",
  hostPin: "",
};

export function CreateGameForm() {
  const [title, setTitle] = useState(initialFormState.title);
  const [topic, setTopic] = useState(initialFormState.topic);
  const [numberOfPlayers, setNumberOfPlayers] = useState(
    initialFormState.numberOfPlayers,
  );
  const [selectedPatterns, setSelectedPatterns] = useState<WinningPattern[]>([
    "HORIZONTAL_ROW",
  ]);
  const [hostPin, setHostPin] = useState(initialFormState.hostPin);
  const [createdGame, setCreatedGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!error) {
      return;
    }
    const node = errorBoxRef.current;
    // ``scrollIntoView`` is missing in jsdom (test env); also harmless to skip
    // if the element is detached.
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [error]);

  function togglePattern(pattern: WinningPattern) {
    setSelectedPatterns((prev) => {
      if (prev.includes(pattern)) {
        if (prev.length <= 1) {
          return prev;
        }
        return prev.filter((p) => p !== pattern);
      }
      return sortPatternsByOptionOrder([...prev, pattern]);
    });
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    // ``preventDefault`` is still called for the Enter-in-input keyboard path
    // (the submit button itself is ``type="button"`` so a mouse click never
    // dispatches a ``submit`` event).
    event?.preventDefault();
    setError(null);
    setCreatedGame(null);
    setIsSubmitting(true);

    try {
      const ordered = sortPatternsByOptionOrder([...selectedPatterns]);
      const game = await createGame({
        title: title.trim(),
        topic: topic.trim(),
        number_of_players: Number(numberOfPlayers),
        winning_patterns: ordered,
        winning_pattern: ordered[0],
        host_pin: hostPin.trim(),
      });

      saveHostPinForGame(String(game.id), hostPin.trim());
      // Form state stays as-is on success; only the green result card appears.
      setCreatedGame(game);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create game. Please try again.";
      // Single diagnostic line in DevTools so the user can see the exact
      // URL/status/CORS detail when the visible alert isn't enough.
      console.error("[CreateGameForm] POST /games failed:", caughtError);
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const winningPatternsSummary = createdGame
    ? formatWinningPatternsList(
        createdGame.winning_patterns?.length
          ? createdGame.winning_patterns
          : [String(createdGame.winning_pattern)],
      )
    : "";

  return (
    <div className="rounded-3xl bg-slate-950/50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Create Game</h2>
          <p className="mt-2 text-sm text-slate-300">
            Configure the lobby basics, set a host PIN for later controls, then
            generate items and cards from the live gameplay panel.
          </p>
        </div>
        <span className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-200">
          Host setup
        </span>
      </div>

      <div className="mt-5" ref={errorBoxRef}>
        <ErrorMessage message={error} title="Could not create game" />
      </div>

      <form
        // The submit button is ``type="button"`` (see below) so a normal mouse
        // click never dispatches a ``submit`` event and the browser cannot do a
        // default GET-to-current-URL navigation. ``onSubmit`` is still wired so
        // pressing Enter inside a text input works — but ``preventDefault`` is
        // called first to neutralise any pre-hydration race (observed on
        // Next.js 16 / Turbopack dev builds, where clicks racing hydration
        // reloaded the page as ``/host?``).
        noValidate
        className="mt-6 grid gap-5"
        onSubmit={handleSubmit}
      >
        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
            Game title
          </span>
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Friday Night Bingo"
            required
            type="text"
            value={title}
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
            Topic
          </span>
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Famous mountains"
            required
            type="text"
            value={topic}
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
            Host PIN
          </span>
          <input
            autoComplete="new-password"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
            minLength={4}
            onChange={(event) => setHostPin(event.target.value)}
            placeholder="At least 4 characters"
            required
            type="password"
            value={hostPin}
          />
          <p className="mt-2 text-xs text-slate-500">
            Used for generate items/cards, start/call, and audit trail. MVP only:
            replace with real auth before production — never ship API keys in the
            browser bundle.
          </p>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
              Players / cards
            </span>
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
              min={1}
              max={500}
              onChange={(event) => setNumberOfPlayers(event.target.value)}
              required
              type="number"
              value={numberOfPlayers}
            />
          </label>

          <fieldset className="block min-w-0">
            <legend className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
              Winning patterns
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              A player wins if their card completes <strong>any</strong> checked
              pattern (marked squares must be called).
            </p>
            <ul className="mt-3 space-y-2.5 rounded-2xl border border-white/10 bg-slate-900/40 p-3">
              {WINNING_PATTERN_OPTIONS.map((option) => (
                <li key={option.value}>
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200">
                    <input
                      checked={selectedPatterns.includes(option.value)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-slate-900 text-yellow-300 focus:ring-yellow-400/60"
                      onChange={() => togglePattern(option.value)}
                      type="checkbox"
                    />
                    <span>
                      <span className="font-bold text-white">{option.label}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </div>

        <LoadingState active={isSubmitting} label="Creating game…" />

        <button
          className="rounded-full bg-yellow-300 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={() => {
            void handleSubmit();
          }}
          type="button"
        >
          Create Game
        </button>
      </form>

      {createdGame ? (
        <div className="mt-5 rounded-3xl border border-emerald-300/30 bg-emerald-400/10 p-5">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-200">
            Game created
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/45 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Game code
              </p>
              <p className="mt-2 text-3xl font-black tracking-[0.16em] text-white">
                {createdGame.game_code}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950/45 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Game ID
              </p>
              <p className="mt-2 text-3xl font-black text-white">
                {createdGame.id}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-300">
            <span className="font-bold text-emerald-100">Winning patterns:</span>{" "}
            {winningPatternsSummary}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Your host PIN was saved for this tab. Enter the game ID and PIN in Live
            Gameplay to run the room.
          </p>
          <TeamsInvitesPanel
            gameId={createdGame.id}
            gameTitle={createdGame.title}
            gameTopic={createdGame.topic}
            hostPin={hostPin}
          />
        </div>
      ) : null}
    </div>
  );
}
