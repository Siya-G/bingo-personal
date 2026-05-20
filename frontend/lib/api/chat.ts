import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { formatDetailPayload, readApiErrorDetail } from "@/lib/api/error-detail";
import type { ChatMessage, SendChatMessagePayload } from "@/types/chat";

const API_BASE_URL = getPublicApiBaseUrl();

const HEADER_HOST_PIN = "X-Host-Pin";
const HEADER_PLAYER_SESSION = "X-Player-Session";

/**
 * Thrown when the backend rejects a message via chat moderation. Carries the
 * machine-readable ``reason`` so the UI can branch on it (e.g. show a slightly
 * different tone for ``spam_repetition`` vs ``inappropriate_language``) while
 * keeping the public copy generic.
 */
export class ChatModerationError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = "ChatModerationError";
    this.reason = reason;
  }
}

function chatHeaders(opts: {
  hostPin?: string | null;
  playerSession?: string | null;
}): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const pin = opts.hostPin?.trim();
  if (pin) {
    headers[HEADER_HOST_PIN] = pin;
  }
  const session = opts.playerSession?.trim();
  if (session) {
    headers[HEADER_PLAYER_SESSION] = session;
  }
  return headers;
}

export async function getChatHistory(gameId: number): Promise<ChatMessage[]> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(String(gameId))}/chat`;
  const response = await fetch(url);
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load the chat history.",
    );
    throw new Error(message);
  }
  return response.json() as Promise<ChatMessage[]>;
}

function tryParseModerationBlock(
  body: unknown,
): { error: string; reason: string } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const detail = (body as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") {
    return null;
  }
  const errorText = (detail as { error?: unknown }).error;
  const reasonText = (detail as { reason?: unknown }).reason;
  if (typeof errorText !== "string" || typeof reasonText !== "string") {
    return null;
  }
  return { error: errorText, reason: reasonText };
}

export async function sendChatMessage(
  gameId: number,
  payload: SendChatMessagePayload,
  credentials: { hostPin?: string | null; playerSession?: string | null },
): Promise<ChatMessage> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(String(gameId))}/chat`;
  const response = await fetch(url, {
    method: "POST",
    headers: chatHeaders(credentials),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    // Try to read the body as JSON once so we can detect the structured
    // moderation block (`{detail: {error, reason}}`) without consuming the
    // stream twice.
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    const moderation = tryParseModerationBlock(parsed);
    if (moderation) {
      throw new ChatModerationError(moderation.error, moderation.reason);
    }
    const fallback = formatDetailPayload(
      (parsed as { detail?: unknown } | null)?.detail,
      "Unable to send the chat message.",
    );
    throw new Error(fallback);
  }
  return response.json() as Promise<ChatMessage>;
}
