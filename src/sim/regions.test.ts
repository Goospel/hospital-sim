// 영역(Region) 인식 — 벽·문에서 파생하는 순수 계산의 계약.
// 여기서 재는 것은 "무엇이 방인가"의 정의다: 둘러싸였으면 방, 새면 마당.
import { describe, it, expect } from 'vitest'
import { createWorld, tileIndex, type SimWorld } from './world'
import { computeRegions, computeRegionsUncached } from './regions'

const idx = (x: number, y: number) => tileIndex(x, y)

/** 사각 테두리 타일 — 손세계의 벽을 세우는 유일한 도구(공식을 테스트마다 다시 쓰지 않는다) */
function rectWalls(x: number, y: number, w: number, h: number): number[] {
  const out: number[] = []
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
    if (tx === x || tx === x + w - 1 || ty === y || ty === y + h - 1) out.push(idx(tx, ty))
  }
  return out
}

const worldWith = (over: Partial<SimWorld>): SimWorld => ({ ...createWorld(1), ...over })

/** 6×5 밀실 (10,10) — 내부는 x 11..14, y 11..13 의 12타일 */
const ROOM = { x: 10, y: 10, w: 6, h: 5 }
const ROOM_INSIDE: number[] = []
for (let y = 11; y <= 13; y++) for (let x = 11; x <= 14; x++) ROOM_INSIDE.push(idx(x, y))

