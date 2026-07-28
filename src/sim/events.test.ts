import { describe, it, expect } from 'vitest'
import { createWorld, type SimWorld } from './world'
import { placeRoom } from './build'
import { tick } from './tick'
import { DAYS_PER_WEEK, freshMorning, startNextDay } from './day'
import { startNextWeek } from './week'
import { EMERGENCY_WINDOW_MIN, emergencyArrivalAt, emergencyArrivalSeed } from './emergency'
import { ARRIVAL_WINDOW_MIN, arrivalSeed, wantsDeptSeed } from './patientFlow'
import type { SimDeptKey } from './dept'
import { EVENT_KINDS, LAWSUIT_COST_MANWON, applyEvent, type SimEventKind } from './events'
import {
  EVENT_MIX, EVENT_PROB_PER_DAY,
  eligibleEvents, eventKindSeed, eventRollSeed, fallbackDirectorChoice, pickEventKind,
} from './director'

/** ⚠️ 이 파일은 **이벤트 엔진의 계약**을 잰다: 전제(가드레일) · 효과(배율이 판정식에 실제로
 *  곱해지는가) · 폴백 디렉터의 결정론과 불발. 배율은 판정식을 손으로 다시 쓰지 않고
 *  **실제 경로**(tick의 도착 · emergencyArrivalAt)로 잰다 — 공식을 테스트에 복제하면 훅을
 *  통째로 떼어내도 테스트는 초록으로 남는다(그 변조가 이 파일의 계측 대상이다). */

const WARD = { type: 'WARD' as const, x: 30, y: 20, w: 4, h: 4 }
/** 넉넉한 대기실 — 좌석 부족으로 도착이 막히면 배율 측정이 좌석 수를 재게 된다.
 *  16×11의 내부는 14×9라 자동 배치가 의자 35개를 놓는다(EPIDEMIC 정상 상태 대기 인원의 두 배 밖). */
const BIG_WAITING = { type: 'WAITING' as const, x: 2, y: 2, w: 16, h: 11 }

function place(w: SimWorld, spec: Parameters<typeof placeRoom>[1]): SimWorld {
  const r = placeRoom(w, spec)
  if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
  return r.world
}

/** 전 종류가 전제를 통과하는 세계 — 2주차 · 병동 있음 · 회차 1건. */
function richWorld(seed = 5): SimWorld {
  return { ...place(createWorld(seed), WARD), week: 2, turnedAwayTotal: 1 }
}

/** 외래만 관측되는 세계 — 병동이 없어 응급은 전부 되돌아가고 폰조차 안 생긴다.
 *  그래서 `nextId`의 증가분은 **전부 외래 도착**이다. 의사도 없어 진료가 없고, 환자는
 *  인내(90분)를 넘기면 떠나 좌석을 비운다. */
function clinicWorld(seed = 5): SimWorld {
  return place(createWorld(seed), BIG_WAITING)
}

/** 하루치 외래 도착 — 도착 창(0..479) 동안 실제로 세워진 환자 폰을 센다. */
function arrivalsOf(w0: SimWorld, days = 3) {
  let total = 0
  const dept = new Map<SimDeptKey, number>()
  for (let day = 1; day <= days; day++) {
    let w: SimWorld = { ...w0, day, minute: 0 }
    const before = w.nextId
    const seen = new Map<string, SimDeptKey>()
    for (let i = 0; i < ARRIVAL_WINDOW_MIN - 1; i++) {
      w = tick(w, 1)
      for (const p of w.pawns) if (p.kind === 'PATIENT' && p.wantsDept) seen.set(p.id, p.wantsDept)
    }
    // 계측기 자기검사 — 매 분 훑으므로 태어난 환자는 하나도 못 보고 지나칠 수 없다.
    expect(seen.size).toBe(w.nextId - before)
    total += w.nextId - before
    for (const d of seen.values()) dept.set(d, (dept.get(d) ?? 0) + 1)
  }
  return { total, internalShare: (dept.get('INTERNAL_MEDICINE') ?? 0) / total }
}

