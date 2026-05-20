import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "@/components/chat/chat-panel";
import type { ChatMessage } from "@/types/chat";
import type { GameSocketEvent } from "@/types/ws-game";

// Controllable replacement for ``useGameSocket`` so the chat tests don't depend
// on a real WebSocket connection. ``__pushEvent`` lets a test simulate a
// CHAT_MESSAGE broadcast and re-render the consumer.
const useGameSocketMock = vi.hoisted(() => {
  let event: GameSocketEvent | null = null;
  const listeners = new Set<() => void>();
  return {
    __pushEvent(next: GameSocketEvent) {
      event = next;
      listeners.forEach((cb) => cb());
    },
    __reset() {
      event = null;
      listeners.clear();
    },
    useGameSocket() {
      const React = require("react") as typeof import("react");
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        const cb = () => setTick((n) => n + 1);
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      }, []);
      return { status: "open" as const, lastEvent: event, gameId: "1" };
    },
  };
});

vi.mock("@/hooks/useGameSocket", () => ({
  useGameSocket: useGameSocketMock.useGameSocket,
}));

const historyMessages: ChatMessage[] = [
  {
    id: 1,
    game_id: 42,
    sender_id: null,
    sender_name: "System",
    sender_role: "SYSTEM",
    message: "Alex joined the room.",
    created_at: "2026-01-01T12:00:00Z",
  },
  {
    id: 2,
    game_id: 42,
    sender_id: 7,
    sender_name: "Alex",
    sender_role: "PLAYER",
    message: "Hi from Alex",
    created_at: "2026-01-01T12:00:10Z",
  },
];

