import type { DeptKey, Doctor } from './types'
import type { ReceivingState } from './receiving' // type-only — 런타임 순환 없음
import { DEPARTMENTS } from './setup'
import { DAY_LENGTH_MIN, NIGHT_START_MIN } from './daysim'

// 병원 맵 표시 레이어 — 순수·결정론. 판정·경제에 절대 닿지 않는다(0 침습).
// 새 게임 상태 0개: ReceivingState 하나에서 그 순간의 장면을 파생만 한다.

export type Lighting = 'DAY' | 'DUSK' | 'NIGHT'

/**
 * 석양 구간 길이(분) — 이 파일이 새로 정하는 **연출값**이다(판정 무관).
 * 반면 야간 경계는 정의하지 않고 daysim.ts의 NIGHT_START_MIN을 그대로 쓴다 —
 * 콜에 '야간' 배지를 붙이는 그 상수라, 화면의 밤과 게임의 야간이 어긋날 수 없다.
 */
export const DUSK_LEAD_MIN = 120

export function lightingAt(atMin: number): Lighting {
  if (atMin >= NIGHT_START_MIN) return 'NIGHT'
  if (atMin >= NIGHT_START_MIN - DUSK_LEAD_MIN) return 'DUSK'
  return 'DAY'
}

/**
 * 과 표시 순서 — 필수과 먼저(붕괴가 보이는 쪽) → 수익과, 같은 군은 DEPARTMENTS 순.
 * 맵의 방 순서와 DoctorRoster의 명단 순서가 **이 함수 하나**를 공유한다 —
 * 두 표면의 순서가 어긋나면 같은 병원이 두 개로 보인다.
 */
export function compareDeptKeys(a: DeptKey, b: DeptKey): number {
  const ia = DEPARTMENTS.findIndex((d) => d.key === a)
  const ib = DEPARTMENTS.findIndex((d) => d.key === b)
  const ea = DEPARTMENTS[ia].essential
  const eb = DEPARTMENTS[ib].essential
  if (ea !== eb) return ea ? -1 : 1
  return ia - ib
}

/** 방 배열의 열 순서 = 과 표시 순서. 모듈 로드 시 1회 계산(불변). */
const ORDERED_DEPTS = [...DEPARTMENTS].sort((a, b) => compareDeptKeys(a.key, b.key))

/** 방 한 칸. 안 뽑은 과도 칸을 차지한다(빈 방으로 보이는 게 목적). */
export interface MapRoom {
  dept: DeptKey
  label: string
  col: number
  staffed: boolean
  lit: boolean
}

/** 침대 한 칸. beds 티어만큼 존재하고, 비어 있어도 칸은 남는다. */
export interface MapBed {
  index: number
  occupantDoctorId?: string
}

export type AvatarKind = 'DOCTOR' | 'PATIENT'
export type AvatarZone = 'ROOM' | 'CORRIDOR' | 'BED'

export interface MapAvatar {
  id: string
  kind: AvatarKind
  zone: AvatarZone
  /**
   * 의사의 소속 과 — ROOM이면 어느 방인지이고, CORRIDOR여도 그대로 실린다.
   * (설계 스펙 §3은 "ROOM일 때"라고 썼지만, 복도의 순환기 의사도 과 색으로 알아볼 수 있어야 해서 항상 싣는다.
   *  정보가 늘 뿐이라 소비자는 zone으로만 분기하면 된다.) 환자는 undefined.
   */
  dept?: DeptKey
  slot: number // 그 zone 안에서의 자리 인덱스 — 픽셀 좌표는 컴포넌트가 계산한다
  busy: boolean // 의사 전용
}

export interface MapScene {
  rooms: MapRoom[]
  beds: MapBed[]
  avatars: MapAvatar[]
  lighting: Lighting
  clockMin: number
}

/**
 * 그 순간의 병원 장면. 순수·결정론이고 **게임 상태를 만들지 않는다** — 저장되지 않는 파생 산출물이다.
 *
 * 핵심은 busyUntil 하나가 두 가지를 동시에 정한다는 것이다:
 *   (1) 의사가 진료실 안인가 복도인가
 *   (2) 지금 병원에 환자가 몇 명 누워 있는가
 * decide()가 수용 시 정확히 한 명을 arrivalMin+durationMin까지 점유하므로
 * **진료 중인 의사 1명 = 환자 1명**이다. log를 훑을 필요도, 배정을 재현할 필요도 없다
 * (log에는 담당 의사 id가 없어 재현 자체가 불가능하다 — 설계 스펙 §4.3).
 */
