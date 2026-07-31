---
tags:
  - type/plan
---

# 자유 영역 지정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영역을 벽·문 밀폐에서 해방한다 — 플레이어가 드래그로 칠한 타일 집합이 곧 영역이고, 벽·문은 통행 차단과 시각으로만 남는다.

**Architecture:** `designations`(앵커 배열)를 `zones: ReadonlyMap<타일, {type, dept?}>`(칠한 타일)로 바꾸고, `Region[]`은 같은 (type·dept) 타일의 4방 연결 성분으로 **여전히 파생**한다(A안 — 병합·분할이 공짜, 이중 기재 없음). 소비자(spots·patientFlow·needs·emergency·TileMap·simHud)는 `Region[]`을 받는 시그니처가 그대로라 산지 교체만 겪는다. `OUTDOORS` 거부·`Region.doors`·밀폐 판정이 삭제되고, 체크리스트의 「문을 냅니다」는 입구 도달성 판정으로 대체된다.

**Tech Stack:** TypeScript · React 19 · Next.js 16 · vitest

**스펙:** [자유 영역 지정 설계](../specs/2026-07-31-free-zone-designation-design.md)

---

## 파일 구조

| 파일 | 책임 | 이 계획에서 |
|---|---|---|
| `src/sim/world.ts` | 세계 타입·초기 세계 | `Designation` → `ZonePaint` · `designations` → `zones` |
| `src/sim/regions.ts` | 영역 파생 (**정의가 곧 스펙**) | 밀폐 성분 → 칠한 타일 성분으로 재작성 · `doors` 삭제 · `type` 필수 승격 |
| `src/sim/regions.test.ts` | 영역 정의 계약 | 새 정의로 재작성 — **먼저 실패시킨다** |
| `src/sim/build.ts` | 건설 순수 함수 | `designateRegion` 삭제 → `paintZone`·`eraseZone` · `OUTDOORS` 삭제 |
| `src/sim/build.test.ts` | 건설 계약 | 지정 절 재작성 |
| `src/sim/testHelpers.ts` | 테스트 픽스처 | `placeRoom`이 앵커 대신 사각형 전체를 칠한다 |
| `src/components/simHud.ts` | HUD 판정·문구 | 거부 문구·차단 사유·미리보기 라벨·체크리스트(도달성) |
| `src/components/simHud.test.ts` | HUD 계약 | 위 변경분 |
| `src/components/SimGame.tsx` | 도구 배선 | `runTool`이 드래그 전체를 넘긴다 · 「지정 해제」 버튼 |
| `src/components/TileMap.tsx` | 지형 렌더 | memo 키 `walls·doors·designations` → `walls·doors·zones` |

**하지 않는 것(스펙 §7):** 밀폐 보너스 규칙 · 오버레이 테두리 · 최소 크기 제약 · 저장 마이그레이션.

---

## Task 1: 코어 원자 교체 — zones 필드 · 새 파생 · paintZone/eraseZone

`designations` → `zones`는 타입이 갈리는 원자 변경이라 world·regions·build·testHelpers가 한 커밋에 움직여야 sim 임포트 그래프가 다시 선다. RED는 **컴파일 실패**로 확인한다(새 API 테스트는 옛 코드에서 컴파일되지 않는 것이 곧 실패다).

**Files:**
- Modify: `src/sim/world.ts` (타입 `Designation`·필드 `designations`·초기 세계)
- Modify: `src/sim/regions.ts` (전면 재작성)
- Modify: `src/sim/regions.test.ts` (전면 재작성)
- Modify: `src/sim/build.ts` (`designateRegion`→`paintZone`/`eraseZone`, `OUTDOORS` 삭제, `demolish` 주석)
- Modify: `src/sim/build.test.ts` (지정 절)
- Modify: `src/sim/testHelpers.ts` (`placeRoom`)

- [x] **Step 1: regions.test.ts를 새 정의로 재작성한다 (RED)**

기존 파일을 통째로 교체한다. 재는 것: 성분 파생 · 병합 · 분할 · dept 분리 · id 결정론 · 캐시 무해성.

