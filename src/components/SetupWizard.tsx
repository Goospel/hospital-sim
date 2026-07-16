"use client";

import { useState } from "react";
import { DEPARTMENTS, SETUP_BUDGET_BILLIONS, adjustDoctors, hiringCost, isSetupReady } from "@/game/setup";
import type { DepartmentSpec, SetupChoices } from "@/game/types";

/** 과 카드 한 장 — 유도 카피는 DEPARTMENTS의 essential/lawsuitRisk에서 파생(수익과=emerald 힌트, 필수과=amber 경고). */
function DepartmentCard({
  dept,
  count,
  onAdjust,
}: {
  dept: DepartmentSpec;
  count: number;
  onAdjust: (delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-zinc-100">{dept.label}</span>
        {dept.essential ? (
          <span className="text-xs text-amber-500">
            적자 예상{dept.lawsuitRisk ? " · 소송 ⚠" : ""}
          </span>
        ) : (
          <span className="text-xs text-emerald-400">수익 예상 ↑</span>
        )}
        <span className="font-mono text-xs tabular-nums text-zinc-600">
          채용 {dept.hireCostBillions}억/명
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onAdjust(-1)}
          disabled={count === 0}
          aria-label={`${dept.label} 채용 한 명 줄이기`}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          −
        </button>
        <span className="w-4 text-center font-mono text-sm tabular-nums text-zinc-100">{count}</span>
        <button
          type="button"
          onClick={() => onAdjust(1)}
          aria-label={`${dept.label} 채용 한 명 늘리기`}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function SetupWizard({ onComplete }: { onComplete: (choices: SetupChoices) => void }) {
  const [choices, setChoices] = useState<SetupChoices>({ hospitalName: "", doctors: {} });

  const cost = hiringCost(choices);
  const overBudget = cost > SETUP_BUDGET_BILLIONS;
  const ready = isSetupReady(choices);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 bg-zinc-950">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">병원 설립</span>
        <h1 className="text-lg font-semibold">어떤 병원을 세우시겠습니까</h1>
        <p className="text-sm text-zinc-400">
          예산 {SETUP_BUDGET_BILLIONS}억 안에서 과별 의사를 채용하세요. 순환기내과는 비워둬도 시작할 수 있습니다.
        </p>
      </header>

      <input
        type="text"
        value={choices.hospitalName}
        onChange={(e) => setChoices((c) => ({ ...c, hospitalName: e.target.value }))}
        placeholder="병원 이름"
        aria-label="병원 이름"
        className="rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
      />

      <div className="flex flex-col gap-2">
        {DEPARTMENTS.map((dept) => (
          <DepartmentCard
            key={dept.key}
            dept={dept}
            count={choices.doctors[dept.key] ?? 0}
            onAdjust={(delta) => setChoices((c) => adjustDoctors(c, dept.key, delta))}
          />
        ))}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-black/40 px-4 py-3">
        <div className="flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-600">
          <span>채용 예산</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span
            className={`font-mono text-lg tabular-nums ${overBudget ? "text-red-500" : "text-zinc-100"}`}
          >
            {cost} / {SETUP_BUDGET_BILLIONS}억
          </span>
          {overBudget && <span className="text-xs text-red-500">예산 초과</span>}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onComplete(choices)}
        disabled={!ready}
        className="rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
      >
        병원 개원
      </button>
    </main>
  );
}
