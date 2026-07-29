import { describe, it, expect } from 'vitest'
import { createWorld, type SimWorld } from './world'
import { CAMPAIGN_WEEKS, INSOLVENCY_WEEKS_TO_CLOSE, weekSummary, settleWeek, startNextWeek } from './week'
import { RESIGN_SATURATED_DAYS } from '../game/doctor'
import { DAY_END_MIN, DAYS_PER_WEEK, startNextDay, type DayRecord } from './day'
import { type Pawn } from './pawn'
import { hire, placeRoom, withCashier } from './testHelpers'
import { tick } from './tick'
import { HIRABLE_DEPTS, deptRevenueSum, simDept, type SimDeptKey, type SimDeptStats } from './dept'

// 하루 기록의 수익은 **과별 집계에서 유도된다**(DayRecord.revenueManwon = Σ byDept) — 픽스처도
// 그 불변식을 지켜야 한다. 여기 30은 과별 수가가 아니라 "한 건에 30씩 벌었다고 치자"는 임의의
// 단가다(주 결산은 수가를 모른다 — 계산은 하루 쪽 소관이다).
const FIXTURE_RATE = 30
const NO_EMERGENCY = { accepted: 0, turnedAway: 0 }

const dayOf = (n: number, byDept: SimDeptStats, emergencies = NO_EMERGENCY): DayRecord => ({
  day: n,
  examsDone: Object.values(byDept).reduce((s, v) => s + (v?.patients ?? 0), 0),
  leftCount: 0,
  leftNoDept: 0,
  revenueManwon: deptRevenueSum(byDept),
  unpaidManwon: 0,
  byDept,
  emergencies,
})

const day = (n: number, exams: number, dept: SimDeptKey = 'INTERNAL_MEDICINE'): DayRecord =>
  dayOf(n, { [dept]: { patients: exams, revenueManwon: exams * FIXTURE_RATE } })

/** 픽스처 의사 — **과가 반드시 있다**. 고정비가 과별로 갈린 뒤로 과 없는 의사는 값을 매길 수
 *  없어 결산이 던진다(pawn.doctorDeptOf). */
const doctor = (id: string, x: number, dept: SimDeptKey): Pawn =>
  ({ id, kind: 'DOCTOR', x, y: 8, path: [], dept })

/** 기본 픽스처의 두 의사는 **일부러 다른 과**다 — 같은 과 둘이면 "의사 수 × 균일 상수"로
 *  회귀해도 값이 같아 과별 합산이 통째로 관측되지 않는다. 두 과의 주급이 얼마인지는 여기
 *  적지 않는다(단일 출처는 `simDept` — 카탈로그를 튜닝할 때 이 주석이 조용히 낡는다). */
const FIXTURE_DEPTS: SimDeptKey[] = ['INTERNAL_MEDICINE', 'AESTHETICS']
const FIXTURE_FIXED_COST =
  FIXTURE_DEPTS.reduce((sum, d) => sum + simDept(d).weeklyCostManwon, 0)

function weekEndWorld(over: Partial<SimWorld> = {}): SimWorld {
  const base = createWorld(1)
  return {
    ...base,
    phase: 'WEEK_END' as const,
    // 주말 밤의 세계는 7일차다 — createWorld의 day: 1을 물려받으면 startNextWeek의 `day: 1`
    // 단언이 항진명제가 된다(`day: w.day`로 바꿔도 안 죽는다). week: 3과 같은 함정의 day 축.
    day: DAYS_PER_WEEK,
    days: [1, 2, 3, 4, 5, 6, 7].map(n => day(n, 10)),
    pawns: [doctor('doc-1', 8, FIXTURE_DEPTS[0]), doctor('doc-2', 9, FIXTURE_DEPTS[1])],
    ...over,
  }
}

