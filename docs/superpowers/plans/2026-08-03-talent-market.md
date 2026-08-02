---
tags:
  - type/plan
---

# 전국 인력 시장(후보 실체화 + 카드 UI) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ⚠️ 구현 시 정정: hireDoctor의 slot은 필수가 됐다(초안의 optional 폴백 기각 — 근거는 스펙 §2). 본문 Task 2의 slot? 서술은 초안 스냅샷이다.

**Goal:** 채용 패널의 "전국 잔여 N명" 숫자를, 개원 시점부터 이름·특성·초상이 정해진 **후보 카드**로 바꾼다(풀 숫자·밸런스 무변).

**Architecture:** ① 새 leaf-급 모듈 `src/sim/candidate.ts`가 `(과, 슬롯) → 사람`을 순수 함수로 제공(RNG 0). ② `SimWorld.hiredSlots`가 소비된 슬롯을 기록하고 `hireDoctor(w, dept, slot?)`가 특정 후보를 소비. ③ `HirePanel`을 과별 4열 카드 그리드로 대개편, 초상 키를 이름으로 통일해 카드=맵 얼굴 일치.

**Tech Stack:** 기존 그대로 — Next.js(App Router)·React·TypeScript·Vitest·Tailwind v4·inline SVG(PixelSprite). 새 의존성 0, 새 이미지 에셋 0.

**스펙:** [2026-08-03-talent-market-design.md](../specs/2026-08-03-talent-market-design.md)

**공통 규약** (이 저장소의 계약 — 어길 시 리뷰 반려):

- TDD 필수: 실패 테스트 먼저 작성 → 실패 확인(Red) → 구현 → 통과(Green). 테스트는 Vitest, 기존 `src/sim/*.test.ts` 스타일(한국어 describe/it, 왜를 적는 주석).
- 커밋 메시지는 한국어, 반드시 `.commit-msg-tmp` 파일 경유 `git commit -F .commit-msg-tmp` (인라인 `-m` 한글은 CP949로 깨짐 — hookify가 차단). 커밋 후 파일 삭제.
- 커밋 트레일러: `Skills-used:` / `Skill-benefit:` / `Co-Authored-By:`를 **빈 줄 없이 연속으로** 메시지 끝에 붙인다.
- 결정론: RNG·`Date.now()` 금지. 후보 신원은 세계 상태와 무관한 순수 함수다.
- 검증 명령: `npm test`(vitest run), `npm run lint`, `npm run build`.

---

### Task 1: `src/sim/candidate.ts` — 후보 신원 순수 함수

