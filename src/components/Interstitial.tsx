"use client";

import type { Hospital } from "@/game/types";
import type { ReceivingState } from "@/game/receiving";

/**
 * 막간 — 1막(콜 큐) 종료와 2막(응급) 사이의 시점 전환.
 * 명랑한 분기 마감 숫자로 열었다가, 같은 화면 안에서 톤이 꺾여 냉정한 STEMI 경보로 닫는다.
 * 해석 0 원칙: 숫자는 담담히 보여줄 뿐 — 장부의 소송비용 같은 대가는 결말(에필로그)에서만 실현된다.
 * (붕괴 애니메이션은 Task 7에서 이 컴포넌트 위에 얹는다 — 여기선 정적 콘텐츠 + 톤 전환만.)
 */
export default function Interstitial({
  hospital,
  receiving,
  onContinue,
}: {
  hospital: Hospital;
  receiving: ReceivingState;
  onContinue: () => void;
}) {
  const segments = hospital.economics?.segments ?? [];
  const segmentTotal = segments.reduce((sum, s) => sum + s.profitBillions, 0);
  const net = segmentTotal + receiving.netProfitDeltaBillions;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col items-center justify-center gap-10 px-5 py-8 text-zinc-100 bg-zinc-950">
      {/* 명랑 — 분기 마감 */}
      <section className="flex flex-col items-center gap-2 text-center">
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-600">분기 마감</span>
        <p className="text-2xl font-semibold text-zinc-200">
          순이익{" "}
          <span className="font-mono tabular-nums text-emerald-400">
            {net >= 0 ? "+" : "−"}
            {Math.abs(net)}억
          </span>
        </p>
        {net > 0 && <p className="text-sm font-medium text-emerald-400">이번 분기 흑자 🎉</p>}
      </section>

      <div className="h-px w-24 bg-zinc-800" />

      {/* 톤 꺾임 — 응급 경보(냉정) */}
      <section className="flex flex-col items-center gap-2 text-center">
        <span className="text-xs uppercase tracking-[0.25em] text-red-500/80">응급 경보</span>
        <p className="text-lg text-zinc-300">
          이번엔 <span className="font-semibold text-red-400">당신 응급실로</span> STEMI가 온다.
        </p>
      </section>

      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-zinc-100 px-8 py-3 text-base font-semibold text-zinc-900 transition-colors hover:bg-white"
      >
        계속
      </button>
    </main>
  );
}
