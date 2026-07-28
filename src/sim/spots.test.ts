// 가구 열거의 계약 — **소속은 좌표가 말한다**(설계 §1-1).
//
// 전환 전에는 가구가 `roomId` 필드로 방에 매여 있었다. 그러면 같은 타일에 놓인 가구가
// 필드 값에 따라 다른 방의 것이 되고, 벽을 옮겨 방이 갈라지는 날 그 필드는 조용히 낡는다.
// 여기 있는 것은 그 필드가 사라진 뒤에도 열거가 **틀리지 않는가**를 재는 계측기다.
import { describe, it, expect } from 'vitest'
import { createWorld, tileIndex, type Furniture, type SimWorld } from './world'
import { computeRegions } from './regions'
import { furnitureSpot, furnitureSpots } from './spots'
import { buildBlockedSet } from './path'

/** 사각 테두리 벽 — regions.test.ts와 같은 도구(공식을 테스트마다 다시 쓰지 않는다) */
function rectWalls(x: number, y: number, w: number, h: number): number[] {
  const out: number[] = []
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
    if (tx === x || tx === x + w - 1 || ty === y || ty === y + h - 1) out.push(tileIndex(tx, ty))
  }
  return out
}

/** 두 밀실 — 대기실 (10,10) 6×5(내부 11..14 × 11..13) · 병동 (20,10) 6×5(내부 21..24 × 11..13) */
function twoRooms(furniture: Furniture[]): SimWorld {
  return {
    ...createWorld(1),
    walls: new Set([...rectWalls(10, 10, 6, 5), ...rectWalls(20, 10, 6, 5)]),
    designations: [
      { at: { x: 12, y: 12 }, type: 'WAITING' },
      { at: { x: 22, y: 12 }, type: 'WARD' },
    ],
    furniture,
  }
}

describe('furnitureSpots — 영역 안의 가구를 좌표로 연다', () => {
  it('roomId 없는 가구도 그 좌표가 속한 영역의 것으로 열린다', () => {
    // 전환의 핵심 — 소속을 말하는 필드가 없어도 열거가 성립해야 한다.
    const w = twoRooms([{ kind: 'CHAIR', x: 12, y: 12 }])
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([{ x: 12, y: 11 }])
  })

  it('다른 용도의 영역에 놓인 같은 가구는 열리지 않는다 — 좌표가 방을 가른다', () => {
    const w = twoRooms([{ kind: 'CHAIR', x: 22, y: 12 }]) // 병동 안의 의자
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([])
    expect(furnitureSpots(w, 'WARD', 'CHAIR')).toEqual([{ x: 22, y: 11 }])
  })

  it('마당(둘러싸이지 않은 곳)에 놓인 가구는 어느 용도로도 열리지 않는다', () => {
    // 설계 §2: 가구는 마당에도 놓을 수 있으나 **기능은 용도 영역 안에서만** 한다.
    const w = twoRooms([{ kind: 'CHAIR', x: 2, y: 2 }])
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([])
  })

  it('용도가 없는 영역의 가구도 열리지 않는다 — 벽만 세우고 지정을 안 한 방', () => {
    const w = { ...twoRooms([{ kind: 'CHAIR', x: 12, y: 12 }]), designations: [] }
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([])
  })

  it('열거 순서는 furniture 배열 순서다 — 결정론의 축이 좌표 정렬로 바뀌지 않는다', () => {
    const w = twoRooms([
      { kind: 'CHAIR', x: 13, y: 13 }, // 앞자리 = 위 (13,12)
      { kind: 'CHAIR', x: 12, y: 11 }, // 위가 벽이라 앞자리 = 오른쪽 (13,11)
    ])
    // 영역을 먼저 훑어 그 안의 가구를 모으면 이 순서가 좌표 오름차순으로 뒤집힌다.
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([{ x: 13, y: 12 }, { x: 13, y: 11 }])
  })
})

describe('furnitureSpot — 그 영역의 첫 가구 앞자리', () => {
  it('영역이 주어지면 그 안의 가구만 본다', () => {
    const w = twoRooms([
      { kind: 'DESK', x: 22, y: 12 }, // 병동 쪽 책상이 배열에서 먼저다
      { kind: 'DESK', x: 12, y: 12 },
    ])
    const regions = computeRegions(w)
    const waiting = regions.find(r => r.type === 'WAITING')
    expect(furnitureSpot(w, waiting, 'DESK', buildBlockedSet(w))).toEqual({ x: 12, y: 11 })
  })

  it('영역이 없으면(배정 전·철거된 방) null이다 — 던지지 않는다', () => {
    const w = twoRooms([{ kind: 'DESK', x: 12, y: 12 }])
    expect(furnitureSpot(w, undefined, 'DESK', buildBlockedSet(w))).toBeNull()
  })
})
