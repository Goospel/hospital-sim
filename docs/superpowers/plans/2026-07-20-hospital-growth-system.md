---
tags:
  - type/plan
---

# 병원 성장 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주 사이에 번 돈으로 병원을 키우는 재투자 루프를 넣되, 커져도 시스템 문제가 안 풀리는 세 딜레마(① 인력 제로섬 · ② 재정 지속불가 · ③ 지방 공백)를 값으로 겪게 한다.

**Architecture:** 순수 코어 두 모듈 신설(`system.ts` 전국 의사 풀 · `growth.ts` 금고 산수) + 기존 위저드/신문/장부 재사용. 새 페이즈 `GROWTH` 하나. 세계 이벤트 헌법 계승 — 성장은 채용 경제·용량만 바꾸고 `adjudicateTransfer` 판정 규칙은 무변경.

**Tech Stack:** TypeScript · Next.js(App Router) · React · Tailwind · Vitest. RNG 0(전부 seed 파생·결정론).

## Global Constraints

모든 task에 암묵 적용:
- **판정 불가침**: `adjudicateTransfer`·`hardlockReason` 로직 한 줄도 안 바꾼다. 성장은 `hospital`의 `backupCare`/`roundTheClockBackup`/`roster`/`beds`·경제만 바꾼다(위저드가 이미 하던 재구성).
- **결정론**: 모든 성장·풀·볼륨 함수는 순수. `Math.random`·`Date.now` 금지 — seed 해시(`daysim.callSeed`/`seededUnit`)만.
- **타입 게이트**: 매 task 끝 `npx tsc --noEmit` 통과 필수 — vitest(esbuild)는 타입 미검사라 타입 회귀가 green으로 샌다.
- **show-don't-tell**: 성장·에필로그 화면에 해석 카피 0. 금고·비용·풀 잔여·두 신문의 숫자만.
- **왜곡 금지**(근거: [hospital-growth-dilemma-grounding.md](../../research/hospital-growth-dilemma-grounding.md)): 앵커는 2018 라벨·급여 한정·국고보조 후·3센터 표본·비중≠절대수·정밀 결합계수 금지를 지킨다. 전국 풀 초기값은 실제 헤드카운트를 '현재 실측'으로 표기하지 않고 **게임 스케일 각색값**으로.
- **커밋**: 한글 메시지는 T-026(`.commit-msg-tmp` + `git commit -F`). AI 활용 트레일러(`Skills-used:`~`Co-Authored-By:` 빈 줄 없이 연속) 첨부.
- **UI 텍스트 한국어**. 코드·식별자·경로는 원문.
- **회귀**: 기존 302 vitest green 유지 — 성장 미사용 경로(beds 기본 3·choices 기본)는 기존 동작 불변.

**참조 스펙:** [2026-07-20-hospital-growth-system-design.md](../specs/2026-07-20-hospital-growth-system-design.md)

---

## File Structure

**신설**
- `src/game/system.ts` — 전국 의사 풀(존재하는 의사 수). `SystemState`, `initSystem`, `poolRemaining`, `hireDelta`, `backgroundAttrition`.
- `src/game/system.test.ts`
- `src/game/growth.ts` — 금고 산수 + 성장 비용/검증. `initialTreasury`, `growthCost`, `withinTreasury`, `canGrow`.
- `src/game/growth.test.ts`
- `src/components/GrowthPhase.tsx` — 재투자 화면(위저드 패턴 재사용 + 병상·금고·풀 잔여).

**수정**
- `src/game/setup.ts` — 병상 티어·`deptCap(dept,beds)`·`adjustDoctors`/`withinDeptCaps` beds 인자·`buildHospital` beds 인자·`bedExpansionCost`. (`+ setup.test.ts`)
- `src/game/receiving.ts` — `createCallQueue(day, beds)` 티어 볼륨. (`+ receiving.test.ts`)
- `src/game/session.ts` — `SessionState` 필드(choices/beds/treasury/system)·`completeSetup`·`completeWeek`·`nextWeek`·`GROWTH` 페이즈·`enterGrowth`·`applyGrowth`·`beginWeek`·`buildEpilogue`. (`+ session.test.ts`)
- `src/components/SessionClient.tsx` — GROWTH 배선.
- `src/components/WeekSummary.tsx` — 금고 표시.
- `src/components/Epilogue.tsx` — 전국·지방 신문 + 풀 소진 병치.

---

## Task 1: 전국 의사 풀 (`system.ts`)

**Files:**
- Create: `src/game/system.ts`
- Test: `src/game/system.test.ts`

**Interfaces:**
- Produces:
  - `interface SystemState { pool: Record<Specialty, number>; poolInitial: Record<Specialty, number> }`
  - `initSystem(): SystemState`
  - `poolRemaining(system: SystemState, s: Specialty): number`
  - `hireDelta(system: SystemState, deltas: Partial<Record<Specialty, number>>): SystemState` — 채용 증분만큼 풀 차감(0 클램프)
  - `canHire(system: SystemState, s: Specialty, count: number): boolean` — 잔여 ≥ count
  - `backgroundAttrition(system: SystemState, week: number): SystemState` — 매주 결정론 감소

- [ ] **Step 1: Write the failing test**

