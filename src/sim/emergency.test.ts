import { describe, it, expect } from 'vitest'
import { createWorld, INITIAL_TREASURY_MANWON, type SimWorld } from './world'
import { placeRoom } from './build'
import { hireDoctor, type Pawn } from './pawn'
import { buildBlockedSet } from './path'
import { tick } from './tick'
import { DAY_END_MIN, DAYS_PER_WEEK, settleDay } from './day'
import { deptRevenueSum, simDept, type SimDeptKey } from './dept'
import { ARRIVAL_WINDOW_MIN, arrivalSeed, wantsDeptSeed } from './patientFlow'
import { seededUnit } from '../game/daysim'
import {
  EMERGENCIES, EMERGENCY_KIND_MIX, EMERGENCY_PROB_PER_MIN, EMERGENCY_WINDOW_MIN,
  emergencyArrivalAt, emergencyArrivalSeed, emergencyKindSeed, emergencySpec,
  freeBed, pickEmergencyKind, wardBeds,
  type EmergencyKind,
} from './emergency'

const STEMI = EMERGENCIES.STEMI
const ACUTE = EMERGENCIES.ACUTE_ABDOMEN

/** 도착 창 경계(480분)에 **응급 판정이 실제로 통과하는** 세계 시드. 경계 테스트는 이 조건이
 *  없으면 계측력이 0이다(T-085 ①) — 그래서 시드를 손으로 골라 두고, 그 사실을 테스트 안에서
 *  전제 단언으로 다시 확인한다(시드가 조용히 공허해지는 것 방지). */
const EMERGENCY_DUSK_SEED = 88

/** 하루(1주 1일)에 **두 종류가 다 오는** 세계 시드. 시드마다 그날의 응급 종류가 갈려서
 *  (실측: 시드 3의 1일차는 6건 전부 급성복증) 아무 시드나 쓰면 STEMI를 겨눈 테스트가
 *  "전제 실패"로 죽거나, 더 나쁘게는 한 종류만 도는 세계를 재게 된다. */
const BOTH_KINDS_SEED = 4

/** 침대 1개짜리 병동 — 수용 한도를 1로 고정해 "다음 응급은 NO_BED"가 관측된다.
 *  4×4의 내부는 2×2라 자동 배치가 침대를 하나만 놓는다(build.autoFurniture의 한 칸 걸러 규칙). */
const WARD_1BED = { type: 'WARD' as const, x: 30, y: 20, w: 4, h: 4 }

function place(w: SimWorld, spec: Parameters<typeof placeRoom>[1]): SimWorld {
  const r = placeRoom(w, spec)
  if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
  return r.world
}

/** 응급만 관측되는 최소 병원. **대기실이 없어 외래는 폰조차 생기지 않는다**(문전박대) —
 *  그래서 이 세계의 금고·집계 변화는 전부 응급이 만든 것이다. */
function emergencyWorld(
  { seed = BOTH_KINDS_SEED, dept = 'CARDIOLOGY' as SimDeptKey | null, ward = true } = {},
): SimWorld {
  let w = createWorld(seed)
  if (ward) w = place(w, WARD_1BED)
  if (dept) w = hireDoctor(w, dept)
  return w
}

const run = (w: SimWorld, minutes: number) => {
  for (let i = 0; i < minutes; i++) w = tick(w, 1)
  return w
}

/** 조건이 참이 될 때까지 1분씩 — 전제가 성립 안 하면 조용히 통과하지 말고 터진다 */
function until(w: SimWorld, pred: (w: SimWorld) => boolean, limit = 200) {
  for (let i = 0; i < limit; i++) {
    if (pred(w)) return w
    w = tick(w, 1)
  }
  throw new Error('전제 실패 — 기다린 상태가 오지 않았다')
}

/** 그 종류의 응급이 **처음 오는 분**. 판정식을 테스트가 손으로 다시 쓰지 않도록
 *  구현(emergencyArrivalAt)을 불러 찾는다 — 공식을 복제하면 한쪽이 조용히 낡는다(T-085). */
