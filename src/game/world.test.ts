import { describe, it, expect } from 'vitest'
import { initWorld, applyEvent, selectEvent, regionOf, backupHospitals, stepWorld, transferPressure, hireFromRegions, resignFromRegions, EVENT_CATALOG, OPENING_EVENT, REGION_LABELS, type RegionEffect, type WorldEvent, type WorldState } from './world'
import { DEPARTMENTS } from './setup'
import { POOL_INITIAL } from './system'
// 지명 비중복 검사기의 단일 출처 — 목록을 복제하지 않고 news.ts에서 그대로 가져온다.
import { FICTIONAL_REGIONS, FORBIDDEN_REAL_EVENT_TOKENS } from './news'
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

describe('hireFromRegions — 채용 추첨 스트림 (spec §6)', () => {
  /**
   * 🔴 **과마다 자기 추첨을 갖는다** — 추첨 카운터가 과별로 리셋되면 같은 주 모든 과의 첫 채용이
   * 난수 **하나**를 공유해, "남은 수 비례 추첨"이 **단일 임계 컷**으로 붕괴한다
   * (실측: week 2의 롤 0.8163이면 metro 점유율이 그보다 낮은 과가 전부 RURAL로 쏠린다).
   *
   * ⚠️ **계측기 선택이 이 테스트의 전부다.** 처음엔 흉부(metro 0)와 내과를 짝지었는데 **판별력이
   * 0이었다**(돌연변이 실측: 과별 리셋으로 되돌려도 통과) — 흉부는 metro가 비어 롤과 무관하게 RURAL로
   * 강제되므로, 그 비교는 "내과가 METRO로 간 주가 있나"만 묻고 그건 스트림 공유와 무관하게 참이다.
   *
   * 판별하는 짝은 **metro 점유율이 같고 둘 다 강제되지 않는 두 과**다: 순환기(metro 2/rural 2)와
   * 내과(metro 3/rural 3)는 임계값이 똑같이 0.5다. 스트림을 공유하면 같은 롤을 같은 임계와 비교하니
   * **매주 반드시 같은 지역**으로 간다. 독립이면 서로 다른 롤이라 갈리는 주가 나온다.
   */
  it('같은 주에 여러 과를 뽑으면 과별로 다른 추첨을 쓴다 — 임계가 같은 두 과가 갈린다', () => {
    const metroBase = regionOf(initWorld(), 'METRO')
    // 임계가 같은(0.5) 두 과 — 스트림이 공유되면 결정이 완전히 붙어 버린다.
    const pickOf = (world: ReturnType<typeof initWorld>, s: Specialty) =>
      regionOf(world, 'METRO').doctors[s] < metroBase.doctors[s] ? 'METRO' : 'RURAL'

    let sawDifferent = false
    for (let week = 2; week <= 12; week++) {
      // 한 번의 호출에서 두 과를 1명씩 — 카운터가 과 경계를 넘어 이어지는지가 여기서 갈린다.
      const after = hireFromRegions(initWorld(), { CARDIOLOGY: 1, INTERNAL_MEDICINE: 1 }, week)
      if (pickOf(after, 'CARDIOLOGY') !== pickOf(after, 'INTERNAL_MEDICINE')) sawDifferent = true
    }
    expect(sawDifferent).toBe(true) // 카운터를 과별 리셋(i)으로 되돌리면 거짓이 된다
  })

  it('음수 증분(해고)은 세계를 안 바꾼다 — 내보낸 사람은 세계로 돌아오지 않는다', () => {
    const world = initWorld()
    expect(hireFromRegions(world, { CARDIOLOGY: -2 }, 2)).toEqual(world)
  })
})

