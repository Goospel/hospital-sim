import type { Hospital, SetupChoices, Specialty } from './types'
import { buildHospital, DAYS_PER_WEEK } from './setup'
import { initWorld, applyEvent, selectEvent, type WorldState, type WorldEvent } from './world'
import {
  accruedSegments, createCallQueue, initReceiving, runningNetProfit, type ReceivingState,
} from './receiving'
import { startGame, type GameState } from './round'
import { createStemiScenario } from './scenarios'
import { buildDebrief, type Debrief } from './debrief'
import { buildSessionLedger, type Ledger } from './ledger'
import { morningNews, renderNews, type NewsItem, type TurnedAway } from './news'

// 2막 단막극 세션 상태기계 — 순수·결정론.
// LANDING → SETUP → (RECEIVING → DAY_END) ×7일 → INTERSTITIAL → EMERGENCY → EPILOGUE.
// 한 판 = 한 주(7일). 하루마다 콜 5통을 받고 마감하면 달력에 그날 손익이 한 칸 찍힌다.
// 7일차 마감에만 INTERSTITIAL이 붙는다 — 매일 응급(180초)을 걸면 총 플레이가 일수에 비례해 늘어난다.
// beginEmergency가 hospital.backupCare로 in-house 생존 vs 기존 전원 뺑뺑이를 가른다(철학 ii).

/** STEMI 슬라이스가 요구하는 배후과(이번 주 유일 축, spec ⓐ). */
const STEMI_SPECIALTY: Specialty = 'CARDIOLOGY'

export type SessionPhase =
  | 'LANDING' | 'WORLD_EVENT' | 'SETUP' | 'RECEIVING' | 'DAY_END' | 'INTERSTITIAL' | 'EMERGENCY' | 'EPILOGUE'

export type EmergencyState =
  | { mode: 'IN_HOUSE' } // 순환기 배후 있음 → 내 응급실이 직접 PCI → 생존
  | { mode: 'TRANSFER'; game: GameState } // 순환기 없음 → 기존 STEMI 뺑뺑이

/** 마감된 하루 한 칸 — 달력의 데이터 소스. 숫자만 담는다(해석은 어디에도 없다). */
export interface DayRecord {
  day: number // 1..7
  segmentShareBillions: number // 그날 부문 손익 몫(주간 손익 ÷ 7)
  callDeltaBillions: number // 그날 진료 수익
  workupRevenueBillions: number // 그날 검사 수익 — 진료 수익과 별도로 센다(장부에서 덮는 게 보여야 한다)
  workupCount: number // 그날 검사를 붙인 환자 수 — 내일 자리를 먹는다(boarding)
  /**
   * 그날 못 받은 STEMI들 — 내일 아침 신문의 씨앗.
   * 구조가 막았든(하드락) 내가 거절했든 **환자는 똑같이 못 들어왔다.** 그래서 둘을 구분하지 않는다.
   */
  turnedAway: TurnedAway[]
  netProfitBillions: number // 그날 순이익 = 위 셋의 합 (소송 비용은 결말에서만)
  accepted: number // 받은 콜 수
  blocked: number // 자리가 없어 구조가 막은 콜 수 — 달력엔 안 찍히는 사람들
  lawsuitExposure: number // 그날 쌓인 소송 노출
}

export interface SessionState {
  phase: SessionPhase
  hospital?: Hospital
  receiving?: ReceivingState
  emergency?: EmergencyState
  day: number // 1..DAYS_PER_WEEK — 현재 날
  ledgerDays: DayRecord[] // 마감된 날들(역순 아님, 1일차부터)
  /**
   * 오늘 아침 신문 — **어제** 돌려보낸 사람들의 후일담. 1일차엔 비어 있다(어제가 없다).
   * 인과 사슬의 마지막 고리다: 저수가 → 검사 → boarding → 자리 없음 → 수용 불가 → **다음날 신문**.
   */
  morningNews: NewsItem[]
  world?: WorldState // 외생 이벤트가 재구성한 세계(채용 경제). 없으면 기본 세계.
  event?: WorldEvent // WORLD_EVENT 화면에 고지할 이벤트.
}

