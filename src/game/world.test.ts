import { describe, it, expect } from 'vitest'
import { initWorld, applyEvent, selectEvent, EVENT_CATALOG, OPENING_EVENT } from './world'
import { DEPARTMENTS } from './setup'
import type { DeptKey, DepartmentSpec } from './types'

// 외생 이벤트가 세계 파라미터(DEPARTMENTS 채용 경제)를 재구성하는 순수 코어.
// 헌법(spec §4): applyEvent는 채용 경제(profit/hireCost)만 만진다. 배후진료 매핑(providesBackup)과
// 전원 판정 경로는 절대 안 건드린다 — 세계는 바꾸되 개별 생사 판정은 코드가 잠근다.

/**
 * 그 과의 주간 **고정비**(만원, 양수). 2026-07-23 이전엔 손익(profit)이라 부호가 반대였다 —
 * 이제 **작을수록 유리**하고 **음수 델타가 개선**이다(world.ts DeptEffect 주석).
 */
function deptFixedCost(departments: DepartmentSpec[], key: DeptKey): number {
  return departments.find((d) => d.key === key)!.fixedCostPerDoctorManwon
}
function deptHireCost(departments: DepartmentSpec[], key: DeptKey): number {
  return departments.find((d) => d.key === key)!.hireCostManwon
}

