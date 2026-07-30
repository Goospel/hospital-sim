// 간호사 이탈 — **얇은 배치는 결국 그 사람을 잃는다**의 계약.
//
// 사슬은 셋이고 셋이 **한 덩어리**라 파일을 하나로 둔다:
//  ① 간호등급 SHORT로 마감한 날이 간호사 몸에 **리셋 없이** 쌓인다(day.settleDay · Pawn.shortDays)
//  ② 그 날들이 **자기** 임계에 닿으면 다음 주에 떠난다(nurse.resigningNurses · week.startNextWeek)
//  ③ 떠난 사람은 유휴 **장부**에만 남고(world.nursesResignedTotal) 채용은 계속 무제한이다
// 셋 중 하나만 끊겨도 악순환(SHORT → 감산 → 이탈 → 창구 정지 → 더 얇은 배치)이 통째로 열리는데,
// 그 실패는 어느 화면에도 에러로 안 뜬다 — 그냥 아무도 안 떠나거나, 떠나도 창구가 계속 걷는다.
//
// 의사 사직(resignation.test.ts)과 **다른 파일**인 이유는 드라이버가 다르기 때문이다: 포화는
// 개인의 피로고 SHORT는 **배치 조건**이다. 임계도 별도 상수라(설계 §2) 한쪽 튜닝이 다른 쪽을
// 끌면 안 된다 — 같은 파일에 두면 픽스처가 상수를 공유하며 그 독립이 조용히 사라진다.
import { describe, it, expect } from 'vitest'
import { createWorld, simRegion, type SimWorld } from './world'
import { hireNurse, nurseCount, type Pawn } from './pawn'
import { hire, placeRoom, withCashier } from './testHelpers'
import { DAY_END_MIN, DAYS_PER_WEEK, settleDay, startNextDay } from './day'
import {
  NURSE_NEW_WEEKS, NURSE_RESIGN_SHORT_DAYS, NURSE_RESIGN_SHORT_DAYS_NEW,
  nurseGradeOf, resigningNurses,
} from './nurse'
import { NURSE_WEEKLY_COST_MANWON, settleWeek, startNextWeek, weekSummary } from './week'
import { hasCashier } from './patientFlow'
import { tick } from './tick'
import type { SimDeptKey } from './dept'
import { RESIGN_SATURATED_DAYS } from '../game/doctor'

const doctorPawn = (id: string, dept: SimDeptKey = 'AESTHETICS', over: Partial<Pawn> = {}): Pawn =>
  ({ id, kind: 'DOCTOR', x: 8, y: 8, path: [], dept, ...over })

/** 픽스처 간호사 — 채용 경로와 **같은 필드**를 싣는다(shortDays 0 · 1주차 채용). */
const nursePawn = (id: string, over: Partial<Pawn> = {}): Pawn =>
  ({ id, kind: 'NURSE', x: 30, y: 24, path: [], shortDays: 0, hiredWeek: 1, ...over })

const nursesOf = (w: SimWorld) => w.pawns.filter(p => p.kind === 'NURSE')
const shortDaysOf = (w: SimWorld) => nursesOf(w).map(p => p.shortDays)

// ─── ① SHORT 일수 누적 — settleDay ────────────────────────────────────────────

/** 마감 직전의 세계 — 손으로 세운 폰만 있어 환자발 잡음이 0이다. */
const duskOf = (pawns: Pawn[]): SimWorld => ({ ...createWorld(1), pawns })

/** 의사 `doctors`명·간호사 `nurses`명뿐인 마감 직전 세계.
 *  등급은 `ceil(의사/2)` 기준이라 (4,1)=SHORT · (2,1)=MET · (2,2)=BONUS다. */
function dusk(doctors: number, nurses: number): SimWorld {
  return duskOf([
    ...Array.from({ length: doctors }, (_, i) => doctorPawn(`doc-${i}`)),
    ...Array.from({ length: nurses }, (_, i) => nursePawn(`nur-${i}`)),
  ])
}

