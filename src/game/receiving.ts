import type { CallKind, Doctor, Hospital, IncomingCall, Patient, RejectionReason, Specialty } from './types'
import { adjudicateTransfer } from './adjudicate'
import { handlingDept } from './doctor'
import { DAYS_PER_WEEK, DEPARTMENTS, FIXED_BEDS } from './setup'
import {
  arrivalMinFor, DAY_LENGTH_MIN, earliestFreeMin, freeDoctorsOfDept, NIGHT_START_MIN, patienceMin,
  pickAssignee, procedureDurationMin,
} from './daysim'

// 1막 콜 큐 — 받는 병원. 기존 adjudicateTransfer를 플레이어 손으로 돌린다(벽의 양쪽).
// 순수·결정론·불변. 다크코미디는 대사(dialogue.ts)와 UI가, 여기선 숫자만.
// 시간 단위 = 하루. 한 ReceivingState = 하루치 콜 큐이고, 한 판은 7일(DAYS_PER_WEEK)이다.

/** 이 콜의 가격을 누가 정하는가. 급여(GOVERNMENT)는 정부 고시가를 받고, 비급여(HOSPITAL)는 병원이 자율 결정한다. */
export type PriceSetter = 'HOSPITAL' | 'GOVERNMENT'

/** 콜 한 통의 수가/원가 내역(만원). 델타 = 수익 − 원가. */
export interface CallEconomics {
  priceSetter: PriceSetter
  revenueManwon: number
  costManwon: number
}

/**
 * 콜당 수가/원가(만원) — **가격을 누가 정하는가**가 부호를 가른다. **이 게임의 유일한 수익원이다.**
 *
 * 비급여(미용)는 상대가치점수·환산지수가 적용되지 않아 병원이 가격을 자율 결정한다 → 원가를 넘겨 받는다.
 * 급여는 정부 고시가라 원가보전율이 곧 부호다. 그래서 **수익/원가 비율이 근거이고 금액은 각색**이다:
 *   - 미용 워크인    30/15    = 200%  — 가격 규제 없음(비급여)
 *   - 배후과 예약    26/16    ≈ 163%  — 검체검사 160.5%
 *   - 응급 수술 5종  850/1000 = 85%   — 수술·처치 84.9% (원가 미만이되 기본진료보다 덜 밑진다)
 *   - 고열·감염     190/380  = 50%   — 기본진료 50.5% / 응급의료수가 45.0%
 * 근거: fee-schedule-and-subsidies.md §2 (**행위 단위**).
 *
 * 🔴 **부호는 행위 단위 표 하나에서만 뽑는다.** 과 단위 수치(심장내과 117%·응급의학과 103%)를
 * 여기 섞으면 정반대 부호가 나온다 — 콜 델타는 "행위 1건"이라 단위가 다르다(T-039).
 * 과 단위 흑자는 입력이 아니라 **장부에서 창발**해야 한다(F2, 검체 160.5%).
 *
 * ## 만원 단위 — 수익 구조 재설계(2026-07-23)
 *
 * 옛 값은 억이었다: 보톡스 워크인 한 건 **1억**, 미용 의사 1명이 연 3,600억. 비율은 맞았지만
 * 절대액이 두세 자릿수 틀려 "각색"의 범위를 넘어 있었다(사용자 지적). 이제 진료 한 건의 값이
 * 진료비 영수증에서 볼 법한 숫자다 — 보톡스 30만원, 외래+검사 26만원, 응급 PCI 850만원,
 * 패혈증 의심 입원 190만원.
 *
 * 같은 작업에서 **부문 손익이 고정비로 뒤집히면서(setup.ts DEPARTMENTS) 이 표가 유일한 수익원이 됐다.**
 * 그래서 ⏸으로 0에 묶여 있던 워크인 델타가 +15로 되살아났다 — [T-069](../../claude-docs/troubleshooting/T-069.md)의
 * 이중 계상은 콜을 0으로 눌러서가 아니라 **부문 손익 쪽 수익을 없애서** 풀린다.
 *
 * ⚠️ 스케일 주의 — 이 값들은 콜마다 누적된다(하루 워크인 55건). 불변식 I8(|주간 순이익| ≤ 4 × 예산)을
 * `session.test.ts`의 `[I8]` 블록이 잡는다.
 *
 * 🔴 **응급 델타를 임의로 줄이지 않는다.** 실측(2026-07-23): 응급을 절반화했더니 양심 경로 결말이
 * −3에서 **+4로 뒤집혔다** — 비율(83%·50%)은 멀쩡했는데 *"양심적으로 하면 적자"*라는 이 게임의
 * 논지가 증발했다. `session.test.ts`의 '양심 경로' 테스트가 그 가드다.
 */
