import Link from "next/link";
import type { GameLeaderboard, LeaderboardWinner } from "@/types/leaderboard";

type HostLeaderboardPreviewProps = Readonly<{
  gameId: string;
  leaderboard: GameLeaderboard | null;
  loading: boolean;
  error: string | null;
  /** Short line under the title (e.g. WebSocket hint). */
  liveHint?: string;
}>;

function winnerAtRank(
  winners: LeaderboardWinner[],
  rank: number,
): LeaderboardWinner | undefined {
  return winners.find((entry) => entry.rank === rank);
}

function PodiumSlot({
  label,
  winner,
}: Readonly<{
  label: string;
  winner: LeaderboardWinner | undefined;
}>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-center">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
        {label}
      </p>
      {winner ? (
        <div className="mt-3 space-y-1">
          <p className="text-lg font-black text-white">{winner.player_name}</p>
          <p className="text-xs text-slate-400">Player #{winner.player_id}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-500">No winner yet</p>
      )}
    </div>
  );
}

export function HostLeaderboardPreview({
  gameId,
  leaderboard,
  loading,
  error,
  liveHint,
}: HostLeaderboardPreviewProps) {
  if (!gameId) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
        Enter a game ID above to preview the podium. When you are hosting a
        game, standings update in real time over the WebSocket.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {liveHint ? (
        <p className="text-xs font-semibold text-cyan-200/80">{liveHint}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-black text-white">Leaderboard preview</h3>
        <Link
          className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200 underline-offset-4 hover:underline"
          href={`/leaderboard?gameId=${encodeURIComponent(gameId)}`}
        >
          Open full page
        </Link>
      </div>

      {loading && !leaderboard ? (
        <p className="text-sm font-semibold text-slate-400">Loading leaderboard…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      {leaderboard ? (
        <>
          <p className="text-sm text-slate-300">
            <span className="font-bold text-white">{leaderboard.game_title}</span>
            <span className="mx-2 text-slate-500">·</span>
            Status:{" "}
            <span className="font-bold text-yellow-100">{leaderboard.game_status}</span>
          </p>

          {leaderboard.game_status === "COMPLETED" ? (
            <div className="rounded-2xl border border-fuchsia-400/35 bg-fuchsia-500/10 p-3 text-center text-sm font-bold text-fuchsia-100">
              Game completed — all three placements are filled.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <PodiumSlot
              label="1st place"
              winner={winnerAtRank(leaderboard.winners, 1)}
            />
            <PodiumSlot
              label="2nd place"
              winner={winnerAtRank(leaderboard.winners, 2)}
            />
            <PodiumSlot
              label="3rd place"
              winner={winnerAtRank(leaderboard.winners, 3)}
            />
          </div>

          {leaderboard.winners.length === 0 && !loading ? (
            <p className="text-center text-sm text-slate-400">
              No Bingo winners yet. When players claim Bingo, they will appear here.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
