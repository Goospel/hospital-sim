// 좌표 파생 — "가구 앞에 설 자리"를 계산하는 순수 함수들. **의존은 world·path뿐인 leaf다.**
//
// 이 파일이 따로 있는 이유는 재사용이 아니라 **위상**이다. 이 함수들은 원래 patientFlow에
// 살았는데, 욕구(needs)가 휴게실·식당 의자를 찾느라 그걸 값으로 당기면서 needs ⇄ patientFlow
// 순환이 실재하게 됐다(patientFlow는 `starvedSlowFactor`를 needs에서 당긴다). ESM은 순환을
// 통과시키지만 **최상위에서 평가되는 값**이 걸리면 TDZ로 터진다 — needs.ts의 `BREAKS` 표가
// 바로 그런 값이라, 임포트 순서가 한 번 바뀌면 런타임에 무너질 수 있었다. 좌표 파생만 leaf로
// 내리면 그 순환 자체가 사라진다.
//
// 위상: world/path/regions → **spots** → fatigue → needs → patientFlow → emergency → day/week → tick
// (regions.ts도 leaf다 — world의 격자 상수와 dept 타입만 본다. 순환은 늘지 않는다.)
//
// ⚠️ **방 종류의 의미가 실린 함수는 여기 두지 않는다** — `waitingSeats`(대기실 좌석)는
// patientFlow에 남는다. 여기 있는 것은 "좌표를 어떻게 뽑는가"이지 "그 자리가 무엇인가"가 아니다.
import { GRID_W, GRID_H, tileIndex, type FurnitureKind, type RoomType, type SimWorld } from './world'
import { computeRegions, type Region } from './regions'
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
 *  그래서 "의자에 앉는다"는 실제로는 **의자에 인접한 첫 통행 타일에 선다**로 구현된다.
 *  의사의 정위치(책상 앞)도 같은 함수다 — 아침 복귀(day.freshMorning)·휴식 복귀(needs.backToDesk)·
 *  슬롯의 의사스팟이 파생식을 복제하면 의사가 자리마다 다른 칸에 선다. */
export function standSpot(blocked: Set<number>, at: Pt): Pt | null {
  for (const d of NEIGHBORS) {
    const t = { x: at.x + d.x, y: at.y + d.y }
    if (t.x < 0 || t.y < 0 || t.x >= GRID_W || t.y >= GRID_H) continue
    if (!isBlockedTile(blocked, t)) return t
  }
  return null
}

/** 진료 슬롯 하나 — **책상 하나에 의사 하나**의 담지자다(설계 §4).
 *  네 좌표를 한 값으로 묶는 이유는 배정(의사스팟)과 라우팅(환자의자 앞)이 **같은 짝짓기**를
 *  봐야 하기 때문이다: 따로 계산하면 의사가 앉은 책상과 환자가 앉는 의자가 서로 다른 짝이 된다. */
export interface ExamSlot { desk: Pt; chair: Pt; doctorSpot: Pt; patientSpot: Pt }

/**
 * 그 영역 안의 진료 슬롯들 — **책상 수가 곧 그 진료실의 정원**이다(설계 §4).
 *
 * 슬롯의 성립 조건은 셋이다: ① 아직 짝이 없는 4방 인접 CHAIR(DIRS 순서 = 위·우·아래·좌)
 * ② 책상 앞에 의사가 설 통행 타일 ③ 그 의자 앞에 환자가 설 통행 타일. 하나라도 없으면
 * 그 책상은 슬롯이 **아니다** — "책상만 놓으면 안 되고 의자를 붙여야 한다"가 배치 인과로
 * 드러나는 자리다(에러가 아니라 배치의 결과이고, HUD 경고가 그 사실을 말한다).
 *
 * 열거는 **furniture 배열 순서**(= 설치 순서)다. 좌표 정렬로 바꾸면 의자가 모자랄 때 어느
 * 책상이 가져가는지가 조용히 달라진다(furnitureSpots와 같은 계약).
 *
 * ⚠️ 용도(EXAM)를 **여기서 보지 않는다** — 인자로 받은 영역만 훑는다. 방 종류의 의미는
 * 호출부의 몫이라는 이 파일 머리말의 경계 그대로다(이름이 exam인 것은 유일 소비자가 진료실이기 때문).
 */
export function examSlots(
  w: SimWorld, region: Region, blocked: Set<number> = buildBlockedSet(w),
): ExamSlot[] {
  const chairs = new Map<string, Pt>()
  for (const f of w.furniture) {
    if (f.kind === 'CHAIR' && region.tiles.has(tileIndex(f.x, f.y))) chairs.set(ptKey(f), { x: f.x, y: f.y })
  }
  const paired = new Set<string>()
  const out: ExamSlot[] = []
  for (const f of w.furniture) {
    if (f.kind !== 'DESK' || !region.tiles.has(tileIndex(f.x, f.y))) continue
    const desk = { x: f.x, y: f.y }
    const doctorSpot = standSpot(blocked, desk)
    if (!doctorSpot) continue
    for (const d of NEIGHBORS) {
      const key = ptKey({ x: desk.x + d.x, y: desk.y + d.y })
      const chair = chairs.get(key)
      if (!chair || paired.has(key)) continue
      const patientSpot = standSpot(blocked, chair)
      if (!patientSpot) continue // 앞이 막힌 의자는 짝으로 잡지 않는다 — 다음 의자를 본다
      paired.add(key)
      out.push({ desk, chair, doctorSpot, patientSpot })
      break
    }
  }
  return out
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
  regions: readonly Region[] = computeRegions(w),
): Pt[] {
  // 기본값이 있어도 **호출부가 넘기는 것이 기본 경로**다(설계 §1-2) — 틱 하나가 이 함수를
  // 여러 번 지나므로, 매번 flood fill을 새로 돌면 같은 답을 인원수만큼 다시 계산한다.
  // 폴백을 남기는 것은 테스트·단발 조회용이고, 그때도 답은 같다(순수 함수).
  const inType = new Set<number>()
  for (const r of regions) if (r.type === roomType) for (const t of r.tiles) inType.add(t)
  const seen = new Set<string>()
  const out: Pt[] = []
  // 순회는 여전히 **furniture 배열 순서**(= 설치 순서)다 — 영역을 먼저 훑어 그 안의 가구를
  // 모으면 순서가 좌표 정렬로 바뀌어, 좌석이 모자랄 때 누가 먼저 앉는지가 조용히 달라진다.
  for (const f of w.furniture) {
    if (f.kind !== kind || !inType.has(tileIndex(f.x, f.y))) continue
    const spot = standSpot(blocked, f)
    if (!spot || seen.has(ptKey(spot))) continue
    seen.add(ptKey(spot))
    out.push(spot)
  }
  return out
}
