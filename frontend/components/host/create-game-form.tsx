"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { createGame } from "@/lib/api/games";
import { saveHostPinForGame } from "@/lib/host-credentials";
import { saveLiveGameId } from "@/lib/live-game-session";
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

type CreateGameFormProps = Readonly<{
  onGameCreated?: (game: Game, hostPin: string) => void;
}>;

export function CreateGameForm({ onGameCreated }: CreateGameFormProps = {}) {
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
  const [createGameError, setCreateGameError] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const errorBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!createGameError) {
      return;
    }
    const node = errorBoxRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [createGameError]);

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

  function validateCreateGameForm(): string | null {
    const trimmedTitle = title.trim();
    const trimmedTopic = topic.trim();
    const trimmedPin = hostPin.trim();
    const playerCount = Number(numberOfPlayers);

    if (!trimmedTitle) {
      return "Game title is required.";
    }
    if (!trimmedTopic) {
      return "Topic is required.";
    }
    if (trimmedPin.length < 4) {
      return "Host PIN must be at least 4 characters.";
    }
    if (!Number.isFinite(playerCount) || playerCount < 1 || playerCount > 500) {
      return "Number of players must be between 1 and 500.";
    }
    if (selectedPatterns.length === 0) {
      return "Select at least one winning pattern.";
    }
    return null;
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    if (event) {
      event.preventDefault();
      console.log("preventDefault called");
    }
    console.log("Create Game clicked");

    const validationError = validateCreateGameForm();
    if (validationError) {
      console.log("Create Game validation failed:", validationError);
      setCreateGameError(validationError);
      return;
    }

    const ordered = sortPatternsByOptionOrder([...selectedPatterns]);
    const payload = {
      title: title.trim(),
      topic: topic.trim(),
      number_of_players: Number(numberOfPlayers),
      winning_patterns: ordered,
      winning_pattern: ordered[0],
      host_pin: hostPin.trim(),
    };
    const url = `${getPublicApiBaseUrl()}/games`;
    console.log("payload", payload);
    console.log("API URL", url);

    setCreateGameError(null);
    setIsCreatingGame(true);

    try {
      const game = await createGame(payload);
      console.log("response status", 201, "body", game);
      const trimmedPin = hostPin.trim();
      saveHostPinForGame(String(game.id), trimmedPin);
      saveLiveGameId(String(game.id));
      setCreatedGame(game);
      onGameCreated?.(game, trimmedPin);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create game. Please try again.";
      setCreateGameError(message);
    } finally {
      setIsCreatingGame(false);
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
      <div>
        <h2 className="text-2xl font-black text-white">Create Game</h2>
        <p className="mt-2 text-sm text-slate-300">
          Configure the lobby basics, set a host PIN for later controls, then
          generate items and cards from the live gameplay panel.
        </p>
      </div>

      <div className="mt-5" ref={errorBoxRef}>
        <ErrorMessage message={createGameError} title="Could not create game" />
      </div>

      <form
        action="#"
        noValidate
        className="mt-6 grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          console.log("preventDefault called");
          void handleSubmit(event);
        }}
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
            suppressHydrationWarning
            autoComplete="off"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
            minLength={4}
            onChange={(event) => setHostPin(event.target.value)}
            placeholder="At least 4 characters"
            required
            type="password"
            value={hostPin}
          />
          <p className="mt-2 text-xs text-slate-500">
            Used for generate items/cards, start/call, and audit trail. Keep this
            PIN private — only the host should know it.
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

        <LoadingState active={isCreatingGame} label="Creating game…" />

        <button
          className="rounded-full bg-yellow-300 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreatingGame}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            console.log("preventDefault called");
            void handleSubmit();
          }}
          type="button"
        >
          {isCreatingGame ? "Creating game…" : "Create Game"}
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