describe('resignFromRegions — 사직은 세계에서 사람을 지운다', () => {
  it('사직 1명이면 METRO 또는 RURAL에서 정확히 1명 준다(CAPITAL 불변)', () => {
    const before = initWorld()
    const after = resignFromRegions(before, { CARDIOLOGY: 1 }, 2)
    const loss = (key: 'CAPITAL' | 'METRO' | 'RURAL') =>
      regionOf(before, key).doctors.CARDIOLOGY - regionOf(after, key).doctors.CARDIOLOGY
    expect(loss('CAPITAL')).toBe(0)
    expect(loss('METRO') + loss('RURAL')).toBe(1)
  })

  it('METRO+RURAL이 0인 과는 클램프 — 세계를 안 바꾼다(음수 없음)', () => {
    const world = initWorld()
    const after = resignFromRegions(world, { THORACIC_SURGERY: 99 }, 2)
    // 흉부는 METRO 0 + RURAL 2 — 2명까지만 빠지고 그 이상은 무시된다(hireFromRegions와 동일 계약).
    expect(regionOf(after, 'METRO').doctors.THORACIC_SURGERY).toBe(0)
    expect(regionOf(after, 'RURAL').doctors.THORACIC_SURGERY).toBe(0)
    expect(regionOf(after, 'CAPITAL').doctors.THORACIC_SURGERY)
      .toBe(regionOf(world, 'CAPITAL').doctors.THORACIC_SURGERY)
  })

  it('결정론: 같은 입력은 같은 결과', () => {
    expect(resignFromRegions(initWorld(), { OBSTETRICS: 2 }, 3))
      .toEqual(resignFromRegions(initWorld(), { OBSTETRICS: 2 }, 3))
  })

  it('입력 world를 변이하지 않는다', () => {
    const world = initWorld()
    const snapshot = JSON.parse(JSON.stringify(world))
    resignFromRegions(world, { CARDIOLOGY: 2 }, 2)
    expect(world).toEqual(snapshot)
  })

  /**
   * 🔴 **사직은 채용과 다른 시드 스트림이다.** 같은 주에 채용(GROWTH)과 사직(결산)이 같은 salt를
   * 공유하면 두 뽑기가 한 스트림을 밀어내며 서로의 궤적을 흔든다 — "채용을 했느냐"가 사직자의
   * 출신 지역을 바꾸는 숨은 결합이다. salt를 가르면 두 사건이 서로 독립이다.
   *
   * 계측기는 hireFromRegions의 스트림 테스트와 같은 이유로 **강제되지 않는 과**여야 한다:
   * 순환기(METRO 2 / RURAL 2)는 임계 0.5라 롤에 실제로 반응한다.
   */
  it('채용과 다른 salt를 쓴다 — 같은 (world, 과, 주)에서도 궤적이 갈리는 주가 있다', () => {
    const metroBase = regionOf(initWorld(), 'METRO').doctors.CARDIOLOGY
    const pickOf = (world: WorldState) =>
      regionOf(world, 'METRO').doctors.CARDIOLOGY < metroBase ? 'METRO' : 'RURAL'

    let sawDifferent = false
    for (let week = 1; week <= 20; week++) {
      const hired = pickOf(hireFromRegions(initWorld(), { CARDIOLOGY: 1 }, week))
      const resigned = pickOf(resignFromRegions(initWorld(), { CARDIOLOGY: 1 }, week))
      if (hired !== resigned) sawDifferent = true
    }
    expect(sawDifferent).toBe(true) // salt를 HIRE_SALT로 되돌리면 두 궤적이 완전히 붙어 거짓이 된다
  })
})

/**
 * 지역 쇼크 이벤트 팩토리 — 테스트가 신경 쓰는 건 `regionEffects` 하나뿐이라, 나머지 필드는
 * 여기서 한 번만 채운다. `RegionEffect`가 export 타입이라 호출부의 `as const` 사슬이 전부 사라진다
 * (판별 유니온이라 잘못된 조합은 여기서 tsc가 거부한다 — 테스트 리터럴도 같은 잠금을 받는다).
 */
