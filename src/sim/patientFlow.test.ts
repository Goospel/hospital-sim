import { describe, it, expect } from 'vitest'
import { createWorld, isWalkable, tileIndex, ENTRANCE, type SimWorld } from './world'
import { computeRegions } from './regions'
import type { Pt } from './path'
import { spawnDoctor, type Pawn } from './pawn'
import { demolish, placeFurniture } from './build'
import { ptKey } from './spots'
import { hire, placeRoom, withCashier } from './testHelpers'
import { tick } from './tick'
import {
  EXAM_DURATION_MIN, PATIENCE_MIN,
  ARRIVAL_WINDOW_MIN, ARRIVAL_PROB_PER_MIN, waitingSeats, arrivalSeed,
  wantsDeptSeed, pickWantsDept, wantsDeptOf, ARRIVAL_DEPT_MIX,
} from './patientFlow'
import {
  HIRABLE_DEPTS, simDept, deptRevenueSum, type SimDeptKey, type SimDeptStats,
} from './dept'
import { seededUnit } from '../game/daysim'
import { applyEvent } from './events'
import { DAY_END_MIN, DAYS_PER_WEEK } from './day'

const DAY_TICKS = 600 // 도착 창(480분) + 뒷정리 여유 — 마감(DAY_END_MIN)과 같은 지점이다

/** 대기실 + 진료실 + 의사 1명 — 진료가 실제로 돌아가는 최소 병원 */
function hospitalWorld(seed: number) {
  const w = createWorld(seed)
  const r1 = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!r1.ok) throw new Error('전제 실패')
  const r2 = placeRoom(r1.world, { type: 'EXAM', x: 6, y: 6, w: 6, h: 5 })
  if (!r2.ok) throw new Error('전제 실패')
  // 수납 창구 — 없으면 진료는 도는데 장부가 텅 비어(전액 미수) 아래 과별 수익 단언이
  // 0 대 0의 항진명제가 된다(설계 2026-07-29 §2 · testHelpers.withCashier).
  return withCashier(spawnDoctor(r2.world, 'INTERNAL_MEDICINE', { x: 8, y: 8 }))
}

/** 대기실만 — 의사가 **한 명도 없어** 도착 전원이 접수처에서 반려된다(폰이 안 만들어진다) */
function waitingOnlyWorld(seed: number) {
  const r = placeRoom(createWorld(seed), { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!r.ok) throw new Error('전제 실패')
  return r.world
}

/** 대기실 + 내과 의사 — **진료실이 없다.** 접수처는 통과하지만(그 과를 보긴 한다) 배정될 방이
 *  없어 아무도 못 불린다: **인내 초과 이탈만 남는 유일한 픽스처**다.
 *  접수처 반려가 생기기 전에는 `waitingOnlyWorld`(의사 0)가 그 자리였는데, 이제 그 세계는
 *  환자가 아예 안 들어와 인내를 관측할 수 없다. */
function noExamRoomWorld(seed: number) {
  return hire(waitingOnlyWorld(seed), 'INTERNAL_MEDICINE')
}

/** 대기실 둘(A는 봉인 대상 · B는 끝까지 멀쩡) + 진료실 + 의사.
 *  A를 먼저 놓아 가구 배열에서 A의 의자가 좌석 후보로 **먼저** 잡히게 한다. */
function twoWaitingWorld(seed: number) {
  let w: SimWorld = createWorld(seed)
  const specs = [
    { type: 'WAITING' as const, x: 18, y: 20, w: 8, h: 6 },
    { type: 'WAITING' as const, x: 30, y: 20, w: 8, h: 6 },
    { type: 'EXAM' as const, x: 6, y: 6, w: 6, h: 5 },
  ]
  for (const spec of specs) {
    const r = placeRoom(w, spec)
    if (!r.ok) throw new Error('전제 실패')
    w = r.world
  }
  return spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 8, y: 8 })
}

/** 좌석 45개 대기실 — 자리 부족이 구조적으로 일어나지 않는 세계(이탈 원인을 인내로 고정) */
function roomySeatsWorld(seed: number) {
  const r = placeRoom(createWorld(seed), { type: 'WAITING', x: 14, y: 14, w: 20, h: 12 })
  if (!r.ok) throw new Error('전제 실패')
  return r.world
}

/** 4과 진료실 + 대기실 + 4과 의사 각 1명 — 라우팅이 실제로 갈리는 최소 병원.
 *  ⚠️ **채용 순서를 방 순서의 역순으로** 둔다. 같은 순서로 두면 배정이 과를 안 보고 그냥
 *  "i번째 의사 → i번째 방"으로 짝지어도 결과가 같아, "자기 과 방에만 배정된다"는 단언이
 *  우연히 통과한다(실측: 그 상태에서 과 조건을 지워도 안 걸렸다). 역순이면 과를 봐야만 맞는다. */
