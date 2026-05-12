import { CreateGameForm } from "@/components/host/create-game-form";
import { GameplayControls } from "@/components/host/gameplay-controls";
import { HostVoiceSettings } from "@/components/host/host-voice-settings";
import { DemoCallout } from "@/components/demo/demo-callout";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";

const setupSteps = [
  {
    title: "Create the lobby",
    detail: "Title, topic, pattern, and host PIN (PIN unlocks generate/start/call/audit).",
  },
  {
    title: "Generate content",
    detail: "Items (25 words) then cards for everyone who has joined.",
  },
  {
    title: "Invite players",
    detail:
      "Share the room code, or use Send Teams Invites after create to preview email copy with a Teams link + Bingo join URL.",
  },
  {
    title: "Run the round",
    detail: "Start the game, call items, watch audit + leaderboard + prize notices.",
  },
];

export default function HostDashboardPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Host dashboard"
        title="Run the room like a live game show."
        description="Create the lobby, generate mock AI word lists and cards, control the round, and review audit and prize activity. Everything here is local-first for demos — see the repo README for MVP vs production notes."
        actions={
          <>
            <ButtonLink href="/join">Player join</ButtonLink>
            <ButtonLink href="/leaderboard" variant="secondary">
              Leaderboard
            </ButtonLink>
            <ButtonLink href="/#demo-workflow" variant="secondary">
              Demo workflow
            </ButtonLink>
          </>
        }
      />

      <DemoCallout>
        <p>
          After players join, use <strong className="text-white">Generate items</strong>{" "}
          then <strong className="text-white">Generate cards</strong> in Live Gameplay
          (host PIN required). Narration lives under Voice settings.
        </p>
      </DemoCallout>

      <div className="grid gap-6 lg:grid-cols-3">
        <StatCard label="Status" value="Host-led" />
        <StatCard label="Words" value="Mock AI" accent="from-cyan-300 to-blue-400" />
        <StatCard label="Live" value="WebSockets" accent="from-fuchsia-400 to-pink-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <h2 className="text-2xl font-black text-white">Create your room</h2>
          <p className="mt-2 text-sm text-slate-400">
            You will see the game ID and room code after a successful create — share
            the code with players only (PIN stays with the host).
          </p>
          <div className="mt-6">
            <CreateGameForm />
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
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-black uppercase tracking-[0.12em] text-emerald-200">
              Success path
            </p>
            <p className="mt-2 text-emerald-50/95">
              When the green “Game created” card appears, copy the **game code** to
              players and enter the **game ID** + **host PIN** below in Live Gameplay
              before generating items or starting the round.
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <h2 className="text-2xl font-black text-white">Voice & narration</h2>
        <p className="mt-2 text-sm text-slate-400">
          Browser TTS reads each new call when narration is enabled (per-tab, no cloud
          voice API in this MVP).
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
  );
}