const shockOf = (regionEffects: RegionEffect[], direction: 'improve' | 'worsen' = 'worsen'): WorldEvent =>
  ({ id: 'SHOCK', headline: 'x', direction, effects: [], briefing: [], regionEffects })

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
    // 🔴 **타겟팅**: 효과가 지정 지역에만 닿는다. 이 단정이 없으면 applyEvent의
    // `.filter((e) => e.region === region.key)`를 지워도 테스트가 통과한다(리뷰어 돌연변이 실측) —
    // 필터가 없으면 RURAL 델타가 세 지역 전부에 적용되는데, RURAL만 재면 그게 안 보인다.
    expect(regionOf(after, 'CAPITAL').doctors).toEqual(regionOf(before, 'CAPITAL').doctors)
    expect(regionOf(after, 'METRO').doctors).toEqual(regionOf(before, 'METRO').doctors)
  })

  it('regionEffects 없는 이벤트는 regions를 건드리지 않는다', () => {
    const before = initWorld()
    const after = applyEvent(before, selectEvent(0)) // OB_PEDS_POLICY_FEE — dept 효과만
    expect(after.regions).toEqual(before.regions)
  })

  // 제목이 'doctors'로 한정된 게 중요하다 — 옛 제목("의사·병원 수는…")은 hospitals까지 커버하는
  // 것처럼 읽혀서, 그 분기가 실제로 무검증인 걸 가렸다(직전 검증 공백의 원인). hospitals는 아래 별도 테스트.
  it('의사 수는 델타로 0 밑으로 내려가지 않는다(클램프)', () => {
    const shock = shockOf([{ region: 'RURAL', field: 'doctors', dept: 'THORACIC_SURGERY', delta: -99 }])
    expect(regionOf(applyEvent(initWorld(), shock), 'RURAL').doctors.THORACIC_SURGERY).toBe(0)
  })

  /**
   * `field: 'hospitals'` 분기 — spec §4의 예시("거점병원 응급실 축소" → RURAL hospitals −1)가
   * 실제로 돌아가는지. 이 두 테스트가 없으면 hospitals 경로는 **한 번도 실행되지 않고**,
   * 그 안의 `Math.max(0,` 클램프를 지워도 전 스위트가 통과한다(리뷰어 돌연변이 실측).
   */
  it('hospitals 쇼크는 그 지역 병원 수만 줄인다 — RURAL 2 → 1, doctors·타 지역 불변', () => {
    const before = initWorld()
    const after = applyEvent(before, shockOf([{ region: 'RURAL', field: 'hospitals', delta: -1 }]))
    expect(regionOf(after, 'RURAL').hospitals).toBe(regionOf(before, 'RURAL').hospitals - 1) // 2 → 1
    // 병원 수만 움직인다 — 의사 수는 hospitals 델타에 안 딸려간다(field 유니온이 가른 두 축).
    expect(regionOf(after, 'RURAL').doctors).toEqual(regionOf(before, 'RURAL').doctors)
    expect(regionOf(after, 'CAPITAL').hospitals).toBe(regionOf(before, 'CAPITAL').hospitals)
    expect(regionOf(after, 'METRO').hospitals).toBe(regionOf(before, 'METRO').hospitals)
  })

  it('hospitals도 0 밑으로 내려가지 않는다(클램프)', () => {
    const shock = shockOf([{ region: 'RURAL', field: 'hospitals', delta: -99 }])
    expect(regionOf(applyEvent(initWorld(), shock), 'RURAL').hospitals).toBe(0)
  })

  it('applyEvent는 입력 world를 변이하지 않는다(불변)', () => {
    const world = initWorld()
    const snapshot = JSON.parse(JSON.stringify(world))
    applyEvent(world, EVENT_CATALOG.find((e) => e.id === 'LITIGATION_CHILL')!)
    expect(world).toEqual(snapshot)
  })
})