function fourDeptWorld(seed: number) {
  let w: SimWorld = createWorld(seed)
  const wait = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!wait.ok) throw new Error('전제 실패')
  w = wait.world
  HIRABLE_DEPTS.forEach((dept, i) => {
    const r = placeRoom(w, { type: 'EXAM', dept, x: 2 + i * 8, y: 2, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    w = r.world
  })
  for (const dept of [...HIRABLE_DEPTS].reverse()) w = hire(w, dept)
  return withCashier(w) // 수납 창구 — 과별 수익을 재려면 돈이 실제로 걷혀야 한다
}

/** 진료실 하나 + 그 과 의사 하나. **대기실이 없어 자연 도착이 폰을 만들지 않는다** —
 *  그래서 아래 테스트들은 손으로 앉힌 환자 한 명만 관측한다(수익·라우팅을 한 건으로 격리). */
function soloDeptWorld(dept: SimDeptKey, seed = 3) {
  const r = placeRoom(createWorld(seed), { type: 'EXAM', dept, x: 6, y: 6, w: 6, h: 5 })
  if (!r.ok) throw new Error('전제 실패')
  const w = tick(withCashier(hire(r.world, dept)), 40) // 의사가 책상 앞에 설 때까지
  const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
  if (!doc.deskAt) throw new Error('전제 실패 — 의사가 진료실에 배정되지 않았다')
  return w
}

/**
 * 큰 진료실 하나에 **책상 3개(각각 인접 의자)** + 같은 과 의사 3명 — 이 재설계의 촉발 문제
 * ("진료실을 크게 지어도 의사 1명")를 겨누는 픽스처다. 대기실이 없어 자연 도착이 폰을 만들지
 * 않으므로 관측되는 환자는 손으로 앉힌 사람뿐이다(soloDeptWorld와 같은 격리).
 *
 * 방 (6,6) 10×7 → 내부 7..14 × 7..11 · 문 (11,12). 자동 가구가 책상(7,7)+의자(8,7)를 놓고,
 * 아래에서 책상 (10,7)·(13,7)과 그 오른쪽 의자를 덧놓는다.
 */
function multiDeskWorld(doctors = 3, seed = 3): SimWorld {
  const r = placeRoom(createWorld(seed), { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 6, y: 6, w: 10, h: 7 })
  if (!r.ok) throw new Error('전제 실패')
  let w = furnish(r.world, 'DESK', [{ x: 10, y: 7 }, { x: 13, y: 7 }])
  w = furnish(w, 'CHAIR', [{ x: 11, y: 7 }, { x: 14, y: 7 }])
  for (let i = 0; i < doctors; i++) w = hire(w, 'INTERNAL_MEDICINE')
  return w
}

function furnish(w: SimWorld, kind: 'DESK' | 'CHAIR', tiles: Pt[]): SimWorld {
  const r = placeFurniture(w, kind, tiles)
  if (!r.ok) throw new Error(`전제 실패 — 가구 설치 거부(${r.reason})`)
  return r.world
}

/** 진료실 문(11,12) 바로 바깥에 세운 대기 환자 N명 — 대기실 없이 대기열을 만든다. */
function seatPatientsOutsideBigRoom(w: SimWorld, n: number): SimWorld {
  const pawns: Pawn[] = []
  for (let i = 0; i < n; i++) {
    const at = { x: 10 + i, y: 13 }
    if (!isWalkable(w, at.x, at.y)) throw new Error('전제 실패 — 앉힐 자리가 막혔다')
    pawns.push({
      id: `pat-hand-${i}`, kind: 'PATIENT', x: at.x, y: at.y, path: [], dest: at,
      stage: 'WAITING', arrivedMin: w.minute, wantsDept: 'INTERNAL_MEDICINE',
    })
  }
  return { ...w, pawns: [...w.pawns, ...pawns] }
}

/** 진료실 문(9,10) 바로 바깥에 앉은 환자 — 대기실을 짓지 않고 대기 상태를 만든다. */
function seatPatient(w: SimWorld, wantsDept: SimDeptKey): SimWorld {
  const at = { x: 9, y: 11 }
  if (!isWalkable(w, at.x, at.y)) throw new Error('전제 실패 — 앉힐 자리가 막혔다')
  const patient: Pawn = {
    id: 'pat-hand', kind: 'PATIENT', x: at.x, y: at.y, path: [], dest: at,
    stage: 'WAITING', arrivedMin: w.minute, wantsDept,
  }
  return { ...w, pawns: [...w.pawns, patient] }
}

const run = (w: SimWorld, minutes = DAY_TICKS) => {
  for (let i = 0; i < minutes; i++) w = tick(w, 1)
  return w
}

/** 하루를 돌리며 **새로 생긴 환자의 희망 과**를 순서대로 모은다.
 *  퇴장한 폰은 배열에서 사라지므로 도착 순간에 잡지 않으면 관측할 수 없다. */
function runCollectingWants(w0: SimWorld, minutes = DAY_TICKS) {
  let w = w0
  const wants: SimDeptKey[] = []
  for (let i = 0; i < minutes; i++) {
    const before = new Set(w.pawns.map(p => p.id))
    w = tick(w, 1)
    for (const p of w.pawns) if (p.kind === 'PATIENT' && !before.has(p.id)) wants.push(wantsDeptOf(p))
  }
  return { w, wants }
}

const patientsOf = (byDept: SimDeptStats) =>
  Object.values(byDept).reduce((n, s) => n + (s?.patients ?? 0), 0)

/** 조건이 참이 될 때까지 1분씩 돌린다 — 전제가 성립 안 하면 조용히 통과하지 말고 터진다 */
function until(w: SimWorld, pred: (w: SimWorld) => boolean, limit = ARRIVAL_WINDOW_MIN) {
  for (let i = 0; i < limit; i++) {
    if (pred(w)) return w
    w = tick(w, 1)
  }
  throw new Error('전제 실패 — 기다린 상태가 오지 않았다')
}

describe('환자 흐름', () => {
  it('하루를 돌리면 환자가 도착하고, 진료가 발생해 수익이 쌓인다', () => {
    const w0 = hospitalWorld(3)
    const w = run(w0)
    expect(w.stats.examsDone).toBeGreaterThan(0)
    // 수익은 더 이상 건당 상수가 아니라 **과별 수가**의 합이다(계획 Task 2) — 금고 불변식도
    // 과별 집계에서 유도한다. 상수 × 건수로 재면 과가 갈리는 순간 그 등식이 거짓이 된다.
    expect(w.treasuryManwon).toBe(w0.treasuryManwon + deptRevenueSum(w.stats.byDept))
  })

  it('불변식: 의사 0명이면 진료 0건', () => {
    const w = run(waitingOnlyWorld(3))
    expect(w.stats.examsDone).toBe(0)
  })

  it('대기실이 없으면 환자가 들어오자마자 이탈로 집계된다', () => {
    // 마감 직전까지만 돌린다 — 정산(600분)이 어차피 환자를 전부 쓸어가므로 600분을 넘겨 재면
    // 아래 `pawns === []`가 항진명제가 된다("아무도 안 남았다"를 더는 관측하지 못한다).
    const w0 = createWorld(3)
    const w = run(w0, DAY_END_MIN - 1)
    expect(w.phase).toBe('RUNNING')
    expect(w.stats.examsDone).toBe(0)
    expect(w.stats.leftCount).toBeGreaterThan(0)
    expect(w.pawns).toEqual([])
    // "폰으로 만들지도 않았다"는 nextId로만 관측된다 — pawns는 퇴장 기계가 어차피 비워주므로
    // 문간 환자를 폰으로 만들었다가 곧바로 내보내도 []로 보인다(같은 항진명제의 다른 얼굴).
    expect(w.nextId).toBe(w0.nextId)
  })

  /*
    ── 접수처 반려 ────────────────────────────────────────────────────────────
    안 보는 과의 환자는 **대기실까지 들어오지 않는다**. 옛 규칙은 그 사람을 의자에 앉혀
    90분을 기다리게 했는데, 그건 두 가지로 틀렸다: ① 실제 접수처라면 문 앞에서 말해 준다
    ② 그 90분 동안 좌석이 잠겨, 볼 수 있었던 환자까지 문간에서 돌아갔다(이탈 증폭).

    ⚠️ **놓쳤다는 숫자는 그대로 남는다**(leftCount). 이 게임의 논지가 그 숫자다 —
    내과를 안 뽑아서 못 본 환자가 화면에서 사라지면 판이 "안 뽑는 게 이득"이라고 말한다.
  */
  it('그 과 의사가 하나도 없으면 **폰조차 안 만들어지고** 전부 접수처 반려로 세어진다', () => {
    const w0 = waitingOnlyWorld(3)
    const w = run(w0, DAY_END_MIN - 1)
    expect(w.phase).toBe('RUNNING')
    // 좌석 넉넉한 대기실인데도 아무도 안 앉는다 — 이게 "대기실까지 안 들어온다"의 관측이다.
    expect(w.nextId).toBe(w0.nextId)
    expect(w.pawns).toEqual([])
    expect(w.stats.leftCount).toBeGreaterThan(0)
    // 의사가 한 명도 없으니 도착 전원이 반려다 — 부분집합이 아니라 전체와 같아진다.
    expect(w.stats.leftNoDept).toBe(w.stats.leftCount)
  })

  it('그 과 의사가 있으면 그 과 환자만 들어온다 — 나머지는 문 앞에서 돌아간다', () => {
    // 내과 의사 하나뿐인 병원. 도착 표는 4과가 섞여 있으므로(ARRIVAL_DEPT_MIX) 반려가 반드시 생긴다.
    const { w, wants } = runCollectingWants(hospitalWorld(3), DAY_END_MIN - 1)
    expect(wants.length).toBeGreaterThan(0)
    expect(new Set(wants)).toEqual(new Set(['INTERNAL_MEDICINE']))
    expect(w.stats.leftNoDept).toBeGreaterThan(0)
    // 불변식 — 반려는 이탈의 **부분집합**이다(따로 세는 축이 아니라 사유 하나다).
    expect(w.stats.leftNoDept).toBeLessThanOrEqual(w.stats.leftCount)
  })

  it('4과를 다 보는 병원에서는 **반려가 0건**이다 — 이 규칙이 완비 병원의 밸런스를 안 건드린다', () => {
    // 마감 12일 전에 얹는 규칙이라 "어디까지 흔드는가"를 못박아 둔다: 반려 분기는 안 보는 과가
    // 있을 때만 발동하므로, 4과가 다 있으면 코드 경로가 옛것과 **완전히 같다**.
    const w = run(fourDeptWorld(3), DAY_END_MIN - 1)
    expect(w.stats.leftNoDept).toBe(0)
    expect(w.stats.examsDone).toBeGreaterThan(0) // 계측기 자기검사 — 실제로 돌아간 병원이다
  })

  it('반려는 좌석 판정보다 **먼저**다 — 자리가 없어도 안 보는 과는 「그 과 없음」으로 갈린다', () => {
    // 대기실이 없는(= 좌석 0) 병원 + 내과 의사 1명. 내과 환자는 자리가 없어 돌아가고(반려 아님),
    // 나머지 세 과는 자리와 무관하게 반려다 — 두 사유가 **동시에** 잡히는 유일한 픽스처다.
    // 순서를 뒤집으면(좌석 먼저) 전부 「자리 없음」이 되어 아래 두 단언이 함께 깨진다.
    const r = placeRoom(createWorld(3), { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 6, y: 6, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    const w = run(hire(r.world, 'INTERNAL_MEDICINE'), DAY_END_MIN - 1)
    expect(w.stats.leftNoDept).toBeGreaterThan(0)
    expect(w.stats.leftCount).toBeGreaterThan(w.stats.leftNoDept)
  })

  it(`인내 ${PATIENCE_MIN}분 초과 대기자는 LEFT_WAITING으로 떠난다`, () => {
    const w0 = noExamRoomWorld(3)
    const w = run(w0)
    for (const p of w.pawns.filter(p => p.stage === 'WAITING')) {
      expect(w.minute - p.arrivedMin!).toBeLessThanOrEqual(PATIENCE_MIN)
    }
    expect(w.stats.leftCount).toBeGreaterThan(0)
    expect(w.treasuryManwon).toBe(w0.treasuryManwon) // 이탈은 수익 0
  })

  it('자리가 넉넉해도 진료실이 없으면 결국 **들어온 전원이** 인내 초과로 떠난다', () => {
    // leftCount의 세 원인(접수처 반려 / 자리 없음 / 인내 초과)을 가르는 계측기.
    // 좌석 45개면 자리 부족은 0건이고, 내과 의사가 있으니 내과 환자는 반려도 아니다 —
    // **들어온 사람의 이탈은 전부 인내 초과**다(그 의사에게 배정될 방이 없다).
    // 마감 직전까지만 돌린다 — 정산(600분)이 잔류 환자를 이탈로 집계하므로 600분을 넘겨 재면
    // "인내가 원인"이라는 이 테스트의 구분이 정산에 가려진다(넷째 원인이 섞인다).
    const w0 = hire(roomySeatsWorld(3), 'INTERNAL_MEDICINE')
    const w = run(w0, DAY_END_MIN - 1)
    const arrived = w.nextId - w0.nextId
    expect(w.phase).toBe('RUNNING')
    expect(arrived).toBeGreaterThan(0)
    // 이탈 = 들어온 사람(인내 초과) + 문 앞에서 돌아간 사람(반려). 자리 부족이 0이라 이 등식이 닫힌다.
    expect(w.stats.leftCount).toBe(arrived + w.stats.leftNoDept)
    expect(w.stats.leftNoDept).toBeGreaterThan(0) // 나머지 세 과는 실제로 돌려보내졌다
    expect(w.pawns.filter(p => p.kind === 'PATIENT')).toEqual([]) // 의사는 남는다(이 세계엔 있다)
  })

  it(`대기 환자는 딱 ${PATIENCE_MIN}분까지는 남고, 한 분 더 지나면 떠난다`, () => {
    let w = noExamRoomWorld(3)
    while (!w.pawns.some(p => p.stage === 'WAITING')) {
      w = tick(w, 1)
      if (w.minute > 200) throw new Error('전제 실패 — 아무도 앉지 않았다')
    }
    const id = w.pawns.find(p => p.stage === 'WAITING')!.id
    w = tick(w, PATIENCE_MIN)
    expect(w.pawns.find(p => p.id === id)?.stage).toBe('WAITING')      // 경계 안 — 아직 기다린다
    w = tick(w, 1)
    expect(w.pawns.find(p => p.id === id)?.stage).toBe('LEFT_WAITING') // 경계 밖 — 떠난다
  })

  it('결정론: 같은 시드면 하루 결과 동일', () => {
    expect(run(hospitalWorld(11))).toEqual(run(hospitalWorld(11)))
  })

  it('시드가 다르면 도착 패턴이 다르다 — 도착이 실제로 시드에 걸려 있다', () => {
    const arrivals = (seed: number) => {
      let w = hospitalWorld(seed)
      const out: number[] = []
      for (let i = 0; i < DAY_TICKS; i++) {
        const before = w.nextId
        w = tick(w, 1)
        if (w.nextId !== before) out.push(w.minute)
      }
      return out
    }
    expect(arrivals(3).length).toBeGreaterThan(0)
    expect(arrivals(3)).not.toEqual(arrivals(4))
  })

  it('주가 다르면 하루가 다르다 — 2주차는 1주차의 재방송이 아니다', () => {
    // startNextWeek이 day를 1로 되돌리므로, 도착 시드에 week가 없으면 2주차 1일차가 1주차
    // 1일차와 **완전히 동일**해진다(같은 분에 같은 환자). 에러는 안 나고 게임만 죽는다.
    // 주 말고 다른 변수는 전부 같게 두고 week만 바꿔 그 축 하나를 겨눈다.
    const dayOf = (week: number) => {
      let w = { ...hospitalWorld(3), week }
      for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
      return w.days[0]
    }
    const week1 = dayOf(1)
    const week2 = dayOf(2)
    expect(week1.examsDone).toBeGreaterThan(0) // 계측기가 0으로 헛돌지 않았다
    expect(week2.examsDone).toBeGreaterThan(0)
    expect(week1.day).toBe(week2.day)          // 같은 '1일차'인데
    expect(week2).not.toEqual(week1)           // 하루의 내용은 다르다
  })

  it('날이 바뀌면 스트림이 통째로 갈린다 — 분을 callSeed의 index 슬롯에 넣지 않는다', () => {
    // callSeed의 슬롯 산술은 (((week*7 + day)*97 + index)*101 + salt)라 **index 폭이 97**이다.
    // 분(0..479)을 그 슬롯에 넣으면 day+1이 index+97과 **같은 시드**가 되어, 매일이 전날의
    // 97분 시프트 재방송이 된다(실측: 인접 날 겹침 383/383 — 하루의 80%). daysim 독스트링이
    // "index를 스트림 축으로 쓰지 마라"고 경고한 바로 그 함정이라, 날 키를 먼저 해시한다.
    const w = createWorld(7)
    expect(arrivalSeed({ ...w, day: 1, minute: 97 })).not.toBe(arrivalSeed({ ...w, day: 2, minute: 0 }))
  })

  it('주·날·분 전 조합에서 도착 시드가 겹치지 않는다', () => {
    // 위 한 점만 잠그면 "그 한 쌍만 피하는" 폴딩도 통과한다 — 겹침은 스트림 전체의 성질이라
    // 전수로 잰다(8주 × 7일 × 도착 창 = 26,880 튜플, 순수 산술이라 값싸다).
    const w = createWorld(7)
    const seen = new Set<number>()
    let count = 0
    for (let week = 1; week <= 8; week++) {
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        for (let minute = 0; minute < ARRIVAL_WINDOW_MIN; minute++) {
          seen.add(arrivalSeed({ ...w, week, day, minute }))
          count++
        }
      }
    }
    expect(count).toBe(8 * DAYS_PER_WEEK * ARRIVAL_WINDOW_MIN)
    expect(seen.size).toBe(count) // 중복 0
  })

  it('결정론은 유지된다 — 같은 시드·같은 주면 하루가 완전히 같다', () => {
    // week를 시드에 넣었다고 무작위가 새로 생기면 안 된다(재현 불가 = 디버깅 불가).
    const dayOf = () => {
      let w = { ...hospitalWorld(3), week: 4 }
      for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
      return w
    }
    expect(dayOf()).toEqual(dayOf())
  })

  it(`도착 창이 닫히면 새 환자가 오지 않는다 — 경계 분(${ARRIVAL_WINDOW_MIN})은 닫힌 쪽이다`, () => {
    // 시드 5는 **480분에 도착 판정이 통과하는** 시드다(아래 전제로 못박음). 좌석은 45개라
    // 자리 부족으로 반려될 일도 없다 — 그래서 경계를 `>`로 잘못 쓰면 여기서 한 명이 더 들어온다.
    // 아무 시드나 쓰면 그 분에 판정이 애초에 실패해 경계 오류가 조용히 통과한다.
    // 전제는 **arrivalSeed를 불러서** 세운다 — 공식을 여기 손으로 다시 쓰면(예전에 그랬다)
    // 도착 시드가 바뀌는 날 이 전제만 조용히 낡아 "통과하는 시드"가 아니게 된다.
    const w0 = roomySeatsWorld(5)
    expect(seededUnit(arrivalSeed({ ...w0, minute: ARRIVAL_WINDOW_MIN }))).toBeLessThan(ARRIVAL_PROB_PER_MIN)
    // 경계 분(480)을 **캡처 뒤에** 두는 게 핵심이다. 480분까지 돌린 뒤 세면 그 분의 도착이
    // 이미 기준값에 섞여 들어가, 경계를 틀려도 차이가 안 보인다(실측으로 이 함정을 밟았다).
    let w = tick(w0, ARRIVAL_WINDOW_MIN - 1)
    const idBeforeDusk = w.nextId
    w = tick(w, 200) // 480분이 이 구간의 첫 분이다
    expect(w.nextId).toBe(idBeforeDusk)
  })
})

describe('대기실 좌석', () => {
  it('그려진 의자 수 == 앉을 수 있는 좌석 수 (홀수 내부 폭 포함)', () => {
    // 화면이 곧 수용 용량이라는 등식. **앉는 자리가 의자 그 자체가 된 뒤로 구조적으로 참**이다
    // (좌석이 겹칠 수가 없다). 옛 계약에서는 앞 타일을 나눠 갖는 의자 쌍이 좌석 하나로 접혀
    // 이 등식이 배치에 따라 깨졌고, 그래서 여러 크기를 순회해야 그게 보였다 — 순회는 남긴다:
    // 등식이 다시 배치에 얽히는 날 이 자리가 먼저 운다.
    for (const [rw, rh] of [[8, 6], [11, 7], [7, 5], [9, 6], [4, 4], [10, 9]]) {
      const r = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: rw, h: rh })
      if (!r.ok) throw new Error(`전제 실패: ${rw}x${rh}`)
      const chairs = r.world.furniture.filter(f => f.kind === 'CHAIR').length
      expect(chairs).toBeGreaterThan(0)
      expect(waitingSeats(r.world).length).toBe(chairs)
    }
  })

  it('빽빽하게 놓은 의자도 좌석이 겹치지 않는다 — 자리가 곧 그 의자다', () => {
    // 옛 계약에서는 이 입력이 좌석 **하나**로 접혔다: 두 의자가 앞 타일 (10,6)을 나눠 가졌다.
    // 앉는 자리가 의자 그 자체가 된 뒤로 겹침은 구조적으로 불가능하다 — 그래서 이 자리는
    // "안전망"이 아니라 **등식의 증인**이 된다(의자 둘 = 좌석 둘, 배치와 무관).
    const r = placeRoom(createWorld(1), { type: 'WAITING', x: 4, y: 4, w: 8, h: 6 })
    if (!r.ok) throw new Error('전제 실패')
    const packed = {
      ...r.world,
      furniture: [
        { kind: 'CHAIR' as const, x: 10, y: 5 },
        { kind: 'CHAIR' as const, x: 10, y: 7 },
      ],
    }
    expect(waitingSeats(packed)).toEqual([{ x: 10, y: 5 }, { x: 10, y: 7 }])
  })

  it('환자는 **의자 위에 앉는다** — 그리고 폰은 언제나 통행 가능한 칸에 있다', () => {
    // 사용자 보고(*"의자를 추가해도 캐릭터들이 의자를 사용 안 해"*)를 그대로 겨눈 계측기다.
    // 통행 가능 불변식은 그대로 남긴다 — 앉는다는 것이 곧 "그 칸에 선다"이므로 둘은 같은 말이다.
    let w = hospitalWorld(3)
    const chairs = new Set(w.furniture.filter(f => f.kind === 'CHAIR').map(f => `${f.x},${f.y}`))
    expect(chairs.size).toBeGreaterThan(0) // 전제: 의자가 있는 병원이다
    let everSeated = false
    for (let i = 0; i < 120; i++) {
      w = tick(w, 1)
      for (const p of w.pawns) expect(isWalkable(w, p.x, p.y)).toBe(true)
      if (w.pawns.some(p => p.stage === 'WAITING' && chairs.has(`${p.x},${p.y}`))) everSeated = true
    }
    expect(w.pawns.some(p => p.stage === 'WAITING')).toBe(true) // 계측기가 헛돌지 않았다
    expect(everSeated).toBe(true)
  })

  it('좌석 수보다 많이 받지 않는다 — 자리 없으면 발길을 돌린다', () => {
    let w = hospitalWorld(3)
    // 좌석 수는 **대기실 영역 안의** 의자 수다 — 가구에 소속 필드가 없어 좌표로 센다.
    const waiting = computeRegions(w).find(r => r.type === 'WAITING')!
    const seats = w.furniture.filter(
      f => f.kind === 'CHAIR' && waiting.tiles.has(tileIndex(f.x, f.y)),
    ).length
    for (let i = 0; i < DAY_TICKS; i++) {
      w = tick(w, 1)
      const seated = w.pawns.filter(p => p.stage === 'ENTERING' || p.stage === 'WAITING')
      expect(seated.length).toBeLessThanOrEqual(seats)
      const spots = new Set(seated.map(p => `${p.dest!.x},${p.dest!.y}`))
      expect(spots.size).toBe(seated.length) // 두 환자가 한 자리를 노리지 않는다
    }
  })
})

