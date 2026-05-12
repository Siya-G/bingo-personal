import type { PlayerGameSession } from "@/types/player";

/**
 * Legacy key was used with `localStorage`, so every browser tab shared one slot
 * and the last player to join overwrote earlier players. Sessions are now kept
 * in `sessionStorage` so each tab has its own player identity.
 */
export const PLAYER_GAME_SESSION_KEY = "ai-bingo-player-session";

function parsePlayerGameSession(raw: string): PlayerGameSession | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const row = parsed as Record<string, unknown>;
    if (
      typeof row.game_id !== "number" ||
      typeof row.player_id !== "number" ||
      typeof row.player_name !== "string" ||
      typeof row.game_title !== "string" ||
      typeof row.session_token !== "string"
    ) {
      return null;
    }
    return {
      game_id: row.game_id,
      player_id: row.player_id,
      player_name: row.player_name,
      game_title: row.game_title,
      session_token: row.session_token,
    };
  } catch {
    return null;
  }
}

export function savePlayerGameSession(session: PlayerGameSession) {
  window.sessionStorage.setItem(
    PLAYER_GAME_SESSION_KEY,
    JSON.stringify(session),
  );
}

export function readPlayerGameSession(): PlayerGameSession | null {
  const tabRaw = window.sessionStorage.getItem(PLAYER_GAME_SESSION_KEY);
  if (tabRaw) {
    const parsed = parsePlayerGameSession(tabRaw);
    if (!parsed) {
      window.sessionStorage.removeItem(PLAYER_GAME_SESSION_KEY);
      return null;
    }
    return parsed;
  }

  const legacyRaw = window.localStorage.getItem(PLAYER_GAME_SESSION_KEY);
  if (!legacyRaw) {
    return null;
  }

  const parsed = parsePlayerGameSession(legacyRaw);
  if (!parsed) {
    window.localStorage.removeItem(PLAYER_GAME_SESSION_KEY);
    return null;
  }

  window.sessionStorage.setItem(PLAYER_GAME_SESSION_KEY, legacyRaw);
  window.localStorage.removeItem(PLAYER_GAME_SESSION_KEY);
  return parsed;
}
