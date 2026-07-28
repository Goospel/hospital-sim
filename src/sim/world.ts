// 타일 세계 — 순수 데이터와 통행 판정. 렌더·React 임포트 금지.
// dept.ts는 world를 모른다(단방향) — 그래서 값(freshHirePool)까지 당겨도 순환이 없다.
import { freshHirePool, type SimDeptKey, type SimDeptStats } from './dept'
import type { EmergencyTurnAway } from './emergency' // 타입 전용 — emergency.ts가 world를 되받아도 런타임 순환 없음
import type { SimEventKind } from './events' // 타입 전용 — events.ts는 leaf라 값도 순환은 없지만 필요한 건 타입뿐이다
import type { Pawn } from './pawn' // 타입 전용 임포트 — pawn.ts가 world를 되받아도 순환 무해
import type { DayRecord } from './day' // 타입 전용 — day.ts가 SimWorld를 되받아도 런타임 순환 없음
import type { Pt } from './path' // 타입 전용 — path.ts가 world의 격자 상수를 되받아도 런타임 순환 없음

export const GRID_W = 48
export const GRID_H = 32
export const INITIAL_TREASURY_MANWON = 50_000 // 개원 자본 5억(기존 경제와 동일 단위)

/** 정문 — 그리드 아래 변 중앙. 방은 y=GRID_H-1에 지을 수 없어(placeRoom 경계) 항상 통행 가능하다.
 *  **환자가 들어오는 문과 의사가 출근하는 문은 같은 문이다.** 격자에서 파생하는 상수라 자리는
 *  여기다 — 라이프사이클 모듈(patientFlow)에 두면 그 아래층인 pawn이 상위를 값으로 당기게 되고,
 *  patientFlow가 pawn의 값을 하나라도 쓰는 순간 실제 순환이 된다. */
export const ENTRANCE: Pt = { x: 24, y: GRID_H - 1 }

/** 타일 인덱스의 **단일 출처** — 벽·문 집합, 경로 blocked 집합, 영역 계산이 전부 이 공식을 쓴다.
 *  호출부가 `y * GRID_W + x`를 다시 쓰면 어느 한 곳이 바뀌는 날 조용히 갈린다. */
export const tileIndex = (x: number, y: number): number => y * GRID_W + x

export type RoomType = 'EXAM' | 'WARD' | 'WAITING' | 'LOUNGE' | 'RECEPTION' | 'CAFETERIA'

/** 용도 앵커 — "이 좌표가 속한 방은 이 용도다". 방이 아니라 **타일**을 가리키는 것이 핵심이다:
 *  벽을 허물어 영역이 병합·분리돼도 앵커는 좌표라 저절로 승계된다(영역 id는 파생값이라 못 쓴다). */
export interface Designation { at: Pt; type: RoomType; dept?: SimDeptKey }

export interface Room {
  id: string
  type: RoomType
  /** EXAM만 갖는다(과 지정). 다른 방 종류에는 **없다** — placeRoom이 떨군다(build.ts).
   *  타입이 `DeptKey`가 아니라 `SimDeptKey`인 이유: 카탈로그 밖 과(예: 'CHECKUP')를 넣은
   *  방은 라우팅이 `simDept`에서 **런타임에** 터진다. 좁혀 두면 그 실수가 컴파일로 당겨진다. */
  dept?: SimDeptKey
  x: number; y: number; w: number; h: number
}

export type FurnitureKind = 'DESK' | 'CHAIR' | 'BED' | 'COUNTER'
export interface Furniture { kind: FurnitureKind; x: number; y: number; roomId: string }

/** 세계의 진행 국면 — RUNNING일 때만 시간이 흐른다.
 *  마감·결산 화면 동안 세계가 계속 굴러가면 플레이어가 읽는 숫자와 세계가 어긋난다. */
export type SimPhase = 'RUNNING' | 'DAY_END' | 'WEEK_END' | 'CLOSED'

