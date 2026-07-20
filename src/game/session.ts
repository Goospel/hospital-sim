import type { Hospital, SetupChoices, Specialty } from './types'
import { buildHospital, bedExpansionCost, withinDeptCaps, DEPARTMENTS, DAYS_PER_WEEK, FIXED_BEDS } from './setup'
import { initWorld, applyEvent, selectEvent, EVENT_CATALOG, OPENING_EVENT, type WorldState, type WorldEvent } from './world'
import {
  accruedSegments, createCallQueue, initReceiving, requiresBackupCare, runningNetProfit, type ReceivingState,
} from './receiving'
import { DAY_LENGTH_MIN } from './daysim'
import { buildSessionLedger, type Ledger } from './ledger'
import { morningNews, renderNews, type NewsItem, type TurnedAway } from './news'
import { doctorCaseloads, stepFatigue } from './doctor'
import { initSystem, backgroundAttrition, hireDelta, canHire, type SystemState } from './system'
import { initialTreasury, doctorDeltaCost, withinTreasury } from './growth'

// 세션 상태기계 — 순수·결정론.
// LANDING → WORLD_EVENT → SETUP → (RECEIVING → DAY_END) ×7일 → WEEK_SUMMARY
//   → WEEK_SUMMARY ─┬─ nextWeek → WORLD_EVENT(다음 주, 같은 병원) → …          (계속)
//                   └─ endGame  → EPILOGUE (그때까지 모든 주 누적 결산)          (종료)
// 한 주 = 7일. 하루마다 콜 5통을 받고 마감하면 달력에 그날 손익이 한 칸 찍힌다. 7일차 마감은 곧바로 결산이다.
// 플레이어는 항상 '받는 벽'이다 — 응급을 못 받으면 그 환자가 다른 데서 뺑뺑이가 된다(내가 그 벽). 못 받은 응급은 신문이 된다.
// 게임은 한 주로 끝나지 않는다 — 사용자가 WEEK_SUMMARY에서 '종료'를 누를 때까지 주가 반복된다.
// 그래야 매주 재구성되는 세계(외생 이벤트)의 변화가 여러 주에 걸쳐 눈에 보인다.

/** 결말 장부(buildSessionLedger)의 필수 배후과 축 — 이 슬라이스는 CARDIOLOGY 채용을 결산에 반영한다. */
const STEMI_SPECIALTY: Specialty = 'CARDIOLOGY'

export type SessionPhase =
  | 'LANDING' | 'WORLD_EVENT' | 'GROWTH' | 'SETUP' | 'RECEIVING' | 'DAY_END'
  | 'WEEK_SUMMARY' | 'EPILOGUE'

/** 마감된 하루 한 칸 — 달력의 데이터 소스. 숫자만 담는다(해석은 어디에도 없다). */
export interface DayRecord {
  day: number // 1..7
  segmentShareBillions: number // 그날 부문 손익 몫(주간 손익 ÷ 7)
  callDeltaBillions: number // 그날 진료 수익
  workupRevenueBillions: number // 그날 검사 수익 — 진료 수익과 별도로 센다(장부에서 덮는 게 보여야 한다)
  workupCount: number // 그날 검사를 붙인 환자 수 — 내일 자리를 먹는다(boarding)
  /**
   * 그날 못 받은 필수 응급들(STEMI·분만·뇌출혈·중증외상) — 내일 아침 신문의 씨앗.
   * 구조가 막았든(하드락) 내가 거절했든 **환자는 똑같이 못 들어왔다.** 그래서 둘을 구분하지 않는다.
   */
  turnedAway: TurnedAway[]
  receivedEmergency: number // 그날 받은 필수 응급 수 — 돌려보낸 수(turnedAway)의 짝(결산 화면)
  netProfitBillions: number // 그날 순이익 = 위 셋의 합 (소송 비용은 결말에서만)
  accepted: number // 받은 콜 수
  blocked: number // 그 과 의사가 다 진료 중이라 구조가 막은 콜 수(NO_FREE_SPECIALIST) — 달력엔 안 찍히는 사람들
  lawsuitExposure: number // 그날 쌓인 소송 노출
}

