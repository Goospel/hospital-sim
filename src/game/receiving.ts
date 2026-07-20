import type { CallKind, Doctor, Hospital, IncomingCall, Patient, RejectionReason, Specialty } from './types'
import { adjudicateTransfer } from './adjudicate'
import { handlingDept } from './doctor'
import { DAYS_PER_WEEK, DEPARTMENTS } from './setup'
import {
  arrivalMinFor, DAY_LENGTH_MIN, freeDoctorsOfDept, NIGHT_START_MIN, pickAssignee, procedureDurationMin,
} from './daysim'

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
  // 네 필수 응급은 모두 **수술·처치 84.9% 밴드**(행위 단위)라 동형이다(11/13 ≈ 85%).
  // 🔴 과별 차등(산부 61%·소청 79% 등 과 단위)은 여기 섞지 않는다(T-039) — "산부가 더 밑진다"는
  // 재정중립 패키지가 만든 DEPARTMENTS 층(산부 −16)이 담당하지, 콜 델타(행위 단위)가 아니다.
  STEMI: { priceSetter: 'GOVERNMENT', revenueBillions: 11, costBillions: 13 },
  OBSTETRIC_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueBillions: 11, costBillions: 13 },
  NEURO_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueBillions: 11, costBillions: 13 },
  TRAUMA_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueBillions: 11, costBillions: 13 },
  // 배후과 예약진료 — 검사 흑자 밴드 계승(10/6 ≈ 167% — 검체 160% 밴드). 그 과 의사가 응급 대신
  // 예약을 도는 이유가 곧 이 흑자다(점유 판정 자체는 Task 5).
  SPECIALIST_ELECTIVE: { priceSetter: 'GOVERNMENT', revenueBillions: 10, costBillions: 6 },
}

/**
 * 배후진료(최종치료)가 필요한 필수 응급 4종 — 각자 requiredSpecialty로 그 과를 요구하고,
 * 없으면 adjudicateTransfer가 제네릭으로 NO_BACKUP_CARE를 건다(판정 로직 무변경).
 * 이 목록이 곧 "lawsuitRisk가 붙는 콜"이자 "못 받으면 신문이 되는 콜"이다 — 세 개념이 같은 집합.
 */
export const CRITICAL_EMERGENCY_KINDS: CallKind[] = [
  'STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY',
]

/** 배후과를 요구하는 필수 응급인가 — 하드락(배후/야간)·소송·신문 대상 판별의 단일 출처. */
export function isCriticalEmergency(kind: CallKind): boolean {
  return CRITICAL_EMERGENCY_KINDS.includes(kind)
}

/** 선택진료(플레이어가 받을지 정하는 콜) — 미용·검진 워크인 + 배후과 예약. 응급이 아니다. */
export function isElective(kind: CallKind): boolean {
  return kind === 'COSMETIC_WALKIN' || kind === 'SPECIALIST_ELECTIVE'
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
   * 하루 시각(분, 0..DAY_LENGTH_MIN) — 현재 콜 처리 지점. decide가 콜의 arrivalMin으로 전진시킨다.
   * 벽이 병상(총량)에서 **전문의 점유(시간)**로 바뀌면서, 하루 진행률의 축도 '처리한 콜 수'가 아니라
   * '시각'이 된다(dayProgress = clockMin / DAY_LENGTH_MIN).
   */
  clockMin: number
  /**
   * 유닛별 점유 종료 시각(분) — busyUntil[doctorId] ≤ 현재 시각이면 그 의사는 자유.
   * 이게 능력의 한계를 담는 동적 값이다: 병상 총량이 아니라 **누가 언제까지 바쁜가**.
   * 초기값은 어제 넘어온 점유(boardedBusyUntil) — session.ts의 advanceDay가 어제 마감 초과분을 계산해 넘긴다.
   */
  busyUntil: Record<string, number>
  netProfitDeltaBillions: number
  /**
   * 오늘 검사 수익 — 진료 수익과 **별도로** 쌓는 장부 라인.
   * ⚠️ Task 5에서 플레이어의 검사 액션(withWorkup)이 제거돼 **항상 0**이다(검사 흑자는 SPECIALIST_ELECTIVE가 계승).
   * 필드를 남기는 건 DayRecord·UI 장부 파급을 막기 위함 — 완전 제거는 후속.
   */
  workupRevenueBillions: number
  /** 오늘 검사를 붙인 환자 수 — Task 5에서 검사 액션 제거로 **항상 0**(boarding 이월은 Task 6). */
  workupCount: number
  lawsuitExposure: number
  /** reason = 하드락 사유(못 받은 이유). 받았거나 내가 거절한 콜은 null — 구조가 막은 것만 사유가 남는다. */
  log: { callId: string; accepted: boolean; disposition: CallDisposition; reason: RejectionReason | null }[]
  done: boolean
}

