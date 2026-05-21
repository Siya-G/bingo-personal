"use client";

import { useEffect } from "react";

const AUTO_DISMISS_MS = 5_000;

function formatPlacement(rank: number): string {
  if (rank === 1) {
    return "1st";
  }
  if (rank === 2) {
    return "2nd";
  }
  if (rank === 3) {
    return "3rd";
  }
  return `${rank}th`;
}

export type HostBingoWinNotice = Readonly<{
  playerName: string;
  rank: number;
}>;

type HostBingoWinBannerProps = Readonly<{
  notice: HostBingoWinNotice;
  onDismiss: () => void;
}>;

export function HostBingoWinBanner({ notice, onDismiss }: HostBingoWinBannerProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice, onDismiss]);

  const playerLabel = notice.playerName.trim() || "A player";
  const placement = formatPlacement(notice.rank);

  return (
    <>
      <style>{`
        @keyframes host-bingo-banner-in {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .host-bingo-win-banner {
          animation: host-bingo-banner-in 0.45s ease-out forwards;
        }
      `}</style>
      <div
        aria-live="polite"
        className="host-bingo-win-banner pointer-events-none fixed inset-x-0 top-0 z-[120] px-4 py-3 text-center shadow-lg shadow-black/40 sm:px-6"
        role="status"
        style={{ backgroundColor: "#F5C518" }}
      >
        <p className="text-sm font-black text-slate-950 sm:text-base">
          🏆 {playerLabel} got Bingo! — {placement} place
        </p>
      </div>
    </>
  );
}
