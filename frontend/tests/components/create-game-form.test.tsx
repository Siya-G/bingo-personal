import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CreateGameForm } from "@/components/host/create-game-form";

const mockGame = {
  id: 42,
  title: "Pytest Room",
  topic: "Famous mountains",
  game_code: "AB12CD",
  status: "WAITING",
  winning_pattern: "HORIZONTAL_ROW",
  number_of_players: 12,
  created_at: "2026-01-01T12:00:00Z",
};

describe("CreateGameForm", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGame,
    } as Response);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("submits host PIN and game fields to the API", async () => {
    const user = userEvent.setup();
    render(<CreateGameForm />);

    await user.clear(screen.getByPlaceholderText(/Friday Night Bingo/i));
    await user.type(screen.getByPlaceholderText(/Friday Night Bingo/i), "Team Social");

    await user.clear(screen.getByPlaceholderText(/Famous mountains/i));
    await user.type(screen.getByPlaceholderText(/Famous mountains/i), "Space trivia");

    await user.type(screen.getByPlaceholderText(/At least 4 characters/i), "my-secure-pin");

    await user.click(screen.getByRole("button", { name: /create game/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.title).toBe("Team Social");
    expect(body.topic).toBe("Space trivia");
    expect(body.host_pin).toBe("my-secure-pin");
    expect(body.winning_pattern).toBe("HORIZONTAL_ROW");

    expect(await screen.findByText("AB12CD")).toBeInTheDocument();
  });
});