export interface SessionState {
  phase: SessionPhase
  hospital?: Hospital
  receiving?: ReceivingState
  week: number // 1..∞ — 현재 주(사용자가 종료할 때까지 늘어난다)
  day: number // 1..DAYS_PER_WEEK — 현재 주의 날
  ledgerDays: DayRecord[] // 이번 주 마감된 날들(역순 아님, 1일차부터). 새 주에 리셋된다.
  /**
   * 완주한 모든 주의 날 기록(누적). completeWeek이 이번 주 ledgerDays를 여기 접어 넣는다.
   * ledgerDays는 요약 화면용 '이번 주'이고, history는 결말 누적 결산용 '전 주'다.
   */
  history: DayRecord[]
  /**
   * 오늘 아침 신문 — **어제** 돌려보낸 사람들의 후일담. 1일차엔 비어 있다(어제가 없다).
   * 인과 사슬의 마지막 고리다: 저수가 → 검사 → boarding → 자리 없음 → 수용 불가 → **다음날 신문**.
   */
  morningNews: NewsItem[]
  world?: WorldState // 외생 이벤트가 재구성한 세계(채용 경제). 없으면 기본 세계.
  event?: WorldEvent // WORLD_EVENT 화면에 고지할 이벤트.
  /** 유닛별 피로도(0~100). 표시 전용·판정 무관. 하루 마감(completeReceiving)에 스텝, 주 간 유지. */
  fatigue: Record<string, number>
  choices: SetupChoices   // 현재 병원 명단(매주 성장). 1주차 이후 재투자의 시작점.
  beds: number            // 병상 티어(초기 FIXED_BEDS).
  treasury: number        // 금고 잔고(억).
  system: SystemState     // 전국 의사 풀.
}

export function startSession(): SessionState {
  return {
    phase: 'LANDING', week: 1, day: 1, ledgerDays: [], history: [], morningNews: [], fatigue: {},
    choices: { hospitalName: '', doctors: {} }, beds: FIXED_BEDS, treasury: 0, system: initSystem(),
  }
}

/**
 * 전역 일차로 콜 큐를 만든다 — 주가 반복돼도 콜 id가 겹치지 않게 한다.
 * (week−1)×7 + day. 1주차는 day 그대로라 기존 큐·id와 완전히 동일하다(하위호환).
 * DAY_PLANS는 (전역일−1)%7로 순환하므로 콜 구성은 주마다 같지만, id는 d8·d9…로 고유해져
 * 누적 신문(결말)의 React 키 충돌을 구조적으로 막는다.
 */
function weekDayQueue(week: number, day: number) {
  return createCallQueue((week - 1) * DAYS_PER_WEEK + day)
}

/**
 * 랜딩 → 외생 이벤트 고지. 1주차 개원은 OPENING_EVENT(재정중립 정책수가 패키지)로 세계를 재구성한다.
 * 개원 이벤트인 이유: 월드 이벤트가 경제에 물리는 유일 지점이 이어지는 completeSetup뿐이라(world.ts OPENING_EVENT 주석).
 */
export function enterWorldEvent(state: SessionState): SessionState {
  if (state.phase !== 'LANDING') {
    throw new Error(`enterWorldEvent requires LANDING, got ${state.phase}`)
  }
  const event = OPENING_EVENT
  const world = applyEvent(initWorld(), event)
  return {
    phase: 'WORLD_EVENT', world, event, week: 1, day: 1, ledgerDays: [], history: [], morningNews: [], fatigue: {},
    choices: { hospitalName: '', doctors: {} }, beds: FIXED_BEDS, treasury: 0, system: initSystem(),
  }
}

