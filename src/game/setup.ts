import type { DepartmentSpec, DeptKey, Hospital, HospitalEconomics, SetupChoices, Specialty } from './types'
import { materializeRoster } from './doctor'

// 병원 설립(위저드) — 순수·결정론. 위저드 선택이 곧 플레이어의 Hospital + HospitalEconomics다.
// 부호(적자↔흑자)만 근거를 지키고 금액은 각색: essential-care-economics.md / essential-care-litigation-risk.md.
// 이번 주 단순화(spec ⓐ): CARDIOLOGY만 STEMI 슬라이스의 기계적 분기점. 병상은 고정값.

/**
 * 플레이어 병원의 개원 병상 티어. 위저드에서 안 고른다(성장에서 5·7로 올린다).
 *
 * 이제 이 값은 두 가지를 동시에 정한다: 병동 칸 수와 **하루 도착 인원**(outpatientForBeds =
 * beds × 5, 응급은 별도 고정). 큰 병원일수록 더 많이 온다 — 능력이 아니라 규모에 비례한다.
 *
 * ⚠️ 옛 주석은 "하루 콜 5통 > 자리 3"이 과부하를 만든다고 적었다. 벽이 병상 총량에서
 * **전문의 시간**으로 옮겨간 뒤(시간 기반 하루 루프) 그 부등호는 이미 판정에 안 쓰였고,
 * 콜 제한 폐지로 하루 도착이 20~40명이 되면서 숫자마저 틀리게 됐다. 지금 과부하를 만드는 건
 * 총량이 아니라 **도착이 뭉치는 시각**이다 — 몰릴 때 그 과 의사가 이미 다른 환자를 보고 있다.
 */
export const FIXED_BEDS = 3
/**
 * 채용 예산(만원) = 개원 자본 5억. 위저드가 이 한도로 선택을 제약해 "미용 vs 순환기" 딜레마를 만든다.
 *
 * 옛 값은 100'억'이었다 — 의사 5명짜리 의원급 개원 자본으로 100억은 두 자릿수 틀린 숫자다.
 * 단위를 만원으로 내리면서 **과별 채용비 비율은 한 톨도 안 바꿨다**(전부 옛 억 값 ×500):
 * 딜레마를 만드는 건 절대액이 아니라 "순환기 1명 = 미용 3명"이라는 비율이라, 그 비율을 보존하면
 * 위저드 밸런스를 재튜닝할 필요가 없다.
 */
export const SETUP_BUDGET_MANWON = 50_000

/**
 * 한 과에 채용할 수 있는 의사 수 상한 — **하루 자리에서 파생한다(각색값이 아니다).**
 * 한 과가 하루에 앉힐 수 있는 환자가 FIXED_BEDS뿐이라, 그보다 많은 의사는 볼 환자가 없다.
 *
 * 예산만으로는 못 막는다: 미용 10명이 **정확히 예산 전액**이라 hiringCost를 통과하면서
 * 부문 손익 70×10 = **+700억/주**(예산의 7배)를 만들어 불변식 I8(|순이익| ≤ 4 × 예산)을 깼다.
 * 설계 스펙 §6 지뢰 5 — 적대 검증이 잡은 기존 버그다.
 *
 * 🔁 그 머니프린터의 **뿌리는 2026-07-23에 제거됐다** — 부문 손익이 고정비가 돼 의사를 늘리면
 * 손익이 −로만 간다. 그래도 상한은 남긴다: 이제 상한이 막는 건 부문 손익이 아니라 **처리량**이고
 * (의사 1명당 하루 600분), 수익과 의사를 무한히 늘리면 워크인 흑자 쪽으로 I8이 다시 깨진다.
 *
 * ⚖️ 필수 배후과는 3명째가 게임 로직상 강지배다(24시간은 2명에서 성립, 3명째는
 * roundTheClockBackup에 아무것도 못 더하고 손익만 −). 그럼에도 상한을 2로 좁히지 않는다
 * (2026-07-18 재검토): 강지배는 **코드에서**지 **현실에서**가 아니다 — 3명째는 동시 진료
 * 처리량·당직 로테이션 여유를 산다(medical-system-grounding.md:66 "당직 1명이 이미 3명
 * 동시 진료"). 게임이 그 축(동시 처리량)을 아직 안 만들었을 뿐이라, 좁히면 T-042("코드가
 * 표현 못 하는 걸 현실에 없는 것으로 착각")를 그대로 반복한다. 상한을 FIXED_BEDS에 묶어두는
 * 것 자체가 "3명째는 현실에서 가능하다"의 표현이다. 축을 주는 안은 마감 대비 비용이 커 본선 확장 보류.
 */
