import { readHostVoiceSettings } from "@/lib/host-voice-settings";

export const NARRATION_UNAVAILABLE_MESSAGE =
  "Narration is unavailable in this browser.";

export type SpeakBingoItemOptions = {
  /** Ignore the narration toggle (host Call Next, replay). */
  force?: boolean;
  voiceName?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onSpeakingChange?: (speaking: boolean) => void;
};

let pendingSpeakTimer: number | null = null;
/** Bumped before each cancel/new speak so prior utterances ignore their onerror. */
let speakGeneration = 0;

const BENIGN_SPEECH_ERRORS = new Set(["canceled", "interrupted"]);

export function isBenignSpeechError(error: string | undefined): boolean {
  if (!error) {
    return false;
  }
  return BENIGN_SPEECH_ERRORS.has(error);
}

export function isFatalSpeechError(error: string | undefined): boolean {
  if (!error || isBenignSpeechError(error)) {
    return false;
  }
  return (
    error === "audio-busy" ||
    error === "audio-hardware" ||
    error === "network" ||
    error === "not-allowed" ||
    error === "synthesis-failed" ||
    error === "synthesis-unavailable" ||
    error === "language-unavailable" ||
    error === "text-too-long" ||
    error === "invalid-argument"
  );
}

function handleUtteranceError(
  event: SpeechSynthesisErrorEvent,
  generation: number,
  options?: SpeakBingoItemOptions,
): void {
  if (generation !== speakGeneration) {
    return;
  }

  const code = event.error;
  if (isBenignSpeechError(code)) {
    console.log("narration stopped (expected):", code);
    options?.onSpeakingChange?.(false);
    return;
  }

  if (isFatalSpeechError(code)) {
    console.error("narration error:", code);
  } else if (code) {
    console.warn("narration error (unknown):", code);
  }
  options?.onSpeakingChange?.(false);
}

export function isSpeechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.speechSynthesis);
}

/** Call synchronously inside a user click handler before any await (Chrome). */
export function prewarmSpeechSynthesisForUserGesture(): void {
  if (!isSpeechSynthesisAvailable()) {
    return;
  }
  const synth = window.speechSynthesis;
  synth.getVoices();
  synth.cancel();
}

export function whenVoicesReady(synth: SpeechSynthesis, speak: () => void): void {
  if (synth.getVoices().length > 0) {
    speak();
    return;
  }
  synth.onvoiceschanged = () => {
    synth.onvoiceschanged = null;
    speak();
  };
}

/** Build "{word}. {description}" for SpeechSynthesis. */
export function buildNarrationText(
  word: string,
  description?: string | null,
): string {
  const trimmedWord = word?.trim() ?? "";
  if (!trimmedWord) {
    return "";
  }
  const fact = description?.trim();
  return fact ? `${trimmedWord}. ${fact}` : trimmedWord;
}

function pickVoice(
  voiceList: SpeechSynthesisVoice[],
  voiceName: string,
): SpeechSynthesisVoice | undefined {
  if (!voiceName) {
    return undefined;
  }
  return voiceList.find((voice) => voice.name === voiceName);
}

/**
 * Speak a called Bingo item via browser SpeechSynthesis.
 * Returns true when playback was requested, false when skipped or unavailable.
 */
export function speakBingoItem(
  word: string,
  description: string | null | undefined,
  options?: SpeakBingoItemOptions,
): boolean {
  const synthAvailable = isSpeechSynthesisAvailable();
  console.log("speechSynthesis available", synthAvailable);
  if (!synthAvailable) {
    return false;
  }

  const synth = window.speechSynthesis;
  const settings = readHostVoiceSettings();
  if (!options?.force && !settings.narrationEnabled) {
    console.log("narration skipped: disabled in settings");
    return false;
  }

  const narrationText = buildNarrationText(word, description);
  console.log("called item word", word);
  console.log("called item description", description ?? "");
  console.log("narration text", narrationText);
  if (!narrationText) {
    console.warn("narration skipped: empty text");
    return false;
  }

  const rate = options?.rate ?? settings.rate;
  const pitch = options?.pitch ?? settings.pitch;
  const volume = options?.volume ?? settings.volume;
  const voiceName = options?.voiceName ?? settings.voiceName;

  if (pendingSpeakTimer !== null) {
    window.clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = null;
  }

  if (synth.paused) {
    synth.resume();
  }

  const startUtterance = () => {
    speakGeneration += 1;
    const generation = speakGeneration;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(narrationText);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    const voiceList = synth.getVoices();
    const match = pickVoice(voiceList, voiceName);
    const selectedVoiceLabel = match?.name ?? "default browser voice";
    console.log("selected voice", selectedVoiceLabel);
    if (match) {
      utterance.voice = match;
    } else if (voiceList.length > 0) {
      utterance.voice = voiceList[0];
    }

    utterance.onstart = () => {
      if (generation !== speakGeneration) {
        return;
      }
      console.log("speech started");
      options?.onSpeakingChange?.(true);
    };
    utterance.onend = () => {
      if (generation !== speakGeneration) {
        return;
      }
      console.log("speech ended");
      options?.onSpeakingChange?.(false);
    };
    utterance.onerror = (event) => {
      handleUtteranceError(event, generation, options);
    };

    synth.speak(utterance);
    console.log("speechSynthesis.speak() called");
  };

  whenVoicesReady(synth, startUtterance);

  return true;
}

/** Speak arbitrary narration text (e.g. voice settings test phrase). */
export function speakNarrationText(
  text: string,
  options?: SpeakBingoItemOptions,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return speakBingoItem(trimmed, null, options);
}

export function cancelBingoSpeech(): void {
  speakGeneration += 1;
  if (pendingSpeakTimer !== null) {
    window.clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = null;
  }
  if (isSpeechSynthesisAvailable()) {
    window.speechSynthesis.cancel();
  }
}
