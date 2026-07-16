# 경영 확장 — 결정론 로직 코어 Implementation Plan (Part 1/2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경영 확장(2막 단막극)의 **결정론 순수 로직**을 TDD로 구축한다 — 병원 설립(setup), 콜 큐 수용/거절(receiving), 5-페이즈 세션 상태기계(session), 결말 장부 재배선(ledger), 1막 다크코미디 폴백 대사(dialogue). UI는 Part 2에서 이 위에 얹는다.

**Architecture:** 기존 `판정=코드 / 대사=LLM` 원칙과 순수함수+TDD 패턴을 그대로 잇는다. 신규 순수 모듈(`setup.ts`·`receiving.ts`·`session.ts`)은 기존 `adjudicate`·`round`·`debrief`·`ledger`·`scenarios`를 **재사용**한다. 위저드가 만든 플레이어 병원(`Hospital`+`HospitalEconomics`)이 1막에서 `adjudicateTransfer`의 대상이 되고(벽을 안쪽에서 배움), 2막에서 그 병원의 `backupCare`가 in-house 생존 vs 외부 뺑뺑이를 가른다. 결말 장부·영수증은 **플레이어 병원 데이터**로 파생된다.

**Tech Stack:** TypeScript(strict) · Vitest 4 · 순수함수(React·Next 무관). 러너: `npm test`(= `vitest run`), 단일 파일 `npx vitest run <path>`.

## Global Constraints

이 섹션은 **모든 태스크의 요구사항에 암묵적으로 포함**된다.

