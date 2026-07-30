// 수납 — 간호사가 접수처 카운터에 있어야 진료비가 걷힌다(없으면 미수로 샌다).
//
// 파일이 모듈이 아니라 **슬라이스**를 따르는 이유: 이 규칙 하나가 네 모듈에 걸쳐 있다
// (판정 patientFlow · 외래 progressStages · 응급 emergency · 마감 day · 주급 week).
// 모듈별 파일에 흩으면 "창구가 없으면 어디서도 돈이 안 걷힌다"는 계약을 통째로 겨누는
// 테스트가 한 곳도 없게 된다 — 계상 지점이 다섯이라 한 곳만 창구를 안 봐도 조용히 샌다.
import { describe, it, expect } from 'vitest'
import { createWorld, freshStats, type SimWorld } from './world'
import { computeRegions } from './regions'
import { buildBlockedSet, type Pt } from './path'
import { hireNurse, nurseCount, type Pawn } from './pawn'
import { placeFurniture } from './build'
import { hire, placeRoom } from './testHelpers'
import { tick } from './tick'
import { DAY_END_MIN, settleDay, startNextDay } from './day'
import { simDept, deptRevenueSum } from './dept'
import { ARRIVAL_WINDOW_MIN, EXAM_DURATION_MIN, cashierSlots, hasCashier } from './patientFlow'
import { emergencySpec } from './emergency'
import { NURSE_WEEKLY_COST_MANWON, resigningSimDoctors, weekSummary } from './week'
import { resigningNurses } from './nurse'

/** 내과 외래 한 건의 수가 — 손으로 12를 적지 않는다(카탈로그가 단일 출처다). */
const EXAM_FEE = simDept('INTERNAL_MEDICINE').examRevenueManwon

function place(w: SimWorld, spec: Parameters<typeof placeRoom>[1]): SimWorld {
  const r = placeRoom(w, spec)
  if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
  return r.world
}

/**
 * 진료실(내과) + 접수처 — **대기실이 없어 자연 도착이 폰을 만들지 않는다**.
 * 그래서 아래 테스트가 관측하는 환자는 손으로 앉힌 한 명뿐이고, 금고 변화도 그 한 건이 전부다
 * (patientFlow.test의 `soloDeptWorld`와 같은 격리).
 *
 * ⚠️ **도착 창이 닫힌 뒤로 시계를 옮겨 둔다**(`ARRIVAL_WINDOW_MIN`). 대기실이 없어도 문간에서
 * 발길을 돌린 사람은 `leftCount`를 올리므로(emergency.test가 같은 함정을 적어 두었다), 그 잡음이
 * 있으면 "미수는 이탈이 아니다"를 절대값으로 잴 수 없다 — 창을 닫으면 그 축이 0에 고정된다.
 *
 * 진료실 (6,6) 6×5 → 책상 (7,7)·환자의자 (8,7). 접수처 (28,20) 6×6 → 카운터 (29,21).
 */
function clinic({ reception = true, nurse = true, seed = 3 } = {}): SimWorld {
  let w = createWorld(seed)
  w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 6, y: 6, w: 6, h: 5 })
  if (reception) w = place(w, { type: 'RECEPTION', x: 28, y: 20, w: 6, h: 6 })
  w = hire(w, 'INTERNAL_MEDICINE')
  if (nurse) w = hireNurse(w)
  // 의사가 책상 앞에 설 때까지 — 배정 없이는 진료 자체가 성립하지 않는다.
  const settled = tick(w, 40)
  if (!settled.pawns.find(p => p.kind === 'DOCTOR')!.deskAt) {
    throw new Error('전제 실패 — 의사가 진료실에 배정되지 않았다')
  }
  return { ...settled, minute: ARRIVAL_WINDOW_MIN, stats: freshStats() }
}

/** 대기실까지 갖춘 완비 병원 — 자연 도착이 돌아 하루를 통째로 잴 수 있다. */
function fullHospital({ reception = true, nurse = true, seed = 3 } = {}): SimWorld {
  let w = createWorld(seed)
  w = place(w, { type: 'WAITING', x: 18, y: 24, w: 8, h: 6 })
  w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 18, y: 14, w: 8, h: 6 })
  if (reception) w = place(w, { type: 'RECEPTION', x: 28, y: 24, w: 6, h: 6 })
  w = hire(w, 'INTERNAL_MEDICINE')
  return nurse ? hireNurse(w) : w
}

