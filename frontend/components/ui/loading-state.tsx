type LoadingStateProps = Readonly<{
  label: string;
  /** When false, nothing is rendered (avoids layout shift if parent handles it). */
  active: boolean;
}>;

export function LoadingState({ active, label }: LoadingStateProps) {
  if (!active) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100">
      <span
        aria-hidden
        className="inline-block size-4 animate-spin rounded-full border-2 border-cyan-200/40 border-t-cyan-100"
      />
      <span>{label}</span>
    </div>
  );
}