function firstEmergencyMin(w0: SimWorld, kind: EmergencyKind, from = 1): number {
  for (let minute = from; minute < EMERGENCY_WINDOW_MIN; minute++) {
    if (emergencyArrivalAt({ ...w0, minute }) === kind) return minute
  }
  throw new Error(`전제 실패 — 하루 안에 ${kind}가 오지 않는 시드다`)
}

const emergencyPawns = (w: SimWorld) => w.pawns.filter(p => p.emergency)

describe('응급 카탈로그', () => {
  it('두 종류의 배후과·수가·소요가 계획 표 그대로다(값의 단일 출처는 emergency.ts)', () => {
    expect(STEMI).toMatchObject({ dept: 'CARDIOLOGY', revenueManwon: 850, durationMin: 90 })
    expect(ACUTE).toMatchObject({ dept: 'GENERAL_SURGERY', revenueManwon: 300, durationMin: 90 })
    // 응급 수가는 외래 수가와 **다른 축**이다 — 외래 수가로 회귀하면 여기서 걸린다.
    expect(STEMI.revenueManwon).not.toBe(simDept('CARDIOLOGY').examRevenueManwon)
    expect(ACUTE.revenueManwon).not.toBe(simDept('GENERAL_SURGERY').examRevenueManwon)
  })

  it('카탈로그에 없는 종류는 undefined가 아니라 예외다(NaN 수익 방지)', () => {
    expect(() => emergencySpec('SEPSIS' as EmergencyKind)).toThrow()
  })

  it('종류 분포는 50/50 — 경계는 아래가 닫힌다', () => {
    expect(EMERGENCY_KIND_MIX.map(([kind]) => kind)).toEqual(['STEMI', 'ACUTE_ABDOMEN'])
    expect(pickEmergencyKind(0)).toBe('STEMI')
    expect(pickEmergencyKind(0.4999999)).toBe('STEMI')
    expect(pickEmergencyKind(0.5)).toBe('ACUTE_ABDOMEN')      // 50%가 STEMI의 상한(닫힌 쪽)
    expect(pickEmergencyKind(0.9999999)).toBe('ACUTE_ABDOMEN')
    expect(() => pickEmergencyKind(1)).toThrow()
    expect(() => pickEmergencyKind(-0.1)).toThrow()
  })
})

