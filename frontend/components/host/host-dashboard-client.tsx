"use client";

import { useState } from "react";

import { SlideInRoomChat } from "@/components/chat/slide-in-room-chat";
import { CreateGameForm } from "@/components/host/create-game-form";
import { GameplayControls } from "@/components/host/gameplay-controls";
import { HostVoiceSettings } from "@/components/host/host-voice-settings";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { useLiveGameSession } from "@/hooks/useLiveGameSession";
import type { Game } from "@/types/game";

const setupSteps = [
  {
    title: "Create the lobby",
    detail: "Title, topic, winning patterns (pick one or more), and host PIN (PIN unlocks generate/start/call/audit).",
  },
  {
    title: "Generate content",
    detail: "Items (25 words) then cards for everyone who has joined.",
  },
  {
    title: "Invite players",
    detail:
      "Share the room code, or use Send Teams Invites after create to email your team with a join link.",
  },
  {
    title: "Run the round",
    detail: "Start the game, call items, watch audit + leaderboard + prize notices.",
  },
];

export function HostDashboardClient() {
  const { gameId: liveGameId, hostPin: liveHostPin } = useLiveGameSession();
  const [createdGameId, setCreatedGameId] = useState("");
  const [createdHostPin, setCreatedHostPin] = useState("");

  const chatGameId = liveGameId || createdGameId;
  const chatHostPin = liveHostPin || createdHostPin;

  function handleGameCreated(game: Game, hostPin: string) {
    setCreatedGameId(String(game.id));
    setCreatedHostPin(hostPin);
  }

  return (
    <>
      <div className="space-y-10">
        <PageHeader
          eyebrow="Host dashboard"
          title="Run the room like a live game show."
          description="Create the lobby, generate AI word lists and cards, control the round, and review audit and prize activity."
        />

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Panel>
            <h2 className="text-2xl font-black text-white">Create your room</h2>
            <p className="mt-2 text-sm text-slate-400">
              You will see the game ID and room code after a successful create — share
              the code with players only (PIN stays with the host).
            </p>
            <div className="mt-6">
              <CreateGameForm onGameCreated={handleGameCreated} />
            </div>
          </Panel>

          <Panel>
            <h2 className="text-2xl font-black text-white">Setup checklist</h2>
            <div className="mt-5 space-y-3">
              {setupSteps.map((step, index) => (
                <div
                  key={step.title}
                  className="flex items-start gap-3 rounded-2xl bg-slate-950/40 p-4"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-yellow-300 text-sm font-black text-slate-950">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-bold text-white">{step.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel>
          <h2 className="text-2xl font-black text-white">Voice & narration</h2>
          <p className="mt-2 text-sm text-slate-400">
            Choose a browser voice or record your own for AI-powered item calls.
          </p>
          <div className="mt-6">
            <HostVoiceSettings />
          </div>
        </Panel>

        <Panel>
          <h2 className="text-2xl font-black text-white">Live gameplay</h2>
          <p className="mt-2 text-sm text-slate-400">
            Generate items and cards, start the game, call words, and watch audit + prize
            feeds. Completed games stop new calls automatically.
          </p>
          <div className="mt-6">
            <GameplayControls />
          </div>
        </Panel>
      </div>

      <SlideInRoomChat
        gameId={chatGameId}
        hostPin={chatHostPin}
        variant="host"
      />
    </>
  );
}