/** 진료가 **막 끝난** 환자 하나를 환자의자에 앉힌다 — `examUntilMin: 0`이라 다음 분에 종료된다. */
function examDonePatient(w: SimWorld, at: Pt = { x: 8, y: 7 }): SimWorld {
  const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
  const p: Pawn = {
    id: 'pat-hand', kind: 'PATIENT', x: at.x, y: at.y, path: [], dest: at,
    stage: 'IN_EXAM', wantsDept: 'INTERNAL_MEDICINE', doctorId: doc.id,
    examUntilMin: 0, workMin: EXAM_DURATION_MIN,
  }
  return { ...w, pawns: [...w.pawns, p] }
}

const handPatient = (w: SimWorld) => w.pawns.find(p => p.id === 'pat-hand')

/** 조건이 참이 될 때까지 1분씩 — 전제가 성립 안 하면 조용히 통과하지 말고 터진다. */
function until(w: SimWorld, pred: (w: SimWorld) => boolean, limit = 300): SimWorld {
  for (let i = 0; i < limit; i++) {
    if (pred(w)) return w
    w = tick(w, 1)
  }
  throw new Error('전제 실패 — 기다린 상태가 오지 않았다')
}

const run = (w: SimWorld, minutes: number) => {
  for (let i = 0; i < minutes; i++) w = tick(w, 1)
  return w
}

describe('hasCashier — 수납 판정의 단일 출처', () => {
  it('접수처 안 카운터 ≥1 **그리고** 간호사 ≥1이면 성립한다', () => {
    expect(hasCashier(clinic())).toBe(true)
  })

  it('카운터는 있는데 간호사가 없으면 성립하지 않는다 — 창구는 사람이 지킨다', () => {
    expect(hasCashier(clinic({ nurse: false }))).toBe(false)
  })

  it('간호사는 있는데 접수처 카운터가 없으면 성립하지 않는다 — 앉을 창구가 없다', () => {
    expect(hasCashier(clinic({ reception: false }))).toBe(false)
  })

  /* 돌연변이 사살용 — 방 종류 필터(RECEPTION)를 지우면 이 단언만 깨진다.
     카운터는 어디에나 놓을 수 있는 가구라, 용도를 안 보면 진료실 구석의 카운터가 창구가 된다. */
  it('접수처 **밖**의 카운터는 창구가 아니다 — 용도 지정이 판정의 일부다', () => {
    const w = clinic({ reception: false })
    // 진료실 안(내부 7..10 × 7..9)의 빈 칸에 카운터를 놓는다 — 방은 EXAM이지 RECEPTION이 아니다.
    const r = placeFurniture(w, 'COUNTER', [{ x: 9, y: 8 }])
    if (!r.ok) throw new Error(`전제 실패 — 카운터 설치 거부(${r.reason})`)
    expect(r.world.furniture.some(f => f.kind === 'COUNTER')).toBe(true)
    expect(hasCashier(r.world)).toBe(false)
  })

  it('카운터 앞 타일이 곧 수납 자리다 — 카운터는 통행을 막으므로 그 위가 아니다', () => {
    // 자동 배치 카운터는 접수처 **내부 좌상단**이라 위·왼쪽이 벽이다 — 마주 볼 짝이 없어
    // 폴백(한 칸을 둘이 쓴다)으로 떨어진다. 그 폴백이 옛 계약과 같은 좌표임을 여기서 못박는다.
    const w = clinic()
    const slots = cashierSlots(w, buildBlockedSet(w), computeRegions(w))
    expect(slots).toEqual([{
      counter: { x: 29, y: 21 }, nurseSpot: { x: 30, y: 21 }, patientSpot: { x: 30, y: 21 },
    }])
  })
})