describe('진료 배정', () => {
  it('의사는 빈 진료 슬롯에 배정돼 그 책상 옆에 선다', () => {
    const w = tick(hospitalWorld(3), 5)
    // 배정의 단위가 **책상**이다 — `deskAt`은 그 책상의 좌표다(설계 §4).
    const exam = computeRegions(w).find(r => r.type === 'EXAM')!
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const desk = w.furniture.find(f => f.kind === 'DESK' && exam.tiles.has(tileIndex(f.x, f.y)))!
    expect(doc.deskAt).toEqual({ x: desk.x, y: desk.y })
    expect(Math.abs(doc.x - desk.x) + Math.abs(doc.y - desk.y)).toBe(1)
    expect(isWalkable(w, doc.x, doc.y)).toBe(true)
  })

  it('두 의사가 한 방을 나눠 갖지 않는다', () => {
    // 의사 전원이 진료실과 **같은 과**여야 이 테스트가 겨누는 것(방 독점)이 관측된다 —
    // 과가 다르면 배정 자체가 안 일어나 "한 명만 배정" 단언이 항진명제가 된다(라우팅 도입 후 조정).
    let w = hospitalWorld(3)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 9, y: 9 })
    w = tick(w, 5)
    const desks = w.pawns.filter(p => p.kind === 'DOCTOR').map(p => p.deskAt)
    expect(desks.filter(Boolean)).toHaveLength(1) // EXAM 방이 하나뿐이니 한 명만 배정된다
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 30, y: 30 })
    const r = placeRoom(w, { type: 'EXAM', x: 6, y: 13, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    w = tick(r.world, 30)
    const assigned = w.pawns.filter(p => p.kind === 'DOCTOR').map(p => p.deskAt).filter((d): d is Pt => !!d)
    expect(new Set(assigned.map(ptKey)).size).toBe(assigned.length)
    expect(assigned).toHaveLength(2)
  })

  it('책상 3개 = 의사 3명 — 큰 진료실에서 셋이 동시에 진료한다(이 재설계의 촉발 문제)', () => {
    let w = run(multiDeskWorld(3), 80)
    const docs = w.pawns.filter(p => p.kind === 'DOCTOR')
    expect(docs).toHaveLength(3)
    // 셋 다 앉았고, **서로 다른 책상**이다(점유의 단일 출처가 deskAt이라 이중 배정이 불가능하다).
    expect(docs.every(d => !!d.deskAt)).toBe(true)
    expect(new Set(docs.map(d => ptKey(d.deskAt!))).size).toBe(3)

    w = run(seatPatientsOutsideBigRoom(w, 3), 15)
    expect(w.pawns.filter(p => p.stage === 'IN_EXAM')).toHaveLength(3)
    // 세 환자가 각자 다른 의자 앞에 앉는다 — 슬롯의 환자의자가 책상마다 배타적이기 때문이다.
    const seats = w.pawns.filter(p => p.stage === 'IN_EXAM').map(p => ptKey(p.dest!))
    expect(new Set(seats).size).toBe(3)
  })

  it('의자 없는 책상은 슬롯이 아니다 — 넷째 의사는 앉지 못한다', () => {
    let w = multiDeskWorld(4)
    w = run(furnish(w, 'DESK', [{ x: 7, y: 10 }]), 80) // 의자를 안 붙인 책상
    expect(w.pawns.filter(p => p.kind === 'DOCTOR' && p.deskAt)).toHaveLength(3)
    // 계측기가 헛돌지 않았다 — 그 책상에 의자를 붙이면 넷째도 앉는다.
    const withChair = run(furnish(w, 'CHAIR', [{ x: 8, y: 10 }]), 80)
    expect(withChair.pawns.filter(p => p.kind === 'DOCTOR' && p.deskAt)).toHaveLength(4)
  })

  it('앉아 있던 책상을 철거하면 배정이 풀리고 빈 슬롯으로 옮겨 앉는다', () => {
    // 철거는 이제 플레이어가 언제든 누르는 도구다(설계 §2). 배정을 안 풀면 그 의사는 없는
    // 책상을 문 채 영원히 놀고(환자도 안 받는다) 되돌릴 방법이 없다.
    let w = run(multiDeskWorld(1), 80)
    const before = w.pawns.find(p => p.kind === 'DOCTOR')!
    expect(before.deskAt).toEqual({ x: 7, y: 7 }) // 전제: 첫 책상에 앉았다
    const d = demolish(w, [before.deskAt!])
    if (!d.ok) throw new Error('전제 실패 — 철거 거부')
    w = run(d.world, 80)
    const after = w.pawns.find(p => p.kind === 'DOCTOR')!
    expect(after.deskAt).toEqual({ x: 10, y: 7 }) // 남은 슬롯 중 첫 번째로 옮겨 앉았다
  })

  it(`진료는 정확히 ${EXAM_DURATION_MIN}분 걸린다`, () => {
    let w = hospitalWorld(3)
    while (!w.pawns.some(p => p.stage === 'IN_EXAM')) {
      w = tick(w, 1)
      if (w.minute > ARRIVAL_WINDOW_MIN) throw new Error('전제 실패 — 진료가 시작되지 않았다')
    }
    const before = w.stats.examsDone
    w = tick(w, EXAM_DURATION_MIN - 1)
    expect(w.stats.examsDone).toBe(before)     // 19분엔 아직 안 끝난다
    w = tick(w, 1)
    expect(w.stats.examsDone).toBe(before + 1) // 20분에 정확히 끝난다
    // 끝난 그 분에 의사를 놓아준다 — doctorId를 지우는 것이 유휴 복귀의 유일한 표현이다.
    // 안 지워도 환자가 퇴장하며 결국 풀리지만, 그동안 진료실이 걷는 시간만큼 놀아버린다.
    expect(w.pawns.find(p => p.stage === 'LEAVING')?.doctorId).toBeUndefined()
  })

  it('진료실에 아직 도착하지 않은 의사는 환자를 받지 않는다', () => {
    const r1 = placeRoom(createWorld(3), { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
    if (!r1.ok) throw new Error('전제 실패')
    const r2 = placeRoom(r1.world, { type: 'EXAM', x: 6, y: 6, w: 6, h: 5 })
    if (!r2.ok) throw new Error('전제 실패')
    let w = spawnDoctor(r2.world, 'INTERNAL_MEDICINE', { x: 44, y: 29 }) // 대각선 반대편
    /* 나머지 세 과 의사도 세운다 — **관측 표본을 위해서다**(규칙과 무관).
       접수처 반려가 생긴 뒤로 안 보는 과 환자는 폰이 안 만들어지는데, 이 계측기의 창은
       의사가 방에 닿기까지의 **27분**뿐이라(실측) 도착이 그 사이 1~2건이다. 내과만 보면
       그중 45%만 남아 표본이 말라 아래 `sawWaitingWhileOutside`가 헛돈다.
       이 셋은 진료실이 없어(방은 내과 하나뿐) 아무도 안 받는다 — 판정에는 영향이 없다. */
    for (const dept of ['GENERAL_SURGERY', 'CARDIOLOGY', 'AESTHETICS'] as const) {
      w = spawnDoctor(w, dept, { x: 45, y: 29 })
    }
    const exam = { x: 6, y: 6, w: 6, h: 5 } // 위에서 지은 진료실 — 방 객체가 없으니 좌표가 곧 방이다
    let sawWaitingWhileOutside = false
    for (let i = 0; i < 120; i++) {
      w = tick(w, 1)
      const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
      const inside = doc.x >= exam.x && doc.x < exam.x + exam.w && doc.y >= exam.y && doc.y < exam.y + exam.h
      if (inside) break
      if (w.pawns.some(p => p.stage === 'WAITING')) sawWaitingWhileOutside = true
      expect(w.pawns.every(p => p.stage !== 'TO_EXAM' && p.stage !== 'IN_EXAM')).toBe(true)
    }
    expect(sawWaitingWhileOutside).toBe(true) // 계측기가 헛돌지 않았다 — 실제로 기다린 환자가 있었다
  })

  it('진료실 **영역 밖**에 선 의사는 그 방 환자를 못 받는다 — 손으로 세운 계측기', () => {
    /*
      바로 위 자연 흐름 테스트는 이 규칙을 **관측하지 못한다**(돌연변이 실측 2026-07-28):
      `insideRegion`을 항상 참으로 바꿔도 통과한다 — 의사가 걷는 동안 마침 *그 과* 대기 환자가
      앉아 있어야 하는데 그건 시드에 달렸기 때문이다. 전환 **전**의 `insideRoom`도 똑같이
      살아남았으므로 이건 이번 전환이 만든 구멍이 아니라 물려받은 구멍이고, 소속 판정이
      사각형에서 영역으로 바뀐 김에 여기서 막는다.

      대조군을 함께 두는 것이 핵심이다: "안 받는다"만 재면 **아무도 안 받는 세계**(자리가 없거나
      과가 안 맞는)에서도 통과한다. 같은 세계에서 의사를 방 안으로 되돌리면 실제로 받아야 한다.
    */
    const base = seatPatient(soloDeptWorld('INTERNAL_MEDICINE'), 'INTERNAL_MEDICINE')
    const doc = base.pawns.find(p => p.kind === 'DOCTOR')!
    const exam = computeRegions(base).find(r => r.tiles.has(tileIndex(doc.deskAt!.x, doc.deskAt!.y)))!
    expect(exam.tiles.has(tileIndex(doc.x, doc.y))).toBe(true) // 전제: 지금은 방 안이다

    // ① 의사만 방 밖(문 앞 복도)으로 옮긴다 — 배정(deskAt)은 그대로다.
    const outsideAt = { x: 9, y: 12 }
    expect(exam.tiles.has(tileIndex(outsideAt.x, outsideAt.y))).toBe(false) // 전제: 정말 영역 밖이다
    const outside = tick({
      ...base,
      pawns: base.pawns.map(p => (p.id === doc.id ? { ...p, ...outsideAt, path: [], dest: undefined } : p)),
    }, 1)
    expect(outside.pawns.find(p => p.id === 'pat-hand')!.stage).toBe('WAITING')

    // ② 같은 세계, 의사만 방 안에 그대로 — 이쪽은 실제로 불려 간다(계측기가 헛돌지 않았다).
    const inside = tick({
      ...base,
      pawns: base.pawns.map(p => (p.id === doc.id ? { ...p, path: [], dest: undefined } : p)),
    }, 1)
    expect(inside.pawns.find(p => p.id === 'pat-hand')!.stage).toBe('TO_EXAM')
  })

  it('먼저 앉은 환자가 먼저 불린다 — 폰 배열 순서가 아니라 도착 시각순', () => {
    // 두 순서는 자연 흐름에선 대개 일치한다(폰은 도착순으로 append된다). 어긋나는 건
    // 나중에 온 환자가 더 가까운 자리에 먼저 앉을 때 — 그 경우를 손으로 만들어 잰다.
    let w = tick(hospitalWorld(3), 5) // 의사가 책상 옆에 선 뒤
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const seated = (id: string, at: Pt, arrivedMin: number) => ({
      id, kind: 'PATIENT' as const, x: at.x, y: at.y, path: [], dest: at,
      // 손으로 앉히는 환자에도 희망 과를 준다 — 라우팅이 삼중 일치를 요구하므로(계획 Task 2)
      // 과가 없으면 둘 다 안 불려 "도착 시각순"이라는 이 테스트의 대비가 통째로 사라진다.
      stage: 'WAITING' as const, arrivedMin, wantsDept: 'INTERNAL_MEDICINE' as const,
    })
    w = {
      ...w,
      pawns: [doc, seated('late', { x: 20, y: 21 }, w.minute - 1), seated('early', { x: 22, y: 21 }, w.minute - 30)],
    }
    w = tick(w, 1)
    expect(w.pawns.find(p => p.id === 'early')?.stage).toBe('TO_EXAM')
    expect(w.pawns.find(p => p.id === 'late')?.stage).toBe('WAITING')
  })

  it('의사 한 명은 동시에 환자 한 명만 본다', () => {
    let w = hospitalWorld(3)
    const docs = w.pawns.filter(p => p.kind === 'DOCTOR').length
    for (let i = 0; i < DAY_TICKS; i++) {
      w = tick(w, 1)
      const inExam = w.pawns.filter(p => p.stage === 'IN_EXAM')
      expect(inExam.length).toBeLessThanOrEqual(docs)
      const byDoc = new Set(w.pawns.filter(p => p.doctorId).map(p => p.doctorId))
      expect(byDoc.size).toBe(w.pawns.filter(p => p.doctorId).length)
    }
  })

  it('진료가 끝난 의사는 다시 환자를 받는다 — 한 방에서 여러 건이 돈다', () => {
    const w = run(hospitalWorld(3))
    expect(w.stats.examsDone).toBeGreaterThan(1)
  })
})