```ts
// 영역(Region) 정의 계약 — "무엇이 영역인가"가 바뀌었다:
// 옛 정의(벽·문으로 둘러싸인 성분)가 아니라, **플레이어가 칠한 같은 (type·dept) 타일의
// 4방 연결 성분**이 영역이다(설계 2026-07-31-free-zone-designation §2). 벽은 통행·시각의
// 것이고 영역의 것이 아니다 — 접수처에 문을 달 필요가 없어진 이유가 이 파일에 있다.
import { describe, expect, it } from 'vitest'
import { computeRegions, computeRegionsUncached } from './regions'
import { freshWorld, tileIndex, type SimWorld, type ZonePaint } from './world'

/** 사각형을 칠한 세계 — 테스트 전용 최소 픽스처(불변 교체 계약 준수). */
function paint(w: SimWorld, x: number, y: number, wd: number, ht: number, p: ZonePaint): SimWorld {
  const zones = new Map(w.zones)
  for (let yy = y; yy < y + ht; yy++) for (let xx = x; xx < x + wd; xx++) zones.set(tileIndex(xx, yy), p)
  return { ...w, zones }
}

describe('computeRegions — 칠한 타일의 (type·dept) 성분', () => {
  it('칠한 사각형 하나가 영역 하나다 — 벽 없이도, 가장자리에 닿아도', () => {
    // 옛 정의라면 가장자리(y=0)에 닿는 순간 마당이었다 — 그 판정 자체가 사라졌음을 잰다.
    const w = paint(freshWorld(), 0, 0, 4, 3, { type: 'WAITING' })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(1)
    expect(rs[0].type).toBe('WAITING')
    expect(rs[0].tiles.size).toBe(12)
    expect(rs[0].id).toBe(tileIndex(0, 0)) // id = 성분 최소 타일 인덱스
  })

  it('떨어진 같은 용도 조각은 서로 다른 영역이다', () => {
    let w = paint(freshWorld(), 2, 2, 3, 3, { type: 'WARD' })
    w = paint(w, 10, 2, 3, 3, { type: 'WARD' })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(2)
    expect(rs.map(r => r.id)).toEqual([tileIndex(2, 2), tileIndex(10, 2)]) // id 오름차순
  })

  it('이어 칠하면 하나로 합쳐진다 (병합이 공짜)', () => {
    let w = paint(freshWorld(), 2, 2, 3, 3, { type: 'WARD' })
    w = paint(w, 5, 2, 5, 3, { type: 'WARD' }) // 오른쪽에 붙여 칠함
    const rs = computeRegions(w)
    expect(rs).toHaveLength(1)
    expect(rs[0].tiles.size).toBe(24)
  })

  it('가운데를 지우면 둘로 갈라진다 (분할이 공짜)', () => {
    let w = paint(freshWorld(), 2, 2, 7, 1, { type: 'WAITING' })
    const zones = new Map(w.zones)
    zones.delete(tileIndex(5, 2))
    w = { ...w, zones }
    expect(computeRegions(w)).toHaveLength(2)
  })

  it('과가 다른 진료실은 벽 없이 붙여 칠해도 다른 영역이다', () => {
    let w = paint(freshWorld(), 2, 2, 3, 3, { type: 'EXAM', dept: 'INTERNAL_MEDICINE' })
    w = paint(w, 5, 2, 3, 3, { type: 'EXAM', dept: 'GENERAL_SURGERY' })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(2)
    expect(rs.map(r => r.dept).sort()).toEqual(['GENERAL_SURGERY', 'INTERNAL_MEDICINE'])
  })

  it('용도가 다르면 붙어 있어도 다른 영역이다 (접수처가 대기실에 열려 있는 그림)', () => {
    let w = paint(freshWorld(), 2, 2, 4, 4, { type: 'WAITING' })
    w = paint(w, 6, 2, 2, 4, { type: 'RECEPTION' }) // 문도 벽도 없이 맞닿음
    const rs = computeRegions(w)
    expect(rs).toHaveLength(2)
    expect(rs.map(r => r.type).sort()).toEqual(['RECEPTION', 'WAITING'])
  })

  it('대각선만 닿은 조각은 이어지지 않는다 (4방 연결)', () => {
    let w = paint(freshWorld(), 2, 2, 2, 2, { type: 'WARD' })
    w = paint(w, 4, 4, 2, 2, { type: 'WARD' }) // 꼭짓점만 닿음
    expect(computeRegions(w)).toHaveLength(2)
  })

  it('캐시가 답을 바꾸지 않는다 — 같은 참조면 같은 배열, 새 Map이면 재계산', () => {
    const w = paint(freshWorld(), 2, 2, 3, 3, { type: 'WARD' })
    expect(computeRegions(w)).toBe(computeRegions(w)) // 참조 동일 = 캐시 적중
    const again = { ...w, zones: new Map(w.zones) }
    expect(computeRegions(again)).toEqual(computeRegionsUncached(again)) // 값은 언제나 같다
  })
})
```

- [x] **Step 2: 실행해 RED(컴파일 실패)를 확인한다**

Run: `npx vitest run src/sim/regions.test.ts`
Expected: FAIL — `ZonePaint`·`zones`가 없어 컴파일 에러. 이것이 이 태스크의 RED다.

- [x] **Step 3: world.ts의 타입·필드를 교체한다**

