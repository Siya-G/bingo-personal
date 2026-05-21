import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression: Create Game must not import voice/narration hooks or speech libs.
 */
describe("Create Game / voice independence", () => {
  it("create-game-form does not import voice or narration modules", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "components/host/create-game-form.tsx",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/useHostVoiceProfile/);
    expect(source).not.toMatch(/speakBingoItem|narrateCalledItem|useSpeechSynthesis/);
    expect(source).toMatch(/isCreatingGame/);
    expect(source).toMatch(/createGameError/);
    expect(source).toMatch(/type="button"/);
  });
});
