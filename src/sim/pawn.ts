// 폰 — 세계를 걸어다니는 개체(의사·환자)와 그 이동 계산. 순수 데이터·순수 함수.
// 경로는 목적지가 정해질 때 findPath로 1회 계산해 path에 저장하고, 틱은 소비만 한다
// (findPath는 최장 경로 ~3ms라 매 틱 재탐색하면 폰 수만큼 곱해져 프레임을 먹는다).
import type { DeptKey } from '../game/types'
import type { SimWorld } from './world'
import type { Pt } from './path'

/** 폰의 이동 속도 — 게임 분당 타일 수. 시간 분할 불변식이 성립하려면 정수여야 한다. */
export const PAWN_TILES_PER_MIN = 2

export type PawnKind = 'DOCTOR' | 'PATIENT'
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

/** 경로를 분 예산만큼 소비 — tick의 이동 절반.
 *  Math.min 캡이 없으면 남은 경로보다 예산이 클 때 path[steps-1]이 undefined가 되어
 *  폰 좌표가 NaN으로 오염된다(도착 직전 폰은 거의 항상 이 상황이다). */
export function stepMove(p: Pawn, minutes: number): Pawn {
  const steps = Math.min(p.path.length, minutes * PAWN_TILES_PER_MIN)
  if (steps === 0) return p
  const nextPos = p.path[steps - 1]
  return { ...p, x: nextPos.x, y: nextPos.y, path: p.path.slice(steps) }
}
