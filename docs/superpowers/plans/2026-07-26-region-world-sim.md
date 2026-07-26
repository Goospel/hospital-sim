---
tags:
  - type/plan
---

# 지역 세계 시뮬 (최소 슬라이스) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지역 3계층(수도권/광역시/지방)의 과별 의사 수를 매주 결정론 드리프트 + 이벤트 쇼크로 굴리고, 전원 콜 구성과 채용 풀 두 채널로 플레이어에게 번역한다.

**Architecture:** 세계 상태(`world.ts`)에 `regions`를 추가하고, 매주 `stepWorld`(lawsuitRisk 가중 RURAL→CAPITAL 이동)와 `RegionEffect`(이벤트 쇼크)로 굴린다. 채용 풀은 METRO+RURAL 의사 합의 **파생값**으로 승격(`deriveSystem`)하고, 콜 큐는 `transferPressure(world)`로 원거리(RURAL발) 전원 비중이 올라간다. 판정(`adjudicateTransfer`) 경로는 한 줄도 안 건드린다.

**Tech Stack:** TypeScript(순수 함수) + vitest. RNG 금지 — `seededUnit`/`callSeed`(daysim.ts)만.

**스펙:** [docs/superpowers/specs/2026-07-26-region-world-sim-design.md](../specs/2026-07-26-region-world-sim-design.md)

---

## ⚠️ 이 저장소의 커밋 규약 (매 커밋 공통 — 어기면 pre-commit이 거부하거나 조용히 썩는다)

1. **한글 커밋 메시지는 반드시 `.commit-msg-tmp` 파일 경유**: Write 도구로 UTF-8 파일을 쓰고 `git commit -F .commit-msg-tmp`. 인라인 `-m`은 CP949로 깨진다(T-026).
2. **트레일러 필수** — 메시지 맨 끝에 빈 줄 없이 연속으로:
   ```
   Skills-used: superpowers:test-driven-development
   Plugins-used: superpowers
   Skill-benefit: TDD — <이번 태스크에서 실제로 얻은 이점 한 줄>
   Co-Authored-By: Claude Opus <noreply@anthropic.com>
   ```
   `Skills-used:`부터 `Co-Authored-By:`까지 **중간에 빈 줄이 하나라도 있으면 안 된다.**
3. **md 파일을 건드리는 커밋**은 pre-commit이 frontmatter `type/*` 태그를 검사한다. 이 계획서·스펙은 이미 태그가 있다.
4. 🧬 **통과 후 돌연변이 확인 (필수 — 각 Task의 "통과 확인" 단계에 포함)**: 테스트가 green이 된 직후, **그 테스트가 겨눈 규칙을 구현에서 임시로 제거**하고 실제로 빨개지는지 확인한 다음 되돌린다(예: 가중치 곱을 1로, `filter`를 지움, 클램프를 지움, 시드 salt를 지움). 이 슬라이스에서 **3회 반복해 밟은 함정**이라 규약으로 승격했다 — 속성 단정(부등호·존재성)은 대조군 없이 쓰면 "규칙의 결과"가 아니라 "데이터의 초기 분포"를 재서, 규칙을 지워도 통과하는 **공허 테스트**가 된다([T-080](../../../claude-docs/troubleshooting/T-080.md)). green은 판별력의 증거가 아니다.

## 파일 구조 (무엇을 어디에)

| 파일 | 역할 | 변경 |
|---|---|---|
| `src/game/types.ts` | 도메인 타입 | `RegionKey` 신설, `IncomingCall`에 `originRegion?`/`originLabel?` 추가 |
| `src/game/world.ts` | 세계 상태·변동의 단일 소유자 | `RegionState`·`REGION_INITIAL`·`regionOf`·`backupHospitals`·`stepWorld`·`RegionEffect`·`hireFromRegions`·`transferPressure`·`REGION_LABELS` |
| `src/game/system.ts` | 채용 풀 (세계의 파생) | `hirablePool`·`deriveSystem` 신설, `POOL_INITIAL`을 파생 상수로, `backgroundAttrition`·`hireDelta` 삭제 |
| `src/game/receiving.ts` | 콜 큐 생성 | `createCallQueue(day, beds, pressure)` 3번째 인자, 응급 콜에 발신 지역 부여 |
| `src/game/session.ts` | 상태기계 배선 | `nextWeek`(stepWorld+deriveSystem), `applyGrowth`(hireFromRegions), `weekDayQueue`(pressure 전달) |
| `src/components/CallCard.tsx` | 콜 카드 UI | 발신 지역 한 줄 표시 |
| 각 `*.test.ts` | 테스트 | 태스크별 명시 |

**의존 방향(순환 금지)**: `types.ts` ← `world.ts`(←`setup.ts`·`daysim.ts`) ← `system.ts`. `types.ts`는 아무도 import하지 않는다 — 그래서 `RegionKey`는 `world.ts`가 아니라 `types.ts`에 둔다(`IncomingCall`이 참조해야 하는데 types→world는 순환이다).

> ✏️ **구현 중 정정**: 초안은 *"`receiving.ts`는 world를 import하지 않는다"*였다 → **한다**(`import { REGION_LABELS } from './world'`). 발신 지명(`originLabel`)을 만들려면 그 상수가 필요하고, 지명을 receiving에 복사해 두는 건 이중 기재라 import가 옳다. **순환은 아니다** — world는 receiving을 모른다. 초안의 의도(*"세계 상태가 콜 생성에 새지 않는다"*)는 그대로 지켜진다: `pressure`는 여전히 **숫자 하나로** 받고 `receiving.ts`는 `WorldState`를 읽지 않는다. (⏸ 후속: `REGION_LABELS` 의존을 한쪽으로 모으는 `region.ts` 분리 — `claude-docs/plan.md` 보류 목록.)

---

### Task 1: 지역 데이터 모델 — `RegionState`·`REGION_INITIAL`·`backupHospitals`

**Files:**
- Modify: `src/game/types.ts` (Specialty 정의 근처)
- Modify: `src/game/world.ts`
- Test: `src/game/world.test.ts`

- [x] **Step 1: 실패하는 테스트 작성** — `world.test.ts` 끝에 추가:

```ts
import { initWorld, applyEvent, selectEvent, EVENT_CATALOG, OPENING_EVENT,
  REGION_INITIAL, regionOf, backupHospitals } from './world'
import type { Specialty } from './types'

const SPECIALTIES: Specialty[] = [
  'THORACIC_SURGERY', 'CARDIOLOGY', 'OBSTETRICS', 'NEUROSURGERY', 'GENERAL_SURGERY', 'INTERNAL_MEDICINE',
]

describe('지역 세계 — 데이터 모델 (spec 2026-07-26 §2)', () => {
  it('initWorld는 CAPITAL·METRO·RURAL 3개 지역을 이 순서로 갖는다', () => {
    const world = initWorld()
    expect(world.regions.map((r) => r.key)).toEqual(['CAPITAL', 'METRO', 'RURAL'])
  })

  it('시작 시점: RURAL의 과별 의사 수는 모든 필수과에서 CAPITAL보다 적다 (spec 불변식)', () => {
    const world = initWorld()
    const capital = regionOf(world, 'CAPITAL')
    const rural = regionOf(world, 'RURAL')
    for (const s of SPECIALTIES) {
      expect(rural.doctors[s]).toBeLessThan(capital.doctors[s])
    }
  })

  it('시작 시점: RURAL의 배후 가능 병원 수는 모든 필수과에서 ≥ 1 — 붕괴는 전제가 아니라 과정이다', () => {
    const rural = regionOf(initWorld(), 'RURAL')
    for (const s of SPECIALTIES) {
      expect(backupHospitals(rural, s)).toBeGreaterThanOrEqual(1)
    }
  })

  it('backupHospitals = min(hospitals, floor(doctors/2)) — 배후 병원 하나에 의사 2명(ROUND_THE_CLOCK와 동일 규칙)', () => {
    const region = { key: 'RURAL' as const, hospitals: 2, doctors: {
      THORACIC_SURGERY: 5, CARDIOLOGY: 3, OBSTETRICS: 1, NEUROSURGERY: 0,
      GENERAL_SURGERY: 4, INTERNAL_MEDICINE: 2,
    } }
    expect(backupHospitals(region, 'THORACIC_SURGERY')).toBe(2) // floor(5/2)=2, min(2,2)=2
    expect(backupHospitals(region, 'CARDIOLOGY')).toBe(1)
    expect(backupHospitals(region, 'OBSTETRICS')).toBe(0) // 1명뿐 — 당직이 안 돈다
    expect(backupHospitals(region, 'NEUROSURGERY')).toBe(0)
  })

  it('METRO+RURAL 의사 합은 기존 POOL_INITIAL(2/4/3/3/5/6)과 정확히 같다 — 기존 밸런스 보존', () => {
    const world = initWorld()
    const metro = regionOf(world, 'METRO')
    const rural = regionOf(world, 'RURAL')
    const expected: Record<Specialty, number> = {
      THORACIC_SURGERY: 2, CARDIOLOGY: 4, OBSTETRICS: 3,
      NEUROSURGERY: 3, GENERAL_SURGERY: 5, INTERNAL_MEDICINE: 6,
    }
    for (const s of SPECIALTIES) {
      expect(metro.doctors[s] + rural.doctors[s]).toBe(expected[s])
    }
  })
})
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run src/game/world.test.ts`
Expected: FAIL — `REGION_INITIAL`/`regionOf`/`backupHospitals` export 없음.

- [x] **Step 3: 구현** — 먼저 `types.ts`의 `Specialty` 정의 아래에 추가:

```ts
/** 세계 지역 3계층 — 수도권 / 광역시 / 지방. world.ts의 지역 시뮬과 콜의 발신 지역이 공유한다. */
export type RegionKey = 'CAPITAL' | 'METRO' | 'RURAL'
```

`world.ts` — import에 `Specialty`·`RegionKey`(types)와 `ROUND_THE_CLOCK_MIN_DOCTORS`(setup)를 추가하고:

```ts
/** 지역 하나 — 개체가 아니라 집계. doctors는 그 지역 병원들에서 일하는 필수과 의사 수. */
export interface RegionState {
  key: RegionKey
  doctors: Record<Specialty, number>
  hospitals: number // 응급 수용 병원 수 — 드리프트로는 안 변하고 이벤트로만 변동
}

export interface WorldState {
  departments: DepartmentSpec[]
  regions: RegionState[] // 항상 3개, CAPITAL·METRO·RURAL 순
}

/**
 * 지역 초기값(각색) — 대소만 근거(수도권 집중, 흉부 희소).
 * 🔴 불변식(world.test.ts가 가드): ① 과별로 RURAL < CAPITAL ② RURAL 배후 ≥ 1
 * ③ METRO+RURAL 합 = 기존 POOL_INITIAL(2/4/3/3/5/6) — 채용 풀이 이 합의 파생이 되므로(Task 5)
 * 이 합이 틀어지면 기존 채용 밸런스가 통째로 흔들린다.
 */
export const REGION_INITIAL: RegionState[] = [
  { key: 'CAPITAL', hospitals: 8, doctors: {
    THORACIC_SURGERY: 3, CARDIOLOGY: 5, OBSTETRICS: 4,
    NEUROSURGERY: 4, GENERAL_SURGERY: 5, INTERNAL_MEDICINE: 6 } },
  { key: 'METRO', hospitals: 3, doctors: {
    THORACIC_SURGERY: 0, CARDIOLOGY: 2, OBSTETRICS: 1,
    NEUROSURGERY: 1, GENERAL_SURGERY: 3, INTERNAL_MEDICINE: 3 } },
  { key: 'RURAL', hospitals: 2, doctors: {
    THORACIC_SURGERY: 2, CARDIOLOGY: 2, OBSTETRICS: 2,
    NEUROSURGERY: 2, GENERAL_SURGERY: 2, INTERNAL_MEDICINE: 3 } },
]

export function regionOf(world: WorldState, key: RegionKey): RegionState {
  const found = world.regions.find((r) => r.key === key)
  if (!found) throw new Error(`region not found: ${key}`)
  return found
}

/**
 * 그 지역에서 그 과의 배후진료가 서 있는 병원 수 — **저장하지 않는 파생값**.
 * 배후 병원 하나가 서려면 그 과 의사 2명(ROUND_THE_CLOCK_MIN_DOCTORS) — 플레이어 병원과 같은 규칙을
 * 세계에도 적용한다. 세계의 병원들도 우리처럼 "1명으론 당직이 안 돈다".
 */
export function backupHospitals(region: RegionState, s: Specialty): number {
  return Math.min(region.hospitals, Math.floor(region.doctors[s] / ROUND_THE_CLOCK_MIN_DOCTORS))
}
```

그리고 `initWorld`를 확장:

```ts
/** 기본 세계 — 손대지 않은 DEPARTMENTS·REGION_INITIAL 복제본. */
export function initWorld(): WorldState {
  return {
    departments: DEPARTMENTS.map((d) => ({ ...d })),
    regions: REGION_INITIAL.map((r) => ({ ...r, doctors: { ...r.doctors } })),
  }
}
```

`applyEvent`의 반환이 `{ ...world, departments }`라 regions는 자동으로 실려 간다(이 태스크에선 무변경).

- [x] **Step 4: 통과 확인**

Run: `npx vitest run src/game/world.test.ts`
Expected: PASS (기존 world 테스트 포함 전부).

- [x] **Step 5: 전체 회귀 + 커밋**

Run: `npx vitest run` → 전부 PASS 확인 후:

```bash
git add src/game/types.ts src/game/world.ts src/game/world.test.ts
# .commit-msg-tmp에 작성 후: git commit -F .commit-msg-tmp
# 제목 예: "feat: 세계에 지역 3계층 — RegionState·REGION_INITIAL·배후 파생"
```

---

### Task 2: 드리프트 엔진 — `stepWorld`

