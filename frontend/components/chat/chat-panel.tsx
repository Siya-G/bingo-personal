"use client";

import {
  FormEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ChatModerationError,
  getChatHistory,
  sendChatMessage,
} from "@/lib/api/chat";
import { useGameSocket } from "@/hooks/useGameSocket";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from "@/types/chat";

/**
 * Props for ChatPanel.
 *
 * Pass the numeric ``gameId``, the local user's identity, and the credential
 * the backend expects for this role. The panel handles loading history, WS
 * subscription, dedup, send, and auto-scroll on its own.
 */
type ChatPanelProps = Readonly<{
  gameId: number | string | null;
  role: "HOST" | "PLAYER";
  senderName: string;
  senderId: number | null;
  hostPin?: string | null;
  playerSession?: string | null;
  className?: string;
  /** Override the auto-derived "Live updates" caption (e.g. for tests). */
  socketStatusOverride?: string | null;
}>;

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function roleBadgeClassName(role: ChatMessage["sender_role"]): string {
  switch (role) {
    case "HOST":
      return "bg-yellow-300/85 text-slate-950";
    case "PLAYER":
      return "bg-cyan-400/25 text-cyan-100 ring-1 ring-cyan-300/40";
    case "SYSTEM":
    default:
      return "bg-slate-700/60 text-slate-200 ring-1 ring-white/10";
  }
}

function formatTimestamp(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    return "";
  }
  return TIME_FORMATTER.format(new Date(ts));
}

/**
 * Merge ``incoming`` into ``current`` keyed by ``id`` so the POST response and
 * the matching CHAT_MESSAGE WebSocket event don't double-render. Falls back to
 * ``current`` if ``incoming`` is missing required fields.
 */
function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (typeof incoming?.id !== "number") {
    return current;
  }
  const idx = current.findIndex((m) => m.id === incoming.id);
  if (idx >= 0) {
    if (current[idx] === incoming) {
      return current;
    }
    const next = current.slice();
    next[idx] = incoming;
    return next;
  }
  return [...current, incoming];
}