export const MAX_DOCTORS_PER_DEPT = FIXED_BEDS

/** 병상 티어 — 성장의 용량 축. 첫 티어 = FIXED_BEDS(개원값). */
export const BED_TIERS = [FIXED_BEDS, 5, 7]

/**
 * 티어 상승 누적 비용(만원) — 체증. key = 목표 병상.
 *
 * ⚠️ 채용비와 달리 **옛 비율을 그대로 못 옮긴다.** 옛 값(60억/100억)은 주 +300억을 찍던 부문 손익
 * 시절에 맞춰진 값이라, 수익이 콜 델타만 남은 지금(공범 루트 주 3천만원대) 그 비율이면 증설이
 * 수십 주 걸려 성장 루프가 죽는다. 한 주 순이익으로 첫 티어를, 두세 주로 다음 티어를 살 수 있게 잡는다
 * — 2병상 증축·장비가 1~2억이라는 현실 감각과도 이쪽이 맞는다.
 */
const BED_STEP_COST: Record<number, number> = { 5: 10_000, 7: 18_000 }

/** 병상 fromBeds→toBeds 증설 비용(만원) — 지나는 티어 스텝 비용의 합(체증·같은 티어면 0). */
export function bedExpansionCost(fromBeds: number, toBeds: number): number {
  let cost = 0
  for (const tier of BED_TIERS) {
    if (tier > fromBeds && tier <= toBeds) cost += BED_STEP_COST[tier] ?? 0
  }
  return cost
}

/** 과별 채용 상한 — 필수과는 병상 따라 오르고, 수익과는 3 고정(I8 머니프린터 방지). */
export function deptCap(dept: DepartmentSpec, beds: number): number {
  return dept.essential ? beds : MAX_DOCTORS_PER_DEPT
}

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
 * DEPARTMENTS의 고정비 숫자는 **이 7일 전체**의 고정비이고, 하루는 그 1/7씩 쌓인다.
 * (하루를 분기의 1/90로 잡으면 하루치가 Math.round에 전부 0으로 뭉개지고, 1회성 스톡인 채용비와
 *  스케일이 깨져 딜레마가 소멸한다. 그래서 나누지 않고 기간을 재정의했다. 단위를 억에서 만원으로
 *  내린 뒤엔 1/7 나눗셈의 해상도 여유가 100배 늘어 이 위험 자체가 옅어졌다.)
 */
export const DAYS_PER_WEEK = 7