// 필수 응급 4종 — 각자 배후과를 requiredSpecialty로 요구한다(adjudicateTransfer가 제네릭으로 판정).
const stemiPatient: Patient = { id: 'call-stemi', requiredSpecialty: 'CARDIOLOGY', severity: 5 }
const obstetricPatient: Patient = { id: 'call-ob', requiredSpecialty: 'OBSTETRICS', severity: 5 }
const neuroPatient: Patient = { id: 'call-neuro', requiredSpecialty: 'NEUROSURGERY', severity: 5 }
const traumaPatient: Patient = { id: 'call-trauma', requiredSpecialty: 'GENERAL_SURGERY', severity: 5 }
const generalPatient: Patient = { id: 'call-general', requiredSpecialty: 'GENERAL_SURGERY', severity: 3 }
const walkinPatient: Patient = { id: 'call-walkin', requiredSpecialty: 'CARDIOLOGY', severity: 1 } // 명목값(판정 안 함)

/** 요일별 콜 한 통 — SPECIALIST_ELECTIVE만 dept로 대상 배후과를 정한다(그 외는 PATIENT_OF 고정). */
interface CallPlanEntry {
  kind: CallKind
  dept?: Specialty
}

/**
 * 요일별 콜 구성 — 하루 5통 고정(응급·워크인 자리 하나를 배후과 예약으로 바꿔친다), 콜 종류만 날마다 다르다.
 *
 * 결정론 유지가 이 게임의 원칙이라 RNG를 쓰지 않는다. 그렇다고 7일을 같은 큐로 채우면 3일째부터
 * 지루해지므로(game-concept.md:113이 '하루/교대' 장르를 기각한 사유가 바로 콘텐츠 양 부담),
 * 종류 배열만 손으로 짠다 — 라벨·대사는 kind별 풀에서 등장 순번으로 파생시켜 콘텐츠를 늘리지 않는다.
 *
 * 배치 원칙: (1) 모든 날에 필수 응급이 있다 — 외면할 기회가 매일 온다(STEMI 전용 아님, 4종 분산).
 * (2) 뒤로 갈수록 필수 응급이 는다 — 자리를 미용으로 채우던 습관의 대가가 커진다.
 * (3) 자리 3 < 5통이라 어느 날이든 못 받는다. 한 병원이 4개 배후과를 다 못 갖춰 어느 과든 하드락이 난다.
 * (4) 월요일은 기존 리듬(필수=STEMI 위주)을 대체로 보존한다 — 첫날은 익숙하게, 다양성은 화요일부터 번진다.
 * (5) SPECIALIST_ELECTIVE를 날마다 한 통, **그날 이미 오는 필수 응급과 같은 dept**로 배치한다 —
 * 그 과 의사가 예약을 도는 동안 같은 날 같은 과 응급이 오면 실제로 점유가 경쟁한다(판정 자체는 Task 5).
 * 비필수(워크인/일반응급) 자리를 우선 바꿔치고, 그런 자리가 없는 날만(월·일) 중복된 필수 응급 한 통을 바꾼다
 * — 그래도 날마다 필수 응급 ≥1은 유지된다(원칙 1이 원칙 5보다 우선).
 *
 * 시간대(야간)는 더 이상 이 배열의 위치가 아니라 arrivalMin(도착순 정렬 후 시각)에서 파생된다 —
 * createCallQueue가 각 콜에 daysim seed로 도착시각·소요시간을 매기고 도착순으로 재정렬한다.
 * count=5 슬롯에선 산수가 정직하다: 슬롯 폭 120분에 NIGHT_START_MIN=480이 걸쳐, 항상 **마지막 1통만** 야간이다.
 */