describe('퇴장', () => {
  it('입구에 닿은 환자는 배열에서 사라진다 — 폰이 무한히 쌓이지 않는다', () => {
    // ⚠️ 예전엔 900분까지 돌려 "환자가 하나도 안 남았다"로 쟀지만, 마감 정산(600분)이 남은
    // 환자를 통째로 쓸어가면서 그 계측기가 무력해졌다 — 퇴장 제거를 통째로 없애도 정산만으로
    // 통과한다. 그래서 ① 특정 퇴장 환자가 **하루 안에**(RUNNING) 사라지는지 ② 정산 직전까지
    // 폰이 쌓이지 않는지를 직접 잰다.
    let w = until(hospitalWorld(3), x => x.pawns.some(p => p.stage === 'LEAVING'))
    const leavingId = w.pawns.find(p => p.stage === 'LEAVING')!.id
    for (let i = 0; i < 60 && w.pawns.some(p => p.id === leavingId); i++) w = tick(w, 1)
    expect(w.pawns.some(p => p.id === leavingId)).toBe(false)
    expect(w.phase).toBe('RUNNING') // 정산이 치운 게 아니라 제 발로 걸어 나갔다

    const w0 = hospitalWorld(3)
    const eod = run(w0, DAY_END_MIN - 1) // 마감 직전 — 아직 정산이 없는 시점
    expect(eod.nextId - w0.nextId).toBeGreaterThan(10)                 // 하루 종일 사람이 오갔는데
    // 상한이 **2**인 이유: 수납이 생긴 뒤로 진료가 끝난 환자는 곧장 입구로 가지 않고 카운터를
    // 한 번 들른다(설계 2026-07-29 §3). 그래서 어느 순간에도 '수납하러 가는 중' 한 명과
    // '나가는 중' 한 명이 동시에 있을 수 있다 — 쌓이지 않는다는 계약은 그대로다.
    expect(eod.pawns.filter(p => p.kind === 'PATIENT').length).toBeLessThanOrEqual(2)
    expect(eod.pawns.filter(p => p.kind === 'DOCTOR')).toHaveLength(1)
  })

  it('떠나는 환자는 입구를 향한다', () => {
    let w = hospitalWorld(3)
    let seen = false
    for (let i = 0; i < DAY_TICKS && !seen; i++) {
      w = tick(w, 1)
      for (const p of w.pawns) {
        if (p.stage === 'LEAVING' || p.stage === 'LEFT_WAITING') {
          expect(p.dest).toEqual(ENTRANCE)
          seen = true
        }
      }
    }
    expect(seen).toBe(true)
  })
})

