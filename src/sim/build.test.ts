import { describe, it, expect } from 'vitest'
import { createWorld, isWalkable, doorTile, tileIndex, GRID_W, GRID_H, type FurnitureKind, type RoomType } from './world'
import { placeRoom, roomCostManwon, MIN_ROOM_W, MIN_ROOM_H, FURNITURE_OF } from './build'
import { computeRegions } from './regions'

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
  it('최소 방 크기는 4×4다', () => {
    expect(MIN_ROOM_W).toBe(4)
    expect(MIN_ROOM_H).toBe(4)
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
    // 세로도 같다 — 첫 방은 y 4..8 을 쓰므로 y:9 부터는 겹치지 않는다
    const below = placeRoom(first.world, { type: 'WARD', x: 4, y: 4 + 5, w: 6, h: 5 })
    expect(below.ok).toBe(true)
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
  it('방마다 고유 id를 받고, 가구는 **좌표로** 제 방 영역에 속한다', () => {
    // 옛 계약은 "가구가 방 id를 가리킨다"였다. 그 필드는 사라졌다(설계 §1-1) — 소속을 말하는
    // 것은 이제 좌표뿐이라, 재는 방식도 "그 가구 타일이 그 방 영역 안에 있는가"로 바뀐다.
    const first = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    if (!first.ok) throw new Error('전제 실패')
    const second = placeRoom(first.world, { type: 'WARD', x: 20, y: 4, w: 6, h: 5 })
    if (!second.ok) throw new Error('전제 실패')
    const [a, b] = second.world.rooms
    expect(a.id).not.toBe(b.id)
    const regions = computeRegions(second.world)
    expect(regions).toHaveLength(2)
    // 가구가 하나도 남김없이 어느 한 영역에 담긴다 — 벽 위·문 위에 놓인 가구가 없다는 뜻이다.
    for (const f of second.world.furniture) {
      const owners = regions.filter(r => r.tiles.has(tileIndex(f.x, f.y)))
      expect(owners).toHaveLength(1)
    }
    // 그리고 두 영역 다 제 몫을 받았다(한쪽이 통째로 비어 위 단언이 헛돌지 않았다).
    for (const r of regions) {
      expect(second.world.furniture.some(f => r.tiles.has(tileIndex(f.x, f.y)))).toBe(true)
    }
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
    const types: RoomType[] = ['EXAM', 'WARD', 'WAITING', 'LOUNGE', 'RECEPTION', 'CAFETERIA']
    for (const type of types) {
      const res = placeRoom(createWorld(1), { type, x: 4, y: 4, w: 6, h: 5 })
      if (!res.ok) throw new Error(`전제 실패: ${type}`)
      expect(res.world.furniture.length).toBeGreaterThan(0)
      for (const f of res.world.furniture) expect(KINDS).toContain(f.kind)
    }
  })
  it('가구는 서로 같은 타일에 겹치지 않는다', () => {
    const types: RoomType[] = ['EXAM', 'WARD', 'WAITING', 'LOUNGE', 'RECEPTION', 'CAFETERIA']
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
  it('홀수 폭 방에서도 문 안쪽이 뚫려 있다 — 문 위치를 재유도하면 여기서 어긋난다', () => {
    // 7×5: floor(7/2)=3 과 ceil(7/2)=4 가 갈리는 폭. 짝수 폭 방만 재면 이 어긋남이 안 보인다.
    const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 7, h: 5 })
    if (!res.ok) throw new Error('전제 실패')
    const door = doorTile(res.world.rooms[0])
    const inside = { x: door.x, y: door.y - 1 }
    expect(res.world.furniture).not.toContainEqual(expect.objectContaining(inside))
    expect(isWalkable(res.world, inside.x, inside.y)).toBe(true)
  })
})

// 어댑터 — 선언형 방(rooms)이 새 지형 모델(벽·문·용도앵커)도 함께 낳는다.
// 이 겹치기가 스트랭글러의 전부다: 소비자를 하나씩 영역 기반으로 옮기는 동안 두 모델이 같은
// 세계를 말해야 한다. 여기가 깨지면 "방은 있는데 영역이 없는" 세계가 조용히 생긴다.
describe('placeRoom — 새 지형 모델 어댑터', () => {
  it('벽·문·앵커를 낳아 computeRegions가 그 방을 그대로 인식한다', () => {
    const res = placeRoom(createWorld(1), { type: 'EXAM', dept: 'CARDIOLOGY', x: 4, y: 4, w: 6, h: 5 })
    if (!res.ok) throw new Error('전제 실패')
    const rs = computeRegions(res.world)
    expect(rs).toHaveLength(1)
    expect(rs[0].tiles.size).toBe((6 - 2) * (5 - 2)) // 내부 타일 = (w-2)*(h-2)
    expect(rs[0].type).toBe('EXAM')
    expect(rs[0].dept).toBe('CARDIOLOGY')
    const door = doorTile(res.world.rooms[0])
    expect([...rs[0].doors]).toEqual([tileIndex(door.x, door.y)]) // 문은 정확히 하나
    expect(res.world.walls.has(tileIndex(door.x, door.y))).toBe(false) // 문은 벽이 아니다
  })
  it('EXAM이 아닌 방의 앵커에는 과가 실리지 않는다 — 방과 같은 규칙이다', () => {
    const res = placeRoom(createWorld(1), { type: 'WAITING', dept: 'CARDIOLOGY', x: 4, y: 4, w: 6, h: 5 })
    if (!res.ok) throw new Error('전제 실패')
    expect(res.world.designations[0].dept).toBeUndefined()
    expect(computeRegions(res.world)[0].dept).toBeUndefined()
  })
  it('방을 여럿 지으면 영역도 그만큼 — 벽 집합이 방마다 누적된다', () => {
    let w = createWorld(1)
    for (const spec of [
      { type: 'EXAM' as const, x: 4, y: 4, w: 6, h: 5 },
      { type: 'WAITING' as const, x: 20, y: 4, w: 8, h: 6 },
      { type: 'WARD' as const, x: 4, y: 20, w: 4, h: 4 },
    ]) {
      const r = placeRoom(w, spec)
      if (!r.ok) throw new Error('전제 실패')
      w = r.world
    }
    expect(computeRegions(w).map(r => r.type)).toEqual(['EXAM', 'WAITING', 'WARD'])
  })
  it('용도 앵커는 문 바로 안쪽 타일 — 가구가 절대 안 놓이는 자리라 항상 유효하다', () => {
    // 홀수 폭까지 — 문 위치를 재유도하면 앵커가 벽 위로 새고 영역이 용도를 잃는다.
    for (const [w, h] of [[MIN_ROOM_W, MIN_ROOM_H], [6, 5], [7, 5], [8, 6]]) {
      const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w, h })
      if (!res.ok) throw new Error(`전제 실패 ${w}x${h}`)
      const door = doorTile(res.world.rooms[0])
      expect(res.world.designations[0].at).toEqual({ x: door.x, y: door.y - 1 })
      expect(computeRegions(res.world)[0].type).toBe('WAITING')
    }
  })
})
