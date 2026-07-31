// 영역(Region) — 플레이어가 칠한 타일(world.zones)에서 **파생**한다. 세계에 영역 객체를
// 저장하지 않는 이유는 옛 설계와 같다(이중 기재): 저장하면 확장·축소 때 병합·분할 갱신을
// 잊는 자리가 생긴다. 파생이면 이어 칠한 조각은 저절로 하나가 되고 가운데를 지우면 저절로
// 둘이 된다. 벽·문은 여기 등장하지 않는다 — 밀폐는 더 이상 영역의 조건이 아니다(설계
// 2026-07-31-free-zone-designation). 문에 기대던 판정(체크리스트의 밀실 경고)은 도달성으로
// 대체된다(simHud.setupSteps — Task 3 예정. 지금 simHud는 아직 옛 코드다).
import { GRID_W, GRID_H, tileIndex, type RoomType, type SimWorld } from './world'
import type { SimDeptKey } from './dept'

export interface Region {
  /** 성분 내 **최소 타일 인덱스** — 좌표만으로 정해지는 결정론적 대표(옛 정의 계승). */
  id: number
  tiles: ReadonlySet<number>
  /** 필수다 — 칠한 타일에서만 성분이 나오므로 용도 없는 영역은 존재하지 않는다.
   *  (옛 정의에서는 "둘러싸였지만 용도 없음"이 있어 optional이었다.) */
  type: RoomType
  dept?: SimDeptKey
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const

/**
 * 마지막 한 번의 결과 — 키는 `zones` **참조 하나**다. zones는 SimWorld 계약상 편집 때 새 Map으로
 * 교체되므로, 값이 달라지는 유일한 경로가 곧 키가 달라지는 경로다.
 *
 * 캐시가 낭비를 지운다는 근거는 **이 파생의 실측**이다(옛 알고리즘 수치는 빌려 쓰지 않는다):
 * 방 5개(칠 110타일)에서 한 번이 0.043ms라 주 종주 4,200틱이면 179ms이고, 부지를 전면으로 칠한
 * 최악(1,536타일)은 한 번 0.57ms · 4,200틱에서 **2.39초**다. memo를 끄면 sim 스위트가
 * 28.9s → 38.8s(**+34%**)가 된다. 건설에서만 바뀌는 값을 틱마다 다시 세는 것이 그 비용이다.
 *
 * ⚠️ 제자리 수정을 하면 이 캐시는 조용히 낡는다 — 키가 **내용이 아니라 참조**이기 때문이다.
 * 이제 그 경로는 **둘 다 타입으로 막혀 있다**: `ReadonlyMap`이 `set`·`delete`를 막고,
 * 값의 `Readonly<ZonePaint>`가 꺼낸 칠의 필드 쓰기를 막는다(후자가 없으면 paint 객체를 공유하는
 * paintZone 탓에 필드 하나 쓰기가 그 칠 전체를 바꾼다 — world.ts의 zones 주석 참조).
 */
let memo: { zones: SimWorld['zones']; out: Region[] } | null = null

export function computeRegions(world: Pick<SimWorld, 'zones'>): Region[] {
  if (memo !== null && memo.zones === world.zones) return memo.out
  const out = computeRegionsUncached(world)
  memo = { zones: world.zones, out }
  return out
}

/** 캐시를 거치지 않는 계산 그 자체 — 테스트가 캐시 무해성을 이 함수와 대조해 잰다(옛 관례). */
export function computeRegionsUncached(world: Pick<SimWorld, 'zones'>): Region[] {
  const seen = new Set<number>()
  const out: Region[] = []
  // Map 순회는 삽입 순서라 그대로 쓰면 칠한 순서가 id를 흔든다 — 타일 인덱스 오름차순으로
  // 정렬해 순회한다. 그러면 각 성분의 첫 방문 타일이 곧 최소 인덱스(= id)이고, 결과 배열도
  // id 오름차순으로 나온다(옛 정의와 같은 결정론).
  const painted = [...world.zones.keys()].sort((a, b) => a - b)
  for (const start of painted) {
    if (seen.has(start)) continue
    const paint = world.zones.get(start)!
    const tiles: number[] = []
    const stack = [start]
    seen.add(start)
    while (stack.length > 0) {
      const cur = stack.pop()!
      tiles.push(cur)
      const cx = cur % GRID_W, cy = (cur - (cur % GRID_W)) / GRID_W
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue
        const ni = tileIndex(nx, ny)
        if (seen.has(ni)) continue
        const p = world.zones.get(ni)
        // 같은 (type·dept)만 이어진다 — 과가 다른 진료실은 붙여 칠해도 갈린다(설계 §2).
        if (!p || p.type !== paint.type || p.dept !== paint.dept) continue
        seen.add(ni)
        stack.push(ni)
      }
    }
    out.push({
      id: start, tiles: new Set(tiles), type: paint.type,
      ...(paint.dept !== undefined ? { dept: paint.dept } : {}),
    })
  }
  return out
}
