import type { DeptKey, Doctor, IncomingCall } from './types'
import type { ReceivingState } from './receiving' // type-only — 런타임 순환 없음
import { DEPARTMENTS, FIXED_BEDS } from './setup'
import { DAY_LENGTH_MIN, NIGHT_START_MIN, patienceMin, seededUnit } from './daysim'
import { CANDIDATES } from './candidates'

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
/**
 * ROOM = 진료실 안(의사 상주 + 진료대 환자) · BED = 병동 침대 · WAITING = 대기실 의자.
 * 복도 zone은 없다 — 의사가 환자와 나란히 줄 서 보이던 문제의 근원이라 제거했다(2026-07-24).
 */
export type AvatarZone = 'ROOM' | 'BED' | 'WAITING'

export interface MapAvatar {
  id: string
  kind: AvatarKind
  zone: AvatarZone
  /** 어느 방인가 — 의사는 소속 과(항상), 환자는 zone이 ROOM일 때만(진료받는 방). */
  dept?: DeptKey
  /**
   * 그 zone 안에서의 자리 인덱스 — 픽셀 좌표는 컴포넌트가 계산한다.
   * ROOM 환자의 slot 0은 **진료대**이고 1+는 서서 진료(진료대·병동이 다 찼을 때).
   */
  slot: number
  busy: boolean // 의사 전용
  /** 환자 전용 — 도착했으나 아직 진료를 못 받고 앉아 있다(진료 중인 환자와 구별). */
  waiting?: boolean
  candidateId?: string // 출신 지원자(초상 변주 키) — Doctor.candidateId 파생. 무명이면 없음
}

/**
 * 대기실 의자 수 = 대기 환자 아바타의 표시 상한.
 *
 * 게임은 대기 인원에 상한이 없다 — 이건 **순전히 가구의 문제**다. 의자가 6개뿐이라
 * 그 이상은 스프라이트가 서로 겹쳐 세는 게 불가능해진다. 넘친 인원은 사라지지 않고
 * `waitingOverflow`로 세어 화면이 「+N」으로 말한다.
 */
export const MAX_WAITING_AVATARS = 6

export interface MapScene {
  rooms: MapRoom[]
  beds: MapBed[]
  avatars: MapAvatar[]
  lighting: Lighting
  clockMin: number
  /** 지금 대기 중인 총원(상한과 무관한 진짜 수) — 화면 카운터가 이걸 쓴다. */
  waitingCount: number
  /** 그중 아바타로 못 그린 인원(= waitingCount − 표시분). 0이면 전원이 보인다. */
  waitingOverflow: number
}

