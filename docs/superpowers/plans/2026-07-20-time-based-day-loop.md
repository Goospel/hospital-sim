---
tags:
  - type/plan
---

# 시간 기반 하루 루프 · 전문의 점유 벽 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하루를 콜 5통 고정 큐에서 시계(9시~마감)로 바꾸고, 진료 소요시간(seed 결정론)이 배후과 의사를 점유해 응급이 자유 의사 없으면 벽(`NO_FREE_SPECIALIST`)이 되게 한다. 능동 거절 제거.

**Architecture:** 기존 `ReceivingState`(queue+index+log)를 재활용한 이산 이벤트 시뮬레이션. 각 콜에 seed 파생 `arrivalMin`·`durationMin`을 붙여 도착순으로 정렬하고, 의사별 `busyUntil`로 점유를 추적한다. 응급은 자유 전문의 있으면 자동 수용·없으면 벽(플레이어 결정 없음), 선택진료(미용·검진·배후과 예약)만 플레이어가 받을지 정한다. 병상(beds) 벽은 제거. 순수 시간 원시함수는 새 모듈 `daysim.ts`.

**Tech Stack:** TypeScript, Next.js 16, React 19, Tailwind 4, vitest 4. 게임 로직 TDD, 컴포넌트는 브라우저 검증.

**설계 근거:** [스펙](../specs/2026-07-20-time-based-day-loop-design.md) · [리서치](../../research/physician-workflow-and-backup-occupancy.md).

## Global Constraints

- **RNG-0 (결정론)**: `Math.random`·`Date.now`·인자 없는 `new Date()` 금지. 모든 소요시간·도착시각은 `(week, day, index)`에서 순수 해시로 파생 — 같은 (주,날)은 항상 같은 전개(테스트·재현 가능).
- **0-침습 판정 로직**: `adjudicateTransfer`의 배후과 판정(requiredSpecialty)은 무변경. 자원 게이트(병상→전문의 점유)만 교체.
- **부호·방향만 근거, 금액 각색**: 새 경제값(선택진료 흑자)은 부호(+)·대소만 근거([fee-schedule-and-subsidies.md](../../research/fee-schedule-and-subsidies.md): 검체 160%·시술 흑자), 금액은 각색.
- **show-don't-tell**: UI에 해석 카피 0. 시각·점유·벽만 보여준다.
- **게이트**: 매 커밋 `npx vitest run` 전량 green **+** `npx tsc --noEmit` 0 (esbuild가 타입 안 봄 — 둘 다 필수).
- **한글 커밋**: T-026 절차(`.commit-msg-tmp` UTF-8 + `git commit -F`) + AI 추적 트레일러(`Skills-used`…`Co-Authored-By` 사이 빈 줄 없이 연속, 본문과는 빈 줄 1개로 분리).

---

## File Structure

- `src/game/daysim.ts` (**신규**) — 순수 시간 원시함수: seed 해시, 종목별 소요시간, 도착시각, 점유 헬퍼. 런타임 임포트는 `./types`(type-only)만.
- `src/game/daysim.test.ts` (**신규**) — Task 1·2 테스트.
- `src/game/types.ts` — `RejectionReason`에 `NO_FREE_SPECIALIST` 추가, `CallKind`에 `SPECIALIST_ELECTIVE` 추가, `IncomingCall`에 `arrivalMin`·`durationMin`.
- `src/game/receiving.ts` — `ReceivingState`(bedsFree 제거, clockMin·busyUntil 추가), `createCallQueue`(도착순·선택진료 혼합), `hardlockReason`(점유 벽), `decide`(응급 자동·선택 점유), `dayProgress`(시간 기반), `CALL_ECONOMICS`(SPECIALIST_ELECTIVE), `isElective`.
- `src/game/receiving.test.ts` — 갱신.
- `src/game/session.ts` — `completeReceiving`(boarding→의사 이월), `initReceiving`(busyUntil 초기), 야간 규칙.
- `src/game/session.test.ts` — 갱신.
- `src/game/doctor.ts` — `doctorCaseloads`가 새 `ReceivingState` 형태 대응(busyUntil 무관, log 기반 유지). 필요 시 표시용 점유 헬퍼.
- `src/components/ReceivingPhase.tsx` — 시계 표시, 선택진료=결정/응급=자동배너, 남은 자리 제거. (브라우저 검증)
- `src/components/DoctorRoster.tsx` — 현재 점유(진료 중/자유) 표시. (브라우저 검증)
- `src/components/SessionClient.tsx` — prop 전달 조정.