/** 랜딩/이벤트 고지 → 위저드. world를 SETUP으로 실어 나른다(없으면 기본 세계). */
export function beginSetup(state: SessionState): SessionState {
  if (state.phase !== 'LANDING' && state.phase !== 'WORLD_EVENT') {
    throw new Error(`beginSetup requires LANDING or WORLD_EVENT, got ${state.phase}`)
  }
  return {
    phase: 'SETUP', world: state.world, event: state.event,
    week: 1, day: 1, ledgerDays: [], history: [], morningNews: [], fatigue: {},
    choices: { hospitalName: '', doctors: {} }, beds: FIXED_BEDS, treasury: 0, system: initSystem(),
  }
}

export function completeSetup(choices: SetupChoices, world: WorldState = initWorld()): SessionState {
  const { hospital } = buildHospital(choices, world.departments)
  return {
    phase: 'RECEIVING',
    hospital,
    receiving: initReceiving(hospital, weekDayQueue(1, 1)),
    world,
    week: 1,
    day: 1,
    ledgerDays: [],
    history: [],
    morningNews: [], // 개원 첫날 아침엔 어제가 없다
    fatigue: {},
    choices,
    beds: FIXED_BEDS,
    treasury: initialTreasury(choices, world.departments),
    system: initSystem(),
  }
}

/** 7일차인가 — 이 날 마감은 다음 날이 아니라 주간 결산으로 이어진다. */
export function isLastDay(state: SessionState): boolean {
  return state.day >= DAYS_PER_WEEK
}

/**
 * 어제 receiving.busyUntil에서 마감(DAY_LENGTH_MIN) 초과분만 오늘 초기 점유로 이월한다(boarding의 시간 버전).
 * 마감 전에 끝난 진료(대부분)는 초과가 없어 이월도 없다 — 장시술·검사처럼 마감을 넘겨 진행 중이던 것만 남는다.
 */
function boardedBusyUntilFrom(receiving: ReceivingState | undefined): Record<string, number> {
  const boarded: Record<string, number> = {}
  for (const [id, until] of Object.entries(receiving?.busyUntil ?? {})) {
    const over = until - DAY_LENGTH_MIN
    if (over > 0) boarded[id] = over
  }
  return boarded
}

/** 마감된 하루에서 달력 한 칸을 만든다(순수). */
function recordDay(day: number, receiving: ReceivingState): DayRecord {
  const segmentShareBillions = accruedSegments(receiving).reduce((n, s) => n + s.profitBillions, 0)
  return {
    day,
    segmentShareBillions,
    callDeltaBillions: receiving.netProfitDeltaBillions,
    workupRevenueBillions: receiving.workupRevenueBillions,
    workupCount: receiving.workupCount,
    // 못 받은 **필수 응급 4종**이 기사가 된다 — 일반 응급·미용 워크인을 돌려보낸 건 뉴스가 아니다.
    // kind를 실어 신문이 종류별 헤드라인(심근경색/뇌출혈/중증외상/분만)을 낼 수 있게 한다.
    turnedAway: receiving.log
      .map((e, i) => ({ entry: e, call: receiving.queue[i] }))
      .filter((x) => requiresBackupCare(x.call.kind) && !x.entry.accepted)
      .map((x) => ({ callId: x.entry.callId, kind: x.call.kind, reason: x.entry.reason })),
    // 받은 필수 응급 — 돌려보낸 수의 짝. 일반 응급·워크인은 세지 않는다(응급의 '핵심'만).
    receivedEmergency: receiving.log.filter((e, i) => e.accepted && requiresBackupCare(receiving.queue[i].kind)).length,
    netProfitBillions: runningNetProfit(receiving),
    accepted: receiving.log.filter((e) => e.accepted).length,
    blocked: receiving.log.filter((e) => e.reason === 'NO_FREE_SPECIALIST').length,
    lawsuitExposure: receiving.lawsuitExposure,
  }
}

