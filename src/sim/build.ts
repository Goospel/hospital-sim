// 건설 도구 — 벽·문·가구·용도·철거. 전부 순수 함수(세계를 새로 만들어 돌려준다).
//
// 사각형 방(placeRoom)이 여기 없는 것이 이 파일의 요지다: 방은 이제 **결과**이지 명령이 아니다.
// 플레이어는 벽을 두르고 문을 내고 용도를 지정하고 가구를 놓으며, "방"은 그 지형에서 파생된다
// (regions.computeRegions). 옛 사각 방 헬퍼는 테스트 픽스처로만 남아 있다(testHelpers.placeRoom).
import { GRID_W, GRID_H, tileIndex, type FurnitureKind, type RoomType, type SimWorld, type ZonePaint } from './world'
import type { SimDeptKey } from './dept'
import type { Pt } from './path'

/**
 * 건설비 **단일 출처**(만원). 밸런스 튜닝은 이 표 한 곳에서만 한다 — 값이 두 곳에 적히면
 * 화면이 말하는 값과 금고에서 빠지는 값이 갈리고, 그 어긋남은 에러 없이 숫자로만 나타난다.
 * 가구 키는 `FurnitureKind`와 같은 이름이라 종류가 늘면 tsc가 여기서 막는다.
 */
export const BUILD_COST = {
  WALL: 30, DOOR: 50, DESK: 100, CHAIR: 20, BED: 300, COUNTER: 100,
} as const satisfies Record<FurnitureKind | 'WALL' | 'DOOR', number>

export type BuildCostKey = keyof typeof BUILD_COST

/** 철거 환불 — 건설비의 절반(내림). 표에서 파생하므로 비용을 튜닝하면 환불이 저절로 따라온다. */
export const refundOf = (kind: BuildCostKey): number => Math.floor(BUILD_COST[kind] / 2)

export type BuildReason =
  /** 실제로 건드릴 타일이 하나도 없다(전부 이미 차 있거나, 부술 것이 없다). */
  | 'NOTHING'
  | 'NO_MONEY'
  /** 문은 벽 위에만 낼 수 있다. */
  | 'NOT_WALL'

/**
 * 건설 한 번의 결과.
 *
 * 실패해도 `tiles`·`deltaManwon`이 실리는 것이 계약이다 — **미리보기가 같은 값을 읽기** 때문이다:
 * 화면은 판정을 베끼지 않고 이 함수를 그대로 한 번 돌려 하이라이트와 금액을 그린다(옛 placeRoom
 * 미리보기 관례 계승). 거부될 때의 금액이 없으면 "붉게 얼마"를 그릴 수가 없다.
 */
export type PlaceResult =
  | { ok: true; world: SimWorld; tiles: readonly number[]; skipped: number; deltaManwon: number }
  | { ok: false; reason: BuildReason; tiles: readonly number[]; skipped: number; deltaManwon: number }

const inBounds = (t: Pt): boolean => t.x >= 0 && t.y >= 0 && t.x < GRID_W && t.y < GRID_H

/** 이미 무언가 서 있는 타일 — 벽 ∪ 문 ∪ 가구. 설치 도구는 전부 이 집합을 건너뛴다. */
function occupied(w: SimWorld): Set<number> {
  const out = new Set<number>(w.walls)
  for (const d of w.doors) out.add(d)
  for (const f of w.furniture) out.add(tileIndex(f.x, f.y))
  return out
}

/**
 * 설치 도구의 공통 뼈대 — 벽·가구가 **같은 규칙**을 쓴다는 것이 여기 한 곳에 적혀 있다.
 *
 * 순서가 계약이다: ① 점유 타일을 건너뛰어 대상만 추리고 ② 대상이 0이면 NOTHING ③ **설치 전에**
 * 값을 판정한다. ③이 뒤로 밀리면 부분 설치가 금고를 조금씩 긁고 나서 거부되는 세계가 생긴다.
 */
