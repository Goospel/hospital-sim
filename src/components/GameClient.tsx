"use client";

import { useEffect, useMemo, useState } from "react";
import { adjudicateTransfer } from "@/game/adjudicate";
import { buildDebrief } from "@/game/debrief";
import { fallbackLine, persuasionReply } from "@/game/dialogue";
import { formatClock, REJECTION_LABEL, SPECIALTY_LABEL } from "@/game/labels";
import { attemptTransfer, startGame, tickTime, type GameState } from "@/game/round";
import { createStemiScenario } from "@/game/scenarios";
import type { TransferVerdict } from "@/game/types";

// 전원 콜/매달리기 한 번이 잡아먹는 골든타임(초) — 실시간 소모에 더해 콜 자체의 비용.
const CALL_COST_SECONDS = 12;
const LOW_TIME_THRESHOLD = 30;

function newGame(): GameState {
  const s = createStemiScenario();
  return startGame(s.patient, s.hospitals, s.goldenSeconds);
}

export default function GameClient() {
  const [state, setState] = useState<GameState>(newGame);
  const [started, setStarted] = useState(false);
  const [pleaText, setPleaText] = useState("");
  const [lastPlea, setLastPlea] = useState<string | null>(null);
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
  const countByHospital = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of state.attempts) m.set(a.hospitalId, (m.get(a.hospitalId) ?? 0) + 1);
    return m;
  }, [state.attempts]);
  const lastVerdictByHospital = useMemo(() => {
    const m = new Map<string, TransferVerdict>();
    for (const a of state.attempts) m.set(a.hospitalId, a.verdict);
    return m;
  }, [state.attempts]);

  const { patient, timer, status } = state;
  // 결말이면 로그에서 구조 변수를 결정론적으로 산출(디브리핑).
  const debrief = useMemo(
    () => (status === "ACCEPTED" || status === "DIED" ? buildDebrief(state) : null),
    [status, state],
  );
  const lowTime = timer.remainingSeconds <= LOW_TIME_THRESHOLD;
  const alarming = started && status === "IN_PROGRESS" && lowTime;

  function handleCall(hospitalId: string) {
    if (status !== "IN_PROGRESS") return;
    const hospital = state.hospitals.find((h) => h.id === hospitalId);
    if (!hospital) return;
    const priorCount = countByHospital.get(hospitalId) ?? 0;
    // 담당자 대사는 확정된 판정을 "연기"할 뿐 — 몇 번을 매달려도 판정은 코드가 정한다.
    const verdict = adjudicateTransfer(hospital, patient);
    const line = verdict.accepted
      ? fallbackLine(verdict, priorCount)
      : persuasionReply(verdict, priorCount);
    setLastPlea(pleaText.trim() || null);
    setLastLine(line);
    setPleaText("");
    setState((prev) =>
      prev.status === "IN_PROGRESS" ? attemptTransfer(prev, hospitalId, CALL_COST_SECONDS) : prev,
    );
  }

  function handleRestart() {
    setState(newGame());
    setStarted(false);
    setPleaText("");
    setLastPlea(null);
    setLastLine(null);
  }

  return (
    <main
      className={`mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 transition-shadow duration-500 ${
        alarming
          ? "bg-zinc-950 shadow-[inset_0_0_120px_rgba(153,27,27,0.4)]"
          : "bg-zinc-950"
      }`}
    >
      {/* 골든타임 */}
      <header className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">골든타임</span>
        <span
          className={`font-mono text-4xl font-bold tabular-nums ${
            lowTime ? "animate-pulse text-red-500" : "text-zinc-100"
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
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setStarted(true)}
            className="rounded-lg bg-red-600 py-3 text-base font-semibold text-white transition-colors hover:bg-red-500"
          >
            전원 시작 — 받아줄 병원을 찾아라
          </button>
          <p className="text-xs leading-5 text-zinc-600">
            ※ 게임 속 180초는 실제 골든타임(급성심근경색 전원 시 첫 의료진 접촉 후 120분 이내
            재관류 권고)을 극적으로 압축한 연출입니다.
          </p>
        </div>
      ) : status === "IN_PROGRESS" ? (
        <>
          {/* 통화 내용 */}
          <div className="min-h-[4.5rem] rounded-lg border border-zinc-800 bg-black/40 p-4 text-sm leading-6">
            {lastPlea && <p className="text-zinc-400">🗣️ 나: “{lastPlea}”</p>}
            {lastLine ? (
              <p className={lastPlea ? "mt-1 text-zinc-200" : "text-zinc-200"}>📞 담당자: “{lastLine}”</p>
            ) : (
              !lastPlea && <span className="text-zinc-600">병원에 전화를 돌려 전원을 요청하세요.</span>
            )}
          </div>

          {/* 자유 텍스트 설득 */}
          <div className="flex flex-col gap-1">
            <input
              value={pleaText}
              onChange={(e) => setPleaText(e.target.value)}
              placeholder="제발요, 지금 안 보내면 환자가 죽습니다…"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <p className="text-xs text-zinc-600">하고 싶은 말을 적고, 아래 병원을 눌러 전하세요.</p>
          </div>

          {/* 병원 리스트 (거절해도 다시 매달릴 수 있다) */}
          <section className="flex flex-col gap-2">
            {state.hospitals.map((h) => {
              const count = countByHospital.get(h.id) ?? 0;
              const last = lastVerdictByHospital.get(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() => handleCall(h.id)}
                  className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-left transition-colors hover:border-red-500/60 hover:bg-zinc-800"
                >
                  <span className="font-medium">
                    {h.name}
                    {last && !last.accepted && last.reason && (
                      <span className="ml-2 rounded bg-red-950/60 px-1.5 py-0.5 text-xs text-red-400">
                        {REJECTION_LABEL[last.reason]}
                        {count > 1 && ` ×${count}`}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {count === 0 ? "전원 콜" : "다시 매달리기"}
                  </span>
                </button>
              );
            })}
          </section>

          {/* 거절 로그 */}
          {state.attempts.length > 0 && (
            <section className="text-xs text-zinc-500">
              <p className="mb-1 uppercase tracking-widest">전원 시도 {state.attempts.length}회</p>
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
        /* 결말 — 차가운 사실 영수증(해석 없음) */
        <section className="flex flex-1 flex-col items-center gap-4 py-2 text-center">
          {status === "ACCEPTED" ? (
            <>
              <p className="text-2xl font-bold text-emerald-400">환자를 살렸습니다</p>
              <p className="text-sm text-zinc-400">
                {nameById.get(state.acceptedHospitalId ?? "")}이(가) 전원을 수용했습니다.
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-red-500">골든타임을 놓쳤습니다</p>
          )}

          {debrief && (
            <div className="w-full max-w-sm">
              <p className="mb-3 text-center text-xs uppercase tracking-[0.3em] text-zinc-600">
                전원 기록
              </p>
              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-black/40 px-5 py-4 font-mono text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-zinc-400">전원 시도</span>
                  <span className="tabular-nums text-zinc-100">{debrief.transferAttempts}통</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-zinc-400">거절</span>
                  <span className="tabular-nums text-zinc-100">{debrief.rejectionCount}회</span>
                </div>
                {debrief.rejectionBreakdown.length > 0 && (
                  <div className="flex flex-col gap-1 pl-3 text-xs text-zinc-500">
                    {debrief.rejectionBreakdown.map((r, i) => (
                      <div key={r.reason} className="flex items-baseline justify-between">
                        <span>
                          {i === debrief.rejectionBreakdown.length - 1 ? "└" : "├"}{" "}
                          {REJECTION_LABEL[r.reason]}
                        </span>
                        <span className="tabular-nums">×{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="my-1 border-t border-zinc-800/80" />
                <div className="flex items-baseline justify-between">
                  <span className="text-zinc-400">받을 수 있던 곳</span>
                  <span className="tabular-nums text-zinc-100">
                    {debrief.acceptableCount} / {debrief.hospitalCount}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-zinc-400">골든타임</span>
                  <span className="tabular-nums text-zinc-100">
                    {formatClock(debrief.secondsSpent)} / {formatClock(debrief.goldenSeconds)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleRestart}
            className="mt-2 rounded-lg border border-zinc-700 px-5 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            다시 한 판
          </button>
          <p className="mt-4 max-w-md text-xs leading-5 text-zinc-600">
            등장하는 병원·인물·사건은 모두 허구이며, 특정 개인·집단을 비난하지 않습니다.
          </p>
        </section>
      )}
    </main>
  );
}
