import { describe, it, expect } from 'vitest'
import { fallbackLine, persuasionReply } from './dialogue'
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

describe('persuasionReply — 매달릴수록 냉정해지되 판정은 안 바뀌는 응답', () => {
  it('매달린 횟수가 늘면 응답이 달라진다(에스컬레이션)', () => {
    expect(persuasionReply(noBed, 0)).not.toBe(persuasionReply(noBed, 2))
  })

  it('같은 사유라도 NO_BED와 NO_SPECIALIST는 다른 응답', () => {
    expect(persuasionReply(noBed, 1)).not.toBe(persuasionReply(noSpecialist, 1))
  })

  it('같은 입력은 항상 같은 응답(결정론)', () => {
    expect(persuasionReply(noBed, 2)).toBe(persuasionReply(noBed, 2))
  })

  it('매달린 횟수가 아무리 커도 비어 있지 않은 응답을 준다(마지막 단계로 clamp)', () => {
    expect(persuasionReply(noBed, 99).length).toBeGreaterThan(0)
    expect(persuasionReply(noSpecialist, 99).length).toBeGreaterThan(0)
  })
})