/** 하루 마감 — RECEIVING(done) → DAY_END. 달력에 그날 한 칸을 남긴다. */
export function completeReceiving(state: SessionState): SessionState {
  if (state.phase !== 'RECEIVING') {
    throw new Error(`completeReceiving requires RECEIVING, got ${state.phase}`)
  }
  if (!state.receiving?.done) {
    throw new Error('receiving not done')
  }
  const roster = state.hospital?.roster ?? []
  const caseloads = doctorCaseloads(roster, state.receiving)
  return {
    ...state,
    phase: 'DAY_END',
    ledgerDays: [...state.ledgerDays, recordDay(state.day, state.receiving)],
    fatigue: stepFatigue(state.fatigue, caseloads),
  }
}

/**
 * 하루 마감 뒤 전진 — DAY_END(day < 7) → 다음 날 RECEIVING(새 큐·자리 리셋·그날 델타 0에서 시작).
 * 7일차는 다음 날이 없다 — 그날 DAY_END는 advanceDay가 아니라 completeWeek(→ 주간 결산)으로 간다.
 */
export function advanceDay(state: SessionState): SessionState {
  if (state.phase !== 'DAY_END') {
    throw new Error(`advanceDay requires DAY_END, got ${state.phase}`)
  }
  if (isLastDay(state)) {
    throw new Error('advanceDay: last day ends the week — use completeWeek')
  }
  const day = state.day + 1
  // 어제 마감을 넘겨 진행 중이던 진료(장시술·검사)는 그 의사를 오늘 아침까지 붙잡는다(boarding의 시간 버전).
  // 어제 돌려보낸 사람들이 오늘 아침 신문으로 온다 — 이틀 뒤가 아니라 바로 다음 날이다.
  const yesterday = state.ledgerDays[state.ledgerDays.length - 1]
  return {
    ...state,
    phase: 'RECEIVING',
    day,
    receiving: initReceiving(state.hospital!, weekDayQueue(state.week, day), boardedBusyUntilFrom(state.receiving)),
    morningNews: morningNews(day, yesterday?.turnedAway ?? []),
  }
}

interface DayTotals {
  netProfitDeltaBillions: number
  workupRevenueBillions: number
  lawsuitExposure: number
}

/** 날 기록 배열을 합산한다 — 이번 주(weekTotals)와 전 주 누적(buildEpilogue)이 공유하는 코어. */
function sumTotals(days: DayRecord[]): DayTotals {
  return {
    netProfitDeltaBillions: days.reduce((n, r) => n + r.callDeltaBillions, 0),
    workupRevenueBillions: days.reduce((n, r) => n + r.workupRevenueBillions, 0),
    lawsuitExposure: days.reduce((n, r) => n + r.lawsuitExposure, 0),
  }
}

/**
 * 이번 주 합계 — 요약 화면·기존 테스트용.
 * ⚠️ 마지막 날의 receiving만 쓰면 7일 중 하루치만 계상된다. 반드시 ledgerDays를 합산한다.
 */
export function weekTotals(state: SessionState): DayTotals {
  return sumTotals(state.ledgerDays)
}

/** 이번 주 돌려보낸 응급 총원 — 주간 결산 화면용(2막 생존 지표를 대체한다). */
export function weekTurnedAwayCount(state: SessionState): number {
  return state.ledgerDays.reduce((n, d) => n + d.turnedAway.length, 0)
}

/** 이번 주 받은 필수 응급 총원 — 결산 화면에서 돌려보낸 수와 나란히 보여 준다(받은/돌려보낸). */
export function weekReceivedEmergencyCount(state: SessionState): number {
  return state.ledgerDays.reduce((n, d) => n + d.receivedEmergency, 0)
}

/**
 * 완주한 모든 주의 누적 순손익(억) — 주가 쌓일수록 커진다(주간 결산 화면의 '지금까지' 숫자).
 * netProfitBillions는 일당 구조 손익 1/7을 이미 포함하므로 N주를 그냥 더하면 N주치가 맞는다(스케일 문제 없음).
 */
