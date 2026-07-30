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
import { blocksWalk, GRID_W, GRID_H, tileIndex, type FurnitureKind, type RoomType, type SimWorld } from './world'
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

/** 몸을 얹는 자리(= 통행을 막지 않는 가구 = 의자·침대) 타일 — **서 있을 자리에서 빼는 집합**이다.
 *  종류를 여기서 세지 않고 `world.blocksWalk`를 되묻는 것이 계약이다(판정의 단일 출처) — 침대가
 *  그 집합에 합류한 날 이 함수가 저절로 따라온 것이 그 계약의 값이다(의사는 침대에도 안 선다). */
export function seatTiles(w: SimWorld): Set<number> {
  const out = new Set<number>()
  for (const f of w.furniture) if (!blocksWalk(f)) out.add(tileIndex(f.x, f.y))
  return out
}

/**
 * 막힌 가구 **앞**의 통행 타일 — 그 타일 자체에는 폰이 설 수 없으니 옆에 선다.
 *
 * 의사의 정위치(책상 앞)가 이 함수다 — 아침 복귀(day.freshMorning)·휴식 복귀(needs.backToDesk)·
 * 슬롯의 의사스팟이 파생식을 복제하면 의사가 자리마다 다른 칸에 선다.
 *
 * ⚠️ `seats`를 넘기면 **앉는 자리를 건너뛴다**. 의자가 통행 가능해진 뒤로 필요해졌고, 안 넘기면
 * 자동 배치된 진료실이 통째로 죽는다: 책상은 내부 좌상단 모서리라 위·왼쪽이 벽이고 오른쪽이
 * 환자 의자다 — 의자를 서는 곳으로 세면 의사스팟이 그 의자가 되고, 그러면 짝지을 의자가
 * 그것뿐이라 **슬롯이 아예 안 열린다**(진료실 정원 0). 서는 폰을 놓는 호출부는 전부 넘긴다.
 *
 * ⚠️ 가구를 **쓰는** 자리를 물을 땐 이것 말고 `occupySpot`이다(의자는 그 위에 앉는다).
 */
export function standSpot(blocked: Set<number>, at: Pt, seats?: ReadonlySet<number>): Pt | null {
  for (const d of NEIGHBORS) {
    const t = { x: at.x + d.x, y: at.y + d.y }
    if (t.x < 0 || t.y < 0 || t.x >= GRID_W || t.y >= GRID_H) continue
    if (isBlockedTile(blocked, t) || seats?.has(tileIndex(t.x, t.y))) continue
    return t
  }
  return null
}

/**
 * 그 가구를 **쓰는** 폰이 서는 칸 — 막힌 가구는 앞 통행 타일, **안 막힌 가구는 그 위**다.
 *
 * 갈림의 기준이 가구 **종류**가 아니라 **막힘**인 것이 계약이다. "의자는 앉는 가구"라는 사실은
 * 이미 `world.blocksWalk`에 한 번 적혀 있고, 여기서 종류를 다시 세면 두 곳이 갈린다 — 나중에
 * 다른 가구가 통행 가능해지는 날 이 함수만 옛 규칙으로 남아 그 가구 옆에 어색하게 선다.
 *
 * ⚠️ 앉을 수 있다는 것과 **거기까지 갈 수 있다**는 것은 다르다 — 사방이 벽으로 둘린 의자도
 * 여기서는 그 자리를 돌려준다. 도달 가능성은 호출부의 `findPath`가 판정한다(대기실 좌석 선택이
 * 첫 후보에서 멈추지 않고 다음 좌석을 보는 이유가 그것이다 — patientFlow.freeSeat).
 */
