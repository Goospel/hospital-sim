import { describe, it, expect } from 'vitest'
import {
  startSession, beginSetup, completeSetup, completeReceiving, advanceDay, isLastDay, weekTotals,
  beginEmergency, toEpilogue, buildEpilogue, type SessionState,
} from './session'
import { canOrderWorkup, decide } from './receiving'
import { DAYS_PER_WEEK } from './setup'
import { attemptTransfer } from './round'
import type { IncomingCall, SetupChoices } from './types'

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

type Policy = boolean | ((call: IncomingCall) => boolean)

/**
 * 그날의 RECEIVING을 끝까지 흘린다(하루 마감은 하지 않는다). 방침은 불리언(전부) 또는 콜별 함수.
 *
 * 자리가 유한해진 뒤로 **"전부 수용"은 더 이상 하나의 전략이 아니다** — 앞선 워크인이 자리를 먹으면
 * 뒤의 STEMI가 NO_BED로 막힌다. 그래서 '양심'은 전부 수용이 아니라 **워크인을 거절해 자리를 비워두는
 * 선택**으로만 표현된다. 이 헬퍼가 콜별 함수를 받는 이유다.
 */
function runDay(state: SessionState, accept: Policy, withWorkup = false) {
  let s = state
  while (!s.receiving!.done) {
    const call = s.receiving!.queue[s.receiving!.index]
    const yes = typeof accept === 'function' ? accept(call) : accept
    s = { ...s, receiving: decide(s.receiving!, yes, withWorkup) }
  }
  return s
}

/** 7일을 통째로 흘려 INTERSTITIAL 직전까지 간다(각 날 마감 + 다음 날 전진). */
function runWeek(choices: SetupChoices, accept: Policy = false, withWorkup = false) {
  let s = runDay(completeSetup(choices), accept, withWorkup)
  for (let d = 1; d < DAYS_PER_WEEK; d++) {
    s = advanceDay(completeReceiving(s)) // 마감 → 다음 날 RECEIVING
    s = runDay(s, accept, withWorkup)
  }
  return advanceDay(completeReceiving(s)) // 7일차 마감 → INTERSTITIAL
}

/** 양심 방침 — 워크인을 거절해 필수 케이스에 자리를 남긴다. */
const essentialFirst = (call: IncomingCall) => call.kind !== 'COSMETIC_WALKIN'

describe('세션 페이즈 전이', () => {
  it('startSession → LANDING(첫 화면 = 타이틀 카드)', () => {
    expect(startSession().phase).toBe('LANDING')
  })

  it('beginSetup → SETUP(랜딩에서 시작 → 위저드)', () => {
    expect(beginSetup(startSession()).phase).toBe('SETUP')
  })

  it('LANDING이 아니면 beginSetup 에러(가드)', () => {
    expect(() => beginSetup(completeSetup(collaborator))).toThrow()
  })

  it('completeSetup → RECEIVING(플레이어 병원·콜 큐 준비)', () => {
    const s = completeSetup(collaborator)
    expect(s.phase).toBe('RECEIVING')
    expect(s.hospital!.name).toBe('흑자메디컬')
    expect(s.receiving!.queue.length).toBe(5)
  })

  it('receiving 미완이면 completeReceiving 에러', () => {
    const s = completeSetup(collaborator)
    expect(() => completeReceiving(s)).toThrow()
  })

  it('receiving 완료 → completeReceiving → DAY_END(하루 마감, 달력 기록)', () => {
    const s = completeReceiving(runDay(completeSetup(collaborator), false))
    expect(s.phase).toBe('DAY_END')
  })
})