/** 판이 **왜** 끝났는가 — 돈(INSOLVENCY)·사람(NO_PEOPLE)·시간(CAMPAIGN_END).
 *  `phase: 'CLOSED'` 하나로는 세 결말이 한 화면으로 뭉개진다. 판정은 주간 결산 한 곳뿐이다(week.endingOf). */
export type EndingKind = 'INSOLVENCY' | 'NO_PEOPLE' | 'CAMPAIGN_END'

export interface SimWorld {
  minute: number   // 개장(09:00)부터의 게임 분
  day: number      // 1부터
  week: number     // 1부터
  phase: SimPhase
  treasuryManwon: number
  rooms: Room[]
  /** 벽 타일(tileIndex) — **통행 판정의 단일 출처**다. 방 사각형에서 유도하지 않는다:
   *  자유 건설(설계 PR 2)에서는 벽이 방에 속하지 않고 홀로 서기 때문이다.
   *  지금은 placeRoom 어댑터가 방 테두리를 여기로 옮겨 담는다. */
  walls: ReadonlySet<number>
  /** 문 타일 — **통행 가능하되 영역 경계다**(벽 집합에는 없다). 이 이중성이 문의 정의다:
   *  막으면 못 드나들고, 경계가 아니면 두 방이 하나로 붙는다. */
  doors: ReadonlySet<number>
  /** 용도 앵커 — 배열 순서 = 지정 순서 = 충돌 시 우선순위(먼저가 이긴다). */
  designations: ReadonlyArray<Designation>
  furniture: Furniture[]
  pawns: Pawn[]
  nextId: number
  seed: number
  /** 하루 집계 — 폰은 퇴장하면 배열에서 사라지므로, 무슨 일이 있었는지는 여기에만 남는다. */
  stats: SimStats
  /** 이번 주의 하루 기록 — 주를 넘기면 비운다(주간 결산이 이 배열을 합산한다). */
  days: DayRecord[]
  /** 금고가 음수로 끝난 주가 몇 번 **연속**됐는가 — 기존 게임의 폐업 규칙(2주 연속)이 읽는다.
   *  흑자로 끝난 주가 한 번이라도 끼면 0으로 리셋된다(누적이 아니라 연속이다). */
  insolvencyStreak: number
  /** 이번 주 결산(고정비 차감)이 이미 끝났는가 — 이중 정산 가드.
   *  phase를 바꿔 표시하지 않는 이유: 결산 화면은 `WEEK_END` 하나로 떠 있고 그 화면 **안에서**
   *  결산이 돌기 때문이다(진입 시 자동 1회 → 요약을 읽고 → 다음 주 버튼). phase를 옮기면
   *  결산이 끝나는 순간 플레이어가 읽어야 할 화면이 사라진다. */
  weekSettled: boolean
  /** **전국에 남은** 과별 의사 수 — 채용이 하나씩 깎고(pawn.hireDoctor), 0이면 그 과를 더 뽑을 수
   *  없다. 사직자는 여기로 **돌아오지 않는다**(week.startNextWeek) — 다른 병원으로 옮긴 게 아니라
   *  필수의료를 떠난 것이라, 이 숫자는 한 판 동안 단조 감소한다.
   *  초기값은 카탈로그 파생이다(dept.freshHirePool) — 두 곳에 적지 않는다. */
  hirePool: Record<SimDeptKey, number>
  /** 판을 끝낸 결말 — **`phase: 'CLOSED'`와 항상 함께** 세팅된다(settleWeek 한 곳).
   *  살아 있는 세계에는 없다(optional인 이유): 있으면 끝난 판이고, 없으면 아직 굴러가는 판이다. */
  ending?: EndingKind
  /** 오늘 붙은 이벤트 — **하루짜리다.** 아침 전이 직후에 세팅되고(`events.applyEvent`)
   *  다음 아침이 지운다(`day.freshMorning`). 효과는 여기에 저장되지 않는다: 판정식이 그때그때
   *  배율 함수로 읽어 간다(events.arrivalProbMulOf 등) — "오늘의 보정치"를 따로 들면 이 필드와
   *  갈릴 수 있다. 객체로 감싼 이유는 연출문·LLM 텍스트가 나중에 같은 자리에 붙기 때문이다. */
  event?: { kind: SimEventKind }
  /** **판 전체**에서 되돌아간 응급의 누적 건수 — 의료소송(LAWSUIT) 전제의 유일한 근거다.
   *  기존 `stats.emergencyTurnedAway`는 아침마다 비워지고 `days`는 주마다 비워져 "이 판에서
   *  몇 명을 돌려보냈나"를 읽을 축이 없었다. 단조 증가하고 하루·주 리셋이 없다
   *  (`saturatedDays`와 같은 계약 — *돌려보낸 일은 남는다*). */
  turnedAwayTotal: number
}