describe('cashierSlots — 카운터를 **사이에 두고** 마주 선다', () => {
  /** 접수처 안(31,22)에 카운터를 하나 더 놓는다 — 위아래가 다 트인 자리다.
   *  자동 배치 카운터(29,21)의 폴백 자리(30,21)를 피해 x를 한 칸 옮겼다: 한 칸을 두 창구가
   *  나눠 쓰지 않는 것이 계약이라(cashierSlots의 `used`), 겹치면 세로 짝이 거부되고 가로로 선다. */
  function midCounter(w: SimWorld, at: Pt = { x: 31, y: 22 }): SimWorld {
    const r = placeFurniture(w, 'COUNTER', [at])
    if (!r.ok) throw new Error(`전제 실패 — 카운터 설치 거부(${r.reason})`)
    return r.world
  }
  const slotAt = (w: SimWorld, x: number, y: number) =>
    cashierSlots(w, buildBlockedSet(w), computeRegions(w)).find(s => s.counter.x === x && s.counter.y === y)!

  it('마주 보는 두 칸이 트여 있으면 간호사와 환자가 **반대편**에 선다', () => {
    // 사용자 보고: *"환자가 카운터 너머가 아니라 간호사 옆자리로 간다."* 옛 계약은 두 사람이
    // **같은 한 칸**(카운터 앞 첫 이웃)을 목적지로 삼았다 — 창구가 아니라 손에서 손으로 주는 그림이다.
    const s = slotAt(midCounter(clinic()), 31, 22)
    expect(s.nurseSpot).not.toEqual(s.patientSpot)
    // 환자는 **정문 쪽**(아래)에 선다 — 카운터 너머가 곧 직원 자리라는 그림의 단일 출처다.
    expect(s.nurseSpot).toEqual({ x: 31, y: 21 })
    expect(s.patientSpot).toEqual({ x: 31, y: 23 })
  })

  it('한쪽에 의자가 있으면 **그쪽이 간호사 자리**다 — 앉은 사람이 직원이다', () => {
    let w = midCounter(clinic())
    const chair = placeFurniture(w, 'CHAIR', [{ x: 31, y: 23 }]) // 정문 쪽에 의자를 놓는다
    if (!chair.ok) throw new Error(`전제 실패 — 의자 설치 거부(${chair.reason})`)
    w = chair.world
    const s = slotAt(w, 31, 22)
    expect(s.nurseSpot).toEqual({ x: 31, y: 23 }) // 거리 규칙을 **뒤집는다**
    expect(s.patientSpot).toEqual({ x: 31, y: 21 })
  })

  it('간호사는 자기 칸으로 가고, 환자는 그 **맞은편**으로 간다', () => {
    // 두 좌표가 실제로 라우팅까지 갈라지는가 — 슬롯만 맞고 배정이 옛 표를 보면 화면은 그대로다.
    const w0 = midCounter(clinic())
    const s = slotAt(w0, 31, 22)
    // 자동 배치 카운터(29,21)가 첫 슬롯이라 간호사 하나는 그쪽을 가져간다 — 둘째 간호사가
    // 이 슬롯의 주인이다(자리는 순서대로 하나씩: assignNurseCounters).
    const w1 = tick(hireNurse(w0), 1)
    expect(w1.pawns.filter(p => p.kind === 'NURSE')[1].dest).toEqual(s.nurseSpot)
  })
})

describe('외래 수납 — PAYING 예약석을 채운다', () => {
  it('창구가 있으면 진료가 끝나도 **그 분엔 돈이 안 들어온다** — PAYING으로 카운터를 향한다', () => {
    const w0 = examDonePatient(clinic())
    const w = tick(w0, 1)
    const p = handPatient(w)!
    expect(p.stage).toBe('PAYING')
    expect(p.dest).toEqual({ x: 30, y: 21 })
    expect(w.stats.examsDone).toBe(1)          // 진료는 끝났다
    expect(w.treasuryManwon).toBe(w0.treasuryManwon) // 돈은 아직이다
    expect(deptRevenueSum(w.stats.byDept)).toBe(0)
  })

  it('카운터 앞에 **도착한 분**에 수익이 계상되고 퇴장으로 넘어간다', () => {
    const w0 = examDonePatient(clinic())
    const w = until(tick(w0, 1), x => handPatient(x)?.stage !== 'PAYING')
    expect(w.treasuryManwon).toBe(w0.treasuryManwon + EXAM_FEE)
    expect(deptRevenueSum(w.stats.byDept)).toBe(EXAM_FEE)
    expect(w.stats.unpaidManwon).toBe(0)
    expect(handPatient(w)?.stage ?? 'LEAVING').toBe('LEAVING')
  })

  it('창구가 없으면 곧장 퇴장하고 그 수가만큼 **미수**로 샌다', () => {
    const w0 = examDonePatient(clinic({ nurse: false }))
    const w = tick(w0, 1)
    const p = handPatient(w)!
    expect(p.stage).toBe('LEAVING')
    expect(w.stats.examsDone).toBe(1)
    expect(w.treasuryManwon).toBe(w0.treasuryManwon)
    expect(w.stats.unpaidManwon).toBe(EXAM_FEE)
  })

  it('미수는 이탈이 아니다 — 진료는 받고 갔다', () => {
    const w = tick(examDonePatient(clinic({ nurse: false })), 1)
    expect(w.stats.leftCount).toBe(0)
  })
})

