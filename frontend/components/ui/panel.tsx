import type { ReactNode } from "react";

type PanelProps = Readonly<{
  children: ReactNode;
  className?: string;
}>;

export function Panel({ children, className = "" }: PanelProps) {
  return (
    <section
      className={`rounded-3xl border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
