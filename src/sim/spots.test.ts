// 가구 열거의 계약 — **소속은 좌표가 말한다**(설계 §1-1).
//
// 전환 전에는 가구가 `roomId` 필드로 방에 매여 있었다. 그러면 같은 타일에 놓인 가구가
// 필드 값에 따라 다른 방의 것이 되고, 벽을 옮겨 방이 갈라지는 날 그 필드는 조용히 낡는다.
// 여기 있는 것은 그 필드가 사라진 뒤에도 열거가 **틀리지 않는가**를 재는 계측기다.
import { describe, it, expect } from 'vitest'
import { createWorld, tileIndex, type Furniture, type SimWorld } from './world'
import { computeRegions } from './regions'
import { examSlots, furnitureSpots, standSpot, occupySpot } from './spots'
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
    // 좌석은 **의자 타일 그 자체**다(앉는다 = 그 칸에 선다 · world.blocksWalk).
    const w = twoRooms([{ kind: 'CHAIR', x: 12, y: 12 }])
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([{ x: 12, y: 12 }])
  })

  it('다른 용도의 영역에 놓인 같은 가구는 열리지 않는다 — 좌표가 방을 가른다', () => {
    const w = twoRooms([{ kind: 'CHAIR', x: 22, y: 12 }]) // 병동 안의 의자
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([])
    expect(furnitureSpots(w, 'WARD', 'CHAIR')).toEqual([{ x: 22, y: 12 }])
  })

  it('침대는 여전히 **앞에 선다** — 앉는 가구만 그 위에 오른다', () => {
    // 의자와 침대를 한 규칙으로 접지 않는 것이 계약이다: 통행을 막는가(blocksWalk)가 갈림의
    // 기준이고, 침대는 막으므로 옛 계약(앞 통행 타일) 그대로다.
    const w = twoRooms([{ kind: 'BED', x: 22, y: 12 }])
    expect(furnitureSpots(w, 'WARD', 'BED')).toEqual([{ x: 22, y: 11 }])
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
      { kind: 'CHAIR', x: 13, y: 13 },
      { kind: 'CHAIR', x: 12, y: 11 },
    ])
    // 영역을 먼저 훑어 그 안의 가구를 모으면 이 순서가 좌표 오름차순으로 뒤집힌다.
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([{ x: 13, y: 13 }, { x: 12, y: 11 }])
  })

  it('앞 타일이 겹치는 **침대**는 자리 하나로 친다 — dedupe 안전망은 살아 있다', () => {
    // 겹침 방지의 1차 방어는 배치(간격)에 있고 이건 모듈 경계를 넘는 안전망이다. 의자는 자리가
    // 그 타일이라 이제 겹칠 수가 없지만, **앞 타일을 쓰는 가구는 여전히 겹칠 수 있다** — 그
    // 경로가 살아 있음을 여기서 잠근다(안 잠그면 두 환자가 한 칸에 포개진다).
    const w = twoRooms([
      { kind: 'BED', x: 22, y: 11 }, // 위(22,10)가 벽 → 앞자리는 오른쪽 (23,11)
      { kind: 'BED', x: 23, y: 12 }, // 위가 곧 (23,11) — 같은 자리로 겹친다
    ])
    expect(furnitureSpots(w, 'WARD', 'BED')).toEqual([{ x: 23, y: 11 }])
  })

  it('의자 둘이 붙어 있어도 좌석 둘이다 — 앉는 자리는 겹칠 수가 없다', () => {
    // 옛 계약에서는 두 의자가 **앞 타일 하나**를 나눠 가져 좌석이 하나로 접혔다(dedupe).
    // 이제 자리가 의자 그 자체라 겹침이 구조적으로 불가능하다 — 의자 수 = 좌석 수.
    const w = twoRooms([{ kind: 'CHAIR', x: 12, y: 12 }, { kind: 'CHAIR', x: 12, y: 13 }])
    expect(furnitureSpots(w, 'WAITING', 'CHAIR')).toEqual([{ x: 12, y: 12 }, { x: 12, y: 13 }])
  })
})

