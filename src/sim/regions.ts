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
 *
 * 인자가 `SimWorld`가 아니라 **세 필드짜리 조각**인 것은 계약의 일부다: 영역이 무엇에 의존하는지가
 * 시그니처에 적혀 있어야 화면이 그 셋만 memo 키로 잡을 수 있다(TileMap의 지형 memo). `SimWorld`를
 * 통째로 받으면 폰이 한 칸 움직일 때마다 키가 흔들려 지형을 매 프레임 다시 그린다.
 */
/**
 * 마지막 한 번의 결과 — **입력 세 필드의 identity**로만 맞춘다.
 *
 * 원 설계는 "캐시하지 않는다(성급한 캐시 금지)"였고 그 판단의 근거는 *flood fill이 싸다*였다.
 * 실측이 그 전제를 뒤집었다: 한 번이 **0.25ms**이고 틱마다 한 번 부르니 주 종주(4,200틱)에서
 * 1.0초가 됐다 — 전환 전 전체 103ms짜리 작업이 10배가 됐고, week.test 세 건이 5초 제한에 걸렸다.
 * 값 자체는 옳았으므로 이건 규칙이 아니라 **낭비**다: 벽·문·용도는 건설에서만 바뀌는데,
 * 한 주를 도는 4,200틱 내내 답이 **한 번도** 달라지지 않으면서 4,200번 다시 계산됐다.
 *
 * ⚠️ 무효화를 잊을 자리가 없는 이유가 이 캐시의 전부다: 키가 **내용이 아니라 참조**이고,
 * 이 셋은 `SimWorld` 계약상 편집 때 **새 객체로 교체**된다(world.ts — "불변 취급"). 즉 값이
 * 달라지는 유일한 경로가 곧 키가 달라지는 경로다. 반대로 누가 `w.walls.add(...)`로 제자리
 * 수정을 하면 이 캐시는 조용히 낡는다 — 그 수정은 지금도 틱 순수성 계약 위반이지만, 이제
 * **틀린 답**까지 낳으므로 여기 적어 둔다.
 *
 * 한 칸짜리인 것으로 충분하다: 한 프레임 안에서 틱·HUD·렌더가 **같은 세계**를 묻는다.
 * 세계 둘을 번갈아 묻는 호출부(테스트의 A/B 대조)는 매번 빗나가 그냥 다시 계산할 뿐 틀리지 않는다.
 */
let memo: {
  walls: SimWorld['walls']
  doors: SimWorld['doors']
  designations: SimWorld['designations']
  out: Region[]
} | null = null

export function computeRegions(
  world: Pick<SimWorld, 'walls' | 'doors' | 'designations'>,
): Region[] {
  if (
    memo !== null
    && memo.walls === world.walls
    && memo.doors === world.doors
    && memo.designations === world.designations
  ) {
    return memo.out
  }
  const out = computeRegionsUncached(world)
  memo = { walls: world.walls, doors: world.doors, designations: world.designations, out }
  return out
}

/** 캐시를 거치지 않는 계산 그 자체 — 캐시가 답을 바꾸지 않는다는 것을 테스트가 이 함수와
 *  대조해 잰다(캐시를 재는 유일한 방법은 "안 거친 답"과 나란히 놓는 것이다). */
export function computeRegionsUncached(
  world: Pick<SimWorld, 'walls' | 'doors' | 'designations'>,
): Region[] {
  const seen = new Uint8Array(GRID_W * GRID_H)
  const out: Region[] = []
  for (let start = 0; start < GRID_W * GRID_H; start++) {
    if (seen[start] || world.walls.has(start) || world.doors.has(start)) continue
    // 성분 타일은 **배열**로 모으고 Set은 살아남는 성분에만 만든다. 마당은 부지 대부분(1,400타일
    // 남짓)이고 곧바로 버려지는데, 예전엔 그 버릴 성분에도 Set을 채웠다 — 실측으로 그 한 줄이
    // computeRegions 비용의 대부분이었다(틱당 0.42ms → 주 종주 4,200틱에서 1.8초).
    const tiles: number[] = []
    const doors: number[] = []
    const stack = [start]
    seen[start] = 1
    let touchesEdge = false
    while (stack.length > 0) {
      const cur = stack.pop()!
      const cx = cur % GRID_W, cy = (cur - (cur % GRID_W)) / GRID_W
      tiles.push(cur)
      if (cx === 0 || cy === 0 || cx === GRID_W - 1 || cy === GRID_H - 1) touchesEdge = true
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue
        const ni = tileIndex(nx, ny)
        if (world.doors.has(ni)) { doors.push(ni); continue }
        if (seen[ni] || world.walls.has(ni)) continue
        seen[ni] = 1
        stack.push(ni)
      }
    }
    // start는 오름차순 순회의 첫 미방문 타일이라 그 성분의 최소 인덱스다.
    // doors 배열엔 같은 문이 여러 번 들어올 수 있다(한 성분의 여러 타일이 같은 문에 닿는다) —
    // Set이 그대로 접는다. 계약(`ReadonlySet`)이 안 바뀌므로 호출부는 이 변경을 보지 못한다.
    if (!touchesEdge) out.push({ id: start, tiles: new Set(tiles), doors: new Set(doors) })
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
