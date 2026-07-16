"use client";

import { useState } from "react";
import {
  startSession,
  completeSetup,
  completeReceiving,
  beginEmergency,
  toEpilogue,
  buildEpilogue,
  type SessionState,
} from "@/game/session";
import { decide } from "@/game/receiving";
import SetupWizard from "./SetupWizard";
import ReceivingPhase from "./ReceivingPhase";
import Interstitial from "./Interstitial";
import InHouseEmergency from "./InHouseEmergency";
import TransferRound from "./TransferRound";
import Epilogue from "./Epilogue";

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
      return (
        <Interstitial
          hospital={session.hospital!}
          receiving={session.receiving!}
          onContinue={() => setSession(beginEmergency(session))}
        />
      );
    case "EMERGENCY": {
      const em = session.emergency!;
      if (em.mode === "IN_HOUSE") {
        return <InHouseEmergency onContinue={() => setSession(toEpilogue(session))} />;
      }
      return (
        <TransferRound
          game={em.game}
          onFinish={(final) =>
            setSession((s) => toEpilogue({ ...s, emergency: { mode: "TRANSFER", game: final } }))
          }
        />
      );
    }
    case "EPILOGUE":
      return (
        <Epilogue
          epilogue={buildEpilogue(session)}
          onRestart={() => setSession(startSession())}
        />
      );
  }
}
