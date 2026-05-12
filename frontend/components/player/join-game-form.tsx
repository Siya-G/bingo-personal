"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import { joinGame } from "@/lib/api/games";
import { savePlayerGameSession } from "@/lib/player-session";

export function JoinGameForm({
  initialRoomCode = "",
}: {
  initialRoomCode?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gameCode, setGameCode] = useState(initialRoomCode);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const joinedGame = await joinGame({
        name: name.trim(),
        game_code: gameCode.trim().toUpperCase(),
      });

      savePlayerGameSession({
        game_id: joinedGame.game_id,
        player_id: joinedGame.player_id,
        player_name: joinedGame.player_name,
        game_title: joinedGame.game_title,
        session_token: joinedGame.session_token,
      });

      router.push("/game");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to join this game. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-3xl bg-slate-950/50 p-5 sm:p-6">
      <h2 className="text-2xl font-black text-white">Join a Bingo Room</h2>
      <p className="mt-2 text-sm text-slate-300">
        Enter your name and the host&apos;s game code. Your card will be assigned
        automatically when the game is ready.
      </p>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
            Room Code
          </span>
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-lg font-black uppercase tracking-[0.3em] text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
            onChange={(event) => setGameCode(event.target.value.toUpperCase())}
            placeholder="BINGO"
            required
            type="text"
            value={gameCode}
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-200">
            Display Name
          </span>
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
            onChange={(event) => setName(event.target.value)}
            placeholder="Player name"
            required
            type="text"
            value={name}
          />
        </label>

        <LoadingState active={isSubmitting} label="Joining game…" />

        <button
          className="w-full rounded-full bg-yellow-300 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          Join Game
        </button>
      </form>

      <div className="mt-5">
        <ErrorMessage message={error} title="Could not join" />
      </div>
    </div>
  );
}
