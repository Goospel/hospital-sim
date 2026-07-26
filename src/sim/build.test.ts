import { describe, it, expect } from 'vitest'
import { createWorld, isWalkable, doorTile, GRID_W, GRID_H, type FurnitureKind, type RoomType } from './world'
import { placeRoom, roomCostManwon, MIN_ROOM_W, MIN_ROOM_H, FURNITURE_OF } from './build'

const KINDS: FurnitureKind[] = ['DESK', 'CHAIR', 'BED', 'COUNTER']

describe('placeRoom', () => {
  it('유효 배치 — 방·자동 가구·잔고 차감이 한 번에 반영된다', () => {
    const w0 = createWorld(1)
    const res = placeRoom(w0, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 4, y: 4, w: 6, h: 5 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.world.rooms).toHaveLength(1)
    expect(res.world.rooms[0].dept).toBe('INTERNAL_MEDICINE') // 과 지정이 방에 실려 간다
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
    if (res.ok) return
    expect(res.reason).toBe('OVERLAP')
  })
  it('맞닿기만 하고 겹치지 않으면 허용한다 — 벽을 나란히 붙일 수 있어야 한다', () => {
    const first = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    if (!first.ok) throw new Error('전제 실패')
    // 첫 방은 x 4..9 를 쓴다 — 바로 다음 칸 x:10 은 겹치지 않는다
    const res = placeRoom(first.world, { type: 'WAITING', x: 4 + 6, y: 4, w: 6, h: 5 })
    expect(res.ok).toBe(true)
  })
  it('그리드 가장자리 1타일 여백을 침범하면 거부한다', () => {
    const res = placeRoom(createWorld(1), { type: 'EXAM', x: 0, y: 4, w: 6, h: 5 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('OUT_OF_BOUNDS')
  })
  it('반대쪽(우·하) 가장자리 여백도 지킨다 — 마지막 열/행에 닿으면 거부', () => {
    const right = placeRoom(createWorld(1), { type: 'EXAM', x: GRID_W - 1 - 6, y: 4, w: 6, h: 5 })
    expect(right.ok).toBe(true) // 여백 딱 한 칸 남김 — 허용
    const tooRight = placeRoom(createWorld(1), { type: 'EXAM', x: GRID_W - 6, y: 4, w: 6, h: 5 })
    expect(tooRight.ok).toBe(false)
    if (tooRight.ok) return
    expect(tooRight.reason).toBe('OUT_OF_BOUNDS')
    const tooLow = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: GRID_H - 5, w: 6, h: 5 })
    expect(tooLow.ok).toBe(false)
    if (tooLow.ok) return
    expect(tooLow.reason).toBe('OUT_OF_BOUNDS')
  })
  it('잔고 부족이면 거부한다', () => {
    const broke = { ...createWorld(1), treasuryManwon: 100 }
    const res = placeRoom(broke, { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('NO_MONEY')
  })
  it('잔고가 비용과 정확히 같으면 허용한다 — 마지막 한 푼까지 쓴다', () => {
    const exact = { ...createWorld(1), treasuryManwon: roomCostManwon(6, 5) }
    const res = placeRoom(exact, { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.world.treasuryManwon).toBe(0)
  })
  it('방마다 고유 id를 받고 가구가 그 id를 가리킨다', () => {
    const first = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    if (!first.ok) throw new Error('전제 실패')
    const second = placeRoom(first.world, { type: 'WARD', x: 20, y: 4, w: 6, h: 5 })
    if (!second.ok) throw new Error('전제 실패')
    const [a, b] = second.world.rooms
    expect(a.id).not.toBe(b.id)
    const owners = new Set(second.world.furniture.map(f => f.roomId))
    expect(owners).toEqual(new Set([a.id, b.id]))
  })
  it('WAITING은 내부에 의자를 깔고, WARD는 침대를 놓는다', () => {
    expect(FURNITURE_OF.WAITING).toBe('CHAIR')
    expect(FURNITURE_OF.WARD).toBe('BED')
    const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 8, h: 6 })
    if (!res.ok) throw new Error('전제 실패')
    expect(res.world.furniture.every(f => f.kind === 'CHAIR')).toBe(true)
    expect(res.world.furniture.length).toBeGreaterThanOrEqual(4)
  })
  it('모든 방 종류가 유효한 가구를 낳는다 — 종류 누락으로 정체불명 가구가 생기지 않는다', () => {
    const types: RoomType[] = ['EXAM', 'WARD', 'WAITING', 'LOUNGE', 'RECEPTION']
    for (const type of types) {
      const res = placeRoom(createWorld(1), { type, x: 4, y: 4, w: 6, h: 5 })
      if (!res.ok) throw new Error(`전제 실패: ${type}`)
      expect(res.world.furniture.length).toBeGreaterThan(0)
      for (const f of res.world.furniture) expect(KINDS).toContain(f.kind)
    }
  })
  it('가구는 서로 같은 타일에 겹치지 않는다', () => {
    const types: RoomType[] = ['EXAM', 'WARD', 'WAITING', 'LOUNGE', 'RECEPTION']
    for (const type of types) {
      for (const [w, h] of [[MIN_ROOM_W, MIN_ROOM_H], [6, 5], [8, 6]]) {
        const res = placeRoom(createWorld(1), { type, x: 4, y: 4, w, h })
        if (!res.ok) throw new Error(`전제 실패: ${type} ${w}x${h}`)
        const tiles = res.world.furniture.map(f => `${f.x},${f.y}`)
        expect(new Set(tiles).size).toBe(tiles.length)
      }
    }
  })
  it('문 안쪽 타일은 가구가 막지 않는다 — 문으로 드나들 수 있어야 한다', () => {
    // 6×5 대기실: 한 칸 걸러 배치가 문 안쪽(7,7)에 정확히 걸리는 크기
    const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 6, h: 5 })
    if (!res.ok) throw new Error('전제 실패')
    const door = doorTile(res.world.rooms[0])
    expect(isWalkable(res.world, door.x, door.y)).toBe(true)      // 문 자체
    expect(isWalkable(res.world, door.x, door.y - 1)).toBe(true)  // 문 바로 안쪽
  })
})
