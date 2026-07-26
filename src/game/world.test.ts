import { describe, it, expect } from 'vitest'
import { initWorld, applyEvent, selectEvent, regionOf, backupHospitals, stepWorld, EVENT_CATALOG, OPENING_EVENT } from './world'
import { DEPARTMENTS } from './setup'
import { POOL_INITIAL } from './system'
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

/**
 * 필수과 전수 — 리터럴로 재기재하지 않고 `RegionState.doctors`의 키에서 **파생**한다.
 * 리터럴이면 Specialty 유니온에 과가 늘어도 이 배열은 조용히 그대로여서, 새 과가 모든
 * 지역 불변식 검사에서 미커버로 빠진다(tsc가 못 잡는 무성 실패). 파생이면 자동으로 포함된다.
 */
const SPECIALTIES = Object.keys(regionOf(initWorld(), 'RURAL').doctors) as Specialty[]

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

  // 기대값을 리터럴로 다시 적지 않고 **실제 POOL_INITIAL과 비교**한다 — 이중 기재면 채용 풀을
  // 튜닝했을 때 이 테스트가 옛 숫자를 지키며 통과해, 보존하려던 그 일관성을 놓친다.
  it('METRO+RURAL 의사 합은 기존 POOL_INITIAL과 정확히 같다 — 기존 밸런스 보존', () => {
    const world = initWorld()
    const metro = regionOf(world, 'METRO')
    const rural = regionOf(world, 'RURAL')
    for (const s of SPECIALTIES) {
      expect(metro.doctors[s] + rural.doctors[s]).toBe(POOL_INITIAL[s])
    }
  })
})

const total = (w: ReturnType<typeof initWorld>, key: 'CAPITAL' | 'METRO' | 'RURAL') =>
  SPECIALTIES.reduce((n, s) => n + regionOf(w, key).doctors[s], 0)