`Designation` 인터페이스(205행 근처)를 지우고 그 자리에:

```ts
/** 칠한 한 타일의 용도 — `dept`는 `EXAM`에만 실린다(옛 Designation과 같은 규약).
 *  영역은 이 칠에서 **파생**한다(regions.computeRegions — 같은 (type·dept) 성분).
 *  벽·문 타일에는 칠이 없다는 것이 build.paintZone의 계약이다. */
export interface ZonePaint { type: RoomType; dept?: SimDeptKey }
```

`SimWorld`의 `designations: ReadonlyArray<Designation>`(235행 근처)을:

```ts
  /** 칠한 타일 → 용도. **불변 취급** — 편집은 새 Map으로 교체한다(walls와 같은 계약).
   *  computeRegions memo와 TileMap 지형 memo가 이 참조를 키로 쓴다. */
  zones: ReadonlyMap<number, ZonePaint>
```

초기 세계(361행 근처)의 `designations: [],`를 `zones: new Map(),`으로.

- [x] **Step 4: regions.ts를 새 파생으로 재작성한다**

파일 전체를 교체한다. 머리말 주석의 요지: 영역은 이제 **칠에서 파생**하고, 벽·문·밀폐는 영역과 무관하다.

```ts
// 영역(Region) — 플레이어가 칠한 타일(world.zones)에서 **파생**한다. 세계에 영역 객체를
// 저장하지 않는 이유는 옛 설계와 같다(이중 기재): 저장하면 확장·축소 때 병합·분할 갱신을
// 잊는 자리가 생긴다. 파생이면 이어 칠한 조각은 저절로 하나가 되고 가운데를 지우면 저절로
// 둘이 된다. 벽·문은 여기 등장하지 않는다 — 밀폐는 더 이상 영역의 조건이 아니다(설계
// 2026-07-31-free-zone-designation). 문에 기대던 판정(체크리스트의 밀실 경고)은 도달성으로
// 대체됐다(simHud.setupSteps).
import { GRID_W, GRID_H, tileIndex, type RoomType, type SimWorld } from './world'
import type { SimDeptKey } from './dept'

export interface Region {
  /** 성분 내 **최소 타일 인덱스** — 좌표만으로 정해지는 결정론적 대표(옛 정의 계승). */
  id: number
  tiles: ReadonlySet<number>
  /** 필수다 — 칠한 타일에서만 성분이 나오므로 용도 없는 영역은 존재하지 않는다.
   *  (옛 정의에서는 "둘러싸였지만 용도 없음"이 있어 optional이었다.) */
  type: RoomType
  dept?: SimDeptKey
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const

/** 마지막 한 번의 결과 — 키는 `zones` **참조 하나**다. zones는 SimWorld 계약상 편집 때
 *  새 Map으로 교체되므로, 값이 달라지는 유일한 경로가 곧 키가 달라지는 경로다(옛 memo와
 *  같은 논리 — 근거·실측은 git history의 옛 regions.ts 주석에 있다). */
let memo: { zones: SimWorld['zones']; out: Region[] } | null = null

export function computeRegions(world: Pick<SimWorld, 'zones'>): Region[] {
  if (memo !== null && memo.zones === world.zones) return memo.out
  const out = computeRegionsUncached(world)
  memo = { zones: world.zones, out }
  return out
}

/** 캐시를 거치지 않는 계산 그 자체 — 테스트가 캐시 무해성을 이 함수와 대조해 잰다(옛 관례). */
export function computeRegionsUncached(world: Pick<SimWorld, 'zones'>): Region[] {
  const seen = new Set<number>()
  const out: Region[] = []
  // Map 순회는 삽입 순서라 그대로 쓰면 칠한 순서가 id를 흔든다 — 타일 인덱스 오름차순으로
  // 정렬해 순회한다. 그러면 각 성분의 첫 방문 타일이 곧 최소 인덱스(= id)이고, 결과 배열도
  // id 오름차순으로 나온다(옛 정의와 같은 결정론).
  const painted = [...world.zones.keys()].sort((a, b) => a - b)
  for (const start of painted) {
    if (seen.has(start)) continue
    const paint = world.zones.get(start)!
    const tiles: number[] = []
    const stack = [start]
    seen.add(start)
    while (stack.length > 0) {
      const cur = stack.pop()!
      tiles.push(cur)
      const cx = cur % GRID_W, cy = (cur - (cur % GRID_W)) / GRID_W
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue
        const ni = tileIndex(nx, ny)
        if (seen.has(ni)) continue
        const p = world.zones.get(ni)
        // 같은 (type·dept)만 이어진다 — 과가 다른 진료실은 붙여 칠해도 갈린다(설계 §2).
        if (!p || p.type !== paint.type || p.dept !== paint.dept) continue
        seen.add(ni)
        stack.push(ni)
      }
    }
    out.push({
      id: start, tiles: new Set(tiles), type: paint.type,
      ...(paint.dept !== undefined ? { dept: paint.dept } : {}),
    })
  }
  return out
}
```