function jsonResponse(body: unknown, init?: Partial<Response>) {
  return Promise.resolve({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response);
}

describe("ChatPanel", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useGameSocketMock.__reset();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("loads chat history and renders sender role + name + message", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      jsonResponse(historyMessages),
    );

    render(
      <ChatPanel
        gameId={42}
        role="PLAYER"
        senderName="Alex"
        senderId={7}
        playerSession="player-token"
      />,
    );

    const messages = await screen.findAllByTestId("chat-message");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveAttribute("data-role", "SYSTEM");
    expect(messages[0]).toHaveTextContent("Alex joined the room");
    expect(messages[1]).toHaveAttribute("data-role", "PLAYER");
    expect(messages[1]).toHaveTextContent("Hi from Alex");
  });

  it("POSTs the trimmed message, clears the input, and renders the new message", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "POST" && url.endsWith("/chat")) {
        return jsonResponse({
          id: 3,
          game_id: 42,
          sender_id: 7,
          sender_name: "Alex",
          sender_role: "PLAYER",
          message: "GG everyone",
          created_at: "2026-01-01T12:05:00Z",
        });
      }
      return jsonResponse(historyMessages);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();
    render(
      <ChatPanel
        gameId={42}
        role="PLAYER"
        senderName="Alex"
        senderId={7}
        playerSession="player-token"
      />,
    );

    await screen.findAllByTestId("chat-message");

    const input = screen.getByLabelText(/message/i);
    await user.type(input, "   GG everyone   ");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      const rows = screen.getAllByTestId("chat-message");
      expect(rows[rows.length - 1]).toHaveTextContent("GG everyone");
    });

    expect(input).toHaveValue("");

    const postCall = fetchMock.mock.calls.find((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.message).toBe("GG everyone");
    expect(body.sender_role).toBe("PLAYER");
    expect(body.sender_id).toBe(7);
    expect(body.sender_name).toBe("Alex");
    const headers = (postCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Player-Session"]).toBe("player-token");
  });

  it("does not POST when the input is only whitespace", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse([]));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();
    render(
      <ChatPanel
        gameId={42}
        role="HOST"
        senderName="Host"
        senderId={null}
        hostPin="demo-pin-1234"
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const sendButton = screen.getByRole("button", { name: /send/i });
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByLabelText(/message/i), "   ");
    expect(sendButton).toBeDisabled();

    expect(
      fetchMock.mock.calls.filter((call) => {
        const init = call[1] as RequestInit | undefined;
        return init?.method === "POST";
      }),
    ).toHaveLength(0);
  });

  it("dedupes a WebSocket CHAT_MESSAGE that matches an already-rendered POST response", async () => {
    let sendCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "POST" && url.endsWith("/chat")) {
        sendCount += 1;
        return jsonResponse({
          id: 99,
          game_id: 42,
          sender_id: null,
          sender_name: "Host",
          sender_role: "HOST",
          message: "Welcome",
          created_at: "2026-01-01T12:10:00Z",
        });
      }
      return jsonResponse([]);
    });

    const user = userEvent.setup();
    render(
      <ChatPanel
        gameId={42}
        role="HOST"
        senderName="Host"
        senderId={null}
        hostPin="demo-pin-1234"
      />,
    );

    await user.type(screen.getByLabelText(/message/i), "Welcome");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(screen.getAllByTestId("chat-message")).toHaveLength(1),
    );

    // Now simulate the WS broadcast for the SAME message id arriving after.
    act(() => {
      useGameSocketMock.__pushEvent({
        type: "CHAT_MESSAGE",
        payload: {
          id: 99,
          game_id: 42,
          sender_id: null,
          sender_name: "Host",
          sender_role: "HOST",
          message: "Welcome",
          created_at: "2026-01-01T12:10:00Z",
        },
      });
    });

    // Still exactly one message, not two.
    await waitFor(() =>
      expect(screen.getAllByTestId("chat-message")).toHaveLength(1),
    );
    expect(sendCount).toBe(1);
  });

  it("appends a new CHAT_MESSAGE WebSocket event that wasn't in history", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => jsonResponse([]));
    render(
      <ChatPanel
        gameId={42}
        role="PLAYER"
        senderName="Alex"
        senderId={7}
        playerSession="player-token"
      />,
    );

    await screen.findByText(/no messages yet/i);

    act(() => {
      useGameSocketMock.__pushEvent({
        type: "CHAT_MESSAGE",
        payload: {
          id: 11,
          game_id: 42,
          sender_id: null,
          sender_name: "System",
          sender_role: "SYSTEM",
          message: "Everest was called.",
          created_at: "2026-01-01T12:08:00Z",
        },
      });
    });

    const row = await screen.findByTestId("chat-message");
    expect(row).toHaveAttribute("data-role", "SYSTEM");
    expect(within(row).getByText(/everest was called/i)).toBeInTheDocument();
  });

  it("shows a moderation notice (and keeps the draft) when the API returns a structured block response", async () => {
    let savedCalls = 0;
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "POST" && url.endsWith("/chat")) {
        savedCalls += 1;
        return jsonResponse(
          {
            detail: {
              error: "Message blocked by chat moderation.",
              reason: "inappropriate_language",
            },
          },
          { ok: false, status: 422 },
        );
      }
      return jsonResponse([]);
    });

    const user = userEvent.setup();
    render(
      <ChatPanel
        gameId={42}
        role="HOST"
        senderName="Host"
        senderId={null}
        hostPin="demo-pin-1234"
      />,
    );

    await user.type(screen.getByLabelText(/message/i), "something inappropriate");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/blocked by chat moderation/i);
    // Draft survives so the user can edit and resend.
    expect(screen.getByLabelText(/message/i)).toHaveValue("something inappropriate");
    // No message row was added optimistically.
    expect(screen.queryByTestId("chat-message")).toBeNull();
    expect(savedCalls).toBe(1);
  });

  it("renders the workplace-appropriate helper text below the input", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => jsonResponse([]));
    render(
      <ChatPanel
        gameId={42}
        role="PLAYER"
        senderName="Alex"
        senderId={7}
        playerSession="player-token"
      />,
    );
    expect(
      await screen.findByText(/keep chat respectful and workplace-appropriate/i),
    ).toBeInTheDocument();
  });

  it("shows the server's error detail when sending fails (and keeps the draft)", async () => {
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "POST" && url.endsWith("/chat")) {
        return jsonResponse({ detail: "Message is too long." }, { ok: false, status: 422 });
      }
      return jsonResponse([]);
    });

    const user = userEvent.setup();
    render(
      <ChatPanel
        gameId={42}
        role="HOST"
        senderName="Host"
        senderId={null}
        hostPin="demo-pin-1234"
      />,
    );

    await user.type(screen.getByLabelText(/message/i), "hello there");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/too long/i);
    // Draft is preserved so the user can edit + retry.
    expect(screen.getByLabelText(/message/i)).toHaveValue("hello there");
  });
});
