/** Sync live game ID between Live Gameplay and Host Voice Settings on /host. */

export const LIVE_GAME_ID_STORAGE_KEY = "bingo-host-live-game-id";
export const LIVE_GAME_ID_CHANGED_EVENT = "bingo-host-live-game-id-changed";
export const HOST_VOICE_PROFILE_CHANGED_EVENT =
  "bingo-host-voice-profile-changed";

export function notifyHostVoiceProfileChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(HOST_VOICE_PROFILE_CHANGED_EVENT));
}

export function readLiveGameId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return sessionStorage.getItem(LIVE_GAME_ID_STORAGE_KEY)?.trim() ?? "";
}

export function saveLiveGameId(gameId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = gameId.trim();
  if (trimmed) {
    sessionStorage.setItem(LIVE_GAME_ID_STORAGE_KEY, trimmed);
  } else {
    sessionStorage.removeItem(LIVE_GAME_ID_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(LIVE_GAME_ID_CHANGED_EVENT));
}
