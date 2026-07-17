import { describe, it, expect } from 'vitest'
import { buildLedger, buildSessionLedger, LAWSUIT_COST_PER_EXPOSURE } from './ledger'
import { startGame } from './round'
import { createStemiScenario } from './scenarios'
import type { Hospital, Patient } from './types'

// 병원 장부 — 한 병원의 경제(부문 손익·신규 채용)를 결정론적으로 산출한다.
// 핵심: 수익은 흑자인데 환자가 필요했던 필수과(배후진료) 채용은 0.
// '필수과 0'은 하드코딩이 아니라 backupCare(= 거절 사유 NO_BACKUP_CARE의 뿌리)에서 파생된다.

describe('buildLedger — 결정론 병원 장부', () => {
  it('장부 주체는 경제 데이터를 가진 병원(한바다대학병원)', () => {
    const s = createStemiScenario()
    const g = startGame(s.patient, s.hospitals, 180)
    const led = buildLedger(g)
    expect(led).not.toBeNull()
    expect(led!.hospitalName).toBe('한바다대학병원')
  })

  it('순이익 = 부문 손익 합이고, 흑자다(수익↑)', () => {
    const g = startGame(createStemiScenario().patient, createStemiScenario().hospitals, 180)
    const led = buildLedger(g)!
    const sum = led.segments.reduce((n, x) => n + x.profitBillions, 0)
    expect(led.netProfitBillions).toBe(sum)
    expect(led.netProfitBillions).toBeGreaterThan(0)
  })

  it('필수 부문은 적자(음수), 수익 부문은 흑자 — "수익↑이지만 필수과는 손해"', () => {
    const g = startGame(createStemiScenario().patient, createStemiScenario().hospitals, 180)
    const led = buildLedger(g)!
    expect(led.segments.some((x) => x.profitBillions < 0)).toBe(true)
    expect(led.segments.some((x) => x.profitBillions > 0)).toBe(true)
  })

  it('[핵심] 필수 배후과 채용은 backupCare에서 파생 — 한바다대학병원은 순환기 배후 없음 → 0', () => {
    const g = startGame(createStemiScenario().patient, createStemiScenario().hospitals, 180)
    const led = buildLedger(g)!
    expect(led.essentialSpecialty).toBe('CARDIOLOGY')
    expect(led.essentialHires).toBe(0)
  })

  it('총 채용 = 수익과 채용 합 + 필수과 채용', () => {
    const g = startGame(createStemiScenario().patient, createStemiScenario().hospitals, 180)
    const led = buildLedger(g)!
    const sum = led.hires.reduce((n, x) => n + x.count, 0)
    expect(led.totalHires).toBe(sum + led.essentialHires)
  })

  it('[핵심] 파생 증명 — 배후과가 있으면 채용 수를 싣고, 없으면 0으로 바닥', () => {
    const patient: Patient = { id: 'p', requiredSpecialty: 'CARDIOLOGY', severity: 5 }
    const econ = {
      segments: [{ label: '미용', profitBillions: 10 }],
      hires: [],
      essentialHires: 3,
    }
    const capable: Hospital = {
      id: 'a', name: '역량있음', beds: 3, hasErOnCall: true, overcrowded: false,
      backupCare: ['CARDIOLOGY'], economics: econ,
    }
    const incapable: Hospital = {
      id: 'b', name: '역량없음', beds: 3, hasErOnCall: true, overcrowded: false,
      backupCare: ['THORACIC_SURGERY'], economics: econ,
    }
    expect(buildLedger(startGame(patient, [capable], 180))!.essentialHires).toBe(3)
    expect(buildLedger(startGame(patient, [incapable], 180))!.essentialHires).toBe(0)
  })

  it('경제 데이터가 없으면 null(장부 없음)', () => {
    const patient: Patient = { id: 'p', requiredSpecialty: 'CARDIOLOGY', severity: 5 }
    const bare: Hospital = {
      id: 'x', name: '무장부', beds: 1, hasErOnCall: true, overcrowded: false, backupCare: [],
    }
    expect(buildLedger(startGame(patient, [bare], 180))).toBeNull()
  })

  it('결정론 — 같은 판은 같은 장부', () => {
    const g = startGame(createStemiScenario().patient, createStemiScenario().hospitals, 180)
    expect(buildLedger(g)).toEqual(buildLedger(g))
  })
})

