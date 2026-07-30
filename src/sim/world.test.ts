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

  it('지역·배경 기본값 — 인자를 안 주면 도심(URBAN)의 0번 배경이다', () => {
    // 두 번째 인자는 **가산**이다 — 기존 호출부(테스트·픽스처 전부)가 무변이어야 한다.
    const w = createWorld(1)
    expect(w.region).toBe('URBAN')
    expect(w.backdrop).toBe(0)
  })

  it('지역·배경은 준 대로 저장된다 — 새 판을 여는 UI가 정한 값이 그대로 세계가 된다', () => {
    const w = createWorld(1, { region: 'RURAL', backdrop: 2 })
    expect(w.region).toBe('RURAL')
    expect(w.backdrop).toBe(2)
  })

  it('배경 번호가 0..2 밖이면 **0으로 떨어진다** — 조용한 NaN·음수 인덱스로 새지 않는다', () => {
    // 폴백을 고른 이유: 나머지 연산은 음수에서 음수를 낳고(-1 % 3 === -1) clamp는 3과 99를
    // 서로 다른 뜻으로 보존한다. 후보 3종은 **동등**하므로 잘못된 값에는 뜻이 없다 — 0이 맞다.
    for (const bad of [3, -1, 1.5, Number.NaN]) {
      expect(createWorld(1, { backdrop: bad }).backdrop).toBe(0)
    }
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
  it('**의자만은 통행 가능하다** — 그 칸에 올라서는 것이 곧 "앉는다"다', () => {
    // 의자를 막으면 폰은 영영 의자 **옆**에 설 수밖에 없고, 화면에서는 의자가 늘 비어 보인다
    // (사용자 보고: *"의자를 추가해도 캐릭터들이 의자를 사용 안 해"*). 앉음을 표현할 유일한
    // 자리가 타일이므로, 막힘을 푸는 것이 곧 기능이다.
    const w = { ...createWorld(1), furniture: [{ kind: 'CHAIR' as const, x: 6, y: 6 }] }
    expect(isWalkable(w, 6, 6)).toBe(true)
  })
  it('의자 외 가구는 그대로 막는다 — 침대·카운터는 옆에 선다', () => {
    for (const kind of ['DESK', 'BED', 'COUNTER'] as const) {
      const w = { ...createWorld(1), furniture: [{ kind, x: 6, y: 6 }] }
      expect(isWalkable(w, 6, 6)).toBe(false)
    }
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
