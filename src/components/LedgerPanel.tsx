import type { Ledger } from "@/game/ledger";
import { SPECIALTY_LABEL } from "@/game/labels";

// 결말 "올해 장부" 블록 — 장부 주체 병원의 부문 손익·신규 채용. GameClient에서 그대로 이관.
export default function LedgerPanel({ ledger }: { ledger: Ledger }) {
  return (
    <div className="w-full max-w-sm">
      <p className="mb-3 text-center text-xs uppercase tracking-[0.3em] text-zinc-600">
        {ledger.hospitalName} · 올해 장부
      </p>
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-black/40 px-5 py-4 font-mono text-sm">
        <p className="text-xs uppercase tracking-widest text-zinc-600">부문 손익</p>
        {ledger.segments.map((s, i) => (
          <div
            key={s.label}
            className="flex items-baseline justify-between pl-3 text-xs text-zinc-500"
          >
            <span>
              {i === ledger.segments.length - 1 ? "└" : "├"} {s.label}
            </span>
            <span
              className={`tabular-nums ${s.profitBillions < 0 ? "text-red-400" : "text-zinc-300"}`}
            >
              {s.profitBillions < 0 ? "−" : "+"}
              {Math.abs(s.profitBillions)}억
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between">
          <span className="text-zinc-400">순이익</span>
          <span className="tabular-nums text-zinc-100">+{ledger.netProfitBillions}억</span>
        </div>
        <div className="my-1 border-t border-zinc-800/80" />
        <div className="flex items-baseline justify-between">
          <span className="text-zinc-400">신규 의사 채용</span>
          <span className="tabular-nums text-zinc-100">{ledger.totalHires}명</span>
        </div>
        <div className="flex flex-col gap-1 pl-3 text-xs text-zinc-500">
          {ledger.hires.map((h) => (
            <div key={h.label} className="flex items-baseline justify-between">
              <span>├ {h.label}</span>
              <span className="tabular-nums">{h.count}명</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between">
            <span>└ {SPECIALTY_LABEL[ledger.essentialSpecialty]}</span>
            <span className="tabular-nums text-zinc-300">{ledger.essentialHires}명</span>
          </div>
        </div>
      </div>
    </div>
  );
}
