export type BingoCardCell = {
  cell_id: number;
  item_id: number;
  word: string;
  description: string | null;
  row: number;
  column: number;
  is_marked: boolean;
  is_item_called: boolean;
};

/**
 * One player's Bingo card.
 *
 * ``card_id`` is ``null`` and ``grid`` is empty while the player has joined
 * the room but the host has not yet generated cards. The UI uses this to show
 * a waiting room instead of a "Could not load card" error.
 */
export type BingoCard = {
  card_id: number | null;
  player_id: number;
  grid: BingoCardCell[][];
};