## Interfaces (태스크 간 계약 — 정확한 시그니처)

```ts
// daysim.ts (Task 1·2)
export function seededUnit(seed: number): number            // 결정론 [0,1)
export function callSeed(week: number, day: number, index: number, salt: number): number
export const DURATION_MIN: Record<CallKind, readonly [number, number]>
export function procedureDurationMin(kind: CallKind, week: number, day: number, index: number): number
export function arrivalMinFor(week: number, day: number, index: number, count: number): number
export const DAY_OPEN_MIN: number      // 예: 9*60 = 540 (09:00 표시 기준 0점 아님 — 표시용)
export const DAY_LENGTH_MIN: number    // 예: 600 (10시간 운영일)
export const NIGHT_START_MIN: number   // 예: 480 (개장 후 8h = 17:00)
export function freeDoctorsOfDept(roster: Doctor[], busyUntil: Record<string, number>, dept: DeptKey, atMin: number): Doctor[]
export function pickAssignee(free: Doctor[], busyUntil: Record<string, number>): Doctor  // 가장 일찍 자유로워진 유닛

// receiving.ts (Task 3·4·5)
export function isElective(kind: CallKind): boolean          // COSMETIC_WALKIN | SPECIALIST_ELECTIVE
// ReceivingState: bedsFree 제거, 추가 → clockMin: number; busyUntil: Record<string, number>
```

---

## Task 1: seed 결정론 시간 원시함수 (daysim.ts)

**Files:**
- Create: `src/game/daysim.ts`
- Test: `src/game/daysim.test.ts`

**Interfaces:**
- Produces: `seededUnit`, `callSeed`, `DURATION_MIN`, `procedureDurationMin`, `arrivalMinFor`, `DAY_OPEN_MIN`, `DAY_LENGTH_MIN`, `NIGHT_START_MIN`.

- [ ] **Step 1: 실패 테스트 — seededUnit 결정론·경계**

```ts
// src/game/daysim.test.ts
import { describe, it, expect } from 'vitest'
import { seededUnit, callSeed, procedureDurationMin, arrivalMinFor, DURATION_MIN, DAY_LENGTH_MIN } from './daysim'

describe('seededUnit', () => {
  it('같은 seed는 항상 같은 값(결정론)', () => {
    expect(seededUnit(12345)).toBe(seededUnit(12345))
  })
  it('[0,1) 범위', () => {
    for (const s of [0, 1, 7, 100, 999999]) {
      const u = seededUnit(s)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
  })
  it('다른 seed는 대체로 다른 값(무충돌 sanity)', () => {
    const vals = new Set([1, 2, 3, 4, 5].map(seededUnit))
    expect(vals.size).toBe(5)
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/game/daysim.test.ts` → FAIL (모듈 없음).

- [ ] **Step 3: seededUnit·callSeed 구현**

```ts
// src/game/daysim.ts
import type { CallKind, DeptKey, Doctor } from './types'

// 순수 시간 원시함수. RNG 0 — 모든 무작위성은 seed 해시(Math.random·Date.now 금지).
// splitmix32류 정수 해시 → [0,1). 결정론이라 같은 seed=같은 값(테스트·재현).
export function seededUnit(seed: number): number {
  let z = (seed | 0) + 0x9e3779b9
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
  z = z ^ (z >>> 15)
  return (z >>> 0) / 4294967296
}

/** (주,날,콜인덱스,salt) → 안정 정수 seed. salt로 소요시간·도착시각을 서로 다른 스트림으로 가른다. */
export function callSeed(week: number, day: number, index: number, salt: number): number {
  return (((week * 7 + day) * 97 + index) * 101 + salt) | 0
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/game/daysim.test.ts` → PASS (seededUnit describe). tsc: `npx tsc --noEmit` → 0.

- [ ] **Step 5: 실패 테스트 — 소요시간·도착시각**

