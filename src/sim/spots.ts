// 좌표 파생 — "가구 앞에 설 자리"를 계산하는 순수 함수들. **의존은 world·path뿐인 leaf다.**
//
// 이 파일이 따로 있는 이유는 재사용이 아니라 **위상**이다. 이 함수들은 원래 patientFlow에
// 살았는데, 욕구(needs)가 휴게실·식당 의자를 찾느라 그걸 값으로 당기면서 needs ⇄ patientFlow
// 순환이 실재하게 됐다(patientFlow는 `starvedSlowFactor`를 needs에서 당긴다). ESM은 순환을
// 통과시키지만 **최상위에서 평가되는 값**이 걸리면 TDZ로 터진다 — needs.ts의 `BREAKS` 표가
// 바로 그런 값이라, 임포트 순서가 한 번 바뀌면 런타임에 무너질 수 있었다. 좌표 파생만 leaf로
// 내리면 그 순환 자체가 사라진다.
//
// 위상: world/path → **spots** → fatigue → needs → patientFlow → emergency → day/week → tick
//
// ⚠️ **방 종류의 의미가 실린 함수는 여기 두지 않는다** — `waitingSeats`(대기실 좌석)는
// patientFlow에 남는다. 여기 있는 것은 "좌표를 어떻게 뽑는가"이지 "그 자리가 무엇인가"가 아니다.
import { GRID_W, GRID_H, type FurnitureKind, type RoomType, type SimWorld } from './world'
import { buildBlockedSet, isBlockedTile, type Pt } from './path'

/** 두 점이 같은 칸인가 — **도착 판정의 단일 출처**다(`path.length === 0`은 길이 끊겨 비워진
 *  폰과 구별되지 않으므로, 도착은 항상 위치 == dest로 판정한다).
 *  첫 인자가 `Pt`가 아니라 구조 타입인 것은 폰을 그대로 넘기기 위해서다(`samePt(p, p.dest)`). */
export const samePt = (a: { x: number; y: number }, b: Pt) => a.x === b.x && a.y === b.y

/** 좌표를 집합 키로 — 좌석·침대 점유 판정이 전부 이 한 형식을 쓴다.
 *  형식이 갈리면 같은 칸이 두 키가 되어 점유가 조용히 새고, 두 폰이 한 자리를 잡는다. */
export const ptKey = (p: Pt) => `${p.x},${p.y}`

/** 4방향 탐색 순서 — findPath의 DIRS와 같은 (위·우·아래·좌). 이 순서가 결정론의 일부다. */
const NEIGHBORS: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]

/** 가구 앞 통행 타일 — 가구 타일 자체는 막혀 있어 폰이 설 수 없다.
 *  그래서 "의자에 앉는다"는 실제로는 **의자에 인접한 첫 통행 타일에 선다**로 구현된다. */
function frontTile(blocked: Set<number>, at: Pt): Pt | null {
  for (const d of NEIGHBORS) {
    const t = { x: at.x + d.x, y: at.y + d.y }
    if (t.x < 0 || t.y < 0 || t.x >= GRID_W || t.y >= GRID_H) continue
    if (!isBlockedTile(blocked, t)) return t
  }
  return null
}

/** 방 안 가구 앞에 설 자리 — 의사의 정위치(책상 앞)와 진료 좌석(의자 앞)의 **단일 출처**다.
 *  하루를 넘길 때(day.startNextDay) 의사를 제자리로 되돌리는 것도 여기를 본다 — 파생식을
 *  복제하면 "책상 앞"이 배정과 복귀에서 갈라져 의사가 어제와 다른 칸에 선다. */
export function furnitureSpot(
  w: SimWorld, roomId: string, kind: 'DESK' | 'CHAIR', blocked: Set<number>,
): Pt | null {
  const f = w.furniture.find(x => x.roomId === roomId && x.kind === kind)
  return f ? frontTile(blocked, f) : null
}

/** 그 종류의 방에 놓인 그 가구 앞에 설 수 있는 타일들. **가구 하나당 자리 하나**가 이 함수의
 *  계약이고, 그게 화면(그려진 의자·침대)과 수용 용량을 같게 만든다 — build의 autoFurniture가
 *  앞 타일이 겹치는 가구를 애초에 놓지 않아 성립한다. 여기 dedupe는 그 계약이 깨졌을 때 두
 *  환자가 한 타일에 겹치는 것만은 막는 안전망이다(용량이 줄지언정 겹치지는 않는다).
 *  대기실 좌석(patientFlow.waitingSeats)·병동 침대(emergency.wardBeds)·욕구 좌석(needs)이
 *  **같은 기계**라 여기 하나로 둔다 — 복제하면 한쪽만 dedupe를 잃거나 방 종류 필터가 갈린다. */
export function furnitureSpots(
  w: SimWorld, roomType: RoomType, kind: FurnitureKind,
  blocked: Set<number> = buildBlockedSet(w),
): Pt[] {
  const rooms = new Set(w.rooms.filter(r => r.type === roomType).map(r => r.id))
  const seen = new Set<string>()
  const out: Pt[] = []
  for (const f of w.furniture) {
    if (f.kind !== kind || !rooms.has(f.roomId)) continue
    const spot = frontTile(blocked, f)
    if (!spot || seen.has(ptKey(spot))) continue
    seen.add(ptKey(spot))
    out.push(spot)
  }
  return out
}