export const CALL_ECONOMICS: Record<CallKind, CallEconomics> = {
  /**
   * 미용·검진 워크인 — 비급여라 병원이 가격을 정한다(보톡스 30만원 / 재료·인건 원가 15만원).
   *
   * **미용과의 주간 흑자가 여기서 창발한다.** 부문 손익에 "미용 의사 1명 = 주 +70억"으로 박혀 있던
   * 그 흑자가 이제 없어서, 미용이 흑자인지 적자인지는 *하루에 몇 명을 실제로 봤는가*가 정한다.
   * 하루 55건이 오지만 받는 건 그 과 의사가 600분 안에 소화하는 만큼뿐이라 —
   * **채용이 곧 처리량이고, 처리량이 곧 흑자다.**
   */
  COSMETIC_WALKIN: { priceSetter: 'HOSPITAL', revenueManwon: 30, costManwon: 15 },
  // 응급 수술 5종은 모두 **수술·처치 84.9% 밴드**(행위 단위)라 동형이다(850/1000 = 85%).
  // 🔴 과별 차등(산부 61%·소청 79% 등 과 단위)은 여기 섞지 않는다(T-039) — "산부가 더 밑진다"는
  // 과별 고정비(DEPARTMENTS 층)가 담당하지, 콜 델타(행위 단위)가 아니다.
  STEMI: { priceSetter: 'GOVERNMENT', revenueManwon: 850, costManwon: 1000 },
  OBSTETRIC_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueManwon: 850, costManwon: 1000 },
  NEURO_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueManwon: 850, costManwon: 1000 },
  TRAUMA_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueManwon: 850, costManwon: 1000 },
  // 급성복증도 응급수술이라 같은 수술·처치 84.9% 밴드(STEMI 동형).
  ABDOMINAL_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueManwon: 850, costManwon: 1000 },
  /**
   * 고열·감염(내과 급여) — 기본진료 50.5%·응급 45% 밴드라 원가의 절반만 받는다(190/380).
   *
   * 🔴 **불변식 I3**: |STEMI −150| < |고열감염 −190|. "수술(84.9%)이 기본진료(50.5%)보다 원가보전율이
   * 높다"는 근거가 절대 손실의 대소로도 보여야 한다. 그런데 원가 기반이 반대로 기울어 있어서
   * (수술 1000 vs 입원 380) **비율만 맞추면 이 부등호가 조용히 뒤집힌다** — 두 축을 함께 보고 만져라.
   */
  MEDICAL_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueManwon: 190, costManwon: 380 },
  // 배후과 예약진료(외래 진찰 + 검사) — 검체 160.5% 밴드(26/16 ≈ 163%). 급여 항목 중 유일하게
  // 원가를 넘는다. 그 과 의사가 응급 대신 예약을 도는 이유가 곧 이 흑자다.
  SPECIALIST_ELECTIVE: { priceSetter: 'GOVERNMENT', revenueManwon: 26, costManwon: 16 },
}

/**
 * 배후진료(최종치료)를 요구하는 응급 — 각자 requiredSpecialty로 그 과를 요구하고,
 * 없으면 adjudicateTransfer가 제네릭으로 NO_BACKUP_CARE를 건다(판정 로직 무변경).
 * 배후 게이트(하드락)·아침 신문·받은/돌려보낸 응급 카운트의 단일 출처다.
 *
 * ⚠️ 과거엔 이 집합 하나(isCriticalEmergency)가 배후·소송·신문을 겸했으나, 복통 세분에서 소송 성격이
 * 갈려(고열감염=방어 성공 전형) 두 술어로 분리했다: 배후·신문은 이 집합, 소송은 LAWSUIT_RISK_KINDS.
 */
export const BACKUP_CARE_KINDS: CallKind[] = [
  'STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY', 'ABDOMINAL_EMERGENCY', 'MEDICAL_EMERGENCY',
]

/** 배후과(최종치료)를 요구하는 응급인가 — 배후 게이트·신문·응급 카운트 판별의 단일 출처. */
export function requiresBackupCare(kind: CallKind): boolean {
  return BACKUP_CARE_KINDS.includes(kind)
}

/**
 * 수용 시 소송 노출을 쌓는 응급 — 인과가 선명해 배상이 확정적인 계열만. requiresBackupCare의 부분집합.
 * (고열감염은 "초기 장염과 구별 불가"라 방어 성공이 전형이라 제외 — grounding §2.)
 */
export const LAWSUIT_RISK_KINDS: CallKind[] = [
  'STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY', 'ABDOMINAL_EMERGENCY',
]

/** 수용 시 소송 노출(lawsuitExposure)을 쌓는 응급인가. */
export function carriesLawsuitRisk(kind: CallKind): boolean {
  return LAWSUIT_RISK_KINDS.includes(kind)
}

/** 선택진료(플레이어가 받을지 정하는 콜) — 미용·검진 워크인 + 배후과 예약. 응급이 아니다. */
export function isElective(kind: CallKind): boolean {
  return kind === 'COSMETIC_WALKIN' || kind === 'SPECIALIST_ELECTIVE'
}

