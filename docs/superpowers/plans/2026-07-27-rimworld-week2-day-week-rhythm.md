---
tags:
  - type/plan
---

# 림월드형 2주차 PR A — 하루·주 리듬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 17시 이후 시계만 영원히 도는 1주차 구멍을 하루 마감 → 다음 날 → 7일차 주간 결산(고정비·폐업) → 다음 주 루프로 닫는다 — 게임에 "한 판"의 마디가 생긴다.

**Architecture:** `SimWorld`에 `phase`(`RUNNING`/`DAY_END`/`WEEK_END`/`CLOSED`)·`days: DayRecord[]`·`week`를 추가한다. `tick`은 운영 마감(600분)에 정산(`settleDay`)을 돌리고 `DAY_END`로 멈춘다 — 이후 전이는 순수 함수 `startNextDay`/`startNextWeek`를 UI 버튼이 호출한다(시계가 아니라 플레이어가 하루를 넘긴다 — 림월드가 아니라 우리 기존 게임의 마디 감각이고, 결산을 읽게 만드는 장치다). 주간 결산에서 의사 고정비를 차감하고 금고 음수 연속 2주면 `CLOSED`(기존 폐업 규칙 이식). 렌더는 오버레이 2종만 추가.

**Tech Stack:** 기존 그대로(신규 라이브러리 0). 전부 `src/sim/`·`src/components/`·`src/app/sim/` 안.

**결정 사항(스펙·사용자 결정에서 파생)**:
- 우선순위 결정(2026-07-27 사용자): 시간이 모자라면 PR C(욕구·사직)를 줄이고 PR D(AI 스토리텔러)를 지킨다. PR A는 그 두 PR 모두의 그릇이라 절단 불가.
- 마감 시 진행 중 진료는 **완료로 인정**(수익 지급 — 각색·절단: 야근 연장 재생은 2주차 범위 밖), 대기·이동 중 환자는 이탈 집계 후 제거.
- 고정비는 이번 PR에선 **의사 1인당 주 2,000만원 상수**(각색·튜닝값) — 과별 정밀화(`CALL_ECONOMICS`·`fixedCost` 이식)는 PR B의 몫. 폐업 규칙이 죽은 코드가 되지 않게 하는 최소 도입이다.

**공통 규약(모든 태스크)**: 1주차 계획과 동일 — 커밋은 `.commit-msg-tmp`(UTF-8) + `git commit -F`, 트레일러 빈 줄 없이 연속(`Skill` 도구 미호출이면 `Skills-used: none`), 게이트 = `npx vitest run` 전체 green + `npx tsc --noEmit` 0, `src/sim` 임포트는 상대 경로, 새 md는 frontmatter 태그 필수. **돌연변이 실측 의무**(계획 테스트가 못 잡는 구현 줄은 최소 테스트로 보강 — 1주차에서 태스크당 1~10건 나왔다). ⚠️ 변조 복구는 `git checkout` 금지(CRLF 함정, [T-076](../../../claude-docs/troubleshooting/T-076.md)) — 백업 재기록으로. 경계 테스트는 [T-085](../../../claude-docs/troubleshooting/T-085.md)(기준값 캡처가 경계 앞) 준수.

---

### Task 1: 하루 마감 코어 — phase·정산 (`src/sim/world.ts`, `src/sim/day.ts`, `src/sim/tick.ts`)