describe('7일 루프 — day 전이와 달력 기록', () => {
  it('completeSetup은 1일차에서 시작하고 달력은 비어 있다', () => {
    const s = completeSetup(collaborator)
    expect(s.day).toBe(1)
    expect(s.ledgerDays).toEqual([])
  })

  it('DAY_END → advanceDay → 다음 날 RECEIVING(새 큐·자리·델타 리셋)', () => {
    const d1 = completeReceiving(runDay(completeSetup(collaborator), true))
    const d2 = advanceDay(d1)
    expect(d2.phase).toBe('RECEIVING')
    expect(d2.day).toBe(2)
    expect(d2.receiving!.index).toBe(0)
    expect(d2.receiving!.done).toBe(false)
    expect(d2.receiving!.bedsFree).toBe(d2.hospital!.beds) // 검사를 안 붙였으면 새 하루엔 병상이 다 빈다
    expect(d2.receiving!.netProfitDeltaBillions).toBe(0) // 그날 진료 수익은 0에서 시작
    expect(d2.receiving!.queue[0].id).toContain('d2') // 2일차 큐
  })

  /**
   * boarding — 검사가 날짜를 처음으로 묶는다(설계 스펙 §3.3).
   * 지금까지 7일은 서로 독립이었다(매일 자리 리셋). 이제 **어제의 흑자가 오늘의 자리를 먹는다.**
   */
  it('[boarding] 어제 검사를 붙인 만큼 오늘 자리가 준다 — 달력이 처음으로 의미를 갖는다', () => {
    // 1일차: 급여 환자만 받고 전부 검사를 붙인다
    const d1 = completeReceiving(runDay(completeSetup(conscientious), (c) => canOrderWorkup(c.kind), true))
    const boarded = d1.receiving!.workupCount
    expect(boarded).toBeGreaterThan(0) // 실제로 검사가 붙었어야 이 테스트가 의미 있다
    const d2 = advanceDay(d1)
    expect(d2.receiving!.bedsFree).toBe(d2.hospital!.beds - boarded)
  })

  it('[boarding] 자기제한적 — 자리가 0이면 검사 붙일 환자도 없어 다음날 자리가 돌아온다', () => {
    const d1 = completeReceiving(runDay(completeSetup(conscientious), (c) => canOrderWorkup(c.kind), true))
    const d2 = advanceDay(d1)
    // 2일차는 자리가 줄어든 채 시작 → 받을 수 있는 환자가 적으니 검사도 적게 붙는다
    const d2done = completeReceiving(runDay(d2, (c) => canOrderWorkup(c.kind), true))
    expect(d2done.receiving!.workupCount).toBeLessThanOrEqual(d2.receiving!.bedsFree)
    const d3 = advanceDay(d2done)
    expect(d3.receiving!.bedsFree).toBeGreaterThanOrEqual(d2.receiving!.bedsFree) // 무한 악화가 불가능
  })

  /**
   * 다음날 아침 신문 — 사용자 피드백 "돌려보낸 환자가 어떻게 됐는지 알 수 없다"의 답.
   * 인과 사슬의 마지막 고리: 저수가 → 검사 → boarding → 자리 없음 → 수용 불가 → **다음날 신문**.
   */
  it('[신문] 어제 돌려보낸 STEMI가 오늘 아침 기사로 온다', () => {
    // 미용만 받아 자리를 채우면 STEMI는 NO_BED로 막힌다 — 그게 기사가 된다.
    const d1 = completeReceiving(runDay(completeSetup(conscientious), (c) => c.kind === 'COSMETIC_WALKIN'))
    expect(d1.ledgerDays[0].turnedAway.length).toBeGreaterThan(0)
    const d2 = advanceDay(d1)
    expect(d2.morningNews.length).toBe(d1.ledgerDays[0].turnedAway.length)
    expect(d2.morningNews[0].headline).toContain("'뺑뺑이'")
  })

  it('[신문] 1일차 아침엔 신문이 없다 — 어제가 없다', () => {
    expect(completeSetup(conscientious).morningNews).toEqual([])
  })

  it('[신문] 돌려보낸 STEMI가 없으면 신문도 없다 — 다 받은 날의 아침은 조용하다', () => {
    // 순환기 2명 + 자리가 허용하는 STEMI만 받는다 → 하드락 없음
    const d1 = completeReceiving(runDay(completeSetup(conscientious), (c) => c.kind === 'STEMI'))
    const hardlockedStemi = d1.ledgerDays[0].turnedAway.length
    const d2 = advanceDay(d1)
    expect(d2.morningNews.length).toBe(hardlockedStemi)
  })

  it('[신문] 내가 거절한 STEMI도 기사가 된다 — 구조가 막았든 내가 막았든 환자는 똑같이 못 들어왔다', () => {
    const d1 = completeReceiving(runDay(completeSetup(conscientious), false)) // 전부 거절
    const stemiPerDay = d1.receiving!.queue.filter((c) => c.kind === 'STEMI').length
    expect(d1.ledgerDays[0].turnedAway.length).toBe(stemiPerDay)
  })

  it('[I7] 주간 누계에 검사 수익이 별도로 합산된다', () => {
    const week = runWeek(conscientious, (c) => canOrderWorkup(c.kind), true)
    const totals = weekTotals(week)
    expect(totals.workupRevenueBillions).toBeGreaterThan(0)
    // 급여 환자만 받고 전량 검사 → 진료 수익은 음수인데 검사가 덮는다
    expect(totals.netProfitDeltaBillions).toBeLessThan(0)
    expect(totals.workupRevenueBillions).toBeGreaterThan(Math.abs(totals.netProfitDeltaBillions))
  })

  it('하루를 마감할 때마다 달력에 한 칸씩 쌓인다', () => {
    const d1 = completeReceiving(runDay(completeSetup(collaborator), true))
    expect(d1.ledgerDays).toHaveLength(1)
    expect(d1.ledgerDays[0].day).toBe(1)
    const d2 = completeReceiving(runDay(advanceDay(d1), true))
    expect(d2.ledgerDays).toHaveLength(2)
    expect(d2.ledgerDays.map((r) => r.day)).toEqual([1, 2])
  })

  it('달력 한 칸 = 부문 손익 오늘치 + 그날 진료 수익, 그리고 못 받은 콜 수를 남긴다', () => {
    const d1 = completeReceiving(runDay(completeSetup(collaborator), true)) // 전부 수용 시도
    const rec = d1.ledgerDays[0]
    expect(rec.netProfitBillions).toBe(rec.segmentShareBillions + rec.callDeltaBillions)
    expect(rec.accepted).toBe(3) // 자리 3
    expect(rec.blocked).toBeGreaterThan(0) // 자리가 없어 구조가 막은 콜이 있다
    expect(rec.accepted + rec.blocked).toBeLessThanOrEqual(5)
  })

  it('isLastDay — 7일차에서만 참', () => {
    expect(isLastDay(completeSetup(collaborator))).toBe(false)
    expect(isLastDay({ ...completeSetup(collaborator), day: DAYS_PER_WEEK })).toBe(true)
  })

  it('7일차 마감 후 advanceDay → INTERSTITIAL(그날 밤 응급으로)', () => {
    const s = runWeek(collaborator, true)
    expect(s.phase).toBe('INTERSTITIAL')
    expect(s.day).toBe(DAYS_PER_WEEK)
    expect(s.ledgerDays).toHaveLength(DAYS_PER_WEEK) // 달력 일곱 칸이 다 찬다
  })

  it('DAY_END가 아니면 advanceDay 에러(가드)', () => {
    expect(() => advanceDay(completeSetup(collaborator))).toThrow()
  })

  it('receiving 미완이면 completeReceiving 에러(하루를 일찍 못 닫는다)', () => {
    expect(() => completeReceiving(completeSetup(collaborator))).toThrow()
  })

  it('weekTotals — 7일치 진료 수익·소송 노출을 합산한다(마지막 날 것만이 아니라)', () => {
    const s = runWeek(conscientious, essentialFirst)
    const totals = weekTotals(s)
    const sumDelta = s.ledgerDays.reduce((n, r) => n + r.callDeltaBillions, 0)
    const sumLawsuit = s.ledgerDays.reduce((n, r) => n + r.lawsuitExposure, 0)
    expect(totals.netProfitDeltaBillions).toBe(sumDelta)
    expect(totals.lawsuitExposure).toBe(sumLawsuit)
    expect(totals.lawsuitExposure).toBeGreaterThan(s.ledgerDays[6].lawsuitExposure) // 한 날치보다 크다
  })

  it('부문 손익 오늘치 7일 합 = 주간 전액 — 달력과 결말 장부가 어긋나지 않는다', () => {
    const s = runWeek(collaborator, false) // 전부 거절 → 델타 0, 구조 손익만
    const sumShares = s.ledgerDays.reduce((n, r) => n + r.segmentShareBillions, 0)
    const weekly = s.hospital!.economics!.segments.reduce((n, x) => n + x.profitBillions, 0)
    expect(Math.abs(sumShares - weekly)).toBeLessThanOrEqual(DAYS_PER_WEEK) // 일별 반올림 오차만 허용
  })
})

