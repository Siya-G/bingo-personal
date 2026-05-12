import type { ReactNode } from "react";

type DemoCalloutProps = Readonly<{
  children: ReactNode;
  title?: string;
}>;

/**
 * Short contextual note for in-app demos (links to README for full script).
 */
export function DemoCallout({
  children,
  title = "Demo tip",
}: DemoCalloutProps) {
  return (
    <aside className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-sm text-slate-200 shadow-inner shadow-cyan-950/20">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
        {title}
      </p>
      <div className="mt-2 space-y-2 leading-relaxed">{children}</div>
    </aside>
  );
}