- [x] **Step 5: build.ts에서 designateRegion을 paintZone·eraseZone으로 교체한다**

`BuildReason`에서 `'OUTDOORS'` 항목(과 그 주석)을 지운다. `designateRegion`을 지우고 그 자리에:

```ts
/**
 * 용도 칠하기 — 드래그한 타일에 (type·dept)를 입힌다. 영역은 여기서 만들지 않는다(파생 —
 * regions.computeRegions). 규칙(설계 §1·§3):
 * - **벽·문 타일은 칠해지지 않는다**(건너뜀). 가구 타일은 칠해진다 — 가구는 영역 안의
 *   것이지 경계가 아니다.
 * - **나중 칠한 것이 이긴다** — 다른 용도 타일은 덮어쓴다. 같은 (type·dept)는 건너뜀.
 * - 지정은 무료다(deltaManwon 0). 실패 계약은 install과 같다(미리보기가 같은 값을 읽는다).
 */
export function paintZone(w: SimWorld, tiles: readonly Pt[], type: RoomType, dept?: SimDeptKey): PlaceResult {
  if (type === 'EXAM' && dept === undefined) throw new Error('진료실 용도에는 과가 필요하다')
  // EXAM이 아니면 과를 떨군다 — 대기실에 실려 온 과는 읽는 쪽에서 뜻을 만들어낸다(옛 규약).
  const paint: ZonePaint = type === 'EXAM' && dept !== undefined ? { type, dept } : { type }
  const seen = new Set<number>()
  const targets: number[] = []
  let skipped = 0
  for (const t of tiles) {
    if (!inBounds(t)) { skipped += 1; continue }
    const i = tileIndex(t.x, t.y)
    if (seen.has(i)) continue
    seen.add(i)
    if (w.walls.has(i) || w.doors.has(i)) { skipped += 1; continue }
    const cur = w.zones.get(i)
    if (cur !== undefined && cur.type === paint.type && cur.dept === paint.dept) { skipped += 1; continue }
    targets.push(i)
  }
  if (targets.length === 0) return { ok: false, reason: 'NOTHING', tiles: [], skipped, deltaManwon: 0 }
  const zones = new Map(w.zones)
  for (const i of targets) zones.set(i, paint)
  return { ok: true, world: { ...w, zones }, tiles: targets, skipped, deltaManwon: 0 }
}

/** 지정 해제 — 드래그한 타일의 칠만 지운다. 벽·가구는 그대로(철거 도구와 분리 — 설계 §1). */
export function eraseZone(w: SimWorld, tiles: readonly Pt[]): PlaceResult {
  const seen = new Set<number>()
  const targets: number[] = []
  let skipped = 0
  for (const t of tiles) {
    if (!inBounds(t)) { skipped += 1; continue }
    const i = tileIndex(t.x, t.y)
    if (seen.has(i)) continue
    seen.add(i)
    if (!w.zones.has(i)) { skipped += 1; continue }
    targets.push(i)
  }
  if (targets.length === 0) return { ok: false, reason: 'NOTHING', tiles: [], skipped, deltaManwon: 0 }
  const zones = new Map(w.zones)
  for (const i of targets) zones.delete(i)
  return { ok: true, world: { ...w, zones }, tiles: targets, skipped, deltaManwon: 0 }
}
```

임포트에 `ZonePaint`를 더하고 `computeRegions` 임포트는 지운다(이 파일에서 더 이상 안 쓴다).
`demolish`의 앵커 특례 주석(*"앵커는 건드리지 않는다 …"*)을 새 사실로 교체한다: *"칠(zones)은 건드리지 않는다 — 벽을 부숴도 영역은 그대로다(밀폐가 영역의 조건이 아니게 된 것이 이 설계의 목적). 영역을 지우는 길은 「지정 해제」뿐이다."*

- [x] **Step 6: testHelpers.placeRoom이 사각형 전체를 칠하게 한다**

`designateRegion(opened.world, { x: door.x, y: door.y - 1 }, spec.type, dept)` 호출을 교체한다:

```ts
  // 사각형 **전체**를 칠한다 — 벽·문 타일은 paintZone이 알아서 건너뛰므로(계약) 내부만 남는다.
  // 옛 앵커(문 위 한 칸)와 결과가 같아야 한다: 밀폐 방의 내부 성분 = 사각형에서 벽·문을 뺀 것.
  const all: Pt[] = []
  for (let yy = spec.y; yy < spec.y + spec.h; yy++)
    for (let xx = spec.x; xx < spec.x + spec.w; xx++) all.push({ x: xx, y: yy })
  const named = paintZone(opened.world, all, spec.type, dept)
```

