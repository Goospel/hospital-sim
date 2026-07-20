---
tags:
  - type/plan
---

# 의사 개인 유닛 (담당 환자 수 · 피로도 표시 레이어) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채용 인원수를 이름 붙은 의사 개인 유닛으로 만들고, 플레이(RECEIVING) 중 각자의 오늘 담당 환자 수와 피로도를 보여주는 순수 표시 레이어를 얹는다. 판정·경제·생사는 무변경.

**Architecture:** 새 순수 모듈 `src/game/doctor.ts`(런타임 임포트 0 — 타입만)에 명단 생성·명명·담당수 파생·피로 스텝을 모아 순환 임포트를 원천 차단한다. `Hospital.roster?`(옵셔널)로 명단을 싣고, 피로는 시간 상태라 `SessionState.fatigue`에 누적한다. UI는 RECEIVING 화면에 명단 스트립 1개.

**Tech Stack:** TypeScript · Next.js(App Router) · React · Tailwind · vitest 4. 설계 근거: [2026-07-20-doctor-roster-visualization-design.md](../specs/2026-07-20-doctor-roster-visualization-design.md).

## Global Constraints

모든 태스크의 요구사항에 암묵적으로 포함된다:

- **판정·경제 0 침습**: `adjudicate.ts`·`receiving.ts`의 `hardlockReason`/`decide`·경제 계산(`callDelta`·`accruedSegments`·`runningNetProfit`)은 **한 줄도 바꾸지 않는다**. roster·fatigue는 표시 계산에만 쓴다.
- **기존 테스트 전부 그대로 green**: `Hospital.roster`는 옵셔널이라 구형 병원(기존 판정/경제 테스트)은 무영향. 회귀 0.
- **결정론**: `Date.now()`·`Math.random()` 금지(게임 원칙 RNG 0). 명명은 인덱스 파생.
- **show-don't-tell**: 의사 카드에 해석 카피 금지(숫자·막대만). "과잉 노동" 류 설명 없음.
- **순환 임포트 금지**: `doctor.ts`는 **런타임 임포트 0**(`./types`·`./receiving`는 `import type`으로만). `materializeRoster`는 `departments`를 인자로 받아 `setup.ts`의 `DEPARTMENTS`를 당기지 않는다.
- **타입 게이트**: `npx tsc --noEmit` 0 필수(vitest는 esbuild라 타입을 안 본다 — 타입 회귀가 green으로 샌다).
- **컴포넌트는 유닛테스트 안 함**: 게임 로직(`doctor.ts`)만 유닛테스트. `DoctorRoster`/`ReceivingPhase`는 브라우저 실측(프로젝트 관례).
- **피로 상수는 예시값**: 임상수치 주장이 아니다. 방향(담당 많을수록·의사 적을수록·야간일수록 ↑, 무부하 회복 ↓)만 테스트로 고정한다.
- **한글 커밋**: T-026 절차(`.commit-msg-tmp` UTF-8 + `git commit -F`) + AI 트레일러(`Skills-used:`…`Co-Authored-By:` 빈 줄 없이 연속, 그 앞에 본문과 분리하는 빈 줄 1개) + 새 md는 `type/*` 태그.

---

## Task 1: `doctor.ts` 순수 함수 (명단·담당수·피로)

새 순수 모듈. 세 묶음(명단/명명, 담당수, 피로)을 TDD로 쌓는다. 런타임 임포트 0.

**Files:**
- Modify: `src/game/types.ts` (`Doctor` 인터페이스 추가)
- Create: `src/game/doctor.ts`
- Test: `src/game/doctor.test.ts`

