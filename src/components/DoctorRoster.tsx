"use client";

import { doctorCaseloads } from "@/game/doctor";
import { DEPARTMENTS } from "@/game/setup";
import type { ReceivingState } from "@/game/receiving";
import type { Doctor, DeptKey } from "@/game/types";

const deptMeta = (k: DeptKey) => DEPARTMENTS.find((d) => d.key === k)!;

/** 피로 막대 — 저=녹/중=황/고=적. 해석 카피 없음(막대만). */
function FatigueBar({ value }: { value: number }) {
  const color = value >= 67 ? "bg-red-500" : value >= 34 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

/**
 * 의사 명단 스트립 — 각 유닛의 오늘 담당 수(실시간) + 피로 막대(하루 단위 스텝).
 * 해석 0(메모 game-show-dont-tell): 미용 의사의 담당 0과 순환기 의사의 레드존이 나란히 있을 뿐,
 * "과부하"라고 쓰지 않는다. 플레이어가 대조를 스스로 읽는다.
 */
export default function DoctorRoster({
  roster,
  receiving,
  fatigue,
}: {
  roster: Doctor[];
  receiving: ReceivingState;
  fatigue: Record<string, number>;
}) {
  if (roster.length === 0) return null;
  const { total } = doctorCaseloads(roster, receiving);
  // 필수과 먼저(붕괴가 보이는 쪽) → 수익과, 같은 과는 DEPARTMENTS 순.
  const ordered = [...roster].sort((a, b) => {
    const ma = deptMeta(a.dept), mb = deptMeta(b.dept);
    if (ma.essential !== mb.essential) return ma.essential ? -1 : 1;
    return DEPARTMENTS.indexOf(ma) - DEPARTMENTS.indexOf(mb);
  });

  return (
    <section className="rounded-lg border border-zinc-800 bg-black/30 px-4 py-3">
      <p className="mb-2.5 text-[10px] uppercase tracking-[0.3em] text-zinc-600">의료진</p>
      <ul className="flex flex-col gap-2.5">
        {ordered.map((doc) => {
          const busy = (receiving.busyUntil[doc.id] ?? 0) > receiving.clockMin;
          return (
            <li key={doc.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${busy ? "bg-amber-500" : "bg-emerald-500"}`}
                    aria-hidden
                  />
                  {doc.name} <span className="text-zinc-600">· {deptMeta(doc.dept).label}</span>
                  <span className={busy ? "text-amber-400" : "text-zinc-600"}>
                    {busy ? "진료 중" : "자유"}
                  </span>
                </span>
                <span className="tabular-nums text-zinc-500">담당 {total.get(doc.id) ?? 0}명</span>
              </div>
              <FatigueBar value={fatigue[doc.id] ?? 0} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