임포트를 `designateRegion` → `paintZone`으로 바꾼다.

- [x] **Step 7: regions.test GREEN을 확인한다**

Run: `npx vitest run src/sim/regions.test.ts`
Expected: PASS — 전 항목.

- [x] **Step 8: build.test.ts의 지정 절을 재작성한다**

기존 designate 절(`마당·벽·문 위는 거부한다` 등)을 지우고 새 계약을 잰다. 최소 케이스:

```ts
describe('paintZone · eraseZone', () => {
  it('벽·문 타일은 칠해지지 않는다 — skipped로 보고된다', () => { /* 벽 두른 사각형 전체를 칠해
    targets가 내부뿐임을, skipped가 테두리 수와 같음을 단언 */ })
  it('나중 칠한 것이 이긴다 — 다른 용도 타일을 덮어쓴다', () => { /* WAITING 위에 RECEPTION을
    겹쳐 칠하고 computeRegions로 두 영역의 타일 수 변화를 단언 */ })
  it('전부 같은 칠이면 NOTHING이다', () => { /* 같은 사각형을 두 번 칠해 두 번째가 ok:false */ })
  it('EXAM에 과가 없으면 던진다', () => { /* expect(() => paintZone(w, ts, 'EXAM')).toThrow() */ })
  it('지정 해제는 칠만 지운다 — 벽·가구는 그대로', () => { /* eraseZone 후 walls·furniture 불변,
    zones에서 해당 타일 소멸 단언 */ })
  it('빈 범위 해제는 NOTHING이다', () => {})
})
```

(주석 자리는 실제 단언으로 채운다 — 픽스처는 regions.test의 `paint` 헬퍼와 같은 요령으로 만들되, 벽이 필요한 케이스는 `buildWalls`를 쓴다.)

- [x] **Step 9: sim 전체 테스트로 회귀를 확인한다**

Run: `npx vitest run src/sim`
Expected: PASS. **placeRoom 경유 픽스처의 소비자 테스트(patientFlow·needs·emergency·week 등)가 전부 그대로 통과해야 한다** — 밀폐 방에서는 옛 파생(내부 성분)과 새 파생(사각형−벽·문)이 같은 타일 집합을 내기 때문이다. 실패하면 파생 정의가 어긋난 것이므로 그 차이를 먼저 읽는다.

주의: `src/components`는 아직 옛 API를 참조해 **tsc 전역은 이 시점에 깨져 있는 것이 정상**이다(Task 3에서 선다). vitest는 임포트 그래프 단위라 sim 테스트는 돈다.

- [x] **Step 10: 커밋**

제목: `feat: 영역을 칠한 타일에서 파생한다 — 밀폐 판정·OUTDOORS·Region.doors 삭제`

---

## Task 2: r.type 옵셔널 방어의 죽은 코드 정리 (sim 폴더)

`Region.type`이 필수가 되면서 `r.type &&`·`r.type !== undefined`·`.filter(r => r.type)` 류가 죽은 코드가 됐다.

**Files:**
- Modify: `src/sim/spots.ts` · `src/sim/patientFlow.ts` · `src/sim/needs.ts` · `src/sim/emergency.ts` (grep으로 실제 위치 확인)

- [x] **Step 1: 죽은 방어를 찾는다**

Run: `npx eslint src/sim --rule '...'` 대신 grep: `r.type ===`는 살아 있는 검사이므로 두고, **truthiness 검사**(`r.type &&`, `r.type ?`, `.filter(r => r.type)`, `r.type !== undefined`)만 걷어낸다. 각 자리에서 주변 주석이 "용도 없는 영역"을 언급하면 그 주석도 함께 고친다.

- [x] **Step 2: sim 테스트 + 커밋**

Run: `npx vitest run src/sim` → PASS.
제목: `refactor: 용도 없는 영역이 사라져 죽은 방어를 걷어낸다`

(걷어낼 것이 없으면 이 Task는 커밋 없이 종료하고 그 사실을 보고한다.)

