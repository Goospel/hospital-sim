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
  economics?: HospitalEconomics // '병원 장부' 에필로그용(있는 병원만)
}

/**
 * 병원 경제 데이터 — '병원 장부' 에필로그용.
 * 수치(₩·억)는 각색이되 부호(적자↔흑자)·대소는 근거를 지킨다(docs/research/essential-care-economics.md).
 * 필수 배후과 채용은 여기서 하드코딩하지 않는다 — backupCare 유무로 장부에서 파생한다(0 = 그 과 배후진료 없음).
 */
export interface HospitalEconomics {
  segments: { label: string; profitBillions: number }[] // 부문 손익(억) — 미용·검진 흑자, 필수·응급 적자
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
 * 전원 거절 사유 태그 (4종 — 리서치 반영).
 * NO_BACKUP_CARE 가 현실의 지배 병목이다: 병상·응급실 당직은 있어도
 * 해당 과의 최종치료 역량(STEMI=순환기 중재시술팀·카테터실)이 없어 못 받는 경우.
 */
export type RejectionReason =
  | 'NO_BED' // 가용 병상 없음
  | 'NO_ER_ONCALL' // 응급의학과 당직 부재 — 초기 수용 자체 불가
  | 'ER_OVERCROWDED' // 과밀·boarding 으로 실질 포화
  | 'NO_BACKUP_CARE' // 배후진료 불가 — 최종치료 역량 부재 (지배 병목)

/** 전원 판정 결과 — 이 값만이 게임 상태 전이를 결정한다 */
export interface TransferVerdict {
  accepted: boolean
  reason?: RejectionReason
}