**Files:**
- Create: `src/sim/candidate.ts`
- Test: `src/sim/candidate.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/sim/candidate.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { candidateOf, freshHiredSlots, remainingCandidates } from './candidate'
import { HIRABLE_DEPTS, simDept } from './dept'
import { DOCTOR_NAMES } from './traits'
import { regionHirePool } from './world'

describe('candidateOf — (과, 슬롯)의 순수 함수', () => {
  it('같은 (과, 슬롯)은 언제나 같은 사람이다 — 세계 상태 없이 결정된다', () => {
    const a = candidateOf('CARDIOLOGY', 1)
    const b = candidateOf('CARDIOLOGY', 1)
    expect(b).toEqual(a)
    expect(a.name).toBeTruthy()
    expect(a.traits[0]).not.toBe(a.traits[1]) // pickTraits 계약 계승
  })

  it('전 슬롯 18명의 이름이 전부 다르다 — 전국 풀 기준 전역 분할', () => {
    const names = HIRABLE_DEPTS.flatMap(dept =>
      Array.from({ length: simDept(dept).nationalPool }, (_, s) => candidateOf(dept, s).name),
    )
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBe(DOCTOR_NAMES.length) // 18 = 18, 목록을 정확히 다 쓴다
  })

  it('과 오프셋 = 카탈로그 기재 순서의 누적합 — 미용 0·내과 8·외과 13·순환기 16', () => {
    expect(candidateOf('AESTHETICS', 0).name).toBe(DOCTOR_NAMES[0])
    expect(candidateOf('INTERNAL_MEDICINE', 0).name).toBe(DOCTOR_NAMES[8])
    expect(candidateOf('GENERAL_SURGERY', 0).name).toBe(DOCTOR_NAMES[13])
    expect(candidateOf('CARDIOLOGY', 0).name).toBe(DOCTOR_NAMES[16])
  })

  it('전국 풀 범위 밖 슬롯은 던진다 — 조용한 undefined 이름을 만들지 않는다', () => {
    expect(() => candidateOf('CARDIOLOGY', 2)).toThrow()
    expect(() => candidateOf('CARDIOLOGY', -1)).toThrow()
    expect(() => candidateOf('CARDIOLOGY', 0.5)).toThrow()
  })
})

describe('remainingCandidates — 지역 풀에서 소비분을 뺀 나머지', () => {
  it('빈 소비 목록이면 지역 풀 크기만큼, 슬롯 0부터 차례로 나온다', () => {
    const rest = remainingCandidates(regionHirePool('PROVINCIAL'), freshHiredSlots())
    expect(rest.CARDIOLOGY.map(c => c.slot)).toEqual([0]) // 지방 순환기는 1명뿐
    expect(rest.AESTHETICS.map(c => c.slot)).toEqual([0, 1, 2, 3])
  })

  it('소비된 슬롯은 빠지고 나머지 순서는 유지된다', () => {
    const hired = { ...freshHiredSlots(), AESTHETICS: [1] }
    const rest = remainingCandidates(regionHirePool('URBAN'), hired)
    expect(rest.AESTHETICS.map(c => c.slot)).toEqual([0, 2, 3, 4, 5, 6, 7])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/sim/candidate.test.ts`
Expected: FAIL — `Cannot find module './candidate'`

- [ ] **Step 3: 최소 구현** — `src/sim/candidate.ts`

```ts
// 후보 실체화 — (과, 슬롯) → 사람. 채용 화면이 "숫자 N"이 아니라 "이 사람들"을 보여주기
// 위한 층이다(스펙 2026-08-03-talent-market-design.md §2).
//
// **순수 함수가 계약이다**: RNG 0, 세계 상태 무관. 같은 (과, 슬롯)은 어느 판·어느 시점에도
// 같은 사람이다 — 그래야 카드에 미리 보인 사람과 뽑힌 폰이 같은 사람이고, 채용 한 번이
// 도착·응급 스트림을 밀지 않는다(traits.ts 머리말의 계약 계승).
//
// 이름은 **전국 풀 기준 전역 분할**이다: DOCTOR_NAMES 18개를 전국 풀 합계(8+5+3+2=18)에
// 1:1로 나눠, 과가 달라도 이름이 절대 겹치지 않는다. 지역 축소 풀은 앞 슬롯부터 N명만
// 존재하는 부분집합이라 유일성이 자동 성립한다.
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from './dept'
import { DOCTOR_NAMES, pickTraits, type TraitKey } from './traits'

export interface Candidate {
  dept: SimDeptKey
  /** 과내 슬롯(0..전국 풀−1). 지역 축소 풀은 슬롯 0부터 N명만 존재한다. */
  slot: number
  name: string
  traits: readonly [TraitKey, TraitKey]
}

/** 과 오프셋 — 카탈로그 기재 순서(HIRABLE_DEPTS)의 전국 풀 누적합.
 *  지역 풀이 아니라 **전국 풀** 기준인 것이 유일성의 근거다: 지역 기준이면 지역마다
 *  같은 슬롯이 다른 이름이 되어 "같은 (과, 슬롯) = 같은 사람"이 깨진다. */
function deptOffset(dept: SimDeptKey): number {
  let off = 0
  for (const key of HIRABLE_DEPTS) {
    if (key === dept) return off
    off += simDept(key).nationalPool
  }
  throw new Error(`deptOffset: 카탈로그에 없는 과(${dept})`)
}

export function candidateOf(dept: SimDeptKey, slot: number): Candidate {
  const n = simDept(dept).nationalPool
  // 범위 밖은 던진다 — undefined 이름이 폰에 실리면 사직 편지가 "undefined이(가) 떠났다"가
  // 되고, 그 오타는 화면에서야 관측된다(simDept가 던지는 것과 같은 이유).
  if (!Number.isInteger(slot) || slot < 0 || slot >= n)
    throw new Error(`candidateOf: ${dept} 슬롯 범위 밖(${slot}) — 전국 풀은 ${n}명이다`)
  const global = deptOffset(dept) + slot
  return { dept, slot, name: DOCTOR_NAMES[global], traits: pickTraits(global) }
}

/** 과별 빈 소비 목록 — SimWorld.hiredSlots의 초기값(createWorld가 쓴다). */
export function freshHiredSlots(): Record<SimDeptKey, number[]> {
  return Object.fromEntries(HIRABLE_DEPTS.map(key => [key, []])) as Record<SimDeptKey, number[]>
}

/** 남은 후보 — 지역 시작 풀(regionHirePool 결과)에서 소비된 슬롯을 뺀 나머지.
 *  세계를 통째로 받지 않는 이유: 이 모듈은 leaf에 가깝게 두고(world 순환 회피),
 *  호출부(SimGame)가 세계에서 두 값을 꺼내 넘긴다 — 화면이 세지 않는다는 규약 그대로. */
export function remainingCandidates(
  startPool: Record<SimDeptKey, number>,
  hiredSlots: Record<SimDeptKey, number[]>,
): Record<SimDeptKey, Candidate[]> {
  return Object.fromEntries(
    HIRABLE_DEPTS.map(dept => [
      dept,
      Array.from({ length: startPool[dept] }, (_, s) => s)
        .filter(s => !hiredSlots[dept].includes(s))
        .map(s => candidateOf(dept, s)),
    ]),
  ) as Record<SimDeptKey, Candidate[]>
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/sim/candidate.test.ts`
Expected: PASS (전체)

