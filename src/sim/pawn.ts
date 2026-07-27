// 폰 — 세계를 걸어다니는 개체(의사·환자)와 그 이동 계산. 순수 데이터·순수 함수.
// 경로는 목적지가 정해질 때 findPath로 1회 계산해 path에 저장하고, 틱은 소비만 한다
// (findPath는 최장 경로 ~3ms라 매 틱 재탐색하면 폰 수만큼 곱해져 프레임을 먹는다).
import { GRID_W, GRID_H, ENTRANCE, isWalkable, type SimWorld } from './world'
import type { SimDeptKey } from './dept'
import type { EmergencyKind } from './emergency' // 타입 전용 — emergency.ts가 pawn을 되받아도 순환 무해
import type { Pt } from './path'

/** 폰의 이동 속도 — 게임 분당 타일 수. 시간 분할 불변식이 성립하려면 정수여야 한다. */
export const PAWN_TILES_PER_MIN = 2

export type PawnKind = 'DOCTOR' | 'PATIENT'
/** ⚠️ 'PAYING'·'GONE'은 **2주차 예약**이라 지금은 아무도 만들지 않고 아무도 읽지 않는다.
 *  'PAYING'은 RECEPTION 경유 수납 흐름 자리, 'GONE'은 퇴장을 폰 제거가 아니라 상태로 남길 때의
 *  자리다(1주차는 입구에 닿으면 배열에서 바로 뺀다). 미사용이지만 지우지 않는다 — 흐름의 빈칸이
 *  타입에 보이는 편이 낫고, 2주차에 되살릴 때 이름이 흔들리지 않는다. */
/** ⚠️ 응급 3종('TO_BED'·'IN_BED'·'IN_TREATMENT')은 **응급 환자만** 거치는 갈래다(emergency.ts).
 *  외래가 대기실 의자를 거쳐 진료실로 가듯, 응급은 병동 침대로 곧장 가서 처치를 받는다.
 *  'IN_BED'가 따로 있는 이유: 침대에 누웠지만 아직 그 과 의사가 외래 중이라 처치가 시작되지
 *  않은 구간이 실재한다 — 이 구간을 'IN_TREATMENT'와 합치면 소요 90분이 의사가 오기 전부터
 *  흐르기 시작해, 바쁜 병원일수록 처치가 공짜로 빨라진다(에러 없이 숫자만 틀린다). */
export type PatientStage =
  | 'ENTERING' | 'WAITING' | 'TO_EXAM' | 'IN_EXAM' | 'PAYING' | 'LEAVING' | 'GONE' | 'LEFT_WAITING'
  | 'TO_BED' | 'IN_BED' | 'IN_TREATMENT'

export interface Pawn {
  id: string
  kind: PawnKind
  x: number; y: number
  path: Pt[]
  /** 최종 목적지 — path와 별개로 남긴다. 둘을 겸하면 두 가지가 깨진다:
   *  ① 걷는 도중 진로가 막혔을 때 어디로 다시 길을 찾을지 모른다(재탐색 불가).
   *  ② 도착 판정을 `path.length === 0`으로 하게 되는데, 길이 끊겨 강제로 비워진 폰까지
   *     "도착"으로 오인한다 — 그래서 도착 판정은 항상 **위치 == dest**로 한다. */
  dest?: Pt
  // DOCTOR
  /** 전공과. 카탈로그 밖 과(2주차 절단)를 넣으면 라우팅이 런타임에 터지므로 `SimDeptKey`로
   *  좁혀 컴파일로 당긴다(Room.dept와 같은 이유). */
  dept?: SimDeptKey
  roomId?: string          // 배정된 진료실
  /** 누적 피로(0~`FATIGUE_MAX`) — **의사만** 갖는다. 채용 시 0에서 시작해 진료·처치가 끝날 때
   *  오르고 아침마다 `FATIGUE_REST`만큼 내린다(fatigue.ts). 효과는 하나다: 진료 소요가 늘어난다.
   *  하루로 리셋되지 **않는다** — 주를 넘겨도 이어지는 것이 "주 후반에 갈려나간다"의 담지자다. */
  fatigue?: number
  /** 오늘 누적 **표준강도분**(소요 분 × 과 강도) — 의사만. 아침에 0으로 리셋된다.
   *  피로 증가가 이 누적치의 함수라(하루 `FATIGUE_FREE_MIN` 초과분만 쌓인다) 하루치를 들고 있어야
   *  한다. 건별로 따로 반올림해 더하면 같은 하루가 쪼개는 방식에 따라 다른 피로를 낳는다. */
  loadMinToday?: number
  // PATIENT
  stage?: PatientStage
  /** 이 환자가 보러 온 과 — **도착 시점에 배정되고 이후 바뀌지 않는다**(patientFlow.maybeArrive).
   *  진료가 성립하려면 환자·진료실·의사의 과가 셋 다 같아야 하고(삼중 일치), 진료 수익도
   *  이 과의 수가로 매겨진다. 즉 "그 과가 없으면 그 환자를 놓친다"의 담지자가 이 필드다. */
  wantsDept?: SimDeptKey
  arrivedMin?: number      // 대기 시작 시각(인내 계산)
  examUntilMin?: number
  doctorId?: string
  /** 응급 환자라는 표시이자 그 종류 — 없으면 외래다(emergency.ts가 유일한 생성자).
   *  종류가 배후과·수가·소요를 전부 결정하므로 이 한 필드가 응급의 신원이다. */
  emergency?: EmergencyKind
  /** 응급 처치 종료 시각 — `examUntilMin`과 **다른 필드**다. 겸하면 마감 정산이 외래 수가로
   *  응급을 계산하고(IN_EXAM 분기와 구별 불가) 850만원짜리 처치가 25만원으로 접힌다. */
  treatUntilMin?: number
  /** 지금 이 환자에게 붙은 작업(외래 진료·응급 처치)의 **확정 소요 분**.
   *  시작할 때 담당 의사의 피로 감속을 반영해 정해지고(fatigue.slowedDurationMin), 끝날 때
   *  표준강도분 축적의 입력이 된다. `*UntilMin`에서 되계산하지 않는 이유: 그러려면 시작 시각을
   *  따로 들거나 "그동안 의사의 피로가 안 변했다"는 성질에 기대야 하는데, 둘 다 이 한 필드보다
   *  깨지기 쉽다. 외래·응급이 한 폰에 겹치지 않아 필드는 하나면 된다. */
  workMin?: number
}

