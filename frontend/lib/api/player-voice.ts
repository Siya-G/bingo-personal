/**
 * Voice profile and TTS speak endpoints called from the player (Game) page.
 * These call the same backend endpoints as the host versions but do NOT send
 * X-Host-Pin — the backend profile and speak endpoints are public read-only.
 */
import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { readApiErrorDetail } from "@/lib/api/error-detail";
import type { HostVoiceSpeakResult } from "@/lib/api/host-voice-speak";
import type { HostVoiceProfilePublic } from "@/types/host-voice";

const API_BASE_URL = getPublicApiBaseUrl();

export async function getPlayerVoiceProfile(
  gameId: string,
): Promise<HostVoiceProfilePublic> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/voice/profile`;
  const response = await fetch(url);
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load the host voice profile.",
    );
    throw new Error(message);
  }
  return response.json() as Promise<HostVoiceProfilePublic>;
}

export async function postPlayerVoiceSpeak(
  gameId: string,
  text: string,
): Promise<HostVoiceSpeakResult> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/voice/speak`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to synthesize narration audio.",
    );
    throw new Error(message);
  }
  return response.json() as Promise<HostVoiceSpeakResult>;
}
