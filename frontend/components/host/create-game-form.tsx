"use client";

import { FormEvent, useState } from "react";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import { createGame } from "@/lib/api/games";
import { saveHostPinForGame } from "@/lib/host-credentials";
import { TeamsInvitesPanel } from "@/components/host/teams-invites-panel";
import type { Game, WinningPattern } from "@/types/game";

const winningPatternOptions: Array<{
  label: string;
  value: WinningPattern;
}> = [
  { label: "Horizontal row", value: "HORIZONTAL_ROW" },
  { label: "Vertical column", value: "VERTICAL_COLUMN" },
  { label: "Diagonal", value: "DIAGONAL" },
  { label: "Full house", value: "FULL_HOUSE" },
];

const initialFormState = {
  title: "",
  topic: "Famous mountains",
  numberOfPlayers: "12",
  winningPattern: "HORIZONTAL_ROW" as WinningPattern,
  hostPin: "",
};

export function CreateGameForm() {
  const [title, setTitle] = useState(initialFormState.title);
  const [topic, setTopic] = useState(initialFormState.topic);
  const [numberOfPlayers, setNumberOfPlayers] = useState(
    initialFormState.numberOfPlayers,
  );
  const [winningPattern, setWinningPattern] = useState<WinningPattern>(
    initialFormState.winningPattern,
  );
  const [hostPin, setHostPin] = useState(initialFormState.hostPin);
  const [createdGame, setCreatedGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedGame(null);
    setIsSubmitting(true);

    try {
      const game = await createGame({
        title: title.trim(),
        topic: topic.trim(),
        number_of_players: Number(numberOfPlayers),
        winning_pattern: winningPattern,
        host_pin: hostPin.trim(),
      });

      saveHostPinForGame(String(game.id), hostPin.trim());
      setCreatedGame(game);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create game. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

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

      <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
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

          <label className="block">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
              Winning pattern
            </span>
            <select
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-white outline-none focus:border-yellow-300/70"
              onChange={(event) =>
                setWinningPattern(event.target.value as WinningPattern)
              }
              value={winningPattern}
            >
              {winningPatternOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <LoadingState active={isSubmitting} label="Creating game…" />

        <button
          className="rounded-full bg-yellow-300 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          Create Game
        </button>
      </form>

      <div className="mt-5">
        <ErrorMessage message={error} title="Could not create game" />
      </div>

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
