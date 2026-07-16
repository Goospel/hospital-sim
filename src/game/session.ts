import type { Hospital, SetupChoices, Specialty } from './types'
import { buildHospital } from './setup'
import { initReceiving, type ReceivingState } from './receiving'
import { startGame, type GameState } from './round'
import { createStemiScenario } from './scenarios'
import { buildDebrief, type Debrief } from './debrief'
import { buildSessionLedger, type Ledger } from './ledger'

// 2막 단막극 세션 상태기계 — 순수·결정론. SETUP → RECEIVING → INTERSTITIAL → EMERGENCY → EPILOGUE.
// beginEmergency가 hospital.backupCare로 in-house 생존 vs 기존 전원 뺑뺑이를 가른다(철학 ii).

/** STEMI 슬라이스가 요구하는 배후과(이번 주 유일 축, spec ⓐ). */
const STEMI_SPECIALTY: Specialty = 'CARDIOLOGY'

export type SessionPhase = 'SETUP' | 'RECEIVING' | 'INTERSTITIAL' | 'EMERGENCY' | 'EPILOGUE'

export type EmergencyState =
  | { mode: 'IN_HOUSE' } // 순환기 배후 있음 → 내 응급실이 직접 PCI → 생존
  | { mode: 'TRANSFER'; game: GameState } // 순환기 없음 → 기존 STEMI 뺑뺑이

export interface SessionState {
  phase: SessionPhase
  hospital?: Hospital
  receiving?: ReceivingState
  emergency?: EmergencyState
}

export function startSession(): SessionState {
  return { phase: 'SETUP' }
}

export function completeSetup(choices: SetupChoices): SessionState {
  const { hospital } = buildHospital(choices)
  return { phase: 'RECEIVING', hospital, receiving: initReceiving(hospital) }
}

export function completeReceiving(state: SessionState): SessionState {
  if (state.phase !== 'RECEIVING') {
    throw new Error(`completeReceiving requires RECEIVING, got ${state.phase}`)
  }
  if (!state.receiving?.done) {
    throw new Error('receiving not done')
  }
  return { ...state, phase: 'INTERSTITIAL' }
}

export function beginEmergency(state: SessionState): SessionState {
  if (state.phase !== 'INTERSTITIAL') {
    throw new Error(`beginEmergency requires INTERSTITIAL, got ${state.phase}`)
  }
  const hospital = state.hospital!
  if (hospital.backupCare.includes(STEMI_SPECIALTY)) {
    return { ...state, phase: 'EMERGENCY', emergency: { mode: 'IN_HOUSE' } }
  }
  const scenario = createStemiScenario()
  const game = startGame(scenario.patient, scenario.hospitals, scenario.goldenSeconds)
  return { ...state, phase: 'EMERGENCY', emergency: { mode: 'TRANSFER', game } }
}

export function toEpilogue(state: SessionState): SessionState {
  if (state.phase !== 'EMERGENCY') {
    throw new Error(`toEpilogue requires EMERGENCY, got ${state.phase}`)
  }
  const em = state.emergency!
  if (em.mode === 'TRANSFER' && em.game.status === 'IN_PROGRESS') {
    throw new Error('emergency transfer not finished')
  }
  return { ...state, phase: 'EPILOGUE' }
}

export interface SessionEpilogue {
  survived: boolean
  ledger: Ledger | null
  debrief: Debrief | null // 전원 뺑뺑이한 경우만(IN_HOUSE는 null)
}

export function buildEpilogue(state: SessionState): SessionEpilogue {
  if (state.phase !== 'EPILOGUE') {
    throw new Error(`buildEpilogue requires EPILOGUE, got ${state.phase}`)
  }
  const hospital = state.hospital!
  const receiving = state.receiving!
  const em = state.emergency!
  const ledger = buildSessionLedger(hospital, STEMI_SPECIALTY, {
    netProfitDeltaBillions: receiving.netProfitDeltaBillions,
    lawsuitExposure: receiving.lawsuitExposure,
  })
  if (em.mode === 'IN_HOUSE') {
    return { survived: true, ledger, debrief: null }
  }
  return { survived: em.game.status === 'ACCEPTED', ledger, debrief: buildDebrief(em.game) }
}