/**
 * 묻지 않고 자동으로 받는 콜 — 보톡스 상담·검진 패키지 같은 워크인.
 *
 * 이 콜들엔 애초에 결정이 없었다: 자유 의사가 있으면 병원은 언제나 받는다(원가의 200%다).
 * 매번 「받기/보내기」를 물어 그 자명한 답을 플레이어 손에 얹으면, 정작 선택인 것
 * (같은 의사를 두고 응급과 다투는 배후과 예약)과 구별이 안 된다.
 *
 * 그래서 **자동은 선택진료의 진부분집합**이다 — `SPECIALIST_ELECTIVE`는 남긴다.
 * 응급은 여기 들어올 일이 없다: decide가 accept를 무시하고 하드락만 보고 판정한다.
 *
 * 자원이 없으면 자동이라도 못 받는다 — decide의 `free.length > 0` 가드가 그대로 걸려
 * 미용 의사가 전부 진료 중이면 자동 접수도 거절로 기록된다(자동 ≠ 무한 수용).
 */
export function isAutoAccept(kind: CallKind): boolean {
  return kind === 'COSMETIC_WALKIN'
}

/**
 * 흐름을 멈추고 플레이어에게 물어야 하는 콜인가 — **배후과 예약진료 하나뿐**이다.
 *
 * 응급은 `decide`가 accept를 무시하고 구조로 판정하고(거절 버튼이 없다), 워크인은 자동 접수라
 * 물어볼 게 없다. 하루 5통 시절엔 그래도 콜마다 「계속」을 눌러 전개를 봤지만, 20~40통이 되면
 * 그 클릭이 곧 노동이 된다 — 결정이 있는 자리에서만 멈추고 나머지는 흐르게 한다.
 *
 * 화면(`useHospitalClock`의 흐름 목표 · `ReceivingPhase`의 자동 처리)이 이 술어 하나를 공유한다.
 * 두 곳에 각자 조건을 적으면 흐름이 멈추는 지점과 카드가 뜨는 지점이 어긋난다.
 */
export function needsDecision(call: IncomingCall): boolean {
  return isElective(call.kind) && !isAutoAccept(call.kind)
}

/** 콜 한 통 수용으로 누적되는 손익 델타(만원). */
export function callDelta(kind: CallKind): number {
  const e = CALL_ECONOMICS[kind]
  return e.revenueManwon - e.costManwon
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
  revenueManwon: 500,
  costManwon: 300, // 500/300 ≈ 166.7% — 검체 160.5% 밴드
}

/** 검사 한 건의 손익 델타(만원). 급여 환자의 부호를 −에서 +로 뒤집는다(I2). */
export function workupDelta(): number {
  return WORKUP_ECONOMICS.revenueManwon - WORKUP_ECONOMICS.costManwon
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

/**
 * 이 콜이 **언제** 진료를 시작할 수 있는가 — 대기까지 감안한 시작 시각, 혹은 못 받는 사유.
 *
 * 과거엔 도착 시각에 자유 의사가 없으면 그 자리에서 끝이었다(즉시 거절). 그래서 환자가 몰려도
 * 대기실에 아무도 남지 않았고 — 못 받은 사람은 그 프레임에 사라졌다 — 병원이 북적일 수가 없었다.
 * 이제 기다린다. 그 대기가 곧 복도에 선 사람들이다.
 *
 * 세 갈래를 가르는 건 `earliestFreeMin`의 `undefined`/숫자 구분이다:
 *   - 숫자 + 한계 이내 → 그 시각에 시작 (기다렸다 받는다)
 *   - 숫자 + 한계 초과 → `LEFT_WAITING` (자리는 결국 났지만 늦었다)
 *   - undefined       → `NO_FREE_SPECIALIST` (그 과 의사가 0명 — 기다려도 안 생긴다)
 *
 * `hardlockReason`과 `decide`가 이 함수 하나를 공유한다. 두 곳에 같은 판정을 적으면
 * 카드에 뜬 결과와 실제 처리가 어긋난다.
 */
export function startMinFor(
  call: IncomingCall,
  busyUntil: Record<string, number>,
  roster: Doctor[],
): number | 'LEFT_WAITING' | 'NO_FREE_SPECIALIST' {
  const dept = handlingDept(call)
  const arrivalMin = call.arrivalMin ?? 0
  if (freeDoctorsOfDept(roster, busyUntil, dept, arrivalMin).length > 0) return arrivalMin
  const earliest = earliestFreeMin(roster, busyUntil, dept)
  if (earliest === undefined) return 'NO_FREE_SPECIALIST'
  return earliest - arrivalMin <= patienceMin(call.kind) ? earliest : 'LEFT_WAITING'
}

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
  netProfitDeltaManwon: number
  /**
   * 오늘 검사 수익 — 진료 수익과 **별도로** 쌓는 장부 라인.
   * ⚠️ Task 5에서 플레이어의 검사 액션(withWorkup)이 제거돼 **항상 0**이다(검사 흑자는 SPECIALIST_ELECTIVE가 계승).
   * 필드를 남기는 건 DayRecord·UI 장부 파급을 막기 위함 — 완전 제거는 후속.
   */
  workupRevenueManwon: number
  /** 오늘 검사를 붙인 환자 수 — Task 5에서 검사 액션 제거로 **항상 0**(boarding 이월은 Task 6). */
  workupCount: number
  lawsuitExposure: number
  /**
   * reason = 못 받은 이유(구조가 막았거나, 기다리다 떠났거나). 받았거나 내가 보낸 콜은 null.
   * startMin = 진료를 **시작한** 시각. 도착과 다를 수 있다(기다렸으면 늦다). 못 받았으면 undefined —
   * 그래서 `arrivalMin ≤ 지금 < startMin`이 "지금 대기 중"이 되고, 맵이 그걸로 복도를 채운다.
   */
  log: {
    callId: string
    accepted: boolean
    disposition: CallDisposition
    reason: RejectionReason | null
    startMin?: number
  }[]
  done: boolean
}