- [ ] **Step 5: 커밋** (`.commit-msg-tmp` 경유 — 공통 규약)

```
feat: 후보 실체화 — (과, 슬롯) → 이름·특성의 순수 함수 (candidate.ts)
```

---

### Task 2: 시뮬 — `hiredSlots` 상태 + 슬롯 지정 채용

**Files:**
- Modify: `src/sim/world.ts` (SimWorld 타입 + createWorld — hirePool 필드 인근, 현재 292행·403행)
- Modify: `src/sim/pawn.ts` (spawnDoctor 269행 · hireDoctor 341행 · HireResult 329행)
- Modify: `src/components/SimGame.tsx` 77행 `HIRE_REASON_TEXT` (사유 추가 — 컴파일을 위해 이 태스크에서 같이)
- Test: `src/sim/candidate.test.ts`에 describe 추가(채용 경로는 후보 기능의 일부)

- [ ] **Step 1: 실패하는 테스트 추가** — `src/sim/candidate.test.ts` 끝에

```ts
import { createWorld } from './world'
import { hireDoctor } from './pawn'

describe('hireDoctor — 슬롯 지정 채용', () => {
  it('슬롯을 지정하면 정확히 그 후보의 이름·특성으로 폰이 선다', () => {
    const cand = candidateOf('CARDIOLOGY', 1)
    const res = hireDoctor(createWorld(1), 'CARDIOLOGY', 1)
    if (!res.ok) throw new Error('채용이 거부됐다')
    const doc = res.world.pawns.find(p => p.kind === 'DOCTOR')!
    expect(doc.name).toBe(cand.name)
    expect(doc.traits).toEqual(cand.traits)
    expect(res.world.hiredSlots.CARDIOLOGY).toEqual([1])
    expect(res.world.hirePool.CARDIOLOGY).toBe(1) // 카운트도 함께 준다
  })

  it('이미 소비된 슬롯·범위 밖 슬롯은 거부되고 세계는 그대로다', () => {
    const w1 = hireDoctor(createWorld(1), 'CARDIOLOGY', 0)
    if (!w1.ok) throw new Error('선행 채용이 거부됐다')
    expect(hireDoctor(w1.world, 'CARDIOLOGY', 0)).toEqual({ ok: false, reason: 'SLOT_TAKEN' })
    expect(hireDoctor(createWorld(1), 'CARDIOLOGY', 9)).toEqual({ ok: false, reason: 'SLOT_TAKEN' })
  })

  it('슬롯 생략 = 남은 최소 슬롯 — 기존 호출부 하위호환', () => {
    const w1 = hireDoctor(createWorld(1), 'AESTHETICS', 0)
    if (!w1.ok) throw new Error('선행 채용이 거부됐다')
    const w2 = hireDoctor(w1.world, 'AESTHETICS')
    if (!w2.ok) throw new Error('생략 채용이 거부됐다')
    expect(w2.world.hiredSlots.AESTHETICS).toEqual([0, 1])
  })

  it('지역 축소 풀에서는 지역 범위 밖 슬롯이 거부된다 — 지방 순환기는 슬롯 0뿐', () => {
    const w = createWorld(1, { region: 'PROVINCIAL' })
    expect(hireDoctor(w, 'CARDIOLOGY', 1)).toEqual({ ok: false, reason: 'SLOT_TAKEN' })
    expect(hireDoctor(w, 'CARDIOLOGY', 0).ok).toBe(true)
  })

  it('불변식: hirePool[d] + hiredSlots[d].length === 지역 시작 풀 — 채용 열 뒤에도', () => {
    let w = createWorld(1, { region: 'NEWTOWN' })
    for (const [dept, slot] of [
      ['AESTHETICS', 3], ['INTERNAL_MEDICINE', 0], ['GENERAL_SURGERY', 1], ['AESTHETICS', 0],
    ] as const) {
      const res = hireDoctor(w, dept, slot)
      if (!res.ok) throw new Error(`${dept} ${slot} 채용이 거부됐다`)
      w = res.world
    }
    const start = regionHirePool('NEWTOWN')
    for (const dept of HIRABLE_DEPTS)
      expect(w.hirePool[dept] + w.hiredSlots[dept].length, dept).toBe(start[dept])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/sim/candidate.test.ts`
