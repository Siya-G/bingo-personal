"use client";

import { useEffect, useState, startTransition } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { readPlayerGameSession } from "@/lib/player-session";
import type { PlayerGameSession } from "@/types/player";

/**
 * Player-side wrapper: reads the active session from sessionStorage so the
 * chat panel can use the player's identity + token without re-prompting.
 *
 * The card stays visible (with an informative message) even before a session
 * exists, so a fresh visitor sees what to do.
 */
export function PlayerChatCard() {
  const [session, setSession] = useState<PlayerGameSession | null>(null);

  useEffect(() => {
    // ``readPlayerGameSession`` touches sessionStorage, which is only available
    // in the browser; ``queueMicrotask`` defers past hydration so SSR is happy.
    queueMicrotask(() => {
      const stored = readPlayerGameSession();
      startTransition(() => setSession(stored));
    });
  }, []);

  if (!session) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6 text-center text-sm font-semibold text-slate-300">
        Join a room first to use chat. Your player session unlocks the chat
        controls for that game.
      </div>
    );
  }

  return (
    <ChatPanel
      gameId={session.game_id}
      role="PLAYER"
      senderName={session.player_name}
      senderId={session.player_id}
      playerSession={session.session_token}
    />
  );
}
