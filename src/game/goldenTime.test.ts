import { describe, it, expect } from 'vitest'
import { createGoldenTimer, advance, isExpired } from './goldenTime'

// 골든타임: 환자가 살 수 있는 남은 시간. 순수 함수로 모델링(Date.now 미사용)해
// 결정론적으로 테스트한다. 전원 콜·문진이 시간을 소모하고, 0이 되면 환자는 죽는다.
describe('goldenTime — 골든타임 카운트다운', () => {
  it('시간을 흘리면 남은 시간이 그만큼 줄어든다', () => {
    const timer = createGoldenTimer(720) // 12분
    const after = advance(timer, 60) // 1분 경과

    expect(after.remainingSeconds).toBe(660)
    expect(after.totalSeconds).toBe(720) // 총량은 불변
  })

  it('advance 는 원본 타이머를 변경하지 않는다(불변)', () => {
    const timer = createGoldenTimer(720)
    advance(timer, 60)

    expect(timer.remainingSeconds).toBe(720)
  })

  it('남은 시간을 넘겨 흘리면 음수가 아니라 0으로 고정된다', () => {
    const timer = createGoldenTimer(720)
    const after = advance(timer, 800) // 남은 것보다 더 흘림

    expect(after.remainingSeconds).toBe(0)
  })

  it('남은 시간이 0이면 만료, 남아 있으면 만료 아님', () => {
    const fresh = createGoldenTimer(720)
    const dead = advance(fresh, 720)

    expect(isExpired(fresh)).toBe(false)
    expect(isExpired(dead)).toBe(true)
  })

  it('음수 경과 시간은 프로그래밍 오류로 간주해 throw (시간 역행 방지)', () => {
    const timer = createGoldenTimer(720)

    expect(() => advance(timer, -10)).toThrow()
  })
})