/** 12주 × 7일 × 도착 창 전수에서 응급 판정이 성립한 분의 수. */
function emergencyHits(w0: SimWorld): number {
  let n = 0
  for (let week = 1; week <= 12; week++) {
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      for (let minute = 0; minute < EMERGENCY_WINDOW_MIN; minute++) {
        if (emergencyArrivalAt({ ...w0, week, day, minute })) n++
      }
    }
  }
  return n
}

describe('applyEvent — 전제와 효과', () => {
  it('전제를 어긴 이벤트는 던진다 — 배선 버그를 잡는 가드', () => {
    // 정상 흐름에선 파싱 층이 eligibleEvents로 먼저 거르므로 여기 도달할 수 없다.
    // 던지지 않고 조용히 붙이면 병상 0인 병원에 대량 응급이 떨어지는(불공정 조합) 판이 선다.
    expect(() => applyEvent({ ...createWorld(1), week: 2 }, 'MASS_CASUALTY')).toThrow()  // 병동 없음
    expect(() => applyEvent(place(createWorld(1), WARD), 'MASS_CASUALTY')).toThrow()      // 1주차 유예
    expect(() => applyEvent(createWorld(1), 'LAWSUIT')).toThrow()                          // 회차 0건
  })

  it('전제 없는 이벤트는 어느 세계에나 붙는다', () => {
    const w = createWorld(1)
    expect(applyEvent(w, 'EPIDEMIC').event).toEqual({ kind: 'EPIDEMIC' })
    expect(applyEvent(w, 'NEARBY_CLOSURE').event).toEqual({ kind: 'NEARBY_CLOSURE' })
  })

  it('순수 함수다 — 입력 세계는 스치지도 않는다', () => {
    const w = richWorld()
    const before = w.treasuryManwon
    applyEvent(w, 'LAWSUIT')
    expect(w.event).toBeUndefined()
    expect(w.treasuryManwon).toBe(before)
  })

  it('LAWSUIT은 회차가 있어야 오고, 오면 그 자리에서 금고가 깎인다', () => {
    const w0 = createWorld(1)
    expect(w0.turnedAwayTotal).toBe(0)
    const w1 = { ...w0, turnedAwayTotal: 1 }
    const after = applyEvent(w1, 'LAWSUIT')
    expect(after.treasuryManwon).toBe(w1.treasuryManwon - LAWSUIT_COST_MANWON)
    expect(after.event).toEqual({ kind: 'LAWSUIT' })
  })

  it('LAWSUIT 말고는 금고를 건드리지 않는다 — 나머지는 배율로만 아프다', () => {
    const w = richWorld()
    for (const kind of EVENT_KINDS) {
      if (kind === 'LAWSUIT') continue
      expect(applyEvent(w, kind).treasuryManwon).toBe(w.treasuryManwon)
    }
  })
})

