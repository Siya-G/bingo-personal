import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildNarrationText,
  isBenignSpeechError,
  isFatalSpeechError,
  prewarmSpeechSynthesisForUserGesture,
  speakBingoItem,
} from "@/lib/speak-bingo-item";

describe("speech error classification", () => {
  it("treats canceled and interrupted as benign", () => {
    expect(isBenignSpeechError("canceled")).toBe(true);
    expect(isBenignSpeechError("interrupted")).toBe(true);
    expect(isBenignSpeechError("not-allowed")).toBe(false);
  });

  it("flags known fatal synthesis errors", () => {
    expect(isFatalSpeechError("not-allowed")).toBe(true);
    expect(isFatalSpeechError("synthesis-failed")).toBe(true);
    expect(isFatalSpeechError("canceled")).toBe(false);
  });
});

describe("buildNarrationText", () => {
  it("formats word and description", () => {
    expect(buildNarrationText("Everest", "Tallest peak")).toBe(
      "Everest. Tallest peak",
    );
  });

  it("returns word only when description is empty", () => {
    expect(buildNarrationText("Everest", null)).toBe("Everest");
  });

  it("returns empty when word is blank", () => {
    expect(buildNarrationText("  ", "fact")).toBe("");
  });
});

describe("prewarmSpeechSynthesisForUserGesture", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not call speechSynthesis.cancel()", () => {
    const cancel = vi.fn();
    const getVoices = vi.fn(() => [] as SpeechSynthesisVoice[]);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel,
        getVoices,
        paused: false,
        resume: vi.fn(),
      },
    });

    prewarmSpeechSynthesisForUserGesture();

    expect(getVoices).toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("speakBingoItem", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls cancel once before speak, not after", () => {
    const calls: string[] = [];
    const cancel = vi.fn(() => calls.push("cancel"));
    const speak = vi.fn(() => calls.push("speak"));
    class MockUtterance {
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      constructor(public text: string) {}
    }
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel,
        speak,
        getVoices: vi.fn(() => [{ name: "Test", lang: "en-US" }]),
        paused: false,
        resume: vi.fn(),
        onvoiceschanged: null,
      },
    });

    speakBingoItem("Everest", "Tallest peak", { force: true });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["cancel", "speak"]);
  });
});