export function startSession(): SessionState {
  return { phase: 'LANDING', day: 1, ledgerDays: [], morningNews: [] }
}

/** 랜딩 → 외생 이벤트 고지. 이벤트를 결정론으로 확정하고 세계(채용 경제)를 재구성한다(spec §5.3: selectEvent(0)). */
export function enterWorldEvent(state: SessionState): SessionState {
  if (state.phase !== 'LANDING') {
    throw new Error(`enterWorldEvent requires LANDING, got ${state.phase}`)
  }
  const event = selectEvent(0)
  const world = applyEvent(initWorld(), event)
  return { phase: 'WORLD_EVENT', world, event, day: 1, ledgerDays: [], morningNews: [] }
}

/** 랜딩/이벤트 고지 → 위저드. world를 SETUP으로 실어 나른다(없으면 기본 세계). */
export function beginSetup(state: SessionState): SessionState {
  if (state.phase !== 'LANDING' && state.phase !== 'WORLD_EVENT') {
    throw new Error(`beginSetup requires LANDING or WORLD_EVENT, got ${state.phase}`)
  }
  return { phase: 'SETUP', world: state.world, event: state.event, day: 1, ledgerDays: [], morningNews: [] }
}

export function completeSetup(choices: SetupChoices, world: WorldState = initWorld()): SessionState {
  const { hospital } = buildHospital(choices, world.departments)
  return {
    phase: 'RECEIVING',
    hospital,
    receiving: initReceiving(hospital, createCallQueue(1)),
    world,
    day: 1,
    ledgerDays: [],
    morningNews: [], // 개원 첫날 아침엔 어제가 없다
  }
}

/** 7일차인가 — 이 날 마감은 다음 날이 아니라 응급으로 이어진다. */
export function isLastDay(state: SessionState): boolean {
  return state.day >= DAYS_PER_WEEK
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
    // 못 받은 STEMI만 기사가 된다 — 미용 워크인을 돌려보낸 건 뉴스가 아니다.
    turnedAway: receiving.log
      .map((e, i) => ({ entry: e, call: receiving.queue[i] }))
      .filter((x) => x.call.kind === 'STEMI' && !x.entry.accepted)
      .map((x) => ({ callId: x.entry.callId, reason: x.entry.reason })),
    netProfitBillions: runningNetProfit(receiving),
    accepted: receiving.log.filter((e) => e.accepted).length,
    blocked: receiving.log.filter((e) => e.reason === 'NO_BED').length,
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
  return {
    ...state,
    phase: 'DAY_END',
    ledgerDays: [...state.ledgerDays, recordDay(state.day, state.receiving)],
  }
}

/**
 * 하루 마감 뒤 전진 — DAY_END에서 두 갈래다.
 *   day < 7 → 다음 날 RECEIVING(새 큐·자리 리셋·그날 델타 0에서 시작)
 *   day = 7 → INTERSTITIAL (그날 밤 응급)
 * 이 분기가 "완주"의 정의라 completeReceiving과 나눠 둔다 — 한 함수가 두 방향을 반환하면 가드가 흐려진다.
 */
export function advanceDay(state: SessionState): SessionState {
  if (state.phase !== 'DAY_END') {
    throw new Error(`advanceDay requires DAY_END, got ${state.phase}`)
  }
  if (isLastDay(state)) {
    return { ...state, phase: 'INTERSTITIAL' }
  }
  const day = state.day + 1
  // 어제 검사를 붙인 환자는 결과를 기다리며 자리를 물고 있다 — 그만큼 오늘 자리가 준다(boarding).
  // 이게 7일을 처음으로 서로 묶는다. 지금까지 하루는 서로 독립이었다(매일 자리 리셋).
  const boardedBeds = state.receiving!.workupCount
  // 어제 돌려보낸 사람들이 오늘 아침 신문으로 온다 — 이틀 뒤가 아니라 바로 다음 날이다.
  const yesterday = state.ledgerDays[state.ledgerDays.length - 1]
  return {
    ...state,
    phase: 'RECEIVING',
    day,
    receiving: initReceiving(state.hospital!, createCallQueue(day), boardedBeds),
    morningNews: morningNews(day, yesterday?.turnedAway ?? []),
  }
}