describe('SHORT 일수 — 마감이 세는 날', () => {
  it('새로 뽑은 간호사는 0에서 시작한다 — 필드가 실재한다(undefined가 아니다)', () => {
    // 의사의 `saturatedDays: 0`과 같은 이유다 — "아직 안 겪은 사람"과 "기계 밖 폰"을 구별한다.
    const w = hireNurse(createWorld(1))
    expect(nursesOf(w)[0].shortDays).toBe(0)
  })

  it('채용 주차가 함께 실린다 — 신규 판별의 근거다', () => {
    const w = hireNurse({ ...createWorld(1), week: 5 })
    expect(nursesOf(w)[0].hiredWeek).toBe(5)
  })

  it('간호등급 SHORT로 마감한 날은 +1', () => {
    const w = dusk(4, 1)
    expect(nurseGradeOf(w).grade).toBe('SHORT') // 전제: 이 배치가 실제로 미달이다
    expect(shortDaysOf(w)).toEqual([0])         // 기준을 정산 **전에** 캡처한다(T-085)
    expect(shortDaysOf(settleDay(w))).toEqual([1])
  })

  it('MET으로 마감한 날은 세지 않는다 — 기준을 채운 날은 아무 일도 없다', () => {
    const w = dusk(2, 1)
    expect(nurseGradeOf(w).grade).toBe('MET')
    expect(shortDaysOf(settleDay(w))).toEqual([0])
  })

  it('BONUS로 마감한 날도 세지 않는다 — 그리고 쌓인 날을 **깎지도** 않는다(회복 없음)', () => {
    const w = duskOf([
      doctorPawn('doc-0'), doctorPawn('doc-1'),
      nursePawn('nur-0', { shortDays: 2 }), nursePawn('nur-1', { shortDays: 2 }),
    ])
    expect(nurseGradeOf(w).grade).toBe('BONUS')
    expect(shortDaysOf(settleDay(w))).toEqual([2, 2])
  })

  it('미달인 날은 **모든** 간호사가 함께 오른다 — 배치 미달은 특정인이 아니라 모두의 환경이다', () => {
    const w = dusk(6, 2)
    expect(nurseGradeOf(w).grade).toBe('SHORT')
    expect(shortDaysOf(settleDay(w))).toEqual([1, 1])
  })

  it('의사는 이 카운터를 받지 않는다 — SHORT는 간호사의 축이다', () => {
    const settled = settleDay(dusk(4, 1))
    for (const d of settled.pawns.filter(p => p.kind === 'DOCTOR')) {
      expect(d.shortDays, d.id).toBeUndefined()
    }
  })

  it('필드가 없는 손세계 간호사도 1이 된다 — 폴백이 조용히 삼키지 않는다', () => {
    const w = duskOf([
      doctorPawn('doc-0'), doctorPawn('doc-1'), doctorPawn('doc-2'), doctorPawn('doc-3'),
      { id: 'nur-hand', kind: 'NURSE', x: 30, y: 24, path: [] },
    ])
    expect(nurseGradeOf(w).grade).toBe('SHORT')
    expect(shortDaysOf(settleDay(w))).toEqual([1])
  })

  it('회복이 없다 — 아침(startNextDay)도 미달 아닌 날도 쌓인 날을 못 지운다', () => {
    // `saturatedDays`와 같은 규율이다(pawn.ts): *회복해도 그 날들은 몸에 남는다*. 리셋을 두면
    // "하루만 제대로 배치해 되돌리는" 최적화 표면이 생기고, 그러면 이탈은 구조의 결과가 아니라
    // 관리의 실수가 된다.
    const first = settleDay(dusk(4, 1))
    expect(shortDaysOf(first)).toEqual([1])
    const morning = startNextDay(first)
    expect(shortDaysOf(morning)).toEqual([1])
    // 둘째 날은 의사 셋을 내보내 MET으로 마감한다 — 그래도 어제의 하루는 남는다.
    const kept = new Set(['doc-0', 'nur-0'])
    const met = { ...morning, pawns: morning.pawns.filter(p => kept.has(p.id)) }
    expect(nurseGradeOf(met).grade).toBe('MET')
    expect(shortDaysOf(settleDay(met))).toEqual([1])
  })
})

// ─── ② 사직 판정 — 통지(resigningNurses)와 집행(startNextWeek) ────────────────

function weekEndWorld(pawns: Pawn[], over: Partial<SimWorld> = {}): SimWorld {
  return {
    ...createWorld(1),
    phase: 'WEEK_END' as const,
    day: DAYS_PER_WEEK,
    weekSettled: true, // 결산을 마친 주말 — startNextWeek의 전제
    pawns,
    ...over,
  }
}

/** 재직 4주를 넘겨 **기존**으로 읽히는 주차(설계 §2 — `week − hiredWeek >= NURSE_NEW_WEEKS`). */
const VETERAN_WEEK = 1 + NURSE_NEW_WEEKS