describe('응급 도착 — 스트림 축', () => {
  const everyMinute = <T>(f: (w: SimWorld) => T): T[] => {
    const w0 = createWorld(7)
    const out: T[] = []
    for (let week = 1; week <= 8; week++) {
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        for (let minute = 0; minute < EMERGENCY_WINDOW_MIN; minute++) {
          out.push(f({ ...w0, week, day, minute }))
        }
      }
    }
    return out
  }
  const TUPLES = 8 * DAYS_PER_WEEK * EMERGENCY_WINDOW_MIN

  it(`도착률이 평균 ${1 / EMERGENCY_PROB_PER_MIN}분당 1건에 붙는다`, () => {
    // 자릿수 검사다(외래의 1/8도, 1/1200도 아니다) — 표본 26,880분의 기댓값이 224건이라
    // 우연 변동이 ±15건(1σ)이다. `toBeCloseTo(1/120, 3)`은 그 변동보다 좁아 **정상 시드를
    // 떨어뜨린다**(실측 206건). 그래서 확률값이 아니라 건수를 ±25% 띠로 잰다.
    const expected = TUPLES * EMERGENCY_PROB_PER_MIN
    const hits = everyMinute(w => seededUnit(emergencyArrivalSeed(w)) < EMERGENCY_PROB_PER_MIN)
      .filter(Boolean).length
    expect(hits).toBeGreaterThan(expected * 0.75)
    expect(hits).toBeLessThan(expected * 1.25)
  })

  it('종류 스트림이 50/50에 붙는다 — 표만 맞고 시드가 쏠리면 여기서 걸린다', () => {
    const kinds = everyMinute(w => pickEmergencyKind(seededUnit(emergencyKindSeed(w))))
    const share = (k: EmergencyKind) => kinds.filter(x => x === k).length / TUPLES
    expect(share('STEMI')).toBeCloseTo(0.5, 2)
    expect(share('ACUTE_ABDOMEN')).toBeCloseTo(0.5, 2)
  })

  it('응급의 두 축은 서로도, 외래의 두 축과도 겹치지 않는다(salt 레지스트리)', () => {
    // salt를 나눠 쓰면 두 스트림이 통째로 같아진다 — 예컨대 도착 축과 종류 축이 같으면
    // 응급이 성립한 분은 정의상 seededUnit < 1/120이라 **전부 STEMI**가 된다(50/50 붕괴).
    // 외래 도착과 겹치면 "환자가 온 분에만 응급이 온다"가 되고, 둘 다 에러는 안 난다.
    const arrivalsEmg = new Set(everyMinute(emergencyArrivalSeed))
    const kindsEmg = new Set(everyMinute(emergencyKindSeed))
    const arrivalsPat = new Set(everyMinute(arrivalSeed))
    const wantsPat = new Set(everyMinute(wantsDeptSeed))
    expect(arrivalsEmg.size).toBe(TUPLES) // 계측기가 헛돌지 않았다(응급 도착 축 자체가 전수 고유)
    expect(kindsEmg.size).toBe(TUPLES)    // T-087 — 분이 callSeed의 index 슬롯(폭 97)에 안 들어갔다
    for (const other of [kindsEmg, arrivalsPat, wantsPat]) {
      expect([...arrivalsEmg].filter(s => other.has(s))).toEqual([])
    }
    expect([...kindsEmg].filter(s => arrivalsPat.has(s) || wantsPat.has(s))).toEqual([])
  })

  it('회귀 한 점 — 날이 바뀌면 스트림이 통째로 갈린다(T-087)', () => {
    const w = createWorld(7)
    expect(emergencyArrivalSeed({ ...w, day: 1, minute: 97 }))
      .not.toBe(emergencyArrivalSeed({ ...w, day: 2, minute: 0 }))
    expect(emergencyKindSeed({ ...w, day: 1, minute: 97 }))
      .not.toBe(emergencyKindSeed({ ...w, day: 2, minute: 0 }))
  })

  it(`도착 창이 닫히면 응급도 오지 않는다 — 경계 분(${EMERGENCY_WINDOW_MIN})은 닫힌 쪽이다`, () => {
    // 경계 분에 **판정이 실제로 통과하는 시드**를 골라 전제로 못박는다(T-085 ①) —
    // 아무 시드나 쓰면 그 분의 확률 판정이 애초에 실패해 경계를 열든 닫든 결과가 같다.
    const w0 = emergencyWorld({ seed: EMERGENCY_DUSK_SEED })
    expect(seededUnit(emergencyArrivalSeed({ ...w0, minute: EMERGENCY_WINDOW_MIN })))
      .toBeLessThan(EMERGENCY_PROB_PER_MIN)
    // 기준값 캡처는 경계 **앞**이다(T-085 ②) — 480분까지 돌린 뒤 재면 그 분의 도착이
    // 이미 기준값에 섞여 경계를 틀려도 차이가 0이다.
    let w = run(w0, EMERGENCY_WINDOW_MIN - 1)
    const before = w.stats.emergencyAccepted + w.stats.emergencyTurnedAway.length
    w = run(w, 100) // 480분이 이 구간의 첫 분이다
    expect(w.stats.emergencyAccepted + w.stats.emergencyTurnedAway.length).toBe(before)
  })
})