```ts
// daysim.test.ts 에 추가
describe('procedureDurationMin', () => {
  it('결정론(같은 주/날/인덱스는 같은 소요)', () => {
    expect(procedureDurationMin('STEMI', 1, 1, 0)).toBe(procedureDurationMin('STEMI', 1, 1, 0))
  })
  it('종목별 [min,max] 범위 안', () => {
    for (const kind of Object.keys(DURATION_MIN) as (keyof typeof DURATION_MIN)[]) {
      const [min, max] = DURATION_MIN[kind]
      for (let i = 0; i < 8; i++) {
        const d = procedureDurationMin(kind, 1, 1, i)
        expect(d).toBeGreaterThanOrEqual(min)
        expect(d).toBeLessThanOrEqual(max)
      }
    }
  })
})

describe('arrivalMinFor', () => {
  it('결정론', () => {
    expect(arrivalMinFor(1, 1, 2, 5)).toBe(arrivalMinFor(1, 1, 2, 5))
  })
  it('[0, DAY_LENGTH_MIN) 범위이고 인덱스 증가에 대체로 단조(도착 순서)', () => {
    const count = 6
    const times = Array.from({ length: count }, (_, i) => arrivalMinFor(1, 1, i, count))
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(DAY_LENGTH_MIN)
    }
    // 인덱스 슬롯 기반이라 i가 클수록 시각이 크다(±지터 안에서 단조)
    expect(times[count - 1]).toBeGreaterThan(times[0])
  })
})
```

- [ ] **Step 6: 실패 확인** — FAIL.

- [ ] **Step 7: 소요시간·도착·상수 구현**

```ts
// daysim.ts 에 추가
export const DAY_OPEN_MIN = 9 * 60       // 표시 기준(09:00). 타임라인 내부는 0..DAY_LENGTH_MIN.
export const DAY_LENGTH_MIN = 600        // 운영일 10시간(각색·튜닝값).
export const NIGHT_START_MIN = 480       // 개장 후 8h = 17:00 이후 도착이 야간(각색·튜닝값).

// 종목별 소요시간 [min,max] 분(각색 — 임상 주장 아님, 상대 길이만 의미). 시술이 워크인보다 길다.
export const DURATION_MIN: Record<CallKind, readonly [number, number]> = {
  COSMETIC_WALKIN: [30, 60],
  SPECIALIST_ELECTIVE: [90, 180],
  GENERAL_EMERGENCY: [45, 90],
  STEMI: [60, 120],
  OBSTETRIC_EMERGENCY: [60, 120],
  NEURO_EMERGENCY: [90, 180],
  TRAUMA_EMERGENCY: [90, 180],
}

export function procedureDurationMin(kind: CallKind, week: number, day: number, index: number): number {
  const [min, max] = DURATION_MIN[kind]
  return min + Math.floor(seededUnit(callSeed(week, day, index, 1)) * (max - min + 1))
}

/** 도착시각 — 하루를 count개 슬롯으로 나눠 슬롯 안에서 seed 지터. 인덱스순 ≈ 도착순. */
export function arrivalMinFor(week: number, day: number, index: number, count: number): number {
  const slot = DAY_LENGTH_MIN / count
  const jitter = seededUnit(callSeed(week, day, index, 2)) * slot
  return Math.min(DAY_LENGTH_MIN - 1, Math.floor(index * slot + jitter))
}
```

- [ ] **Step 8: 통과 확인** — vitest PASS, tsc 0.

- [ ] **Step 9: 커밋** — `docs: none 아님` → `feat: seed 결정론 시간 원시함수(daysim) — 소요시간·도착시각`. 트레일러 `Skills-used: superpowers:subagent-driven-development` / `Skill-benefit: TDD — 결정론·경계 회귀를 커밋 전에 고정`.

---

## Task 2: 전문의 점유 헬퍼 (daysim.ts)

**Files:**
- Modify: `src/game/daysim.ts`
- Test: `src/game/daysim.test.ts`

**Interfaces:**
- Consumes: `Doctor`(types).
- Produces: `freeDoctorsOfDept`, `pickAssignee`.

- [ ] **Step 1: 실패 테스트**

