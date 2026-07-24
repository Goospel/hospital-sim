"use client";

import { useState } from "react";
import { DEPARTMENTS, FIXED_BEDS, SETUP_BUDGET_MANWON, backupCareOf, deptCap, isSetupReady, setupHiringCostManwon } from "@/game/setup";
import { CANDIDATES, SPEED_OF_TIER, doctorsCountsOf, toggleHired, type Candidate } from "@/game/candidates";
import { formatManwon } from "@/game/labels";
import { hospitalTier, TIER_LABELS, TIER_ORDER } from "@/game/tier";
import { DoctorSprite } from "./PixelSprite";
import type { DepartmentSpec, DeptKey, SetupChoices } from "@/game/types";

/**
 * 지원서 카드 한 장 — 증명사진(픽셀)·이름·연차·한 줄 경력·요구 계약금·진료 소요 배율(사실 숫자만).
 * 탭 = 「채용」 도장 토글(aria-pressed). 해석 카피 없음(show-don't-tell): 어떤 지원자가 이득인지는
 * 숫자(계약금 vs ×배율)를 플레이어가 저울질한다.
 */
function CandidateCard({
  cand,
  hired,
  disabled,
  onToggle,
}: {
  cand: Candidate;
  hired: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={hired}
      aria-label={`${cand.name} ${hired ? "반려" : "채용"}`}
      className="paper-card relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
    >
      <span className="h-12 w-12 shrink-0">
        <DoctorSprite dept={cand.dept} busy={false} variantKey={cand.id} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-serif text-base text-ink">
          {cand.name} <span className="font-sans text-xs text-ink-2">{cand.careerYears}년차</span>
        </span>
        <span className="truncate text-xs text-ink-2">{cand.resumeLine}</span>
        <span className="font-mono text-xs tabular-nums text-ink">
          계약금 {formatManwon(cand.hireCostManwon)} · 진료 소요 ×{SPEED_OF_TIER[cand.tier]}
        </span>
      </span>
      {hired && (
        <span className="-rotate-[4deg] rounded-stamp border-2 border-stamp bg-stamp-field px-2 py-0.5 font-serif text-sm leading-tight text-stamp-ink">
          채용
        </span>
      )}
    </button>
  );
}

/**
 * 병원 설립 위저드 — NAME(이름 하나만) → DEPTS(채용 데스크).
 * DEPTS는 과별 아코디언 + 지원서 4장 + 채용 도장이다. onComplete(choices) 계약은 불변 —
 * doctors 카운트는 hiredIds에서 **여기서 한 번만** 파생한다(단일 기록 지점, types.ts 주석).
 */
