// 환자 라이프사이클 — 도착·대기·배정·진료·이탈. tick에서 분당 1회 호출한다.
// 여기가 시뮬을 "게임"으로 만드는 자리다: 방·가구·의사·시간이 여기서 처음으로 서로를 본다.
//
// 설계 규칙 셋:
//  ① RNG 0 — 도착 판정은 seed 해시(seededUnit)뿐이다. Math.random·Date.now 금지(결정론).
//  ② 도착 판정은 **위치 == dest**다. `path.length === 0`은 "길이 끊겨 비워진 폰"과 구별되지 않는다.
//  ③ 경로는 목적지가 정해질 때 1회만 계산한다. 매 분 재탐색하면 findPath(~3ms)가 인원수만큼 곱해진다.
import { seededUnit } from '../game/daysim'
import { buildBlockedSet, findPath, isBlockedTile, type Pt } from './path'
import { GRID_W, GRID_H, type Room, type SimWorld } from './world'
import type { Pawn, PatientStage } from './pawn'

/** 정문 — 그리드 아래 변 중앙. 방은 y=GRID_H-1에 지을 수 없어(placeRoom 경계) 항상 통행 가능하다. */
export const ENTRANCE: Pt = { x: 24, y: GRID_H - 1 }
export const EXAM_DURATION_MIN = 20
export const EXAM_REVENUE_MANWON = 30
/** 대기 인내 — 이만큼 앉아 있었는데 안 불리면 떠난다(수익 0). */
export const PATIENCE_MIN = 90
export const ARRIVAL_WINDOW_MIN = 480     // 주간(09:00~17:00)에만 도착
export const ARRIVAL_PROB_PER_MIN = 1 / 8 // 평균 8분에 한 명

const samePt = (a: { x: number; y: number }, b: Pt) => a.x === b.x && a.y === b.y
const ptKey = (p: Pt) => `${p.x},${p.y}`

export function stepPatients(world: SimWorld): SimWorld {
  let w = maybeArrive(world)
  w = assignDoctorRooms(w)
  w = assignWaitingToExam(w)
  return progressStages(w)
}

// ─── 좌표 파생 ────────────────────────────────────────────────────────────────

/** 4방향 탐색 순서 — findPath와 같은 (위·우·아래·좌). 이 순서가 결정론의 일부다. */
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

function furnitureSpot(w: SimWorld, blocked: Set<number>, roomId: string, kind: 'DESK' | 'CHAIR'): Pt | null {
  const f = w.furniture.find(x => x.roomId === roomId && x.kind === kind)
  return f ? frontTile(blocked, f) : null
}

const insideRoom = (r: Room, p: { x: number; y: number }) =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h

// ─── 도착 ────────────────────────────────────────────────────────────────────

/** 대기실 의자 중 아무도 노리지 않는 자리의 "앞 타일". 좌석 점유는 환자의 dest로 표현된다 —
 *  별도 점유 테이블을 두면 폰 제거·이동과 어긋날 수 있고, dest는 어차피 재탐색용으로 이미 있다. */
function freeSeat(w: SimWorld, blocked: Set<number>): Pt | null {
  const taken = new Set(
    w.pawns
      .filter(p => (p.stage === 'ENTERING' || p.stage === 'WAITING') && p.dest)
      .map(p => ptKey(p.dest!)),
  )
  const waitingRooms = new Set(w.rooms.filter(r => r.type === 'WAITING').map(r => r.id))
  for (const f of w.furniture) {
    if (f.kind !== 'CHAIR' || !waitingRooms.has(f.roomId)) continue
    const spot = frontTile(blocked, f)
    if (spot && !taken.has(ptKey(spot))) return spot
  }
  return null
}

