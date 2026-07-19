import { describe, it, expect } from 'vitest'
import { formatSignedBillions } from './labels'

// 회귀 방지 — LedgerPanel 순이익 총계가 부호를 하드코딩해 적자에서 "+-24억"으로 렌더되던 결함(Task 7 롤업).
// 부호 인지 포맷터를 단일 소스로 추출해 모든 렌더 지점(LedgerPanel/WeekSummary 등)이 공유한다.

describe('formatSignedBillions — 부호 인지 억 단위 포맷', () => {
  it('음수는 유니코드 마이너스(−) + 절대값 — "+-" 이중 부호 없음', () => {
    const out = formatSignedBillions(-24)
    expect(out).toBe('−24억')
    expect(out).not.toContain('+-')
    expect(out).not.toContain('-')
  })

  it('양수는 + + 값', () => {
    expect(formatSignedBillions(24)).toBe('+24억')
  })

  it('0은 +0억(기존 세그먼트 부호 관례 — 0은 음수 아님)', () => {
    expect(formatSignedBillions(0)).toBe('+0억')
  })

  it('큰 음수도 절대값으로 정확히 변환', () => {
    expect(formatSignedBillions(-228)).toBe('−228억')
  })
})
