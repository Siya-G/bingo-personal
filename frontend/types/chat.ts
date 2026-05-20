/** Per-room chat message returned by the API and pushed over WebSocket. */
export type ChatSenderRole = "HOST" | "PLAYER" | "SYSTEM";

export type ChatMessage = {
  id: number;
  game_id: number;
  sender_id: number | null;
  sender_name: string;
  sender_role: ChatSenderRole;
  message: string;
  created_at: string;
};

/** Body posted by ChatPanel — sender_role is HOST or PLAYER only. */
export type SendChatMessagePayload = {
  sender_id: number | null;
  sender_name: string;
  sender_role: "HOST" | "PLAYER";
  message: string;
};

export const CHAT_MESSAGE_MAX_LENGTH = 500;
