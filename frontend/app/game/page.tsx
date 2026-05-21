import { SlideInRoomChat } from "@/components/chat/slide-in-room-chat";
import { PlayerCalledItemsPanel } from "@/components/game/player-called-items-panel";
import { PlayerCardPanel } from "@/components/game/player-card-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

export default function PlayerGamePage() {
  return (
    <>
      <div className="space-y-10">
        <PageHeader
          eyebrow="Player game"
          title="Your Bingo Card."
        />

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
      </div>

      <SlideInRoomChat variant="player" />
    </>
  );
}
