import type { GameState } from './round'
import type { Hospital, Specialty } from './types'

// 병원 장부 — 한 병원의 경제(부문 손익·신규 채용)를 결정론적으로 산출한다.
//
// 원칙(판정=코드)의 연장: 장부도 순수 함수다. 게임은 해석하지 않고 숫자만 찍는다.
// 수치(₩)는 각색이되 부호(적자↔흑자)는 근거를 지킨다 — docs/research/essential-care-economics.md.
// 핵심: 필수 배후과 채용 수는 하드코딩이 아니라 backupCare(= 거절 사유 NO_BACKUP_CARE의 뿌리)에서
// 파생한다. 그 병원이 환자 필요 과의 배후진료를 갖지 않으면, 장부의 그 채용은 0이다.

export interface LedgerSegment {
  label: string
  profitBillions: number
}
export interface LedgerHire {
  label: string
  count: number
}
export interface Ledger {
  hospitalName: string
  segments: LedgerSegment[]
  netProfitBillions: number
  hires: LedgerHire[] // 수익과 신규 채용
  essentialSpecialty: Specialty // 환자가 필요했던 과
  essentialHires: number // 그 과 배후진료 채용 — backupCare에서 파생(없으면 0)
  totalHires: number
}

/** 장부 주체 = 경제 데이터를 가진 병원(현재 시나리오에선 대학병원 한 곳). 없으면 undefined. */
function ledgerHospital(hospitals: Hospital[]): Hospital | undefined {
  return hospitals.find((h) => h.economics)
}

export function buildLedger(state: GameState): Ledger | null {
  const hospital = ledgerHospital(state.hospitals)
  if (!hospital?.economics) return null

  const { segments, hires, essentialHires: capableHires } = hospital.economics
  const essentialSpecialty = state.patient.requiredSpecialty
  // 파생: 그 과 배후진료가 있을 때만 채용 수가 잡히고, 없으면(=NO_BACKUP_CARE의 뿌리) 0.
  const essentialHires = hospital.backupCare.includes(essentialSpecialty) ? capableHires : 0

  const netProfitBillions = segments.reduce((n, s) => n + s.profitBillions, 0)
  const totalHires = hires.reduce((n, h) => n + h.count, 0) + essentialHires

  return {
    hospitalName: hospital.name,
    segments,
    netProfitBillions,
    hires,
    essentialSpecialty,
    essentialHires,
    totalHires,
  }
}