Expected: FAIL — `hiredSlots`가 SimWorld에 없음(TS 에러) 및 `SLOT_TAKEN` 미정의

- [ ] **Step 3: 구현**

`src/sim/world.ts` — SimWorld의 `hirePool` 필드 바로 아래에 추가:

```ts
  /** 과별로 **이미 뽑힌 후보 슬롯**(candidate.ts) — hirePool 카운트의 명단판이다.
   *  카운트를 지우지 않는 이유: 기존 테스트·화면·이벤트가 전부 카운트를 읽는다. 쓰기 경로가
   *  hireDoctor 하나뿐이라 어긋날 면이 없고, 일치는 불변식 테스트가 잠근다
   *  (hirePool[d] + hiredSlots[d].length === regionHirePool(region)[d]). */
  hiredSlots: Record<SimDeptKey, number[]>
```

`createWorld`의 반환 객체에 추가(`hirePool: regionHirePool(region)` 줄 옆):

```ts
    hiredSlots: freshHiredSlots(),
```

(import: `import { freshHiredSlots } from './candidate'` — candidate.ts는 dept·traits만 임포트하므로 순환 없음)

`src/sim/pawn.ts` — ① `spawnDoctor`에 신원 인자 추가:

```ts
export function spawnDoctor(
  w: SimWorld, dept: SimDeptKey, at: Pt,
  identity?: Pick<Candidate, 'name' | 'traits'>,
): SimWorld {
  const p: Pawn = {
    id: `doc-${w.nextId}`, kind: 'DOCTOR', x: at.x, y: at.y, path: [], dept,
    // 신원은 채용 경로(hireDoctor)가 후보에서 실어 온다. 미지정 폴백은 손세계 폰(테스트의
    // spawnDoctor 직접 호출) 전용 — 종전 서수 방식 그대로라 기존 손세계가 안 깨진다.
    name: identity?.name ?? doctorName(hiredEver(w)),
    traits: identity?.traits ?? pickTraits(w.nextId),
    fatigue: 0, loadMinToday: 0, hungerMin: 0, saturatedDays: 0, priorities: freshPriorities(),
  }
  return { ...w, nextId: w.nextId + 1, pawns: [...w.pawns, p] }
}
```

