// 환자 라이프사이클 — 도착·대기·배정·진료·이탈. tick에서 분당 1회 호출한다.
// 여기가 시뮬을 "게임"으로 만드는 자리다: 방·가구·의사·시간이 여기서 처음으로 서로를 본다.
//
// 설계 규칙 셋:
//  ① RNG 0 — 도착 판정은 seed 해시(seededUnit)뿐이다. Math.random·Date.now 금지(결정론).
//  ② 도착 판정은 **위치 == dest**다. `path.length === 0`은 "길이 끊겨 비워진 폰"과 구별되지 않는다.
//  ③ 경로는 목적지가 정해질 때 1회만 계산한다. 매 분 재탐색하면 findPath(~3ms)가 인원수만큼 곱해진다.
import { seededUnit, callSeed } from '../game/daysim'
import { buildBlockedSet, findPath, isBlockedTile, type Pt } from './path'
// ENTRANCE(정문)는 world가 단일 출처다 — 격자에서 파생하는 상수이고, 의사의 출근(pawn.hireDoctor)도
// 같은 문을 쓴다. 여기 두면 하위 모듈인 pawn이 이 파일을 값으로 당겨 레이어가 뒤집힌다.
import {
  GRID_W, GRID_H, ENTRANCE,
  type FurnitureKind, type Room, type RoomType, type SimWorld,
} from './world'
import type { Pawn, PatientStage } from './pawn'
import { simDept, addExamToDeptStats, type SimDeptKey, type SimDeptStats } from './dept'
import { applyWorkLoads, fatigueOf, slowedDurationMin } from './fatigue'

export const EXAM_DURATION_MIN = 20
/** 대기 인내 — 이만큼 앉아 있었는데 안 불리면 떠난다(수익 0). */
export const PATIENCE_MIN = 90
export const ARRIVAL_WINDOW_MIN = 480     // 주간(09:00~17:00)에만 도착
export const ARRIVAL_PROB_PER_MIN = 1 / 8 // 평균 8분에 한 명

/** 도착 스트림 전용 salt — daysim.callSeed 주석의 레지스트리에 없는 값이라야 한다
 *  (사용 중: 1·2·3·7·11·12·13·15·17·19·23, 이 파일에서 29·31). 새 무작위 축은 새 salt를 받는다. */
const ARRIVAL_SALT = 29

/** 희망 과 스트림 전용 salt — **도착 판정(29)과 반드시 다른 축**이다.
 *  같은 salt를 쓰면 두 시드가 통째로 같아지고, 도착이 성립한 분은 정의상
 *  `seededUnit < ARRIVAL_PROB_PER_MIN`(0.125)이라 **들어온 환자가 전원 첫 구간(내과)**이 된다 —
 *  분포가 45/20/15/20이 아니라 100/0/0/0으로 붕괴하는데 에러는 하나도 안 난다. 그래서 이 두
 *  스트림의 비상관은 취향이 아니라 계약이고, 테스트가 구간 전수의 시드 집합 교집합으로 잠근다. */
const WANTS_DEPT_SALT = 31

