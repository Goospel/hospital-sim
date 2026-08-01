import { describe, it, expect } from 'vitest'
import { createWorld, isWalkable, tileIndex, GRID_W, blocksWalk, type ChairVariant, type FurnitureKind, type RoomType, type SimWorld } from './world'
import { BUILD_COST, refundOf, buildWalls, placeDoor, placeFurniture, paintZone, eraseZone, demolish } from './build'
import { computeRegions } from './regions'
import { placeRoom, doorTile, rectPts, FURNITURE_OF } from './testHelpers'

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

describe('selectTargets — 세 도구가 공유하는 대상 선정 규칙', () => {
  // 중복 제거를 skipped로 세면 화면의 "N칸 건너뜀"이 실제와 무관해진다: 드래그 사각형은
  // 모서리를 겹쳐 넘기므로 아무것도 안 막힌 드래그에서도 숫자가 붙는다. 골격을 한 곳으로
  // 접기 전에는 이 규칙을 잠그는 테스트가 없어, 세 도구 어디서든 조용히 갈릴 수 있었다.
  it('같은 타일을 두 번 넘겨도 건너뜀으로 세지 않는다 — 설치·칠하기·해제 모두', () => {
    const dup = pts([4, 4], [4, 4], [4, 4])
    const wall = buildWalls(createWorld(1), dup)
    expect(wall.ok).toBe(true)
    if (!wall.ok) return
    expect(wall.tiles).toEqual([idx(4, 4)])
    expect(wall.skipped).toBe(0)
    expect(wall.deltaManwon).toBe(-BUILD_COST.WALL) // 한 칸 값만 치른다

    const painted = paintZone(createWorld(1), dup, 'WAITING')
    expect(painted.ok).toBe(true)
    if (!painted.ok) return
    expect(painted.tiles).toEqual([idx(4, 4)])
    expect(painted.skipped).toBe(0)

    const erased = eraseZone(painted.world, dup)
    expect(erased.ok).toBe(true)
    if (!erased.ok) return
    expect(erased.tiles).toEqual([idx(4, 4)])
    expect(erased.skipped).toBe(0)
  })

  it('부지 밖은 건너뜀으로 센다 — 중복과 달리 실제로 막힌 칸이다', () => {
    const r = paintZone(createWorld(1), [{ x: -1, y: 5 }, { x: 4, y: 4 }], 'WAITING')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tiles).toEqual([idx(4, 4)])
    expect(r.skipped).toBe(1)
  })
})

