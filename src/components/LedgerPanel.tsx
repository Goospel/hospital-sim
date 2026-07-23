import type { Ledger } from "@/game/ledger";
import { formatSignedManwon, SPECIALTY_LABEL } from "@/game/labels";
import SegmentTree from "./SegmentTree";

/**
 * 결말 "이번 주 장부" 블록 — 장부 주체 병원의 부문 손익·신규 채용.
 *
 * 종이다. 결말은 물성의 정점이고(디자인 스펙 §6), **적자가 처음 붉은 잉크로 실현되는 자리**가
 * 여기다 — 1막 내내 명랑하던 숫자가 같은 종이 위에서 stamp-ink로 뒤집힌다.
 * SegmentTree와 한 단위로 움직인다(그 파일 주석 참조).
 */
export default function LedgerPanel({ ledger }: { ledger: Ledger }) {
  return (
    <div className="w-full max-w-sm">
      <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.3em] text-on-desk/60">
        {ledger.hospitalName} · 이번 주 장부
      </p>
      <div className="paper-card flex flex-col gap-2 px-5 py-4 font-mono text-sm">
        <SegmentTree segments={ledger.segments} />
        <div className="flex items-baseline justify-between border-t border-rule pt-2">
          <span className="font-sans text-xs font-semibold text-ink">순이익</span>
          <span
            className={`text-base tabular-nums font-semibold ${ledger.netProfitManwon < 0 ? "text-stamp-ink" : "text-go"}`}
          >
            {formatSignedManwon(ledger.netProfitManwon)}
          </span>
        </div>
        <div className="my-1 border-t border-rule" />
        <div className="flex items-baseline justify-between">
          <span className="font-sans text-xs text-ink-2">신규 의사 채용</span>
          <span className="tabular-nums text-ink">{ledger.totalHires}명</span>
        </div>
        <div className="flex flex-col gap-1 pl-3 text-xs text-ink-2">
          {ledger.hires.map((h) => (
            <div key={h.label} className="flex items-baseline justify-between">
              <span>├ {h.label}</span>
              <span className="tabular-nums">{h.count}명</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between">
            <span>└ {SPECIALTY_LABEL[ledger.essentialSpecialty]}</span>
            <span className="tabular-nums text-ink">{ledger.essentialHires}명</span>
          </div>
        </div>
      </div>
    </div>
  );
}