**Files:**
- Modify: `src/sim/world.ts` (phase·week·days 필드), `src/sim/tick.ts` (마감 전환·비RUNNING no-op)
- Create: `src/sim/day.ts` (`DAY_END_MIN`·`DayRecord`·`settleDay`)
- Test: `src/sim/day.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/sim/day.test.ts
import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { placeRoom } from './build'
import { spawnDoctor } from './pawn'
import { tick } from './tick'
import { DAY_END_MIN, settleDay } from './day'
import { EXAM_REVENUE_MANWON } from './patientFlow'

function hospitalWorld(seed: number) {
  let w = createWorld(seed)
  const r1 = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!r1.ok) throw new Error('전제 실패')
  const r2 = placeRoom(r1.world, { type: 'EXAM', x: 6, y: 6, w: 6, h: 5 })
  if (!r2.ok) throw new Error('전제 실패')
  return spawnDoctor(r2.world, 'INTERNAL_MEDICINE', { x: 8, y: 8 })
}

describe('하루 마감', () => {
  it(`${DAY_END_MIN}분에 tick이 DAY_END로 멈추고, 그 뒤 tick은 no-op이다`, () => {
    let w = hospitalWorld(3)
    for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
    expect(w.phase).toBe('DAY_END')
    expect(w.minute).toBe(DAY_END_MIN)
    const frozen = tick(w, 60)
    expect(frozen).toEqual(w) // 멈춘 세계는 흐르지 않는다
  })
  it('정산: 진행 중 진료는 완료 인정(수익 지급), 대기·이동 환자는 이탈 집계 후 제거, 의사만 남는다', () => {
    let w = hospitalWorld(3)
    for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
    expect(w.pawns.every(p => p.kind === 'DOCTOR')).toBe(true)
    // 금고 불변식은 정산을 통과해도 유지된다
    const built = 50_000 - w.treasuryManwon + w.stats.examsDone * EXAM_REVENUE_MANWON
    expect(w.treasuryManwon).toBe(50_000 - built + w.stats.examsDone * EXAM_REVENUE_MANWON)
  })
  it('DayRecord가 그날 수치를 굳힌다', () => {
    let w = hospitalWorld(3)
    for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
    expect(w.days).toHaveLength(1)
    const d = w.days[0]
    expect(d.day).toBe(1)
    expect(d.examsDone).toBe(w.stats.examsDone)
    expect(d.leftCount).toBe(w.stats.leftCount)
    expect(d.revenueManwon).toBe(w.stats.examsDone * EXAM_REVENUE_MANWON)
  })
  it('결정론: 같은 시드면 마감 세계가 완전 동일', () => {
    const run = () => { let w = hospitalWorld(11); for (let i = 0; i < DAY_END_MIN + 10; i++) w = tick(w, 1); return w }
    expect(run()).toEqual(run())
  })
  it('settleDay는 RUNNING이 아닌 세계를 거부한다(이중 정산 방지)', () => {
    let w = hospitalWorld(3)
    for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
    expect(() => settleDay(w)).toThrow()
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/sim/day.test.ts` / Expected: FAIL (스텁 경유로 행동 실패까지 — 1주차 선례)

- [ ] **Step 3: 구현**

`world.ts`의 `SimWorld`에 추가(`createWorld` 초기값 포함):

```ts
export type SimPhase = 'RUNNING' | 'DAY_END' | 'WEEK_END' | 'CLOSED'
// SimWorld에:
phase: SimPhase        // 초기 'RUNNING'
week: number           // 초기 1
days: import('./day').DayRecord[]  // 초기 [] — 이번 주의 하루 기록(주 넘기면 비움)
```

```ts
// src/sim/day.ts
// 하루의 끝 — 정산과 기록. 전이는 tick이 부르고, 다음 날 시작은 UI가 부른다(Task 2).
import type { SimWorld } from './world'
import { EXAM_REVENUE_MANWON } from './patientFlow'

export const DAY_END_MIN = 600 // 09:00 개장 + 10시간 = 19:00 마감(기존 daysim.DAY_LENGTH_MIN과 같은 각색)
export const DAYS_PER_WEEK = 7

export interface DayRecord {
  day: number
  examsDone: number
  leftCount: number
  revenueManwon: number
}

/** 운영 마감 정산 — RUNNING 세계에만 허용(이중 정산 방지).
 *  진행 중 진료(IN_EXAM)는 완료 인정(각색: 야근 연장은 범위 밖), 나머지 환자는 이탈 집계 후 제거. */
export function settleDay(world: SimWorld): SimWorld {
  if (world.phase !== 'RUNNING') throw new Error(`settleDay: RUNNING이 아닌 세계(${world.phase})`)
  let exams = world.stats.examsDone
  let left = world.stats.leftCount
  for (const p of world.pawns) {
    if (p.kind !== 'PATIENT') continue
    if (p.stage === 'IN_EXAM') exams += 1
    else if (p.stage !== 'LEAVING') left += 1 // 퇴장 중이던 환자는 이미 집계됨(진료 완료 or 이탈)
  }
  const doctors = world.pawns.filter(p => p.kind === 'DOCTOR')
  const examsDelta = exams - world.stats.examsDone
  const record: DayRecord = {
    day: world.day, examsDone: exams, leftCount: left,
    revenueManwon: exams * EXAM_REVENUE_MANWON,
  }
  return {
    ...world,
    phase: 'DAY_END',
    pawns: doctors,
    treasuryManwon: world.treasuryManwon + examsDelta * EXAM_REVENUE_MANWON,
    stats: { examsDone: exams, leftCount: left },
    days: [...world.days, record],
  }
}
```

`tick.ts`: `tickOneMinute` 진입에서 `if (world.phase !== 'RUNNING') return world`(no-op — `tick(w, n)`이 통째로 동결). 분이 `DAY_END_MIN`에 **도달하는 순간**(minute 증가 후 `=== DAY_END_MIN`) `settleDay`를 부른다.