// 필수 응급 4종 — 각자 배후과를 requiredSpecialty로 요구한다(adjudicateTransfer가 제네릭으로 판정).
const stemiPatient: Patient = { id: 'call-stemi', requiredSpecialty: 'CARDIOLOGY', severity: 5 }
const obstetricPatient: Patient = { id: 'call-ob', requiredSpecialty: 'OBSTETRICS', severity: 5 }
const neuroPatient: Patient = { id: 'call-neuro', requiredSpecialty: 'NEUROSURGERY', severity: 5 }
const traumaPatient: Patient = { id: 'call-trauma', requiredSpecialty: 'GENERAL_SURGERY', severity: 5 }
const abdominalPatient: Patient = { id: 'call-abdominal', requiredSpecialty: 'GENERAL_SURGERY', severity: 4 } // 급성복증 = 외과 수술 배후
const medicalPatient: Patient = { id: 'call-medical', requiredSpecialty: 'INTERNAL_MEDICINE', severity: 3 } // 고열·감염 = 내과 배후
const walkinPatient: Patient = { id: 'call-walkin', requiredSpecialty: 'CARDIOLOGY', severity: 1 } // 명목값(판정 안 함)

/** 요일별 콜 한 통 — SPECIALIST_ELECTIVE만 dept로 대상 배후과를 정한다(그 외는 PATIENT_OF 고정). */
interface CallPlanEntry {
  kind: CallKind
  dept?: Specialty
}

/**
 * 요일별 **응급** 구성 — 이 배열에서 응급 엔트리만 그날의 응급 스트림이 된다(하루 2~4통).
 *
 * ⚠️ 이 배열의 워크인·예약 엔트리는 더 이상 큐에 그대로 실리지 않는다. 콜 제한 폐지 뒤
 * 외래는 `outpatientForBeds(beds)`가 따로 만들고(워크인 위주 + 5통당 예약 1), 여기서는
 * **예약의 대상 과**만 읽어 간다(electiveDepts의 첫 항목). 아래 원칙 1~5 중 응급 배치에
 * 관한 1·2·4는 그대로 살아 있고, "자리 3 < 5통"(원칙 3)은 총량이 티어 파생이 되면서 폐기됐다.
 *
 * 결정론 유지가 이 게임의 원칙이라 RNG를 쓰지 않는다. 그렇다고 7일을 같은 큐로 채우면 3일째부터
 * 지루해지므로(game-concept.md:113이 '하루/교대' 장르를 기각한 사유가 바로 콘텐츠 양 부담),
 * 종류 배열만 손으로 짠다 — 라벨·대사는 kind별 풀에서 등장 순번으로 파생시켜 콘텐츠를 늘리지 않는다.
 *
 * 배치 원칙: (1) 모든 날에 필수 응급이 있다 — 외면할 기회가 매일 온다(STEMI 전용 아님, 4종 분산).
 * (2) 뒤로 갈수록 필수 응급이 는다 — 자리를 미용으로 채우던 습관의 대가가 커진다.
 * (3) 🔴 폐기 — "자리 3 < 5통이라 어느 날이든 못 받는다"였다. 총량이 병상 티어 파생이 되면서 그 부등호는
 * 사라졌다. 대신 한 병원이 4개 배후과를 다 못 갖춘다는 사실은 그대로라, 어느 과든 하드락은 여전히 난다.
 * (4) 월요일은 기존 리듬(필수=STEMI 위주)을 대체로 보존한다 — 첫날은 익숙하게, 다양성은 화요일부터 번진다.
 * (5) SPECIALIST_ELECTIVE를 날마다 한 통, **그날 이미 오는 필수 응급과 같은 dept**로 배치한다 —
 * 그 과 의사가 예약을 도는 동안 같은 날 같은 과 응급이 오면 실제로 점유가 경쟁한다(판정 자체는 Task 5).
 * 비필수(워크인/일반응급) 자리를 우선 바꿔치고, 그런 자리가 없는 날만(월·일) 중복된 필수 응급 한 통을 바꾼다
 * — 그래도 날마다 필수 응급 ≥1은 유지된다(원칙 1이 원칙 5보다 우선).
 *
 * 시간대(야간)는 더 이상 이 배열의 위치가 아니라 arrivalMin(도착순 정렬 후 시각)에서 파생된다 —
 * createCallQueue가 각 콜에 daysim seed로 도착시각·소요시간을 매기고 도착순으로 재정렬한다.
 * ⚠️ 옛 주석은 "슬롯 폭 120분이라 항상 마지막 1통만 야간"이라 적었다. 균등 슬롯을 버린 뒤(도착 뭉침)
 * 야간 통수는 날마다 다르다 — 경계(NIGHT_START_MIN)만 공유하지, 몇 통인지는 아무도 보장하지 않는다.
 */