/** **분당 독립 판정 스트림의 시드 폴딩 — 이 층의 모든 무작위 축이 여기 하나를 쓴다.**
 *  날 키(주,날)를 먼저 해시해 하루의 기점을 잡고, 분은 그 위에 더한다.
 *  분마다 독립 판정이라 (판,주,날,분) 조합마다 서로 다른 시드가 필요하다.
 *
 *  ⚠️ 분을 callSeed의 index 슬롯에 넣으면 안 된다 — 그 슬롯 폭은 97인데(`(…*97 + index)*101`)
 *  분은 0..479라, day+1이 index+97과 **정확히 같은 시드**가 된다. 그러면 매일이 전날의 97분
 *  시프트 재방송이다(실측: 인접 날 겹침 383/383, 전수 26,880 튜플 중 고유값 5,815). 에러 없이
 *  게임만 죽는 종류이고, daysim의 callSeed 독스트링이 "index를 스트림 축으로 쓰지 마라"고
 *  경고한 바로 그 함정이다([T-087](../../claude-docs/troubleshooting/T-087.md)). 그래서
 *  index에는 0을 넣어 **날 키 전용**으로만 쓰고, 스트림을 가르는 축은 **salt 하나뿐**이다.
 *
 *  week가 들어가는 것도 같은 이유로 핵심이다: startNextWeek이 day를 1로 되돌리므로 week가
 *  빠지면 2주차가 1주차의 재방송이 된다. 즉석 폴딩(week * 7_000 따위)을 새로 만들지 않는
 *  이유는 슬롯 폭을 또 계산해야 하고 그 계산이 틀리면 먼 주차에서 조용히 충돌하기 때문이다.
 *
 *  world.seed(어느 판인가)는 callSeed에 슬롯이 없어 XOR로 얹는다. 덧셈이 아닌 이유: 슬롯
 *  산술이 `index * 101 + salt`라 세계 시드를 더하면 seed 101이 옆 슬롯으로 미끄러진다.
 *  자기 해시(seededUnit)를 통과시켜 32비트에 고루 퍼뜨린 뒤 XOR하면 슬롯을 안 건드린다.
 *
 *  **축마다 이 폴딩을 복제하지 않는다**(도착·희망 과·응급 도착·응급 종류가 전부 같은 모양이다) —
 *  복제하면 T-087의 교훈("검증된 폴딩의 재사용도 슬롯 폭 확인을 면제하지 않는다")이 축 수만큼
 *  다시 걸리고, 한 곳을 고칠 때 나머지가 조용히 낡는다. 새 축은 **새 salt만** 받는다. */
export function minuteStreamSeed(w: SimWorld, salt: number): number {
  const worldMix = (seededUnit(w.seed) * 2 ** 32) | 0
  const dayBase = (seededUnit(callSeed(w.week, w.day, 0, salt) ^ worldMix) * 2 ** 32) | 0
  return (dayBase + w.minute) | 0
}

/** 도착 판정 시드. 이 함수가 도착 시드의 **단일 출처**다 — 테스트가 공식을 손으로 다시 쓰면
 *  (예전 경계 테스트가 그랬다) 한쪽이 조용히 낡는다. */
export function arrivalSeed(w: SimWorld): number {
  return minuteStreamSeed(w, ARRIVAL_SALT)
}

/** 희망 과 시드 — `arrivalSeed`와 **같은 폴딩**을 쓰고 다른 것은 salt 하나뿐이다.
 *  그 하나가 도착 판정과의 상관을 끊는다(WANTS_DEPT_SALT 주석). */
export function wantsDeptSeed(w: SimWorld): number {
  return minuteStreamSeed(w, WANTS_DEPT_SALT)
}

/** 도착 환자의 희망 과 분포 — 계획 표(내과 45 · 외과 20 · 순환기 15 · 미용 20)의 **단일 출처**다.
 *  값은 각 구간의 **누적 상한**이고, 배열 순서가 곧 구간 순서라 결정론의 일부다.
 *  왜 누적으로 적나: 개별 확률로 두면 합이 1인지 눈으로 확인할 수 없고, 한 과를 조정할 때
 *  나머지를 손으로 맞춰야 한다. 마지막 값 1.00이 곧 "합계 1" 검사다. */
export const ARRIVAL_DEPT_MIX: ReadonlyArray<readonly [SimDeptKey, number]> = [
  ['INTERNAL_MEDICINE', 0.45],
  ['GENERAL_SURGERY', 0.65],
  ['CARDIOLOGY', 0.80],
  ['AESTHETICS', 1.00],
]

/** [0,1) 난수 → 희망 과. 구간은 아래가 닫히고 위가 열린다(`u < upper`).
 *  치역 밖 값이 오면 마지막 과로 접지 않고 던진다 — 접으면 상한 표가 틀려도(마지막이 0.9 따위)
 *  미용이 조용히 늘어날 뿐 아무도 모른다. */
export function pickWantsDept(u: number): SimDeptKey {
  if (u >= 0) for (const [dept, upper] of ARRIVAL_DEPT_MIX) if (u < upper) return dept
  throw new Error(`pickWantsDept: [0,1) 밖의 값(${u}) — seededUnit의 치역을 벗어났다`)
}