⚠️ **기존 테스트 조정 주의**: 1주차 테스트 중 600분 이후를 돌리는 것들(퇴장 900분 지평 등)이 정산 도입으로 결과가 바뀐다. **금고 불변식(금고 = 초기 − 건설비 + 진료×30)과 각 테스트의 의도를 유지하는 방향으로만** 조정하라 — 단언을 지워서 통과시키는 것은 금지. 조정한 테스트는 전부 보고에 신고.

- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim` 전체 green + `npx tsc --noEmit` 0
- [ ] **Step 5: 커밋** — `feat: 하루 마감 — 19시 정산·DAY_END 동결`

---

### Task 2: 다음 날 — `startNextDay` (`src/sim/day.ts` 확장)

**Files:**
- Modify: `src/sim/day.ts`, `src/sim/world.ts`(필요시)
- Test: `src/sim/day.test.ts` 확장

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
describe('다음 날', () => {
  it('DAY_END에서 startNextDay — day+1·분 0·당일 stats 리셋·의사는 자기 진료실 책상 앞·환자 0', () => {
    let w = hospitalWorld(3)
    for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
    const next = startNextDay(w)
    expect(next.phase).toBe('RUNNING')
    expect(next.day).toBe(2)
    expect(next.minute).toBe(0)
    expect(next.stats).toEqual({ examsDone: 0, leftCount: 0 })
    expect(next.days).toHaveLength(1) // 기록은 보존
    const doc = next.pawns.find(p => p.kind === 'DOCTOR')!
    expect(doc.path).toEqual([])
    expect(doc.roomId).toBeDefined()
  })
  it('2일차도 환자가 오고 진료가 돈다(도착 시드가 day로 갈린다)', () => {
    let w = hospitalWorld(3)
    for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
    const day1 = w.days[0]
    w = startNextDay(w)
    for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
    expect(w.days).toHaveLength(2)
    expect(w.days[1].examsDone).toBeGreaterThan(0)
    // 같은 시드라도 day가 달라 하루 궤적이 다르다(도착 seed에 day가 들어감)
    expect(w.days[1]).not.toEqual({ ...day1, day: 2 })
  })
  it('7일차 마감 뒤 startNextDay가 아니라 WEEK_END로 간다', () => {
    let w = hospitalWorld(3)
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
      if (d < DAYS_PER_WEEK - 1) w = startNextDay(w)
    }
    expect(w.days).toHaveLength(7)
    expect(w.phase).toBe('WEEK_END') // 7일차 정산이 곧바로 WEEK_END를 세운다
  })
  it('startNextDay는 DAY_END가 아닌 세계를 거부한다', () => {
    expect(() => startNextDay(hospitalWorld(3))).toThrow()
  })
})
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL
- [ ] **Step 3: 구현** — `startNextDay(world)`: `phase !== 'DAY_END'`면 throw. `day + 1`·`minute: 0`·`stats` 리셋·의사 위치를 자기 방 책상 앞(`frontTile` 파생 재사용 — `patientFlow`의 헬퍼를 export하거나 `day.ts`로 이동, 이중 구현 금지)·`path: []`·`dest` 제거. `settleDay`가 7일차(`world.days.length + 1 === DAYS_PER_WEEK` 시점, 즉 정산 후 `days.length === DAYS_PER_WEEK`)면 `phase: 'WEEK_END'`를 세운다(Task 1의 `settleDay` 반환을 조건 분기로 확장).
- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim` green + tsc 0
- [ ] **Step 5: 커밋** — `feat: 다음 날 — 하루 전환·7일차 주간 결산 진입`

---

### Task 3: 주간 결산 — 고정비·폐업·다음 주 (`src/sim/week.ts`)