describe('배후과 벽 — 하드락', () => {
  it('순환기가 0명이면 STEMI는 NO_SPECIALIST로 되돌아간다 — 폰조차 만들지 않는다', () => {
    const w0 = emergencyWorld({ dept: null })          // 병동은 있는데 의사가 없다
    const m = firstEmergencyMin(w0, 'STEMI')
    const w = run(w0, m)
    expect(w.stats.emergencyTurnedAway).toEqual([{ kind: 'STEMI', reason: 'NO_SPECIALIST' }])
    expect(w.stats.emergencyAccepted).toBe(0)
    expect(emergencyPawns(w)).toEqual([])
    expect(w.nextId).toBe(w0.nextId)                   // 문전박대는 폰을 만들지 않는다(1주차 선례)
    expect(w.treasuryManwon).toBe(w0.treasuryManwon)
  })

  it('다른 과 의사가 아무리 많아도, 금고가 아무리 두둑해도 뚫리지 않는다', () => {
    // 하드락의 뜻: 배치·돈으로 우회할 수 없다. 순환기만 빼고 전부 갖춘 병원을 만든다.
    let w0 = emergencyWorld({ dept: 'INTERNAL_MEDICINE' })
    w0 = hireDoctor(w0, 'GENERAL_SURGERY')
    w0 = hireDoctor(w0, 'AESTHETICS')
    w0 = { ...w0, treasuryManwon: 1_000_000 }
    const m = firstEmergencyMin(w0, 'STEMI')
    const w = run(w0, m)
    expect(w.stats.emergencyTurnedAway).toEqual([{ kind: 'STEMI', reason: 'NO_SPECIALIST' }])
    expect(w.treasuryManwon).toBe(1_000_000)
  })

  it('배후과가 있어도 병동이 없으면 NO_BED다 — 두 조건은 AND다', () => {
    const w0 = emergencyWorld({ ward: false })
    const m = firstEmergencyMin(w0, 'STEMI')
    const w = run(w0, m)
    expect(w.stats.emergencyTurnedAway).toEqual([{ kind: 'STEMI', reason: 'NO_BED' }])
    expect(emergencyPawns(w)).toEqual([])
    expect(w.nextId).toBe(w0.nextId)
  })

  it('빈 침대가 없으면 NO_BED — 침대가 있는 것과 비어 있는 것은 다르다', () => {
    // 유일한 침대를 이미 수용된 응급이 물고 있는 상태를 만든다.
    const w0 = emergencyWorld()
    const m = firstEmergencyMin(w0, 'STEMI')
    const occupied = run(w0, m)
    expect(occupied.stats.emergencyAccepted).toBe(1) // 전제: 한 명이 침대를 얻었다
    expect(wardBeds(occupied)).toHaveLength(1)       // 전제: 침대는 하나뿐
    expect(freeBed(occupied, buildBlockedSet(occupied))).toBeNull()
    // 그 침대가 아직 찬 채로 다음 STEMI가 온다 — 순환기 의사는 **있는데도** 되돌아간다.
    const next = firstEmergencyMin(w0, 'STEMI', m + 1)
    const w = run(occupied, next - m)
    expect(w.stats.emergencyAccepted).toBe(1)        // 둘째는 못 들어왔다
    expect(w.stats.emergencyTurnedAway).toEqual([{ kind: 'STEMI', reason: 'NO_BED' }])
    expect(emergencyPawns(w)).toHaveLength(1)
  })

  it('의사도 침대도 없으면 사유는 NO_SPECIALIST — 배후과가 먼저 걸린다', () => {
    const w0 = emergencyWorld({ dept: null, ward: false })
    const m = firstEmergencyMin(w0, 'STEMI')
    const w = run(w0, m)
    expect(w.stats.emergencyTurnedAway).toEqual([{ kind: 'STEMI', reason: 'NO_SPECIALIST' }])
  })

  it('외과 응급(급성복증)은 외과 의사를 본다 — 순환기로는 못 받는다', () => {
    // 종류마다 배후과가 다르다는 계약. 한 과로 뭉뚱그리면 여기서 걸린다.
    const cardioOnly = emergencyWorld({ dept: 'CARDIOLOGY' })
    const m = firstEmergencyMin(cardioOnly, 'ACUTE_ABDOMEN')
    const refused = run(cardioOnly, m).stats.emergencyTurnedAway
    // 앞선 STEMI들은 침대가 차서 되돌아갔을 수 있다(사유가 다르다) — 급성복증 건만 골라 본다.
    expect(refused.filter(t => t.kind === 'ACUTE_ABDOMEN'))
      .toEqual([{ kind: 'ACUTE_ABDOMEN', reason: 'NO_SPECIALIST' }])
    const surgeryOnly = emergencyWorld({ dept: 'GENERAL_SURGERY' })
    expect(firstEmergencyMin(surgeryOnly, 'ACUTE_ABDOMEN')).toBe(m) // 같은 시드 = 같은 도착
    const accepted = run(surgeryOnly, m)
    expect(accepted.stats.emergencyAccepted).toBe(1)
    // 같은 하루에 온 STEMI는 순환기가 없어 되돌아갔다 — 배후과는 종류마다 따로 잠긴다.
    expect(accepted.stats.emergencyTurnedAway.every(t => t.kind === 'STEMI')).toBe(true)
  })
})

