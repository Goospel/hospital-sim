"use client";

import { doctorCaseloads } from "@/game/doctor";
import { DEPARTMENTS } from "@/game/setup";
import { compareDeptKeys } from "@/game/hospitalMap";
import type { ReceivingState } from "@/game/receiving";
import type { Doctor, DeptKey } from "@/game/types";

const deptMeta = (k: DeptKey) => DEPARTMENTS.find((d) => d.key === k)!;

/**
 * 피로 막대 — 저=회백/중=황/고=적. 해석 카피 없음(막대만).
 *
 * 어두운 책상 위 붉은색은 `--alarm` 하나뿐이다(스펙 §2-C) — 종이 위 적자(stamp-ink)와
 * 섞지 않는다. 색은 강조일 뿐이라 **길이**가 판정을 나른다(흑백에서도 읽힌다).
 */
function FatigueBar({ value }: { value: number }) {
  // 흐릿함 → 밝음 → 붉음. 흑백으로 찍어도 밝기 단계가 남는 3단이라 색이 사라져도 읽힌다.
  const color = value >= 67 ? "bg-alarm" : value >= 34 ? "bg-on-desk" : "bg-on-desk-muted";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-desk">
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
  atMin,
}: {
  roster: Doctor[];
  receiving: ReceivingState;
  fatigue: Record<string, number>;
  // 진료 중 점 계산용 현재 시각 — receiving.clockMin(직전 콜 시각)이 아니라 맵과 같은
  // atMin을 써야 한다. clockMin을 쓰면 직전 콜 담당의는 다음 콜 내내 진료 중으로 굳는다.
  atMin: number;
}) {
  if (roster.length === 0) return null;
  const { total } = doctorCaseloads(roster, receiving);
  // 필수과 먼저(붕괴가 보이는 쪽) → 수익과. 맵의 방 순서와 같은 비교자를 공유한다(단일 출처).
  const ordered = [...roster].sort((a, b) => compareDeptKeys(a.dept, b.dept));

  return (
    <section className="rounded-xs border border-frame bg-desk-2 px-4 py-3">
      <p className="mb-2.5 text-xs font-medium uppercase tracking-[0.3em] text-on-desk/60">의료진</p>
      <ul className="flex flex-col gap-2.5">
        {ordered.map((doc) => {
          const busy = (receiving.busyUntil[doc.id] ?? 0) > atMin;
          return (
            <li key={doc.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-on-desk">
                  {/* 점은 장식이다 — 상태는 바로 옆 「진료 중/자유」 글자가 나른다(색 단독 금지). */}
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${busy ? "bg-on-desk" : "bg-frame"}`}
                    aria-hidden
                  />
                  {doc.name} <span className="text-on-desk/70">· {deptMeta(doc.dept).label}</span>
                  <span className={busy ? "text-on-desk" : "text-on-desk/70"}>
                    {busy ? "진료 중" : "자유"}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-on-desk/70">
                  담당 {total.get(doc.id) ?? 0}명
                </span>
              </div>
              <FatigueBar value={fatigue[doc.id] ?? 0} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
