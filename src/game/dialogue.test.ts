import { describe, it, expect } from 'vitest'
import { fallbackLine } from './dialogue'
import type { TransferVerdict } from './types'

const accepted: TransferVerdict = { accepted: true }
const noBed: TransferVerdict = { accepted: false, reason: 'NO_BED' }
const noSpecialist: TransferVerdict = { accepted: false, reason: 'NO_SPECIALIST' }

describe('fallbackLine — 결정론적 폴백 대사 (LLM 없이)', () => {
  it('수용 판정은 비어 있지 않은 대사를 준다', () => {
    expect(fallbackLine(accepted, 0).length).toBeGreaterThan(0)
  })

  it('거절 사유가 다르면 다른 대사가 나온다', () => {
    expect(fallbackLine(noBed, 0)).not.toBe(fallbackLine(noSpecialist, 0))
  })

  it('같은 입력은 항상 같은 대사(결정론)', () => {
    expect(fallbackLine(noBed, 3)).toBe(fallbackLine(noBed, 3))
  })

  it('seed에 따라 같은 사유 안에서도 대사가 변주된다', () => {
    const lines = new Set([0, 1, 2, 3].map((s) => fallbackLine(noBed, s)))
    expect(lines.size).toBeGreaterThan(1)
  })
})
