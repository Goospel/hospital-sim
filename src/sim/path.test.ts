import { describe, it, expect } from 'vitest'
import { placeRoom } from './testHelpers'
import { buildWalls, placeFurniture } from './build'
import { createWorld, isWalkable, tileIndex, GRID_W, GRID_H, type SimWorld } from './world'
import { findPath, buildBlockedSet, type Pt } from './path'

/** 경로가 폰이 실제로 밟을 수 있는 걸음인지 — Task 4 이동이 의존하는 계약.
 *  통행 판정 오라클은 world의 isWalkable을 쓴다(테스트 대상인 buildBlockedSet로 자기 자신을 재지 않는다). */
function expectWalkable(world: SimWorld, from: Pt, path: Pt[]): void {
  let prev = from
  for (const t of path) {
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.y).toBeGreaterThanOrEqual(0)
    expect(t.x).toBeLessThan(GRID_W)
    expect(t.y).toBeLessThan(GRID_H)
    expect(Math.abs(t.x - prev.x) + Math.abs(t.y - prev.y)).toBe(1) // 4방향 한 칸씩 — 순간이동 없음
    expect(isWalkable(world, t.x, t.y)).toBe(true)                  // 벽·가구를 밟지 않음
    prev = t
  }
}

describe('findPath', () => {
  it('장애물 없으면 맨해튼 최단 경로(길이 = |dx|+|dy|)', () => {
    const w = createWorld(1)
    const p = findPath(w, { x: 2, y: 2 }, { x: 6, y: 5 })
    expect(p).not.toBeNull()
    expect(p!.length).toBe(4 + 3)
    expect(p![p!.length - 1]).toEqual({ x: 6, y: 5 })
    expectWalkable(w, { x: 2, y: 2 }, p!)
  })
  it('방 안으로는 문을 통해서만 들어간다', () => {
    const placed = placeRoom(createWorld(1), { type: 'EXAM', x: 10, y: 10, w: 6, h: 5 })
    if (!placed.ok) throw new Error('전제 실패')
    const p = findPath(placed.world, { x: 2, y: 2 }, { x: 12, y: 12 }) // 방 내부로
    expect(p).not.toBeNull()
    expect(p!).toContainEqual({ x: 13, y: 14 }) // doorTile(10,10,6,5) = (13,14)
    expectWalkable(placed.world, { x: 2, y: 2 }, p!)
  })
  it('우회 거리가 최적이다 — 문 앞까지 돌아가는 8칸 손해를 정확히 감수한다', () => {
    // 이 숫자가 "최단"을 강제하는 유일한 계측기다. 장애물 없는 격자에서는 어떤 탐욕적 탐색도
    // 맨해튼 길이를 맞히므로, 우회가 강제되는 형상이라야 f = g + h 의 g가 살아 있는지 드러난다.
    //   방 (10,10,6,5)의 문 (13,14) 바깥 이웃은 (13,15)뿐 — (12,14)·(14,14)는 벽이다.
    //   (2,2)→(13,15) 24 + 문 1 + 문→(12,12) 3 = 28. 직선 맨해튼 20보다 8 멀다.
    const placed = placeRoom(createWorld(1), { type: 'EXAM', x: 10, y: 10, w: 6, h: 5 })
    if (!placed.ok) throw new Error('전제 실패')
    const p = findPath(placed.world, { x: 2, y: 2 }, { x: 12, y: 12 })
    expect(p!.length).toBe(28)
  })
  it('도달 불가면 null', () => {
    const w = createWorld(1)
    // 목적지를 벽 타일로 — 방 모서리
    const placed = placeRoom(w, { type: 'EXAM', x: 10, y: 10, w: 6, h: 5 })
    if (!placed.ok) throw new Error('전제 실패')
    expect(findPath(placed.world, { x: 2, y: 2 }, { x: 10, y: 10 })).toBeNull()
  })
  it('그리드 밖 목적지는 null — 판이 원환처럼 이어지지 않는다', () => {
    // 경계 검사가 없으면 인덱스 y*GRID_W+x 가 접힌다: (GRID_W, 1) → 96 → (0, 2).
    // 그러면 맵 밖 타일이 "빈 칸"으로 보여 폰이 그리드 밖으로 걸어나간다.
    const w = createWorld(1)
    expect(findPath(w, { x: 1, y: 1 }, { x: GRID_W, y: 1 })).toBeNull()
    expect(findPath(w, { x: 1, y: 1 }, { x: -1, y: 5 })).toBeNull()
    expect(findPath(w, { x: 1, y: 1 }, { x: 5, y: GRID_H })).toBeNull()
  })
  it('출발 = 도착이면 빈 경로', () => {
    expect(findPath(createWorld(1), { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([])
  })
  it('출발 = 도착이면 그 타일이 막혀 있어도 빈 경로 — 이동 0이지 도달 불가가 아니다', () => {
    // 가구가 방금 깔린 자리에 폰이 서 있는 상황. "못 간다(null)"가 아니라 "갈 필요 없다([])".
    const placed = placeRoom(createWorld(1), { type: 'EXAM', x: 10, y: 10, w: 6, h: 5 })
    if (!placed.ok) throw new Error('전제 실패')
    const wall = { x: 10, y: 10 } // 방 모서리 — 통행 불가 타일
    expect(isWalkable(placed.world, wall.x, wall.y)).toBe(false)
    expect(findPath(placed.world, wall, wall)).toEqual([])
  })
  it('막힌 타일에서 출발해도 걸어 나온다 — from은 선검사하지 않는다(의도된 비대칭)', () => {
    // 가구·벽이 나중에 깔려 폰이 끼는 경우를 위한 탈출 경로. to만 통행 선검사하는 비대칭이 그 의도다.
    const placed = placeRoom(createWorld(1), { type: 'EXAM', x: 10, y: 10, w: 6, h: 5 })
    if (!placed.ok) throw new Error('전제 실패')
    const stuck = { x: 10, y: 10 } // 방 모서리 벽 — 폰이 낀 자리
    expect(isWalkable(placed.world, stuck.x, stuck.y)).toBe(false)
    const out = { x: 2, y: 2 }
    const p = findPath(placed.world, stuck, out)
    expect(p).not.toBeNull()
    expect(p![p!.length - 1]).toEqual(out)
    expectWalkable(placed.world, stuck, p!) // 첫 걸음부터는 전부 통행 가능 타일
  })
  it('결정론 — 같은 입력이면 같은 경로', () => {
    const w = createWorld(1)
    const a = findPath(w, { x: 1, y: 1 }, { x: 20, y: 20 })
    const b = findPath(w, { x: 1, y: 1 }, { x: 20, y: 20 })
    expect(a).toEqual(b)
  })
  it('결정론 — 경로 자체가 고정이다 (동률은 탐색 순서 = push 순서로 갈린다)', () => {
    // 같은 함수를 두 번 부르는 위 테스트는 순수함수인 이상 무엇을 바꿔도 통과한다(공허).
    // 동률 최단경로가 여럿인 형상에서 **어느 것을 고르는지**를 못박아야 결정론이 계측된다 —
    // 탐색 방향 순서나 동률 처리를 건드리면 여기서 깨진다. Task 4·5의 폰 위치가 이 선택에 달려 있다.
    expect(findPath(createWorld(1), { x: 2, y: 2 }, { x: 6, y: 5 })).toEqual([
      { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, // 먼저 오른쪽으로
      { x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 },                 // 그다음 아래로
    ])
  })
})

describe('buildBlockedSet', () => {
  it('전 타일에서 isWalkable과 일치한다 (홀수 폭 방 포함)', () => {
    const placed = placeRoom(createWorld(1), { type: 'EXAM', x: 10, y: 10, w: 7, h: 5 })
    if (!placed.ok) throw new Error('전제 실패')
    const blocked = buildBlockedSet(placed.world)
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      expect(!blocked.has(y * GRID_W + x)).toBe(isWalkable(placed.world, x, y))
    }
  })
  it('방에 속하지 않는 **자유 벽**도 그대로 막는다 — 통행은 방이 아니라 타일이 정한다', () => {
    // 벽 도구는 사각형을 요구하지 않는다(설계 PR 2). 통행 판정이 방 사각형을 되짚는 구현으로
    // 되돌아가면 여기서 깨진다: 홀로 선 벽 한 줄이 아무것도 막지 않게 된다.
    const walls = buildWalls(createWorld(1), [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }])
    if (!walls.ok) throw new Error('전제 실패 — 벽')
    const chair = placeFurniture(walls.world, 'CHAIR', [{ x: 10, y: 12 }])
    if (!chair.ok) throw new Error('전제 실패 — 의자')
    const w = chair.world
    const asc = (s: Set<number>) => [...s].sort((a, b) => a - b)
    expect(asc(buildBlockedSet(w))).toEqual(asc(new Set([
      tileIndex(10, 10), tileIndex(11, 10), tileIndex(12, 10), tileIndex(10, 12),
    ])))
  })
})