```ts
// daysim.test.ts 에 추가
import { freeDoctorsOfDept, pickAssignee } from './daysim'
import type { Doctor } from './types'

const roster: Doctor[] = [
  { id: 'doc-CARDIOLOGY-1', name: '이수아', dept: 'CARDIOLOGY' },
  { id: 'doc-CARDIOLOGY-2', name: '김민준', dept: 'CARDIOLOGY' },
  { id: 'doc-AESTHETICS-1', name: '박현우', dept: 'AESTHETICS' },
]

describe('freeDoctorsOfDept', () => {
  it('busyUntil <= atMin 인 그 과 유닛만 자유', () => {
    const busy = { 'doc-CARDIOLOGY-1': 120, 'doc-CARDIOLOGY-2': 0 }
    const free = freeDoctorsOfDept(roster, busy, 'CARDIOLOGY', 60)
    expect(free.map((d) => d.id)).toEqual(['doc-CARDIOLOGY-2'])
  })
  it('그 과 유닛이 다 점유면 빈 배열(=벽)', () => {
    const busy = { 'doc-CARDIOLOGY-1': 200, 'doc-CARDIOLOGY-2': 200 }
    expect(freeDoctorsOfDept(roster, busy, 'CARDIOLOGY', 60)).toEqual([])
  })
  it('미채용 과는 빈 배열', () => {
    expect(freeDoctorsOfDept(roster, {}, 'OBSTETRICS', 0)).toEqual([])
  })
})

describe('pickAssignee', () => {
  it('가장 일찍 자유로워진(busyUntil 최소) 유닛', () => {
    const busy = { 'doc-CARDIOLOGY-1': 0, 'doc-CARDIOLOGY-2': 30 }
    const free = [roster[0], roster[1]]
    expect(pickAssignee(free, busy).id).toBe('doc-CARDIOLOGY-1')
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

```ts
// daysim.ts 에 추가
/** 시각 atMin에 자유로운(busyUntil ≤ atMin) 그 과 유닛들. busyUntil 미기록=0(자유). */
export function freeDoctorsOfDept(
  roster: Doctor[],
  busyUntil: Record<string, number>,
  dept: DeptKey,
  atMin: number,
): Doctor[] {
  return roster.filter((d) => d.dept === dept && (busyUntil[d.id] ?? 0) <= atMin)
}

/** 자유 유닛 중 가장 일찍 비었던(busyUntil 최소) 유닛 — 부하 분산. */
export function pickAssignee(free: Doctor[], busyUntil: Record<string, number>): Doctor {
  return free.reduce((min, d) => ((busyUntil[d.id] ?? 0) < (busyUntil[min.id] ?? 0) ? d : min))
}
```

- [ ] **Step 4: 통과 확인** — vitest PASS, tsc 0.

- [ ] **Step 5: 커밋** — `feat: 전문의 점유 헬퍼(freeDoctorsOfDept·pickAssignee)`.

---

## Task 3: SPECIALIST_ELECTIVE 종류 + 경제 + isElective

**Files:**
- Modify: `src/game/types.ts` (CallKind, RejectionReason), `src/game/receiving.ts` (CALL_ECONOMICS, CALL_LABELS, PATIENT_OF, isElective)
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Produces: `CallKind` += `'SPECIALIST_ELECTIVE'`; `RejectionReason` += `'NO_FREE_SPECIALIST'`; `isElective(kind)`.

- [ ] **Step 1: 실패 테스트**

```ts
// receiving.test.ts 에 추가
import { isElective, CALL_ECONOMICS, callDelta } from './receiving'