describe('paintZone · eraseZone — 용도 칠하기', () => {
  const ROOM = { x: 4, y: 4, w: 6, h: 5 } // 테두리 18타일(문 1 포함) · 내부 12타일

  /** 벽으로 두르고 문 하나를 낸 6×5 빈 껍데기(가구·칠 없음) */
  function shell(w: SimWorld = createWorld(1)): SimWorld {
    const border = rectPts(ROOM.x, ROOM.y, ROOM.w, ROOM.h)
      .filter(t => t.x === 4 || t.x === 9 || t.y === 4 || t.y === 8)
    const r = buildWalls(w, border)
    if (!r.ok) throw new Error('전제 실패 — 껍데기 벽')
    const d = placeDoor(r.world, { x: 7, y: 8 })
    if (!d.ok) throw new Error('전제 실패 — 껍데기 문')
    return d.world
  }

  it('벽·문 타일은 칠해지지 않는다 — skipped로 보고된다. 비용은 0이다', () => {
    const w = shell()
    const r = paintZone(w, rectPts(ROOM.x, ROOM.y, ROOM.w, ROOM.h), 'WAITING')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tiles).toHaveLength(12)                 // 내부 (6-2)*(5-2)
    expect(r.skipped).toBe(18)                       // 테두리 = 벽 17 + 문 1
    expect(r.deltaManwon).toBe(0)
    expect(r.world.treasuryManwon).toBe(w.treasuryManwon)
    for (const i of r.world.walls) expect(r.world.zones.has(i)).toBe(false)
    for (const i of r.world.doors) expect(r.world.zones.has(i)).toBe(false)
    const region = computeRegions(r.world).find(x => x.tiles.has(idx(6, 6)))!
    expect(region.type).toBe('WAITING')
  })

  it('벽 없이도 칠해진다 — 밀폐는 더 이상 조건이 아니다(마당 한복판·부지 가장자리)', () => {
    const r = paintZone(createWorld(1), rectPts(0, 0, 3, 3), 'WAITING')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tiles).toHaveLength(9)
    expect(computeRegions(r.world)).toHaveLength(1)
  })

  it('가구 타일은 칠해진다 — 가구는 영역 안의 것이지 경계가 아니다', () => {
    const f = placeFurniture(createWorld(1), 'CHAIR', pts([6, 6]))
    if (!f.ok) throw new Error('전제 실패 — 의자')
    const r = paintZone(f.world, pts([6, 6]), 'WAITING')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tiles).toEqual([idx(6, 6)])
  })

  it('나중 칠한 것이 이긴다 — 다른 용도 타일을 덮어쓴다', () => {
    const first = paintZone(createWorld(1), rectPts(4, 4, 4, 3), 'WAITING')
    if (!first.ok) throw new Error('전제 실패')
    expect(computeRegions(first.world)[0].tiles.size).toBe(12)
    // 오른쪽 두 열(6타일)만 접수처로 덮어쓴다 — 대기실은 그만큼 줄고 접수처가 새로 생긴다.
    const second = paintZone(first.world, rectPts(6, 4, 2, 3), 'RECEPTION')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const rs = computeRegions(second.world)
    expect(rs).toHaveLength(2)
    expect(rs.map(r => [r.type, r.tiles.size]).sort()).toEqual([['RECEPTION', 6], ['WAITING', 6]])
  })

  it('전부 같은 칠이면 NOTHING이다 — 같은 사각형을 두 번 칠해도 세계가 안 흔들린다', () => {
    const first = paintZone(createWorld(1), rectPts(4, 4, 4, 3), 'WAITING')
    if (!first.ok) throw new Error('전제 실패')
    const again = paintZone(first.world, rectPts(4, 4, 4, 3), 'WAITING')
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.reason).toBe('NOTHING')
    expect(again.skipped).toBe(12)
  })

  it('같은 용도라도 과가 다르면 덮어쓴다 — 진료실의 과 교체가 먹힌다', () => {
    const first = paintZone(createWorld(1), rectPts(4, 4, 3, 3), 'EXAM', 'INTERNAL_MEDICINE')
    if (!first.ok) throw new Error('전제 실패')
    const second = paintZone(first.world, rectPts(4, 4, 3, 3), 'EXAM', 'CARDIOLOGY')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(computeRegions(second.world)[0].dept).toBe('CARDIOLOGY')
  })

  it('진료실은 과가 실린다 — 과 없이 부르면 던진다(화면이 막는 자리다)', () => {
    const w = createWorld(1)
    expect(() => paintZone(w, rectPts(4, 4, 3, 3), 'EXAM')).toThrow()
    const r = paintZone(w, rectPts(4, 4, 3, 3), 'EXAM', 'CARDIOLOGY')
    if (!r.ok) throw new Error('전제 실패')
    expect(computeRegions(r.world)[0].dept).toBe('CARDIOLOGY')
  })

  it('진료실이 아니면 과를 **떨군다** — 「순환기 대기실」이 진료실 행세를 하지 않는다', () => {
    const r = paintZone(createWorld(1), rectPts(4, 4, 3, 3), 'WAITING', 'CARDIOLOGY')
    if (!r.ok) throw new Error('전제 실패')
    expect(r.world.zones.get(idx(4, 4))!.dept).toBeUndefined()
    expect(computeRegions(r.world)[0].dept).toBeUndefined()
  })

  it('지정 해제는 칠만 지운다 — 벽·가구는 그대로다', () => {
    const built = placeRoom(createWorld(1), { type: 'WAITING', ...ROOM })
    if (!built.ok) throw new Error('전제 실패')
    const r = eraseZone(built.world, rectPts(ROOM.x, ROOM.y, ROOM.w, ROOM.h))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tiles).toHaveLength(12)                       // 칠이 있던 내부만
    expect(r.world.zones.size).toBe(0)
    expect(computeRegions(r.world)).toEqual([])            // 영역이 사라졌다
    expect(r.world.walls).toEqual(built.world.walls)       // 벽은 그대로
    expect(r.world.doors).toEqual(built.world.doors)
    expect(r.world.furniture).toEqual(built.world.furniture)
    expect(r.world.treasuryManwon).toBe(built.world.treasuryManwon) // 환불도 청구도 없다
  })

  it('빈 범위 해제는 NOTHING이다 — 지울 칠이 없으면 세계가 안 바뀐다', () => {
    const r = eraseZone(createWorld(1), rectPts(20, 20, 2, 2))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('NOTHING')
    expect(r.skipped).toBe(4)
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

  it('칠은 건드리지 않는다 — 벽을 통째로 헐어도 영역은 그대로다(밀폐가 조건이 아니다)', () => {
    const built = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 6, h: 5 })
    if (!built.ok) throw new Error('전제 실패')
    const before = computeRegions(built.world)
    // ⚠️ 기준선에 **절대값**을 물린다. `before`가 자기 자신에서 파생이라, 이것 없이 아래 한 줄만
    //    두면 파생이 통째로 무너져 양변이 `[]`가 돼도 통과한다(리뷰 실측: computeRegionsUncached를
    //    `return []`로 돌연변이시켜도 살아남았다). 6×5 방의 내부는 (6-2)*(5-2) = 12타일이다.
    expect(before).toHaveLength(1)
    expect(before[0].tiles.size).toBe(12)
    const r = demolish(built.world, pts([4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.zones).toEqual(built.world.zones)  // 칠은 철거의 대상이 아니다
    expect(computeRegions(r.world)).toEqual(before)   // 벽이 뚫려도 방은 그대로 산다
  })
})

