import { describe, it, expect } from 'vitest'
import {
  GRID_W, GRID_H, REGIONS, createWorld, isWalkable, regionHirePool, simRegion,
  type SimRegionKey, type SimWorld,
} from './world'
import { HIRABLE_DEPTS, freshHirePool } from './dept'
import { LAWSUIT_COST_MANWON } from './events'
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
    expect(w.zones.size).toBe(0)
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
  it('**의자·침대는 통행 가능하다** — 그 칸에 올라서는 것이 곧 "앉는다·눕는다"다', () => {
    // 의자를 막으면 폰은 영영 의자 **옆**에 설 수밖에 없고, 화면에서는 의자가 늘 비어 보인다
    // (사용자 보고: *"의자를 추가해도 캐릭터들이 의자를 사용 안 해"*). 앉음을 표현할 유일한
    // 자리가 타일이므로, 막힘을 푸는 것이 곧 기능이다.
    // 침대가 같은 줄에 들어온 것도 **같은 보고**다: *"응급 환자가 침대에 눕지 않고 옆에 서 있다"*.
    for (const kind of ['CHAIR', 'BED'] as const) {
      const w = { ...createWorld(1), furniture: [{ kind, x: 6, y: 6 }] }
      expect(isWalkable(w, 6, 6)).toBe(true)
    }
  })
  it('그 밖의 가구는 그대로 막는다 — 책상·카운터는 옆에 선다', () => {
    for (const kind of ['DESK', 'COUNTER'] as const) {
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

/** 네 지역 전수 — 카탈로그에 지역을 더하면 아래 불변식이 저절로 그 지역까지 돈다.
 *  키 목록을 손으로 적으면 새 지역이 검사 없이 들어온다(카탈로그 파생 계약). */
const REGION_KEYS = Object.keys(REGIONS) as SimRegionKey[]

describe('지역 카탈로그 — 불변식', () => {
  it('네 지역이 전부 있고 key가 자기 자리와 같다 — 표를 옮겨 적다 어긋나지 않는다', () => {
    expect(REGION_KEYS.sort()).toEqual(['NEWTOWN', 'PROVINCIAL', 'RURAL', 'URBAN'])
    for (const key of REGION_KEYS) expect(simRegion(key).key).toBe(key)
    // 문구도 카탈로그가 소유한다 — 화면이 다시 적으면 규칙과 약속이 갈린다(설계 §4).
    for (const key of REGION_KEYS) {
      expect(simRegion(key).label.length).toBeGreaterThan(0)
      expect(simRegion(key).line.length).toBeGreaterThan(0)
    }
  })

  it('I-R1 **URBAN은 스트림 중립이다** — 배율 1·믹스 null·풀 델타 0', () => {
    // 이 설계의 결정론 잠금이다: createWorld의 기본 지역이 URBAN이라, 이 넷이 참인 한
    // 기존 스트림·풀 회귀 테스트 전체가 **수정 없이** 초록이어야 한다(설계 §7).
    // URBAN의 정체성은 스트림이 아니라 경제(임대료·소송)에만 있다 — 나중에 URBAN 배율을
    // 만지려면 이 단언을 의식적으로 깨야 한다.
    const urban = simRegion('URBAN')
    expect(urban.arrivalMul).toBe(1)
    expect(urban.emergencyMul).toBe(1)
    expect(urban.deptMix).toBeNull()
    expect(urban.hirePoolDelta).toEqual({})
  })

  it('I-R2 임대료 순서 — URBAN > NEWTOWN > PROVINCIAL > RURAL === 0', () => {
    // 값이 아니라 **순서가 주장**이다: 도심일수록 건물이 먼저 가져가고, 농어촌엔 임대인이 없다.
    const rent = (k: SimRegionKey) => simRegion(k).rentManwon
    expect(rent('URBAN')).toBeGreaterThan(rent('NEWTOWN'))
    expect(rent('NEWTOWN')).toBeGreaterThan(rent('PROVINCIAL'))
    expect(rent('PROVINCIAL')).toBeGreaterThan(rent('RURAL'))
    expect(rent('RURAL')).toBe(0)
  })

  it('I-R3 풀 하한 — 전 과 ≥ 0이고 **외과 ≥ 2 · 순환기 ≥ 1**', () => {
    // 응급 배후과가 시작부터 봉쇄되면 붕괴가 "과정"이 아니라 "전제"가 된다.
    // 음수 클램프를 구현에 두지 않는 이유가 이 단언이다 — 클램프가 있으면 오타 델타가
    // 조용히 0으로 접혀 이 테스트가 죽여야 할 돌연변이가 안 죽는다(설계 §4).
    for (const key of REGION_KEYS) {
      const pool = regionHirePool(key)
      for (const dept of HIRABLE_DEPTS) {
        expect(pool[dept], `${key}/${dept}`).toBeGreaterThanOrEqual(0)
      }
      expect(pool.GENERAL_SURGERY, key).toBeGreaterThanOrEqual(2)
      expect(pool.CARDIOLOGY, key).toBeGreaterThanOrEqual(1)
    }
  })

  it('I-R3ⓑ 풀은 **전국 풀에서 깎기만 한다** — 어느 지역도 전국보다 두껍지 않다', () => {
    // 델타는 가감이 아니라 감뿐이다(수도권 인력 집중의 각색). 보너스가 붙는 순간
    // pawn.hiredEver가 음수 서수를 받아 이름이 목록 끝에서부터 붙는다.
    const national = freshHirePool()
    for (const key of REGION_KEYS) {
      const pool = regionHirePool(key)
      for (const dept of HIRABLE_DEPTS) {
        expect(pool[dept], `${key}/${dept}`).toBeLessThanOrEqual(national[dept])
      }
    }
  })

  it('I-R3ⓒ 값 표 그대로 — 시작 풀은 8/5/3/2 · 8/5/2/1 · 4/3/2/1 · 2/3/2/1 (미/내/외/순)', () => {
    // 순서·대소는 위 불변식이 잡고, **절대값**은 여기서 멈춘다(events.test의 리터럴 단언과 같은 분담).
    const pool = (k: SimRegionKey) => {
      const p = regionHirePool(k)
      return [p.AESTHETICS, p.INTERNAL_MEDICINE, p.GENERAL_SURGERY, p.CARDIOLOGY]
    }
    expect(pool('URBAN')).toEqual([8, 5, 3, 2])
    expect(pool('NEWTOWN')).toEqual([8, 5, 2, 1])
    expect(pool('PROVINCIAL')).toEqual([4, 3, 2, 1])
    expect(pool('RURAL')).toEqual([2, 3, 2, 1])
  })

  it('I-R5 믹스 유효성 — null이 아니면 누적 상한 오름차순 + 마지막이 정확히 1.00', () => {
    // ARRIVAL_DEPT_MIX와 **같은 기계**를 잰다(pickWantsDept는 구간 표를 순서대로 읽는다):
    // 순서가 뒤집히면 앞 구간이 뒤를 통째로 삼켜 그 과가 영영 안 오고, 마지막이 1 미만이면
    // 치역 밖 값에서 pickWantsDept가 던진다.
    for (const key of REGION_KEYS) {
      const mix = simRegion(key).deptMix
      if (!mix) continue
      // 4과 전부가 표에 있어야 한다 — 빠진 과는 그 지역에서 영영 안 온다.
      expect(mix.map(([d]) => d).sort(), key).toEqual([...HIRABLE_DEPTS].sort())
      let prev = 0
      for (const [dept, upper] of mix) {
        expect(upper, `${key}/${dept}`).toBeGreaterThan(prev)
        prev = upper
      }
      expect(prev, key).toBe(1)
    }
  })

  it('I-R6 소송 정수 — 800 × 배율이 네 지역 모두 만원 단위 정수다', () => {
    // 소수 배율(0.5·2.0)이 정수를 낳는지는 값에 달렸다 — 0.55 같은 튜닝이 들어오는 날
    // 금고에 소수점이 새는 것을 여기서 먼저 막는다.
    for (const key of REGION_KEYS) {
      const cost = LAWSUIT_COST_MANWON * simRegion(key).lawsuitMul
      expect(Number.isInteger(cost), `${key}=${cost}`).toBe(true)
    }
    // 값 표 그대로 — URBAN 400 · RURAL 1,600 · 나머지 800.
    expect(LAWSUIT_COST_MANWON * simRegion('URBAN').lawsuitMul).toBe(400)
    expect(LAWSUIT_COST_MANWON * simRegion('RURAL').lawsuitMul).toBe(1_600)
    expect(LAWSUIT_COST_MANWON * simRegion('NEWTOWN').lawsuitMul).toBe(800)
    expect(LAWSUIT_COST_MANWON * simRegion('PROVINCIAL').lawsuitMul).toBe(800)
  })

  it('없는 지역은 던진다 — undefined가 배율 자리로 새면 도착이 통째로 NaN이 된다', () => {
    expect(() => simRegion('SEASIDE' as SimRegionKey)).toThrow()
  })
})

describe('createWorld — 지역이 시작 풀을 정한다', () => {
  it('PROVINCIAL은 4/3/2/1로 시작한다 — "공고는 해를 넘긴다"의 수학', () => {
    const w = createWorld(1, { region: 'PROVINCIAL' })
    expect(w.hirePool).toEqual(regionHirePool('PROVINCIAL'))
    expect(w.hirePool.AESTHETICS).toBe(4)
    expect(w.hirePool.CARDIOLOGY).toBe(1)
  })

  it('기본(URBAN) 세계의 풀은 **전국 풀 그대로다** — 기존 회귀가 무변이어야 한다', () => {
    expect(createWorld(1).hirePool).toEqual(freshHirePool())
  })

  it('풀은 세계마다 **새 객체**다 — 한 판의 채용이 다음 판의 시작 풀을 깎지 않는다', () => {
    const a = createWorld(1, { region: 'RURAL' })
    const b = createWorld(1, { region: 'RURAL' })
    a.hirePool.CARDIOLOGY -= 1
    expect(b.hirePool.CARDIOLOGY).toBe(1)
    // 카탈로그 자신도 안 갈렸다 — 델타 객체를 공유해 쓰면 여기서 걸린다.
    expect(regionHirePool('RURAL').CARDIOLOGY).toBe(1)
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
