import { describe, it, expect } from 'vitest'
import { SIM_DEPTS, simDept, HIRABLE_DEPTS, DEFAULT_EXAM_DEPT, type SimDeptKey } from './dept'
import { createWorld, isWalkable, ENTRANCE, type SimWorld } from './world'
import { hireDoctor } from './pawn'
import { hire, placeRoom } from './testHelpers'

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

describe('과 카탈로그', () => {
  it('과 4개 — 필수과 셋은 수가 < 미용, 고정비 대비 구조(부호 원칙의 원료)', () => {
    expect(HIRABLE_DEPTS).toEqual(['AESTHETICS', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'CARDIOLOGY'])
    expect(simDept('CARDIOLOGY').weeklyCostManwon).toBeGreaterThan(simDept('AESTHETICS').weeklyCostManwon)
    expect(simDept('INTERNAL_MEDICINE').examRevenueManwon).toBeLessThan(simDept('AESTHETICS').examRevenueManwon)
  })

  // 카탈로그 값 잠금. 부등호 테스트만으로는 **한 과 안에서 수가와 고정비가 뒤바뀌어도** 과 간
  // 대소가 그대로라 통과한다(미용 30/800 → 800/30이어도 내과 12 < 미용 800).
  // 그래서 표 자체를 한 번 못박는다 — 값을 의도적으로 조정할 땐 여기와 dept.ts 주석을 함께 고친다.
  // ⚠️ 고정비는 **계획 표의 최초값(2,500/3,000/4,000/5,000)이 아니다**. 구현 후 실측에서 부호가
  // 통째로 뒤집혀 있었고(미용 적자·순환기 응급으로 대흑자), 계획이 허용한 대로 부호 불변식
  // I-B1(week.test.ts)에 맞춰 재조정했다 — 근거는 dept.ts의 값별 주석에 있다.
  it('카탈로그 수치를 그대로 싣는다(수가·고정비·강도)', () => {
    const table: Record<SimDeptKey, { examRevenueManwon: number; weeklyCostManwon: number; intensity: number }> = {
      AESTHETICS: { examRevenueManwon: 30, weeklyCostManwon: 800, intensity: 0.3 },
      INTERNAL_MEDICINE: { examRevenueManwon: 12, weeklyCostManwon: 1_500, intensity: 1.0 },
      GENERAL_SURGERY: { examRevenueManwon: 25, weeklyCostManwon: 4_500, intensity: 1.2 },
      CARDIOLOGY: { examRevenueManwon: 25, weeklyCostManwon: 8_000, intensity: 1.2 },
    }
    for (const key of HIRABLE_DEPTS) {
      expect(simDept(key)).toMatchObject(table[key])
    }
  })

  it('부호 원칙 — 미용은 수가 최고이자 고정비 최저(유일한 흑자 후보)', () => {
    const cosmetic = simDept('AESTHETICS')
    for (const key of HIRABLE_DEPTS) {
      if (key === 'AESTHETICS') continue
      expect(simDept(key).examRevenueManwon).toBeLessThan(cosmetic.examRevenueManwon)
      expect(simDept(key).weeklyCostManwon).toBeGreaterThan(cosmetic.weeklyCostManwon)
      // 강도도 같은 방향이다 — 미용은 저강도(기존 FATIGUE_INTENSITY.COSMETIC_WALKIN 계승)
      expect(simDept(key).intensity).toBeGreaterThan(cosmetic.intensity)
    }
  })

  it('SIM_DEPTS와 HIRABLE_DEPTS는 같은 4과다(채용 목록이 카탈로그에서 파생)', () => {
    expect(Object.keys(SIM_DEPTS).sort()).toEqual([...HIRABLE_DEPTS].sort())
  })

  it('simDept — 2주차에 절단한 과는 조용히 undefined가 아니라 즉시 던진다', () => {
    // @ts-expect-error 카탈로그 밖 과(기존 게임 DeptKey에는 있다) — 런타임 방어를 확인한다
    expect(() => simDept('CHECKUP')).toThrow()
  })

  it('DEFAULT_EXAM_DEPT는 카탈로그 안의 과다', () => {
    expect(HIRABLE_DEPTS).toContain(DEFAULT_EXAM_DEPT)
  })
})

