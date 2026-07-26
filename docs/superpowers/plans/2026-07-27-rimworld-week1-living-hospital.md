---
tags:
  - type/plan
---

# 림월드형 재설계 1주차 — "돌아가는 병원" 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타일 그리드 병원에서 방을 드래그로 짓고, 환자가 스스로 걸어 들어와 대기·진료·수납 후 나가며, 의사가 자동으로 진료하는 실시간(일시정지/배속) 시뮬 슬라이스 하나를 완성한다.

**Architecture:** 새 모듈 `src/sim/`에 순수 함수 시뮬 코어(`tick(world, minutes)` 결정론)를 TDD로 세우고, 렌더는 `src/components/TileMap.tsx` + 새 라우트 `app/sim/page.tsx`로 분리한다(기존 게임은 건드리지 않고 공존 — 스왑은 2주차 말). 기존 `src/game/`의 경제 상수·시드 유틸(`seededUnit`)·픽셀 스프라이트를 재사용한다.

**Tech Stack:** Next.js(App Router, 정적 export 유지) · TypeScript · vitest · Tailwind. 신규 라이브러리 0개(A*도 직접 구현 — 그리드가 작다).

**공통 규약(모든 태스크):**
- 커밋 메시지는 한글 — `.commit-msg-tmp`에 UTF-8로 쓰고 `git commit -F .commit-msg-tmp`(T-026). 트레일러 필수(빈 줄 없이 연속):
  ```
  Skills-used: superpowers:test-driven-development
  Plugins-used: superpowers
  Skill-benefit: TDD — 결정론 시뮬 코어를 회귀로 잠금
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
- 게이트: 각 태스크 마지막에 `npx vitest run` 전체 green + `npx tsc --noEmit` 0 에러.
- 새 md 문서를 만들면 frontmatter `tags: [type/...]` 필수(pre-commit이 거부한다).

---

### Task 1: 타일 세계 타입 + 통행 판정 (`src/sim/world.ts`)

**Files:**
- Create: `src/sim/world.ts`
- Test: `src/sim/world.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/sim/world.test.ts
import { describe, it, expect } from 'vitest'
import {
  GRID_W, GRID_H, createWorld, isWalkable, wallTiles, doorTile,
  type Room,
} from './world'

const room = (over: Partial<Room> = {}): Room => ({
  id: 'r1', type: 'EXAM', x: 4, y: 4, w: 6, h: 5, ...over,
})

describe('createWorld', () => {
  it('빈 부지로 시작한다 — 방 0, 가구 0, 폰 0, 개원 자본 5억(만원 단위)', () => {
    const w = createWorld(7)
    expect(w.rooms).toEqual([])
    expect(w.furniture).toEqual([])
    expect(w.pawns).toEqual([])
    expect(w.treasuryManwon).toBe(50_000)
    expect(w.seed).toBe(7)
    expect(w.minute).toBe(0)
  })
})

describe('isWalkable', () => {
  it('그리드 밖은 통행 불가', () => {
    const w = createWorld(1)
    expect(isWalkable(w, -1, 0)).toBe(false)
    expect(isWalkable(w, GRID_W, 0)).toBe(false)
    expect(isWalkable(w, 0, GRID_H)).toBe(false)
  })
  it('빈 부지는 전부 통행 가능', () => {
    const w = createWorld(1)
    expect(isWalkable(w, 10, 10)).toBe(true)
  })
  it('방 둘레(벽)는 통행 불가, 내부는 가능', () => {
    const w = { ...createWorld(1), rooms: [room()] }
    expect(isWalkable(w, 4, 4)).toBe(false)   // 모서리 벽
    expect(isWalkable(w, 6, 4)).toBe(false)   // 위 벽
    expect(isWalkable(w, 6, 6)).toBe(true)    // 내부
  })
  it('문 타일(아래 벽 중앙)은 통행 가능', () => {
    const w = { ...createWorld(1), rooms: [room()] }
    const d = doorTile(room())
    expect(d).toEqual({ x: 7, y: 8 })         // x: 4 + floor(6/2), y: 4+5-1
    expect(isWalkable(w, d.x, d.y)).toBe(true)
  })
})

