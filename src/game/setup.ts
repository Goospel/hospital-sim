import type { DepartmentSpec, DeptKey, Hospital, HospitalEconomics, SetupChoices, Specialty } from './types'

// 병원 설립(위저드) — 순수·결정론. 위저드 선택이 곧 플레이어의 Hospital + HospitalEconomics다.
// 부호(적자↔흑자)만 근거를 지키고 금액은 각색: essential-care-economics.md / essential-care-litigation-risk.md.
// 이번 주 단순화(spec ⓐ): CARDIOLOGY만 STEMI 슬라이스의 기계적 분기점. 병상은 고정값.

/**
 * 플레이어 병원의 고정 병상 = 하루에 볼 수 있는 환자 수(총량). 위저드에서 안 고른다.
 * 하루 콜 5통(createCallQueue) > 자리 3 — 이 부등호가 "능력 대비 환자가 많다"를 만든다.
 * 매일 2통은 자리가 없어 못 받는다: 플레이어는 몇 통 받을지가 아니라 누구를 앉힐지를 고른다.
 */
export const FIXED_BEDS = 3
/** 채용 예산(억). 위저드가 이 한도로 선택을 제약해 "미용 vs 순환기" 딜레마를 만든다. */
export const SETUP_BUDGET_BILLIONS = 100

/**
 * 한 판의 길이 = 7일(월~일). 달력 한 주가 곧 한 게임이다.
 *
 * DEPARTMENTS의 손익 숫자는 **이 7일 전체**의 손익이고, 하루는 그 1/7씩 쌓인다.
 * (하루를 분기의 1/90로 잡으면 미용 의사 1명이 +0.78억/일이 되어 Math.round가 전부 0으로 뭉개고,
 *  1회성 스톡인 채용비 30억과 스케일이 깨져 딜레마가 소멸한다. 그래서 나누지 않고 기간을 재정의했다.)
 */
export const DAYS_PER_WEEK = 7

/** 고를 수 있는 과. 수익과(흑자·비필수) + 필수 배후과(적자·소송 ⚠). */
export const DEPARTMENTS: DepartmentSpec[] = [
  { key: 'AESTHETICS', label: '미용·피부', essential: false, profitPerDoctorBillions: 70, hireCostBillions: 10, lawsuitRisk: false },
  { key: 'CHECKUP', label: '건강검진', essential: false, profitPerDoctorBillions: 40, hireCostBillions: 12, lawsuitRisk: false },
  { key: 'CARDIOLOGY', label: '순환기내과', essential: true, profitPerDoctorBillions: -12, hireCostBillions: 30, lawsuitRisk: true, providesBackup: 'CARDIOLOGY' },
  { key: 'THORACIC_SURGERY', label: '흉부외과', essential: true, profitPerDoctorBillions: -15, hireCostBillions: 32, lawsuitRisk: true, providesBackup: 'THORACIC_SURGERY' },
  { key: 'OBSTETRICS', label: '산부인과', essential: true, profitPerDoctorBillions: -10, hireCostBillions: 28, lawsuitRisk: true, providesBackup: 'OBSTETRICS' },
  { key: 'NEUROSURGERY', label: '신경외과', essential: true, profitPerDoctorBillions: -13, hireCostBillions: 30, lawsuitRisk: true, providesBackup: 'NEUROSURGERY' },
  { key: 'GENERAL_SURGERY', label: '외과', essential: true, profitPerDoctorBillions: -8, hireCostBillions: 22, lawsuitRisk: true, providesBackup: 'GENERAL_SURGERY' },
]

function count(choices: SetupChoices, key: DeptKey): number {
  return choices.doctors[key] ?? 0
}

/** 위저드 선택 → 플레이어 병원 + 경제 데이터. */
export function buildHospital(choices: SetupChoices): { hospital: Hospital; economics: HospitalEconomics } {
  const staffed = DEPARTMENTS.map((dept) => ({ dept, n: count(choices, dept.key) })).filter((x) => x.n > 0)

  const backupCare: Specialty[] = staffed
    .filter((x) => x.dept.providesBackup)
    .map((x) => x.dept.providesBackup as Specialty)

  const segments = staffed.map((x) => ({ label: x.dept.label, profitBillions: x.dept.profitPerDoctorBillions * x.n }))
  const hires = staffed.filter((x) => !x.dept.essential).map((x) => ({ label: x.dept.label, count: x.n }))
  // 필수 배후과 채용 수는 STEMI 슬라이스가 요구하는 CARDIOLOGY 수에서 파생(spec ⓐ).
  const essentialHires = count(choices, 'CARDIOLOGY')

  const economics: HospitalEconomics = { segments, hires, essentialHires }
  const hospital: Hospital = {
    id: 'player',
    name: choices.hospitalName,
    beds: FIXED_BEDS,
    hasErOnCall: true,
    overcrowded: false,
    backupCare,
    economics,
  }
  return { hospital, economics }
}

/** 선택의 총 채용비(억). */
export function hiringCost(choices: SetupChoices): number {
  return DEPARTMENTS.reduce((sum, d) => sum + d.hireCostBillions * count(choices, d.key), 0)
}

/** 예산 한도 이내인가. */
export function withinBudget(choices: SetupChoices): boolean {
  return hiringCost(choices) <= SETUP_BUDGET_BILLIONS
}

/** 불변 갱신 — 과별 의사 수를 delta만큼 조정. 음수·비정수 방어(0 클램프·정수화), 0이면 키 제거. */
export function adjustDoctors(choices: SetupChoices, key: DeptKey, delta: number): SetupChoices {
  const current = choices.doctors[key] ?? 0
  const next = Math.max(0, Math.floor(current + delta))
  const doctors = { ...choices.doctors }
  if (next === 0) delete doctors[key]
  else doctors[key] = next
  return { ...choices, doctors }
}

/** 세션을 시작할 수 있는 선택인가 — 이름이 있고 예산 이내. */
export function isSetupReady(choices: SetupChoices): boolean {
  return choices.hospitalName.trim().length > 0 && withinBudget(choices)
}