export interface SimStats {
  examsDone: number  // 완료된 진료 수(수익의 근거)
  leftCount: number  // 대기 못 하고 떠난 환자 수(자리 부족 + 인내 초과)
  /** 과별 진료·수익 — 수가가 과마다 달라진 뒤로 **총수익을 여기서 유도한다**(Σ revenueManwon).
   *  총액을 따로 들고 있으면 과별 합과 어긋나도 아무도 모른다(deptLedger 불변식 I-A 계승). */
  byDept: SimDeptStats
  /** 수용한 응급 건수 — **도착 즉시 판정** 기준이라 처치 완료가 아니라 받아들인 시점에 센다.
   *  (완료 기준으로 세면 마감에 걸린 처치가 사라져 "받았는데 안 센" 건이 생긴다.) */
  emergencyAccepted: number
  /** 되돌아간 응급 — 카운터가 아니라 **내역**이다. 몇 건인지보다 *왜*가 중요하다:
   *  `NO_SPECIALIST`는 그 과를 안 뽑아서고 `NO_BED`는 병동이 모자라서라, 플레이어가 할 일이
   *  다르다(계획 Task 6이 이 사유를 그대로 토스트로 보여준다). */
  emergencyTurnedAway: EmergencyTurnAway[]
}

/** 하루 집계의 영점 — `createWorld`와 `freshMorning`(day.ts)이 **같은 모양**을 써야 한다.
 *  한쪽만 새 필드를 빠뜨리면 그날 집계가 undefined로 시작해 조용히 무너진다. */
export function freshStats(): SimStats {
  return { examsDone: 0, leftCount: 0, byDept: {}, emergencyAccepted: 0, emergencyTurnedAway: [] }
}

export function createWorld(seed: number): SimWorld {
  return {
    minute: 0, day: 1, week: 1, phase: 'RUNNING', treasuryManwon: INITIAL_TREASURY_MANWON,
    rooms: [], walls: new Set(), doors: new Set(), designations: [],
    furniture: [], pawns: [], nextId: 1, seed,
    stats: freshStats(), days: [], insolvencyStreak: 0, weekSettled: false,
    hirePool: freshHirePool(), turnedAwayTotal: 0,
  }
}

export function doorTile(r: Room): { x: number; y: number } {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + r.h - 1 }
}

/** 방 사각형이 낳는 **벽 타일** — 테두리에서 문 하나를 뺀다. placeRoom 어댑터가 `walls`를
 *  채우는 유일한 경로다(설계 PR 2에서 자유 벽 도구로 대체되며 함께 사라진다). */
export function wallTiles(r: Room): Array<{ x: number; y: number }> {
  const door = doorTile(r)
  const out: Array<{ x: number; y: number }> = []
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) {
    const onEdge = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1
    if (onEdge && !(x === door.x && y === door.y)) out.push({ x, y })
  }
  return out
}

/** 통행 판정 — 벽 ∪ 가구. **문은 벽이 아니므로 통행 가능**하다.
 *  경로탐색의 `buildBlockedSet`(path.ts)과 같은 규칙을 봐야 한다(path.test.ts가 전 타일에서 대조). */
export function isWalkable(w: SimWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false
  if (w.walls.has(tileIndex(x, y))) return false
  for (const f of w.furniture) if (f.x === x && f.y === y) return false
  return true
}
