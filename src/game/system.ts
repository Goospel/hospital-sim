import type { Specialty } from './types'
import { REGION_INITIAL, findRegion, type RegionState, type WorldState } from './world'

// 전국 채용 가능 풀 — 이제 세계(world.regions)의 파생값이다. 순수·결정론.
// 채용 가능 = METRO + RURAL 의사 합. 수도권(CAPITAL)에 정착한 의사는 지방 병원에 안 온다.
// 매주 드리프트(stepWorld)가 RURAL→CAPITAL로 옮길 때마다 이 풀이 준다 —
// 옛 backgroundAttrition(매주 시드로 1 차감)이 하던 일을 세계 시뮬이 흡수했다(spec 2026-07-26 §3·§6).
// 같은 변동을 두 군데서 굴리면 이중 기재라, 원천을 세계 하나로 통일한다.
//
// ⚠️ **이 파일에는 풀을 직접 쓰는 함수가 없다 — 앞으로도 두지 않는다.** 옛 hireDelta(채용)·
// releaseFromPool(사직)·backgroundAttrition(배경 감소)이 그런 함수였고, 셋 다 삭제됐다:
// 파생값을 직접 쓰면 `pool ≡ hirablePool(world.regions)` 불변식을 우회하는 두 번째 쓰기 경로가 생겨,
// 풀만 줄고 세계는 그대로인 상태가 조용히 만들어진다. 감소는 전부 world.ts에서 일어난다 —
// stepWorld(드리프트) · hireFromRegions(채용=이동) · resignFromRegions(사직=소멸).

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

/**
 * **세계 없는 자리값** — 초기 세계의 파생본을 그대로 담는다.
 * 세계가 있는 자리에선 쓰지 않는다(`deriveSystem`이 그 자리다). 남은 유일한 소비자는
 * `startSession`(LANDING): 아직 world가 없어 파생할 원천 자체가 없는 유일한 페이즈다.
 */
export function initSystem(): SystemState {
  return { pool: { ...POOL_INITIAL }, poolInitial: { ...POOL_INITIAL } }
}

/**
 * 세계에서 풀 스냅샷을 재파생 — 세계가 변한 **모든** 지점 직후 호출
 * (enterWorldEvent·beginSetup·completeSetup·completeWeek·nextWeek·applyGrowth).
 * 한 곳이라도 빠지면 `system.pool ≡ hirablePool(world.regions)` 일관성 불변식이 조용히 깨진다
 * (session.test.ts가 그 불변식을 지점별로 못박는다).
 *
 * **두 필드의 기준 세계가 다르다(의도)**: `pool`은 **인자로 받은 지금 세계**의 파생이고,
 * `poolInitial`은 기본값이 모듈 상수 `POOL_INITIAL` = **초기 세계**(REGION_INITIAL)의 파생이다.
 * 그래서 지역 쇼크가 있는 세계로 개원하면 에필로그의 "N → 잔여"가 *쇼크 후*가 아니라
 * **쇼크 전 원본 대비**로 읽힌다 — 그게 의도다. 에필로그는 "이 세상에 원래 몇 명 있었나"를
 * 병치하는 자리라, 개원 시점의 쇼크까지 이미 반영된 분모는 그 질문에 답하지 못한다.
 * (주 경계에서는 session.ts가 `state.system.poolInitial`을 넘겨 그 원본을 실어 나른다.)
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