describe('주간 요약', () => {
  it('요약: 수익 합 = 7일 revenue 합, 고정비 = 과별 주급의 합, 순이익 = 수익 − 고정비', () => {
    // 3주차로 잰다 — 1주차로 재면 week 필드를 상수 1로 굳혀도 안 걸린다(초기값과 구별 불가).
    const w = weekEndWorld({ week: 3 })
    const s = weekSummary(w)
    expect(s.week).toBe(3)
    expect(s.revenueManwon).toBe(7 * 10 * 30)
    expect(s.fixedCostManwon).toBe(FIXTURE_FIXED_COST)
    expect(s.netManwon).toBe(s.revenueManwon - s.fixedCostManwon)
  })

  it('진료·이탈도 7일 **합**이다(하루치나 마지막 날이 아니라)', () => {
    // 날마다 값을 다르게 준다 — 전부 같으면 "합" 대신 "첫날 × 7"이나 "마지막 날"로 바꿔도 안 걸린다.
    const days: DayRecord[] = [1, 2, 3, 4, 5, 6, 7].map(n => ({ ...day(n, n), leftCount: n * 2 }))
    const s = weekSummary(weekEndWorld({ days }))
    expect(s.examsDone).toBe(28)          // 1+2+…+7
    expect(s.leftCount).toBe(56)
    expect(s.revenueManwon).toBe(28 * FIXTURE_RATE)
  })

  it('고정비는 **의사** 수만 센다 — 세계에 남은 환자는 월급을 받지 않는다', () => {
    // 자연 흐름에선 마감이 환자를 다 빼가 pawns가 곧 의사라 이 구분이 통째로 관측되지 않는다.
    const patient: Pawn = { id: 'pat-1', kind: 'PATIENT', x: 20, y: 21, path: [], stage: 'WAITING' }
    const w = weekEndWorld({
      pawns: [doctor('doc-1', 8, FIXTURE_DEPTS[0]), doctor('doc-2', 9, FIXTURE_DEPTS[1]), patient],
    })
    expect(weekSummary(w).fixedCostManwon).toBe(FIXTURE_FIXED_COST)
  })

  it('기록이 없는 주는 수익 0 — 고정비는 그대로 나간다', () => {
    const s = weekSummary(weekEndWorld({ days: [] }))
    expect(s.revenueManwon).toBe(0)
    expect(s.fixedCostManwon).toBe(FIXTURE_FIXED_COST)
    expect(s.netManwon).toBe(-FIXTURE_FIXED_COST)
  })
})

describe('주간 요약 — 과별 표·응급 줄', () => {
  const cost = (d: SimDeptKey) => simDept(d).weeklyCostManwon

  it('고정비는 **과별** 주급의 합이다 — 균일 상수로 접히지 않는다', () => {
    const w = weekEndWorld({
      pawns: [
        doctor('doc-1', 8, 'CARDIOLOGY'), doctor('doc-2', 9, 'CARDIOLOGY'),
        doctor('doc-3', 10, 'AESTHETICS'),
      ],
    })
    const s = weekSummary(w)
    expect(s.fixedCostManwon).toBe(2 * cost('CARDIOLOGY') + cost('AESTHETICS'))
    // "의사 수 × 어떤 하나의 값"으로 회귀하면(옛 균일 상수·전원 내과 값) 반드시 이 셋 중
    // 하나와 같아진다 — 과가 섞인 병원에서만 그 회귀가 관측된다.
    for (const key of HIRABLE_DEPTS) expect(s.fixedCostManwon).not.toBe(3 * cost(key))
  })

  it('과 없는 의사는 조용히 0원이 아니라 던진다 — 값을 매길 수 없는 폰이다', () => {
    const ghost: Pawn = { id: 'ghost', kind: 'DOCTOR', x: 8, y: 8, path: [] }
    expect(() => weekSummary(weekEndWorld({ pawns: [ghost] }))).toThrow()
  })

  it('byDept: 과마다 의사 수·수익·고정비·순익이 서고, Σ가 총계와 같다', () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map(n => dayOf(n, {
      CARDIOLOGY: { patients: 2, revenueManwon: 900 },
      AESTHETICS: { patients: 3, revenueManwon: 90 },
    }))
    const s = weekSummary(weekEndWorld({
      days,
      pawns: [
        doctor('doc-1', 8, 'CARDIOLOGY'),
        doctor('doc-2', 9, 'AESTHETICS'), doctor('doc-3', 10, 'AESTHETICS'),
      ],
    }))
    expect(s.byDept.CARDIOLOGY).toEqual({
      doctors: 1,
      revenueManwon: 7 * 900,
      fixedCostManwon: cost('CARDIOLOGY'),
      netManwon: 7 * 900 - cost('CARDIOLOGY'),
    })
    expect(s.byDept.AESTHETICS).toEqual({
      doctors: 2,
      revenueManwon: 7 * 90,
      fixedCostManwon: 2 * cost('AESTHETICS'),
      netManwon: 7 * 90 - 2 * cost('AESTHETICS'),
    })
    // Σ 불변식(기존 deptLedger I-A 계승) — 과별 표가 한 줄이라도 새면 여기서 걸린다.
    const lines = Object.values(s.byDept)
    expect(lines.reduce((a, l) => a + l.revenueManwon, 0)).toBe(s.revenueManwon)
    expect(lines.reduce((a, l) => a + l.fixedCostManwon, 0)).toBe(s.fixedCostManwon)
    expect(lines.reduce((a, l) => a + l.netManwon, 0)).toBe(s.netManwon)
  })

  it('의사가 있는 과는 수익 0이어도 줄이 선다 — 진료를 한 건도 안 봐도 고정비는 나간다', () => {
    const s = weekSummary(weekEndWorld({ days: [], pawns: [doctor('doc-1', 8, 'CARDIOLOGY')] }))
    expect(s.byDept.CARDIOLOGY).toEqual({
      doctors: 1, revenueManwon: 0, fixedCostManwon: cost('CARDIOLOGY'), netManwon: -cost('CARDIOLOGY'),
    })
    // 관계가 아예 없는 과는 0줄이 아니라 **줄이 없다**(SimDeptStats의 Partial 계승).
    expect(Object.keys(s.byDept)).toEqual(['CARDIOLOGY'])
  })

  it('의사가 없는 과의 수익도 줄이 선다 — 그 주에 번 돈이 표에서 사라지지 않는다', () => {
    // PR C의 사직이 붙으면 "주중에 벌었는데 주말엔 그 과 의사가 0명"이 실재한다. 지금도
    // 손세계로는 만들 수 있고, 이 줄이 없으면 Σ byDept가 총수익과 어긋난다.
    const s = weekSummary(weekEndWorld({
      days: [dayOf(1, { CARDIOLOGY: { patients: 1, revenueManwon: 850 } })],
      pawns: [doctor('doc-1', 8, 'AESTHETICS')],
    }))
    expect(s.byDept.CARDIOLOGY).toEqual({
      doctors: 0, revenueManwon: 850, fixedCostManwon: 0, netManwon: 850,
    })
    expect(s.revenueManwon).toBe(850)
  })

  it('응급은 주 단위로 합산된다 — 수용·회차 각각(사유별 내역은 stats 소관)', () => {
    // 날마다 값을 다르게 준다 — 전부 같으면 "합" 대신 "첫날 × N"이나 "마지막 날"로 바꿔도 안 걸린다.
    const days = [1, 2, 3].map(n => dayOf(n, {}, { accepted: n, turnedAway: n * 2 }))
    expect(weekSummary(weekEndWorld({ days })).emergencies).toEqual({ accepted: 6, turnedAway: 12 })
  })
})

