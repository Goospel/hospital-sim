import { describe, it, expect } from 'vitest'
import { initWorld, applyEvent, selectEvent, EVENT_CATALOG, OPENING_EVENT } from './world'
import { DEPARTMENTS } from './setup'
import type { DeptKey, DepartmentSpec } from './types'

// 외생 이벤트가 세계 파라미터(DEPARTMENTS 채용 경제)를 재구성하는 순수 코어.
// 헌법(spec §4): applyEvent는 채용 경제(profit/hireCost)만 만진다. 배후진료 매핑(providesBackup)과
// 전원 판정 경로는 절대 안 건드린다 — 세계는 바꾸되 개별 생사 판정은 코드가 잠근다.

function deptProfit(departments: DepartmentSpec[], key: DeptKey): number {
  return departments.find((d) => d.key === key)!.profitPerDoctorBillions
}
function deptHireCost(departments: DepartmentSpec[], key: DeptKey): number {
  return departments.find((d) => d.key === key)!.hireCostBillions
}

describe('world — 외생 이벤트 세계 재구성 (순수)', () => {
  it('initWorld는 기본 DEPARTMENTS로 세계를 만든다', () => {
    const world = initWorld()
    expect(world.departments).toEqual(DEPARTMENTS)
  })

  it('개선 이벤트(순환기 수가 인상)는 순환기 손익을 델타만큼 올린다', () => {
    const before = deptProfit(initWorld().departments, 'CARDIOLOGY') // -12
    const world = applyEvent(initWorld(), selectEvent(0)) // index 0 = 개선(CARDIO_FEE_HIKE)
    expect(deptProfit(world.departments, 'CARDIOLOGY')).toBe(before + 6) // -6
  })

  it('악화 이벤트(소송 여파)는 순환기 채용비를 델타만큼 올린다', () => {
    const worsen = EVENT_CATALOG.find((e) => e.direction === 'worsen')!
    const before = deptHireCost(initWorld().departments, 'CARDIOLOGY') // 30
    const world = applyEvent(initWorld(), worsen)
    expect(deptHireCost(world.departments, 'CARDIOLOGY')).toBe(before + 6) // 36
  })

  it('applyEvent는 입력 world를 변형하지 않는다 (순수·불변)', () => {
    const world = initWorld()
    const snapshot = deptProfit(world.departments, 'CARDIOLOGY')
    applyEvent(world, selectEvent(0))
    expect(deptProfit(world.departments, 'CARDIOLOGY')).toBe(snapshot) // 원본 불변
  })

  it('[헌법] 이벤트는 배후진료 매핑(providesBackup)·essential을 바꾸지 않는다 — 판정 경로 불변', () => {
    const world = applyEvent(initWorld(), selectEvent(0))
    for (const dept of world.departments) {
      const base = DEPARTMENTS.find((d) => d.key === dept.key)!
      expect(dept.providesBackup).toBe(base.providesBackup)
      expect(dept.essential).toBe(base.essential)
    }
  })

  it('개선 이벤트를 적용해도 미용이 순환기보다 여전히 유리하다 (D형 비대칭)', () => {
    const world = applyEvent(initWorld(), selectEvent(0)) // 순환기 수가 인상(개선)
    expect(deptProfit(world.departments, 'AESTHETICS')).toBeGreaterThan(
      deptProfit(world.departments, 'CARDIOLOGY'),
    )
  })

  it('카탈로그는 개선과 악화 이벤트를 모두 담는다 (양방향)', () => {
    expect(EVENT_CATALOG.some((e) => e.direction === 'improve')).toBe(true)
    expect(EVENT_CATALOG.some((e) => e.direction === 'worsen')).toBe(true)
  })

  it('selectEvent(0)은 개선 이벤트를 결정론적으로 고른다', () => {
    expect(selectEvent(0)).toBe(EVENT_CATALOG[0])
    expect(EVENT_CATALOG[0].direction).toBe('improve')
  })
})

// 1주차 개원 전용 큐레이션 이벤트 — 순환 카탈로그(EVENT_CATALOG)와 별개.
// 재정중립 정책수가 패키지: 순환기 수가를 올린 만큼 급여 풀 안에서 산부가 내려가 profit 합=0.
// 미용(비급여)은 풀 밖이라 무풍지대 — "급여 안에서 재분배해도 비급여를 못 이긴다".
describe('OPENING_EVENT — 1주차 개원 재정중립 정책수가 패키지', () => {
  it('다효과 패키지다 — 순환기 +6 / 산부 −6 (한 이벤트가 두 과를 동시에)', () => {
    expect(OPENING_EVENT.effects).toHaveLength(2)
    const cardio = OPENING_EVENT.effects.find((e) => e.dept === 'CARDIOLOGY')!
    const ob = OPENING_EVENT.effects.find((e) => e.dept === 'OBSTETRICS')!
    expect(cardio).toMatchObject({ field: 'profitPerDoctorBillions', delta: 6 })
    expect(ob).toMatchObject({ field: 'profitPerDoctorBillions', delta: -6 })
  })

  it('[재정중립] 급여과 profit 델타 합이 0이다 — 급여 풀 안에서 제로섬', () => {
    const essentialKeys = new Set(DEPARTMENTS.filter((d) => d.essential).map((d) => d.key))
    const sum = OPENING_EVENT.effects
      .filter((e) => e.field === 'profitPerDoctorBillions' && essentialKeys.has(e.dept))
      .reduce((n, e) => n + e.delta, 0)
    expect(sum).toBe(0)
  })

  it('적용하면 순환기 −6·산부 −16이 되고 미용(+70)은 손 안 댄다 — 비급여 무풍지대', () => {
    const world = applyEvent(initWorld(), OPENING_EVENT)
    expect(deptProfit(world.departments, 'CARDIOLOGY')).toBe(-6) // -12 + 6
    expect(deptProfit(world.departments, 'OBSTETRICS')).toBe(-16) // -10 - 6
    expect(deptProfit(world.departments, 'AESTHETICS')).toBe(70) // 비급여 불변
  })

  it('명목상 개선으로 고지된다 (direction=improve) — 아이러니는 숫자에서', () => {
    expect(OPENING_EVENT.direction).toBe('improve')
  })
})