② `HireResult`에 사유 추가 + `hireDoctor` 슬롯 인자:

```ts
export type HireResult =
  | { ok: true; world: SimWorld }
  | { ok: false; reason: 'NO_POOL' | 'SLOT_TAKEN' }

export function hireDoctor(w: SimWorld, dept: SimDeptKey, slot?: number): HireResult {
  const remaining = w.hirePool[dept]
  if (remaining <= 0) return { ok: false, reason: 'NO_POOL' }
  const regionN = regionHirePool(w.region)[dept]
  const taken = w.hiredSlots[dept]
  // 생략 = 남은 최소 슬롯(기존 호출부 하위호환). remaining > 0이면 불변식상 반드시 있다.
  const pick = slot ?? Array.from({ length: regionN }, (_, s) => s).find(s => !taken.includes(s))
  // SLOT_TAKEN 하나로 접는 이유: UI는 remainingCandidates가 준 슬롯만 넘기므로 이 거부는
  // 연타·stale 스냅샷 경로뿐이고, 플레이어에게 할 말은 "그 사람은 이미 없다" 하나다.
  if (pick === undefined || !Number.isInteger(pick) || pick < 0 || pick >= regionN || taken.includes(pick))
    return { ok: false, reason: 'SLOT_TAKEN' }
  const world = spawnDoctor(w, dept, spawnSpotNear(w, ENTRANCE), candidateOf(dept, pick))
  return {
    ok: true,
    world: {
      ...world,
      hirePool: { ...world.hirePool, [dept]: remaining - 1 },
      hiredSlots: { ...world.hiredSlots, [dept]: [...taken, pick] },
    },
  }
}
```

(import 추가: `import { candidateOf, type Candidate } from './candidate'`)

`src/components/SimGame.tsx` 77행 `HIRE_REASON_TEXT`에 사유 추가:

```ts
const HIRE_REASON_TEXT: Record<Exclude<HireResult, { ok: true }>["reason"], string> = {
  NO_POOL: "전국에 남은 그 과 의사가 없습니다",
  SLOT_TAKEN: "그 사람은 이미 채용됐습니다",
};
```

- [ ] **Step 4: 전체 테스트 — 컴파일 연쇄 수정**

Run: `npm test`
Expected: 손으로 SimWorld 리터럴을 세우는 기존 픽스처(week.test.ts 565·583·638·655행 등)가 `hiredSlots` 누락 TS 에러로 깨질 수 있다 → 각 리터럴에 `hiredSlots: freshHiredSlots()` 추가. **이름을 서수로 잠근 테스트**(traits.test.ts·resignation.test.ts의 채용 경유 이름 단언)는 전역 분할 기준으로 기대값 갱신(예: 첫 순환기 채용 = `DOCTOR_NAMES[16]`). 동작 변화가 아니라 신원 배정 방식 변경임을 커밋 메시지에 남긴다.

- [ ] **Step 5: 통과 확인 후 커밋**

Run: `npm test` → 전체 PASS 확인.

```
feat: 채용이 특정 후보를 소비한다 — SimWorld.hiredSlots + hireDoctor(dept, slot)
```

---

### Task 3: UI — HirePanel 카드 시장 대개편

**Files:**
- Modify: `src/components/HirePanel.tsx` (전면 재작성 — 머리말 주석의 논지는 계승)
- Modify: `src/components/SimGame.tsx` (434행 `hire` 핸들러 + 1165행 HirePanel props)
- Modify: `src/components/TileMap.tsx` (865·867행 — variantKey를 `p.name ?? p.id`로)

- [ ] **Step 1: UI 뼈대 — HirePanel 재작성**

props 변경: `hirePool: Record<SimDeptKey, number>` 제거 → `candidates: Record<SimDeptKey, Candidate[]>` 추가, `onHire: (dept: SimDeptKey, slot: number) => void`.

