import { describe, it, expect } from 'vitest'
import { minutesToTick } from './useSimClock'
import { MS_PER_GAME_MIN } from '../game/hospitalMap'

describe('minutesToTick', () => {
  it('1×: 50ms당 1분, 나머지는 이월', () => {
    expect(minutesToTick(120, 1)).toEqual({ minutes: 2, carryMs: 20 })
  })

  it('3×: 같은 실시간에 3배의 게임 분', () => {
    expect(minutesToTick(100, 3)).toEqual({ minutes: 6, carryMs: 0 })
  })

  it('0×(일시정지): 항상 0분, 이월도 0', () => {
    expect(minutesToTick(500, 0)).toEqual({ minutes: 0, carryMs: 0 })
  })

  it('한 분에 못 미치면 통째로 이월된다 — 프레임이 잘아도 시간이 사라지지 않게', () => {
    expect(minutesToTick(16, 1)).toEqual({ minutes: 0, carryMs: 16 })
  })

  it('3×에서 나머지가 남으면 그 나머지가 이월된다', () => {
    // 3배속 한 게임분 = 50/3 ms. 60ms면 3분(50ms) + 10ms 이월.
    const r = minutesToTick(60, 3)
    expect(r.minutes).toBe(3)
    expect(r.carryMs).toBeCloseTo(10, 10)
  })

  it('이월분은 다음 프레임에 합쳐져 잃어버린 분이 없다(누적 보존)', () => {
    // 30ms 프레임을 5번 = 150ms = 1×에서 정확히 3분이어야 한다.
    let carry = 0
    let total = 0
    for (let i = 0; i < 5; i++) {
      const r = minutesToTick(carry + 30, 1)
      total += r.minutes
      carry = r.carryMs
    }
    expect(total).toBe(3)
    expect(carry).toBeCloseTo(150 - 3 * MS_PER_GAME_MIN, 10)
  })

  it('정확히 k분치 실시간은 정확히 k분이다 — 배속 경계에서 분이 사라지지 않게', () => {
    // 나눗셈 순서를 뒤집으면(`ms / (MS_PER_GAME_MIN / speed)`) 50/3의 부동소수 오차 때문에
    // 3배속 250ms가 14분, 500ms가 29분으로 떨어진다. 딱 떨어지는 입력에서도 틀리므로
    // 배속 재생 중 시계가 조용히 뒤처진다 — 그 순서를 이 테스트가 잠근다.
    for (const speed of [1, 3] as const) {
      for (let k = 1; k <= 300; k++) {
        const r = minutesToTick((k * MS_PER_GAME_MIN) / speed, speed)
        expect(`${speed}× k=${k} → ${r.minutes}분`).toBe(`${speed}× k=${k} → ${k}분`)
        expect(r.carryMs).toBeCloseTo(0, 9)
      }
    }
  })

  it('minutes는 항상 정수다 — tick(world, minutes)이 정수 분만 받는다', () => {
    for (const ms of [0, 1, 49, 50, 51, 333, 1000]) {
      for (const speed of [0, 1, 3]) {
        expect(Number.isInteger(minutesToTick(ms, speed).minutes)).toBe(true)
      }
    }
  })
})
