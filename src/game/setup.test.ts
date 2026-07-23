import { describe, it, expect } from 'vitest'
import { adjustDoctors, isSetupReady, DAYS_PER_WEEK, DEPARTMENTS, FIXED_BEDS, MAX_DOCTORS_PER_DEPT, ROUND_THE_CLOCK_MIN_DOCTORS, SETUP_BUDGET_MANWON, buildHospital, backupCareOf, hiringCost, withinBudget, withinDeptCaps, BED_TIERS, deptCap, bedExpansionCost } from './setup'
import type { SetupChoices, DepartmentSpec } from './types'

// 합리적 공범 빌드: 미용·검진만(흑자·필수과 0)
const collaborator: SetupChoices = {
  hospitalName: '흑자메디컬',
  doctors: { AESTHETICS: 3, CHECKUP: 2 },
}
// 양심 빌드: 순환기 배후 건설(적자·소송 리스크)
const conscientious: SetupChoices = {
  hospitalName: '양심병원',
  doctors: { AESTHETICS: 1, CARDIOLOGY: 2 },
}

describe('DEPARTMENTS 카탈로그', () => {
  it('수익과는 비필수, 필수과는 소송리스크 — 고정비는 필수과가 더 무겁다', () => {
    const aesthetics = DEPARTMENTS.find((d) => d.key === 'AESTHETICS')!
    const cardiology = DEPARTMENTS.find((d) => d.key === 'CARDIOLOGY')!
    expect(aesthetics.essential).toBe(false)
    expect(aesthetics.lawsuitRisk).toBe(false)
    expect(cardiology.essential).toBe(true)
    expect(cardiology.lawsuitRisk).toBe(true)
    expect(cardiology.providesBackup).toBe('CARDIOLOGY')
    // 24시간 대기(심도자실·당직)가 붙는 만큼 필수과 고정비가 무겁다 — 흑자·적자는 여기서 안 정해진다.
    expect(cardiology.fixedCostPerDoctorManwon).toBeGreaterThan(aesthetics.fixedCostPerDoctorManwon)
  })

  /*
    수익 구조 재설계(2026-07-23)의 핵심 계약. 옛 카탈로그는 미용 +70·검진 +40을 **입력으로** 박아,
    콜을 한 통도 안 받아도 흑자가 났다(실측: 전부 거절해도 주 303억). 이제 이 층에 수익은 없다 —
    흑자·적자는 여기(고정비)와 CALL_ECONOMICS(진료 한 건)의 합에서 창발한다.
  */
  it('[수익원 단일화] 모든 과의 주간 고정비 > 0 — 수익과도 예외가 아니다', () => {
    for (const d of DEPARTMENTS) expect(d.fixedCostPerDoctorManwon).toBeGreaterThan(0)
  })

  it('[수익원 단일화] 고정비는 전부 7의 배수 — 하루치(÷7) 반올림 오차가 장부를 어긋내지 않게', () => {
    for (const d of DEPARTMENTS) expect(d.fixedCostPerDoctorManwon % DAYS_PER_WEEK).toBe(0)
  })

  it('[수익원 단일화] 필수과 고정비가 수익과보다 무겁다 — 24시간 대기가 붙는다', () => {
    const essential = DEPARTMENTS.filter((d) => d.essential).map((d) => d.fixedCostPerDoctorManwon)
    const revenue = DEPARTMENTS.filter((d) => !d.essential).map((d) => d.fixedCostPerDoctorManwon)
    expect(Math.min(...essential)).toBeGreaterThan(Math.max(...revenue))
  })
})

