import type { Hospital, Patient, TransferVerdict } from './types'

/**
 * 전원 수용/거절을 정하는 유일한 권한(2콜 분리의 "판정콜").
 *
 * 입력은 병원의 숨은 제약과 환자뿐이다. 플레이어의 설득 텍스트는 이 함수의 파라미터로
 * **존재하지 않는다** — 아무리 애원해도 결과를 바꿀 수 없다는 게임의 핵심 원칙을 타입으로 강제한다.
 *
 * 게이트 우선순위(먼저 걸리는 벽이 사유가 된다):
 *   1) 응급실 당직 부재   → NO_ER_ONCALL    (접수 자체 불가)
 *   2) 과밀·boarding     → ER_OVERCROWDED  (명목상 병상은 있으나 실질 포화)
 *   3) 배후진료 역량 부재 → NO_BACKUP_CARE  (최종치료 불가 — 현실의 지배 병목)
 *
 * 병상(beds) 축은 제거됐다 — 벽이 병상 총량에서 전문의 점유(시간)로 바뀌면서 자리 판정은
 * receiving.hardlockReason/decide가 담당한다(NO_FREE_SPECIALIST). beds 필드는 당분간 유지하되 안 본다.
 */
export function adjudicateTransfer(hospital: Hospital, patient: Patient): TransferVerdict {
  if (!hospital.hasErOnCall) {
    return { accepted: false, reason: 'NO_ER_ONCALL' }
  }
  if (hospital.overcrowded) {
    return { accepted: false, reason: 'ER_OVERCROWDED' }
  }
  // 병상·응급실 당직·자리는 있어도, 그 환자의 최종치료를 감당할 배후 역량이 없으면 못 받는다.
  if (!hospital.backupCare.includes(patient.requiredSpecialty)) {
    return { accepted: false, reason: 'NO_BACKUP_CARE' }
  }
  return { accepted: true }
}
