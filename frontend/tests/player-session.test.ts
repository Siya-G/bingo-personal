import { beforeEach, describe, expect, it } from "vitest";
import {
  PLAYER_GAME_SESSION_KEY,
  readPlayerGameSession,
  savePlayerGameSession,
} from "@/lib/player-session";

const sampleSession = {
  game_id: 9,
  player_id: 101,
  player_name: "Player One",
  game_title: "Test Room",
  session_token: "token-player-one",
};

describe("player-session", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("persists join payload in sessionStorage (per browser tab)", () => {
    savePlayerGameSession(sampleSession);
    expect(window.sessionStorage.getItem(PLAYER_GAME_SESSION_KEY)).toContain(
      "token-player-one",
    );
    expect(window.localStorage.getItem(PLAYER_GAME_SESSION_KEY)).toBeNull();
    expect(readPlayerGameSession()).toEqual(sampleSession);
  });

  it("migrates a legacy localStorage session into sessionStorage once", () => {
    window.localStorage.setItem(
      PLAYER_GAME_SESSION_KEY,
      JSON.stringify(sampleSession),
    );
    expect(readPlayerGameSession()).toEqual(sampleSession);
    expect(window.localStorage.getItem(PLAYER_GAME_SESSION_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PLAYER_GAME_SESSION_KEY)).toContain(
      "token-player-one",
    );
  });
});