describe('world — 외생 이벤트 세계 재구성 (순수)', () => {
  it('initWorld는 기본 DEPARTMENTS로 세계를 만든다', () => {
    const world = initWorld()
    expect(world.departments).toEqual(DEPARTMENTS)
  })

  it('개선 이벤트(분만·소아 정책수가)는 산부 고정비를 델타만큼 내린다', () => {
    const before = deptFixedCost(initWorld().departments, 'OBSTETRICS') // 1,050
    const world = applyEvent(initWorld(), selectEvent(0))
    expect(deptFixedCost(world.departments, 'OBSTETRICS')).toBe(before - 350) // 700
  })

  it('악화 이벤트(소송 여파)는 순환기 채용비를 델타만큼 올린다', () => {
    const worsen = EVENT_CATALOG.find((e) => e.direction === 'worsen')!
    const before = deptHireCost(initWorld().departments, 'CARDIOLOGY') // 15,000
    const world = applyEvent(initWorld(), worsen)
    expect(deptHireCost(world.departments, 'CARDIOLOGY')).toBe(before + 3_000) // 18,000
  })

  it('applyEvent는 입력 world를 변형하지 않는다 (순수·불변)', () => {
    const world = initWorld()
    const snapshot = deptFixedCost(world.departments, 'CARDIOLOGY')
    applyEvent(world, selectEvent(0))
    expect(deptFixedCost(world.departments, 'CARDIOLOGY')).toBe(snapshot) // 원본 불변
  })

  it('[헌법] 이벤트는 배후진료 매핑(providesBackup)·essential을 바꾸지 않는다 — 판정 경로 불변', () => {
    const world = applyEvent(initWorld(), selectEvent(0))
    for (const dept of world.departments) {
      const base = DEPARTMENTS.find((d) => d.key === dept.key)!
      expect(dept.providesBackup).toBe(base.providesBackup)
      expect(dept.essential).toBe(base.essential)
    }
  })

  /**
   * D형 비대칭 — 어떤 이벤트를 적용해도 **미용(비급여)이 가장 가볍다.**
   *
   * 정책은 급여 풀 안에서만 재분배한다: 필수과를 덜어주면 검진(급여 검사)에서 거둬 가고,
   * 미용은 그 풀 밖이라 한 번도 안 건드려진다. 그래서 비교 대상은 '수익과 전체'가 아니라
   * **미용 하나**다 — 검진은 개원 패키지에서 실제로 무거워진다(그게 이 게임이 하려는 말이다).
   *
   * 카탈로그 전체를 도는 게 요점이다: 한 이벤트의 델타만 키워도 논지가 조용히 뒤집힌다
   * (실측 2026-07-23: 산부 −420이면 고정비 630으로 미용과 **동률**이 됐다 → −350으로 조정).
   */
  it('어떤 이벤트를 적용해도 미용이 여전히 가장 유리하다 (D형 비대칭)', () => {
    for (const event of [...EVENT_CATALOG, OPENING_EVENT]) {
      const world = applyEvent(initWorld(), event)
      const aesthetics = deptFixedCost(world.departments, 'AESTHETICS')
      const others = world.departments
        .filter((d) => d.key !== 'AESTHETICS')
        .map((d) => d.fixedCostPerDoctorManwon)
      expect(aesthetics).toBeLessThan(Math.min(...others))
    }
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
describe('OPENING_EVENT — 1주차 개원: 필수의료 정책수가 개편(검사 재분배)', () => {
  it('다효과 패키지다 — 순환기 −420 / 검진 +420 (검사 과보상을 배후진료로)', () => {
    expect(OPENING_EVENT.effects).toHaveLength(2)
    const cardio = OPENING_EVENT.effects.find((e) => e.dept === 'CARDIOLOGY')!
    const checkup = OPENING_EVENT.effects.find((e) => e.dept === 'CHECKUP')!
    // 비용 층이라 부호가 뒤집혀 있다: 순환기는 부담이 줄고(−), 검진은 는다(+).
    expect(cardio).toMatchObject({ field: 'fixedCostPerDoctorManwon', delta: -420 })
    expect(checkup).toMatchObject({ field: 'fixedCostPerDoctorManwon', delta: 420 })
  })

  it('[재정중립] 패키지 profit 델타 합이 0이다 — 올린 만큼 검사에서 상쇄', () => {
    const sum = OPENING_EVENT.effects
      .filter((e) => e.field === 'fixedCostPerDoctorManwon')
      .reduce((n, e) => n + e.delta, 0)
    expect(sum).toBe(0)
  })

  it('적용하면 순환기 770·검진 1,050, 산부(1,050)·미용(560)은 불변 — 비급여 무풍지대', () => {
    const world = applyEvent(initWorld(), OPENING_EVENT)
    expect(deptFixedCost(world.departments, 'CARDIOLOGY')).toBe(770) // 1,190 − 420
    expect(deptFixedCost(world.departments, 'CHECKUP')).toBe(1_050) // 630 + 420
    expect(deptFixedCost(world.departments, 'OBSTETRICS')).toBe(1_050) // 손 안 댐
    expect(deptFixedCost(world.departments, 'AESTHETICS')).toBe(560) // 비급여 불변
  })

  it('명목상 개선으로 고지된다 (direction=improve) — 아이러니는 숫자에서', () => {
    expect(OPENING_EVENT.direction).toBe('improve')
  })
})

// 공문 브리핑 — 병원장이 읽는 실제 정책 도구 2-3줄. 각색 억 손익 토큰 금지(fact-grounding).
describe('세계 이벤트 브리핑 — 실제 정책 도구(각색 억 손익 금지)', () => {
  const all = [OPENING_EVENT, ...EVENT_CATALOG]

  it('모든 이벤트가 비어 있지 않은 briefing을 갖는다', () => {
    for (const e of all) {
      expect(Array.isArray(e.briefing)).toBe(true)
      expect(e.briefing.length).toBeGreaterThan(0)
      for (const line of e.briefing) expect(line.trim().length).toBeGreaterThan(0)
    }
  })

  it('briefing 어느 줄에도 각색 억 손익 토큰이 없다 (fact-grounding 잠금)', () => {
    for (const e of all) for (const line of e.briefing) expect(line).not.toMatch(/억/)
  })

  it('E3(흉부·외과 가산)는 흉부 델타 > 외과 델타 — 실제 가산율 대소(100% > 30%)', () => {
    const e3 = EVENT_CATALOG.find((e) => e.id === 'SURGERY_ADD_ON')!
    const thoracic = e3.effects.find((x) => x.dept === 'THORACIC_SURGERY')!.delta
    const general = e3.effects.find((x) => x.dept === 'GENERAL_SURGERY')!.delta
    // 비용 델타라 부호가 −다 — '더 큰 가산'은 '더 큰 절대값'으로 읽는다.
    expect(Math.abs(thoracic)).toBeGreaterThan(Math.abs(general))
  })
})
