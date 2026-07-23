import { describe, it, expect } from 'vitest'
import { formatManwon, formatSignedManwon } from './labels'

// 회귀 방지 — LedgerPanel 순이익 총계가 부호를 하드코딩해 적자에서 "+-24억"으로 렌더되던 결함(Task 7 롤업).
// 부호 인지 포맷터를 단일 소스로 추출해 모든 렌더 지점(LedgerPanel/WeekSummary 등)이 공유한다.
//
// 내부 단위는 **만원**이고(2026-07-23 수익 구조 재설계), 1억 이상만 억으로 접는다 —
// 한 화면에 하루 손익(수백만원)과 개원 예산(5억)이 같이 뜨기 때문이다.

describe('formatSignedManwon — 부호 인지 금액 포맷', () => {
  it('음수는 유니코드 마이너스(−) + 절대값 — "+-" 이중 부호 없음', () => {
    const out = formatSignedManwon(-24)
    expect(out).toBe('−24만원')
    expect(out).not.toContain('+-')
    expect(out).not.toContain('-')
  })

  it('양수는 + + 값', () => {
    expect(formatSignedManwon(24)).toBe('+24만원')
  })

  it('0은 +0만원(기존 세그먼트 부호 관례 — 0은 음수 아님)', () => {
    expect(formatSignedManwon(0)).toBe('+0만원')
  })

  it('큰 음수도 절대값으로 정확히 변환', () => {
    expect(formatSignedManwon(-2280)).toBe('−2,280만원')
  })

  it('1억(=10,000만원)부터 억으로 접는다 — 경계는 여기 한 곳에만 있다', () => {
    expect(formatSignedManwon(9_999)).toBe('+9,999만원')
    expect(formatSignedManwon(10_000)).toBe('+1.0억')
    expect(formatSignedManwon(-50_000)).toBe('−5.0억')
  })
})

describe('formatManwon — 부호 없는 절대값 표기(예산·채용비·증설비)', () => {
  it('만원 단위는 천 단위 구분자를 넣는다', () => {
    expect(formatManwon(5_000)).toBe('5,000만원')
  })

  it('억 단위는 소수 한 자리 — 채용 예산 5억이 "50000만원"으로 안 읽히게', () => {
    expect(formatManwon(50_000)).toBe('5.0억')
    expect(formatManwon(15_000)).toBe('1.5억')
  })
})
