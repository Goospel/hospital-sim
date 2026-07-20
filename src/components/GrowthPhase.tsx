// src/components/GrowthPhase.tsx
"use client";

import { useState } from "react";
import { adjustDoctors, bedExpansionCost, BED_TIERS, deptCap } from "@/game/setup";
import { canApplyGrowth, growthCostOf, type SessionState } from "@/game/session";
import { poolRemaining } from "@/game/system";
import { formatSignedBillions } from "@/game/labels";
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
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 bg-zinc-950">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{state.week}주차 · 재투자</span>
        <h1 className="text-lg font-semibold">병원을 키우시겠습니까</h1>
        <p className="text-sm text-zinc-400">금고 {formatSignedBillions(state.treasury)} 안에서 증축합니다. 그대로 두고 넘어가도 됩니다.</p>
      </header>

      {/* 병상 티어 */}
      <div className="rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-zinc-100">병상 {beds}</span>
            <span className="font-mono text-xs tabular-nums text-zinc-600">
              {nextBedTier ? `→ ${nextBedTier}병상 증설 ${bedExpansionCost(beds, nextBedTier)}억 · 환자·필수과 상한↑` : "최대 병상"}
            </span>
          </div>
          <button
            type="button"
            disabled={!nextBedTier}
            onClick={() => nextBedTier && setBeds(nextBedTier)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
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
            <div key={dept.key} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-zinc-100">{dept.label}</span>
                <span className="font-mono text-xs tabular-nums text-zinc-600">
                  채용 {dept.hireCostBillions}억/명{remain !== null ? ` · 전국 잔여 ${remain}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={`${dept.label} 줄이기`} disabled={count <= floor}
                  onClick={() => setChoices((c) => adjustDoctors(c, dept.key, -1, cap))}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">−</button>
                <span className="w-4 text-center font-mono text-sm tabular-nums text-zinc-100">{count}</span>
                <button type="button" aria-label={`${dept.label} 늘리기`} disabled={count >= cap || atPool}
                  onClick={() => setChoices((c) => adjustDoctors(c, dept.key, 1, cap))}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 비용 / 금고 */}
      <div className="rounded-lg border border-zinc-800 bg-black/40 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-zinc-600">이번 성장 비용 / 금고</span>
          <span className={`font-mono text-lg tabular-nums ${ok ? "text-zinc-100" : "text-red-500"}`}>
            {cost} / {state.treasury}억
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onComplete(choices, beds)}
        disabled={!ok}
        className="rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        이번 주 진료 시작
      </button>
    </main>
  );
}
