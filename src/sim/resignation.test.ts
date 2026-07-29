// 사직·전국 풀 — "사람을 갈아넣는 구조는 결국 사람을 잃는다"의 계약.
//
// 이 파일이 잠그는 인과는 셋이고, 셋이 **한 사슬**이라 파일을 하나로 둔다:
//  ① 포화(FATIGUE_MAX)로 마감한 날이 의사 몸에 **리셋 없이** 쌓인다(day.settleDay)
//  ② 그 날들이 임계에 닿으면 그 사람은 다음 주에 떠난다(week.resigningSimDoctors·startNextWeek)
//  ③ 떠난 사람은 전국 풀로 **돌아오지 않는다**(pawn.hireDoctor의 게이트)
// 셋 중 하나만 끊겨도 "장부가 아니라 인사에서 창발한다"가 통째로 무너지는데, 그 실패는 어느
// 화면에도 에러로 안 뜬다(그냥 아무도 안 떠나거나, 떠난 자리가 무한히 다시 채워진다).
import { describe, it, expect } from 'vitest'
import { createWorld, type SimWorld } from './world'
import { hireDoctor, DEFAULT_PRIORITY, setDoctorPriority, priorityOf, type Pawn } from './pawn'
import { hire } from './testHelpers'
import { DAYS_PER_WEEK, settleDay, startNextDay, type DayRecord } from './day'
import { resigningSimDoctors, settleWeek, startNextWeek, weekSummary } from './week'
import { HIRABLE_DEPTS, simDept, deptRevenueSum, type SimDeptKey, type SimDeptStats } from './dept'
import { restOvernight } from './fatigue'
import { FATIGUE_MAX, FATIGUE_REST, RESIGN_SATURATED_DAYS } from '../game/doctor'

// 채용 언랩(`hire`)은 공용 헬퍼다 — 풀 고갈은 아래 「전국 풀」 절이 `hireDoctor`를 직접 불러 잰다.

const docs = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR')
const doc = (w: SimWorld, i = 0) => docs(w)[i]

// ─── ① 포화 누적 — settleDay ──────────────────────────────────────────────────

/** 마감 직전의 세계 — 순환기 의사 하나뿐이라 환자발 부하가 0이고, 관측되는 건 손으로 얹은 피로뿐이다. */
function dusk(over: Partial<Pawn> = {}): SimWorld {
  const w = hire(createWorld(1), 'CARDIOLOGY')
  return { ...w, pawns: w.pawns.map(p => ({ ...p, ...over })) }
}

describe('포화 누적 — 마감이 세는 날', () => {
  it('새로 온 의사는 0에서 시작한다 — 필드가 실재한다(undefined가 아니다)', () => {
    expect(doc(hire(createWorld(1), 'CARDIOLOGY')).saturatedDays).toBe(0)
  })

  it(`포화(${FATIGUE_MAX})로 마감한 날은 +1 — 경계는 등호를 포함한다`, () => {
    const w = dusk({ fatigue: FATIGUE_MAX })
    expect(doc(w).saturatedDays).toBe(0) // 기준을 결산 **전에** 캡처한다(T-085)
    expect(doc(settleDay(w)).saturatedDays).toBe(1)
  })

  it('한 점 모자란 날은 세지 않는다 — 99는 포화가 아니다', () => {
    expect(doc(settleDay(dusk({ fatigue: FATIGUE_MAX - 1 }))).saturatedDays).toBe(0)
  })

  it('이틀 포화면 2 — 하루로 리셋되지 않는다', () => {
    const first = settleDay(dusk({ fatigue: FATIGUE_MAX }))
    const morning = startNextDay(first)
    // 아침 회복이 피로를 내렸으므로 둘째 날도 포화로 마감하려면 다시 얹어야 한다.
    const again = { ...morning, pawns: morning.pawns.map(p => ({ ...p, fatigue: FATIGUE_MAX })) }
    expect(doc(settleDay(again)).saturatedDays).toBe(2)
  })

  it('회복해도 그 날들은 몸에 남는다 — 아침(freshMorning·restOvernight)이 못 지운다', () => {
    const settled = settleDay(dusk({ fatigue: FATIGUE_MAX }))
    expect(doc(settled).saturatedDays).toBe(1)
    const morning = startNextDay(settled)
    expect(doc(morning).fatigue).toBe(FATIGUE_MAX - FATIGUE_REST) // 전제: 실제로 회복했다
    expect(doc(morning).saturatedDays).toBe(1)
    // 아침이 감싸는 그 함수 단독으로도 같다 — 회복 경로가 이 카운터를 건드리지 않는다.
    expect(restOvernight(doc(settled)).saturatedDays).toBe(1)
  })

  it('누적은 부하 반영 **뒤**다 — 마감이 인정한 노동으로 포화에 닿은 날도 센다', () => {
    // 마감은 진행 중 진료를 완료로 인정해 부하를 얹는다(day.settleDay). 누적을 그 앞에 두면
    // "마지막 한 건에 갈려 포화한 날"이 통째로 안 세진다 — 에러 없이 사직만 늦어진다.
    const w = dusk({ fatigue: FATIGUE_MAX - 1, loadMinToday: 1_000 })
    const patient: Pawn = {
      id: 'pat-1', kind: 'PATIENT', x: 20, y: 20, path: [],
      stage: 'IN_EXAM', wantsDept: 'CARDIOLOGY', doctorId: doc(w).id, workMin: 20,
    }
    const s = settleDay({ ...w, pawns: [...w.pawns, patient] })
    expect(doc(s).fatigue).toBe(FATIGUE_MAX) // 전제: 그 한 건이 실제로 포화까지 밀었다
    expect(doc(s).saturatedDays).toBe(1)
  })
})

