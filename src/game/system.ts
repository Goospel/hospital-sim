import type { Specialty } from './types'
import { REGION_INITIAL, findRegion, type RegionState, type WorldState } from './world'

// 전국 채용 가능 풀 — 이제 세계(world.regions)의 파생값이다. 순수·결정론.
// 채용 가능 = METRO + RURAL 의사 합. 수도권(CAPITAL)에 정착한 의사는 지방 병원에 안 온다.
// 매주 드리프트(stepWorld)가 RURAL→CAPITAL로 옮길 때마다 이 풀이 준다 —
// 옛 backgroundAttrition(매주 시드로 1 차감)이 하던 일을 세계 시뮬이 흡수했다(spec 2026-07-26 §3·§6).
// 같은 변동을 두 군데서 굴리면 이중 기재라, 원천을 세계 하나로 통일한다.

export interface SystemState {
  pool: Record<Specialty, number>
  poolInitial: Record<Specialty, number> // 표시용 초기 사본(에필로그 "N → 잔여")
}

/**
 * 채용 가능 풀 = METRO+RURAL 의사 합 — **저장하지 않는 파생값**.
 * 지역 조회는 world.ts의 `findRegion`을 재사용한다(`find(...)!`를 새로 쓰지 않는다 — 조회 이디엄 통일).
 */
export function hirablePool(regions: RegionState[]): Record<Specialty, number> {
  const metro = findRegion(regions, 'METRO')
  const rural = findRegion(regions, 'RURAL')
  const pool = {} as Record<Specialty, number>
  for (const s of Object.keys(metro.doctors) as Specialty[]) {
    pool[s] = metro.doctors[s] + rural.doctors[s]
  }
  return pool
}

/**
 * 세상에 존재하는 과별 채용 가능 의사 수 — `REGION_INITIAL`의 파생(단일 출처, 이중 기재 방지).
 * 값은 기존 각색 고정값(흉부 2 / 순환기 4 / 산부 3 / 신경 3 / 외과 5 / 내과 6)과 정확히 같다 —
 * 원천만 세계로 옮겼고 밸런스는 보존한다(world.test.ts의 METRO+RURAL 합 테스트가 그 가드).
 */
export const POOL_INITIAL: Record<Specialty, number> = hirablePool(REGION_INITIAL)

export function initSystem(): SystemState {
  return { pool: { ...POOL_INITIAL }, poolInitial: { ...POOL_INITIAL } }
}

/**
 * 세계에서 풀 스냅샷을 재파생 — 세계가 변한 **모든** 지점(nextWeek·applyGrowth·completeSetup) 직후 호출.
 * 한 곳이라도 빠지면 `system.pool ≡ hirablePool(world.regions)` 일관성 불변식이 조용히 깨진다
 * (session.test.ts가 그 불변식을 지점별로 못박는다).
 *
 * `poolInitial`은 표시용 초기 사본이라 세계와 무관하게 실려 다닌다 — 기본값은 초기 세계 파생본.
 */
export function deriveSystem(
  world: WorldState, poolInitial: Record<Specialty, number> = POOL_INITIAL,
): SystemState {
  return { pool: hirablePool(world.regions), poolInitial: { ...poolInitial } }
}

export function poolRemaining(system: SystemState, s: Specialty): number {
  return system.pool[s]
}

export function canHire(system: SystemState, s: Specialty, count: number): boolean {
  return system.pool[s] >= count
}