// ─── I-B1: 부호 불변식 ────────────────────────────────────────────────────────
// 이 게임의 논지("옳은 의료를 할수록 장부가 나빠진다")가 **숫자로 성립하는지**를 재는 회귀 잠금이다.
// 여기가 깨지면 카탈로그 값이 어긋났다는 뜻이고, 그건 게임이 하려던 말이 뒤집혔다는 뜻이다.
// (튜닝으로 값을 바꿀 수는 있다 — 바꾸되 **부호는 유지**한다. 계획 Task 5.)
describe('I-B1 부호 불변식 — 필수과는 장부를 이기지 못한다', () => {
  const I_B1_SEED = 3

  function place(w: SimWorld, spec: Parameters<typeof placeRoom>[1]): SimWorld {
    const r = placeRoom(w, spec)
    if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
    return r.world
  }

  /** 표준 시나리오 — **과 하나만 다르고 나머지는 완전히 같은** 병원(같은 시드·같은 방 배치·
   *  의사 1명·병동까지 동일). 차이를 과로 좁혀야 순익 차이가 카탈로그에서 왔다고 말할 수 있다. */
  function standardHospital(dept: SimDeptKey, seed: number): SimWorld {
    let w = createWorld(seed)
    w = place(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
    w = place(w, { type: 'EXAM', dept, x: 6, y: 6, w: 6, h: 5 })
    // 병동은 **양쪽 다** 짓는다 — 순환기만 지어 주면 "응급을 받을 수 있어서" 진 게 아니라
    // "병동을 더 지어서" 진 것이 되어 비교가 과의 비교가 아니게 된다.
    w = place(w, { type: 'WARD', x: 30, y: 20, w: 6, h: 5 })
    // 수납 창구 — 없으면 진료비가 한 푼도 안 걷혀 아래 금고·수익 단언이 0 대 0의 항진명제가 된다
      // (설계 2026-07-29 §2 · testHelpers.withCashier).
    return withCashier(hire(w, dept))
  }

  function runWeek(dept: SimDeptKey, seed = I_B1_SEED) {
    let w = standardHospital(dept, seed)
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      w = tick(w, DAY_END_MIN)
      if (w.phase === 'DAY_END') w = startNextDay(w)
    }
    if (w.phase !== 'WEEK_END') throw new Error(`전제 실패 — 주말에 닿지 못했다(${w.phase})`)
    const s = weekSummary(w)
    // Σ 불변식을 **자연 경로에서도** 잠근다. 손픽스처 한 건만으로는 "손으로 세운 DayRecord를
    // 잘 더한다"까지만 재고, 하루 정산이 실제로 만든 기록(외래 + 응급 + 마감에 인정한 건)이
    // 과별 표에 온전히 실리는지는 재지 못한다 — 여기가 그 자리이고, 아래 세 테스트가 부르는
    // 모든 시드·과에 함께 걸린다.
    const byDeptSum = Object.values(s.byDept).reduce((a, l) => a + l.revenueManwon, 0)
    expect(byDeptSum).toBe(s.revenueManwon)
    return s
  }

  it('ⓐ 미용 1명 병원의 주 순익 > 순환기 1명 병원의 주 순익', () => {
    const aesthetics = runWeek('AESTHETICS')
    const cardiology = runWeek('CARDIOLOGY')
    expect(aesthetics.netManwon).toBeGreaterThan(cardiology.netManwon)
    // 부호까지 못박는다 — 대소만 재면 둘 다 흑자여도(혹은 둘 다 적자여도) 통과한다.
    expect(aesthetics.netManwon).toBeGreaterThan(0)
    expect(cardiology.netManwon).toBeLessThan(0)
    expect(aesthetics.examsDone).toBeGreaterThan(0) // 계측기가 빈 병원으로 헛돌지 않았다
  })

  it('ⓑ 순환기 1명 병원은 응급을 받아도 과별 순익 ≤ 0 — 옳은 의료가 장부를 이기지 못한다', () => {
    const s = runWeek('CARDIOLOGY')
    const line = s.byDept.CARDIOLOGY!
    // **전제**: 응급이 실제로 수용돼 그 수익이 그 과 장부에 실렸다. 이 두 줄이 없으면
    // "응급을 받아도"가 공허해진다(응급이 0건인 세계에서 적자인 건 아무 말도 아니다).
    expect(s.emergencies.accepted).toBeGreaterThan(0)
    expect(line.revenueManwon)
      .toBeGreaterThan(s.examsDone * simDept('CARDIOLOGY').examRevenueManwon)
    expect(line.netManwon).toBeLessThanOrEqual(0)
  })

  it('부호는 시드가 바뀌어도 뒤집히지 않는다 — 한 판의 우연이 아니다', () => {
    for (const seed of [1, 4, 7]) {
      const a = runWeek('AESTHETICS', seed)
      const c = runWeek('CARDIOLOGY', seed)
      expect(a.netManwon, `시드 ${seed}`).toBeGreaterThan(c.netManwon)
      expect(a.netManwon, `시드 ${seed}`).toBeGreaterThan(0)
      expect(c.byDept.CARDIOLOGY!.netManwon, `시드 ${seed}`).toBeLessThanOrEqual(0)
    }
  })
})

