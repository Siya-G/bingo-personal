export type LeaderboardWinner = {
  rank: number;
  player_id: number;
  player_name: string;
  created_at: string;
};

export type GameLeaderboard = {
  game_id: number;
  game_title: string;
  game_status: string;
  winners: LeaderboardWinner[];
};
