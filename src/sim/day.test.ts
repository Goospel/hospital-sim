import { describe, it, expect } from 'vitest'
import { createWorld, INITIAL_TREASURY_MANWON } from './world'
import { placeRoom } from './build'
import { spawnDoctor, type Pawn, type PatientStage } from './pawn'
import { tick } from './tick'
import { DAY_END_MIN, DAYS_PER_WEEK, settleDay, startNextDay } from './day'
import { simDept, deptRevenueSum } from './dept'
import { EMERGENCY_INTENSITY } from './emergency'
import { fatigueGain } from './fatigue'
import { FATIGUE_FREE_MIN } from '../game/doctor'

/** 진료 수익은 건당 상수가 아니라 **과별 수가**다(계획 Task 2) — 아래 단언들은 상수 × 건수가
 *  아니라 과별 집계에서 총액을 유도한다. hospitalWorld는 내과 진료실뿐이라 내과만 돈다. */
const INTERNAL_RATE = simDept('INTERNAL_MEDICINE').examRevenueManwon

function hospitalWorld(seed: number) {
  const w = createWorld(seed)
  const r1 = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!r1.ok) throw new Error('전제 실패')
  const r2 = placeRoom(r1.world, { type: 'EXAM', x: 6, y: 6, w: 6, h: 5 })
  if (!r2.ok) throw new Error('전제 실패')
  return spawnDoctor(r2.world, 'INTERNAL_MEDICINE', { x: 8, y: 8 })
}

const runToDayEnd = (seed: number) => {
  let w = hospitalWorld(seed)
  for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
  return w
}

