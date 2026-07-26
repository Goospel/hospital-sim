import { describe, it, expect } from 'vitest'
import { initWorld, applyEvent, selectEvent, regionOf, backupHospitals, stepWorld, EVENT_CATALOG, OPENING_EVENT } from './world'
import { DEPARTMENTS } from './setup'
import type { DeptKey, DepartmentSpec, Specialty } from './types'

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

const SPECIALTIES: Specialty[] = [
  'THORACIC_SURGERY', 'CARDIOLOGY', 'OBSTETRICS', 'NEUROSURGERY', 'GENERAL_SURGERY', 'INTERNAL_MEDICINE',
]

describe('지역 세계 — 데이터 모델 (spec 2026-07-26 §2)', () => {
  it('initWorld는 CAPITAL·METRO·RURAL 3개 지역을 이 순서로 갖는다', () => {
    const world = initWorld()
    expect(world.regions.map((r) => r.key)).toEqual(['CAPITAL', 'METRO', 'RURAL'])
  })

  it('시작 시점: RURAL의 과별 의사 수는 모든 필수과에서 CAPITAL보다 적다 (spec 불변식)', () => {
    const world = initWorld()
    const capital = regionOf(world, 'CAPITAL')
    const rural = regionOf(world, 'RURAL')
    for (const s of SPECIALTIES) {
      expect(rural.doctors[s]).toBeLessThan(capital.doctors[s])
    }
  })

  it('시작 시점: RURAL의 배후 가능 병원 수는 모든 필수과에서 ≥ 1 — 붕괴는 전제가 아니라 과정이다', () => {
    const rural = regionOf(initWorld(), 'RURAL')
    for (const s of SPECIALTIES) {
      expect(backupHospitals(rural, s)).toBeGreaterThanOrEqual(1)
    }
  })

  it('backupHospitals = min(hospitals, floor(doctors/2)) — 배후 병원 하나에 의사 2명(ROUND_THE_CLOCK와 동일 규칙)', () => {
    const region = { key: 'RURAL' as const, hospitals: 2, doctors: {
      THORACIC_SURGERY: 5, CARDIOLOGY: 3, OBSTETRICS: 1, NEUROSURGERY: 0,
      GENERAL_SURGERY: 4, INTERNAL_MEDICINE: 2,
    } }
    expect(backupHospitals(region, 'THORACIC_SURGERY')).toBe(2) // floor(5/2)=2, min(2,2)=2
    expect(backupHospitals(region, 'CARDIOLOGY')).toBe(1)
    expect(backupHospitals(region, 'OBSTETRICS')).toBe(0) // 1명뿐 — 당직이 안 돈다
    expect(backupHospitals(region, 'NEUROSURGERY')).toBe(0)
  })

  it('METRO+RURAL 의사 합은 기존 POOL_INITIAL(2/4/3/3/5/6)과 정확히 같다 — 기존 밸런스 보존', () => {
    const world = initWorld()
    const metro = regionOf(world, 'METRO')
    const rural = regionOf(world, 'RURAL')
    const expected: Record<Specialty, number> = {
      THORACIC_SURGERY: 2, CARDIOLOGY: 4, OBSTETRICS: 3,
      NEUROSURGERY: 3, GENERAL_SURGERY: 5, INTERNAL_MEDICINE: 6,
    }
    for (const s of SPECIALTIES) {
      expect(metro.doctors[s] + rural.doctors[s]).toBe(expected[s])
    }
  })
})

describe('stepWorld — 주간 드리프트 (spec §3)', () => {
  it('결정론: 같은 (world, week)는 항상 같은 결과', () => {
    expect(stepWorld(initWorld(), 3)).toEqual(stepWorld(initWorld(), 3))
  })

  it('매주 RURAL에서 1~2명이 떠나고, 떠난 만큼 CAPITAL이 받는다(전국 총원 보존)', () => {
    const before = initWorld()
    const after = stepWorld(before, 2)
    const total = (w: ReturnType<typeof initWorld>, key: 'CAPITAL' | 'METRO' | 'RURAL') =>
      SPECIALTIES.reduce((n, s) => n + regionOf(w, key).doctors[s], 0)
    const ruralLoss = total(before, 'RURAL') - total(after, 'RURAL')
    expect(ruralLoss).toBeGreaterThanOrEqual(1)
    expect(ruralLoss).toBeLessThanOrEqual(2)
    expect(total(after, 'CAPITAL') - total(before, 'CAPITAL')).toBe(ruralLoss)
    expect(total(after, 'METRO')).toBe(total(before, 'METRO'))
  })

  it('의사 수는 0 밑으로 내려가지 않고, hospitals는 드리프트로 변하지 않는다', () => {
    let world = initWorld()
    for (let week = 2; week <= 30; week++) world = stepWorld(world, week)
    const rural = regionOf(world, 'RURAL')
    for (const s of SPECIALTIES) expect(rural.doctors[s]).toBeGreaterThanOrEqual(0)
    expect(rural.hospitals).toBe(2)
    expect(regionOf(world, 'CAPITAL').hospitals).toBe(8)
  })

  it('lawsuitRisk 과가 지방을 먼저 떠난다 — 가중 3배 (여러 주 누적으로 검증)', () => {
    let world = initWorld()
    for (let week = 2; week <= 9; week++) world = stepWorld(world, week)
    const before = regionOf(initWorld(), 'RURAL')
    const after = regionOf(world, 'RURAL')
    const risky = initWorld().departments.filter((d) => d.providesBackup && d.lawsuitRisk).map((d) => d.providesBackup!)
    const safe = initWorld().departments.filter((d) => d.providesBackup && !d.lawsuitRisk).map((d) => d.providesBackup!)
    const lossOf = (ss: Specialty[]) => ss.reduce((n, s) => n + before.doctors[s] - after.doctors[s], 0)
    expect(lossOf(risky)).toBeGreaterThan(lossOf(safe))
  })

  it('RURAL이 완전히 비면 stepWorld는 세계를 그대로 반환한다', () => {
    const world = initWorld()
    const emptied = {
      ...world,
      regions: world.regions.map((r) => r.key !== 'RURAL' ? r : {
        ...r, doctors: { THORACIC_SURGERY: 0, CARDIOLOGY: 0, OBSTETRICS: 0,
          NEUROSURGERY: 0, GENERAL_SURGERY: 0, INTERNAL_MEDICINE: 0 } }),
    }
    expect(stepWorld(emptied, 5)).toEqual(emptied)
  })
})