export function ChatPanel(props: ChatPanelProps) {
  const {
    gameId,
    role,
    senderName,
    senderId,
    hostPin,
    playerSession,
    className,
    socketStatusOverride,
  } = props;

  const trimmedGameIdStr = useMemo(() => {
    if (gameId === null || gameId === undefined) {
      return "";
    }
    return String(gameId).trim();
  }, [gameId]);

  const numericGameId = useMemo(() => {
    if (!trimmedGameIdStr) {
      return null;
    }
    const n = Number(trimmedGameIdStr);
    return Number.isFinite(n) ? n : null;
  }, [trimmedGameIdStr]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Live updates: same WebSocket the rest of the room uses.
  const { lastEvent, status: wsStatus } = useGameSocket(trimmedGameIdStr);

  // Reset when the gameId changes so a stale room's chat doesn't leak.
  useEffect(() => {
    startTransition(() => {
      setMessages([]);
      setHistoryError(null);
      setSendError(null);
    });
  }, [trimmedGameIdStr]);

  // Initial history fetch.
  useEffect(() => {
    if (numericGameId === null) {
      return;
    }
    let cancelled = false;
    startTransition(() => {
      setIsLoading(true);
      setHistoryError(null);
    });
    void getChatHistory(numericGameId)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        startTransition(() => setMessages(rows));
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        startTransition(() =>
          setHistoryError(
            err instanceof Error
              ? err.message
              : "Unable to load chat history.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          startTransition(() => setIsLoading(false));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [numericGameId]);

  // Incoming CHAT_MESSAGE events feed straight into the merge.
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== "CHAT_MESSAGE") {
      return;
    }
    const incoming = lastEvent.payload;
    if (numericGameId !== null && incoming.game_id !== numericGameId) {
      return;
    }
    startTransition(() => {
      setMessages((prev) => mergeMessages(prev, incoming));
    });
  }, [lastEvent, numericGameId]);

  // Auto-scroll to the newest message whenever the list grows.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    // ``scrollTop = scrollHeight`` is enough; jsdom has no real layout.
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const trimmedDraft = draft.trim();
  const canSend =
    !isSending &&
    numericGameId !== null &&
    trimmedDraft.length > 0 &&
    trimmedDraft.length <= CHAT_MESSAGE_MAX_LENGTH;

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!canSend || numericGameId === null) {
        return;
      }
      setSendError(null);
      setIsSending(true);
      try {
        const saved = await sendChatMessage(
          numericGameId,
          {
            sender_id: role === "PLAYER" ? senderId : null,
            sender_name: senderName,
            sender_role: role,
            message: trimmedDraft,
          },
          { hostPin, playerSession },
        );
        // Optimistic insert; the matching CHAT_MESSAGE event arrives shortly
        // after but is deduped by id in mergeMessages.
        setMessages((prev) => mergeMessages(prev, saved));
        setDraft("");
        // Keep focus in the input for rapid replies.
        inputRef.current?.focus();
      } catch (err) {
        if (err instanceof ChatModerationError) {
          // Sender-only notice. The blocked content is NOT added to the chat
          // list and the draft stays so the user can edit + retry.
          setSendError(
            "Your message was blocked by chat moderation. " +
              "Please rephrase before sending.",
          );
        } else {
          setSendError(
            err instanceof Error
              ? err.message
              : "Unable to send your message. Try again.",
          );
        }
      } finally {
        setIsSending(false);
      }
    },
    [
      canSend,
      hostPin,
      numericGameId,
      playerSession,
      role,
      senderId,
      senderName,
      trimmedDraft,
    ],
  );

  const liveCaption =
    socketStatusOverride ??
    (wsStatus === "open"
      ? "Live chat: connected"
      : wsStatus === "connecting"
        ? "Live chat: connecting…"
        : wsStatus === "error"
          ? "Live chat: error (retrying)"
          : wsStatus === "closed"
            ? "Live chat: reconnecting…"
            : null);

  const remaining = CHAT_MESSAGE_MAX_LENGTH - trimmedDraft.length;

  return (
    <section
      className={[
        "flex flex-col rounded-3xl border border-white/10 bg-slate-950/40 p-4 text-slate-100",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="chat-panel"
      aria-label="Game room chat"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-white">Room chat</h3>
          {liveCaption ? (
            <p className="mt-1 text-xs font-semibold text-cyan-200/85">
              {liveCaption}
            </p>
          ) : null}
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {messages.length} {messages.length === 1 ? "message" : "messages"}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="mb-3 flex max-h-72 min-h-32 flex-col gap-2 overflow-y-auto rounded-2xl bg-slate-900/60 p-3"
        data-testid="chat-messages"
      >
        {numericGameId === null ? (
          <p className="text-sm font-semibold text-slate-400">
            Enter a game ID to see chat for that room.
          </p>
        ) : isLoading && messages.length === 0 ? (
          <p className="text-sm font-semibold text-slate-400">
            Loading messages…
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm font-semibold text-slate-400">
            No messages yet. Say hi to the room.
          </p>
        ) : (
          messages.map((message) => (
            <ChatMessageRow key={message.id} message={message} />
          ))
        )}
      </div>

      {historyError ? (
        <p
          className="mb-3 rounded-2xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100"
          role="alert"
        >
          {historyError}
        </p>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2"
        noValidate
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label htmlFor="chat-message-input" className="sr-only">
          Message
        </label>
        <input
          id="chat-message-input"
          ref={inputRef}
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-400 focus:border-yellow-300/70"
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            numericGameId === null
              ? "Game ID required to chat"
              : `Send as ${senderName || (role === "HOST" ? "Host" : "Player")}…`
          }
          type="text"
          value={draft}
          disabled={numericGameId === null}
          autoComplete="off"
        />
        <button
          className="rounded-full bg-yellow-300 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSend}
          type="submit"
        >
          {isSending ? "Sending…" : "Send"}
        </button>
        <span
          aria-live="polite"
          className={[
            "text-[10px] font-semibold uppercase tracking-[0.14em]",
            remaining < 0 ? "text-red-300" : "text-slate-500",
          ].join(" ")}
        >
          {remaining}/{CHAT_MESSAGE_MAX_LENGTH}
        </span>
      </form>

      {sendError ? (
        <p
          className="mt-2 rounded-2xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100"
          role="alert"
        >
          {sendError}
        </p>
      ) : null}

      <p className="mt-2 text-[10px] font-semibold text-slate-500">
        Please keep chat respectful and workplace-appropriate.
      </p>
    </section>
  );
}

function ChatMessageRow({ message }: { message: ChatMessage }) {
  const role = message.sender_role;
  const isSystem = role === "SYSTEM";
  const containerClass = isSystem
    ? "border-cyan-400/20 bg-cyan-500/5 text-cyan-100"
    : "border-white/10 bg-white/5 text-slate-100";

  return (
    <div
      className={[
        "rounded-2xl border px-3 py-2 text-sm",
        containerClass,
      ].join(" ")}
      data-testid="chat-message"
      data-role={role}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]",
            roleBadgeClassName(role),
          ].join(" ")}
        >
          {role}
        </span>
        <span className="text-xs font-bold text-white">
          {message.sender_name}
        </span>
        <span className="ml-auto text-[10px] font-semibold text-slate-400">
          {formatTimestamp(message.created_at)}
        </span>
      </div>
      <p
        className={[
          "mt-1 break-words",
          isSystem ? "italic text-cyan-100/95" : "text-slate-100",
        ].join(" ")}
      >
        {/* React text content is escaped automatically — no raw HTML injection. */}
        {message.message}
      </p>
    </div>
  );
}