export function occupySpot(blocked: Set<number>, at: Pt): Pt | null {
  // 새 객체를 돌려주는 것이 계약이다 — 인자를 그대로 흘리면 호출부가 넘긴 **가구 객체**(kind가
  // 달린)가 좌표인 척 흘러 나가, 좌표만 비교하는 테스트·집합 키가 조용히 어긋난다.
  return isBlockedTile(blocked, at) ? standSpot(blocked, at) : { x: at.x, y: at.y }
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
  const seats = seatTiles(w) // 의사는 **의자에 서지 않는다**(standSpot 주석의 진료실 붕괴 경로)
  const out: ExamSlot[] = []
  for (const f of w.furniture) {
    if (f.kind !== 'DESK' || !region.tiles.has(tileIndex(f.x, f.y))) continue
    const desk = { x: f.x, y: f.y }
    const doctorSpot = standSpot(blocked, desk, seats)
    if (!doctorSpot) continue
    for (const d of NEIGHBORS) {
      const key = ptKey({ x: desk.x + d.x, y: desk.y + d.y })
      const chair = chairs.get(key)
      if (!chair || paired.has(key)) continue
      const patientSpot = occupySpot(blocked, chair) // 환자는 **의자 위**에 앉는다
      if (!patientSpot) continue // 앞이 막힌 가구는 짝으로 잡지 않는다 — 다음 의자를 본다
      // ⓘ 두 스팟이 겹칠 수는 없다 — 의사스팟은 `seats`를 건너뛰고 환자스팟은 언제나 의자다
      //   (아래 2패스가 의사를 의자에 앉힐 때도 **아직 짝이 없는** 의자만 집으므로 그대로다).
      paired.add(key)
      out.push({ desk, chair, doctorSpot, patientSpot })
      break
    }
  }
  /* 2패스 — 짝짓고 **남은** 인접 의자를 의사에게 준다. 사용자 보고 *"의사가 의자에 앉지 않는다"*가
     여기 있었다: 의사스팟은 정의상 `seats`를 건너뛰므로(위 standSpot) 의자가 아무리 많아도
     의사는 영영 선 채였다.

     ⚠️ **패스를 나누는 것이 계약이다.** 책상 하나를 처리하며 곧바로 남는 의자를 의사에게 주면
     그 의자가 뒤 책상의 **환자 의자였을 수** 있어, 진료실 정원이 조용히 줄어든다(책상 수 = 정원이
     이 파일의 계약이고, 앉는 연출이 그 규칙을 깎아서는 안 된다). 환자 짝짓기를 전부 끝낸 뒤에
     남은 것만 집으면 정원은 정의상 무변이다 — spots.test.ts의 「정원을 깎지 않는다」가 그 경로를 잰다. */
  for (const slot of out) {
    for (const d of NEIGHBORS) {
      const key = ptKey({ x: slot.desk.x + d.x, y: slot.desk.y + d.y })
      const chair = chairs.get(key)
      if (!chair || paired.has(key)) continue
      paired.add(key)
      slot.doctorSpot = chair
      break
    }
  }
  return out
}

/** 그 종류의 방에 놓인 그 가구를 쓸 타일들(`occupySpot` — 의자는 그 위, 나머지는 앞).
 *  **가구 하나당 자리 하나**가 이 함수의 계약이고, 그게 화면(그려진 의자·침대)과 수용 용량을
 *  같게 만든다. 의자는 자리가 곧 그 타일이라 겹침이 **구조적으로** 불가능해졌고(의자 수 = 좌석 수),
 *  dedupe가 남아 있는 것은 앞 타일을 쓰는 가구(침대·카운터) 때문이다 — 두 침대가 앞 타일 하나를
 *  나눠 가지면 두 환자가 한 칸에 겹친다(용량이 줄지언정 겹치지는 않는다).
 *  대기실 좌석(patientFlow.waitingSeats)·병동 침대(emergency.wardBeds)·욕구 좌석(needs)이
 *  **같은 기계**라 여기 하나로 둔다 — 복제하면 한쪽만 dedupe를 잃거나 방 종류 필터가 갈린다. */
export function furnitureSpots(
  w: SimWorld, roomType: RoomType, kind: FurnitureKind,
  blocked: Set<number> = buildBlockedSet(w),
  regions: readonly Region[] = computeRegions(w),
): Pt[] {
  const seen = new Set<string>()
  const out: Pt[] = []
  for (const f of furnitureIn(w, roomType, kind, regions)) {
    const spot = occupySpot(blocked, f)
    if (!spot || seen.has(ptKey(spot))) continue
    seen.add(ptKey(spot))
    out.push(spot)
  }
  return out
}

/**
 * 그 종류의 방에 놓인 그 가구의 **타일 그 자체** — `furnitureSpots`의 앞 절반이다.
 *
 * 따로 열어 둔 이유는 수납 창구다(patientFlow.cashierSlots): 카운터는 **양쪽**에 자리를 내므로
 * "가구 하나 = 자리 하나"인 위 함수로는 물을 수 없고, 그렇다고 열거를 거기서 다시 적으면
 * 방 종류 필터와 **순회 순서**(= 설치 순서)가 두 곳이 된다.
 *
 * 기본값이 있어도 **호출부가 넘기는 것이 기본 경로**다(설계 §1-2) — 틱 하나가 이 함수를
 * 여러 번 지나므로, 매번 flood fill을 새로 돌면 같은 답을 인원수만큼 다시 계산한다.
 * 폴백을 남기는 것은 테스트·단발 조회용이고, 그때도 답은 같다(순수 함수).
 */
export function furnitureIn(
  w: SimWorld, roomType: RoomType, kind: FurnitureKind,
  regions: readonly Region[] = computeRegions(w),
): Pt[] {
  const inType = new Set<number>()
  for (const r of regions) if (r.type === roomType) for (const t of r.tiles) inType.add(t)
  const out: Pt[] = []
  // 순회는 **furniture 배열 순서**(= 설치 순서)다 — 영역을 먼저 훑어 그 안의 가구를
  // 모으면 순서가 좌표 정렬로 바뀌어, 좌석이 모자랄 때 누가 먼저 앉는지가 조용히 달라진다.
  for (const f of w.furniture) {
    if (f.kind !== kind || !inType.has(tileIndex(f.x, f.y))) continue
    out.push({ x: f.x, y: f.y })
  }
  return out
}
