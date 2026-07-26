import { describe, it, expect } from 'vitest'
import {
  GRID_W, GRID_H, createWorld, isWalkable, blockedPerimeter, doorTile,
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
  it('가구가 놓인 타일은 통행 불가', () => {
    const w = {
      ...createWorld(1),
      furniture: [{ kind: 'DESK' as const, x: 6, y: 6, roomId: 'r1' }],
    }
    expect(isWalkable(w, 6, 6)).toBe(false)
    expect(isWalkable(w, 6, 7)).toBe(true)
  })
  it('문 타일(아래 벽 중앙)은 통행 가능', () => {
    const w = { ...createWorld(1), rooms: [room()] }
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

describe('blockedPerimeter', () => {
  it('둘레 타일 전부에서 문 하나를 뺀다', () => {
    const tiles = blockedPerimeter(room())
    // 둘레 = 2*(6+5) - 4 = 18, 문 1개 제외 = 17
    expect(tiles.length).toBe(17)
    expect(tiles).not.toContainEqual(doorTile(room()))
  })
})