// ─── ② 사직 — 통지(resigningSimDoctors)와 집행(startNextWeek) ─────────────────

const NO_EMERGENCY = { accepted: 0, turnedAway: 0 }

const dayOf = (n: number, byDept: SimDeptStats): DayRecord => ({
  day: n,
  examsDone: Object.values(byDept).reduce((s, v) => s + (v?.patients ?? 0), 0),
  leftCount: 0,
  leftNoDept: 0,
  revenueManwon: deptRevenueSum(byDept),
  byDept,
  emergencies: NO_EMERGENCY,
})

/** 포화 일수를 손으로 얹은 의사 — 자연 경로로 4일을 갈아 넣으려면 한 판을 다 돌려야 해서,
 *  임계 계약은 손세계로 잠근다(자연 곡선은 밸런스 프로브가 따로 본다). */
const doctorPawn = (id: string, dept: SimDeptKey, saturatedDays: number): Pawn =>
  ({ id, kind: 'DOCTOR', x: 8, y: 8, path: [], dept, fatigue: FATIGUE_MAX, saturatedDays })

function weekEndWorld(pawns: Pawn[], over: Partial<SimWorld> = {}): SimWorld {
  return {
    ...createWorld(1),
    phase: 'WEEK_END' as const,
    day: DAYS_PER_WEEK,
    days: [1, 2, 3, 4, 5, 6, 7].map(n => dayOf(n, {})),
    weekSettled: true, // 결산을 마친 주말 — startNextWeek의 전제
    pawns,
    ...over,
  }
}