describe('occupySpot — 그 가구를 쓰는 폰이 서는(앉는) 칸', () => {
  it('통행을 막는 가구는 **앞 타일**이다 — 책상·침대·카운터', () => {
    const w = twoRooms([{ kind: 'BED', x: 22, y: 12 }])
    expect(occupySpot(buildBlockedSet(w), { x: 22, y: 12 })).toEqual({ x: 22, y: 11 })
  })

  it('막지 않는 가구는 **그 자리**다 — 의자가 유일한 경우다', () => {
    const w = twoRooms([{ kind: 'CHAIR', x: 12, y: 12 }])
    expect(occupySpot(buildBlockedSet(w), { x: 12, y: 12 })).toEqual({ x: 12, y: 12 })
  })

  it('갈림의 기준은 가구 종류가 아니라 **막힘**이다 — 좌표만 받는다', () => {
    // 종류를 다시 세면 blocksWalk와 두 곳이 갈린다. 이 단언은 그 결합을 못박는다:
    // 같은 좌표라도 blocked에 들어 있으면 앞 타일, 아니면 그 자리다.
    const w = twoRooms([])
    expect(occupySpot(buildBlockedSet(w), { x: 12, y: 12 })).toEqual({ x: 12, y: 12 })
    expect(occupySpot(buildBlockedSet({ ...w, walls: new Set([...w.walls, tileIndex(12, 12)]) }), { x: 12, y: 12 }))
      .toEqual({ x: 12, y: 11 })
  })
})

describe('standSpot — 가구 앞에 설 자리', () => {
  it('막히지 않은 첫 이웃(위·우·아래·좌)이다 — 위가 벽이면 오른쪽이다', () => {
    const w = twoRooms([{ kind: 'DESK', x: 12, y: 11 }]) // 위(12,10)가 벽
    expect(standSpot(buildBlockedSet(w), { x: 12, y: 11 })).toEqual({ x: 13, y: 11 })
  })

  it('사방이 막혔으면 null이다 — 던지지 않는다', () => {
    const w = twoRooms([
      { kind: 'DESK', x: 11, y: 11 }, // 왼쪽·위가 벽인 내부 모서리
      { kind: 'DESK', x: 12, y: 11 },
      { kind: 'DESK', x: 11, y: 12 },
    ])
    expect(standSpot(buildBlockedSet(w), { x: 11, y: 11 })).toBeNull()
  })
})

/** 진료실 한 칸 — (10,10) 6×5(내부 11..14 × 11..13).
 *  `examSlots`는 용도를 **보지 않지만**(그 필터는 호출부의 몫이다) 픽스처는 실제 용도로 세운다. */
function examRoom(furniture: Furniture[]): SimWorld {
  return {
    ...createWorld(1),
    walls: new Set(rectWalls(10, 10, 6, 5)),
    designations: [{ at: { x: 12, y: 12 }, type: 'EXAM', dept: 'INTERNAL_MEDICINE' }],
    furniture,
  }
}

const slotsOf = (w: SimWorld) => examSlots(w, computeRegions(w).find(r => r.type === 'EXAM')!)

