import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { spawnDoctor, stepMove, PAWN_TILES_PER_MIN } from './pawn'
import { tick } from './tick'
import { findPath } from './path'

describe('폰 이동', () => {
  it('경로를 분당 PAWN_TILES_PER_MIN 타일씩 소비한다', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    const doc = w.pawns[0]
    const path = findPath(w, { x: 2, y: 2 }, { x: 2, y: 12 })!
    w = { ...w, pawns: [{ ...doc, path }] }
    const after = tick(w, 3) // 3분 × 2타일 = 6타일 전진
    expect(after.pawns[0].path.length).toBe(10 - 3 * PAWN_TILES_PER_MIN)
    expect(after.pawns[0].y).toBe(2 + 3 * PAWN_TILES_PER_MIN)
  })
  it('경로가 다 떨어지면 제자리', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 5, y: 5 })
    const after = tick(w, 10)
    expect(after.pawns[0]).toMatchObject({ x: 5, y: 5, path: [] })
  })
  it('남은 경로보다 분 예산이 크면 목적지에서 멈춘다 — 초과분은 버려진다', () => {
    // stepMove의 Math.min 캡을 재는 유일한 계측기. 캡이 없으면 path[steps-1]이 undefined가 되어
    // 좌표가 NaN으로 오염된다 — 그리고 이건 도착 직전 폰이 거의 매번 밟는 경로다.
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    const path = findPath(w, { x: 2, y: 2 }, { x: 2, y: 12 })! // 10타일
    w = { ...w, pawns: [{ ...w.pawns[0], path }] }
    const after = tick(w, 10) // 20타일 예산 — 경로의 2배
    expect(after.pawns[0]).toMatchObject({ x: 2, y: 12, path: [] })
  })
  it('경로의 마지막 타일을 정확히 밟는다 — 한 칸 넘어가지 않는다', () => {
    // path[steps]로 어긋나면(off-by-one) 폰이 목적지를 지나치거나 마지막 칸을 건너뛴다.
    const p = { id: 'x', kind: 'DOCTOR' as const, x: 0, y: 0, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }
    expect(stepMove(p, 1)).toMatchObject({ x: 2, y: 0, path: [] })
    expect(stepMove({ ...p, path: [{ x: 1, y: 0 }] }, 1)).toMatchObject({ x: 1, y: 0, path: [] })
  })
  it('폰의 다른 필드는 이동해도 보존된다', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'CARDIOLOGY', { x: 2, y: 2 })
    const path = findPath(w, { x: 2, y: 2 }, { x: 4, y: 2 })!
    w = { ...w, pawns: [{ ...w.pawns[0], path, roomId: 'room-9' }] }
    const after = tick(w, 1)
    expect(after.pawns[0]).toMatchObject({ id: 'doc-1', kind: 'DOCTOR', dept: 'CARDIOLOGY', roomId: 'room-9' })
  })
  it('여러 폰이 각자 자기 경로를 소비한다 — 하나만 움직이지 않는다', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    w = spawnDoctor(w, 'CARDIOLOGY', { x: 20, y: 20 })
    const p0 = findPath(w, { x: 2, y: 2 }, { x: 2, y: 12 })!
    const p1 = findPath(w, { x: 20, y: 20 }, { x: 26, y: 20 })!
    w = { ...w, pawns: [{ ...w.pawns[0], path: p0 }, { ...w.pawns[1], path: p1 }] }
    const after = tick(w, 2) // 각자 4타일
    expect(after.pawns[0]).toMatchObject({ x: 2, y: 6 })
    expect(after.pawns[1]).toMatchObject({ x: 24, y: 20 })
  })
})

describe('spawnDoctor', () => {
  it('폰마다 고유 id를 준다 — nextId가 실제로 전진한다', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    w = spawnDoctor(w, 'CARDIOLOGY', { x: 3, y: 3 })
    expect(w.pawns.map(p => p.id)).toEqual(['doc-1', 'doc-2'])
    expect(w.nextId).toBe(3) // 안 전진하면 두 폰이 같은 id를 갖고 Task 5의 doctorId 참조가 엉킨다
  })
  it('입력 세계를 변형하지 않는다 (순수)', () => {
    const w0 = createWorld(1)
    const w1 = spawnDoctor(w0, 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    expect(w0.pawns).toEqual([])
    expect(w0.nextId).toBe(1)
    expect(w1.pawns).toHaveLength(1)
  })
})

describe('시계', () => {
  it('tick은 minute을 정확히 minutes만큼 전진시킨다', () => {
    // 계획의 이동 테스트는 전부 minute을 안 본다 — 시계가 멈춰 있어도 통과한다.
    // Task 6의 시각 표시와 Task 5의 인내·진료 만료가 전부 이 값에 걸려 있다.
    const w = createWorld(1)
    expect(tick(w, 3).minute).toBe(3)
    expect(tick(tick(w, 3), 7).minute).toBe(10)
  })
  it('0분 tick은 아무것도 바꾸지 않는다', () => {
    const w = spawnDoctor(createWorld(1), 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    expect(tick(w, 0)).toEqual(w)
  })
  it('tick은 입력 세계를 변형하지 않는다 (순수)', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    const path = findPath(w, { x: 2, y: 2 }, { x: 2, y: 12 })!
    w = { ...w, pawns: [{ ...w.pawns[0], path }] }
    tick(w, 3)
    expect(w.minute).toBe(0)
    expect(w.pawns[0]).toMatchObject({ x: 2, y: 2 })
    expect(w.pawns[0].path).toHaveLength(10)
  })
})

describe('결정론', () => {
  it('같은 시드·같은 분이면 tick 결과가 완전 동일하다', () => {
    const run = () => {
      let w = createWorld(42)
      w = spawnDoctor(w, 'GENERAL_SURGERY', { x: 3, y: 3 })
      for (let i = 0; i < 60; i++) w = tick(w, 1)
      return w
    }
    expect(run()).toEqual(run())
  })
  it('한 번에 60분 = 1분씩 60번 (시간 분할 불변식)', () => {
    // ⚠️ 이 테스트는 **지금은 공허하다** — tick의 유일한 내용이 이동이고 이동은 분에 대해
    // 선형이라(stepMove(p,60) === stepMove 60회) 배치 구현으로 바꿔도 통과한다. 실측 확인했다.
    // 그래도 남기는 이유: Task 5가 붙일 단계 전이(대기 인내 만료·진료 종료·환자 도착)는
    // 분마다 조건을 보므로 비선형이고, 그때 이 테스트가 배치 구현을 잡는 계측기가 된다.
    // 배속(1x/4x/16x)이 게임 내용을 바꾸지 않는다는 계약을 미리 못박아 두는 회귀 잠금이다.
    let a = createWorld(9); let b = createWorld(9)
    a = spawnDoctor(a, 'GENERAL_SURGERY', { x: 3, y: 3 })
    b = spawnDoctor(b, 'GENERAL_SURGERY', { x: 3, y: 3 })
    for (let i = 0; i < 60; i++) b = tick(b, 1)
    expect(tick(a, 60)).toEqual(b)
  })
  it('이동도 분할 불변이다 — 3분 한 번 = 1분 세 번', () => {
    let w = createWorld(1)
    w = spawnDoctor(w, 'INTERNAL_MEDICINE', { x: 2, y: 2 })
    const path = findPath(w, { x: 2, y: 2 }, { x: 2, y: 12 })!
    w = { ...w, pawns: [{ ...w.pawns[0], path }] }
    expect(tick(w, 3)).toEqual(tick(tick(tick(w, 1), 1), 1))
  })
})