describe('wallTiles', () => {
  it('둘레 타일 전부에서 문 하나를 뺀다', () => {
    const tiles = wallTiles(room())
    // 둘레 = 2*(6+5) - 4 = 18, 문 1개 제외 = 17
    expect(tiles.length).toBe(17)
    expect(tiles).not.toContainEqual(doorTile(room()))
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/sim/world.test.ts` / Expected: FAIL (모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
// src/sim/world.ts
// 타일 세계 — 순수 데이터와 통행 판정. 렌더·React 임포트 금지.
import type { DeptKey } from '@/game/types'

export const GRID_W = 48
export const GRID_H = 32
export const INITIAL_TREASURY_MANWON = 50_000 // 개원 자본 5억(기존 경제와 동일 단위)

export type RoomType = 'EXAM' | 'WARD' | 'WAITING' | 'LOUNGE' | 'RECEPTION'

export interface Room {
  id: string
  type: RoomType
  dept?: DeptKey // EXAM만 사용(과 지정) — 1주차에선 미지정 허용
  x: number; y: number; w: number; h: number
}

export type FurnitureKind = 'DESK' | 'CHAIR' | 'BED' | 'COUNTER'
export interface Furniture { kind: FurnitureKind; x: number; y: number; roomId: string }

export interface SimWorld {
  minute: number   // 개장(09:00)부터의 게임 분. 0..DAY_LENGTH_MIN
  day: number      // 1부터
  treasuryManwon: number
  rooms: Room[]
  furniture: Furniture[]
  pawns: import('./pawn').Pawn[]
  nextId: number   // 폰·방 id 시퀀스
  seed: number
}

export function createWorld(seed: number): SimWorld {
  return {
    minute: 0, day: 1, treasuryManwon: INITIAL_TREASURY_MANWON,
    rooms: [], furniture: [], pawns: [], nextId: 1, seed,
  }
}

export function doorTile(r: Room): { x: number; y: number } {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + r.h - 1 }
}

export function wallTiles(r: Room): Array<{ x: number; y: number }> {
  const door = doorTile(r)
  const out: Array<{ x: number; y: number }> = []
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) {
    const onEdge = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1
    if (onEdge && !(x === door.x && y === door.y)) out.push({ x, y })
  }
  return out
}

export function isWalkable(w: SimWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false
  for (const r of w.rooms) {
    for (const t of wallTiles(r)) if (t.x === x && t.y === y) return false
  }
  for (const f of w.furniture) if (f.x === x && f.y === y) return false
  return true
}
```

주의: `pawn.ts`는 Task 4에서 생긴다 — Task 1 시점에는 순환을 피하려고 `pawns: import('./pawn').Pawn[]` 대신 임시로 `pawns: unknown[]`로 두고, Task 4에서 타입을 바꾼다.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/sim/world.test.ts` / Expected: PASS
- [ ] **Step 5: 커밋** — `feat: 타일 세계 골격 — 그리드·방·벽/문 통행 판정` (공통 규약대로 `.commit-msg-tmp` 경유)

---

### Task 2: 방 건설 (`src/sim/build.ts`)

**Files:**
- Create: `src/sim/build.ts`
- Test: `src/sim/build.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/sim/build.test.ts
import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { placeRoom, roomCostManwon, MIN_ROOM_W, MIN_ROOM_H, FURNITURE_OF } from './build'

describe('placeRoom', () => {
  it('유효 배치 — 방·자동 가구·잔고 차감이 한 번에 반영된다', () => {
    const w0 = createWorld(1)
    const res = placeRoom(w0, { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.world.rooms).toHaveLength(1)
    // EXAM 자동 가구: 책상 1 + 진료의자 1
    expect(res.world.furniture.map(f => f.kind).sort()).toEqual(['CHAIR', 'DESK'])
    expect(res.world.treasuryManwon).toBe(50_000 - roomCostManwon(6, 5))
  })
  it('타일당 50만원 — 6×5 방은 1,500만원', () => {
    expect(roomCostManwon(6, 5)).toBe(1_500)
  })
  it('최소 크기 미만이면 거부한다', () => {
    const res = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: 4, w: MIN_ROOM_W - 1, h: MIN_ROOM_H })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('TOO_SMALL')
  })
  it('기존 방과 겹치면 거부한다', () => {
    const first = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    if (!first.ok) throw new Error('전제 실패')
    const res = placeRoom(first.world, { type: 'WAITING', x: 8, y: 6, w: 6, h: 5 })
    expect(res.ok).toBe(false)
  })
  it('그리드 가장자리 1타일 여백을 침범하면 거부한다', () => {
    const res = placeRoom(createWorld(1), { type: 'EXAM', x: 0, y: 4, w: 6, h: 5 })
    expect(res.ok).toBe(false)
  })
  it('잔고 부족이면 거부한다', () => {
    const broke = { ...createWorld(1), treasuryManwon: 100 }
    const res = placeRoom(broke, { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('NO_MONEY')
  })
  it('WAITING은 내부에 의자를 깔고, WARD는 침대를 놓는다', () => {
    expect(FURNITURE_OF.WAITING).toBe('CHAIR')
    expect(FURNITURE_OF.WARD).toBe('BED')
    const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 8, h: 6 })
    if (!res.ok) throw new Error('전제 실패')
    expect(res.world.furniture.every(f => f.kind === 'CHAIR')).toBe(true)
    expect(res.world.furniture.length).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/sim/build.test.ts` / Expected: FAIL

- [ ] **Step 3: 최소 구현**

```ts
// src/sim/build.ts
// 방 단위 건설 — 검증·비용·가구 자동 배치. 전부 순수 함수.
import { GRID_W, GRID_H, type Room, type RoomType, type SimWorld, type Furniture } from './world'

export const MIN_ROOM_W = 4
export const MIN_ROOM_H = 4
export const COST_PER_TILE_MANWON = 50

export const FURNITURE_OF: Partial<Record<RoomType, 'CHAIR' | 'BED'>> = {
  WAITING: 'CHAIR', WARD: 'BED',
}

export function roomCostManwon(w: number, h: number): number {
  return w * h * COST_PER_TILE_MANWON
}

export type PlaceResult =
  | { ok: true; world: SimWorld }
  | { ok: false; reason: 'TOO_SMALL' | 'OUT_OF_BOUNDS' | 'OVERLAP' | 'NO_MONEY' }

function overlaps(a: Room, b: Omit<Room, 'id'>): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** 내부 타일에 가구를 자동 배치한다.
 *  EXAM: 좌상단 내부에 DESK+CHAIR / RECEPTION: COUNTER 1
 *  WAITING: 내부를 한 칸 걸러 CHAIR / WARD: 위쪽 벽 안쪽에 한 칸 걸러 BED
 *  LOUNGE: CHAIR 2 (휴게) */
function autoFurniture(room: Room): Furniture[] {
  const ix = room.x + 1, iy = room.y + 1 // 내부 좌상단
  const iw = room.w - 2, ih = room.h - 2
  const out: Furniture[] = []
  if (room.type === 'EXAM') {
    out.push({ kind: 'DESK', x: ix, y: iy, roomId: room.id })
    out.push({ kind: 'CHAIR', x: ix + 1, y: iy, roomId: room.id })
  } else if (room.type === 'RECEPTION') {
    out.push({ kind: 'COUNTER', x: ix, y: iy, roomId: room.id })
  } else if (room.type === 'LOUNGE') {
    out.push({ kind: 'CHAIR', x: ix, y: iy, roomId: room.id })
    out.push({ kind: 'CHAIR', x: ix + 2 <= room.x + room.w - 2 ? ix + 2 : ix, y: iy, roomId: room.id })
  } else {
    const kind = FURNITURE_OF[room.type]!
    for (let dx = 0; dx < iw; dx += 2) for (let dy = 0; dy < ih; dy += 2) {
      out.push({ kind, x: ix + dx, y: iy + dy, roomId: room.id })
    }
  }
  // 문 앞 타일을 가구가 막지 않게 — 문 바로 안쪽 칸은 비운다
  const doorInsideX = room.x + Math.floor(room.w / 2), doorInsideY = room.y + room.h - 2
  return out.filter(f => !(f.x === doorInsideX && f.y === doorInsideY))
}

export function placeRoom(world: SimWorld, spec: { type: RoomType; dept?: Room['dept']; x: number; y: number; w: number; h: number }): PlaceResult {
  if (spec.w < MIN_ROOM_W || spec.h < MIN_ROOM_H) return { ok: false, reason: 'TOO_SMALL' }
  if (spec.x < 1 || spec.y < 1 || spec.x + spec.w > GRID_W - 1 || spec.y + spec.h > GRID_H - 1)
    return { ok: false, reason: 'OUT_OF_BOUNDS' }
  if (world.rooms.some(r => overlaps(r, spec))) return { ok: false, reason: 'OVERLAP' }
  const cost = roomCostManwon(spec.w, spec.h)
  if (cost > world.treasuryManwon) return { ok: false, reason: 'NO_MONEY' }
  const room: Room = { id: `room-${world.nextId}`, ...spec }
  return {
    ok: true,
    world: {
      ...world,
      nextId: world.nextId + 1,
      treasuryManwon: world.treasuryManwon - cost,
      rooms: [...world.rooms, room],
      furniture: [...world.furniture, ...autoFurniture(room)],
    },
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/sim/build.test.ts` / Expected: PASS
- [ ] **Step 5: 커밋** — `feat: 방 건설 — 사각형 배치·검증·비용·가구 자동`

---

### Task 3: A* 길찾기 (`src/sim/path.ts`)

**Files:**
- Create: `src/sim/path.ts`
- Test: `src/sim/path.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/sim/path.test.ts
import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { placeRoom } from './build'
import { findPath } from './path'

describe('findPath', () => {
  it('장애물 없으면 맨해튼 최단 경로(길이 = |dx|+|dy|)', () => {
    const w = createWorld(1)
    const p = findPath(w, { x: 2, y: 2 }, { x: 6, y: 5 })
    expect(p).not.toBeNull()
    expect(p!.length).toBe(4 + 3)
    expect(p![p!.length - 1]).toEqual({ x: 6, y: 5 })
  })
  it('방 안으로는 문을 통해서만 들어간다', () => {
    const placed = placeRoom(createWorld(1), { type: 'EXAM', x: 10, y: 10, w: 6, h: 5 })
    if (!placed.ok) throw new Error('전제 실패')
    const p = findPath(placed.world, { x: 2, y: 2 }, { x: 12, y: 12 }) // 방 내부로
    expect(p).not.toBeNull()
    expect(p!).toContainEqual({ x: 13, y: 14 }) // doorTile(10,10,6,5) = (13,14)
  })
  it('도달 불가면 null', () => {
    const w = createWorld(1)
    // 목적지를 벽 타일로 — 방 모서리
    const placed = placeRoom(w, { type: 'EXAM', x: 10, y: 10, w: 6, h: 5 })
    if (!placed.ok) throw new Error('전제 실패')
    expect(findPath(placed.world, { x: 2, y: 2 }, { x: 10, y: 10 })).toBeNull()
  })
  it('출발 = 도착이면 빈 경로', () => {
    expect(findPath(createWorld(1), { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([])
  })
  it('결정론 — 같은 입력이면 같은 경로', () => {
    const w = createWorld(1)
    const a = findPath(w, { x: 1, y: 1 }, { x: 20, y: 20 })
    const b = findPath(w, { x: 1, y: 1 }, { x: 20, y: 20 })
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/sim/path.test.ts` / Expected: FAIL

- [ ] **Step 3: 최소 구현** — 4방향 A*, 휴리스틱 = 맨해튼, 타이브레이크는 삽입 순서(결정론). 우선순위 큐 없이 배열 정렬로 충분(그리드 48×32).

```ts
// src/sim/path.ts
// 그리드 A* — 4방향, 맨해튼 휴리스틱, 결정론(타이브레이크 = push 순서).
import { isWalkable, type SimWorld } from './world'

export interface Pt { x: number; y: number }

const DIRS: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
const key = (p: Pt) => `${p.x},${p.y}`

export function findPath(world: SimWorld, from: Pt, to: Pt): Pt[] | null {
  if (from.x === to.x && from.y === to.y) return []
  if (!isWalkable(world, to.x, to.y)) return null
  const h = (p: Pt) => Math.abs(p.x - to.x) + Math.abs(p.y - to.y)
  interface Node { p: Pt; g: number; f: number; order: number }
  const open: Node[] = [{ p: from, g: 0, f: h(from), order: 0 }]
  const came = new Map<string, Pt>()
  const gScore = new Map<string, number>([[key(from), 0]])
  let pushOrder = 1
  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f || a.order - b.order)
    const cur = open.shift()!
    if (cur.p.x === to.x && cur.p.y === to.y) {
      const path: Pt[] = []
      let k: Pt | undefined = cur.p
      while (k && !(k.x === from.x && k.y === from.y)) {
        path.unshift(k)
        k = came.get(key(k))
      }
      return path
    }
    for (const d of DIRS) {
      const nx = { x: cur.p.x + d.x, y: cur.p.y + d.y }
      if (!isWalkable(world, nx.x, nx.y)) continue
      const ng = cur.g + 1
      if (ng < (gScore.get(key(nx)) ?? Infinity)) {
        gScore.set(key(nx), ng)
        came.set(key(nx), cur.p)
        open.push({ p: nx, g: ng, f: ng + h(nx), order: pushOrder++ })
      }
    }
  }
  return null
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/sim/path.test.ts` / Expected: PASS
- [ ] **Step 5: 커밋** — `feat: 그리드 A* 길찾기 — 4방향·결정론 타이브레이크`

---

### Task 4: 폰 + 틱 엔진 (`src/sim/pawn.ts`, `src/sim/tick.ts`)

**Files:**
- Create: `src/sim/pawn.ts`, `src/sim/tick.ts`
- Modify: `src/sim/world.ts` (`pawns: unknown[]` → `Pawn[]`)
- Test: `src/sim/tick.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/sim/tick.test.ts
import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { spawnDoctor, PAWN_TILES_PER_MIN, type Pawn } from './pawn'
import { tick } from './tick'
import { findPath } from './path'

describe('폰 이동', () => {
  it('경로를 분당 PAWN_TILES_PER_MIN 타일씩 소비한다', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    const doc = w.pawns[0]
    const path = findPath(w, { x: 2, y: 2 }, { x: 2, y: 12 })!
    w = { ...w, pawns: [{ ...doc, path }] }
    const after = tick(w, 3) // 3분 × 2타일 = 6타일 전진
    expect(after.pawns[0].path.length).toBe(10 - 3 * PAWN_TILES_PER_MIN)
    expect(after.pawns[0].y).toBe(2 + 3 * PAWN_TILES_PER_MIN)
  })
  it('경로가 다 떨어지면 제자리', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 5, y: 5 })
    const after = tick(w, 10)
    expect(after.pawns[0]).toMatchObject({ x: 5, y: 5, path: [] })
  })
})

describe('결정론', () => {
  it('같은 시드·같은 분이면 tick 결과가 완전 동일하다', () => {
    const run = () => {
      let w = createWorld(42)
      w = spawnDoctor(w, 'SURGERY', { x: 3, y: 3 })
      for (let i = 0; i < 60; i++) w = tick(w, 1)
      return w
    }
    expect(run()).toEqual(run())
  })
  it('한 번에 60분 = 1분씩 60번 (시간 분할 불변식)', () => {
    let a = createWorld(9); let b = createWorld(9)
    a = spawnDoctor(a, 'SURGERY', { x: 3, y: 3 })
    b = spawnDoctor(b, 'SURGERY', { x: 3, y: 3 })
    for (let i = 0; i < 60; i++) b = tick(b, 1)
    expect(tick(a, 60)).toEqual(b)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/sim/tick.test.ts` / Expected: FAIL

- [ ] **Step 3: 최소 구현**

```ts
// src/sim/pawn.ts
import type { DeptKey } from '@/game/types'
import type { SimWorld } from './world'
import type { Pt } from './path'

export const PAWN_TILES_PER_MIN = 2

export type PawnKind = 'DOCTOR' | 'PATIENT'
export type PatientStage =
  | 'ENTERING' | 'WAITING' | 'TO_EXAM' | 'IN_EXAM' | 'PAYING' | 'LEAVING' | 'GONE' | 'LEFT_WAITING'

export interface Pawn {
  id: string
  kind: PawnKind
  x: number; y: number
  path: Pt[]
  // DOCTOR
  dept?: DeptKey
  roomId?: string          // 배정된 진료실
  // PATIENT
  stage?: PatientStage
  arrivedMin?: number      // 대기 시작 시각(인내 계산)
  examUntilMin?: number
  doctorId?: string
}

export function spawnDoctor(w: SimWorld, dept: DeptKey, at: Pt): SimWorld {
  const p: Pawn = { id: `doc-${w.nextId}`, kind: 'DOCTOR', x: at.x, y: at.y, path: [], dept }
  return { ...w, nextId: w.nextId + 1, pawns: [...w.pawns, p] }
}

/** 경로를 분 예산만큼 소비 — tick의 이동 절반 */
export function stepMove(p: Pawn, minutes: number): Pawn {
  const steps = Math.min(p.path.length, minutes * PAWN_TILES_PER_MIN)
  if (steps === 0) return p
  const nextPos = p.path[steps - 1]
  return { ...p, x: nextPos.x, y: nextPos.y, path: p.path.slice(steps) }
}
```

```ts
// src/sim/tick.ts
// 시뮬 심장 — tick(world, minutes). 1분 단위로 쪼개 처리해 시간 분할 불변식을 지킨다.
import { type SimWorld } from './world'
import { stepMove } from './pawn'

export function tick(world: SimWorld, minutes: number): SimWorld {
  let w = world
  for (let i = 0; i < minutes; i++) w = tickOneMinute(w)
  return w
}

function tickOneMinute(world: SimWorld): SimWorld {
  const moved = world.pawns.map(p => stepMove(p, 1))
  return { ...world, minute: world.minute + 1, pawns: moved }
}
```

`world.ts`의 `pawns` 타입을 `Pawn[]`로 바꾸고 `import type { Pawn } from './pawn'`을 추가한다(값 임포트가 아니라 순환 무해).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/sim/tick.test.ts src/sim/world.test.ts` / Expected: PASS
- [ ] **Step 5: 커밋** — `feat: 폰·틱 엔진 — 이동과 시간 분할 불변식`

---

### Task 5: 환자 흐름 — 도착·대기·진료·이탈 (`src/sim/patientFlow.ts` + `tick.ts` 확장)

**Files:**
- Create: `src/sim/patientFlow.ts`
- Modify: `src/sim/tick.ts`
- Test: `src/sim/patientFlow.test.ts`

동작 정의(1주차 절단): 환자는 입구(그리드 아래 중앙 `ENTRANCE = {x: 24, y: 31}`)에서 스폰 → 대기실 빈 의자로 걸음(`WAITING`) → 빈 진료실+유휴 의사가 있으면 배정돼 진료실로(`TO_EXAM`→`IN_EXAM`, `EXAM_DURATION_MIN = 20`분) → 끝나면 수납 없이 바로 퇴장(`LEAVING`, 수납은 RECEPTION 방이 있으면 경유 — 없으면 생략) → 입구 타일 도달 시 `GONE`(배열에서 제거). 진료 종료 시 `treasuryManwon += EXAM_REVENUE_MANWON(30)`. 대기 `PATIENCE_MIN = 90`분 초과 시 `LEFT_WAITING`으로 퇴장(수익 0, `world.leftCount` 증가). 도착 생성은 `seededUnit`(기존 `src/game/daysim.ts` 재사용)으로 분당 확률 판정 — 주간(0..480분)에 평균 8분당 1명.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/sim/patientFlow.test.ts
import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { placeRoom } from './build'
import { spawnDoctor } from './pawn'
import { tick } from './tick'
import { EXAM_REVENUE_MANWON, PATIENCE_MIN } from './patientFlow'

function hospitalWorld(seed: number) {
  let w = createWorld(seed)
  const r1 = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!r1.ok) throw new Error('전제 실패')
  const r2 = placeRoom(r1.world, { type: 'EXAM', x: 6, y: 6, w: 6, h: 5 })
  if (!r2.ok) throw new Error('전제 실패')
  return spawnDoctor(r2.world, 'INTERNAL_MEDICINE', { x: 8, y: 8 })
}

describe('환자 흐름', () => {
  it('하루를 돌리면 환자가 도착하고, 진료가 발생해 수익이 쌓인다', () => {
    let w = hospitalWorld(3)
    const t0 = w.treasuryManwon
    for (let i = 0; i < 600; i++) w = tick(w, 1)
    expect(w.stats.examsDone).toBeGreaterThan(0)
    expect(w.treasuryManwon).toBe(t0 + w.stats.examsDone * EXAM_REVENUE_MANWON)
  })
  it('불변식: 의사 0명이면 진료 0건', () => {
    let w = createWorld(3)
    const r = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
    if (!r.ok) throw new Error('전제 실패')
    w = r.world
    for (let i = 0; i < 600; i++) w = tick(w, 1)
    expect(w.stats.examsDone).toBe(0)
  })
  it('대기실이 없으면 환자가 들어오자마자 이탈로 집계된다', () => {
    let w = createWorld(3)
    for (let i = 0; i < 600; i++) w = tick(w, 1)
    expect(w.stats.examsDone).toBe(0)
    expect(w.stats.leftCount).toBeGreaterThan(0)
  })
  it(`인내 ${PATIENCE_MIN}분 초과 대기자는 LEFT_WAITING으로 떠난다`, () => {
    // 의사 없음 + 대기실만 — 전원이 인내 초과로 떠나야 한다
    let w = createWorld(3)
    const r = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
    if (!r.ok) throw new Error('전제 실패')
    w = r.world
    for (let i = 0; i < 600; i++) w = tick(w, 1)
    const stillWaiting = w.pawns.filter(p => p.stage === 'WAITING')
    for (const p of stillWaiting) expect(w.minute - p.arrivedMin!).toBeLessThanOrEqual(PATIENCE_MIN)
  })
  it('결정론: 같은 시드면 하루 결과 동일', () => {
    const run = () => { let w = hospitalWorld(11); for (let i = 0; i < 600; i++) w = tick(w, 1); return w }
    expect(run()).toEqual(run())
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/sim/patientFlow.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현**

`world.ts`의 `SimWorld`에 `stats: { examsDone: number; leftCount: number }`를 추가(`createWorld`에서 `{ examsDone: 0, leftCount: 0 }`), `patientFlow.ts`에 아래를 구현하고 `tick.ts`의 `tickOneMinute`가 이동 후 이를 호출하게 한다:

```ts
// src/sim/patientFlow.ts
// 환자 라이프사이클 — 도착·대기·배정·진료·이탈. tick에서 분당 1회 호출.
import { seededUnit } from '@/game/daysim'
import { findPath, type Pt } from './path'
import { doorTile, type SimWorld, type Room } from './world'
import type { Pawn } from './pawn'

export const ENTRANCE: Pt = { x: 24, y: 31 }
export const EXAM_DURATION_MIN = 20
export const EXAM_REVENUE_MANWON = 30
export const PATIENCE_MIN = 90
export const ARRIVAL_WINDOW_MIN = 480      // 주간에만 도착
export const ARRIVAL_PROB_PER_MIN = 1 / 8  // 평균 8분당 1명

export function stepPatients(world: SimWorld): SimWorld {
  let w = maybeArrive(world)
  w = assignWaitingToExam(w)
  w = progressStages(w)
  return w
}
```

`maybeArrive`: `world.minute < ARRIVAL_WINDOW_MIN`이고 `seededUnit(world.seed * 100_000 + world.day * 1_000 + world.minute) < ARRIVAL_PROB_PER_MIN`이면 환자 스폰. 빈 의자(대기실 CHAIR 중 다른 환자가 목표로 점유하지 않은 것)가 없으면 스폰 즉시 `stats.leftCount + 1`(입구에서 발길 돌림 — 폰 생성 생략). 있으면 `stage: 'ENTERING'`, 그 의자로 `findPath`.

`assignWaitingToExam`: `stage === 'WAITING'`인 환자(도착순)와 유휴 의사(자기 `roomId` 있는 EXAM 방 안, 담당 환자 없음)를 짝지어 환자를 `TO_EXAM`(경로 = 그 방 문→책상 옆), `doctorId` 기록. 의사 `roomId` 배정: 매분 시작 시 방 없는 의사를 빈 EXAM 방에 순서대로 배정하고 그 방 책상 앞으로 경로를 준다.

`progressStages`: 각 환자 stage 전이 —
- `ENTERING`: `path.length === 0`이면 `WAITING`, `arrivedMin = minute`.
- `WAITING`: `minute - arrivedMin > PATIENCE_MIN`이면 `LEFT_WAITING`(경로 = 입구, `stats.leftCount + 1`).
- `TO_EXAM`: 도착하면 `IN_EXAM`, `examUntilMin = minute + EXAM_DURATION_MIN`.
- `IN_EXAM`: `minute >= examUntilMin`이면 `LEAVING`(경로 = 입구), `stats.examsDone + 1`, `treasuryManwon += EXAM_REVENUE_MANWON`, 의사 유휴 복귀.
- `LEAVING`/`LEFT_WAITING`: 입구 도달 시 배열에서 제거.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/sim` / Expected: 전부 PASS
- [ ] **Step 5: 커밋** — `feat: 환자 흐름 — 도착·대기·자동 진료·인내 이탈`

---

### Task 6: 렌더 + 시간 조작 (`src/components/TileMap.tsx`, `app/sim/page.tsx`, `src/components/useSimClock.ts`)

**Files:**
- Create: `src/components/TileMap.tsx`, `src/components/useSimClock.ts`, `app/sim/page.tsx`
- Test: `src/components/useSimClock.test.ts`(로직만) + 브라우저 실측

동작 정의: 타일 16px(뷰포트 768×512, 모바일은 가로 스크롤 허용 — 1주차 절단). 방=색 사각형+벽 테두리+문 표시, 가구=이모지 대신 기존 `PixelSprite` 계열 SVG(의자·침대·책상 간단 도형). 폰 = 절대 좌표 div + CSS transition(기존 아바타 방식 재사용). 상단 바: 시각(기존 `formatClockFromOpen` 재사용)·금고·오늘 진료/이탈 수·일시정지/1×/3× 버튼. 하단 바: 방 타입 5개 버튼 → 드래그로 사각형 → `placeRoom` 성공 시 반영, 거부 시 사유 토스트. 건설 중에는 자동 일시정지.

- [ ] **Step 1: `useSimClock` 실패 테스트** — 로직: `MS_PER_GAME_MIN = 50`(기존 상수 재사용), 배속 3×면 50/3ms당 1분, 일시정지면 진행 0. `advance(elapsedMs)`가 몇 분을 tick해야 하는지 계산하는 순수 함수 `minutesToTick(elapsedMs, speed)`를 테스트:

```ts
// src/components/useSimClock.test.ts
import { describe, it, expect } from 'vitest'
import { minutesToTick } from './useSimClock'

describe('minutesToTick', () => {
  it('1×: 50ms당 1분, 나머지는 이월', () => {
    expect(minutesToTick(120, 1)).toEqual({ minutes: 2, carryMs: 20 })
  })
  it('3×: 같은 실시간에 3배의 게임 분', () => {
    expect(minutesToTick(100, 3)).toEqual({ minutes: 6, carryMs: 0 })
  })
  it('0×(일시정지): 항상 0분, 이월도 0', () => {
    expect(minutesToTick(500, 0)).toEqual({ minutes: 0, carryMs: 0 })
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/components/useSimClock.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현** — `minutesToTick`은 순수 함수로 export, 훅 본체는 `requestAnimationFrame` 루프에서 `minutesToTick` 결과만큼 `setWorld(w => tick(w, minutes))`. `TileMap.tsx`·`app/sim/page.tsx`는 위 동작 정의대로(코드는 기존 `HospitalMap.tsx`의 절대 좌표+transition 패턴을 따른다). 드래그는 `onPointerDown/Move/Up`으로 시작·현재 타일 좌표를 잡아 미리보기 사각형을 그린다.
- [ ] **Step 4: 게이트+실측** — `npx vitest run` 전체 green, `npx tsc --noEmit` 0, `npm run build` 성공. 브라우저(`/sim`): 방 3종 건설 → 환자 걸어 들어옴 → 진료 → 금고 증가 → 3× 배속 → 일시정지, 콘솔 에러 0.
- [ ] **Step 5: 커밋** — `feat: 타일 병원 렌더 — 드래그 건설·실시간·배속·일시정지`

---

### Task 7: 마무리 게이트 — 문서·plan 갱신

**Files:**
- Modify: `claude-docs/plan.md`(🔜 항목 갱신), `claude-docs/changeLog.md`(맨 위 한 항목)

- [ ] **Step 1**: plan.md의 「다음」에 이 슬라이스 완료를 ✅로, 2주차 계획(욕구·우선순위·경제 이식·스토리텔러)을 🔜로 기재.
- [ ] **Step 2**: changeLog.md 맨 위에 `## 2026-XX-XX · 림월드형 1주차 — 돌아가는 병원` 항목(왜/무엇만, PR 번호 없이 — 프로젝트 규약).
- [ ] **Step 3**: 전체 게이트 재확인(`npx vitest run`·`npx tsc --noEmit`·`npm run build`) 후 커밋 — `docs: plan·changeLog 갱신 — 림월드형 1주차 슬라이스`.

---

## Self-Review 기록

- **스펙 커버리지**: §1(그리드·틱·배속) → Task 1·4·6 / §2(폰·환자 흐름·길찾기) → Task 3·4·5 / §3(방 건설·비용·인과 ①의자 수) → Task 2·5 / §3 인과 ②거리·③휴게실, §2 욕구·우선순위, §4 스토리텔러, §5 경제 완전 이식 → **의도적으로 2주차 계획으로 이월**(이 계획은 1주차 슬라이스). LOUNGE 방 타입은 이번 주에 껍데기만 존재(가구만) — 욕구가 없어서 아직 기능 없음, 스펙 §6 일정과 일치.
- **플레이스홀더 스캔**: Task 5 Step 3·Task 6 Step 3은 전체 코드 대신 동작 정의 + 함수 계약으로 서술 — UI·오케스트레이션 코드는 테스트가 계약을 잠그므로 구현 재량 허용(순수 로직은 전부 코드 제시함).
- **타입 일관성**: `SimWorld.stats`는 Task 5에서 추가되는데 Task 1 테스트는 `stats`를 단언하지 않음 — 충돌 없음. `Pawn` 타입은 Task 4에서 단일 정의, Task 5는 그 필드만 사용. `seededUnit`·`formatClockFromOpen`·`MS_PER_GAME_MIN`은 기존 `src/game/` 실존 심볼 확인 완료.
