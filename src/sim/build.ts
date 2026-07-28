// 건설 도구 — 벽·문·가구·용도·철거. 전부 순수 함수(세계를 새로 만들어 돌려준다).
//
// 사각형 방(placeRoom)이 여기 없는 것이 이 파일의 요지다: 방은 이제 **결과**이지 명령이 아니다.
// 플레이어는 벽을 두르고 문을 내고 용도를 지정하고 가구를 놓으며, "방"은 그 지형에서 파생된다
// (regions.computeRegions). 옛 사각 방 헬퍼는 테스트 픽스처로만 남아 있다(testHelpers.placeRoom).
import { GRID_W, GRID_H, tileIndex, type FurnitureKind, type RoomType, type SimWorld } from './world'
import { computeRegions } from './regions'
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
  /** 둘러싸인 실내가 아니다(마당·벽·문 위). */
  | 'OUTDOORS'

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
 * 용도 — 클릭한 타일이 속한 **실내 영역**에 앵커를 심는다. 비용은 0이다(지정은 공사가 아니다).
 *
 * 그 영역 안의 옛 앵커를 먼저 걷어내는 것이 교체 규약이다(설계 §2). 안 걷어내면 `computeRegions`의
 * "먼저 지정이 이긴다"에 걸려 **재지정이 영영 먹히지 않는다** — 화면에서는 클릭이 먹통으로 보인다.
 *
 * 진료실인데 과가 없으면 던진다: 과 없는 EXAM 영역은 라우팅이 "아무 환자나 받는 방"으로 새게
 * 만든다. 화면이 과 선택 전에는 클릭을 막으므로(simHud.buildBlockReason) 여기는 도달 불가다.
 */
export function designateRegion(w: SimWorld, at: Pt, type: RoomType, dept?: SimDeptKey): PlaceResult {
  if (type === 'EXAM' && dept === undefined) throw new Error('진료실 용도에는 과가 필요하다')
  const i = tileIndex(at.x, at.y)
  const region = inBounds(at) ? computeRegions(w).find(r => r.tiles.has(i)) : undefined
  if (!region) return { ok: false, reason: 'OUTDOORS', tiles: [], skipped: 0, deltaManwon: 0 }
  // EXAM이 아니면 과를 떨군다 — 대기실·병동에 실려 온 과는 읽는 쪽에서 뜻을 만들어낸다.
  const anchor = { at: { x: at.x, y: at.y }, type, ...(type === 'EXAM' && dept ? { dept } : {}) }
  const kept = w.designations.filter(d => !region.tiles.has(tileIndex(d.at.x, d.at.y)))
  return {
    ok: true,
    world: { ...w, designations: [...kept, anchor] },
    tiles: [...region.tiles], skipped: 0, deltaManwon: 0,
  }
}

/**
 * 철거 — 훑은 타일의 벽·문·가구를 없애고 환불을 합산한다.
 *
 * 앵커(용도)는 건드리지 않는다: 벽이 뚫려 마당이 되면 그 좌표를 담은 영역이 사라지므로
 * 영역 인식이 알아서 무효화하고, 다시 벽을 두르면 그대로 되살아난다(좌표가 앵커인 이유).
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