/**
 * 고를 수 있는 과. **모든 과가 고정비만 갖는다** — 이 층에 흑자는 없다.
 *
 * ## 뒤집힌 것 (2026-07-23)
 *
 * 옛 필드는 `profitPerDoctorBillions`였고 미용 +70·검진 +40이 **입력으로** 박혀 있었다. 그래서
 * 콜을 한 통도 안 받고 전부 거절해도 주 303억 흑자가 났고(실측), 같은 진료를 콜 델타와 두 층에서
 * 세는 이중 계상이 하루 60명 도착에서 순이익을 707억으로 부풀렸다([T-069](../../claude-docs/troubleshooting/T-069.md)).
 *
 * 이제 이 값은 **그 과를 열어 두는 데 드는 주간 고정비**(인건비·시설·당직)다. 콜을 받든 안 받든
 * 나가고, 수익은 CALL_ECONOMICS(receiving.ts) 한 층에서만 나온다. 그래서 과별 흑자·적자가
 * **입력이 아니라 계산에서 창발한다**:
 *   - 미용: −고정비 + 워크인 수백 건 × 마진(200%) → 흑자
 *   - 순환기: −고정비(심도자실·24시간 당직) + 응급 몇 건 × 원가미달(85%) → 적자
 * 필수과의 적자는 "환자를 받아서"가 아니라 **"안 받아도 나가는 대기 비용 + 받으면 원가에 못 미침"**
 * 두 항의 합이고, 이제 그 두 항이 장부에서 각각 보인다.
 *
 * ⛔ 이 값을 콜 수로 나눠 "환자 1명당 고정비"를 만들지 마라 — 고정비는 정의상 환자 수와 무관하다.
 *
 * ## 금액 (만원/주·의사 1명당)
 *
 * 인건비(봉직의 연봉 2.5~7억 → 주 480~1,350) + 그 과를 여는 데 드는 시설·당직 분담. 재료비는 여기
 * 없다 — 그건 콜 원가(CALL_ECONOMICS.costManwon)에 이미 들어 있다(그래서 이중 계상이 안 된다).
 * **대소 관계는 옛 값의 순서를 그대로 보존한다**(흉부 > 신경 > 순환기 > 산부 > 외과 > 내과 > 수익과).
 *
 * 🔢 **전부 7의 배수다.** 하루치가 `주간 ÷ 7`이라 7의 배수가 아니면 반올림 오차가 남고, 그러면
 * "7일 달력 누계 = 결말 장부"라는 등식이 깨진다(accruedSegments 주석 — *'달력 숫자 ≠ 결말 장부'
 * 이원화를 막는 유일한 이음매*). 의사 수 n을 곱해도 배수가 유지되니 조합과 무관하게 정확해진다.
 * 값을 바꿀 땐 7의 배수를 유지하라 — 안 지켜도 테스트가 안 울고 장부만 몇 만원씩 어긋난다.
 *
 * ⚠️ 금액의 직접 근거는 미확인이다(fee-schedule-and-subsidies.md §10 — "24시간 심장중재팀 대기 고정비"
 * 실측치가 없다). 가장 가까운 실측은 외상센터 "국고보조금 반영 후에도 손익률 −23.0%"(2014~2018)인데
 * 외상센터이지 심장중재팀이 아니다. **부호(전부 고정비)와 대소 관계만 근거로 삼고 금액은 각색.**
 */
export const DEPARTMENTS: DepartmentSpec[] = [
  // 수익과 — 24시간 대기가 없어 고정비가 가볍다(인건비 + 시술실). 흑자는 워크인 볼륨에서 창발한다.
  // 🔴 미용이 **모든 과 중 가장 가볍다**(D형 비대칭). 검진은 내시경·영상 장비가 붙어 더 무겁고,
  //    정책 이벤트가 급여 풀에서 재원을 뽑을 때 얻어맞는 것도 검진이다 — 비급여인 미용만 무풍지대다.
  { key: 'AESTHETICS', label: '미용·피부', essential: false, fixedCostPerDoctorManwon: 560, hireCostManwon: 5_000, lawsuitRisk: false },
  { key: 'CHECKUP', label: '건강검진', essential: false, fixedCostPerDoctorManwon: 630, hireCostManwon: 6_000, lawsuitRisk: false },
  // 필수 배후과 — 고정비의 절반 이상이 **아무도 안 왔을 때도 나가는** 24시간 대기 비용이다.
  { key: 'CARDIOLOGY', label: '순환기내과', essential: true, fixedCostPerDoctorManwon: 1190, hireCostManwon: 15_000, lawsuitRisk: true, providesBackup: 'CARDIOLOGY' },
  { key: 'THORACIC_SURGERY', label: '흉부외과', essential: true, fixedCostPerDoctorManwon: 1400, hireCostManwon: 16_000, lawsuitRisk: true, providesBackup: 'THORACIC_SURGERY' },
  { key: 'OBSTETRICS', label: '산부인과', essential: true, fixedCostPerDoctorManwon: 1050, hireCostManwon: 14_000, lawsuitRisk: true, providesBackup: 'OBSTETRICS' },
  { key: 'NEUROSURGERY', label: '신경외과', essential: true, fixedCostPerDoctorManwon: 1260, hireCostManwon: 15_000, lawsuitRisk: true, providesBackup: 'NEUROSURGERY' },
  { key: 'GENERAL_SURGERY', label: '외과', essential: true, fixedCostPerDoctorManwon: 840, hireCostManwon: 11_000, lawsuitRisk: true, providesBackup: 'GENERAL_SURGERY' },
  // 내과: 24h 대기 고정비인 다른 배후과(840~1400)와 달리 **저수가 외래 박리다매**라 대기 비용이 가장 가볍다.
  // ⚠️ lawsuitRisk:false는 소송 '미구현'이지 "안전과"가 아니다 — essential:true로 수익과와 분리한다.
  { key: 'INTERNAL_MEDICINE', label: '내과', essential: true, fixedCostPerDoctorManwon: 700, hireCostManwon: 10_000, lawsuitRisk: false, providesBackup: 'INTERNAL_MEDICINE' },
]

