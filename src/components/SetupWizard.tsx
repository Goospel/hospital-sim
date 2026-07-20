"use client";

import { useState } from "react";
import { DEPARTMENTS, SETUP_BUDGET_BILLIONS, adjustDoctors, backupCareOf, hiringCost, isSetupReady } from "@/game/setup";
import { hospitalTier, TIER_LABELS, TIER_ORDER } from "@/game/tier";
import type { DepartmentSpec, SetupChoices } from "@/game/types";

/**
 * 과 카드 한 장 — 과 이름 + 채용비(중립 사실)만 노출한다.
 * 수익/적자·소송 리스크 같은 해석성 힌트는 의도적으로 감춘다(show-don't-tell): 어느 과가 돈이 되고
 * 어느 과가 적자·소송인지는 플레이어가 장부·결말을 겪으며 스스로 알게 유도. (essential/lawsuitRisk
 * 데이터 자체는 buildHospital 등 게임 로직이 계속 쓴다 — 여기선 표시만 안 할 뿐.)
 */
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
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          −
        </button>
        <span className="w-4 text-center font-mono text-sm tabular-nums text-zinc-100">{count}</span>
        <button
          type="button"
          onClick={() => onAdjust(1)}
          aria-label={`${dept.label} 채용 한 명 늘리기`}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * 병원 설립 위저드 — 한 SETUP 페이즈를 두 패널로 나눈다(정보 과부하 완화):
 *   NAME  — 병원 이름 하나만. 랜딩 다음 첫 화면이라 딱 한 가지에 집중.
 *   DEPTS — 과별 채용. 이름은 위에서 확정됐으니 이제 과 구성에만 집중.
 * onComplete(choices) 계약은 불변 — 두 패널에 걸쳐 쌓은 choices를 마지막에 한 번 커밋한다.
 */
export default function SetupWizard({
  onComplete,
  departments = DEPARTMENTS,
}: {
  onComplete: (choices: SetupChoices) => void;
  departments?: DepartmentSpec[];
}) {
  const [choices, setChoices] = useState<SetupChoices>({ hospitalName: "", doctors: {} });
  const [step, setStep] = useState<"NAME" | "DEPTS">("NAME");

  const nameEntered = choices.hospitalName.trim().length > 0;

  if (step === "NAME") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-5 py-12 text-zinc-100 bg-zinc-950">
        <header className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">병원 설립</span>
          <h1 className="text-2xl font-semibold">어떤 병원을 세우시겠습니까</h1>
        </header>

        <input
          type="text"
          value={choices.hospitalName}
          onChange={(e) => setChoices((c) => ({ ...c, hospitalName: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nameEntered) setStep("DEPTS");
          }}
          placeholder="병원 이름"
          aria-label="병원 이름"
          autoFocus
          className="rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        />

        <button
          type="button"
          onClick={() => setStep("DEPTS")}
          disabled={!nameEntered}
          className="rounded-lg bg-zinc-100 py-3 text-base font-semibold text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          다음
        </button>
      </main>
    );
  }

  // step === "DEPTS"
  const cost = hiringCost(choices, departments);
  const overBudget = cost > SETUP_BUDGET_BILLIONS;
  const ready = isSetupReady(choices, departments);
  const tier = hospitalTier(backupCareOf(choices, departments).length);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 bg-zinc-950">
      <header className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setStep("NAME")}
          className="mb-1 self-start rounded text-xs text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          ← 이름 수정
        </button>
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{choices.hospitalName}</span>
        <h1 className="text-lg font-semibold">과별 의사를 채용하세요</h1>
        <p className="text-sm text-zinc-400">예산 {SETUP_BUDGET_BILLIONS}억 안에서 진료과를 꾸립니다.</p>
      </header>

      <div className="flex flex-col gap-2">
        {departments.map((dept) => (
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
          <span>자격</span>
        </div>
        <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{TIER_LABELS[tier]}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
          {TIER_ORDER.map((t, i) => (
            <span key={t} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-zinc-700">›</span>}
              <span className={t === tier ? "font-semibold text-emerald-400" : "text-zinc-600"}>
                {t === "UNDESIGNATED" ? "미지정" : TIER_LABELS[t]}
              </span>
            </span>
          ))}
        </div>
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
        className="rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        병원 개원
      </button>
    </main>
  );
}
