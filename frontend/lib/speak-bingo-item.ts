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

/** Bumped before each cancel/new speak so prior utterances ignore their onerror. */
let speakGeneration = 0;
/** Prevents duplicate whenVoicesReady / speakBingoItem scheduling for the same text. */
let inFlightNarrationKey: string | null = null;

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

function clearInFlightNarration(key: string) {
  if (inFlightNarrationKey === key) {
    inFlightNarrationKey = null;
  }
}

function handleUtteranceError(
  event: SpeechSynthesisErrorEvent,
  generation: number,
  narrationKey: string,
  options?: SpeakBingoItemOptions,
): void {
  if (generation !== speakGeneration) {
    return;
  }

  clearInFlightNarration(narrationKey);

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

/**
 * Call synchronously inside a user click handler before any await (Chrome).
 * Does not call cancel() — speakBingoItem cancels once immediately before speak().
 */
export function prewarmSpeechSynthesisForUserGesture(): void {
  if (!isSpeechSynthesisAvailable()) {
    return;
  }
  const synth = window.speechSynthesis;
  synth.getVoices();
  if (synth.paused) {
    synth.resume();
  }
}

export function whenVoicesReady(synth: SpeechSynthesis, speak: () => void): void {
  let invoked = false;
  const invokeOnce = () => {
    if (invoked) {
      return;
    }
    invoked = true;
    synth.onvoiceschanged = null;
    speak();
  };

  // Drop any stale handler left by a prior narration attempt.
  synth.onvoiceschanged = null;

  if (synth.getVoices().length > 0) {
    invokeOnce();
    return;
  }

  synth.onvoiceschanged = invokeOnce;
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

  if (inFlightNarrationKey === narrationText) {
    if (!options?.force) {
      console.log("narration skipped: duplicate in-flight request");
      return true;
    }
    // force=true (Call Next, Replay, Test Voice): supersede in-flight scheduling.
    speakGeneration += 1;
    inFlightNarrationKey = null;
  }
  inFlightNarrationKey = narrationText;

  const rate = options?.rate ?? settings.rate;
  const pitch = options?.pitch ?? settings.pitch;
  const volume = options?.volume ?? settings.volume;
  const voiceName = options?.voiceName ?? settings.voiceName;

  if (synth.paused) {
    synth.resume();
  }

  const startUtterance = () => {
    speakGeneration += 1;
    const generation = speakGeneration;
    // Single cancel for this speak — never call cancel() after speak().
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
      clearInFlightNarration(narrationText);
      console.log("speech ended");
      options?.onSpeakingChange?.(false);
    };
    utterance.onerror = (event) => {
      handleUtteranceError(event, generation, narrationText, options);
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
  inFlightNarrationKey = null;
  if (isSpeechSynthesisAvailable()) {
    const synth = window.speechSynthesis;
    synth.onvoiceschanged = null;
    synth.cancel();
  }
}