export function spawnDoctor(w: SimWorld, dept: SimDeptKey, at: Pt): SimWorld {
  // 피로·부하를 **명시적으로 0**에서 시작한다 — `?? 0` 폴백이 있어도 필드가 실재해야 UI·저장이
  // "아직 일 안 한 의사"와 "필드가 없는 손세계 폰"을 구별할 수 있다.
  const p: Pawn = {
    id: `doc-${w.nextId}`, kind: 'DOCTOR', x: at.x, y: at.y, path: [], dept,
    fatigue: 0, loadMinToday: 0,
  }
  return { ...w, nextId: w.nextId + 1, pawns: [...w.pawns, p] }
}

/** 스폰 탐색의 4방향 순서 — findPath의 DIRS와 같은 (위·우·아래·좌). 이 순서가 동률 타이브레이크다. */
const SPAWN_DIRS: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]

/** 정문에서 가까운 순서로 통행 가능한 첫 타일 — 채용한 의사가 설 자리.
 *  BFS라 거리순이 보장되고, 방향 순서(위·우·아래·좌)가 findPath와 같아 동률도 결정론이다.
 *  ⚠️ 정문 자체는 방을 지을 수 없는 마지막 줄이라(placeRoom 경계) 보통 여기서 곧바로 끝난다 —
 *  탐색이 도는 건 손으로 세운 세계처럼 정문이 막힌 경우뿐이다. */
function spawnSpotNear(w: SimWorld, from: Pt): Pt {
  const seen = new Set<string>([`${from.x},${from.y}`])
  const queue: Pt[] = [from]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (isWalkable(w, cur.x, cur.y)) return cur
    for (const d of SPAWN_DIRS) {
      const nx = { x: cur.x + d.x, y: cur.y + d.y }
      const key = `${nx.x},${nx.y}`
      if (seen.has(key)) continue
      if (nx.x < 0 || nx.y < 0 || nx.x >= GRID_W || nx.y >= GRID_H) continue
      seen.add(key)
      queue.push(nx)
    }
  }
  // 세계에 통행 타일이 하나도 없다 — 채용을 조용히 삼키느니 정문에 세운다.
  // 막힌 칸에 낀 폰도 findPath가 출발지를 선검사하지 않아 스스로 걸어 나올 수 있다(의도된 비대칭).
  return from
}

/** 채용 — 그 과 의사 한 명이 정문으로 걸어 들어온다.
 *  **일시금이 없다**(금고 무변): 기존 게임의 계약금(DEPARTMENTS.hireCostManwon)은 PR C/D 절단이고,
 *  이 슬라이스에서 채용의 대가는 오직 **주 고정비**(dept.ts weeklyCostManwon)다 — 그래야 "뽑는
 *  순간 아픈" 게 아니라 "주말마다 청구되는" 형태가 되고, 필수과의 적자가 주 단위로 드러난다. */
export function hireDoctor(w: SimWorld, dept: SimDeptKey): SimWorld {
  return spawnDoctor(w, dept, spawnSpotNear(w, ENTRANCE))
}

/** 경로를 분 예산만큼 소비 — tick의 이동 절반.
 *  Math.min 캡이 없으면 남은 경로보다 예산이 클 때 path[steps-1]이 undefined가 되어
 *  폰 좌표가 NaN으로 오염된다(도착 직전 폰은 거의 항상 이 상황이다). */
export function stepMove(p: Pawn, minutes: number): Pawn {
  const steps = Math.min(p.path.length, minutes * PAWN_TILES_PER_MIN)
  if (steps === 0) return p
  const nextPos = p.path[steps - 1]
  return { ...p, x: nextPos.x, y: nextPos.y, path: p.path.slice(steps) }
}
