import { describe, it, expect } from 'vitest'
import { adjustDoctors, isSetupReady, DEPARTMENTS, FIXED_BEDS, SETUP_BUDGET_BILLIONS, buildHospital, hiringCost, withinBudget } from './setup'
import type { SetupChoices } from './types'

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
  it('수익과는 흑자·비필수, 필수과는 적자·소송리스크 (부호 근거)', () => {
    const aesthetics = DEPARTMENTS.find((d) => d.key === 'AESTHETICS')!
    const cardiology = DEPARTMENTS.find((d) => d.key === 'CARDIOLOGY')!
    expect(aesthetics.essential).toBe(false)
    expect(aesthetics.profitPerDoctorBillions).toBeGreaterThan(0)
    expect(aesthetics.lawsuitRisk).toBe(false)
    expect(cardiology.essential).toBe(true)
    expect(cardiology.profitPerDoctorBillions).toBeLessThan(0)
    expect(cardiology.lawsuitRisk).toBe(true)
    expect(cardiology.providesBackup).toBe('CARDIOLOGY')
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
    const net = economics.segments.reduce((n, s) => n + s.profitBillions, 0)
    expect(net).toBeGreaterThan(0)
  })

  it('양심 빌드: backupCare에 CARDIOLOGY 포함 · essentialHires = 순환기 의사 수 · 적자 부문 존재', () => {
    const { hospital, economics } = buildHospital(conscientious)
    expect(hospital.backupCare).toContain('CARDIOLOGY')
    expect(economics.essentialHires).toBe(2)
    expect(economics.segments.some((s) => s.profitBillions < 0)).toBe(true)
  })

  it('segments·hires는 실제 채용한 과만, 손익은 의사 수에 비례', () => {
    const { economics } = buildHospital(collaborator)
    const aesthetics = economics.segments.find((s) => s.label === '미용·피부')!
    expect(aesthetics.profitBillions).toBe(70 * 3) // profitPerDoctor(70) × 3명
    expect(economics.hires).toContainEqual({ label: '미용·피부', count: 3 })
    expect(economics.segments.every((s) => s.profitBillions !== 0)).toBe(true)
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
})

describe('예산', () => {
  it('hiringCost = 과별 채용비 × 의사 수 합', () => {
    // AESTHETICS 10×3 + CHECKUP 12×2 = 54
    expect(hiringCost(collaborator)).toBe(54)
  })

  it('withinBudget: 한도 이내 true, 초과 false', () => {
    expect(withinBudget(collaborator)).toBe(true)
    const overspend: SetupChoices = { hospitalName: '과소비', doctors: { CARDIOLOGY: 10 } }
    expect(hiringCost(overspend)).toBeGreaterThan(SETUP_BUDGET_BILLIONS)
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