describe('stepWorld — 주간 드리프트 (spec §3)', () => {
  it('결정론: 같은 (world, week)는 항상 같은 결과', () => {
    expect(stepWorld(initWorld(), 3)).toEqual(stepWorld(initWorld(), 3))
  })

  /**
   * 보존은 **매주** 성립해야 한다 — 한 주만 재면 후기 주차(고갈 직전, 추첨 후보가 1~2과로 좁아진
   * 구간)에서 보존이 깨지는 걸 놓친다. 그래서 12주까지 돌며 주마다 네 불변식을 다 본다.
   */
  it('매주 RURAL 손실 = CAPITAL 증가, METRO 불변, 남아 있으면 1~2명 (12주 전 구간)', () => {
    let world = initWorld()
    for (let week = 2; week <= 12; week++) {
      const before = world
      world = stepWorld(before, week)
      const ruralLoss = total(before, 'RURAL') - total(world, 'RURAL')
      // 전국 총원 보존: RURAL이 잃은 만큼 정확히 CAPITAL이 받고, METRO는 드리프트에 안 낀다.
      expect(total(world, 'CAPITAL') - total(before, 'CAPITAL')).toBe(ruralLoss)
      expect(total(world, 'METRO')).toBe(total(before, 'METRO'))
      // 페이스: 남은 사람이 있으면 반드시 1명 이상 빠지고, 한 주에 2명을 넘지 않는다.
      if (total(before, 'RURAL') > 0) expect(ruralLoss).toBeGreaterThanOrEqual(1)
      expect(ruralLoss).toBeLessThanOrEqual(2)
    }
  })

  /**
   * 특성화 테스트 — 드리프트 **페이스에 핀을 박는다**(코디네이터 수용값, 2026-07-26).
   *
   * RURAL 초기 13명이 10주차에 소진되고 그 뒤 stepWorld는 no-op이 된다 = 압력 포화.
   * 이건 검증이 아니라 **현재 거동의 기록**이다: 페이스가 바뀌면(초기값·EXTRA_DRIFT_CHANCE·
   * LAWSUIT_DRIFT_WEIGHT·시드 salt 중 무엇이든) 이 테스트가 깨져 변화를 **의도적으로 승인**하게 만든다.
   * 실제로 salt 축을 고치자 소진이 9→10주차로 밀렸고, 핀이 없었으면 조용히 지나갔다.
   *
   * ⚠️ 이 숫자를 "고치는" 게 목적이면 튜닝이 아니라 여기부터 고쳐라 — 페이스는 의도된 값이다.
   */
  it('[특성화] RURAL은 정확히 10주차에 소진되고, 그 뒤 stepWorld는 no-op이다', () => {
    let world = initWorld()
    expect(total(world, 'RURAL')).toBe(13) // 초기 13명 — 소진 주차를 정하는 분자

    // 🔴 **경계를 양쪽에서 잡는다.** "10주차에 0"만 재면 페이스가 **빨라져도** 통과한다
    // (8주차에 이미 0이어도 10주차엔 여전히 0) — 실측으로 EXTRA_DRIFT_CHANCE를 0.5로 올려도
    // 안 깨졌다. 9주차에 아직 남아 있음을 함께 못박아야 가속·감속이 둘 다 걸린다.
    for (let week = 2; week <= 9; week++) world = stepWorld(world, week)
    expect(total(world, 'RURAL')).toBe(1) // 9주차 끝: 아직 1명 — 여기서 0이면 페이스가 빨라진 것

    world = stepWorld(world, 10)
    expect(total(world, 'RURAL')).toBe(0) // 10주차에 소진 = 압력 포화

    // 소진 후엔 뽑을 후보가 없어 입력을 그대로 반환한다(참조 동일성까지).
    for (let week = 11; week <= 14; week++) expect(stepWorld(world, week)).toBe(world)
  })

  it('의사 수는 0 밑으로 내려가지 않고, hospitals는 드리프트로 변하지 않는다', () => {
    let world = initWorld()
    for (let week = 2; week <= 30; week++) world = stepWorld(world, week)
    const rural = regionOf(world, 'RURAL')
    for (const s of SPECIALTIES) expect(rural.doctors[s]).toBeGreaterThanOrEqual(0)
    expect(rural.hospitals).toBe(2)
    expect(regionOf(world, 'CAPITAL').hospitals).toBe(8)
  })

  /**
   * 🔴 **손실 총량을 그냥 비교하면 이 테스트는 공허하다** — 두 교란요인 때문에
   * LAWSUIT_DRIFT_WEIGHT를 1로 지워도 통과한다(실측 2026-07-26).
   *
   *   ① **집단 크기**: 위험과는 5개(내과만 안전)라, 균등 추첨이어도 손실이 5배로 쏠린다.
   *      `risky=4 / safe=1`도 `4 > 1`로 통과한다 — 가중이 아니라 과 개수를 재고 있었다.
   *   ② **고갈**: RURAL 총원 13명이 10주차에 소진돼, 그 뒤로는 누적 손실이 가중치와 무관하게
   *      초기 인구(위험과 10 / 내과 3)로 수렴한다 — 창을 넓히면 **더** 공허해진다.
   *
   * | 창 2..6 | 가중 3(실제) | 가중 1(돌연변이) |
   * |---|---|---|
   * | 총량 | 7 vs 1 통과 | 5 vs 3 **통과(공허)** |
   * | **과당** | **1.40 vs 1.00 통과** | **1.00 vs 3.00 깨짐 ✓** |
   *
   * 그래서 **과당 손실률**로 정규화한다 — driftOnce가 가중치를 *의사 1명당*이 아니라 *과 1개당*
   * 밀어넣으므로, 과당 비율이 정확히 그 가중치를 분리하는 척도다. 창(2..6)은 고갈 전이면서
   * 양방향 여유가 가장 큰 지점이다(넓히면 ②로 공허, 2..4로 좁히면 1.00 vs 0.00으로 여유가 준다).
   */
  it('lawsuitRisk 과가 지방을 먼저 떠난다 — 과당 손실률이 안전과보다 높다 (LAWSUIT_DRIFT_WEIGHT)', () => {
    let world = initWorld()
    for (let week = 2; week <= 6; week++) world = stepWorld(world, week)
    const before = regionOf(initWorld(), 'RURAL')
    const after = regionOf(world, 'RURAL')
    const risky = initWorld().departments.filter((d) => d.providesBackup && d.lawsuitRisk).map((d) => d.providesBackup!)
    const safe = initWorld().departments.filter((d) => d.providesBackup && !d.lawsuitRisk).map((d) => d.providesBackup!)
    const lossOf = (ss: Specialty[]) => ss.reduce((n, s) => n + before.doctors[s] - after.doctors[s], 0)
    // 과 개수로 나눠 ①을 제거한다 — 하드코딩(5/1) 대신 실제 길이로 나눠 DEPARTMENTS가 바뀌어도 유효하다.
    expect(lossOf(risky) / risky.length).toBeGreaterThan(lossOf(safe) / safe.length)
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

describe('RegionEffect — 이벤트가 지역 수치를 흔든다 (spec §4)', () => {
  it('LITIGATION_CHILL은 RURAL 산부인과 의사를 1 줄인다 (배상 판결 → 지방 이탈)', () => {
    const event = EVENT_CATALOG.find((e) => e.id === 'LITIGATION_CHILL')!
    const before = initWorld()
    const after = applyEvent(before, event)
    expect(regionOf(after, 'RURAL').doctors.OBSTETRICS)
      .toBe(regionOf(before, 'RURAL').doctors.OBSTETRICS - 1)
    // 기존 효과(순환기 채용비 +3000)도 그대로 동작
    expect(after.departments.find((d) => d.key === 'CARDIOLOGY')!.hireCostManwon)
      .toBe(before.departments.find((d) => d.key === 'CARDIOLOGY')!.hireCostManwon + 3_000)
  })

  it('regionEffects 없는 이벤트는 regions를 건드리지 않는다', () => {
    const before = initWorld()
    const after = applyEvent(before, selectEvent(0)) // OB_PEDS_POLICY_FEE — dept 효과만
    expect(after.regions).toEqual(before.regions)
  })

  it('의사·병원 수는 델타로 0 밑으로 내려가지 않는다(클램프)', () => {
    const world = initWorld()
    const shock = { id: 'X', headline: 'x', direction: 'worsen' as const, effects: [], briefing: [],
      regionEffects: [{ region: 'RURAL' as const, field: 'doctors' as const, dept: 'THORACIC_SURGERY' as const, delta: -99 }] }
    expect(regionOf(applyEvent(world, shock), 'RURAL').doctors.THORACIC_SURGERY).toBe(0)
  })

  it('applyEvent는 입력 world를 변이하지 않는다(불변)', () => {
    const world = initWorld()
    const snapshot = JSON.parse(JSON.stringify(world))
    applyEvent(world, EVENT_CATALOG.find((e) => e.id === 'LITIGATION_CHILL')!)
    expect(world).toEqual(snapshot)
  })
})
