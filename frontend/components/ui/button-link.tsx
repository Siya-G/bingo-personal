import Link from "next/link";
import type { ReactNode } from "react";

type ButtonLinkProps = Readonly<{
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary";
}>;

export function ButtonLink({
  children,
  href,
  variant = "primary",
}: ButtonLinkProps) {
  const styles =
    variant === "primary"
      ? "bg-yellow-300 text-slate-950 shadow-yellow-500/30 hover:bg-yellow-200"
      : "border border-white/15 bg-white/10 text-white hover:border-white/30 hover:bg-white/15";

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-black uppercase tracking-[0.18em] shadow-lg transition ${styles}`}
    >
      {children}
    </Link>
  );
}
