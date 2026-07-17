"use client";

import { useState } from "react";
import {
  startSession,
  beginSetup,
  completeSetup,
  completeReceiving,
  advanceDay,
  isLastDay,
  beginEmergency,
  toEpilogue,
  buildEpilogue,
  type SessionState,
} from "@/game/session";
import { decide } from "@/game/receiving";
import Landing from "./Landing";
import SetupWizard from "./SetupWizard";
import ReceivingPhase from "./ReceivingPhase";
import DayEnd from "./DayEnd";
import Interstitial from "./Interstitial";
import InHouseEmergency from "./InHouseEmergency";
import TransferRound from "./TransferRound";
import Epilogue from "./Epilogue";

export default function SessionClient() {
  const [session, setSession] = useState<SessionState>(startSession);

  switch (session.phase) {
    case "LANDING":
      return <Landing onStart={() => setSession(beginSetup(session))} />;
    case "SETUP":
      return <SetupWizard onComplete={(choices) => setSession(completeSetup(choices))} />;
    case "RECEIVING":
      return (
        <ReceivingPhase
          receiving={session.receiving!}
          day={session.day}
          onDecide={(accept) => setSession((s) => ({ ...s, receiving: decide(s.receiving!, accept) }))}
          onContinue={() => setSession(completeReceiving(session))}
        />
      );
    case "DAY_END":
      return (
        <DayEnd
          days={session.ledgerDays}
          currentDay={session.day}
          isLast={isLastDay(session)}
          onContinue={() => setSession(advanceDay(session))}
        />
      );
    case "INTERSTITIAL":
      return (
        <Interstitial
          days={session.ledgerDays}
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
    default: {
      const _exhaustive: never = session.phase;
      return _exhaustive;
    }
  }
}
