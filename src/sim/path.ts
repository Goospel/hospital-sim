// 그리드 A* — 4방향, 맨해튼 휴리스틱, 결정론(타이브레이크 = push 순서).
// 통행 판정은 buildBlockedSet 사전계산 1회 — isWalkable을 노드마다 부르지 않는다(56x).
import { blocksWalk, GRID_W, GRID_H, tileIndex, type SimWorld } from './world'

export interface Pt { x: number; y: number }

/** 막힌 타일 인덱스 집합 = **벽 ∪ 막는 가구** — findPath 진입 시 1회 계산.
 *  방 사각형이 아니라 벽 타일을 읽는다: 문은 벽이 아니므로 자연히 통행 가능하고,
 *  방에 속하지 않는 자유 벽(설계 PR 2)도 같은 경로로 들어온다.
 *  ⚠️ "막는가"의 판정은 `world.blocksWalk` 하나다 — 여기서 종류를 다시 세면 `isWalkable`과 갈린다. */
export function buildBlockedSet(world: SimWorld): Set<number> {
  const blocked = new Set<number>(world.walls)
  for (const f of world.furniture) if (blocksWalk(f)) blocked.add(tileIndex(f.x, f.y))
  return blocked
}

/** 사전계산한 blocked 집합으로 타일 한 칸을 조회 — 인덱스 공식(y*GRID_W+x)의 단일 출처.
 *  호출부가 공식을 다시 쓰면 buildBlockedSet과 어긋날 때 조용히 틀린 판정이 나온다. */
export const isBlockedTile = (blocked: Set<number>, p: Pt): boolean =>
  blocked.has(p.y * GRID_W + p.x)

const walkableAt = (blocked: Set<number>, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !blocked.has(y * GRID_W + x)

/** 격자 **안**이면서 막히지 않은 칸 — 경계 검사까지 붙은 `isBlockedTile`이다.
 *  호출부가 경계 검사를 손으로 붙이면 부지 가장자리에서만 틀리는 판정이 조용히 생긴다
 *  (그 자리는 테스트 픽스처가 잘 안 가는 구석이다). */
export const isFreeTile = (blocked: Set<number>, p: Pt): boolean => walkableAt(blocked, p.x, p.y)

const DIRS: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
const key = (p: Pt) => `${p.x},${p.y}`

export function findPath(world: SimWorld, from: Pt, to: Pt): Pt[] | null {
  if (from.x === to.x && from.y === to.y) return []
  const blocked = buildBlockedSet(world)
  // from은 선검사하지 않는다 — 막힌 타일에 낀 폰의 탈출 경로를 허용(의도된 비대칭)
  if (!walkableAt(blocked, to.x, to.y)) return null
  const h = (p: Pt) => Math.abs(p.x - to.x) + Math.abs(p.y - to.y)
  interface Node { p: Pt; g: number; f: number; order: number }
  const open: Node[] = [{ p: from, g: 0, f: h(from), order: 0 }]
  const came = new Map<string, Pt>()
  const gScore = new Map<string, number>([[key(from), 0]])
  let pushOrder = 1
  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f || a.order - b.order)
    const cur = open.shift()!
    if (cur.p.x === to.x && cur.p.y === to.y) {
      const path: Pt[] = []
      let k: Pt | undefined = cur.p
      while (k && !(k.x === from.x && k.y === from.y)) {
        path.unshift(k)
        k = came.get(key(k))
      }
      return path
    }
    for (const d of DIRS) {
      const nx = { x: cur.p.x + d.x, y: cur.p.y + d.y }
      if (!walkableAt(blocked, nx.x, nx.y)) continue
      const ng = cur.g + 1
      if (ng < (gScore.get(key(nx)) ?? Infinity)) {
        gScore.set(key(nx), ng)
        came.set(key(nx), cur.p)
        open.push({ p: nx, g: ng, f: ng + h(nx), order: pushOrder++ })
      }
    }
  }
  return null
}