**Files:**
- Modify: `src/game/world.ts`
- Test: `src/game/world.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
import { stepWorld } from './world' // 기존 import 줄에 합치기

describe('stepWorld — 주간 드리프트 (spec §3)', () => {
  it('결정론: 같은 (world, week)는 항상 같은 결과', () => {
    expect(stepWorld(initWorld(), 3)).toEqual(stepWorld(initWorld(), 3))
  })

  it('매주 RURAL에서 1~2명이 떠나고, 떠난 만큼 CAPITAL이 받는다(전국 총원 보존)', () => {
    const before = initWorld()
    const after = stepWorld(before, 2)
    const total = (w: ReturnType<typeof initWorld>, key: 'CAPITAL' | 'METRO' | 'RURAL') =>
      SPECIALTIES.reduce((n, s) => n + regionOf(w, key).doctors[s], 0)
    const ruralLoss = total(before, 'RURAL') - total(after, 'RURAL')
    expect(ruralLoss).toBeGreaterThanOrEqual(1)
    expect(ruralLoss).toBeLessThanOrEqual(2)
    expect(total(after, 'CAPITAL') - total(before, 'CAPITAL')).toBe(ruralLoss)
    expect(total(after, 'METRO')).toBe(total(before, 'METRO'))
  })

  it('의사 수는 0 밑으로 내려가지 않고, hospitals는 드리프트로 변하지 않는다', () => {
    // RURAL을 다 비울 만큼 여러 주 굴려도 음수·hospitals 변동이 없다
    let world = initWorld()
    for (let week = 2; week <= 30; week++) world = stepWorld(world, week)
    const rural = regionOf(world, 'RURAL')
    for (const s of SPECIALTIES) expect(rural.doctors[s]).toBeGreaterThanOrEqual(0)
    expect(rural.hospitals).toBe(2)
    expect(regionOf(world, 'CAPITAL').hospitals).toBe(8)
  })

  // ⚠️ 총량 비교는 공허하다 — 과당 손실률로 정규화하고 창은 고갈 전(2..6)으로 잡는다(Step 4 참고).
  it('lawsuitRisk 과가 지방을 먼저 떠난다 — 과당 손실률이 안전과보다 높다 (가중 3배)', () => {
    let world = initWorld()
    for (let week = 2; week <= 6; week++) world = stepWorld(world, week)
    const before = regionOf(initWorld(), 'RURAL')
    const after = regionOf(world, 'RURAL')
    const risky = initWorld().departments.filter((d) => d.providesBackup && d.lawsuitRisk).map((d) => d.providesBackup!)
    const safe = initWorld().departments.filter((d) => d.providesBackup && !d.lawsuitRisk).map((d) => d.providesBackup!)
    const lossOf = (ss: Specialty[]) => ss.reduce((n, s) => n + before.doctors[s] - after.doctors[s], 0)
    expect(lossOf(risky) / risky.length).toBeGreaterThan(lossOf(safe) / safe.length)
  })

  it('RURAL이 완전히 비면 stepWorld는 세계를 그대로 반환한다', () => {
    const world = initWorld()
    const emptied = {
      ...world,
      regions: world.regions.map((r) => r.key !== 'RURAL' ? r : {
        ...r, doctors: { THORACIC_SURGERY: 0, CARDIOLOGY: 0, OBSTETRICS: 0,
          NEUROSURGERY: 0, GENERAL_SURGERY: 0, INTERNAL_MEDICINE: 0 } }),
    }
    expect(stepWorld(emptied, 5)).toEqual(emptied)
  })
})
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run src/game/world.test.ts`
Expected: FAIL — `stepWorld` export 없음.

- [x] **Step 3: 구현** — `world.ts`에 추가 (import에 `seededUnit`·`callSeed`를 `./daysim`에서 추가):

```ts
/** 지역 간 1명 이동 — 불변 갱신. from에서 빼고 to에 더한다(0 하한). */
function moveDoctor(world: WorldState, s: Specialty, from: RegionKey, to: RegionKey): WorldState {
  const regions = world.regions.map((r) => {
    if (r.key === from) return { ...r, doctors: { ...r.doctors, [s]: Math.max(0, r.doctors[s] - 1) } }
    if (r.key === to) return { ...r, doctors: { ...r.doctors, [s]: r.doctors[s] + 1 } }
    return r
  })
  return { ...world, regions }
}

/** RURAL에 남은 과 중 하나를 lawsuitRisk 가중(3배) 시드 추첨으로 골라 CAPITAL로 옮긴다. 없으면 null. */
function driftOnce(world: WorldState, week: number, salt: number): WorldState | null {
  const rural = regionOf(world, 'RURAL')
  const weighted: Specialty[] = []
  for (const d of world.departments) {
    if (!d.providesBackup) continue // 수익과는 지역 시뮬 밖
    if (rural.doctors[d.providesBackup] <= 0) continue
    const w = d.lawsuitRisk ? 3 : 1
    for (let i = 0; i < w; i++) weighted.push(d.providesBackup)
  }
  if (weighted.length === 0) return null
  const pick = weighted[Math.floor(seededUnit(callSeed(week, 0, 0, salt)) * weighted.length)]
  return moveDoctor(world, pick, 'RURAL', 'CAPITAL')
}

/**
 * 주간 드리프트 — 매주 지방 이탈 1명(+시드 30%로 1명 추가), lawsuitRisk 과 가중 3배.
 * 의사는 줄어도 환자 발생(응급 콜 수)은 안 준다 — 격차가 스스로 벌어진다("필연"의 수학적 형태).
 * hospitals는 여기서 안 변한다(이벤트 전용). 순수·결정론(week 시드).
 */
export function stepWorld(world: WorldState, week: number): WorldState {
  const first = driftOnce(world, week, 11)
  if (!first) return world
  const extra = seededUnit(callSeed(week, 0, 1, 11)) < 0.3
  if (!extra) return first
  return driftOnce(first, week, 12) ?? first
}
```

- [x] **Step 4: 통과 확인**

Run: `npx vitest run src/game/world.test.ts`
Expected: PASS.

⚠️ **lawsuitRisk 가중 테스트는 "루프 주차를 늘려 재확인"하면 안 된다.** 결정론이라 "시드 우연"은 애초에 없고(같은 world·week면 항상 같은 결과), 창을 넓히면 판별력이 **더** 떨어진다. 이 테스트는 **손실 총량을 비교하면 무엇을 해도 공허하다** — 교란요인이 둘이다(실측 2026-07-26):

1. **집단 크기**: 위험과가 5개(내과만 안전)라 균등 추첨이어도 손실이 5배로 쏠린다. `risky=5 / safe=1`도 `5 > 1`로 통과한다 — 가중이 아니라 과 개수를 재고 있다.
2. **고갈**: RURAL 총원 13명이 9주차에 전멸해, 그 뒤 누적 손실은 가중치와 무관하게 초기 인구(위험과 10 / 내과 3)로 수렴한다.

| 창 | 가중 3 | 가중 1 | 판별 |
|---|---|---|---|
| 2..4 총량 | 6 vs 0 | 5 vs 1 | ✗ 둘 다 통과 |
| 2..6 총량 | 8 vs 1 | 7 vs 2 | ✗ 둘 다 통과 |
| 2..9 총량 | 10 vs 3 | 10 vs 3 | ✗ 수치까지 동일 |
| **2..6 과당** | **1.6 vs 1** | **1.4 vs 2** | **✓ 깨진다** |

→ **과당 손실률로 정규화한다**(`lossOf(x) / x.length`). driftOnce가 가중치를 *의사 1명당*이 아니라 *과 1개당* 밀어넣으므로 과당 비율이 그 가중치를 분리하는 정확한 척도다. 창은 `2..6` — 고갈 전이면서 양방향 여유가 있다(`2..4`는 가중 1에서 1.00 vs 1.00 간발).

**통과했으면 판별력을 반드시 확인한다**: 가중치를 임시로 1(`d.lawsuitRisk ? 1 : 1`)로 바꿔 이 테스트가 **실제로 깨지는지** 보고 되돌린다. 안 깨지면 척도가 틀린 것이니 정규화를 고친다 — 창을 넓히지 않는다.