```ts
// src/game/system.test.ts
import { describe, it, expect } from 'vitest'
import { initSystem, poolRemaining, hireDelta, canHire, backgroundAttrition, POOL_INITIAL } from './system'

describe('전국 의사 풀 — 세상에 존재하는 유한 의사 수', () => {
  it('초기 풀 = 각색 고정값, poolInitial은 표시용 사본', () => {
    const s = initSystem()
    expect(s.pool).toEqual(POOL_INITIAL)
    expect(s.poolInitial).toEqual(POOL_INITIAL)
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(POOL_INITIAL.THORACIC_SURGERY)
  })

  it('채용 증분만큼 잔여가 준다(이동, 창출 아님)', () => {
    const s = hireDelta(initSystem(), { CARDIOLOGY: 2 })
    expect(poolRemaining(s, 'CARDIOLOGY')).toBe(POOL_INITIAL.CARDIOLOGY - 2)
  })

  it('잔여 0이면 못 뽑는다(canHire=false) — 돈 있어도 못 사는 벽', () => {
    let s = initSystem()
    s = hireDelta(s, { THORACIC_SURGERY: POOL_INITIAL.THORACIC_SURGERY })
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(0)
    expect(canHire(s, 'THORACIC_SURGERY', 1)).toBe(false)
    expect(canHire(s, 'THORACIC_SURGERY', 0)).toBe(true)
  })

  it('풀은 0 밑으로 안 내려간다(클램프)', () => {
    const s = hireDelta(initSystem(), { THORACIC_SURGERY: 999 })
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(0)
  })

  it('배경 감소 — 매주 결정론으로 준다(내가 안 뽑아도 마른다)', () => {
    const s0 = initSystem()
    const s1 = backgroundAttrition(s0, 2)
    const total0 = Object.values(s0.pool).reduce((a, b) => a + b, 0)
    const total1 = Object.values(s1.pool).reduce((a, b) => a + b, 0)
    expect(total1).toBeLessThan(total0)
    expect(backgroundAttrition(s0, 2)).toEqual(backgroundAttrition(s0, 2)) // 결정론
  })

  it('배경 감소도 0 클램프 — 이미 빈 과는 음수 안 됨', () => {
    let s = initSystem()
    s.pool.THORACIC_SURGERY = 0
    for (let w = 2; w < 30; w++) s = backgroundAttrition(s, w)
    expect(Object.values(s.pool).every((n) => n >= 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/system.test.ts`
Expected: FAIL — `Cannot find module './system'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/game/system.ts
import type { Specialty } from './types'
import { callSeed, seededUnit } from './daysim'

// 전국 의사 풀 — 이 게임 세상에 존재하는(아직 배치 안 된) 배후과 의사의 수. 순수·결정론.
// 초기값은 게임 스케일 각색(부호·소규모·재생 불가만 근거 — grounding §①. 실제 헤드카운트를
// '현재 실측'으로 쓰지 않는다). 흉부외과가 가장 희소(실제 1,088명 최소)라는 대소만 지킨다.

export interface SystemState {
  pool: Record<Specialty, number>
  poolInitial: Record<Specialty, number> // 표시용 초기 사본(에필로그 "N → 잔여")
}

/** 세상에 존재하는 과별 의사 수(각색). 대소: 흉부 < 순환기·산부·신경 < 외과·내과. */
export const POOL_INITIAL: Record<Specialty, number> = {
  THORACIC_SURGERY: 2,
  CARDIOLOGY: 4,
  OBSTETRICS: 3,
  NEUROSURGERY: 3,
  GENERAL_SURGERY: 5,
  INTERNAL_MEDICINE: 6,
}

export function initSystem(): SystemState {
  return { pool: { ...POOL_INITIAL }, poolInitial: { ...POOL_INITIAL } }
}

export function poolRemaining(system: SystemState, s: Specialty): number {
  return system.pool[s]
}

export function canHire(system: SystemState, s: Specialty, count: number): boolean {
  return system.pool[s] >= count
}

/** 채용 증분(양수)만큼 풀 차감, 0 클램프. 음수 증분(해고)은 무시(성장은 증축만). */
export function hireDelta(system: SystemState, deltas: Partial<Record<Specialty, number>>): SystemState {
  const pool = { ...system.pool }
  for (const key of Object.keys(deltas) as Specialty[]) {
    const d = deltas[key] ?? 0
    if (d > 0) pool[key] = Math.max(0, pool[key] - d)
  }
  return { ...system, pool }
}

/** 매주 배경 감소 — 다른 병원 채용·은퇴>배출. 주차 seed로 한 과를 골라 1 차감(0 클램프). */
export function backgroundAttrition(system: SystemState, week: number): SystemState {
  const keys = Object.keys(POOL_INITIAL) as Specialty[]
  const idx = Math.floor(seededUnit(callSeed(week, 0, 0, 7)) * keys.length)
  const key = keys[idx]
  const pool = { ...system.pool, [key]: Math.max(0, system.pool[key] - 1) }
  return { ...system, pool }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/system.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no output (clean)

```bash
git add src/game/system.ts src/game/system.test.ts
git commit -F .commit-msg-tmp   # 메시지: "feat: 전국 의사 풀 — 세상에 존재하는 유한 의사 수(소진=못 뽑음)" + AI 트레일러
```

---

## Task 2: 금고 산수 (`growth.ts`)

**Files:**
- Create: `src/game/growth.ts`
- Test: `src/game/growth.test.ts`

**Interfaces:**
- Consumes: `hiringCost`(setup.ts), `bedExpansionCost`(Task 5 — 이 task는 임시로 `bedExpansionCost` 스텁 없이 doctor 비용만; 병상 비용은 Task 5 후 합류. **주의**: 이 task에서는 `growthCost`가 doctor delta만 계산한다).
- Produces:
  - `initialTreasury(choices, departments?): number` = 개원 잔액
  - `doctorDeltaCost(prev, next, departments?): number` = 채용 증분 비용
  - `withinTreasury(cost, treasury): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/game/growth.test.ts
import { describe, it, expect } from 'vitest'
import { initialTreasury, doctorDeltaCost, withinTreasury } from './growth'
import { SETUP_BUDGET_BILLIONS } from './setup'
import type { SetupChoices } from './types'

const open: SetupChoices = { hospitalName: 'h', doctors: { AESTHETICS: 3, CHECKUP: 2 } } // 채용비 54