describe('beginEmergency 분기 — backupCare가 가른다', () => {
  it('공범(순환기 없음) → TRANSFER(기존 STEMI 뺑뺑이)', () => {
    const s = beginEmergency(runWeek(collaborator))
    expect(s.phase).toBe('EMERGENCY')
    expect(s.emergency!.mode).toBe('TRANSFER')
    const em = s.emergency!
    if (em.mode === 'TRANSFER') {
      expect(em.game.status).toBe('IN_PROGRESS')
      expect(em.game.hospitals.length).toBeGreaterThan(1) // 외부 풀
    }
  })

  it('양심(순환기 있음) → IN_HOUSE(직접 PCI)', () => {
    const s = beginEmergency(runWeek(conscientious))
    expect(s.phase).toBe('EMERGENCY')
    expect(s.emergency!.mode).toBe('IN_HOUSE')
  })
})

describe('toEpilogue 가드 + buildEpilogue', () => {
  it('TRANSFER가 진행중이면 toEpilogue 에러', () => {
    const s = beginEmergency(runWeek(collaborator))
    expect(() => toEpilogue(s)).toThrow()
  })

  it('양심 경로: IN_HOUSE → 즉시 EPILOGUE, 생존·적자·소송비용·순환기 채용 N', () => {
    // 양심 빌드는 순환기·미용이 함께라 기저는 흑자다(부문 +46억) — 적자·소송은 1막에서 필수 케이스를
    // '수용'할 때 성립한다(비용은 짓기가 아니라 진료함에서 온다).
    // 자리가 3뿐이라 워크인을 거절해야만 STEMI 두 통을 다 받을 수 있다 — 양심은 이제 '선택'이다.
    // (전부 수용하면 워크인이 자리를 먹어 두 번째 STEMI가 NO_BED로 막히고, 결말이 흑자로 뒤집힌다.)
    let s = beginEmergency(runWeek(conscientious, essentialFirst))
    s = toEpilogue(s)
    const epi = buildEpilogue(s)
    expect(epi.survived).toBe(true)
    expect(epi.debrief).toBeNull() // 전원 미니게임 없음
    expect(epi.ledger!.essentialHires).toBe(2)
    expect(epi.ledger!.segments.some((seg) => seg.label === '소송 비용')).toBe(true)
    expect(epi.ledger!.netProfitBillions).toBeLessThan(0) // 적자 + 소송 비용
  })

  it('공범 경로: TRANSFER 끝(권역심혈관센터 h6 수용) → 생존, 장부는 흑자·채용 0·소송비용 없음', () => {
    let s = beginEmergency(runWeek(collaborator))
    // 외부 풀의 출구 h6(권역심혈관센터)에 전원 성공
    const em = s.emergency!
    const game = attemptTransfer(em.mode === 'TRANSFER' ? em.game : (() => { throw new Error() })(), 'h6', 12)
    s = { ...s, emergency: { mode: 'TRANSFER', game } }
    s = toEpilogue(s)
    const epi = buildEpilogue(s)
    expect(epi.survived).toBe(true)
    expect(epi.debrief).not.toBeNull()
    expect(epi.ledger!.essentialHires).toBe(0)
    expect(epi.ledger!.netProfitBillions).toBeGreaterThan(0) // 흑자
    expect(epi.ledger!.segments.some((seg) => seg.label === '소송 비용')).toBe(false)
  })
})

describe('통합 불변식', () => {
  it('공범 병원은 STEMI를 받는 쪽에서도 하드락(1막), 2막에선 전원으로 던져짐', () => {
    const s = completeSetup(collaborator)
    // 1막: 첫 STEMI 콜(c2)까지 진행해 하드락 확인
    let r = s.receiving!
    r = decide(r, false) // c1 워크인
    const afterStemi = decide(r, true) // c2 STEMI accept 시도
    expect(afterStemi.log[1].disposition).toBe('HARDLOCK_REJECT')
    // 2막: 전원 분기
    expect(beginEmergency(runWeek(collaborator)).emergency!.mode).toBe('TRANSFER')
  })
})