- [x] **Step 5: 커밋**

```bash
git add src/game/world.ts src/game/world.test.ts
# 제목 예: "feat: stepWorld 주간 드리프트 — lawsuitRisk 가중 지방 이탈"
```

---

### Task 3: 이벤트 쇼크 — `RegionEffect`

**Files:**
- Modify: `src/game/world.ts`
- Test: `src/game/world.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
describe('RegionEffect — 이벤트가 지역 수치를 흔든다 (spec §4)', () => {
  it('LITIGATION_CHILL은 RURAL 산부인과 의사를 1 줄인다 (배상 판결 → 지방 이탈)', () => {
    const event = EVENT_CATALOG.find((e) => e.id === 'LITIGATION_CHILL')!
    const before = initWorld()
    const after = applyEvent(before, event)
    expect(regionOf(after, 'RURAL').doctors.OBSTETRICS)
      .toBe(regionOf(before, 'RURAL').doctors.OBSTETRICS - 1)
    // 기존 효과(순환기 채용비 +3000)도 그대로 동작
    expect(after.departments.find((d) => d.key === 'CARDIOLOGY')!.hireCostManwon)
      .toBe(before.departments.find((d) => d.key === 'CARDIOLOGY')!.hireCostManwon + 3_000)
  })

  it('regionEffects 없는 이벤트는 regions를 건드리지 않는다', () => {
    const before = initWorld()
    const after = applyEvent(before, selectEvent(0)) // OB_PEDS_POLICY_FEE — dept 효과만
    expect(after.regions).toEqual(before.regions)
  })

  it('의사·병원 수는 델타로 0 밑으로 내려가지 않는다(클램프)', () => {
    const world = initWorld()
    const shock = { id: 'X', headline: 'x', direction: 'worsen' as const, effects: [], briefing: [],
      regionEffects: [{ region: 'RURAL' as const, field: 'doctors' as const, dept: 'THORACIC_SURGERY' as const, delta: -99 }] }
    expect(regionOf(applyEvent(world, shock), 'RURAL').doctors.THORACIC_SURGERY).toBe(0)
  })

  it('applyEvent는 입력 world를 변이하지 않는다(불변)', () => {
    const world = initWorld()
    const snapshot = JSON.parse(JSON.stringify(world))
    applyEvent(world, EVENT_CATALOG.find((e) => e.id === 'LITIGATION_CHILL')!)
    expect(world).toEqual(snapshot)
  })
})
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run src/game/world.test.ts`
Expected: FAIL — `regionEffects` 미지원(LITIGATION_CHILL 테스트에서 산부 수 불변).

- [x] **Step 3: 구현** — `world.ts`:

```ts
/**
 * 이벤트의 지역 델타 — field 유니온이 헌법이다: 이벤트는 지역의 '수치'만 만질 수 있고
 * providesBackup·판정 경로는 표현 자체가 불가능하다(DeptEffect와 같은 잠금 방식).
 */
export interface RegionEffect {
  region: RegionKey
  field: 'doctors' | 'hospitals'
  dept?: Specialty // field === 'doctors'일 때 필수
  delta: number
}
```

`WorldEvent`에 필드 추가:

```ts
export interface WorldEvent {
  id: string
  headline: string
  direction: 'improve' | 'worsen'
  effects: DeptEffect[]
  regionEffects?: RegionEffect[] // 지역 수치 델타 — 없으면 지역 무변경
  briefing: string[]
}
```

`applyEvent`를 확장(기존 departments 로직 유지, regions 처리 추가):

```ts
export function applyEvent(world: WorldState, event: WorldEvent): WorldState {
  const departments = world.departments.map((dept) => {
    const effects = event.effects.filter((e) => e.dept === dept.key)
    if (effects.length === 0) return dept
    const next = { ...dept }
    for (const e of effects) {
      next[e.field] = next[e.field] + e.delta
    }
    return next
  })
  const regions = world.regions.map((region) => {
    const effects = (event.regionEffects ?? []).filter((e) => e.region === region.key)
    if (effects.length === 0) return region
    let next = { ...region, doctors: { ...region.doctors } }
    for (const e of effects) {
      if (e.field === 'hospitals') next.hospitals = Math.max(0, next.hospitals + e.delta)
      else if (e.dept) next.doctors[e.dept] = Math.max(0, next.doctors[e.dept] + e.delta)
    }
    return next
  })
  return { ...world, departments, regions }
}
```

`EVENT_CATALOG`의 `LITIGATION_CHILL`에 지역 효과를 붙인다(카탈로그 길이 불변 — `selectEvent((week-1)%N)` 순환이 안 흔들린다):

```ts
  {
    id: 'LITIGATION_CHILL',
    headline: '의료분쟁 고액 배상 판결 잇따라 — 필수과 인력 확보 비용 상승',
    direction: 'worsen',
    effects: [{ dept: 'CARDIOLOGY', field: 'hireCostManwon', delta: 3_000 }], // 15,000 → 18,000 (+20%)
    regionEffects: [{ region: 'RURAL', field: 'doctors', dept: 'OBSTETRICS', delta: -1 }], // 배상 공포 → 지방 산부 이탈
    briefing: [
      '고액 배상 판결 잇따라 — 필수과 전문의 채용 시장 경색',
      '배후진료 인력 확보 비용 상승',
    ],
  },
```

파일 상단(4~9행) 주석의 "세계 = 채용 경제뿐"을 갱신한다: 세계 = 채용 경제 + 지역 3계층, 헌법(판정 불가침)은 동일.

- [x] **Step 4: 통과 확인 + 커밋**

Run: `npx vitest run src/game/world.test.ts` → PASS 후:

```bash
git add src/game/world.ts src/game/world.test.ts
# 제목 예: "feat: RegionEffect 이벤트 쇼크 — 지역 수치 델타(판정 불가침 유지)"
```

---

### Task 4: 번역기 — `transferPressure` + `REGION_LABELS`

**Files:**
- Modify: `src/game/world.ts`
- Test: `src/game/world.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
import { transferPressure, REGION_LABELS } from './world' // 기존 import 줄에 합치기

describe('transferPressure — 세계 → 콜 구성 번역 (spec §5)', () => {
  it('초기 세계의 압력은 0', () => {
    expect(transferPressure(initWorld())).toBe(0)
  })

  it('RURAL 배후가 무너질수록 압력이 단조 증가하고 1을 넘지 않는다', () => {
    let world = initWorld()
    let prev = transferPressure(world)
    for (let week = 2; week <= 30; week++) {
      world = stepWorld(world, week)
      const p = transferPressure(world)
      expect(p).toBeGreaterThanOrEqual(prev)
      expect(p).toBeLessThanOrEqual(1)
      prev = p
    }
    expect(prev).toBeGreaterThan(0) // 30주면 반드시 올라 있다
  })

  it('REGION_LABELS는 세 지역 모두 1개 이상의 가공 지명을 갖는다', () => {
    for (const key of ['CAPITAL', 'METRO', 'RURAL'] as const) {
      expect(REGION_LABELS[key].length).toBeGreaterThanOrEqual(1)
    }
  })
})
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run src/game/world.test.ts`
Expected: FAIL — export 없음.

- [x] **Step 3: 구현** — `world.ts`:

