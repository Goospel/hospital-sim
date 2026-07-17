import type { CallKind, Hospital, IncomingCall, Patient, RejectionReason } from './types'
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
  /**
   * 남은 하루 진료 자리 — 병원의 "능력의 한계"를 담는 유일한 동적 값.
   * 병상=총량 / 의사=자격 모델의 총량 축(설계: 2026-07-17-daily-capacity-calendar-design.md §2.1).
   * hospital.beds는 정적 스톡이라 소진되지 않는다 — 그래서 이 필드가 따로 있다.
   */
  bedsFree: number
  netProfitDeltaBillions: number
  lawsuitExposure: number
  /** reason = 하드락 사유(못 받은 이유). 받았거나 내가 거절한 콜은 null — 구조가 막은 것만 사유가 남는다. */
  log: { callId: string; accepted: boolean; disposition: CallDisposition; reason: RejectionReason | null }[]
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

/**
 * 이 콜을 못 받는 사유 — 받을 수 있으면 null.
 *
 * 게이트 우선순위는 adjudicateTransfer(adjudicate.ts:9-13)를 따르되, 맨 앞에 **자리(총량)**를 둔다:
 *   0) 자리 0 → NO_BED — 자격이 있어도 앉힐 데가 없다. 오늘 이미 다 썼기 때문이다.
 *   1~3) 당직·과밀·배후 → 기존 판정(자격)
 *
 * 이 순서가 곧 논지다. 순환기를 갖춘 병원조차 미용으로 자리를 채우면 STEMI 앞에서 NO_BED가 된다 —
 * 벽의 종류가 "역량 부재"에서 "이미 다 썼음"으로 바뀔 뿐 환자는 똑같이 못 들어온다.
 */
export function hardlockReason(hospital: Hospital, call: IncomingCall, bedsFree: number): RejectionReason | null {
  if (bedsFree <= 0) return 'NO_BED'
  switch (call.kind) {
    case 'COSMETIC_WALKIN':
      return null // 응급이 아니라 자리만 있으면 받는다(명랑)
    case 'GENERAL_EMERGENCY':
      // 응급실 당직·과밀만 보면 된다(배후 무관, 저마진).
      if (!hospital.hasErOnCall) return 'NO_ER_ONCALL'
      if (hospital.overcrowded) return 'ER_OVERCROWDED'
      return null
    case 'STEMI': {
      const verdict = adjudicateTransfer(hospital, call.patient)
      return verdict.accepted ? null : (verdict.reason ?? 'NO_BACKUP_CARE')
    }
  }
}

/** 이 콜을 받을 수 있는가(선택) vs 판정상 못 받는가(하드락). */
export function classifyCall(hospital: Hospital, call: IncomingCall, bedsFree: number): CallDisposition {
  return hardlockReason(hospital, call, bedsFree) === null ? 'CHOICE' : 'HARDLOCK_REJECT'
}

export function initReceiving(hospital: Hospital, queue: IncomingCall[] = createCallQueue()): ReceivingState {
  return {
    hospital,
    queue,
    index: 0,
    bedsFree: hospital.beds, // 하루는 병상을 다 비운 채 시작한다
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
  const reason = hardlockReason(state.hospital, call, state.bedsFree)
  const disposition: CallDisposition = reason === null ? 'CHOICE' : 'HARDLOCK_REJECT'
  const effectiveAccept = disposition === 'CHOICE' && accept

  // 수용한 환자만 자리를 먹는다 — 거절·하드락은 자리를 소모하지 않는다.
  const bedsFree = effectiveAccept ? state.bedsFree - 1 : state.bedsFree
  const netProfitDeltaBillions = effectiveAccept
    ? state.netProfitDeltaBillions + PROFIT_DELTA[call.kind]
    : state.netProfitDeltaBillions
  const lawsuitExposure = effectiveAccept && call.lawsuitRisk ? state.lawsuitExposure + 1 : state.lawsuitExposure

  const log = [...state.log, { callId: call.id, accepted: effectiveAccept, disposition, reason }]
  const index = state.index + 1
  return {
    ...state,
    bedsFree,
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
