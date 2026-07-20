import { describe, it, expect } from 'vitest'
import {
  startSession, beginSetup, completeSetup, completeReceiving, advanceDay, isLastDay, weekTotals,
  completeWeek, nextWeek, beginWeek, endGame, weekTurnedAwayCount, weekReceivedEmergencyCount,
  cumulativeNetBillions, buildEpilogue, enterWorldEvent, enterGrowth, growthCostOf, canApplyGrowth,
  applyGrowth, type SessionState,
} from './session'
import { initWorld, applyEvent, OPENING_EVENT } from './world'
import { decide, isElective } from './receiving'
import { DAYS_PER_WEEK, SETUP_BUDGET_BILLIONS } from './setup'
import { DAY_LENGTH_MIN } from './daysim'
import { initSystem, POOL_INITIAL } from './system'
import type { IncomingCall, SetupChoices } from './types'

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

type Policy = boolean | ((call: IncomingCall) => boolean)

/**
 * 그날의 RECEIVING을 끝까지 흘린다(하루 마감은 하지 않는다). 방침은 불리언(전부) 또는 콜별 함수.
 *
 * 응급(일반·필수)은 decide가 자동 판정하므로 accept를 무시한다 — 방침은 **선택진료**(미용·배후과 예약)에만
 * 먹는다. 그래서 '양심'은 선택진료를 거절해 그 과 의사를 응급에 비워두는 선택으로 표현된다(essentialFirst).
 */
function runDay(state: SessionState, accept: Policy) {
  let s = state
  while (!s.receiving!.done) {
    const call = s.receiving!.queue[s.receiving!.index]
    const yes = typeof accept === 'function' ? accept(call) : accept
    s = { ...s, receiving: decide(s.receiving!, yes) }
  }
  return s
}

/** day-1 RECEIVING 상태에서 7일을 통째로 흘려 7일차 DAY_END까지 간다(각 날 마감 + 다음 날 전진). */
function runWeekFrom(start: SessionState, accept: Policy = false) {
  let s = runDay(start, accept)
  for (let d = 1; d < DAYS_PER_WEEK; d++) {
    s = advanceDay(completeReceiving(s)) // 마감 → 다음 날 RECEIVING
    s = runDay(s, accept)
  }
  return completeReceiving(s) // 7일차 마감 → DAY_END (다음 날 없음 → 결산으로)
}

/** 개원(위저드 완료)부터 한 주를 흘려 7일차 DAY_END까지 간다. */
function runWeek(choices: SetupChoices, accept: Policy = false) {
  return runWeekFrom(completeSetup(choices), accept)
}

/** 한 주 완주: 7일차 DAY_END → WEEK_SUMMARY. */
function finishWeek(lastDayEnd: SessionState): SessionState {
  return completeWeek(lastDayEnd)
}

/**
 * 양심 방침 — 선택진료(워크인·배후과 예약)를 거절해 필수 케이스에 자리를 남긴다.
 * isElective가 COSMETIC_WALKIN·SPECIALIST_ELECTIVE를 함께 묶는다 — 둘 다 '내가 고르는' 콜이지 응급이 아니다.
 */