/**
 * 그 순간의 병원 장면. 순수·결정론이고 **게임 상태를 만들지 않는다** — 저장되지 않는 파생 산출물이다.
 *
 * 핵심은 busyUntil 하나가 두 가지를 동시에 정한다는 것이다:
 *   (1) 의사가 진료 중인가(가운 밝기 + 방 안 환자 유무) — 의사는 어느 쪽이든 자기 방에 있다
 *   (2) 지금 병원에 환자가 몇 명 있는가, 그리고 어디에(진료대 → 병동 침대 → 방 안 입석 순)
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
  const litByDept = new Map(rooms.map((r) => [r.dept, r.lit]))

  const beds: MapBed[] = Array.from({ length: hospital.beds }, (_, index) => ({ index }))
  const avatars: MapAvatar[] = []
  // 의사·환자 각각 과별 ROOM 슬롯을 **따로** 센다: 의사 slot(0,1,…)은 방 안 서 있는 자리이고,
  // 환자 slot 0은 진료대·1+는 입석이라 좌표를 컴포넌트가 kind로 갈라 배치한다(겹치지 않는다).
  const docSlot = new Map<DeptKey, number>()
  const patSlot = new Map<DeptKey, number>()
  let nextBed = 0

  for (const doc of ordered) {
    const busy = isBusy(doc)
    // 의사는 **항상 자기 진료실**에 있다 — 복도 줄서기 없음. 단, 한가한데 방이 소등되면(야간·수익과)
    // 퇴근해 아바타가 사라진다. 진료가 남았으면(busy) 소등돼도 끝날 때까지 방을 지킨다.
    if (!busy && !litByDept.get(doc.dept)) continue
    const slot = docSlot.get(doc.dept) ?? 0
    docSlot.set(doc.dept, slot + 1)
    avatars.push({ id: doc.id, kind: 'DOCTOR', zone: 'ROOM', dept: doc.dept, slot, busy, candidateId: doc.candidateId })

    if (!busy) continue

    // 그 의사가 지금 보고 있는 환자. 과의 첫 환자는 진료대(ROOM slot 0), 그다음은 병동 침대,
    // 병동까지 차면 방 안에 서서(ROOM slot 1+) 받는다 — 환자는 상한 없이 어딘가엔 반드시 보인다.
    const patient = { id: `pat-${doc.id}`, kind: 'PATIENT' as const, busy: false }
    const seenInDept = patSlot.get(doc.dept) ?? 0
    patSlot.set(doc.dept, seenInDept + 1)
    if (seenInDept === 0) {
      avatars.push({ ...patient, zone: 'ROOM', dept: doc.dept, slot: 0 }) // 진료대
    } else if (nextBed < beds.length) {
      beds[nextBed].occupantDoctorId = doc.id
      avatars.push({ ...patient, zone: 'BED', slot: nextBed })
      nextBed++
    } else {
      avatars.push({ ...patient, zone: 'ROOM', dept: doc.dept, slot: seenInDept }) // 입석
    }
  }

  // 대기 환자 — 도착했는데 아직 진료를 시작 못 한 사람들. 이들이 대기실 의자를 채운다.
  const waiting = waitingCalls(receiving, atMin)
  waiting.slice(0, MAX_WAITING_AVATARS).forEach((call, i) => {
    avatars.push({ id: `wait-${call.id}`, kind: 'PATIENT', zone: 'WAITING', slot: i, busy: false, waiting: true })
  })

  return {
    rooms,
    beds,
    avatars,
    lighting,
    clockMin: atMin,
    waitingCount: waiting.length,
    waitingOverflow: Math.max(0, waiting.length - MAX_WAITING_AVATARS),
  }
}

/**
 * SETUP(개원 전) 장면 — ReceivingState가 아직 없는 시점을 hiredIds에서 직접 합성한다.
 * 개원 전·후가 **같은 MapScene 문법**이라 위저드의 빈 병원과 게임의 병원이 같은 공간으로 보인다
 * (스펙 §2 연속성 장치). 순수·결정론: 같은 hired = 같은 장면. 조명은 항상 DAY(개원 전 아침),
 * 채용한 지원자는 자기 방에 서 있다(zone ROOM · busy false — 아직 환자가 없다).
 * 모르는 id는 무시한다(toggleHired·doctorsCountsOf와 같은 방어 결).
 */
export function deriveSetupScene(hired: string[], beds: number = FIXED_BEDS): MapScene {
  const hiredSet = new Set(hired)
  const hiredCands = CANDIDATES.filter((c) => hiredSet.has(c.id))

  const rooms: MapRoom[] = ORDERED_DEPTS.map((d, col) => ({
    dept: d.key,
    label: d.label,
    col,
    staffed: hiredCands.some((c) => c.dept === d.key),
    lit: true,
  }))

  const roomSlot = new Map<DeptKey, number>()
  const avatars: MapAvatar[] = hiredCands.map((c) => {
    const slot = roomSlot.get(c.dept) ?? 0
    roomSlot.set(c.dept, slot + 1)
    return { id: `setup-${c.id}`, kind: 'DOCTOR' as const, zone: 'ROOM' as const, dept: c.dept, slot, busy: false, candidateId: c.id }
  })

  return {
    rooms,
    beds: Array.from({ length: beds }, (_, index) => ({ index })),
    avatars,
    lighting: 'DAY',
    clockMin: 0,
    waitingCount: 0,
    waitingOverflow: 0,
  }
}

/**
 * 시각 `atMin`에 **아직 진료를 못 받고 대기실에 앉아 있는** 콜들. 순수 파생 — 새 게임 상태 0개.
 *
 * 세 부류가 같은 자리에 앉는다. 셋 다 플레이어 눈엔 '기다리는 사람'이라 구분 없이 그린다:
 *   1. 도착했는데 아직 처리 전   — log에 항목이 없다(흐름이 멈춰 카드가 떠 있는 동안)
 *   2. 받았지만 시작 전         — startMin이 아직 안 왔다(앞사람이 그 과 의사를 점유 중)
 *   3. 기다리다 떠날 사람       — 한계 시각까지는 서 있다가 사라진다
 *
 * 3번의 퇴장 시각을 상태에 안 남기고 `arrivalMin + patienceMin`으로 다시 계산하는 이유:
 * 그게 `startMinFor`가 이탈을 판정한 바로 그 식이라 두 곳이 어긋날 수 없다. 필드를 하나 더
 * 늘리면 그때부터 둘을 맞춰야 한다.
 */
