import { cleanup, render, screen } from "@testing-library/react";
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
  winning_patterns: ["HORIZONTAL_ROW"],
  number_of_players: 12,
  created_at: "2026-01-01T12:00:00Z",
};

describe("CreateGameForm", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // The success card embeds the invites panel, which calls /health/smtp on mount;
    // route each fetched URL so we don't have to count calls.
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/health/smtp")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            configured: false,
            host: null,
            port: null,
            use_tls: true,
            use_ssl: false,
            has_credentials: false,
            mode: "preview",
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockGame,
      } as Response);
    });
  });

  afterEach(() => {
    // vitest config has globals: false → React Testing Library does not auto
    // unmount between tests, so the DOM leaks. Clean it explicitly.
    cleanup();
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

    expect(await screen.findByText("AB12CD")).toBeInTheDocument();

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const createGameCall = fetchMock.mock.calls.find((call) => {
      const url = typeof call[0] === "string" ? call[0] : call[0].toString();
      return url.endsWith("/games") && (call[1] as RequestInit | undefined)?.method === "POST";
    });
    expect(createGameCall).toBeDefined();

    const init = createGameCall![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.title).toBe("Team Social");
    expect(body.topic).toBe("Space trivia");
    expect(body.host_pin).toBe("my-secure-pin");
    expect(body.winning_patterns).toEqual(["HORIZONTAL_ROW"]);
    expect(body.winning_pattern).toBe("HORIZONTAL_ROW");
  });

  it("uses type=button so a click cannot trigger a native form reload", () => {
    render(<CreateGameForm />);
    const button = screen.getByRole("button", { name: /create game/i });
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toBeDisabled();
    expect(screen.queryByText(/loading form/i)).toBeNull();
  });

  it("preserves form field values and shows an error when the API fails", async () => {
    // Replace the default success mock with one that fails the POST /games call
    // so we can lock in: (1) fields are NOT cleared, (2) success card is NOT
    // rendered, (3) a visible error message reaches the user.
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/health/smtp")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            configured: false,
            host: null,
            port: null,
            use_tls: true,
            use_ssl: false,
            has_credentials: false,
            mode: "preview",
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 422,
        json: async () => ({ detail: "title: This field cannot be empty." }),
      } as Response);
    });
    const user = userEvent.setup();
    render(<CreateGameForm />);

    await user.type(screen.getByPlaceholderText(/Friday Night Bingo/i), "Team Social");
    await user.type(screen.getByPlaceholderText(/At least 4 characters/i), "my-host-pin");

    await user.click(screen.getByRole("button", { name: /create game/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/HTTP 422/);

    expect(
      screen.getByPlaceholderText(/Friday Night Bingo/i),
    ).toHaveValue("Team Social");
    expect(
      screen.getByPlaceholderText(/Famous mountains/i),
    ).toHaveValue("Famous mountains");
    expect(
      screen.getByPlaceholderText(/At least 4 characters/i),
    ).toHaveValue("my-host-pin");
    expect(screen.queryByText(/Game created/i)).toBeNull();
  });

  it("shows a visible validation error without calling the API when title is empty", async () => {
    const user = userEvent.setup();
    render(<CreateGameForm />);

    await user.type(screen.getByPlaceholderText(/At least 4 characters/i), "my-host-pin");
    await user.click(screen.getByRole("button", { name: /create game/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Game title is required/i,
    );

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const createGameCall = fetchMock.mock.calls.find((call) => {
      const url = typeof call[0] === "string" ? call[0] : call[0].toString();
      return url.endsWith("/games") && (call[1] as RequestInit | undefined)?.method === "POST";
    });
    expect(createGameCall).toBeUndefined();
  });
});
