import { describe, it, expect } from 'vitest'
import { createWorld, isWalkable, tileIndex, GRID_W, type FurnitureKind, type RoomType, type SimWorld } from './world'
import { BUILD_COST, refundOf, buildWalls, placeDoor, placeFurniture, designateRegion, demolish } from './build'
import { computeRegions } from './regions'
import { placeRoom, doorTile, FURNITURE_OF } from './testHelpers'

const KINDS: FurnitureKind[] = ['DESK', 'CHAIR', 'BED', 'COUNTER']

/** 타일 목록을 좌표 배열로 — 단언을 읽기 쉽게. */
const pts = (...pairs: Array<[number, number]>) => pairs.map(([x, y]) => ({ x, y }))
const idx = (x: number, y: number) => tileIndex(x, y)

/** 벽 한 칸이 이미 서 있는 세계 — 문·철거의 전제. */
function withWall(at: { x: number; y: number }, over: Partial<SimWorld> = {}): SimWorld {
  const r = buildWalls({ ...createWorld(1), ...over }, [at])
  if (!r.ok) throw new Error(`전제 실패 — 벽(${r.reason})`)
  return r.world
}

describe('BUILD_COST — 비용표 단일 출처', () => {
  it('표가 곧 밸런스다 — 값이 흔들리면 여기서 먼저 운다', () => {
    expect(BUILD_COST).toEqual({ WALL: 30, DOOR: 50, DESK: 100, CHAIR: 20, BED: 300, COUNTER: 100 })
  })

  it('철거 환불은 건설비의 절반(내림)이다 — 표 하나에서 파생하므로 튜닝이 갈리지 않는다', () => {
    for (const k of Object.keys(BUILD_COST) as Array<keyof typeof BUILD_COST>) {
      expect(refundOf(k)).toBe(Math.floor(BUILD_COST[k] / 2))
    }
    expect(refundOf('WALL')).toBe(15)
    expect(refundOf('BED')).toBe(150)
  })
})

