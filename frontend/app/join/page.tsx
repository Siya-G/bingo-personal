import { JoinGameFormClient } from "@/components/player/join-game-form-client";
import { DemoCallout } from "@/components/demo/demo-callout";
import { ButtonLink } from "@/components/ui/button-link";
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
          actions={
            <>
              <ButtonLink href="/game">Open game board</ButtonLink>
              <ButtonLink href="/host" variant="secondary">
                Host dashboard
              </ButtonLink>
            </>
          }
        />

        <DemoCallout>
          <p>
            After joining you will be redirected to the **Game** page. Use a unique
            name per player in the same room — duplicates are rejected with a clear
            message.
          </p>
        </DemoCallout>

        <Panel className="hidden lg:block">
          <h2 className="text-lg font-black text-white">Empty state</h2>
          <p className="mt-2 text-sm text-slate-400">
            No lobby list here by design: every join is by **code**. If you do not have
            a code yet, ask the host or run the optional seed script in the README.
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