**Interfaces:**
- Consumes: `DeptKey`·`IncomingCall`·`SetupChoices`·`DepartmentSpec`(types.ts), `ReceivingState`(receiving.ts, **type-only**)
- Produces:
  - `interface Doctor { id: string; name: string; dept: DeptKey }` (types.ts)
  - `materializeRoster(choices: SetupChoices, departments: DepartmentSpec[]): Doctor[]`
  - `walkinDept(label: string): DeptKey`
  - `handlingDept(call: IncomingCall): DeptKey`
  - `doctorCaseloads(roster: Doctor[], receiving: ReceivingState): { total: Map<string, number>; night: Map<string, number> }`
  - `stepFatigue(prev: Record<string, number>, caseloads: { total: Map<string, number>; night: Map<string, number> }): Record<string, number>`
  - `FATIGUE_PER_CASE`·`FATIGUE_NIGHT_EXTRA`·`FATIGUE_REST`·`FATIGUE_MAX` (상수)

### 1-A. 명단 + 결정론 명명

- [ ] **Step 1: `Doctor` 타입 추가 (types.ts)**

`src/game/types.ts` 끝(마지막 export 뒤)에 추가:

```ts
/**
 * 의사 개인 유닛 — 표시 레이어 전용(판정 무관). 채용 인원수를 이름 붙은 개인으로 태운다.
 * 배경·특성·결함은 없다(사용자 결정: 림월드를 그대로 빼다 박지 않음).
 */
export interface Doctor {
  id: string // 'doc-<dept>-<i>' — 결정론 고유
  name: string // 결정론 자동 생성 한글 이름
  dept: DeptKey // 소속 과(수익과 + 필수과)
}
```

- [ ] **Step 2: 실패 테스트 작성 (doctor.test.ts)**

`src/game/doctor.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import { materializeRoster } from './doctor'
import { DEPARTMENTS } from './setup'
import type { SetupChoices } from './types'

const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

describe('materializeRoster — 인원수 → 개인 유닛', () => {
  it('과별 수만큼 유닛을 만들고 id·dept를 채운다', () => {
    const roster = materializeRoster(conscientious, DEPARTMENTS)
    expect(roster).toHaveLength(3) // 미용1 + 순환기2
    const cardio = roster.filter((d) => d.dept === 'CARDIOLOGY')
    expect(cardio.map((d) => d.id)).toEqual(['doc-CARDIOLOGY-1', 'doc-CARDIOLOGY-2'])
    expect(roster.every((d) => d.name.length >= 2)).toBe(true)
  })

  it('0명 과는 유닛이 없다', () => {
    const roster = materializeRoster(conscientious, DEPARTMENTS)
    expect(roster.some((d) => d.dept === 'CHECKUP')).toBe(false)
  })

  it('결정론 — 같은 선택은 항상 같은 명단(이름 포함)', () => {
    const a = materializeRoster(conscientious, DEPARTMENTS)
    const b = materializeRoster(conscientious, DEPARTMENTS)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/game/doctor.test.ts`
Expected: FAIL — `doctor.ts` 없음 / `materializeRoster is not a function`.

- [ ] **Step 4: 구현 (doctor.ts 생성)**

`src/game/doctor.ts`:

```ts
import type { DepartmentSpec, DeptKey, Doctor, IncomingCall, SetupChoices } from './types'
import type { ReceivingState } from './receiving' // type-only — 런타임 순환 없음

// 표시 레이어 순수 모듈. 판정·경제에 절대 닿지 않는다. 런타임 임포트 0(전부 type-only).

const FAMILY_NAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오']
const GIVEN_NAMES = ['민준', '서연', '도윤', '하은', '지호', '수아', '예준', '지우', '준서', '서윤', '현우', '지민']

/**
 * 전역 의사 인덱스 k(0-based) → 결정론 한글 이름. RNG 0(게임 원칙).
 * 이름 인덱스를 성과 서로 다른 보폭(×5, 12와 서로소)으로 진행 + 성 랩(k/12) 오프셋 → 저충돌.
 */
function doctorName(k: number): string {
  const family = FAMILY_NAMES[k % FAMILY_NAMES.length]
  const given = GIVEN_NAMES[(k * 5 + Math.floor(k / FAMILY_NAMES.length)) % GIVEN_NAMES.length]
  return family + given
}

/**
 * 채용 선택 → 개인 유닛 명단. 결정론. `departments`를 인자로 받아 setup.ts를 임포트하지 않는다(순환 차단).
 * 전역 인덱스 k로 이름을 파생시켜 같은 선택은 항상 같은 명단이 된다.
 */
export function materializeRoster(choices: SetupChoices, departments: DepartmentSpec[]): Doctor[] {
  const roster: Doctor[] = []
  let k = 0
  for (const dept of departments) {
    const n = choices.doctors[dept.key] ?? 0
    for (let i = 1; i <= n; i++) {
      roster.push({ id: `doc-${dept.key}-${i}`, name: doctorName(k), dept: dept.key })
      k++
    }
  }
  return roster
}
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `npx vitest run src/game/doctor.test.ts`
Expected: PASS (3 tests).

```bash
git add src/game/types.ts src/game/doctor.ts src/game/doctor.test.ts
# 커밋 메시지는 T-026(.commit-msg-tmp) — Task 1 끝에서 한 번에 묶어도 됨
```

### 1-B. 담당 환자 수 (콜 → 담당 과 → 분배)

- [ ] **Step 6: 실패 테스트 추가 (doctor.test.ts)**

`doctor.test.ts` 상단 import에 `walkinDept, handlingDept, doctorCaseloads`를 추가하고, `createCallQueue`·`decide`·`initReceiving`를 `./receiving`에서, `buildHospital`을 `./setup`에서 가져온다:

```ts
import { walkinDept, handlingDept, doctorCaseloads } from './doctor'
import { createCallQueue, decide, initReceiving } from './receiving'
import { buildHospital } from './setup'
```

테스트 추가:

```ts
describe('walkinDept — 워크인 라벨로 미용/검진 판별', () => {
  it("'검진' 라벨은 CHECKUP, 그 외는 AESTHETICS", () => {
    expect(walkinDept('검진 패키지 문의')).toBe('CHECKUP')
    expect(walkinDept('보톡스 상담 워크인')).toBe('AESTHETICS')
  })
})

describe('handlingDept — 콜 한 통을 담당 과로', () => {
  it('필수 응급은 requiredSpecialty 과로, 워크인은 라벨로', () => {
    const q = createCallQueue(1) // 월: [워크인, STEMI, 워크인, 일반응급, STEMI]
    expect(handlingDept(q[1])).toBe('CARDIOLOGY') // STEMI
    expect(handlingDept(q[0])).toBe('AESTHETICS') // 보톡스 워크인
  })
})

describe('doctorCaseloads — 받은 콜을 유닛에 분배', () => {
  // 순환기 2명 병원에서 하루를 돌려 STEMI를 받으면 순환기 유닛에 담당이 붙는다.
  const hospital = buildHospital({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 2 } }).hospital
  const roster = materializeRoster({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 2 } }, DEPARTMENTS)

  it('받은 콜만 계상하고 담당 과 유닛에 균등 분배한다', () => {
    let r = initReceiving(hospital, createCallQueue(1)) // 자리 3
    while (!r.done) r = decide(r, r.queue[r.index].kind === 'STEMI') // STEMI만 수용
    const { total } = doctorCaseloads(roster, r)
    const per = roster.map((d) => total.get(d.id)!)
    expect(per.reduce((a, b) => a + b, 0)).toBe(2) // 월요일 STEMI 2통(자리 3 이내) 수용
    expect(Math.max(...per) - Math.min(...per)).toBeLessThanOrEqual(1) // 균등(2명에 1·1)
  })

  it('담당 과에 유닛이 없으면 아무에게도 안 붙는다', () => {
    // 외과 0인 병원에서 일반응급을 받아도(병상만으로 수용) 담당 유닛 없음
    let r = initReceiving(hospital, createCallQueue(1))
    while (!r.done) r = decide(r, true) // 전부 수용 시도
    const { total } = doctorCaseloads(roster, r)
    const sum = roster.map((d) => total.get(d.id)!).reduce((a, b) => a + b, 0)
    // 순환기 유닛엔 STEMI만 붙는다 — 워크인/일반응급은 순환기 담당 아님
    expect(sum).toBeLessThan(r.log.filter((e) => e.accepted).length)
  })
})
```

- [ ] **Step 7: 실패 확인**

Run: `npx vitest run src/game/doctor.test.ts`
Expected: FAIL — `walkinDept`/`handlingDept`/`doctorCaseloads` 없음.

- [ ] **Step 8: 구현 (doctor.ts에 추가)**

```ts
// kind만으로 담당 과가 정해지는 5종. 워크인은 라벨이 필요해 handlingDept에서 분기한다.
const HANDLING_DEPT: Record<Exclude<IncomingCall['kind'], 'COSMETIC_WALKIN'>, DeptKey> = {
  STEMI: 'CARDIOLOGY',
  OBSTETRIC_EMERGENCY: 'OBSTETRICS',
  NEURO_EMERGENCY: 'NEUROSURGERY',
  TRAUMA_EMERGENCY: 'GENERAL_SURGERY',
  GENERAL_EMERGENCY: 'GENERAL_SURGERY', // 명목상 외과(외과 미채용 시 무배정)
}