describe('buildHospital — 위저드 선택 → 플레이어 병원', () => {
  it('공범 빌드: backupCare에 CARDIOLOGY 없음 · essentialHires 0 · 순이익 흑자', () => {
    const { hospital, economics } = buildHospital(collaborator)
    expect(hospital.name).toBe('흑자메디컬')
    expect(hospital.beds).toBe(FIXED_BEDS)
    expect(hospital.hasErOnCall).toBe(true)
    expect(hospital.overcrowded).toBe(false)
    expect(hospital.backupCare).not.toContain('CARDIOLOGY')
    expect(economics.essentialHires).toBe(0)
    // 부문 손익은 고정비뿐이라 **채용만으로는 언제나 적자**다 — 흑자는 진료(콜)에서만 온다.
    const net = economics.segments.reduce((n, s) => n + s.profitManwon, 0)
    expect(net).toBeLessThan(0)
  })

  it('양심 빌드: backupCare에 CARDIOLOGY 포함 · essentialHires = 순환기 의사 수 · 적자 부문 존재', () => {
    const { hospital, economics } = buildHospital(conscientious)
    expect(hospital.backupCare).toContain('CARDIOLOGY')
    expect(economics.essentialHires).toBe(2)
    expect(economics.segments.some((s) => s.profitManwon < 0)).toBe(true)
  })

  it('segments·hires는 실제 채용한 과만, 손익은 의사 수에 비례', () => {
    const { economics } = buildHospital(collaborator)
    const aesthetics = economics.segments.find((s) => s.label === '미용·피부')!
    expect(aesthetics.profitManwon).toBe(-560 * 3) // −(고정비 560 × 3명)
    expect(economics.hires).toContainEqual({ label: '미용·피부', count: 3 })
    expect(economics.segments.every((s) => s.profitManwon !== 0)).toBe(true)
  })

  it('essentialHires는 CARDIOLOGY 의사 수에서만 파생 — 흉부외과만 뽑으면 0 (spec ⓐ)', () => {
    const { hospital, economics } = buildHospital({
      hospitalName: '엉뚱과병원',
      doctors: { THORACIC_SURGERY: 2 },
    })
    expect(hospital.backupCare).toContain('THORACIC_SURGERY')
    expect(hospital.backupCare).not.toContain('CARDIOLOGY')
    expect(economics.essentialHires).toBe(0)
  })

  it('결정론 — 같은 선택은 같은 병원', () => {
    expect(buildHospital(collaborator)).toEqual(buildHospital(collaborator))
  })

  it('roster를 과별 인원수만큼 materialize한다', () => {
    const { hospital } = buildHospital(conscientious) // AESTHETICS:1, CARDIOLOGY:2
    expect(hospital.roster).toHaveLength(3)
    expect(hospital.roster!.filter((d) => d.dept === 'CARDIOLOGY')).toHaveLength(2)
  })
})

describe('예산', () => {
  it('hiringCost = 과별 채용비 × 의사 수 합', () => {
    // AESTHETICS 5,000×3 + CHECKUP 6,000×2 = 27,000
    expect(hiringCost(collaborator)).toBe(27_000)
  })

  it('withinBudget: 한도 이내 true, 초과 false', () => {
    expect(withinBudget(collaborator)).toBe(true)
    const overspend: SetupChoices = { hospitalName: '과소비', doctors: { CARDIOLOGY: 10 } }
    expect(hiringCost(overspend)).toBeGreaterThan(SETUP_BUDGET_MANWON)
    expect(withinBudget(overspend)).toBe(false)
  })
})

const base: SetupChoices = { hospitalName: '한바다', doctors: {} }

describe('adjustDoctors', () => {
  it('increments a department from zero', () => {
    expect(adjustDoctors(base, 'AESTHETICS', 1).doctors.AESTHETICS).toBe(1)
  })
  it('clamps to zero and removes the key on over-decrement', () => {
    const one = adjustDoctors(base, 'AESTHETICS', 1)
    const back = adjustDoctors(one, 'AESTHETICS', -5)
    expect(back.doctors.AESTHETICS).toBeUndefined()
  })
  it('floors non-integer deltas (never negative, never fractional)', () => {
    const r = adjustDoctors(base, 'CARDIOLOGY', 1.9)
    expect(r.doctors.CARDIOLOGY).toBe(1)
  })
  it('does not mutate the input', () => {
    const snapshot = JSON.parse(JSON.stringify(base))
    adjustDoctors(base, 'CHECKUP', 2)
    expect(base).toEqual(snapshot)
  })
  it('과별 상한에서 멈춘다 — 상한 초과 증가는 상한값', () => {
    const maxed = adjustDoctors(base, 'AESTHETICS', MAX_DOCTORS_PER_DEPT + 5)
    expect(maxed.doctors.AESTHETICS).toBe(MAX_DOCTORS_PER_DEPT)
  })
})

