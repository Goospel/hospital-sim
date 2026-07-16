import { describe, it, expect } from 'vitest'
import { startGame, attemptTransfer } from './round'
import type { Hospital, Patient } from './types'

const patient: Patient = {
  id: 'p1',
  requiredSpecialty: 'THORACIC_SURGERY',
  severity: 5,
}

const accepting: Hospital = {
  id: 'accept',
  name: '중앙권역외상센터',
  beds: 2,
  onCallSpecialties: ['THORACIC_SURGERY'],
}

const fullHospital: Hospital = {
  id: 'nobed',
  name: '만상병원',
  beds: 0,
  onCallSpecialties: ['THORACIC_SURGERY'],
}

describe('round — 한 판 상태기계', () => {
  it('startGame 은 진행중 상태를 만들고, 타이머는 총 골든타임, 시도 로그는 비어 있다', () => {
    const state = startGame(patient, [accepting, fullHospital], 720)

    expect(state.status).toBe('IN_PROGRESS')
    expect(state.timer.remainingSeconds).toBe(720)
    expect(state.attempts).toEqual([])
    expect(state.acceptedHospitalId).toBeUndefined()
  })

  it('수용 가능한 병원에 전원 시도하면 ACCEPTED, 시도가 기록되고 시간이 소모된다', () => {
    const state = startGame(patient, [accepting, fullHospital], 720)

    const next = attemptTransfer(state, 'accept', 90)

    expect(next.status).toBe('ACCEPTED')
    expect(next.acceptedHospitalId).toBe('accept')
    expect(next.timer.remainingSeconds).toBe(630)
    expect(next.attempts).toHaveLength(1)
    expect(next.attempts[0]).toEqual({
      hospitalId: 'accept',
      verdict: { accepted: true },
      timeCostSeconds: 90,
    })
  })

  it('원본 상태를 변경하지 않는다(불변)', () => {
    const state = startGame(patient, [accepting, fullHospital], 720)

    attemptTransfer(state, 'accept', 90)

    expect(state.status).toBe('IN_PROGRESS')
    expect(state.attempts).toEqual([])
    expect(state.timer.remainingSeconds).toBe(720)
  })

  it('거절당하고 시간이 남아 있으면 IN_PROGRESS 유지, 거절 사유가 기록된다', () => {
    const state = startGame(patient, [accepting, fullHospital], 720)

    const next = attemptTransfer(state, 'nobed', 60)

    expect(next.status).toBe('IN_PROGRESS')
    expect(next.attempts[0].verdict).toEqual({ accepted: false, reason: 'NO_BED' })
    expect(next.acceptedHospitalId).toBeUndefined()
  })

  it('거절당하고 그 콜로 골든타임이 소진되면 DIED (골든타임 놓침)', () => {
    const state = startGame(patient, [accepting, fullHospital], 120)

    const next = attemptTransfer(state, 'nobed', 120)

    expect(next.status).toBe('DIED')
    expect(next.timer.remainingSeconds).toBe(0)
  })

  it('게임이 끝난 뒤(ACCEPTED/DIED)에 추가 전원 시도는 throw', () => {
    const won = attemptTransfer(startGame(patient, [accepting], 720), 'accept', 60)
    expect(won.status).toBe('ACCEPTED')
    expect(() => attemptTransfer(won, 'accept', 10)).toThrow()

    const lost = attemptTransfer(startGame(patient, [fullHospital], 100), 'nobed', 100)
    expect(lost.status).toBe('DIED')
    expect(() => attemptTransfer(lost, 'nobed', 10)).toThrow()
  })
})
