import { describe, it, expect } from 'vitest'
import { adjudicateTransfer } from './adjudicate'
import type { Hospital, Patient } from './types'

// 핵심 불변식: 전원 수용/거절은 오직 결정론적 코드가 정한다.
// adjudicateTransfer 의 시그니처에는 "설득 텍스트"가 들어올 자리 자체가 없다.
// → LLM 굴복(sycophancy)으로 게임 상태가 뒤집히는 붕괴를 타입 수준에서 차단한다.
//
// 거절 사유 4종 모델(리서치 반영): 실제 응급실 뺑뺑이의 지배 병목은 '병상 없음'이 아니라
// '배후진료 불가'(병상·응급실 당직은 있으나 해당 과의 최종치료 역량 부재)다.
// (근거: docs/research/medical-system-grounding.md)

const patient: Patient = { id: 'p', requiredSpecialty: 'CARDIOLOGY', severity: 5 }

/** 모든 게이트를 통과하는 "받아줄 수 있는" 병원에서 출발해, 필요한 제약만 덮어씌운다. */
function hospital(overrides: Partial<Hospital>): Hospital {
  return {
    id: 'h',
    name: '가상병원',
    beds: 2,
    hasErOnCall: true,
    overcrowded: false,
    backupCare: ['CARDIOLOGY'],
    ...overrides,
  }
}

describe('adjudicateTransfer — 결정론적 전원 판정 (거절 사유 3종)', () => {
  it('모든 조건을 갖추면 수용, reason 없음', () => {
    const verdict = adjudicateTransfer(hospital({}), patient)
    expect(verdict.accepted).toBe(true)
    expect(verdict.reason).toBeUndefined()
  })

  it('응급실 당직이 없으면 거절, 사유는 NO_ER_ONCALL', () => {
    const verdict = adjudicateTransfer(hospital({ hasErOnCall: false }), patient)
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('NO_ER_ONCALL')
  })

  it('과밀(boarding)이면 병상이 명목상 있어도 거절, 사유는 ER_OVERCROWDED', () => {
    const verdict = adjudicateTransfer(hospital({ overcrowded: true }), patient)
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('ER_OVERCROWDED')
  })

  it('[핵심] 병상·응급실 당직은 있으나 해당 과 배후진료 역량이 없으면 거절, 사유는 NO_BACKUP_CARE', () => {
    // STEMI(순환기)를 요구하는데 흉부외과·신경외과 배후만 있는 병원 — 시술팀/카테터실 부재.
    const verdict = adjudicateTransfer(
      hospital({ backupCare: ['THORACIC_SURGERY', 'NEUROSURGERY'] }),
      patient,
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('NO_BACKUP_CARE')
  })

  it('당직이 없으면서 배후진료도 없을 때, 접수 벽인 NO_ER_ONCALL 이 먼저 잡힌다(사유 우선순위)', () => {
    const verdict = adjudicateTransfer(hospital({ hasErOnCall: false, backupCare: [] }), patient)
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('NO_ER_ONCALL')
  })

  it('병상은 있고 당직도 있으나 과밀이면서 배후진료도 없을 때, 과밀(ER_OVERCROWDED)이 먼저 잡힌다', () => {
    const verdict = adjudicateTransfer(
      hospital({ overcrowded: true, backupCare: [] }),
      patient,
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('ER_OVERCROWDED')
  })
})