/**
 * 24시간 당직 커버리지 — 2번째 의사가 사는 것(T-042).
 *
 * 의사 1명은 24시간을 못 버틴다. STEMI는 **24시간 중재 순환기내과**를 갖춘 PCI 병원이라야
 * 재관류가 되고(medical-system-grounding.md:20), 거절하는 당직의의 정당한 제약이
 * "당직 1명이 이미 3명 동시 진료"(:66)다. 그래서 배후진료는 **있냐/없냐가 아니라 몇 시냐**다.
 */
describe('roundTheClockBackup — 24시간 배후는 2명부터', () => {
  it('필수과 1명 → backupCare엔 있지만 24시간은 아니다 (주간만)', () => {
    const { hospital } = buildHospital({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 1 } })
    expect(hospital.backupCare).toContain('CARDIOLOGY')
    expect(hospital.roundTheClockBackup).not.toContain('CARDIOLOGY')
  })

  it('필수과 2명 → 24시간 배후 성립', () => {
    const { hospital } = buildHospital({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 2 } })
    expect(hospital.roundTheClockBackup).toContain('CARDIOLOGY')
  })

  it('상한 = 당직 로테이션 최소 인원 — 3명째는 24시간을 두 번 사지 못한다', () => {
    expect(ROUND_THE_CLOCK_MIN_DOCTORS).toBe(2)
    const { hospital } = buildHospital({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 3 } })
    expect(hospital.roundTheClockBackup).toEqual(['CARDIOLOGY'])
  })

  it('안 뽑은 과는 24시간 목록에도 없다', () => {
    const { hospital } = buildHospital(collaborator)
    expect(hospital.roundTheClockBackup).toEqual([])
  })

  it('레포 대표 양심 픽스처(순환기 2)는 24시간 병원이다', () => {
    expect(buildHospital(conscientious).hospital.roundTheClockBackup).toContain('CARDIOLOGY')
  })
})

describe('과별 인원 상한 — 자리에서 파생(각색값 아님)', () => {
  it('상한 = FIXED_BEDS — 하루 자리보다 많은 의사는 앉힐 환자가 없다', () => {
    expect(MAX_DOCTORS_PER_DEPT).toBe(FIXED_BEDS)
  })

  it('withinDeptCaps: 상한 이내 true, 초과 false', () => {
    expect(withinDeptCaps({ hospitalName: '한바다', doctors: { AESTHETICS: MAX_DOCTORS_PER_DEPT } })).toBe(true)
    expect(withinDeptCaps({ hospitalName: '한바다', doctors: { AESTHETICS: MAX_DOCTORS_PER_DEPT + 1 } })).toBe(false)
  })

  /**
   * 지뢰 5 회귀 — 상한이 없던 시절 '미용 10명'이 정확히 예산 100억이라 합법이었고,
   * 부문 손익 70×10 = +700억(주당 예산의 7배)이 나와 불변식 I8(|순이익| ≤ 4×예산)을 깼다.
   * 예산만으로는 못 막는다는 게 요점이다 — hiringCost는 통과한다.
   */
  it('[I8 회귀] 미용 10명은 예산은 통과하지만 상한에서 걸린다', () => {
    const tenAesthetics: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 10 } }
    expect(withinBudget(tenAesthetics)).toBe(true) // 10 × 5,000 = 정확히 예산 전액
    expect(isSetupReady(tenAesthetics)).toBe(false)
  })

  it('상한을 다 채운 최대 흑자 셋업도 I8(|순이익| ≤ 4 × 예산) 안이다', () => {
    const maxProfit: SetupChoices = {
      hospitalName: '흑자메디컬',
      doctors: { AESTHETICS: MAX_DOCTORS_PER_DEPT, CHECKUP: MAX_DOCTORS_PER_DEPT },
    }
    expect(isSetupReady(maxProfit)).toBe(true)
    const { economics } = buildHospital(maxProfit)
    const weekly = economics.segments.reduce((sum, s) => sum + s.profitManwon, 0)
    expect(Math.abs(weekly)).toBeLessThanOrEqual(4 * SETUP_BUDGET_MANWON)
  })
})

