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

async function playHostClonedVoiceAudio(
  gameId: string,
  hostPin: string,
  text: string,
): Promise<boolean> {
  const profile = await getHostVoiceProfile(gameId, hostPin);
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

  const audio = new Audio(resolveVoiceAudioUrl(data.audio_url));
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