describe('이벤트 효과 — 배율이 판정식에 실제로 곱해진다', () => {
  it('MASS_CASUALTY 날은 응급 판정이 3배로 성립한다', () => {
    const base = richWorld()
    const plain = emergencyHits(base)
    const surge = emergencyHits(applyEvent(base, 'MASS_CASUALTY'))
    expect(plain).toBeGreaterThan(200) // 계측기가 헛돌지 않았다
    expect(surge / plain).toBeGreaterThan(2.7)
    expect(surge / plain).toBeLessThan(3.3)
  })

  it('EPIDEMIC 날은 외래 도착이 1.6배이고 내과로 몰린다', () => {
    const plain = arrivalsOf(clinicWorld())
    const epidemic = arrivalsOf(applyEvent(clinicWorld(), 'EPIDEMIC'))
    expect(plain.total).toBeGreaterThan(100) // 계측기 자기검사
    expect(epidemic.total / plain.total).toBeGreaterThan(1.4)
    expect(epidemic.total / plain.total).toBeLessThan(1.8)
    // 믹스 교체 — 평일 내과 45%가 75% 근처로 올라간다(누적 상한 표의 첫 구간).
    expect(plain.internalShare).toBeLessThan(0.60)
    expect(epidemic.internalShare).toBeGreaterThan(0.65)
  })

  it('NEARBY_CLOSURE 날은 외래 도착이 1.4배다 — 믹스는 그대로', () => {
    const plain = arrivalsOf(clinicWorld())
    const closure = arrivalsOf(applyEvent(clinicWorld(), 'NEARBY_CLOSURE'))
    expect(closure.total / plain.total).toBeGreaterThan(1.25)
    expect(closure.total / plain.total).toBeLessThan(1.6)
    expect(closure.internalShare).toBeLessThan(0.60)
  })

  it('배율은 **시드가 아니라 문턱**을 곱한다 — 평일 도착이 이벤트 날의 부분집합으로 남는다', () => {
    // 시드 쪽을 흔들어 확률을 올리는 구현도 "1.6배"를 만족한다. 그러나 그러면 이벤트 유무가
    // 도착 **시각의 배열 자체**를 바꿔, 평일에 오던 환자가 이벤트 날엔 안 온다 — 기존 결정론
    // 테스트가 이벤트 없는 날만 재므로 그 변조는 어디에도 안 걸린다. 부분집합이 그 구별점이다.
    const base = richWorld()
    const minutesOf = (w: SimWorld) => {
      const out = new Set<string>()
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        for (let minute = 0; minute < EMERGENCY_WINDOW_MIN; minute++) {
          if (emergencyArrivalAt({ ...w, day, minute })) out.add(`${day}:${minute}`)
        }
      }
      return out
    }
    const plain = minutesOf(base)
    const surge = minutesOf(applyEvent(base, 'MASS_CASUALTY'))
    expect(plain.size).toBeGreaterThan(10)      // 계측기 자기검사
    expect(surge.size).toBeGreaterThan(plain.size)
    expect([...plain].filter(m => !surge.has(m))).toEqual([])
  })
})

describe('freshMorning — 이벤트는 그날 하루뿐', () => {
  it('아침이 어제의 이벤트를 지운다', () => {
    const yesterday = applyEvent(createWorld(1), 'EPIDEMIC')
    expect(yesterday.event).toBeDefined() // 전제
    expect(freshMorning(yesterday).event).toBeUndefined()
    // 필드가 undefined로 남는 게 아니라 **없어야** 한다 — 직렬화·구조 비교가 갈리지 않도록.
    expect('event' in freshMorning(yesterday)).toBe(false)
  })

  it('다음 날 전이(startNextDay)도 같은 아침을 연다', () => {
    const w = applyEvent({ ...createWorld(1), phase: 'DAY_END' as const }, 'NEARBY_CLOSURE')
    expect(startNextDay(w).event).toBeUndefined()
  })
})

describe('turnedAwayTotal — 판 누적 회차', () => {
  it('돌려보낸 응급이 카운터를 올린다 — 하루 집계와 나란히 간다', () => {
    // 병동도 의사도 없는 병원 — 오는 응급은 전부 NO_SPECIALIST로 되돌아간다.
    let w = clinicWorld(4)
    expect(w.turnedAwayTotal).toBe(0)
    for (let i = 0; i < ARRIVAL_WINDOW_MIN - 1; i++) w = tick(w, 1)
    expect(w.stats.emergencyTurnedAway.length).toBeGreaterThan(0) // 계측기 자기검사
    expect(w.turnedAwayTotal).toBe(w.stats.emergencyTurnedAway.length)
  })

  it('주를 넘겨도 유지된다 — 하루·주 리셋이 있는 stats와 다른 축이다', () => {
    const w: SimWorld = {
      ...createWorld(1), phase: 'WEEK_END', weekSettled: true, turnedAwayTotal: 5,
      stats: { ...createWorld(1).stats, emergencyTurnedAway: [{ kind: 'STEMI', reason: 'NO_BED' }] },
    }
    const next = startNextWeek(w)
    expect(next.turnedAwayTotal).toBe(5)
    expect(next.stats.emergencyTurnedAway).toEqual([]) // 대조 — 이쪽은 비워진다
  })
})