describe('수용 — 병동 처치', () => {
  it('수용된 응급은 침대를 물고, 처치가 끝나면 수가가 들어오고 침대가 풀린다', () => {
    const w0 = emergencyWorld()
    const m = firstEmergencyMin(w0, 'STEMI')
    let w = run(w0, m)
    expect(w.stats.emergencyAccepted).toBe(1)
    expect(w.nextId).toBe(w0.nextId + 1)
    const arrived = emergencyPawns(w)
    expect(arrived).toHaveLength(1)
    // 응급 환자도 **과를 싣는다** — 안 실으면 라우팅·수가 조회가 조용히 다른 길로 샌다.
    expect(arrived[0]).toMatchObject({ kind: 'PATIENT', emergency: 'STEMI', wantsDept: 'CARDIOLOGY', stage: 'TO_BED' })

    w = until(w, x => x.pawns.some(p => p.stage === 'IN_TREATMENT'))
    const treating = w.pawns.find(p => p.stage === 'IN_TREATMENT')!
    expect(treating.treatUntilMin).toBe(w.minute + STEMI.durationMin)
    expect(treating.doctorId).toBeDefined()                      // 의사를 물고 있다
    expect(freeBed(w, buildBlockedSet(w))).toBeNull()            // 유일한 침대를 점유했다

    const before = w.treasuryManwon
    w = run(w, STEMI.durationMin - 1)
    expect(w.treasuryManwon).toBe(before)                        // 89분엔 아직 안 끝난다
    expect(w.stats.byDept).toEqual({})
    w = run(w, 1)
    expect(w.treasuryManwon).toBe(before + STEMI.revenueManwon)  // 90분에 정확히 끝난다
    expect(w.stats.byDept).toEqual({
      CARDIOLOGY: { patients: 1, revenueManwon: STEMI.revenueManwon },
    })
    expect(w.stats.examsDone).toBe(0)                            // 응급은 외래 건수가 아니다
    expect(freeBed(w, buildBlockedSet(w))).not.toBeNull()        // 침대가 풀렸다
    expect(w.pawns.find(p => p.emergency)?.doctorId).toBeUndefined() // 의사도 풀렸다
  })

  it('처치가 끝난 응급 환자는 걸어 나가고 세계에서 사라진다', () => {
    const w0 = emergencyWorld()
    let w = run(w0, firstEmergencyMin(w0, 'STEMI'))
    w = until(w, x => x.pawns.some(p => p.emergency && p.stage === 'LEAVING'), 200)
    w = until(w, x => !x.pawns.some(p => p.emergency), 120)
    expect(w.phase).toBe('RUNNING') // 정산이 치운 게 아니라 제 발로 나갔다
  })

  it('외래 진료 중인 의사는 그 진료를 마치고, 대기 환자보다 응급을 먼저 본다', () => {
    // 도착 창이 닫힌 뒤로 세계를 옮긴다 — 자연 도착(외래·응급)이 끼어들지 않아 손으로 세운
    // 세 사람(외래 진행 중 · 외래 대기 · 병동의 응급)만 관측된다.
    let w = place(createWorld(3), { type: 'EXAM', dept: 'CARDIOLOGY', x: 6, y: 6, w: 6, h: 5 })
    w = place(w, WARD_1BED)
    w = hireDoctor(w, 'CARDIOLOGY')
    w = run(w, 40)                       // 의사가 책상 앞에 자리잡는다
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    expect(doc.roomId).toBeDefined()     // 전제: 진료실에 앉았다
    w = { ...w, minute: ARRIVAL_WINDOW_MIN }
    const bed = wardBeds(w)[0]
    const outpatient = (id: string, x: number): Pawn => ({
      id, kind: 'PATIENT', x, y: 11, path: [], dest: { x, y: 11 },
      stage: 'WAITING', arrivedMin: w.minute, wantsDept: 'CARDIOLOGY',
    })
    const emergency: Pawn = {
      id: 'emg-hand', kind: 'PATIENT', x: bed.x, y: bed.y, path: [], dest: bed,
      stage: 'IN_BED', emergency: 'STEMI', wantsDept: 'CARDIOLOGY',
    }
    // 외래 A가 먼저 의사를 잡는다(응급이 오기 전에 시작된 진료는 중단되지 않는다).
    w = tick({ ...w, pawns: [doc, outpatient('out-a', 9), outpatient('out-b', 10)] }, 1)
    w = until(w, x => x.pawns.some(p => p.id === 'out-a' && p.stage === 'IN_EXAM'), 30)
    expect(w.pawns.find(p => p.id === 'out-b')!.stage).toBe('WAITING') // 전제: 둘째는 줄에 있다
    w = { ...w, pawns: [...w.pawns, emergency] }
    expect(w.pawns.find(p => p.id === 'emg-hand')!.doctorId).toBeUndefined() // 진행 중 진료는 안 뺏는다

    w = until(w, x => x.pawns.every(p => p.id !== 'out-a' || p.stage !== 'IN_EXAM'), 40)
    // 외래가 끝난 그 분에 의사는 **응급**에게 간다 — 먼저 줄 서 있던 out-b가 아니다.
    expect(w.pawns.find(p => p.id === 'emg-hand')).toMatchObject({ stage: 'IN_TREATMENT' })
    expect(w.pawns.find(p => p.id === 'out-b')!.stage).toBe('WAITING')
    w = run(w, 30)
    expect(w.pawns.find(p => p.id === 'out-b')!.stage).toBe('WAITING') // 처치 중엔 계속 밀린다
  })
})