function install(
  w: SimWorld,
  tiles: readonly Pt[],
  cost: BuildCostKey,
  apply: (world: SimWorld, targets: readonly number[]) => SimWorld,
): PlaceResult {
  const taken = occupied(w)
  const seen = new Set<number>()
  const targets: number[] = []
  let skipped = 0
  for (const t of tiles) {
    if (!inBounds(t)) { skipped += 1; continue }
    const i = tileIndex(t.x, t.y)
    if (seen.has(i)) continue // 같은 타일을 두 번 요청한 것은 건너뜀이 아니다(드래그 모서리)
    seen.add(i)
    if (taken.has(i)) { skipped += 1; continue }
    targets.push(i)
  }
  if (targets.length === 0) return { ok: false, reason: 'NOTHING', tiles: [], skipped, deltaManwon: 0 }
  const price = BUILD_COST[cost] * targets.length
  if (price > w.treasuryManwon) return { ok: false, reason: 'NO_MONEY', tiles: targets, skipped, deltaManwon: -price }
  return {
    ok: true,
    world: { ...apply(w, targets), treasuryManwon: w.treasuryManwon - price },
    tiles: targets, skipped, deltaManwon: -price,
  }
}

/** 벽 — 이미 벽·문·가구가 선 타일은 건너뛰고 나머지만 세운다(부분 설치). */
export function buildWalls(w: SimWorld, tiles: readonly Pt[]): PlaceResult {
  return install(w, tiles, 'WALL', (world, targets) => ({
    ...world,
    walls: new Set([...world.walls, ...targets]),
  }))
}

/** 가구 — 벽과 같은 부분 설치 규칙. 마당에도 놓인다(기능은 용도 영역 안에서만 — 경고가 잡는다). */
export function placeFurniture(w: SimWorld, kind: FurnitureKind, tiles: readonly Pt[]): PlaceResult {
  return install(w, tiles, kind, (world, targets) => ({
    ...world,
    // 요청 순서를 그대로 유지한다 — 가구 배열 순서가 스팟 선택의 타이브레이크다(spots.ts).
    furniture: [...world.furniture, ...targets.map(i => ({ kind, x: i % GRID_W, y: (i - (i % GRID_W)) / GRID_W }))],
  }))
}

/**
 * 문 — **벽 타일만** 전환한다. 벽에서 빼고 문에 넣으므로 통행이 열리고 영역 경계는 남는다.
 * 벽값을 환불하지 않는 것이 계약이다(설계 §2): 문은 벽을 허무는 게 아니라 벽 위에 다는 것이다.
 */
export function placeDoor(w: SimWorld, at: Pt): PlaceResult {
  const i = tileIndex(at.x, at.y)
  if (!inBounds(at) || !w.walls.has(i)) {
    return { ok: false, reason: 'NOT_WALL', tiles: [], skipped: 0, deltaManwon: 0 }
  }
  const price = BUILD_COST.DOOR
  if (price > w.treasuryManwon) {
    return { ok: false, reason: 'NO_MONEY', tiles: [i], skipped: 0, deltaManwon: -price }
  }
  const walls = new Set(w.walls)
  walls.delete(i)
  return {
    ok: true,
    world: { ...w, walls, doors: new Set([...w.doors, i]), treasuryManwon: w.treasuryManwon - price },
    tiles: [i], skipped: 0, deltaManwon: -price,
  }
}

/**
 * 용도 칠하기 — 드래그한 타일에 (type·dept)를 입힌다. 영역은 여기서 만들지 않는다(파생 —
 * regions.computeRegions). 규칙(설계 §1·§3):
 * - **벽·문 타일은 칠해지지 않는다**(건너뜀). 가구 타일은 칠해진다 — 가구는 영역 안의
 *   것이지 경계가 아니다.
 * - **나중 칠한 것이 이긴다** — 다른 용도 타일은 덮어쓴다. 같은 (type·dept)는 건너뜀.
 * - 지정은 무료다(deltaManwon 0). 실패 계약은 install과 같다(미리보기가 같은 값을 읽는다).
 */
