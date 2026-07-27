import { describe, it, expect } from 'vitest'
import { createWorld, type SimWorld } from './world'
import {
  WEEKLY_DOCTOR_COST_MANWON, INSOLVENCY_WEEKS_TO_CLOSE,
  weekSummary, settleWeek, startNextWeek,
} from './week'
import type { DayRecord } from './day'
import type { Pawn } from './pawn'

const day = (n: number, exams: number): DayRecord =>
  ({ day: n, examsDone: exams, leftCount: 0, revenueManwon: exams * 30 })

const doctor = (id: string, x: number): Pawn => ({ id, kind: 'DOCTOR', x, y: 8, path: [] })

function weekEndWorld(over: Partial<SimWorld> = {}): SimWorld {
  const base = createWorld(1)
  return {
    ...base,
    phase: 'WEEK_END' as const,
    days: [1, 2, 3, 4, 5, 6, 7].map(n => day(n, 10)),
    pawns: [doctor('doc-1', 8), doctor('doc-2', 9)],
    ...over,
  }
}

describe('주간 요약', () => {
  it('요약: 수익 합 = 7일 revenue 합, 고정비 = 의사 수 × 상수, 순이익 = 수익 − 고정비', () => {
    // 3주차로 잰다 — 1주차로 재면 week 필드를 상수 1로 굳혀도 안 걸린다(초기값과 구별 불가).
    const w = weekEndWorld({ week: 3 })
    const s = weekSummary(w)
    expect(s.week).toBe(3)
    expect(s.revenueManwon).toBe(7 * 10 * 30)
    expect(s.fixedCostManwon).toBe(2 * WEEKLY_DOCTOR_COST_MANWON)
    expect(s.netManwon).toBe(s.revenueManwon - s.fixedCostManwon)
  })

  it('진료·이탈도 7일 **합**이다(하루치나 마지막 날이 아니라)', () => {
    // 날마다 값을 다르게 준다 — 전부 같으면 "합" 대신 "첫날 × 7"이나 "마지막 날"로 바꿔도 안 걸린다.
    const days: DayRecord[] = [1, 2, 3, 4, 5, 6, 7].map(n =>
      ({ day: n, examsDone: n, leftCount: n * 2, revenueManwon: n * 30 }))
    const s = weekSummary(weekEndWorld({ days }))
    expect(s.examsDone).toBe(28)          // 1+2+…+7
    expect(s.leftCount).toBe(56)
    expect(s.revenueManwon).toBe(28 * 30)
  })

  it('고정비는 **의사** 수만 센다 — 세계에 남은 환자는 월급을 받지 않는다', () => {
    // 자연 흐름에선 마감이 환자를 다 빼가 pawns가 곧 의사라 이 구분이 통째로 관측되지 않는다.
    const patient: Pawn = { id: 'pat-1', kind: 'PATIENT', x: 20, y: 21, path: [], stage: 'WAITING' }
    const w = weekEndWorld({ pawns: [doctor('doc-1', 8), doctor('doc-2', 9), patient] })
    expect(weekSummary(w).fixedCostManwon).toBe(2 * WEEKLY_DOCTOR_COST_MANWON)
  })

  it('기록이 없는 주는 수익 0 — 고정비는 그대로 나간다', () => {
    const s = weekSummary(weekEndWorld({ days: [] }))
    expect(s.revenueManwon).toBe(0)
    expect(s.fixedCostManwon).toBe(2 * WEEKLY_DOCTOR_COST_MANWON)
    expect(s.netManwon).toBe(-2 * WEEKLY_DOCTOR_COST_MANWON)
  })
})