const DAY_PLANS: CallPlanEntry[][] = [
  [{ kind: 'COSMETIC_WALKIN' }, { kind: 'SPECIALIST_ELECTIVE', dept: 'CARDIOLOGY' }, { kind: 'COSMETIC_WALKIN' },
   { kind: 'MEDICAL_EMERGENCY' }, { kind: 'STEMI' }], // 월 — 고열감염(내과 배후)·STEMI↔순환기 예약 경쟁, 야간 STEMI
  [{ kind: 'COSMETIC_WALKIN' }, { kind: 'SPECIALIST_ELECTIVE', dept: 'NEUROSURGERY' }, { kind: 'NEURO_EMERGENCY' },
   { kind: 'COSMETIC_WALKIN' }, { kind: 'STEMI' }], // 화 — 뇌출혈 등장, 신경외과 예약이 경쟁
  [{ kind: 'STEMI' }, { kind: 'MEDICAL_EMERGENCY' }, { kind: 'OBSTETRIC_EMERGENCY' },
   { kind: 'SPECIALIST_ELECTIVE', dept: 'INTERNAL_MEDICINE' }, { kind: 'NEURO_EMERGENCY' }], // 수 — 고열감염↔내과 예약 점유 경쟁, 산부·주간 STEMI
  [{ kind: 'SPECIALIST_ELECTIVE', dept: 'GENERAL_SURGERY' }, { kind: 'ABDOMINAL_EMERGENCY' }, { kind: 'STEMI' },
   { kind: 'TRAUMA_EMERGENCY' }, { kind: 'OBSTETRIC_EMERGENCY' }], // 목 — 급성복증↔외과 예약↔중증외상 경쟁(외과 부하 집중)
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
  STEMI: ['급성심근경색 — 타 병원 전원 요청', '급성심근경색 — 재이송'],
  OBSTETRIC_EMERGENCY: ['분만 응급 — 산부인과 전원 요청', '분만 중 출혈 — 재이송'],
  NEURO_EMERGENCY: ['뇌출혈 의심 — 신경외과 전원 요청', '뇌졸중 — 재이송'],
  TRAUMA_EMERGENCY: ['중증외상 — 외과 전원 요청', '다발성 외상 — 재이송'],
  ABDOMINAL_EMERGENCY: ['급성복증 — 외과 전원 요청', '충수염 의심 — 수술 요청'],
  MEDICAL_EMERGENCY: ['고열·패혈증 의심 — 내과 전원 요청', '중증 장염 — 입원 요청'],
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
  STEMI: stemiPatient,
  OBSTETRIC_EMERGENCY: obstetricPatient,
  NEURO_EMERGENCY: neuroPatient,
  TRAUMA_EMERGENCY: traumaPatient,
  ABDOMINAL_EMERGENCY: abdominalPatient,
  MEDICAL_EMERGENCY: medicalPatient,
  SPECIALIST_ELECTIVE: electivePatient,
}

/**
 * 병상 연동 하루 **외래** 통수 — 미용·검진 워크인 + 배후과 예약진료. 3→60·5→100·7→140.
 *
 * **능력이 아니라 규모에 비례시킨다.** 의사 수에 맞추면 항상 감당 가능해져 압박이 구조적으로
 * 증발한다 — 환자는 병원 사정을 모르고 온다. 병상 티어는 "얼마나 큰 병원으로 알려졌나"다.
 *
 * 응급은 여기 없다: 응급 통수는 DAY_PLANS 고정이라 티어와 무관하다(사용자 결정 2026-07-23).
 * 북적임은 외래가 만들고, 그 사이로 응급이 밀리는 게 이 게임의 논지다 — 응급까지 배수로 늘리면
 * 신문 헤드라인·소송 노출이 함께 배수가 돼 결말이 마비된다.
 *
 * ## 왜 20배인가 — 화면의 동시 인원은 도착률 × 체류시간이다
 *
 * 첫 구현은 `beds × 5`(하루 15~35통)였는데 **브라우저에서 여전히 한산했다**(2026-07-23 실측:
 * 대기 1명·의사 4명 중 3명 자유). 산수가 정직하다 — 하루 17명이면 35분에 한 명이고, 진료가
 * 45분이라 리틀의 법칙으로 동시 인원이 **1.3명**이다. 통수를 3배로 올려도 4명이라, 도착이
 * 뭉치는 것만으로는 그 상한을 못 넘는다. 북적임은 뭉침이 아니라 **도착률**이 만든다.
 *
 * `beds × 20`이면 하루 60~140명이라 동시 5~12명이 된다. 수익과를 꽉 채웠을 때(미용 3 + 검진 3
 * = 3600분 ÷ 45분 ≈ 80통) 겨우 감당하는 수준이라, **채용 선택이 처음으로 처리량을 가른다** —
 * 미용 1명이면 워크인 절반이 기다리다 떠나고, 3명이면 대부분 받는다.
 */
