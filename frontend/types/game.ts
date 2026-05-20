import type { WinningPattern } from "@/lib/winning-patterns";

export type { WinningPattern } from "@/lib/winning-patterns";

export type CreateGamePayload = {
  title: string;
  topic: string;
  number_of_players: number;
  /** Preferred: one or more patterns (player wins if any match). */
  winning_patterns: WinningPattern[];
  /** Legacy compatibility: first pattern; also sent as first entry of ``winning_patterns``. */
  winning_pattern: WinningPattern;
  /** MVP host secret — validated only on the server; never log or echo back. */
  host_pin: string;
};

export type Game = {
  id: number;
  title: string;
  topic: string | null;
  game_code: string;
  status: string;
  /** Primary / first pattern (backward compatible field). */
  winning_pattern: WinningPattern | string;
  winning_patterns: string[];
  number_of_players: number;
  created_at: string;
};
