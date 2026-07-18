import type { CallKind, Hospital, IncomingCall, Patient, RejectionReason } from './types'
import { adjudicateTransfer } from './adjudicate'
import { DAYS_PER_WEEK } from './setup'

// 1막 콜 큐 — 받는 병원. 기존 adjudicateTransfer를 플레이어 손으로 돌린다(벽의 양쪽).
// 순수·결정론·불변. 다크코미디는 대사(dialogue.ts)와 UI가, 여기선 숫자만.
// 시간 단위 = 하루. 한 ReceivingState = 하루치 콜 큐이고, 한 판은 7일(DAYS_PER_WEEK)이다.

/** 이 콜의 가격을 누가 정하는가. 급여(GOVERNMENT)는 정부 고시가를 받고, 비급여(HOSPITAL)는 병원이 자율 결정한다. */
export type PriceSetter = 'HOSPITAL' | 'GOVERNMENT'

/** 콜 한 통의 수가/원가 내역(억). 델타 = 수익 − 원가. */
export interface CallEconomics {
  priceSetter: PriceSetter
  revenueBillions: number
  costBillions: number
}

/**
 * 콜당 수가/원가 — **가격을 누가 정하는가**가 부호를 가른다.
 *
 * 비급여(미용)는 상대가치점수·환산지수가 적용되지 않아 병원이 가격을 자율 결정한다 → 원가를 넘겨 받는다.
 * 급여는 정부 고시가라 원가보전율이 곧 부호다. 그래서 **수익/원가 비율이 근거이고 금액은 각색**이다:
 *   - 일반 응급 3/6  ≈ 50%  — 기본진료 50.5% / 응급의료수가 45.0%
 *   - STEMI    11/13 ≈ 85%  — 수술·처치 84.9% (원가 미만이되 기본진료보다 덜 밑진다)
 *   - 미용      6/3  = 200% — 가격 규제 없음
 * 근거: fee-schedule-and-subsidies.md §2 (**행위 단위**).
 *
 * 🔴 **부호는 행위 단위 표 하나에서만 뽑는다.** 과 단위 수치(심장내과 117%·응급의학과 103%)를
 * 여기 섞으면 정반대 부호가 나온다 — 콜 델타는 "행위 1건"이라 단위가 다르다(T-039).
 * 과 단위 흑자는 입력이 아니라 플레이어가 검사를 붙였을 때 **장부에서 창발**해야 한다(F2, 검체 160.5%).
 *
 * ⚠️ 스케일 주의 — 한 판이 콜 35통(7일 × 5)이라 이 값들이 누적된다. 콜 델타 합이 부문 손익(주간 전액)을
 * 압도하면 구조 손익이 무의미해진다(PR #35 양심 루트 −525억). 불변식 I8(|순이익| ≤ 4 × 예산)은
 * 테스트로 안 잡히고 **브라우저 7일 완주로만** 잡힌다.
 */
export const CALL_ECONOMICS: Record<CallKind, CallEconomics> = {
  COSMETIC_WALKIN: { priceSetter: 'HOSPITAL', revenueBillions: 6, costBillions: 3 },
  GENERAL_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueBillions: 3, costBillions: 6 },
  STEMI: { priceSetter: 'GOVERNMENT', revenueBillions: 11, costBillions: 13 },
}

/** 콜 한 통 수용으로 누적되는 손익 델타(억). */
export function callDelta(kind: CallKind): number {
  const e = CALL_ECONOMICS[kind]
  return e.revenueBillions - e.costBillions
}

/**
 * 검사 한 건 — **유일하게 원가를 넘겨 받는 급여 항목**(검체 160.5% / 영상 144.3%).
 *
 * 급여 진료는 전부 원가 미달인데(기본진료 50.5%·응급 45.0%·수술 84.9%) 검사만 160%다.
 * 이 비대칭이 §2.6의 척추다 — **응급의료 수가항목 45%인데 응급의학과 손익은 103%**, 그 차이가 검사다.
 * 그래서 과 단위 흑자(심장내과 117%·응급의학과 103%)는 이 게임에서 **입력이 아니라
 * 플레이어가 검사를 붙였을 때 장부에서 창발**한다.
 *
 * 대가는 boarding — 검사를 붙인 환자는 결과를 기다리며 자리를 점유하고, 그 자리는 **내일** 비워진다.
 */
export const WORKUP_ECONOMICS: CallEconomics = {
  priceSetter: 'GOVERNMENT',
  revenueBillions: 10,
  costBillions: 6, // 10/6 ≈ 166.7% — 검체 160.5% 밴드
}

/** 검사 한 건의 손익 델타(억). 급여 환자의 부호를 −에서 +로 뒤집는다(I2). */
export function workupDelta(): number {
  return WORKUP_ECONOMICS.revenueBillions - WORKUP_ECONOMICS.costBillions
}

/**
 * 이 콜에 검사를 붙일 수 있는가 — **급여 환자 전체**(일반 응급 + STEMI).
 *
 * 미용은 비급여라 애초에 가격을 병원이 정하니 메꿀 게 없다.
 * ⚠️ 초안은 일반 응급으로 한정했는데, 그 논거("STEMI는 시술 117%가 본체")가 **순환 논증**이었다 —
 * 117%의 흑자 출처 자체가 검사다. 한정하면 117%가 영원히 창발 못 하고 부호 위반이 남는다(T-039).
 */
