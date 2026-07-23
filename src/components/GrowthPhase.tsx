// src/components/GrowthPhase.tsx
"use client";

import { useState } from "react";
import { adjustDoctors, bedExpansionCost, BED_TIERS, deptCap } from "@/game/setup";
import { canApplyGrowth, growthCostOf, type SessionState } from "@/game/session";
import { poolRemaining } from "@/game/system";
import { formatManwon, formatSignedManwon } from "@/game/labels";
import type { DepartmentSpec, SetupChoices } from "@/game/types";

/**
 * 재투자(GROWTH) — 금고로 병원을 키운다. 개원 위저드와 같은 조작이되 예산=금고, 시작=현재 명단,
 * 증축만(해고 없음). 병상 티어를 올리면 콜 볼륨↑·필수과 상한↑. 배후과는 전국 풀 잔여가 진짜 천장 —
 * 잔여 0이면 돈이 있어도 못 뽑는다. show-don't-tell: 금고·비용·풀 잔여 숫자만.
 */
export default function GrowthPhase({
  state,
  onComplete,
}: {
  state: SessionState;
  onComplete: (choices: SetupChoices, beds: number) => void;
}) {
  const departments = state.world?.departments ?? [];
  const [choices, setChoices] = useState<SetupChoices>(state.choices);
  const [beds, setBeds] = useState<number>(state.beds);

  const cost = growthCostOf(state, choices, beds);
  const ok = canApplyGrowth(state, choices, beds);
  const nextBedTier = BED_TIERS.find((t) => t > beds);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 bg-desk px-5 py-8 text-on-desk">
      <header className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.25em] text-on-desk/60">{state.week}주차 · 재투자</span>
        <h1 className="font-serif text-xl">병원을 키우시겠습니까</h1>
        <p className="text-sm text-on-desk/70">금고 {formatSignedManwon(state.treasury)} 안에서 증축합니다. 그대로 두고 넘어가도 됩니다.</p>
      </header>

      {/* 병상 티어 */}
      <div className="rounded-xs border border-frame bg-desk-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-on-desk">병상 {beds}</span>
            <span className="font-mono text-xs tabular-nums text-on-desk/70">
              {nextBedTier ? `→ ${nextBedTier}병상 증설 ${formatManwon(bedExpansionCost(beds, nextBedTier))} · 환자·필수과 상한↑` : "최대 병상"}
            </span>
          </div>
          <button
            type="button"
            disabled={!nextBedTier}
            onClick={() => nextBedTier && setBeds(nextBedTier)}
            className="rounded-xs border border-frame px-3 py-1.5 text-sm text-on-desk transition-colors hover:bg-frame disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            증설
          </button>
        </div>
      </div>

      {/* 과별 채용 — 배후과는 전국 풀 잔여를 표시 */}
      <div className="flex flex-col gap-2">
        {departments.map((dept: DepartmentSpec) => {
          const count = choices.doctors[dept.key] ?? 0;
          const cap = deptCap(dept, beds);
          const remain = dept.providesBackup ? poolRemaining(state.system, dept.providesBackup) : null;
          const floor = state.choices.doctors[dept.key] ?? 0; // 해고 방지 하한
          const atPool = remain !== null && count - floor >= remain; // 이번 성장에서 뽑을 수 있는 한계
          return (
            <div key={dept.key} className="flex items-center justify-between rounded-xs border border-frame bg-desk-2 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-on-desk">{dept.label}</span>
                <span className="font-mono text-xs tabular-nums text-on-desk/70">
                  채용 {formatManwon(dept.hireCostManwon)}/명{remain !== null ? ` · 전국 잔여 ${remain}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={`${dept.label} 줄이기`} disabled={count <= floor}
                  onClick={() => setChoices((c) => adjustDoctors(c, dept.key, -1, cap))}
                  className="flex h-7 w-7 items-center justify-center rounded-xs border border-frame text-on-desk transition-colors hover:bg-frame disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted">−</button>
                <span className="w-4 text-center font-mono text-sm tabular-nums text-on-desk">{count}</span>
                <button type="button" aria-label={`${dept.label} 늘리기`} disabled={count >= cap || atPool}
                  onClick={() => setChoices((c) => adjustDoctors(c, dept.key, 1, cap))}
                  className="flex h-7 w-7 items-center justify-center rounded-xs border border-frame text-on-desk transition-colors hover:bg-frame disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted">+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 비용 / 금고 */}
      <div className="rounded-xs border border-frame bg-desk-2 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-on-desk/60">이번 성장 비용 / 금고</span>
          <span className={`font-mono text-lg tabular-nums ${ok ? "text-on-desk" : "text-alarm"}`}>
            {formatManwon(cost)} / {formatManwon(state.treasury)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onComplete(choices, beds)}
        disabled={!ok}
        className="rounded-xs bg-go py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-desk-2 disabled:text-on-desk/70 disabled:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
      >
        이번 주 진료 시작
      </button>
    </main>
  );
}
