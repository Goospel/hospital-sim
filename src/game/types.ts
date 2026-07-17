// 게임 도메인 타입 (순수 · LLM 무관)

/** 진료과 */
export type Specialty =
  | 'THORACIC_SURGERY' // 흉부외과
  | 'GENERAL_SURGERY' // 외과
  | 'OBSTETRICS' // 산부인과
  | 'NEUROSURGERY' // 신경외과
  | 'CARDIOLOGY' // 순환기내과

/**
 * 병원 — 모든 필드가 플레이어에게 보이지 않는 "숨은 제약".
 *
 * 리서치 반영(docs/research/medical-system-grounding.md): 실제 응급실 뺑뺑이의 지배 병목은
 * '병상 없음'이 아니라 '배후진료 불가'다. 그래서 과거의 뭉뚱그린 onCallSpecialties(당직 전문의)를
 * 두 개념으로 분리한다 — (1) 응급실이 초기 수용을 할 수 있는가(hasErOnCall),
 * (2) 그 환자의 최종치료(응급수술·시술·입원)를 감당할 배후 역량이 있는가(backupCare).
 */
export interface Hospital {
  id: string
  name: string
  beds: number // 가용 병상 수
  hasErOnCall: boolean // 응급의학과 당직 — 응급환자를 접수·초기진료할 수 있는가
  overcrowded: boolean // 과밀·boarding — 병상이 명목상 있어도 실질 포화인가
  backupCare: Specialty[] // 배후진료(최종치료) 가능 진료과 — STEMI면 CARDIOLOGY=심도자실/중재시술팀 가동
  /**
   * 그중 **24시간** 돌아가는 과 — 의사 1명은 24시간을 못 버틴다.
   *
   * backupCare가 "그 과가 있느냐"라면 이건 "**몇 시에** 있느냐"다. STEMI는 24시간 중재 순환기내과를
   * 갖춘 PCI 병원이라야 재관류가 되고(medical-system-grounding.md:20), 거절하는 당직의의 정당한
   * 제약이 "당직 1명이 이미 3명 동시 진료"(:66)다. 비면 야간 콜이 NO_BACKUP_CARE가 된다.
   *
   * **선택 필드인 이유**: 당직을 모델링하는 건 1막의 플레이어 병원뿐이다(buildHospital이 항상 채운다).
   * 2막 NPC 병원(scenarios.ts)은 시간대 축이 없고 adjudicateTransfer가 야간을 안 본다 —
   * 생략하면 "이 병원은 교대를 모델링하지 않는다"는 뜻이고 기존대로 backupCare만으로 판정된다.
   */
  roundTheClockBackup?: Specialty[]
  economics?: HospitalEconomics // '병원 장부' 에필로그용(있는 병원만)
}

/**
 * 병원 경제 데이터 — '병원 장부' 에필로그용.
 * 수치(₩·억)는 각색이되 부호(적자↔흑자)·대소는 근거를 지킨다(docs/research/essential-care-economics.md).
 * 필수 배후과 채용은 여기서 하드코딩하지 않는다 — backupCare 유무로 장부에서 파생한다(0 = 그 과 배후진료 없음).
 */
export interface HospitalEconomics {
  segments: { label: string; profitBillions: number }[] // 부문 손익(억) — **이번 주(7일)** 기준. 미용·검진 흑자, 필수·응급 적자
  hires: { label: string; count: number }[] // 수익과 신규 채용
  essentialHires: number // 필수 배후과 채용 수(그 과 배후진료가 있을 때만 장부에 반영)
}

/** 응급 환자 */
export interface Patient {
  id: string
  requiredSpecialty: Specialty // 수용에 필요한 진료과
  severity: number // 1~5, 클수록 위중
}