export function canOrderWorkup(kind: CallKind): boolean {
  return CALL_ECONOMICS[kind].priceSetter === 'GOVERNMENT'
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
  /**
   * 오늘 검사 수익 — 진료 수익과 **별도로** 쌓는다.
   * 합쳐버리면 이 게임이 하려는 말이 사라진다: 진료 수익은 음수인데 검사 수익이 덮어서 순이익이 양수다.
   * 아무도 "과잉진료"라고 말하지 않는다 — 두 줄이 나란히 있을 뿐이다.
   */
  workupRevenueBillions: number
  /** 오늘 검사를 붙인 환자 수 — 내일 자리를 먹는다(boarding). */
  workupCount: number
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

/**
 * 이 인덱스부터 야간 콜 — 하루 5통 중 **마지막 2통**이 밤이다.
 *
 * 시간대를 DAY_PLANS 위치에서 파생시켜 **RNG 0**을 지킨다(같은 day는 항상 같은 큐).
 * 야간이 하는 일: 배후과 의사가 1명뿐이면 당직이 비어 못 받는다(roundTheClockBackup).
 * 금요일만 야간 STEMI가 없다 — 1명으로도 다 받는 날이 하루는 있어야 대비가 보인다.
 */
const NIGHT_SHIFT_FROM_INDEX = 3

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
      nightShift: i >= NIGHT_SHIFT_FROM_INDEX,
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
      if (!verdict.accepted) return verdict.reason ?? 'NO_BACKUP_CARE'
      // 배후과가 있어도 **밤엔 당직이 서 있어야** 받는다 — 의사 1명은 24시간을 못 버틴다(T-042).
      // 그래서 2번째 의사가 사는 건 처리량이 아니라 시간대다: 이 줄이 없으면 n≥2가 순수 함정이 된다.
      // 당직을 모델링하지 않는 병원(roundTheClockBackup 미지정)은 backupCare로 폴백 — 기존 동작 유지.
      const onCallNow = hospital.roundTheClockBackup ?? hospital.backupCare
      if (call.nightShift && !onCallNow.includes(call.patient.requiredSpecialty)) {
        return 'NO_NIGHT_BACKUP' // 과는 있는데 당직이 비었다 — NO_BACKUP_CARE와 다른 사유다
      }
      return null
    }
  }
}

/**
 * 하루 시작 — `boardedBeds`는 **어제 검사를 붙인 환자 수**다(기본 0).
 *
 * 이게 달력에 처음으로 의미를 준다: 지금까지 7일은 서로 독립이었다(매일 자리 리셋).
 * 검사가 자리를 이월시키면 **어제의 흑자가 오늘의 자리를 먹는다.**
 * 기본값 0인 선택적 인자라 이월을 안 쓰는 호출부(테스트 포함)는 기존 동작 그대로다.
 */
export function initReceiving(
  hospital: Hospital,
  queue: IncomingCall[] = createCallQueue(),
  boardedBeds = 0,
): ReceivingState {
  return {
    hospital,
    queue,
    index: 0,
    bedsFree: Math.max(0, hospital.beds - boardedBeds), // 어제 검사가 물고 있는 자리만큼 덜 시작한다
    netProfitDeltaBillions: 0,
    workupRevenueBillions: 0,
    workupCount: 0,
    lawsuitExposure: 0,
    log: [],
    done: queue.length === 0,
  }
}

/**
 * 현재 콜에 수용/거절을 정한다. 하드락 콜은 accept=true여도 수용되지 않는다(가드).
 *
 * `withWorkup` — 수용하면서 검사를 붙인다. 급여 환자에게만 유효하고(canOrderWorkup),
 * 실제로 수용된 경우에만 붙는다. 안 받은 환자를 검사할 수는 없다.
 */
export function decide(state: ReceivingState, accept: boolean, withWorkup = false): ReceivingState {
  if (state.done) {
    throw new Error('receiving already done')
  }
  const call = state.queue[state.index]
  const reason = hardlockReason(state.hospital, call, state.bedsFree)
  const disposition: CallDisposition = reason === null ? 'CHOICE' : 'HARDLOCK_REJECT'
  const effectiveAccept = disposition === 'CHOICE' && accept
  const effectiveWorkup = effectiveAccept && withWorkup && canOrderWorkup(call.kind)

  // 수용한 환자만 자리를 먹는다 — 거절·하드락은 자리를 소모하지 않는다.
  const bedsFree = effectiveAccept ? state.bedsFree - 1 : state.bedsFree
  const netProfitDeltaBillions = effectiveAccept
    ? state.netProfitDeltaBillions + callDelta(call.kind)
    : state.netProfitDeltaBillions
  // 검사 수익은 진료 수익과 섞지 않는다 — 덮는 게 뭔지 장부에서 보여야 한다.
  const workupRevenueBillions = effectiveWorkup
    ? state.workupRevenueBillions + workupDelta()
    : state.workupRevenueBillions
  const workupCount = effectiveWorkup ? state.workupCount + 1 : state.workupCount
  const lawsuitExposure = effectiveAccept && call.lawsuitRisk ? state.lawsuitExposure + 1 : state.lawsuitExposure

  const log = [...state.log, { callId: call.id, accepted: effectiveAccept, disposition, reason }]
  const index = state.index + 1
  return {
    ...state,
    bedsFree,
    netProfitDeltaBillions,
    workupRevenueBillions,
    workupCount,
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
 * 오늘 순이익(부문 손익 오늘치 + 오늘 진료 수익 + 오늘 검사 수익) — 소송 비용은 제외.
 * 소송 비용은 결말 buildSessionLedger에서만 차감된다(해석 0 원칙: 1막은 명랑한 숫자만).
 */
export function runningNetProfit(state: ReceivingState): number {
  const segmentTotal = accruedSegments(state).reduce((sum, s) => sum + s.profitBillions, 0)
  return segmentTotal + state.netProfitDeltaBillions + state.workupRevenueBillions
}