describe('사직 임계 — 신규가 먼저 떠난다', () => {
  it('신규 임계는 기존의 **절반 쪽**이다 — 값이 아니라 대소가 주장이다', () => {
    expect(NURSE_RESIGN_SHORT_DAYS_NEW).toBeLessThan(NURSE_RESIGN_SHORT_DAYS)
  })

  it(`기존 간호사는 SHORT ${NURSE_RESIGN_SHORT_DAYS}일에 떠난다 — 경계는 등호를 포함한다`, () => {
    const w = weekEndWorld([nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS })], { week: VETERAN_WEEK })
    expect(resigningNurses(w).map(p => p.id)).toEqual(['nur-1'])
    expect(startNextWeek(w).pawns).toEqual([])
  })

  it(`기존 간호사는 ${NURSE_RESIGN_SHORT_DAYS - 1}일이면 남는다 — 임계의 경계`, () => {
    const w = weekEndWorld([nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS - 1 })], { week: VETERAN_WEEK })
    expect(resigningNurses(w)).toEqual([])
    expect(startNextWeek(w).pawns.map(p => p.id)).toEqual(['nur-1'])
  })

  it(`신규 간호사는 ${NURSE_RESIGN_SHORT_DAYS_NEW}일에 떠난다 — 같은 날 수로 기존은 남는다`, () => {
    // 이 대비가 §2 「신규 가중이 고리를 잠근다」의 전부다: 떠난 자리를 재채용으로 메꾸면 그
    // 사람은 절반의 날에 떠나므로 돈만으로는 악순환이 안 풀린다.
    const rookie = nursePawn('nur-new', { shortDays: NURSE_RESIGN_SHORT_DAYS_NEW, hiredWeek: 2 })
    const veteran = nursePawn('nur-old', { shortDays: NURSE_RESIGN_SHORT_DAYS_NEW, hiredWeek: 1 })
    const w = weekEndWorld([rookie, veteran], { week: VETERAN_WEEK })
    expect(resigningNurses(w).map(p => p.id)).toEqual(['nur-new'])
  })

  it(`신규 판별은 재직 ${NURSE_NEW_WEEKS}주 **미만**이다 — 딱 채운 주부터 기존이다`, () => {
    const at = (week: number) => weekEndWorld(
      [nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS_NEW, hiredWeek: 1 })], { week },
    )
    expect(resigningNurses(at(NURSE_NEW_WEEKS)).map(p => p.id)).toEqual(['nur-1'])   // 재직 N−1주 = 신규
    expect(resigningNurses(at(NURSE_NEW_WEEKS + 1))).toEqual([])                     // 재직 N주 = 기존
  })

  it('채용 주차가 없는 손세계 폰은 **1주차 채용**으로 읽힌다 — 스타팅 로스터와 같은 취급', () => {
    const hand: Pawn = {
      id: 'nur-hand', kind: 'NURSE', x: 30, y: 24, path: [], shortDays: NURSE_RESIGN_SHORT_DAYS_NEW,
    }
    expect(resigningNurses(weekEndWorld([hand], { week: 2 })).map(p => p.id)).toEqual(['nur-hand'])
    expect(resigningNurses(weekEndWorld([hand], { week: VETERAN_WEEK }))).toEqual([])
  })

  it('떠나는 것은 간호사뿐이다 — 포화한 의사는 이 명단에 없다', () => {
    const w = weekEndWorld([
      doctorPawn('doc-1', 'CARDIOLOGY', { saturatedDays: RESIGN_SATURATED_DAYS + 5 }),
      nursePawn('nur-1', { shortDays: 0 }),
    ], { week: VETERAN_WEEK })
    expect(resigningNurses(w)).toEqual([])
  })

  it('SHORT 일수를 단 **환자** 폰은 명단에 없다 — 마감을 넘긴 환자가 pawns에 섞일 수 있다', () => {
    const patient: Pawn = {
      id: 'pat-1', kind: 'PATIENT', x: 20, y: 20, path: [], stage: 'WAITING',
      shortDays: NURSE_RESIGN_SHORT_DAYS + 9,
    }
    const w = weekEndWorld([patient], { week: VETERAN_WEEK })
    expect(resigningNurses(w)).toEqual([])
    expect(startNextWeek(w).pawns.map(p => p.id)).toEqual(['pat-1'])
  })

  it('통지와 집행은 같은 명단이다 — 갈리면 안 떠난 사람이 통지되거나 통지 없이 사라진다', () => {
    const w = weekEndWorld([
      nursePawn('nur-1', { shortDays: 0 }),
      nursePawn('nur-2', { shortDays: NURSE_RESIGN_SHORT_DAYS - 1 }),
      nursePawn('nur-3', { shortDays: NURSE_RESIGN_SHORT_DAYS }),
      nursePawn('nur-4', { shortDays: NURSE_RESIGN_SHORT_DAYS + 3 }),
      nursePawn('nur-5', { shortDays: NURSE_RESIGN_SHORT_DAYS_NEW, hiredWeek: VETERAN_WEEK }),
    ], { week: VETERAN_WEEK })
    const notice = resigningNurses(w).map(p => p.id)
    const next = startNextWeek(w)
    const gone = w.pawns.map(p => p.id).filter(id => !next.pawns.some(p => p.id === id))
    expect(gone).toEqual(notice)
    expect(notice.length).toBeGreaterThan(0) // 계측기가 빈 명단으로 헛돌지 않았다
  })

  it('남은 간호사의 SHORT 일수는 주가 바뀌어도 그대로다', () => {
    const w = weekEndWorld([nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS - 1 })], { week: VETERAN_WEEK })
    expect(shortDaysOf(startNextWeek(w))).toEqual([NURSE_RESIGN_SHORT_DAYS - 1])
  })

  it('의사와 간호사가 **같은 주말에** 함께 떠난다 — 한쪽 집행이 다른 쪽을 가리지 않는다', () => {
    const w = weekEndWorld([
      doctorPawn('doc-1', 'CARDIOLOGY', { saturatedDays: RESIGN_SATURATED_DAYS }),
      doctorPawn('doc-2', 'AESTHETICS', { saturatedDays: 0 }),
      nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS }),
      nursePawn('nur-2', { shortDays: 0 }),
    ], { week: VETERAN_WEEK })
    expect(startNextWeek(w).pawns.map(p => p.id)).toEqual(['doc-2', 'nur-2'])
  })
})