describe('사직 — 포화가 사람을 데려간다', () => {
  it(`포화 ${RESIGN_SATURATED_DAYS}일이면 명단에 오르고, 다음 주에 세계에서 사라진다`, () => {
    const w = weekEndWorld([
      doctorPawn('doc-1', 'CARDIOLOGY', RESIGN_SATURATED_DAYS),
      doctorPawn('doc-2', 'AESTHETICS', 0),
    ])
    expect(resigningSimDoctors(w).map(p => p.id)).toEqual(['doc-1'])
    expect(startNextWeek(w).pawns.map(p => p.id)).toEqual(['doc-2'])
  })

  it(`${RESIGN_SATURATED_DAYS - 1}일이면 떠나지 않는다 — 임계의 경계`, () => {
    const w = weekEndWorld([doctorPawn('doc-1', 'CARDIOLOGY', RESIGN_SATURATED_DAYS - 1)])
    expect(resigningSimDoctors(w)).toEqual([]) // 기준을 넘기기 **전에** 캡처한다(T-085)
    expect(startNextWeek(w).pawns.map(p => p.id)).toEqual(['doc-1'])
  })

  it('통지와 집행은 같은 명단이다 — 갈리면 안 떠난 사람이 통지되거나 통지 없이 사라진다', () => {
    const w = weekEndWorld([
      doctorPawn('doc-1', 'CARDIOLOGY', 0),
      doctorPawn('doc-2', 'INTERNAL_MEDICINE', RESIGN_SATURATED_DAYS - 1),
      doctorPawn('doc-3', 'GENERAL_SURGERY', RESIGN_SATURATED_DAYS),
      doctorPawn('doc-4', 'AESTHETICS', RESIGN_SATURATED_DAYS + 5),
    ])
    const notice = resigningSimDoctors(w).map(p => p.id)
    const next = startNextWeek(w)
    const gone = w.pawns.map(p => p.id).filter(id => !next.pawns.some(p => p.id === id))
    expect(gone).toEqual(notice)
    expect(notice.length).toBeGreaterThan(0) // 계측기가 빈 명단으로 헛돌지 않았다
  })

  it('떠나는 것은 의사뿐이다 — 포화 필드를 단 환자 폰은 명단에 없다', () => {
    const patient: Pawn = {
      id: 'pat-1', kind: 'PATIENT', x: 20, y: 20, path: [], stage: 'WAITING',
      saturatedDays: RESIGN_SATURATED_DAYS + 1,
    }
    const w = weekEndWorld([doctorPawn('doc-1', 'AESTHETICS', 0), patient])
    expect(resigningSimDoctors(w)).toEqual([])
    expect(startNextWeek(w).pawns.map(p => p.id)).toEqual(['doc-1', 'pat-1'])
  })

  it('사직은 startNextWeek이 집행한다 — 그 주를 일한 사람의 주급은 나간다(고정비는 사직 전 명단)', () => {
    const w = weekEndWorld(
      [doctorPawn('doc-1', 'CARDIOLOGY', RESIGN_SATURATED_DAYS)],
      { treasuryManwon: 100_000, weekSettled: false },
    )
    expect(weekSummary(w).byDept.CARDIOLOGY!.doctors).toBe(1) // 결산 표엔 아직 서 있다
    const settled = settleWeek(w)
    expect(settled.treasuryManwon).toBe(100_000 - simDept('CARDIOLOGY').weeklyCostManwon)
    expect(startNextWeek(settled).pawns).toEqual([])
  })

  it('사직 다음 주 — 그 과 의사가 0명이어도 그 주에 번 돈이 있으면 표에 줄이 선다', () => {
    // week.ts 「합집합 계약」의 실재화다. ⚠️ 다음 주의 하루 기록은 **손으로** 세운다: 이 층에서
    // 의사 0명인 과는 외래도 응급도(배후과 하드락) 벌 수 없어, 자연 경로로는 "의사 0 + 수익 > 0"이
    // 나오지 않는다. 그래서 잠그는 것은 그 상황의 **발생**이 아니라 **표시**다.
    const resigned = startNextWeek(weekEndWorld([
      doctorPawn('doc-1', 'CARDIOLOGY', RESIGN_SATURATED_DAYS),
      doctorPawn('doc-2', 'AESTHETICS', 0),
    ]))
    const week2: SimWorld = {
      ...resigned,
      phase: 'WEEK_END',
      days: [dayOf(1, { CARDIOLOGY: { patients: 1, revenueManwon: 850 } })],
    }
    const s = weekSummary(week2)
    expect(s.byDept.CARDIOLOGY).toEqual({
      doctors: 0, revenueManwon: 850, fixedCostManwon: 0, netManwon: 850,
    })
    expect(s.revenueManwon).toBe(850) // Σ byDept가 총수익과 어긋나지 않는다
  })

  it('startNextWeek은 남은 사람의 포화 일수를 건드리지 않는다 — 주가 바뀌어도 몸은 그대로다', () => {
    const w = weekEndWorld([doctorPawn('doc-1', 'CARDIOLOGY', RESIGN_SATURATED_DAYS - 1)])
    expect(doc(startNextWeek(w)).saturatedDays).toBe(RESIGN_SATURATED_DAYS - 1)
  })
})

// ─── ③ 전국 풀 — 채용 게이트와 미반환 ─────────────────────────────────────────

/** **실제로 채용을 거친** 세계를 주말로 옮기고 의사 전원을 사직 임계에 얹는다.
 *  손으로 세운 weekEndWorld와 달리 풀 잔량·`nextId`가 그대로라, "사직 뒤 다시 뽑으면 어떻게
 *  되나"(풀·id·우선순위)를 이 세계에서만 물을 수 있다. */
function burntOut(w: SimWorld): SimWorld {
  return {
    ...w,
    phase: 'WEEK_END',
    day: DAYS_PER_WEEK,
    weekSettled: true,
    pawns: w.pawns.map(p => (
      p.kind === 'DOCTOR' ? { ...p, saturatedDays: RESIGN_SATURATED_DAYS } : p
    )),
  }
}