describe('computeRegions', () => {
  it('빈 부지에는 영역이 없다 — 전부 격자 가장자리에 닿는 마당이다', () => {
    expect(computeRegions(createWorld(1))).toEqual([])
  })

  it('사방이 벽인 밀실은 영역 하나 — 내부 타일만 담고 벽은 담지 않는다', () => {
    const w = worldWith({ walls: new Set(rectWalls(ROOM.x, ROOM.y, ROOM.w, ROOM.h)) })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(1)
    expect([...rs[0].tiles].sort((a, b) => a - b)).toEqual(ROOM_INSIDE)
    expect(rs[0].doors.size).toBe(0)
    expect(rs[0].type).toBeUndefined()
  })

  it('벽이 한 칸 뚫려 있으면 영역이 아니다 — 바깥과 이어져 마당이 된다', () => {
    // 문이 아니라 **벽의 구멍**이다: 문은 경계로 막지만 빈 타일은 안팎을 잇는다.
    const walls = rectWalls(ROOM.x, ROOM.y, ROOM.w, ROOM.h).filter(t => t !== idx(13, 14))
    expect(computeRegions(worldWith({ walls: new Set(walls) }))).toEqual([])
  })

  it('문은 경계다 — 어느 영역에도 속하지 않고, 인접 영역의 doors에 실린다', () => {
    const door = idx(13, 14)
    const w = worldWith({
      walls: new Set(rectWalls(ROOM.x, ROOM.y, ROOM.w, ROOM.h).filter(t => t !== door)),
      doors: new Set([door]),
    })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(1)
    expect([...rs[0].tiles].sort((a, b) => a - b)).toEqual(ROOM_INSIDE) // 문은 내부에 없다
    expect([...rs[0].doors]).toEqual([door])
  })

  it('가운데 벽이 있으면 두 영역, 그 벽을 허물면 하나로 병합된다', () => {
    // 9×5 방(10,10)을 x=14 세로벽으로 가른다 — 내부는 11..13 / 15..17, y 11..13
    const outer = rectWalls(10, 10, 9, 5)
    const divider = [idx(14, 11), idx(14, 12), idx(14, 13)]
    const split = computeRegions(worldWith({ walls: new Set([...outer, ...divider, idx(14, 10), idx(14, 14)]) }))
    expect(split).toHaveLength(2)
    expect(split.map(r => r.tiles.size)).toEqual([9, 9])

    const merged = computeRegions(worldWith({ walls: new Set([...outer, idx(14, 10), idx(14, 14)]) }))
    expect(merged).toHaveLength(1)
    expect(merged[0].tiles.size).toBe(7 * 3) // 가운데 열까지 이어진다
  })

  it('영역 id는 성분 내 최소 타일 인덱스다 — 좌표만으로 정해져 순회 순서에 흔들리지 않는다', () => {
    const outer = rectWalls(10, 10, 9, 5)
    const walls = [...outer, idx(14, 10), idx(14, 11), idx(14, 12), idx(14, 13), idx(14, 14)]
    const rs = computeRegions(worldWith({ walls: new Set(walls) }))
    expect(rs.map(r => r.id)).toEqual([idx(11, 11), idx(15, 11)])
    // 벽 삽입 순서를 뒤집어도 같은 결과 — Set 순회 순서에 의존하지 않는다
    const reversed = computeRegions(worldWith({ walls: new Set([...walls].reverse()) }))
    expect(reversed.map(r => r.id)).toEqual(rs.map(r => r.id))
    expect(reversed.map(r => [...r.tiles].sort((a, b) => a - b))).toEqual(
      rs.map(r => [...r.tiles].sort((a, b) => a - b)),
    )
  })

  it('용도 앵커가 그 영역에 type·dept를 부여한다', () => {
    const w = worldWith({
      walls: new Set(rectWalls(ROOM.x, ROOM.y, ROOM.w, ROOM.h)),
      designations: [{ at: { x: 12, y: 12 }, type: 'EXAM', dept: 'CARDIOLOGY' }],
    })
    const rs = computeRegions(w)
    expect(rs[0].type).toBe('EXAM')
    expect(rs[0].dept).toBe('CARDIOLOGY')
  })

  it('한 영역에 앵커가 둘이면 먼저 지정한 쪽이 이긴다', () => {
    const w = worldWith({
      walls: new Set(rectWalls(ROOM.x, ROOM.y, ROOM.w, ROOM.h)),
      designations: [
        { at: { x: 12, y: 12 }, type: 'WAITING' },
        { at: { x: 13, y: 13 }, type: 'WARD' },
      ],
    })
    expect(computeRegions(w)[0].type).toBe('WAITING')
  })

  it('벽·문·마당 위의 앵커는 무효다 — 어느 영역도 용도를 얻지 않는다', () => {
    const door = idx(13, 14)
    const base = {
      walls: new Set(rectWalls(ROOM.x, ROOM.y, ROOM.w, ROOM.h).filter(t => t !== door)),
      doors: new Set([door]),
    }
    for (const at of [{ x: 10, y: 10 }, { x: 13, y: 14 }, { x: 2, y: 2 }]) {
      const rs = computeRegions(worldWith({ ...base, designations: [{ at, type: 'WARD' }] }))
      expect(rs).toHaveLength(1)
      expect(rs[0].type).toBeUndefined()
    }
  })

  it('무효 앵커가 있어도 뒤의 유효 앵커는 살아 있다 — 하나가 새 나가도 나머지를 잃지 않는다', () => {
    const w = worldWith({
      walls: new Set(rectWalls(ROOM.x, ROOM.y, ROOM.w, ROOM.h)),
      designations: [
        { at: { x: 2, y: 2 }, type: 'WARD' },       // 마당 — 무효
        { at: { x: 12, y: 12 }, type: 'LOUNGE' },
      ],
    })
    expect(computeRegions(w)[0].type).toBe('LOUNGE')
  })

  /*
    캐시(한 칸 memo) — 답을 **바꾸지 않는가**만 잰다. 속도는 여기서 못 재고(측정이 흔들린다),
    캐시가 틀리는 방식은 하나뿐이다: 입력 셋 중 하나가 갈렸는데 옛 답을 그대로 돌려주는 것.
    그래서 세 필드를 각각 혼자 바꿔 보고, 매번 **캐시를 안 거친 계산**과 나란히 놓는다.
  */
  describe('캐시는 답을 바꾸지 않는다', () => {
    /*
      캐시(한 칸 memo)는 **입력 세 필드의 identity**로 맞춘다. 그래서 한 축을 재려면 나머지 둘의
      **참조를 고정**해야 한다 — 안 그러면 어느 쪽이 키에서 빠져도 다른 축이 대신 캐시를 빗나가게
      해서 mutation이 살아남는다. 실제로 첫 판이 그랬다: `createWorld()`가 `doors`·`designations`를
      **매번 새 객체**로 주는 탓에 `worldWith(...)` 두 개는 늘 서로 다른 키였고, 키에서
      designations를 통째로 지워도 세 테스트가 전부 통과했다(돌연변이 생존 실측).
      아래 픽스처가 참조를 상수로 붙들어 그 구멍을 막는다.
    */
    const WALLS = new Set(rectWalls(ROOM.x, ROOM.y, ROOM.w, ROOM.h))
    const WALLS_WIDE = new Set(rectWalls(10, 10, 9, 5))
    const DOOR = idx(13, 14)
    const WALLS_HOLED = new Set([...WALLS].filter(t => t !== DOOR))
    const NO_DOORS: ReadonlySet<number> = new Set()
    const ONE_DOOR: ReadonlySet<number> = new Set([DOOR])
    const NO_DESIG: SimWorld['designations'] = []
    const AS_WARD: SimWorld['designations'] = [{ at: { x: 12, y: 12 }, type: 'WARD' }]
    const AS_LOUNGE: SimWorld['designations'] = [{ at: { x: 12, y: 12 }, type: 'LOUNGE' }]

    /** 세 필드를 **명시한 참조 그대로** 실은 세계 — 나머지는 캐시가 안 보는 값이다. */
    const keyed = (
      walls: ReadonlySet<number>,
      doors: ReadonlySet<number>,
      designations: SimWorld['designations'],
    ): SimWorld => ({ ...createWorld(1), walls, doors, designations })

    const shape = (rs: ReturnType<typeof computeRegions>) =>
      rs.map(r => ({ id: r.id, type: r.type, tiles: [...r.tiles].sort((a, b) => a - b) }))

    it('walls만 갈려도 새로 계산한다 — doors·designations는 같은 참조다', () => {
      const small = keyed(WALLS, NO_DOORS, NO_DESIG)
      expect(shape(computeRegions(small))).toEqual(shape(computeRegionsUncached(small)))
      const wide = keyed(WALLS_WIDE, NO_DOORS, NO_DESIG)
      expect(shape(computeRegions(wide))).toEqual(shape(computeRegionsUncached(wide)))
      // 내부 타일 수가 다르다(4×3 vs 7×3) — 캐시가 walls를 키에서 빠뜨리면 여기서 운다.
      expect(computeRegions(wide)[0].tiles.size).toBe(21)
      expect(computeRegions(small)[0].tiles.size).toBe(12)
    })

    it('doors만 갈려도 새로 계산한다 — 문 하나가 방을 마당으로 가른다', () => {
      const sealed = keyed(WALLS_HOLED, ONE_DOOR, NO_DESIG)
      expect(shape(computeRegions(sealed))).toEqual(shape(computeRegionsUncached(sealed)))
      expect(computeRegions(sealed)).toHaveLength(1)
      // walls·designations는 같은 참조이고 doors만 비웠다 — 벽의 구멍이 안팎을 이어 영역이 없어진다.
      expect(computeRegions(keyed(WALLS_HOLED, NO_DOORS, NO_DESIG))).toEqual([])
    })

    it('designations만 갈려도 새로 계산한다 — 용도가 캐시에 굳지 않는다', () => {
      // walls·doors를 같은 참조로 고정한 채 용도만 갈아 끼운다.
      expect(computeRegions(keyed(WALLS, NO_DOORS, AS_WARD))[0].type).toBe('WARD')
      expect(computeRegions(keyed(WALLS, NO_DOORS, AS_LOUNGE))[0].type).toBe('LOUNGE')
      expect(computeRegions(keyed(WALLS, NO_DOORS, AS_WARD))[0].type).toBe('WARD') // 되돌려도 옛 답이 안 남는다
      expect(computeRegions(keyed(WALLS, NO_DOORS, NO_DESIG))[0].type).toBeUndefined()
    })
  })

  it('벽을 허물어 두 방이 합쳐지면 먼저 지정한 앵커의 용도로 이어진다', () => {
    // 앵커는 좌표라 벽 편집에도 살아남는다 — 병합 후 둘 다 같은 영역을 가리키게 된다.
    const outer = rectWalls(10, 10, 9, 5)
    const w = worldWith({
      walls: new Set([...outer, idx(14, 10), idx(14, 14)]),
      designations: [
        { at: { x: 16, y: 12 }, type: 'WARD' },     // 배열 순서가 우선순위다 — 오른쪽이 먼저
        { at: { x: 12, y: 12 }, type: 'WAITING' },
      ],
    })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(1)
    expect(rs[0].type).toBe('WARD')
  })
})