describe('하루 마감', () => {
  it(`${DAY_END_MIN}분에 tick이 DAY_END로 멈추고, 그 뒤 tick은 no-op이다`, () => {
    const w = runToDayEnd(3)
    expect(w.phase).toBe('DAY_END')
    expect(w.minute).toBe(DAY_END_MIN)
    const frozen = tick(w, 60)
    expect(frozen).toEqual(w) // 멈춘 세계는 흐르지 않는다
  })

  it(`마감은 ${DAY_END_MIN}분에 정확히 걸린다 — 한 분 전은 아직 RUNNING이다`, () => {
    // 경계 앞에서 기준값을 캡처한다(T-085) — 600분까지 돌린 뒤에 재면 off-by-one이 안 보인다.
    let w = hospitalWorld(3)
    for (let i = 0; i < DAY_END_MIN - 1; i++) w = tick(w, 1)
    expect(w.minute).toBe(DAY_END_MIN - 1)
    expect(w.phase).toBe('RUNNING') // 599분에 미리 닫으면 여기서 걸린다
    expect(w.days).toEqual([])
    w = tick(w, 1)
    expect(w.phase).toBe('DAY_END')
    expect(w.days).toHaveLength(1)
  })

  it('정산: 진행 중 진료는 완료 인정(수익 지급), 대기·이동 환자는 이탈 집계 후 제거, 의사만 남는다', () => {
    const w0 = hospitalWorld(3)
    const built = INITIAL_TREASURY_MANWON - w0.treasuryManwon // 건설비를 마감 **전에** 캡처한다
    expect(built).toBeGreaterThan(0)
    const w = runToDayEnd(3)
    expect(w.pawns.every(p => p.kind === 'DOCTOR')).toBe(true)
    // 금고 불변식은 정산을 통과해도 유지된다 — 금고 = 초기 − 건설비 + Σ(과별 환자 × 과 수가)
    expect(w.stats.byDept).toEqual({ INTERNAL_MEDICINE: { patients: w.stats.examsDone, revenueManwon: w.stats.examsDone * INTERNAL_RATE } })
    expect(w.treasuryManwon).toBe(INITIAL_TREASURY_MANWON - built + deptRevenueSum(w.stats.byDept))
  })

  it('정산은 IN_EXAM만 진료로 인정하고, 이미 집계된 퇴장 환자를 다시 세지 않는다', () => {
    // 자연 흐름의 600분엔 어떤 스테이지가 남아 있을지 시드에 달렸다 — 스테이지별 계약은
    // 손으로 세운 세계로 잠근다(아니면 정산 분기가 통째로 관측되지 않는다).
    const w = tick(hospitalWorld(3), 5) // 의사가 진료실에 자리잡은 뒤
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    // 정산은 방이 아니라 **그 환자의 과**로 수가를 매긴다.
    // ⚠️ 과는 **수가가 30이 아닌** 것을 골라야 한다 — 미용은 하필 수가가 정확히 30이라(은퇴한
    // 옛 상수 EXAM_REVENUE_MANWON과 같은 값) 마감 정산이 `+= 30`으로 회귀해도 값이 구별되지
    // 않는다. 이 자리는 자연 흐름으로도 안 잡힌다(두 표준 세계 모두 600분에 IN_EXAM 0명)이라,
    // 여기서 놓치면 마감 수가에 계측기가 아예 없다. 순환기(25)면 회귀가 곧바로 드러난다.
    const patient = (id: string, stage: PatientStage): Pawn =>
      ({ id, kind: 'PATIENT', x: 20, y: 21, path: [], stage, wantsDept: 'CARDIOLOGY' })
    const staged = {
      ...w,
      pawns: [
        doc,
        patient('in-exam', 'IN_EXAM'),
        patient('entering', 'ENTERING'),
        patient('waiting', 'WAITING'),
        patient('to-exam', 'TO_EXAM'),
        patient('leaving', 'LEAVING'),          // 진료 완료로 이미 집계됨
        patient('left-waiting', 'LEFT_WAITING'), // 이탈로 이미 집계됨
      ],
    }
    const s = settleDay(staged)
    expect(s.stats.examsDone).toBe(w.stats.examsDone + 1)  // IN_EXAM 1명만
    expect(s.stats.leftCount).toBe(w.stats.leftCount + 3)  // ENTERING·WAITING·TO_EXAM
    const rate = simDept('CARDIOLOGY').examRevenueManwon
    expect(s.treasuryManwon).toBe(w.treasuryManwon + rate)
    expect(s.stats.byDept).toEqual({ CARDIOLOGY: { patients: 1, revenueManwon: rate } })
    expect(s.days[0].revenueManwon).toBe(rate) // Σ byDept == 그날 총수익
    expect(s.pawns).toEqual([doc]) // 환자는 전부 세계에서 빠지고 의사만 남는다
  })

  it('이탈 집계는 명시 목록(inclusion)이라 새 스테이지가 자동으로 이탈이 되지 않는다', () => {
    // 'PAYING'·'GONE'은 아직 아무도 만들지 않는 2주차 예약 스테이지다(pawn.ts). 집계를 denylist로
    // 쓰면 그 흐름이 붙는 순간 수납 걷는 환자가 조용히 이탈로 세진다 — 에러 없이 숫자만 틀린다.
    const w = tick(hospitalWorld(3), 5)
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const patient = (id: string, stage: PatientStage): Pawn =>
      ({ id, kind: 'PATIENT', x: 20, y: 21, path: [], stage })
    const staged = {
      ...w,
      pawns: [doc, patient('paying', 'PAYING'), patient('gone', 'GONE'), patient('waiting', 'WAITING')],
    }
    const s = settleDay(staged)
    expect(s.stats.leftCount).toBe(w.stats.leftCount + 1) // WAITING 한 명만
  })

  // ─── 마감이 인정한 노동의 피로 ────────────────────────────────────────────
  // 마감은 진행 중 진료·처치를 **완료로 인정해 수익을 준다**. 그런데 부하는 작업이 끝날 때만
  // 쌓이므로(patientFlow·emergency), 마감으로 끝난 건은 수익만 들어오고 피로는 빠져나간다 —
  // 하루 상한이 통째로 어긋나는 무성 실패다(의사 1인당 최대 204 표준강도분 = 피로 51점 과소).
  // 아래 셋이 그 비대칭을 잠근다.

  /** 마감 시점의 세계를 손으로 세운다 — 자연 흐름의 600분엔 IN_EXAM·IN_TREATMENT가 남을지가
   *  시드에 달려 이 분기가 통째로 관측되지 않는다(위 스테이지 계약 테스트와 같은 이유). */
  function atDusk(patient: Pawn, docOver: Partial<Pawn> = {}) {
    const w = tick(hospitalWorld(3), 5)
    // 문턱(FATIGUE_FREE_MIN) **위**에서 잰다 — 아래면 어떤 부하를 얹어도 gain이 0이라
    // 계측기가 통째로 공허해진다(T-085 — 경계 앞에서 기준을 캡처한다).
    const loadBefore = FATIGUE_FREE_MIN + 40
    const doc: Pawn = {
      ...w.pawns.find(p => p.kind === 'DOCTOR')!, fatigue: 0, loadMinToday: loadBefore, ...docOver,
    }
    const settled = settleDay({ ...w, pawns: [doc, { ...patient, doctorId: patient.doctorId && doc.id }] })
    return { loadBefore, doc, after: settled.pawns.find(p => p.id === doc.id)!, settled }
  }

  const duskExam = (over: Partial<Pawn> = {}): Pawn => ({
    id: 'in-exam', kind: 'PATIENT', x: 20, y: 21, path: [], stage: 'IN_EXAM',
    wantsDept: 'CARDIOLOGY', doctorId: 'doc', workMin: 30, ...over,
  })

  it('마감이 완료로 인정한 진료의 부하도 그 의사에게 쌓인다 — 수익만 받고 피로는 안 받지 않는다', () => {
    const { loadBefore, after } = atDusk(duskExam())
    // 표준강도분 = 확정 소요 × **그 과의** 강도(순환기 1.2) — 소요만 세면 30이라 여기서 갈린다.
    const load = 30 * simDept('CARDIOLOGY').intensity
    expect(after.loadMinToday).toBe(loadBefore + load)
    expect(after.fatigue).toBe(fatigueGain(loadBefore + load) - fatigueGain(loadBefore))
    expect(after.fatigue).toBeGreaterThan(0) // 계측기가 0으로 헛돌지 않았다
  })

  it('마감이 완료로 인정한 **응급 처치**의 부하는 응급 강도로 쌓인다(과 강도로 접히지 않는다)', () => {
    const treat = duskExam({
      id: 'in-treat', stage: 'IN_TREATMENT', emergency: 'STEMI', workMin: 90,
    })
    const { loadBefore, after } = atDusk(treat)
    const load = 90 * EMERGENCY_INTENSITY
    // 과 강도(1.2)로 접으면 108, 응급 강도(2.0)면 180 — 두 값이 갈려 회귀가 곧바로 드러난다.
    expect(after.loadMinToday).toBe(loadBefore + load)
    expect(after.fatigue).toBe(fatigueGain(loadBefore + load) - fatigueGain(loadBefore))
    expect(after.fatigue).toBeGreaterThan(0)
  })

  it('담당 의사가 없는 진행 중 진료(손세계 폰)는 아무에게도 부하를 얹지 않는다', () => {
    const orphan = duskExam({ doctorId: undefined })
    const { loadBefore, after } = atDusk(orphan)
    expect(after.loadMinToday).toBe(loadBefore)
    expect(after.fatigue).toBe(0)
  })

  it('settleDay는 입력 세계를 변형하지 않는다 (순수)', () => {
    const w = tick(hospitalWorld(3), 120)
    const snapshot = structuredClone(w)
    settleDay(w)
    expect(w).toEqual(snapshot)
  })

  it('DayRecord가 그날 수치를 굳힌다', () => {
    const w = runToDayEnd(3)
    expect(w.days).toHaveLength(1)
    const d = w.days[0]
    expect(d.day).toBe(1)
    expect(d.examsDone).toBe(w.stats.examsDone)
    expect(d.leftCount).toBe(w.stats.leftCount)
    // 내과 진료실뿐인 병원이라 그날 장부는 내과 한 줄이고, 총액은 그 줄에서 유도된다.
    expect(d.byDept).toEqual({ INTERNAL_MEDICINE: { patients: d.examsDone, revenueManwon: d.examsDone * INTERNAL_RATE } })
    expect(d.revenueManwon).toBe(d.examsDone * INTERNAL_RATE)
    expect(d.examsDone).toBeGreaterThan(0) // 계측기가 0으로 헛돌지 않았다
  })

  it('결정론: 같은 시드면 마감 세계가 완전 동일', () => {
    const run = () => { let w = hospitalWorld(11); for (let i = 0; i < DAY_END_MIN + 10; i++) w = tick(w, 1); return w }
    expect(run()).toEqual(run())
  })

  it('settleDay는 RUNNING이 아닌 세계를 거부한다(이중 정산 방지)', () => {
    const w = runToDayEnd(3)
    expect(() => settleDay(w)).toThrow()
  })
})