export function cumulativeNetBillions(state: SessionState): number {
  return state.history.reduce((n, d) => n + d.netProfitBillions, 0)
}

/**
 * 한 주 완주 — 7일차 DAY_END → WEEK_SUMMARY. 이번 주 ledgerDays를 history에 접어 넣는다.
 * 여기서 게임이 끝나지 않는다: 이어서 nextWeek(다음 주) 또는 endGame(종료)을 사용자가 고른다.
 */
export function completeWeek(state: SessionState): SessionState {
  if (state.phase !== 'DAY_END') {
    throw new Error(`completeWeek requires DAY_END, got ${state.phase}`)
  }
  if (!isLastDay(state)) {
    throw new Error('completeWeek requires the last day (day 7)')
  }
  const weekNet = state.ledgerDays.reduce((n, d) => n + d.netProfitBillions, 0)
  return {
    ...state,
    phase: 'WEEK_SUMMARY',
    history: [...state.history, ...state.ledgerDays],
    treasury: state.treasury + weekNet,
  }
}

/**
 * 다음 주로 — WEEK_SUMMARY → WORLD_EVENT. 병원은 유지하고, 다음 외생 이벤트를 **현재 세계 위에 누적**한다.
 * 카탈로그를 주차로 순환(selectEvent((week−1)%N))해 매주 새 헤드라인이 뜬다 — 세계 변화가 여러 주에 걸쳐 쌓인다.
 * 이번 주 진행 상태(day·달력·콜)만 리셋하고, history는 보존한다.
 */
export function nextWeek(state: SessionState): SessionState {
  if (state.phase !== 'WEEK_SUMMARY') {
    throw new Error(`nextWeek requires WEEK_SUMMARY, got ${state.phase}`)
  }
  const week = state.week + 1
  const event = selectEvent((week - 1) % EVENT_CATALOG.length)
  const world = applyEvent(state.world ?? initWorld(), event)
  return {
    ...state,
    phase: 'WORLD_EVENT',
    week,
    world,
    event,
    day: 1,
    ledgerDays: [],
    receiving: undefined,
    morningNews: [],
    system: backgroundAttrition(state.system, week),
  }
}

/** 성장 총비용(억) = 채용 증분 + 병상 증설. */
export function growthCostOf(state: SessionState, nextChoices: SetupChoices, nextBeds: number): number {
  const deps = state.world?.departments ?? DEPARTMENTS
  return doctorDeltaCost(state.choices, nextChoices, deps) + bedExpansionCost(state.beds, nextBeds)
}

/** 배후과 증분(양수)만 뽑아 풀 검증에 쓴다. */
function backupDeltas(state: SessionState, next: SetupChoices): Partial<Record<Specialty, number>> {
  const deps = state.world?.departments ?? DEPARTMENTS
  const out: Partial<Record<Specialty, number>> = {}
  for (const d of deps) {
    if (!d.providesBackup) continue
    const delta = (next.doctors[d.key] ?? 0) - (state.choices.doctors[d.key] ?? 0)
    if (delta !== 0) out[d.providesBackup] = (out[d.providesBackup] ?? 0) + delta
  }
  return out
}

/** 성장 가능한가 — 해고 없음 · 금고·상한·풀 이내. */
export function canApplyGrowth(state: SessionState, next: SetupChoices, nextBeds: number): boolean {
  const deps = state.world?.departments ?? DEPARTMENTS
  // 해고 방지: 모든 과가 현재 이상
  const noFiring = deps.every((d) => (next.doctors[d.key] ?? 0) >= (state.choices.doctors[d.key] ?? 0))
  if (!noFiring) return false
  if (!withinDeptCaps(next, deps, nextBeds)) return false
  if (!withinTreasury(growthCostOf(state, next, nextBeds), state.treasury)) return false
  const deltas = backupDeltas(state, next)
  return (Object.keys(deltas) as Specialty[]).every((s) => canHire(state.system, s, deltas[s] ?? 0))
}

