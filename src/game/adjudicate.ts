import type { Hospital, Patient, TransferVerdict } from './types'

/**
 * 전원 수용/거절을 정하는 유일한 권한(2콜 분리의 "판정콜").
 *
 * 입력은 병원의 숨은 제약(병상·당직 전문의)과 환자뿐이다.
 * 플레이어의 설득 텍스트는 이 함수의 파라미터로 **존재하지 않는다** —
 * 아무리 애원해도 결과를 바꿀 수 없다는 게임의 핵심 원칙을 타입으로 강제한다.
 */
export function adjudicateTransfer(hospital: Hospital, patient: Patient): TransferVerdict {
  // 병상 0 = 하드락. 어떤 조건보다 우선하는 물리적 벽.
  if (hospital.beds <= 0) {
    return { accepted: false, reason: 'NO_BED' }
  }
  // 필요 진료과 당직이 없으면 수용 불가.
  if (!hospital.onCallSpecialties.includes(patient.requiredSpecialty)) {
    return { accepted: false, reason: 'NO_SPECIALIST' }
  }
  return { accepted: true }
}
