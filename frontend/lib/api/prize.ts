import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { readApiErrorDetail } from "@/lib/api/error-detail";

const API_BASE_URL = getPublicApiBaseUrl();

export type PrizeSendPayload = {
  player_name: string;
  player_email: string;
  placement: number;
};

export type PrizeSendResult = {
  success: boolean;
  error: string | null;
};

export async function sendPrizeEmail(
  gameId: string,
  payload: PrizeSendPayload,
): Promise<PrizeSendResult> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/prize/send`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to send prize email.",
    );
    throw new Error(message);
  }
  return response.json() as Promise<PrizeSendResult>;
}
