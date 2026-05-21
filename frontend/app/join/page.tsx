import { JoinGameFormClient } from "@/components/player/join-game-form-client";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

export default function PlayerJoinPage() {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Player join"
          title="Step into the spotlight."
          description="Enter your display name and the host’s six-character game code. When items are ready on the server, you receive a Bingo card and a secure session token for this browser."
        />

        <Panel className="hidden lg:block">
          <h2 className="text-lg font-black text-white">Need a code?</h2>
          <p className="mt-2 text-sm text-slate-400">
            Every join is by **game code**. Ask your host for the six-character code
            shown when they create the room.
          </p>
        </Panel>
      </div>

      <Panel>
        <h2 className="text-xl font-black text-white">Join form</h2>
        <p className="mt-2 text-sm text-slate-400">
          Codes are not case-sensitive; they normalize to uppercase automatically.
        </p>
        <div className="mt-6">
          <JoinGameFormClient />
        </div>
      </Panel>
    </div>
  );
}