const DAY_PLANS: CallPlanEntry[][] = [
  [{ kind: 'COSMETIC_WALKIN' }, { kind: 'SPECIALIST_ELECTIVE', dept: 'CARDIOLOGY' }, { kind: 'COSMETIC_WALKIN' },
   { kind: 'GENERAL_EMERGENCY' }, { kind: 'STEMI' }], // 월 — STEMI 한 자리를 순환기 예약으로(점유 경쟁), 야간 STEMI
  [{ kind: 'COSMETIC_WALKIN' }, { kind: 'SPECIALIST_ELECTIVE', dept: 'NEUROSURGERY' }, { kind: 'NEURO_EMERGENCY' },
   { kind: 'COSMETIC_WALKIN' }, { kind: 'STEMI' }], // 화 — 뇌출혈 등장, 신경외과 예약이 경쟁
  [{ kind: 'STEMI' }, { kind: 'COSMETIC_WALKIN' }, { kind: 'OBSTETRIC_EMERGENCY' },
   { kind: 'SPECIALIST_ELECTIVE', dept: 'OBSTETRICS' }, { kind: 'NEURO_EMERGENCY' }], // 수 — 산부 등장, 산부 예약이 경쟁, 주간 STEMI
  [{ kind: 'SPECIALIST_ELECTIVE', dept: 'GENERAL_SURGERY' }, { kind: 'TRAUMA_EMERGENCY' }, { kind: 'STEMI' },
   { kind: 'GENERAL_EMERGENCY' }, { kind: 'OBSTETRIC_EMERGENCY' }], // 목 — 중증외상 등장, 외과 예약이 경쟁
  [{ kind: 'STEMI' }, { kind: 'OBSTETRIC_EMERGENCY' }, { kind: 'NEURO_EMERGENCY' }, { kind: 'TRAUMA_EMERGENCY' },
   { kind: 'SPECIALIST_ELECTIVE', dept: 'CARDIOLOGY' }], // 금 — 낮에 4과 동시 붕괴, 순환기 예약이 야간에 경쟁
  [{ kind: 'STEMI' }, { kind: 'NEURO_EMERGENCY' }, { kind: 'SPECIALIST_ELECTIVE', dept: 'NEUROSURGERY' },
   { kind: 'OBSTETRIC_EMERGENCY' }, { kind: 'TRAUMA_EMERGENCY' }], // 토
  [{ kind: 'STEMI' }, { kind: 'TRAUMA_EMERGENCY' }, { kind: 'NEURO_EMERGENCY' }, { kind: 'OBSTETRIC_EMERGENCY' },
   { kind: 'SPECIALIST_ELECTIVE', dept: 'OBSTETRICS' }], // 일 — 중복 STEMI 한 자리를 산부 예약으로
]

/** 요일 라벨 — 달력 칸과 콜 화면이 공유한다. */
export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

/**
 * kind별 상황 라벨 풀. 같은 kind가 하루에 여러 번 오면 등장 순번으로 고른다(callerPleaAt과 같은 규칙).
 * SPECIALIST_ELECTIVE는 여기 없다 — 과마다 대상이 달라 고정 풀로 못 쓰고 electiveLabel로 파생한다.
 */
const CALL_LABELS: Record<Exclude<CallKind, 'SPECIALIST_ELECTIVE'>, string[]> = {
  COSMETIC_WALKIN: ['보톡스 상담 워크인', '검진 패키지 문의'],
  GENERAL_EMERGENCY: ['복통 응급 — 병상 요청', '고열 응급 — 입원 문의'],
  STEMI: ['급성심근경색 — 타 병원 전원 요청', '급성심근경색 — 재이송'],
  OBSTETRIC_EMERGENCY: ['분만 응급 — 산부인과 전원 요청', '분만 중 출혈 — 재이송'],
  NEURO_EMERGENCY: ['뇌출혈 의심 — 신경외과 전원 요청', '뇌졸중 — 재이송'],
  TRAUMA_EMERGENCY: ['중증외상 — 외과 전원 요청', '다발성 외상 — 재이송'],
}