describe('isSetupReady', () => {
  it('false when name is blank', () => {
    expect(isSetupReady({ hospitalName: '   ', doctors: { AESTHETICS: 1 } })).toBe(false)
  })
  it('false when over budget', () => {
    expect(isSetupReady({ hospitalName: '한바다', doctors: { NEUROSURGERY: 99 } })).toBe(false)
  })
  it('true for a named, within-budget build (including cardiology-skip 공범)', () => {
    expect(isSetupReady({ hospitalName: '한바다', doctors: { AESTHETICS: 2 } })).toBe(true)
  })
})

// 외생 이벤트가 세계를 재구성한 뒤, 위저드는 '이벤트 적용된 카탈로그'로 딜레마를 띄운다.
// setup 함수들이 departments를 주입받을 수 있어야 한다(기본값=DEPARTMENTS로 하위호환).
describe('departments 주입 — 이벤트가 바꾼 카탈로그를 위저드가 쓴다', () => {
  // 순환기 손익을 -12 → -6로 올린 카탈로그(개선 이벤트 적용본을 흉내낸 값)
  const boosted: DepartmentSpec[] = DEPARTMENTS.map((d) =>
    d.key === 'CARDIOLOGY' ? { ...d, fixedCostPerDoctorManwon: 770 } : d,
  )

  it('buildHospital은 주입된 departments의 고정비를 쓴다', () => {
    const { economics } = buildHospital({ hospitalName: '양심', doctors: { CARDIOLOGY: 2 } }, boosted)
    const cardioSeg = economics.segments.find((s) => s.label === '순환기내과')!
    expect(cardioSeg.profitManwon).toBe(-770 * 2) // 기본값이면 −2,380이었을 것
  })

  it('hiringCost는 주입된 departments의 채용비를 쓴다', () => {
    const pricier: DepartmentSpec[] = DEPARTMENTS.map((d) =>
      d.key === 'CARDIOLOGY' ? { ...d, hireCostManwon: 18_000 } : d,
    )
    expect(hiringCost({ hospitalName: 'x', doctors: { CARDIOLOGY: 1 } }, pricier)).toBe(18_000)
  })

  it('withinDeptCaps·isSetupReady도 주입된 카탈로그 기준으로 판단한다', () => {
    // 카탈로그에 없던 과가 아니라, 주입본으로도 상한/예산 로직이 동일하게 돈다
    expect(isSetupReady({ hospitalName: '양심', doctors: { CARDIOLOGY: 2 } }, boosted)).toBe(true)
  })

  it('인자 없이 부르면 기본 DEPARTMENTS — 기존 호출 무변경(하위호환)', () => {
    expect(hiringCost(collaborator)).toBe(27_000)
    expect(buildHospital(collaborator).economics.essentialHires).toBe(0)
  })
})

describe('backupCareOf — 필수 배후과 목록(tier 단일 출처)', () => {
  it('필수과만 배후에 넣는다(미용·검진 제외)', () => {
    expect(backupCareOf(collaborator)).toEqual([]) // 미용3·검진2 → 배후 0
    expect(backupCareOf(conscientious)).toContain('CARDIOLOGY') // 미용1·순환기2 → 순환기 배후
  })

  it('필수 배후과를 DEPARTMENTS 순서 리터럴로 반환하고 buildHospital과 일치(드리프트 방지)', () => {
    const choices: SetupChoices = { hospitalName: 't', doctors: { CARDIOLOGY: 1, OBSTETRICS: 2, AESTHETICS: 1 } }
    expect(backupCareOf(choices)).toEqual(['CARDIOLOGY', 'OBSTETRICS'])
    expect(buildHospital(choices).hospital.backupCare).toEqual(['CARDIOLOGY', 'OBSTETRICS'])
  })
})