export function outpatientForBeds(beds: number): number {
  return beds * 20
}

/**
 * 외래 몇 통마다 예약진료 한 통인가 — 나머지는 워크인.
 *
 * 예약은 플레이어가 멈춰서 고르는 **유일한** 콜이라, 이 값이 곧 하루의 결정 횟수를 정한다
 * (외래 60통 ÷ 12 = 5번). 5보다 촘촘하게 두면 하루 12번을 물어 「계속」 연타를 없앤 의미가
 * 사라지고, 더 성기게 두면 예약↔응급의 같은 과 점유 경쟁이 거의 안 일어난다.
 */
const ELECTIVE_EVERY = 12

/**
 * 그날의 콜 큐 — 결정론(같은 day·beds는 항상 같은 큐), 도착순 정렬.
 *
 * **두 스트림을 합쳐 만든다**(콜 제한 폐지, 2026-07-23):
 *   ① 응급 — DAY_PLANS의 응급 엔트리 그대로(하루 2~4통). 병상 티어와 무관하게 고정이다.
 *   ② 외래 — `outpatientForBeds(beds)`통(15/25/35). 워크인 위주 + ELECTIVE_EVERY통마다 예약 1.
 * 하루 총 17~39명. 이 총량이 상한인 게 아니라 **하루 600분이 상한**이고, 총량은 그 결과다.
 *
 * 인덱스 기반으로 id·라벨·patient를 부여한 뒤 daysim seed로 arrivalMin·durationMin을 매기고
 * **마지막에** 도착시각 오름차순으로 정렬한다(결정론·id 고유성은 정렬 전 인덱스가 지킨다).
 * nightShift는 위치가 아니라 arrivalMin(≥ NIGHT_START_MIN)에서 파생 — 정렬해도 시간대는 안 흔들린다.
 *
 * week는 1로 고정한다(createCallQueue는 (day, beds) 두 인자 유지 — session.ts weekDayQueue가 이미
 * 전역일을 day로 넘기므로 이 함수 시그니처를 더 바꾸면 그쪽이 깨진다).
 * 라벨은 kind 내 등장 순번으로 고른다 — callerPleaAt(dialogue.ts)의 seed 규칙과 같아야 라벨↔대사가 맞는다(PR #29).
 */