/** SPECIALIST_ELECTIVE 라벨 — DEPARTMENTS.label에서 파생(단일 출처라 과 오표기가 구조적으로 불가능). */
function electiveLabel(dept: Specialty): string {
  return `${DEPARTMENTS.find((d) => d.key === dept)?.label ?? dept} 예약 진료`
}

// 배후과 예약진료의 명목 환자 — requiredSpecialty가 doctorCaseloads·점유 판정에 그 과를 실어야
// handlingDept가 그 과로 라우팅돼 응급과 같은 의사를 두고 경쟁한다(DAY_PLANS의 dept로 정해짐).
const electivePatient: Patient = { id: 'call-elective', requiredSpecialty: 'CARDIOLOGY', severity: 1 } // dept 미지정 시 폴백

/** SPECIALIST_ELECTIVE 예약의 실제 대상 과 — DAY_PLANS 엔트리의 dept를 patient.requiredSpecialty로 싣는다. */
function electivePatientFor(dept: Specialty): Patient {
  return { id: 'call-elective', requiredSpecialty: dept, severity: 1 }
}

const PATIENT_OF: Record<CallKind, Patient> = {
  COSMETIC_WALKIN: walkinPatient,
  GENERAL_EMERGENCY: generalPatient,
  STEMI: stemiPatient,
  OBSTETRIC_EMERGENCY: obstetricPatient,
  NEURO_EMERGENCY: neuroPatient,
  TRAUMA_EMERGENCY: traumaPatient,
  SPECIALIST_ELECTIVE: electivePatient,
}

/**
 * 그날의 콜 큐 — 결정론(같은 day는 항상 같은 큐), 도착순 정렬.
 *
 * DAY_PLANS 순서대로 id·라벨·patient를 부여한 뒤(원래 인덱스 기반이라 결정론·고유성이 유지된다),
 * daysim의 seed 원시함수로 arrivalMin·durationMin을 매기고 **마지막에** 도착시각 오름차순으로 정렬한다.
 * nightShift는 위치가 아니라 arrivalMin(≥ NIGHT_START_MIN)에서 파생 — 정렬해도 시간대는 안 흔들린다.
 *
 * week는 1로 고정한다(createCallQueue는 단일 인자 유지 — session.ts weekDayQueue가 이미 전역일을
 * day로 넘기므로 이 함수 시그니처를 바꾸면 그쪽이 깨진다. week 축은 Task 6 몫).
 * 라벨은 kind 내 등장 순번으로 고른다 — callerPleaAt(dialogue.ts)의 seed 규칙과 같아야 라벨↔대사가 맞는다(PR #29).
 */
export function createCallQueue(day = 1): IncomingCall[] {
  const plan = DAY_PLANS[(day - 1) % DAY_PLANS.length]
  const seen: Partial<Record<CallKind, number>> = {}
  const timed = plan.map(({ kind, dept }, i) => {
    const occurrence = seen[kind] ?? 0
    seen[kind] = occurrence + 1
    const arrivalMin = arrivalMinFor(1, day, i, plan.length)
    return {
      id: `d${day}c${i + 1}`, // 원래 plan 인덱스 기반 — 날짜별 고유, 정렬 위치와 무관(로그·React key 충돌 방지)
      kind,
      label: kind === 'SPECIALIST_ELECTIVE'
        ? electiveLabel(dept ?? 'CARDIOLOGY')
        : CALL_LABELS[kind][occurrence % CALL_LABELS[kind].length],
      patient: kind === 'SPECIALIST_ELECTIVE' ? electivePatientFor(dept ?? 'CARDIOLOGY') : PATIENT_OF[kind],
      lawsuitRisk: isCriticalEmergency(kind), // 필수 응급 4종 = 고위험(소송 노출), 일반응급·워크인은 아님
      nightShift: arrivalMin >= NIGHT_START_MIN,
      arrivalMin,
      durationMin: procedureDurationMin(kind, 1, day, i),
    }
  })
  return timed.sort((a, b) => a.arrivalMin - b.arrivalMin)
}

