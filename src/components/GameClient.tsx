"use client";

import { useEffect, useMemo, useState } from "react";
import { adjudicateTransfer } from "@/game/adjudicate";
import { fallbackLine } from "@/game/dialogue";
import { formatClock, REJECTION_LABEL, SPECIALTY_LABEL } from "@/game/labels";
import { attemptTransfer, startGame, tickTime, type GameState } from "@/game/round";
import { createStemiScenario } from "@/game/scenarios";

// 전원 콜 한 번이 잡아먹는 골든타임(초) — 실시간 소모에 더해 콜 자체의 비용.
const CALL_COST_SECONDS = 12;
const LOW_TIME_THRESHOLD = 30;

function newGame(): GameState {
  const s = createStemiScenario();
  return startGame(s.patient, s.hospitals, s.goldenSeconds);
}

export default function GameClient() {
  const [state, setState] = useState<GameState>(newGame);
  const [started, setStarted] = useState(false);
  const [lastLine, setLastLine] = useState<string | null>(null);

  // 실시간 골든타임: 시작 후 진행중일 때만 1초씩 소모.
  useEffect(() => {
    if (!started || state.status !== "IN_PROGRESS") return;
    const id = setInterval(() => setState((prev) => tickTime(prev, 1)), 1000);
    return () => clearInterval(id);
  }, [started, state.status]);

  const nameById = useMemo(
    () => new Map(state.hospitals.map((h) => [h.id, h.name])),
    [state.hospitals],
  );
  const calledIds = useMemo(
    () => new Set(state.attempts.map((a) => a.hospitalId)),
    [state.attempts],
  );

  const { patient, timer, status } = state;
  const lowTime = timer.remainingSeconds <= LOW_TIME_THRESHOLD;

  function handleCall(hospitalId: string) {
    if (status !== "IN_PROGRESS" || calledIds.has(hospitalId)) return;
    const hospital = state.hospitals.find((h) => h.id === hospitalId);
    if (!hospital) return;
    // 담당자 대사는 이미 확정된 판정을 "연기"할 뿐 — 판정은 코드가 정한다.
    const verdict = adjudicateTransfer(hospital, patient);
    setLastLine(fallbackLine(verdict, state.attempts.length));
    setState((prev) =>
      prev.status === "IN_PROGRESS" ? attemptTransfer(prev, hospitalId, CALL_COST_SECONDS) : prev,
    );
  }

  function handleRestart() {
    setState(newGame());
    setStarted(false);
    setLastLine(null);
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-6 bg-zinc-950 px-5 py-8 text-zinc-100">
      {/* 골든타임 */}
      <header className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">골든타임</span>
        <span
          className={`font-mono text-4xl font-bold tabular-nums ${
            lowTime ? "text-red-500" : "text-zinc-100"
          }`}
        >
          {formatClock(timer.remainingSeconds)}
        </span>
      </header>

      {/* 환자 카드 */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-xs uppercase tracking-widest text-red-400">응급 환자 도착</p>
        <h1 className="mt-1 text-lg font-semibold">
          급성 심근경색(STEMI) 의심 · 중증도 {patient.severity}/5
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          필요 진료과: <span className="text-zinc-200">{SPECIALTY_LABEL[patient.requiredSpecialty]}</span> · 즉시 전원 필요
        </p>
      </section>

      {!started ? (
        <button
          onClick={() => setStarted(true)}
          className="rounded-lg bg-red-600 py-3 text-base font-semibold text-white transition-colors hover:bg-red-500"
        >
          전원 시작 — 받아줄 병원을 찾아라
        </button>
      ) : status === "IN_PROGRESS" ? (
        <>
          {/* 담당자 대사 */}
          <div className="min-h-[3.5rem] rounded-lg border border-zinc-800 bg-black/40 p-4 text-sm leading-6 text-zinc-300">
            {lastLine ? (
              <span>📞 “{lastLine}”</span>
            ) : (
              <span className="text-zinc-600">병원에 전화를 돌려 전원을 요청하세요.</span>
            )}
          </div>

          {/* 병원 리스트 */}
          <section className="flex flex-col gap-2">
            {state.hospitals.map((h) => {
              const called = calledIds.has(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() => handleCall(h.id)}
                  disabled={called}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                    called
                      ? "cursor-not-allowed border-zinc-800 bg-zinc-900/40 text-zinc-600"
                      : "border-zinc-700 bg-zinc-900 hover:border-red-500/60 hover:bg-zinc-800"
                  }`}
                >
                  <span className="font-medium">{h.name}</span>
                  <span className="text-xs">{called ? "거절됨" : "전원 콜"}</span>
                </button>
              );
            })}
          </section>

          {/* 거절 로그 */}
          {state.attempts.length > 0 && (
            <section className="mt-1 text-xs text-zinc-500">
              <p className="mb-1 uppercase tracking-widest">전원 시도</p>
              <ul className="flex flex-col gap-1">
                {state.attempts.map((a, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{nameById.get(a.hospitalId)}</span>
                    <span className={a.verdict.accepted ? "text-emerald-400" : "text-red-400"}>
                      {a.verdict.accepted
                        ? "수용"
                        : a.verdict.reason
                          ? REJECTION_LABEL[a.verdict.reason]
                          : "거절"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        /* 결말 */
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          {status === "ACCEPTED" ? (
            <>
              <p className="text-2xl font-bold text-emerald-400">환자를 살렸습니다</p>
              <p className="text-sm text-zinc-400">
                {nameById.get(state.acceptedHospitalId ?? "")}이(가) 전원을 수용했습니다.
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-red-500">골든타임을 놓쳤습니다</p>
              <p className="max-w-sm text-sm text-zinc-400">
                당신의 판단이 틀린 게 아니었다. 받아줄 자리가 없었을 뿐이다.
              </p>
            </>
          )}
          <button
            onClick={handleRestart}
            className="mt-2 rounded-lg border border-zinc-700 px-5 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            다시 한 판
          </button>
        </section>
      )}
    </main>
  );
}
