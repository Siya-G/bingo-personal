"use client";

import { useEffect, useState, startTransition } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { readHostPinForGame } from "@/lib/host-credentials";

/**
 * Host-side wrapper: keeps a local ``gameId`` + ``hostPin`` so the host can
 * chat without lifting state from GameplayControls. The PIN auto-fills from
 * the per-tab credential cache that GameplayControls already populates after
 * a successful Generate Items call.
 */
export function HostChatCard() {
  const [gameId, setGameId] = useState("");
  const [hostPin, setHostPin] = useState("");
  const [hostLabel, setHostLabel] = useState("Host");

  useEffect(() => {
    const trimmed = gameId.trim();
    startTransition(() => {
      setHostPin(trimmed ? readHostPinForGame(trimmed) ?? "" : "");
    });
  }, [gameId]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
        <input
          aria-label="Host display name"
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
          onChange={(event) => setHostLabel(event.target.value)}
          placeholder="Host name shown in chat (e.g. Host)"
          type="text"
          value={hostLabel}
        />
        <input
          aria-label="Game ID for chat"
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
          inputMode="numeric"
          onChange={(event) => setGameId(event.target.value)}
          placeholder="Game ID"
          type="text"
          value={gameId}
        />
        <input
          aria-label="Host PIN for chat"
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
          onChange={(event) => setHostPin(event.target.value)}
          placeholder="Host PIN"
          type="password"
          value={hostPin}
          autoComplete="off"
        />
      </div>

      <p className="text-xs text-slate-400">
        Chat opens once the Game ID is set. The host PIN auto-fills if you have
        already entered it in Live Gameplay for this room (per-tab session
        storage; no PIN is sent to the chat history endpoint).
      </p>

      <ChatPanel
        gameId={gameId.trim() || null}
        role="HOST"
        senderName={hostLabel.trim() || "Host"}
        senderId={null}
        hostPin={hostPin}
      />
    </div>
  );
}
