import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { readApiErrorDetail } from "@/lib/api/error-detail";
import type { AuditEvent } from "@/types/audit";
import type {
  BingoClaimResponse,
  PlayerBingoWinStatus,
} from "@/types/bingo";
import type { CreateGamePayload, Game } from "@/types/game";
import type { GameLeaderboard } from "@/types/leaderboard";
import type { PrizeNotification } from "@/types/prize";
import type { CalledItem } from "@/types/gameplay";
import type { BingoCard } from "@/types/card";
import type {
  GameRoomPlayer,
  JoinGamePayload,
  JoinGameResponse,
} from "@/types/player";
import type {
  GameInvitesResult,
  SendGameInvitesPayload,
  SmtpHealth,
} from "@/types/invite";

const API_BASE_URL = getPublicApiBaseUrl();

const HEADER_HOST_PIN = "X-Host-Pin";
const HEADER_PLAYER_SESSION = "X-Player-Session";

function headersWithHostPin(hostPin: string | null | undefined): HeadersInit {
  const trimmed = hostPin?.trim();
  if (!trimmed) {
    return {};
  }
  return { [HEADER_HOST_PIN]: trimmed };
}

function headersWithPlayerSession(
  sessionToken: string | null | undefined,
): HeadersInit {
  const trimmed = sessionToken?.trim();
  if (!trimmed) {
    return {};
  }
  return { [HEADER_PLAYER_SESSION]: trimmed };
}

export async function getSmtpHealth(): Promise<SmtpHealth> {
  const response = await fetch(`${API_BASE_URL}/health/smtp`);
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to read SMTP status.",
    );
    throw new Error(message);
  }
  return response.json() as Promise<SmtpHealth>;
}

export async function createGame(payload: CreateGamePayload): Promise<Game> {
  const url = `${API_BASE_URL}/games`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    const originHint =
      typeof window !== "undefined" ? window.location.origin : "your UI origin";
    throw new Error(
      `POST ${url} — ${cause}. If the API is running, check CORS allows ${originHint} (see backend CORS_ORIGINS / app config).`,
    );
  }

  if (!response.ok) {
    const detail = await readApiErrorDetail(
      response,
      "Unable to create the game. Please check the form and try again.",
    );
    throw new Error(`${url} — HTTP ${response.status}: ${detail}`);
  }

  return response.json() as Promise<Game>;
}

export async function sendGameInvites(
  gameId: string,
  hostPin: string,
  payload: SendGameInvitesPayload,
): Promise<GameInvitesResult> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/invites`;
  const body: Record<string, unknown> = {
    participant_emails: payload.participant_emails,
    teams_join_url: payload.teams_join_url,
  };
  if (payload.scheduled_start_time) {
    body.scheduled_start_time = payload.scheduled_start_time;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headersWithHostPin(hostPin),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    const originHint =
      typeof window !== "undefined" ? window.location.origin : "your UI origin";
    throw new Error(
      `POST ${url} — ${cause}. If the API is running, check CORS allows ${originHint}.`,
    );
  }

  if (!response.ok) {
    const detail = await readApiErrorDetail(
      response,
      "Unable to send or preview invites.",
    );
    throw new Error(`${url} — HTTP ${response.status}: ${detail}`);
  }

  return response.json() as Promise<GameInvitesResult>;
}

export async function joinGame(
  payload: JoinGamePayload,
): Promise<JoinGameResponse> {
  const response = await fetch(`${API_BASE_URL}/games/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to join this game. Please try again.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<JoinGameResponse>;
}

export async function getGame(gameId: string): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}`);

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load this game.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<Game>;
}

export async function listGamePlayers(gameId: string): Promise<GameRoomPlayer[]> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/players`);

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load players in this room.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<GameRoomPlayer[]>;
}

export async function getLeaderboard(gameId: string): Promise<GameLeaderboard> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/leaderboard`);

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load the leaderboard.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<GameLeaderboard>;
}

export async function getAuditEvents(
  gameId: string,
  hostPin: string | null | undefined,
): Promise<AuditEvent[]> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/audit-events`, {
    headers: {
      ...headersWithHostPin(hostPin),
    },
  });

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load the audit trail.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<AuditEvent[]>;
}

