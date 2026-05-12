export type WinningPattern =
  | "HORIZONTAL_ROW"
  | "VERTICAL_COLUMN"
  | "DIAGONAL"
  | "FULL_HOUSE";

export type CreateGamePayload = {
  title: string;
  topic: string;
  number_of_players: number;
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
  winning_pattern: WinningPattern | string;
  number_of_players: number;
  created_at: string;
};