/**
 * 이 콜을 못 받는 **구조적** 사유 — 받을 수 있으면 null.
 *
 * 벽이 병상(총량)에서 **전문의 점유(시간)**로 바뀌었다. 게이트 우선순위(필수 응급):
 *   1) 응급실 당직·과밀·배후 → adjudicateTransfer (NO_ER_ONCALL / ER_OVERCROWDED / NO_BACKUP_CARE)
 *   2) 야간 당직 공백        → NO_NIGHT_BACKUP  (과는 있는데 밤엔 당직이 빈다, T-042)
 *   3) 그 과 의사가 다 진료 중 → NO_FREE_SPECIALIST (평일 배후 공백의 형상화 — 예약이 응급을 밀어낸다)
 *
 * 선택진료(미용·배후과 예약)는 하드락이 없다(null) — 자유 의사가 없으면 decide가 '못 받음'으로 처리하지
 * 구조가 막는 게 아니다. busyUntil·roster는 3)의 점유 판정에 쓴다.
 */
export function hardlockReason(
  hospital: Hospital,
  call: IncomingCall,
  busyUntil: Record<string, number>,
  roster: Doctor[],
): RejectionReason | null {
  switch (call.kind) {
    case 'COSMETIC_WALKIN':
    case 'SPECIALIST_ELECTIVE':
      return null // 선택진료 — 하드락 없음(자유 의사 유무는 decide가 판단)
    case 'GENERAL_EMERGENCY':
      // 응급실 당직·과밀만 보면 된다(배후 무관, 저마진). 담당 전문의가 없어도 받는다.
      if (!hospital.hasErOnCall) return 'NO_ER_ONCALL'
      if (hospital.overcrowded) return 'ER_OVERCROWDED'
      return null
    // 필수 응급 4종은 배후과(최종치료) 게이트를 **공유**한다 — adjudicateTransfer가
    // call.patient.requiredSpecialty로 제네릭 판정하므로 종류별 분기가 필요 없다(다양화의 핵심).
    case 'STEMI':
    case 'OBSTETRIC_EMERGENCY':
    case 'NEURO_EMERGENCY':
    case 'TRAUMA_EMERGENCY': {
      const verdict = adjudicateTransfer(hospital, call.patient)
      if (!verdict.accepted) return verdict.reason ?? 'NO_BACKUP_CARE'
      // 배후과가 있어도 **밤엔 당직이 서 있어야** 받는다 — 의사 1명은 24시간을 못 버틴다(T-042).
      // 그래서 2번째 의사가 사는 건 처리량이 아니라 시간대다: 이 줄이 없으면 n≥2가 순수 함정이 된다.
      // 당직을 모델링하지 않는 병원(roundTheClockBackup 미지정)은 backupCare로 폴백 — 기존 동작 유지.
      const onCallNow = hospital.roundTheClockBackup ?? hospital.backupCare
      if (call.nightShift && !onCallNow.includes(call.patient.requiredSpecialty)) {
        return 'NO_NIGHT_BACKUP' // 과는 있는데 당직이 비었다 — NO_BACKUP_CARE와 다른 사유다
      }
      // 과·당직이 있어도 그 과 의사가 지금(도착 시각) 다 진료 중이면 못 받는다 — 점유 벽.
      if (freeDoctorsOfDept(roster, busyUntil, handlingDept(call), call.arrivalMin ?? 0).length === 0) {
        return 'NO_FREE_SPECIALIST'
      }
      return null
    }
  }
}

/**
 * 하루 시작 — `boardedBusyUntil`은 **어제 넘어온 유닛별 점유 종료 시각**이다(기본 빈 맵).
 *
 * 병상 총량이 아니라 시각 기반 점유가 능력의 한계를 담는다: 어제 늦게까지 점유된 유닛은 오늘 아침에도
 * 아직 바쁠 수 있다(boarding의 시간 버전). 이월 계산은 session.ts의 advanceDay가 한다(마감 초과분만 이월).
 * 기본값이 빈 맵인 선택적 인자라 이월을 안 쓰는 호출부(개원 첫날·새 주 1일차·테스트)는 하루를 전 유닛 자유로 연다.
 */
export function initReceiving(
  hospital: Hospital,
  queue: IncomingCall[] = createCallQueue(),
  boardedBusyUntil: Record<string, number> = {},
): ReceivingState {
  return {
    hospital,
    queue,
    index: 0,
    clockMin: 0,
    busyUntil: { ...boardedBusyUntil }, // 어제 넘어온 점유에서 출발(지금은 빈 맵)
    netProfitDeltaBillions: 0,
    workupRevenueBillions: 0,
    workupCount: 0,
    lawsuitExposure: 0,
    log: [],
    done: queue.length === 0,
  }
}