/** 환자의 희망 과 — 없으면 던진다.
 *  `undefined`를 카탈로그에 넘기면 수익이 NaN이 되어 금고로 번지는데, NaN은 어떤 예외도 안 내고
 *  이후 모든 산술을 NaN으로 오염시킨다(simDept가 던지는 것과 같은 이유). 도착(maybeArrive)이
 *  모든 환자에게 배정하므로, 비어 있다는 건 손으로 세운 세계이거나 배정 경로가 빠진 것이다. */
export function wantsDeptOf(p: Pawn): SimDeptKey {
  if (!p.wantsDept) throw new Error(`환자(${p.id})에 wantsDept가 없다 — 도착에서 과가 배정되지 않았다`)
  return p.wantsDept
}

/** 끝난 외래 한 건의 **표준강도분**(소요 × 과 강도) — 피로 축적의 입력.
 *  단위를 여기 한 곳에 모으는 이유: 진료의 완료는 두 곳에서 관측된다(정상 종료는
 *  `progressStages`, 마감에 걸린 건은 `day.settleDay`). 식을 양쪽에 적으면 한쪽만 강도를
 *  잊거나 폴백이 갈려도 에러 없이 피로만 어긋난다 — 마감 쪽이 실제로 그랬다.
 *  `workMin` 폴백은 손세계 폰(진료 시작을 거치지 않고 IN_EXAM으로 세운 세계)의 몫이다. */
export function examLoadMin(p: Pawn, dept: SimDeptKey): number {
  return (p.workMin ?? EXAM_DURATION_MIN) * simDept(dept).intensity
}

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

/** 방 안 가구 앞에 설 자리 — 의사의 정위치(책상 앞)와 진료 좌석(의자 앞)의 **단일 출처**다.
 *  하루를 넘길 때(day.startNextDay) 의사를 제자리로 되돌리는 것도 여기를 본다 — 파생식을
 *  복제하면 "책상 앞"이 배정과 복귀에서 갈라져 의사가 어제와 다른 칸에 선다. */
export function furnitureSpot(
  w: SimWorld, roomId: string, kind: 'DESK' | 'CHAIR', blocked: Set<number>,
): Pt | null {
  const f = w.furniture.find(x => x.roomId === roomId && x.kind === kind)
  return f ? frontTile(blocked, f) : null
}

const insideRoom = (r: Room, p: { x: number; y: number }) =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h

// ─── 도착 ────────────────────────────────────────────────────────────────────

/** 그 종류의 방에 놓인 그 가구 앞에 설 수 있는 타일들. **가구 하나당 자리 하나**가 이 함수의
 *  계약이고, 그게 화면(그려진 의자·침대)과 수용 용량을 같게 만든다 — build의 autoFurniture가
 *  앞 타일이 겹치는 가구를 애초에 놓지 않아 성립한다. 여기 dedupe는 그 계약이 깨졌을 때 두
 *  환자가 한 타일에 겹치는 것만은 막는 안전망이다(용량이 줄지언정 겹치지는 않는다).
 *  대기실 좌석과 병동 침대(emergency.wardBeds)가 **같은 기계**라 여기 하나로 둔다 — 복제하면
 *  한쪽만 dedupe를 잃거나 방 종류 필터가 갈린다. */
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

/** 대기실 좌석 = 의자 앞에 설 수 있는 타일들(자리 계약은 furnitureSpots 주석). */
export function waitingSeats(w: SimWorld, blocked: Set<number> = buildBlockedSet(w)): Pt[] {
  return furnitureSpots(w, 'WAITING', 'CHAIR', blocked)
}

/** 비어 있고 **입구에서 닿을 수 있는** 첫 좌석과 거기까지의 경로.
 *  좌석 점유는 환자의 dest로 표현된다 — 별도 점유 테이블을 두면 폰 제거·이동과 어긋날 수 있고,
 *  dest는 어차피 재탐색용으로 이미 있다. */
