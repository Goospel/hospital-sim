import { describe, it, expect } from 'vitest'
import { createWorld, isWalkable, type SimWorld } from './world'
import { placeRoom } from './build'
import type { Pt } from './path'
import { spawnDoctor } from './pawn'
import { tick } from './tick'
import {
  ENTRANCE, EXAM_DURATION_MIN, EXAM_REVENUE_MANWON, PATIENCE_MIN,
  ARRIVAL_WINDOW_MIN, ARRIVAL_PROB_PER_MIN,
} from './patientFlow'
import { seededUnit } from '../game/daysim'

const DAY_TICKS = 600 // 도착 창(480분) + 뒷정리 여유

/** 대기실 + 진료실 + 의사 1명 — 진료가 실제로 돌아가는 최소 병원 */
function hospitalWorld(seed: number) {
  const w = createWorld(seed)
  const r1 = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!r1.ok) throw new Error('전제 실패')
  const r2 = placeRoom(r1.world, { type: 'EXAM', x: 6, y: 6, w: 6, h: 5 })
  if (!r2.ok) throw new Error('전제 실패')
  return spawnDoctor(r2.world, 'INTERNAL_MEDICINE', { x: 8, y: 8 })
}

/** 대기실만 — 의사가 없어 아무도 진료받지 못한다 */
function waitingOnlyWorld(seed: number) {
  const r = placeRoom(createWorld(seed), { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!r.ok) throw new Error('전제 실패')
  return r.world
}

/** 좌석 45개 대기실 — 자리 부족이 구조적으로 일어나지 않는 세계(이탈 원인을 인내로 고정) */
function roomySeatsWorld(seed: number) {
  const r = placeRoom(createWorld(seed), { type: 'WAITING', x: 14, y: 14, w: 20, h: 12 })
  if (!r.ok) throw new Error('전제 실패')
  return r.world
}

const run = (w: SimWorld, minutes = DAY_TICKS) => {
  for (let i = 0; i < minutes; i++) w = tick(w, 1)
  return w
}

describe('환자 흐름', () => {
  it('하루를 돌리면 환자가 도착하고, 진료가 발생해 수익이 쌓인다', () => {
    const w0 = hospitalWorld(3)
    const w = run(w0)
    expect(w.stats.examsDone).toBeGreaterThan(0)
    expect(w.treasuryManwon).toBe(w0.treasuryManwon + w.stats.examsDone * EXAM_REVENUE_MANWON)
  })

  it('불변식: 의사 0명이면 진료 0건', () => {
    const w = run(waitingOnlyWorld(3))
    expect(w.stats.examsDone).toBe(0)
  })

  it('대기실이 없으면 환자가 들어오자마자 이탈로 집계된다', () => {
    const w = run(createWorld(3))
    expect(w.stats.examsDone).toBe(0)
    expect(w.stats.leftCount).toBeGreaterThan(0)
    expect(w.pawns).toEqual([]) // 발길을 돌린 환자는 폰으로 만들지도 않는다
  })

  it(`인내 ${PATIENCE_MIN}분 초과 대기자는 LEFT_WAITING으로 떠난다`, () => {
    const w0 = waitingOnlyWorld(3)
    const w = run(w0)
    for (const p of w.pawns.filter(p => p.stage === 'WAITING')) {
      expect(w.minute - p.arrivedMin!).toBeLessThanOrEqual(PATIENCE_MIN)
    }
    expect(w.stats.leftCount).toBeGreaterThan(0)
    expect(w.treasuryManwon).toBe(w0.treasuryManwon) // 이탈은 수익 0
  })

  it('자리가 넉넉해도 의사가 없으면 결국 전원이 인내 초과로 떠난다', () => {
    // leftCount의 두 원인(자리 없음 / 인내 초과)을 가르는 계측기.
    // 좌석 45개짜리 대기실이면 자리 부족은 0건이라, 남는 이탈은 전부 인내 초과다.
    const w0 = roomySeatsWorld(3)
    const w = run(w0, 900)
    const arrived = w.nextId - w0.nextId
    expect(arrived).toBeGreaterThan(0)
    expect(w.stats.leftCount).toBe(arrived)
    expect(w.pawns).toEqual([])
  })

  it(`대기 환자는 딱 ${PATIENCE_MIN}분까지는 남고, 한 분 더 지나면 떠난다`, () => {
    let w = waitingOnlyWorld(3)
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

  it(`도착 창이 닫히면 새 환자가 오지 않는다 — 경계 분(${ARRIVAL_WINDOW_MIN})은 닫힌 쪽이다`, () => {
    // 시드 13은 **480분에 도착 판정이 통과하는** 시드다(아래 전제로 못박음). 좌석은 45개라
    // 자리 부족으로 반려될 일도 없다 — 그래서 경계를 `>`로 잘못 쓰면 여기서 한 명이 더 들어온다.
    // 아무 시드나 쓰면 그 분에 판정이 애초에 실패해 경계 오류가 조용히 통과한다.
    expect(seededUnit(13 * 100_000 + 1 * 1_000 + ARRIVAL_WINDOW_MIN)).toBeLessThan(ARRIVAL_PROB_PER_MIN)
    // 경계 분(480)을 **캡처 뒤에** 두는 게 핵심이다. 480분까지 돌린 뒤 세면 그 분의 도착이
    // 이미 기준값에 섞여 들어가, 경계를 틀려도 차이가 안 보인다(실측으로 이 함정을 밟았다).
    let w = tick(roomySeatsWorld(13), ARRIVAL_WINDOW_MIN - 1)
    const idBeforeDusk = w.nextId
    w = tick(w, 200) // 480분이 이 구간의 첫 분이다
    expect(w.nextId).toBe(idBeforeDusk)
  })
})

describe('대기실 좌석', () => {
  it('환자는 의자 타일이 아니라 그 앞 통행 타일에 선다', () => {
    let w = hospitalWorld(3)
    for (let i = 0; i < 120; i++) {
      w = tick(w, 1)
      for (const p of w.pawns) expect(isWalkable(w, p.x, p.y)).toBe(true)
    }
    expect(w.pawns.some(p => p.stage === 'WAITING')).toBe(true) // 계측기가 헛돌지 않았다
  })

  it('좌석 수보다 많이 받지 않는다 — 자리 없으면 발길을 돌린다', () => {
    let w = hospitalWorld(3)
    const seats = w.furniture.filter(f => f.kind === 'CHAIR' && f.roomId === w.rooms[0].id).length
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
  it('의사는 빈 EXAM 방에 배정돼 책상 옆에 선다', () => {
    const w = tick(hospitalWorld(3), 5)
    const exam = w.rooms.find(r => r.type === 'EXAM')!
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const desk = w.furniture.find(f => f.roomId === exam.id && f.kind === 'DESK')!
    expect(doc.roomId).toBe(exam.id)
    expect(Math.abs(doc.x - desk.x) + Math.abs(doc.y - desk.y)).toBe(1)
    expect(isWalkable(w, doc.x, doc.y)).toBe(true)
  })

  it('두 의사가 한 방을 나눠 갖지 않는다', () => {
    let w = hospitalWorld(3)
    w = spawnDoctor(w, 'CARDIOLOGY', { x: 9, y: 9 })
    w = tick(w, 5)
    const rooms = w.pawns.filter(p => p.kind === 'DOCTOR').map(p => p.roomId)
    expect(rooms.filter(Boolean)).toHaveLength(1) // EXAM 방이 하나뿐이니 한 명만 배정된다
    w = spawnDoctor(w, 'GENERAL_SURGERY', { x: 30, y: 30 })
    const r = placeRoom(w, { type: 'EXAM', x: 6, y: 13, w: 6, h: 5 })
    if (!r.ok) throw new Error('전제 실패')
    w = tick(r.world, 30)
    const assigned = w.pawns.filter(p => p.kind === 'DOCTOR').map(p => p.roomId).filter(Boolean)
    expect(new Set(assigned).size).toBe(assigned.length)
    expect(assigned).toHaveLength(2)
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
    const exam = w.rooms.find(r => r.type === 'EXAM')!
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

  it('먼저 앉은 환자가 먼저 불린다 — 폰 배열 순서가 아니라 도착 시각순', () => {
    // 두 순서는 자연 흐름에선 대개 일치한다(폰은 도착순으로 append된다). 어긋나는 건
    // 나중에 온 환자가 더 가까운 자리에 먼저 앉을 때 — 그 경우를 손으로 만들어 잰다.
    let w = tick(hospitalWorld(3), 5) // 의사가 책상 옆에 선 뒤
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const seated = (id: string, at: Pt, arrivedMin: number) => ({
      id, kind: 'PATIENT' as const, x: at.x, y: at.y, path: [], dest: at,
      stage: 'WAITING' as const, arrivedMin,
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
    // 900분: 마지막 도착(479분)이 대기·진료·퇴장을 다 마치고도 남는 여유.
    // 600분으로 끊으면 마지막 한 명이 입구 한 칸 앞에서 걸어가는 중이라 정상인데도 실패한다.
    const w = run(hospitalWorld(3), 900)
    expect(w.pawns.filter(p => p.kind === 'PATIENT')).toEqual([])
    expect(w.pawns).toHaveLength(1) // 의사만 남는다
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
    let w = hospitalWorld(3)
    while (!w.pawns.some(p => p.stage === 'ENTERING')) {
      w = tick(w, 1)
      if (w.minute > ARRIVAL_WINDOW_MIN) throw new Error('전제 실패 — 환자가 오지 않았다')
    }
    const target = w.pawns.find(p => p.stage === 'ENTERING')!
    w = { ...w, pawns: w.pawns.map(p => (p.id === target.id ? { ...p, path: [] } : p)) }
    w = tick(w, 1)
    const after = w.pawns.find(p => p.id === target.id)!
    expect(after.stage).toBe('ENTERING') // 길이 끊긴 것이지 앉은 게 아니다
    expect(after.arrivedMin).toBeUndefined()
  })
})
