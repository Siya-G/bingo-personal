import { describe, expect, it } from "vitest";
import {
  buildNarrationText,
  isBenignSpeechError,
  isFatalSpeechError,
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
