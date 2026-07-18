"use client";

import { useState } from "react";
import {
  startSession,
  beginSetup,
  enterWorldEvent,
  beginWeek,
  completeSetup,
  completeReceiving,
  advanceDay,
  isLastDay,
  beginEmergency,
  completeWeek,
  nextWeek,
  endGame,
  survivedEmergency,
  cumulativeNetBillions,
  buildEpilogue,
  type SessionState,
} from "@/game/session";
import { decide } from "@/game/receiving";
import Landing from "./Landing";
import WorldEventCard from "./WorldEventCard";
import SetupWizard from "./SetupWizard";
import ReceivingPhase from "./ReceivingPhase";
import DayEnd from "./DayEnd";
import Interstitial from "./Interstitial";
import InHouseEmergency from "./InHouseEmergency";
import TransferRound from "./TransferRound";
import WeekSummary from "./WeekSummary";
import Epilogue from "./Epilogue";

export default function SessionClient() {
  const [session, setSession] = useState<SessionState>(startSession);

  switch (session.phase) {
    case "LANDING":
      return <Landing onStart={() => setSession(enterWorldEvent(session))} />;
    case "WORLD_EVENT":
      // 1주차는 개원(beginSetup), 2주차 이후는 이미 병원이 있어 위저드를 건너뛴다(beginWeek).
      return (
        <WorldEventCard
          event={session.event!}
          week={session.week}
          ctaLabel={session.hospital ? "이번 주 진료로" : "병원 설립으로"}
          onContinue={() => setSession(session.hospital ? beginWeek(session) : beginSetup(session))}
        />
      );
    case "SETUP":
      return (
        <SetupWizard
          departments={session.world?.departments}
          onComplete={(choices) => setSession(completeSetup(choices, session.world))}
        />
      );
    case "RECEIVING":
      return (
        <ReceivingPhase
          receiving={session.receiving!}
          day={session.day}
          news={session.morningNews}
          onDecide={(accept, withWorkup) =>
            setSession((s) => ({ ...s, receiving: decide(s.receiving!, accept, withWorkup) }))
          }
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
        return <InHouseEmergency onContinue={() => setSession(completeWeek(session))} />;
      }
      return (
        <TransferRound
          game={em.game}
          onFinish={(final) =>
            setSession((s) => completeWeek({ ...s, emergency: { mode: "TRANSFER", game: final } }))
          }
        />
      );
    }
    case "WEEK_SUMMARY":
      return (
        <WeekSummary
          week={session.week}
          weekNetBillions={session.ledgerDays.reduce((n, d) => n + d.netProfitBillions, 0)}
          cumulativeNetBillions={cumulativeNetBillions(session)}
          survived={survivedEmergency(session.emergency!)}
          onNextWeek={() => setSession(nextWeek(session))}
          onEnd={() => setSession(endGame(session))}
        />
      );
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
