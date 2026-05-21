"use client";

import type { PrizeNotification } from "@/types/prize";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type HostPrizeNotificationsProps = Readonly<{
  error: string | null;
  gameId: string;
  loading: boolean;
  notifications: PrizeNotification[];
  onMarkDisplayed: (notificationId: number) => Promise<void>;
}>;

export function HostPrizeNotifications({
  error,
  gameId,
  loading,
  notifications,
  onMarkDisplayed,
}: HostPrizeNotificationsProps) {
  if (!gameId) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
        Enter a game ID in Live Gameplay to load prize notifications for winners.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-black text-white">Prize notifications</h3>
        <p className="mt-1 text-sm text-slate-400">
          On-screen notices for each confirmed placement.{" "}
          <span className="font-semibold text-amber-100/90">
            Prize email and gift card delivery are not available yet.
          </span>
        </p>
      </div>

      {loading && notifications.length === 0 ? (
        <p className="text-sm font-semibold text-slate-400">Loading prize notices…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      {notifications.length === 0 && !loading && !error ? (
        <p className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
          No prize notices yet. They appear when a player&apos;s Bingo claim is
          confirmed as a win.
        </p>
      ) : null}

      {notifications.length > 0 ? (
        <ul className="space-y-3">
          {notifications.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-amber-300/25 bg-amber-500/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">
                    Rank #{row.rank} · {row.player_name}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">{row.message}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Status:{" "}
                    <span className="font-bold text-slate-300">{row.status}</span>
                    <span className="mx-2 text-slate-600">·</span>
                    {formatWhen(row.created_at)}
                  </p>
                </div>
                {row.status !== "DISPLAYED" ? (
                  <button
                    className="shrink-0 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
                    onClick={() => void onMarkDisplayed(row.id)}
                    type="button"
                  >
                    Mark displayed
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
