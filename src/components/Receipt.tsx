import type { Debrief } from "@/game/debrief";
import { formatClock, REJECTION_LABEL } from "@/game/labels";

// 결말 "전원 기록" 블록 — 차가운 사실 영수증(해석 없음).
export default function Receipt({ debrief }: { debrief: Debrief }) {
  return (
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
  );
}