```ts
/** RURAL 배후 총량(필수과별 배후 병원 수의 합) — transferPressure의 분모·분자. */
function ruralBackupTotal(regions: RegionState[]): number {
  const rural = regions.find((r) => r.key === 'RURAL')!
  return (Object.keys(rural.doctors) as Specialty[])
    .reduce((n, s) => n + Math.min(rural.hospitals, Math.floor(rural.doctors[s] / ROUND_THE_CLOCK_MIN_DOCTORS)), 0)
}

/**
 * 전원 압력 0..1 — 지방 배후가 초기 대비 얼마나 무너졌나.
 * 0 = 온전(초기), 1 = 전멸. receiving.createCallQueue의 3번째 인자로 들어가
 * 원거리(RURAL발) 응급 전원 비중을 끌어올린다. 판정에는 안 들어간다.
 */
export function transferPressure(world: WorldState): number {
  const initial = ruralBackupTotal(REGION_INITIAL)
  if (initial <= 0) return 0
  const now = ruralBackupTotal(world.regions)
  return Math.min(1, Math.max(0, 1 - now / initial))
}

/** 발신 지역 표시용 가공 지명 — 실존 지명·실사건 토큰 금지(news.ts FICTIONAL_REGIONS와 같은 원칙). */
export const REGION_LABELS: Record<RegionKey, readonly string[]> = {
  CAPITAL: ['서흥구', '남정구'],
  METRO: ['한내시', '금하시'],
  RURAL: ['먼내군', '두밀군', '자운군'],
}
```

주의: `backupHospitals(region, s)`와 `ruralBackupTotal`이 같은 식을 쓴다 — `ruralBackupTotal` 내부에서 `backupHospitals`를 호출해 식을 한 곳에 둔다:

```ts
    .reduce((n, s) => n + backupHospitals(rural, s), 0)
```

- [x] **Step 4: 통과 확인 + 커밋**

Run: `npx vitest run src/game/world.test.ts` → PASS 후:

```bash
git add src/game/world.ts src/game/world.test.ts
# 제목 예: "feat: transferPressure — 지방 배후 붕괴를 콜 압력 0..1로 번역"
```

---

### Task 5: 채용 풀 승격 — pool = 세계의 파생값

**Files:**
- Modify: `src/game/system.ts`
- Modify: `src/game/world.ts` (`hireFromRegions`)
- Test: `src/game/system.test.ts`, `src/game/world.test.ts`

- [x] **Step 1: 실패하는 테스트 작성** — `system.test.ts`에 추가:

```ts
import { initSystem, canHire, poolRemaining, POOL_INITIAL, hirablePool, deriveSystem } from './system'
import { initWorld, stepWorld, regionOf, hireFromRegions } from './world'

describe('채용 풀 = 세계의 파생 (spec §6)', () => {
  it('POOL_INITIAL은 초기 세계의 METRO+RURAL 합에서 파생된다 — 값은 기존(2/4/3/3/5/6) 그대로', () => {
    expect(POOL_INITIAL).toEqual({
      THORACIC_SURGERY: 2, CARDIOLOGY: 4, OBSTETRICS: 3,
      NEUROSURGERY: 3, GENERAL_SURGERY: 5, INTERNAL_MEDICINE: 6,
    })
    expect(hirablePool(initWorld().regions)).toEqual(POOL_INITIAL)
  })

  it('deriveSystem: 드리프트로 지방 의사가 빠지면 채용 풀도 그만큼 준다 — 수도권 정착 의사는 안 온다', () => {
    const drifted = stepWorld(initWorld(), 2)
    const system = deriveSystem(drifted)
    const total = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0)
    expect(total(system.pool)).toBeLessThan(total(POOL_INITIAL))
    expect(system.poolInitial).toEqual(POOL_INITIAL) // 표시용 초기 사본은 불변
  })
})

describe('hireFromRegions — 채용이 세계에서 사람을 빼간다', () => {
  it('1명 채용하면 METRO 또는 RURAL에서 정확히 1명 준다(CAPITAL 불변)', () => {
    const before = initWorld()
    const after = hireFromRegions(before, { CARDIOLOGY: 1 }, 2)
    const loss = (key: 'CAPITAL' | 'METRO' | 'RURAL') =>
      regionOf(before, key).doctors.CARDIOLOGY - regionOf(after, key).doctors.CARDIOLOGY
    expect(loss('CAPITAL')).toBe(0)
    expect(loss('METRO') + loss('RURAL')).toBe(1)
  })

  it('결정론: 같은 입력은 같은 결과', () => {
    expect(hireFromRegions(initWorld(), { OBSTETRICS: 2 }, 3))
      .toEqual(hireFromRegions(initWorld(), { OBSTETRICS: 2 }, 3))
  })

  it('풀이 빈 과의 채용 요청은 세계를 안 바꾼다(음수 없음)', () => {
    const world = initWorld()
    const after = hireFromRegions(world, { THORACIC_SURGERY: 99 }, 2)
    // 흉부는 METRO 0 + RURAL 2 — 2명까지만 빠지고 그 이상은 무시
    expect(regionOf(after, 'METRO').doctors.THORACIC_SURGERY).toBe(0)
    expect(regionOf(after, 'RURAL').doctors.THORACIC_SURGERY).toBe(0)
  })
})
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run src/game/system.test.ts`
Expected: FAIL — `hirablePool`/`deriveSystem`/`hireFromRegions` 없음.

- [x] **Step 3: 구현** — 먼저 `world.ts`에 채용 차감을 추가:

```ts
/** 한 지역에서 1명 차감(0 하한) — 채용 전용(목적지 없음: 우리 병원 명단으로 간다). */
function removeDoctor(world: WorldState, s: Specialty, from: RegionKey): WorldState {
  const regions = world.regions.map((r) =>
    r.key === from ? { ...r, doctors: { ...r.doctors, [s]: Math.max(0, r.doctors[s] - 1) } } : r,
  )
  return { ...world, regions }
}

/**
 * 성장 채용이 세계에서 사람을 빼간다 — METRO·RURAL 중 남은 수 비례 시드 추첨(수도권 정착 의사는 안 온다).
 * 내 채용이 지방·광역시의 배후를 실제로 줄인다 — 구조적 아이러니가 여기서 물리적으로 성립한다.
 */
export function hireFromRegions(
  world: WorldState, deltas: Partial<Record<Specialty, number>>, week: number,
): WorldState {
  let next = world
  for (const s of Object.keys(deltas) as Specialty[]) {
    const n = deltas[s] ?? 0
    for (let i = 0; i < n; i++) {
      const metro = regionOf(next, 'METRO').doctors[s]
      const rural = regionOf(next, 'RURAL').doctors[s]
      if (metro + rural <= 0) break
      const pickMetro = metro > 0
        && (rural <= 0 || seededUnit(callSeed(week, 1, i, 13)) < metro / (metro + rural))
      next = removeDoctor(next, s, pickMetro ? 'METRO' : 'RURAL')
    }
  }
  return next
}
```

`system.ts`를 재작성한다 — `backgroundAttrition`·`hireDelta`를 **삭제**하고 파생 함수로 대체:

```ts
import type { Specialty } from './types'
import { REGION_INITIAL, type RegionState, type WorldState } from './world'

// 전국 채용 가능 풀 — 이제 세계(world.regions)의 파생값이다. 순수·결정론.
// 채용 가능 = METRO + RURAL 의사 합. 수도권(CAPITAL)에 정착한 의사는 지방 병원에 안 온다.
// 매주 드리프트(stepWorld)가 RURAL→CAPITAL로 옮길 때마다 이 풀이 준다 —
// 옛 backgroundAttrition(매주 시드로 1 차감)이 하던 일을 세계 시뮬이 흡수했다(spec 2026-07-26 §3·§6).

export interface SystemState {
  pool: Record<Specialty, number>
  poolInitial: Record<Specialty, number> // 표시용 초기 사본(에필로그 "N → 잔여")
}

/** 채용 가능 풀 = METRO+RURAL 의사 합 — 저장하지 않는 파생값. */
export function hirablePool(regions: RegionState[]): Record<Specialty, number> {
  const metro = regions.find((r) => r.key === 'METRO')!
  const rural = regions.find((r) => r.key === 'RURAL')!
  const out = {} as Record<Specialty, number>
  for (const s of Object.keys(metro.doctors) as Specialty[]) {
    out[s] = metro.doctors[s] + rural.doctors[s]
  }
  return out
}

/** 세상에 존재하는 과별 채용 가능 의사 수 — REGION_INITIAL의 파생(단일 출처, 이중 기재 방지). */
export const POOL_INITIAL: Record<Specialty, number> = hirablePool(REGION_INITIAL)

export function initSystem(): SystemState {
  return { pool: { ...POOL_INITIAL }, poolInitial: { ...POOL_INITIAL } }
}

/** 세계에서 풀 스냅샷을 재파생 — 세계가 변한 모든 지점(nextWeek·applyGrowth) 직후 호출한다. */
export function deriveSystem(world: WorldState, poolInitial: Record<Specialty, number> = POOL_INITIAL): SystemState {
  return { pool: hirablePool(world.regions), poolInitial: { ...poolInitial } }
}

export function poolRemaining(system: SystemState, s: Specialty): number {
  return system.pool[s]
}

export function canHire(system: SystemState, s: Specialty, count: number): boolean {
  return system.pool[s] >= count
}
```

⚠️ `session.ts`가 아직 `backgroundAttrition`·`hireDelta`를 import한다 — 이 시점엔 컴파일이 깨진다. **Task 6에서 배선을 바꾸기 전까지 커밋하지 않는다**(Task 5·6은 한 커밋으로 묶는다). Step 4의 확인은 `system.test.ts`·`world.test.ts`만 돌린다.

- [x] **Step 4: 두 테스트 파일 통과 확인**

Run: `npx vitest run src/game/system.test.ts src/game/world.test.ts`
Expected: 새 테스트 PASS. 기존 `system.test.ts`의 `backgroundAttrition`·`hireDelta` 테스트는 컴파일 실패 — **해당 테스트 블록을 삭제**한다(기능 자체가 세계 시뮬로 흡수·대체됐다). `POOL_INITIAL` 값 검증 테스트는 값이 같으므로 그대로 통과해야 한다.

---

### Task 6: 상태기계 배선 — `session.ts`

**Files:**
- Modify: `src/game/session.ts`
- Test: `src/game/session.test.ts`

- [x] **Step 1: 실패하는 테스트 작성** — `session.test.ts`에 추가. 기존 헬퍼를 그대로 쓴다: `runWeek(choices, accept)`가 1주차를 완주해 7일차 DAY_END를 돌려주고, `finishWeek(...)`이 `completeWeek`으로 WEEK_SUMMARY를 만든다. 픽스처 `conscientious`(순환기 포함 개원 선택)와 정책 `essentialFirst`도 파일 상단에 이미 있다 — 실제 이름이 다르면 파일 상단에서 확인해 맞춘다.

```ts
import { initWorld, transferPressure, regionOf, type WorldState } from './world'
import { hirablePool } from './system'
import type { Specialty } from './types'

const SPECIALTIES: Specialty[] = [
  'THORACIC_SURGERY', 'CARDIOLOGY', 'OBSTETRICS', 'NEUROSURGERY', 'GENERAL_SURGERY', 'INTERNAL_MEDICINE',
]
const ruralTotal = (w: WorldState) =>
  SPECIALTIES.reduce((n, s) => n + regionOf(w, 'RURAL').doctors[s], 0)

describe('세계 시뮬 배선 (spec §7)', () => {
  it('nextWeek: 드리프트가 적용되고, system.pool ≡ hirablePool(world.regions) 일관성 불변식이 선다', () => {
    const summary = finishWeek(runWeek(conscientious, essentialFirst))
    const next = nextWeek(summary)
    expect(next.system.pool).toEqual(hirablePool(next.world!.regions)) // 🔴 일관성 불변식
    expect(ruralTotal(next.world!)).toBeLessThan(ruralTotal(summary.world!)) // 드리프트 1~2명
  })

  it('applyGrowth: 배후과 채용이 world.regions에서 차감되고 pool 일관성이 유지된다', () => {
    const growth = enterGrowth(nextWeek(finishWeek(runWeek(conscientious, essentialFirst))))
    const next: SetupChoices = { ...growth.choices,
      doctors: { ...growth.choices.doctors, CARDIOLOGY: (growth.choices.doctors.CARDIOLOGY ?? 0) + 1 } }
    const grown = applyGrowth(growth, next, growth.beds)
    expect(grown.system.pool).toEqual(hirablePool(grown.world!.regions))
    expect(grown.system.pool.CARDIOLOGY).toBe(growth.system.pool.CARDIOLOGY - 1)
  })

  it('주가 갈수록 transferPressure가 내려가지 않는다(단조)', () => {
    let s = finishWeek(runWeek(conscientious, essentialFirst))
    let prev = transferPressure(s.world!)
    for (let i = 0; i < 3; i++) {
      s = finishWeek(runWeekFrom(beginWeek(enterGrowth(nextWeek(s))), essentialFirst))
      const p = transferPressure(s.world!)
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })

  it('1주차(enterWorldEvent)는 드리프트를 밟지 않는다 — 초기 세계 = 1주차 세계 (spec §7)', () => {
    const state = enterWorldEvent(startSession())
    expect(regionOf(state.world!, 'RURAL').doctors).toEqual(regionOf(initWorld(), 'RURAL').doctors)
  })
})
```

(applyGrowth 테스트에서 금고가 모자라면 `treasury`를 직접 불려 상태를 만든다: `{ ...growth, treasury: 100_000 }` — 기존 세션 테스트들이 쓰는 방식이다.)

- [x] **Step 2: 실패 확인**

Run: `npx vitest run src/game/session.test.ts`
Expected: FAIL (컴파일 에러 — session.ts가 아직 옛 import를 쓴다).

- [x] **Step 3: 구현** — `session.ts` 변경 4곳 (⚠️ 콜 큐에 pressure를 넘기는 `weekDayQueue` 배선은 **Task 7**이다 — `createCallQueue`의 3번째 인자가 거기서 생기므로 여기서 먼저 넘기면 컴파일이 깨진다):

① import 교체:

```ts
import { initWorld, applyEvent, selectEvent, stepWorld, hireFromRegions,
  EVENT_CATALOG, OPENING_EVENT, type WorldState, type WorldEvent } from './world'
import { initSystem, deriveSystem, canHire, type SystemState } from './system'
```

② `completeSetup`의 `system: initSystem()`을 `system: deriveSystem(world)`로 교체 — 개원 세계에 지역 쇼크가 생겨도 풀이 어긋나지 않게 원천을 통일한다(현재 OPENING_EVENT는 regionEffects가 없어 값은 동일하다).