export default function SetupWizard({
  onComplete,
  departments = DEPARTMENTS,
}: {
  onComplete: (choices: SetupChoices) => void;
  departments?: DepartmentSpec[];
}) {
  const [hospitalName, setHospitalName] = useState("");
  const [hired, setHired] = useState<string[]>([]);
  const [openDept, setOpenDept] = useState<DeptKey | null>(departments[0]?.key ?? null);
  const [step, setStep] = useState<"NAME" | "DEPTS">("NAME");

  const nameEntered = hospitalName.trim().length > 0;

  if (step === "NAME") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center gap-6 bg-desk px-5 py-12 text-on-desk">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.25em] text-on-desk/60">
            병원 설립
          </span>
          <h1 className="font-serif text-2xl">어떤 병원을 세우시겠습니까</h1>
        </header>

        {/* 입력칸은 조작 UI(desk)지만, **입력된 병원명은 즉시 명조로 선다**(스펙 §5) — 내가 쓴 판정. */}
        <input
          type="text"
          value={hospitalName}
          onChange={(e) => setHospitalName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nameEntered) setStep("DEPTS");
          }}
          placeholder="병원 이름"
          aria-label="병원 이름"
          autoFocus
          className="rounded-xs border border-frame bg-desk-2 px-4 py-3 font-serif text-lg text-on-desk placeholder:font-sans placeholder:text-base placeholder:text-on-desk-muted focus:border-on-desk-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        />

        <button
          type="button"
          onClick={() => setStep("DEPTS")}
          disabled={!nameEntered}
          className="rounded-xs bg-go py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-desk-2 disabled:text-on-desk/70 disabled:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        >
          다음
        </button>
      </main>
    );
  }

  // step === "DEPTS" — 채용 데스크
  const draft: SetupChoices = { hospitalName, doctors: doctorsCountsOf(hired), hiredIds: hired };
  const cost = setupHiringCostManwon(draft, departments);
  const overBudget = cost > SETUP_BUDGET_MANWON;
  const ready = isSetupReady(draft, departments);
  const tier = hospitalTier(backupCareOf(draft, departments).length);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 bg-desk px-5 py-8 text-on-desk">
      <header className="flex flex-col gap-1 border-b border-frame pb-4">
        <button
          type="button"
          onClick={() => setStep("NAME")}
          className="mb-1 self-start rounded-xs text-xs text-on-desk/70 transition-colors hover:text-on-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        >
          ← 이름 수정
        </button>
        {/* 병원명은 명조 — 방금 내가 쓴 이름이 판정으로 선다. */}
        <span className="font-serif text-xl text-on-desk">{hospitalName}</span>
        <h1 className="mt-1 text-base font-semibold text-on-desk">지원서를 보고 채용하세요</h1>
        <p className="text-sm text-on-desk/70">
          예산 {formatManwon(SETUP_BUDGET_MANWON)} 안에서 지원서에 도장을 찍습니다.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {departments.map((dept) => {
          const pool = CANDIDATES.filter((c) => c.dept === dept.key);
          const cap = deptCap(dept, FIXED_BEDS);
          const hiredHere = pool.filter((c) => hired.includes(c.id));
          const subtotal = hiredHere.reduce((s, c) => s + c.hireCostManwon, 0);
          const open = openDept === dept.key;
          return (
            <section key={dept.key} className="rounded-xs border border-frame bg-desk-2">
              <button
                type="button"
                onClick={() => setOpenDept(open ? null : dept.key)}
                aria-expanded={open}
                className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-on-desk">{dept.label}</span>
                  <span className="font-mono text-xs tabular-nums text-on-desk/70">
                    채용 {hiredHere.length}/{cap}
                    {subtotal > 0 ? ` · ${formatManwon(subtotal)}` : ""}
                  </span>
                </span>
                <span aria-hidden className="text-on-desk/40">
                  {open ? "▾" : "▸"}
                </span>
              </button>
              {open && (
                <div className="flex flex-col gap-2 px-3 pb-3">
                  {pool.map((cand) => (
                    <CandidateCard
                      key={cand.id}
                      cand={cand}
                      hired={hired.includes(cand.id)}
                      disabled={!hired.includes(cand.id) && hiredHere.length >= cap}
                      onToggle={() => setHired((h) => toggleHired(h, cand.id, cap))}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="rounded-xs border border-frame bg-desk-2 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-widest text-on-desk/60">자격</div>
        <div className="mt-1 font-mono text-lg tabular-nums text-on-desk">{TIER_LABELS[tier]}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
          {TIER_ORDER.map((t, i) => (
            <span key={t} className="flex items-center gap-1.5">
              {/* 사다리 구분자 — aria-hidden 순수 장식이지만 frame(1.19:1)은 사실상 안 보였다. */}
              {i > 0 && (
                <span aria-hidden className="text-on-desk/40">
                  ›
                </span>
              )}
              <span className={t === tier ? "font-semibold text-on-desk" : "text-on-desk/70"}>
                {t === "UNDESIGNATED" ? "미지정" : TIER_LABELS[t]}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/*
        채용 예산 장부 — 이 화면의 종이는 지원서와 장부다(스펙 §5 — "종이 = 서류"로 재해석).
        초과는 **도장**으로 찍힌다 — 색만이 아니라 글자와 형태로도 읽힌다(§7).
      */}
      <div className="paper-card px-4 py-3">
        <div className="font-sans text-xs font-medium uppercase tracking-widest text-ink-2">
          채용 예산
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span
            className={`font-mono text-lg tabular-nums ${overBudget ? "text-stamp-ink" : "text-ink"}`}
          >
            {formatManwon(cost)} / {formatManwon(SETUP_BUDGET_MANWON)}
          </span>
          {overBudget && (
            <span className="-rotate-[1.5deg] rounded-stamp border-2 border-stamp bg-stamp-field px-2 py-0.5 font-serif text-base leading-tight text-stamp-ink">
              예산 초과
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onComplete(draft)}
        disabled={!ready}
        className="rounded-xs bg-go py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-desk-2 disabled:text-on-desk/70 disabled:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
      >
        병원 개원
      </button>
    </main>
  );
}
