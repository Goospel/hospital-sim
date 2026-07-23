import { describe, it, expect } from 'vitest'
import { buildSessionLedger, LAWSUIT_COST_PER_EXPOSURE } from './ledger'
import type { Hospital } from './types'

// 병원 장부 — 한 병원의 경제(부문 손익·신규 채용)를 결정론적으로 산출한다.
// 핵심: 수익은 흑자인데 환자가 필요했던 필수과(배후진료) 채용은 0.
// '필수과 0'은 하드코딩이 아니라 backupCare(= 거절 사유 NO_BACKUP_CARE의 뿌리)에서 파생된다.

describe('buildSessionLedger — 플레이어 병원 결말 장부(콜 델타 + 소송 비용)', () => {
  const collaboratorHospital: Hospital = {
    id: 'player', name: '흑자메디컬', beds: 2, hasErOnCall: true, overcrowded: false,
    backupCare: [],
    economics: { segments: [{ label: '미용·피부', profitManwon: 210 }], hires: [{ label: '미용·피부', count: 3 }], essentialHires: 0 },
  }
  const conscientiousHospital: Hospital = {
    id: 'player', name: '양심병원', beds: 2, hasErOnCall: true, overcrowded: false,
    backupCare: ['CARDIOLOGY'],
    economics: { segments: [{ label: '순환기내과', profitManwon: -24 }], hires: [], essentialHires: 2 },
  }

  /**
   * 검사 수익은 진료 수익과 **별도 줄**이어야 한다 — 합치면 이 게임이 하려는 말이 사라진다.
   * 진료 수익은 음수인데 검사 수익이 덮어서 순이익이 양수인 장부. 아무도 "과잉진료"라고 말하지 않는다.
   * 두 줄이 나란히 있을 뿐이다. (= 응급의료 수가항목 45% vs 응급의학과 손익 103%의 장부 재현)
   */
  it('[I7] 검사 수익이 별도 줄로 서고, 진료 수익(−)을 덮어 순이익을 뒤집는다', () => {
    const led = buildSessionLedger(conscientiousHospital, 'CARDIOLOGY', {
      netProfitDeltaManwon: -20,
      workupRevenueManwon: 56,
      lawsuitExposure: 0,
    })!
    expect(led.segments).toContainEqual({ label: '이번 주 진료 수익', profitManwon: -20 })
    expect(led.segments).toContainEqual({ label: '이번 주 검사 수익', profitManwon: 56 })
    // I7: 검사 수익 > |진료 수익|
    expect(56).toBeGreaterThan(Math.abs(-20))
    expect(led.netProfitManwon).toBe(-24 - 20 + 56)
  })

  it('검사를 안 붙였으면 검사 줄 자체가 없다 — 0을 찍지 않는다', () => {
    const led = buildSessionLedger(conscientiousHospital, 'CARDIOLOGY', {
      netProfitDeltaManwon: -20,
      workupRevenueManwon: 0,
      lawsuitExposure: 0,
    })!
    expect(led.segments.some((s) => s.label === '이번 주 검사 수익')).toBe(false)
  })

  it('공범: 순환기 없음 → essentialHires 0, 콜 수익 델타가 순이익에 반영, 소송 비용 없음', () => {
    const led = buildSessionLedger(collaboratorHospital, 'CARDIOLOGY', { netProfitDeltaManwon: 16, lawsuitExposure: 0 })!
    expect(led.essentialHires).toBe(0)
    expect(led.segments).toContainEqual({ label: '이번 주 진료 수익', profitManwon: 16 })
    expect(led.segments.some((s) => s.label === '소송 비용')).toBe(false)
    expect(led.netProfitManwon).toBe(210 + 16)
  })

  it('양심: 순환기 있음 → essentialHires 2, 소송 노출 → 소송 비용 한 줄(음수)이 순이익을 깎음', () => {
    const led = buildSessionLedger(conscientiousHospital, 'CARDIOLOGY', { netProfitDeltaManwon: -20, lawsuitExposure: 1 })!
    expect(led.essentialHires).toBe(2)
    expect(led.segments).toContainEqual({ label: '소송 비용', profitManwon: -LAWSUIT_COST_PER_EXPOSURE })
    expect(led.netProfitManwon).toBe(-24 + -20 + -LAWSUIT_COST_PER_EXPOSURE)
    expect(led.netProfitManwon).toBeLessThan(0)
  })

  it('델타 0·노출 0이면 추가 세그먼트 없음(기저만)', () => {
    const led = buildSessionLedger(collaboratorHospital, 'CARDIOLOGY', { netProfitDeltaManwon: 0, lawsuitExposure: 0 })!
    expect(led.segments).toEqual(collaboratorHospital.economics!.segments)
  })

  it('경제 데이터 없으면 null', () => {
    const bare: Hospital = { id: 'x', name: '무장부', beds: 2, hasErOnCall: true, overcrowded: false, backupCare: [] }
    expect(buildSessionLedger(bare, 'CARDIOLOGY', { netProfitDeltaManwon: 5, lawsuitExposure: 0 })).toBeNull()
  })
})