// ─── ③ 유휴 장부 · 채용 무제한 ────────────────────────────────────────────────

describe('유휴 — 면허는 그대로다(장부지 자원이 아니다)', () => {
  it('사직 수가 누계에 더해진다 — 이 판에서 몇 명이 떠났는가', () => {
    const w = weekEndWorld([
      nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS }),
      nursePawn('nur-2', { shortDays: NURSE_RESIGN_SHORT_DAYS }),
    ], { week: VETERAN_WEEK, nursesResignedTotal: 3 })
    expect(startNextWeek(w).nursesResignedTotal).toBe(5)
  })

  it('아무도 안 떠난 주는 누계가 그대로다', () => {
    const w = weekEndWorld([nursePawn('nur-1')], { week: VETERAN_WEEK, nursesResignedTotal: 3 })
    expect(startNextWeek(w).nursesResignedTotal).toBe(3)
  })

  it('새 판의 누계는 0이다 — 하루·주 리셋이 없는 판 단위 축(turnedAwayTotal과 같은 계약)', () => {
    expect(createWorld(1).nursesResignedTotal).toBe(0)
    // 아침도 주 넘김도 이 축을 못 지운다 — freshStats에 두면 이튿날 0으로 돌아간다.
    const w = { ...createWorld(1), nursesResignedTotal: 2, pawns: [doctorPawn('doc-0')] }
    expect(startNextDay(settleDay(w)).nursesResignedTotal).toBe(2)
  })

  it('사직 뒤에도 채용은 무제한이다 — 리서치의 사실은 "뽑을 사람은 있는데 잔류가 안 된다"다', () => {
    const gone = startNextWeek(weekEndWorld(
      [nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS })], { week: VETERAN_WEEK },
    ))
    expect(nurseCount(gone.pawns)).toBe(0)
    expect(nurseCount(hireNurse(gone).pawns)).toBe(1)
  })

  it('이름 서수는 사직 뒤에도 단조 증가한다 — 같은 이름이 재등장하지 않는다', () => {
    // 인덱스가 `nurseCount`뿐이면 사직으로 인원이 줄면서 같은 이름이 다시 나온다(설계 §3).
    let w = createWorld(1)
    for (let i = 0; i < 2; i++) w = hireNurse(w)
    const firstTwo = nursesOf(w).map(p => p.name)
    const gone = startNextWeek({
      ...w,
      phase: 'WEEK_END',
      weekSettled: true,
      week: VETERAN_WEEK,
      pawns: w.pawns.map(p => ({ ...p, shortDays: NURSE_RESIGN_SHORT_DAYS })),
    })
    expect(nurseCount(gone.pawns)).toBe(0)
    const rehired = nursesOf(hireNurse(gone))[0]
    expect(firstTwo).not.toContain(rehired.name)
  })
})

// ─── ④ 악순환의 이빨 — 창구가 비면 수납이 선다 ────────────────────────────────

