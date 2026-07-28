import { describe, it, expect } from 'vitest'
import { minutesToTick, effectiveSpeed, SIM_MS_PER_GAME_MIN, type SimSpeed } from './useSimClock'
import { MS_PER_GAME_MIN } from '../game/hospitalMap'
import type { SimPhase } from '../sim/world'

describe('SIM_MS_PER_GAME_MIN — 시뮬 전용 페이싱', () => {
  it('1게임분 = 600ms이고, 클래식 판(50ms/분)과 독립이다', () => {
    // 페이싱은 체감의 계약이다 — 값이 바뀌면 이 테스트가 "의도한 결정인가"를 묻는다.
    // 같은 줄에서 클래식 상수도 함께 잠근다: 둘이 다시 얽히면(한쪽만 고쳐도) 여기서 깨진다.
    expect(SIM_MS_PER_GAME_MIN).toBe(600)
    expect(MS_PER_GAME_MIN).toBe(50)
  })
})

describe('minutesToTick', () => {
  it('1×: 600ms당 1분, 나머지는 이월', () => {
    expect(minutesToTick(1440, 1)).toEqual({ minutes: 2, carryMs: 240 })
  })

  it('3×: 같은 실시간에 3배의 게임 분', () => {
    expect(minutesToTick(1200, 3)).toEqual({ minutes: 6, carryMs: 0 })
  })

  it('0×(일시정지): 항상 0분, 이월도 0', () => {
    expect(minutesToTick(500, 0)).toEqual({ minutes: 0, carryMs: 0 })
  })

  it('한 분에 못 미치면 통째로 이월된다 — 프레임이 잘아도 시간이 사라지지 않게', () => {
    expect(minutesToTick(16, 1)).toEqual({ minutes: 0, carryMs: 16 })
  })

  it('3×에서 나머지가 남으면 그 나머지가 이월된다', () => {
    // 3배속 한 게임분 = 200ms. 700ms면 3분(600ms) + 100ms 이월.
    const r = minutesToTick(700, 3)
    expect(r.minutes).toBe(3)
    expect(r.carryMs).toBeCloseTo(100, 10)
  })

  it('이월분은 다음 프레임에 합쳐져 잃어버린 분이 없다(누적 보존)', () => {
    // 300ms 프레임을 5번 = 1500ms = 1×에서 정확히 2분 + 300ms 이월이어야 한다.
    let carry = 0
    let total = 0
    for (let i = 0; i < 5; i++) {
      const r = minutesToTick(carry + 300, 1)
      total += r.minutes
      carry = r.carryMs
    }
    expect(total).toBe(2)
    expect(carry).toBeCloseTo(1500 - 2 * SIM_MS_PER_GAME_MIN, 10)
  })

  it('정확히 k분치 실시간은 정확히 k분이다 — 배속 경계에서 분이 사라지지 않게', () => {
    // 나눗셈 순서를 뒤집으면(`ms / (SIM_MS_PER_GAME_MIN / speed)`) 나누기가 딱 떨어지지 않는
    // 배속에서 부동소수 오차 때문에 경계마다 한 분씩 사라진다(50ms/분 시절 실측: 3배속 250ms가
    // 15분이 아니라 14분). 600/3은 정수로 떨어져 지금은 안 드러나지만, 페이싱 값은 또 바뀔 수
    // 있으므로 **곱을 먼저 하는 순서 계약**을 계속 잠가 둔다.
    for (const speed of [1, 3] as const) {
      for (let k = 1; k <= 300; k++) {
        const r = minutesToTick((k * SIM_MS_PER_GAME_MIN) / speed, speed)
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

describe('effectiveSpeed', () => {
  const SPEEDS: SimSpeed[] = [0, 1, 3]

  /* Record<SimPhase, …>라 **새 국면이 생기면 tsc가 이 표를 못 채웠다고 막는다** — 배열로 적으면
     새 phase가 조용히 미검사로 남고, 기본값(계속 흐름)이 하필 위험한 쪽이다. */
  const RUNS: Record<SimPhase, boolean> = {
    RUNNING: true,
    DAY_END: false,
    WEEK_END: false,
    CLOSED: false,
  }

  it('RUNNING이면 플레이어가 고른 배속을 그대로 쓴다', () => {
    for (const s of SPEEDS) expect(effectiveSpeed('RUNNING', s)).toBe(s)
  })

  it('RUNNING이 아닌 모든 국면은 배속과 무관하게 0이다 — 오버레이 뒤에서 세계가 흐르지 않게', () => {
    for (const phase of Object.keys(RUNS) as SimPhase[]) {
      if (RUNS[phase]) continue
      for (const s of SPEEDS) {
        expect(`${phase} ${s}× → ${effectiveSpeed(phase, s)}`).toBe(`${phase} ${s}× → 0`)
      }
    }
  })

  it('반환값은 배속 선택지 안에 있다 — 그대로 시계·전환 시간에 쓰이므로', () => {
    for (const phase of Object.keys(RUNS) as SimPhase[]) {
      for (const s of SPEEDS) expect(SPEEDS).toContain(effectiveSpeed(phase, s))
    }
  })
})