describe('buildWalls — 자유 벽', () => {
  it('빈 타일에 벽을 세우고 개수만큼 값을 치른다', () => {
    const r = buildWalls(createWorld(1), pts([4, 4], [5, 4], [6, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([...r.world.walls].sort((a, b) => a - b)).toEqual([idx(4, 4), idx(5, 4), idx(6, 4)])
    expect(r.world.treasuryManwon).toBe(50_000 - 3 * BUILD_COST.WALL)
    expect(r.skipped).toBe(0)
    expect(isWalkable(r.world, 4, 4)).toBe(false) // 통행이 실제로 막힌다
  })

  it('이미 벽·문·가구가 선 타일은 **건너뛰고 나머지만** 세운다 — 스킵 수가 결과에 실린다', () => {
    let w = withWall({ x: 4, y: 4 })
    const door = placeDoor(w, { x: 4, y: 4 })
    if (!door.ok) throw new Error('전제 실패 — 문')
    w = door.world // (4,4)는 이제 문
    const chair = placeFurniture(w, 'CHAIR', pts([5, 4]))
    if (!chair.ok) throw new Error('전제 실패 — 의자')
    w = chair.world
    const wall = buildWalls(w, pts([6, 4]))
    if (!wall.ok) throw new Error('전제 실패 — 벽')
    w = wall.world

    const r = buildWalls(w, pts([4, 4], [5, 4], [6, 4], [7, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tiles).toEqual([idx(7, 4)]) // 빈 칸 하나만 설치
    expect(r.skipped).toBe(3)
    expect(r.world.treasuryManwon).toBe(w.treasuryManwon - BUILD_COST.WALL)
    expect(r.world.doors.has(idx(4, 4))).toBe(true) // 문이 벽으로 덮이지 않았다
  })

  it('설치할 타일이 하나도 없으면 NOTHING — 세계도 금고도 그대로다', () => {
    const w = withWall({ x: 4, y: 4 })
    const r = buildWalls(w, pts([4, 4]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('NOTHING')
    expect(r.deltaManwon).toBe(0)
  })

  it('자금이 모자라면 **한 칸도** 세우지 않는다 — 부분 설치가 금고를 긁지 않는다', () => {
    const broke = { ...createWorld(1), treasuryManwon: 2 * BUILD_COST.WALL }
    const r = buildWalls(broke, pts([4, 4], [5, 4], [6, 4]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('NO_MONEY')
    // 미리보기가 읽는 값 — 거부돼도 "무엇을 얼마에 지으려 했나"는 남는다.
    expect(r.tiles).toHaveLength(3)
    expect(r.deltaManwon).toBe(-3 * BUILD_COST.WALL)
  })

  it('잔고가 비용과 정확히 같으면 세운다 — 마지막 한 푼까지 쓴다', () => {
    const exact = { ...createWorld(1), treasuryManwon: 3 * BUILD_COST.WALL }
    const r = buildWalls(exact, pts([4, 4], [5, 4], [6, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.treasuryManwon).toBe(0)
  })

  it('같은 타일을 두 번 요청해도 한 번만 받는다 — 드래그 사각형의 모서리가 겹친다', () => {
    const r = buildWalls(createWorld(1), pts([4, 4], [4, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.treasuryManwon).toBe(50_000 - BUILD_COST.WALL)
  })
})

describe('placeDoor — 벽에 구멍을 낸다', () => {
  it('벽 타일이 문이 된다 — 벽 집합에서 빠지고 통행이 열린다', () => {
    const w = withWall({ x: 4, y: 4 })
    const r = placeDoor(w, { x: 4, y: 4 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.walls.has(idx(4, 4))).toBe(false)
    expect(r.world.doors.has(idx(4, 4))).toBe(true)
    expect(isWalkable(r.world, 4, 4)).toBe(true)
    // 벽값 위에 문값 — 환불은 없다(설계 §2).
    expect(r.world.treasuryManwon).toBe(w.treasuryManwon - BUILD_COST.DOOR)
  })

  it('벽이 아닌 타일은 거부한다 — 허공에 문이 서면 영역 경계가 뜻을 잃는다', () => {
    const r = placeDoor(createWorld(1), { x: 4, y: 4 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('NOT_WALL')
  })

  it('이미 문인 타일도 거부한다 — 문은 벽이 아니다', () => {
    const w = withWall({ x: 4, y: 4 })
    const first = placeDoor(w, { x: 4, y: 4 })
    if (!first.ok) throw new Error('전제 실패')
    const again = placeDoor(first.world, { x: 4, y: 4 })
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.reason).toBe('NOT_WALL')
  })

  it('자금이 모자라면 벽 그대로 둔다', () => {
    const w = withWall({ x: 4, y: 4 }, { treasuryManwon: BUILD_COST.WALL + BUILD_COST.DOOR - 1 })
    const r = placeDoor(w, { x: 4, y: 4 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('NO_MONEY')
  })
})

describe('placeFurniture — 가구 4종', () => {
  it('종류별 값을 치르고 좌표에 놓인다', () => {
    const r = placeFurniture(createWorld(1), 'BED', pts([10, 10], [12, 10]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.furniture).toEqual([{ kind: 'BED', x: 10, y: 10 }, { kind: 'BED', x: 12, y: 10 }])
    expect(r.world.treasuryManwon).toBe(50_000 - 2 * BUILD_COST.BED)
  })

  it('모든 종류가 표에 값을 갖는다 — 표에 없는 가구가 공짜로 새지 않는다', () => {
    for (const kind of KINDS) {
      const r = placeFurniture(createWorld(1), kind, pts([10, 10]))
      if (!r.ok) throw new Error(`전제 실패: ${kind}`)
      expect(50_000 - r.world.treasuryManwon).toBe(BUILD_COST[kind])
    }
  })

  it('벽·문·기존 가구 위는 건너뛴다 — 부분 설치와 스킵 수는 벽과 같은 규칙이다', () => {
    let w = withWall({ x: 4, y: 4 })
    const door = placeDoor(withWall({ x: 5, y: 4 }, w), { x: 5, y: 4 })
    if (!door.ok) throw new Error('전제 실패')
    w = door.world
    const first = placeFurniture(w, 'CHAIR', pts([6, 4]))
    if (!first.ok) throw new Error('전제 실패')
    w = first.world

    const r = placeFurniture(w, 'CHAIR', pts([4, 4], [5, 4], [6, 4], [7, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tiles).toEqual([idx(7, 4)])
    expect(r.skipped).toBe(3)
  })

  it('놓을 자리가 없으면 NOTHING · 자금이 모자라면 한 개도 안 놓는다', () => {
    const full = placeFurniture(withWall({ x: 4, y: 4 }), 'CHAIR', pts([4, 4]))
    expect(full.ok).toBe(false)
    if (!full.ok) expect(full.reason).toBe('NOTHING')

    const broke = { ...createWorld(1), treasuryManwon: BUILD_COST.BED }
    const r = placeFurniture(broke, 'BED', pts([10, 10], [11, 10]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('NO_MONEY')
  })

  it('마당에도 놓을 수 있다 — 기능이 없을 뿐 규칙이 막지는 않는다(경고가 잡는다)', () => {
    const r = placeFurniture(createWorld(1), 'CHAIR', pts([0, 0]))
    expect(r.ok).toBe(true)
  })
})

describe('designateRegion — 용도 앵커', () => {
  /** 벽으로 두르고 문 하나를 낸 6×5 빈 방(가구·용도 없음) */
  function shell(w: SimWorld = createWorld(1)): SimWorld {
    const border: Array<{ x: number; y: number }> = []
    for (let x = 4; x < 10; x++) for (let y = 4; y < 9; y++) {
      if (x === 4 || x === 9 || y === 4 || y === 8) border.push({ x, y })
    }
    const r = buildWalls(w, border)
    if (!r.ok) throw new Error('전제 실패 — 껍데기 벽')
    const d = placeDoor(r.world, { x: 7, y: 8 })
    if (!d.ok) throw new Error('전제 실패 — 껍데기 문')
    return d.world
  }

  it('실내 영역을 클릭하면 그 영역이 용도를 갖는다 — 비용은 0이다', () => {
    const w = shell()
    const r = designateRegion(w, { x: 6, y: 6 }, 'WAITING')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.treasuryManwon).toBe(w.treasuryManwon)
    const region = computeRegions(r.world).find(x => x.tiles.has(idx(6, 6)))!
    expect(region.type).toBe('WAITING')
  })

  it('같은 영역을 다시 지정하면 옛 앵커를 **교체**한다 — 먼저가 이기는 규칙에 갇히지 않는다', () => {
    const first = designateRegion(shell(), { x: 6, y: 6 }, 'WAITING')
    if (!first.ok) throw new Error('전제 실패')
    const second = designateRegion(first.world, { x: 5, y: 5 }, 'WARD')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.world.designations).toHaveLength(1)
    expect(computeRegions(second.world).find(r => r.tiles.has(idx(6, 6)))!.type).toBe('WARD')
  })

  it('다른 영역의 앵커는 건드리지 않는다 — 교체는 그 영역 안에서만이다', () => {
    const w = placeRoom(createWorld(1), { type: 'WAITING', x: 20, y: 4, w: 6, h: 5 })
    if (!w.ok) throw new Error('전제 실패')
    const r = designateRegion(shell(w.world), { x: 6, y: 6 }, 'WARD')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const types = computeRegions(r.world).map(x => x.type).sort()
    expect(types).toEqual(['WAITING', 'WARD'])
  })

  it('마당·벽·문 위는 거부한다 — 둘러싸이지 않은 곳에는 방이 없다', () => {
    const w = shell()
    for (const at of [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 7, y: 8 }]) {
      const r = designateRegion(w, at, 'WAITING')
      expect(r.ok, `${at.x},${at.y}`).toBe(false)
      if (r.ok) continue
      expect(r.reason).toBe('OUTDOORS')
    }
  })

  it('진료실은 과가 실린다 — 과 없이 부르면 던진다(화면이 막는 자리다)', () => {
    const w = shell()
    expect(() => designateRegion(w, { x: 6, y: 6 }, 'EXAM')).toThrow()
    const r = designateRegion(w, { x: 6, y: 6 }, 'EXAM', 'CARDIOLOGY')
    if (!r.ok) throw new Error('전제 실패')
    expect(computeRegions(r.world).find(x => x.tiles.has(idx(6, 6)))!.dept).toBe('CARDIOLOGY')
  })

  it('진료실이 아니면 과를 **떨군다** — 「순환기 대기실」이 진료실 행세를 하지 않는다', () => {
    const r = designateRegion(shell(), { x: 6, y: 6 }, 'WAITING', 'CARDIOLOGY')
    if (!r.ok) throw new Error('전제 실패')
    expect(r.world.designations[0].dept).toBeUndefined()
  })
})

describe('demolish — 철거와 환불', () => {
  it('벽·문·가구를 없애고 환불을 합산한다', () => {
    let w = withWall({ x: 4, y: 4 })
    const w2 = withWall({ x: 5, y: 4 }, w)
    const door = placeDoor(w2, { x: 5, y: 4 })
    if (!door.ok) throw new Error('전제 실패')
    const bed = placeFurniture(door.world, 'BED', pts([6, 4]))
    if (!bed.ok) throw new Error('전제 실패')
    w = bed.world

    const r = demolish(w, pts([4, 4], [5, 4], [6, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.walls.size).toBe(0)
    expect(r.world.doors.size).toBe(0)
    expect(r.world.furniture).toEqual([])
    const refund = refundOf('WALL') + refundOf('DOOR') + refundOf('BED')
    expect(r.deltaManwon).toBe(refund)
    expect(r.world.treasuryManwon).toBe(w.treasuryManwon + refund)
  })

  it('빈 타일만 훑으면 NOTHING — 아무것도 안 부순 철거가 돈을 만들지 않는다', () => {
    const w = createWorld(1)
    const r = demolish(w, pts([10, 10], [11, 10]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('NOTHING')
    expect(r.deltaManwon).toBe(0)
  })

  it('빈 타일이 섞여 있어도 있는 것만 부순다 — 드래그 사각형이 대부분 빈 칸이다', () => {
    const w = withWall({ x: 4, y: 4 })
    const r = demolish(w, pts([4, 4], [5, 4], [6, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tiles).toEqual([idx(4, 4)])
    expect(r.deltaManwon).toBe(refundOf('WALL'))
  })

  it('앵커는 건드리지 않는다 — 벽이 뚫려 마당이 되면 영역 인식이 알아서 무효화한다', () => {
    const built = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 6, h: 5 })
    if (!built.ok) throw new Error('전제 실패')
    const r = demolish(built.world, pts([4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.designations).toEqual(built.world.designations) // 좌표는 그대로 남는다
    expect(computeRegions(r.world)).toEqual([])                    // 그러나 방은 사라졌다
  })
})

/*
  ── 테스트 헬퍼 placeRoom — 새 프리미티브로 옛 사각 방을 재현한다 ─────────────────
  프로덕션에서 사라진 함수라 게임 규칙이 아니다. 그런데도 재는 이유는 **수십 개 테스트가
  이 좌표를 전제로 서 있기 때문**이다: 가구 격자가 한 칸이라도 밀리면 좌석 수·문 앞 통로·
  스팟 선택이 통째로 달라지고, 그건 이 헬퍼가 틀린 것이지 규칙이 바뀐 것이 아니다.
*/
describe('placeRoom(테스트 헬퍼) — 옛 자동 가구 격자 재현', () => {
  it('벽·문·앵커를 낳아 computeRegions가 그 방을 그대로 인식한다', () => {
    const res = placeRoom(createWorld(1), { type: 'EXAM', dept: 'CARDIOLOGY', x: 4, y: 4, w: 6, h: 5 })
    if (!res.ok) throw new Error('전제 실패')
    const rs = computeRegions(res.world)
    expect(rs).toHaveLength(1)
    expect(rs[0].tiles.size).toBe((6 - 2) * (5 - 2)) // 내부 타일 = (w-2)*(h-2)
    expect(rs[0].type).toBe('EXAM')
    expect(rs[0].dept).toBe('CARDIOLOGY')
    const door = doorTile({ x: 4, y: 4, w: 6, h: 5 })
    expect([...rs[0].doors]).toEqual([tileIndex(door.x, door.y)]) // 문은 정확히 하나
    expect(res.world.walls.has(tileIndex(door.x, door.y))).toBe(false) // 문은 벽이 아니다
  })

  it('EXAM 자동 가구는 책상 1 + 진료의자 1이고 내부 좌상단부터다', () => {
    const res = placeRoom(createWorld(1), { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 4, y: 4, w: 6, h: 5 })
    if (!res.ok) throw new Error('전제 실패')
    expect(res.world.furniture).toEqual([
      { kind: 'DESK', x: 5, y: 5 },
      { kind: 'CHAIR', x: 6, y: 5 },
    ])
  })

  it('EXAM에 dept를 안 주면 내과로 접는다 — 옛 마이그레이션 절단을 그대로 물려받는다', () => {
    const res = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    if (!res.ok) throw new Error('전제 실패')
    expect(res.world.designations[0].dept).toBe('INTERNAL_MEDICINE')
  })

  it('WAITING은 내부에 의자를 깔고, WARD는 침대를 놓는다', () => {
    expect(FURNITURE_OF.WAITING).toBe('CHAIR')
    expect(FURNITURE_OF.WARD).toBe('BED')
    const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 8, h: 6 })
    if (!res.ok) throw new Error('전제 실패')
    expect(res.world.furniture.every(f => f.kind === 'CHAIR')).toBe(true)
    expect(res.world.furniture.length).toBeGreaterThanOrEqual(4)
  })

  it('한 칸 걸러 격자 — 8×6 대기실의 의자 좌표가 옛 구현과 **완전히 같다**', () => {
    // 옛 autoFurniture 실측 좌표(문 앞 (8,9) 제외). 한 칸이라도 밀리면 좌석 수가 달라진다.
    const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 8, h: 6 })
    if (!res.ok) throw new Error('전제 실패')
    expect(res.world.furniture.map(f => `${f.x},${f.y}`)).toEqual([
      '5,5', '5,7', '7,5', '7,7', '9,5', '9,7',
    ])
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
      for (const [w, h] of [[4, 4], [6, 5], [8, 6]]) {
        const res = placeRoom(createWorld(1), { type, x: 4, y: 4, w, h })
        if (!res.ok) throw new Error(`전제 실패: ${type} ${w}x${h}`)
        const tiles = res.world.furniture.map(f => `${f.x},${f.y}`)
        expect(new Set(tiles).size).toBe(tiles.length)
      }
    }
  })

  it('문 안쪽 타일은 가구가 막지 않는다 — 홀수 폭에서도(문 공식을 재유도하면 여기서 어긋난다)', () => {
    for (const [w, h] of [[6, 5], [7, 5]]) {
      const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w, h })
      if (!res.ok) throw new Error(`전제 실패 ${w}x${h}`)
      const door = doorTile({ x: 4, y: 4, w, h })
      expect(isWalkable(res.world, door.x, door.y)).toBe(true)      // 문 자체
      expect(isWalkable(res.world, door.x, door.y - 1)).toBe(true)  // 문 바로 안쪽
    }
  })

  it('용도 앵커는 문 바로 안쪽 타일 — 가구가 절대 안 놓이는 자리라 항상 유효하다', () => {
    for (const [w, h] of [[4, 4], [6, 5], [7, 5], [8, 6]]) {
      const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w, h })
      if (!res.ok) throw new Error(`전제 실패 ${w}x${h}`)
      const door = doorTile({ x: 4, y: 4, w, h })
      expect(res.world.designations[0].at).toEqual({ x: door.x, y: door.y - 1 })
      expect(computeRegions(res.world)[0].type).toBe('WAITING')
    }
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
    // 가구가 하나도 남김없이 어느 한 영역에 담긴다 — 벽 위·문 위에 놓인 가구가 없다는 뜻이다.
    const regions = computeRegions(w)
    for (const f of w.furniture) {
      expect(regions.filter(r => r.tiles.has(tileIndex(f.x, f.y)))).toHaveLength(1)
    }
  })

  it('그리드 인덱스 규약을 그대로 쓴다 — 벽 좌표가 한 줄씩 밀리지 않는다', () => {
    const res = placeRoom(createWorld(1), { type: 'WARD', x: 4, y: 4, w: 4, h: 4 })
    if (!res.ok) throw new Error('전제 실패')
    expect(res.world.walls.has(4 * GRID_W + 4)).toBe(true)
  })
})