/** WORLD_EVENT(병원 있음) → GROWTH. */
export function enterGrowth(state: SessionState): SessionState {
  if (state.phase !== 'WORLD_EVENT') throw new Error(`enterGrowth requires WORLD_EVENT, got ${state.phase}`)
  if (!state.hospital) throw new Error('enterGrowth requires an existing hospital')
  return { ...state, phase: 'GROWTH' }
}

/** 성장 적용 — 병원 재구성 + 금고/풀 차감 + choices/beds 갱신. GROWTH 유지(이어서 beginWeek). */
export function applyGrowth(state: SessionState, next: SetupChoices, nextBeds: number): SessionState {
  if (state.phase !== 'GROWTH') throw new Error(`applyGrowth requires GROWTH, got ${state.phase}`)
  const deps = state.world?.departments
  const cost = growthCostOf(state, next, nextBeds)
  const { hospital } = buildHospital(next, deps, nextBeds)
  return {
    ...state,
    hospital,
    choices: next,
    beds: nextBeds,
    treasury: state.treasury - cost,
    system: hireDelta(state.system, backupDeltas(state, next)),
  }
}

/**
 * 새 주 개시 — GROWTH(2주차 이후) → RECEIVING. 재설립 없이 **같은 병원**으로 새 주 1일차를 연다.
 * 1주차는 WORLD_EVENT → SETUP(개원)이지만, 2주차부터는 WORLD_EVENT → GROWTH(재투자)를 거쳐 병원이 이미
 * 있으므로 위저드를 건너뛴다.
 */
export function beginWeek(state: SessionState): SessionState {
  if (state.phase !== 'GROWTH') {
    throw new Error(`beginWeek requires GROWTH, got ${state.phase}`)
  }
  if (!state.hospital) {
    throw new Error('beginWeek requires an existing hospital (use beginSetup for week 1)')
  }
  return {
    ...state,
    phase: 'RECEIVING',
    day: 1,
    ledgerDays: [],
    receiving: initReceiving(state.hospital, weekDayQueue(state.week, 1)),
    morningNews: [],
  }
}

/** 종료 — WEEK_SUMMARY → EPILOGUE. 사용자가 게임의 끝을 정한다. */
export function endGame(state: SessionState): SessionState {
  if (state.phase !== 'WEEK_SUMMARY') {
    throw new Error(`endGame requires WEEK_SUMMARY, got ${state.phase}`)
  }
  return { ...state, phase: 'EPILOGUE' }
}

export interface SessionEpilogue {
  ledger: Ledger | null
  /**
   * 이번 주 신문 — 1막 7일 누적 돌려보낸 응급(누적 결산). 플레이 중 아침 신문으로 스친 기사와
   * 글자까지 동일하되, **7일차 것까지** 모은다(아침 신문은 8일차가 없어 마지막 날을 놓친다).
   */
  weekNews: NewsItem[]
}

export function buildEpilogue(state: SessionState): SessionEpilogue {
  if (state.phase !== 'EPILOGUE') {
    throw new Error(`buildEpilogue requires EPILOGUE, got ${state.phase}`)
  }
  const hospital = state.hospital!
  // 에필로그는 **최종 주** 결산을 보고한다(구조 손익은 econ.segments의 1주치라 ledgerDays 기준으로 정합).
  // 여러 주를 누적하려면 구조 손익을 ×주수로 스케일하고 일회성 채용을 분리해야 해 이 슬라이스 밖이다 —
  // 주 간 누적은 매 WEEK_SUMMARY의 cumulativeNetBillions로 보여 준다(스케일 문제 없는 경로).
  const ledger = buildSessionLedger(hospital, STEMI_SPECIALTY, weekTotals(state))
  // 최종 주 신문: 그 주 7일 내내 돌려보낸 응급을 한 자리에 모은다(turnedAway를 flatten).
  const weekNews = renderNews(state.ledgerDays.flatMap((d) => d.turnedAway))
  return { ledger, weekNews }
}