describe('집계·불변식', () => {
  /** 대기실 + 순환기 진료실 + 병동 + 순환기 의사 — 외래와 응급이 같은 의사를 두고 섞인다 */
  function mixedWorld(seed: number): SimWorld {
    let w = place(createWorld(seed), { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
    w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 6, y: 6, w: 6, h: 5 })
    w = place(w, WARD_1BED)
    return hireDoctor(w, 'CARDIOLOGY')
  }

  it('금고 불변식: 금고 = 초기 − 건설비 + Σ byDept(외래 + 응급)', () => {
    const w0 = mixedWorld(BOTH_KINDS_SEED)
    const built = INITIAL_TREASURY_MANWON - w0.treasuryManwon
    const w = run(w0, DAY_END_MIN - 1)
    expect(w.stats.emergencyAccepted).toBeGreaterThan(0) // 계측기가 헛돌지 않았다
    expect(w.stats.examsDone).toBeGreaterThan(0)
    expect(deptRevenueSum(w.stats.byDept)).toBeGreaterThan(STEMI.revenueManwon)
    expect(w.treasuryManwon).toBe(INITIAL_TREASURY_MANWON - built + deptRevenueSum(w.stats.byDept))
  })

  it('DayRecord가 그날 응급 수용·회차를 굳힌다', () => {
    const w = run(mixedWorld(BOTH_KINDS_SEED), DAY_END_MIN)
    expect(w.days).toHaveLength(1)
    const d = w.days[0]
    expect(d.emergencies.accepted).toBe(w.stats.emergencyAccepted)
    expect(d.emergencies.turnedAway).toBe(w.stats.emergencyTurnedAway.length)
    expect(d.emergencies.accepted).toBeGreaterThan(0)
    expect(d.emergencies.turnedAway).toBeGreaterThan(0) // 침대 1개짜리라 반드시 되돌아간 건이 있다
    expect(d.revenueManwon).toBe(deptRevenueSum(d.byDept)) // Σ 불변식은 응급을 얹어도 유지된다
  })

  it('회차는 종류·사유가 함께 쌓인다 — 숫자만 세지 않는다', () => {
    const w = run(emergencyWorld({ dept: null }), DAY_END_MIN - 1)
    expect(w.stats.emergencyTurnedAway.length).toBeGreaterThan(1)
    for (const t of w.stats.emergencyTurnedAway) {
      expect(['STEMI', 'ACUTE_ABDOMEN']).toContain(t.kind)
      expect(t.reason).toBe('NO_SPECIALIST')
    }
    // 두 종류가 다 되돌아갔다 — 한 종류만 판정하고 있지 않다.
    expect(new Set(w.stats.emergencyTurnedAway.map(t => t.kind)).size).toBe(2)
  })

  it('마감 정산: 처치 중이면 완료 인정, 침대로 가던 중·대기 중이면 이탈 집계', () => {
    // 자연 흐름의 600분에 어떤 스테이지가 남을지는 시드에 달렸다 — 스테이지별 계약은 손으로 잠근다.
    let w = place(createWorld(3), WARD_1BED)
    w = hireDoctor(w, 'CARDIOLOGY')
    w = run(w, 5)
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const staged = (id: string, stage: Pawn['stage']): Pawn => ({
      id, kind: 'PATIENT', x: 31, y: 22, path: [], stage,
      emergency: 'STEMI', wantsDept: 'CARDIOLOGY',
    })
    const s = settleDay({
      ...w,
      pawns: [doc, staged('t', 'IN_TREATMENT'), staged('to-bed', 'TO_BED'), staged('in-bed', 'IN_BED')],
    })
    expect(s.treasuryManwon).toBe(w.treasuryManwon + STEMI.revenueManwon)
    expect(s.stats.byDept).toEqual({ CARDIOLOGY: { patients: 1, revenueManwon: STEMI.revenueManwon } })
    expect(s.stats.examsDone).toBe(w.stats.examsDone)      // 응급은 외래 건수가 아니다
    expect(s.stats.leftCount).toBe(w.stats.leftCount + 2)  // TO_BED·IN_BED 둘
    expect(s.days[0].revenueManwon).toBe(deptRevenueSum(s.stats.byDept))
  })

  it('결정론: 같은 시드면 응급이 섞인 하루도 완전히 같다', () => {
    expect(run(mixedWorld(11), DAY_END_MIN)).toEqual(run(mixedWorld(11), DAY_END_MIN))
  })

  it('시간 분할 불변: 응급이 섞여도 120분 한 번 = 1분 120번', () => {
    expect(tick(mixedWorld(BOTH_KINDS_SEED), 120)).toEqual(run(mixedWorld(BOTH_KINDS_SEED), 120))
  })

  it('tick은 입력 세계를 변형하지 않는다 (응급 포함)', () => {
    const w = mixedWorld(BOTH_KINDS_SEED)
    const snapshot = structuredClone(w)
    tick(w, 300)
    expect(w).toEqual(snapshot)
  })
})
