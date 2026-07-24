import type { DeptLedgerLine } from "@/game/deptLedger";
import { formatSignedManwon } from "@/game/labels";

/**
 * 과별 손익 영수증 — "어느 과가 얼마나 손해를 내는가"를 한 표에 세운다.
 *
 * 하루 마감(DayEnd)과 주간 마감(WeekSummary)이 **같은 컴포넌트·같은 순수 함수**(deptLedgerLines)를
 * 쓴다 — days 배열 길이만 다르다(1 vs 7). 그래서 두 화면의 숫자가 구조적으로 어긋날 수 없다.
 *
 * 해석 카피 없음(메모 game-show-dont-tell): "순환기가 응급 때문에 적자"라고 말하지 않는다.
 * 열 이름과 숫자만 놓으면 플레이어가 스스로 읽는다 — 순환기내과 줄의 「진료」가 음수인데도 환자를
 * 받았다는 것, 미용 줄의 「진료」가 환자 수에 비례해 흑자라는 것.
 *
 * ⚠️ **SegmentTree와 같은 함정**: 종이 잉크(ink/go/stamp-ink)는 `.paper-card` 위에서만 읽힌다.
 * 이 표는 반드시 paper-card 안에서만 쓴다(두 부모가 이미 paper-card). 순익만 색을 지고, 진료·고정비
 * 열은 본문 잉크(ink-2)로 둔다 — 모든 열을 색칠하면 정작 순익 색이 안 선다.
 */
export default function DeptLedgerTable({ lines }: { lines: DeptLedgerLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="font-mono text-xs">
      <p className="mb-2 font-sans text-xs font-medium uppercase tracking-widest text-ink-2">
        과별 손익
      </p>
      {/* 헤더 — 4열 그리드. 첫 열(과·환자수)만 좌측, 금액 3열은 우측 정렬. */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 border-b border-rule pb-1 font-sans text-[10px] uppercase tracking-wide text-ink-2">
        <span>과</span>
        <span className="text-right">진료</span>
        <span className="text-right">고정비</span>
        <span className="text-right">순익</span>
      </div>
      {lines.map((l) => (
        <div
          key={l.key}
          className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-rule/40 py-1.5 last:border-b-0"
        >
          {/* 첫 열은 과명(윗줄) + 환자수(아랫줄, 작게) — 금액이 커지는 모바일에서도 높이가 균일하다. */}
          <span className="flex flex-col leading-tight">
            <span className="text-ink">{l.label}</span>
            <span className="text-[10px] text-ink-2">{l.patients}명</span>
          </span>
          <span className="text-right tabular-nums text-ink-2">{formatSignedManwon(l.revenueManwon)}</span>
          <span className="text-right tabular-nums text-ink-2">{formatSignedManwon(l.fixedManwon)}</span>
          <span
            className={`text-right font-semibold tabular-nums ${l.netManwon < 0 ? "text-stamp-ink" : "text-go"}`}
          >
            {formatSignedManwon(l.netManwon)}
          </span>
        </div>
      ))}
    </div>
  );
}