export function deriveMapScene(receiving: ReceivingState, atMin: number): MapScene {
  const { hospital } = receiving
  const lighting = lightingAt(atMin)
  const roundTheClock = hospital.roundTheClockBackup ?? []
  const roster = hospital.roster ?? []

  const rooms: MapRoom[] = ORDERED_DEPTS.map((d, col) => ({
    dept: d.key,
    label: d.label,
    col,
    staffed: roster.some((doc) => doc.dept === d.key),
    // 야간엔 24시간 배후가 서는 과만 켜진다. 수익과는 애초에 roundTheClockBackup에 없어 함께 꺼진다.
    // (some(===)을 쓰는 이유: roundTheClockBackup은 Specialty[]라 DeptKey를 includes에 못 넣는다.)
    lit: lighting !== 'NIGHT' || roundTheClock.some((s) => s === d.key),
  }))

  // 방 순서와 같은 규칙으로 정렬해 아바타 배치·침대 배정을 결정론으로 만든다.
  const ordered = [...roster].sort((a, b) => compareDeptKeys(a.dept, b.dept))
  const isBusy = (doc: Doctor) => (receiving.busyUntil[doc.id] ?? 0) > atMin

  const beds: MapBed[] = Array.from({ length: hospital.beds }, (_, index) => ({ index }))
  const avatars: MapAvatar[] = []
  const roomSlot = new Map<DeptKey, number>()
  let corridorSlot = 0 // 의사·환자가 한 카운터를 공유한다 — 복도에서 자리가 겹치지 않게
  let nextBed = 0

  for (const doc of ordered) {
    if (!isBusy(doc)) {
      avatars.push({ id: doc.id, kind: 'DOCTOR', zone: 'CORRIDOR', dept: doc.dept, slot: corridorSlot++, busy: false })
      continue
    }
    const slot = roomSlot.get(doc.dept) ?? 0
    roomSlot.set(doc.dept, slot + 1)
    avatars.push({ id: doc.id, kind: 'DOCTOR', zone: 'ROOM', dept: doc.dept, slot, busy: true })

    // 그 의사가 지금 보고 있는 환자. 침대가 남으면 눕고, 정원을 넘으면 복도에서 기다린다.
    const patient = { id: `pat-${doc.id}`, kind: 'PATIENT' as const, busy: false }
    if (nextBed < beds.length) {
      beds[nextBed].occupantDoctorId = doc.id
      avatars.push({ ...patient, zone: 'BED', slot: nextBed })
      nextBed++
    } else {
      avatars.push({ ...patient, zone: 'CORRIDOR', slot: corridorSlot++ })
    }
  }

  return { rooms, beds, avatars, lighting, clockMin: atMin }
}

// ── 시계 흐름(연출 전용) ────────────────────────────────────────────────
// 게임 상태와 무관하다. 중간에 끊기든 스킵하든 판정에 영향 0.

/**
 * 게임 1분당 재생 시간(ms). **캡이 없다.**
 *
 * 캡을 두면 "게임 1분 = 50ms" 계약이 긴 구간에서만 깨져, 같은 길이의 구간이
 * 어떤 날은 6초 어떤 날은 1.5초가 된다 — 화면 속도가 게임 시간과 어긋나는 게
 * 긴 구간을 기다리는 것보다 나쁘다. 긴 구간의 탈출구는 건너뛰기다.
 */
export const MS_PER_GAME_MIN = 50
/** 실시간 틱 간격(ms). 100ms마다 2게임분 → 시계 표시가 초당 10번 갱신돼 '흐르는' 것으로 읽힌다. */
export const CLOCK_TICK_MS = 100

/** 이 구간 재생에 쓸 총 시간(ms). 되감기·0구간은 0. */
export function flowDurationMs(from: number, to: number): number {
  return Math.max(0, to - from) * MS_PER_GAME_MIN
}

/**
 * 이 구간을 몇 프레임으로 쪼갤지 — 항상 1 이상이고 **구간 길이(분)를 넘지 않는다**.
 *
 * 상한이 중요하다: steps > 구간분이면 sweepMinutes의 반올림이 같은 분을 두 번 내
 * 무변화 프레임이 생긴다. MS_PER_GAME_MIN(50) < CLOCK_TICK_MS(100)이라
 * steps ≈ 구간분/2 로 그 상한 아래에 구조적으로 머문다(테스트가 전 구간 검증).
 */
export function flowStepCount(from: number, to: number): number {
  return Math.max(1, Math.round(flowDurationMs(from, to) / CLOCK_TICK_MS))
}

/**
 * 오늘이 **실제로** 끝나는 시각 — 마감(DAY_LENGTH_MIN)과 마지막 진료 종료 중 늦은 쪽.
 *
 * 새 숫자를 만들지 않는다: session.ts의 boardedBusyUntilFrom이 이미 이 초과분을
 * 내일 아침 점유로 넘기고 있다. 구현돼 있고 돌아가고 있는데 화면이 한 번도 안
 * 보여줬을 뿐이다 — 여기선 그걸 **보이게만** 한다.
 *
 * 상한: arrivalMin ≤ 599 + durationMin ≤ 180 = 779(21:59)라 자정을 안 넘는다.
 */
export function dayEndMin(busyUntil: Record<string, number>): number {
  return Math.max(DAY_LENGTH_MIN, ...Object.values(busyUntil))
}

/**
 * from(제외) → to(포함)를 steps개로 나눈 시각열.
 * 구간이 없거나 steps ≤ 1이면 [to] 하나 — 즉시 점프(prefers-reduced-motion 경로).
 *
 * ⚠️ steps > (to − from)이면 반올림이 같은 분을 여러 번 낸다(무변화 프레임).
 * 호출부는 flowStepCount를 쓴다 — 그게 이 상한을 구조적으로 지킨다.
 */
export function sweepMinutes(from: number, to: number, steps: number): number[] {
  if (to <= from || steps <= 1) return [to]
  const span = to - from
  return Array.from({ length: steps }, (_, i) => from + Math.round((span * (i + 1)) / steps))
}
