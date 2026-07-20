// 게임 도메인 타입 (순수 · LLM 무관)

/** 진료과 */
export type Specialty =
  | 'THORACIC_SURGERY' // 흉부외과
  | 'GENERAL_SURGERY' // 외과
  | 'OBSTETRICS' // 산부인과
  | 'NEUROSURGERY' // 신경외과
  | 'CARDIOLOGY' // 순환기내과
  | 'INTERNAL_MEDICINE' // 내과 — 고열·감염·비수술 복통의 배후과

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
   * **선택 필드인 이유**: 당직을 모델링하는 건 플레이어 병원뿐이다(buildHospital이 항상 채운다).
   * 생략하면 "이 병원은 교대를 모델링하지 않는다"는 뜻이고, adjudicateTransfer가 야간을 안 봐
   * 기존대로 backupCare만으로 판정된다.
   */
  roundTheClockBackup?: Specialty[]
  economics?: HospitalEconomics // '병원 장부' 에필로그용(있는 병원만)
  roster?: Doctor[] // 개인 유닛 명단(표시 전용). 선택 필드 — 없는 병원(기존 테스트)은 표시 레이어만 스킵, 판정 무관.
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
  | 'NO_ER_ONCALL' // 응급의학과 당직 부재 — 초기 수용 자체 불가
  | 'ER_OVERCROWDED' // 과밀·boarding 으로 실질 포화
  | 'NO_BACKUP_CARE' // 배후진료 불가 — 최종치료 역량 부재 (지배 병목)
  | 'NO_NIGHT_BACKUP' // 배후과는 있으나 야간 당직 공백 — 24시간이 안 돌아간다(인력부족)
  | 'NO_FREE_SPECIALIST' // 배후과·당직은 있으나 그 과 의사가 다 진료 중 — 평일 배후 공백의 형상화(점유 판정은 Task 5)

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

/**
 * 콜 종류. STEMI 외에 세 필수 응급을 더해 "받는 벽"을 여러 과로 다양화한다(슬라이스 B).
 * 네 필수 응급(STEMI·분만·뇌출혈·중증외상)은 각자 requiredSpecialty로 배후과를 요구하고,
 * 없으면 adjudicateTransfer가 **제네릭으로** NO_BACKUP_CARE를 건다(판정 로직 무변경).
 * 한 병원이 4개 배후과를 다 못 갖추므로 어떤 종류든 하드락이 난다 = 필수의료 붕괴가 여러 과에서 동시에.
 */
export type CallKind =
  | 'STEMI' // 급성심근경색 — 순환기 배후 필요(없으면 하드락)
  | 'OBSTETRIC_EMERGENCY' // 분만 응급 — 산부인과 배후 필요
  | 'NEURO_EMERGENCY' // 뇌출혈/뇌졸중 — 신경외과 배후 필요
  | 'TRAUMA_EMERGENCY' // 중증외상 — 외과 배후 필요
  | 'ABDOMINAL_EMERGENCY' // 급성복증(충수염·장폐색·복막염) — 외과 배후(소송+신문)
  | 'MEDICAL_EMERGENCY' // 고열·감염·패혈증 — 내과 배후(신문만, 소송 미구현)
  | 'COSMETIC_WALKIN' // 미용·검진 워크인 — 늘 받을 수 있음(명랑)
  | 'SPECIALIST_ELECTIVE' // 배후과 예약진료(시술·검사) — 흑자, 그 과 의사를 점유해 응급과 경쟁

/** 걸려오는 콜 한 통. patient는 응급 판정(배후과 요구)에 쓰인다(워크인은 명목값). */
export interface IncomingCall {
  id: string
  kind: CallKind
  label: string // 화면 표시용 상황 요약
  patient: Patient
  lawsuitRisk: boolean // 수용 시 소송 노출 누적 여부(고위험 필수 케이스)
  nightShift: boolean // 야간 콜 — 배후과 의사 1명뿐이면 당직이 비어 못 받는다(roundTheClockBackup)
  arrivalMin?: number // 그날 도착 시각(분, 0..DAY_LENGTH_MIN) — 결정론 seed 파생(createCallQueue가 Task 4에서 채움)
  durationMin?: number // 수용 시 담당 의사 점유 시간(분) — 결정론 seed 파생(createCallQueue가 Task 4에서 채움)
}

/**
 * 응급의료기관 법적 등급 — backupCare 수에서 파생하는 자칭 불가 지정 명칭(획득 자격).
 * 판정에 쓰이지 않는 표현 전용 파생값이다. 근거: docs/research/emergency-tier-designation-law.md.
 */
export type HospitalTier = 'UNDESIGNATED' | 'LOCAL_INSTITUTION' | 'LOCAL_CENTER' | 'REGIONAL_CENTER'

/**
 * 의사 개인 유닛 — 표시 레이어 전용(판정 무관). 채용 인원수를 이름 붙은 개인으로 태운다.
 * 배경·특성·결함은 없다(사용자 결정: 림월드를 그대로 빼다 박지 않음).
 */
export interface Doctor {
  id: string // 'doc-<dept>-<i>' — 결정론 고유
  name: string // 결정론 자동 생성 한글 이름
  dept: DeptKey // 소속 과(수익과 + 필수과)
}
