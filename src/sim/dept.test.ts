import { describe, it, expect } from 'vitest'
import { SIM_DEPTS, simDept, HIRABLE_DEPTS, DEFAULT_EXAM_DEPT, type SimDeptKey } from './dept'
import { createWorld, isWalkable } from './world'
import { placeRoom } from './build'
import { hireDoctor } from './pawn'
import { ENTRANCE } from './patientFlow'

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

describe('과 카탈로그', () => {
  it('과 4개 — 필수과 셋은 수가 < 미용, 고정비 대비 구조(부호 원칙의 원료)', () => {
    expect(HIRABLE_DEPTS).toEqual(['AESTHETICS', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'CARDIOLOGY'])
    expect(simDept('CARDIOLOGY').weeklyCostManwon).toBeGreaterThan(simDept('AESTHETICS').weeklyCostManwon)
    expect(simDept('INTERNAL_MEDICINE').examRevenueManwon).toBeLessThan(simDept('AESTHETICS').examRevenueManwon)
  })

  // 계획 표(2026-07-28 PR B)의 값 잠금. 부등호 테스트만으로는 **한 과 안에서 수가와 고정비가
  // 뒤바뀌어도** 과 간 대소가 그대로라 통과한다(미용 30/2,500 → 2,500/30이어도 내과 12 < 미용 2,500).
  // 그래서 표 자체를 한 번 못박는다 — 값을 의도적으로 조정할 땐 여기와 계획 표를 함께 고친다.
  it('계획 표의 수치를 그대로 싣는다(수가·고정비·강도)', () => {
    const table: Record<SimDeptKey, { examRevenueManwon: number; weeklyCostManwon: number; intensity: number }> = {
      AESTHETICS: { examRevenueManwon: 30, weeklyCostManwon: 2_500, intensity: 0.3 },
      INTERNAL_MEDICINE: { examRevenueManwon: 12, weeklyCostManwon: 3_000, intensity: 1.0 },
      GENERAL_SURGERY: { examRevenueManwon: 25, weeklyCostManwon: 4_000, intensity: 1.2 },
      CARDIOLOGY: { examRevenueManwon: 25, weeklyCostManwon: 5_000, intensity: 1.2 },
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
    expect(r.world.rooms[0].dept).toBe('INTERNAL_MEDICINE')
  })

  it('EXAM에 dept를 주면 기본값이 그것을 덮지 않는다', () => {
    const r = placeRoom(createWorld(1), { type: 'EXAM', dept: 'CARDIOLOGY', x: 4, y: 4, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    expect(r.world.rooms[0].dept).toBe('CARDIOLOGY')
  })

  it('EXAM이 아닌 방은 과가 없다 — 기본값이 방 종류를 가리지 않는다', () => {
    const r = placeRoom(createWorld(1), { type: 'WARD', x: 4, y: 4, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    expect(r.world.rooms[0].dept).toBeUndefined()
  })
})

describe('hireDoctor', () => {
  it('입구 부근 통행 타일에 그 과 의사 스폰·nextId 증가·비용 0(주급이 비용)', () => {
    const w = hireDoctor(createWorld(1), 'CARDIOLOGY')
    expect(w.pawns).toHaveLength(1)
    expect(w.pawns[0]).toMatchObject({ kind: 'DOCTOR', dept: 'CARDIOLOGY' })
    expect(w.treasuryManwon).toBe(50_000)
    expect(w.nextId).toBe(2)
    expect(w.pawns[0].id).toBe('doc-1')
  })

  it('과가 그대로 실린다 — 어느 과를 뽑았는지가 폰에 남는다', () => {
    for (const key of HIRABLE_DEPTS) {
      expect(hireDoctor(createWorld(1), key).pawns[0].dept).toBe(key)
    }
  })

  it('빈 세계에선 정문 타일에 선다', () => {
    const w = hireDoctor(createWorld(1), 'AESTHETICS')
    expect({ x: w.pawns[0].x, y: w.pawns[0].y }).toEqual(ENTRANCE)
  })

  it('정문이 막혀 있으면 인접한 통행 타일로 비켜 선다(막힌 칸에 세우지 않는다)', () => {
    // 정문에 가구가 놓인 세계 — placeRoom으로는 만들 수 없지만(방은 마지막 줄에 못 짓는다)
    // 세계는 순수 데이터라 손으로 세울 수 있다. 스폰이 통행 판정을 실제로 보는지 가르는 유일한 자리다.
    const base = createWorld(1)
    const blockedEntrance = {
      ...base,
      furniture: [{ kind: 'BED' as const, x: ENTRANCE.x, y: ENTRANCE.y, roomId: 'ghost' }],
    }
    const w = hireDoctor(blockedEntrance, 'GENERAL_SURGERY')
    const at = { x: w.pawns[0].x, y: w.pawns[0].y }
    expect(isWalkable(w, at.x, at.y)).toBe(true)
    expect(manhattan(at, ENTRANCE)).toBe(1) // 정문 바로 옆 — "입구 부근"을 지킨다
  })

  it('두 번 채용하면 두 명이 남고 id가 겹치지 않는다', () => {
    const w = hireDoctor(hireDoctor(createWorld(1), 'AESTHETICS'), 'CARDIOLOGY')
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
    expect(hireDoctor(createWorld(3), 'CARDIOLOGY')).toEqual(hireDoctor(createWorld(3), 'CARDIOLOGY'))
  })
})
