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
 * 한 과에 채용할 수 있는 의사 수 상한 — **하루 자리에서 파생한다(각색값이 아니다).**
 * 한 과가 하루에 앉힐 수 있는 환자가 FIXED_BEDS뿐이라, 그보다 많은 의사는 볼 환자가 없다.
 *
 * 예산만으로는 못 막는다: 미용 10명이 **정확히 100억**이라 hiringCost를 통과하면서
 * 부문 손익 70×10 = **+700억/주**(예산의 7배)를 만들어 불변식 I8(|순이익| ≤ 4 × 예산)을 깼다.
 * 설계 스펙 §6 지뢰 5 — 적대 검증이 잡은 기존 버그다.
 */
export const MAX_DOCTORS_PER_DEPT = FIXED_BEDS

/**
 * 그 과의 배후진료가 **24시간** 돌아가려면 필요한 의사 수 — 당직 로테이션 최소 인원.
 *
 * 의사 1명은 24시간을 못 버틴다. 그래서 2번째 의사가 사는 건 처리량이 아니라 **시간대**다:
 * 1명이면 주간 STEMI만 받고, 밤에 온 STEMI는 당직이 비어 못 받는다.
 *
 * ⚠️ 이 상수가 없던 시절 `backupCare`가 **이진값**이라 2번째 의사는 손익만 −12 깎는 순수 함정이었다
 * (강지배). 그때 내가 낸 답이 "위저드 상한 1"이었는데, **코드가 표현 못 하는 걸 현실에 없는 것으로
 * 착각**한 것이었다 — 현실에서 2명째가 사는 게 바로 이 24시간이다(T-042).
 * 근거: medical-system-grounding.md:20("24시간 중재 순환기내과")·:66("당직 1명이 이미 3명 동시 진료").
 */
export const ROUND_THE_CLOCK_MIN_DOCTORS = 2

/**
 * 한 판의 길이 = 7일(월~일). 달력 한 주가 곧 한 게임이다.
 *
 * DEPARTMENTS의 손익 숫자는 **이 7일 전체**의 손익이고, 하루는 그 1/7씩 쌓인다.
 * (하루를 분기의 1/90로 잡으면 미용 의사 1명이 +0.78억/일이 되어 Math.round가 전부 0으로 뭉개고,
 *  1회성 스톡인 채용비 30억과 스케일이 깨져 딜레마가 소멸한다. 그래서 나누지 않고 기간을 재정의했다.)
 */
export const DAYS_PER_WEEK = 7

/**
 * 고를 수 있는 과. 수익과(흑자·비필수) + 필수 배후과(적자·소송 ⚠).
 *
 * 필수과의 음수는 **"적자과"가 아니라 24시간 대기 고정비**다(설계 스펙 §3.1). 콜을 받든 안 받든 나간다 —
 * 심장중재팀·수술팀이 24시간 대기하는 비용이라 환자 수와 무관하기 때문이다. 그래서 "환자를 받을수록
 * 적자"가 아니라 **"안 받아도 적자, 받아도 원가에 못 미침"**이 정확한 명제고, 콜당 원가 미달은
 * 이 상수가 아니라 CALL_ECONOMICS(receiving.ts)가 따로 표현한다 — 둘은 층이 다르니 이중 계상이 아니다.
 * ⛔ 이 값을 콜 수로 나눠 "환자 1명당 손실"을 만들지 마라 — 경제학적으로 틀린 조작이고 그런 공식 수치는 없다.
 *
 * ⚠️ 금액의 직접 근거는 미확인이다(fee-schedule-and-subsidies.md §10 — "24시간 심장중재팀 대기 고정비"
 * 실측치가 없다). 가장 가까운 실측은 외상센터 "국고보조금 반영 후에도 손익률 −23.0%"(2014~2018)인데
 * 외상센터이지 심장중재팀이 아니다. **부호(음수)와 대소 관계만 근거로 삼고 금액은 각색.**
 */
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

  // 그중 24시간 돌아가는 과 — 당직 로테이션이 서는 인원(2명)부터. 3명째는 24시간을 두 번 사지 못한다.
  const roundTheClockBackup: Specialty[] = staffed
    .filter((x) => x.dept.providesBackup && x.n >= ROUND_THE_CLOCK_MIN_DOCTORS)
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
    roundTheClockBackup,
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

/** 모든 과가 인원 상한 이내인가 — 예산과 독립된 제약이다(미용 10명은 예산은 통과한다). */
export function withinDeptCaps(choices: SetupChoices): boolean {
  return DEPARTMENTS.every((d) => count(choices, d.key) <= MAX_DOCTORS_PER_DEPT)
}

/** 불변 갱신 — 과별 의사 수를 delta만큼 조정. 음수·비정수 방어(0 클램프·정수화)·상한 클램프, 0이면 키 제거. */
export function adjustDoctors(choices: SetupChoices, key: DeptKey, delta: number): SetupChoices {
  const current = choices.doctors[key] ?? 0
  const next = Math.min(MAX_DOCTORS_PER_DEPT, Math.max(0, Math.floor(current + delta)))
  const doctors = { ...choices.doctors }
  if (next === 0) delete doctors[key]
  else doctors[key] = next
  return { ...choices, doctors }
}

/** 세션을 시작할 수 있는 선택인가 — 이름이 있고 예산·과별 상한 이내. */
export function isSetupReady(choices: SetupChoices): boolean {
  return choices.hospitalName.trim().length > 0 && withinBudget(choices) && withinDeptCaps(choices)
}