export async function getPrizeNotifications(
  gameId: string,
): Promise<PrizeNotification[]> {
  const response = await fetch(
    `${API_BASE_URL}/games/${gameId}/prize-notifications`,
  );

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load prize notifications.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<PrizeNotification[]>;
}

export async function markPrizeNotificationDisplayed(
  gameId: string,
  notificationId: number,
  hostPin: string | null | undefined,
): Promise<PrizeNotification> {
  const response = await fetch(
    `${API_BASE_URL}/games/${gameId}/prize-notifications/${notificationId}/displayed`,
    {
      method: "PATCH",
      headers: {
        ...headersWithHostPin(hostPin),
      },
    },
  );

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to update prize notification status.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<PrizeNotification>;
}

export async function startGame(
  gameId: string,
  hostPin: string | null | undefined,
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/start`, {
    method: "POST",
    headers: {
      ...headersWithHostPin(hostPin),
    },
  });

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to start the game.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<Game>;
}

export async function callNextItem(
  gameId: string,
  hostPin: string | null | undefined,
): Promise<CalledItem> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/call-next`, {
    method: "POST",
    headers: {
      ...headersWithHostPin(hostPin),
    },
  });

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to call the next item.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<CalledItem>;
}

export type GeneratedBingoItem = {
  id: number;
  game_id: number;
  word: string;
  description: string | null;
  is_called: boolean;
  called_order: number | null;
  created_at: string;
};

export type GenerateGameItemsResult = {
  items: GeneratedBingoItem[];
  target_count: number;
  actual_count: number;
  minimum_count: number;
  warning: string | null;
  cached: boolean;
};

export async function generateGameItems(
  gameId: string,
  hostPin: string | null | undefined,
): Promise<GenerateGameItemsResult> {
  const response = await fetch(
    `${API_BASE_URL}/games/${gameId}/generate-items`,
    {
      method: "POST",
      headers: {
        ...headersWithHostPin(hostPin),
      },
    },
  );

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to generate Bingo items.",
    );
    throw new Error(message);
  }

  const raw: unknown = await response.json();
  if (Array.isArray(raw)) {
    const items = raw as GeneratedBingoItem[];
    return {
      items,
      target_count: items.length,
      actual_count: items.length,
      minimum_count: 25,
      warning: null,
      cached: false,
    };
  }

  const body = raw as {
    items?: GeneratedBingoItem[];
    target_count?: number;
    actual_count?: number;
    minimum_count?: number;
    warning?: string | null;
    cached?: boolean;
  };
  const items = body.items ?? [];
  return {
    items,
    target_count: body.target_count ?? items.length,
    actual_count: body.actual_count ?? items.length,
    minimum_count: body.minimum_count ?? 25,
    warning: body.warning ?? null,
    cached: body.cached ?? false,
  };
}

export async function generateGameCards(
  gameId: string,
  hostPin: string | null | undefined,
): Promise<BingoCard[]> {
  const response = await fetch(
    `${API_BASE_URL}/games/${gameId}/generate-cards`,
    {
      method: "POST",
      headers: {
        ...headersWithHostPin(hostPin),
      },
    },
  );

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to generate Bingo cards.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<BingoCard[]>;
}

export async function getCalledItems(gameId: string): Promise<CalledItem[]> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/called-items`);

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load called items.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<CalledItem[]>;
}

export async function claimBingo(
  gameId: string,
  playerId: string,
  sessionToken: string | null | undefined,
): Promise<BingoClaimResponse> {
  const response = await fetch(
    `${API_BASE_URL}/games/${gameId}/players/${playerId}/claim-bingo`,
    {
      method: "POST",
      headers: {
        ...headersWithPlayerSession(sessionToken),
      },
    },
  );

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to validate this Bingo claim.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<BingoClaimResponse>;
}

export async function getBingoWinStatus(
  gameId: string,
  playerId: string,
  sessionToken: string | null | undefined,
): Promise<PlayerBingoWinStatus> {
  const response = await fetch(
    `${API_BASE_URL}/games/${gameId}/players/${playerId}/bingo-win-status`,
    {
      headers: {
        ...headersWithPlayerSession(sessionToken),
      },
    },
  );

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load Bingo win status.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<PlayerBingoWinStatus>;
}
