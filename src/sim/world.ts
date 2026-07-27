// 타일 세계 — 순수 데이터와 통행 판정. 렌더·React 임포트 금지.
import type { DeptKey } from '../game/types'
import type { Pawn } from './pawn' // 타입 전용 임포트 — pawn.ts가 world를 되받아도 순환 무해
import type { DayRecord } from './day' // 타입 전용 — day.ts가 SimWorld를 되받아도 런타임 순환 없음

export const GRID_W = 48
export const GRID_H = 32
export const INITIAL_TREASURY_MANWON = 50_000 // 개원 자본 5억(기존 경제와 동일 단위)

export type RoomType = 'EXAM' | 'WARD' | 'WAITING' | 'LOUNGE' | 'RECEPTION'

export interface Room {
  id: string
  type: RoomType
  dept?: DeptKey // EXAM만 사용(과 지정) — 1주차에선 미지정 허용
  x: number; y: number; w: number; h: number
}

export type FurnitureKind = 'DESK' | 'CHAIR' | 'BED' | 'COUNTER'
export interface Furniture { kind: FurnitureKind; x: number; y: number; roomId: string }

/** 세계의 진행 국면 — RUNNING일 때만 시간이 흐른다.
 *  마감·결산 화면 동안 세계가 계속 굴러가면 플레이어가 읽는 숫자와 세계가 어긋난다. */
export type SimPhase = 'RUNNING' | 'DAY_END' | 'WEEK_END' | 'CLOSED'

export interface SimWorld {
  minute: number   // 개장(09:00)부터의 게임 분
  day: number      // 1부터
  week: number     // 1부터
  phase: SimPhase
  treasuryManwon: number
  rooms: Room[]
  furniture: Furniture[]
  pawns: Pawn[]
  nextId: number
  seed: number
  /** 하루 집계 — 폰은 퇴장하면 배열에서 사라지므로, 무슨 일이 있었는지는 여기에만 남는다. */
  stats: SimStats
  /** 이번 주의 하루 기록 — 주를 넘기면 비운다(주간 결산이 이 배열을 합산한다). */
  days: DayRecord[]
}

export interface SimStats {
  examsDone: number  // 완료된 진료 수(수익의 근거)
  leftCount: number  // 대기 못 하고 떠난 환자 수(자리 부족 + 인내 초과)
}

export function createWorld(seed: number): SimWorld {
  return {
    minute: 0, day: 1, week: 1, phase: 'RUNNING', treasuryManwon: INITIAL_TREASURY_MANWON,
    rooms: [], furniture: [], pawns: [], nextId: 1, seed,
    stats: { examsDone: 0, leftCount: 0 }, days: [],
  }
}

export function doorTile(r: Room): { x: number; y: number } {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + r.h - 1 }
}

export function blockedPerimeter(r: Room): Array<{ x: number; y: number }> {
  const door = doorTile(r)
  const out: Array<{ x: number; y: number }> = []
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) {
    const onEdge = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1
    if (onEdge && !(x === door.x && y === door.y)) out.push({ x, y })
  }
  return out
}

export function isWalkable(w: SimWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false
  for (const r of w.rooms) {
    for (const t of blockedPerimeter(r)) if (t.x === x && t.y === y) return false
  }
  for (const f of w.furniture) if (f.x === x && f.y === y) return false
  return true
}