describe('SPECIALIST_ELECTIVE (배후과 예약진료)', () => {
  it('선택진료로 분류(미용과 함께)', () => {
    expect(isElective('SPECIALIST_ELECTIVE')).toBe(true)
    expect(isElective('COSMETIC_WALKIN')).toBe(true)
    expect(isElective('STEMI')).toBe(false)
    expect(isElective('GENERAL_EMERGENCY')).toBe(false)
  })
  it('흑자(delta > 0) — 배후과가 응급에 못 가는 이유는 돈 되는 예약이다', () => {
    expect(callDelta('SPECIALIST_ELECTIVE')).toBeGreaterThan(0)
  })
  it('CALL_ECONOMICS에 항목이 있다(부호 흑자)', () => {
    const e = CALL_ECONOMICS.SPECIALIST_ELECTIVE
    expect(e.revenueBillions).toBeGreaterThan(e.costBillions)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL (tsc: SPECIALIST_ELECTIVE 없음).

- [ ] **Step 3: types.ts — CallKind·RejectionReason 확장**

```ts
// types.ts — CallKind에 추가(주석: 배후과 예약진료 — 흑자, 자기 과 응급과 같은 의사를 두고 경쟁)
export type CallKind =
  | 'STEMI'
  | 'OBSTETRIC_EMERGENCY'
  | 'NEURO_EMERGENCY'
  | 'TRAUMA_EMERGENCY'
  | 'GENERAL_EMERGENCY'
  | 'COSMETIC_WALKIN'
  | 'SPECIALIST_ELECTIVE' // 배후과 예약진료(시술·검사) — 흑자, 그 과 의사를 점유해 응급과 경쟁

// RejectionReason에 추가(NO_BED는 Task 5에서 제거)
  | 'NO_FREE_SPECIALIST' // 배후과·당직은 있으나 그 과 의사가 다 진료 중 — 평일 배후 공백의 형상화

// IncomingCall에 필드 추가
export interface IncomingCall {
  // ...기존...
  arrivalMin: number   // 그날 도착 시각(분, 0..DAY_LENGTH_MIN) — 결정론 seed 파생
  durationMin: number  // 수용 시 담당 의사 점유 시간(분) — 결정론 seed 파생
}
```

- [ ] **Step 4: receiving.ts — 경제·라벨·환자·isElective**

```ts
// CALL_ECONOMICS 에 추가 (검사 흑자 밴드 계승 — workup 역할 이전)
SPECIALIST_ELECTIVE: { priceSetter: 'GOVERNMENT', revenueBillions: 10, costBillions: 6 }, // 10/6 ≈ 167% — 검체 160% 밴드

// CALL_LABELS 에 추가
SPECIALIST_ELECTIVE: ['심장 예약 시술', '정기 배후과 진료'],

// PATIENT_OF — 예약도 requiredSpecialty로 담당 과를 실어야 doctorCaseloads·점유가 그 과에 붙는다.
// createCallQueue에서 예약의 대상 과를 정하는 방식은 Task 4에서. 여기선 기본 매핑만.
SPECIALIST_ELECTIVE: { id: 'call-elective', requiredSpecialty: 'CARDIOLOGY', severity: 1 },

/** 선택진료(플레이어가 받을지 정하는 콜) — 미용·검진 워크인 + 배후과 예약. 응급이 아니다. */
export function isElective(kind: CallKind): boolean {
  return kind === 'COSMETIC_WALKIN' || kind === 'SPECIALIST_ELECTIVE'
}
```

- [ ] **Step 5: 통과 확인** — vitest PASS, tsc 0. (기존 CALL_ECONOMICS 완전성 테스트가 있으면 새 kind로 갱신)

- [ ] **Step 6: 커밋** — `feat: 배후과 예약진료(SPECIALIST_ELECTIVE) 종류·흑자 경제·NO_FREE_SPECIALIST 사유`.

---

## Task 4: 시간 큐 — 도착순·선택진료 혼합 (createCallQueue)

**Files:**
- Modify: `src/game/receiving.ts` (DAY_PLANS, createCallQueue, NIGHT 파생)
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Consumes: `arrivalMinFor`, `procedureDurationMin`(daysim), `NIGHT_START_MIN`.
- Produces: `createCallQueue(week, day)` — 각 콜에 `arrivalMin`·`durationMin`, 도착순 정렬, nightShift=arrivalMin≥NIGHT_START_MIN.

- [ ] **Step 1: 실패 테스트**

```ts
// receiving.test.ts
describe('createCallQueue (시간 큐)', () => {
  it('각 콜에 arrivalMin·durationMin이 붙고 도착순 정렬', () => {
    const q = createCallQueue(1, 1)
    for (const c of q) {
      expect(c.arrivalMin).toBeGreaterThanOrEqual(0)
      expect(c.durationMin).toBeGreaterThan(0)
    }
    const times = q.map((c) => c.arrivalMin)
    expect([...times]).toEqual([...times].sort((a, b) => a - b))
  })
  it('결정론 — 같은 (주,날)은 같은 큐(arrivalMin·durationMin 포함)', () => {
    expect(createCallQueue(1, 3)).toEqual(createCallQueue(1, 3))
  })
  it('nightShift는 arrivalMin ≥ NIGHT_START_MIN에서 파생', () => {
    const q = createCallQueue(1, 1)
    for (const c of q) expect(c.nightShift).toBe(c.arrivalMin >= NIGHT_START_MIN)
  })
  it('선택진료(미용·배후과 예약)와 응급이 섞여 있다', () => {
    const q = createCallQueue(1, 1)
    expect(q.some((c) => isElective(c.kind))).toBe(true)
    expect(q.some((c) => !isElective(c.kind))).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL (createCallQueue 시그니처가 `(day)`이고 arrivalMin 없음).

- [ ] **Step 3: 구현 — DAY_PLANS에 SPECIALIST_ELECTIVE 섞고, createCallQueue를 (week,day)로**

구현 노트(정확한 코드는 TDD로 채우되 형태 고정):
- `DAY_PLANS`의 각 날 배열에 `SPECIALIST_ELECTIVE`를 1~2통 섞는다(배후과 점유원). 예약의 대상 과는 그날 배열 위치에서 결정론 파생(예: `salt=3` seed로 backupCare 후보 중 선택하되, 큐 자체는 정적이라 배열에 과를 직접 인코딩하는 게 단순 — `SPECIALIST_ELECTIVE`의 requiredSpecialty를 콜별로 정하려면 DAY_PLANS를 `{kind, dept?}[]`로 확장).
- `createCallQueue(week, day)`: 기존 라벨 파생 + `arrivalMin = arrivalMinFor(week, day, i, plan.length)`, `durationMin = procedureDurationMin(kind, week, day, i)` 부여 후 **arrivalMin 오름차순 정렬**. `nightShift = arrivalMin >= NIGHT_START_MIN`. 정렬 후에도 id는 `d{globalDay}c{원래인덱스}`로 고유.
- `weekDayQueue`(session.ts)와 정합: 전역일 = `(week-1)*7+day`를 seed의 (week,day)로 넘긴다.

```ts
// 형태 예시 (dept 인코딩 방식)
const DAY_PLANS: { kind: CallKind; dept?: Specialty }[][] = [
  [{ kind: 'COSMETIC_WALKIN' }, { kind: 'SPECIALIST_ELECTIVE', dept: 'CARDIOLOGY' }, { kind: 'STEMI' },
   { kind: 'GENERAL_EMERGENCY' }, { kind: 'STEMI' }],
  // ...나머지 날 (배후과 예약을 필수과에 배치해 점유 경쟁을 만든다)
]
```

- [ ] **Step 4: 통과 확인** — vitest PASS, tsc 0. 기존 createCallQueue 테스트(요일별 구성)를 새 시그니처로 갱신.

- [ ] **Step 5: 커밋** — `feat: 시간 큐 — 도착시각·소요시간 부여, 도착순 정렬, 선택진료 혼합`.

---

## Task 5: 점유 벽 + 응급 자동 판정 (ReceivingState·decide·hardlockReason)

**Files:**
- Modify: `src/game/receiving.ts` (ReceivingState, initReceiving, hardlockReason, decide, dayProgress), `src/game/adjudicate.ts`(NO_BED 경로 정리)
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- ReceivingState: `bedsFree` 제거 → `clockMin: number`, `busyUntil: Record<string, number>` 추가.
- `hardlockReason(hospital, call, busyUntil, roster)`: 점유 벽 판정.
- `decide(state, accept)`: 응급 자동, 선택진료 점유.

- [ ] **Step 1: 실패 테스트 — 점유 벽**

```ts
describe('점유 벽 (NO_FREE_SPECIALIST)', () => {
  it('그 과 의사가 다 진료 중이면 응급은 벽', () => {
    // roster: 순환기 1명, busyUntil로 점유시킨 상태에서 STEMI 도착
    // hardlockReason → 'NO_FREE_SPECIALIST'
  })
  it('그 과 자유 의사가 있으면 통과(null)', () => {})
  it('그 과 자체가 미채용이면 NO_BACKUP_CARE(기존 판정 유지)', () => {})
  it('야간 콜은 당직 2인 규칙(roundTheClockBackup) 유지', () => {})
})

describe('decide (시간 점유)', () => {
  it('응급 수용 시 담당 의사 busyUntil = arrivalMin + durationMin', () => {})
  it('응급은 accept 무관 자동(자유 의사 있으면 수용, 없으면 벽)', () => {})
  it('선택진료 수용 시 그 과 의사 점유 + 흑자 누적', () => {})
  it('선택진료 스킵 시 의사 자유 유지, 수익 0', () => {})
  it('clockMin은 현재 콜 arrivalMin으로 전진', () => {})
})

describe('dayProgress (시간 기반)', () => {
  it('clockMin / DAY_LENGTH_MIN', () => {})
})
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: ReceivingState·initReceiving 변경**
- `bedsFree` 제거, `clockMin: 0`·`busyUntil: {}` 추가. `boardedBeds` 인자 → `boardedBusyUntil: Record<string,number>`(어제 넘어온 점유)로 교체.
- `initReceiving(hospital, queue, boardedBusyUntil = {})`.

- [ ] **Step 4: hardlockReason — 점유 벽**
- 시그니처: `hardlockReason(hospital, call, busyUntil, roster)`.
- 로직: `NO_BED` 경로 삭제. 응급은 (a) `adjudicateTransfer`(배후과·ER — NO_BED만 빼고 그대로) → NO_BACKUP_CARE/NO_ER_ONCALL, (b) 야간이면 `roundTheClockBackup` 체크(NO_NIGHT_BACKUP), (c) 그 다음 `freeDoctorsOfDept(roster, busyUntil, handlingDept(call), call.arrivalMin).length === 0` → `NO_FREE_SPECIALIST`. 선택진료는 자유 의사 없으면 못 받음(하드락 아님, 표시만 — Task 7).
- `adjudicate.ts`: `hospital.beds <= 0` 경로 제거(beds 필드는 Hospital에서 당분간 유지하되 판정에서 안 봄 — Task 6에서 정리). NO_BED은 RejectionReason에서 제거.

- [ ] **Step 5: decide — 응급 자동 / 선택 점유**
- 현재 콜이 응급이면: `accept` 무시, 자유 의사 있으면 자동 수용(busyUntil 갱신·callDelta 누적·lawsuit)·없으면 turnedAway. 선택진료면: `accept && 자유 의사 있음`일 때 수용(busyUntil·callDelta 누적). 어느 쪽이든 `clockMin = call.arrivalMin`, index++.
- workup(withWorkup) 인자 제거 — 검사 흑자는 SPECIALIST_ELECTIVE가 계승.

- [ ] **Step 6: dayProgress = clockMin / DAY_LENGTH_MIN** (accruedSegments 정합 확인 — 7일 완주 시 주간 전액 도달 등식 유지).

- [ ] **Step 7: 테스트 코드 채우고 통과** — vitest PASS, tsc 0.

- [ ] **Step 8: 커밋** — `feat: 점유 벽(NO_FREE_SPECIALIST)·응급 자동 판정·시간 진행률 — 병상 벽 제거`.

---

## Task 6: 세션 배선 + boarding 이월 (session.ts)

**Files:**
- Modify: `src/game/session.ts` (initReceiving 호출부, completeReceiving, advanceDay boarding), `src/game/doctor.ts`(doctorCaseloads 새 상태 대응 확인)
- Test: `src/game/session.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
describe('boarding — 검사/장시술이 의사를 내일로 이월', () => {
  it('busyUntil > DAY_LENGTH_MIN인 의사는 다음날 그만큼 늦게 자유로워진다', () => {
    // advanceDay가 어제 busyUntil의 초과분(- DAY_LENGTH_MIN)을 오늘 초기 busyUntil로 넘긴다
  })
  it('점유 이월이 없으면 다음날 전원 자유(0)에서 시작', () => {})
})
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**
- `initReceiving` 호출부(completeSetup·advanceDay·beginWeek)를 새 시그니처로. `advanceDay`의 boarding: 어제 `receiving.busyUntil`에서 `max(0, v - DAY_LENGTH_MIN)`을 오늘 초기 `boardedBusyUntil`로 계산해 넘긴다(병상 이월 → 의사 이월).
- `completeReceiving`: `doctorCaseloads`/`stepFatigue`는 log 기반이라 그대로 동작(피로는 후속 태스크에서 시간 기반으로 승격 가능 — 이번엔 케이스 카운트 유지). 야간 규칙은 hardlockReason이 이미 처리.
- `DayRecord`의 `blocked`(NO_BED 카운트) → `NO_FREE_SPECIALIST` 카운트로 라벨 조정.

- [ ] **Step 4: 통과 확인** — 전체 `npx vitest run` green, `npx tsc --noEmit` 0.

- [ ] **Step 5: 커밋** — `feat: 세션 배선 — boarding을 의사 점유 이월로, 세션 상태 새 큐 대응`.

---

## Task 7: UI — 시계·점유·응급 자동 배너 (브라우저 검증)

**Files:**
- Modify: `src/components/ReceivingPhase.tsx`, `src/components/DoctorRoster.tsx`, `src/components/SessionClient.tsx`
- **유닛 테스트 없음**(프로젝트 관례) — 브라우저 검증.

- [ ] **Step 1: ReceivingPhase — 헤더 '남은 자리'를 시계로**
- `receiving.clockMin`을 `DAY_OPEN_MIN + clockMin`으로 09:00 기준 `HH:MM` 표시. `bedsFree` 참조 전부 제거.

- [ ] **Step 2: 선택진료 vs 응급 분기**
- `isElective(call.kind)`면 기존 받기/거절 버튼(단 '검사 추가' 버튼 제거 — workup 사라짐, "받기"/"보내기"). 자유 의사 없으면 "받기" 비활성.
- 응급이면 버튼 대신 **자동 결과 배너**: 자유 의사 있으면 "수용 · Dr.X" / 없으면 "전원 불가 · 전 배후과 진료 중"(NO_FREE_SPECIALIST) 또는 기존 사유. + "계속" 버튼(decide 호출, accept 무시).

- [ ] **Step 3: DoctorRoster — 현재 점유 표시**
- 각 유닛에 현재 상태(진료 중/자유)를 `busyUntil[id] > clockMin`으로 판별해 배지/색 추가. '담당 N명'은 유지.

- [ ] **Step 4: SessionClient — prop 전달**
- `onDecide` 시그니처에서 withWorkup 제거. clockMin·busyUntil 전달 경로 확인.

- [ ] **Step 5: 브라우저 검증** (preview_start `{name}` → read_page/read_console_messages)
  - 시계가 콜마다 전진(09:00→…), 콘솔 0 에러.
  - 선택진료(심장 예약)를 받으면 그 순환기 의사가 '진료 중'으로, 이후 STEMI 도착 시 "전원 불가 · 전 배후과 진료 중" 배너.
  - 선택진료를 스킵하면 의사 자유 유지 → 같은 STEMI 수용.
  - 7일 완주: 순이익이 예산 4배(I8)를 안 넘는지(경제 밸런스 리스크) — 넘으면 SPECIALIST_ELECTIVE revenue/DURATION 밀도 조정.
- [ ] **Step 6: screenshot로 증빙 후 커밋** — `feat: 시간 UI — 시계·전문의 점유·응급 자동 배너, 남은 자리 제거`.

---

## 실행 후 (전체 브랜치)

- 최종 whole-branch 리뷰(가장 유능한 모델) → 특히 **I8 불변식(순이익 ≤ 4×예산)**과 **결정론 회귀**를 본다.
- `plan.md` ✅ / `changeLog.md` 한 줄 / (디버깅 1분+ 시) `troubleshooting/T-###` 스윕.
- `finishing-a-development-branch`로 PR.

## Self-Review 체크(작성자)

- ⚠️ **경제 밸런스**: SPECIALIST_ELECTIVE 흑자가 I8을 깰 수 있다(미용 10명 전례). Task 7 Step 5의 7일 완주 검증이 유일한 안전망 — 필수.
- ⚠️ **doctorCaseloads/피로**: 이번엔 log 기반 케이스 카운트 유지(시간 기반 승격은 후속). busyUntil은 벽·표시에만.
- ⚠️ **Hospital.beds 필드**: 판정에서 제거하되 필드 자체는 당분간 남을 수 있음(setup·economics 참조) — Task 5/6에서 참조 0 확인, 완전 제거는 후속 정리 가능.
- 타입 일관: `createCallQueue(week, day)`·`hardlockReason(hospital, call, busyUntil, roster)`·`decide(state, accept)`·`initReceiving(hospital, queue, boardedBusyUntil)` — 태스크 간 시그니처 일치 확인함.