/**
 * 전원 거절 사유 태그 (5종 — 리서치 반영).
 *
 * NO_BACKUP_CARE 가 현실의 지배 병목이다: 병상·응급실 당직은 있어도
 * 해당 과의 최종치료 역량(STEMI=순환기 중재시술팀·카테터실)이 없어 못 받는 경우.
 *
 * NO_NIGHT_BACKUP 은 그 과가 **있는데 지금 당직이 비어** 못 받는 경우다 — 다른 사유다.
 * 이 둘을 한 태그로 뭉치면 대사가 "저희도 순환기 시술팀이 없습니다"가 되어, 순환기를 뽑은
 * 플레이어에게 게임이 거짓말을 한다. 현실에서도 별개이고, 수용곤란 고지 증가분의 최대 사유가
 * '인력부족'(2023→2024 **2.3배**)이라 오히려 이쪽이 지배적이다(stemi-factsheet.md:19).
 */
export type RejectionReason =
  | 'NO_BED' // 가용 병상 없음
  | 'NO_ER_ONCALL' // 응급의학과 당직 부재 — 초기 수용 자체 불가
  | 'ER_OVERCROWDED' // 과밀·boarding 으로 실질 포화
  | 'NO_BACKUP_CARE' // 배후진료 불가 — 최종치료 역량 부재 (지배 병목)
  | 'NO_NIGHT_BACKUP' // 배후과는 있으나 야간 당직 공백 — 24시간이 안 돌아간다(인력부족)

/** 전원 판정 결과 — 이 값만이 게임 상태 전이를 결정한다 */
export interface TransferVerdict {
  accepted: boolean
  reason?: RejectionReason
}

/** 수익과(비필수) — 필수과는 기존 Specialty로 표현한다. */
export type RevenueDept = 'AESTHETICS' | 'CHECKUP'

/** 위저드에서 고를 수 있는 과 = 수익과 + 필수과. */
export type DeptKey = RevenueDept | Specialty

/**
 * 과 카탈로그 한 줄. 금액(억)은 각색이되 부호(적자↔흑자)만 근거를 지킨다.
 * lawsuitRisk = "소송 리스크 ⚠"(필수·고위험과). 근거: essential-care-litigation-risk.md
 * — 부호는 '분쟁 빈도'가 아니라 결과의 중대성(사망·중증장애·형사기소).
 */
export interface DepartmentSpec {
  key: DeptKey
  label: string
  essential: boolean
  // 의사 1명당 **이번 주(7일 = 한 판) 전체** 손익(부호만 근거). 하루치는 이 값의 1/7.
  // ⚠️ 기간 단위가 이 주석에만 있다 — 타입은 그냥 number라 의미를 바꿔도 tsc가 0건 잡는다(무성 실패).
  profitPerDoctorBillions: number
  hireCostBillions: number // 채용 예산 표기(필수·고위험과는 인력 희소 → 비쌈)
  lawsuitRisk: boolean
  providesBackup?: Specialty // 이 과가 제공하는 배후진료(필수과만)
}

/** 설정 위저드 산출물 — 곧 플레이어 병원이 된다. */
export interface SetupChoices {
  hospitalName: string
  doctors: Partial<Record<DeptKey, number>> // 과별 의사 수
}

/** 1막 콜 종류. */
export type CallKind =
  | 'STEMI' // 급성심근경색 — 순환기 배후 필요(없으면 하드락)
  | 'GENERAL_EMERGENCY' // 일반 응급 — 병상만 있으면 받을 수 있음(저마진)
  | 'COSMETIC_WALKIN' // 미용·검진 워크인 — 늘 받을 수 있음(명랑)

/** 걸려오는 콜 한 통. patient는 STEMI/일반응급 판정에 쓰인다(워크인은 명목값). */
export interface IncomingCall {
  id: string
  kind: CallKind
  label: string // 화면 표시용 상황 요약
  patient: Patient
  lawsuitRisk: boolean // 수용 시 소송 노출 누적 여부(고위험 필수 케이스)
  nightShift: boolean // 야간 콜 — 배후과 의사 1명뿐이면 당직이 비어 못 받는다(roundTheClockBackup)
}