> 📌 **실행 기록 — 이 Task는 커밋 없이 종료됐다(실측 0건).** 위 **Files**가 지목한 `spots.ts`·`patientFlow.ts`·`needs.ts`·`emergency.ts` 어디에도 truthiness 방어가 없었다. 브랜치 base(`233258b`)의 `src/sim` 전체에서 이 패턴에 걸린 것은 **`regions.ts`의 `region.type !== undefined` 한 줄뿐**이고, 그건 Task 1의 전면 재작성이 이미 지웠다. 소비자들은 `Region.type`이 optional이던 시절에도 `r.type === 'WARD'` 같은 **동등 검사**만 써 왔고 그건 필수 승격 뒤에도 그대로 살아 있는 검사다. 계획이 "옵셔널이면 소비자에 방어가 있을 것"이라고 추정한 자리에 실제 코드는 없었다 — **Files 목록이 grep 실측이 아니라 예측이었던 것**이 이 Task가 빈 것의 원인이다(Step 1이 *"grep으로 실제 위치 확인"*이라고 적어 둔 것이 그 자체로 이 Task가 미확정이었다는 표지였다).

---

## Task 3: 화면 배선 — simHud 문구·도달성 체크리스트 · SimGame 도구 · TileMap memo

**Files:**
- Modify: `src/components/simHud.ts` (`buildBlockReason`·`previewLabel`·거부 문구·`setupSteps`)
- Modify: `src/components/simHud.test.ts`
- Modify: `src/components/SimGame.tsx` (`runTool`·roomType 상태·「지정 해제」 버튼·임포트)
- Modify: `src/components/TileMap.tsx` (memo 키)

- [x] **Step 1: simHud 테스트를 먼저 쓴다 (RED)**

`simHud.test.ts`에 추가 — 기존 관례(순수 함수를 직접 부른다)를 따른다:

```ts
  it('지정 해제는 용도·과 없이도 차단되지 않는다', () => {
    expect(buildBlockReason('DESIGNATE', 'ERASE', null)).toBeNull()
  })
  it('용도 지정과 해제의 미리보기 라벨이 갈린다', () => {
    const res = { ok: true, tiles: [0, 1, 2] } as never
    expect(previewLabel('DESIGNATE', res, 'WAITING')).toBe('3칸 — 용도 지정')
    expect(previewLabel('DESIGNATE', res, 'ERASE')).toBe('3칸 — 지정 해제')
  })
  it('벽으로 막혀 입구에서 닿지 않는 영역이 있으면 「길이 닿게 합니다」가 미완이다', () => {
    /* placeRoom으로 방 하나 → 문 타일을 demolish 후 그 자리에 buildWalls(완전 밀폐) →
       setupSteps에서 해당 단계 done=false + alert에 개수. 문을 다시 내면 done=true. */
  })
  it('열린 영역(벽 없는 접수처)은 길 경고를 내지 않는다', () => {
    /* freshWorld에 paintZone만으로 RECEPTION을 칠하고 setupSteps의 길 단계가 걸리지 않음 */
  })
```

Run: `npx vitest run src/components/simHud.test.ts` → FAIL 확인.

- [x] **Step 2: simHud를 고친다**

1. `buildBlockReason` — 시그니처의 roomType을 `RoomType | 'ERASE' | null`로 넓히고, `'ERASE'`면 `null`(차단 없음)을 먼저 반환. **`'ERASE'`라는 UI 전용 값이 `RoomType`에 섞이지 않는 것이 계약이다** — 코어(`paintZone`)는 이 값을 모른다.
2. `previewLabel` — 세 번째 인자 `roomType?: RoomType | 'ERASE' | null`을 받아 DESIGNATE에서 `'ERASE'`면 `${n}칸 — 지정 해제`.
3. 거부 문구 표(831행 근처)에서 `OUTDOORS: …` 항목을 지운다(코어 타입에서 사라져 tsc가 여기를 가리킨다).
4. `setupSteps` — `sealed` 계산(`r.doors.size === 0`)을 도달성으로 교체:

```ts
  // 입구에서 닿지 않는 영역 — 문 강제는 사라졌지만 "벽으로 두르고 문을 잊는" 실수는 남는다.
  // 그때 화면에는 멀쩡한 방으로 보여 이유를 영영 못 찾는 문제(옛 밀실 경고의 존재 이유)도
  // 그대로이므로, 단계를 지우지 않고 판정만 밀폐→도달성으로 바꾼다(설계 §5).
  const reach = reachableTiles(w, blocked)
  const unreachable = regions.filter(r => ![...r.tiles].some(t => reach.has(t))).length
```

파일 하단에 헬퍼를 신설한다(순수·결정론 — 이 파일의 다른 판정과 같은 결):

