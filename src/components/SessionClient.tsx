"use client";

import { useState } from "react";
import { startSession, completeSetup, completeReceiving, type SessionState } from "@/game/session";
import { decide } from "@/game/receiving";
import SetupWizard from "./SetupWizard";
import ReceivingPhase from "./ReceivingPhase";

/** 다음 태스크에서 실제 페이즈 컴포넌트로 교체될 임시 자리표시자. */
function PhasePlaceholder({ label }: { label: string }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-zinc-100 bg-zinc-950">
      <span className="text-xs uppercase tracking-[0.25em] text-zinc-600">준비 중</span>
      <p className="text-lg font-semibold text-zinc-300">{label}</p>
    </main>
  );
}

export default function SessionClient() {
  const [session, setSession] = useState<SessionState>(startSession);

  switch (session.phase) {
    case "SETUP":
      return <SetupWizard onComplete={(choices) => setSession(completeSetup(choices))} />;
    case "RECEIVING":
      return (
        <ReceivingPhase
          receiving={session.receiving!}
          onDecide={(accept) => setSession((s) => ({ ...s, receiving: decide(s.receiving!, accept) }))}
          onContinue={() => setSession(completeReceiving(session))}
        />
      );
    case "INTERSTITIAL":
      return <PhasePlaceholder label="INTERSTITIAL (Task 5)" />;
    case "EMERGENCY":
      return <PhasePlaceholder label="EMERGENCY (Task 5)" />;
    case "EPILOGUE":
      return <PhasePlaceholder label="EPILOGUE (Task 6)" />;
  }
}
