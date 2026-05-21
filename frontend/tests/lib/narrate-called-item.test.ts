import { describe, expect, it, vi } from "vitest";
import {
  HOST_VOICE_NOW_CALLING_CLONE_LABEL,
  HOST_VOICE_NOW_CALLING_DEMO_LABEL,
  HOST_VOICE_SETTINGS_CLONE_LABEL,
  HOST_VOICE_SETTINGS_DEMO_LABEL,
  describeVoiceMode,
  getAiCallerLabel,
  getHostVoiceSettingsLabel,
  isHostVoiceActive,
  isHostVoiceDemoActive,
} from "@/lib/narrate-called-item";
import type { HostVoiceProfilePublic } from "@/types/host-voice";

vi.mock("@/lib/speak-item", () => ({
  speakItem: vi.fn(),
  speakCalledItem: vi.fn(),
}));

describe("AI caller labels", () => {
  it("shows demo label when profile is active demo mode", () => {
    const profile: HostVoiceProfilePublic = {
      voice_mode: "HOST_VOICE",
      consent_given: true,
      provider: "DEMO",
      active: true,
      demo_mode: true,
    };
    expect(isHostVoiceDemoActive(profile)).toBe(true);
    expect(isHostVoiceActive(profile)).toBe(false);
    expect(getAiCallerLabel(profile)).toBe(HOST_VOICE_NOW_CALLING_DEMO_LABEL);
    expect(getHostVoiceSettingsLabel(profile)).toBe(HOST_VOICE_SETTINGS_DEMO_LABEL);
  });

  it("shows active label when host voice is non-demo", () => {
    const profile: HostVoiceProfilePublic = {
      voice_mode: "HOST_VOICE",
      consent_given: true,
      provider: "ELEVENLABS",
      active: true,
      demo_mode: false,
    };
    expect(isHostVoiceActive(profile)).toBe(true);
    expect(getAiCallerLabel(profile)).toBe(HOST_VOICE_NOW_CALLING_CLONE_LABEL);
    expect(getHostVoiceSettingsLabel(profile)).toBe(
      HOST_VOICE_SETTINGS_CLONE_LABEL,
    );
    expect(describeVoiceMode(profile)).toBe("elevenlabs-clone-active");
  });

  it("shows no label for default mode", () => {
    expect(getAiCallerLabel(null)).toBeNull();
  });
});
