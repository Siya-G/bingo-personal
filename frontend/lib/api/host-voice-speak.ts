import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { readApiErrorDetail } from "@/lib/api/error-detail";

const API_BASE_URL = getPublicApiBaseUrl();
const HEADER_HOST_PIN = "X-Host-Pin";

export type HostVoiceSpeakResult = {
  audio_url: string | null;
  demo_mode: boolean;
};

export async function postHostVoiceSpeak(
  gameId: string,
  hostPin: string,
  text: string,
): Promise<HostVoiceSpeakResult> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/voice/speak`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [HEADER_HOST_PIN]: hostPin.trim(),
    },
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

export function resolveVoiceAudioUrl(audioUrl: string): string {
  if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) {
    return audioUrl;
  }
  return `${API_BASE_URL}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;
}
