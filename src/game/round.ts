import type { Hospital, Patient, TransferVerdict } from './types'
import { adjudicateTransfer } from './adjudicate'
import { createGoldenTimer, advance, isExpired, type GoldenTimer } from './goldenTime'

/** 한 번의 전원 콜 기록 */
export interface TransferAttempt {
  hospitalId: string
  verdict: TransferVerdict
  timeCostSeconds: number
}

/** 한 판의 상태 */
export type GameStatus =
  | 'IN_PROGRESS' // 진행중 — 아직 받아줄 병원을 찾는 중
  | 'ACCEPTED' // 수용됨 — 환자를 살렸다
  | 'DIED' // 골든타임 소진 — 환자 사망

/** 한 판의 전체 상태 (불변으로 다룬다) */
export interface GameState {
  patient: Patient
  hospitals: Hospital[]
  timer: GoldenTimer
  attempts: TransferAttempt[]
  status: GameStatus
  acceptedHospitalId?: string
}

/** 새 판을 시작한다. */
export function startGame(
  patient: Patient,
  hospitals: Hospital[],
  totalGoldenSeconds: number,
): GameState {
  return {
    patient,
    hospitals,
    timer: createGoldenTimer(totalGoldenSeconds),
    attempts: [],
    status: 'IN_PROGRESS',
  }
}

/** 한 병원에 전원을 시도한다. 시간을 소모하고, 코드 판정으로 수용/거절을 정한다. */
export function attemptTransfer(
  state: GameState,
  hospitalId: string,
  timeCostSeconds: number,
): GameState {
  if (state.status !== 'IN_PROGRESS') {
    throw new Error(`game already over: ${state.status}`)
  }

  const hospital = state.hospitals.find((h) => h.id === hospitalId)
  if (!hospital) {
    throw new Error(`unknown hospitalId: ${hospitalId}`)
  }

  const verdict = adjudicateTransfer(hospital, state.patient)
  const timer = advance(state.timer, timeCostSeconds)
  const attempts = [...state.attempts, { hospitalId, verdict, timeCostSeconds }]

  if (verdict.accepted) {
    return { ...state, timer, attempts, status: 'ACCEPTED', acceptedHospitalId: hospitalId }
  }
  // 거절 — 이 콜로 골든타임이 소진됐으면 환자는 죽는다.
  const status: GameStatus = isExpired(timer) ? 'DIED' : 'IN_PROGRESS'
  return { ...state, timer, attempts, status }
}
