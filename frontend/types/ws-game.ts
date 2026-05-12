import type { BingoClaimResponse } from "@/types/bingo";
import type { LeaderboardWinner } from "@/types/leaderboard";

/** Payload for NEW_CALLED_ITEM — matches CalledItem from REST. */
export type WsNewCalledItemPayload = {
  item_id: number;
  word: string;
  description: string | null;
  called_order: number;
  called_at: string;
};

export type WsCardCellUpdatedPayload = {
  player_id: number;
  cell_id: number;
  is_marked: boolean;
};

export type WsBingoClaimedPayload = BingoClaimResponse;

export type WsLeaderboardUpdatedPayload = {
  game_id: number;
  game_title: string;
  game_status: string;
  winners: LeaderboardWinner[];
};

export type WsGameCompletedPayload = {
  game_id: number;
  status: string;
};

export type WsAuditEventCreatedPayload = {
  id: number;
  event_type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type WsPrizeNotificationCreatedPayload = {
  id: number;
  game_id: number;
  player_id: number;
  player_name: string;
  winner_id: number;
  rank: number;
  message: string;
  status: string;
  created_at: string;
};

export type GameSocketEvent =
  | { type: "NEW_CALLED_ITEM"; payload: WsNewCalledItemPayload }
  | { type: "CARD_CELL_UPDATED"; payload: WsCardCellUpdatedPayload }
  | { type: "BINGO_CLAIMED"; payload: WsBingoClaimedPayload }
  | { type: "LEADERBOARD_UPDATED"; payload: WsLeaderboardUpdatedPayload }
  | { type: "GAME_COMPLETED"; payload: WsGameCompletedPayload }
  | { type: "AUDIT_EVENT_CREATED"; payload: WsAuditEventCreatedPayload }
  | { type: "PRIZE_NOTIFICATION_CREATED"; payload: WsPrizeNotificationCreatedPayload };

export function parseGameSocketEvent(raw: unknown): GameSocketEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as { type?: unknown; payload?: unknown };
  if (typeof obj.type !== "string" || obj.payload === undefined) {
    return null;
  }
  switch (obj.type) {
    case "NEW_CALLED_ITEM":
    case "CARD_CELL_UPDATED":
    case "BINGO_CLAIMED":
    case "LEADERBOARD_UPDATED":
    case "GAME_COMPLETED":
    case "AUDIT_EVENT_CREATED":
    case "PRIZE_NOTIFICATION_CREATED":
      return obj as GameSocketEvent;
    default:
      return null;
  }
}
