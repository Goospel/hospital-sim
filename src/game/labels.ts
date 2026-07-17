import type { RejectionReason, Specialty } from './types'

// 화면 표시용 한국어 라벨(순수 데이터).
export const SPECIALTY_LABEL: Record<Specialty, string> = {
  THORACIC_SURGERY: '흉부외과',
  GENERAL_SURGERY: '외과',
  OBSTETRICS: '산부인과',
  NEUROSURGERY: '신경외과',
  CARDIOLOGY: '순환기내과',
}

export const REJECTION_LABEL: Record<RejectionReason, string> = {
  NO_BED: '병상 없음',
  NO_ER_ONCALL: '응급실 당직 없음',
  ER_OVERCROWDED: '응급실 과밀',
  NO_BACKUP_CARE: '배후진료 불가',
  NO_NIGHT_BACKUP: '야간 당직 없음',
}

/** 골든타임 초를 mm:ss 로 포맷한다. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * 부호 인지 억 단위 포맷 — 음수는 유니코드 마이너스(−) + 절대값, 0·양수는 +.
 * 장부·명랑장부·막간 순이익 등 "억" 단위 손익을 렌더하는 모든 지점의 단일 소스.
 * (Task 7 롤업: LedgerPanel 순이익 총계가 부호를 하드코딩해 적자에서 "+-24억"으로 렌더되던
 * 결함을 이 헬퍼로 단일화해 재발을 막는다.)
 */
export function formatSignedBillions(billions: number): string {
  return `${billions < 0 ? '−' : '+'}${Math.abs(billions)}억`
}
