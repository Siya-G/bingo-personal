import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { readApiErrorDetail } from "@/lib/api/error-detail";
import type { BingoCard, BingoCardCell } from "@/types/card";

const API_BASE_URL = getPublicApiBaseUrl();

const HEADER_PLAYER_SESSION = "X-Player-Session";

function headersWithPlayerSession(
  sessionToken: string | null | undefined,
): HeadersInit {
  const trimmed = sessionToken?.trim();
  if (!trimmed) {
    return {};
  }
  return { [HEADER_PLAYER_SESSION]: trimmed };
}

export async function getPlayerCard(
  gameId: string,
  playerId: string,
  sessionToken: string | null | undefined,
): Promise<BingoCard> {
  const response = await fetch(
    `${API_BASE_URL}/games/${gameId}/players/${playerId}/card`,
    {
      headers: {
        ...headersWithPlayerSession(sessionToken),
      },
    },
  );

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load this Bingo card.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<BingoCard>;
}

export async function toggleCardCell(
  gameId: string,
  playerId: string,
  cellId: number,
  sessionToken: string | null | undefined,
): Promise<BingoCardCell> {
  const response = await fetch(
    `${API_BASE_URL}/games/${gameId}/players/${playerId}/card/cells/${cellId}/toggle`,
    {
      method: "PATCH",
      headers: {
        ...headersWithPlayerSession(sessionToken),
      },
    },
  );

  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to update this cell.",
    );
    throw new Error(message);
  }

  return response.json() as Promise<BingoCardCell>;
}