③ `nextWeek` — 드리프트 → 이벤트 → 파생 순서:

```ts
export function nextWeek(state: SessionState): SessionState {
  if (state.phase !== 'WEEK_SUMMARY') {
    throw new Error(`nextWeek requires WEEK_SUMMARY, got ${state.phase}`)
  }
  if (isInsolvent(state)) {
    throw new Error('nextWeek: 폐업 상태에서는 다음 주로 갈 수 없다 (강제 에필로그)')
  }
  const week = state.week + 1
  const event = selectEvent((week - 1) % EVENT_CATALOG.length)
  // 드리프트(구조적 필연) 먼저, 이벤트 쇼크(주차별 리듬)를 그 위에 — spec §7
  const world = applyEvent(stepWorld(state.world ?? initWorld(), week), event)
  return {
    ...state,
    phase: 'WORLD_EVENT',
    week,
    world,
    event,
    day: 1,
    ledgerDays: [],
    receiving: undefined,
    morningNews: [],
    system: deriveSystem(world, state.system.poolInitial), // backgroundAttrition을 대체
  }
}
```

④ `applyGrowth` — 채용이 세계에서 차감:

```ts
export function applyGrowth(state: SessionState, next: SetupChoices, nextBeds: number): SessionState {
  if (state.phase !== 'GROWTH') throw new Error(`applyGrowth requires GROWTH, got ${state.phase}`)
  const deps = state.world?.departments
  const cost = growthCostOf(state, next, nextBeds)
  const { hospital } = buildHospital(next, deps, nextBeds)
  const world = hireFromRegions(state.world ?? initWorld(), backupDeltas(state, next), state.week)
  return {
    ...state,
    hospital,
    choices: next,
    beds: nextBeds,
    treasury: state.treasury - cost,
    world,
    system: deriveSystem(world, state.system.poolInitial),
  }
}
```

- [x] **Step 4: 통과 확인**

Run: `npx vitest run src/game/session.test.ts src/game/system.test.ts src/game/world.test.ts`
Expected: PASS. ⚠️ 기존 세션 테스트 중 "매주 풀이 1 준다"(backgroundAttrition 전제) 류가 있으면 드리프트 전제(1~2명, METRO+RURAL 합 기준)로 기대값을 고친다 — 수치가 아니라 **방향(단조 감소)** 검증으로 바꾸는 것을 권장.

- [x] **Step 5: 전체 회귀 + 커밋 (Task 5+6 묶음)**

Run: `npx vitest run` → 전부 PASS. `npx tsc --noEmit`도 확인.

```bash
git add src/game/world.ts src/game/system.ts src/game/session.ts src/game/system.test.ts src/game/session.test.ts src/game/world.test.ts
# 제목 예: "feat: 채용 풀을 세계 파생으로 승격 — 드리프트·채용이 지역에서 차감"
```

---

### Task 7: 콜 구성 채널 — `createCallQueue`의 발신 지역 + 세션 큐 배선

**Files:**
- Modify: `src/game/types.ts` (`IncomingCall`)
- Modify: `src/game/receiving.ts`
- Modify: `src/game/session.ts` (`weekDayQueue`)
- Test: `src/game/receiving.test.ts`, `src/game/session.test.ts`

- [x] **Step 1: 실패하는 테스트 작성** — `receiving.test.ts`에 추가:

```ts
import { requiresBackupCare } from './receiving' // 이미 import돼 있으면 생략

describe('콜 발신 지역 — 세계가 콜 구성에 닿는다 (spec §5)', () => {
  it('응급 콜에만 originRegion·originLabel이 붙고 외래(워크인·예약)에는 없다', () => {
    const queue = createCallQueue(1, 3, 0)
    for (const call of queue) {
      if (requiresBackupCare(call.kind)) {
        expect(call.originRegion).toBeDefined()
        expect(call.originLabel).toBeTruthy()
      } else {
        expect(call.originRegion).toBeUndefined()
      }
    }
  })

  it('결정론: 같은 (day, beds, pressure)는 같은 큐', () => {
    expect(createCallQueue(4, 5, 0.5)).toEqual(createCallQueue(4, 5, 0.5))
  })

  it('pressure가 오르면 RURAL발 응급 수가 줄지 않는다(콜별 단조) — 총 응급 수는 불변', () => {
    for (let day = 1; day <= 7; day++) {
      const low = createCallQueue(day, 3, 0)
      const high = createCallQueue(day, 3, 1)
      const ruralCount = (q: ReturnType<typeof createCallQueue>) =>
        q.filter((c) => c.originRegion === 'RURAL').length
      const emergencyCount = (q: ReturnType<typeof createCallQueue>) =>
        q.filter((c) => requiresBackupCare(c.kind)).length
      expect(ruralCount(high)).toBeGreaterThanOrEqual(ruralCount(low))
      expect(emergencyCount(high)).toBe(emergencyCount(low)) // 🔴 응급 총수 고정(기존 밸런스 결정)
    }
  })

  it('RURAL발 응급은 중증도가 1 높다(5 상한) — 멀리서 올수록 나쁜 상태로 온다', () => {
    const queue = createCallQueue(5, 3, 1) // pressure 최대면 RURAL발이 존재할 확률이 높다
    const rural = queue.find((c) => c.originRegion === 'RURAL' && requiresBackupCare(c.kind))
    const other = createCallQueue(5, 3, 0).find(
      (c) => c.kind === rural?.kind && c.originRegion !== 'RURAL')
    if (rural && other) {
      expect(rural.patient.severity).toBe(Math.min(5, other.patient.severity + 1))
    }
    expect(queue.some((c) => c.originRegion === 'RURAL')).toBe(true) // pressure 1이면 반드시 존재
  })

  it('pressure 없이 부르면(기존 시그니처) 이전과 동일하게 동작한다 — 하위호환', () => {
    expect(createCallQueue(1, 3)).toEqual(createCallQueue(1, 3, 0))
  })
})
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run src/game/receiving.test.ts`
Expected: FAIL — `originRegion` 없음.

- [x] **Step 3: 구현** — `types.ts`의 `IncomingCall`에 필드 추가:

```ts
  originRegion?: RegionKey // 응급 전원 콜의 발신 지역 — 표시·구성 전용, 판정(adjudicate·점유)에 안 들어간다
  originLabel?: string // 발신 가공 지명("먼내군") — REGION_LABELS(world.ts) 파생
```

`receiving.ts` — import에 `REGION_LABELS`를 추가하면 **receiving→world import가 생긴다.** world는 receiving을 import하지 않으므로 순환은 아니다 — 허용한다(값만 쓰는 상수 import). `createCallQueue`를 확장:

```ts
export function createCallQueue(day = 1, beds = FIXED_BEDS, pressure = 0): IncomingCall[] {
```

`timed` 맵 내부, `arrivalMin` 계산 아래에 발신 지역 결정을 추가하고 반환 객체에 싣는다:

```ts
  const timed = plan.map(({ kind, dept }, i) => {
    const occurrence = seen[kind] ?? 0
    seen[kind] = occurrence + 1
    const arrivalMin = arrivalMinFor(1, day, i)
    // 발신 지역 — 응급만. RURAL 몫이 pressure로 커진다(0.3 → 0.9). 시드 콜별 독립(salt 17·19).
    const emergency = requiresBackupCare(kind)
    const originRoll = seededUnit(callSeed(1, day, i, 17))
    const ruralShare = 0.3 + 0.6 * pressure
    const originRegion = !emergency ? undefined
      : originRoll < ruralShare ? ('RURAL' as const)
      : originRoll < ruralShare + 0.25 ? ('METRO' as const)
      : ('CAPITAL' as const)
    const originLabel = originRegion === undefined ? undefined
      : REGION_LABELS[originRegion][
          Math.floor(seededUnit(callSeed(1, day, i, 19)) * REGION_LABELS[originRegion].length)]
    const basePatient = kind === 'SPECIALIST_ELECTIVE' ? electivePatientFor(dept ?? 'CARDIOLOGY') : PATIENT_OF[kind]
    // 멀리서 온 재이송은 상태가 나쁘다 — RURAL발 응급만 중증도 +1(5 상한). 판정 무관(표시·서사 데이터).
    const patient = originRegion === 'RURAL'
      ? { ...basePatient, severity: Math.min(5, basePatient.severity + 1) }
      : basePatient
    return {
      id: `d${day}c${i + 1}`,
      kind,
      label: kind === 'SPECIALIST_ELECTIVE'
        ? electiveLabel(dept ?? 'CARDIOLOGY')
        : CALL_LABELS[kind][occurrence % CALL_LABELS[kind].length],
      patient,
      lawsuitRisk: carriesLawsuitRisk(kind),
      nightShift: arrivalMin >= NIGHT_START_MIN,
      arrivalMin,
      durationMin: procedureDurationMin(kind, 1, day, i),
      originRegion,
      originLabel,
    }
  })
```

(기존 `patient:` 줄의 삼항은 `basePatient`로 흡수 — 중복 제거. 함수 주석의 "(day, beds) 두 인자 유지" 문구를 "3번째 인자 pressure는 선택(기본 0 = 초기 세계)"로 갱신한다.)

이어서 `session.ts`의 `weekDayQueue`를 배선한다 — import에 `transferPressure`를 추가하고(`./world`), 시그니처에 world를 더해 3개 호출처를 모두 갱신:

```ts
function weekDayQueue(week: number, day: number, beds: number, world?: WorldState) {
  const pressure = world ? transferPressure(world) : 0
  return createCallQueue((week - 1) * DAYS_PER_WEEK + day, beds, pressure)
}
```

호출처: `completeSetup`의 `weekDayQueue(1, 1, FIXED_BEDS, world)` · `advanceDay`(247행 부근)의 `weekDayQueue(state.week, day, state.beds, state.world)` · `beginWeek`의 `weekDayQueue(state.week, 1, state.beds, state.world)`.

세션 쪽 확인 테스트를 `session.test.ts`에 1개 추가(큐 필드명은 `receiving.ts`의 `ReceivingState` 정의에서 확인 — `queue`가 아니면 맞춘다):

```ts
it('세션이 만든 콜 큐에 발신 지역이 실린다 — 세계가 큐 생성에 물렸다', () => {
  const s = completeSetup(conscientious)
  expect(s.receiving!.queue.some((c) => c.originRegion !== undefined)).toBe(true)
})
```

- [x] **Step 4: 통과 확인**

Run: `npx vitest run src/game/receiving.test.ts src/game/session.test.ts`
Expected: PASS. ⚠️ 큐 스냅샷을 고정한 기존 테스트가 있으면 `originRegion`/`originLabel` 필드 추가로 깨질 수 있다 — 기대 객체에 두 필드를 더해 고친다(구성·순서는 불변이어야 한다: arrivalMin·id·kind가 바뀌었다면 그건 구현 버그다).

- [x] **Step 5: 전체 회귀 + 커밋**

Run: `npx vitest run` → PASS 후:

```bash
git add src/game/types.ts src/game/receiving.ts src/game/receiving.test.ts src/game/session.ts src/game/session.test.ts
# 제목 예: "feat: 응급 콜에 발신 지역 — 지방 배후 붕괴가 원거리·중증 전원으로 번역"
```

---

### Task 8: UI 표시 + 문서 갱신 + 최종 회귀

**Files:**
- Modify: `src/components/CallCard.tsx` (200행 부근 — `call.label` 표시 지점)
- Modify: `claude-docs/plan.md`, `claude-docs/changeLog.md`

- [x] **Step 1: CallCard에 발신 지역 한 줄** — `call.label`을 그리는 `<p>`(200행) 바로 **위**에, 파일의 기존 클래스 관례를 따라 추가:

```tsx
        {call.originLabel && (
          <p className="text-xs text-on-desk/60">{call.originLabel}에서 전원 요청</p>
        )}
```

(정확한 클래스는 파일 내 보조 텍스트가 쓰는 것을 따른다 — 스타일 신설 금지. 응급이 아닌 콜은 `originLabel`이 없어 자동으로 안 뜬다.)

- [x] **Step 2: 눈 확인** — `npm run dev` 후 브라우저에서 응급 콜 카드에 "○○군에서 전원 요청"이 뜨는지, 외래 카드엔 안 뜨는지 확인. (수동 확인이 어려운 환경이면 `npx vitest run` + `npx tsc --noEmit`으로 대체하고 PR 본문에 미확인을 명시.)

- [x] **Step 3: 문서 갱신**
  - `claude-docs/plan.md`: ⏸ "지역 집계 장부"·"지방 공간화" 항목 아래에 이번 슬라이스 완료를 반영(✅ 지역 3계층 세계 시뮬 — 콜 구성·채용 풀 채널. 지도·거리·다병원은 여전히 ⏸).
  - `claude-docs/changeLog.md` 맨 위에 항목 추가(PR 번호 적지 않기 — 프로젝트 규약): `## 2026-07-26 · 지역 세계 시뮬 최소 슬라이스 — 드리프트+이벤트 쇼크, 콜 구성·채용 풀 2채널` + 왜/무엇 2~3줄.
  - 트러블슈팅 스윕: 이번 브랜치에서 1분+ 디버깅이 있었으면(서브에이전트가 잡은 것 포함) `claude-docs/troubleshooting/T-###.md` 신설.

- [x] **Step 4: 최종 회귀 + 커밋**

Run: `npx vitest run` (전체 PASS) + `npx tsc --noEmit` + `npm run lint`(스크립트가 있으면).

```bash
git add src/components/CallCard.tsx claude-docs/plan.md claude-docs/changeLog.md
# 제목 예: "feat: 콜 카드에 발신 지역 표시 + 지역 세계 시뮬 문서 갱신"
```

---

## 완료 기준 (스펙 대조)

- [x] 세계가 매주 스스로 나빠진다: `stepWorld` 드리프트(§3) + `RegionEffect` 쇼크(§4)
- [x] 채널 ①: pressure에 따라 RURAL발 응급 비중·중증도 상승, 응급 총수 불변(§5)
- [x] 채널 ②: pool ≡ `hirablePool(world.regions)` 불변식이 nextWeek·applyGrowth 후 성립(§6)
- [x] `backgroundAttrition`·`hireDelta` 삭제 — 이중 기재 없음(§3)
- [x] `adjudicateTransfer`·`Hospital`·판정 경로 무변경(§1 헌법) — `git diff`에 `adjudicate.ts` 없음
- [x] `Math.random`·`Date.now` 0회 유지, 전체 테스트 PASS
