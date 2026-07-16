"use client";

import { useEffect, useMemo, useState } from "react";
import { adjudicateTransfer } from "@/game/adjudicate";
import { fallbackLine, persuasionReply } from "@/game/dialogue";
import { REJECTION_LABEL } from "@/game/labels";
import { attemptTransfer, tickTime, type GameState } from "@/game/round";
import type { TransferVerdict } from "@/game/types";
import EmergencyChrome from "./EmergencyChrome";

// 전원 콜/매달리기 한 번이 잡아먹는 골든타임(초) — 실시간 소모에 더해 콜 자체의 비용.
const CALL_COST_SECONDS = 12;
// 헤더가 붉게 경고하기 시작하는 잔여 시간(초).
export const LOW_TIME_THRESHOLD = 30;

/**
 * 전원 라운드(IN_PROGRESS) 상호작용 전체를 캡슐화한다 — 골든타임 헤더·환자 카드·통화 내용·
 * 설득 입력·병원 리스트·거절 로그. 시작 게이트·재시작·결말 렌더는 부모(SessionClient)
 * 책임이다. 내부 상태는 `game` prop을 초기값으로만 쓰고, 이후엔 자체 실시간 타이머로 독립 진행하다가
 * 종료(ACCEPTED/DIED) 시 최종 상태를 `onFinish`로 1회 보고한다.
 */
export default function TransferRound({
  game,
  onFinish,
}: {
  game: GameState;
  onFinish: (finalGame: GameState) => void;
}) {
  const [state, setState] = useState<GameState>(() => game);
  const [pleaText, setPleaText] = useState("");
  const [lastPlea, setLastPlea] = useState<string | null>(null);
  const [lastLine, setLastLine] = useState<string | null>(null);

  // 실시간 골든타임: 진행중일 때만 1초씩 소모.
  useEffect(() => {
    if (state.status !== "IN_PROGRESS") return;
    const id = setInterval(() => setState((prev) => tickTime(prev, 1)), 1000);
    return () => clearInterval(id);
  }, [state.status]);

  // 종료되면(ACCEPTED/DIED) 그 전이가 반영된 최종 상태를 부모에게 1회 보고한다.
  useEffect(() => {
    if (state.status === "ACCEPTED" || state.status === "DIED") onFinish(state);
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const lowTime = timer.remainingSeconds <= LOW_TIME_THRESHOLD;
  const alarming = status === "IN_PROGRESS" && lowTime;

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

  return (
    <main
      className={`mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 transition-shadow duration-500 ${
        alarming
          ? "bg-zinc-950 shadow-[inset_0_0_120px_rgba(153,27,27,0.4)]"
          : "bg-zinc-950"
      }`}
    >
      <EmergencyChrome
        patient={patient}
        remainingSeconds={timer.remainingSeconds}
        lowTime={lowTime}
      />

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
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
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
              className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-left transition-colors hover:border-red-500/60 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
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
    </main>
  );
}
