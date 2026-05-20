export type BingoClaimResponse = {
  success: boolean;
  message: string;
  player_id: number | null;
  player_name: string | null;
  rank: number | null;
  /** Present when ``success`` is true (canonical key, e.g. ``HORIZONTAL_ROW``). */
  matched_pattern?: string | null;
};

export type PlayerBingoWinStatus = {
  won: boolean;
  rank: number | null;
  player_id: number | null;
  player_name: string | null;
};
