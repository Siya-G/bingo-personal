"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import {
  LIVE_GAME_ID_CHANGED_EVENT,
  readLiveGameId,
} from "@/lib/live-game-session";
import { readHostPinForGame } from "@/lib/host-credentials";

export function useLiveGameSession() {
  const [gameId, setGameId] = useState("");
  const [hostPin, setHostPin] = useState("");

  const syncFromSession = useCallback(() => {
    const id = readLiveGameId();
    const pin = id ? readHostPinForGame(id) ?? "" : "";
    startTransition(() => {
      setGameId(id);
      setHostPin(pin);
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      syncFromSession();
    });
    window.addEventListener(LIVE_GAME_ID_CHANGED_EVENT, syncFromSession);
    return () => {
      window.removeEventListener(LIVE_GAME_ID_CHANGED_EVENT, syncFromSession);
    };
  }, [syncFromSession]);

  return { gameId, hostPin, refresh: syncFromSession };
}
