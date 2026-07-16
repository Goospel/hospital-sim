import { describe, it, expect } from 'vitest'
import { createStemiScenario } from './scenarios'
import { adjudicateTransfer } from './adjudicate'
import type { RejectionReason } from './types'

describe('createStemiScenario — STEMI 한 판의 불변식', () => {
  it('환자는 순환기내과(중재시술)를 요구하고, 골든타임과 병원 목록이 있다', () => {
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

  it('네 거절 사유가 모두 드러난다 — 구조의 다면성 체감', () => {
    const s = createStemiScenario()
    const reasons = rejectionReasons(s.hospitals.map((h) => adjudicateTransfer(h, s.patient)))
    expect(reasons).toContain('NO_BED')
    expect(reasons).toContain('NO_ER_ONCALL')
    expect(reasons).toContain('ER_OVERCROWDED')
    expect(reasons).toContain('NO_BACKUP_CARE')
  })

  it('[핵심] 지배 병목은 NO_BACKUP_CARE 다 — 가장 흔한 거절 사유여야 한다(리서치 반영)', () => {
    const s = createStemiScenario()
    const reasons = rejectionReasons(s.hospitals.map((h) => adjudicateTransfer(h, s.patient)))
    const backupCount = reasons.filter((r) => r === 'NO_BACKUP_CARE').length
    for (const other of ['NO_BED', 'NO_ER_ONCALL', 'ER_OVERCROWDED'] as RejectionReason[]) {
      const otherCount = reasons.filter((r) => r === other).length
      expect(backupCount).toBeGreaterThan(otherCount)
    }
  })

  it('첫 번째 병원부터 배후진료 벽에 부딪힌다 — "병상은 있는데 시술팀이 없다"를 먼저 겪게', () => {
    const s = createStemiScenario()
    const first = adjudicateTransfer(s.hospitals[0], s.patient)
    expect(first.accepted).toBe(false)
    expect(first.reason).toBe('NO_BACKUP_CARE')
    // 그 병원은 병상이 실제로 있다 — 병상 문제가 아님을 보증.
    expect(s.hospitals[0].beds).toBeGreaterThan(0)
  })
})

function rejectionReasons(verdicts: { accepted: boolean; reason?: RejectionReason }[]): RejectionReason[] {
  return verdicts.filter((v) => !v.accepted).map((v) => v.reason as RejectionReason)
}
