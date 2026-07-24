---
tags:
  - type/plan
---

# 채용 데스크(SETUP 게임화) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SETUP 위저드의 과별 +/- 카운터를 "지원서 더미 + 채용 도장"으로 바꾼다 — 지원자별 초상(픽셀)·연차·한 줄 경력·요구 계약금을 보고 뽑고, 베테랑은 환자를 빨리 본다.

**Architecture:** 결정론 지원자 풀(`candidates.ts`, 과별 4명)을 신설하고, `SetupChoices`에 `hiredIds`를 **추가**(기존 `doctors` 카운트는 파생으로 유지 — 성장·경제·티어 소비처 전부 무수정). 판정 침습은 점유 계산 헬퍼(`occupiedUntilMin`) 한 곳. 스펙: [2026-07-24-hiring-desk-setup-design.md](../specs/2026-07-24-hiring-desk-setup-design.md)

**Tech Stack:** Next.js(App Router)·TypeScript·Tailwind·vitest. 새 의존성 0.

## Global Constraints

- **RNG 0**: `Math.random`·`Date.now` 금지 — 지원자 풀은 고정 데이터, 초상 변주는 id 해시.
- **주간 고정비(`fixedCostPerDoctorManwon`)는 건드리지 않는다** — 7의 배수 불변식·장부 등식이 걸려 있다. 이 계획이 바꾸는 돈은 **일회성 계약금뿐**.
- **해석 카피 금지(show-don't-tell)**: 이력서는 기계적 사실만 — 성격·사연·감정·평가 어휘("실력파" 등) 금지. 실존 인물·기관 연상 이름 금지.
- **candidates.ts는 setup.ts를 임포트하지 않는다**(순환 차단: setup → doctor → candidates). 계약금은 하드코딩 결과값이고 앵커×배율 관계는 테스트가 강제한다.
- **커밋**: 한글 메시지는 `.commit-msg-tmp` 파일 경유(`git commit -F`, T-026). `Skills-used:`~`Co-Authored-By:` 트레일러를 빈 줄 없이 연속으로(프로젝트 CLAUDE.md 「AI 활용 추적」).
- **게이트**: 각 태스크 끝에 `npx vitest run` green + 최종 태스크에서 `npx tsc --noEmit`(vitest는 타입 회귀를 못 잡는다) + `npm run lint` + `npm run build`.
- 새 md 문서는 폴더별 `type/*` frontmatter 태그 필수(pre-commit 검사기가 거부한다). 이 계획 문서는 `type/plan`.

---

### Task 1: 지원자 풀 — `candidates.ts` 데이터 + 순수 함수

**Files:**
- Create: `src/game/candidates.ts`
- Test: `src/game/candidates.test.ts`

**Interfaces:**
- Consumes: `DeptKey` (from `./types`)
- Produces: `CareerTier`, `Candidate{id,name,dept,tier,careerYears,resumeLine,hireCostManwon}`, `HIRE_COST_MULT`, `SPEED_OF_TIER: Record<CareerTier, number>`, `CANDIDATES: Candidate[]`, `candidateById(id)`, `hiringCostOfCandidates(hiredIds: string[]): number`, `doctorsCountsOf(hiredIds: string[]): Partial<Record<DeptKey, number>>`, `toggleHired(hired: string[], id: string, cap: number): string[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/game/candidates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  CANDIDATES, HIRE_COST_MULT, SPEED_OF_TIER,
  candidateById, hiringCostOfCandidates, doctorsCountsOf, toggleHired,
} from './candidates'
import { DEPARTMENTS, SETUP_BUDGET_MANWON } from './setup'

describe('CANDIDATES 풀 정합성', () => {
  it('id 전역 유일 · 과별 정확히 4명(신입1·중견2·베테랑1)', () => {
    expect(new Set(CANDIDATES.map((c) => c.id)).size).toBe(CANDIDATES.length)
    for (const d of DEPARTMENTS) {
      const pool = CANDIDATES.filter((c) => c.dept === d.key)
      expect(pool).toHaveLength(4)
      expect(pool.filter((c) => c.tier === 'ROOKIE')).toHaveLength(1)
      expect(pool.filter((c) => c.tier === 'STANDARD')).toHaveLength(2)
      expect(pool.filter((c) => c.tier === 'VETERAN')).toHaveLength(1)
    }
  })

  it('계약금 = 과 앵커 × 티어 배율(반올림) — 하드코딩 값과 DEPARTMENTS의 관계를 강제(이중 기재 방어)', () => {
    for (const c of CANDIDATES) {
      const anchor = DEPARTMENTS.find((d) => d.key === c.dept)!.hireCostManwon
      expect(c.hireCostManwon).toBe(Math.round(anchor * HIRE_COST_MULT[c.tier]))
    }
  })

  it('연차 밴드: 신입 0~2 · 중견 5~9 · 베테랑 12~20, resumeLine 비어있지 않음', () => {
    const band = { ROOKIE: [0, 2], STANDARD: [5, 9], VETERAN: [12, 20] } as const
    for (const c of CANDIDATES) {
      expect(c.careerYears).toBeGreaterThanOrEqual(band[c.tier][0])
      expect(c.careerYears).toBeLessThanOrEqual(band[c.tier][1])
      expect(c.resumeLine.length).toBeGreaterThan(0)
    }
  })

  it('속도: 베테랑 < 중견 < 신입 (진료 소요 배율)', () => {
    expect(SPEED_OF_TIER.VETERAN).toBeLessThan(SPEED_OF_TIER.STANDARD)
    expect(SPEED_OF_TIER.STANDARD).toBeLessThan(SPEED_OF_TIER.ROOKIE)
  })

  it('[밸런스] 필수 6과 베테랑 전원 채용은 예산 초과 — 올 베테랑은 불가능', () => {
    const cost = CANDIDATES
      .filter((c) => c.tier === 'VETERAN' && DEPARTMENTS.find((d) => d.key === c.dept)!.essential)
      .reduce((s, c) => s + c.hireCostManwon, 0)
    expect(cost).toBeGreaterThan(SETUP_BUDGET_MANWON)
  })
})

describe('파생 함수', () => {
  const vetCardio = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'VETERAN')!
  const rookieAesth = CANDIDATES.find((c) => c.dept === 'AESTHETICS' && c.tier === 'ROOKIE')!

  it('hiringCostOfCandidates — 합산, 모르는 id는 0', () => {
    expect(hiringCostOfCandidates([vetCardio.id, rookieAesth.id]))
      .toBe(vetCardio.hireCostManwon + rookieAesth.hireCostManwon)
    expect(hiringCostOfCandidates(['ghost'])).toBe(0)
  })

  it('doctorsCountsOf — 과별 카운트 파생', () => {
    const cardioStd = CANDIDATES.filter((c) => c.dept === 'CARDIOLOGY' && c.tier === 'STANDARD')
    expect(doctorsCountsOf([vetCardio.id, cardioStd[0].id, rookieAesth.id]))
      .toEqual({ CARDIOLOGY: 2, AESTHETICS: 1 })
  })

  it('toggleHired — 채용↔반려 토글, 과별 cap 도달 시 신규 무시, 모르는 id 무시', () => {
    const pool = CANDIDATES.filter((c) => c.dept === 'CARDIOLOGY')
    let hired: string[] = []
    hired = toggleHired(hired, pool[0].id, 3)
    expect(hired).toEqual([pool[0].id])
    hired = toggleHired(hired, pool[0].id, 3) // 반려
    expect(hired).toEqual([])
    hired = [pool[0].id, pool[1].id, pool[2].id]
    expect(toggleHired(hired, pool[3].id, 3)).toEqual(hired) // cap 3 도달 — 불변
    expect(toggleHired(hired, 'ghost', 3)).toEqual(hired)
  })

  it('candidateById — 존재/부재', () => {
    expect(candidateById(vetCardio.id)).toBe(vetCardio)
    expect(candidateById('ghost')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/candidates.test.ts`
Expected: FAIL — `Cannot find module './candidates'`

- [ ] **Step 3: 구현**

`src/game/candidates.ts`:

```ts
import type { DeptKey } from './types'

// SETUP 채용 데스크의 지원자 풀 — 고정 결정론 데이터(RNG 0: 같은 게임은 항상 같은 지원자).
// 설계: docs/superpowers/specs/2026-07-24-hiring-desk-setup-design.md §2.
//
// ⚠️ setup.ts를 임포트하지 않는다 — setup → doctor → candidates 순환이 생긴다.
//    그래서 계약금은 「과 앵커 × 티어 배율」의 **하드코딩 결과값**이고, 앵커(DEPARTMENTS.hireCostManwon)와의
//    관계는 candidates.test.ts가 강제한다(앵커를 바꾸면 여기 안 고쳐도 테스트가 운다).
//
// resumeLine 금지선(스펙 §2): 기계적 사실만 — 성격·사연·감정·평가 어휘·대사 금지.
// 이름은 실존 인물·기관을 연상시키지 않는 가공 한글 이름.

export type CareerTier = 'ROOKIE' | 'STANDARD' | 'VETERAN'

/** 티어 → 계약금 배율. */
export const HIRE_COST_MULT: Record<CareerTier, number> = { ROOKIE: 0.7, STANDARD: 1.0, VETERAN: 1.3 }

/**
 * 티어 → 진료 소요 배율(작을수록 빠름). 베테랑이 비싼 값을 하는 유일한 축 — 돈이 아니라 시간.
 * 소비처: doctor.ts materializeRoster(→ Doctor.speedFactor) · daysim.ts occupiedUntilMin.
 */
export const SPEED_OF_TIER: Record<CareerTier, number> = { ROOKIE: 1.15, STANDARD: 1.0, VETERAN: 0.8 }

export interface Candidate {
  id: string // 'cand-<DEPT>-<n>' — 고유·안정(명단 파생·초상 변주 키)
  name: string
  dept: DeptKey
  tier: CareerTier
  careerYears: number // 표시용 연차 — 밴드: 신입 0~2 / 중견 5~9 / 베테랑 12~20
  resumeLine: string // 한 줄 경력 — 기계적 사실만
  hireCostManwon: number // 요구 계약금(만원) = 과 앵커 × 티어 배율(테스트 강제)
}

function dept4(dept: DeptKey, anchor: number, rows: [CareerTier, string, number, string][]): Candidate[] {
  return rows.map(([tier, name, careerYears, resumeLine], i) => ({
    id: `cand-${dept}-${i + 1}`,
    name,
    dept,
    tier,
    careerYears,
    resumeLine,
    hireCostManwon: Math.round(anchor * HIRE_COST_MULT[tier]),
  }))
}

/** 과별 4명(신입1·중견2·베테랑1) × 8과 = 32명. 배열 순서 = 화면 표시 순서(싼 쪽부터). */
export const CANDIDATES: Candidate[] = [
  ...dept4('AESTHETICS', 5_000, [
    ['ROOKIE', '한새봄', 1, '피부과 전공의 수료 직후'],
    ['STANDARD', '문가람', 7, '피부과 의원 7년'],
    ['STANDARD', '배윤슬', 8, '미용 클리닉 레이저 시술 8년'],
    ['VETERAN', '노석현', 14, '미용의원 시술 14년'],
  ]),
  ...dept4('CHECKUP', 6_000, [
    ['ROOKIE', '진하람', 2, '가정의학과 전공의 수료 직후'],
    ['STANDARD', '홍다예', 6, '검진센터 판독 6년'],
    ['STANDARD', '마동혁', 9, '종합병원 건강증진센터 9년'],
    ['VETERAN', '국선영', 15, '검진센터 내시경 전담 15년'],
  ]),
  ...dept4('CARDIOLOGY', 15_000, [
    ['ROOKIE', '백시온', 1, '심장내과 전임의 1년'],
    ['STANDARD', '서명준', 8, '2차병원 심혈관센터 8년'],
    ['STANDARD', '유채린', 7, '대학병원 심초음파실 7년'],
    ['VETERAN', '심재구', 18, '대학병원 심도자실 18년'],
  ]),
  ...dept4('THORACIC_SURGERY', 16_000, [
    ['ROOKIE', '남도영', 2, '흉부외과 전공의 수료 직후'],
    ['STANDARD', '표진솔', 9, '대학병원 폐수술팀 9년'],
    ['STANDARD', '탁준희', 7, '2차병원 흉부외과 7년'],
    ['VETERAN', '방혜정', 20, '대동맥 수술팀 20년'],
  ]),
  ...dept4('OBSTETRICS', 14_000, [
    ['ROOKIE', '원지수', 1, '산부인과 전임의 1년'],
    ['STANDARD', '석보라', 6, '분만병원 6년'],
    ['STANDARD', '길현서', 8, '대학병원 고위험 산모실 8년'],
    ['VETERAN', '추미람', 16, '분만실 당직 16년'],
  ]),
  ...dept4('NEUROSURGERY', 15_000, [
    ['ROOKIE', '함온유', 2, '신경외과 전공의 수료 직후'],
    ['STANDARD', '도현빈', 7, '뇌혈관센터 7년'],
    ['STANDARD', '반예솔', 9, '척추수술팀 9년'],
    ['VETERAN', '위정환', 17, '개두술 집도 17년'],
  ]),
  ...dept4('GENERAL_SURGERY', 11_000, [
    ['ROOKIE', '편도윤', 1, '외과 전공의 수료 직후'],
    ['STANDARD', '양주안', 8, '복강경 수술팀 8년'],
    ['STANDARD', '소민재', 6, '2차병원 외과 6년'],
    ['VETERAN', '좌현탁', 13, '외상외과 13년'],
  ]),
  ...dept4('INTERNAL_MEDICINE', 10_000, [
    ['ROOKIE', '육세인', 2, '내과 전공의 수료 직후'],
    ['STANDARD', '태윤겸', 7, '감염내과 7년'],
    ['STANDARD', '피재원', 9, '중환자실 파견 9년'],
    ['VETERAN', '하동률', 19, '내과 병동 당직 19년'],
  ]),
]

export function candidateById(id: string): Candidate | undefined {
  return CANDIDATES.find((c) => c.id === id)
}

/** 채용 목록의 총 계약금(만원). 모르는 id는 0으로 친다(방어 — adjustDoctors의 클램프와 같은 결). */
export function hiringCostOfCandidates(hiredIds: string[]): number {
  return hiredIds.reduce((sum, id) => sum + (candidateById(id)?.hireCostManwon ?? 0), 0)
}

/**
 * hiredIds → 과별 인원 파생. SetupChoices.doctors의 **단일 기록 지점**(위저드 onComplete)에서만 쓴다 —
 * doctors와 hiredIds를 각자 조작하는 경로를 만들지 않는다(drift 구조적 차단, 스펙 §3).
 */
export function doctorsCountsOf(hiredIds: string[]): Partial<Record<DeptKey, number>> {
  const counts: Partial<Record<DeptKey, number>> = {}
  for (const id of hiredIds) {
    const c = candidateById(id)
    if (!c) continue
    counts[c.dept] = (counts[c.dept] ?? 0) + 1
  }
  return counts
}

/** 도장 토글 — 이미 채용이면 반려(제거), 아니면 채용(추가). 그 과 cap 도달·모르는 id면 불변 반환. */
export function toggleHired(hired: string[], id: string, cap: number): string[] {
  if (hired.includes(id)) return hired.filter((h) => h !== id)
  const cand = candidateById(id)
  if (!cand) return hired
  const deptCount = hired.filter((h) => candidateById(h)?.dept === cand.dept).length
  if (deptCount >= cap) return hired
  return [...hired, id]
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/candidates.test.ts`
Expected: PASS (전 테스트 green)

- [ ] **Step 5: 커밋**

`.commit-msg-tmp`에 작성 후 `git add src/game/candidates.ts src/game/candidates.test.ts && git commit -F .commit-msg-tmp`:

```
feat: 지원자 풀 — 과별 4명 결정론 데이터 + 파생 함수 (채용 데스크 1/7)
```

---

### Task 2: 타입 확장 + `materializeRoster` 지원자 반영

**Files:**
- Modify: `src/game/types.ts:131-134` (SetupChoices) · `src/game/types.ts:174-178` (Doctor)
- Modify: `src/game/doctor.ts:23-34` (materializeRoster)
- Test: `src/game/doctor.test.ts` (추가)

**Interfaces:**
- Consumes: `CANDIDATES`, `SPEED_OF_TIER`, `Candidate` (Task 1)
- Produces: `SetupChoices.hiredIds?: string[]` · `Doctor.speedFactor?: number` · `Doctor.candidateId?: string` · `materializeRoster(choices, departments)` — hiredIds 지원자를 그 과 앞 슬롯에 배치, 초과분은 기존 무명 생성

- [ ] **Step 1: 실패하는 테스트 작성** — `src/game/doctor.test.ts`에 추가:

```ts
import { CANDIDATES, SPEED_OF_TIER } from './candidates'

describe('materializeRoster — hiredIds 지원자 반영', () => {
  const cardio = CANDIDATES.filter((c) => c.dept === 'CARDIOLOGY')
  const vet = cardio.find((c) => c.tier === 'VETERAN')!

  it('채용된 지원자의 이름·speedFactor·candidateId가 명단에 온다', () => {
    const roster = materializeRoster(
      { hospitalName: 'h', doctors: { CARDIOLOGY: 1 }, hiredIds: [vet.id] },
      DEPARTMENTS,
    )
    expect(roster).toHaveLength(1)
    expect(roster[0].name).toBe(vet.name)
    expect(roster[0].speedFactor).toBe(SPEED_OF_TIER.VETERAN)
    expect(roster[0].candidateId).toBe(vet.id)
    expect(roster[0].id).toBe('doc-CARDIOLOGY-1') // id 체계 불변 — busyUntil·피로 키 연속성
  })

  it('카운트가 지원자 수를 넘으면 초과분은 무명(이름 자동 생성·speedFactor 없음)', () => {
    const roster = materializeRoster(
      { hospitalName: 'h', doctors: { CARDIOLOGY: 2 }, hiredIds: [vet.id] },
      DEPARTMENTS,
    )
    expect(roster[0].candidateId).toBe(vet.id)
    expect(roster[1].candidateId).toBeUndefined()
    expect(roster[1].speedFactor).toBeUndefined()
    expect(roster[1].name).not.toBe(vet.name)
  })

  it('hiredIds가 없으면 기존과 동일(하위호환) · 같은 입력 = 같은 명단(결정론)', () => {
    const legacy = { hospitalName: 'h', doctors: { CARDIOLOGY: 2 } }
    expect(materializeRoster(legacy, DEPARTMENTS)).toEqual(materializeRoster(legacy, DEPARTMENTS))
    const withIds = { ...legacy, hiredIds: [vet.id] }
    expect(materializeRoster(withIds, DEPARTMENTS)).toEqual(materializeRoster(withIds, DEPARTMENTS))
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/doctor.test.ts`
Expected: FAIL — `hiredIds`/`speedFactor` 타입 에러 또는 undefined 불일치

- [ ] **Step 3: 구현**

`src/game/types.ts` — SetupChoices(131행)와 Doctor(174행) 교체:

```ts
/** 설정 위저드 산출물 — 곧 플레이어 병원이 된다. */
export interface SetupChoices {
  hospitalName: string
  doctors: Partial<Record<DeptKey, number>> // 과별 의사 수
  /**
   * SETUP 채용 데스크에서 뽑은 지원자 id 목록(candidates.ts). 선택 필드 — 없으면 전원 무명(구 경로·테스트).
   * ⚠️ doctors와 이중 기재 금지: doctors는 위저드 onComplete에서 doctorsCountsOf(hiredIds)로 **파생**해
   * 한 번만 쓴다(단일 기록 지점). 성장 단계 중도 채용은 doctors만 늘린다(무명·표준가).
   */
  hiredIds?: string[]
}
```

```ts
/**
 * 의사 개인 유닛. 채용 인원수를 이름 붙은 개인으로 태운다.
 * 배경·성격·결함은 없다(사용자 결정: 림월드를 그대로 빼다 박지 않음). 단 **speedFactor 하나만
 * 판정(점유 시간)에 닿는다** — 채용 데스크(스펙 2026-07-24)의 "베테랑은 빨리 본다" 축.
 */
export interface Doctor {
  id: string // 'doc-<dept>-<i>' — 결정론 고유
  name: string // 지원자 이름(hiredIds) 또는 결정론 자동 생성 한글 이름
  dept: DeptKey // 소속 과(수익과 + 필수과)
  speedFactor?: number // 진료 소요 배율(SPEED_OF_TIER 파생). 없으면 1.0 — 무명 채용·구 경로
  candidateId?: string // 출신 지원자(초상 변주 키). 없으면 무명 — 이력서 없이 온 사람
}
```

`src/game/doctor.ts` — materializeRoster 교체(+ import 추가):

```ts
import { CANDIDATES, SPEED_OF_TIER, type Candidate } from './candidates'

/**
 * 채용 선택 → 개인 유닛 명단. 결정론. `departments`를 인자로 받아 setup.ts를 임포트하지 않는다(순환 차단).
 * hiredIds의 지원자가 그 과 **앞 슬롯**부터 앉고(풀 순서 = 표시 순서), 초과분(성장 중도 채용)은
 * 기존 무명 생성(doctorName)으로 채운다. k는 슬롯마다 전진해 무명 이름도 결정론이다.
 */
export function materializeRoster(choices: SetupChoices, departments: DepartmentSpec[]): Doctor[] {
  const hiredSet = new Set(choices.hiredIds ?? [])
  const roster: Doctor[] = []
  let k = 0
  for (const dept of departments) {
    const n = choices.doctors[dept.key] ?? 0
    const hired: Candidate[] = CANDIDATES.filter((c) => c.dept === dept.key && hiredSet.has(c.id))
    for (let i = 1; i <= n; i++) {
      const cand = hired[i - 1]
      roster.push(
        cand
          ? { id: `doc-${dept.key}-${i}`, name: cand.name, dept: dept.key, speedFactor: SPEED_OF_TIER[cand.tier], candidateId: cand.id }
          : { id: `doc-${dept.key}-${i}`, name: doctorName(k), dept: dept.key },
      )
      k++
    }
  }
  return roster
}
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — 기존 테스트 전부 green(하위호환) + 신규 3건 green

- [ ] **Step 5: 커밋**

```
feat: SetupChoices.hiredIds·Doctor.speedFactor — 명단이 지원자를 태운다 (채용 데스크 2/7)
```

---

### Task 3: 예산 — 지원자 계약금 합산 연동

**Files:**
- Modify: `src/game/setup.ts:203-244` (hiringCost 아래 · withinBudget · isSetupReady)
- Test: `src/game/setup.test.ts` (추가)

**Interfaces:**
- Consumes: `hiringCostOfCandidates`, `doctorsCountsOf` (Task 1)
- Produces: `setupHiringCostManwon(choices, departments?): number` · `hiredMatchesCounts(choices): boolean` · `withinBudget`/`isSetupReady`가 hiredIds 경로를 지원

- [ ] **Step 1: 실패하는 테스트 작성** — `src/game/setup.test.ts`에 추가:

```ts
import { setupHiringCostManwon, hiredMatchesCounts } from './setup'
import { CANDIDATES, doctorsCountsOf } from './candidates'

describe('setupHiringCostManwon — 지원자 계약금 경로', () => {
  const vet = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'VETERAN')!
  const rookie = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'ROOKIE')!

  it('hiredIds가 있으면 계약금 합산 — 같은 1명이라도 누구냐에 따라 값이 다르다', () => {
    const base = { hospitalName: 'h', doctors: { CARDIOLOGY: 1 } }
    expect(setupHiringCostManwon({ ...base, hiredIds: [vet.id] })).toBe(vet.hireCostManwon)
    expect(setupHiringCostManwon({ ...base, hiredIds: [rookie.id] })).toBe(rookie.hireCostManwon)
    expect(vet.hireCostManwon).not.toBe(rookie.hireCostManwon)
  })

  it('hiredIds가 없으면 기존 앵커가 경로(성장·구 테스트 하위호환)', () => {
    const legacy = { hospitalName: 'h', doctors: { CARDIOLOGY: 2 } }
    expect(setupHiringCostManwon(legacy)).toBe(hiringCost(legacy))
  })

  it('hiredMatchesCounts — doctors가 hiredIds 파생과 어긋나면 false(isSetupReady가 거부)', () => {
    const ok = { hospitalName: 'h', doctors: doctorsCountsOf([vet.id]), hiredIds: [vet.id] }
    expect(hiredMatchesCounts(ok)).toBe(true)
    expect(isSetupReady(ok)).toBe(true)
    const drift = { hospitalName: 'h', doctors: { CARDIOLOGY: 2 }, hiredIds: [vet.id] }
    expect(hiredMatchesCounts(drift)).toBe(false)
    expect(isSetupReady(drift)).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/setup.test.ts`
Expected: FAIL — `setupHiringCostManwon` 미정의

- [ ] **Step 3: 구현** — `src/game/setup.ts`에 추가·수정(import에 `doctorsCountsOf, hiringCostOfCandidates` from `./candidates` 추가):

```ts
/** SETUP 채용비(만원) — 지원자 선택(hiredIds)이 있으면 계약금 합산, 없으면(성장·구 경로) 과 앵커가. */
export function setupHiringCostManwon(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): number {
  return choices.hiredIds ? hiringCostOfCandidates(choices.hiredIds) : hiringCost(choices, departments)
}

/**
 * hiredIds가 있으면 doctors 카운트는 그 파생과 일치해야 한다 — 단일 기록 지점 계약(types.ts 주석)의
 * 런타임 방어선. 위저드가 유일한 기록자라 정상 경로에선 항상 true다.
 */
export function hiredMatchesCounts(choices: SetupChoices): boolean {
  if (!choices.hiredIds) return true
  const derived = doctorsCountsOf(choices.hiredIds)
  const keys = new Set([...Object.keys(derived), ...Object.keys(choices.doctors)]) as Set<DeptKey>
  return [...keys].every((k) => (derived[k] ?? 0) === (choices.doctors[k] ?? 0))
}
```

`withinBudget`을 `setupHiringCostManwon` 사용으로 교체, `isSetupReady`에 `hiredMatchesCounts` 조건 추가:

```ts
/** 예산 한도 이내인가. */
export function withinBudget(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): boolean {
  return setupHiringCostManwon(choices, departments) <= SETUP_BUDGET_MANWON
}

/** 세션을 시작할 수 있는 선택인가 — 이름이 있고 예산·과별 상한 이내, hiredIds↔doctors 정합. */
export function isSetupReady(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): boolean {
  return (
    choices.hospitalName.trim().length > 0 &&
    withinBudget(choices, departments) &&
    withinDeptCaps(choices, departments) &&
    hiredMatchesCounts(choices)
  )
}
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS (기존 withinBudget·isSetupReady 테스트는 hiredIds 없는 경로라 전부 유지)

- [ ] **Step 5: 커밋**

```
feat: SETUP 예산을 지원자 계약금 합산으로 — 성장 경로는 앵커가 유지 (채용 데스크 3/7)
```

---

### Task 4: 판정 — 진료 속도(`occupiedUntilMin`)

**Files:**
- Modify: `src/game/daysim.ts` (헬퍼 추가) · `src/game/receiving.ts:629` (decide) · `src/game/receiving.ts:691` (applyBump)
- Test: `src/game/daysim.test.ts`·`src/game/receiving.test.ts` (추가)

**Interfaces:**
- Consumes: `Doctor.speedFactor` (Task 2)
- Produces: `occupiedUntilMin(doc: Doctor, startMin: number, durationMin: number): number` — 점유 종료 시각의 **유일한 계산처**(decide·applyBump 공유)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/game/daysim.test.ts`에 추가:

```ts
import { occupiedUntilMin } from './daysim'

describe('occupiedUntilMin — 의사 개인 속도', () => {
  const base = { id: 'doc-CARDIOLOGY-1', name: '김', dept: 'CARDIOLOGY' as const }
  it('speedFactor 없으면 현행과 동일(start + duration)', () => {
    expect(occupiedUntilMin(base, 100, 90)).toBe(190)
  })
  it('베테랑(0.8)은 짧게, 신입(1.15)은 길게 — 반올림', () => {
    expect(occupiedUntilMin({ ...base, speedFactor: 0.8 }, 100, 90)).toBe(100 + 72)
    expect(occupiedUntilMin({ ...base, speedFactor: 1.15 }, 100, 45)).toBe(100 + 52) // 51.75 → 52
  })
})
```

`src/game/receiving.test.ts`에 추가(파일 상단의 기존 헬퍼 `buildHospital` 임포트 활용):

```ts
import { CANDIDATES, SPEED_OF_TIER } from './candidates'

describe('decide — 채용한 베테랑이 점유를 짧게 만든다', () => {
  it('같은 콜을 베테랑이 받으면 busyUntil이 duration×0.8로 줄어든다', () => {
    const vet = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'VETERAN')!
    const vetHospital = buildHospital({
      hospitalName: 'v', doctors: { CARDIOLOGY: 1 }, hiredIds: [vet.id],
    }).hospital
    const stdHospital = buildHospital({ hospitalName: 's', doctors: { CARDIOLOGY: 1 } }).hospital

    // 큐의 첫 STEMI까지 진행해 수용했을 때의 busyUntil을 두 병원에서 비교한다.
    const day = 1
    const run = (hospital: Hospital) => {
      let st = createReceivingState(hospital, day)
      while (!st.done) {
        const call = st.queue[st.index]
        if (call.kind === 'STEMI') {
          const before = st
          st = decide(st, 'ACCEPT')
          const entry = st.log[st.log.length - 1]
          if (entry.accepted) {
            const docId = Object.keys(st.busyUntil).find(
              (id) => st.busyUntil[id] !== before.busyUntil[id],
            )!
            return { start: entry.startMin!, until: st.busyUntil[docId], duration: call.durationMin! }
          }
          return undefined
        }
        st = decide(st, 'DECLINE')
      }
      return undefined
    }

    const v = run(vetHospital)
    const s = run(stdHospital)
    // 같은 day라 큐가 동일 — 둘 다 같은 STEMI를 같은 시각에 받는다(결정론).
    expect(v).toBeDefined()
    expect(s).toBeDefined()
    expect(v!.duration).toBe(s!.duration)
    expect(s!.until - s!.start).toBe(s!.duration)
    expect(v!.until - v!.start).toBe(Math.round(v!.duration * SPEED_OF_TIER.VETERAN))
  })
})
```

⚠️ `createReceivingState`·`decide`의 실제 시그니처(초기 인자·state 생성 헬퍼 이름)는 `receiving.test.ts` 상단의 기존 테스트가 쓰는 방식을 그대로 따른다 — 이 파일에 이미 같은 패턴의 통합 테스트가 다수 있다(예: 984행 부근). 다르면 그쪽이 정답이다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/daysim.test.ts src/game/receiving.test.ts`
Expected: FAIL — `occupiedUntilMin` 미정의

- [ ] **Step 3: 구현**

`src/game/daysim.ts`에 추가:

```ts
/**
 * 점유 종료 시각(분) — 의사 개인 속도 반영. 점유 계산의 **유일한 자리**다(decide·applyBump 공유;
 * 식이 두 곳에 살면 한쪽이 낡는다). speedFactor 없으면(무명 채용·구 경로) 현행과 동일.
 */
export function occupiedUntilMin(doc: Doctor, startMin: number, durationMin: number): number {
  return startMin + Math.round(durationMin * (doc.speedFactor ?? 1))
}
```

`src/game/receiving.ts` — import에 `occupiedUntilMin` 추가 후 두 곳 교체:

decide(629행):

```ts
    busyUntil = { ...state.busyUntil, [assignee.id]: occupiedUntilMin(assignee, start, call.durationMin ?? 0) }
```

applyBump(691행 앞뒤 — targetId만 있던 자리에서 의사 객체를 찾는다):

```ts
  // 그 의사를 응급으로 재점유(지금부터 durationMin 동안·개인 속도 반영). 예약 수익 회수 + 응급 델타 반영.
  const target = (state.hospital.roster ?? []).find((d) => d.id === targetId)! // bumpTarget은 roster에서 나온 id
  const busyUntil = { ...state.busyUntil, [targetId]: occupiedUntilMin(target, arrivalMin, call.durationMin ?? 0) }
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — speedFactor 없는 기존 경로는 `?? 1`이라 수치 전부 불변(기존 테스트가 그 증명)

- [ ] **Step 5: 커밋**

```
feat: 진료 속도 — 베테랑은 환자를 빨리 본다(occupiedUntilMin 단일 계산처) (채용 데스크 4/7)
```

---

### Task 5: 초상 변주 — 이력서의 얼굴이 맵을 걸어다닌다

**Files:**
- Modify: `src/components/PixelSprite.tsx:51-63` (DoctorSprite) · `src/game/hospitalMap.ts:59-68·134·139` (MapAvatar·push 2곳) · `src/components/HospitalMap.tsx:141`
- Test: `src/game/hospitalMap.test.ts` (추가)

**Interfaces:**
- Consumes: `Doctor.candidateId` (Task 2)
- Produces: `DoctorSprite({ dept, busy, variantKey? })` · `MapAvatar.candidateId?: string`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/game/hospitalMap.test.ts`에 추가(파일 상단의 기존 `buildHospital` 패턴 재사용):

```ts
import { CANDIDATES } from './candidates'

describe('deriveMapScene — 지원자 출신 의사의 candidateId 전달', () => {
  it('roster의 candidateId가 아바타에 실린다(초상 변주 키) · 무명은 undefined', () => {
    const vet = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'VETERAN')!
    const h = buildHospital({
      hospitalName: 'h', doctors: { CARDIOLOGY: 2 }, hiredIds: [vet.id],
    }).hospital
    const scene = deriveMapScene(emptyReceivingFor(h), 0) // 기존 테스트의 상태 생성 헬퍼를 그대로 쓴다
    const doctors = scene.avatars.filter((a) => a.kind === 'DOCTOR')
    expect(doctors.find((a) => a.id === 'doc-CARDIOLOGY-1')!.candidateId).toBe(vet.id)
    expect(doctors.find((a) => a.id === 'doc-CARDIOLOGY-2')!.candidateId).toBeUndefined()
  })
})
```

⚠️ `deriveMapScene` 호출·상태 생성 방식은 `hospitalMap.test.ts` 기존 테스트(55~61행 부근)의 패턴을 그대로 따른다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/hospitalMap.test.ts`
Expected: FAIL — `candidateId` 프로퍼티 없음

- [ ] **Step 3: 구현**

`src/game/hospitalMap.ts` — `MapAvatar`에 필드 추가:

```ts
  candidateId?: string // 출신 지원자(초상 변주 키) — Doctor.candidateId 파생. 무명이면 없음
```

134행·139행 push에 `candidateId: doc.candidateId` 추가:

```ts
      avatars.push({ id: doc.id, kind: 'DOCTOR', zone: 'CORRIDOR', dept: doc.dept, slot: corridorSlot++, busy: false, candidateId: doc.candidateId })
```

```ts
    avatars.push({ id: doc.id, kind: 'DOCTOR', zone: 'ROOM', dept: doc.dept, slot, busy: true, candidateId: doc.candidateId })
```

`src/components/PixelSprite.tsx` — 변주 팔레트 + DoctorSprite 확장(기본값 = 현행 색과 동일해 하위호환):

```tsx
// 지원자별 초상 변주 — 머리·피부 2슬롯만(character-design.md §1: 실루엣은 FIGURE 하나, 색으로만 구분).
// id 해시 파생이라 결정론(RNG 0). 기본값(변주 키 없음) = 종전 렌더와 동일.
const HAIR_VARIANTS = ["#3f3f46", "#1c1917", "#7c5a3a", "#57534e"];
const SKIN_VARIANTS = ["#f0d3b4", "#e3b58a", "#c99a6b"];

function variantOf(key: string): { hair: string; skin: string } {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  const u = h >>> 0;
  return {
    hair: HAIR_VARIANTS[u % HAIR_VARIANTS.length],
    skin: SKIN_VARIANTS[Math.floor(u / 7) % SKIN_VARIANTS.length],
  };
}

/** 의사 — 흰 가운 + 과 색 어깨. busy면 가운이 밝아진다. variantKey(지원자 id)가 있으면 머리·피부 변주. */
export function DoctorSprite({ dept, busy, variantKey }: { dept: DeptKey; busy: boolean; variantKey?: string }) {
  const v = variantKey ? variantOf(variantKey) : { hair: "#3f3f46", skin: "#f0d3b4" };
  return (
    <PixelGrid
      rows={FIGURE}
      palette={{ H: v.hair, S: v.skin, C: busy ? "#fafafa" : "#d4d4d8", A: DEPT_COLOR[dept] }}
    />
  );
}
```

`src/components/HospitalMap.tsx:141` 교체:

```tsx
                {a.kind === "DOCTOR" && a.dept ? <DoctorSprite dept={a.dept} busy={a.busy} variantKey={a.candidateId} /> : <PatientSprite />}
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: 커밋**

```
feat: 초상 변주 — 지원자 얼굴(머리·피부)이 맵 아바타까지 이어진다 (채용 데스크 5/7)
```

---

### Task 6: SetupWizard 채용 데스크 UI

**Files:**
- Modify: `src/components/SetupWizard.tsx` (DEPTS 단계 전면 교체 — NAME 단계·onComplete 계약은 불변)

**Interfaces:**
- Consumes: `CANDIDATES`, `SPEED_OF_TIER`, `toggleHired`, `doctorsCountsOf`, `hiringCostOfCandidates` (Task 1) · `setupHiringCostManwon` 경유 `isSetupReady` (Task 3) · `DoctorSprite variantKey` (Task 5) · `deptCap` (기존 setup.ts)
- Produces: `onComplete({ hospitalName, doctors: doctorsCountsOf(hired), hiredIds: hired })` — 이후 세션 흐름은 무수정

- [ ] **Step 1: DEPTS 단계 구현** (UI라 브라우저 검증 — 로직은 Task 1~3 테스트가 이미 커버)

`src/components/SetupWizard.tsx` 전체 교체:

```tsx
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
```

주의:
- 기존 `DepartmentCard`·`adjustDoctors` 사용부는 이 파일에서 제거된다(성장 화면 `GrowthPhase.tsx`는 계속 쓴다 — 건드리지 않는다).
- 기존 코드는 `choices` state 하나였다 — 이 교체에서 `hospitalName`·`hired` 두 state로 갈라지고 `draft`가 렌더마다 파생된다(기록 지점은 `onComplete` 한 곳).
- `departments` prop이 주입돼도(테스트용 boosted 카탈로그) `CANDIDATES`는 전역 풀이라 그대로 동작한다.

- [ ] **Step 2: 정적 게이트**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: 셋 다 통과(에러 0)

- [ ] **Step 3: 브라우저 검증** (dev 서버로 확인 — preview 도구 사용)

체크리스트:
1. NAME → DEPTS 진입, 첫 과(미용·피부) 아코디언 펼침 상태
2. 지원서 카드에 픽셀 초상(지원자마다 머리·피부 다름)·이름·연차·경력·계약금·×배율 표시
3. 카드 탭 → 「채용」 도장, 재탭 → 제거. 3명 채용 시 남은 카드 비활성
4. 예산 합계가 지원자 계약금 합으로 움직이고 초과 시 「예산 초과」 도장
5. 필수과 채용 시 자격 사다리 갱신(현행 동일)
6. 「병원 개원」 후 병원 맵에서 채용한 지원자 얼굴(변주)이 그대로 보임
7. 모바일 375px 가로 스크롤 없음, 키보드 탭 이동·aria-pressed 동작

- [ ] **Step 4: 커밋**

```
feat: 채용 데스크 UI — 지원서 아코디언 + 채용 도장 (채용 데스크 6/7)
```

---

### Task 7: 문서 개정 + 추적 3종 + 최종 게이트

**Files:**
- Modify: `docs/concept/character-design.md` (§0 표·§2·§6)
- Modify: `claude-docs/plan.md` (🔜 항목 → ✅) · `claude-docs/changeLog.md` (맨 위 한 항목)

**Interfaces:** 없음(문서만)

- [ ] **Step 1: character-design.md 개정**

§0 표에 행 추가:

```markdown
| 지원자 데이터(이름·연차·경력·계약금·티어) | `src/game/candidates.ts` |
```

§2의 "성격·사연·초상화는 없다" 불릿 교체:

```markdown
- **성격·사연·감정 서사는 없다.** 의사는 개인이 아니라 **자리 하나**다. "번아웃한 순환기 김 선생의 사연"을 넣는 순간 시스템 이야기가 인물 드라마가 된다.
  - **2026-07-24 부분 해제(사용자 결정, [채용 데스크 스펙](../superpowers/specs/2026-07-24-hiring-desk-setup-design.md))**: 픽셀 초상(FIGURE 확대 + 머리·피부 변주)·기계적 약력(연차·근무처)·요구 계약금·티어 파생 진료 속도는 **허용** — 자리의 스펙 시트이지 인물 소개가 아니다. 성격·감정·사연·대사는 계속 금지.
```

§6 표의 "캐릭터 초상화·프로필 UI" 행 교체(지우지 않고 이력 보존):

```markdown
| 캐릭터 초상화·프로필 UI | ~~개체에 시선이 모이면 대조가 안 보인다~~ **2026-07-24 부분 해제**: SETUP 지원서의 픽셀 초상·기계적 약력만. 감정 표현·개인 사연·환자 개인화·대사는 금지 유지(§2·§3) |
```

- [ ] **Step 2: plan.md·changeLog.md 갱신**

plan.md 「🔜 다음」의 채용 데스크 항목을 ✅로 바꾸고 한 줄 요약. changeLog.md 맨 위에 항목 추가(PR 번호는 적지 않는다 — 프로젝트 규약):

```markdown
## 2026-07-XX · 채용 데스크 — SETUP 위저드 게임화(지원서+도장)

과별 +/- 카운터를 지원서 더미로: 지원자 32명(과별 4명·신입/중견/베테랑) 고정 풀에서 초상(픽셀 변주)·연차·경력·요구 계약금을 보고 도장으로 채용한다. 베테랑은 계약금 ×1.3에 진료 소요 ×0.8 — "싼 신입 vs 비싼 베테랑"이 예산 5억 딜레마에 얹힌다. 판정 침습은 `occupiedUntilMin` 한 곳(콜 경제 0 침습), `doctors` 카운트는 `hiredIds` 파생이라 성장·경제 소비처 무수정. character-design §2·§6 부분 해제(성격·사연 금지선 유지).
```

- [ ] **Step 3: 최종 게이트 + trap 스윕**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: 전부 통과

trap 스윕(프로젝트 CLAUDE.md 「SDD trap 스윕」): 이번 브랜치에서 1분+ 근인 디버깅이 있었나 — 서브에이전트·리뷰어가 잡은 것 포함. 있으면 `claude-docs/troubleshooting/T-###.md` 신설.

- [ ] **Step 4: 커밋**

```
docs: character-design §2·§6 부분 해제 + 추적 3종 갱신 (채용 데스크 7/7)
```

- [ ] **Step 5: PR 생성** — 브랜치에서 `gh pr create`(본문 한국어, `--body-file` UTF-8 경유), 머지는 사용자에게 물어본 뒤.

---

## Self-Review 결과 (계획 작성 시 수행)

- **스펙 커버리지**: §2→Task 1 · §3→Task 2·3 · §4→Task 4 · §5→Task 6 · §6→Task 5 · §7→Task 7 · §8→각 태스크 Step 1 · §9→비작업. 누락 없음.
- **타입 일관성**: `hiredIds?: string[]`(Task 2 types = Task 3 setup = Task 6 draft) · `occupiedUntilMin(doc, startMin, durationMin)`(Task 4 정의 = decide/applyBump 사용) · `variantKey`(Task 5 정의 = Task 6 카드 사용) 일치 확인.
- **알려진 유의점**: Task 4·5의 통합 테스트는 기존 테스트 파일의 상태 생성 헬퍼 이름을 따라야 한다(파일마다 헬퍼가 달라 계획에 정확한 이름을 못 박지 않고 "기존 패턴을 따르라"로 명시). Task 6은 UI라 vitest 대신 정적 게이트 + 브라우저 체크리스트.
