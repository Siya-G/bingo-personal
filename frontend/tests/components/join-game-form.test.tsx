import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { JoinGameForm } from "@/components/player/join-game-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("JoinGameForm", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    push.mockReset();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        game_id: 7,
        player_id: 3,
        player_name: "Alex",
        game_title: "Friday Bingo",
        game_status: "WAITING",
        card_id: 99,
        grid: [],
        session_token: "test-session-token-abc",
      }),
    } as Response);

    Storage.prototype.setItem = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("joins with room code and navigates to the game page", async () => {
    const user = userEvent.setup();
    render(<JoinGameForm />);

    await user.type(screen.getByPlaceholderText(/BINGO/i), "XY99ZZ");
    await user.type(screen.getByPlaceholderText(/Player name/i), "Alex");
    await user.click(screen.getByRole("button", { name: /join game/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/games/join");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.game_code).toBe("XY99ZZ");
    expect(body.name).toBe("Alex");

    expect(Storage.prototype.setItem).toHaveBeenCalled();
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/game");
    });
  });
});
