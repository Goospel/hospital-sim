import type { CallKind, Hospital, IncomingCall, Patient, RejectionReason } from './types'
import { adjudicateTransfer } from './adjudicate'
import { DAYS_PER_WEEK } from './setup'

// 1막 콜 큐 — 받는 병원. 기존 adjudicateTransfer를 플레이어 손으로 돌린다(벽의 양쪽).
// 순수·결정론·불변. 다크코미디는 대사(dialogue.ts)와 UI가, 여기선 숫자만.
// 시간 단위 = 하루. 한 ReceivingState = 하루치 콜 큐이고, 한 판은 7일(DAYS_PER_WEEK)이다.

/**
 * 콜 한 통 수용으로 누적되는 손익 델타(억). 부호만 근거, 금액 각색.
 *
 * ⚠️ 스케일 주의 — 한 판이 콜 5통에서 **35통(7일 × 5)**으로 늘면서 이 값들이 7배로 누적된다.
 * 하루 단위 각색값(+8/+2/−20)을 그대로 두면 한 주 진료 수익이 부문 손익(주간 전액)을 압도해
 * 구조 손익이 무의미해지고(양심 루트 −525억) 예산 100억짜리 병원의 장부가 개연성을 잃는다.
 * 그래서 콜당 값을 주간 스케일로 낮춘다 — 7일을 다 돌았을 때 콜 델타 합이 부문 손익과 같은 자릿수가 되게.
 */