function count(choices: SetupChoices, key: DeptKey): number {
  return choices.doctors[key] ?? 0
}

/**
 * 위저드 선택 → 배후진료 가능 진료과 목록. buildHospital과 위저드 등급 표시가 공유하는 단일 출처.
 * providesBackup이 있고 1명 이상 채운 과만 배후로 잡는다(미용·검진 제외).
 */
export function backupCareOf(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): Specialty[] {
  return departments
    .filter((d) => d.providesBackup && count(choices, d.key) > 0)
    .map((d) => d.providesBackup as Specialty)
}

/** 위저드 선택 → 플레이어 병원 + 경제 데이터. */
export function buildHospital(
  choices: SetupChoices,
  departments: DepartmentSpec[] = DEPARTMENTS,
  beds: number = FIXED_BEDS,
): { hospital: Hospital; economics: HospitalEconomics } {
  const staffed = departments.map((dept) => ({ dept, n: count(choices, dept.key) })).filter((x) => x.n > 0)

  const backupCare: Specialty[] = backupCareOf(choices, departments)

  // 그중 24시간 돌아가는 과 — 당직 로테이션이 서는 인원(2명)부터. 3명째는 24시간을 두 번 사지 못한다.
  const roundTheClockBackup: Specialty[] = staffed
    .filter((x) => x.dept.providesBackup && x.n >= ROUND_THE_CLOCK_MIN_DOCTORS)
    .map((x) => x.dept.providesBackup as Specialty)

  // 부문 손익 = **고정비의 음수**. 이 층엔 흑자가 없다 — 수익은 콜 델타 한 곳에서만 들어온다.
  const segments = staffed.map((x) => ({ label: x.dept.label, profitManwon: -x.dept.fixedCostPerDoctorManwon * x.n }))
  const hires = staffed.filter((x) => !x.dept.essential).map((x) => ({ label: x.dept.label, count: x.n }))
  // 필수 배후과 채용 수는 STEMI 슬라이스가 요구하는 CARDIOLOGY 수에서 파생(spec ⓐ).
  const essentialHires = count(choices, 'CARDIOLOGY')

  const economics: HospitalEconomics = { segments, hires, essentialHires }
  const hospital: Hospital = {
    id: 'player',
    name: choices.hospitalName,
    beds,
    hasErOnCall: true,
    overcrowded: false,
    backupCare,
    roundTheClockBackup,
    economics,
    roster: materializeRoster(choices, departments), // 개인 유닛 명단(표시 전용)
  }
  return { hospital, economics }
}

/** 선택의 총 채용비(억). */
export function hiringCost(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): number {
  return departments.reduce((sum, d) => sum + d.hireCostManwon * count(choices, d.key), 0)
}

/** 예산 한도 이내인가. */
export function withinBudget(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): boolean {
  return hiringCost(choices, departments) <= SETUP_BUDGET_MANWON
}

/** 모든 과가 인원 상한 이내인가 — 예산과 독립된 제약이다(미용 10명은 예산은 통과한다). */
export function withinDeptCaps(
  choices: SetupChoices,
  departments: DepartmentSpec[] = DEPARTMENTS,
  beds: number = FIXED_BEDS,
): boolean {
  return departments.every((d) => count(choices, d.key) <= deptCap(d, beds))
}

/** 불변 갱신 — 과별 의사 수를 delta만큼 조정. 음수·비정수 방어(0 클램프·정수화)·상한 클램프, 0이면 키 제거. */
export function adjustDoctors(
  choices: SetupChoices,
  key: DeptKey,
  delta: number,
  cap: number = MAX_DOCTORS_PER_DEPT,
): SetupChoices {
  const current = choices.doctors[key] ?? 0
  const next = Math.min(cap, Math.max(0, Math.floor(current + delta)))
  const doctors = { ...choices.doctors }
  if (next === 0) delete doctors[key]
  else doctors[key] = next
  return { ...choices, doctors }
}

/** 세션을 시작할 수 있는 선택인가 — 이름이 있고 예산·과별 상한 이내. */
export function isSetupReady(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): boolean {
  return (
    choices.hospitalName.trim().length > 0 &&
    withinBudget(choices, departments) &&
    withinDeptCaps(choices, departments)
  )
}
