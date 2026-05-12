const cells = ["AI", "LIVE", "B-7", "FREE", "WOW", "N-4", "HYPE", "G-9", "WIN"];

export function BingoPreviewCard() {
  return (
    <div className="rounded-[2rem] border border-yellow-200/20 bg-gradient-to-br from-yellow-200/15 via-fuchsia-400/10 to-cyan-300/10 p-4 shadow-2xl shadow-yellow-500/10">
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell, index) => (
          <div
            key={`${cell}-${index}`}
            className="grid aspect-square place-items-center rounded-2xl border border-white/10 bg-white/10 text-sm font-black text-white sm:text-base"
          >
            {cell}
          </div>
        ))}
      </div>
    </div>
  );
}