describe('시간 계약', () => {
  it('환자 흐름도 시간 분할 불변이다 — 120분 한 번 = 1분 120번', () => {
    expect(tick(hospitalWorld(3), 120)).toEqual(run(hospitalWorld(3), 120))
  })

  it('tick은 입력 세계를 변형하지 않는다 (환자 흐름 포함)', () => {
    const w = hospitalWorld(3)
    const snapshot = structuredClone(w)
    tick(w, 200)
    expect(w).toEqual(snapshot)
  })

  it('경로가 끊긴 환자를 도착으로 오인하지 않는다 — 판정은 path가 아니라 위치다', () => {
    let w = until(hospitalWorld(3), x => x.pawns.some(p => p.stage === 'ENTERING'))
    const target = w.pawns.find(p => p.stage === 'ENTERING')!
    const before = w.stats.leftCount
    w = { ...w, pawns: w.pawns.map(p => (p.id === target.id ? { ...p, path: [] } : p)) }
    w = tick(w, 1)
    // path가 0이라고 "앉은" 게 아니다. 좌초로 처리돼 떠나거나(LEFT_WAITING) 제거될 뿐,
    // 어떤 경로로도 WAITING이 되어선 안 된다 — 그러면 앉지도 않은 환자가 좌석을 먹는다.
    const after = w.pawns.find(p => p.id === target.id)
    expect(after?.stage ?? 'LEFT_WAITING').toBe('LEFT_WAITING')
    expect(after?.arrivedMin).toBeUndefined()
    expect(w.stats.leftCount).toBe(before + 1)
  })
})