describe('전국 풀 — 사람은 무한하지 않다', () => {
  it('createWorld의 채용 풀은 카탈로그에서 파생된다 — 두 곳에 적히지 않는다', () => {
    const w = createWorld(1)
    for (const key of HIRABLE_DEPTS) expect(w.hirePool[key], key).toBe(simDept(key).nationalPool)
    expect(Object.keys(w.hirePool).sort()).toEqual([...HIRABLE_DEPTS].sort())
  })

  it('필수과일수록 얇다 — 미용 > 내과 > 외과 > 순환기(값이 아니라 대소가 주장이다)', () => {
    const pool = (k: SimDeptKey) => simDept(k).nationalPool
    expect(pool('AESTHETICS')).toBeGreaterThan(pool('INTERNAL_MEDICINE'))
    expect(pool('INTERNAL_MEDICINE')).toBeGreaterThan(pool('GENERAL_SURGERY'))
    expect(pool('GENERAL_SURGERY')).toBeGreaterThan(pool('CARDIOLOGY'))
    expect(pool('CARDIOLOGY')).toBeGreaterThan(0) // 시작부터 못 뽑는 과는 없다
  })

  it('채용은 그 과 풀을 하나 줄인다 — 다른 과는 그대로다', () => {
    const w0 = createWorld(1)
    const w = hire(w0, 'CARDIOLOGY')
    expect(w.hirePool.CARDIOLOGY).toBe(w0.hirePool.CARDIOLOGY - 1)
    expect(w.hirePool.AESTHETICS).toBe(w0.hirePool.AESTHETICS)
  })

  it('풀을 소진하면 그 과는 더 못 뽑는다 — 무한 채용이 아니다', () => {
    let w = createWorld(1)
    const n = w.hirePool.CARDIOLOGY
    for (let i = 0; i < n; i++) w = hire(w, 'CARDIOLOGY')
    expect(docs(w)).toHaveLength(n)
    expect(w.hirePool.CARDIOLOGY).toBe(0)
    expect(hireDoctor(w, 'CARDIOLOGY')).toEqual({ ok: false, reason: 'NO_POOL' })
  })

  it('풀이 0이면 NO_POOL — 세계는 **값으로** 불변이고 다른 과는 여전히 뽑힌다', () => {
    const base = createWorld(1)
    const w: SimWorld = { ...base, hirePool: { ...base.hirePool, CARDIOLOGY: 0 } }
    const snapshot = structuredClone(w)
    expect(hireDoctor(w, 'CARDIOLOGY')).toEqual({ ok: false, reason: 'NO_POOL' })
    expect(w).toEqual(snapshot) // 거부는 세계를 스치지도 않는다
    expect(docs(hire(w, 'AESTHETICS'))).toHaveLength(1)
  })

  it('사직자는 풀로 돌아오지 않는다 — 다른 병원 이직이 아니라 필수의료를 떠난다', () => {
    const hired = hire(createWorld(1), 'CARDIOLOGY')
    const poolAfterHire = hired.hirePool.CARDIOLOGY
    const next = startNextWeek(burntOut(hired))
    expect(next.pawns).toEqual([])
    expect(next.hirePool.CARDIOLOGY).toBe(poolAfterHire) // +1로 되돌리면 여기서 걸린다
  })

  it('재채용은 풀이 남아 있을 때만 — 그리고 새 사람이라 우선순위가 전부 보통에서 시작한다', () => {
    // 사직자의 `priorities`도 함께 사라진다. 같은 과를 다시 뽑아 세 축이 2로 서는 것은 **의도**다
    // (그는 다른 사람이다) — 사직자의 지시가 후임에게 상속되면 플레이어가 안 내린 명령이 산다.
    let w = hire(createWorld(1), 'CARDIOLOGY')
    const veteran = doc(w)
    w = setDoctorPriority(w, veteran.id, 'exam', 0)
    expect(priorityOf(doc(w), 'exam')).toBe(0) // 전제: 실제로 손잡이를 내렸다
    const gone = startNextWeek(burntOut(w))
    expect(gone.pawns).toEqual([])
    const rehired = hire(gone, 'CARDIOLOGY')
    const rookie = doc(rehired)
    expect(rookie.id).not.toBe(veteran.id)
    for (const kind of ['exam', 'emergency', 'rest'] as const) {
      expect(priorityOf(rookie, kind), kind).toBe(DEFAULT_PRIORITY)
    }
    expect(rookie.saturatedDays).toBe(0) // 포화도 상속되지 않는다
    // 순환기 풀이 이걸로 바닥났다 — 갈아 넣은 만큼 세 번째 사람은 없다.
    expect(hireDoctor(rehired, 'CARDIOLOGY')).toEqual({ ok: false, reason: 'NO_POOL' })
  })
})
