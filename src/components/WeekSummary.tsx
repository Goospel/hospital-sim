"use client";

import { formatSignedBillions } from "@/game/labels";

/**
 * 주간 결산 — 한 주(7일)를 닫고 사용자가 계속할지 끝낼지 고르는 갈림길.
 *
 * 게임이 한 주로 끝나지 않는다는 걸 만드는 화면이다: [다음 주]로 세계가 다시 바뀌며 이어지고,
 * [종료]로 사용자가 끝을 정한다. 해석 0(메모 game-show-dont-tell): 이번 주/누적 숫자와 돌려보낸 응급 수만
 * 놓는다. "누적"이 매주 커지는 걸 보여 주는 게 이 화면의 일 — 세계 변화가 여러 주에 걸쳐 눈에 쌓인다.
 */
export default function WeekSummary({
  week,
  weekNetBillions,
  cumulativeNetBillions,
  turnedAway,
  onNextWeek,
  onEnd,
}: {
  week: number;
  weekNetBillions: number;
  cumulativeNetBillions: number;
  turnedAway: number;
  onNextWeek: () => void;
  onEnd: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-10 text-zinc-100 bg-zinc-950">
      <header className="flex flex-col items-center gap-1 text-center">
        <span className="text-xs uppercase tracking-[0.3em] text-zinc-600">{week}주차 마감</span>
        <p className="text-3xl font-semibold">
          <span
            className={`font-mono tabular-nums ${
              weekNetBillions < 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {formatSignedBillions(weekNetBillions)}
          </span>
        </p>
        <span className={`text-xs uppercase tracking-[0.2em] ${turnedAway > 0 ? "text-red-400" : "text-zinc-500"}`}>
          {turnedAway > 0 ? `응급 · ${turnedAway}명 돌려보냄` : "응급 · 전부 수용"}
        </span>
      </header>

      {/* 누적 — 매주 커지는 '지금까지'. 주가 쌓일수록 세계 변화의 결과가 여기 모인다. */}
      <div className="flex items-baseline justify-between border-t border-zinc-800 pt-3 font-mono text-sm">
        <span className="font-sans text-zinc-400">{week}주 누적 손익</span>
        <span
          className={`tabular-nums font-semibold ${
            cumulativeNetBillions < 0 ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {formatSignedBillions(cumulativeNetBillions)}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onNextWeek}
          className="rounded-lg bg-zinc-100 py-3 text-base font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          다음 주
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="rounded-lg border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
        >
          종료
        </button>
      </div>
    </main>
  );
}
