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

export type BingoCard = {
  card_id: number;
  player_id: number;
  grid: BingoCardCell[][];
};