/**
 * 한 주 합계 — 결말 장부에 넘길 값.
 * ⚠️ 마지막 날의 receiving만 쓰면 7일 중 하루치만 계상된다. 반드시 ledgerDays를 합산한다.
 */
export function weekTotals(state: SessionState): {
  netProfitDeltaBillions: number
  workupRevenueBillions: number
  lawsuitExposure: number
} {
  return {
    netProfitDeltaBillions: state.ledgerDays.reduce((n, r) => n + r.callDeltaBillions, 0),
    workupRevenueBillions: state.ledgerDays.reduce((n, r) => n + r.workupRevenueBillions, 0),
    lawsuitExposure: state.ledgerDays.reduce((n, r) => n + r.lawsuitExposure, 0),
  }
}

export function beginEmergency(state: SessionState): SessionState {
  if (state.phase !== 'INTERSTITIAL') {
    throw new Error(`beginEmergency requires INTERSTITIAL, got ${state.phase}`)
  }
  const hospital = state.hospital!
  if (hospital.backupCare.includes(STEMI_SPECIALTY)) {
    return { ...state, phase: 'EMERGENCY', emergency: { mode: 'IN_HOUSE' } }
  }
  const scenario = createStemiScenario()
  const game = startGame(scenario.patient, scenario.hospitals, scenario.goldenSeconds)
  return { ...state, phase: 'EMERGENCY', emergency: { mode: 'TRANSFER', game } }
}

export function toEpilogue(state: SessionState): SessionState {
  if (state.phase !== 'EMERGENCY') {
    throw new Error(`toEpilogue requires EMERGENCY, got ${state.phase}`)
  }
  const em = state.emergency!
  if (em.mode === 'TRANSFER' && em.game.status === 'IN_PROGRESS') {
    throw new Error('emergency transfer not finished')
  }
  return { ...state, phase: 'EPILOGUE' }
}

export interface SessionEpilogue {
  survived: boolean
  ledger: Ledger | null
  debrief: Debrief | null // 전원 뺑뺑이한 경우만(IN_HOUSE는 null)
  /**
   * 이번 주 신문 — 1막 7일 누적 돌려보낸 STEMI(누적 결산). 플레이 중 아침 신문으로 스친 기사와
   * 글자까지 동일하되, **7일차 것까지** 모은다(아침 신문은 8일차가 없어 마지막 날을 놓친다).
   */
  weekNews: NewsItem[]
}

export function buildEpilogue(state: SessionState): SessionEpilogue {
  if (state.phase !== 'EPILOGUE') {
    throw new Error(`buildEpilogue requires EPILOGUE, got ${state.phase}`)
  }
  const hospital = state.hospital!
  const em = state.emergency!
  // 한 주 전체를 합산한다 — state.receiving은 7일차 하루치뿐이라 그걸 쓰면 6일치가 증발한다.
  // (economics.segments는 이미 주간 전액이라 여기서 스케일하지 않는다: 하루치 1/7 × 7일 = 전액.)
  const ledger = buildSessionLedger(hospital, STEMI_SPECIALTY, weekTotals(state))
  // 누적 결산: 7일 내내 돌려보낸 STEMI를 한 자리에 모은다(달력 데이터 소스 turnedAway를 flatten).
  const weekNews = renderNews(state.ledgerDays.flatMap((d) => d.turnedAway))
  if (em.mode === 'IN_HOUSE') {
    return { survived: true, ledger, debrief: null, weekNews }
  }
  return { survived: em.game.status === 'ACCEPTED', ledger, debrief: buildDebrief(em.game), weekNews }
}