/**
 * 현재 콜을 처리한다 — **응급은 자동 판정, 선택진료만 플레이어가 결정**한다.
 *
 * - 응급(일반·필수 4종): `accept`를 무시하고 자동으로 판정한다. 구조적 하드락(hardlockReason)이 없으면
 *   수용, 있으면 turnedAway. "아무리 애원해도, 아무리 거절하려 해도" 결과는 병원의 제약이 정한다.
 * - 선택진료(미용·배후과 예약): `accept && 그 과 자유 의사 있음`일 때만 수용. accept=false거나 담당
 *   의사가 다 바쁘면 미수용(하드락이 아니라 '못 받음' — 사유 없음).
 *
 * 수용하면 담당 의사(handlingDept)를 `arrivalMin + durationMin`까지 점유한다. 담당 과에 자유 의사가
 * 없어도 받는 콜(일반 응급 — 배후 무관)은 아무도 점유하지 않는다(pickAssignee는 자유 의사가 있을 때만).
 */
export function decide(state: ReceivingState, accept: boolean): ReceivingState {
  if (state.done) {
    throw new Error('receiving already done')
  }
  const call = state.queue[state.index]
  const roster = state.hospital.roster ?? []
  const reason = hardlockReason(state.hospital, call, state.busyUntil, roster)
  const disposition: CallDisposition = reason === null ? 'CHOICE' : 'HARDLOCK_REJECT'

  const arrivalMin = call.arrivalMin ?? 0
  const free = freeDoctorsOfDept(roster, state.busyUntil, handlingDept(call), arrivalMin)

  // 응급은 accept 무관 자동(하드락이 없으면 수용). 선택진료는 accept + 그 과 자유 의사가 있어야 수용.
  const effectiveAccept = disposition === 'CHOICE' && (isElective(call.kind) ? accept && free.length > 0 : true)

  // 수용한 콜은 담당 의사를 점유한다 — 자유 의사가 없거나(일반 응급 배후 미보유) 일반 응급 자체(설계 A:
  // 특정 배후과를 요구하지 않는 ER 당직 범주라 어떤 의사도 잡지 않는다)면 아무도 점유하지 않는다(가드).
  let busyUntil = state.busyUntil
  if (effectiveAccept && free.length > 0 && call.kind !== 'GENERAL_EMERGENCY') {
    const assignee = pickAssignee(free, state.busyUntil)
    busyUntil = { ...state.busyUntil, [assignee.id]: arrivalMin + (call.durationMin ?? 0) }
  }

  const netProfitDeltaBillions = effectiveAccept
    ? state.netProfitDeltaBillions + callDelta(call.kind)
    : state.netProfitDeltaBillions
  const lawsuitExposure = effectiveAccept && call.lawsuitRisk ? state.lawsuitExposure + 1 : state.lawsuitExposure

  const log = [...state.log, { callId: call.id, accepted: effectiveAccept, disposition, reason }]
  const index = state.index + 1
  return {
    ...state,
    clockMin: arrivalMin, // 현재 콜 도착 시각으로 하루를 전진시킨다
    busyUntil,
    netProfitDeltaBillions,
    lawsuitExposure,
    log,
    index,
    done: index >= state.queue.length,
  }
}

/**
 * 하루 진행률(0~1) — **시각 기반**(clockMin / DAY_LENGTH_MIN).
 *
 * 하루 완료(done)나 빈 큐는 1로 고정한다 — 이게 "7일치 부문 손익 오늘치 합 = 주간 전액" 등식을 지킨다
 * (accruedSegments가 이 값을 곱한다). 마지막 콜의 도착 시각은 DAY_LENGTH_MIN보다 이르지만, 하루가
 * 끝나면 그날 몫(주간/7)을 온전히 벌었다고 본다 — 그 앞의 진행 중 값만 시각에 비례한다.
 */
export function dayProgress(state: ReceivingState): number {
  if (state.done || state.queue.length === 0) return 1
  return Math.min(1, Math.max(0, state.clockMin / DAY_LENGTH_MIN))
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
