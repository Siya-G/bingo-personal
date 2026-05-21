"use client";

import { useEffect, useState, startTransition } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { readHostPinForGame } from "@/lib/host-credentials";

type HostChatCardProps = Readonly<{
  /** Slide-in panel: game ID and PIN come from the page, not manual entry. */
  slideIn?: boolean;
  gameId?: string;
  hostPin?: string;
  /** @deprecated Floating popup layout */
  embedded?: boolean;
}>;

export function HostChatCard({
  slideIn = false,
  gameId: gameIdProp = "",
  hostPin: hostPinProp = "",
  embedded = false,
}: HostChatCardProps) {
  const [gameId, setGameId] = useState("");
  const [hostPin, setHostPin] = useState("");
  const [hostLabel, setHostLabel] = useState("Host");

  const resolvedGameId = slideIn ? gameIdProp.trim() : gameId.trim();
  const resolvedHostPin = slideIn
    ? hostPinProp.trim() ||
      (resolvedGameId ? readHostPinForGame(resolvedGameId) ?? "" : "")
    : hostPin.trim();

  useEffect(() => {
    if (slideIn) {
      return;
    }
    const trimmed = gameId.trim();
    startTransition(() => {
      setHostPin(trimmed ? readHostPinForGame(trimmed) ?? "" : "");
    });
  }, [gameId, slideIn]);

  if (slideIn) {
    if (!resolvedGameId) {
      return (
        <p className="text-center text-sm font-semibold text-slate-400">
          Create a game or enter your game ID in Live Gameplay to open room chat.
        </p>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <label className="block shrink-0">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Display name
          </span>
          <input
            aria-label="Host display name"
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
            onChange={(event) => setHostLabel(event.target.value)}
            placeholder="Host"
            type="text"
            value={hostLabel}
          />
        </label>
        <ChatPanel
          gameId={resolvedGameId}
          hostPin={resolvedHostPin}
          role="HOST"
          senderId={null}
          senderName={hostLabel.trim() || "Host"}
          slideIn
        />
      </div>
    );
  }

  return (
    <div className={embedded ? "flex min-h-0 flex-col gap-3" : "space-y-4"}>
      <div
        className={
          embedded
            ? "grid gap-2"
            : "grid gap-3 sm:grid-cols-[1fr_1fr_1fr]"
        }
      >
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
          autoComplete="off"
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
          onChange={(event) => setHostPin(event.target.value)}
          placeholder="Host PIN"
          type="password"
          value={hostPin}
        />
      </div>

      {!embedded ? (
        <p className="text-xs text-slate-400">
          Chat opens once the Game ID is set. The host PIN auto-fills if you have
          already entered it in Live Gameplay for this room (per-tab session
          storage; no PIN is sent to the chat history endpoint).
        </p>
      ) : null}

      <ChatPanel
        embedded={embedded}
        gameId={resolvedGameId || null}
        hostPin={resolvedHostPin}
        role="HOST"
        senderId={null}
        senderName={hostLabel.trim() || "Host"}
      />
    </div>
  );
}
