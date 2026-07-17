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

/** 소송 비용 실현 단가(억) — 필수·고위험 케이스 수용의 꼬리위험 한 방. 각색(부호만 근거: 축 C). */
/**
 * 소송 노출 1건당 비용(억). 부호·존재만 근거, 금액 각색.
 * ⚠️ 스케일 주의 — 한 판이 7일(콜 35통)이라 노출이 10건 넘게 쌓인다. 하루 각색값 25를 그대로 두면
 * 소송 한 줄(−325억)이 장부 전체를 압도해 다른 항목이 안 보인다.
 */
export const LAWSUIT_COST_PER_EXPOSURE = 5

/** 병원+경제에서 장부를 조립하는 순수 코어. extraSegments로 세션 델타(진료 수익·소송 비용)를 얹는다. */
function composeLedger(
  hospital: Hospital,
  patientSpecialty: Specialty,
  extraSegments: LedgerSegment[],
): Ledger | null {
  const econ = hospital.economics
  if (!econ) return null
  const segments = [...econ.segments, ...extraSegments]
  // 파생: 그 과 배후진료가 있을 때만 채용 수가 잡히고, 없으면(=NO_BACKUP_CARE의 뿌리) 0.
  const essentialHires = hospital.backupCare.includes(patientSpecialty) ? econ.essentialHires : 0
  const netProfitBillions = segments.reduce((n, s) => n + s.profitBillions, 0)
  const totalHires = econ.hires.reduce((n, h) => n + h.count, 0) + essentialHires
  return {
    hospitalName: hospital.name,
    segments,
    netProfitBillions,
    hires: econ.hires,
    essentialSpecialty: patientSpecialty,
    essentialHires,
    totalHires,
  }
}

export function buildLedger(state: GameState): Ledger | null {
  const hospital = ledgerHospital(state.hospitals)
  if (!hospital) return null
  return composeLedger(hospital, state.patient.requiredSpecialty, [])
}

/**
 * 세션 결말 장부 — 플레이어 병원(위저드 산출) + 1막 콜 델타 + 소송 비용을 결정론적으로 조립.
 * 공범(순환기 0): 흑자 + 채용 0 + 소송 비용 없음. 양심(순환기 N): 적자 + 소송 비용 한 줄.
 */
export function buildSessionLedger(
  hospital: Hospital,
  patientSpecialty: Specialty,
  receiving: { netProfitDeltaBillions: number; lawsuitExposure: number },
): Ledger | null {
  const extra: LedgerSegment[] = []
  if (receiving.netProfitDeltaBillions !== 0) {
    extra.push({ label: '이번 주 진료 수익', profitBillions: receiving.netProfitDeltaBillions })
  }
  const lawsuitCost = receiving.lawsuitExposure > 0 ? receiving.lawsuitExposure * LAWSUIT_COST_PER_EXPOSURE : 0
  if (lawsuitCost > 0) {
    extra.push({ label: '소송 비용', profitBillions: -lawsuitCost })
  }
  return composeLedger(hospital, patientSpecialty, extra)
}
