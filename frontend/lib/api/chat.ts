import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { readApiErrorDetail } from "@/lib/api/error-detail";
import type { ChatMessage, SendChatMessagePayload } from "@/types/chat";

const API_BASE_URL = getPublicApiBaseUrl();

const HEADER_HOST_PIN = "X-Host-Pin";
const HEADER_PLAYER_SESSION = "X-Player-Session";

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
    const detail = await readApiErrorDetail(
      response,
      "Unable to send the chat message.",
    );
    throw new Error(detail);
  }
  return response.json() as Promise<ChatMessage>;
}