describe('eligibleEvents — 코드가 확정하는 가드레일', () => {
  it('전제가 안 선 종류는 후보에 없다', () => {
    const bare = createWorld(1) // 1주차 · 병동 없음 · 회차 0
    expect(eligibleEvents(bare)).toEqual(['EPIDEMIC', 'NEARBY_CLOSURE'])
    expect(eligibleEvents(richWorld()).slice().sort()).toEqual(EVENT_KINDS.slice().sort())
  })

  it('MASS_CASUALTY는 두 전제를 **둘 다** 요구한다 — 하나만으로는 안 선다', () => {
    const seed = createWorld(1)
    expect(eligibleEvents({ ...seed, week: 2 })).not.toContain('MASS_CASUALTY')       // 병동 없음
    expect(eligibleEvents(place(seed, WARD))).not.toContain('MASS_CASUALTY')          // 1주차
    expect(eligibleEvents({ ...place(seed, WARD), week: 2 })).toContain('MASS_CASUALTY')
  })

  it('후보 판정과 applyEvent의 전제는 **같은 하나**다', () => {
    // 두 곳에 각자 적으면 후보엔 있는데 적용은 던지는(또는 그 반대의) 조합이 생긴다.
    for (const w of [createWorld(1), place(createWorld(1), WARD), richWorld()]) {
      const ok = eligibleEvents(w)
      for (const kind of EVENT_KINDS) {
        if (ok.includes(kind)) expect(() => applyEvent(w, kind)).not.toThrow()
        else expect(() => applyEvent(w, kind)).toThrow()
      }
    }
  })
})

