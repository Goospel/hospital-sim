// 영역(Region) 인식 — 벽·문에서 파생하는 순수 계산의 계약.
// 여기서 재는 것은 "무엇이 방인가"의 정의다: 둘러싸였으면 방, 새면 마당.
import { describe, it, expect } from 'vitest'
import { createWorld, tileIndex, type SimWorld } from './world'
import { computeRegions } from './regions'

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