describe('examSlots — 진료 슬롯(책상·환자의자·의사스팟)', () => {
  it('책상 하나 + 인접 의자 하나 = 슬롯 하나 — 네 좌표가 다 나온다', () => {
    const slots = slotsOf(examRoom([{ kind: 'DESK', x: 12, y: 12 }, { kind: 'CHAIR', x: 13, y: 12 }]))
    expect(slots).toEqual([{
      desk: { x: 12, y: 12 },
      chair: { x: 13, y: 12 },
      doctorSpot: { x: 12, y: 11 },  // 책상 앞 통행 타일(위가 비었다)
      patientSpot: { x: 13, y: 12 }, // **의자 그 자체** — 환자는 진료 의자에 앉는다
    }])
  })

  it('의자 없는 책상은 슬롯이 아니다 — 책상만 놓으면 진료가 안 열린다', () => {
    expect(slotsOf(examRoom([{ kind: 'DESK', x: 12, y: 12 }]))).toEqual([])
  })

  it('의자 하나를 두 책상이 나눠 갖지 않는다 — 먼저 놓인 책상이 가져간다', () => {
    const slots = slotsOf(examRoom([
      { kind: 'DESK', x: 12, y: 12 },
      { kind: 'DESK', x: 14, y: 12 }, // 같은 의자(13,12)에 인접하지만 이미 짝지어졌다
      { kind: 'CHAIR', x: 13, y: 12 },
    ]))
    expect(slots.map(s => s.desk)).toEqual([{ x: 12, y: 12 }])
  })

  it('인접 의자가 둘이면 DIRS 순서(위·우·아래·좌)로 첫 의자다', () => {
    const slots = slotsOf(examRoom([
      { kind: 'DESK', x: 12, y: 12 },
      { kind: 'CHAIR', x: 13, y: 12 }, // 오른쪽 — 배열에서는 이쪽이 먼저다
      { kind: 'CHAIR', x: 12, y: 11 }, // 위 — DIRS 순서로는 이쪽이 먼저다
    ]))
    expect(slots.map(s => s.chair)).toEqual([{ x: 12, y: 11 }])
  })

  it('의사가 설 자리가 없는 책상은 슬롯이 아니다 — 사방이 막힌 모서리 책상', () => {
    expect(slotsOf(examRoom([
      { kind: 'DESK', x: 11, y: 11 },  // 위·왼쪽이 벽
      { kind: 'DESK', x: 12, y: 11 },  // 오른쪽·아래를 책상으로 막는다(의자는 이제 통행 가능하다)
      { kind: 'DESK', x: 11, y: 12 },
    ]))).toEqual([])
  })

  it('**의사는 환자 의자에 서지 않는다** — 벽에 붙은 책상도 슬롯이 된다', () => {
    // 의자가 통행 가능해지면서 생긴 함정이고, 자동 배치가 정확히 이 모양이다: 책상은 내부
    // 좌상단이라 위·왼쪽이 벽이고 오른쪽이 환자 의자다. 의자를 "설 자리"로 세면 의사스팟이
    // 그 의자가 되고, 짝지을 의자가 그것뿐이라 **슬롯이 아예 안 열린다**(진료실 정원 0).
    expect(slotsOf(examRoom([
      { kind: 'DESK', x: 11, y: 11 },  // 위(11,10)·왼쪽(10,11)이 벽
      { kind: 'CHAIR', x: 12, y: 11 }, // 오른쪽 — 통행 가능하지만 **서는 곳은 아니다**
    ]))).toEqual([{
      desk: { x: 11, y: 11 },
      chair: { x: 12, y: 11 },
      doctorSpot: { x: 11, y: 12 },  // 의자를 건너뛰고 아래 빈 칸
      patientSpot: { x: 12, y: 11 }, // 의자 그 자체
    }])
  })

  it('열거 순서는 furniture 배열 순서다 — 좌표 정렬로 뒤집히지 않는다(배정 결정론의 축)', () => {
    const slots = slotsOf(examRoom([
      { kind: 'DESK', x: 11, y: 13 }, { kind: 'CHAIR', x: 12, y: 13 },
      { kind: 'DESK', x: 13, y: 11 }, { kind: 'CHAIR', x: 14, y: 11 },
    ]))
    // 좌표 오름차순이라면 (13,11)이 먼저다(y가 위쪽) — 설치 순서를 보면 이 순서다.
    expect(slots.map(s => s.desk)).toEqual([{ x: 11, y: 13 }, { x: 13, y: 11 }])
  })
})
