"use client";

import { useEffect, useState } from "react";
import { DEPARTMENTS, FIXED_BEDS, SETUP_BUDGET_MANWON, backupCareOf, deptCap, isSetupReady, setupHiringCostManwon } from "@/game/setup";
import { CANDIDATES, SPEED_OF_TIER, doctorsCountsOf, toggleHired, type Candidate } from "@/game/candidates";
import { deriveSetupScene } from "@/game/hospitalMap";
import { formatManwon } from "@/game/labels";
import { hospitalTier, TIER_LABELS } from "@/game/tier";
import HospitalMap from "./HospitalMap";
import { DoctorSprite } from "./PixelSprite";
import type { DepartmentSpec, DeptKey, SetupChoices } from "@/game/types";

/**
 * 지원서 카드 — 세로형 서류(paper-card). 증명사진(픽셀) 위, 기계적 사실(연차·경력·계약금·
 * 소요 배율) 아래. 탭 = 「채용」 도장 토글(aria-pressed). 해석 카피 없음(show-don't-tell) —
 * 어떤 지원자가 이득인지는 숫자(계약금 vs ×배율)를 플레이어가 저울질한다.
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
      className="paper-card relative flex w-full flex-col items-center gap-1.5 px-3 py-3 transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
    >
      <span className="h-16 w-16">
        <DoctorSprite dept={cand.dept} busy={false} variantKey={cand.id} />
      </span>
      <span className="flex w-full flex-col items-center gap-0.5 text-center">
        <span className="font-serif text-base leading-tight text-ink">{cand.name}</span>
        <span className="font-sans text-xs leading-snug text-ink-2">
          {cand.careerYears}년차 · {cand.resumeLine}
        </span>
        <span className="font-mono text-xs tabular-nums text-ink">
          {formatManwon(cand.hireCostManwon)} · 소요 ×{SPEED_OF_TIER[cand.tier]}
        </span>
      </span>
      {hired && (
        <span className="absolute right-2 top-2 -rotate-[6deg] rounded-stamp border-2 border-stamp bg-stamp-field px-2 py-0.5 font-serif text-sm leading-tight text-stamp-ink">
          채용
        </span>
      )}
    </button>
  );
}

/**
 * 과 지원서 오버레이 — 방을 클릭하면 그 과 지원서 4장이 중앙에 펼쳐진다(결정 카드와 같은
 * 중앙 오버레이 문법). Esc·배경 클릭·닫기 버튼으로 닫힌다. 뒤의 맵이 어둡게 비쳐, 도장을
 * 찍는 순간 그 방에 아바타가 나타나는 게 보인다.
 */