describe('응급 — 판정만 공유하고 이동은 없다', () => {
  /** 침대에 누워 처치가 **막 끝나는** 응급 하나. 병동 (28,6) 4×4 → 침대 (29,7). */
  function emergencyDone(opts: Parameters<typeof clinic>[0] = {}): SimWorld {
    let w = clinic({ ...opts, seed: 5 })
    w = place(w, { type: 'WARD', x: 28, y: 6, w: 4, h: 4 })
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const p: Pawn = {
      id: 'pat-hand', kind: 'PATIENT', x: 29, y: 8, path: [], dest: { x: 29, y: 8 },
      stage: 'IN_TREATMENT', wantsDept: 'INTERNAL_MEDICINE', emergency: 'STEMI',
      doctorId: doc.id, treatUntilMin: 0, workMin: 90,
    }
    return { ...w, pawns: [...w.pawns, p] }
  }
  const FEE = emergencySpec('STEMI').revenueManwon

  it('창구가 있으면 처치 수가가 장부로 들어간다 — 침대에서 걷지는 않는다', () => {
    const w0 = emergencyDone()
    const w = tick(w0, 1)
    expect(w.treasuryManwon).toBe(w0.treasuryManwon + FEE)
    expect(w.stats.unpaidManwon).toBe(0)
    expect(handPatient(w)?.stage).not.toBe('PAYING')
  })

  it('창구가 없으면 처치 수가가 통째로 미수로 샌다', () => {
    const w0 = emergencyDone({ nurse: false })
    const w = tick(w0, 1)
    expect(w.treasuryManwon).toBe(w0.treasuryManwon)
    expect(w.stats.unpaidManwon).toBe(FEE)
  })
})

describe('19시 정산 — 시계 모서리가 돈을 삼키지 않는다', () => {
  it('PAYING으로 걷던 환자는 **수납으로 인정**된다(이탈이 아니다)', () => {
    const w0 = examDonePatient({ ...clinic(), minute: DAY_END_MIN - 2 })
    // 한 분 돌려 PAYING으로 만들고, 아직 카운터에 못 닿은 상태에서 마감을 맞는다.
    const walking = tick(w0, 1)
    expect(handPatient(walking)!.stage).toBe('PAYING')
    const settled = settleDay(walking)
    expect(settled.treasuryManwon).toBe(walking.treasuryManwon + EXAM_FEE)
    expect(deptRevenueSum(settled.stats.byDept)).toBe(EXAM_FEE)
    expect(settled.stats.leftCount).toBe(0)
    expect(settled.days[0].unpaidManwon).toBe(0)
  })

  it('마감에 인정한 진료도 창구가 없으면 미수로 샌다 — 하루의 마지막 건만 공짜가 되지 않는다', () => {
    const w = examDonePatient({ ...clinic({ nurse: false }), minute: DAY_END_MIN - 1 })
    const settled = settleDay(w)
    expect(settled.treasuryManwon).toBe(w.treasuryManwon)
    expect(settled.stats.unpaidManwon).toBe(EXAM_FEE)
    expect(settled.days[0].unpaidManwon).toBe(EXAM_FEE)
  })

  it('마감이 간호사를 세계에서 지우지 않는다 — 사람은 환자와 함께 쓸려 나가지 않는다', () => {
    const w = run(fullHospital(), DAY_END_MIN)
    expect(w.phase).toBe('DAY_END')
    expect(nurseCount(w.pawns)).toBe(1)
    expect(nurseCount(startNextDay(w).pawns)).toBe(1)
  })
})

