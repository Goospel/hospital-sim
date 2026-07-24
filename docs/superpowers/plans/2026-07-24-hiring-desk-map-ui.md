---
tags:
  - type/plan
---

# 채용 데스크 v2(맵 허브·무스크롤) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SETUP 화면을 세로 아코디언에서 "개원 전 빈 병원 맵 허브"로 바꾼다 — 데스크톱 무스크롤 1화면, 방 클릭 → 지원서 오버레이, 도장 즉시 맵에 아바타.

**Architecture:** 표시층 전용. 신규는 `deriveSetupScene`(hiredIds → MapScene 순수 합성)과 `HospitalMap`의 옵셔널 `onRoomClick` prop뿐. 채용 로직(v1: `toggleHired`·`doctorsCountsOf`·`setupHiringCostManwon`·`isSetupReady`·초상 변주)은 전부 재사용, 판정·경제 0줄. 스펙: [2026-07-24-hiring-desk-map-ui-design.md](../specs/2026-07-24-hiring-desk-map-ui-design.md)

**Tech Stack:** Next.js(App Router)·TypeScript·Tailwind·vitest. 새 의존성 0.

## Global Constraints

- **무스크롤 1순위**: 1280×720 데스크톱에서 SETUP 화면 `scrollHeight ≤ clientHeight` — 최종 브라우저 실측이 게이트다. 모바일(375px)은 같은 구조 유지 + 세로 스크롤 허용, 가로 스크롤은 금지.
- **게임 로직 0줄**: `candidates.ts`·`setup.ts`·`doctor.ts`·`receiving.ts`·`daysim.ts`는 이 계획에서 절대 수정하지 않는다.
- **RECEIVING 화면 0 변경**: `HospitalMap`의 새 prop은 옵셔널 — 미전달 시 렌더 결과가 현행과 동일해야 한다(방은 `<div>` 그대로).
- **RNG 0**: `Math.random`·`Date.now` 금지. `deriveSetupScene`은 순수·결정론.
- **해석 카피 금지(show-don't-tell)**: 지원서·하단 바에 평가·해석 문구 없음, 사실 숫자만.
- **onComplete 계약 불변**: `onComplete(draft)` — `draft = { hospitalName, doctors: doctorsCountsOf(hired), hiredIds: hired }`(단일 기록 지점, 이중 기재 금지).
- **커밋**: 한글 메시지는 `.commit-msg-tmp`(UTF-8) 경유 `git commit -F`(T-026). `Skills-used:`~`Co-Authored-By:` 트레일러 빈 줄 없이 연속.
- **게이트**: 태스크마다 `npx vitest run` green, 최종 태스크에서 `npx tsc --noEmit` + `npm run lint` + `npm run build`.
- 새 md는 폴더별 `type/*` frontmatter 태그 필수(pre-commit 검사기). 이 계획 문서는 `type/plan`.

---

### Task 1: `deriveSetupScene` — 개원 전 장면 합성 (순수 파생)

**Files:**
- Modify: `src/game/hospitalMap.ts` (deriveMapScene 아래에 함수 추가 + import 2건)
- Test: `src/game/hospitalMap.test.ts` (describe 블록 추가)

**Interfaces:**
- Consumes: `CANDIDATES`(candidates.ts) · `FIXED_BEDS`(setup.ts) · 기존 `MapScene`/`MapRoom`/`MapAvatar`/`ORDERED_DEPTS`(hospitalMap.ts 내부)
- Produces: `deriveSetupScene(hired: string[], beds?: number): MapScene` — Task 3의 SetupWizard가 소비

- [ ] **Step 1: 실패하는 테스트 작성** — `src/game/hospitalMap.test.ts` 맨 아래에 추가.

⚠️ 이 파일은 describe 블록 위에 인라인 import를 두는 관습이다. **이미 import된 심볼을 재선언하면 타입 에러**(파일 상단 주석이 직접 경고): `DEPARTMENTS`(23행)·`buildHospital`(55행)·`CANDIDATES`(v1 Task 5 블록)는 이미 있다. 새로 추가할 것은 `deriveSetupScene`(기존 `./hospitalMap` import에 합치거나 새 줄)과 `FIXED_BEDS`(`./setup`)뿐이다 — 추가 전에 파일에서 기존 import를 grep으로 확인하라.

```ts
import { deriveSetupScene } from './hospitalMap'
import { FIXED_BEDS } from './setup'

describe('deriveSetupScene — 개원 전 장면(hiredIds 직접 합성)', () => {
  const vet = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'VETERAN')!
  const std = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'STANDARD')!

  it('채용한 과만 staffed, 지원자 아바타가 자기 방에 선다(candidateId·slot·busy false)', () => {
    const scene = deriveSetupScene([vet.id, std.id])
    expect(scene.rooms.find((r) => r.dept === 'CARDIOLOGY')!.staffed).toBe(true)
    expect(scene.rooms.find((r) => r.dept === 'NEUROSURGERY')!.staffed).toBe(false)
    const docs = scene.avatars.filter((a) => a.kind === 'DOCTOR')
    expect(docs).toHaveLength(2)
    expect(docs.every((a) => a.zone === 'ROOM' && a.dept === 'CARDIOLOGY' && !a.busy)).toBe(true)
    expect(new Set(docs.map((a) => a.slot))).toEqual(new Set([0, 1]))
    expect(docs.map((a) => a.candidateId).sort()).toEqual([std.id, vet.id].sort())
  })

  it('빈 채용 = 전부 빈 방(lit)·아바타 0·침대 전부 빈 침대·조명 DAY·대기 0', () => {
    const scene = deriveSetupScene([])
    expect(scene.rooms).toHaveLength(DEPARTMENTS.length)
    expect(scene.rooms.every((r) => !r.staffed && r.lit)).toBe(true)
    expect(scene.avatars).toHaveLength(0)
    expect(scene.beds).toHaveLength(FIXED_BEDS)
    expect(scene.beds.every((b) => b.occupantDoctorId === undefined)).toBe(true)
    expect(scene.lighting).toBe('DAY')
    expect(scene.waitingCount).toBe(0)
    expect(scene.waitingOverflow).toBe(0)
  })

  it('결정론 — 같은 hired는 같은 장면', () => {
    expect(deriveSetupScene([vet.id])).toEqual(deriveSetupScene([vet.id]))
  })

  it('모르는 id는 무시(방어 — toggleHired·doctorsCountsOf와 같은 결)', () => {
    expect(deriveSetupScene(['ghost']).avatars).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/hospitalMap.test.ts`
Expected: FAIL — `deriveSetupScene` export 없음

- [ ] **Step 3: 구현** — `src/game/hospitalMap.ts`.

import 갱신(3행): `import { DEPARTMENTS } from './setup'` → `import { DEPARTMENTS, FIXED_BEDS } from './setup'`, 그리고 `import { CANDIDATES } from './candidates'` 추가(candidates.ts는 types만 임포트 — 순환 없음).

`deriveMapScene` 함수 아래에 추가:

```ts
/**
 * SETUP(개원 전) 장면 — ReceivingState가 아직 없는 시점을 hiredIds에서 직접 합성한다.
 * 개원 전·후가 **같은 MapScene 문법**이라 위저드의 빈 병원과 게임의 병원이 같은 공간으로 보인다
 * (스펙 §2 연속성 장치). 순수·결정론: 같은 hired = 같은 장면. 조명은 항상 DAY(개원 전 아침),
 * 채용한 지원자는 자기 방에 서 있다(zone ROOM · busy false — 아직 환자가 없다).
 * 모르는 id는 무시한다(toggleHired·doctorsCountsOf와 같은 방어 결).
 */
export function deriveSetupScene(hired: string[], beds: number = FIXED_BEDS): MapScene {
  const hiredSet = new Set(hired)
  const hiredCands = CANDIDATES.filter((c) => hiredSet.has(c.id))

  const rooms: MapRoom[] = ORDERED_DEPTS.map((d, col) => ({
    dept: d.key,
    label: d.label,
    col,
    staffed: hiredCands.some((c) => c.dept === d.key),
    lit: true,
  }))

  const roomSlot = new Map<DeptKey, number>()
  const avatars: MapAvatar[] = hiredCands.map((c) => {
    const slot = roomSlot.get(c.dept) ?? 0
    roomSlot.set(c.dept, slot + 1)
    return { id: `setup-${c.id}`, kind: 'DOCTOR' as const, zone: 'ROOM' as const, dept: c.dept, slot, busy: false, candidateId: c.id }
  })

  return {
    rooms,
    beds: Array.from({ length: beds }, (_, index) => ({ index })),
    avatars,
    lighting: 'DAY',
    clockMin: 0,
    waitingCount: 0,
    waitingOverflow: 0,
  }
}
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS(기존 전부 green + 신규 4건)

- [ ] **Step 5: 커밋**

`.commit-msg-tmp` 작성 후 `git add src/game/hospitalMap.ts src/game/hospitalMap.test.ts && git commit -F .commit-msg-tmp`:

```
feat: deriveSetupScene — 개원 전 빈 병원 장면을 hiredIds에서 합성 (맵 허브 1/4)
```

---

### Task 2: `HospitalMap.onRoomClick` — 방이 버튼이 된다 (RECEIVING 0 변경)

**Files:**
- Modify: `src/components/HospitalMap.tsx:49-79` (시그니처 + 진료실 줄 렌더)

**Interfaces:**
- Consumes: 기존 `MapScene`
- Produces: `HospitalMap({ scene, onRoomClick? })` — `onRoomClick?: (dept: DeptKey) => void`. Task 3이 전달, RECEIVING(ReceivingPhase)은 미전달로 현행 유지

- [ ] **Step 1: 구현** (UI prop — vitest 단위 대상 아님, tsc + 기존 스위트가 게이트)

시그니처(49행)와 진료실 줄(57-78행)을 교체. import에 `import type { DeptKey } from "@/game/types";` 추가:

```tsx
export default function HospitalMap({
  scene,
  onRoomClick,
}: {
  scene: MapScene;
  onRoomClick?: (dept: DeptKey) => void;
}) {
```

진료실 줄 — 클래스 문자열은 현행 삼항 그대로 두고, `onRoomClick` 유무로 태그만 가른다(미전달 시 렌더 결과가 현행과 동일해야 한다):

```tsx
        {scene.rooms.map((room) => {
          const roomCls = `flex flex-col justify-end rounded-xs border transition-colors duration-500 ${
            room.lit
              ? room.staffed
                ? "border-frame bg-frame/70"
                : "border-frame/60 bg-frame/25" // 빈 방 — 안 뽑은 과가 여기 보인다
              : "border-desk bg-black/60"
          }`;
          const label = (
            <span className="truncate px-1 pb-0.5 text-center text-[9px] leading-tight text-on-desk/70">
              {room.label}
            </span>
          );
          // SETUP에서만 방이 클릭 타깃이다(지원서 오버레이). RECEIVING은 onRoomClick을 안 넘겨 현행 그대로.
          return onRoomClick ? (
            <button
              key={room.dept}
              type="button"
              onClick={() => onRoomClick(room.dept)}
              aria-label={`${room.label} 지원서 보기`}
              className={`${roomCls} cursor-pointer hover:border-on-desk-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted`}
            >
              {label}
            </button>
          ) : (
            <div key={room.dept} className={roomCls}>
              {label}
            </div>
          );
        })}
```

(방 이름 라벨의 잉크 규칙 주석(68-73행)은 삭제하지 말고 `label` 상수 위로 옮겨 보존한다.)

- [ ] **Step 2: 게이트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 둘 다 통과 — RECEIVING 쪽은 prop 미전달이라 타입·렌더 모두 무변경

- [ ] **Step 3: 커밋**

```
feat: HospitalMap.onRoomClick — SETUP에서만 방이 클릭 타깃 (맵 허브 2/4)
```

---

### Task 3: SetupWizard 맵 허브 재작성 — 현판 + 맵 + 오버레이 + 하단 바

**Files:**
- Modify: `src/components/SetupWizard.tsx` (전면 교체 — NAME/DEPTS 2단계 구조 삭제)

**Interfaces:**
- Consumes: `deriveSetupScene`(Task 1) · `HospitalMap onRoomClick`(Task 2) · v1 로직 전부(`CANDIDATES`·`SPEED_OF_TIER`·`doctorsCountsOf`·`toggleHired`·`setupHiringCostManwon`·`isSetupReady`·`deptCap`·`backupCareOf`·`hospitalTier`·`TIER_LABELS`·`formatManwon`·`DoctorSprite`)
- Produces: `onComplete(draft)` 계약 불변 — 이후 세션 흐름 무수정

- [ ] **Step 1: 전체 파일 교체**

```tsx
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
```

주의:
- v1의 `step`("NAME"|"DEPTS") 분기·아코디언(`<section>` 목록)·`TIER_ORDER` 사다리 나열이 전부 삭제된다. `TIER_ORDER` import도 제거(안 쓰면 lint가 잡는다).
- `deriveSetupScene(hired)`는 `departments` prop과 무관하게 전역 `CANDIDATES` 기반 — v1 관습과 동일(테스트용 boosted 카탈로그 주입과 독립).
- 자격은 현재 등급만(스펙 §2 — 사다리 나열 제거는 의도된 결정이다).

- [ ] **Step 2: 정적 게이트**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: 셋 다 통과(이 컴포넌트를 직접 겨냥한 테스트는 없다 — 로직은 Task 1과 v1 테스트가 커버)

- [ ] **Step 3: 커밋**

```
feat: SetupWizard 맵 허브 — 현판+빈 병원+지원서 오버레이, 무스크롤 1화면 (맵 허브 3/4)
```

---

### Task 4: 문서·추적 갱신 + 최종 게이트 (브라우저 실측은 컨트롤러 담당)

**Files:**
- Modify: `docs/concept/character-design.md` (§0 표 한 줄)
- Modify: `claude-docs/plan.md`(🔜→✅) · `claude-docs/changeLog.md`(맨 위 항목)

**Interfaces:** 없음(문서만)

- [ ] **Step 1: character-design.md §0 표 갱신**

「아바타의 존재·위치 규칙(파생)」 행의 단일 출처가 `deriveMapScene`만 가리킨다 — SETUP 장면이 생겼으니 함께 적는다. 해당 행을 다음으로 교체:

```markdown
| 아바타의 존재·위치 규칙(파생) | `src/game/hospitalMap.ts` (`deriveMapScene` — 게임 중 · `deriveSetupScene` — 개원 전) |
```

- [ ] **Step 2: plan.md·changeLog.md 갱신**

plan.md 「🔜 채용 데스크 v2」 항목을 ✅로(하위 체크박스 4개 포함), 요약을 과거형으로. changeLog.md 맨 위에 추가(**PR 번호 없이** — 프로젝트 규약):

```markdown
## 2026-07-24 · 채용 데스크 v2 — 빈 병원 맵 허브(무스크롤 1화면)

v1 아코디언(세로 목록·스크롤·웹 패턴)을 하루 만에 은퇴시켰다. 사용자 요구 ①데스크톱 무스크롤 1화면 ②웹이 아니라 게임답게 — SETUP이 "개원 전 빈 병원 맵"이 됐다: 현판에 이름을 쓰고(NAME 화면 삭제), 어두운 빈 방을 클릭해 지원서 4장 오버레이에서 도장을 찍으면 그 방에 그 얼굴의 아바타가 즉시 선다. 개원을 누르면 그 맵이 그대로 게임 화면이 된다(개원 전·후 같은 공간). 신규는 `deriveSetupScene`(순수 파생)·`HospitalMap.onRoomClick`(옵셔널 — RECEIVING 0 변경)뿐, 판정·경제·채용 로직 0줄.
```

- [ ] **Step 3: 최종 게이트 + trap 스윕**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: 전부 통과

trap 스윕(프로젝트 CLAUDE.md): 이번 브랜치에서 1분+ 근인 디버깅이 있었나(서브에이전트·리뷰어가 잡은 것 포함) — 있으면 `claude-docs/troubleshooting/T-###.md` 신설, 판단 근거를 보고서에 남긴다.

- [ ] **Step 4: 커밋**

```
docs: 채용 데스크 v2 문서 정합 — character-design §0·추적 3종 (맵 허브 4/4)
```

- [ ] **Step 5: 브라우저 실측(컨트롤러 수행 — 이 태스크의 구현자가 아니라 세션 컨트롤러가 preview 도구로 직접)**

1. **1280×720에서 `document.documentElement.scrollHeight ≤ clientHeight` 실측 — 1순위 요구.**
2. 현판 입력 → 맵 방 클릭 → 오버레이 → 도장 → 오버레이 뒤 맵 방에 아바타 즉시 등장 → 반려 시 사라짐.
3. 상한 3/3에서 4번째 카드 비활성 · 예산 초과 도장 · 개원 버튼 게이팅(이름 없음/예산 초과 시 비활성).
4. Esc·배경 클릭으로 오버레이 닫힘.
5. 개원 → RECEIVING 맵에 같은 얼굴(변주) 연속.
6. RECEIVING 맵에서 방이 클릭 타깃이 **아님**(onRoomClick 미전달 회귀 확인).
7. 모바일 375px: 가로 스크롤 없음, 오버레이 2×2.
8. 콘솔 에러 0.

---

## Self-Review 결과 (계획 작성 시 수행)

- **스펙 커버리지**: §2(3밴드·현판·하단 바)→Task 3 · §3(오버레이)→Task 3 · §4(맵 반영)→Task 1+3 · §5(구조)→Task 1·2·3 · §6(반응형·접근성)→Task 3 코드에 반영 · §7(테스트·실측)→Task 1 테스트+Task 4 Step 5 · §8(범위 밖)→비작업. 누락 없음.
- **타입 일관성**: `deriveSetupScene(hired: string[], beds?: number): MapScene`(Task 1 정의 = Task 3 사용) · `onRoomClick?: (dept: DeptKey) => void`(Task 2 정의 = Task 3 전달) 일치.
- **유의점**: hospitalMap.test.ts의 인라인 import 중복 함정을 Task 1에 명시(파일 자체 경고 재인용). HospitalMap 방 렌더 교체 시 기존 잉크 규칙 주석 보존을 Task 2에 명시.
