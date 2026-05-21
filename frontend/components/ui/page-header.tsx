import type { ReactNode } from "react";

type PageHeaderProps = Readonly<{
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}>;

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.32em] text-yellow-200">
          {eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}
