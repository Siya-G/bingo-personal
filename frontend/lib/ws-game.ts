import { getPublicApiBaseUrl } from "@/lib/api/base-url";

export function getApiBaseUrl(): string {
  return getPublicApiBaseUrl();
}

/** Browser WebSocket URL for the game room (http→ws, https→wss). */
export function buildGameWebSocketUrl(gameId: string): string {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws/games/${encodeURIComponent(gameId)}`;
}
