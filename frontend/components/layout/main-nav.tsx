import Link from "next/link";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/host", label: "Host" },
  { href: "/join", label: "Join" },
  { href: "/game", label: "Game" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/#demo-workflow", label: "Demo" },
];

export function MainNav() {
  return (
    <header className="rounded-3xl border border-white/10 bg-white/10 px-4 py-4 shadow-2xl shadow-fuchsia-950/30 backdrop-blur md:px-6">
      <nav className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="group flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-yellow-300 to-fuchsia-500 text-lg font-black text-slate-950 shadow-lg shadow-fuchsia-500/30">
            B
          </span>
          <span>
            <span className="block text-lg font-black tracking-tight text-white">
              AI Bingo
            </span>
            <span className="block text-xs uppercase tracking-[0.28em] text-yellow-200/80">
              Live Game Studio
            </span>
          </span>
        </Link>

        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-yellow-300/60 hover:bg-yellow-300/10 hover:text-yellow-100"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
