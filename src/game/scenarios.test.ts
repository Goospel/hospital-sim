import { describe, it, expect } from 'vitest'
import { createStemiScenario } from './scenarios'
import { adjudicateTransfer } from './adjudicate'

describe('createStemiScenario — STEMI 한 판의 불변식', () => {
  it('환자는 순환기내과를 요구하고, 골든타임과 병원 목록이 있다', () => {
    const s = createStemiScenario()
    expect(s.patient.requiredSpecialty).toBe('CARDIOLOGY')
    expect(s.goldenSeconds).toBeGreaterThan(0)
    expect(s.hospitals.length).toBeGreaterThan(0)
  })

  it('풀 수 있는 판이다 — 최소 한 곳은 수용 가능', () => {
    const s = createStemiScenario()
    const verdicts = s.hospitals.map((h) => adjudicateTransfer(h, s.patient))
    expect(verdicts.some((v) => v.accepted)).toBe(true)
  })

  it('두 거절 사유(NO_BED·NO_SPECIALIST)가 모두 드러난다 — 구조 체감 포인트', () => {
    const s = createStemiScenario()
    const reasons = s.hospitals
      .map((h) => adjudicateTransfer(h, s.patient))
      .filter((v) => !v.accepted)
      .map((v) => v.reason)
    expect(reasons).toContain('NO_BED')
    expect(reasons).toContain('NO_SPECIALIST')
  })
})