function waitingCalls(receiving: ReceivingState, atMin: number): IncomingCall[] {
  return receiving.queue.filter((call, i) => {
    const arrival = call.arrivalMin ?? 0
    if (arrival > atMin) return false // 아직 안 왔다
    const entry = receiving.log[i]
    if (entry === undefined) return true // ① 처리 전
    if (entry.startMin !== undefined) return atMin < entry.startMin // ② 시작 전까지만
    // ③ 못 받은 사람 — 기다리다 떠난 경우만 그 한계까지 서 있다(구조가 즉시 막은 콜은 안 선다)
    return entry.reason === 'LEFT_WAITING' && atMin < arrival + patienceMin(call.kind)
  })
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

// ── 배회·배경(연출 전용) ────────────────────────────────────────────────
// CSS 애니메이션 파라미터만 만든다. 이 층은 게임 시계(atMin)와 분리돼 있어,
// 플레이어가 콜 카드를 노려보는 동안 시계가 멈춰도 병원은 계속 돈다.

/** 문자열 id → 안정 정수. seededUnit에 먹여 아바타마다 다른 박자를 만든다. */
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0
  return h
}

/**
 * 아바타별 유휴 배회 박자 — 전원이 같은 박자로 흔들리면 사람이 아니라 기계로 보인다.
 * seededUnit 파생이라 같은 id는 항상 같은 박자다(RNG 0 원칙은 표시 레이어에도 적용된다).
 */
export function wanderTiming(id: string): { delayMs: number; durationMs: number } {
  const h = hashId(id)
  return {
    delayMs: Math.floor(seededUnit(h) * 2000),
    // salt를 xor 해 지연과 주기를 서로 다른 스트림에서 뽑는다(같은 seed면 둘이 같이 움직인다).
    durationMs: 2600 + Math.floor(seededUnit(h ^ 0x5bf03635) * 1600),
  }
}

/** 배경 보행자 한 명 — **게임 상태가 아니다**(순수 장식). 컴포넌트가 CSS 파라미터로 쓴다. */
export interface AmbientWalker {
  id: string
  delayMs: number
  durationMs: number
  /** 거리 안 통행 줄 0|1|2 — 컴포넌트가 세로 위치·진행 방향(홀짝)으로 옮긴다. */
  lane: number
}

/**
 * 조명별 배경 보행자 수. 밤에 텅 비는 것과 방이 꺼지는 것이 **같은 출처**(lighting)에서
 * 나온다 — 두 곳에 '밤'을 적으면 한쪽이 조용히 낡는다.
 */
const AMBIENT_COUNT: Record<Lighting, number> = { DAY: 5, DUSK: 2, NIGHT: 0 }

/**
 * 배경 보행자 목록 — 콜과 무관한 익명 통행이다.
 *
 * MapScene에 넣지 않는 이유: 이건 게임 상태 파생이 아니라 장식이라, avatars에 섞으면
 * (a) 「보이는 것 = 게임이 모델링하는 것」이 깨지고 (b) deriveMapScene의 테스트가
 * 장식을 검증하게 되고 (c) 방·의자 슬롯 카운터를 장식이 밀어낸다.
 *
 * id를 인덱스로 고정하는 이유: 조명이 바뀌어 인원이 줄어도 남는 사람은 같은 React key를
 * 유지해야 리마운트로 걸음이 끊기지 않는다.
 */
export function ambientWalkers(lighting: Lighting): AmbientWalker[] {
  return Array.from({ length: AMBIENT_COUNT[lighting] }, (_, i) => {
    const h = hashId(`amb-${i}`)
    return {
      id: `amb-${i}`,
      delayMs: Math.floor(seededUnit(h) * 8000),
      durationMs: 9000 + Math.floor(seededUnit(h ^ 0x2545f491) * 7000),
      lane: Math.floor(seededUnit(h ^ 0x1b873593) * 3),
    }
  })
}
