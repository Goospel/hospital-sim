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
}

/** 골든타임 초를 mm:ss 로 포맷한다. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
