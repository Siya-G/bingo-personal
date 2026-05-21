import { getPublicApiBaseUrl } from "@/lib/api/base-url";
import { readApiErrorDetail } from "@/lib/api/error-detail";
import type {
  HostVoiceConsentPayload,
  HostVoiceDeactivateResult,
  HostVoiceProfilePublic,
  HostVoiceSampleResult,
} from "@/types/host-voice";

const API_BASE_URL = getPublicApiBaseUrl();
const HEADER_HOST_PIN = "X-Host-Pin";

function headersWithHostPin(hostPin: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    [HEADER_HOST_PIN]: hostPin.trim(),
  };
}

export async function getHostVoiceProfile(
  gameId: string,
  hostPin: string,
): Promise<HostVoiceProfilePublic> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/voice/profile`;
  const response = await fetch(url, {
    headers: { [HEADER_HOST_PIN]: hostPin.trim() },
  });
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to load the host voice profile.",
    );
    throw new Error(message);
  }
  return response.json() as Promise<HostVoiceProfilePublic>;
}

export async function postHostVoiceConsent(
  gameId: string,
  hostPin: string,
  payload: HostVoiceConsentPayload,
): Promise<void> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/voice/consent`;
  const response = await fetch(url, {
    method: "POST",
    headers: headersWithHostPin(hostPin),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to save host voice consent.",
    );
    throw new Error(message);
  }
}

export async function postHostVoiceSample(
  gameId: string,
  hostPin: string,
  audioBlob: Blob,
): Promise<HostVoiceSampleResult> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/voice/sample`;
  const form = new FormData();
  form.append("audio", audioBlob, "host-voice-sample.webm");

  const response = await fetch(url, {
    method: "POST",
    headers: { [HEADER_HOST_PIN]: hostPin.trim() },
    body: form,
  });
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to upload the voice sample.",
    );
    throw new Error(message);
  }
  return response.json() as Promise<HostVoiceSampleResult>;
}

export async function deleteHostVoiceProfile(
  gameId: string,
  hostPin: string,
): Promise<HostVoiceDeactivateResult> {
  const url = `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/voice/profile`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { [HEADER_HOST_PIN]: hostPin.trim() },
  });
  if (!response.ok) {
    const message = await readApiErrorDetail(
      response,
      "Unable to deactivate the host voice profile.",
    );
    throw new Error(message);
  }
  return response.json() as Promise<HostVoiceDeactivateResult>;
}