function freeSeat(w: SimWorld, blocked: Set<number>): { spot: Pt; path: Pt[] } | null {
  const taken = new Set(
    w.pawns
      .filter(p => (p.stage === 'ENTERING' || p.stage === 'WAITING') && p.dest)
      .map(p => ptKey(p.dest!)),
  )
  // 첫 후보가 도달 불가라고 여기서 끝내면 안 된다 — 봉인된 대기실의 의자 하나가 멀쩡한
  // 다른 대기실 전체를 가려 신규 도착이 영원히 0이 된다(철거가 없어 세션 내 비가역).
  // 정상 상황에선 첫 후보가 곧바로 닿아 findPath 호출 수가 지금까지와 같다 — 성능 계약 유지.
  for (const spot of waitingSeats(w, blocked)) {
    if (taken.has(ptKey(spot))) continue
    const path = findPath(w, ENTRANCE, spot)
    if (path) return { spot, path }
  }
  return null
}

function maybeArrive(w: SimWorld): SimWorld {
  // 실효 구간은 분 1~479다 — tick이 minute을 먼저 올리고 부르므로 0분은 판정 자체가 없고,
  // 480분은 창이 닫힌 쪽이다(경계 테스트가 이 두 끝을 잠근다).
  if (w.minute >= ARRIVAL_WINDOW_MIN) return w
  // 분마다 독립 판정 — 이래야 도착이 몰릴 때 몰리고(대기열이 생기고) 빌 때 빈다.
  if (seededUnit(arrivalSeed(w)) >= ARRIVAL_PROB_PER_MIN) return w
  const seat = freeSeat(w, buildBlockedSet(w))
  // 앉을 데가 없거나 거기까지 갈 수 없으면 문간에서 발길을 돌린다 — 폰을 만들지도 않는다.
  if (!seat) return { ...w, stats: { ...w.stats, leftCount: w.stats.leftCount + 1 } }
  const patient: Pawn = {
    id: `pat-${w.nextId}`, kind: 'PATIENT',
    x: ENTRANCE.x, y: ENTRANCE.y, path: seat.path, dest: seat.spot, stage: 'ENTERING',
    // 무엇을 보러 왔는가는 문을 들어서는 순간 정해지고 이후 바뀌지 않는다 — 그 과가 없으면
    // 이 환자는 아무리 기다려도 못 본다(인내 초과 이탈). 시드는 (판·주·날·분)의 순수 함수라
    // **호출 순서에 의존하지 않는다** — 자리가 없어 발길을 돌린 사람 몫을 건너뛰어도 뒤 환자의
    // 과가 밀리지 않는다(순차 소비형 RNG였다면 좌석 수가 과 분포를 흔들었을 것이다).
    wantsDept: pickWantsDept(seededUnit(wantsDeptSeed(w))),
  }
  return { ...w, nextId: w.nextId + 1, pawns: [...w.pawns, patient] }
}

// ─── 배정 ────────────────────────────────────────────────────────────────────

/** 방 없는 의사를 **자기 과의** 빈 EXAM 방에 배정하고 책상 옆으로 보낸다(폰 순서 × 방 순서 = 결정론).
 *  과가 다른 방에 앉히면 그 의사는 영원히 놀면서 방 하나를 물고 있고(라우팅의 삼중 일치가 막는다),
 *  같은 과 의사가 뒤에 와도 그 방을 못 쓴다 — 배정 단계에서 미리 거른다. */
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
      // 과 없는 의사(손세계 폰)는 어떤 방과도 같지 않아 여기서 전부 걸러진다 — 의도된 결과다.
      if (room.dept !== p.dept) continue
      const spot = furnitureSpot(w, room.id, 'DESK', blocked)
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
 *  의사 쪽에 busy 플래그를 두면 환자가 사라질 때(제거·이탈) 되돌리는 걸 잊어 방이 영구히 잠긴다.
 *
 *  ⚠️ **삼중 일치**가 이 슬라이스의 심장이다: 환자의 희망 과 == 진료실의 과 == 의사의 과일
 *  때만 짝이 성립한다. 셋 중 하나라도 빼면 "아무 의사나 아무 환자를 본다"가 되어, 과를 세운
 *  의미(그 과가 없으면 그 환자를 놓친다)가 통째로 사라진다 — 게임은 계속 돌고 숫자만 거짓이 된다.
 *  방 축이 남아 있는 이유: 배정(assignDoctorRooms)이 이미 같은 과로 앉히지만, 그건 **다른 함수의
 *  성질**이라 여기서 다시 확인하지 않으면 그쪽이 느슨해지는 순간 조용히 새는 통로가 된다. */
