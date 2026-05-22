import { getHostVoiceProfile } from "@/lib/api/host-voice";
import {
  postHostVoiceSpeak,
  resolveVoiceAudioUrl,
} from "@/lib/api/host-voice-speak";
import {
  buildNarrationText,
  speakBingoItem,
  speakNarrationText,
} from "@/lib/speak-bingo-item";
import type { CalledItem } from "@/types/gameplay";
import type { HostVoiceProfilePublic } from "@/types/host-voice";

async function playHostClonedVoiceAudio(
  gameId: string,
  hostPin: string,
  text: string,
  audioElement?: HTMLAudioElement | null,
  cachedProfile?: HostVoiceProfilePublic | null,
): Promise<boolean> {
  // Use the already-loaded profile from component state when available.
  // Re-fetching it here adds a round-trip and pushes audio.play() further
  // from the user gesture, which Chrome blocks on HTTPS pages.
  const profile =
    cachedProfile ?? (await getHostVoiceProfile(gameId, hostPin));

  if (
    profile.voice_mode !== "HOST_VOICE" ||
    !profile.active ||
    profile.demo_mode
  ) {
    return false;
  }

  const data = await postHostVoiceSpeak(gameId, hostPin, text);
  if (!data.audio_url) {
    return false;
  }

  const resolvedUrl = resolveVoiceAudioUrl(data.audio_url);

  // A DOM-resident <audio> element can be .play()'d after async gaps without
  // triggering Chrome's autoplay block. new Audio() created after awaits is
  // blocked on HTTPS pages in production once the user gesture is gone.
  if (audioElement) {
    audioElement.src = resolvedUrl;
    audioElement.load();
    await audioElement.play();
    return true;
  }

  const audio = new Audio(resolvedUrl);
  await audio.play();
  return true;
}

/**
 * Narrate item text — ElevenLabs cloned voice when active, else browser TTS.
 * Never throws; falls back to SpeechSynthesis on any failure.
 */
export async function speakItem(
  text: string,
  gameId: string,
  hostPin: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || !gameId.trim()) {
    return;
  }

  try {
    const usedClonedVoice = await playHostClonedVoiceAudio(
      gameId.trim(),
      hostPin.trim(),
      trimmed,
    );
    if (usedClonedVoice) {
      return;
    }
    speakNarrationText(trimmed, { force: true });
  } catch (err) {
    console.error("Narration error:", err);
    speakNarrationText(trimmed, { force: true });
  }
}

export async function speakCalledItem(
  item: CalledItem,
  gameId: string,
  hostPin: string,
  audioElement?: HTMLAudioElement | null,
  hostVoiceProfile?: HostVoiceProfilePublic | null,
): Promise<void> {
  const trimmedGameId = gameId.trim();
  if (!trimmedGameId) {
    return;
  }

  const text = buildNarrationText(item.word, item.description);
  if (!text) {
    return;
  }

  try {
    const usedClonedVoice = await playHostClonedVoiceAudio(
      trimmedGameId,
      hostPin.trim(),
      text,
      audioElement,
      hostVoiceProfile,
    );
    if (usedClonedVoice) {
      return;
    }
    speakBingoItem(item.word, item.description, { force: true });
  } catch (err) {
    console.error("Narration error:", err);
    speakBingoItem(item.word, item.description, { force: true });
  }
}