describe('주간 결산', () => {
  it('settleWeek: 고정비가 금고에서 빠진다(수익은 진료 시점에 이미 들어옴 — 이중 지급 금지)', () => {
    const w = weekEndWorld({ treasuryManwon: 10_000 })
    const settled = settleWeek(w)
    expect(settled.treasuryManwon).toBe(10_000 - 2 * WEEKLY_DOCTOR_COST_MANWON)
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
    const exact = settleWeek(weekEndWorld({ treasuryManwon: 2 * WEEKLY_DOCTOR_COST_MANWON, insolvencyStreak: 1 }))
    expect(exact.treasuryManwon).toBe(0)
    expect(exact.insolvencyStreak).toBe(0) // `<= 0`으로 쓰면 여기서 걸린다
    expect(exact.phase).toBe('WEEK_END')
  })

  it(`음수 연속 ${INSOLVENCY_WEEKS_TO_CLOSE}주면 CLOSED — startNextWeek이 봉쇄된다`, () => {
    const dead = settleWeek(weekEndWorld({ treasuryManwon: 100, insolvencyStreak: 1 }))
    expect(dead.insolvencyStreak).toBe(2)
    expect(dead.phase).toBe('CLOSED')
    expect(() => startNextWeek(dead)).toThrow()
  })

  it('문턱을 넘어선 streak도 CLOSED다 — 초과 상태에서 조용히 열려 있지 않는다', () => {
    // `=== 2`로 쓰면 streak 2에서 다시 적자를 낸 세계(3)가 CLOSED를 건너뛰고 계속 굴러간다.
    const dead = settleWeek(weekEndWorld({ treasuryManwon: 100, insolvencyStreak: 2 }))
    expect(dead.insolvencyStreak).toBe(3)
    expect(dead.phase).toBe('CLOSED')
  })

  it('settleWeek는 WEEK_END가 아닌 세계를 거부한다', () => {
    expect(() => settleWeek(createWorld(1))).toThrow() // RUNNING
    expect(() => settleWeek(weekEndWorld({ phase: 'DAY_END' }))).toThrow()
  })

  it('두 번 결산하면 거부한다 — 고정비가 두 번 빠지지 않는다(이중 정산 방지)', () => {
    const settled = settleWeek(weekEndWorld({ treasuryManwon: 100_000 }))
    expect(() => settleWeek(settled)).toThrow()
    expect(settled.treasuryManwon).toBe(100_000 - 2 * WEEKLY_DOCTOR_COST_MANWON) // 한 번만 빠졌다
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
    const walking: Pawn = { id: 'doc-1', kind: 'DOCTOR', x: 8, y: 8, path: [{ x: 9, y: 8 }], dest: { x: 9, y: 8 } }
    const settled = settleWeek(weekEndWorld({
      treasuryManwon: 100_000, pawns: [walking], stats: { examsDone: 12, leftCount: 3 },
    }))
    const next = startNextWeek(settled)
    expect(next.stats).toEqual({ examsDone: 0, leftCount: 0 })
    const doc = next.pawns[0]
    expect(doc.path).toEqual([])
    expect(doc.dest).toBeUndefined()
  })

  it('다음 주도 결산할 수 있다 — 결산 완료 표시가 주와 함께 넘어가지 않는다', () => {
    const next = startNextWeek(settleWeek(weekEndWorld({ treasuryManwon: 100_000 })))
    const week2End: SimWorld = { ...next, phase: 'WEEK_END', days: [1, 2, 3, 4, 5, 6, 7].map(n => day(n, 10)) }
    const settled2 = settleWeek(week2End)
    expect(settled2.treasuryManwon).toBe(next.treasuryManwon - 2 * WEEKLY_DOCTOR_COST_MANWON)
  })

  it('startNextWeek는 WEEK_END가 아닌 세계를 거부한다', () => {
    expect(() => startNextWeek(createWorld(1))).toThrow() // RUNNING
    expect(() => startNextWeek(weekEndWorld({ phase: 'DAY_END' }))).toThrow()
  })

  it('결산하지 않은 주는 넘길 수 없다 — 고정비를 건너뛰고 다음 주로 갈 수 없다', () => {
    expect(() => startNextWeek(weekEndWorld({ treasuryManwon: 100_000 }))).toThrow()
  })
})