describe('다음 날', () => {
  it('DAY_END에서 startNextDay — day+1·분 0·당일 stats 리셋·의사는 자기 진료실 책상 앞·환자 0', () => {
    const w = runToDayEnd(3)
    const next = startNextDay(w)
    expect(next.phase).toBe('RUNNING')
    expect(next.day).toBe(2)
    expect(next.minute).toBe(0)
    // 응급 집계도 아침에 비운다 — 안 비우면 2일차 DayRecord가 어제 수용·회차를 다시 싣는다.
    expect(next.stats).toEqual({
      examsDone: 0, leftCount: 0, byDept: {}, emergencyAccepted: 0, emergencyTurnedAway: [],
    })
    expect(next.days).toHaveLength(1) // 기록은 보존
    expect(next.pawns.some(p => p.kind === 'PATIENT')).toBe(false)
    const doc = next.pawns.find(p => p.kind === 'DOCTOR')!
    expect(doc.path).toEqual([])
    expect(doc.roomId).toBeDefined()
    // "책상 앞"을 파생식이 아니라 눈에 보이는 관계로 잰다 — 책상과 맞닿아 있고 제 방 안이다.
    const desk = next.furniture.find(f => f.roomId === doc.roomId && f.kind === 'DESK')!
    expect(Math.abs(doc.x - desk.x) + Math.abs(doc.y - desk.y)).toBe(1)
    const room = next.rooms.find(r => r.id === doc.roomId)!
    expect(doc.x >= room.x && doc.x < room.x + room.w).toBe(true)
    expect(doc.y >= room.y && doc.y < room.y + room.h).toBe(true)
    // dest가 남아 있으면 다음 날 첫 틱의 도착 판정(위치 == dest)이 어제 목적지를 보고 흔들린다.
    expect(doc.dest).toBeUndefined()
  })

  it('걷던 중에 하루가 끝나도 다음 날 의사는 책상 앞에서 시작한다', () => {
    // 자연 흐름의 마감 시점엔 의사가 이미 책상 앞에 앉아 있어(path 빈 채) 위치 복귀·경로 초기화가
    // 통째로 관측되지 않는다 — 걷는 도중에 하루를 끝내야 그 두 규칙이 계측기에 걸린다.
    const walking = tick(hospitalWorld(3), 1)
    const before = walking.pawns.find(p => p.kind === 'DOCTOR')!
    expect(before.path.length).toBeGreaterThan(0) // 전제: 아직 책상으로 가는 중
    const desk = walking.furniture.find(f => f.roomId === before.roomId && f.kind === 'DESK')!
    expect(Math.abs(before.x - desk.x) + Math.abs(before.y - desk.y)).toBeGreaterThan(1) // 전제: 책상 앞이 아니다

    const doc = startNextDay(settleDay(walking)).pawns.find(p => p.kind === 'DOCTOR')!
    expect(doc.path).toEqual([]) // 어제 경로를 그대로 들고 있으면 첫 틱에 어제 목적지로 걷는다
    expect(Math.abs(doc.x - desk.x) + Math.abs(doc.y - desk.y)).toBe(1)
  })

  it('startNextDay는 입력 세계를 변형하지 않는다 (순수)', () => {
    const w = runToDayEnd(3)
    const snapshot = structuredClone(w)
    startNextDay(w)
    expect(w).toEqual(snapshot)
  })

  it('2일차도 환자가 오고 진료가 돈다(도착 시드가 day로 갈린다)', () => {
    let w = runToDayEnd(3)
    const day1 = w.days[0]
    w = startNextDay(w)
    for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
    expect(w.days).toHaveLength(2)
    expect(w.days[1].day).toBe(2)
    expect(w.days[1].examsDone).toBeGreaterThan(0)
    // 같은 시드라도 day가 달라 하루 궤적이 다르다(도착 seed에 day가 들어감)
    expect(w.days[1]).not.toEqual({ ...day1, day: 2 })
  })

  it('7일차 마감 뒤 startNextDay가 아니라 WEEK_END로 간다 — 6일차 밤까지는 DAY_END다', () => {
    // 루프를 DAYS_PER_WEEK로 돌면 상수를 바꿔도 테스트가 같이 따라가 **주기 값 자체는 아무것도
    // 잠기지 않는다**. 그래서 여기서는 날짜를 손으로 세고, 매일 밤의 phase를 통째로 대조한다.
    let w = hospitalWorld(3)
    const nights: string[] = []
    for (let d = 0; d < 7; d++) {
      for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
      nights.push(w.phase)
      if (w.phase === 'DAY_END') w = startNextDay(w)
    }
    expect(nights).toEqual(['DAY_END', 'DAY_END', 'DAY_END', 'DAY_END', 'DAY_END', 'DAY_END', 'WEEK_END'])
    expect(w.days).toHaveLength(DAYS_PER_WEEK) // 한 주 기록이 통째로 남는다(주간 결산의 입력)
    expect(w.phase).toBe('WEEK_END')
  })

  it('기록이 7일을 넘긴 세계도 WEEK_END로 간다 — 주간 결산을 조용히 건너뛰지 않는다', () => {
    // 정상 흐름에선 days가 항상 0에서 시작해 7에서 딱 걸린다(startNextWeek이 비운다). 그래서
    // `=== DAYS_PER_WEEK`도 지금은 등가다 — 하지만 기록이 하나라도 더 붙는 순간(주를 안 비우고
    // 이어 돌리는 경로가 생기면) 등호는 WEEK_END를 **말없이** 건너뛰고 하루가 영원히 이어진다.
    // 결산이 안 열리면 고정비도 폐업도 오지 않는다 — 게임이 멈추는 게 아니라 끝나지 않는다.
    const w = hospitalWorld(3)
    const overrun = { ...w, days: [1, 2, 3, 4, 5, 6, 7].map(n =>
      ({ day: n, examsDone: 0, leftCount: 0, revenueManwon: 0, byDept: {}, emergencies: { accepted: 0, turnedAway: 0 } })) }
    const settled = settleDay(overrun)
    expect(settled.days).toHaveLength(DAYS_PER_WEEK + 1)
    expect(settled.phase).toBe('WEEK_END')
  })

  it('startNextDay는 DAY_END가 아닌 세계를 거부한다', () => {
    expect(() => startNextDay(hospitalWorld(3))).toThrow() // RUNNING
  })
})