describe('EXAM 과 기본값', () => {
  it('EXAM에 dept를 안 주면 INTERNAL_MEDICINE 기본(마이그레이션 절단 — UI는 항상 지정)', () => {
    const r = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    expect(r.world.designations[0].dept).toBe('INTERNAL_MEDICINE')
  })

  it('EXAM에 dept를 주면 기본값이 그것을 덮지 않는다', () => {
    const r = placeRoom(createWorld(1), { type: 'EXAM', dept: 'CARDIOLOGY', x: 4, y: 4, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    expect(r.world.designations[0].dept).toBe('CARDIOLOGY')
  })

  it('EXAM이 아닌 방은 과가 없다 — 기본값이 방 종류를 가리지 않는다', () => {
    const r = placeRoom(createWorld(1), { type: 'WARD', x: 4, y: 4, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    expect(r.world.designations[0].dept).toBeUndefined()
  })

  it('EXAM이 아닌 방은 과를 **지정해도** 떨군다 — 무의미한 값이 실려 다니지 않는다', () => {
    // 위 테스트는 "안 주면 안 붙는다"만 잰다(spec에 dept가 아예 없으니 항진명제에 가깝다).
    // 실제 위험은 준 값이 그대로 실려 가는 것이다: 대기실·병동에는 과 개념이 없어서, 실려 온
    // dept는 읽는 쪽에서 뜻을 만들어낸다(예: 라우팅이 방 종류를 안 보면 "순환기 대기실"이
    // 진료실 행세를 한다). EXAM만 과를 갖는다는 계약을 여기서 못박는다.
    for (const type of ['WARD', 'WAITING', 'LOUNGE', 'RECEPTION'] as const) {
      const r = placeRoom(createWorld(1), { type, dept: 'CARDIOLOGY', x: 4, y: 4, w: 6, h: 5 })
      if (!r.ok) throw new Error(`전제 실패: ${type}`)
      expect(r.world.designations[0].type).toBe(type) // 나머지 스펙은 그대로 실린다
      expect(r.world.designations[0].dept).toBeUndefined()
    }
  })

  it('카탈로그 밖 과는 방·의사에 **컴파일에서** 막힌다', () => {
    // 넓은 DeptKey를 그대로 두면 이 두 줄이 타입을 통과하고, 그 방·의사는 라우팅이 simDept를
    // 부르는 **런타임**에야 터진다(그마저 그 방에 환자가 갈 때만). 좁혀 두면 여기로 당겨진다.
    // @ts-expect-error EXAM의 과는 SimDeptKey다 — 'CHECKUP'은 2주차 절단 과라 들어갈 수 없다
    placeRoom(createWorld(1), { type: 'EXAM', dept: 'CHECKUP', x: 4, y: 4, w: 6, h: 5 })
    // @ts-expect-error 의사의 전공과도 SimDeptKey다
    hireDoctor(createWorld(1), 'CHECKUP')
    expect(true).toBe(true) // 이 테스트의 단언은 위 두 줄이 **컴파일되지 않는다**는 것이다(tsc 게이트)
  })
})

describe('hireDoctor', () => {
  it('입구 부근 통행 타일에 그 과 의사 스폰·nextId 증가·비용 0(주급이 비용)', () => {
    const w = hire(createWorld(1), 'CARDIOLOGY')
    expect(w.pawns).toHaveLength(1)
    expect(w.pawns[0]).toMatchObject({ kind: 'DOCTOR', dept: 'CARDIOLOGY' })
    expect(w.treasuryManwon).toBe(50_000)
    expect(w.nextId).toBe(2)
    expect(w.pawns[0].id).toBe('doc-1')
  })

  it('과가 그대로 실린다 — 어느 과를 뽑았는지가 폰에 남는다', () => {
    for (const key of HIRABLE_DEPTS) {
      expect(hire(createWorld(1), key).pawns[0].dept).toBe(key)
    }
  })

  it('빈 세계에선 정문 타일에 선다', () => {
    const w = hire(createWorld(1), 'AESTHETICS')
    expect({ x: w.pawns[0].x, y: w.pawns[0].y }).toEqual(ENTRANCE)
  })

  it('정문이 막혀 있으면 인접한 통행 타일로 비켜 선다(막힌 칸에 세우지 않는다)', () => {
    // 정문에 가구가 놓인 세계 — placeRoom으로는 만들 수 없지만(방은 마지막 줄에 못 짓는다)
    // 세계는 순수 데이터라 손으로 세울 수 있다. 스폰이 통행 판정을 실제로 보는지 가르는 유일한 자리다.
    const base = createWorld(1)
    const blockedEntrance = {
      ...base,
      // 침대가 아니라 **책상**이다 — 침대는 이제 통행을 막지 않는다(그 위에 눕는다 · world.blocksWalk).
      furniture: [{ kind: 'DESK' as const, x: ENTRANCE.x, y: ENTRANCE.y, roomId: 'ghost' }],
    }
    const w = hire(blockedEntrance, 'GENERAL_SURGERY')
    const at = { x: w.pawns[0].x, y: w.pawns[0].y }
    expect(isWalkable(w, at.x, at.y)).toBe(true)
    expect(manhattan(at, ENTRANCE)).toBe(1) // 정문 바로 옆 — "입구 부근"을 지킨다
  })

  it('연속 채용은 **서로 다른 타일**에 선다 — 겹쳐 세우면 세 명이 화면에서 한 명으로 보인다', () => {
    // 스프라이트는 타일 하나를 꽉 채우므로 같은 칸의 폰은 위엣것만 보인다. 채용 패널에는
    // 3명인데 부지에는 1명이 서 있는 화면이 되고, 그 어긋남은 "채용이 안 먹혔다"로 읽힌다
    // (사용자 신고의 한 갈래였다 — 실제로는 세 명이 정확히 겹쳐 있었다).
    const w = hire(hire(hire(createWorld(1), 'AESTHETICS'), 'CARDIOLOGY'), 'INTERNAL_MEDICINE')
    expect(new Set(w.pawns.map(p => `${p.x},${p.y}`)).size).toBe(3)
  })

  it('분산해도 전부 통행 타일이고 정문 부근이다 — 흩어지느라 벽에 끼거나 멀리 가지 않는다', () => {
    const w = hire(hire(createWorld(1), 'AESTHETICS'), 'CARDIOLOGY')
    for (const p of w.pawns) {
      expect(isWalkable(w, p.x, p.y)).toBe(true)
      expect(manhattan({ x: p.x, y: p.y }, ENTRANCE)).toBeLessThanOrEqual(1)
    }
  })

  it('분산도 결정론 — 같은 순서로 뽑으면 같은 좌표다(BFS 순서·방향 순서 불변)', () => {
    const spots = (w: SimWorld) => w.pawns.map(p => ({ x: p.x, y: p.y }))
    const a = hire(hire(createWorld(3), 'AESTHETICS'), 'CARDIOLOGY')
    const b = hire(hire(createWorld(3), 'AESTHETICS'), 'CARDIOLOGY')
    expect(spots(a)).toEqual(spots(b))
  })

  it('두 번 채용하면 두 명이 남고 id가 겹치지 않는다', () => {
    const w = hire(hire(createWorld(1), 'AESTHETICS'), 'CARDIOLOGY')
    expect(w.pawns.map(p => p.id)).toEqual(['doc-1', 'doc-2'])
    expect(w.pawns.map(p => p.dept)).toEqual(['AESTHETICS', 'CARDIOLOGY'])
  })

  it('순수 — 입력 세계를 건드리지 않는다', () => {
    const w0 = createWorld(7)
    const snapshot = structuredClone(w0)
    hireDoctor(w0, 'INTERNAL_MEDICINE')
    expect(w0).toEqual(snapshot)
  })

  it('결정론 — 같은 세계에서 같은 결과', () => {
    // ⚠️ **성공을 먼저 못박는다.** 결과끼리만 비교하면 두 호출이 나란히 거부됐을 때도
    //    `{ok:false, reason:'NO_POOL'}` 둘이 같아서 통과한다 — 채용이 통째로 막힌 세계에서도
    //    green인 공허한 계측이 된다. `hire`(언랩)가 거부를 던지므로 이 줄이 그 경로를 봉한다.
    expect(hire(createWorld(3), 'CARDIOLOGY')).toEqual(hire(createWorld(3), 'CARDIOLOGY'))
  })
})