export function createCallQueue(day = 1, beds = FIXED_BEDS): IncomingCall[] {
  const basePlan = DAY_PLANS[(day - 1) % DAY_PLANS.length]

  // ① 응급 스트림 — DAY_PLANS 그대로. 티어와 무관하게 고정이다.
  const emergencies = basePlan.filter((e) => requiresBackupCare(e.kind))

  // ② 외래 스트림 — 워크인 위주 + ELECTIVE_EVERY통마다 예약진료 하나.
  //    예약의 대상 과는 **DAY_PLANS가 그날 정한 과를 먼저** 쓰고, 늘어난 몫만 그날 오는 응급의 과를
  //    순환한다. 순서가 중요하다 — 응급 과부터 돌리면 월요일 예약이 순환기에서 내과로 바뀌어
  //    DAY_PLANS 원칙 4(월요일은 기존 리듬 보존)가 조용히 깨진다. 어느 쪽이든 같은 과 의사를 두고
  //    예약과 응급이 다투게 하는 게 이 배치의 목적이다.
  const electiveDepts = [
    ...basePlan.filter((e) => e.kind === 'SPECIALIST_ELECTIVE').map((e) => e.dept ?? 'CARDIOLOGY'),
    ...emergencies.map((e) => PATIENT_OF[e.kind].requiredSpecialty),
  ]
  const outpatient: CallPlanEntry[] = Array.from({ length: outpatientForBeds(beds) }, (_, i) =>
    i % ELECTIVE_EVERY === ELECTIVE_EVERY - 1
      ? { kind: 'SPECIALIST_ELECTIVE', dept: electiveDepts[Math.floor(i / ELECTIVE_EVERY) % electiveDepts.length] }
      : { kind: 'COSMETIC_WALKIN' },
  )

  const plan = [...emergencies, ...outpatient]
  const seen: Partial<Record<CallKind, number>> = {}
  const timed = plan.map(({ kind, dept }, i) => {
    const occurrence = seen[kind] ?? 0
    seen[kind] = occurrence + 1
    const arrivalMin = arrivalMinFor(1, day, i)
    return {
      id: `d${day}c${i + 1}`, // 순환 후 인덱스 기반 — 날짜별 고유, 정렬 위치와 무관(로그·React key 충돌 방지)
      kind,
      label: kind === 'SPECIALIST_ELECTIVE'
        ? electiveLabel(dept ?? 'CARDIOLOGY')
        : CALL_LABELS[kind][occurrence % CALL_LABELS[kind].length],
      patient: kind === 'SPECIALIST_ELECTIVE' ? electivePatientFor(dept ?? 'CARDIOLOGY') : PATIENT_OF[kind],
      lawsuitRisk: carriesLawsuitRisk(kind), // 소송 노출 계열(인과 선명)만 — 고열감염은 제외(방어 성공 전형)
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
    // 배후과를 요구하는 응급(필수 4종 + 급성복증 + 고열감염)은 게이트를 **공유**한다 — adjudicateTransfer가
    // call.patient.requiredSpecialty로 제네릭 판정하므로 종류별 분기가 필요 없다(세분·다양화의 핵심).
    case 'STEMI':
    case 'OBSTETRIC_EMERGENCY':
    case 'NEURO_EMERGENCY':
    case 'TRAUMA_EMERGENCY':
    case 'ABDOMINAL_EMERGENCY':
    case 'MEDICAL_EMERGENCY': {
      const verdict = adjudicateTransfer(hospital, call.patient)
      if (!verdict.accepted) return verdict.reason ?? 'NO_BACKUP_CARE'
      // 배후과가 있어도 **밤엔 당직이 서 있어야** 받는다 — 의사 1명은 24시간을 못 버틴다(T-042).
      // 그래서 2번째 의사가 사는 건 처리량이 아니라 시간대다: 이 줄이 없으면 n≥2가 순수 함정이 된다.
      // 당직을 모델링하지 않는 병원(roundTheClockBackup 미지정)은 backupCare로 폴백 — 기존 동작 유지.
      const onCallNow = hospital.roundTheClockBackup ?? hospital.backupCare
      if (call.nightShift && !onCallNow.includes(call.patient.requiredSpecialty)) {
        return 'NO_NIGHT_BACKUP' // 과는 있는데 당직이 비었다 — NO_BACKUP_CARE와 다른 사유다
      }
      // 과·당직이 있어도 그 과 의사가 다 진료 중이면 기다린다 — 버티면 받고(null), 못 버티면 떠난다.
      // 그 과 의사가 아예 없으면 대기가 무의미하므로 NO_FREE_SPECIALIST가 그대로 나온다.
      const start = startMinFor(call, busyUntil, roster)
      return typeof start === 'string' ? start : null
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
    netProfitDeltaManwon: 0,
    workupRevenueManwon: 0,
    workupCount: 0,
    lawsuitExposure: 0,
    log: [],
    done: queue.length === 0,
  }
}

/**
 * 현재 콜을 처리한다 — **응급은 자동 판정, 선택진료만 플레이어가 결정**한다.
 *
 * - 응급(급성복증·고열감염·필수 4종): `accept`를 무시하고 자동으로 판정한다. 구조적 하드락(hardlockReason)이 없으면
 *   수용, 있으면 turnedAway. "아무리 애원해도, 아무리 거절하려 해도" 결과는 병원의 제약이 정한다.
 * - 선택진료(미용·배후과 예약): `accept && 그 과 자유 의사 있음`일 때만 수용. accept=false거나 담당
 *   의사가 다 바쁘면 미수용(하드락이 아니라 '못 받음' — 사유 없음).
 *
 * 수용하면 담당 과(handlingDept)의 자유 의사를 `arrivalMin + durationMin`까지 점유한다.
 * 그 과에 자유 의사가 없으면(미채용) 아무도 점유하지 않는다(pickAssignee는 자유 의사가 있을 때만).
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
  // 대기까지 감안한 시작 시각 — 숫자면 (기다려서라도) 받을 수 있고, 문자열이면 못 받는다.
  const start = startMinFor(call, state.busyUntil, roster)
  const canStart = typeof start === 'number'

  // 응급은 accept 무관 자동(하드락이 없으면 수용). 선택진료는 accept + 시작 가능해야 수용.
  const effectiveAccept = disposition === 'CHOICE' && (isElective(call.kind) ? accept && canStart : true)

  // 수용한 콜은 담당 과 의사를 **시작 시각부터** 점유한다 — 기다린 콜은 도착이 아니라 시작이 기준이다.
  let busyUntil = state.busyUntil
  let startMin: number | undefined
  if (effectiveAccept && canStart) {
    const free = freeDoctorsOfDept(roster, state.busyUntil, handlingDept(call), start)
    const assignee = pickAssignee(free, state.busyUntil)
    busyUntil = { ...state.busyUntil, [assignee.id]: start + (call.durationMin ?? 0) }
    startMin = start
  }

  const netProfitDeltaManwon = effectiveAccept
    ? state.netProfitDeltaManwon + callDelta(call.kind)
    : state.netProfitDeltaManwon
  const lawsuitExposure = effectiveAccept && call.lawsuitRisk ? state.lawsuitExposure + 1 : state.lawsuitExposure

  // 선택진료는 하드락이 없어 reason이 null이지만, **기다리다 떠난 것만은** 기록한다 —
  // "오늘 몇 명이 못 기다리고 갔나"가 북적임의 대가라 로그에 남아야 화면이 보여줄 수 있다.
  // 🔴 NO_FREE_SPECIALIST는 여기 넣지 않는다: 선택진료에서 그건 "구조가 막았다"가 아니라
  // "그 과를 애초에 안 뽑았다"라, 사유를 달면 로그가 거짓말을 한다(기존 계약 — log 필드 주석).
  const logReason = reason ?? (!effectiveAccept && start === 'LEFT_WAITING' ? 'LEFT_WAITING' : null)

  const log = [...state.log, { callId: call.id, accepted: effectiveAccept, disposition, reason: logReason, startMin }]
  const index = state.index + 1
  return {
    ...state,
    clockMin: arrivalMin, // 현재 콜 도착 시각으로 하루를 전진시킨다
    busyUntil,
    netProfitDeltaManwon,
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
 * 부문 손익 — 구조 **고정비**의 오늘치(주간 고정비 ÷ 7)를 하루 진행률만큼 누적한 값(항상 ≤ 0).
 *
 * economics.segments는 이번 주 7일 전체 고정비라(types.ts), 하루엔 그 1/7만 나간다.
 * 콜 시작(index 0)엔 전 부문 0에서 출발해, 시각이 흐를수록 오늘 몫을 향해 자라고 하루 끝에 도달한다
 * — 문을 열어두는 값이 시간에 비례해 쌓인다(정적 선반영이 t=0부터 전액을 찍던 걸 PR #33에서 교정).
 *
 * 7일을 다 채우면 (주간/7) × 7 = 주간 고정비 전액이라 결말 장부(composeLedger, 전액)와 어긋나지 않는다 —
 * 이 등식이 '달력 숫자 ≠ 결말 장부' 이원화를 막는 유일한 이음매다(설계 §4-1).
 */
export function accruedSegments(state: ReceivingState): { label: string; profitManwon: number }[] {
  const p = dayProgress(state)
  const segments = state.hospital.economics?.segments ?? []
  return segments.map((s) => ({
    label: s.label,
    profitManwon: Math.round((s.profitManwon / DAYS_PER_WEEK) * p),
  }))
}

/**
 * 오늘 순이익(부문 손익 오늘치 + 오늘 진료 수익 + 오늘 검사 수익) — 소송 비용은 제외.
 * 소송 비용은 결말 buildSessionLedger에서만 차감된다(해석 0 원칙: 1막은 명랑한 숫자만).
 */
export function runningNetProfit(state: ReceivingState): number {
  const segmentTotal = accruedSegments(state).reduce((sum, s) => sum + s.profitManwon, 0)
  return segmentTotal + state.netProfitDeltaManwon + state.workupRevenueManwon
}

/**
 * 못 받은 콜을 **라벨 × 사유**로 접어 횟수만 남긴다 — 하루 마감 목록의 단일 출처.
 *
 * 왜 접는가: 콜 제한을 없앤 뒤 하루가 60통을 넘겼는데, 마감 화면이 못 받은 콜을 한 통씩
 * 나열해 「보톡스 상담 워크인 · 거절」이 스무 줄씩 반복됐다. 그 목록의 목적은 **무엇이
 * 남았나**인데 같은 문장이 반복되면 정작 드문 줄(순환기내과 기다리다 감)이 그 안에 묻힌다 —
 * 목록을 길게 만든 건 정보가 아니라 중복이었다.
 *
 * 사유를 키에 넣는 이유: 「내가 보냈다(거절)」와 「구조가 막았다(하드락)」와 「기다리다 갔다」는
 * 같은 사건이 아니다. 라벨만으로 접으면 그 셋이 한 줄로 뭉개져 이 게임의 논지가 증발한다.
 * 순서는 첫 등장 순서(Map의 삽입 순서)라 하루의 흐름이 뒤집히지 않는다.
 */
export function unacceptedGroups(
  state: Pick<ReceivingState, 'log' | 'queue'>,
): { label: string; outcome: string; count: number }[] {
  const groups = new Map<string, { label: string; outcome: string; count: number }>()
  state.log.forEach((entry, i) => {
    if (entry.accepted) return
    const label = state.queue[i].label
    const outcome =
      entry.reason === 'LEFT_WAITING'
        ? '기다리다 감'
        : entry.disposition === 'HARDLOCK_REJECT'
          ? '하드락'
          : '거절'
    const key = `${label} ${outcome}`
    const hit = groups.get(key)
    if (hit) hit.count += 1
    else groups.set(key, { label, outcome, count: 1 })
  })
  return [...groups.values()]
}
