"use client";

import { useCallback, useEffect, useState, startTransition } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import {
  PLAYER_GAME_SESSION_KEY,
  readPlayerGameSession,
} from "@/lib/player-session";
import type { PlayerGameSession } from "@/types/player";

type PlayerChatCardProps = Readonly<{
  slideIn?: boolean;
  embedded?: boolean;
}>;

export function PlayerChatCard({ slideIn = false, embedded = false }: PlayerChatCardProps) {
  const [session, setSession] = useState<PlayerGameSession | null>(null);

  const refreshSession = useCallback(() => {
    const stored = readPlayerGameSession();
    startTransition(() => setSession(stored));
  }, []);

  useEffect(() => {
    queueMicrotask(refreshSession);
  }, [refreshSession]);

  useEffect(() => {
    if (!slideIn || typeof window === "undefined") {
      return;
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === PLAYER_GAME_SESSION_KEY) {
        refreshSession();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshSession, slideIn]);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm font-semibold text-slate-400">
        Join a room first to use chat. Your player session unlocks chat for this
        game.
      </div>
    );
  }

  return (
    <ChatPanel
      embedded={embedded}
      gameId={session.game_id}
      playerSession={session.session_token}
      role="PLAYER"
      senderId={session.player_id}
      senderName={session.player_name}
      slideIn={slideIn}
    />
  );
}
