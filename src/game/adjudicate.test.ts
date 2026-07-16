import { describe, it, expect } from 'vitest'
import { adjudicateTransfer } from './adjudicate'

// 핵심 불변식: 전원 수용/거절은 오직 결정론적 코드가 정한다.
// adjudicateTransfer 의 시그니처에는 "설득 텍스트"가 들어올 자리 자체가 없다.
// → LLM 굴복(sycophancy)으로 게임 상태가 뒤집히는 붕괴를 타입 수준에서 차단한다.
describe('adjudicateTransfer — 결정론적 전원 판정', () => {
  it('병상이 0이면 필요 진료과가 있어도 거절하고, 사유는 NO_BED (하드락)', () => {
    const hospital = {
      id: 'h1',
      name: '가상대병원',
      beds: 0,
      onCallSpecialties: ['THORACIC_SURGERY' as const],
    }
    const patient = {
      id: 'p1',
      requiredSpecialty: 'THORACIC_SURGERY' as const,
      severity: 5,
    }

    const verdict = adjudicateTransfer(hospital, patient)

    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('NO_BED')
  })

  it('병상은 있지만 필요 진료과 당직이 없으면 거절, 사유는 NO_SPECIALIST', () => {
    const hospital = {
      id: 'h2',
      name: '한적한종합병원',
      beds: 3,
      onCallSpecialties: ['GENERAL_SURGERY' as const], // 외과만 당직
    }
    const patient = {
      id: 'p2',
      requiredSpecialty: 'THORACIC_SURGERY' as const, // 흉부외과 필요
      severity: 5,
    }

    const verdict = adjudicateTransfer(hospital, patient)

    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('NO_SPECIALIST')
  })

  it('병상이 있고 필요 진료과 당직도 있으면 수용, reason 없음', () => {
    const hospital = {
      id: 'h3',
      name: '중앙권역외상센터',
      beds: 2,
      onCallSpecialties: ['THORACIC_SURGERY' as const, 'GENERAL_SURGERY' as const],
    }
    const patient = {
      id: 'p3',
      requiredSpecialty: 'THORACIC_SURGERY' as const,
      severity: 4,
    }

    const verdict = adjudicateTransfer(hospital, patient)

    expect(verdict.accepted).toBe(true)
    expect(verdict.reason).toBeUndefined()
  })

  it('병상 0이면서 당직도 없으면, 물리적 벽인 NO_BED 가 우선한다', () => {
    const hospital = {
      id: 'h4',
      name: '문닫힌지방병원',
      beds: 0,
      onCallSpecialties: [], // 당직도 없음
    }
    const patient = {
      id: 'p4',
      requiredSpecialty: 'OBSTETRICS' as const,
      severity: 5,
    }

    const verdict = adjudicateTransfer(hospital, patient)

    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('NO_BED')
  })
})