function assignWaitingToExam(w: SimWorld): SimWorld {
  const waiting = w.pawns
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.stage === 'WAITING')
    .sort((a, b) => (a.p.arrivedMin ?? 0) - (b.p.arrivedMin ?? 0) || a.i - b.i)
  if (waiting.length === 0) return w
  const busy = new Set(w.pawns.map(p => p.doctorId).filter((id): id is string => !!id))
  // 유휴 의사를 **과별 줄**로 세운다 — 과마다 대기열이 따로 서므로, 내과가 밀려도 미용은 돈다.
  // 줄 안의 순서는 폰 배열 순서 그대로라 결정론이 유지된다.
  const idleByDept = new Map<SimDeptKey, Pawn[]>()
  for (const p of w.pawns) {
    if (p.kind !== 'DOCTOR' || !p.roomId || busy.has(p.id) || !p.dept) continue
    const room = w.rooms.find(r => r.id === p.roomId)
    if (!room || !insideRoom(room, p)) continue // 아직 방으로 걸어가는 중이면 진료를 못 받는다
    if (room.dept !== p.dept) continue          // 삼중 일치의 방 축
    const queue = idleByDept.get(p.dept)
    if (queue) queue.push(p)
    else idleByDept.set(p.dept, [p])
  }
  if (idleByDept.size === 0) return w
  const blocked = buildBlockedSet(w)
  const updates = new Map<number, Pawn>()
  for (const { p, i } of waiting) {
    // 삼중 일치의 환자 축 — 자기 과 줄에서만 의사를 꺼낸다. 그 과가 없거나 전원이 바쁘면
    // 이 환자는 이번 분에 못 불리고 계속 앉아 있다가 PATIENCE_MIN을 넘기면 떠난다.
    const queue = p.wantsDept ? idleByDept.get(p.wantsDept) : undefined
    const doc = queue?.shift()
    if (!doc) continue
    const spot = furnitureSpot(w, doc.roomId!, 'CHAIR', blocked)
    const path = spot ? findPath(w, { x: p.x, y: p.y }, spot) : null
    // 갈 수 없으면 그 의사를 건너뛴다(이미 줄에서 뺐다). ⚠️ 도달 가능성은 **환자 위치에도**
    // 달렸으므로 다른 환자라면 갈 수 있었을 수 있다 — 즉 이건 공평한 판정이 아니라 재시도
    // 폭주를 막는 절충이다. 밀린 환자는 다음 분에 다시 후보가 되고, 계속 못 가면 인내가 상한을 친다.
    if (!spot || !path) continue
    updates.set(i, { ...p, stage: 'TO_EXAM', doctorId: doc.id, dest: spot, path })
  }
  if (updates.size === 0) return w
  return { ...w, pawns: w.pawns.map((p, i) => updates.get(i) ?? p) }
}

// ─── 스테이지 전이 ────────────────────────────────────────────────────────────

/** 퇴장 준비 — 입구로 향하게 한다. null이면 그 자리에서 사라진다(GONE).
 *  응급(emergency.ts)도 처치가 끝나면 이 함수로 내보낸다 — 퇴장의 단일 출처라, 여기 규칙
 *  (경로가 끊긴 폰은 남기지 않는다)이 응급에서만 갈리는 일이 없다.
 *  퇴장 경로가 끊긴 폰을 남겨두면 영원히 서서 좌석·집계를 갉아먹는다.
 *  이미 입구에 선 폰은 path가 빈 채로 살아 나가고 다음 틱에 제거된다 — 여기서 미리 걸러
 *  한 틱을 아낄 수 있지만, 그 분기는 어떤 테스트로도 관측되지 않는(=사살 불가) 최적화라 두지 않는다. */
export function toExit(w: SimWorld, p: Pawn, stage: PatientStage): Pawn | null {
  const path = findPath(w, { x: p.x, y: p.y }, ENTRANCE)
  return path ? { ...p, stage, dest: ENTRANCE, path } : null
}

