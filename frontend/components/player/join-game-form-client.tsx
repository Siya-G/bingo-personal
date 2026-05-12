"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { JoinGameForm } from "@/components/player/join-game-form";

function JoinGameFormWithQueryCode() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim().toUpperCase() ?? "";
  return <JoinGameForm initialRoomCode={code} />;
}

export function JoinGameFormClient() {
  return (
    <Suspense fallback={<JoinGameForm />}>
      <JoinGameFormWithQueryCode />
    </Suspense>
  );
}