/** 워크인 라벨로 미용/검진 판별. receiving.ts CALL_LABELS와 커플링(표시 전용). */
export function walkinDept(label: string): DeptKey {
  return label.includes('검진') ? 'CHECKUP' : 'AESTHETICS'
}

/** 받은 콜 한 통을 어느 과 의사가 짊어지나 — requiredSpecialty 명목값 함정을 피한 단일 출처. */
export function handlingDept(call: IncomingCall): DeptKey {
  return call.kind === 'COSMETIC_WALKIN' ? walkinDept(call.label) : HANDLING_DEPT[call.kind]
}

/**
 * 받은(accepted) 콜을 담당 과 유닛에 라운드로빈(가장 적게 받은 유닛부터)으로 분배.
 * total = 전체, night = 그중 야간 콜(피로 가중용, 일관된 부분집합). 담당 과 미채용 콜은 무배정.
 * 모든 유닛을 0으로 초기화해 표시가 안정적이다(콜 0인 유닛도 카드에 0으로 뜬다).
 */
export function doctorCaseloads(
  roster: Doctor[],
  receiving: ReceivingState,
): { total: Map<string, number>; night: Map<string, number> } {
  const total = new Map<string, number>()
  const night = new Map<string, number>()
  for (const doc of roster) {
    total.set(doc.id, 0)
    night.set(doc.id, 0)
  }
  receiving.log.forEach((entry, i) => {
    if (!entry.accepted) return
    const call = receiving.queue[i]
    const dept = handlingDept(call)
    const deptDocs = roster.filter((d) => d.dept === dept)
    if (deptDocs.length === 0) return // 담당 과 미채용 — 아무에게도 안 붙음
    const target = deptDocs.reduce((min, d) => (total.get(d.id)! < total.get(min.id)! ? d : min))
    total.set(target.id, total.get(target.id)! + 1)
    if (call.nightShift) night.set(target.id, night.get(target.id)! + 1)
  })
  return { total, night }
}
```

- [ ] **Step 9: 통과 확인**

Run: `npx vitest run src/game/doctor.test.ts`
Expected: PASS.

### 1-C. 피로 스텝

- [ ] **Step 10: 실패 테스트 추가 (doctor.test.ts)**

import에 `stepFatigue, FATIGUE_MAX` 추가. 테스트:

```ts
import { stepFatigue, FATIGUE_MAX } from './doctor'

