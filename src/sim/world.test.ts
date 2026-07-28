import { describe, it, expect } from 'vitest'
import { GRID_W, GRID_H, createWorld, isWalkable, type SimWorld } from './world'
import { placeRoom, wallTiles, doorTile, type RoomSpec } from './testHelpers'

const room = (over: Partial<RoomSpec> = {}): RoomSpec => ({
  type: 'EXAM', x: 4, y: 4, w: 6, h: 5, ...over,
})

/** 통행 판정은 `walls`를 읽는다 — 세계에 방 목록 같은 건 없다(벽·문 타일이 전부다).
 *  픽스처는 반드시 건설 도구를 경유한다(테스트 헬퍼 placeRoom이 그 조합이다). */
function withRoom(over: Partial<RoomSpec> = {}): SimWorld {
  const r = room(over)
  const res = placeRoom(createWorld(1), { type: r.type, x: r.x, y: r.y, w: r.w, h: r.h })
  if (!res.ok) throw new Error(`전제 실패 — 건설 거부(${res.reason})`)
  return res.world
}

describe('createWorld', () => {
  it('빈 부지로 시작한다 — 벽·문·용도 0, 가구 0, 폰 0, 개원 자본 5억(만원 단위)', () => {
    const w = createWorld(7)
    expect(w.walls.size).toBe(0)
    expect(w.doors.size).toBe(0)
    expect(w.designations).toEqual([])
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
    const w = withRoom()
    expect(isWalkable(w, 4, 4)).toBe(false)   // 모서리 벽
    expect(isWalkable(w, 6, 4)).toBe(false)   // 위 벽
    expect(isWalkable(w, 6, 6)).toBe(true)    // 내부
  })
  it('가구가 놓인 타일은 통행 불가', () => {
    const w = {
      ...createWorld(1),
      furniture: [{ kind: 'DESK' as const, x: 6, y: 6, roomId: 'r1' }],
    }
    expect(isWalkable(w, 6, 6)).toBe(false)
    expect(isWalkable(w, 6, 7)).toBe(true)
  })
  it('문 타일(아래 벽 중앙)은 통행 가능', () => {
    const w = withRoom()
    const d = doorTile(room())
    expect(d).toEqual({ x: 7, y: 8 })         // x: 4 + floor(6/2), y: 4+5-1
    expect(isWalkable(w, d.x, d.y)).toBe(true)
  })
})

describe('doorTile', () => {
  it('홀수 폭 방의 문은 정중앙 타일이다 (floor)', () => {
    const d = doorTile(room({ w: 5 }))
    expect(d).toEqual({ x: 4 + 2, y: 4 + 5 - 1 }) // floor(5/2)=2 — ceil이면 x:7로 어긋난다
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