// 내과: 24h 대기 고정비인 다른 배후과와 달리 저수가 외래 박리다매라 덜 적자.
// lawsuitRisk:false는 소송 '미구현'이지 "안전과"가 아니다(essential:true·적자로 미용과 분리).
describe('내과 진료과 — 저수가 박리다매 배후과', () => {
  it('내과는 필수 배후과이고 저수가 소폭 적자다', () => {
    const im = DEPARTMENTS.find((d) => d.key === 'INTERNAL_MEDICINE')
    expect(im).toBeDefined()
    expect(im!.essential).toBe(true) // 미용·검진과 분리 — 안전과 아님
    // 저수가 외래 박리다매라 24h 대기 고정비가 가장 가볍다 — 그래도 수익과보단 무겁다.
    const others = DEPARTMENTS.filter((d) => d.essential && d.key !== 'INTERNAL_MEDICINE')
    expect(im!.fixedCostPerDoctorManwon).toBeLessThan(Math.min(...others.map((d) => d.fixedCostPerDoctorManwon)))
    expect(im!.lawsuitRisk).toBe(false) // 소송 미구현(안전이 아니라 미구현)
    expect(im!.providesBackup).toBe('INTERNAL_MEDICINE')
  })

  it('내과를 채용하면 배후진료에 INTERNAL_MEDICINE이 잡힌다', () => {
    const choices: SetupChoices = { hospitalName: '내과병원', doctors: { INTERNAL_MEDICINE: 1 } }
    expect(backupCareOf(choices)).toContain('INTERNAL_MEDICINE')
    const { hospital } = buildHospital(choices)
    expect(hospital.backupCare).toContain('INTERNAL_MEDICINE')
  })
})

describe('병상 티어 — 성장의 용량 축', () => {
  it('티어는 [3,5,7]이고 기본은 FIXED_BEDS(3)', () => {
    expect(BED_TIERS).toEqual([3, 5, 7])
    expect(BED_TIERS[0]).toBe(FIXED_BEDS)
  })

  it('필수과 상한 = beds, 수익과 상한 = 3 고정(머니프린터 방지)', () => {
    const cardio = DEPARTMENTS.find((d) => d.key === 'CARDIOLOGY')!
    const aesth = DEPARTMENTS.find((d) => d.key === 'AESTHETICS')!
    expect(deptCap(cardio, 5)).toBe(5)  // 필수과는 병상 따라 오름
    expect(deptCap(aesth, 5)).toBe(MAX_DOCTORS_PER_DEPT) // 수익과는 3 고정
    expect(deptCap(aesth, 7)).toBe(MAX_DOCTORS_PER_DEPT)
  })

  it('병상 증설 비용은 체증하고, 같은 티어면 0', () => {
    expect(bedExpansionCost(3, 3)).toBe(0)
    expect(bedExpansionCost(3, 5)).toBe(10_000)
    expect(bedExpansionCost(5, 7)).toBe(18_000)
    expect(bedExpansionCost(3, 7)).toBe(28_000) // 누적
  })

  it('withinDeptCaps: 필수과는 beds까지 허용', () => {
    const c = { hospitalName: 'h', doctors: { CARDIOLOGY: 5 } }
    expect(withinDeptCaps(c, DEPARTMENTS, 3)).toBe(false) // beds 3이면 상한 3
    expect(withinDeptCaps(c, DEPARTMENTS, 5)).toBe(true)  // beds 5면 5 허용
  })

  it('buildHospital(beds)는 hospital.beds에 반영', () => {
    const { hospital } = buildHospital({ hospitalName: 'h', doctors: { CARDIOLOGY: 2 } }, DEPARTMENTS, 5)
    expect(hospital.beds).toBe(5)
  })

  it('adjustDoctors(cap): 명시 상한까지 허용', () => {
    const c = { hospitalName: 'h', doctors: {} }
    expect(adjustDoctors(c, 'CARDIOLOGY', 5, 5).doctors.CARDIOLOGY).toBe(5)
    expect(adjustDoctors(c, 'CARDIOLOGY', 9, 5).doctors.CARDIOLOGY).toBe(5) // 상한 클램프
  })
})