function maybeArrive(w: SimWorld): SimWorld {
  // 실효 구간은 분 1~479다 — tick이 minute을 먼저 올리고 부르므로 0분은 판정 자체가 없고,
  // 480분은 창이 닫힌 쪽이다(경계 테스트가 이 두 끝을 잠근다).
  if (w.minute >= ARRIVAL_WINDOW_MIN) return w
  // 분마다 독립 판정 — 이래야 도착이 몰릴 때 몰리고(대기열이 생기고) 빌 때 빈다.
  if (seededUnit(w.seed * 100_000 + w.day * 1_000 + w.minute) >= ARRIVAL_PROB_PER_MIN) return w
  const blocked = buildBlockedSet(w)
  const seat = freeSeat(w, blocked)
  const path = seat ? findPath(w, ENTRANCE, seat) : null
  // 앉을 데가 없거나 거기까지 갈 수 없으면 문간에서 발길을 돌린다 — 폰을 만들지도 않는다.
  if (!seat || !path) return { ...w, stats: { ...w.stats, leftCount: w.stats.leftCount + 1 } }
  const patient: Pawn = {
    id: `pat-${w.nextId}`, kind: 'PATIENT',
    x: ENTRANCE.x, y: ENTRANCE.y, path, dest: seat, stage: 'ENTERING',
  }
  return { ...w, nextId: w.nextId + 1, pawns: [...w.pawns, patient] }
}

// ─── 배정 ────────────────────────────────────────────────────────────────────

/** 방 없는 의사를 빈 EXAM 방에 배정하고 책상 옆으로 보낸다(폰 순서 × 방 순서 = 결정론). */
function assignDoctorRooms(w: SimWorld): SimWorld {
  const taken = new Set(w.pawns.map(p => p.roomId).filter((id): id is string => !!id))
  const examRooms = w.rooms.filter(r => r.type === 'EXAM' && !taken.has(r.id))
  if (examRooms.length === 0) return w
  if (!w.pawns.some(p => p.kind === 'DOCTOR' && !p.roomId)) return w
  const blocked = buildBlockedSet(w)
  const pawns = w.pawns.map(p => {
    if (p.kind !== 'DOCTOR' || p.roomId) return p
    for (const room of examRooms) {
      if (taken.has(room.id)) continue
      const spot = furnitureSpot(w, blocked, room.id, 'DESK')
      if (!spot) continue
      const path = findPath(w, { x: p.x, y: p.y }, spot)
      if (!path) continue // 못 가는 방은 다른 방을 본다 — 배정은 다음 분에 다시 시도된다
      taken.add(room.id)
      return { ...p, roomId: room.id, dest: spot, path }
    }
    return p
  })
  return { ...w, pawns }
}

/** 대기 환자(도착순)와 유휴 의사를 짝짓는다. 의사의 "바쁨"은 환자의 doctorId로만 표현된다 —
 *  의사 쪽에 busy 플래그를 두면 환자가 사라질 때(제거·이탈) 되돌리는 걸 잊어 방이 영구히 잠긴다. */
function assignWaitingToExam(w: SimWorld): SimWorld {
  const waiting = w.pawns
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.stage === 'WAITING')
    .sort((a, b) => (a.p.arrivedMin ?? 0) - (b.p.arrivedMin ?? 0) || a.i - b.i)
  if (waiting.length === 0) return w
  const busy = new Set(w.pawns.map(p => p.doctorId).filter((id): id is string => !!id))
  const idle = w.pawns.filter(p => {
    if (p.kind !== 'DOCTOR' || !p.roomId || busy.has(p.id)) return false
    const room = w.rooms.find(r => r.id === p.roomId)
    return !!room && insideRoom(room, p) // 아직 방으로 걸어가는 중이면 진료를 못 받는다
  })
  if (idle.length === 0) return w
  const blocked = buildBlockedSet(w)
  const updates = new Map<number, Pawn>()
  let d = 0
  for (const { p, i } of waiting) {
    if (d >= idle.length) break
    const doc = idle[d]
    const spot = furnitureSpot(w, blocked, doc.roomId!, 'CHAIR')
    const path = spot ? findPath(w, { x: p.x, y: p.y }, spot) : null
    d++ // 갈 수 없는 방이면 그 의사를 건너뛴다(환자를 바꿔도 같은 방이라 결과가 같다)
    if (!spot || !path) continue
    updates.set(i, { ...p, stage: 'TO_EXAM', doctorId: doc.id, dest: spot, path })
  }
  if (updates.size === 0) return w
  return { ...w, pawns: w.pawns.map((p, i) => updates.get(i) ?? p) }
}

