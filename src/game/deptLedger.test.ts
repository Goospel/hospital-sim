import { describe, it, expect } from 'vitest'
import { deptDayStats, deptLedgerLines } from './deptLedger'
import { decide, callDelta, isElective, type ReceivingState } from './receiving'
import { completeSetup, completeReceiving, advanceDay, type SessionState } from './session'
import { buildHospital, DAYS_PER_WEEK } from './setup'
import type { CallKind, IncomingCall, SetupChoices, Specialty } from './types'

// 과별 손익 영수증 — 하루/주간 마감이 공유하는 과별 집계.
// 스펙: docs/superpowers/specs/2026-07-24-dept-ledger-receipt-design.md
// 불변식 둘이 척추다: I-A(과별 진료 합 = netProfitDelta), I-B(과별 순익 합 = 일별 순이익 합).

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

/** 큐 한 통(플레인 데이터) — handlingDept·callDelta는 진짜로 돈다(모의 아님). */
function mkCall(id: string, kind: CallKind, label: string, req: Specialty = 'CARDIOLOGY'): IncomingCall {
  return { id, kind, label, patient: { id: `p-${id}`, requiredSpecialty: req, severity: 3 }, lawsuitRisk: false, nightShift: false }
}

/** 로그 한 줄 — 수용/미수용만 바꿔 집계 대상을 만든다. */
function mkLog(callId: string, accepted: boolean): ReceivingState['log'][number] {
  return { callId, accepted, disposition: accepted ? 'CHOICE' : 'HARDLOCK_REJECT', reason: accepted ? null : 'NO_BACKUP_CARE' }
}

/** 그날 RECEIVING을 끝까지 흘린다 — 선택진료만 방침을 타고 응급은 언제나 받는다(session.test.runDay와 동형). */
function drain(state: SessionState, acceptElective: boolean): SessionState {
  let s = state
  while (!s.receiving!.done) {
    const call = s.receiving!.queue[s.receiving!.index]
    const yes = isElective(call.kind) ? acceptElective : true
    s = { ...s, receiving: decide(s.receiving!, yes ? 'ACCEPT' : 'DECLINE') }
  }
  return s
}

/** 개원 → 7일 통주 → 7일차 DAY_END(ledgerDays 7칸). */
function runWeek(choices: SetupChoices, acceptElective: boolean): SessionState {
  let s = drain(completeSetup(choices), acceptElective)
  for (let d = 1; d < DAYS_PER_WEEK; d++) {
    s = drain(advanceDay(completeReceiving(s)), acceptElective)
  }
  return completeReceiving(s)
}

describe('deptDayStats — 수용된 콜을 담당 과로 접는다', () => {
  it('빈 로그면 빈 객체', () => {
    expect(deptDayStats({ log: [], queue: [] })).toEqual({})
  })

  it('미용 워크인·검진 워크인은 라벨로 갈려 AESTHETICS·CHECKUP에 각각 잡힌다', () => {
    const queue = [
      mkCall('c1', 'COSMETIC_WALKIN', '보톡스 상담 워크인'),
      mkCall('c2', 'COSMETIC_WALKIN', '검진 패키지 문의'),
    ]
    const log = [mkLog('c1', true), mkLog('c2', true)]
    const stats = deptDayStats({ log, queue })
    expect(stats.AESTHETICS).toEqual({ patients: 1, revenueManwon: callDelta('COSMETIC_WALKIN') })
    expect(stats.CHECKUP).toEqual({ patients: 1, revenueManwon: callDelta('COSMETIC_WALKIN') })
  })

  it('응급(STEMI)은 그 과(순환기내과)에 음수 델타로 잡힌다', () => {
    const queue = [mkCall('c1', 'STEMI', '급성심근경색 전원', 'CARDIOLOGY')]
    const stats = deptDayStats({ log: [mkLog('c1', true)], queue })
    expect(stats.CARDIOLOGY).toEqual({ patients: 1, revenueManwon: callDelta('STEMI') })
    expect(callDelta('STEMI')).toBeLessThan(0) // 받을수록 밑진다
  })

  it('미수용(거절·하드락·타임아웃)은 집계에서 빠진다', () => {
    const queue = [mkCall('c1', 'STEMI', 'x', 'CARDIOLOGY'), mkCall('c2', 'COSMETIC_WALKIN', '보톡스 상담 워크인')]
    const stats = deptDayStats({ log: [mkLog('c1', false), mkLog('c2', false)], queue })
    expect(stats).toEqual({})
  })

  it('같은 과 여러 건은 환자 수·수익이 누적된다', () => {
    const queue = [mkCall('c1', 'STEMI', 'x'), mkCall('c2', 'STEMI', 'y')]
    const stats = deptDayStats({ log: [mkLog('c1', true), mkLog('c2', true)], queue })
    expect(stats.CARDIOLOGY).toEqual({ patients: 2, revenueManwon: 2 * callDelta('STEMI') })
  })

  it('[I-A] 실제 하루를 돌리면 과별 진료 합 = netProfitDeltaManwon', () => {
    const s = drain(completeSetup(conscientious), true) // 순환기 2 → 응급 수용 경로도 탄다
    const stats = deptDayStats(s.receiving!)
    const sum = Object.values(stats).reduce((n, v) => n + v!.revenueManwon, 0)
    expect(sum).toBe(s.receiving!.netProfitDeltaManwon)
  })
})

