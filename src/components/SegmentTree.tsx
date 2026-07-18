import type { LedgerSegment } from "@/game/ledger";
import { formatSignedBillions } from "@/game/labels";

/**
 * "부문 손익" 트리(├/└) — LedgerPanel(결말 장부)과 ReceivingPhase의 CheerfulLedger(명랑 장부)가
 * 완전히 동일한 구조로 중복 렌더하던 것을 공유 추출(Task 7 롤업 DRY). 순수 표현만 — 판정 없음.
 */
export default function SegmentTree({ segments }: { segments: LedgerSegment[] }) {
  return (
    <>
      <p className="text-xs uppercase tracking-widest text-ink-2">부문 손익</p>
      {segments.map((s, i) => (
        <div key={s.label} className="flex items-baseline justify-between pl-3 text-xs text-ink-2">
          <span>
            {i === segments.length - 1 ? "└" : "├"} {s.label}
          </span>
          <span
            className={`font-mono tabular-nums ${s.profitBillions < 0 ? "text-stamp-ink" : "text-ink"}`}
          >
            {formatSignedBillions(s.profitBillions)}
          </span>
        </div>
      ))}
    </>
  );
}
