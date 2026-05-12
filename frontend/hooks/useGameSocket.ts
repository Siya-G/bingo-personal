"use client";

import { useEffect, useState, startTransition } from "react";
import { buildGameWebSocketUrl } from "@/lib/ws-game";
import { parseGameSocketEvent, type GameSocketEvent } from "@/types/ws-game";

/**
 * Live updates for one game room.
 *
 * Flow: the browser opens a WebSocket to `/ws/games/{gameId}`. Whenever the
 * host calls an item, a cell is toggled, or Bingo is claimed, the API pushes a
 * JSON message here so the UI can react without polling.
 */
export type GameSocketConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export function useGameSocket(gameId: string | null | undefined) {
  const trimmed = gameId?.trim() ?? "";

  const [status, setStatus] = useState<GameSocketConnectionStatus>("idle");
  const [lastEvent, setLastEvent] = useState<GameSocketEvent | null>(null);

  useEffect(() => {
    if (!trimmed) {
      startTransition(() => {
        setStatus("idle");
      });
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function clearReconnect() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function connect() {
      if (cancelled) {
        return;
      }

      clearReconnect();
      startTransition(() => {
        setStatus("connecting");
      });

      socket = new WebSocket(buildGameWebSocketUrl(trimmed));

      socket.onopen = () => {
        if (!cancelled) {
          startTransition(() => {
            setStatus("open");
          });
        }
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as unknown;
          const message = parseGameSocketEvent(parsed);
          if (message) {
            startTransition(() => {
              setLastEvent(message);
            });
          }
        } catch {
          // Ignore non-JSON frames.
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          startTransition(() => {
            setStatus("error");
          });
        }
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setStatus("closed");
        });
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      socket?.close();
    };
  }, [trimmed]);

  return { status, lastEvent, gameId: trimmed };
}