describe('deptLedgerLines — 날 배열 + 병원 → 과별 한 줄', () => {
  const { hospital } = buildHospital(conscientious) // AESTHETICS 1(−560/주), CARDIOLOGY 2(−2380/주)

  it('하루치 고정비 = round(주간/7), 순익 = 진료 + 고정비', () => {
    const lines = deptLedgerLines([{ deptStats: { AESTHETICS: { patients: 5, revenueManwon: 75 } } }], hospital)
    const a = lines.find((l) => l.key === 'AESTHETICS')!
    expect(a.fixedManwon).toBe(Math.round(-560 / DAYS_PER_WEEK))
    expect(a.patients).toBe(5)
    expect(a.revenueManwon).toBe(75)
    expect(a.netManwon).toBe(75 + Math.round(-560 / DAYS_PER_WEEK))
  })

  it('7일이면 고정비·환자·진료가 일수만큼 누적된다', () => {
    const days = Array.from({ length: 7 }, () => ({ deptStats: { CARDIOLOGY: { patients: 1, revenueManwon: -150 } } }))
    const c = deptLedgerLines(days, hospital).find((l) => l.key === 'CARDIOLOGY')!
    expect(c.fixedManwon).toBe(Math.round(-2380 / DAYS_PER_WEEK) * 7)
    expect(c.patients).toBe(7)
    expect(c.revenueManwon).toBe(-1050)
  })

  it('정렬은 departments 순서 고정(날마다 안 바뀐다)', () => {
    const days = [{ deptStats: { CARDIOLOGY: { patients: 1, revenueManwon: -150 }, AESTHETICS: { patients: 1, revenueManwon: 15 } } }]
    expect(deptLedgerLines(days, hospital).map((l) => l.key)).toEqual(['AESTHETICS', 'CARDIOLOGY'])
  })

  it('미채용·무활동 과는 줄이 없다', () => {
    const lines = deptLedgerLines([{ deptStats: {} }], hospital)
    expect(lines.some((l) => l.key === 'CHECKUP')).toBe(false)
  })

  it('라벨은 departments 출처(순환기내과)', () => {
    const c = deptLedgerLines([{ deptStats: { CARDIOLOGY: { patients: 1, revenueManwon: -150 } } }], hospital).find((l) => l.key === 'CARDIOLOGY')!
    expect(c.label).toBe('순환기내과')
  })

  it('[I-B] 공범 루트 — 과별 순익 합 = 일별 순이익 합 (오차 0)', () => {
    const dayEnd = runWeek(collaborator, true)
    const lineSum = deptLedgerLines(dayEnd.ledgerDays, dayEnd.hospital!).reduce((n, l) => n + l.netManwon, 0)
    const daySum = dayEnd.ledgerDays.reduce((n, d) => n + d.netProfitManwon, 0)
    expect(lineSum).toBe(daySum)
  })

  it('[I-B] 양심 루트(응급 수용) — 과별 순익 합 = 일별 순이익 합 (오차 0)', () => {
    const dayEnd = runWeek(conscientious, false)
    const lineSum = deptLedgerLines(dayEnd.ledgerDays, dayEnd.hospital!).reduce((n, l) => n + l.netManwon, 0)
    const daySum = dayEnd.ledgerDays.reduce((n, d) => n + d.netProfitManwon, 0)
    expect(lineSum).toBe(daySum)
  })
})

describe('recordDay 통합 — DayRecord.deptStats', () => {
  it('completeReceiving가 ledgerDays에 그날 deptStats를 남긴다', () => {
    const done = drain(completeSetup(conscientious), true)
    const s = completeReceiving(done)
    expect(s.ledgerDays[0].deptStats).toEqual(deptDayStats(done.receiving!))
  })
})