describe('주간 결산', () => {
  it('settleWeek: 고정비가 금고에서 빠진다(수익은 진료 시점에 이미 들어옴 — 이중 지급 금지)', () => {
    const w = weekEndWorld({ treasuryManwon: 10_000 })
    const settled = settleWeek(w)
    expect(settled.treasuryManwon).toBe(10_000 - FIXTURE_FIXED_COST)
    expect(settled.phase).toBe('WEEK_END') // 결산해도 결산 화면은 남는다(플레이어가 읽고 넘긴다)
  })

  it('settleWeek는 입력 세계를 변형하지 않는다 (순수)', () => {
    const w = weekEndWorld({ treasuryManwon: 10_000 })
    const snapshot = structuredClone(w)
    settleWeek(w)
    expect(w).toEqual(snapshot)
  })

  it('금고 음수면 streak+1, 흑자 복귀면 0으로 리셋', () => {
    const broke = settleWeek(weekEndWorld({ treasuryManwon: 100 }))
    expect(broke.treasuryManwon).toBeLessThan(0)
    expect(broke.insolvencyStreak).toBe(1)
    expect(broke.phase).toBe('WEEK_END') // 첫 주 적자로는 안 망한다 — 문턱을 1로 낮추면 여기서 걸린다
    const rich = settleWeek(weekEndWorld({ treasuryManwon: 100_000, insolvencyStreak: 1 }))
    expect(rich.insolvencyStreak).toBe(0)
    expect(rich.phase).toBe('WEEK_END')
  })

  it('금고 0은 음수가 아니다 — 딱 고정비만큼 벌면 살아남는다', () => {
    // 경계 앞에서 기준을 캡처한다(T-085): 고정비와 금고가 같은 순간이 폐업 판정의 경계다.
    const exact = settleWeek(weekEndWorld({ treasuryManwon: FIXTURE_FIXED_COST, insolvencyStreak: 1 }))
    expect(exact.treasuryManwon).toBe(0)
    expect(exact.insolvencyStreak).toBe(0) // `<= 0`으로 쓰면 여기서 걸린다
    expect(exact.phase).toBe('WEEK_END')
  })

  it(`음수 연속 ${INSOLVENCY_WEEKS_TO_CLOSE}주면 CLOSED — startNextWeek이 봉쇄된다`, () => {
    const dead = settleWeek(weekEndWorld({ treasuryManwon: 100, insolvencyStreak: 1 }))
    expect(dead.insolvencyStreak).toBe(2)
    expect(dead.phase).toBe('CLOSED')
    // CLOSED에는 **왜 끝났는지**가 함께 실린다 — phase만 보면 세 엔딩이 한 화면으로 뭉개진다.
    expect(dead.ending).toBe('INSOLVENCY')
    expect(() => startNextWeek(dead)).toThrow()
  })

  it('문턱을 넘어선 streak도 CLOSED다 — 초과 상태에서 조용히 열려 있지 않는다', () => {
    // `=== 2`로 쓰면 streak 2에서 다시 적자를 낸 세계(3)가 CLOSED를 건너뛰고 계속 굴러간다.
    const dead = settleWeek(weekEndWorld({ treasuryManwon: 100, insolvencyStreak: 2 }))
    expect(dead.insolvencyStreak).toBe(3)
    expect(dead.phase).toBe('CLOSED')
    expect(dead.ending).toBe('INSOLVENCY')
  })

  it('살아남은 주에는 엔딩이 붙지 않는다 — 결말은 판이 끝난 세계만 갖는다', () => {
    const alive = settleWeek(weekEndWorld({ treasuryManwon: 100_000 }))
    expect(alive.phase).toBe('WEEK_END')
    expect(alive.ending).toBeUndefined()
  })

  it('settleWeek는 WEEK_END가 아닌 세계를 거부한다', () => {
    expect(() => settleWeek(createWorld(1))).toThrow() // RUNNING
    expect(() => settleWeek(weekEndWorld({ phase: 'DAY_END' }))).toThrow()
  })

  it('두 번 결산하면 거부한다 — 고정비가 두 번 빠지지 않는다(이중 정산 방지)', () => {
    const settled = settleWeek(weekEndWorld({ treasuryManwon: 100_000 }))
    expect(() => settleWeek(settled)).toThrow()
    expect(settled.treasuryManwon).toBe(100_000 - FIXTURE_FIXED_COST) // 한 번만 빠졌다
  })
})

