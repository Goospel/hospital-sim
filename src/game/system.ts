import type { Specialty } from './types'
import { callSeed, seededUnit } from './daysim'

// 전국 의사 풀 — 이 게임 세상에 존재하는(아직 배치 안 된) 배후과 의사의 수. 순수·결정론.
// 초기값은 게임 스케일 각색(부호·소규모·재생 불가만 근거 — grounding §①. 실제 헤드카운트를
// '현재 실측'으로 쓰지 않는다). 흉부외과가 가장 희소(실제 1,088명 최소)라는 대소만 지킨다.

export interface SystemState {
  pool: Record<Specialty, number>
  poolInitial: Record<Specialty, number> // 표시용 초기 사본(에필로그 "N → 잔여")
}

/** 세상에 존재하는 과별 의사 수(각색). 대소: 흉부 < 순환기·산부·신경 < 외과·내과. */
export const POOL_INITIAL: Record<Specialty, number> = {
  THORACIC_SURGERY: 2,
  CARDIOLOGY: 4,
  OBSTETRICS: 3,
  NEUROSURGERY: 3,
  GENERAL_SURGERY: 5,
  INTERNAL_MEDICINE: 6,
}

export function initSystem(): SystemState {
  return { pool: { ...POOL_INITIAL }, poolInitial: { ...POOL_INITIAL } }
}

export function poolRemaining(system: SystemState, s: Specialty): number {
  return system.pool[s]
}

export function canHire(system: SystemState, s: Specialty, count: number): boolean {
  return system.pool[s] >= count
}

/** 채용 증분(양수)만큼 풀 차감, 0 클램프. 음수 증분(해고)은 무시(성장은 증축만). */
export function hireDelta(system: SystemState, deltas: Partial<Record<Specialty, number>>): SystemState {
  const pool = { ...system.pool }
  for (const key of Object.keys(deltas) as Specialty[]) {
    const d = deltas[key] ?? 0
    if (d > 0) pool[key] = Math.max(0, pool[key] - d)
  }
  return { ...system, pool }
}

/** 매주 배경 감소 — 다른 병원 채용·은퇴>배출. 주차 seed로 한 과를 골라 1 차감(0 클램프). */
export function backgroundAttrition(system: SystemState, week: number): SystemState {
  const keys = Object.keys(POOL_INITIAL) as Specialty[]
  const idx = Math.floor(seededUnit(callSeed(week, 0, 0, 7)) * keys.length)
  const key = keys[idx]
  const pool = { ...system.pool, [key]: Math.max(0, system.pool[key] - 1) }
  return { ...system, pool }
}