describe('stepFatigue — 하루 담당으로 피로 누적(주 간 유지)', () => {
  const cl = (total: [string, number][], night: [string, number][] = []) => ({
    total: new Map(total),
    night: new Map(night),
  })

  it('담당이 많을수록 더 오른다', () => {
    const next = stepFatigue({}, cl([['a', 1], ['b', 3]]))
    expect(next.b).toBeGreaterThan(next.a)
  })

  it('야간 담당은 가중된다(같은 건수라도 야간이 더 높다)', () => {
    const next = stepFatigue({}, cl([['a', 1], ['b', 1]], [['b', 1]]))
    expect(next.b).toBeGreaterThan(next.a)
  })

  it('무부하 날은 회복으로 내려간다(0 클램프)', () => {
    const next = stepFatigue({ a: 30 }, cl([['a', 0]]))
    expect(next.a).toBeLessThan(30)
    expect(next.a).toBeGreaterThanOrEqual(0)
  })

  it('상한 클램프(FATIGUE_MAX 초과 없음)', () => {
    const next = stepFatigue({ a: 90 }, cl([['a', 3]], [['a', 3]]))
    expect(next.a).toBeLessThanOrEqual(FATIGUE_MAX)
  })

  it('이전 값에 누적한다(리셋 아님)', () => {
    const day1 = stepFatigue({}, cl([['a', 2]]))
    const day2 = stepFatigue(day1, cl([['a', 2]]))
    expect(day2.a).toBeGreaterThan(day1.a)
  })
})
```

- [ ] **Step 11: 실패 확인**

Run: `npx vitest run src/game/doctor.test.ts`
Expected: FAIL — `stepFatigue`/`FATIGUE_MAX` 없음.

- [ ] **Step 12: 구현 (doctor.ts에 추가)**

```ts
// 피로 상수 — 예시값(임상 주장 아님). 방향만 정직: 담당 많을수록·야간일수록 ↑, 무부하 회복 ↓.
export const FATIGUE_PER_CASE = 18
export const FATIGUE_NIGHT_EXTRA = 12
export const FATIGUE_REST = 20
export const FATIGUE_MAX = 100

/**
 * 하루 담당 → 유닛별 피로 갱신(0~FATIGUE_MAX 클램프). 이전 값에 누적한다(주 간 유지 — 리셋은 세션이 안 한다).
 * 야간 담당은 기본에 추가 가중이 붙는다(같은 건수라도 밤이 무겁다). 무부하 날은 회복(−FATIGUE_REST)으로 내려간다.
 */
export function stepFatigue(
  prev: Record<string, number>,
  caseloads: { total: Map<string, number>; night: Map<string, number> },
): Record<string, number> {
  const next: Record<string, number> = { ...prev }
  for (const [id, cases] of caseloads.total) {
    const nights = caseloads.night.get(id) ?? 0
    const delta = cases * FATIGUE_PER_CASE + nights * FATIGUE_NIGHT_EXTRA - FATIGUE_REST
    next[id] = Math.max(0, Math.min(FATIGUE_MAX, (prev[id] ?? 0) + delta))
  }
  return next
}
```

- [ ] **Step 13: 통과 확인 + tsc + Task 1 커밋**

Run: `npx vitest run src/game/doctor.test.ts && npx tsc --noEmit`
Expected: PASS (전체 doctor.test.ts) · tsc 0 errors.

T-026으로 `.commit-msg-tmp` 작성 후:
```bash
git add src/game/types.ts src/game/doctor.ts src/game/doctor.test.ts
git commit -F .commit-msg-tmp
```
커밋 메시지 예: `feat: 의사 개인 유닛 순수 로직 — 명단·명명·담당수·피로 스텝 (TDD)` + AI 트레일러.

---

## Task 2: 배선 — roster materialize + 세션 피로 누적

순수 로직을 병원·세션에 연결한다. **기존 판정/경제 테스트는 전부 그대로 green**이어야 한다(회귀 가드).

**Files:**
- Modify: `src/game/types.ts` (`Hospital.roster?`)
- Modify: `src/game/setup.ts` (`buildHospital`이 roster materialize)
- Modify: `src/game/session.ts` (`SessionState.fatigue` + `completeReceiving` 스텝 + 생성자 초기화)
- Test: `src/game/setup.test.ts`·`src/game/session.test.ts` (추가)

**Interfaces:**
- Consumes: `materializeRoster`·`doctorCaseloads`·`stepFatigue` (Task 1, doctor.ts)
- Produces: `Hospital.roster?: Doctor[]`, `SessionState.fatigue: Record<string, number>`

- [ ] **Step 1: `Hospital.roster?` 추가 (types.ts)**

`Hospital` 인터페이스에 필드 추가(economics 옆):

```ts
  roster?: Doctor[] // 개인 유닛 명단(표시 전용). 선택 필드 — 없는 병원(기존 테스트)은 표시 레이어만 스킵, 판정 무관.