// ─── 판 종결 ──────────────────────────────────────────────────────────────────
// 판이 **끝날 수 있는가**를 재는 자리. 폐업(INSOLVENCY)만 있던 시절엔 끝이 도달 불가능한
// 세계가 둘 있었다: 의사가 전멸하면 고정비가 0이라 금고가 영영 안 줄고(좀비), 흑자 빌드는
// 무한히 굴러간다. 세 엔딩은 그 두 구멍을 각각 막는다.
describe('판 종결 — 엔딩 3종', () => {
  /** 전국에 남은 의사가 0명인 채용 풀 — NO_PEOPLE의 두 조건 중 「더 뽑을 사람이 없다」 쪽.
   *  카탈로그에서 유도한다(HIRABLE_DEPTS) — 과를 손으로 나열하면 과가 늘어나는 날 조용히 낡아,
   *  빠뜨린 과에 사람이 남은 채로 "풀이 비었다"고 주장하게 된다. */
  const emptyPool = (): Record<SimDeptKey, number> =>
    Object.fromEntries(HIRABLE_DEPTS.map(k => [k, 0])) as Record<SimDeptKey, number>

  it('ⓐ 의사도 없고 전국에도 사람이 없으면 금고가 멀쩡해도 끝난다 (좀비 반증)', () => {
    // 의사 0 = 고정비 0 = 금고가 **영영 안 줄어든다** → 폐업(음수 2주)이 도달 불가능해진다.
    // 그 세계는 아무 결정도 없는 [다음 주] 버튼만 남아 무한히 굴러간다 — 판이 아니다.
    const settled = settleWeek(weekEndWorld({
      pawns: [], hirePool: emptyPool(), treasuryManwon: 100_000, week: 3,
    }))
    // 돈이 아니라 **사람이** 바닥나서 끝났다는 것을 두 숫자로 못박는다.
    expect(settled.treasuryManwon).toBe(100_000)
    expect(settled.insolvencyStreak).toBe(0)
    expect(settled.phase).toBe('CLOSED')
    expect(settled.ending).toBe('NO_PEOPLE')
  })

  it('ⓑ 마지막 의사가 이번 주말에 떠나면 **같은 결산**에서 NO_PEOPLE (사직 선반영)', () => {
    // 사직 집행은 startNextWeek이지만 명단은 resigningSimDoctors — 통지=집행의 단일 출처다.
    // 선반영하지 않으면 "떠난다"는 통지를 읽고 [다음 주]를 눌러야 비로소 판이 끝나, 마지막
    // 통지가 뜬 화면과 결말이 한 박자 어긋난다.
    const leaving: Pawn = {
      ...doctor('doc-1', 8, FIXTURE_DEPTS[0]), saturatedDays: RESIGN_SATURATED_DAYS,
    }
    const settled = settleWeek(weekEndWorld({
      pawns: [leaving], hirePool: emptyPool(), treasuryManwon: 100_000, week: 3,
    }))
    // 결산 시점의 세계엔 아직 의사가 **있다** — 그런데도 끝난다는 것이 선반영의 관측점이다.
    expect(settled.pawns).toHaveLength(1)
    expect(settled.phase).toBe('CLOSED')
    expect(settled.ending).toBe('NO_PEOPLE')
  })

  it(`ⓒ ${CAMPAIGN_WEEKS}주차 결산은 흑자여도 끝난다 — 캠페인 상한`, () => {
    const settled = settleWeek(weekEndWorld({ week: CAMPAIGN_WEEKS, treasuryManwon: 100_000 }))
    expect(settled.treasuryManwon).toBeGreaterThan(0) // 망해서 끝난 게 아니다
    expect(settled.insolvencyStreak).toBe(0)
    expect(settled.phase).toBe('CLOSED')
    expect(settled.ending).toBe('CAMPAIGN_END')
  })

  it(`ⓓ ${CAMPAIGN_WEEKS}주차이면서 연속 적자면 INSOLVENCY — 돈이 시간을 이긴다`, () => {
    // 두 조건이 **동시에** 참이라 우선순위만이 답을 가른다. 순서를 뒤집으면 폐업한 병원의
    // 결말이 "12주를 완주했다"로 나온다.
    const settled = settleWeek(weekEndWorld({
      week: CAMPAIGN_WEEKS, treasuryManwon: 100, insolvencyStreak: INSOLVENCY_WEEKS_TO_CLOSE - 1,
    }))
    expect(settled.insolvencyStreak).toBe(INSOLVENCY_WEEKS_TO_CLOSE)
    expect(settled.phase).toBe('CLOSED')
    expect(settled.ending).toBe('INSOLVENCY')
  })

  it('ⓔ 의사가 0명이어도 전국에 사람이 남았으면 끝나지 않는다 — 다시 뽑으면 된다', () => {
    const w = weekEndWorld({ pawns: [], treasuryManwon: 100_000, week: 3 })
    // 전제: 풀이 실제로 남아 있다(비어 있으면 이 테스트는 ⓐ의 중복이 된다).
    expect(Object.values(w.hirePool).reduce((s, n) => s + n, 0)).toBeGreaterThan(0)
    const settled = settleWeek(w)
    expect(settled.phase).toBe('WEEK_END')
    expect(settled.ending).toBeUndefined()
  })

  it(`ⓕ ${CAMPAIGN_WEEKS - 1}주차 정상 결산은 끝나지 않는다 — 상한의 경계`, () => {
    // 경계의 기준은 결산 **전** 세계에서 캡처한다(T-085). 결산 결과의 주차로 경계를 쓰면,
    // 언젠가 settleWeek이 주를 옮기는 날 이 테스트가 조용히 다른 주를 재게 된다.
    const before = weekEndWorld({ week: CAMPAIGN_WEEKS - 1, treasuryManwon: 100_000 })
    expect(before.week).toBe(CAMPAIGN_WEEKS - 1)
    expect(before.pawns.length).toBeGreaterThan(0) // 계측기가 NO_PEOPLE로 헛돌지 않았다
    const settled = settleWeek(before)
    expect(settled.week).toBe(before.week)
    expect(settled.treasuryManwon).toBeGreaterThan(0)
    expect(settled.phase).toBe('WEEK_END')
    expect(settled.ending).toBeUndefined()
  })

  it(`ⓖ ${CAMPAIGN_WEEKS}주차에 사람까지 바닥나면 NO_PEOPLE — 사람이 시간을 이긴다`, () => {
    // 우선순위의 **가운데 축**. ⓓ가 잠그는 것은 맨 위(돈 > 시간)뿐이라, CAMPAIGN_END 검사를
    // INSOLVENCY와 NO_PEOPLE **사이**로 옮기는 변조는 ⓓ를 통과한다 — 그러면 마지막 의사가
    // 떠나며 끝난 판이 "12주 완주"로 보고되고, 이 게임이 하려는 말(사람이 바닥나서 끝난다)이
    // 하필 그 말이 가장 크게 들려야 할 판에서만 사라진다.
    const settled = settleWeek(weekEndWorld({
      week: CAMPAIGN_WEEKS, pawns: [], hirePool: emptyPool(), treasuryManwon: 100_000,
    }))
    expect(settled.insolvencyStreak).toBe(0) // 돈으로 끝난 게 아니다 — 위 두 축을 분리해 둔다
    expect(settled.phase).toBe('CLOSED')
    expect(settled.ending).toBe('NO_PEOPLE')
  })

  it('ⓘ 돈도 사람도 동시에 바닥나면 INSOLVENCY — 돈이 사람을 이긴다', () => {
    // 우선순위의 **맨 위 두 칸**. ⓓ는 돈 > 시간을, ⓖ는 사람 > 시간을 잠그지만 **돈 > 사람**은
    // 어느 쪽도 안 잰다 — NO_PEOPLE 검사를 INSOLVENCY 앞으로 옮기는 변조가 1056건 전부를
    // 통과했다(리뷰 실측). 그러면 두 주 연속 적자로 망한 병원이 "사람이 없어서 끝났다"로
    // 보고되고, 플레이어는 자기가 어디서 졌는지를 틀리게 배운다.
    //
    // 의사 0이라 고정비도 0이다 — 그래서 적자는 **이미 음수인 금고**로 만든다(고정비로
    // 밀어 넣으면 의사가 필요해지고, 그러면 NO_PEOPLE 조건이 성립하지 않아 두 조건이
    // 동시에 참인 세계를 못 만든다).
    const before = weekEndWorld({
      pawns: [], hirePool: emptyPool(), treasuryManwon: -100,
      insolvencyStreak: INSOLVENCY_WEEKS_TO_CLOSE - 1, week: 3,
    })
    const settled = settleWeek(before)
    // 전제 — 두 조건이 **둘 다** 참이라 우선순위만이 답을 가른다.
    expect(settled.insolvencyStreak).toBe(INSOLVENCY_WEEKS_TO_CLOSE)
    expect(settled.pawns.filter(p => p.kind === 'DOCTOR')).toHaveLength(0)
    expect(Object.values(settled.hirePool).reduce((s, n) => s + n, 0)).toBe(0)
    expect(settled.phase).toBe('CLOSED')
    expect(settled.ending).toBe('INSOLVENCY')
  })

  it('ⓗ 전국 풀이 비어도 우리 병원에 의사가 있으면 끝나지 않는다', () => {
    // NO_PEOPLE의 **왼쪽 항**을 재는 유일한 자리. ⓐⓑⓖ는 전부 풀 0 **그리고** 의사 0이라
    // 왼쪽 항을 통째로 지워도(= 풀만 보고 판정) 전부 통과한다.
    // 이 세계는 자연 경로로 도달한다 — 전국 풀은 과마다 2~8명뿐이라(dept.nationalPool) 열심히
    // 뽑으면 실제로 바닥난다. 왼쪽 항이 없으면 **의사를 다 뽑아 병원이 가장 붐비는 순간**
    // 판이 "사람이 없어서" 끝난다.
    const w = weekEndWorld({ hirePool: emptyPool(), treasuryManwon: 100_000, week: 3 })
    // 전제 — 풀은 비었고 의사는 남았다(둘 중 하나라도 틀리면 이 테스트는 다른 걸 잰다).
    expect(Object.values(w.hirePool).reduce((s, n) => s + n, 0)).toBe(0)
    expect(w.pawns.filter(p => p.kind === 'DOCTOR')).toHaveLength(2)
    const settled = settleWeek(w)
    expect(settled.phase).toBe('WEEK_END')
    expect(settled.ending).toBeUndefined()
  })
})

