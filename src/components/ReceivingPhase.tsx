"use client";

import { callerPleaAt, receivingLine } from "@/game/dialogue";
import { formatSignedBillions } from "@/game/labels";
import {
  accruedSegments,
  classifyCall,
  hardlockReason,
  runningNetProfit,
  DAY_LABELS,
  type ReceivingState,
} from "@/game/receiving";
import SegmentTree from "./SegmentTree";

/**
 * 명랑 장부(사이드) — 오늘치 부문 손익 + 라이브 오늘 진료 수익 + 오늘 순이익.
 * lawsuitExposure는 여기서 절대 표시하지 않는다 — 냉정한 소송 비용은 결말(에필로그)에서만 실현된다.
 * 명랑한 숫자만 보이는 게 바로 1막 다크코미디의 논지다.
 */
function CheerfulLedger({ receiving }: { receiving: ReceivingState }) {
  // 부문 손익은 주간 손익의 1/7(오늘 몫)을 하루 진행률만큼 누적 — 콜 0에서 출발, 정적 선반영이 아님.
  const segments = accruedSegments(receiving);
  const netProfit = runningNetProfit(receiving);

  return (
    <section className="rounded-lg border border-zinc-800 bg-black/40 px-5 py-4">
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-zinc-600">
        {receiving.hospital.name} · 오늘 장부
      </p>
      <div className="flex flex-col gap-2 font-mono text-sm">
        <SegmentTree segments={segments} />
        <div className="my-1 border-t border-zinc-800/80" />
        <div className="flex items-baseline justify-between">
          <span className="text-zinc-400">오늘 진료 수익</span>
          <span className="tabular-nums text-emerald-400">
            {formatSignedBillions(receiving.netProfitDeltaBillions)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-zinc-200">오늘 순이익</span>
          <span
            className={`tabular-nums font-semibold ${netProfit > 0 ? "text-emerald-400" : "text-zinc-300"}`}
          >
            {formatSignedBillions(netProfit)}
          </span>
        </div>
      </div>
      {netProfit > 0 && (
        <p className="mt-3 text-center text-xs font-medium text-emerald-400">오늘 흑자 🎉</p>
      )}
    </section>
  );
}

export default function ReceivingPhase({
  receiving,
  day,
  onDecide,
  onContinue,
}: {
  receiving: ReceivingState;
  day: number;
  onDecide: (accept: boolean) => void;
  onContinue: () => void;
}) {
  const dayLabel = `${DAY_LABELS[day - 1]}요일`;
  if (receiving.done) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 bg-zinc-950">
        <header className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{dayLabel} · 전원 콜 접수</span>
          <h1 className="text-lg font-semibold">
            오늘의 콜 {receiving.queue.length}통을 모두 처리했습니다
          </h1>
        </header>

        <div className="flex flex-col gap-1.5">
          {receiving.log.map((entry, i) => {
            const call = receiving.queue[i];
            const label = entry.accepted
              ? "수용"
              : entry.disposition === "HARDLOCK_REJECT"
                ? "하드락"
                : "거절";
            return (
              <div
                key={entry.callId}
                className="flex items-center justify-between rounded-md border border-zinc-800 bg-white/[0.03] px-3 py-2 text-xs"
              >
                <span className="text-zinc-400">{call.label}</span>
                <span className={entry.accepted ? "text-emerald-400" : "text-zinc-600"}>{label}</span>
              </div>
            );
          })}
        </div>

        <CheerfulLedger receiving={receiving} />

        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          계속
        </button>
      </main>
    );
  }

  const call = receiving.queue[receiving.index];
  const reason = hardlockReason(receiving.hospital, call, receiving.bedsFree);
  const disposition = classifyCall(receiving.hospital, call, receiving.bedsFree);
  const plea = callerPleaAt(receiving.queue, receiving.index);

  const prevCall = receiving.index > 0 ? receiving.queue[receiving.index - 1] : undefined;
  const prevLog = receiving.log[receiving.log.length - 1];
  const prevLine =
    prevCall && prevLog
      ? receivingLine(
          prevCall,
          prevLog.disposition,
          prevLog.accepted,
          receiving.index - 1,
          prevLog.reason ?? undefined,
        )
      : undefined;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 bg-zinc-950">
      {/*
        남은 자리 — 이 게임의 유일한 과부하 표시. 숫자만 보여주고 해석하지 않는다:
        콜 5통 > 자리 3이라 매일 2통은 못 받는데, 그걸 말로 하지 않고 숫자가 줄어드는 걸로만 알린다.
      */}
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{dayLabel} · 전원 콜 접수</span>
          <h1 className="text-lg font-semibold">
            콜 {receiving.index + 1} / {receiving.queue.length}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-600">남은 자리</span>
          <span
            className={`font-mono text-lg font-semibold tabular-nums ${
              receiving.bedsFree === 0 ? "text-amber-500" : "text-zinc-200"
            }`}
          >
            {receiving.bedsFree} / {receiving.hospital.beds}
          </span>
        </div>
      </header>

      {prevLine && (
        <p className="text-xs text-zinc-600">
          직전 · {prevCall!.label} → {prevLine}
        </p>
      )}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <section className="flex flex-1 flex-col gap-3 rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-4">
          <p className="text-sm font-medium text-zinc-100">{call.label}</p>
          <p className="text-sm italic text-zinc-400">&ldquo;{plea}&rdquo;</p>

          {disposition === "HARDLOCK_REJECT" && (
            <p className="text-xs text-amber-500">
              {receivingLine(call, "HARDLOCK_REJECT", false, receiving.index, reason ?? undefined)}
            </p>
          )}

          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={() => onDecide(true)}
              disabled={disposition === "HARDLOCK_REJECT"}
              aria-label={`${call.label} 수용`}
              className="flex-1 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              수용
            </button>
            <button
              type="button"
              onClick={() => onDecide(false)}
              aria-label={`${call.label} 거절`}
              className="flex-1 rounded-lg border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              거절
            </button>
          </div>
        </section>

        <div className="w-full sm:w-72 sm:shrink-0">
          <CheerfulLedger receiving={receiving} />
        </div>
      </div>
    </main>
  );
}
