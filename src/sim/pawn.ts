// 폰 — 세계를 걸어다니는 개체(의사·환자)와 그 이동 계산. 순수 데이터·순수 함수.
// 경로는 목적지가 정해질 때 findPath로 1회 계산해 path에 저장하고, 틱은 소비만 한다
// (findPath는 최장 경로 ~3ms라 매 틱 재탐색하면 폰 수만큼 곱해져 프레임을 먹는다).
import type { DeptKey } from '../game/types'
import { GRID_W, GRID_H, ENTRANCE, isWalkable, type SimWorld } from './world'
import type { SimDeptKey } from './dept'
import type { Pt } from './path'

/** 폰의 이동 속도 — 게임 분당 타일 수. 시간 분할 불변식이 성립하려면 정수여야 한다. */
export const PAWN_TILES_PER_MIN = 2

export type PawnKind = 'DOCTOR' | 'PATIENT'
/** ⚠️ 'PAYING'·'GONE'은 **2주차 예약**이라 지금은 아무도 만들지 않고 아무도 읽지 않는다.
 *  'PAYING'은 RECEPTION 경유 수납 흐름 자리, 'GONE'은 퇴장을 폰 제거가 아니라 상태로 남길 때의
 *  자리다(1주차는 입구에 닿으면 배열에서 바로 뺀다). 미사용이지만 지우지 않는다 — 흐름의 빈칸이
 *  타입에 보이는 편이 낫고, 2주차에 되살릴 때 이름이 흔들리지 않는다. */
export type PatientStage =
  | 'ENTERING' | 'WAITING' | 'TO_EXAM' | 'IN_EXAM' | 'PAYING' | 'LEAVING' | 'GONE' | 'LEFT_WAITING'

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
  dept?: DeptKey
  roomId?: string          // 배정된 진료실
  // PATIENT
  stage?: PatientStage
  arrivedMin?: number      // 대기 시작 시각(인내 계산)
  examUntilMin?: number
  doctorId?: string
}

export function spawnDoctor(w: SimWorld, dept: DeptKey, at: Pt): SimWorld {
  const p: Pawn = { id: `doc-${w.nextId}`, kind: 'DOCTOR', x: at.x, y: at.y, path: [], dept }
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