describe('buildSessionLedger — 플레이어 병원 결말 장부(콜 델타 + 소송 비용)', () => {
  const collaboratorHospital: Hospital = {
    id: 'player', name: '흑자메디컬', beds: 2, hasErOnCall: true, overcrowded: false,
    backupCare: [],
    economics: { segments: [{ label: '미용·피부', profitBillions: 210 }], hires: [{ label: '미용·피부', count: 3 }], essentialHires: 0 },
  }
  const conscientiousHospital: Hospital = {
    id: 'player', name: '양심병원', beds: 2, hasErOnCall: true, overcrowded: false,
    backupCare: ['CARDIOLOGY'],
    economics: { segments: [{ label: '순환기내과', profitBillions: -24 }], hires: [], essentialHires: 2 },
  }

  /**
   * 검사 수익은 진료 수익과 **별도 줄**이어야 한다 — 합치면 이 게임이 하려는 말이 사라진다.
   * 진료 수익은 음수인데 검사 수익이 덮어서 순이익이 양수인 장부. 아무도 "과잉진료"라고 말하지 않는다.
   * 두 줄이 나란히 있을 뿐이다. (= 응급의료 수가항목 45% vs 응급의학과 손익 103%의 장부 재현)
   */
  it('[I7] 검사 수익이 별도 줄로 서고, 진료 수익(−)을 덮어 순이익을 뒤집는다', () => {
    const led = buildSessionLedger(conscientiousHospital, 'CARDIOLOGY', {
      netProfitDeltaBillions: -20,
      workupRevenueBillions: 56,
      lawsuitExposure: 0,
    })!
    expect(led.segments).toContainEqual({ label: '이번 주 진료 수익', profitBillions: -20 })
    expect(led.segments).toContainEqual({ label: '이번 주 검사 수익', profitBillions: 56 })
    // I7: 검사 수익 > |진료 수익|
    expect(56).toBeGreaterThan(Math.abs(-20))
    expect(led.netProfitBillions).toBe(-24 - 20 + 56)
  })

  it('검사를 안 붙였으면 검사 줄 자체가 없다 — 0을 찍지 않는다', () => {
    const led = buildSessionLedger(conscientiousHospital, 'CARDIOLOGY', {
      netProfitDeltaBillions: -20,
      workupRevenueBillions: 0,
      lawsuitExposure: 0,
    })!
    expect(led.segments.some((s) => s.label === '이번 주 검사 수익')).toBe(false)
  })

  it('공범: 순환기 없음 → essentialHires 0, 콜 수익 델타가 순이익에 반영, 소송 비용 없음', () => {
    const led = buildSessionLedger(collaboratorHospital, 'CARDIOLOGY', { netProfitDeltaBillions: 16, lawsuitExposure: 0 })!
    expect(led.essentialHires).toBe(0)
    expect(led.segments).toContainEqual({ label: '이번 주 진료 수익', profitBillions: 16 })
    expect(led.segments.some((s) => s.label === '소송 비용')).toBe(false)
    expect(led.netProfitBillions).toBe(210 + 16)
  })

  it('양심: 순환기 있음 → essentialHires 2, 소송 노출 → 소송 비용 한 줄(음수)이 순이익을 깎음', () => {
    const led = buildSessionLedger(conscientiousHospital, 'CARDIOLOGY', { netProfitDeltaBillions: -20, lawsuitExposure: 1 })!
    expect(led.essentialHires).toBe(2)
    expect(led.segments).toContainEqual({ label: '소송 비용', profitBillions: -LAWSUIT_COST_PER_EXPOSURE })
    expect(led.netProfitBillions).toBe(-24 + -20 + -LAWSUIT_COST_PER_EXPOSURE)
    expect(led.netProfitBillions).toBeLessThan(0)
  })

  it('델타 0·노출 0이면 추가 세그먼트 없음(기저만)', () => {
    const led = buildSessionLedger(collaboratorHospital, 'CARDIOLOGY', { netProfitDeltaBillions: 0, lawsuitExposure: 0 })!
    expect(led.segments).toEqual(collaboratorHospital.economics!.segments)
  })

  it('경제 데이터 없으면 null', () => {
    const bare: Hospital = { id: 'x', name: '무장부', beds: 2, hasErOnCall: true, overcrowded: false, backupCare: [] }
    expect(buildSessionLedger(bare, 'CARDIOLOGY', { netProfitDeltaBillions: 5, lawsuitExposure: 0 })).toBeNull()
  })
})