describe('악순환 — 마지막 간호사가 떠나면 수납이 멈춘다', () => {
  /** 대기실 + 진료실(내과) + 수납 창구 + 내과 의사 1명 — 돈이 도는 최소 병원. */
  function hospital(): SimWorld {
    let w = createWorld(7)
    for (const spec of [
      { type: 'WAITING' as const, x: 18, y: 24, w: 8, h: 6 },
      { type: 'EXAM' as const, dept: 'INTERNAL_MEDICINE' as const, x: 18, y: 14, w: 8, h: 6 },
    ]) {
      const r = placeRoom(w, spec)
      if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
      w = r.world
    }
    return withCashier(hire(w, 'INTERNAL_MEDICINE'))
  }

  it('사직 다음 주엔 창구가 없어 진료비가 미수로 샌다', () => {
    const before = hospital()
    expect(hasCashier(before)).toBe(true) // 전제: 지금은 걷힌다
    const weekEnd: SimWorld = {
      ...before,
      phase: 'WEEK_END',
      day: DAYS_PER_WEEK,
      weekSettled: true,
      week: VETERAN_WEEK,
      pawns: before.pawns.map(p => (
        p.kind === 'NURSE' ? { ...p, shortDays: NURSE_RESIGN_SHORT_DAYS, hiredWeek: 1 } : p
      )),
    }
    const next = startNextWeek(weekEnd)
    expect(hasCashier(next)).toBe(false)
    const day = tick(next, DAY_END_MIN)
    expect(day.days[0].examsDone).toBeGreaterThan(0) // 진료는 그대로 돈다
    expect(day.days[0].revenueManwon).toBe(0)        // 그런데 한 푼도 안 걷힌다
    expect(day.days[0].unpaidManwon).toBeGreaterThan(0)
  })

  it('판은 간호사로 끝나지 않는다 — NO_PEOPLE 판정에 간호사는 불참한다', () => {
    // 채용이 무제한이라 "간호사가 0명"은 되돌릴 수 있는 상태다. 여기에 종결을 걸면 뽑으면
    // 되는 판이 끝나 버린다(NO_PEOPLE은 *더 뽑을 사람이 없다*는 결말이다).
    const base = createWorld(1)
    const w: SimWorld = {
      ...base,
      phase: 'WEEK_END',
      day: DAYS_PER_WEEK,
      week: 2,
      hirePool: Object.fromEntries(Object.keys(base.hirePool).map(k => [k, 0])) as typeof base.hirePool,
      pawns: [
        doctorPawn('doc-1', 'AESTHETICS'),
        nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS }),
      ],
    }
    const settled = settleWeek(w)
    expect(resigningNurses(w)).toHaveLength(1) // 전제: 간호사는 실제로 떠난다
    expect(settled.ending).toBeUndefined()
    expect(settled.phase).toBe('WEEK_END')
  })
})

// ─── ⑤ 결산 블록 — 통지가 화면까지 같은 명단으로 간다 ─────────────────────────

describe('결산의 간호 블록 — 사직 수와 유휴 누계', () => {
  it('이번 주말 사직 수는 `resigningNurses`와 같은 명단에서 온다', () => {
    const w = weekEndWorld([
      nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS }),
      nursePawn('nur-2', { shortDays: 0 }),
    ], { week: VETERAN_WEEK, nursesResignedTotal: 2 })
    const s = weekSummary(w)
    expect(s.nursing.leaving).toBe(resigningNurses(w).length)
    expect(s.nursing.leaving).toBe(1)
    expect(s.nursing.resignedTotal).toBe(2)
  })

  it('고정비는 **사직 전** 명단으로 청구된다 — 그 주를 일한 사람의 주급은 나간다', () => {
    const w = weekEndWorld(
      [nursePawn('nur-1', { shortDays: NURSE_RESIGN_SHORT_DAYS })],
      { week: VETERAN_WEEK, treasuryManwon: 100_000, weekSettled: false },
    )
    expect(weekSummary(w).nursing.count).toBe(1) // 결산 표엔 아직 서 있다
    const settled = settleWeek(w)
    // 임대료도 함께 빠진다 — 기본 세계가 URBAN이라 1,200이다(지역 슬라이스 2026-07-30).
    // 이 describe가 재는 것은 **주급의 청구 시점**이라, 지역세는 카탈로그에서 파생해 더한다.
    expect(settled.treasuryManwon)
      .toBe(100_000 - NURSE_WEEKLY_COST_MANWON - simRegion(w.region).rentManwon)
    expect(startNextWeek(settled).pawns).toEqual([])
  })
})
