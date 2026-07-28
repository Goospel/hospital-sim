// 영역(Region) — 벽·문·용도앵커에서 **파생**한다. 세계에 저장하지 않는다.
// 저장하면 벽 편집마다 갱신을 잊는 자리가 생기고, 화면과 규칙이 서로 다른 방을 보게 된다.
import { GRID_W, GRID_H, tileIndex, type RoomType, type SimWorld } from './world'
import type { SimDeptKey } from './dept'

export interface Region {
  /** 성분 내 **최소 타일 인덱스** — 좌표만으로 정해지는 결정론적 대표.
   *  배열 첨자나 생성 순서를 id로 쓰면 벽 하나 허물 때 모든 id가 밀린다. */
  id: number
  tiles: ReadonlySet<number>
  /** 이 성분에 4방 인접한 문 — 문 자체는 어느 영역에도 속하지 않는다(경계 타일). */
  doors: ReadonlySet<number>
  type?: RoomType
  dept?: SimDeptKey
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const

/**
 * 벽·문이 아닌 타일의 4방 연결 성분 중 **격자 가장자리에 닿지 않는 것**이 영역이다.
 * 가장자리에 닿으면 바깥과 이어진 마당이라 방이 아니다 — 이 한 줄이 "둘러싸였는가"의 정의다.
 *
 * 순회는 타일 인덱스 오름차순(= 좌표 정렬 순서)이라 결과 배열도 id 오름차순으로 정렬돼 나온다.
 * 캐시하지 않는다: 1,536타일 flood fill은 싸고, 성급한 캐시는 무효화를 잊는 자리를 만든다.
 */
export function computeRegions(world: SimWorld): Region[] {
  const seen = new Uint8Array(GRID_W * GRID_H)
  const out: Region[] = []
  for (let start = 0; start < GRID_W * GRID_H; start++) {
    if (seen[start] || world.walls.has(start) || world.doors.has(start)) continue
    const tiles = new Set<number>()
    const doors = new Set<number>()
    const stack = [start]
    seen[start] = 1
    let touchesEdge = false
    while (stack.length > 0) {
      const cur = stack.pop()!
      const cx = cur % GRID_W, cy = (cur - (cur % GRID_W)) / GRID_W
      tiles.add(cur)
      if (cx === 0 || cy === 0 || cx === GRID_W - 1 || cy === GRID_H - 1) touchesEdge = true
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue
        const ni = tileIndex(nx, ny)
        if (world.doors.has(ni)) { doors.add(ni); continue }
        if (seen[ni] || world.walls.has(ni)) continue
        seen[ni] = 1
        stack.push(ni)
      }
    }
    // start는 오름차순 순회의 첫 미방문 타일이라 그 성분의 최소 인덱스다.
    if (!touchesEdge) out.push({ id: start, tiles, doors })
  }
  // 용도 부여 — 지정 순서대로, 이미 용도가 있는 영역의 두 번째 앵커는 무시(먼저가 이긴다).
  // 앵커가 벽·문·마당 위면 해당 영역이 없으므로 조용히 흘린다(경고는 UI 몫 — 설계 §2).
  for (const d of world.designations) {
    const at = tileIndex(d.at.x, d.at.y)
    const region = out.find(r => r.tiles.has(at))
    if (!region || region.type !== undefined) continue
    region.type = d.type
    if (d.dept !== undefined) region.dept = d.dept
  }
  return out
}