describe('좌초 해소', () => {
  // 경로 무효화의 나머지 절반. tick은 갈 수 없게 된 폰의 path를 비우는 데서 멈추고,
  // "그래서 그 폰을 어떻게 할 것인가"는 스테이지 로직 몫이다. 이 절반이 빠져 있으면
  // 합법적인 건설 **한 번**으로 환자가 영구 정지하고, TO_EXAM이면 doctorId를 문 채라
  // 진료실까지 같이 잠겨 이후 하루 수익이 0이 된다.

  it('진료실 문이 봉인되면 가던 환자가 좌초를 벗어나고 의사도 풀린다', () => {
    let w = until(hospitalWorld(3), x => x.pawns.some(p => p.stage === 'TO_EXAM'))
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const before = w.stats.leftCount
    // EXAM(6,6,6,5)의 문은 (9,10). 그 바깥 (9,11)을 새 방의 윗벽으로 덮으면 진료실이 고립된다.
    const sealed = placeRoom(w, { type: 'WARD', x: 6, y: 11, w: 6, h: 5 })
    if (!sealed.ok) throw new Error('전제 실패')
    w = tick(sealed.world, 30)
    expect(w.stats.leftCount).toBeGreaterThan(before)
    expect(w.pawns.some(p => p.stage === 'TO_EXAM')).toBe(false) // 영구 정지한 폰이 없다
    expect(w.pawns.some(p => p.doctorId === doc.id)).toBe(false) // 의사 자물쇠가 풀렸다
  })

  it('대기실이 봉인되면 들어오던 환자가 해소되고 잔류 폰이 남지 않는다', () => {
    let w = until(hospitalWorld(3), x => x.pawns.some(p => p.stage === 'ENTERING'))
    const before = w.stats.leftCount
    // WAITING(18,20,8,6)의 문은 (22,25). 그 바깥 (22,26)을 덮어 대기실을 고립시킨다.
    const sealed = placeRoom(w, { type: 'WARD', x: 18, y: 26, w: 8, h: 4 })
    if (!sealed.ok) throw new Error('전제 실패')
    w = tick(sealed.world, 300)
    expect(w.stats.leftCount).toBeGreaterThan(before)
    expect(w.pawns.filter(p => p.kind === 'PATIENT')).toEqual([])
  })

  it('대기실 하나가 봉인돼도 다른 대기실로 계속 받는다 — 도달 불가 좌석이 병원을 잠그지 않는다', () => {
    // 가구 순서상 A의 의자가 좌석 후보로 먼저 잡힌다. 후보 하나가 도달 불가라고 거기서
    // 문전박대로 끝내면, B의 빈 의자 6개가 전부 멀쩡한데도 신규 도착이 영원히 0이 된다.
    // 철거가 없으니 세션 내 비가역 소프트락 — 좌초 교착과 같은 병의 '도착 경로' 쌍둥이다.
    let w = until(twoWaitingWorld(3), x => x.pawns.some(p => p.stage === 'WAITING'))
    const sealed = placeRoom(w, { type: 'WARD', x: 18, y: 26, w: 8, h: 4 }) // A의 문(22,25) 봉인
    if (!sealed.ok) throw new Error('전제 실패')
    w = sealed.world
    const idAfterSeal = w.nextId
    const examsAfterSeal = w.stats.examsDone
    w = run(w, 300)
    expect(w.nextId).toBeGreaterThan(idAfterSeal) // 신규 도착이 이어진다
    const b = { x: 30, y: 20, w: 8, h: 6 } // twoWaitingWorld의 둘째 대기실(B) — 봉인 대상이 아니다
    const inB = w.pawns.filter(p => p.stage === 'WAITING'
      && p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h)
    expect(inB.length).toBeGreaterThan(0)                      // B에 실제로 앉는다
    expect(w.stats.examsDone).toBeGreaterThan(examsAfterSeal)  // 진료도 계속 돈다
  })

  it('좌초로 풀려난 의사는 다시 환자를 받는다 — 진료가 재개된다', () => {
    // 문을 봉인해버리면 진료실이 고립돼 "재개"를 볼 수 없다(그 방엔 아무도 못 간다).
    // 그래서 여기선 tick의 재탐색 실패 결과(path 비움)만 손으로 만들고 방은 멀쩡히 둔다.
    let w = until(hospitalWorld(3), x => x.pawns.some(p => p.stage === 'TO_EXAM'))
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const stuck = w.pawns.find(p => p.stage === 'TO_EXAM')!
    const before = w.stats.leftCount
    w = { ...w, pawns: w.pawns.map(p => (p.id === stuck.id ? { ...p, path: [] } : p)) }
    w = tick(w, 1)
    expect(w.stats.leftCount).toBe(before + 1)
    expect(w.pawns.some(p => p.doctorId === doc.id)).toBe(false)
    const examsAtRelease = w.stats.examsDone
    w = run(w, 300)
    expect(w.stats.examsDone).toBeGreaterThan(examsAtRelease) // 자물쇠가 진짜로 풀렸다
  })
})

describe('희망 과 배정 — 분포와 스트림 축', () => {
  it('누적 구간이 계획 표(45/20/15/20)를 그대로 싣는다 — 경계는 아래쪽이 닫힌다', () => {
    // 경계 바로 앞/뒤를 쌍으로 잰다(T-085). 한쪽만 재면 `<`를 `<=`로 바꿔도 안 걸린다.
    expect(ARRIVAL_DEPT_MIX.map(([dept]) => dept))
      .toEqual(['INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'CARDIOLOGY', 'AESTHETICS'])
    expect(pickWantsDept(0, ARRIVAL_DEPT_MIX)).toBe('INTERNAL_MEDICINE')
    expect(pickWantsDept(0.4499999, ARRIVAL_DEPT_MIX)).toBe('INTERNAL_MEDICINE')
    expect(pickWantsDept(0.45, ARRIVAL_DEPT_MIX)).toBe('GENERAL_SURGERY')      // 45%가 내과의 상한(닫힌 쪽)
    expect(pickWantsDept(0.6499999, ARRIVAL_DEPT_MIX)).toBe('GENERAL_SURGERY')
    expect(pickWantsDept(0.65, ARRIVAL_DEPT_MIX)).toBe('CARDIOLOGY')
    expect(pickWantsDept(0.7999999, ARRIVAL_DEPT_MIX)).toBe('CARDIOLOGY')
    expect(pickWantsDept(0.8, ARRIVAL_DEPT_MIX)).toBe('AESTHETICS')
    expect(pickWantsDept(0.9999999, ARRIVAL_DEPT_MIX)).toBe('AESTHETICS')
  })

  it('[0,1) 밖의 값은 조용히 마지막 과로 접히지 않고 던진다', () => {
    // 폴백으로 접으면 상한 표가 틀려도(예: 마지막이 0.9) 아무도 모른 채 미용이 늘어난다.
    expect(() => pickWantsDept(1, ARRIVAL_DEPT_MIX)).toThrow()
    expect(() => pickWantsDept(-0.1, ARRIVAL_DEPT_MIX)).toThrow()
  })

  it('실제 스트림의 분포가 45/20/15/20에 붙는다 — 표만 맞고 시드가 쏠리면 여기서 걸린다', () => {
    const counts = new Map<SimDeptKey, number>(HIRABLE_DEPTS.map(d => [d, 0]))
    const w0 = createWorld(7)
    let n = 0
    for (let week = 1; week <= 8; week++) {
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        for (let minute = 0; minute < ARRIVAL_WINDOW_MIN; minute++) {
          const d = pickWantsDept(seededUnit(wantsDeptSeed({ ...w0, week, day, minute })), ARRIVAL_DEPT_MIX)
          counts.set(d, counts.get(d)! + 1)
          n++
        }
      }
    }
    expect(n).toBe(8 * DAYS_PER_WEEK * ARRIVAL_WINDOW_MIN)
    const share = (d: SimDeptKey) => counts.get(d)! / n
    expect(share('INTERNAL_MEDICINE')).toBeCloseTo(0.45, 2)
    expect(share('GENERAL_SURGERY')).toBeCloseTo(0.20, 2)
    expect(share('CARDIOLOGY')).toBeCloseTo(0.15, 2)
    expect(share('AESTHETICS')).toBeCloseTo(0.20, 2)
  })

  it('희망 과는 도착 판정과 **다른 축**이다 — 두 스트림의 시드 집합이 겹치지 않는다', () => {
    // salt를 공유하면 두 시드가 통째로 같아진다. 그러면 도착이 성립하는 분은 정의상
    // seededUnit < ARRIVAL_PROB_PER_MIN(0.125)이라 **도착한 환자가 전원 내과**가 된다 —
    // 분포가 45/20/15/20이 아니라 100/0/0/0으로 붕괴하는데 에러는 하나도 안 난다.
    // 한 점만 비교하면 "그 점만 피하는" 오프셋도 통과하므로 구간 전수의 집합 교집합으로 잰다.
    const w0 = createWorld(7)
    const arrivals = new Set<number>()
    const wants = new Set<number>()
    for (let week = 1; week <= 8; week++) {
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        for (let minute = 0; minute < ARRIVAL_WINDOW_MIN; minute++) {
          arrivals.add(arrivalSeed({ ...w0, week, day, minute }))
          wants.add(wantsDeptSeed({ ...w0, week, day, minute }))
        }
      }
    }
    expect(arrivals.size).toBe(8 * DAYS_PER_WEEK * ARRIVAL_WINDOW_MIN) // 계측기가 헛돌지 않았다
    expect([...wants].filter(s => arrivals.has(s))).toEqual([])
  })

  it('희망 과 시드도 주·날·분 전 조합에서 겹치지 않는다(T-087 — index 슬롯 금지)', () => {
    const w0 = createWorld(7)
    const seen = new Set<number>()
    let count = 0
    for (let week = 1; week <= 8; week++) {
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        for (let minute = 0; minute < ARRIVAL_WINDOW_MIN; minute++) {
          seen.add(wantsDeptSeed({ ...w0, week, day, minute }))
          count++
        }
      }
    }
    expect(count).toBe(8 * DAYS_PER_WEEK * ARRIVAL_WINDOW_MIN)
    expect(seen.size).toBe(count)
    // 회귀 한 점 — 분을 callSeed의 index 슬롯(폭 97)에 넣으면 여기가 같아진다.
    expect(wantsDeptSeed({ ...w0, day: 1, minute: 97 })).not.toBe(wantsDeptSeed({ ...w0, day: 2, minute: 0 }))
  })

  it('세계 시드가 다르면 희망 과 스트림도 다르다 — 판마다 같은 환자가 오지 않는다', () => {
    const streamOf = (seed: number) => {
      const w0 = createWorld(seed)
      return Array.from({ length: 200 }, (_, minute) =>
        pickWantsDept(seededUnit(wantsDeptSeed({ ...w0, minute })), ARRIVAL_DEPT_MIX))
    }
    expect(streamOf(3)).not.toEqual(streamOf(4))
  })

  it('실제 도착한 환자에도 4과가 전부 실린다 — 배정이 도착 흐름에 붙어 있다', () => {
    const { wants } = runCollectingWants(fourDeptWorld(3))
    expect(wants.length).toBeGreaterThan(20) // 계측기가 헛돌지 않았다
    expect([...new Set(wants)].sort()).toEqual([...HIRABLE_DEPTS].sort())
  })
})

