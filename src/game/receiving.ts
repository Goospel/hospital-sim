import type { CallKind, Hospital, IncomingCall, Patient } from './types'
import { adjudicateTransfer } from './adjudicate'

// 1막 콜 큐 — 받는 병원. 기존 adjudicateTransfer를 플레이어 손으로 돌린다(벽의 양쪽).
// 순수·결정론·불변. 다크코미디는 대사(dialogue.ts)와 UI가, 여기선 숫자만.

/** 수용/거절로 누적되는 분기 손익 델타(억). 부호만 근거, 금액 각색. */
const PROFIT_DELTA: Record<CallKind, number> = {
  COSMETIC_WALKIN: 8, // 명랑한 흑자
  GENERAL_EMERGENCY: 2, // 저마진
  STEMI: -20, // 적자(필수·고위험 케이스 수용의 대가)
}

export type CallDisposition = 'HARDLOCK_REJECT' | 'CHOICE'

export interface ReceivingState {
  hospital: Hospital
  queue: IncomingCall[]
  index: number
  netProfitDeltaBillions: number
  lawsuitExposure: number
  log: { callId: string; accepted: boolean; disposition: CallDisposition }[]
  done: boolean
}

const stemiPatient: Patient = { id: 'call-stemi', requiredSpecialty: 'CARDIOLOGY', severity: 5 }
const generalPatient: Patient = { id: 'call-general', requiredSpecialty: 'GENERAL_SURGERY', severity: 3 }
const walkinPatient: Patient = { id: 'call-walkin', requiredSpecialty: 'CARDIOLOGY', severity: 1 } // 명목값(판정 안 함)

/** 고정 5통 콜 큐 — 코미디 리듬 우선(워크인/STEMI 교차). 결정론. */
export function createCallQueue(): IncomingCall[] {
  return [
    { id: 'c1', kind: 'COSMETIC_WALKIN', label: '보톡스 상담 워크인', patient: walkinPatient, lawsuitRisk: false },
    { id: 'c2', kind: 'STEMI', label: '급성심근경색 — 타 병원 전원 요청', patient: stemiPatient, lawsuitRisk: true },
    { id: 'c3', kind: 'COSMETIC_WALKIN', label: '검진 패키지 문의', patient: walkinPatient, lawsuitRisk: false },
    { id: 'c4', kind: 'GENERAL_EMERGENCY', label: '복통 응급 — 병상 요청', patient: generalPatient, lawsuitRisk: false },
    { id: 'c5', kind: 'STEMI', label: '급성심근경색 — 재이송', patient: stemiPatient, lawsuitRisk: true },
  ]
}

/** 이 콜을 받을 수 있는가(선택) vs 판정상 못 받는가(하드락). */
export function classifyCall(hospital: Hospital, call: IncomingCall): CallDisposition {
  switch (call.kind) {
    case 'COSMETIC_WALKIN':
      return 'CHOICE' // 응급이 아니라 늘 받을 수 있다(명랑)
    case 'GENERAL_EMERGENCY':
      // 병상·응급실만 있으면 받는다(배후 무관, 저마진).
      return hospital.beds > 0 && hospital.hasErOnCall && !hospital.overcrowded ? 'CHOICE' : 'HARDLOCK_REJECT'
    case 'STEMI':
      return adjudicateTransfer(hospital, call.patient).accepted ? 'CHOICE' : 'HARDLOCK_REJECT'
  }
}

export function initReceiving(hospital: Hospital, queue: IncomingCall[] = createCallQueue()): ReceivingState {
  return {
    hospital,
    queue,
    index: 0,
    netProfitDeltaBillions: 0,
    lawsuitExposure: 0,
    log: [],
    done: queue.length === 0,
  }
}

/** 현재 콜에 수용/거절을 정한다. 하드락 콜은 accept=true여도 수용되지 않는다(가드). */
export function decide(state: ReceivingState, accept: boolean): ReceivingState {
  if (state.done) {
    throw new Error('receiving already done')
  }
  const call = state.queue[state.index]
  const disposition = classifyCall(state.hospital, call)
  const effectiveAccept = disposition === 'CHOICE' && accept

  const netProfitDeltaBillions = effectiveAccept
    ? state.netProfitDeltaBillions + PROFIT_DELTA[call.kind]
    : state.netProfitDeltaBillions
  const lawsuitExposure = effectiveAccept && call.lawsuitRisk ? state.lawsuitExposure + 1 : state.lawsuitExposure

  const log = [...state.log, { callId: call.id, accepted: effectiveAccept, disposition }]
  const index = state.index + 1
  return {
    ...state,
    netProfitDeltaBillions,
    lawsuitExposure,
    log,
    index,
    done: index >= state.queue.length,
  }
}

/** 분기 진행률(0~1) — 처리한 콜 수 / 전체. 빈 큐(콜 없음)는 분기 완료로 보아 1. */
export function quarterProgress(state: ReceivingState): number {
  if (state.queue.length === 0) return 1
  return state.index / state.queue.length
}

/**
 * 부문 손익 — 구조 손익(profitPerDoctor 기반)을 분기 진행률만큼 누적한 값.
 * 콜 시작(index 0)엔 전 부문 0에서 출발해, 콜을 처리할수록(=분기 시간 경과) 각 과가 자기 구조
 * 손익을 향해 자라고, 분기말(done)에 전체 수치에 도달한다 — "진료를 볼수록 흑자/적자" 직관과 일치.
 * (정적 선반영이 진료 0인 t=0부터 흑자/적자를 전액 찍어 논지·show-don't-tell과 어긋나던 걸 교정.)
 * 표시용 정수 반올림 — 분기말(진행률 1)엔 원 구조 손익 그대로.
 */
export function accruedSegments(state: ReceivingState): { label: string; profitBillions: number }[] {
  const p = quarterProgress(state)
  const segments = state.hospital.economics?.segments ?? []
  return segments.map((s) => ({ label: s.label, profitBillions: Math.round(s.profitBillions * p) }))
}

/**
 * 1막 러닝 순이익(누적 부문 손익 합 + 분기 진료 수익 델타) — 소송 비용은 제외.
 * 부문 손익은 accruedSegments로 분기 진행률만큼만 반영한다(콜 시작 0에서 출발).
 * 소송 비용은 결말 buildSessionLedger에서만 차감된다(해석 0 원칙: 1막은 명랑한 숫자만).
 */
export function runningNetProfit(state: ReceivingState): number {
  const segmentTotal = accruedSegments(state).reduce((sum, s) => sum + s.profitBillions, 0)
  return segmentTotal + state.netProfitDeltaBillions
}