/* ⚠️ **이 절의 제목이 2026-07-30에 좁아졌다**(N2 · 간호사 이탈 슬라이스). 옛 제목은 「피로·사직
   기계 밖」이었지만 간호사는 이제 **자기 사직 기계**를 갖는다 — 드라이버가 개인 피로가 아니라
   **배치 조건**(간호등급 SHORT로 마감한 날 · Pawn.shortDays)이라는 것이 그 슬라이스의 요지다
   (계약과 경계는 nurseAttrition.test.ts가 잠근다). 여기 남는 것은 **비합류 계약**이고, 그것이
   좁아진 만큼 아래 두 단언이 정확히 그 경계를 잰다: 피로·부하·허기는 여전히 없고, **포화
   일수는 간호사를 데려가지 못한다**(두 축이 서로를 안 읽는다). */
describe('간호사는 피로·허기 기계 밖이다 — 우연이 아니라 계약', () => {
  it('300분을 돌아도 간호사에겐 피로도 부하도 허기도 없다', () => {
    const nurse = run(fullHospital(), 300).pawns.find(p => p.kind === 'NURSE')!
    expect(nurse.fatigue).toBeUndefined()
    expect(nurse.loadMinToday).toBeUndefined()
    expect(nurse.hungerMin).toBeUndefined()
  })

  it('포화 일수를 손으로 박아도 **어느 쪽** 사직 명단에도 서지 않는다 — 두 축은 서로를 안 읽는다', () => {
    const w = fullHospital()
    const forced = {
      ...w,
      pawns: w.pawns.map(p => (p.kind === 'NURSE' ? { ...p, saturatedDays: 99 } : p)),
    }
    expect(resigningSimDoctors(forced)).toHaveLength(0) // 의사 명단은 kind로 갈린다
    expect(resigningNurses(forced)).toHaveLength(0)     // 간호사 명단은 shortDays만 읽는다
  })
})

describe('경계 — 완비 병원은 걷는 시간에 돈을 잃지 않는다', () => {
  it('하루 수익 == 완료 진료 수가 합 · 미수 0', () => {
    const w0 = fullHospital()
    const w = run(w0, DAY_END_MIN)
    const record = w.days[0]
    expect(record.examsDone).toBeGreaterThan(0)
    expect(record.unpaidManwon).toBe(0)
    expect(record.revenueManwon).toBe(record.examsDone * EXAM_FEE)
    expect(w.treasuryManwon).toBe(w0.treasuryManwon + record.revenueManwon)
  })

  it('같은 병원에서 창구만 빼면 **수익이 통째로 미수로 옮겨간다** — 진료 건수는 그대로', () => {
    const paid = run(fullHospital(), DAY_END_MIN).days[0]
    const unpaid = run(fullHospital({ nurse: false }), DAY_END_MIN).days[0]
    expect(unpaid.examsDone).toBe(paid.examsDone)
    expect(unpaid.revenueManwon).toBe(0)
    expect(unpaid.unpaidManwon).toBe(paid.revenueManwon)
  })
})

describe('주간 결산 — 간호사 주급(공짜 노동 금지)', () => {
  /** 7일을 채운 결산 직전 세계 — 하루를 돌리고 다음 날을 여는 것을 7번. */
  function weekEnd(nurses: number): SimWorld {
    let w = fullHospital({ nurse: false })
    for (let i = 0; i < nurses; i++) w = hireNurse(w)
    for (let day = 1; day <= 7; day++) {
      w = run(w, DAY_END_MIN)
      if (day < 7) w = startNextDay(w)
    }
    return w
  }

  it('결산이 간호 인원과 주급을 싣는다', () => {
    const s = weekSummary(weekEnd(2))
    // 등급 축(required·grade·adjustManwon)은 이 describe의 관심사가 아니다 — 여기서 함께 박으면
    // 등급 튜닝이 수납 테스트를 깨뜨린다(그 계약은 week.test 「간호등급」이 잰다).
    expect(s.nursing).toMatchObject({ count: 2, wageManwon: 2 * NURSE_WEEKLY_COST_MANWON })
  })

  it('총액은 블록에서 **유도**한다 — 표와 총액이 갈릴 자리가 없다', () => {
    const s = weekSummary(weekEnd(1))
    // 임대료도 총액 유도에 든다(지역 슬라이스 2026-07-30) — 표 밖 항목이 셋이 됐다.
    expect(s.netManwon)
      .toBe(s.revenueManwon - s.fixedCostManwon - s.nursing.wageManwon - s.rentManwon)
  })

  it('간호사가 없으면 주급도 0이다 — 없는 사람에게 돈이 나가지 않는다', () => {
    expect(weekSummary(weekEnd(0)).nursing).toMatchObject({ count: 0, wageManwon: 0 })
  })
})