핵심 구조(기존 계약 전부 유지 — role=dialog·aria-modal·`my-auto`(T-088)·스타팅 게이트·간호사 줄·주 고정비 합계·확정 버튼 스타일·T-142 hover):

```tsx
<div role="dialog" aria-modal="true" aria-label={...}
  className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-desk/85 p-4">
  <div className="my-auto flex w-full max-w-4xl flex-col gap-3 border border-frame bg-desk-2 px-5 py-5">
    {/* 제목: starting ? "개원 준비 — 전국 인력 시장" : "채용 — 전국 인력 시장" + 금고 */}
    {/* 스타팅 안내문·"일시금 없음" 문구: 기존 그대로 */}
    <p className="text-xs text-on-desk-muted">전국에 남은 사람이 이 화면의 전부입니다. 떠난 사람은 돌아오지 않습니다.</p>

    <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4">
      {HIRABLE_DEPTS.map((key) => {
        const spec = simDept(key)
        const rest = candidates[key]
        return (
          <section key={key} className="flex flex-col gap-2 border border-frame bg-desk px-2.5 py-2.5">
            <header>
              <h3 className="text-sm text-on-desk">{spec.label}</h3>
              <p className="font-mono text-xs tabular-nums text-on-desk-muted">
                주급 {formatManwon(spec.weeklyCostManwon)} · 현재 {counts[key]}명 · 잔여 {rest.length}명
              </p>
            </header>
            {rest.map((cand) => (
              <article key={cand.slot} className="flex flex-col gap-1.5 border border-frame bg-desk-2 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-10 w-10 shrink-0">
                    <DoctorSprite dept={cand.dept} busy={false} variantKey={cand.name} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-on-desk">{cand.name}</p>
                    <p className="truncate text-[11px] text-on-desk-muted">
                      {TRAITS[cand.traits[0]].label} · {TRAITS[cand.traits[1]].label}
                    </p>
                  </div>
                </div>
                {/* 사연 한 줄 — 첫 특성의 story(보간 없는 완결 문장 — traits.ts 계약) */}
                <p className="text-[11px] text-on-desk-muted">{TRAITS[cand.traits[0]].story}</p>
                <button type="button" onClick={() => onHire(cand.dept, cand.slot)}
                  className="border border-frame px-3 py-1 text-xs text-on-desk-muted transition-colors hover:border-on-desk-muted hover:text-on-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted">
                  채용
                </button>
              </article>
            ))}
            {/* 소진 열: 기존 사유 문구가 빈 자리를 채운다 */}
            {rest.length === 0 && (
              <p className="border border-dashed border-frame px-2.5 py-3 text-[11px] text-alarm">
                전국에 남은 {spec.label} 의사가 없습니다 — 떠난 사람은 이 숫자로 돌아오지 않습니다.
              </p>
            )}
            {/* 마지막 1~2장 남은 열: 사실 진술 한 줄(해석 카피 아님) */}
            {rest.length > 0 && rest.length <= 2 && (
              <p className="text-center text-[11px] text-on-desk-muted">이게 전부입니다</p>
            )}
          </section>
        )
      })}
    </div>

    {/* 간호사 줄·주 고정비 합계·스타팅 진행·닫기/개원 준비 시작 버튼: 기존 코드 그대로 이식 */}
  </div>
</div>
```

주의: 채용 버튼의 `disabled={empty}` 분기는 사라진다 — 카드는 남은 후보에만 존재하므로 빌 수 없다(코어 SLOT_TAKEN 거부가 이중 벨트로 남는다). 머리말 주석은 "풀 카운트"가 아니라 "남은 사람 명단"을 보여준다는 논지로 갱신하되, 채용 일시금 없음·풀 비가역 설명은 계승한다.

- [ ] **Step 2: SimGame 연결**

434행 `hire` 핸들러와 1165행 호출부:

```tsx
const hire = (dept: SimDeptKey, slot: number) => {
  const res = hireDoctor(world, dept, slot);
  if (res.ok) setWorld(res.world);
  else showToast(HIRE_REASON_TEXT[res.reason]);
};
```