- **판정=결정론 코드**: 게임 상태 전이는 순수 함수가 정한다. RNG 금지(`Math.random` 0건), `Date.now`/`new Date` 금지(시간은 이벤트가 명시적으로 흘린다). 같은 입력 → 같은 출력.
- **불변(immutable) 상태**: 리듀서는 새 객체를 반환한다(기존 `round.ts`·`goldenTime.ts` 스타일). 입력 변형 금지.
- **부호만 근거 · ₩ 각색**: 금액(억)·수치는 각색이되 **부호(적자↔흑자)·대소**는 리서치를 지킨다 — 근거: [essential-care-economics.md](../../research/essential-care-economics.md)(필수과 적자/미용·검진 흑자), [essential-care-litigation-risk.md](../../research/essential-care-litigation-risk.md)(소송 리스크의 부호는 '분쟁 빈도'가 아니라 **결과의 중대성**; "미용은 소송 없다"가 아니라 "미용·검진은 중대 결과 리스크가 낮다").
- **톤 분업**: 다크코미디는 **1막(receiving·dialogue)에만**. 2막·결말은 냉정(라벨+숫자, 해석 0 — PR #13/#14 원칙). 농담의 과녁은 시스템의 태연한 논리이지 죽는 환자·특정 집단이 아니다. 병원명·인물은 가상.
- **한글 커밋 메시지**: T-026 패턴(`.commit-msg-tmp` UTF-8 파일 + `git commit -F .commit-msg-tmp`)으로 PowerShell 5.1 CP949 깨짐을 피한다. `.commit-msg-tmp`는 `.gitignore`에 이미 있음.
- **테스트 컨벤션**: `import { describe, it, expect } from 'vitest'`, 파일은 대상과 co-located(`src/game/<name>.test.ts`), 한글 describe/it 라벨.
- **비파괴**: 기존 8/10 제출 게임(standalone `GameClient`)·기존 불변식·기존 테스트를 깨지 않는다. 특히 `buildLedger(state)` 시그니처·동작은 **보존**(신규 함수를 얹기만).
- **이번 주 컷라인(YAGNI)**: 병상은 고정값(위저드에서 안 고름). 병동 증설·장비 업그레이드·재투자 루프·다양한 환자 축·리치한 소송 이벤트·실LLM은 **범위 밖**(구조 2/다음 주). CARDIOLOGY만 STEMI 슬라이스의 기계적 분기점(spec ⓐ).

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `src/game/types.ts` | 공유 도메인 타입에 `DeptKey`·`DepartmentSpec`·`SetupChoices`·`CallKind`·`IncomingCall` 추가 | 수정(추가만) |
| `src/game/setup.ts` | 과 카탈로그(`DEPARTMENTS`) + `buildHospital(choices)` + 예산 헬퍼. 순수·결정론 | 신규 |
| `src/game/setup.test.ts` | setup 테스트 | 신규 |
| `src/game/ledger.ts` | `composeLedger` 추출 + `buildSessionLedger`(플레이어 병원 + 콜 델타 + 소송 비용). `buildLedger(state)`는 보존 | 수정 |
| `src/game/ledger.test.ts` | 기존 8 테스트 보존 + 세션 장부 테스트 추가 | 수정(추가만) |
| `src/game/receiving.ts` | 콜 큐(`createCallQueue`) + `classifyCall` + `initReceiving` + `decide` 리듀서 | 신규 |
| `src/game/receiving.test.ts` | receiving 테스트 | 신규 |
| `src/game/session.ts` | 5-페이즈 상태기계 + `buildEpilogue` | 신규 |
| `src/game/session.test.ts` | 세션 전이·분기·통합 불변식 테스트 | 신규 |
| `src/game/dialogue.ts` | 1막 받는 쪽 다크코미디 폴백 대사 추가. 기존 발신 쪽 함수 보존 | 수정(추가만) |
| `src/game/dialogue.test.ts` | 받는 쪽 대사 테스트 추가 | 수정(추가만) |

의존 순서: **Task 1(setup) → Task 2(ledger) → Task 3(receiving) → Task 4(session) → Task 5(dialogue)**. Task 4는 1~3에 의존, Task 5는 3에 의존.

---

### Task 1: setup.ts — 과 카탈로그 + buildHospital + 예산

**Files:**
- Modify: `src/game/types.ts` (타입 추가만, 기존 유지)
- Create: `src/game/setup.ts`
- Test: `src/game/setup.test.ts`

**Interfaces:**
- Consumes: 기존 `Hospital`, `HospitalEconomics`, `Specialty`(types.ts).
- Produces:
  - `type RevenueDept = 'AESTHETICS' | 'CHECKUP'`
  - `type DeptKey = RevenueDept | Specialty`
  - `interface DepartmentSpec { key: DeptKey; label: string; essential: boolean; profitPerDoctorBillions: number; hireCostBillions: number; lawsuitRisk: boolean; providesBackup?: Specialty }`
  - `interface SetupChoices { hospitalName: string; doctors: Partial<Record<DeptKey, number>> }`
  - `const DEPARTMENTS: DepartmentSpec[]`
  - `const FIXED_BEDS = 2`, `const SETUP_BUDGET_BILLIONS = 100`
  - `buildHospital(choices: SetupChoices): { hospital: Hospital; economics: HospitalEconomics }`
  - `hiringCost(choices: SetupChoices): number`
  - `withinBudget(choices: SetupChoices): boolean`

- [ ] **Step 1: 타입 추가 (types.ts)**

`src/game/types.ts` 맨 아래에 추가(기존 내용은 그대로 둔다):

```ts
/** 수익과(비필수) — 필수과는 기존 Specialty로 표현한다. */
export type RevenueDept = 'AESTHETICS' | 'CHECKUP'

/** 위저드에서 고를 수 있는 과 = 수익과 + 필수과. */
export type DeptKey = RevenueDept | Specialty

/**
 * 과 카탈로그 한 줄. 금액(억)은 각색이되 부호(적자↔흑자)만 근거를 지킨다.
 * lawsuitRisk = "소송 리스크 ⚠"(필수·고위험과). 근거: essential-care-litigation-risk.md
 * — 부호는 '분쟁 빈도'가 아니라 결과의 중대성(사망·중증장애·형사기소).
 */
export interface DepartmentSpec {
  key: DeptKey
  label: string
  essential: boolean
  profitPerDoctorBillions: number // 의사 1명당 분기 손익(부호만 근거)
  hireCostBillions: number // 채용 예산 표기(필수·고위험과는 인력 희소 → 비쌈)
  lawsuitRisk: boolean
  providesBackup?: Specialty // 이 과가 제공하는 배후진료(필수과만)
}

/** 설정 위저드 산출물 — 곧 플레이어 병원이 된다. */
export interface SetupChoices {
  hospitalName: string
  doctors: Partial<Record<DeptKey, number>> // 과별 의사 수
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (setup.test.ts)**

`src/game/setup.test.ts` 신규:

```ts
import { describe, it, expect } from 'vitest'
import { DEPARTMENTS, FIXED_BEDS, SETUP_BUDGET_BILLIONS, buildHospital, hiringCost, withinBudget } from './setup'
import type { SetupChoices } from './types'

// 합리적 공범 빌드: 미용·검진만(흑자·필수과 0)
const collaborator: SetupChoices = {
  hospitalName: '흑자메디컬',
  doctors: { AESTHETICS: 3, CHECKUP: 2 },
}
// 양심 빌드: 순환기 배후 건설(적자·소송 리스크)
const conscientious: SetupChoices = {
  hospitalName: '양심병원',
  doctors: { AESTHETICS: 1, CARDIOLOGY: 2 },
}

describe('DEPARTMENTS 카탈로그', () => {
  it('수익과는 흑자·비필수, 필수과는 적자·소송리스크 (부호 근거)', () => {
    const aesthetics = DEPARTMENTS.find((d) => d.key === 'AESTHETICS')!
    const cardiology = DEPARTMENTS.find((d) => d.key === 'CARDIOLOGY')!
    expect(aesthetics.essential).toBe(false)
    expect(aesthetics.profitPerDoctorBillions).toBeGreaterThan(0)
    expect(aesthetics.lawsuitRisk).toBe(false)
    expect(cardiology.essential).toBe(true)
    expect(cardiology.profitPerDoctorBillions).toBeLessThan(0)
    expect(cardiology.lawsuitRisk).toBe(true)
    expect(cardiology.providesBackup).toBe('CARDIOLOGY')
  })
})

describe('buildHospital — 위저드 선택 → 플레이어 병원', () => {
  it('공범 빌드: backupCare에 CARDIOLOGY 없음 · essentialHires 0 · 순이익 흑자', () => {
    const { hospital, economics } = buildHospital(collaborator)
    expect(hospital.name).toBe('흑자메디컬')
    expect(hospital.beds).toBe(FIXED_BEDS)
    expect(hospital.hasErOnCall).toBe(true)
    expect(hospital.overcrowded).toBe(false)
    expect(hospital.backupCare).not.toContain('CARDIOLOGY')
    expect(economics.essentialHires).toBe(0)
    const net = economics.segments.reduce((n, s) => n + s.profitBillions, 0)
    expect(net).toBeGreaterThan(0)
  })

  it('양심 빌드: backupCare에 CARDIOLOGY 포함 · essentialHires = 순환기 의사 수 · 적자 부문 존재', () => {
    const { hospital, economics } = buildHospital(conscientious)
    expect(hospital.backupCare).toContain('CARDIOLOGY')
    expect(economics.essentialHires).toBe(2)
    expect(economics.segments.some((s) => s.profitBillions < 0)).toBe(true)
  })

  it('segments·hires는 실제 채용한 과만, 손익은 의사 수에 비례', () => {
    const { economics } = buildHospital(collaborator)
    const aesthetics = economics.segments.find((s) => s.label === '미용·피부')!
    expect(aesthetics.profitBillions).toBe(70 * 3) // profitPerDoctor(70) × 3명
    expect(economics.hires).toContainEqual({ label: '미용·피부', count: 3 })
    expect(economics.segments.every((s) => s.profitBillions !== 0)).toBe(true)
  })

  it('essentialHires는 CARDIOLOGY 의사 수에서만 파생 — 흉부외과만 뽑으면 0 (spec ⓐ)', () => {
    const { hospital, economics } = buildHospital({
      hospitalName: '엉뚱과병원',
      doctors: { THORACIC_SURGERY: 2 },
    })
    expect(hospital.backupCare).toContain('THORACIC_SURGERY')
    expect(hospital.backupCare).not.toContain('CARDIOLOGY')
    expect(economics.essentialHires).toBe(0)
  })

  it('결정론 — 같은 선택은 같은 병원', () => {
    expect(buildHospital(collaborator)).toEqual(buildHospital(collaborator))
  })
})

describe('예산', () => {
  it('hiringCost = 과별 채용비 × 의사 수 합', () => {
    // AESTHETICS 10×3 + CHECKUP 12×2 = 54
    expect(hiringCost(collaborator)).toBe(54)
  })

  it('withinBudget: 한도 이내 true, 초과 false', () => {
    expect(withinBudget(collaborator)).toBe(true)
    const overspend: SetupChoices = { hospitalName: '과소비', doctors: { CARDIOLOGY: 10 } }
    expect(hiringCost(overspend)).toBeGreaterThan(SETUP_BUDGET_BILLIONS)
    expect(withinBudget(overspend)).toBe(false)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/game/setup.test.ts`
Expected: FAIL — `Failed to resolve import "./setup"` (모듈 없음).

- [ ] **Step 4: 구현 (setup.ts)**

`src/game/setup.ts` 신규:

```ts
import type { DepartmentSpec, DeptKey, Hospital, HospitalEconomics, SetupChoices, Specialty } from './types'

// 병원 설립(위저드) — 순수·결정론. 위저드 선택이 곧 플레이어의 Hospital + HospitalEconomics다.
// 부호(적자↔흑자)만 근거를 지키고 금액은 각색: essential-care-economics.md / essential-care-litigation-risk.md.
// 이번 주 단순화(spec ⓐ): CARDIOLOGY만 STEMI 슬라이스의 기계적 분기점. 병상은 고정값.

/** 플레이어 병원의 고정 병상(위저드에서 안 고름 — 이번 주 단순화). */
export const FIXED_BEDS = 2
/** 채용 예산(억). 위저드가 이 한도로 선택을 제약해 "미용 vs 순환기" 딜레마를 만든다. */
export const SETUP_BUDGET_BILLIONS = 100

/** 고를 수 있는 과. 수익과(흑자·비필수) + 필수 배후과(적자·소송 ⚠). */
export const DEPARTMENTS: DepartmentSpec[] = [
  { key: 'AESTHETICS', label: '미용·피부', essential: false, profitPerDoctorBillions: 70, hireCostBillions: 10, lawsuitRisk: false },
  { key: 'CHECKUP', label: '건강검진', essential: false, profitPerDoctorBillions: 40, hireCostBillions: 12, lawsuitRisk: false },
  { key: 'CARDIOLOGY', label: '순환기내과', essential: true, profitPerDoctorBillions: -12, hireCostBillions: 30, lawsuitRisk: true, providesBackup: 'CARDIOLOGY' },
  { key: 'THORACIC_SURGERY', label: '흉부외과', essential: true, profitPerDoctorBillions: -15, hireCostBillions: 32, lawsuitRisk: true, providesBackup: 'THORACIC_SURGERY' },
  { key: 'OBSTETRICS', label: '산부인과', essential: true, profitPerDoctorBillions: -10, hireCostBillions: 28, lawsuitRisk: true, providesBackup: 'OBSTETRICS' },
  { key: 'NEUROSURGERY', label: '신경외과', essential: true, profitPerDoctorBillions: -13, hireCostBillions: 30, lawsuitRisk: true, providesBackup: 'NEUROSURGERY' },
  { key: 'GENERAL_SURGERY', label: '외과', essential: true, profitPerDoctorBillions: -8, hireCostBillions: 22, lawsuitRisk: true, providesBackup: 'GENERAL_SURGERY' },
]

function count(choices: SetupChoices, key: DeptKey): number {
  return choices.doctors[key] ?? 0
}

/** 위저드 선택 → 플레이어 병원 + 경제 데이터. */
export function buildHospital(choices: SetupChoices): { hospital: Hospital; economics: HospitalEconomics } {
  const staffed = DEPARTMENTS.map((dept) => ({ dept, n: count(choices, dept.key) })).filter((x) => x.n > 0)

  const backupCare: Specialty[] = staffed
    .filter((x) => x.dept.providesBackup)
    .map((x) => x.dept.providesBackup as Specialty)

  const segments = staffed.map((x) => ({ label: x.dept.label, profitBillions: x.dept.profitPerDoctorBillions * x.n }))
  const hires = staffed.filter((x) => !x.dept.essential).map((x) => ({ label: x.dept.label, count: x.n }))
  // 필수 배후과 채용 수는 STEMI 슬라이스가 요구하는 CARDIOLOGY 수에서 파생(spec ⓐ).
  const essentialHires = count(choices, 'CARDIOLOGY')

  const economics: HospitalEconomics = { segments, hires, essentialHires }
  const hospital: Hospital = {
    id: 'player',
    name: choices.hospitalName,
    beds: FIXED_BEDS,
    hasErOnCall: true,
    overcrowded: false,
    backupCare,
    economics,
  }
  return { hospital, economics }
}

/** 선택의 총 채용비(억). */
export function hiringCost(choices: SetupChoices): number {
  return DEPARTMENTS.reduce((sum, d) => sum + d.hireCostBillions * count(choices, d.key), 0)
}

/** 예산 한도 이내인가. */
export function withinBudget(choices: SetupChoices): boolean {
  return hiringCost(choices) <= SETUP_BUDGET_BILLIONS
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/game/setup.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: 커밋**

```bash
# .commit-msg-tmp (UTF-8)에 아래 메시지를 쓰고 git commit -F .commit-msg-tmp (T-026)
# feat(sim): 병원 설립 setup — 과 카탈로그 + buildHospital + 예산 (결정론·TDD)
git add src/game/types.ts src/game/setup.ts src/game/setup.test.ts
git commit -F .commit-msg-tmp
```

---

### Task 2: ledger.ts — composeLedger 추출 + buildSessionLedger

**Files:**
- Modify: `src/game/ledger.ts`
- Test: `src/game/ledger.test.ts` (기존 8 테스트 보존, 추가만)

**Interfaces:**
- Consumes: 기존 `Ledger`, `LedgerSegment`, `buildLedger(state)`, `Hospital`, `Specialty`.
- Produces:
  - `buildSessionLedger(hospital: Hospital, patientSpecialty: Specialty, receiving: { netProfitDeltaBillions: number; lawsuitExposure: number }): Ledger | null`
  - `const LAWSUIT_COST_PER_EXPOSURE = 25` (소송 비용 실현 단가, 억 — 각색·꼬리위험)
  - 내부 `composeLedger(hospital, patientSpecialty, extraSegments)` — `buildLedger`가 이걸로 위임하되 **동작 불변**.

- [ ] **Step 1: 실패하는 테스트 작성 (ledger.test.ts에 추가)**

`src/game/ledger.test.ts` 맨 위 import에 `buildSessionLedger`, `LAWSUIT_COST_PER_EXPOSURE`를 추가하고, 파일 끝(마지막 `})` 뒤)에 새 describe 블록을 추가한다. 기존 코드는 건드리지 않는다.

import 줄 수정:
```ts
import { buildLedger, buildSessionLedger, LAWSUIT_COST_PER_EXPOSURE } from './ledger'
```

파일 끝에 추가:
```ts
describe('buildSessionLedger — 플레이어 병원 결말 장부(콜 델타 + 소송 비용)', () => {
  const collaboratorHospital: Hospital = {
    id: 'player', name: '흑자메디컬', beds: 2, hasErOnCall: true, overcrowded: false,
    backupCare: [],
    economics: { segments: [{ label: '미용·피부', profitBillions: 210 }], hires: [{ label: '미용·피부', count: 3 }], essentialHires: 0 },
  }
  const conscientiousHospital: Hospital = {
    id: 'player', name: '양심병원', beds: 2, hasErOnCall: true, overcrowded: false,
    backupCare: ['CARDIOLOGY'],
    economics: { segments: [{ label: '순환기내과', profitBillions: -24 }], hires: [], essentialHires: 2 },
  }

  it('공범: 순환기 없음 → essentialHires 0, 콜 수익 델타가 순이익에 반영, 소송 비용 없음', () => {
    const led = buildSessionLedger(collaboratorHospital, 'CARDIOLOGY', { netProfitDeltaBillions: 16, lawsuitExposure: 0 })!
    expect(led.essentialHires).toBe(0)
    expect(led.segments).toContainEqual({ label: '분기 진료 수익', profitBillions: 16 })
    expect(led.segments.some((s) => s.label === '소송 비용')).toBe(false)
    expect(led.netProfitBillions).toBe(210 + 16)
  })

  it('양심: 순환기 있음 → essentialHires 2, 소송 노출 → 소송 비용 한 줄(음수)이 순이익을 깎음', () => {
    const led = buildSessionLedger(conscientiousHospital, 'CARDIOLOGY', { netProfitDeltaBillions: -20, lawsuitExposure: 1 })!
    expect(led.essentialHires).toBe(2)
    expect(led.segments).toContainEqual({ label: '소송 비용', profitBillions: -LAWSUIT_COST_PER_EXPOSURE })
    expect(led.netProfitBillions).toBe(-24 + -20 + -LAWSUIT_COST_PER_EXPOSURE)
    expect(led.netProfitBillions).toBeLessThan(0)
  })

  it('델타 0·노출 0이면 추가 세그먼트 없음(기저만)', () => {
    const led = buildSessionLedger(collaboratorHospital, 'CARDIOLOGY', { netProfitDeltaBillions: 0, lawsuitExposure: 0 })!
    expect(led.segments).toEqual(collaboratorHospital.economics!.segments)
  })

  it('경제 데이터 없으면 null', () => {
    const bare: Hospital = { id: 'x', name: '무장부', beds: 2, hasErOnCall: true, overcrowded: false, backupCare: [] }
    expect(buildSessionLedger(bare, 'CARDIOLOGY', { netProfitDeltaBillions: 5, lawsuitExposure: 0 })).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/game/ledger.test.ts`
Expected: FAIL — `buildSessionLedger`/`LAWSUIT_COST_PER_EXPOSURE` export 없음.

- [ ] **Step 3: 구현 (ledger.ts 리팩터 — 동작 보존)**

`src/game/ledger.ts`에서 `buildLedger`를 아래로 교체하고 `composeLedger`·`buildSessionLedger`·`LAWSUIT_COST_PER_EXPOSURE`를 추가한다. `import`에 `Specialty`는 이미 있음. `LedgerSegment` 타입도 이미 있음.

기존 `buildLedger` 함수(파일의 `export function buildLedger(state: GameState): Ledger | null { ... }` 블록 전체)를 다음으로 교체:

```ts
/** 소송 비용 실현 단가(억) — 필수·고위험 케이스 수용의 꼬리위험 한 방. 각색(부호만 근거: 축 C). */
export const LAWSUIT_COST_PER_EXPOSURE = 25

/** 병원+경제에서 장부를 조립하는 순수 코어. extraSegments로 세션 델타(진료 수익·소송 비용)를 얹는다. */
function composeLedger(
  hospital: Hospital,
  patientSpecialty: Specialty,
  extraSegments: LedgerSegment[],
): Ledger | null {
  const econ = hospital.economics
  if (!econ) return null
  const segments = [...econ.segments, ...extraSegments]
  // 파생: 그 과 배후진료가 있을 때만 채용 수가 잡히고, 없으면(=NO_BACKUP_CARE의 뿌리) 0.
  const essentialHires = hospital.backupCare.includes(patientSpecialty) ? econ.essentialHires : 0
  const netProfitBillions = segments.reduce((n, s) => n + s.profitBillions, 0)
  const totalHires = econ.hires.reduce((n, h) => n + h.count, 0) + essentialHires
  return {
    hospitalName: hospital.name,
    segments,
    netProfitBillions,
    hires: econ.hires,
    essentialSpecialty: patientSpecialty,
    essentialHires,
    totalHires,
  }
}

export function buildLedger(state: GameState): Ledger | null {
  const hospital = ledgerHospital(state.hospitals)
  if (!hospital) return null
  return composeLedger(hospital, state.patient.requiredSpecialty, [])
}

/**
 * 세션 결말 장부 — 플레이어 병원(위저드 산출) + 1막 콜 델타 + 소송 비용을 결정론적으로 조립.
 * 공범(순환기 0): 흑자 + 채용 0 + 소송 비용 없음. 양심(순환기 N): 적자 + 소송 비용 한 줄.
 */
export function buildSessionLedger(
  hospital: Hospital,
  patientSpecialty: Specialty,
  receiving: { netProfitDeltaBillions: number; lawsuitExposure: number },
): Ledger | null {
  const extra: LedgerSegment[] = []
  if (receiving.netProfitDeltaBillions !== 0) {
    extra.push({ label: '분기 진료 수익', profitBillions: receiving.netProfitDeltaBillions })
  }
  const lawsuitCost = receiving.lawsuitExposure > 0 ? receiving.lawsuitExposure * LAWSUIT_COST_PER_EXPOSURE : 0
  if (lawsuitCost > 0) {
    extra.push({ label: '소송 비용', profitBillions: -lawsuitCost })
  }
  return composeLedger(hospital, patientSpecialty, extra)
}
```

`Specialty`가 import에 없다면 `import type { GameState } from './round'` 아래의 `import type { Hospital, Specialty } from './types'`에 이미 포함돼 있다(기존 파일 확인). `LedgerSegment`는 같은 파일에 정의돼 있으므로 그대로 참조.

- [ ] **Step 4: 테스트 통과 확인(기존+신규 전부)**

Run: `npx vitest run src/game/ledger.test.ts`
Expected: PASS — 기존 8 + 신규 4 = 12 tests. (기존 `buildLedger` 테스트가 그대로 green이어야 = 동작 보존 증명.)

- [ ] **Step 5: 커밋**

```bash
# feat(sim): 결말 장부 재배선 buildSessionLedger — 플레이어 병원 + 콜 델타 + 소송 비용 (동작 보존·TDD)
git add src/game/ledger.ts src/game/ledger.test.ts
git commit -F .commit-msg-tmp
```

---

### Task 3: receiving.ts — 콜 큐 + classifyCall + decide 리듀서

**Files:**
- Modify: `src/game/types.ts` (`CallKind`·`IncomingCall` 추가)
- Create: `src/game/receiving.ts`
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Consumes: `Hospital`, `Patient`, `adjudicateTransfer`(adjudicate.ts).
- Produces:
  - `type CallKind = 'STEMI' | 'GENERAL_EMERGENCY' | 'COSMETIC_WALKIN'`
  - `interface IncomingCall { id: string; kind: CallKind; label: string; patient: Patient; lawsuitRisk: boolean }`
  - `type CallDisposition = 'HARDLOCK_REJECT' | 'CHOICE'`
  - `interface ReceivingState { hospital: Hospital; queue: IncomingCall[]; index: number; netProfitDeltaBillions: number; lawsuitExposure: number; log: { callId: string; accepted: boolean; disposition: CallDisposition }[]; done: boolean }`
  - `createCallQueue(): IncomingCall[]` (고정 5통, 결정론)
  - `classifyCall(hospital: Hospital, call: IncomingCall): CallDisposition`
  - `initReceiving(hospital: Hospital, queue?: IncomingCall[]): ReceivingState`
  - `decide(state: ReceivingState, accept: boolean): ReceivingState`

- [ ] **Step 1: 타입 추가 (types.ts)**

`src/game/types.ts` 맨 아래에 추가:

```ts
/** 1막 콜 종류. */
export type CallKind =
  | 'STEMI' // 급성심근경색 — 순환기 배후 필요(없으면 하드락)
  | 'GENERAL_EMERGENCY' // 일반 응급 — 병상만 있으면 받을 수 있음(저마진)
  | 'COSMETIC_WALKIN' // 미용·검진 워크인 — 늘 받을 수 있음(명랑)

/** 걸려오는 콜 한 통. patient는 STEMI/일반응급 판정에 쓰인다(워크인은 명목값). */
export interface IncomingCall {
  id: string
  kind: CallKind
  label: string // 화면 표시용 상황 요약
  patient: Patient
  lawsuitRisk: boolean // 수용 시 소송 노출 누적 여부(고위험 필수 케이스)
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (receiving.test.ts)**

`src/game/receiving.test.ts` 신규:

```ts
import { describe, it, expect } from 'vitest'
import { createCallQueue, classifyCall, initReceiving, decide } from './receiving'
import { buildHospital } from './setup'
import type { Hospital, SetupChoices } from './types'

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

function hospitalOf(c: SetupChoices): Hospital {
  return buildHospital(c).hospital
}

describe('createCallQueue — 고정 5통(결정론)', () => {
  it('5통이고 STEMI·워크인·일반응급을 모두 포함', () => {
    const q = createCallQueue()
    expect(q).toHaveLength(5)
    const kinds = new Set(q.map((c) => c.kind))
    expect(kinds).toContain('STEMI')
    expect(kinds).toContain('COSMETIC_WALKIN')
    expect(kinds).toContain('GENERAL_EMERGENCY')
    expect(q.every((c) => c.id)).toBe(true)
  })

  it('STEMI 콜은 lawsuitRisk=true, 워크인은 false', () => {
    const q = createCallQueue()
    expect(q.filter((c) => c.kind === 'STEMI').every((c) => c.lawsuitRisk)).toBe(true)
    expect(q.filter((c) => c.kind === 'COSMETIC_WALKIN').every((c) => !c.lawsuitRisk)).toBe(true)
  })

  it('결정론 — 같은 큐', () => {
    expect(createCallQueue()).toEqual(createCallQueue())
  })
})

describe('classifyCall — 하드락 vs 선택', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const general = q.find((c) => c.kind === 'GENERAL_EMERGENCY')!

  it('워크인은 늘 CHOICE(명랑하게 받을 수 있음)', () => {
    expect(classifyCall(hospitalOf(collaborator), walkin)).toBe('CHOICE')
  })

  it('STEMI: 순환기 없으면 하드락, 있으면 선택', () => {
    expect(classifyCall(hospitalOf(collaborator), stemi)).toBe('HARDLOCK_REJECT')
    expect(classifyCall(hospitalOf(conscientious), stemi)).toBe('CHOICE')
  })

  it('일반응급: 병상+응급실 있으면 선택(배후 무관)', () => {
    expect(classifyCall(hospitalOf(collaborator), general)).toBe('CHOICE')
  })
})

describe('decide 리듀서 — 장부·소송 누적', () => {
  it('워크인 수용 → 순이익 델타↑, 소송 노출 0', () => {
    const s0 = initReceiving(hospitalOf(collaborator))
    // 첫 콜을 워크인으로 만들기 위해 큐를 직접 구성
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const s = initReceiving(hospitalOf(collaborator), [walkin])
    const after = decide(s, true)
    expect(after.netProfitDeltaBillions).toBeGreaterThan(0)
    expect(after.lawsuitExposure).toBe(0)
    expect(after.done).toBe(true)
    expect(s0.index).toBe(0) // 원본 불변
  })

  it('STEMI 하드락 콜은 accept=true여도 수용 안 됨(가드) — 델타·노출 불변', () => {
    const stemi = createCallQueue().find((c) => c.kind === 'STEMI')!
    const s = initReceiving(hospitalOf(collaborator), [stemi]) // 순환기 없음 → 하드락
    const after = decide(s, true)
    expect(after.log[0].disposition).toBe('HARDLOCK_REJECT')
    expect(after.log[0].accepted).toBe(false)
    expect(after.netProfitDeltaBillions).toBe(0)
    expect(after.lawsuitExposure).toBe(0)
  })

  it('양심 병원의 STEMI 수용 → 적자 델타 + 소송 노출 +1', () => {
    const stemi = createCallQueue().find((c) => c.kind === 'STEMI')!
    const s = initReceiving(hospitalOf(conscientious), [stemi])
    const after = decide(s, true)
    expect(after.log[0].disposition).toBe('CHOICE')
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaBillions).toBeLessThan(0)
    expect(after.lawsuitExposure).toBe(1)
  })

  it('선택 콜 거절 → 델타·노출 불변, 인덱스 전진', () => {
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const s = initReceiving(hospitalOf(collaborator), [walkin])
    const after = decide(s, false)
    expect(after.netProfitDeltaBillions).toBe(0)
    expect(after.index).toBe(1)
    expect(after.done).toBe(true)
  })

  it('전체 큐 소진 시 done, 이후 decide는 에러', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false)
    expect(s.done).toBe(true)
    expect(() => decide(s, false)).toThrow()
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/game/receiving.test.ts`
Expected: FAIL — `Failed to resolve import "./receiving"`.

- [ ] **Step 4: 구현 (receiving.ts)**

`src/game/receiving.ts` 신규:

```ts
import type { CallKind, Hospital, IncomingCall, Patient } from './types'
import { adjudicateTransfer } from './adjudicate'

// 1막 콜 큐 — 받는 병원. 기존 adjudicateTransfer를 플레이어 손으로 돌린다(벽의 양쪽).
// 순수·결정론·불변. 다크코미디는 대사(dialogue.ts)와 UI가, 여기선 숫자만.

/** 수용/거절로 누적되는 분기 손익 델타(억). 부호만 근거, 금액 각색. */
const PROFIT_DELTA: Record<CallKind, number> = {
  COSMETIC_WALKIN: 8, // 명랑한 흑자
  GENERAL_EMERGENCY: 2, // 저마진
  STEMI: -20, // 적자(필수·고위험 케이스 수용의 대가)
}

export type CallDisposition = 'HARDLOCK_REJECT' | 'CHOICE'

export interface ReceivingState {
  hospital: Hospital
  queue: IncomingCall[]
  index: number
  netProfitDeltaBillions: number
  lawsuitExposure: number
  log: { callId: string; accepted: boolean; disposition: CallDisposition }[]
  done: boolean
}

const stemiPatient: Patient = { id: 'call-stemi', requiredSpecialty: 'CARDIOLOGY', severity: 5 }
const generalPatient: Patient = { id: 'call-general', requiredSpecialty: 'GENERAL_SURGERY', severity: 3 }
const walkinPatient: Patient = { id: 'call-walkin', requiredSpecialty: 'CARDIOLOGY', severity: 1 } // 명목값(판정 안 함)

/** 고정 5통 콜 큐 — 코미디 리듬 우선(워크인/STEMI 교차). 결정론. */
export function createCallQueue(): IncomingCall[] {
  return [
    { id: 'c1', kind: 'COSMETIC_WALKIN', label: '보톡스 상담 워크인', patient: walkinPatient, lawsuitRisk: false },
    { id: 'c2', kind: 'STEMI', label: '급성심근경색 — 타 병원 전원 요청', patient: stemiPatient, lawsuitRisk: true },
    { id: 'c3', kind: 'COSMETIC_WALKIN', label: '검진 패키지 문의', patient: walkinPatient, lawsuitRisk: false },
    { id: 'c4', kind: 'GENERAL_EMERGENCY', label: '복통 응급 — 병상 요청', patient: generalPatient, lawsuitRisk: false },
    { id: 'c5', kind: 'STEMI', label: '급성심근경색 — 재이송', patient: stemiPatient, lawsuitRisk: true },
  ]
}

/** 이 콜을 받을 수 있는가(선택) vs 판정상 못 받는가(하드락). */
export function classifyCall(hospital: Hospital, call: IncomingCall): CallDisposition {
  switch (call.kind) {
    case 'COSMETIC_WALKIN':
      return 'CHOICE' // 응급이 아니라 늘 받을 수 있다(명랑)
    case 'GENERAL_EMERGENCY':
      // 병상·응급실만 있으면 받는다(배후 무관, 저마진).
      return hospital.beds > 0 && hospital.hasErOnCall && !hospital.overcrowded ? 'CHOICE' : 'HARDLOCK_REJECT'
    case 'STEMI':
      return adjudicateTransfer(hospital, call.patient).accepted ? 'CHOICE' : 'HARDLOCK_REJECT'
  }
}

export function initReceiving(hospital: Hospital, queue: IncomingCall[] = createCallQueue()): ReceivingState {
  return {
    hospital,
    queue,
    index: 0,
    netProfitDeltaBillions: 0,
    lawsuitExposure: 0,
    log: [],
    done: queue.length === 0,
  }
}

/** 현재 콜에 수용/거절을 정한다. 하드락 콜은 accept=true여도 수용되지 않는다(가드). */
export function decide(state: ReceivingState, accept: boolean): ReceivingState {
  if (state.done) {
    throw new Error('receiving already done')
  }
  const call = state.queue[state.index]
  const disposition = classifyCall(state.hospital, call)
  const effectiveAccept = disposition === 'CHOICE' && accept

  const netProfitDeltaBillions = effectiveAccept
    ? state.netProfitDeltaBillions + PROFIT_DELTA[call.kind]
    : state.netProfitDeltaBillions
  const lawsuitExposure = effectiveAccept && call.lawsuitRisk ? state.lawsuitExposure + 1 : state.lawsuitExposure

  const log = [...state.log, { callId: call.id, accepted: effectiveAccept, disposition }]
  const index = state.index + 1
  return {
    ...state,
    netProfitDeltaBillions,
    lawsuitExposure,
    log,
    index,
    done: index >= state.queue.length,
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/game/receiving.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 6: 커밋**

```bash
# feat(sim): 콜 큐 receiving — classifyCall(하드락/선택) + decide(장부·소송 누적) (결정론·TDD)
git add src/game/types.ts src/game/receiving.ts src/game/receiving.test.ts
git commit -F .commit-msg-tmp
```

---

### Task 4: session.ts — 5-페이즈 상태기계 + buildEpilogue

**Files:**
- Create: `src/game/session.ts`
- Test: `src/game/session.test.ts`

**Interfaces:**
- Consumes: `buildHospital`(setup), `initReceiving`/`ReceivingState`(receiving), `startGame`/`GameState`(round), `createStemiScenario`(scenarios), `buildDebrief`/`Debrief`(debrief), `buildSessionLedger`/`Ledger`(ledger), `SetupChoices`/`Hospital`(types).
- Produces:
  - `type SessionPhase = 'SETUP' | 'RECEIVING' | 'INTERSTITIAL' | 'EMERGENCY' | 'EPILOGUE'`
  - `type EmergencyState = { mode: 'IN_HOUSE' } | { mode: 'TRANSFER'; game: GameState }`
  - `interface SessionState { phase: SessionPhase; hospital?: Hospital; receiving?: ReceivingState; emergency?: EmergencyState }`
  - `const STEMI_SPECIALTY = 'CARDIOLOGY'` (const 어서션)
  - `startSession(): SessionState`
  - `completeSetup(choices: SetupChoices): SessionState`
  - `completeReceiving(state: SessionState): SessionState`
  - `beginEmergency(state: SessionState): SessionState`
  - `toEpilogue(state: SessionState): SessionState`
  - `interface SessionEpilogue { survived: boolean; ledger: Ledger | null; debrief: Debrief | null }`
  - `buildEpilogue(state: SessionState): SessionEpilogue`

- [ ] **Step 1: 실패하는 테스트 작성 (session.test.ts)**

`src/game/session.test.ts` 신규:

```ts
import { describe, it, expect } from 'vitest'
import {
  startSession, completeSetup, completeReceiving, beginEmergency, toEpilogue, buildEpilogue,
} from './session'
import { decide } from './receiving'
import { attemptTransfer } from './round'
import type { SetupChoices } from './types'

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

/** RECEIVING을 끝까지 흘린다. accept=false면 전부 거절, true면 전부 수용 시도(하드락은 자동 거절). */
function runReceiving(choices: SetupChoices, accept = false) {
  let s = completeSetup(choices)
  while (!s.receiving!.done) {
    s = { ...s, receiving: decide(s.receiving!, accept) }
  }
  return s
}

describe('세션 페이즈 전이', () => {
  it('startSession → SETUP', () => {
    expect(startSession().phase).toBe('SETUP')
  })

  it('completeSetup → RECEIVING(플레이어 병원·콜 큐 준비)', () => {
    const s = completeSetup(collaborator)
    expect(s.phase).toBe('RECEIVING')
    expect(s.hospital!.name).toBe('흑자메디컬')
    expect(s.receiving!.queue.length).toBe(5)
  })

  it('receiving 미완이면 completeReceiving 에러', () => {
    const s = completeSetup(collaborator)
    expect(() => completeReceiving(s)).toThrow()
  })

  it('receiving 완료 → completeReceiving → INTERSTITIAL', () => {
    const s = completeReceiving(runReceiving(collaborator))
    expect(s.phase).toBe('INTERSTITIAL')
  })
})

describe('beginEmergency 분기 — backupCare가 가른다', () => {
  it('공범(순환기 없음) → TRANSFER(기존 STEMI 뺑뺑이)', () => {
    const s = beginEmergency(completeReceiving(runReceiving(collaborator)))
    expect(s.phase).toBe('EMERGENCY')
    expect(s.emergency!.mode).toBe('TRANSFER')
    if (s.emergency!.mode === 'TRANSFER') {
      expect(s.emergency.game.status).toBe('IN_PROGRESS')
      expect(s.emergency.game.hospitals.length).toBeGreaterThan(1) // 외부 풀
    }
  })

  it('양심(순환기 있음) → IN_HOUSE(직접 PCI)', () => {
    const s = beginEmergency(completeReceiving(runReceiving(conscientious)))
    expect(s.phase).toBe('EMERGENCY')
    expect(s.emergency!.mode).toBe('IN_HOUSE')
  })
})

describe('toEpilogue 가드 + buildEpilogue', () => {
  it('TRANSFER가 진행중이면 toEpilogue 에러', () => {
    const s = beginEmergency(completeReceiving(runReceiving(collaborator)))
    expect(() => toEpilogue(s)).toThrow()
  })

  it('양심 경로: IN_HOUSE → 즉시 EPILOGUE, 생존·적자·소송비용·순환기 채용 N', () => {
    // 양심 빌드는 순환기 미용 함께라 기저는 흑자일 수 있다 — 적자·소송은 1막에서 필수 케이스를
    // '수용'할 때 성립한다(비용은 짓기가 아니라 진료함에서 온다). 그래서 accept=true로 흘린다.
    let s = beginEmergency(completeReceiving(runReceiving(conscientious, true)))
    s = toEpilogue(s)
    const epi = buildEpilogue(s)
    expect(epi.survived).toBe(true)
    expect(epi.debrief).toBeNull() // 전원 미니게임 없음
    expect(epi.ledger!.essentialHires).toBe(2)
    expect(epi.ledger!.segments.some((seg) => seg.label === '소송 비용')).toBe(true)
    expect(epi.ledger!.netProfitBillions).toBeLessThan(0) // 적자 + 소송 비용
  })

  it('공범 경로: TRANSFER 끝(권역심혈관센터 h6 수용) → 생존, 장부는 흑자·채용 0·소송비용 없음', () => {
    let s = beginEmergency(completeReceiving(runReceiving(collaborator)))
    // 외부 풀의 출구 h6(권역심혈관센터)에 전원 성공
    const game = attemptTransfer(s.emergency!.mode === 'TRANSFER' ? s.emergency.game : (() => { throw new Error() })(), 'h6', 12)
    s = { ...s, emergency: { mode: 'TRANSFER', game } }
    s = toEpilogue(s)
    const epi = buildEpilogue(s)
    expect(epi.survived).toBe(true)
    expect(epi.debrief).not.toBeNull()
    expect(epi.ledger!.essentialHires).toBe(0)
    expect(epi.ledger!.netProfitBillions).toBeGreaterThan(0) // 흑자
    expect(epi.ledger!.segments.some((seg) => seg.label === '소송 비용')).toBe(false)
  })
})

describe('통합 불변식', () => {
  it('공범 병원은 STEMI를 받는 쪽에서도 하드락(1막), 2막에선 전원으로 던져짐', () => {
    const s = completeSetup(collaborator)
    // 1막: 첫 STEMI 콜(c2)까지 진행해 하드락 확인
    let r = s.receiving!
    r = decide(r, false) // c1 워크인
    const afterStemi = decide(r, true) // c2 STEMI accept 시도
    expect(afterStemi.log[1].disposition).toBe('HARDLOCK_REJECT')
    // 2막: 전원 분기
    expect(beginEmergency(completeReceiving(runReceiving(collaborator))).emergency!.mode).toBe('TRANSFER')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/game/session.test.ts`
Expected: FAIL — `Failed to resolve import "./session"`.

- [ ] **Step 3: 구현 (session.ts)**

`src/game/session.ts` 신규:

```ts
import type { Hospital, SetupChoices, Specialty } from './types'
import { buildHospital } from './setup'
import { initReceiving, type ReceivingState } from './receiving'
import { startGame, type GameState } from './round'
import { createStemiScenario } from './scenarios'
import { buildDebrief, type Debrief } from './debrief'
import { buildSessionLedger, type Ledger } from './ledger'

// 2막 단막극 세션 상태기계 — 순수·결정론. SETUP → RECEIVING → INTERSTITIAL → EMERGENCY → EPILOGUE.
// beginEmergency가 hospital.backupCare로 in-house 생존 vs 기존 전원 뺑뺑이를 가른다(철학 ii).

/** STEMI 슬라이스가 요구하는 배후과(이번 주 유일 축, spec ⓐ). */
const STEMI_SPECIALTY: Specialty = 'CARDIOLOGY'

export type SessionPhase = 'SETUP' | 'RECEIVING' | 'INTERSTITIAL' | 'EMERGENCY' | 'EPILOGUE'

export type EmergencyState =
  | { mode: 'IN_HOUSE' } // 순환기 배후 있음 → 내 응급실이 직접 PCI → 생존
  | { mode: 'TRANSFER'; game: GameState } // 순환기 없음 → 기존 STEMI 뺑뺑이

export interface SessionState {
  phase: SessionPhase
  hospital?: Hospital
  receiving?: ReceivingState
  emergency?: EmergencyState
}

export function startSession(): SessionState {
  return { phase: 'SETUP' }
}

export function completeSetup(choices: SetupChoices): SessionState {
  const { hospital } = buildHospital(choices)
  return { phase: 'RECEIVING', hospital, receiving: initReceiving(hospital) }
}

export function completeReceiving(state: SessionState): SessionState {
  if (state.phase !== 'RECEIVING') {
    throw new Error(`completeReceiving requires RECEIVING, got ${state.phase}`)
  }
  if (!state.receiving?.done) {
    throw new Error('receiving not done')
  }
  return { ...state, phase: 'INTERSTITIAL' }
}

export function beginEmergency(state: SessionState): SessionState {
  if (state.phase !== 'INTERSTITIAL') {
    throw new Error(`beginEmergency requires INTERSTITIAL, got ${state.phase}`)
  }
  const hospital = state.hospital!
  if (hospital.backupCare.includes(STEMI_SPECIALTY)) {
    return { ...state, phase: 'EMERGENCY', emergency: { mode: 'IN_HOUSE' } }
  }
  const scenario = createStemiScenario()
  const game = startGame(scenario.patient, scenario.hospitals, scenario.goldenSeconds)
  return { ...state, phase: 'EMERGENCY', emergency: { mode: 'TRANSFER', game } }
}

export function toEpilogue(state: SessionState): SessionState {
  if (state.phase !== 'EMERGENCY') {
    throw new Error(`toEpilogue requires EMERGENCY, got ${state.phase}`)
  }
  const em = state.emergency!
  if (em.mode === 'TRANSFER' && em.game.status === 'IN_PROGRESS') {
    throw new Error('emergency transfer not finished')
  }
  return { ...state, phase: 'EPILOGUE' }
}

export interface SessionEpilogue {
  survived: boolean
  ledger: Ledger | null
  debrief: Debrief | null // 전원 뺑뺑이한 경우만(IN_HOUSE는 null)
}

export function buildEpilogue(state: SessionState): SessionEpilogue {
  if (state.phase !== 'EPILOGUE') {
    throw new Error(`buildEpilogue requires EPILOGUE, got ${state.phase}`)
  }
  const hospital = state.hospital!
  const receiving = state.receiving!
  const em = state.emergency!
  const ledger = buildSessionLedger(hospital, STEMI_SPECIALTY, {
    netProfitDeltaBillions: receiving.netProfitDeltaBillions,
    lawsuitExposure: receiving.lawsuitExposure,
  })
  if (em.mode === 'IN_HOUSE') {
    return { survived: true, ledger, debrief: null }
  }
  return { survived: em.game.status === 'ACCEPTED', ledger, debrief: buildDebrief(em.game) }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/game/session.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: 전체 스위트 회귀 확인**

Run: `npm test`
Expected: PASS — 기존 전부 + 신규(setup 7 + ledger +4 + receiving 12 + session 10) green. 기존 불변식 무손상.

- [ ] **Step 6: 커밋**

```bash
# feat(sim): 세션 상태기계 session — 5페이즈 + beginEmergency 분기(in-house/전원) + buildEpilogue (결정론·TDD)
git add src/game/session.ts src/game/session.test.ts
git commit -F .commit-msg-tmp
```

---

### Task 5: dialogue.ts — 1막 받는 쪽 다크코미디 폴백 대사

**Files:**
- Modify: `src/game/dialogue.ts` (추가만, 기존 발신 쪽 함수 보존)
- Test: `src/game/dialogue.test.ts` (추가만)

**Interfaces:**
- Consumes: `CallKind`, `IncomingCall`(types), `CallDisposition`(receiving).
- Produces:
  - `const CALLER_PLEA: Record<CallKind, string[]>` — 걸려오는 쪽의 호소
  - `const RECEIVE_ACCEPT: Record<CallKind, string>` — 수용 시 명랑 확인
  - `const RECEIVE_REJECT: Record<CallKind, string>` — 선택 거절 시
  - `const RECEIVE_HARDLOCK: string` — STEMI인데 내 병원도 순환기 없음(벽을 안쪽에서)
  - `receivingLine(call: IncomingCall, disposition: CallDisposition, accepted: boolean, seed?: number): string`

- [ ] **Step 1: 실패하는 테스트 작성 (dialogue.test.ts에 추가)**

`src/game/dialogue.test.ts` import 줄에 추가하고, 파일 끝에 새 describe를 추가한다(기존 테스트는 그대로).

import에 추가:
```ts
import { receivingLine, CALLER_PLEA, RECEIVE_HARDLOCK } from './dialogue'
import { classifyCall, createCallQueue } from './receiving'
import { buildHospital } from './setup'
```

파일 끝에 추가:
```ts
describe('receivingLine — 1막 받는 쪽 다크코미디 폴백', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const collaborator = buildHospital({ hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3 } }).hospital
  const conscientious = buildHospital({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 2 } }).hospital

  it('모든 콜 종류에 호소 대사가 있다', () => {
    expect(CALLER_PLEA.STEMI.length).toBeGreaterThan(0)
    expect(CALLER_PLEA.COSMETIC_WALKIN.length).toBeGreaterThan(0)
    expect(CALLER_PLEA.GENERAL_EMERGENCY.length).toBeGreaterThan(0)
  })

  it('워크인 수용 → 명랑한 확인 대사(🎉 포함)', () => {
    const line = receivingLine(walkin, classifyCall(collaborator, walkin), true)
    expect(line.length).toBeGreaterThan(0)
    expect(line).toContain('🎉')
  })

  it('STEMI 하드락(내 병원도 순환기 없음) → 벽을 안쪽에서 배우는 대사', () => {
    const disposition = classifyCall(collaborator, stemi) // HARDLOCK_REJECT
    const line = receivingLine(stemi, disposition, false)
    expect(line).toBe(RECEIVE_HARDLOCK)
  })

  it('양심 병원의 STEMI 수용 → 명랑/확인 대사(비어있지 않음)', () => {
    const disposition = classifyCall(conscientious, stemi) // CHOICE
    const line = receivingLine(stemi, disposition, true)
    expect(line.length).toBeGreaterThan(0)
  })

  it('결정론 — 같은 인자·seed는 같은 대사', () => {
    expect(receivingLine(walkin, 'CHOICE', true, 1)).toBe(receivingLine(walkin, 'CHOICE', true, 1))
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/game/dialogue.test.ts`
Expected: FAIL — `receivingLine`/`CALLER_PLEA`/`RECEIVE_HARDLOCK` export 없음.

- [ ] **Step 3: 구현 (dialogue.ts에 추가)**

`src/game/dialogue.ts` 맨 위 import에 타입 추가:
```ts
import type { CallKind, IncomingCall } from './types'
import type { CallDisposition } from './receiving'
```
파일 끝에 추가(기존 `fallbackLine`/`persuasionReply`는 그대로):

```ts
// ── 1막 받는 쪽(내 병원) 다크코미디 폴백 ──
// 톤: 명랑한 시스템 대사와 인간의 대가 사이의 낙차. 과녁은 시스템의 태연함이지 환자가 아니다.
// (2막·결말은 냉정 — 여기 대사는 1막에서만.)

/** 걸려오는 쪽의 호소(발신자). */
export const CALLER_PLEA: Record<CallKind, string[]> = {
  STEMI: [
    '심근경색 환자입니다. 재관류 가능한 데가 없어요. 받아주실 수 있나요?',
    '벌써 네 번째 병원입니다. 순환기 되는 곳이… 거기 되나요?',
  ],
  GENERAL_EMERGENCY: [
    '복통 응급인데 병상이 없어서요. 자리 하나만 부탁드립니다.',
    '지금 받아줄 곳을 못 찾고 있어요. 입원 가능할까요?',
  ],
  COSMETIC_WALKIN: [
    '보톡스 상담 예약 가능할까요?',
    '검진 패키지 문의드려요. 오늘 접수되나요?',
  ],
}

/** 수용 시 시스템의 명랑한 확인. */
export const RECEIVE_ACCEPT: Record<CallKind, string> = {
  STEMI: '…받겠습니다. 준비하고 있겠습니다.',
  GENERAL_EMERGENCY: '네, 병상 하나 내드리죠. 보내세요.',
  COSMETIC_WALKIN: '물론이죠! 바로 접수해 드릴게요 🎉',
}

/** 선택 거절 시. */
export const RECEIVE_REJECT: Record<CallKind, string> = {
  STEMI: '죄송합니다. 지금은 저희도 받기가 어렵습니다.',
  GENERAL_EMERGENCY: '지금은 병상을 비워두겠습니다. 다른 곳을 알아보세요.',
  COSMETIC_WALKIN: '오늘은 예약이 다 찼습니다. 다음에 오세요.',
}

/** STEMI인데 내 병원도 순환기 배후가 없어 못 받는다 — 벽을 안쪽에서 배운다. */
export const RECEIVE_HARDLOCK =
  '자리는 있는데, 저희도 순환기 시술팀이 없습니다. 받아도 못 뚫어요.'

/** 콜 처리 결과 → 받는 쪽 폴백 대사. seed로 호소 대사를 변주(결정론). */
export function receivingLine(
  call: IncomingCall,
  disposition: CallDisposition,
  accepted: boolean,
  seed = 0,
): string {
  if (disposition === 'HARDLOCK_REJECT') {
    // STEMI 하드락은 배후 부재의 벽, 그 외 하드락은 일반 거절.
    return call.kind === 'STEMI' ? RECEIVE_HARDLOCK : RECEIVE_REJECT[call.kind]
  }
  return accepted ? RECEIVE_ACCEPT[call.kind] : RECEIVE_REJECT[call.kind]
}
```

> `seed`는 이번 주엔 호소 대사 변주용 예약 파라미터다(UI가 `CALLER_PLEA[kind][seed % n]`으로 호소를 고를 때 쓴다). `receivingLine` 자체는 결정론이므로 같은 인자는 같은 반환.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/game/dialogue.test.ts`
Expected: PASS (기존 + 신규).

- [ ] **Step 5: 전체 스위트 최종 확인**

Run: `npm test`
Expected: PASS 전부.

- [ ] **Step 6: 커밋**

```bash
# feat(sim): 1막 받는 쪽 다크코미디 폴백 대사 dialogue — 호소/명랑수용/하드락 (결정론·TDD)
git add src/game/dialogue.ts src/game/dialogue.test.ts
git commit -F .commit-msg-tmp
```

---

## Self-Review

**1. Spec coverage** (spec §8.1 신규 순수 모듈 + §9 테스트 전략 대비):
- `setup.ts`(과 카탈로그·buildHospital·예산) → Task 1 ✅
- `receiving.ts`(IncomingCall·classifyCall·decide, 하드락 가드) → Task 3 ✅
- `session.ts`(SessionPhase·전이·beginEmergency 분기) → Task 4 ✅
- 결말 재배선(플레이어 병원 장부) → Task 2(buildSessionLedger) + Task 4(buildEpilogue) ✅
- 1막 폴백 대사 → Task 5 ✅
- spec §9 테스트: setup 흑자/적자·essentialHires 파생(T1), receiving 하드락 가드·미용 항상 수용(T3), session 페이즈 전이·분기·종료 가드(T4), 통합 불변식(공범→전원 IN_PROGRESS / 양심→in-house, 순환기 없으면 STEMI 하드락 양쪽)(T4), 기존 불변식 보존(T2 기존 8 green + T4 Step5 `npm test`) ✅
- **범위 밖(의도적, Part 2)**: UI(SetupWizard·ReceivingPhase·SessionClient·에필로그 배선), 법적 리스크 UI 표기. 로직은 여기서 완결 → Part 2가 소비.

**2. Placeholder scan**: TBD/TODO/"적절히 처리" 없음. 모든 코드 스텝에 실제 코드 있음(초안에 있던 Task 5의 임시 헬퍼 참조는 non-empty+🎉 단언으로 인라인 교체 완료).

**3. Type consistency 점검**:
- `ReceivingState` 필드명(`netProfitDeltaBillions`·`lawsuitExposure`)이 Task 3 정의 → Task 2 `buildSessionLedger` 인자 → Task 4 `buildEpilogue` 호출에서 동일 ✅
- `EmergencyState` 판별 유니온(`mode: 'IN_HOUSE' | 'TRANSFER'`)이 Task 4 정의·테스트·`buildEpilogue`에서 일관 ✅
- `DeptKey`/`SetupChoices`가 Task 1(types.ts)에서 정의 → setup·receiving·session 테스트에서 동일 import ✅
- `buildLedger(state)` 시그니처·동작 불변(Task 2) → 기존 8 테스트·`GameClient` 무손상 ✅
- `STEMI_SPECIALTY='CARDIOLOGY'`가 setup의 `essentialHires` 파생·ledger의 `patientSpecialty`·session 분기에서 일관 ✅

이슈 없음.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-16-management-expansion-core.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 태스크마다 신선한 서브에이전트, 태스크 사이 리뷰, 빠른 반복.

**2. Inline Execution** — 이 세션에서 executing-plans로 배치 실행 + 체크포인트 리뷰.

**이후 Part 2(UI 통합) 계획**은 이 로직 코어가 green이 된 뒤 별도로 작성한다(SetupWizard·ReceivingPhase·SessionClient·에필로그 배선 + 브라우저 검증).