function progressStages(w: SimWorld): SimWorld {
  let treasuryManwon = w.treasuryManwon
  let { examsDone, leftCount } = w.stats
  // 과별 집계는 갈아끼우기(재할당)로만 갱신한다 — 입력 세계의 객체를 건드리면 tick의 순수성이 깨진다.
  let byDept: SimDeptStats = w.stats.byDept
  /** 이번 분에 끝난 진료의 **표준강도분**을 의사별로 모은다 — 의사 폰은 이 루프의 앞머리에서
   *  이미 `out`으로 넘어가므로 여기서 직접 못 고친다(applyWorkLoads 주석). */
  const loadByDoctor = new Map<string, number>()
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
        if (arrived) {
          // 소요는 **시작하는 순간** 담당 의사의 피로로 확정된다(진료 중에 늘었다 줄었다 하지
          // 않는다). 그 의사는 이 환자를 문 채라 진료가 끝날 때까지 다른 일을 못 하므로,
          // 이번 분 안에서 그의 피로가 바뀔 길도 없다.
          const workMin = slowedDurationMin(
            EXAM_DURATION_MIN, fatigueOf(w.pawns.find(d => d.id === p.doctorId)),
          )
          keep({ ...p, stage: 'IN_EXAM', examUntilMin: w.minute + workMin, workMin })
        } else if (stranded) {
          leftCount++
          const freed: Pawn = { ...p }
          delete freed.doctorId // 의사부터 풀어준다 — 안 풀면 진료실이 통째로 잠긴다
          keep(toExit(w, freed, 'LEFT_WAITING'))
        } else keep(p)
        break
      // IN_EXAM은 자리에 앉아 있어 이동하지 않는다 — 좌초할 수 없다.
      case 'IN_EXAM':
        if (w.minute >= (p.examUntilMin ?? Infinity)) {
          // 수익은 **환자가 보러 온 과의 수가**다 — 같은 20분이어도 미용 30만원, 내과 12만원.
          // 이 한 줄이 "옳은 의료를 할수록 장부가 나빠진다"의 수입 쪽 절반이다(지출 쪽은 주 고정비).
          const dept = wantsDeptOf(p)
          examsDone++
          treasuryManwon += simDept(dept).examRevenueManwon
          byDept = addExamToDeptStats(byDept, dept)
          // 부하는 **끝날 때** 쌓인다 — 그리고 그 단위는 분이 아니라 **표준강도분**(소요 × 과 강도)이다.
          // 강도를 빼면 "많이 보는 과가 갈린다"가 되어 미용이 포화하고 필수과가 무풍이 된다
          // (src/game/doctor.ts FATIGUE_INTENSITY 주석의 실측). 감속으로 길어진 소요는 그대로
          // 부하가 되므로 피로가 피로를 부른다 — 그게 "갈려나간다"의 형태다.
          // `workMin` 폴백은 손세계 폰(진료 시작을 거치지 않고 IN_EXAM으로 세운 세계)의 몫이다.
          if (p.doctorId) {
            const load = examLoadMin(p, dept)
            loadByDoctor.set(p.doctorId, (loadByDoctor.get(p.doctorId) ?? 0) + load)
          }
          // doctorId를 지우는 것이 곧 의사의 유휴 복귀다(busy 판정의 단일 출처).
          // 갓 만든 복사본만 건드리므로 입력 세계는 그대로다(tick의 순수성 계약).
          const done: Pawn = { ...p }
          delete done.doctorId
          delete done.examUntilMin
          delete done.workMin // 끝난 작업의 소요는 남기지 않는다 — 다음 작업이 물려받으면 안 된다
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
  // 응급 집계(수용·회차)는 이 단계가 만들지 않으므로 입력 값을 그대로 통과시킨다 —
  // 필드를 손으로 나열하면 새 집계가 늘 때마다 여기서 조용히 0으로 리셋된다.
  return {
    ...w, treasuryManwon, pawns: applyWorkLoads(out, loadByDoctor),
    stats: { ...w.stats, examsDone, leftCount, byDept },
  }
}
