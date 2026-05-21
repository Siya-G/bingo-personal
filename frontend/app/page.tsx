import { ButtonLink } from "@/components/ui/button-link";

export default function HomePage() {
  return (
    <section className="max-w-3xl">
      <p className="text-sm font-black uppercase tracking-[0.32em] text-yellow-200">
        AI-POWERED BINGO
      </p>
      <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
        Live Bingo for teams and players.
      </h1>
      <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg">
        Host a game, invite your team, and let AI call the room — live, in your
        voice.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/host">Host a Game</ButtonLink>
        <ButtonLink href="/join" variant="secondary">
          Join a Game
        </ButtonLink>
        <ButtonLink href="/leaderboard" variant="secondary">
          Leaderboard
        </ButtonLink>
      </div>
    </section>
  );
}
