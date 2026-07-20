import type { DepartmentSpec, SetupChoices } from './types'
import { DEPARTMENTS, SETUP_BUDGET_BILLIONS, hiringCost } from './setup'

// 금고 — 쓸 수 있는 잔고. 순수. 개원 잔액에서 출발, 매주 순이익 누적(session.ts), 성장에서 차감.
// 배후과는 구조적 적자라 배후과만 채우면 금고가 말라 성장·유지 불가 → 미용 유혹(② 재정 지속불가).

export function initialTreasury(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): number {
  return SETUP_BUDGET_BILLIONS - hiringCost(choices, departments)
}

/** 채용 증분 비용(억) — next가 prev보다 늘린 인원의 채용비 합. 병상 비용은 session.applyGrowth가 합산. */
export function doctorDeltaCost(
  prev: SetupChoices,
  next: SetupChoices,
  departments: DepartmentSpec[] = DEPARTMENTS,
): number {
  return departments.reduce((sum, d) => {
    const delta = (next.doctors[d.key] ?? 0) - (prev.doctors[d.key] ?? 0)
    return sum + (delta > 0 ? delta * d.hireCostBillions : 0)
  }, 0)
}

export function withinTreasury(cost: number, treasury: number): boolean {
  return cost <= treasury
}