**Files:**
- Create: `src/sim/week.ts`
- Modify: `src/sim/world.ts` (`insolvencyStreak` 필드)
- Test: `src/sim/week.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/sim/week.test.ts
import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { WEEKLY_DOCTOR_COST_MANWON, weekSummary, settleWeek, startNextWeek } from './week'
import type { DayRecord } from './day'

const day = (n: number, exams: number): DayRecord =>
  ({ day: n, examsDone: exams, leftCount: 0, revenueManwon: exams * 30 })

function weekEndWorld(over: Partial<ReturnType<typeof createWorld>> = {}) {
  const base = createWorld(1)
  return {
    ...base,
    phase: 'WEEK_END' as const,
    days: [1, 2, 3, 4, 5, 6, 7].map(n => day(n, 10)),
    pawns: [
      { id: 'doc-1', kind: 'DOCTOR' as const, x: 8, y: 8, path: [] },
      { id: 'doc-2', kind: 'DOCTOR' as const, x: 9, y: 8, path: [] },
    ],
    ...over,
  }
}

describe('주간 결산', () => {
  it('요약: 수익 합 = 7일 revenue 합, 고정비 = 의사 수 × 상수, 순이익 = 수익 − 고정비', () => {
    const w = weekEndWorld()
    const s = weekSummary(w)
    expect(s.revenueManwon).toBe(7 * 10 * 30)
    expect(s.fixedCostManwon).toBe(2 * WEEKLY_DOCTOR_COST_MANWON)
    expect(s.netManwon).toBe(s.revenueManwon - s.fixedCostManwon)
  })
  it('settleWeek: 고정비가 금고에서 빠진다(수익은 진료 시점에 이미 들어옴 — 이중 지급 금지)', () => {
    const w = weekEndWorld({ treasuryManwon: 10_000 })
    const settled = settleWeek(w)
    expect(settled.treasuryManwon).toBe(10_000 - 2 * WEEKLY_DOCTOR_COST_MANWON)
  })
  it('금고 음수면 streak+1, 흑자 복귀면 0으로 리셋', () => {
    const broke = settleWeek(weekEndWorld({ treasuryManwon: 100 }))
    expect(broke.treasuryManwon).toBeLessThan(0)
    expect(broke.insolvencyStreak).toBe(1)
    const rich = settleWeek(weekEndWorld({ treasuryManwon: 100_000, insolvencyStreak: 1 }))
    expect(rich.insolvencyStreak).toBe(0)
  })
  it('음수 연속 2주면 CLOSED — startNextWeek이 봉쇄된다', () => {
    const dead = settleWeek(weekEndWorld({ treasuryManwon: 100, insolvencyStreak: 1 }))
    expect(dead.insolvencyStreak).toBe(2)
    expect(dead.phase).toBe('CLOSED')
    expect(() => startNextWeek(dead)).toThrow()
  })
  it('startNextWeek: week+1·day 1·분 0·days 비움·RUNNING — 방·의사·금고는 유지', () => {
    const settled = settleWeek(weekEndWorld({ treasuryManwon: 100_000 }))
    const next = startNextWeek(settled)
    expect(next).toMatchObject({ phase: 'RUNNING', week: 2, day: 1, minute: 0, days: [] })
    expect(next.pawns).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL
- [ ] **Step 3: 구현**

```ts
// src/sim/week.ts
// 주간 결산 — 고정비·폐업·다음 주. PR B에서 고정비가 과별로 정밀화된다(여기선 상수).
import type { SimWorld } from './world'

export const WEEKLY_DOCTOR_COST_MANWON = 2_000 // 의사 1인 주 고정비(각색·튜닝값 — PR B에서 과별 정밀화)
export const INSOLVENCY_WEEKS_TO_CLOSE = 2     // 기존 게임 폐업 규칙 계승(금고 음수 연속 2주)

export interface WeekSummary {
  week: number
  revenueManwon: number
  fixedCostManwon: number
  netManwon: number
  examsDone: number
  leftCount: number
}

export function weekSummary(w: SimWorld): WeekSummary { /* days 합산 + 의사 수 × 상수 */ }

/** WEEK_END에서 호출 — 고정비 차감·insolvencyStreak 갱신·2주 연속이면 CLOSED */
export function settleWeek(w: SimWorld): SimWorld { /* phase 검증 포함 */ }

