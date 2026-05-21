"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { HostChatCard } from "@/components/chat/host-chat-card";
import { PlayerChatCard } from "@/components/chat/player-chat-card";
import { useLiveGameSession } from "@/hooks/useLiveGameSession";

type SlideInRoomChatProps = Readonly<{
  variant: "host" | "player";
  gameId?: string;
  hostPin?: string;
}>;

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className ?? "size-4 shrink-0"}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
    </svg>
  );
}

export function SlideInRoomChat({
  variant,
  gameId: gameIdProp = "",
  hostPin: hostPinProp = "",
}: SlideInRoomChatProps) {
  const [open, setOpen] = useState(false);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const live = useLiveGameSession();

  const hostGameId =
    variant === "host"
      ? gameIdProp.trim() || live.gameId
      : "";
  const hostPin =
    variant === "host"
      ? hostPinProp.trim() || live.hostPin
      : "";

  const toggle = () => setOpen((current) => !current);
  const close = () => setOpen(false);

  if (!isClient) {
    return null;
  }

  return createPortal(
    <>
      <aside
        aria-hidden={!open}
        aria-label="Room Chat"
        className={[
          "fixed top-0 z-[100] flex h-dvh w-[400px] flex-col border-l border-white/10 bg-slate-950 shadow-2xl shadow-black/60 transition-transform duration-300 ease-in-out",
          open ? "right-0 translate-x-0" : "right-0 translate-x-full",
        ].join(" ")}
        data-testid="slide-in-room-chat"
        role="dialog"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-black text-white">Room Chat</h2>
          <button
            aria-label="Close chat"
            className="grid size-9 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            onClick={close}
            type="button"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          {variant === "host" ? (
            <HostChatCard
              gameId={hostGameId}
              hostPin={hostPin}
              slideIn
            />
          ) : (
            <PlayerChatCard slideIn />
          )}
        </div>
      </aside>

      <button
        aria-expanded={open}
        aria-label={open ? "Close room chat" : "Open room chat"}
        className={[
          "fixed top-1/2 z-[101] flex h-28 w-11 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-white/10 border-r-0 bg-slate-900 shadow-lg transition-all duration-300 ease-in-out hover:bg-slate-800",
          open ? "right-[400px]" : "right-0",
        ].join(" ")}
        onClick={toggle}
        type="button"
      >
        <span className="flex origin-center -rotate-90 items-center gap-2 whitespace-nowrap text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
          <ChatBubbleIcon />
          Chat
        </span>
      </button>
    </>,
    document.body,
  );
}