describe('지역 — 도착 배율과 믹스 폴백', () => {
  /** 도착만 관측되는 큰 병원 — 대기실 하나(의자 35개) + 4과 의사.
   *  진료실이 없어 아무도 안 불리고, 4과가 다 있어 접수처 반려도 없다: 남는 것은 **도착뿐**이다.
   *  ⚠️ 4과 채용이 전제라 풀이 가장 얇은 RURAL(미2/내3/외2/순1)에서도 성립해야 한다. */
  function arrivalProbe(region: 'URBAN' | 'NEWTOWN' | 'PROVINCIAL' | 'RURAL', seed = 5): SimWorld {
    const r = placeRoom(createWorld(seed, { region }), { type: 'WAITING', x: 2, y: 2, w: 16, h: 11 })
    if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
    let w = r.world
    for (const dept of HIRABLE_DEPTS) w = hire(w, dept)
    return w
  }

  /**
   * 하루 동안 **실제로 환자 폰이 태어난 분**의 집합 — 판정식을 테스트에 복제하지 않고
   * 진짜 경로(tick)로 잰다. 공식을 옮겨 적으면 훅을 통째로 떼어내도 초록으로 남는다.
   */
  function arrivalMinutes(w0: SimWorld, days = 3): Set<string> {
    const out = new Set<string>()
    const seats = waitingSeats(w0).length
    for (let day = 1; day <= days; day++) {
      let w: SimWorld = { ...w0, day, minute: 0 }
      for (let i = 0; i < ARRIVAL_WINDOW_MIN - 1; i++) {
        const before = w.nextId
        w = tick(w, 1)
        if (w.nextId > before) out.add(`${day}:${w.minute}`)
        // 계측기 자기검사 — 좌석이 차는 순간 문간 반려가 시작되고, 그때부터 이 함수는
        // 배율이 아니라 **대기실 크기**를 잰다(배율이 클수록 더 깎여 부분집합이 거짓 실패한다).
        expect(w.pawns.filter(p => p.kind === 'PATIENT').length).toBeLessThan(seats)
      }
      // 아무도 반려되지 않았다 — 4과가 다 있으니 leftNoDept는 0이어야 한다.
      expect(w.stats.leftNoDept).toBe(0)
    }
    return out
  }

  it('배율은 **시드가 아니라 문턱**을 곱한다 — RURAL ⊆ URBAN ⊆ NEWTOWN', () => {
    // 시드 쪽을 흔들어 확률을 올리는 구현도 "몇 배"는 만족한다. 그러나 그러면 지역이 도착
    // **시각의 배열 자체**를 바꿔 "지역 간 몇 배"를 잴 수 없고, 기존 회귀는 URBAN만 재므로
    // 그 변조가 어디에도 안 걸린다. 부분집합이 그 구별점이다(이벤트 배율 때와 같은 계측).
    const rural = arrivalMinutes(arrivalProbe('RURAL'))
    const urban = arrivalMinutes(arrivalProbe('URBAN'))
    const newtown = arrivalMinutes(arrivalProbe('NEWTOWN'))
    expect(urban.size).toBeGreaterThan(100) // 계측기가 헛돌지 않았다
    expect([...rural].filter(m => !urban.has(m))).toEqual([])
    expect([...urban].filter(m => !newtown.has(m))).toEqual([])
    // 건수 단조 — 부분집합만으로는 세 지역이 전부 같아도 통과한다(배율을 통째로 뗀 구현).
    expect(rural.size).toBeLessThan(urban.size)
    expect(urban.size).toBeLessThan(newtown.size)
  })

  it('배율 1인 지역은 스트림이 **완전히 같다** — PROVINCIAL의 도착은 URBAN과 한 분도 안 다르다', () => {
    // 두 지역은 믹스만 다르고 도착 배율은 둘 다 1이다. 믹스가 도착 판정 쪽으로 새면
    // (희망 과 시드가 도착 시드와 얽히면) 여기서 갈린다.
    expect([...arrivalMinutes(arrivalProbe('PROVINCIAL'))])
      .toEqual([...arrivalMinutes(arrivalProbe('URBAN'))])
  })

  it('믹스 폴백 사슬 — 평시엔 **지역 표**가, 전염병 날엔 **이벤트 표**가 이긴다', () => {
    // `arrivalDeptMixOf(w) ?? simRegion(w.region).deptMix ?? ARRIVAL_DEPT_MIX` — 순서가 계약이다.
    // 전염병 날은 어느 지역이든 내과로 쏠린다(PROVINCIAL의 미용 5% 표가 그날 하루 꺼진다).
    // 사슬을 뒤집으면(지역이 이벤트를 이기면) 아래 두 밴드 중 하나가 반드시 깨진다.
    const shareOf = (w0: SimWorld) => {
      const wants = new Map<string, SimDeptKey>()
      let w: SimWorld = { ...w0, day: 1, minute: 0 }
      for (let i = 0; i < ARRIVAL_WINDOW_MIN - 1; i++) {
        w = tick(w, 1)
        for (const p of w.pawns) if (p.kind === 'PATIENT' && p.wantsDept) wants.set(p.id, p.wantsDept)
      }
      const all = [...wants.values()]
      expect(all.length).toBeGreaterThan(30) // 계측기 자기검사
      return (d: SimDeptKey) => all.filter(x => x === d).length / all.length
    }
    // PROVINCIAL 평시 — 지역 표(내과 55% · 미용 5%)가 전국 표(45/20)를 대체했다.
    const plain = shareOf(arrivalProbe('PROVINCIAL'))
    expect(plain('INTERNAL_MEDICINE')).toBeGreaterThan(0.48)
    expect(plain('AESTHETICS')).toBeLessThan(0.12)
    // 같은 지역, 전염병 날 — 이벤트 표(내과 75%)가 지역 표를 **이긴다**.
    const epidemic = shareOf(applyEvent(arrivalProbe('PROVINCIAL'), 'EPIDEMIC'))
    expect(epidemic('INTERNAL_MEDICINE')).toBeGreaterThan(0.70)
  })

  it('지역 표가 없으면 전국 표로 떨어진다 — URBAN 믹스는 45/20/15/20 그대로다', () => {
    // 사슬의 마지막 칸(`?? ARRIVAL_DEPT_MIX`)을 잰다. URBAN이 deptMix null인 것이 곧
    // 기존 분포 회귀가 무변인 이유다(I-R1 스트림 중립).
    const w0 = arrivalProbe('URBAN')
    const wants = new Map<string, SimDeptKey>()
    let w: SimWorld = { ...w0, day: 1, minute: 0 }
    for (let i = 0; i < ARRIVAL_WINDOW_MIN - 1; i++) {
      w = tick(w, 1)
      for (const p of w.pawns) if (p.kind === 'PATIENT' && p.wantsDept) wants.set(p.id, p.wantsDept)
    }
    const all = [...wants.values()]
    const share = (d: SimDeptKey) => all.filter(x => x === d).length / all.length
    expect(share('INTERNAL_MEDICINE')).toBeGreaterThan(0.35)
    expect(share('INTERNAL_MEDICINE')).toBeLessThan(0.55)
    expect(share('AESTHETICS')).toBeGreaterThan(0.12) // 지역 표(미용 5%)가 잘못 섞이면 여기서 걸린다
  })
})

