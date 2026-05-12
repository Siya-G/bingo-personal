import { BingoPreviewCard } from "@/components/game/bingo-preview-card";
import { DemoCallout } from "@/components/demo/demo-callout";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Game night, upgraded"
        title="AI-powered Bingo for hosts and players."
        description="Run a full-room demo locally: mock word generation, live calls with optional narration, WebSocket sync, validated Bingo claims, leaderboard, audit trail, and winner notices — no external AI keys required for the walkthrough."
        actions={
          <>
            <ButtonLink href="/host">Host dashboard</ButtonLink>
            <ButtonLink href="/join" variant="secondary">
              Join a game
            </ButtonLink>
            <ButtonLink href="/#demo-workflow" variant="secondary">
              Demo workflow
            </ButtonLink>
          </>
        }
      />

      <section
        aria-labelledby="demo-workflow-heading"
        className="scroll-mt-24"
        id="demo-workflow"
      >
        <Panel>
          <h2
            className="text-2xl font-black tracking-tight text-white"
            id="demo-workflow-heading"
          >
            Workplace demo workflow
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
            Follow the same order as the root{" "}
            <span className="font-semibold text-yellow-100">README.md</span> for a
            scripted tour: host creates the room → generates items → players join
            with the code → host starts and calls items → players mark and claim
            Bingo → leaderboard and prize banners update live.
          </p>
          <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm font-medium text-slate-200 sm:text-base">
            <li>Open <strong className="text-white">Host</strong> and create a game (set a host PIN you will remember).</li>
            <li>In <strong className="text-white">Live gameplay</strong>, generate items and cards, then start the game.</li>
            <li>Open <strong className="text-white">Join</strong> in another tab or device; enter the game code and a player name.</li>
            <li>Use <strong className="text-white">Game</strong> for the card and calls; try <strong className="text-white">Leaderboard</strong> for standings.</li>
          </ol>
          <div className="mt-6">
            <DemoCallout>
              <p>
                Optional: run{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-yellow-100">
                  python scripts/seed_demo_game.py
                </code>{" "}
                from <code className="text-xs">backend/</code> to pre-seed a Famous
                mountains room with three sample players (see README).
              </p>
            </DemoCallout>
          </div>
        </Panel>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="grid gap-5 sm:grid-cols-3">
          <StatCard label="Flow" value="End-to-end" />
          <StatCard label="Sync" value="WebSockets" accent="from-cyan-300 to-blue-400" />
          <StatCard label="Voice" value="Browser TTS" accent="from-fuchsia-400 to-pink-400" />
        </Panel>

        <Panel>
          <h2 className="mb-4 text-lg font-black text-white">Card preview</h2>
          <BingoPreviewCard />
        </Panel>
      </div>
    </div>
  );
}