describe('폴백 디렉터 — 시드 결정론 가중 랜덤', () => {
  /** 그 세계의 12주 × 7일 이벤트 달력. */
  function calendar(w0: SimWorld): Array<SimEventKind | null> {
    const out: Array<SimEventKind | null> = []
    for (let week = 1; week <= 12; week++) {
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        out.push(fallbackDirectorChoice({ ...w0, week: Math.max(week, w0.week), day, minute: 0 }))
      }
    }
    return out
  }

  it('같은 (판·주·날)이면 같은 선택이다', () => {
    const w = { ...richWorld(), week: 3, day: 4, minute: 0 }
    expect(fallbackDirectorChoice(w)).toBe(fallbackDirectorChoice({ ...w }))
    expect(calendar(richWorld(5))).toEqual(calendar(richWorld(5)))
  })

  it('**minute 0 세계에서만** 부를 수 있다 — 아침 전이 직후가 그 자리다', () => {
    // minuteStreamSeed는 분을 더하므로, 하루 중간에 부르면 조용히 다른 이벤트가 나온다.
    // 던지지 않으면 그 배선 실수가 "그날 이벤트가 좀 달랐다"로만 나타나 아무도 못 잡는다.
    expect(() => fallbackDirectorChoice({ ...richWorld(), minute: 1 })).toThrow()
    expect(() => fallbackDirectorChoice({ ...richWorld(), minute: 0 })).not.toThrow()
  })

  it('판이 다르면 이벤트 달력도 다르다', () => {
    expect(calendar(richWorld(3))).not.toEqual(calendar(richWorld(4)))
  })

  it('전 종류가 가능한 세계에서 발생률이 EVENT_PROB_PER_DAY에 붙는다', () => {
    const days = calendar(richWorld(5))
    const rate = days.filter(k => k !== null).length / days.length
    expect(rate).toBeGreaterThan(EVENT_PROB_PER_DAY - 0.1)
    expect(rate).toBeLessThan(EVENT_PROB_PER_DAY + 0.1)
    // 한 종류로 쏠리지 않는다 — 누적 상한 표가 실제로 갈린다
    expect(new Set(days.filter(k => k !== null)).size).toBeGreaterThan(2)
  })

  it('전제 미달 종류가 뽑히면 **그날은 이벤트가 없다** — 재추첨하지 않는다', () => {
    // 재추첨은 "전제 미달이 다른 이벤트의 확률을 올리는" 커플링을 만든다: 병동을 안 지은
    // 병원일수록 전염병이 잦아지는 식으로, 아무도 의도하지 않은 인과가 생긴다.
    const rich = richWorld(5)
    const hit = (() => {
      for (let week = 2; week <= 12; week++) {
        for (let day = 1; day <= DAYS_PER_WEEK; day++) {
          const w = { ...rich, week, day, minute: 0 }
          if (fallbackDirectorChoice(w) === 'MASS_CASUALTY') return { week, day }
        }
      }
      return null
    })()
    expect(hit).not.toBeNull() // 전제: MASS_CASUALTY가 실제로 뽑히는 날이 있다
    // 같은 판·같은 날인데 병동만 없는 세계 — 같은 추첨이 나오고, 그것이 전제 미달이라 불발이다.
    // 재추첨한다면 언제나 가능한 EPIDEMIC·NEARBY_CLOSURE 중 하나가 나와 null이 아니게 된다.
    const noWard: SimWorld = { ...createWorld(5), ...hit!, minute: 0, turnedAwayTotal: 1 }
    expect(eligibleEvents(noWard)).not.toContain('MASS_CASUALTY') // 전제 확인
    expect(fallbackDirectorChoice(noWard)).toBeNull()
  })

  it('LAWSUIT도 같은 불발 규칙을 받는다 — 회차 0이면 그날은 조용하다', () => {
    const rich = richWorld(5)
    const hit = (() => {
      for (let week = 2; week <= 12; week++) {
        for (let day = 1; day <= DAYS_PER_WEEK; day++) {
          if (fallbackDirectorChoice({ ...rich, week, day, minute: 0 }) === 'LAWSUIT') {
            return { week, day }
          }
        }
      }
      return null
    })()
    expect(hit).not.toBeNull()
    expect(fallbackDirectorChoice({ ...rich, ...hit!, minute: 0, turnedAwayTotal: 0 })).toBeNull()
  })

  it('종류 표는 누적 상한이고 치역 밖이면 던진다', () => {
    expect(EVENT_MIX[EVENT_MIX.length - 1][1]).toBe(1) // 마지막 값 1.00 = "합계 1" 검사
    expect(pickEventKind(0)).toBe(EVENT_MIX[0][0])
    expect(pickEventKind(0.999999)).toBe(EVENT_MIX[EVENT_MIX.length - 1][0])
    expect(() => pickEventKind(1)).toThrow()
    expect(() => pickEventKind(-0.1)).toThrow()
  })

  it('이벤트 스트림은 도착·희망 과·응급과 **다른 축**이다 — 시드 집합이 겹치지 않는다', () => {
    // salt를 재사용하면 두 스트림이 통째로 같아진다: 이벤트가 발생하는 날은 정의상
    // seededUnit < 0.25인 날이라, 그 salt를 공유한 스트림의 그날 첫 분이 통째로 편향된다.
    // 한 점만 비교하면 "그 점만 피하는" 오프셋도 통과하므로 전수 집합 교집합으로 잰다.
    const w0 = createWorld(7)
    const others = new Set<number>()
    const events = new Set<number>()
    for (let week = 1; week <= 8; week++) {
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        events.add(eventRollSeed({ ...w0, week, day, minute: 0 }))
        events.add(eventKindSeed({ ...w0, week, day, minute: 0 }))
        for (let minute = 0; minute < ARRIVAL_WINDOW_MIN; minute++) {
          others.add(arrivalSeed({ ...w0, week, day, minute }))
          others.add(wantsDeptSeed({ ...w0, week, day, minute }))
          others.add(emergencyArrivalSeed({ ...w0, week, day, minute }))
        }
      }
    }
    expect(events.size).toBe(2 * 8 * DAYS_PER_WEEK)                  // 계측기 자기검사
    expect(others.size).toBe(3 * 8 * DAYS_PER_WEEK * ARRIVAL_WINDOW_MIN)
    expect([...events].filter(s => others.has(s))).toEqual([])
  })
})
