import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHostVoiceProfile } from "@/hooks/useHostVoiceProfile";

vi.mock("@/lib/api/host-voice", () => ({
  getHostVoiceProfile: vi.fn(),
}));

import { getHostVoiceProfile } from "@/lib/api/host-voice";

function VoiceProbe({ gameId, hostPin }: { gameId: string; hostPin: string }) {
  const { voiceWarning, isLoadingVoiceProfile, selectedVoiceMode } =
    useHostVoiceProfile(gameId, hostPin);
  return (
    <div>
      <span data-testid="loading">{String(isLoadingVoiceProfile)}</span>
      <span data-testid="warning">{voiceWarning ?? ""}</span>
      <span data-testid="mode">{selectedVoiceMode}</span>
    </div>
  );
}

describe("useHostVoiceProfile", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sets voiceWarning when profile fetch fails without throwing", async () => {
    vi.mocked(getHostVoiceProfile).mockRejectedValue(new Error("HTTP 404"));

    render(<VoiceProbe gameId="7" hostPin="secret" />);

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("warning")).toHaveTextContent(
        /Host voice profile could not be loaded/i,
      );
    });

    expect(screen.getByTestId("mode")).toHaveTextContent("default-no-profile");
  });

  it("clears voiceWarning after a successful fetch", async () => {
    vi.mocked(getHostVoiceProfile).mockResolvedValue({
      voice_mode: "HOST_VOICE",
      consent_given: true,
      provider: "ELEVENLABS",
      active: true,
      demo_mode: false,
    });

    render(<VoiceProbe gameId="7" hostPin="secret" />);

    await waitFor(() => {
      expect(screen.getByTestId("warning")).toHaveTextContent("");
      expect(screen.getByTestId("mode")).toHaveTextContent(
        "elevenlabs-clone-active",
      );
    });
  });
});