```ts
/** 입구에서 4방으로 닿는 통행 가능 타일 — 벽·막는 가구가 경계다. 문은 통행 가능이라 지나간다. */
function reachableTiles(w: SimWorld, blocked: Set<number>): Set<number> {
  const start = tileIndex(ENTRANCE.x, ENTRANCE.y)
  const reach = new Set<number>()
  if (blocked.has(start)) return reach
  const stack = [start]
  reach.add(start)
  while (stack.length > 0) {
    const cur = stack.pop()!
    const cx = cur % GRID_W, cy = (cur - (cur % GRID_W)) / GRID_W
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue
      const ni = tileIndex(nx, ny)
      if (reach.has(ni) || blocked.has(ni)) continue
      reach.add(ni)
      stack.push(ni)
    }
  }
  return reach
}
```

(`ENTRANCE`·`GRID_W`·`GRID_H`는 이미 이 파일 임포트 그래프에 있다 — 없으면 `world`에서 더한다. 기존에 같은 역할의 도달성 유틸이 sim에 이미 있으면 **그것을 재사용하고 신설하지 않는다** — 구현 전에 grep으로 확인할 것.)

5. 체크리스트 문구 3곳:
   - no-waiting hint: `'[용도] > [대기실]로 바닥을 드래그해 칠하고 → [의자]를 채웁니다. 벽은 두르고 싶을 때만 두릅니다.'`
   - sealed-rooms 단계 → key는 유지하되 label `'모든 영역에 길이 닿게 합니다'`, hint `'벽으로 두른 영역에는 [문]을 내세요. 입구에서 걸어서 닿아야 환자와 의사가 들어갑니다.'`, done `regions.length > 0 && unreachable === 0`, alert `` `길이 닿지 않는 영역 ${unreachable}개 — 벽에 문을 내세요` ``
   - no-exam hint·no-cashier hint에서 벽 전제 표현을 칠하기 표현으로(각 문구는 기존 문장 구조를 유지하며 최소 수정).

- [x] **Step 3: SimGame을 고친다**

1. 임포트: `designateRegion` → `paintZone, eraseZone`.
2. roomType 상태: `useState<RoomType | "ERASE" | null>` — `buildBlockReason`·`previewLabel` 호출부는 시그니처가 이미 받는다(Step 2). `runTool`:

```tsx
    if (t === "DESIGNATE") {
      if (roomType === "ERASE") return eraseZone(world, tiles);
      // roomType은 `ready`가 보장한다 — 진료실이면 과까지(코어는 과 없는 EXAM에 던진다).
      return paintZone(world, tiles, roomType, examDept ?? undefined);
    }
```

(`tiles[0]`이 아니라 **드래그 전체**를 넘기는 것이 이 변경의 요지다. 드래그·미리보기·commit 파이프라인은 이미 FILL 사각형을 만들고 있으므로(`rectModeOf('DESIGNATE') === 'FILL'`) 손대지 않는다.)

> 📌 **실행 기록 — 이 괄호 안의 전제가 틀렸다.** `rectModeOf`가 `'FILL'`을 내는 것은 맞지만 그 앞에 **`isDragTool`이라는 관문**이 따로 있었고, 그게 `tool !== 'DOOR' && tool !== 'DESIGNATE'`로 DESIGNATE를 **명시적으로 제외**하고 있었다 — 즉 파이프라인이 사각형을 만들 준비가 돼 있어도 DESIGNATE는 애초에 드래그로 진입하지 못한다. 이 한 줄을 `tool !== 'DOOR'`로 고치지 않으면 이번 설계의 핵심 조작(드래그로 칠하기)이 **아예 열리지 않는다**. 스펙 §4는 *"`BuildTool`의 `DESIGNATE`가 드래그형 도구로 바뀐다(현행은 클릭형)"*라고 이 항목을 명시했는데 계획서가 옮기면서 빠뜨렸고, 대신 *"손대지 않는다"*라는 반대 문장을 적었다 — **계획이 "안 건드린다"고 단언한 자리가 가장 위험하다**(그 단언이 구현자에게 확인 면제로 읽힌다). 구현자가 설계 §4를 대조해 잡았다(`b4288e5`).
>
> 함께 기록 — Step 2가 지시한 `buildBlockReason`의 `'ERASE'` 조기 반환은 **넣지 않았다**. 돌연변이 실측 결과 넣으나 빼나 관측이 안 바뀐다(`'ERASE'`는 `null`도 `'EXAM'`도 아니라 기존 분기를 그냥 통과한다) — 태어날 때부터 죽은 방어라 코드 대신 주석으로 사실만 남겼다.
3. 용도 목록(ROOM_TYPES.map 아래)에 「지정 해제」 버튼을 같은 스타일로 추가 — `aria-pressed={roomType === "ERASE"}`, 클릭 시 `setRoomType(cur => cur === "ERASE" ? null : "ERASE"); setExamDept(null)`. 목록 위 안내 주석(*"벽이 방을 만드는 게 아니라 용도가 만든다"*)을 새 사실로 갱신: 용도가 **곧** 영역이다 — 벽 없이도 칠하면 생긴다.
4. `previewLabel` 호출부에 `roomType` 전달.