```

- [ ] **Step 2: 실패 테스트 — buildHospital roster (setup.test.ts)**

`setup.test.ts`의 `buildHospital` describe에 추가:

```ts
it('roster를 과별 인원수만큼 materialize한다', () => {
  const { hospital } = buildHospital(conscientious) // AESTHETICS:1, CARDIOLOGY:2
  expect(hospital.roster).toHaveLength(3)
  expect(hospital.roster!.filter((d) => d.dept === 'CARDIOLOGY')).toHaveLength(2)
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/game/setup.test.ts`
Expected: FAIL — `hospital.roster` undefined.

- [ ] **Step 4: 구현 (setup.ts buildHospital)**

`setup.ts` 상단 import 추가: `import { materializeRoster } from './doctor'`

`buildHospital`의 `hospital` 객체에 필드 추가:

```ts
  const hospital: Hospital = {
    id: 'player',
    name: choices.hospitalName,
    beds: FIXED_BEDS,
    hasErOnCall: true,
    overcrowded: false,
    backupCare,
    roundTheClockBackup,
    economics,
    roster: materializeRoster(choices, departments), // 개인 유닛 명단(표시 전용)
  }
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/game/setup.test.ts`
Expected: PASS (신규 + 기존 전부).

- [ ] **Step 6: 실패 테스트 — 세션 피로 누적 (session.test.ts)**

`session.test.ts`에 추가(기존 `runDay`/`runWeekFrom` 헬퍼 활용):

```ts
describe('피로 누적 — 표시 레이어(판정 무관)', () => {
  it('startSession/completeSetup은 피로 0에서 시작한다', () => {
    expect(startSession().fatigue).toEqual({})
    const s = completeSetup(conscientious)
    expect(s.fatigue).toEqual({})
  })

  it('순환기가 STEMI를 받은 날 마감 후 그 유닛 피로가 오른다', () => {
    let s = completeSetup(conscientious) // AESTHETICS:1, CARDIOLOGY:2
    s = runDay(s, (call) => call.kind === 'STEMI') // 월: STEMI 수용
    s = completeReceiving(s)
    const cardioIds = s.hospital!.roster!.filter((d) => d.dept === 'CARDIOLOGY').map((d) => d.id)
    expect(cardioIds.some((id) => (s.fatigue[id] ?? 0) > 0)).toBe(true)
  })

  it('주가 넘어가도 피로가 리셋되지 않는다(nextWeek 이월)', () => {
    let s = completeSetup(conscientious)
    s = runWeekFrom(s, (call) => call.kind === 'STEMI') // 7일차 DAY_END
    s = completeWeek(s)
    const before = { ...s.fatigue }
    s = nextWeek(s)
    expect(s.fatigue).toEqual(before) // 이월(변경 없음)
  })
})
```

> ⚠️ `runWeekFrom`이 반환하는 상태가 7일차 DAY_END인지 확인하고(기존 헬퍼가 그렇다), 아니면 마지막에 `completeReceiving`이 이미 적용됐는지 맞춘다. 기존 헬퍼 시그니처를 그대로 쓴다.

- [ ] **Step 7: 실패 확인**

Run: `npx vitest run src/game/session.test.ts`
Expected: FAIL — `fatigue` 필드 없음(타입/런타임).

- [ ] **Step 8: 구현 (session.ts)**

(1) import 추가: `import { doctorCaseloads, stepFatigue } from './doctor'`

(2) `SessionState`에 필드 추가(필수):

```ts
  /** 유닛별 피로도(0~100). 표시 전용·판정 무관. 하루 마감(completeReceiving)에 스텝, 주 간 유지. */
  fatigue: Record<string, number>
```

(3) 리터럴로 상태를 만드는 4개 생성자에 `fatigue: {}` 추가 — `startSession`·`enterWorldEvent`·`beginSetup`·`completeSetup`. (`nextWeek`·`beginWeek`·`advanceDay`·`completeWeek`은 `...state`라 자동 이월 — 변경 없음.)

예) `startSession`:
```ts
export function startSession(): SessionState {
  return { phase: 'LANDING', week: 1, day: 1, ledgerDays: [], history: [], morningNews: [], fatigue: {} }
}
```
`completeSetup`의 반환 리터럴에도 `fatigue: {}` 추가(개원 = 전원 0). `enterWorldEvent`·`beginSetup` 반환 리터럴에도 `fatigue: {}`.

(4) `completeReceiving`에서 피로 스텝:
```ts
export function completeReceiving(state: SessionState): SessionState {
  if (state.phase !== 'RECEIVING') {
    throw new Error(`completeReceiving requires RECEIVING, got ${state.phase}`)
  }
  if (!state.receiving?.done) {
    throw new Error('receiving not done')
  }
  const roster = state.hospital?.roster ?? []
  const caseloads = doctorCaseloads(roster, state.receiving)
  return {
    ...state,
    phase: 'DAY_END',
    ledgerDays: [...state.ledgerDays, recordDay(state.day, state.receiving)],
    fatigue: stepFatigue(state.fatigue, caseloads),
  }
}
```

- [ ] **Step 9: 통과 확인 + 전체 회귀 + tsc + 커밋**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전체 PASS(기존 + 신규) · tsc 0. **판정/경제 테스트 무변경 통과가 회귀 가드다.**

T-026 커밋: `feat: 병원 roster + 세션 피로 누적 배선 (표시 레이어, 판정 0 침습)` + 트레일러.

---

## Task 3: UI — RECEIVING 의사 명단 스트립

컴포넌트. 유닛테스트 없이 **브라우저 실측**으로 검증한다.

**Files:**
- Create: `src/components/DoctorRoster.tsx`
- Modify: `src/components/ReceivingPhase.tsx` (스트립 렌더 + `fatigue` prop)
- Modify: `src/components/SessionClient.tsx` (`fatigue` 전달)

**Interfaces:**
- Consumes: `Doctor`·`ReceivingState`·`doctorCaseloads` (Task 1·2)

- [ ] **Step 1: `DoctorRoster.tsx` 생성**

```tsx
"use client";

import { doctorCaseloads } from "@/game/doctor";
import { DEPARTMENTS } from "@/game/setup";
import type { ReceivingState } from "@/game/receiving";
import type { Doctor, DeptKey } from "@/game/types";

const deptMeta = (k: DeptKey) => DEPARTMENTS.find((d) => d.key === k)!;

/** 피로 막대 — 저=녹/중=황/고=적. 해석 카피 없음(막대만). */
function FatigueBar({ value }: { value: number }) {
  const color = value >= 67 ? "bg-red-500" : value >= 34 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
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
}: {
  roster: Doctor[];
  receiving: ReceivingState;
  fatigue: Record<string, number>;
}) {
  if (roster.length === 0) return null;
  const { total } = doctorCaseloads(roster, receiving);
  // 필수과 먼저(붕괴가 보이는 쪽) → 수익과, 같은 과는 DEPARTMENTS 순.
  const ordered = [...roster].sort((a, b) => {
    const ma = deptMeta(a.dept), mb = deptMeta(b.dept);
    if (ma.essential !== mb.essential) return ma.essential ? -1 : 1;
    return DEPARTMENTS.indexOf(ma) - DEPARTMENTS.indexOf(mb);
  });

  return (
    <section className="rounded-lg border border-zinc-800 bg-black/30 px-4 py-3">
      <p className="mb-2.5 text-[10px] uppercase tracking-[0.3em] text-zinc-600">의료진</p>
      <ul className="flex flex-col gap-2.5">
        {ordered.map((doc) => (
          <li key={doc.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-zinc-300">
                {doc.name} <span className="text-zinc-600">· {deptMeta(doc.dept).label}</span>
              </span>
              <span className="tabular-nums text-zinc-500">담당 {total.get(doc.id) ?? 0}명</span>
            </div>
            <FatigueBar value={fatigue[doc.id] ?? 0} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: `ReceivingPhase.tsx` — prop 추가 + 스트립 렌더**

(1) import 추가:
```tsx
import DoctorRoster from "./DoctorRoster";
```

(2) props에 `fatigue` 추가:
```tsx
export default function ReceivingPhase({
  receiving,
  day,
  news,
  fatigue,
  onDecide,
  onContinue,
}: {
  receiving: ReceivingState;
  day: number;
  news: NewsItem[];
  fatigue: Record<string, number>;
  onDecide: (accept: boolean, withWorkup?: boolean) => void;
  onContinue: () => void;
}) {
```

(3) 진행 중 뷰(마지막 `return`)의 콜/장부 행 **오른쪽 열**에 스트립을 장부 위에 넣는다. `<div className="w-full sm:w-72 sm:shrink-0">` 안, `<CheerfulLedger>` 앞:

```tsx
        <div className="flex w-full flex-col gap-4 sm:w-72 sm:shrink-0">
          <DoctorRoster roster={receiving.hospital.roster ?? []} receiving={receiving} fatigue={fatigue} />
          <CheerfulLedger receiving={receiving} />
        </div>
```
(기존 `<div className="w-full sm:w-72 sm:shrink-0"><CheerfulLedger .../></div>`를 위 블록으로 교체.)

- [ ] **Step 3: `SessionClient.tsx` — fatigue 전달**

RECEIVING 케이스의 `<ReceivingPhase>`에 prop 추가:
```tsx
          news={session.morningNews}
          fatigue={session.fatigue}
```

- [ ] **Step 4: tsc + 브라우저 검증**

Run: `npx tsc --noEmit`
Expected: 0 errors.

브라우저(preview_start `{name}` 또는 dev 서버):
1. 개원 위저드에서 순환기 2명 + 미용 1명 채용 → 개원.
2. RECEIVING 화면에 **의료진 스트립**이 뜨는지(순환기 2명 먼저, 미용 1명), 각 카드에 이름·과·담당 0명·피로 막대(전원 저=녹).
3. STEMI 콜을 **수용**하면 순환기 유닛의 "담당 N명"이 즉시 증가(실시간).
4. 하루 끝 `계속` → 다음 날 진입 후 스트립의 피로 막대가 순환기 쪽만 오른 것 확인(미용은 그대로).
5. `read_console_messages` 에러 0.
6. 스크린샷(대조가 보이는 순간 — 순환기 레드/미용 녹).

- [ ] **Step 5: Task 3 커밋**

T-026 커밋: `feat: RECEIVING 의사 명단 스트립 — 담당 수·피로 막대 (브라우저 검증)` + 트레일러.

---

## 마무리 (구현 완료 후)

- `plan.md` 해당 항목 ✅ · `changeLog.md` 한 줄(PR 번호 생략) · (1분+ 디버깅했으면) `troubleshooting/T-###`.
- `finishing-a-development-branch`로 PR 생성 → 사용자에게 머지 여부 확인.
- PR body sweep: troubleshooting·learning-notes 후보 점검, AI 트레일러 집계 여부.

## Self-Review 체크(계획 작성자)

- **스펙 커버리지**: §3 데이터(Task 1·2) · §4 담당수(Task 1) · §5 피로(Task 1·2) · §6 UI(Task 3) · §7 0 침습(Global Constraints + Task 2 회귀 가드) · §8 테스트(각 Task) — 전부 태스크 있음. ✅
- **타입 일관성**: `doctorCaseloads` 반환 `{total, night}` ↔ `stepFatigue` 인자 일치, 컴포넌트는 `.total` 사용. `Doctor`·`Hospital.roster?`·`SessionState.fatigue` 시그니처 태스크 간 동일. ✅
- **순환 임포트**: doctor.ts 런타임 임포트 0 → setup→doctor(런타임)·doctor→receiving(type-only, 소거) → 런타임 사이클 없음. ✅
- **플레이스홀더 스캔**: 완전 코드·정확 경로·기대 출력 채움(명명식·상수값 확정). ✅
