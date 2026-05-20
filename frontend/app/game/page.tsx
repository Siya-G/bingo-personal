import { PlayerChatCard } from "@/components/chat/player-chat-card";
import { PlayerCalledItemsPanel } from "@/components/game/player-called-items-panel";
import { PlayerCardPanel } from "@/components/game/player-card-panel";
import { DemoCallout } from "@/components/demo/demo-callout";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

export default function PlayerGamePage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Player game"
        title="Your card and the live call feed."
        description="After joining, your session loads automatically. Mark squares only after the host calls them, then press Bingo when your card completes any of this room’s winning patterns. When the room finishes with three winners, new claims close — the UI shows a completed-game banner."
        actions={
          <>
            <ButtonLink href="/join">Join another room</ButtonLink>
            <ButtonLink href="/leaderboard" variant="secondary">
              Leaderboard
            </ButtonLink>
            <ButtonLink href="/host" variant="secondary">
              Host view
            </ButtonLink>
          </>
        }
      />

      <DemoCallout>
        <p>
          <strong className="text-white">No session yet?</strong> Join from the Join
          page first — this tab keeps your player token in{" "}
          <code className="text-yellow-100/90">sessionStorage</code> so multiple
          players can use separate tabs without overwriting each other.
        </p>
      </DemoCallout>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel>
          <h2 className="sr-only">Live calls and narration</h2>
          <PlayerCalledItemsPanel />
        </Panel>

        <Panel>
          <h2 className="sr-only">Your Bingo card</h2>
          <PlayerCardPanel />
        </Panel>
      </div>

      <Panel>
        <h2 className="text-2xl font-black text-white">Room chat</h2>
        <p className="mt-2 text-sm text-slate-400">
          Talk to the host and other players in real time. Messages persist —
          refresh the page and recent chat will still be here.
        </p>
        <div className="mt-6">
          <PlayerChatCard />
        </div>
      </Panel>
    </div>
  );
}