```tsx
<HirePanel
  pawns={world.pawns}
  candidates={remainingCandidates(regionHirePool(world.region), world.hiredSlots)}
  treasuryManwon={world.treasuryManwon}
  starting={rosterOpen}
  onHire={hire}
  onHireNurse={hireNurseHere}
  onClose={() => (rosterOpen ? setRosterOpen(false) : setHireOpen(false))}
/>
```

(import 추가: `remainingCandidates` from `@/sim/candidate`, `regionHirePool` from `@/sim/world`)

- [ ] **Step 3: 카드 얼굴 = 맵 얼굴** — `src/components/TileMap.tsx` 865·867행

```tsx
<NurseSprite variantKey={p.name ?? p.id} />
...
<DoctorSprite dept={p.dept} busy={busyDoctors.has(p.id)} variantKey={p.name ?? p.id} />
```

이유를 그 자리 주석으로: 초상 변주 키가 `p.id`(`doc-${nextId}`)면 채용 카드가 그 값을 미리 알 수 없어 카드의 얼굴과 맵의 얼굴이 갈린다 — 이름은 후보 시점부터 확정이라 두 화면이 같은 사람을 그린다.

- [ ] **Step 4: 검증**

Run: `npm test` → PASS, `npm run lint` → 통과, `npm run build` → 성공.
브라우저 확인(dev 서버): ① 개원 준비 화면에 4열 카드(도심 8·5·3·2장) ② 카드 채용 → 그 이름·특성의 의사가 로스터·맵에 등장, 맵 초상이 카드와 동일 ③ 순환기 2장 열 바닥 "이게 전부입니다" ④ 소진 열 문구 ⑤ 지역을 지방으로 열면 축소 풀(4·3·2·1장) ⑥ 스타팅 게이트(3명 채워야 시작) 동작.

- [ ] **Step 5: 커밋**

```
feat: 채용 패널을 전국 인력 시장으로 — 과별 후보 카드 4열, 카드=맵 얼굴 일치
```

---

### Task 4: 문서 세트 + 마무리

**Files:**
- Modify: `claude-docs/plan.md` (해당 항목 ✅ 또는 신규 줄)
- Modify: `claude-docs/changeLog.md` (맨 위 한 항목 — PR 번호 없이 `## 2026-08-03 · 제목`)
- Confirm: `docs/concept/structural-problems-checklist.md` (바뀐 항목 있으면 행+집계 갱신 — 이번 작업은 표현 변경이라 대체로 무변)

- [ ] **Step 1: changeLog 맨 위에 항목 추가** — 왜(숫자 표가 희소성을 콘텐츠 부족으로 읽히게 함)/무엇을(후보 실체화 + 카드 시장) 두 문장.
- [ ] **Step 2: plan.md 갱신** — 이번 작업 줄이 없으면 완료 항목으로 한 줄 추가(✅).
- [ ] **Step 3: 트러블슈팅 스윕** — 이번 브랜치에서 1분+ 근인 디버깅(서브에이전트가 잡은 것 포함)이 있었으면 `claude-docs/troubleshooting/T-###.md` 신설. 없으면 생략.
- [ ] **Step 4: 커밋** (`docs:` 접두)

---

## Self-Review 결과

- 스펙 §2(후보 함수·hiredSlots·하위호환·마이그레이션) → Task 1·2. §3(카드 UI·초상 키·소진 표현·간호사 줄·유지 계약) → Task 3. §4 테스트 1~5 → Task 1·2 테스트 코드, 6 → Task 3 Step 4 브라우저 확인(이 저장소는 DOM 렌더 테스트가 없다 — 로직은 candidate 층에서 잠근다). §5 범위 밖 → 어느 태스크도 건드리지 않음.
- 타입 일관성: `Candidate`·`freshHiredSlots`·`remainingCandidates`·`SLOT_TAKEN` 명칭이 태스크 간 일치함을 확인.
- 플레이스홀더 없음(간호사 줄·하단 바는 "기존 코드 그대로 이식"으로 지시 — 현행 코드가 원본이라 반복 기재하지 않는다).
