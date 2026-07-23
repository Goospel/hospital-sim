import type { LedgerSegment } from "@/game/ledger";
import { formatSignedManwon } from "@/game/labels";

/**
 * "부문 손익" 트리(├/└) — LedgerPanel(결말 장부)과 ReceivingPhase의 CheerfulLedger(명랑 장부)가
 * 완전히 동일한 구조로 중복 렌더하던 것을 공유 추출(Task 7 롤업 DRY). 순수 표현만 — 판정 없음.
 *
 * ⚠️ **잉크는 종이 위에서만 읽힌다.** 이 컴포넌트는 종이 팔레트(ink/go/stamp-ink)를 쓰므로
 * **두 부모가 모두 `.paper-card`여야 한다.** 디자인 Plan A에서 이 파일만 먼저 종이화했다가
 * 부모(어두운 패널)가 zinc라 dark-on-dark가 돼 최종 리뷰에서 되돌린 적이 있다 — 그래서
 * 이 셋(SegmentTree · CheerfulLedger · LedgerPanel)은 **한 단위로만** 움직인다.
 */
export default function SegmentTree({ segments }: { segments: LedgerSegment[] }) {
  return (
    <>
      <p className="font-sans text-xs font-medium uppercase tracking-widest text-ink-2">부문 손익</p>
      {segments.map((s, i) => (
        <div key={s.label} className="flex items-baseline justify-between pl-3 text-xs text-ink-2">
          {/* 트리 글리프는 ink-2로 본문과 같은 잉크다 — ink-3은 소형에서 대비 미달이라 스펙이 금지한다(§2-B). */}
          <span>
            {i === segments.length - 1 ? "└" : "├"} {s.label}
          </span>
          <span
            className={`tabular-nums ${s.profitManwon < 0 ? "text-stamp-ink" : "text-go"}`}
          >
            {formatSignedManwon(s.profitManwon)}
          </span>
        </div>
      ))}
    </>
  );
}