const PROFIT_DELTA: Record<CallKind, number> = {
  COSMETIC_WALKIN: 3, // 명랑한 흑자
  GENERAL_EMERGENCY: 1, // 저마진
  STEMI: -6, // 적자(필수·고위험 케이스 수용의 대가)
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

/**
 * 요일별 콜 구성 — 하루 5통 고정, 콜 종류만 날마다 다르다.
 *
 * 결정론 유지가 이 게임의 원칙이라 RNG를 쓰지 않는다. 그렇다고 7일을 같은 큐로 채우면 3일째부터
 * 지루해지므로(game-concept.md:113이 '하루/교대' 장르를 기각한 사유가 바로 콘텐츠 양 부담),
 * 종류 배열만 손으로 짠다 — 라벨·대사는 kind별 풀에서 등장 순번으로 파생시켜 콘텐츠를 늘리지 않는다.
 *
 * 배치 원칙: (1) 모든 날에 STEMI가 있다 — 필수의료를 외면할 기회가 매일 온다.
 * (2) 뒤로 갈수록 STEMI가 는다 — 자리를 미용으로 채우던 습관의 대가가 커진다.
 * (3) 자리 3 < 5통이라 어느 날이든 2통은 못 받는다.
 */
const DAY_PLANS: CallKind[][] = [
  ['COSMETIC_WALKIN', 'STEMI', 'COSMETIC_WALKIN', 'GENERAL_EMERGENCY', 'STEMI'], // 월 — 기존 리듬
  ['COSMETIC_WALKIN', 'COSMETIC_WALKIN', 'GENERAL_EMERGENCY', 'STEMI', 'COSMETIC_WALKIN'], // 화
  ['STEMI', 'COSMETIC_WALKIN', 'GENERAL_EMERGENCY', 'COSMETIC_WALKIN', 'STEMI'], // 수
  ['COSMETIC_WALKIN', 'GENERAL_EMERGENCY', 'STEMI', 'COSMETIC_WALKIN', 'STEMI'], // 목
  ['STEMI', 'STEMI', 'COSMETIC_WALKIN', 'GENERAL_EMERGENCY', 'COSMETIC_WALKIN'], // 금
  ['COSMETIC_WALKIN', 'STEMI', 'GENERAL_EMERGENCY', 'STEMI', 'COSMETIC_WALKIN'], // 토
  ['STEMI', 'COSMETIC_WALKIN', 'STEMI', 'GENERAL_EMERGENCY', 'STEMI'], // 일 — 그날 밤 응급으로 이어진다
]

/** 요일 라벨 — 달력 칸과 콜 화면이 공유한다. */
export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

/** kind별 상황 라벨 풀. 같은 kind가 하루에 여러 번 오면 등장 순번으로 고른다(callerPleaAt과 같은 규칙). */
const CALL_LABELS: Record<CallKind, string[]> = {
  COSMETIC_WALKIN: ['보톡스 상담 워크인', '검진 패키지 문의'],
  GENERAL_EMERGENCY: ['복통 응급 — 병상 요청', '고열 응급 — 입원 문의'],
  STEMI: ['급성심근경색 — 타 병원 전원 요청', '급성심근경색 — 재이송'],
}

const PATIENT_OF: Record<CallKind, Patient> = {
  COSMETIC_WALKIN: walkinPatient,
  GENERAL_EMERGENCY: generalPatient,
  STEMI: stemiPatient,
}

/**
 * 그날의 고정 5통 콜 큐 — 결정론(같은 day는 항상 같은 큐).
 * 라벨은 kind 내 등장 순번으로 고른다 — callerPleaAt(dialogue.ts)의 seed 규칙과 같아야 라벨↔대사가 맞는다(PR #29).
 */
export function createCallQueue(day = 1): IncomingCall[] {
  const plan = DAY_PLANS[(day - 1) % DAY_PLANS.length]
  const seen: Partial<Record<CallKind, number>> = {}
  return plan.map((kind, i) => {
    const occurrence = seen[kind] ?? 0
    seen[kind] = occurrence + 1
    const pool = CALL_LABELS[kind]
    return {
      id: `d${day}c${i + 1}`, // 날짜별 고유 — 로그·React key 충돌 방지
      kind,
      label: pool[occurrence % pool.length],
      patient: PATIENT_OF[kind],
      lawsuitRisk: kind === 'STEMI',
    }
  })
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

/** 하루 진행률(0~1) — 처리한 콜 수 / 전체. 빈 큐(콜 없음)는 하루 완료로 보아 1. */
export function dayProgress(state: ReceivingState): number {
  if (state.queue.length === 0) return 1
  return state.index / state.queue.length
}

/**
 * 부문 손익 — 구조 손익의 **오늘치(주간 손익 ÷ 7)**를 하루 진행률만큼 누적한 값.
 *
 * economics.segments는 이번 주 7일 전체 손익이라(types.ts), 하루엔 그 1/7만 벌고 잃는다.
 * 콜 시작(index 0)엔 전 부문 0에서 출발해, 콜을 처리할수록 오늘 몫을 향해 자라고 하루 끝에 도달한다
 * — "진료를 볼수록 흑자/적자" 직관과 일치(정적 선반영이 진료 0인 t=0부터 전액을 찍던 걸 PR #33에서 교정).
 *
 * 7일을 다 채우면 (주간/7) × 7 = 주간 전액이라 결말 장부(composeLedger, 전액)와 어긋나지 않는다 —
 * 이 등식이 '달력 숫자 ≠ 결말 장부' 이원화를 막는 유일한 이음매다(설계 §4-1).
 */
export function accruedSegments(state: ReceivingState): { label: string; profitBillions: number }[] {
  const p = dayProgress(state)
  const segments = state.hospital.economics?.segments ?? []
  return segments.map((s) => ({
    label: s.label,
    profitBillions: Math.round((s.profitBillions / DAYS_PER_WEEK) * p),
  }))
}

/**
 * 오늘 순이익(부문 손익 오늘치 + 오늘 진료 수익 델타) — 소송 비용은 제외.
 * 소송 비용은 결말 buildSessionLedger에서만 차감된다(해석 0 원칙: 1막은 명랑한 숫자만).
 */
export function runningNetProfit(state: ReceivingState): number {
  const segmentTotal = accruedSegments(state).reduce((sum, s) => sum + s.profitBillions, 0)
  return segmentTotal + state.netProfitDeltaBillions
}