describe('과 라우팅 — 삼중 일치', () => {
  it('내과만 있는 병원에서 미용 환자는 **문 앞에서** 돌아간다 — 대기실에 앉지 않는다', () => {
    // 옛 계약은 "들어와서 진료받지 못하고 떠난다"였다(사용자 보고: *"내과가 없는데 내과 환자가
    // 대기실에서 기다린다 — 말이 안 된다"*). 지금은 접수처가 문 앞에서 말해 준다.
    // **놓쳤다는 사실 자체는 그대로 남는다** — 그게 이 게임의 논지라 leftNoDept로 계속 센다.
    const { w, wants } = runCollectingWants(hospitalWorld(3), DAY_END_MIN - 1)
    expect(wants).not.toContain('AESTHETICS') // 미용 환자는 폰조차 안 만들어진다
    expect(w.stats.leftNoDept).toBeGreaterThan(0) // 그래도 놓친 수로는 남는다
    expect(w.phase).toBe('RUNNING')
    // 장부에 남은 과는 내과 하나뿐 — 다른 과 환자는 한 건도 돈이 되지 않았다.
    expect(Object.keys(w.stats.byDept)).toEqual(['INTERNAL_MEDICINE'])
    expect(w.stats.byDept.INTERNAL_MEDICINE!.patients).toBeGreaterThan(0)
    expect(w.stats.leftCount).toBeGreaterThan(0)
  })

  it('의사는 자기 과 진료실에만 배정된다', () => {
    const w = tick(fourDeptWorld(3), 60)
    const regions = computeRegions(w)
    const doctors = w.pawns.filter(p => p.kind === 'DOCTOR')
    expect(doctors).toHaveLength(HIRABLE_DEPTS.length)
    for (const doc of doctors) {
      expect(doc.deskAt).toBeDefined() // 전제: 전원이 방을 얻었다(항진명제 방지)
      expect(regions.find(r => r.tiles.has(tileIndex(doc.deskAt!.x, doc.deskAt!.y)))!.dept).toBe(doc.dept)
    }
  })

  it('과가 없는 의사에게는 빈 진료실이 있어도 방이 가지 않는다', () => {
    // 채용을 거치지 않은 손세계 폰. 과 없는 의사가 진료실을 물면 그 방이 통째로 잠긴다.
    const r = placeRoom(createWorld(3), { type: 'EXAM', dept: 'CARDIOLOGY', x: 6, y: 6, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    const deptless: Pawn = { id: 'doc-x', kind: 'DOCTOR', x: 9, y: 12, path: [] }
    const w = tick({ ...r.world, pawns: [deptless] }, 60)
    expect(w.pawns[0].deskAt).toBeUndefined()
  })

  it('방의 과가 다르면 진료가 성립하지 않는다 — 삼중 일치의 방 축', () => {
    // 의사(내과) == 환자(내과)인데 방만 순환기다. 방 조건을 빼면 여기서 진료가 돈다.
    // ⚠️ 방의 과를 바꾸는 자리가 `rooms`에서 **`designations`(용도 앵커)**로 옮겨왔다 — 규칙이
    //    읽는 곳이 거기이기 때문이다. 옛 자리(`rooms`)를 고치면 이 테스트는 아무것도 안 바꾼 채
    //    통과하고, 삼중 일치의 방 축을 지워도 죽지 않는 계측기가 된다.
    const base = soloDeptWorld('INTERNAL_MEDICINE')
    const mismatched = {
      ...base,
      designations: base.designations.map(
        d => (d.type === 'EXAM' ? { ...d, dept: 'CARDIOLOGY' as const } : d),
      ),
    }
    const w = run(seatPatient(mismatched, 'INTERNAL_MEDICINE'), 120)
    expect(w.stats.examsDone).toBe(0)
    expect(w.stats.byDept).toEqual({})
  })

  it('의사의 과가 다르면 진료가 성립하지 않는다 — 삼중 일치의 의사 축', () => {
    // 방(내과) == 환자(내과)인데 의사만 순환기다. 의사 조건을 빼면 여기서 진료가 돈다.
    const base = soloDeptWorld('INTERNAL_MEDICINE')
    const mismatched = {
      ...base,
      pawns: base.pawns.map(p => (p.kind === 'DOCTOR' ? { ...p, dept: 'CARDIOLOGY' as const } : p)),
    }
    const w = run(seatPatient(mismatched, 'INTERNAL_MEDICINE'), 120)
    expect(w.stats.examsDone).toBe(0)
    expect(w.stats.byDept).toEqual({})
  })

  it('환자의 과가 다르면 진료가 성립하지 않는다 — 삼중 일치의 환자 축', () => {
    const w = run(seatPatient(soloDeptWorld('INTERNAL_MEDICINE'), 'AESTHETICS'), 120)
    expect(w.stats.examsDone).toBe(0)
    expect(w.stats.leftCount).toBeGreaterThan(0) // 기다리다 인내를 넘겨 떠났다
  })

  it('삼중이 맞으면 진료가 돈다 — 위 세 테스트가 "아무것도 안 도는 세계"를 재고 있지 않다', () => {
    const w = run(seatPatient(soloDeptWorld('INTERNAL_MEDICINE'), 'INTERNAL_MEDICINE'), 120)
    expect(w.stats.examsDone).toBe(1)
  })

  it('한 과가 밀려도 다른 과는 계속 돈다 — 과별로 줄이 따로 선다', () => {
    const { w } = runCollectingWants(fourDeptWorld(3), DAY_END_MIN - 1)
    for (const dept of HIRABLE_DEPTS) {
      expect(w.stats.byDept[dept]?.patients ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('과별 수익', () => {
  it('진료 한 건의 수익은 그 과의 수가다 — 건당 상수가 아니다', () => {
    // 같은 세계·같은 한 건인데 과만 다르다. 30 고정으로 되돌리면 내과(12)에서 곧바로 걸린다.
    for (const dept of HIRABLE_DEPTS) {
      const w0 = soloDeptWorld(dept)
      const w = run(seatPatient(w0, dept), 120)
      const rate = simDept(dept).examRevenueManwon
      expect(w.stats.examsDone).toBe(1)
      expect(w.treasuryManwon - w0.treasuryManwon).toBe(rate)
      expect(w.stats.byDept).toEqual({ [dept]: { patients: 1, revenueManwon: rate } })
    }
  })

  it('불변식: Σ byDept.patients == examsDone, 과별 수익 == 환자 수 × 그 과 수가', () => {
    // ⚠️ **정산 뒤에** 잰다(마감 직전이 아니라). 수납이 생긴 뒤로 `examsDone`은 진료가 끝난
    // 순간 오르고 `byDept.patients`는 **돈을 받은** 순간 오르므로(dept.SimDeptStats 주석의
    // "돈을 받고 본 사람"), 그 사이 카운터로 걷는 중인 환자가 있으면 둘이 한 건 어긋난다 —
    // 실측으로 31 대 32였다. 등식은 마감이 걷던 사람까지 수납으로 인정하면서 닫힌다.
    const w = run(fourDeptWorld(3), DAY_END_MIN)
    expect(w.phase).toBe('DAY_END')
    // ⚠️ 이 등식은 **외래만 도는 세계**의 성질이다 — byDept는 응급 처치도 같은 줄에 접는데
    // 응급 수가는 외래의 수십 배라(emergency.ts) 한 건만 섞여도 등식이 깨진다. 이 병원엔
    // 병동이 없어 응급이 전부 되돌아가므로 성립하고, 그 전제를 우연이 아니라 단언으로 둔다.
    expect(w.stats.emergencyAccepted).toBe(0)
    expect(w.stats.examsDone).toBeGreaterThan(0)
    expect(patientsOf(w.stats.byDept)).toBe(w.stats.examsDone)
    for (const [key, stat] of Object.entries(w.stats.byDept) as [SimDeptKey, { patients: number; revenueManwon: number }][]) {
      expect(stat.revenueManwon).toBe(stat.patients * simDept(key).examRevenueManwon)
    }
  })

  it('금고 불변식: 금고 = 초기 − 건설비 + Σ(과별 환자 × 과 수가)', () => {
    const w0 = fourDeptWorld(3)
    const w = run(w0, DAY_END_MIN - 1)
    expect(w.stats.emergencyAccepted).toBe(0) // 전제: 병동이 없어 응급 수익이 섞이지 않았다
    const expected = HIRABLE_DEPTS.reduce(
      (sum, d) => sum + (w.stats.byDept[d]?.patients ?? 0) * simDept(d).examRevenueManwon, 0)
    expect(expected).toBeGreaterThan(0) // 계측기가 0으로 헛돌지 않았다
    expect(w.treasuryManwon).toBe(w0.treasuryManwon + expected)
    expect(deptRevenueSum(w.stats.byDept)).toBe(expected)
  })

  it('결정론: 4과 병원도 같은 시드면 하루가 완전히 같다', () => {
    expect(run(fourDeptWorld(11))).toEqual(run(fourDeptWorld(11)))
  })

  it('과가 없는 환자가 진료를 끝내면 조용히 0원이 아니라 즉시 터진다', () => {
    // wantsDept 없이 IN_EXAM에 도달하는 경로는 손세계뿐이다. 카탈로그 조회가 undefined를
    // 통과하면 수익이 NaN으로 금고에 번지는데 NaN은 아무 예외도 안 낸다(무성 실패).
    const base = soloDeptWorld('INTERNAL_MEDICINE')
    const orphan: Pawn = {
      id: 'pat-orphan', kind: 'PATIENT', x: 9, y: 11, path: [], dest: { x: 9, y: 11 },
      stage: 'IN_EXAM', examUntilMin: base.minute + 1,
    }
    expect(() => tick({ ...base, pawns: [...base.pawns, orphan] }, 2)).toThrow()
  })
})
