import { describe, it, expect } from 'vitest'
import { fallbackLine, persuasionReply, receivingLine, CALLER_PLEA, RECEIVE_HARDLOCK } from './dialogue'
import type { RejectionReason, TransferVerdict } from './types'
import { classifyCall, createCallQueue } from './receiving'
import { buildHospital } from './setup'

const accepted: TransferVerdict = { accepted: true }
const reject = (reason: RejectionReason): TransferVerdict => ({ accepted: false, reason })

const ALL_REASONS: RejectionReason[] = ['NO_BED', 'NO_ER_ONCALL', 'ER_OVERCROWDED', 'NO_BACKUP_CARE']

describe('fallbackLine — 결정론적 폴백 대사 (LLM 없이)', () => {
  it('수용 판정은 비어 있지 않은 대사를 준다', () => {
    expect(fallbackLine(accepted, 0).length).toBeGreaterThan(0)
  })

  it('네 거절 사유 모두 비어 있지 않은 대사를 준다', () => {
    for (const r of ALL_REASONS) {
      expect(fallbackLine(reject(r), 0).length).toBeGreaterThan(0)
    }
  })

  it('거절 사유가 다르면 서로 다른 대사가 나온다 (네 사유가 전부 구별됨)', () => {
    const lines = new Set(ALL_REASONS.map((r) => fallbackLine(reject(r), 0)))
    expect(lines.size).toBe(ALL_REASONS.length)
  })

  it('같은 입력은 항상 같은 대사(결정론)', () => {
    expect(fallbackLine(reject('NO_BACKUP_CARE'), 3)).toBe(fallbackLine(reject('NO_BACKUP_CARE'), 3))
  })

  it('seed에 따라 같은 사유 안에서도 대사가 변주된다', () => {
    const lines = new Set([0, 1, 2, 3].map((s) => fallbackLine(reject('NO_BACKUP_CARE'), s)))
    expect(lines.size).toBeGreaterThan(1)
  })

  it('[핵심] 배후진료 불가 대사는 "병상이 아니라 시술/처치를 못 한다"는 결을 담는다', () => {
    const line = fallbackLine(reject('NO_BACKUP_CARE'), 0)
    // 병상 탓으로 읽히면 안 된다 — 배후진료(시술/처치/전문의) 부재가 핵심.
    expect(line).not.toContain('병상')
  })
})

describe('persuasionReply — 매달릴수록 냉정해지되 판정은 안 바뀌는 응답', () => {
  it('매달린 횟수가 늘면 응답이 달라진다(에스컬레이션)', () => {
    expect(persuasionReply(reject('NO_BACKUP_CARE'), 0)).not.toBe(
      persuasionReply(reject('NO_BACKUP_CARE'), 2),
    )
  })

  it('사유가 다르면 다른 응답 (네 사유 전부 구별됨)', () => {
    const replies = new Set(ALL_REASONS.map((r) => persuasionReply(reject(r), 1)))
    expect(replies.size).toBe(ALL_REASONS.length)
  })

  it('같은 입력은 항상 같은 응답(결정론)', () => {
    expect(persuasionReply(reject('NO_BED'), 2)).toBe(persuasionReply(reject('NO_BED'), 2))
  })

  it('매달린 횟수가 아무리 커도 비어 있지 않은 응답을 준다(마지막 단계로 clamp)', () => {
    for (const r of ALL_REASONS) {
      expect(persuasionReply(reject(r), 99).length).toBeGreaterThan(0)
    }
  })
})

describe('receivingLine — 1막 받는 쪽 다크코미디 폴백', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const collaborator = buildHospital({ hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3 } }).hospital
  const conscientious = buildHospital({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 2 } }).hospital

  it('모든 콜 종류에 호소 대사가 있다', () => {
    expect(CALLER_PLEA.STEMI.length).toBeGreaterThan(0)
    expect(CALLER_PLEA.COSMETIC_WALKIN.length).toBeGreaterThan(0)
    expect(CALLER_PLEA.GENERAL_EMERGENCY.length).toBeGreaterThan(0)
  })

  it('워크인 수용 → 명랑한 확인 대사(🎉 포함)', () => {
    const line = receivingLine(walkin, classifyCall(collaborator, walkin), true)
    expect(line.length).toBeGreaterThan(0)
    expect(line).toContain('🎉')
  })

  it('STEMI 하드락(내 병원도 순환기 없음) → 벽을 안쪽에서 배우는 대사', () => {
    const disposition = classifyCall(collaborator, stemi) // HARDLOCK_REJECT
    const line = receivingLine(stemi, disposition, false)
    expect(line).toBe(RECEIVE_HARDLOCK)
  })

  it('양심 병원의 STEMI 수용 → 명랑/확인 대사(비어있지 않음)', () => {
    const disposition = classifyCall(conscientious, stemi) // CHOICE
    const line = receivingLine(stemi, disposition, true)
    expect(line.length).toBeGreaterThan(0)
  })

  it('결정론 — 같은 인자·seed는 같은 대사', () => {
    expect(receivingLine(walkin, 'CHOICE', true, 1)).toBe(receivingLine(walkin, 'CHOICE', true, 1))
  })
})