export function paintZone(w: SimWorld, tiles: readonly Pt[], type: RoomType, dept?: SimDeptKey): PlaceResult {
  if (type === 'EXAM' && dept === undefined) throw new Error('진료실 용도에는 과가 필요하다')
  // EXAM이 아니면 과를 떨군다 — 대기실에 실려 온 과는 읽는 쪽에서 뜻을 만들어낸다(옛 규약).
  const paint: ZonePaint = type === 'EXAM' && dept !== undefined ? { type, dept } : { type }
  const seen = new Set<number>()
  const targets: number[] = []
  let skipped = 0
  for (const t of tiles) {
    if (!inBounds(t)) { skipped += 1; continue }
    const i = tileIndex(t.x, t.y)
    if (seen.has(i)) continue
    seen.add(i)
    if (w.walls.has(i) || w.doors.has(i)) { skipped += 1; continue }
    const cur = w.zones.get(i)
    if (cur !== undefined && cur.type === paint.type && cur.dept === paint.dept) { skipped += 1; continue }
    targets.push(i)
  }
  if (targets.length === 0) return { ok: false, reason: 'NOTHING', tiles: [], skipped, deltaManwon: 0 }
  const zones = new Map(w.zones)
  for (const i of targets) zones.set(i, paint)
  return { ok: true, world: { ...w, zones }, tiles: targets, skipped, deltaManwon: 0 }
}

/** 지정 해제 — 드래그한 타일의 칠만 지운다. 벽·가구는 그대로(철거 도구와 분리 — 설계 §1). */
export function eraseZone(w: SimWorld, tiles: readonly Pt[]): PlaceResult {
  const seen = new Set<number>()
  const targets: number[] = []
  let skipped = 0
  for (const t of tiles) {
    if (!inBounds(t)) { skipped += 1; continue }
    const i = tileIndex(t.x, t.y)
    if (seen.has(i)) continue
    seen.add(i)
    if (!w.zones.has(i)) { skipped += 1; continue }
    targets.push(i)
  }
  if (targets.length === 0) return { ok: false, reason: 'NOTHING', tiles: [], skipped, deltaManwon: 0 }
  const zones = new Map(w.zones)
  for (const i of targets) zones.delete(i)
  return { ok: true, world: { ...w, zones }, tiles: targets, skipped, deltaManwon: 0 }
}

/**
 * 철거 — 훑은 타일의 벽·문·가구를 없애고 환불을 합산한다.
 *
 * 칠(zones)은 건드리지 않는다 — 벽을 부숴도 영역은 그대로다(밀폐가 영역의 조건이 아니게 된
 * 것이 이 설계의 목적). 영역을 지우는 길은 「지정 해제」(eraseZone)뿐이다.
 */
export function demolish(w: SimWorld, tiles: readonly Pt[]): PlaceResult {
  const wanted = new Set<number>()
  for (const t of tiles) if (inBounds(t)) wanted.add(tileIndex(t.x, t.y))

  const walls = new Set(w.walls)
  const doors = new Set(w.doors)
  const hit = new Set<number>()
  let refund = 0
  for (const i of wanted) {
    if (walls.delete(i)) { refund += refundOf('WALL'); hit.add(i) }
    if (doors.delete(i)) { refund += refundOf('DOOR'); hit.add(i) }
  }
  const furniture = w.furniture.filter(f => {
    const i = tileIndex(f.x, f.y)
    if (!wanted.has(i)) return true
    refund += refundOf(f.kind)
    hit.add(i)
    return false
  })

  const targets = [...hit].sort((a, b) => a - b)
  if (targets.length === 0) {
    return { ok: false, reason: 'NOTHING', tiles: [], skipped: wanted.size, deltaManwon: 0 }
  }
  return {
    ok: true,
    world: { ...w, walls, doors, furniture, treasuryManwon: w.treasuryManwon + refund },
    tiles: targets, skipped: wanted.size - targets.length, deltaManwon: refund,
  }
}