describe('다음 주', () => {
  it('startNextWeek: week+1·day 1·분 0·days 비움·RUNNING — 방·의사·금고는 유지', () => {
    const settled = settleWeek(weekEndWorld({ treasuryManwon: 100_000 }))
    const next = startNextWeek(settled)
    expect(next).toMatchObject({ phase: 'RUNNING', week: 2, day: 1, minute: 0, days: [] })
    expect(next.pawns).toHaveLength(2)
    expect(next.treasuryManwon).toBe(settled.treasuryManwon) // 다음 주로 넘어간다고 돈이 생기거나 사라지지 않는다
    expect(next.insolvencyStreak).toBe(settled.insolvencyStreak)
  })

  it('startNextWeek도 새 하루로 시작한다 — 당일 집계 0·의사는 어제 경로를 버린다', () => {
    // 7일차 밤엔 startNextDay가 없다. 여기서 하루 초기화를 빠뜨리면 주의 첫날만 지난주 stats를
    // 들고 시작해 그날 DayRecord가 지난주 진료까지 다시 센다(에러 없이 숫자만 틀린다).
    const walking: Pawn = {
      id: 'doc-1', kind: 'DOCTOR', x: 8, y: 8, path: [{ x: 9, y: 8 }], dest: { x: 9, y: 8 },
      dept: 'CARDIOLOGY',
    }
    const settled = settleWeek(weekEndWorld({
      treasuryManwon: 100_000, pawns: [walking],
      stats: {
        examsDone: 12, leftCount: 3, leftNoDept: 1, byDept: { CARDIOLOGY: { patients: 12, revenueManwon: 300 } },
        emergencyAccepted: 2, emergencyTurnedAway: [{ kind: 'STEMI', reason: 'NO_BED' }], unpaidManwon: 0,
      },
    }))
    const next = startNextWeek(settled)
    // 과별 집계도, 응급 집계도 아침에 비운다 — 안 비우면 새 주 첫날 장부가 지난주를 다시 싣는다.
    expect(next.stats).toEqual({
      examsDone: 0, leftCount: 0, leftNoDept: 0, byDept: {},
      emergencyAccepted: 0, emergencyTurnedAway: [], unpaidManwon: 0,
    })
    const doc = next.pawns[0]
    expect(doc.path).toEqual([])
    expect(doc.dest).toBeUndefined()
  })

  it('startNextWeek는 입력 세계를 변형하지 않는다 (순수)', () => {
    const settled = settleWeek(weekEndWorld({ treasuryManwon: 100_000 }))
    const snapshot = structuredClone(settled)
    startNextWeek(settled)
    expect(settled).toEqual(snapshot)
  })

  it('다음 주도 결산할 수 있다 — 결산 완료 표시가 주와 함께 넘어가지 않는다', () => {
    const next = startNextWeek(settleWeek(weekEndWorld({ treasuryManwon: 100_000 })))
    const week2End: SimWorld = { ...next, phase: 'WEEK_END', days: [1, 2, 3, 4, 5, 6, 7].map(n => day(n, 10)) }
    const settled2 = settleWeek(week2End)
    expect(settled2.treasuryManwon).toBe(next.treasuryManwon - FIXTURE_FIXED_COST)
  })

  it('startNextWeek는 WEEK_END가 아닌 세계를 거부한다', () => {
    expect(() => startNextWeek(createWorld(1))).toThrow() // RUNNING
    expect(() => startNextWeek(weekEndWorld({ phase: 'DAY_END' }))).toThrow()
  })

  it('결산하지 않은 주는 넘길 수 없다 — 고정비를 건너뛰고 다음 주로 갈 수 없다', () => {
    expect(() => startNextWeek(weekEndWorld({ treasuryManwon: 100_000 }))).toThrow()
  })
})
