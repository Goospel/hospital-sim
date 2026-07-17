"use client";

import { DAY_LABELS } from "@/game/receiving";
import { formatSignedBillions } from "@/game/labels";
import { DAYS_PER_WEEK } from "@/game/setup";
import type { DayRecord } from "@/game/session";

/**
 * 하루 마감 달력 — 한 주(7일)가 한 칸씩 채워진다.
 *
 * 해석 0 원칙(메모 game-show-dont-tell): 숫자와 색만 놓는다. "흑자라 좋다"거나 "환자를 돌려보냈다"는
 * 말은 어디에도 없다. 일곱 칸이 다 차면 그 달력 자체가 플레이어의 초상이 된다 —
 * 미용으로 자리를 채운 사람의 달력은 일곱 칸 전부 초록이고, 받은 사람의 달력만 붉다.
 * 돌려보낸 환자는 달력에 찍히지 않는다는 것도 말하지 않는다. 보면 안다.
 */
export default function DayEnd({
  days,
  currentDay,
  isLast,
  onContinue,
}: {
  days: DayRecord[];
  currentDay: number;
  isLast: boolean;
  onContinue: () => void;
}) {
  const today = days.find((d) => d.day === currentDay);
  const weekTotal = days.reduce((n, d) => n + d.netProfitBillions, 0);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-5 py-8 text-zinc-100 bg-zinc-950">
      <header className="flex flex-col items-center gap-1 text-center">
        <span className="text-xs uppercase tracking-[0.3em] text-zinc-600">
          {DAY_LABELS[currentDay - 1]}요일 마감
        </span>
        <p className="text-3xl font-semibold">
          <span
            className={`font-mono tabular-nums ${
              (today?.netProfitBillions ?? 0) < 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {formatSignedBillions(today?.netProfitBillions ?? 0)}
          </span>
        </p>
      </header>

      {/* 달력 — 지난 날은 숫자, 오늘은 테두리, 아직 안 온 날은 빈칸. */}
      <section aria-label="이번 주 장부" className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
          const day = i + 1;
          const rec = days.find((d) => d.day === day);
          const isToday = day === currentDay;
          const tone = !rec
            ? "border-zinc-900 bg-white/[0.02] text-zinc-700"
            : rec.netProfitBillions < 0
              ? "border-red-900/50 bg-red-950/40 text-red-300"
              : "border-emerald-900/50 bg-emerald-950/40 text-emerald-300";
          return (
            <div
              key={day}
              className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2.5 transition-colors ${tone} ${
                isToday ? "ring-1 ring-zinc-500" : ""
              }`}
            >
              <span className="text-[10px] tracking-wide text-zinc-500">{DAY_LABELS[i]}</span>
              <span className="font-mono text-xs font-semibold tabular-nums">
                {rec ? formatSignedBillions(rec.netProfitBillions).replace("억", "") : "·"}
              </span>
            </div>
          );
        })}
      </section>

      <div className="flex items-baseline justify-between border-t border-zinc-800 pt-3 font-mono text-sm">
        <span className="font-sans text-zinc-400">이번 주 누계</span>
        <span
          className={`tabular-nums font-semibold ${weekTotal < 0 ? "text-red-400" : "text-emerald-400"}`}
        >
          {formatSignedBillions(weekTotal)}
        </span>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-zinc-100 py-3 text-base font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        {isLast ? "계속" : `${DAY_LABELS[currentDay]}요일로`}
      </button>
    </main>
  );
}
