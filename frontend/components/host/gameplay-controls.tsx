"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
  startTransition,
} from "react";
import { BingoAgentPanel } from "@/components/game/bingo-agent-panel";
import {
  HostBingoWinBanner,
  type HostBingoWinNotice,
} from "@/components/host/host-bingo-win-banner";
import { HostAuditTrail } from "@/components/host/host-audit-trail";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import {
  callNextItem,
  generateGameCards,
  generateGameItems,
  getAuditEvents,
  getCalledItems,
  getLeaderboard,
  listGamePlayers,
  getPrizeNotifications,
  markPrizeNotificationDisplayed,
  startGame,
  type GeneratedBingoItem,
  type GenerateGameItemsResult,
} from "@/lib/api/games";
import { readHostPinForGame, saveHostPinForGame } from "@/lib/host-credentials";
import { saveLiveGameId } from "@/lib/live-game-session";
import { getAiCallerLabel } from "@/lib/narrate-called-item";
import { mergeCalledItems } from "@/lib/merge-called-items";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useHostVoiceProfile } from "@/hooks/useHostVoiceProfile";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { speakCalledItem } from "@/lib/speak-item";
import { prewarmSpeechSynthesisForUserGesture } from "@/lib/speak-bingo-item";
import type { AuditEvent } from "@/types/audit";
import type { Game } from "@/types/game";
import type { CalledItem } from "@/types/gameplay";
import type { GameLeaderboard } from "@/types/leaderboard";
import type { PrizeNotification } from "@/types/prize";

const WAITING_FOR_PLAYERS_MESSAGE =
  "Waiting for players to join before calling items.";

function formatSocketStatus(status: string) {
  switch (status) {
    case "connecting":
      return "WebSocket: connecting…";
    case "open":
      return "WebSocket: connected (live)";
    case "closed":
      return "WebSocket: reconnecting…";
    case "error":
      return "WebSocket: error — retrying…";
    default:
      return null;
  }
}