const essentialFirst = (call: IncomingCall) => !isElective(call.kind)

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
    expect(d2.receiving!.clockMin).toBe(0) // 새 하루는 시각 0에서 연다
    expect(d2.receiving!.busyUntil).toEqual({}) // 이 시나리오는 초과 점유가 없어 이월도 없다(전 유닛 자유)
    expect(d2.receiving!.netProfitDeltaBillions).toBe(0) // 그날 진료 수익은 0에서 시작
    expect(d2.receiving!.queue[0].id).toContain('d2') // 2일차 큐
  })

  describe('boarding — 검사/장시술이 의사를 내일로 이월', () => {
    it('busyUntil > DAY_LENGTH_MIN인 의사는 다음날 그만큼 늦게 자유로워진다', () => {
      const d1 = completeReceiving(runDay(completeSetup(conscientious), essentialFirst))
      const docId = d1.hospital!.roster!.find((d) => d.dept === 'CARDIOLOGY')!.id
      // 마감을 넘겨 진행 중이던 진료(장시술·검사)를 흉내낸다 — 실제 점유에 초과분(170분)을 얹는다.
      const overrun: SessionState = {
        ...d1,
        receiving: { ...d1.receiving!, busyUntil: { ...d1.receiving!.busyUntil, [docId]: DAY_LENGTH_MIN + 170 } },
      }
      const d2 = advanceDay(overrun)
      expect(d2.receiving!.busyUntil[docId]).toBe(170) // 초과분만 다음날 초기 점유로 넘어온다
    })

    it('점유 이월이 없으면 다음날 전원 자유(0)에서 시작', () => {
      // essentialFirst는 선택진료를 거절해 진료 시간이 짧다 — 마감을 넘길 만큼 늘어지지 않는다.
      const d1 = completeReceiving(runDay(completeSetup(conscientious), essentialFirst))
      const d2 = advanceDay(d1)
      expect(d2.receiving!.busyUntil).toEqual({})
    })
  })

  /**
   * 다음날 아침 신문 — 사용자 피드백 "돌려보낸 환자가 어떻게 됐는지 알 수 없다"의 답.
   * 인과 사슬의 마지막 고리: 배후과 부재/점유 → 수용 불가 → **다음날 신문**.
   */
  it('[신문] 어제 돌려보낸 필수 응급이 오늘 아침 기사로 온다', () => {
    // 배후과가 하나도 없는 공범 병원은 필수 응급을 못 받는다(NO_BACKUP_CARE) — 그게 기사가 된다.
    const d1 = completeReceiving(runDay(completeSetup(collaborator), false))
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

  it('[신문] 배후과가 없어 못 받은 필수 응급이 전부 기사가 된다 — 능동 거절이 아니라 구조가 막는다', () => {
    // 응급은 자동 판정이라 플레이어가 거절할 수 없다. 배후과가 하나도 없는 공범 병원에선 그날 온 필수
    // 응급이 전부 NO_BACKUP_CARE로 막히고, 그 전원이 기사가 된다.
    const CRITICAL: string[] = ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY', 'ABDOMINAL_EMERGENCY', 'MEDICAL_EMERGENCY'] // 배후과 요구 응급 전체(신문 대상)
    const d1 = completeReceiving(runDay(completeSetup(collaborator), false)) // 배후과 0
    const criticalPerDay = d1.receiving!.queue.filter((c) => CRITICAL.includes(c.kind)).length
    expect(criticalPerDay).toBeGreaterThan(0)
    expect(d1.ledgerDays[0].turnedAway.length).toBe(criticalPerDay)
  })

  it('하루를 마감할 때마다 달력에 한 칸씩 쌓인다', () => {
    const d1 = completeReceiving(runDay(completeSetup(collaborator), true))
    expect(d1.ledgerDays).toHaveLength(1)
    expect(d1.ledgerDays[0].day).toBe(1)
    const d2 = completeReceiving(runDay(advanceDay(d1), true))
    expect(d2.ledgerDays).toHaveLength(2)
    expect(d2.ledgerDays.map((r) => r.day)).toEqual([1, 2])
  })

  it('달력 한 칸 = 부문 손익 오늘치 + 그날 진료 수익, 그리고 못 받은 필수 응급을 남긴다', () => {
    const d1 = completeReceiving(runDay(completeSetup(collaborator), true)) // 전부 수용 시도
    const rec = d1.ledgerDays[0]
    expect(rec.netProfitBillions).toBe(rec.segmentShareBillions + rec.callDeltaBillions)
    // 미용 2(선택진료·미용 담당 있음). 순환기 예약·고열감염·STEMI는 담당/배후가 없어 미수용(세분 응급도 배후 필요).
    expect(rec.accepted).toBe(2)
    expect(rec.turnedAway.length).toBeGreaterThan(0) // 배후과가 없어 못 받은 필수 응급
    expect(rec.accepted + rec.blocked).toBeLessThanOrEqual(5)
  })

  it('isLastDay — 7일차에서만 참', () => {
    expect(isLastDay(completeSetup(collaborator))).toBe(false)
    expect(isLastDay({ ...completeSetup(collaborator), day: DAYS_PER_WEEK })).toBe(true)
  })

  it('7일차 마감 → DAY_END(달력 일곱 칸이 다 찬다), advanceDay는 막힌다(다음 날 없음)', () => {
    const s = runWeek(collaborator, true)
    expect(s.phase).toBe('DAY_END')
    expect(s.day).toBe(DAYS_PER_WEEK)
    expect(s.ledgerDays).toHaveLength(DAYS_PER_WEEK) // 달력 일곱 칸이 다 찬다
    expect(() => advanceDay(s)).toThrow() // 7일차엔 다음 날이 아니라 completeWeek(결산)로 간다
  })

  it('weekTurnedAwayCount — 그 주 돌려보낸 응급 총원을 센다', () => {
    // 미용만 받아 자리를 채우면 필수 응급은 전부 하드락/거절로 돌아간다.
    const s = runWeek(conscientious, (c) => c.kind === 'COSMETIC_WALKIN')
    const summed = s.ledgerDays.reduce((n, d) => n + d.turnedAway.length, 0)
    expect(summed).toBeGreaterThan(0)
    expect(weekTurnedAwayCount(s)).toBe(summed)
  })

  it('weekReceivedEmergencyCount — 그 주 받은 필수 응급 총원을 센다(돌려보낸 수의 짝)', () => {
    // 양심(순환기 2)은 STEMI만 배후가 있어 받고, 나머지 필수 응급은 하드락 → 받은 응급 = 수용된 STEMI.
    const s = runWeek(conscientious, essentialFirst)
    const received = s.ledgerDays.reduce((n, d) => n + d.receivedEmergency, 0)
    expect(received).toBeGreaterThan(0)
    expect(weekReceivedEmergencyCount(s)).toBe(received)
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

describe('completeWeek 가드 + buildEpilogue', () => {
  it('7일차 DAY_END가 아니면 completeWeek 에러(가드)', () => {
    expect(() => completeWeek(completeSetup(collaborator))).toThrow() // RECEIVING에서 호출
  })

  it('EPILOGUE가 아니면 buildEpilogue 에러(가드)', () => {
    expect(() => buildEpilogue(finishWeek(runWeek(collaborator)))).toThrow() // WEEK_SUMMARY에서 호출
  })

  it('양심 경로: 한 주 완주 → 종료 → EPILOGUE, 적자·소송비용·순환기 채용 N', () => {
    // 양심 빌드는 순환기·미용이 함께라 기저는 흑자다(부문 +46억) — 적자·소송은 1막에서 필수 케이스를
    // '수용'할 때 성립한다(비용은 짓기가 아니라 진료함에서 온다).
    // 자리가 3뿐이라 선택진료(워크인·배후과 예약)를 거절해야만 필수 응급을 다 받을 수 있다 — 양심은 이제 '선택'이다.
    const s = endGame(finishWeek(runWeek(conscientious, essentialFirst)))
    const epi = buildEpilogue(s)
    expect(epi.ledger!.essentialHires).toBe(2)
    expect(epi.ledger!.segments.some((seg) => seg.label === '소송 비용')).toBe(true)
    expect(epi.ledger!.netProfitBillions).toBeLessThan(0) // 적자 + 소송 비용
  })

  it('공범 경로: 채용 0 · 소송비용 없음 · 흑자', () => {
    const s = endGame(finishWeek(runWeek(collaborator)))
    const epi = buildEpilogue(s)
    expect(epi.ledger!.essentialHires).toBe(0)
    expect(epi.ledger!.netProfitBillions).toBeGreaterThan(0) // 흑자
    expect(epi.ledger!.segments.some((seg) => seg.label === '소송 비용')).toBe(false)
  })
})

describe('에필로그 누적 결산 — 이번 주 신문(1막 7일 돌려보낸 STEMI)', () => {
  /**
   * collaborator(순환기 0) + 전부 거절 → 매일 STEMI가 하드락/거절로 증발한다.
   * 7일 완주 → 종료로 EPILOGUE에 도달시킨다.
   */
  function collaboratorEpilogue(): SessionState {
    return endGame(finishWeek(runWeek(collaborator, false)))
  }

  it('[누적] 7일 동안 돌려보낸 STEMI가 전부 결말 신문에 모인다', () => {
    const s = collaboratorEpilogue()
    const total = s.ledgerDays.reduce((n, d) => n + d.turnedAway.length, 0)
    expect(total).toBeGreaterThan(0)
    const epi = buildEpilogue(s)
    expect(epi.weekNews.length).toBe(total)
    expect(epi.weekNews[0].headline).toContain("'뺑뺑이'")
  })

  it('[누적] 7일차 거절도 포함된다 — morningNews로는 다음 아침이 없어 증발하던 사람들', () => {
    const s = collaboratorEpilogue()
    const day7 = s.ledgerDays[6].turnedAway
    expect(day7.length).toBeGreaterThan(0)
    const ids = new Set(buildEpilogue(s).weekNews.map((n) => n.id))
    for (const t of day7) expect(ids.has(`news-${t.callId}`)).toBe(true)
  })
})

describe('통합 불변식', () => {
  it('공범 병원은 STEMI를 받는 쪽에서 하드락된다 — 못 받은 STEMI는 다른 데서 뺑뺑이(내가 그 벽)', () => {
    const s = completeSetup(collaborator)
    // STEMI 콜 직전까지 거절로 흘려보낸 뒤(도착순 큐 위치는 재배치에 안 묶는다) accept 시도
    let r = s.receiving!
    while (r.queue[r.index].kind !== 'STEMI') r = decide(r, false)
    const afterStemi = decide(r, true)
    expect(afterStemi.log[afterStemi.log.length - 1].disposition).toBe('HARDLOCK_REJECT')
  })
})

// 새 축: 외생 이벤트가 위저드 전에 세계(채용 경제)를 재구성한다.
// LANDING → WORLD_EVENT → SETUP. 판정 불변 원칙은 그대로 — 이벤트는 departments만 만진다.
describe('WORLD_EVENT — 외생 이벤트가 위저드 전에 세계를 재구성한다', () => {
  it('enterWorldEvent: LANDING → WORLD_EVENT, 개원 재정중립 패키지가 세계에 확정된다', () => {
    const s = enterWorldEvent(startSession())
    expect(s.phase).toBe('WORLD_EVENT')
    const cardio = s.world!.departments.find((d) => d.key === 'CARDIOLOGY')!
    expect(cardio.profitPerDoctorBillions).toBe(-6) // 개혁 본체(-12 → -6)
    expect(s.event!.direction).toBe('improve')
  })

  it('enterWorldEvent: 개원 패키지는 산부를 안 건드리고 검사(검진)에서 상쇄한다 (검진 +34)', () => {
    const s = enterWorldEvent(startSession())
    const checkup = s.world!.departments.find((d) => d.key === 'CHECKUP')!
    const ob = s.world!.departments.find((d) => d.key === 'OBSTETRICS')!
    expect(checkup.profitPerDoctorBillions).toBe(34) // 40 - 6 (재원 상쇄)
    expect(ob.profitPerDoctorBillions).toBe(-10) // 불변
  })

  it('LANDING이 아니면 enterWorldEvent 에러(가드)', () => {
    expect(() => enterWorldEvent(completeSetup(collaborator))).toThrow()
  })

  it('beginSetup은 WORLD_EVENT에서도 SETUP으로 가며 world를 보존한다', () => {
    const s = beginSetup(enterWorldEvent(startSession()))
    expect(s.phase).toBe('SETUP')
    expect(s.world!.departments.find((d) => d.key === 'CARDIOLOGY')!.profitPerDoctorBillions).toBe(-6)
  })

  it('completeSetup은 세계(이벤트 적용본)의 경제를 병원에 반영한다', () => {
    const world = applyEvent(initWorld(), OPENING_EVENT) // 순환기 -6
    const s = completeSetup(conscientious, world)
    const cardioSeg = s.hospital!.economics!.segments.find((seg) => seg.label === '순환기내과')!
    expect(cardioSeg.profitBillions).toBe(-6 * 2) // 기본 세계였다면 -24
  })

  it('completeSetup: 개원 패키지 세계에서 검진을 뽑으면 economics에 +34가 반영된다', () => {
    const world = applyEvent(initWorld(), OPENING_EVENT) // 검진 +34
    const s = completeSetup({ hospitalName: '검진병원', doctors: { CHECKUP: 1 } }, world)
    const seg = s.hospital!.economics!.segments.find((x) => x.label === '건강검진')!
    expect(seg.profitBillions).toBe(34) // 검사 과보상 인하가 장부에 반영(34 * 1)
  })

  it('completeSetup을 world 없이 부르면 기본 세계 — 기존 흐름 무변경(하위호환)', () => {
    const s = completeSetup(conscientious)
    const cardioSeg = s.hospital!.economics!.segments.find((seg) => seg.label === '순환기내과')!
    expect(cardioSeg.profitBillions).toBe(-12 * 2) // 기본 -24
  })
})

// 주 반복 루프 — 한 주로 끝나지 않고 사용자가 종료할 때까지 계속된다.
// 7일차 DAY_END → completeWeek → WEEK_SUMMARY →(nextWeek: 새 세계 이벤트, 같은 병원) 또는 (endGame: EPILOGUE).
// 세계 변화는 주마다 누적되고, 에필로그는 그때까지의 모든 주를 합산한다.
describe('주 반복 루프 — WEEK_SUMMARY와 주 경계 전이', () => {
  it('completeWeek: 7일차 DAY_END → WEEK_SUMMARY, 이번 주가 history에 누적된다', () => {
    const ws = finishWeek(runWeek(collaborator, false))
    expect(ws.phase).toBe('WEEK_SUMMARY')
    expect(ws.week).toBe(1)
    expect(ws.history).toHaveLength(DAYS_PER_WEEK) // 이번 주 7일이 통째로 history로
    expect(ws.ledgerDays).toHaveLength(DAYS_PER_WEEK) // 요약 화면용으로 이번 주 달력은 남는다
  })

  it('7일차가 아닌 DAY_END에서 completeWeek 에러(가드)', () => {
    const midWeek = completeReceiving(runDay(completeSetup(collaborator), true)) // 1일차 DAY_END
    expect(midWeek.phase).toBe('DAY_END')
    expect(() => completeWeek(midWeek)).toThrow() // day < 7 → 아직 주가 안 끝났다
  })

  it('nextWeek: WEEK_SUMMARY → WORLD_EVENT, 주차 증가·달력 리셋·병원 유지', () => {
    const nw = nextWeek(finishWeek(runWeek(conscientious, essentialFirst)))
    expect(nw.phase).toBe('WORLD_EVENT')
    expect(nw.week).toBe(2)
    expect(nw.day).toBe(1)
    expect(nw.ledgerDays).toEqual([]) // 새 주 달력은 빈칸에서 시작
    expect(nw.hospital!.name).toBe('양심병원') // 재설립 없이 같은 병원
    expect(nw.history).toHaveLength(DAYS_PER_WEEK) // 지난 주는 history에 보존
  })

  it('nextWeek는 세계를 누적한다 — 2주차 이벤트가 1주차 개선 위에 쌓인다', () => {
    // 실제 흐름으로 1주차 개원(개선 이벤트가 세계에 적용된 상태) → 완주 → 다음 주.
    const setup = beginSetup(enterWorldEvent(startSession()))
    const ws1 = finishWeek(runWeekFrom(completeSetup(conscientious, setup.world), essentialFirst))
    const nw = nextWeek(ws1)
    expect(nw.event!.direction).toBe('improve') // week2 = selectEvent(1) = SURGERY_ADD_ON(개선)
    const cardio = nw.world!.departments.find((d) => d.key === 'CARDIOLOGY')!
    expect(cardio.profitPerDoctorBillions).toBe(-6) // 1주차 개선(-12→-6)이 그대로 보존된다
    const thoracic = nw.world!.departments.find((d) => d.key === 'THORACIC_SURGERY')!
    expect(thoracic.profitPerDoctorBillions).toBe(-9) // 2주차 흉부외과 가산(-15→-9)이 그 위에 쌓인다
  })

  it('beginWeek: WORLD_EVENT(병원 있음) → RECEIVING, 같은 병원으로 새 주 1일차', () => {
    const wk2 = beginWeek(enterGrowth(nextWeek(finishWeek(runWeek(conscientious, essentialFirst)))))
    expect(wk2.phase).toBe('RECEIVING')
    expect(wk2.day).toBe(1)
    expect(wk2.week).toBe(2)
    expect(wk2.receiving!.index).toBe(0)
    expect(wk2.receiving!.done).toBe(false)
    expect(wk2.hospital!.name).toBe('양심병원')
  })

  it('beginWeek 콜 큐 id는 주마다 고유하다 — 누적 신문 키 충돌 방지', () => {
    const wk2 = beginWeek(enterGrowth(nextWeek(finishWeek(runWeek(conscientious, essentialFirst)))))
    expect(wk2.receiving!.queue[0].id).toBe('d8c1') // 전역 (2-1)*7+1 = 8일차 큐
  })

  it('GROWTH가 아니면 beginWeek 에러(가드) — WORLD_EVENT에서 직접 호출', () => {
    expect(() => beginWeek(nextWeek(finishWeek(runWeek(conscientious, essentialFirst))))).toThrow()
  })

  it('병원이 없으면 beginWeek 에러(가드)', () => {
    expect(() => beginWeek({ ...enterWorldEvent(startSession()), phase: 'GROWTH' })).toThrow()
  })

  it('WEEK_SUMMARY가 아니면 nextWeek·endGame 에러(가드)', () => {
    const dayEnd = runWeek(collaborator) // 7일차 DAY_END(아직 결산 전)
    expect(() => nextWeek(dayEnd)).toThrow()
    expect(() => endGame(dayEnd)).toThrow()
  })

  it('endGame: WEEK_SUMMARY → EPILOGUE', () => {
    expect(endGame(finishWeek(runWeek(collaborator, false))).phase).toBe('EPILOGUE')
  })

  it('[누적] history는 완주한 모든 주를 보존한다 — 2주 플레이 후 14일', () => {
    const w1 = finishWeek(runWeek(collaborator, false))
    expect(w1.history).toHaveLength(DAYS_PER_WEEK)
    const w2 = finishWeek(runWeekFrom(beginWeek(enterGrowth(nextWeek(w1))), false))
    expect(w2.history).toHaveLength(DAYS_PER_WEEK * 2)
    expect(w2.week).toBe(2)
  })

  it('[누적] 누적 순손익은 주가 쌓일수록 커진다 — 매주 결산 화면의 "지금까지"', () => {
    const w1 = finishWeek(runWeek(collaborator, true)) // 미용 흑자 루트
    const net1 = cumulativeNetBillions(w1)
    const w2 = finishWeek(runWeekFrom(beginWeek(enterGrowth(nextWeek(w1))), true))
    const net2 = cumulativeNetBillions(w2)
    expect(net1).toBeGreaterThan(0)
    expect(net2).toBe(net1 * 2) // 같은 병원·방침 두 주 → 정확히 두 배(결정론)
  })

  it('[에필로그] 여러 주 플레이해도 최종 주 결산을 보고한다 — 구조 손익 1주치·내부 일관', () => {
    // 2주 플레이 → 종료. 장부는 최종 주 기준(구조 손익 ×N 스케일 문제를 피하는 알려진 단순화).
    const w2 = finishWeek(runWeekFrom(beginWeek(enterGrowth(nextWeek(finishWeek(runWeek(collaborator, false))))), false))
    const epi = buildEpilogue(endGame(w2))
    const finalWeekAway = w2.ledgerDays.reduce((n, d) => n + d.turnedAway.length, 0)
    expect(epi.weekNews.length).toBe(finalWeekAway) // 최종 주 신문만(누적 아님)
    expect(new Set(epi.weekNews.map((n) => n.id)).size).toBe(epi.weekNews.length) // id 충돌 없음
    expect(epi.ledger!.essentialHires).toBe(0) // collaborator
  })
})

describe('피로 누적 — 표시 레이어(판정 무관)', () => {
  it('startSession/completeSetup은 피로 0에서 시작한다', () => {
    expect(startSession().fatigue).toEqual({})
    const s = completeSetup(conscientious)
    expect(s.fatigue).toEqual({})
  })

  it('순환기가 STEMI를 받은 날 마감 후 그 유닛 피로가 오른다', () => {
    let s = completeSetup(conscientious) // AESTHETICS:1, CARDIOLOGY:2
    s = runDay(s, (call) => call.kind === 'STEMI') // 월: STEMI 수용
    s = completeReceiving(s)
    const cardioIds = s.hospital!.roster!.filter((d) => d.dept === 'CARDIOLOGY').map((d) => d.id)
    expect(cardioIds.some((id) => (s.fatigue[id] ?? 0) > 0)).toBe(true)
  })

  it('주가 넘어가도 피로가 리셋되지 않는다(nextWeek 이월)', () => {
    let s = completeSetup(conscientious)
    s = runWeekFrom(s, (call) => call.kind === 'STEMI') // 7일차 DAY_END
    s = completeWeek(s)
    const before = { ...s.fatigue }
    s = nextWeek(s)
    expect(s.fatigue).toEqual(before) // 이월(변경 없음)
  })
})

describe('성장 상태 — 개원 보존 + 금고', () => {
  const choices = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } } // 채용비 10+60=70

  it('completeSetup이 choices·beds·treasury·system을 보존한다', () => {
    const s = completeSetup(choices)
    expect(s.choices).toEqual(choices)
    expect(s.beds).toBe(3)
    expect(s.treasury).toBe(SETUP_BUDGET_BILLIONS - 70) // 개원 잔액
    expect(s.system.pool).toEqual(POOL_INITIAL)
  })

  it('completeWeek이 이번 주 순이익을 금고에 더한다', () => {
    let s = completeSetup(choices)
    s = { ...s, phase: 'DAY_END', day: 7,
      ledgerDays: [{ day: 7, netProfitBillions: 40, segmentShareBillions: 0, callDeltaBillions: 0,
        workupRevenueBillions: 0, workupCount: 0, turnedAway: [], receivedEmergency: 0, accepted: 0,
        blocked: 0, lawsuitExposure: 0 }] }
    const before = s.treasury
    const after = completeWeek(s)
    expect(after.treasury).toBe(before + 40)
  })
})

describe('GROWTH — 재투자 적용', () => {
  // 금고 넉넉한 상태를 만든다(2주차 진입 흉내)
  function grown() {
    let s = completeSetup({ hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 1 } })
    s = { ...s, treasury: 200, phase: 'GROWTH', week: 2 }
    return s
  }

  it('성장 비용 = 채용 증분 + 병상 증설', () => {
    const s = grown() // 현재 순환기1, beds 3
    const next = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }
    expect(growthCostOf(s, next, 5)).toBe(30 + 60) // 순환기 1명(30) + 병상 3→5(60)
  })

  it('applyGrowth: 병원 재구성 + 금고·풀 차감 + choices 갱신', () => {
    const s = grown()
    const next = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }
    const after = applyGrowth(s, next, 5)
    expect(after.beds).toBe(5)
    expect(after.choices).toEqual(next)
    expect(after.treasury).toBe(200 - 90)
    expect(after.hospital!.roster!.filter((d) => d.dept === 'CARDIOLOGY')).toHaveLength(2)
    expect(after.system.pool.CARDIOLOGY).toBe(POOL_INITIAL.CARDIOLOGY - 1) // 증분 1만 차감
    expect(after.hospital!.roundTheClockBackup).toContain('CARDIOLOGY') // 2명 → 24h
  })

  it('풀 소진 과는 성장 불가(돈 있어도)', () => {
    let s = grown()
    s = { ...s, system: { ...s.system, pool: { ...s.system.pool, CARDIOLOGY: 1 } } }
    const next = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 3 } } // +2 필요, 잔여 1
    expect(canApplyGrowth(s, next, 3)).toBe(false)
  })

  it('금고 초과 성장 불가', () => {
    const s = { ...grown(), treasury: 20 }
    const next = { hospitalName: '한바다', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } } // 30억 필요
    expect(canApplyGrowth(s, next, 3)).toBe(false)
  })

  it('해고(증분 음수)는 불가', () => {
    const s = grown()
    const next = { hospitalName: '한바다', doctors: { CARDIOLOGY: 0 } }
    expect(canApplyGrowth(s, next, 3)).toBe(false)
  })

  it('enterGrowth: WORLD_EVENT(병원 있음) → GROWTH', () => {
    let s = completeSetup({ hospitalName: '한바다', doctors: { AESTHETICS: 1 } })
    s = { ...s, phase: 'WORLD_EVENT', week: 2 }
    expect(enterGrowth(s).phase).toBe('GROWTH')
  })

  it('beginWeek: GROWTH → RECEIVING(같은 병원)', () => {
    const s = { ...grown(), phase: 'GROWTH' as const }
    expect(beginWeek(s).phase).toBe('RECEIVING')
  })

  it('nextWeek이 배경 풀 감소를 적용한다', () => {
    let s = completeSetup({ hospitalName: '한바다', doctors: { AESTHETICS: 1 } })
    s = { ...s, phase: 'WEEK_SUMMARY' }
    const before = Object.values(s.system.pool).reduce((a, b) => a + b, 0)
    const after = nextWeek(s)
    const total = Object.values(after.system.pool).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThan(before)
  })
})
