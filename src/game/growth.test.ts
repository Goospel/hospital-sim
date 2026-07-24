import { describe, it, expect } from 'vitest'
import { initialTreasury, doctorDeltaCost, withinTreasury } from './growth'
import { SETUP_BUDGET_MANWON } from './setup'
import { CANDIDATES } from './candidates'
import type { SetupChoices } from './types'

const open: SetupChoices = { hospitalName: 'h', doctors: { AESTHETICS: 3, CHECKUP: 2 } } // 채용비 27,000만원

describe('금고 산수', () => {
  it('개원 잔액 = 예산 − 개원 채용비', () => {
    expect(initialTreasury(open)).toBe(SETUP_BUDGET_MANWON - 27_000)
  })

  it('개원 잔액이 지원자 계약금(가변)을 반영한다 — 앵커가가 아니라', () => {
    const vet = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'VETERAN')!
    const hired: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1 }, hiredIds: [vet.id] }
    expect(initialTreasury(hired)).toBe(SETUP_BUDGET_MANWON - vet.hireCostManwon) // 19,500 차감
    // 대조: hiredIds 없으면 앵커가(하위호환)
    expect(initialTreasury({ hospitalName: 'h', doctors: { CARDIOLOGY: 1 } })).toBe(SETUP_BUDGET_MANWON - 15_000)
  })

  it('채용 증분 비용 = 늘린 인원 × 채용비', () => {
    const next: SetupChoices = { hospitalName: 'h', doctors: { AESTHETICS: 3, CHECKUP: 2, CARDIOLOGY: 1 } }
    expect(doctorDeltaCost(open, next)).toBe(15_000) // 순환기 1명 = 1.5억
  })

  it('증분이 없으면 비용 0(성장 스킵 가능)', () => {
    expect(doctorDeltaCost(open, open)).toBe(0)
  })

  it('금고 이내면 true, 초과면 false', () => {
    expect(withinTreasury(15_000, 23_000)).toBe(true)
    expect(withinTreasury(30_000, 23_000)).toBe(false)
  })

  it('감소한 과는 비용을 낮추지 않는다 (증분만 카운트)', () => {
    const prev: SetupChoices = { hospitalName: 'h', doctors: { CHECKUP: 2 } }
    const next: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1 } } // CHECKUP 2→0, CARDIOLOGY 0→1
    expect(doctorDeltaCost(prev, next)).toBe(15_000) // 순환기 +1(=15,000)만, CHECKUP 감소는 음의 기여 0
  })
})