/** 결산 확인 후 다음 주 — CLOSED면 throw */
export function startNextWeek(w: SimWorld): SimWorld { /* phase 검증 포함 */ }
```

`world.ts`에 `insolvencyStreak: number`(초기 0). `settleWeek`은 `phase !== 'WEEK_END'`면 throw. **`settleWeek`을 두 번 부르면 고정비가 두 번 빠진다** — phase를 `WEEK_END` → (결산 완료 표시)로 바꾸거나 별도 가드로 이중 정산을 막고, 그 가드를 테스트로 잠가라(Task 1의 `settleDay` 가드와 같은 패턴). UI 흐름은 Task 4에서: WEEK_END 진입 시 자동으로 `settleWeek` 1회 → 요약 표시 → 버튼이 `startNextWeek`.

- [ ] **Step 4: 통과 확인** — green + tsc 0
- [ ] **Step 5: 커밋** — `feat: 주간 결산 — 고정비·폐업(음수 2주)·다음 주`

---

### Task 4: UI — 마감·결산 오버레이 (`src/app/sim/page.tsx`, `src/components/DayEndOverlay.tsx`·`WeekEndOverlay.tsx`)

**Files:**
- Create: `src/components/DayEndOverlay.tsx`, `src/components/WeekEndOverlay.tsx`
- Modify: `src/app/sim/page.tsx`, `src/components/useSimClock.ts`(phase 비RUNNING이면 tick 정지)
- Test: 브라우저 실측(+ 순수 로직이 생기면 vitest)

동작 정의:
- `useSimClock`: `world.phase !== 'RUNNING'`이면 rAF 루프가 tick을 부르지 않는다(속도 버튼과 무관 — 오버레이 동안 세계 동결). 구현은 훅에 phase를 넘기거나 setWorld 콜백에서 가드 — **순수 로직으로 분리 가능하면 vitest로 잠근다**.
- `DayEndOverlay`: `phase === 'DAY_END'`에 뜬다 — `N일차 마감` · 그날 진료/이탈/수익(오늘 `DayRecord`) · 이번 주 누적(days 합) · [다음 날] 버튼 → `startNextDay`. 지금까지의 디자인 토큰(종이·잉크)을 따른다.
- `WeekEndOverlay`: `phase === 'WEEK_END'` 진입 시 페이지가 `settleWeek`을 **정확히 1회** 호출(useEffect 가드 — StrictMode 이중 호출 주의: 1주차 Task 6의 이중 건설과 같은 함정이다. Task 3의 이중 정산 가드가 코어에서 한 번 더 막지만, UI도 의도적으로 1회만 불러라). 7일 표(일·진료·이탈·수익) · 고정비 · 순이익 · 금고 · streak 경고(1주: 은행 경고 / 2주: 폐업 — [다음 주] 미표시, `CLOSED` 안내). [다음 주] → `startNextWeek`.
- HUD에 `W주 D일` 표시 추가.

- [ ] **Step 1**: (분리 가능한 순수 로직이 있으면) 실패 테스트 → **Step 2** 실패 확인 → **Step 3** 구현 → **Step 4** 게이트: `npx vitest run` 전체 green·tsc 0·`npm run build`(PowerShell — Git Bash는 T-059 경로 변환 오탐) + 브라우저 실측: 하루 완주→마감 오버레이→다음 날→환자 재도착→…7일차→주간 결산(고정비·순이익 확인)→다음 주. 폐업 경로는 금고를 임시로 낮춰 재현(임시 코드 커밋 금지). 콘솔 에러 0. ⚠️ pane 미표시면 rAF 정지([T-086](../../../claude-docs/troubleshooting/T-086.md)) — 프레임 공급원 대체로 검증.
- [ ] **Step 5: 커밋** — `feat: 마감·주간결산 오버레이 — 하루가 넘어가고 폐업이 보인다`

---

### Task 5: 문서 스윕 + 최종 게이트

- [ ] plan.md(PR A ✅·PR B 🔜)·changeLog.md 항목 추가, trap 스윕(1분+ 디버깅 있었으면 T-### 신설)
- [ ] `npx vitest run`·`npx tsc --noEmit`·`npm run build` 전체 재확인 후 커밋 — `docs: 2주차 PR A 마무리 — plan·changeLog`

---

## Self-Review 기록

- **스펙 커버리지**: 스펙 §1 "하루·주 리듬 유지"의 하루 마감·주간 결산·폐업이 이 PR로 성립. §1 "9~19시" — 도착은 여전히 0..480(17시)이고 마감이 600(19시): 17~19시는 잔여 환자 소화 시간대(스펙과 정합). 스페이스바 일시정지·야간 응급은 여전히 범위 밖(전자는 PR D 폴리시, 후자는 PR B).
- **플레이스홀더 스캔**: Task 3 Step 3의 함수 본문 주석(`/* ... */`)은 시그니처·계약·가드 조건이 전부 명시돼 있고 테스트가 행동을 잠근다 — Task 5(1주차)와 같은 정당화. Task 4는 동작 정의 + 함정 경고(StrictMode·T-086) 방식 — 1주차 Task 6 선례.
- **타입 일관성**: `SimPhase`·`DayRecord`·`WeekSummary`·`insolvencyStreak` 정의 위치와 사용처 대조 완료. `frontTile` 재사용은 "이중 구현 금지"로 명시(1주차 doorTile 복제 함정의 재발 방지).
- **기존 테스트 파급**: Task 1에 조정 원칙(의도 유지·단언 삭제 금지·전부 신고)을 명시 — 600분 이후를 돌리던 1주차 테스트들이 영향권.
