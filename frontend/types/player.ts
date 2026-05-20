import type { BingoCardCell } from "@/types/card";

export type JoinGamePayload = {
  name: string;
  game_code: string;
};

export type JoinGameResponse = {
  game_id: number;
  player_id: number;
  player_name: string;
  game_title: string;
  game_status: string;
  /** ``WAITING_FOR_CARDS`` when items/cards do not exist yet. */
  player_status: "READY" | "WAITING_FOR_CARDS";
  /** ``null`` while waiting for the host to generate cards. */
  card_id: number | null;
  grid: BingoCardCell[][];
  /** One-time secret for player-only API routes — store client-side for MVP only. */
  session_token: string;
};

export type PlayerGameSession = {
  game_id: number;
  player_id: number;
  player_name: string;
  game_title: string;
  session_token: string;
};
