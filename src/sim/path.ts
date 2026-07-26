// 그리드 A* — 4방향, 맨해튼 휴리스틱, 결정론(타이브레이크 = push 순서).
// 통행 판정은 buildBlockedSet 사전계산 1회 — isWalkable을 노드마다 부르지 않는다(56x).
import { GRID_W, GRID_H, blockedPerimeter, type SimWorld } from './world'

export interface Pt { x: number; y: number }

/** 막힌 타일 인덱스(y*GRID_W+x) 집합 — findPath 진입 시 1회 계산 */
export function buildBlockedSet(world: SimWorld): Set<number> {
  const blocked = new Set<number>()
  for (const r of world.rooms) for (const t of blockedPerimeter(r)) blocked.add(t.y * GRID_W + t.x)
  for (const f of world.furniture) blocked.add(f.y * GRID_W + f.x)
  return blocked
}

const walkableAt = (blocked: Set<number>, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !blocked.has(y * GRID_W + x)

const DIRS: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
const key = (p: Pt) => `${p.x},${p.y}`

export function findPath(world: SimWorld, from: Pt, to: Pt): Pt[] | null {
  if (from.x === to.x && from.y === to.y) return []
  const blocked = buildBlockedSet(world)
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