describe('금고 산수', () => {
  it('개원 잔액 = 예산 − 개원 채용비', () => {
    expect(initialTreasury(open)).toBe(SETUP_BUDGET_BILLIONS - 54)
  })

  it('채용 증분 비용 = 늘린 인원 × 채용비', () => {
    const next: SetupChoices = { hospitalName: 'h', doctors: { AESTHETICS: 3, CHECKUP: 2, CARDIOLOGY: 1 } }
    expect(doctorDeltaCost(open, next)).toBe(30) // 순환기 1명 = 30억
  })

  it('증분이 없으면 비용 0(성장 스킵 가능)', () => {
    expect(doctorDeltaCost(open, open)).toBe(0)
  })

  it('금고 이내면 true, 초과면 false', () => {
    expect(withinTreasury(30, 46)).toBe(true)
    expect(withinTreasury(50, 46)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/growth.test.ts`
Expected: FAIL — `Cannot find module './growth'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/game/growth.ts
import type { DepartmentSpec, SetupChoices } from './types'
import { DEPARTMENTS, SETUP_BUDGET_BILLIONS, hiringCost } from './setup'

// 금고 — 쓸 수 있는 잔고. 순수. 개원 잔액에서 출발, 매주 순이익 누적(session.ts), 성장에서 차감.
// 배후과는 구조적 적자라 배후과만 채우면 금고가 말라 성장·유지 불가 → 미용 유혹(② 재정 지속불가).

export function initialTreasury(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): number {
  return SETUP_BUDGET_BILLIONS - hiringCost(choices, departments)
}

/** 채용 증분 비용(억) — next가 prev보다 늘린 인원의 채용비 합. 병상 비용은 session.applyGrowth가 합산. */
export function doctorDeltaCost(
  prev: SetupChoices,
  next: SetupChoices,
  departments: DepartmentSpec[] = DEPARTMENTS,
): number {
  return departments.reduce((sum, d) => {
    const delta = (next.doctors[d.key] ?? 0) - (prev.doctors[d.key] ?? 0)
    return sum + (delta > 0 ? delta * d.hireCostBillions : 0)
  }, 0)
}

export function withinTreasury(cost: number, treasury: number): boolean {
  return cost <= treasury
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/growth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add src/game/growth.ts src/game/growth.test.ts
git commit -F .commit-msg-tmp   # "feat: 금고 산수 — 개원 잔액·채용 증분 비용·잔고 검증"
```

---

## Task 3: 병상 티어 + 과별 상한 (`setup.ts`)

**Files:**
- Modify: `src/game/setup.ts`
- Test: `src/game/setup.test.ts`

**Interfaces:**
- Produces:
  - `BED_TIERS: number[]` = `[3, 5, 7]`
  - `deptCap(dept: DepartmentSpec, beds: number): number` — 필수과는 beds, 수익과는 `MAX_DOCTORS_PER_DEPT`(3 고정 — I8 머니프린터 방지)
  - `bedExpansionCost(fromBeds: number, toBeds: number): number` — 티어 상승 누적 비용(체증)
  - `adjustDoctors(choices, key, delta, cap?)` — cap 인자 추가(기본 `MAX_DOCTORS_PER_DEPT`, 하위호환)
  - `withinDeptCaps(choices, departments?, beds?)` — beds 인자 추가(기본 `FIXED_BEDS`)
  - `buildHospital(choices, departments?, beds?)` — beds 인자 추가(기본 `FIXED_BEDS`)

- [ ] **Step 1: Write the failing test**

```ts
// src/game/setup.test.ts — describe 블록 추가
import { BED_TIERS, deptCap, bedExpansionCost } from './setup'

describe('병상 티어 — 성장의 용량 축', () => {
  it('티어는 [3,5,7]이고 기본은 FIXED_BEDS(3)', () => {
    expect(BED_TIERS).toEqual([3, 5, 7])
    expect(BED_TIERS[0]).toBe(FIXED_BEDS)
  })

  it('필수과 상한 = beds, 수익과 상한 = 3 고정(머니프린터 방지)', () => {
    const cardio = DEPARTMENTS.find((d) => d.key === 'CARDIOLOGY')!
    const aesth = DEPARTMENTS.find((d) => d.key === 'AESTHETICS')!
    expect(deptCap(cardio, 5)).toBe(5)  // 필수과는 병상 따라 오름
    expect(deptCap(aesth, 5)).toBe(MAX_DOCTORS_PER_DEPT) // 수익과는 3 고정
    expect(deptCap(aesth, 7)).toBe(MAX_DOCTORS_PER_DEPT)
  })

  it('병상 증설 비용은 체증하고, 같은 티어면 0', () => {
    expect(bedExpansionCost(3, 3)).toBe(0)
    expect(bedExpansionCost(3, 5)).toBe(60)
    expect(bedExpansionCost(5, 7)).toBe(100)
    expect(bedExpansionCost(3, 7)).toBe(160) // 누적
  })

  it('withinDeptCaps: 필수과는 beds까지 허용', () => {
    const c = { hospitalName: 'h', doctors: { CARDIOLOGY: 5 } }
    expect(withinDeptCaps(c, DEPARTMENTS, 3)).toBe(false) // beds 3이면 상한 3
    expect(withinDeptCaps(c, DEPARTMENTS, 5)).toBe(true)  // beds 5면 5 허용
  })

  it('buildHospital(beds)는 hospital.beds에 반영', () => {
    const { hospital } = buildHospital({ hospitalName: 'h', doctors: { CARDIOLOGY: 2 } }, DEPARTMENTS, 5)
    expect(hospital.beds).toBe(5)
  })

  it('adjustDoctors(cap): 명시 상한까지 허용', () => {
    const c = { hospitalName: 'h', doctors: {} }
    expect(adjustDoctors(c, 'CARDIOLOGY', 5, 5).doctors.CARDIOLOGY).toBe(5)
    expect(adjustDoctors(c, 'CARDIOLOGY', 9, 5).doctors.CARDIOLOGY).toBe(5) // 상한 클램프
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/setup.test.ts`
Expected: FAIL — `BED_TIERS is not exported` 등

- [ ] **Step 3: Write minimal implementation**

`src/game/setup.ts`에 추가/수정:

```ts
/** 병상 티어 — 성장의 용량 축. 첫 티어 = FIXED_BEDS(개원값). */
export const BED_TIERS = [FIXED_BEDS, 5, 7]

/** 티어 상승 누적 비용(억) — 체증(④ 지역 총량 규제 각색). key = 목표 병상. */
const BED_STEP_COST: Record<number, number> = { 5: 60, 7: 100 }

export function bedExpansionCost(fromBeds: number, toBeds: number): number {
  let cost = 0
  for (const tier of BED_TIERS) {
    if (tier > fromBeds && tier <= toBeds) cost += BED_STEP_COST[tier] ?? 0
  }
  return cost
}

/** 과별 채용 상한 — 필수과는 병상 따라 오르고, 수익과는 3 고정(I8 머니프린터 방지). */
export function deptCap(dept: DepartmentSpec, beds: number): number {
  return dept.essential ? beds : MAX_DOCTORS_PER_DEPT
}
```

`adjustDoctors` 시그니처에 cap 추가(기존 `MAX_DOCTORS_PER_DEPT` 기본값):

```ts
export function adjustDoctors(
  choices: SetupChoices,
  key: DeptKey,
  delta: number,
  cap: number = MAX_DOCTORS_PER_DEPT,
): SetupChoices {
  const current = choices.doctors[key] ?? 0
  const next = Math.min(cap, Math.max(0, Math.floor(current + delta)))
  const doctors = { ...choices.doctors }
  if (next === 0) delete doctors[key]
  else doctors[key] = next
  return { ...choices, doctors }
}
```

`withinDeptCaps`에 beds 추가:

```ts
export function withinDeptCaps(
  choices: SetupChoices,
  departments: DepartmentSpec[] = DEPARTMENTS,
  beds: number = FIXED_BEDS,
): boolean {
  return departments.every((d) => count(choices, d.key) <= deptCap(d, beds))
}
```

`buildHospital`에 beds 추가(기본 `FIXED_BEDS`, `hospital.beds`에 반영):

```ts
export function buildHospital(
  choices: SetupChoices,
  departments: DepartmentSpec[] = DEPARTMENTS,
  beds: number = FIXED_BEDS,
): { hospital: Hospital; economics: HospitalEconomics } {
  // ... 기존 본문 ...
  const hospital: Hospital = {
    id: 'player',
    name: choices.hospitalName,
    beds, // FIXED_BEDS → 인자 beds
    // ... 나머지 동일 ...
  }
  return { hospital, economics }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/setup.test.ts`
Expected: PASS (신규 + 기존 전부 — `MAX_DOCTORS_PER_DEPT === FIXED_BEDS`·`buildHospital` 기본 beds=3 회귀 포함)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add src/game/setup.ts src/game/setup.test.ts
git commit -F .commit-msg-tmp   # "feat: 병상 티어·과별 상한(필수과=병상/수익과=3 고정)·병상 증설 비용"
```

---

## Task 4: 세션 상태 필드 + 개원 보존 + 금고 누적 (`session.ts`)

**Files:**
- Modify: `src/game/session.ts`
- Test: `src/game/session.test.ts`

**Interfaces:**
- Consumes: `initSystem`(system.ts), `initialTreasury`(growth.ts), `FIXED_BEDS`(setup.ts)
- Produces: `SessionState`에 `choices: SetupChoices`, `beds: number`, `treasury: number`, `system: SystemState` 추가. `completeSetup`이 이들을 채우고, `completeWeek`이 `treasury += weekNet`.

- [ ] **Step 1: Write the failing test**

```ts
// src/game/session.test.ts — describe 추가
import { initSystem, POOL_INITIAL } from './system'
import { SETUP_BUDGET_BILLIONS } from './setup'

describe('성장 상태 — 개원 보존 + 금고', () => {
  const choices = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } } // 채용비 10+60=70

  it('completeSetup이 choices·beds·treasury·system을 보존한다', () => {
    const s = completeSetup(choices)
    expect(s.choices).toEqual(choices)
    expect(s.beds).toBe(3)
    expect(s.treasury).toBe(SETUP_BUDGET_BILLIONS - 70) // 개원 잔액
    expect(s.system.pool).toEqual(POOL_INITIAL)
  })

  it('completeWeek이 이번 주 순이익을 금고에 더한다', () => {
    let s = completeSetup(choices)
    s = { ...s, phase: 'DAY_END', day: 7,
      ledgerDays: [{ day: 7, netProfitBillions: 40, segmentShareBillions: 0, callDeltaBillions: 0,
        workupRevenueBillions: 0, workupCount: 0, turnedAway: [], receivedEmergency: 0, accepted: 0,
        blocked: 0, lawsuitExposure: 0 }] }
    const before = s.treasury
    const after = completeWeek(s)
    expect(after.treasury).toBe(before + 40)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/session.test.ts`
Expected: FAIL — `s.choices` undefined / `treasury` 없음

- [ ] **Step 3: Write minimal implementation**

`src/game/session.ts`:
- import: `import { initSystem, backgroundAttrition, type SystemState } from './system'` · `import { initialTreasury } from './growth'` · `FIXED_BEDS`를 setup import에 추가.
- `SessionState`에 필드 추가:

```ts
export interface SessionState {
  // ... 기존 ...
  choices: SetupChoices   // 현재 병원 명단(매주 성장). 1주차 이후 재투자의 시작점.
  beds: number            // 병상 티어(초기 FIXED_BEDS).
  treasury: number        // 금고 잔고(억).
  system: SystemState     // 전국 의사 풀.
}
```

- `startSession`·`enterWorldEvent`·`beginSetup`의 반환 객체에 초기값 추가(개원 전이라 빈 값): `choices: { hospitalName: '', doctors: {} }, beds: FIXED_BEDS, treasury: 0, system: initSystem()`.
- `completeSetup`:

```ts
export function completeSetup(choices: SetupChoices, world: WorldState = initWorld()): SessionState {
  const { hospital } = buildHospital(choices, world.departments)
  return {
    phase: 'RECEIVING',
    hospital,
    receiving: initReceiving(hospital, weekDayQueue(1, 1)),
    world, week: 1, day: 1, ledgerDays: [], history: [], morningNews: [], fatigue: {},
    choices,
    beds: FIXED_BEDS,
    treasury: initialTreasury(choices, world.departments),
    system: initSystem(),
  }
}
```

- `completeWeek`에 금고 누적:

```ts
export function completeWeek(state: SessionState): SessionState {
  if (state.phase !== 'DAY_END') throw new Error(`completeWeek requires DAY_END, got ${state.phase}`)
  if (!isLastDay(state)) throw new Error('completeWeek requires the last day (day 7)')
  const weekNet = state.ledgerDays.reduce((n, d) => n + d.netProfitBillions, 0)
  return { ...state, phase: 'WEEK_SUMMARY', history: [...state.history, ...state.ledgerDays], treasury: state.treasury + weekNet }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/session.test.ts`
Expected: PASS (신규 + 기존 회귀. 기존 테스트가 `completeSetup` 반환에 새 필드를 요구하지 않으면 통과 — 추가 필드는 무해)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean (⚠️ `SessionState` 필수 필드 추가로 이를 리터럴 생성하는 모든 지점 — `startSession`/`enterWorldEvent`/`beginSetup` — 이 새 필드를 채워야 tsc 통과)

```bash
git add src/game/session.ts src/game/session.test.ts
git commit -F .commit-msg-tmp   # "feat: 세션에 choices·beds·treasury·system 보존 + 금고 주간 누적"
```

---

## Task 5: GROWTH 페이즈 + 성장 적용 (`session.ts`)

**Files:**
- Modify: `src/game/session.ts`
- Test: `src/game/session.test.ts`

**Interfaces:**
- Consumes: `hireDelta`·`canHire`·`backgroundAttrition`(system.ts), `doctorDeltaCost`·`withinTreasury`(growth.ts), `bedExpansionCost`·`withinDeptCaps`·`buildHospital`(setup.ts)
- Produces:
  - `SessionPhase`에 `'GROWTH'` 추가
  - `enterGrowth(state): SessionState` — WORLD_EVENT → GROWTH(2주차+)
  - `growthCostOf(state, nextChoices, nextBeds): number` — 채용 증분 + 병상 비용
  - `canApplyGrowth(state, nextChoices, nextBeds): boolean` — 해고 없음 · 금고·상한·풀 이내
  - `applyGrowth(state, nextChoices, nextBeds): SessionState` — 병원 재구성 + 금고/풀 차감 + choices/beds 갱신(GROWTH 유지)
  - `beginWeek` 가드를 `WORLD_EVENT` → `GROWTH`로 변경. `nextWeek`에 `backgroundAttrition`.

- [ ] **Step 1: Write the failing test**

```ts
// src/game/session.test.ts — describe 추가
import { POOL_INITIAL } from './system'

describe('GROWTH — 재투자 적용', () => {
  // 금고 넉넉한 상태를 만든다(2주차 진입 흉내)
  function grown() {
    let s = completeSetup({ hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 1 } })
    s = { ...s, treasury: 200, phase: 'GROWTH', week: 2 }
    return s
  }

  it('성장 비용 = 채용 증분 + 병상 증설', () => {
    const s = grown() // 현재 순환기1, beds 3
    const next = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }
    expect(growthCostOf(s, next, 5)).toBe(30 + 60) // 순환기 1명(30) + 병상 3→5(60)
  })

  it('applyGrowth: 병원 재구성 + 금고·풀 차감 + choices 갱신', () => {
    const s = grown()
    const next = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }
    const after = applyGrowth(s, next, 5)
    expect(after.beds).toBe(5)
    expect(after.choices).toEqual(next)
    expect(after.treasury).toBe(200 - 90)
    expect(after.hospital!.roster!.filter((d) => d.dept === 'CARDIOLOGY')).toHaveLength(2)
    expect(after.system.pool.CARDIOLOGY).toBe(POOL_INITIAL.CARDIOLOGY - 1) // 증분 1만 차감
    expect(after.hospital!.roundTheClockBackup).toContain('CARDIOLOGY') // 2명 → 24h
  })

  it('풀 소진 과는 성장 불가(돈 있어도)', () => {
    let s = grown()
    s = { ...s, system: { ...s.system, pool: { ...s.system.pool, CARDIOLOGY: 1 } } }
    const next = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 3 } } // +2 필요, 잔여 1
    expect(canApplyGrowth(s, next, 3)).toBe(false)
  })

  it('금고 초과 성장 불가', () => {
    const s = { ...grown(), treasury: 20 }
    const next = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } } // 30억 필요
    expect(canApplyGrowth(s, next, 3)).toBe(false)
  })

  it('해고(증분 음수)는 불가', () => {
    const s = grown()
    const next = { hospitalName: '한바다', doctors: { CARDIOLOGY: 0 } }
    expect(canApplyGrowth(s, next, 3)).toBe(false)
  })

  it('enterGrowth: WORLD_EVENT(병원 있음) → GROWTH', () => {
    let s = completeSetup({ hospitalName: '한바다', doctors: { AESTHETICS: 1 } })
    s = { ...s, phase: 'WORLD_EVENT', week: 2 }
    expect(enterGrowth(s).phase).toBe('GROWTH')
  })

  it('beginWeek: GROWTH → RECEIVING(같은 병원)', () => {
    const s = { ...grown(), phase: 'GROWTH' as const }
    expect(beginWeek(s).phase).toBe('RECEIVING')
  })

  it('nextWeek이 배경 풀 감소를 적용한다', () => {
    let s = completeSetup({ hospitalName: '한바다', doctors: { AESTHETICS: 1 } })
    s = { ...s, phase: 'WEEK_SUMMARY' }
    const before = Object.values(s.system.pool).reduce((a, b) => a + b, 0)
    const after = nextWeek(s)
    const total = Object.values(after.system.pool).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThan(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/session.test.ts`
Expected: FAIL — `applyGrowth` 등 미정의

- [ ] **Step 3: Write minimal implementation**

`src/game/session.ts`:
- import 추가: `hireDelta, canHire, backgroundAttrition` (system) · `doctorDeltaCost, withinTreasury` (growth) · `bedExpansionCost, withinDeptCaps, buildHospital` (setup, 일부 기존).
- `SessionPhase`에 `'GROWTH'` 추가.
- 함수:

```ts
/** 성장 총비용(억) = 채용 증분 + 병상 증설. */
export function growthCostOf(state: SessionState, nextChoices: SetupChoices, nextBeds: number): number {
  const deps = state.world?.departments
  return doctorDeltaCost(state.choices, nextChoices, deps) + bedExpansionCost(state.beds, nextBeds)
}

/** 배후과 증분(양수)만 뽑아 풀 검증에 쓴다. */
function backupDeltas(state: SessionState, next: SetupChoices): Partial<Record<Specialty, number>> {
  const deps = state.world?.departments ?? []
  const out: Partial<Record<Specialty, number>> = {}
  for (const d of deps) {
    if (!d.providesBackup) continue
    const delta = (next.doctors[d.key] ?? 0) - (state.choices.doctors[d.key] ?? 0)
    if (delta !== 0) out[d.providesBackup] = (out[d.providesBackup] ?? 0) + delta
  }
  return out
}

/** 성장 가능한가 — 해고 없음 · 금고·상한·풀 이내. */
export function canApplyGrowth(state: SessionState, next: SetupChoices, nextBeds: number): boolean {
  const deps = state.world?.departments
  // 해고 방지: 모든 과가 현재 이상
  const noFiring = (deps ?? []).every((d) => (next.doctors[d.key] ?? 0) >= (state.choices.doctors[d.key] ?? 0))
  if (!noFiring) return false
  if (!withinDeptCaps(next, deps, nextBeds)) return false
  if (!withinTreasury(growthCostOf(state, next, nextBeds), state.treasury)) return false
  const deltas = backupDeltas(state, next)
  return (Object.keys(deltas) as Specialty[]).every((s) => canHire(state.system, s, deltas[s] ?? 0))
}

/** WORLD_EVENT(병원 있음) → GROWTH. */
export function enterGrowth(state: SessionState): SessionState {
  if (state.phase !== 'WORLD_EVENT') throw new Error(`enterGrowth requires WORLD_EVENT, got ${state.phase}`)
  if (!state.hospital) throw new Error('enterGrowth requires an existing hospital')
  return { ...state, phase: 'GROWTH' }
}

/** 성장 적용 — 병원 재구성 + 금고/풀 차감 + choices/beds 갱신. GROWTH 유지(이어서 beginWeek). */
export function applyGrowth(state: SessionState, next: SetupChoices, nextBeds: number): SessionState {
  if (state.phase !== 'GROWTH') throw new Error(`applyGrowth requires GROWTH, got ${state.phase}`)
  const deps = state.world?.departments
  const cost = growthCostOf(state, next, nextBeds)
  const { hospital } = buildHospital(next, deps, nextBeds)
  return {
    ...state,
    hospital,
    choices: next,
    beds: nextBeds,
    treasury: state.treasury - cost,
    system: hireDelta(state.system, backupDeltas(state, next)),
  }
}
```

- `beginWeek` 가드 변경: `if (state.phase !== 'GROWTH')` (기존 `'WORLD_EVENT'`). 큐 생성에 beds 전달은 Task 6에서.
- `nextWeek`에 배경 감소: 반환 객체에 `system: backgroundAttrition(state.system, week)` 추가.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/session.test.ts`
Expected: PASS (신규 + 기존)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add src/game/session.ts src/game/session.test.ts
git commit -F .commit-msg-tmp   # "feat: GROWTH 페이즈 — 재투자 적용(금고·풀·상한 검증) + 배경 풀 감소"
```

---

## Task 6: 병상 연동 콜 볼륨 (`receiving.ts` + `session.ts` 배선)

**Files:**
- Modify: `src/game/receiving.ts`, `src/game/session.ts`
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Produces: `callsForBeds(beds): number` = `beds + 2`. `createCallQueue(day?, beds?)` — beds로 콜 수 결정(기본 `FIXED_BEDS` → 5통, 하위호환).
- Consumes(session): `weekDayQueue(week, day, beds)` — beds 전달.

- [ ] **Step 1: Write the failing test**

```ts
// src/game/receiving.test.ts — describe 추가
import { callsForBeds, createCallQueue } from './receiving'
import { FIXED_BEDS } from './setup'

describe('병상 연동 콜 볼륨 — 커지면 환자도 더 온다', () => {
  it('콜 수 = beds + 2 (3→5, 5→7, 7→9)', () => {
    expect(callsForBeds(3)).toBe(5)
    expect(callsForBeds(5)).toBe(7)
    expect(callsForBeds(7)).toBe(9)
  })

  it('기본(beds 미지정)은 5통 — 기존 동작 불변', () => {
    expect(createCallQueue(1)).toHaveLength(5)
    expect(createCallQueue(1, FIXED_BEDS)).toHaveLength(5)
  })

  it('큰 병원은 더 많은 콜(같은 날 결정론)', () => {
    expect(createCallQueue(1, 5)).toHaveLength(7)
    expect(createCallQueue(1, 7)).toHaveLength(9)
    expect(createCallQueue(1, 7)).toEqual(createCallQueue(1, 7)) // 결정론
  })

  it('콜 id는 고유(볼륨 늘어도 React key 충돌 없음)', () => {
    const ids = createCallQueue(1, 7).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('야간은 arrivalMin에서 파생 — 볼륨 늘어도 정합', () => {
    const q = createCallQueue(1, 7)
    expect(q.every((c) => c.nightShift === (c.arrivalMin! >= 480))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/receiving.test.ts`
Expected: FAIL — `callsForBeds` 미정의 / `createCallQueue(1,5)` 길이 5

- [ ] **Step 3: Write minimal implementation**

`src/game/receiving.ts`:
- import에 `FIXED_BEDS` 추가(setup).
- `callsForBeds` + `createCallQueue` 수정:

```ts
/** 병상 연동 하루 콜 수 — 큰 병원 = 더 많은 환자(사용자 결정). 3→5·5→7·7→9. */
export function callsForBeds(beds: number): number {
  return beds + 2
}

export function createCallQueue(day = 1, beds = FIXED_BEDS): IncomingCall[] {
  const basePlan = DAY_PLANS[(day - 1) % DAY_PLANS.length]
  const count = callsForBeds(beds)
  // 티어별로 기본 플랜(5통)을 순환 연장해 count통을 채운다 — 새 콘텐츠 0, 믹스 비율 보존, 결정론.
  const plan = Array.from({ length: count }, (_, i) => basePlan[i % basePlan.length])
  const seen: Partial<Record<CallKind, number>> = {}
  const timed = plan.map(({ kind, dept }, i) => {
    const occurrence = seen[kind] ?? 0
    seen[kind] = occurrence + 1
    const arrivalMin = arrivalMinFor(1, day, i, plan.length)
    return {
      id: `d${day}c${i + 1}`,
      kind,
      label: kind === 'SPECIALIST_ELECTIVE'
        ? electiveLabel(dept ?? 'CARDIOLOGY')
        : CALL_LABELS[kind][occurrence % CALL_LABELS[kind].length],
      patient: kind === 'SPECIALIST_ELECTIVE' ? electivePatientFor(dept ?? 'CARDIOLOGY') : PATIENT_OF[kind],
      lawsuitRisk: carriesLawsuitRisk(kind),
      nightShift: arrivalMin >= NIGHT_START_MIN,
      arrivalMin,
      durationMin: procedureDurationMin(kind, 1, day, i),
    }
  })
  return timed.sort((a, b) => a.arrivalMin - b.arrivalMin)
}
```

`src/game/session.ts`:
- `weekDayQueue`에 beds 추가:

```ts
function weekDayQueue(week: number, day: number, beds: number) {
  return createCallQueue((week - 1) * DAYS_PER_WEEK + day, beds)
}
```

- 호출부 3곳에 `state.beds` 전달: `completeSetup`(→ `weekDayQueue(1, 1, FIXED_BEDS)`), `advanceDay`(→ `weekDayQueue(state.week, day, state.beds)`), `beginWeek`(→ `weekDayQueue(state.week, 1, state.beds)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/receiving.test.ts src/game/session.test.ts`
Expected: PASS (신규 + 기존 — 기본 5통 회귀 포함)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add src/game/receiving.ts src/game/session.ts src/game/receiving.test.ts
git commit -F .commit-msg-tmp   # "feat: 병상 연동 콜 볼륨 — 큰 병원은 더 많은 환자(3→5·5→7·7→9)"
```

---

## Task 7: 주간 결산에 금고 표시 (`WeekSummary.tsx`)

**Files:**
- Modify: `src/components/WeekSummary.tsx`, `src/components/SessionClient.tsx`

**Interfaces:**
- Consumes: `session.treasury`. `WeekSummary`에 `treasury: number` prop 추가.

- [ ] **Step 1: Modify WeekSummary — 금고 줄 추가**

`src/components/WeekSummary.tsx` prop에 `treasury: number` 추가하고, 누적 손익 줄 아래에 금고 표시:

```tsx
// props에 treasury 추가
// 누적 손익 div 바로 아래:
<div className="flex items-baseline justify-between font-mono text-sm">
  <span className="font-sans text-zinc-400">금고 (다음 주 재투자 가능액)</span>
  <span className={`tabular-nums font-semibold ${treasury < 0 ? "text-red-400" : "text-zinc-100"}`}>
    {formatSignedBillions(treasury)}
  </span>
</div>
```

- [ ] **Step 2: 배선 — SessionClient에서 treasury 전달**

`src/components/SessionClient.tsx`의 `WEEK_SUMMARY` 케이스에 `treasury={session.treasury}` 추가.

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/components/WeekSummary.tsx src/components/SessionClient.tsx
git commit -F .commit-msg-tmp   # "feat: 주간 결산에 금고(재투자 가능액) 표시"
```

---

## Task 8: 재투자 화면 (`GrowthPhase.tsx`)

**Files:**
- Create: `src/components/GrowthPhase.tsx`

**Interfaces:**
- Consumes: `adjustDoctors`·`deptCap`·`BED_TIERS`·`bedExpansionCost`(setup), `growthCostOf`·`canApplyGrowth`(session), `poolRemaining`(system), `SPECIALTY_LABEL`(labels).
- Produces: `<GrowthPhase state={SessionState} onComplete={(choices, beds) => void} />`. onComplete은 확정된 choices·beds를 넘긴다(스킵 = 현재값 그대로).

- [ ] **Step 1: Write the component**

```tsx
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
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/components/GrowthPhase.tsx
git commit -F .commit-msg-tmp   # "feat: 재투자 화면 — 금고로 병상·배후과 증축(풀 잔여 = 천장)"
```

---

## Task 9: GROWTH 배선 (`SessionClient.tsx`)

**Files:**
- Modify: `src/components/SessionClient.tsx`

**Interfaces:**
- Consumes: `enterGrowth`·`applyGrowth`·`beginWeek`(session), `GrowthPhase`.

- [ ] **Step 1: 배선 수정**

`src/components/SessionClient.tsx`:
- import: `enterGrowth, applyGrowth`(session), `GrowthPhase from "./GrowthPhase"`.
- `WORLD_EVENT` 케이스의 `onContinue`를 병원 있으면 `enterGrowth`로:

```tsx
onContinue={() => setSession(session.hospital ? enterGrowth(session) : beginSetup(session))}
```

- `GROWTH` 케이스 추가:

```tsx
case "GROWTH":
  return (
    <GrowthPhase
      state={session}
      onComplete={(choices, beds) => setSession(beginWeek(applyGrowth(session, choices, beds)))}
    />
  );
```

- [ ] **Step 2: 타입 확인 + 회귀**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean · 기존 302+ 테스트 green

- [ ] **Step 3: Commit**

```bash
git add src/components/SessionClient.tsx
git commit -F .commit-msg-tmp   # "feat: GROWTH 배선 — 공문 → 재투자 → 이번 주 진료"
```

---

## Task 10: 에필로그 전국·지방 병치 (`Epilogue.tsx` + `session.ts`)

**Files:**
- Modify: `src/game/session.ts`(`buildEpilogue`·`SessionEpilogue`), `src/components/Epilogue.tsx`

**Interfaces:**
- Produces: `SessionEpilogue`에 `poolDepletion: { label: string; initial: number; remaining: number }[]` 추가(채용해 잔여가 준 배후과만). `buildEpilogue`가 `state.system`에서 파생.

- [ ] **Step 1: Write the failing test**

```ts
// src/game/session.test.ts — describe 추가
describe('에필로그 — 전국 풀 소진 병치', () => {
  it('buildEpilogue가 잔여가 준 배후과를 poolDepletion으로 노출', () => {
    let s = completeSetup({ hospitalName: '한바다', doctors: { CARDIOLOGY: 2 } })
    // 순환기 2 채용 → 풀 차감된 상태 흉내
    s = { ...s, phase: 'EPILOGUE', system: { ...s.system, pool: { ...s.system.pool, CARDIOLOGY: s.system.poolInitial.CARDIOLOGY - 2 } } }
    const epi = buildEpilogue(s)
    const cardio = epi.poolDepletion.find((p) => p.label === '순환기내과')!
    expect(cardio.remaining).toBe(cardio.initial - 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/session.test.ts`
Expected: FAIL — `epi.poolDepletion` undefined

- [ ] **Step 3: Implement buildEpilogue**

`src/game/session.ts`:
- import `SPECIALTY_LABEL`(labels), `Specialty`(types 이미 있음).
- `SessionEpilogue`에 필드 추가: `poolDepletion: { label: string; initial: number; remaining: number }[]`.
- `buildEpilogue` 반환에 추가:

```ts
const poolDepletion = (Object.keys(state.system.poolInitial) as Specialty[])
  .map((s) => ({ label: SPECIALTY_LABEL[s], initial: state.system.poolInitial[s], remaining: state.system.pool[s] }))
  .filter((p) => p.remaining < p.initial) // 잔여가 준 것만(내가 뽑았거나 배경 감소)
return { ledger, weekNews, poolDepletion }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/session.test.ts`
Expected: PASS

- [ ] **Step 5: Epilogue 컴포넌트 — 전국·지방 층 추가**

`src/components/Epilogue.tsx`:
- `epilogue.poolDepletion`을 받아 `WeekPaper` 아래에 **전국·지방 패널** 추가. 고정 실제 앵커 + 풀 소진. 해석 카피 0:

```tsx
// WeekPaper/LedgerPanel 아래에 추가
<div className="w-full max-w-sm">
  <p className="mb-3 text-center text-xs uppercase tracking-[0.3em] text-on-desk-muted">전국 · 같은 기간</p>
  <ul className="flex flex-col gap-2 paper-card px-5 py-4 text-sm text-ink">
    {epilogue.poolDepletion.map((p) => (
      <li key={p.label} className="flex items-baseline justify-between border-l-2 border-rule pl-3">
        <span>{p.label} 전국 배후 전문의</span>
        <span className="font-mono tabular-nums">{p.initial} → {p.remaining}</span>
      </li>
    ))}
    <li className="border-l-2 border-rule pl-3 text-[12px] text-ink-2">지방 산부인과 입원 40.3%가 수도권으로 · 수도권 분원 6,600병상 · 재이송 5,657건(2024)</li>
  </ul>
</div>
```

- [ ] **Step 6: 타입 확인 + commit**

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add src/game/session.ts src/components/Epilogue.tsx src/game/session.test.ts
git commit -F .commit-msg-tmp   # "feat: 에필로그 전국·지방 병치 — 내 신문↔전국 풀 소진·고정 앵커"
```

---

## Task 11: 브라우저 I8 완주 검증 (테스트 밖 유일 검증)

**Files:** (없음 — 검증 전용. 필요 시 튜닝 커밋만)

- [ ] **Step 1: 전체 테스트 + 빌드**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: 모두 green

- [ ] **Step 2: 최대 병상 7일 완주(브라우저)**

`preview_start`로 dev 서버 → 개원 → 매주 재투자에서 **병상을 최대(7)까지 증설 + 배후과 최대 채용** → 7일 완주 여러 주.
확인: (1) `read_console_messages` 콘솔 0 에러, (2) 주간 순이익·금고 숫자가 **|net| ≤ 4 × 100 = 400억** 안(I8), (3) 풀 소진 시 그 과 + 버튼 비활성, (4) 에필로그 전국 병치 렌더.

- [ ] **Step 3: I8 위반 시 튜닝**

|주간 순이익|이 400억을 넘으면 `callsForBeds`(볼륨) 또는 `CALL_ECONOMICS` 델타를 조정하고 재검증. 스크린샷으로 사용자에게 결과 공유.

- [ ] **Step 4: (튜닝 있었으면) commit**

```bash
git add -A
git commit -F .commit-msg-tmp   # "fix: 최대 병상 I8 튜닝 — 볼륨/델타 조정"
```

---

## Self-Review

**Spec coverage:**
- §4 상태 모델(choices/beds/treasury/system) → Task 4 ✓
- §5 페이즈 전이(completeSetup/completeWeek/nextWeek/enterGrowth/applyGrowth/beginWeek) → Task 4·5 ✓
- §6 레버 A 채용 재투자 → Task 8(GrowthPhase) + Task 5(applyGrowth) ✓
- §7 레버 B 병상 증설(cap + 볼륨) → Task 3(cap/tier) + Task 6(볼륨) ✓
- §8 ② 금고 → Task 2·4 ✓
- §9 ①③ 시스템 카운터(풀·소진 게이트·배경 감소) → Task 1·5 ✓
- §10 에필로그 병치 → Task 10 ✓
- §11 불변식(판정 불가침·I8·결정론·show-don't-tell·왜곡 금지) → Global Constraints + Task 11(I8) ✓
- §12 테스트(TDD·tsc·회귀·브라우저 I8) → 각 task Step + Task 11 ✓

**Placeholder scan:** "이번 task는 임시로"(Task 2 병상 비용 합류)는 실제 코드가 있는 실 의존이지 placeholder 아님 — Task 5 applyGrowth가 `bedExpansionCost`를 합산(growthCostOf). 나머지 스텝은 실 코드·명령·기대출력 포함. ✓

**Type consistency:** `SystemState`(pool/poolInitial) · `growthCostOf`/`canApplyGrowth`/`applyGrowth`(state, next, nextBeds) · `hireDelta`/`canHire`(system, ...) · `deptCap(dept, beds)` · `createCallQueue(day, beds)` · `buildHospital(choices, deps, beds)` — Task 간 시그니처 일치 확인 ✓. `SessionEpilogue.poolDepletion` Task 10에서만 정의·소비 ✓.

**미해결(planning에서 확정 완료)**: 병상 티어 `[3,5,7]`·콜 수 `beds+2`·풀 초기값(`POOL_INITIAL`)·배경 감소(주당 1과 −1)·금고 초기값(개원 잔액)·GrowthPhase 신규 컴포넌트 — 전부 이 계획에 구체값으로 잠금. Task 11에서 I8 튜닝.
