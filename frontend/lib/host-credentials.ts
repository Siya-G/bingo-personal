/**
 * MVP host PIN storage in sessionStorage (per browser tab).
 *
 * Production: use httpOnly cookies, a vault, or an IdP — never rely on
 * client-side storage for privileged host actions.
 */

const STORAGE_KEY = "ai-bingo-host-pin-by-game-v1";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function saveHostPinForGame(gameId: string, hostPin: string) {
  const id = gameId.trim();
  if (!id) {
    return;
  }
  const map = readMap();
  map[id] = hostPin.trim();
  writeMap(map);
}

export function readHostPinForGame(gameId: string): string | null {
  const id = gameId.trim();
  if (!id) {
    return null;
  }
  const pin = readMap()[id];
  return pin && pin.length > 0 ? pin : null;
}

export function clearHostPinForGame(gameId: string) {
  const id = gameId.trim();
  if (!id) {
    return;
  }
  const map = readMap();
  delete map[id];
  writeMap(map);
}
