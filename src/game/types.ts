// 게임 도메인 타입 (순수 · LLM 무관)

/** 진료과 */
export type Specialty =
  | 'THORACIC_SURGERY' // 흉부외과
  | 'GENERAL_SURGERY' // 외과
  | 'OBSTETRICS' // 산부인과
  | 'NEUROSURGERY' // 신경외과
  | 'CARDIOLOGY' // 순환기내과

/** 병원 — beds/onCallSpecialties 는 플레이어에게 보이지 않는 "숨은 제약" */
export interface Hospital {
  id: string
  name: string
  beds: number // 가용 병상 수 (숨은 제약)
  onCallSpecialties: Specialty[] // 당직 전문의 보유 진료과 (숨은 제약)
}

/** 응급 환자 */
export interface Patient {
  id: string
  requiredSpecialty: Specialty // 수용에 필요한 진료과
  severity: number // 1~5, 클수록 위중
}

/** 전원 거절 사유 태그 */
export type RejectionReason =
  | 'NO_BED' // 가용 병상 없음
  | 'NO_SPECIALIST' // 필요 진료과 당직 없음

/** 전원 판정 결과 — 이 값만이 게임 상태 전이를 결정한다 */
export interface TransferVerdict {
  accepted: boolean
  reason?: RejectionReason
}