function DeptOverlay({
  dept,
  hired,
  onToggle,
  onClose,
}: {
  dept: DepartmentSpec;
  hired: string[];
  onToggle: (id: string, cap: number) => void;
  onClose: () => void;
}) {
  const pool = CANDIDATES.filter((c) => c.dept === dept.key);
  const cap = deptCap(dept, FIXED_BEDS);
  const hiredHere = pool.filter((c) => hired.includes(c.id));
  const subtotal = hiredHere.reduce((s, c) => s + c.hireCostManwon, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${dept.label} 지원서`}
        className="max-h-full w-full max-w-3xl overflow-y-auto rounded-xs border border-frame bg-desk p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-serif text-lg text-on-desk">{dept.label}</span>
            <span className="font-mono text-xs tabular-nums text-on-desk/70">
              채용 {hiredHere.length}/{cap}
              {subtotal > 0 ? ` · ${formatManwon(subtotal)}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xs text-sm text-on-desk/70 transition-colors hover:text-on-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            닫기 ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {pool.map((cand) => (
            <CandidateCard
              key={cand.id}
              cand={cand}
              hired={hired.includes(cand.id)}
              disabled={!hired.includes(cand.id) && hiredHere.length >= cap}
              onToggle={() => onToggle(cand.id, cap)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 병원 설립 — 개원 전 빈 병원 맵 허브(스펙 2026-07-24 v2). 한 화면 3밴드:
 *   현판(이름 입력) → 병원 맵(방 클릭 = 지원서 오버레이) → 하단 바(장부·자격·개원).
 * 데스크톱(1280×720+) 무스크롤이 1순위 요구다 — 세로 아코디언(v1)은 여기서 은퇴했다.
 * onComplete(draft) 계약은 불변 — doctors 카운트는 hiredIds에서 **여기서 한 번만** 파생한다.
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
  const [openDept, setOpenDept] = useState<DeptKey | null>(null);

  const draft: SetupChoices = { hospitalName, doctors: doctorsCountsOf(hired), hiredIds: hired };
  const cost = setupHiringCostManwon(draft, departments);
  const overBudget = cost > SETUP_BUDGET_MANWON;
  const ready = isSetupReady(draft, departments);
  const tier = hospitalTier(backupCareOf(draft, departments).length);
  const openSpec = openDept ? departments.find((d) => d.key === openDept) : undefined;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl flex-1 flex-col justify-center gap-3 bg-desk px-5 py-4 text-on-desk">
      {/* 현판 — 빈 간판에 이름을 쓰면 그대로 게임 세계의 간판이 된다(명조 = 판정, v1 규칙 유지) */}
      <header className="flex flex-col items-center gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-on-desk/60">
          병원 설립
        </span>
        <input
          type="text"
          value={hospitalName}
          onChange={(e) => setHospitalName(e.target.value)}
          placeholder="병원 이름을 현판에 쓰세요"
          aria-label="병원 이름"
          autoFocus
          className="w-full max-w-md rounded-xs border-b-2 border-frame bg-transparent px-3 py-1.5 text-center font-serif text-xl text-on-desk placeholder:font-sans placeholder:text-sm placeholder:text-on-desk-muted focus:border-on-desk-muted focus:outline-none"
        />
      </header>

      {/* 빈 병원 — 방 클릭이 채용의 입구다. 채용하면 그 방에 그 얼굴이 선다(deriveSetupScene). */}
      <HospitalMap scene={deriveSetupScene(hired)} onRoomClick={(d) => setOpenDept(d)} />

      {/* 하단 바 — 장부(종이) · 자격 · 개원. 화면당 종이 1장 규칙(장부), 초과는 도장. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="paper-card flex min-w-0 flex-1 items-baseline gap-3 px-4 py-2">
          <span className="shrink-0 font-sans text-[11px] font-medium uppercase tracking-widest text-ink-2">
            채용 예산
          </span>
          <span className={`font-mono text-base tabular-nums ${overBudget ? "text-stamp-ink" : "text-ink"}`}>
            {formatManwon(cost)} / {formatManwon(SETUP_BUDGET_MANWON)}
          </span>
          {overBudget && (
            <span className="-rotate-[1.5deg] rounded-stamp border-2 border-stamp bg-stamp-field px-2 py-0.5 font-serif text-sm leading-tight text-stamp-ink">
              예산 초과
            </span>
          )}
        </div>
        <div className="rounded-xs border border-frame bg-desk-2 px-3 py-2">
          <span className="mr-2 text-[11px] font-medium uppercase tracking-widest text-on-desk/60">자격</span>
          <span className="font-mono text-sm tabular-nums text-on-desk">{TIER_LABELS[tier]}</span>
        </div>
        <button
          type="button"
          onClick={() => onComplete(draft)}
          disabled={!ready}
          className="rounded-xs bg-go px-6 py-2.5 text-base font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-desk-2 disabled:text-on-desk/70 disabled:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        >
          병원 개원
        </button>
      </div>

      {openSpec && (
        <DeptOverlay
          dept={openSpec}
          hired={hired}
          onToggle={(id, cap) => setHired((h) => toggleHired(h, id, cap))}
          onClose={() => setOpenDept(null)}
        />
      )}
    </main>
  );
}
