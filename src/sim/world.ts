// 타일 세계 — 순수 데이터와 통행 판정. 렌더·React 임포트 금지.
import type { DeptKey } from '../game/types'
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
  /** 금고가 음수로 끝난 주가 몇 번 **연속**됐는가 — 기존 게임의 폐업 규칙(2주 연속)이 읽는다.
   *  흑자로 끝난 주가 한 번이라도 끼면 0으로 리셋된다(누적이 아니라 연속이다). */
  insolvencyStreak: number
  /** 이번 주 결산(고정비 차감)이 이미 끝났는가 — 이중 정산 가드.
   *  phase를 바꿔 표시하지 않는 이유: 결산 화면은 `WEEK_END` 하나로 떠 있고 그 화면 **안에서**
   *  결산이 돌기 때문이다(진입 시 자동 1회 → 요약을 읽고 → 다음 주 버튼). phase를 옮기면
   *  결산이 끝나는 순간 플레이어가 읽어야 할 화면이 사라진다. */
  weekSettled: boolean
}

export interface SimStats {
  examsDone: number  // 완료된 진료 수(수익의 근거)
  leftCount: number  // 대기 못 하고 떠난 환자 수(자리 부족 + 인내 초과)
}

export function createWorld(seed: number): SimWorld {
  return {
    minute: 0, day: 1, week: 1, phase: 'RUNNING', treasuryManwon: INITIAL_TREASURY_MANWON,
    rooms: [], furniture: [], pawns: [], nextId: 1, seed,
    stats: { examsDone: 0, leftCount: 0 }, days: [], insolvencyStreak: 0, weekSettled: false,
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
