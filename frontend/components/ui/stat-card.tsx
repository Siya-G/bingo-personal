type StatCardProps = Readonly<{
  label: string;
  value: string;
  accent?: string;
}>;

export function StatCard({
  label,
  value,
  accent = "from-yellow-300 to-fuchsia-400",
}: StatCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-5">
      <div className={`h-1.5 w-16 rounded-full bg-gradient-to-r ${accent}`} />
      <p className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}
