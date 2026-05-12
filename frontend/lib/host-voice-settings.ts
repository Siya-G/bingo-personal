/** Persisted host voice + narration preferences (browser SpeechSynthesis). */

export const STORAGE_KEYS = {
  voiceName: "ai-bingo-host-voice-name",
  rate: "ai-bingo-host-voice-rate",
  pitch: "ai-bingo-host-voice-pitch",
  volume: "ai-bingo-host-voice-volume",
  narrationEnabled: "ai-bingo-narration-enabled",
} as const;

export type HostVoiceSettings = {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  narrationEnabled: boolean;
};

const DEFAULTS: HostVoiceSettings = {
  voiceName: "",
  rate: 1,
  pitch: 1,
  volume: 1,
  narrationEnabled: true,
};

function readNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  return raw === "true";
}

export function readHostVoiceSettings(): HostVoiceSettings {
  if (typeof window === "undefined") {
    return DEFAULTS;
  }

  return {
    voiceName: window.localStorage.getItem(STORAGE_KEYS.voiceName) ?? "",
    rate: readNumber(STORAGE_KEYS.rate, DEFAULTS.rate),
    pitch: readNumber(STORAGE_KEYS.pitch, DEFAULTS.pitch),
    volume: readNumber(STORAGE_KEYS.volume, DEFAULTS.volume),
    narrationEnabled: readBoolean(
      STORAGE_KEYS.narrationEnabled,
      DEFAULTS.narrationEnabled,
    ),
  };
}

export function writeHostVoiceSettings(partial: Partial<HostVoiceSettings>) {
  if (typeof window === "undefined") {
    return;
  }

  if (partial.voiceName !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.voiceName, partial.voiceName);
  }
  if (partial.rate !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.rate, String(partial.rate));
  }
  if (partial.pitch !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.pitch, String(partial.pitch));
  }
  if (partial.volume !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.volume, String(partial.volume));
  }
  if (partial.narrationEnabled !== undefined) {
    window.localStorage.setItem(
      STORAGE_KEYS.narrationEnabled,
      String(partial.narrationEnabled),
    );
  }

  window.dispatchEvent(new CustomEvent("ai-bingo-host-voice-changed"));
}