// ─── 스테이지 전이 ────────────────────────────────────────────────────────────

/** 퇴장 준비 — 입구로 향하게 한다. null이면 그 자리에서 사라진다(GONE).
 *  퇴장 경로가 끊긴 폰을 남겨두면 영원히 서서 좌석·집계를 갉아먹는다.
 *  이미 입구에 선 폰은 path가 빈 채로 살아 나가고 다음 틱에 제거된다 — 여기서 미리 걸러
 *  한 틱을 아낄 수 있지만, 그 분기는 어떤 테스트로도 관측되지 않는(=사살 불가) 최적화라 두지 않는다. */
function toExit(w: SimWorld, p: Pawn, stage: PatientStage): Pawn | null {
  const path = findPath(w, { x: p.x, y: p.y }, ENTRANCE)
  return path ? { ...p, stage, dest: ENTRANCE, path } : null
}

function progressStages(w: SimWorld): SimWorld {
  let treasuryManwon = w.treasuryManwon
  let { examsDone, leftCount } = w.stats
  const out: Pawn[] = []
  const keep = (p: Pawn | null) => { if (p) out.push(p) }

  for (const p of w.pawns) {
    if (p.kind !== 'PATIENT') { out.push(p); continue }
    const arrived = !!p.dest && samePt(p, p.dest)
    // 좌초 — 목적지에 못 닿았는데 경로가 비었다. tick의 재탐색이 실패했다는 뜻이고,
    // 스스로는 절대 못 벗어난다(경로는 목적지가 정해질 때만 계산된다). 여기서 안 풀면
    // 그 폰은 영구 정지하고, TO_EXAM이면 doctorId를 문 채라 진료실까지 같이 잠긴다.
    // 합법적인 건설 한 번(예: 진료실 문 앞을 막는 방)으로 병원 전체가 멎을 수 있다.
    const stranded = !arrived && p.path.length === 0
    switch (p.stage) {
      case 'ENTERING':
        if (arrived) keep({ ...p, stage: 'WAITING', arrivedMin: w.minute })
        else if (stranded) { leftCount++; keep(toExit(w, p, 'LEFT_WAITING')) }
        else keep(p)
        break
      case 'WAITING':
        if (w.minute - (p.arrivedMin ?? w.minute) > PATIENCE_MIN) {
          leftCount++
          keep(toExit(w, p, 'LEFT_WAITING'))
        } else keep(p)
        break
      case 'TO_EXAM':
        if (arrived) keep({ ...p, stage: 'IN_EXAM', examUntilMin: w.minute + EXAM_DURATION_MIN })
        else if (stranded) {
          leftCount++
          const freed: Pawn = { ...p }
          delete freed.doctorId // 의사부터 풀어준다 — 안 풀면 진료실이 통째로 잠긴다
          keep(toExit(w, freed, 'LEFT_WAITING'))
        } else keep(p)
        break
      // IN_EXAM은 자리에 앉아 있어 이동하지 않는다 — 좌초할 수 없다.
      case 'IN_EXAM':
        if (w.minute >= (p.examUntilMin ?? Infinity)) {
          examsDone++
          treasuryManwon += EXAM_REVENUE_MANWON
          // doctorId를 지우는 것이 곧 의사의 유휴 복귀다(busy 판정의 단일 출처).
          // 갓 만든 복사본만 건드리므로 입력 세계는 그대로다(tick의 순수성 계약).
          const done: Pawn = { ...p }
          delete done.doctorId
          delete done.examUntilMin
          keep(toExit(w, done, 'LEAVING'))
        } else keep(p)
        break
      case 'LEAVING':
      case 'LEFT_WAITING':
        // 입구에 닿았거나(정상 퇴장) 길이 끊겼으면(갇힘) 세계에서 제거한다.
        if (!arrived && p.path.length > 0) keep(p)
        break
      default:
        keep(p)
    }
  }
  return { ...w, treasuryManwon, pawns: out, stats: { examsDone, leftCount } }
}
