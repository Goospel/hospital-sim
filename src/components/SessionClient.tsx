"use client";

import { useState } from "react";
import {
  startSession,
  beginSetup,
  enterWorldEvent,
  enterGrowth,
  applyGrowth,
  beginWeek,
  completeSetup,
  completeReceiving,
  advanceDay,
  isLastDay,
  completeWeek,
  nextWeek,
  endGame,
  weekTurnedAwayCount,
  weekReceivedEmergencyCount,
  cumulativeNetManwon,
  buildEpilogue,
  type SessionState,
} from "@/game/session";
import { decide, type DecisionAction } from "@/game/receiving";
import { deptLedgerLines } from "@/game/deptLedger";
import Landing from "./Landing";
import WorldEventCard from "./WorldEventCard";
import SetupWizard from "./SetupWizard";
import ReceivingPhase from "./ReceivingPhase";
import DayEnd from "./DayEnd";
import WeekSummary from "./WeekSummary";
import Epilogue from "./Epilogue";
import GrowthPhase from "./GrowthPhase";

export default function SessionClient() {
  const [session, setSession] = useState<SessionState>(startSession);

  switch (session.phase) {
    case "LANDING":
      return <Landing onStart={() => setSession(enterWorldEvent(session))} />;
    case "WORLD_EVENT":
      // 1주차는 개원(beginSetup), 2주차 이후는 이미 병원이 있어 위저드를 건너뛰고 재투자(GROWTH)로 간다.
      return (
        <WorldEventCard
          event={session.event!}
          week={session.week}
          ctaLabel={session.hospital ? "이번 주 재투자로" : "병원 설립으로"}
          onContinue={() => setSession(session.hospital ? enterGrowth(session) : beginSetup(session))}
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
          fatigue={session.fatigue}
          onDecide={(action: DecisionAction) =>
            setSession((s) => ({ ...s, receiving: decide(s.receiving!, action) }))
          }
          onContinue={() => setSession(completeReceiving(session))}
        />
      );
    case "DAY_END": {
      // 7일차 마감은 다음 날이 아니라 곧바로 주간 결산으로 간다(completeWeek).
      // 과별 손익은 **오늘 한 날**만 쪼갠다(deptLedgerLines에 [today] 하나만 넘긴다).
      const today = session.ledgerDays.find((d) => d.day === session.day);
      const dayLines =
        today && session.hospital
          ? deptLedgerLines([today], session.hospital, session.world?.departments)
          : [];
      return (
        <DayEnd
          days={session.ledgerDays}
          currentDay={session.day}
          isLast={isLastDay(session)}
          lines={dayLines}
          onContinue={() =>
            setSession(isLastDay(session) ? completeWeek(session) : advanceDay(session))
          }
        />
      );
    }
    case "WEEK_SUMMARY": {
      // 이번 주 7일 합산 과별 손익 — 재투자(다음 주) 결정 직전에 어느 과가 부담인지 보인다.
      const weekLines = session.hospital
        ? deptLedgerLines(session.ledgerDays, session.hospital, session.world?.departments)
        : [];
      return (
        <WeekSummary
          week={session.week}
          weekNetManwon={session.ledgerDays.reduce((n, d) => n + d.netProfitManwon, 0)}
          cumulativeNetManwon={cumulativeNetManwon(session)}
          received={weekReceivedEmergencyCount(session)}
          turnedAway={weekTurnedAwayCount(session)}
          treasury={session.treasury}
          insolvencyStreak={session.insolvencyStreak}
          lines={weekLines}
          onNextWeek={() => setSession(nextWeek(session))}
          onEnd={() => setSession(endGame(session))}
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
    case "GROWTH":
      return (
        <GrowthPhase
          state={session}
          onComplete={(choices, beds) => setSession(beginWeek(applyGrowth(session, choices, beds)))}
        />
      );
    default: {
      const _exhaustive: never = session.phase;
      return _exhaustive;
    }
  }
}
