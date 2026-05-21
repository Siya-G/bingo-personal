import { beforeEach, describe, expect, it, vi } from "vitest";
import { speakItem } from "@/lib/speak-item";

vi.mock("@/lib/api/host-voice", () => ({
  getHostVoiceProfile: vi.fn(),
}));

vi.mock("@/lib/api/host-voice-speak", () => ({
  postHostVoiceSpeak: vi.fn(),
  resolveVoiceAudioUrl: vi.fn((url: string) => `http://api.test${url}`),
}));

import { getHostVoiceProfile } from "@/lib/api/host-voice";
import { postHostVoiceSpeak } from "@/lib/api/host-voice-speak";

describe("speakItem", () => {
  const playMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "Audio",
      class MockAudio {
        play = playMock;
      },
    );
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class MockUtterance {
        text: string;
        voice?: SpeechSynthesisVoice;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: vi.fn(),
        getVoices: vi.fn(() => [{ name: "Test Voice" }]),
        speak: vi.fn(),
        onvoiceschanged: null,
      },
    });
  });

  it("plays OpenAI audio when host voice is active and non-demo", async () => {
    vi.mocked(getHostVoiceProfile).mockResolvedValue({
      voice_mode: "HOST_VOICE",
      consent_given: true,
      provider: "ELEVENLABS",
      active: true,
      demo_mode: false,
    });
    vi.mocked(postHostVoiceSpeak).mockResolvedValue({
      audio_url: "/voice/audio/1_abc.mp3",
      demo_mode: false,
    });

    await speakItem("Everest. Tallest peak.", "42", "pin");

    expect(postHostVoiceSpeak).toHaveBeenCalled();
    expect(playMock).toHaveBeenCalled();
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it("falls back to browser speech when profile is demo mode", async () => {
    vi.mocked(getHostVoiceProfile).mockResolvedValue({
      voice_mode: "HOST_VOICE",
      consent_given: true,
      provider: "DEMO",
      active: true,
      demo_mode: true,
    });

    await speakItem("Everest. Tallest peak.", "42", "pin");

    expect(postHostVoiceSpeak).not.toHaveBeenCalled();
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });
});