- [x] **Step 4: TileMap memo 키를 zones로 교체한다**

```tsx
  const { walls, doors, zones } = world;
  const { terrain, roomCount } = useMemo(() => {
    const regions = computeRegions({ zones });
    …
  }, [walls, doors, zones, regionOverlay]);
```

- memo 키 주석(*"walls·doors·designations 셋뿐"*)을 갱신한다: 벽·문은 **지형(벽 렌더)** 때문에 키에 남고, 영역 파생의 키는 이제 `zones` 하나다.
- `regionAt`(벽 색 빌리기)·조명 중심·오버레이 라벨은 `regions` 파생이라 손대지 않는다.

- [x] **Step 5: 전체 게이트**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: 전부 통과(기존 lint 경고 2건 외 신규 0). **tsc가 여기서 처음으로 전역 초록이 된다.**

- [x] **Step 6: 커밋**

제목: `feat: 용도를 드래그로 칠한다 — 지정 해제·도달성 경고·문구 갱신`

---

## Task 4: 전체 회귀·브라우저 실측·문서·PR

- [x] **Step 1: 결정론 회귀** — `npx vitest run && npx tsc --noEmit && npm run lint && npm run build` 전부 통과.

- [x] **Step 2: 프로브** — `npm run probe`. placeRoom의 벽·문·가구는 불변이고 칠 파생이 옛 성분과 같은 집합이므로 **12주 장부가 변경 전과 동일**해야 한다. 다르면 파생이 어긋난 것이다(Task 1 Step 9의 전제가 깨진 것 — 되돌아가 읽는다).

- [ ] **Step 3: 브라우저 실측** (코디네이터 수행 — 확인 목록):
  1. **접수처를 문 없이**: 카운터를 놓고 주변 바닥을 RECEPTION으로 칠하면 간호사가 창구에 서고 수납이 돈다 — 이 설계의 존재 이유.
  2. 열린 대기실(벽 없음)에 환자가 와 앉는다.
  3. 이어 칠하면 오버레이에서 한 영역으로, 가운데를 해제하면 둘로 갈린다.
  4. 벽으로 두르고 문을 안 낸 영역 → 「길이 닿게 합니다」 경고, 문 내면 해소.
  5. 다른 용도를 겹쳐 칠하면 그 타일만 새 용도가 된다.
  6. 개원 준비 체크리스트의 새 문구.

- [x] **Step 4: 문서 세트**
  - `claude-docs/changeLog.md` 맨 위 항목(왜/무엇을 — PR 번호 없이).
  - `claude-docs/plan.md` — 해당 항목 ✅ (있으면) + 이 작업 항목 추가.
  - `docs/concept/structural-problems-checklist.md` — 확인(표현·조작 층이라 변경 없을 것으로 예상).
  - 1분+ 디버깅 함정이 있었으면 `claude-docs/troubleshooting/T-###` 신설(번호는 **머지된 main 기준 최대+1**을 실측 — 동시 브랜치 충돌 전례가 T-139·T-140 재번호 사건이다) + 허브 재생성.
  - 계획서 체크박스 갱신.

- [ ] **Step 5: PR** (코디네이터 수행) — push 후 `gh pr create --base main`(본문은 `--body-file` UTF-8 경유). 머지는 사용자 승인 후.

---

## 자체 검토 결과

**스펙 커버리지** — §1 결정 4건: 드래그 칠(T3-3) · 나중 칠 우선(T1-5) · 지정 해제(T1-5·T3) · A안 파생(T1-4). §2 데이터(T1-3·4) · §3 규칙(T1-5) · §4 화면(T3-3·4) · §5 체크리스트(T3-2) · §6 테스트 전략(T1-1·8, T3-1) 전부 태스크에 대응. §8 미해결 2건은 의도적으로 태스크 없음(구현 중 실측 판단).

**타입 일관성** — `ZonePaint`는 world.ts 정의를 build.ts·regions.ts가 임포트. `'ERASE'`는 simHud·SimGame의 UI 층에만 존재하고 코어 시그니처(`paintZone`)에 없음(T3-2의 계약 문장). `previewLabel`·`buildBlockReason`의 확장 시그니처가 T3-1 테스트·T3-3 호출부와 일치.

**플레이스홀더** — build.test(T1-8)와 simHud.test(T3-1)의 두 케이스가 주석 스케치다: 단언 골격과 픽스처 요령(어느 헬퍼로 세계를 만드는지)은 명시했고, 구체 좌표는 구현자가 정한다 — 좌표까지 박으면 픽스처 충돌 시 계획이 거짓말이 된다.