/*
  ── 테스트 헬퍼 placeRoom — 새 프리미티브로 옛 사각 방을 재현한다 ─────────────────
  프로덕션에서 사라진 함수라 게임 규칙이 아니다. 그런데도 재는 이유는 **수십 개 테스트가
  이 좌표를 전제로 서 있기 때문**이다: 가구 격자가 한 칸이라도 밀리면 좌석 수·문 앞 통로·
  스팟 선택이 통째로 달라지고, 그건 이 헬퍼가 틀린 것이지 규칙이 바뀐 것이 아니다.
*/
describe('placeRoom(테스트 헬퍼) — 옛 자동 가구 격자 재현', () => {
  it('벽·문·칠을 낳아 computeRegions가 그 방을 그대로 인식한다', () => {
    const res = placeRoom(createWorld(1), { type: 'EXAM', dept: 'CARDIOLOGY', x: 4, y: 4, w: 6, h: 5 })
    if (!res.ok) throw new Error('전제 실패')
    const rs = computeRegions(res.world)
    expect(rs).toHaveLength(1)
    expect(rs[0].tiles.size).toBe((6 - 2) * (5 - 2)) // 내부 타일 = (w-2)*(h-2)
    expect(rs[0].type).toBe('EXAM')
    expect(rs[0].dept).toBe('CARDIOLOGY')
    const door = doorTile({ x: 4, y: 4, w: 6, h: 5 })
    expect(res.world.doors.has(tileIndex(door.x, door.y))).toBe(true)   // 문은 정확히 하나
    expect(res.world.doors.size).toBe(1)
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
    const rs = computeRegions(res.world)
    expect(rs).toHaveLength(1) // [0]을 읽기 전에 전제를 적어 둔다 — 방 하나짜리 세계다
    expect(rs[0].dept).toBe('INTERNAL_MEDICINE')
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

  it('칠한 타일은 사각형에서 테두리를 뺀 내부 전부다 — 옛 앵커 파생과 같은 집합이다', () => {
    for (const [w, h] of [[4, 4], [6, 5], [7, 5], [8, 6]]) {
      const res = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w, h })
      if (!res.ok) throw new Error(`전제 실패 ${w}x${h}`)
      const inside: number[] = []
      for (let y = 5; y < 4 + h - 1; y++) for (let x = 5; x < 4 + w - 1; x++) inside.push(tileIndex(x, y))
      expect([...res.world.zones.keys()].sort((a, b) => a - b)).toEqual(inside)
      const rs = computeRegions(res.world)
      expect(rs).toHaveLength(1)
      expect(rs[0].type).toBe('WAITING')
      expect([...rs[0].tiles].sort((a, b) => a - b)).toEqual(inside)
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

/*
  ── 의자 변종 ──────────────────────────────────────────────────────────────
  `variant`가 **선택 필드**인 이유는 `Furniture.variant` 주석이 단일 출처다 — 여기 베끼면
  두 사본이 갈린다(실제로 갈렸다). 여기 적을 것은 하나뿐이다: 아래 「키 자체가 없다」가
  `variant: undefined` 경로의 **유일한 가드**다. 깊은 비교 회귀는 undefined 키를 무시한다.
*/
describe('의자 변종 — 겉모습만 싣고 규칙은 안 건드린다', () => {
  const ALL: ChairVariant[] = ['STOOL', 'PLASTIC', 'BENCH', 'SOFA', 'RECLINER']

  it.each(ALL)('%s를 넘기면 그 값이 가구에 실린다', (v) => {
    const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]), v)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.furniture).toEqual([{ kind: 'CHAIR', x: 5, y: 5, variant: v }])
  })

  it('안 넘기면 **키 자체가 없다** — undefined를 채우면 깊은 비교 회귀가 깨진다', () => {
    const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.world.furniture[0])).toEqual(['kind', 'x', 'y'])
  })

  it('의자가 아닌 가구는 변종을 안 받는다 — 「소파 책상」이 데이터에 생길 자리를 없앤다', () => {
    for (const kind of ['DESK', 'BED', 'COUNTER'] as const) {
      const r = placeFurniture(createWorld(1), kind, pts([5, 5]), 'SOFA')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(Object.keys(r.world.furniture[0]), kind).toEqual(['kind', 'x', 'y'])
    }
  })

  it('드래그 여러 칸이면 전부 같은 변종이 실린다', () => {
    const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5], [6, 5], [7, 5]), 'BENCH')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.furniture.map(f => f.variant)).toEqual(['BENCH', 'BENCH', 'BENCH'])
  })

  /* 아래 셋이 **「외형만 다르다」(②-a)의 실체**다 — 규칙 세 축이 변종에 무감각함을 실제로 잰다.
     ②-b에서 안락함이 붙으면 이 셋 중 무엇이 갈리는지가 그 설계의 범위가 된다. */
  it('가격이 변종과 무관하다 — 외형이 값을 가르면 선택이 아니라 손해가 된다(스펙 §5)', () => {
    for (const v of ALL) {
      const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]), v)
      // 기준선을 **절대값에 묶는다** — 다른 호출과 비교하면 「둘 다 맞음」과 「둘 다 똑같이
      // 틀림」이 구별되지 않는다(placeFurniture가 통째로 죽어도 0 === 0으로 초록이었다 · T-144).
      expect(r.deltaManwon, v).toBe(-BUILD_COST.CHAIR)
    }
  })

  it('철거 환불도 변종과 무관하다 — 환불은 `kind`에서 파생한다', () => {
    for (const v of ALL) {
      const built = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]), v)
      expect(built.ok).toBe(true)
      if (!built.ok) return
      const gone = demolish(built.world, pts([5, 5]))
      expect(gone.deltaManwon, v).toBe(refundOf('CHAIR'))
    }
  })

  it('통행 판정이 변종에 무감각하다 — 벤치가 길을 막으면 좌석·경로 계약이 통째로 흔들린다', () => {
    for (const v of ALL) {
      expect(blocksWalk({ kind: 'CHAIR', x: 0, y: 0, variant: v }), v).toBe(false)
      const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]), v)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(isWalkable(r.world, 5, 5), v).toBe(true)
    }
  })
})
