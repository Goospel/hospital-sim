import { formatClock, SPECIALTY_LABEL } from "@/game/labels";
import type { Patient } from "@/game/types";

/**
 * 응급 화면 공통 chrome — 골든타임 헤더 + 환자 카드.
 * 시작 전·진행 중·결말 어느 화면에서도 같은 헤더/카드가 보이므로 단일 컴포넌트로 공유한다.
 * 타이머 값·pulse 임계(lowTime)는 부모가 계산해 넘긴다 — 진행 중엔 TransferRound가 실시간 상태로,
 * 시작/결말엔 GameClient가 정지 상태로 각각 소유하되, 렌더는 이 한 곳으로 통일한다.
 */
export default function EmergencyChrome({
  patient,
  remainingSeconds,
  lowTime,
}: {
  patient: Patient;
  remainingSeconds: number;
  lowTime: boolean;
}) {
  return (
    <>
      {/* 골든타임 */}
      <header className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">골든타임</span>
        <span
          className={`font-mono text-4xl font-bold tabular-nums ${
            lowTime ? "animate-pulse text-red-500" : "text-zinc-100"
          }`}
        >
          {formatClock(remainingSeconds)}
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
    </>
  );
}