export function GameplayControls() {
  const speech = useSpeechSynthesis();
  const [gameId, setGameId] = useState("");
  const [hostPin, setHostPin] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [calledItems, setCalledItems] = useState<CalledItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<GameLeaderboard | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [playersInRoom, setPlayersInRoom] = useState<number>(0);
  const [hostBingoWinNotice, setHostBingoWinNotice] =
    useState<HostBingoWinNotice | null>(null);
  const [prizeNotifications, setPrizeNotifications] = useState<PrizeNotification[]>(
    [],
  );
  const [prizeLoading, setPrizeLoading] = useState(false);
  const [prizeError, setPrizeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingItems, setIsGeneratingItems] = useState(false);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [generatedItemRows, setGeneratedItemRows] = useState<GeneratedBingoItem[]>(
    [],
  );
  const [itemPoolMeta, setItemPoolMeta] = useState<
    Pick<GenerateGameItemsResult, "target_count" | "actual_count" | "minimum_count" | "warning" | "cached">
    | null
  >(null);

  const { status: wsStatus, lastEvent } = useGameSocket(gameId);
  const {
    profile: hostVoiceProfile,
    refreshProfile: refreshHostVoiceProfile,
    isLoadingVoiceProfile,
    voiceWarning,
    selectedVoiceMode,
  } = useHostVoiceProfile(gameId, hostPin);
  const [narrationWarning, setNarrationWarning] = useState<string | null>(null);

  const visibleGeneratedRows = generatedItemRows.filter(
    (row) => String(row.game_id) === gameId.trim(),
  );

  useEffect(() => {
    const trimmed = gameId.trim();
    saveLiveGameId(trimmed);
    startTransition(() => {
      setHostPin(trimmed ? readHostPinForGame(trimmed) ?? "" : "");
    });
  }, [gameId]);

  useEffect(() => {
    startTransition(() => {
      setItemPoolMeta(null);
    });
  }, [gameId]);

  const refreshLeaderboard = useCallback(async (nextGameId: string) => {
    const trimmed = nextGameId.trim();
    if (!trimmed) {
      setLeaderboard(null);
      setLeaderboardError(null);
      return;
    }

    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const data = await getLeaderboard(trimmed);
      setLeaderboard(data);
    } catch (caughtError) {
      setLeaderboard(null);
      setLeaderboardError(
        readCaughtError(caughtError, "Unable to load leaderboard."),
      );
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const refreshPlayersInRoom = useCallback(async (nextGameId: string) => {
    const trimmed = nextGameId.trim();
    if (!trimmed) {
      setPlayersInRoom(0);
      return;
    }

    try {
      const rows = await listGamePlayers(trimmed);
      setPlayersInRoom(rows.length);
    } catch {
      setPlayersInRoom(0);
    }
  }, []);

  const refreshAudit = useCallback(
    async (nextGameId: string, pin: string | null | undefined) => {
      const trimmed = nextGameId.trim();
      if (!trimmed) {
        setAuditEvents([]);
        setAuditError(null);
        return;
      }

      setAuditLoading(true);
      setAuditError(null);
      try {
        const rows = await getAuditEvents(trimmed, pin);
        setAuditEvents(rows);
      } catch (caughtError) {
        setAuditEvents([]);
        setAuditError(
          readCaughtError(caughtError, "Unable to load audit trail."),
        );
      } finally {
        setAuditLoading(false);
      }
    },
    [],
  );

  const refreshPrizes = useCallback(async (nextGameId: string) => {
    const trimmed = nextGameId.trim();
    if (!trimmed) {
      setPrizeNotifications([]);
      setPrizeError(null);
      return;
    }

    setPrizeLoading(true);
    setPrizeError(null);
    try {
      const rows = await getPrizeNotifications(trimmed);
      setPrizeNotifications(rows);
    } catch (caughtError) {
      setPrizeNotifications([]);
      setPrizeError(
        readCaughtError(caughtError, "Unable to load prize notifications."),
      );
    } finally {
      setPrizeLoading(false);
    }
  }, []);

  // First paint for a new game ID: hydrate from REST once (no polling).
  useEffect(() => {
    if (!gameId.trim()) {
      startTransition(() => {
        setLeaderboard(null);
        setLeaderboardError(null);
        setAuditEvents([]);
        setAuditError(null);
        setPrizeNotifications([]);
        setPrizeError(null);
        setPlayersInRoom(0);
      });
      return;
    }

    const pin = hostPin.trim() || null;
    const kickoff = setTimeout(() => {
      void refreshLeaderboard(gameId);
      void refreshPlayersInRoom(gameId);
      void refreshAudit(gameId, pin);
      void refreshPrizes(gameId);
    }, 0);
    return () => clearTimeout(kickoff);
  }, [
    gameId,
    hostPin,
    refreshLeaderboard,
    refreshPlayersInRoom,
    refreshAudit,
    refreshPrizes,
  ]);

  // WebSocket pushes: new calls, podium changes, game finished.
  useEffect(() => {
    if (!lastEvent) {
      return;
    }

    queueMicrotask(() => {
      switch (lastEvent.type) {
        case "NEW_CALLED_ITEM": {
          const item = lastEvent.payload;
          setCalledItems((prev) => mergeCalledItems(prev, item));
          break;
        }
        case "BINGO_CLAIMED": {
          const claim = lastEvent.payload;
          if (claim.success && claim.rank != null) {
            setHostBingoWinNotice({
              playerName: claim.player_name ?? "Player",
              rank: claim.rank,
            });
          }
          break;
        }
        case "LEADERBOARD_UPDATED": {
          const payload = lastEvent.payload;
          setLeaderboard({
            game_id: payload.game_id,
            game_title: payload.game_title,
            game_status: payload.game_status,
            winners: payload.winners,
          });
          setLeaderboardError(null);
          break;
        }
        case "GAME_COMPLETED": {
          setGame((current) =>
            current ? { ...current, status: "COMPLETED" } : current,
          );
          setLeaderboard((current) =>
            current ? { ...current, game_status: "COMPLETED" } : current,
          );
          break;
        }
        case "AUDIT_EVENT_CREATED": {
          const payload = lastEvent.payload;
          setAuditEvents((prev) => {
            if (prev.some((row) => row.id === payload.id)) {
              return prev;
            }
            const row: AuditEvent = {
              id: payload.id,
              event_type: payload.event_type,
              message: payload.message,
              metadata: payload.metadata,
              created_at: payload.created_at,
            };
            return [row, ...prev];
          });
          setAuditError(null);
          if (payload.event_type === "PLAYER_JOINED") {
            void refreshPlayersInRoom(gameId);
          }
          break;
        }
        case "CHAT_MESSAGE": {
          if (lastEvent.payload.message.includes("joined the room")) {
            void refreshPlayersInRoom(gameId);
          }
          break;
        }
        case "PRIZE_NOTIFICATION_CREATED": {
          const payload = lastEvent.payload;
          setPrizeNotifications((prev) => {
            if (prev.some((row) => row.id === payload.id)) {
              return prev;
            }
            const row: PrizeNotification = {
              id: payload.id,
              game_id: payload.game_id,
              player_id: payload.player_id,
              player_name: payload.player_name,
              winner_id: payload.winner_id,
              rank: payload.rank,
              message: payload.message,
              status: payload.status,
              created_at: payload.created_at,
            };
            return [row, ...prev];
          });
          setPrizeError(null);
          break;
        }
        default:
          break;
      }
    });
  }, [gameId, lastEvent, refreshPlayersInRoom]);

  async function refreshCalledItems(nextGameId = gameId) {
    if (!nextGameId.trim()) {
      setError("Enter a game ID before refreshing called items.");
      return;
    }

    setError(null);
    setIsRefreshing(true);
    try {
      const items = await getCalledItems(nextGameId);
      setCalledItems(items);
      await refreshLeaderboard(nextGameId);
      await refreshPlayersInRoom(nextGameId);
      await refreshAudit(nextGameId, hostPin.trim() || null);
      await refreshPrizes(nextGameId);
    } catch (caughtError) {
      setError(readCaughtError(caughtError, "Unable to load called items."));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleStartGame() {
    if (!gameId.trim()) {
      setError("Enter a game ID before starting.");
      return;
    }

    setError(null);
    setIsStarting(true);
    try {
      const startedGame = await startGame(gameId, hostPin.trim() || null);
      setGame(startedGame);
      await refreshCalledItems(gameId);
    } catch (caughtError) {
      setError(readCaughtError(caughtError, "Unable to start game."));
    } finally {
      setIsStarting(false);
    }
  }

  async function handleCallNext() {
    // Pre-warm speech synthesis for Chrome gesture requirement
    prewarmSpeechSynthesisForUserGesture();

    if (!gameId.trim()) {
      setError("Enter a game ID before calling the next item.");
      return;
    }

    setError(null);
    setIsCalling(true);
    try {
      const item = await callNextItem(gameId, hostPin.trim() || null);
      console.log("Call next item success");
      setCalledItems((currentItems) => mergeCalledItems(currentItems, item));
      setNarrationWarning(null);
      void speakCalledItem(item, gameId.trim(), hostPin.trim());
      void refreshHostVoiceProfile();
    } catch (caughtError) {
      setError(readCaughtError(caughtError, "Unable to call next item."));
    } finally {
      setIsCalling(false);
    }
  }

  async function handleGenerateItems() {
    const gid = gameId.trim();
    if (!gid) {
      setError("Enter a game ID before generating items.");
      return;
    }
    setError(null);
    setItemPoolMeta(null);
    setIsGeneratingItems(true);
    try {
      const result = await generateGameItems(gid, hostPin.trim() || null);
      setGeneratedItemRows((prev) => [
        ...prev.filter((r) => String(r.game_id) !== gid),
        ...result.items,
      ]);
      setItemPoolMeta({
        target_count: result.target_count,
        actual_count: result.actual_count,
        minimum_count: result.minimum_count,
        warning: result.warning,
        cached: result.cached,
      });
      await refreshCalledItems(gid);
    } catch (caughtError) {
      setGeneratedItemRows([]);
      setItemPoolMeta(null);
      const detail = readCaughtError(caughtError, "").trim();
      setError(
        `AI item generation failed. Check your server configuration and try again.${
          detail ? ` ${detail}` : ""
        }`,
      );
    } finally {
      setIsGeneratingItems(false);
    }
  }

  async function handleGenerateCards() {
    const gid = gameId.trim();
    if (!gid) {
      setError("Enter a game ID before generating cards.");
      return;
    }
    setError(null);
    setIsGeneratingCards(true);
    try {
      await generateGameCards(gid, hostPin.trim() || null);
      await refreshCalledItems(gid);
    } catch (caughtError) {
      setError(readCaughtError(caughtError, "Unable to generate cards."));
    } finally {
      setIsGeneratingCards(false);
    }
  }

  function handleRefresh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refreshCalledItems();
  }

  function persistHostPin() {
    const gid = gameId.trim();
    if (gid && hostPin.trim()) {
      saveHostPinForGame(gid, hostPin.trim());
    }
  }

  async function handleMarkPrizeDisplayed(notificationId: number) {
    const gid = gameId.trim();
    if (!gid) {
      return;
    }
    try {
      const updated = await markPrizeNotificationDisplayed(
        gid,
        notificationId,
        hostPin.trim() || null,
      );
      setPrizeNotifications((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)),
      );
      setPrizeError(null);
    } catch (caughtError) {
      setPrizeError(
        readCaughtError(caughtError, "Unable to update prize status."),
      );
    }
  }

  const liveStatus = leaderboard?.game_status ?? game?.status ?? null;
  const isActive = liveStatus === "ACTIVE";
  const isCompleted = liveStatus === "COMPLETED";
  const socketLine = gameId.trim() ? formatSocketStatus(wsStatus) : null;
  const joinedPlayerCount = playersInRoom;
  const waitingForPlayers = Boolean(gameId.trim()) && joinedPlayerCount === 0;
  const totalItemCount =
    visibleGeneratedRows.length > 0
      ? visibleGeneratedRows.length
      : itemPoolMeta?.actual_count;
  const callNextDisabled =
    !isActive || !gameId.trim() || isCompleted || waitingForPlayers;
  const callNextLabel = isCompleted ? "Game completed" : "Call Next Item";

  return (
    <>
      {hostBingoWinNotice ? (
        <HostBingoWinBanner
          notice={hostBingoWinNotice}
          onDismiss={() => setHostBingoWinNotice(null)}
        />
      ) : null}
      <div className="rounded-3xl bg-slate-950/50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Live Gameplay</h2>
          <p className="mt-2 text-sm text-slate-300">
            Start a game and call items from the generated Bingo list. Live
            updates use a WebSocket after the first load — use Refresh if you
            need to resync from the server.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {/* MVP: PIN + headers are not a substitute for production SSO / RBAC. */}
            Host actions require the PIN you set at game creation. It is stored
            in this browser tab only (sessionStorage).
          </p>
        </div>
        <span className="rounded-full bg-fuchsia-400/15 px-4 py-2 text-sm font-bold text-fuchsia-100">
          {liveStatus ?? "Waiting for game ID"}
        </span>
      </div>

      {socketLine ? (
        <p className="mt-3 text-xs font-semibold text-cyan-200/90">{socketLine}</p>
      ) : null}

      {/* Two-column gameplay layout: setup/leaderboard on the left, sticky agent on the right. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={handleRefresh}>
            <input
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
              inputMode="numeric"
              onChange={(event) => setGameId(event.target.value)}
              placeholder="Game ID"
              type="text"
              value={gameId}
            />
            <button
              className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isRefreshing}
              type="submit"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Calls"}
            </button>
          </form>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200">
              Host PIN
            </span>
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
              onBlur={persistHostPin}
              onChange={(event) => setHostPin(event.target.value)}
              placeholder="PIN from create-game step"
              type="password"
              value={hostPin}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isGeneratingItems || !gameId.trim()}
              onClick={() => void handleGenerateItems()}
              type="button"
            >
              {isGeneratingItems ? "Generating items with AI..." : "Generate items"}
            </button>
            <button
              className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isGeneratingCards || !gameId.trim()}
              onClick={() => void handleGenerateCards()}
              type="button"
            >
              {isGeneratingCards ? "Creating cards..." : "Generate cards"}
            </button>
          </div>

          <LoadingState
            active={isGeneratingItems}
            label="Generating items with AI..."
          />
          <LoadingState
            active={isGeneratingCards}
            label="Creating cards…"
          />

          {itemPoolMeta ? (
            <div className="rounded-2xl border border-slate-600/35 bg-slate-900/45 p-4 text-sm text-slate-300">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Item pool
              </p>
              <p className="mt-2 text-slate-200">
                Target:{" "}
                <strong className="text-white">{itemPoolMeta.target_count}</strong>
                <span className="text-slate-500"> · </span>
                Generated:{" "}
                <strong className="text-emerald-200">{itemPoolMeta.actual_count}</strong>
                <span className="text-slate-500"> · </span>
                Minimum:{" "}
                <strong className="text-slate-100">{itemPoolMeta.minimum_count}</strong>
              </p>
              {itemPoolMeta.warning ? (
                <p
                  className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-amber-50"
                  role="status"
                >
                  {itemPoolMeta.warning}
                </p>
              ) : null}
            </div>
          ) : null}

          {visibleGeneratedRows.length > 0 ? (
            <details className="rounded-2xl border border-emerald-400/25 bg-slate-900/55">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
                <span>Generated word pool ({visibleGeneratedRows.length})</span>
                <span className="text-emerald-200/60">›</span>
              </summary>
              <div className="border-t border-emerald-400/15 px-4 py-3">
                <p className="text-xs text-slate-400">
                  Shared pool for this game. Each player&apos;s 5×5 card uses{" "}
                  <strong className="text-slate-200">25</strong> random picks from this
                  list (calls still draw from the full pool).
                </p>
                <ul className="mt-3 max-h-72 space-y-2.5 overflow-auto pr-1 text-sm text-slate-200">
                  {visibleGeneratedRows.map((row) => (
                    <li
                      key={row.id}
                      className="border-b border-white/5 pb-2.5 last:border-0 last:pb-0"
                    >
                      <span className="font-bold text-white">{row.word}</span>
                      <span className="text-slate-500"> — </span>
                      <span className="text-slate-300">{row.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}

          <div>
            {gameId.trim() ? (
              <p className="mb-2 text-xs font-semibold text-slate-400">
                {joinedPlayerCount} player{joinedPlayerCount === 1 ? "" : "s"} in
                the room
              </p>
            ) : null}
            <button
              className="w-full rounded-full bg-yellow-300 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isStarting || isCompleted || waitingForPlayers}
              onClick={() => void handleStartGame()}
              type="button"
            >
              {isStarting ? "Starting game…" : "Start Game"}
            </button>
            {waitingForPlayers ? (
              <p className="mt-2 text-xs text-slate-400">
                {WAITING_FOR_PLAYERS_MESSAGE}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Use <strong className="text-slate-300">Call Next Item</strong> in the
                Bingo Agent panel to draw words while the round is active.
              </p>
            )}
          </div>

          {isCompleted ? (
            <div className="rounded-2xl border border-fuchsia-400/35 bg-fuchsia-500/10 p-4 text-center text-sm font-bold text-fuchsia-100">
              This game is completed — calling more items is disabled.
            </div>
          ) : null}

          <ErrorMessage message={error} title="Something went wrong" />

          {voiceWarning ? (
            <p
              className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-50"
              role="status"
            >
              {voiceWarning}
            </p>
          ) : null}

          {isLoadingVoiceProfile ? (
            <p className="text-xs text-slate-500" role="status">
              Loading host voice profile…
            </p>
          ) : null}

          {narrationWarning ? (
            <p
              className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-50"
              role="status"
            >
              {narrationWarning}
            </p>
          ) : null}

          <div className="border-t border-white/10 pt-6">
            <HostAuditTrail
              error={auditError}
              events={auditEvents}
              loading={auditLoading}
            />
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          {selectedVoiceMode !== "default-no-profile" ||
          getAiCallerLabel(hostVoiceProfile) ? (
            <p className="mb-3 text-xs text-slate-500" data-testid="voice-mode-hint">
              {selectedVoiceMode !== "default-no-profile" ? (
                <span>
                  Voice mode: {selectedVoiceMode.replace(/-/g, " ")}
                </span>
              ) : null}
              {getAiCallerLabel(hostVoiceProfile) ? (
                <span
                  className={
                    selectedVoiceMode !== "default-no-profile"
                      ? "mt-1 block font-semibold text-cyan-200/90"
                      : "block font-semibold text-cyan-200/90"
                  }
                >
                  {getAiCallerLabel(hostVoiceProfile)}
                </span>
              ) : null}
            </p>
          ) : null}
          {isActive || calledItems.length > 0 ? (
            <BingoAgentPanel
              items={calledItems}
              compact
              totalItemCount={totalItemCount}
              hostVoiceProfile={hostVoiceProfile}
              gameId={gameId.trim()}
              hostPin={hostPin.trim()}
              onCallNext={() => void handleCallNext()}
              isCallingNext={isCalling}
              callNextDisabled={callNextDisabled}
              callNextLabel={callNextLabel}
              bottomNote={
                waitingForPlayers
                  ? WAITING_FOR_PLAYERS_MESSAGE
                  : !gameId.trim()
                    ? "Enter a game ID to enable Call Next."
                    : !isActive && !isCompleted
                      ? "Press Start Game to begin calling items."
                      : null
              }
            />
          ) : (
            <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 text-sm text-slate-300">
              <h2 className="text-xl font-black text-white">Bingo Agent</h2>
              <p className="mt-2">
                Start the game to open the Bingo Agent panel with narration and the
                Call Next button.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
    </>
  );
}

function readCaughtError(caughtError: unknown, fallback: string) {
  return caughtError instanceof Error ? caughtError.message : fallback;
}