describe('transferPressure — 세계 → 콜 구성 번역 (spec §5)', () => {
  it('초기 세계의 압력은 0', () => {
    expect(transferPressure(initWorld())).toBe(0)
  })

  it('RURAL 배후가 무너질수록 압력이 단조 증가하고 1을 넘지 않는다', () => {
    let world = initWorld()
    let prev = transferPressure(world)
    for (let week = 2; week <= 30; week++) {
      world = stepWorld(world, week)
      const p = transferPressure(world)
      expect(p).toBeGreaterThanOrEqual(prev)
      expect(p).toBeLessThanOrEqual(1)
      prev = p
    }
    // 포화 핀 — 30주면 RURAL이 비어 압력이 **정확히 1**이다. `> 0`이면 0.17만 올라도 통과해
    // 포화를 놓친다. 그룹A의 '10주차 소진' 특성화 테스트와 한 쌍으로, 같은 사실을 압력 축에서 못박는다.
    expect(prev).toBe(1)
  })

  /**
   * 하한(`Math.max(0, ...)`)이 죽은 코드가 아님을 증명한다 — 상한 `Math.min(1, ...)`은 now ≥ 0이라
   * 수학적으로 도달 불가여서 제거했지만, 하한은 **유입 쇼크로 실제로 도달한다**.
   * 이 테스트가 없으면 `Math.max(0,`를 지워도 전 스위트가 통과하고, 압력이 음수로 새어
   * createCallQueue(Task 7)에 음수 비중이 들어간다.
   */
  it('유입 쇼크로 초기보다 배후가 늘면 압력은 음수가 아니라 0이다(하한)', () => {
    const inflow = shockOf([{ region: 'RURAL', field: 'doctors', dept: 'CARDIOLOGY', delta: 99 }], 'improve')
    expect(transferPressure(applyEvent(initWorld(), inflow))).toBe(0)
  })
})

/**
 * 지명 비중복 **검사기** — 이 저장소 원칙("검사기 없는 규약은 죽는 게 아니라 썩는다")의 적용.
 *
 * REGION_LABELS의 비중복 요구는 world.ts 주석에만 있던 소프트 규약이었고, 계획서 초안이
 * 실제로 밟았다(한내시·금하시 = FICTIONAL_REGIONS와 동일명). 사람이 알아채서 고쳤을 뿐이라,
 * 다음 지명 추가에서 같은 실수가 조용히 통과했을 것이다.
 *
 * ⚠️ **이 검사기가 잡는 것은 셋뿐이다**: 자체 중복 · news.ts 목록과의 동일명/부분문자열 ·
 * 실사건 토큰. **실존 행정구역명 여부는 잡지 못한다** — 행정구역 사전이 없고 넣을 계획도 없다
 * (초안의 '서흥구'가 실존[황해북도 서흥군]인 건 사람이 알아본 것이고, 이 테스트는 그걸 통과시킨다).
 * 👉 **지명을 추가할 때 사람이 확인할 항목: 그 이름이 실존 행정구역이 아닌가.**
 *
 * ⚠️ **두 목록을 여기에 복제하지 않는다** — news.ts에서 import 해 단일 출처를 유지한다.
 * 복제하면 news.ts가 지명을 추가할 때 이 검사기가 옛 목록을 지키며 통과해, 막으려던 그 충돌을 놓친다
 * (`FICTIONAL_REGIONS`의 export는 그래서 붙은 테스트 전용 노출이다).
 */
describe('REGION_LABELS 비중복 검사기 — news.ts 상수와 이름이 겹치지 않는다', () => {
  const allLabels = (['CAPITAL', 'METRO', 'RURAL'] as const).flatMap((k) => [...REGION_LABELS[k]])

  it('세 지역 모두 1개 이상의 가공 지명을 갖는다', () => {
    for (const key of ['CAPITAL', 'METRO', 'RURAL'] as const) {
      expect(REGION_LABELS[key].length).toBeGreaterThanOrEqual(1)
    }
  })

  it('중복 없는 이름들이다 (REGION_LABELS 내부 자체 충돌)', () => {
    expect(new Set(allLabels).size).toBe(allLabels.length)
  })

  it('news.ts FICTIONAL_REGIONS와 완전일치·부분문자열 교집합이 없다', () => {
    for (const label of allLabels) {
      for (const fictional of FICTIONAL_REGIONS) {
        expect(label).not.toBe(fictional)
        // 부분문자열까지 막는다: '한내군'처럼 지명 어간을 재사용하면 같은 가공 도시로 읽힌다.
        expect(label.includes(fictional)).toBe(false)
        expect(fictional.includes(label)).toBe(false)
      }
    }
  })

  it('실사건 토큰(FORBIDDEN_REAL_EVENT_TOKENS)을 부분문자열로도 담지 않는다', () => {
    for (const label of allLabels) {
      for (const token of FORBIDDEN_REAL_EVENT_TOKENS) {
        expect(label).not.toContain(token)
      }
    }
  })
})
