import {
  isSpeechSynthesisAvailable,
  speakBingoItem,
  type SpeakBingoItemOptions,
} from "@/lib/speak-bingo-item";
import type { CalledItem } from "@/types/gameplay";
import type { HostVoiceProfilePublic } from "@/types/host-voice";

export const HOST_VOICE_DEMO_LABEL = "🎙 AI Caller — browser voice";
export const HOST_VOICE_NOW_CALLING_DEMO_LABEL = "🎙 AI Caller — browser voice";
export const HOST_VOICE_NOW_CALLING_CLONE_LABEL = "🎙 Calling in host's voice";

export const HOST_VOICE_SETTINGS_DEMO_LABEL = "🎙 AI Caller — browser voice";
export const HOST_VOICE_SETTINGS_CLONE_LABEL =
  "🎙 Your voice is ready — ElevenLabs voice clone active";

/** @deprecated Use HOST_VOICE_DEMO_LABEL */
export const LEGACY_HOST_VOICE_DEMO_LABEL = "🎙 Host voice saved (demo mode)";

export function isHostVoiceDemoActive(
  profile: HostVoiceProfilePublic | null | undefined,
): boolean {
  return (
    profile?.voice_mode === "HOST_VOICE" &&
    profile?.active === true &&
    profile.demo_mode === true
  );
}

export function isHostVoiceActive(
  profile: HostVoiceProfilePublic | null | undefined,
): boolean {
  return (
    profile?.voice_mode === "HOST_VOICE" &&
    profile?.active === true &&
    profile.demo_mode === false
  );
}

/** Label under NOW CALLING in the Bingo Agent panel. */
export function getAiCallerLabel(
  profile: HostVoiceProfilePublic | null | undefined,
): string | null {
  if (isHostVoiceDemoActive(profile)) {
    return HOST_VOICE_NOW_CALLING_DEMO_LABEL;
  }
  if (isHostVoiceActive(profile)) {
    return HOST_VOICE_NOW_CALLING_CLONE_LABEL;
  }
  return null;
}

/** Status label in Host Voice Settings / Bingo Caller Voice section. */
export function getHostVoiceSettingsLabel(
  profile: HostVoiceProfilePublic | null | undefined,
): string | null {
  if (!profile?.active || profile.voice_mode !== "HOST_VOICE") {
    return null;
  }
  if (profile.demo_mode) {
    return HOST_VOICE_SETTINGS_DEMO_LABEL;
  }
  if (profile.provider === "ELEVENLABS") {
    return HOST_VOICE_SETTINGS_CLONE_LABEL;
  }
  return null;
}

export function describeVoiceMode(
  profile: HostVoiceProfilePublic | null | undefined,
): string {
  if (!profile) {
    return "default-no-profile";
  }
  if (profile.voice_mode === "DEFAULT" || !profile.active) {
    return "default-browser";
  }
  if (profile.demo_mode) {
    return "host-voice-demo-fallback-browser";
  }
  return "elevenlabs-clone-active";
}

export { speakCalledItem, speakItem } from "@/lib/speak-item";

/** Player-side browser narration only (no OpenAI TTS). */
export function narrateCalledItem(
  item: CalledItem,
  _profile: HostVoiceProfilePublic | null | undefined,
  options?: SpeakBingoItemOptions,
): boolean {
  if (!isSpeechSynthesisAvailable()) {
    return false;
  }
  return speakBingoItem(item.word, item.description, options);
}
