import type { ReactNode } from "react";
import { MainNav } from "@/components/layout/main-nav";

type AppShellProps = Readonly<{
  children: ReactNode;
}>;

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <MainNav />
        <main className="flex-1 py-8 sm:py-12">{children}</main>
      </div>
    </div>
  );
}
