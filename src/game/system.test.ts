import { describe, it, expect } from 'vitest'
import { initSystem, poolRemaining, hireDelta, canHire, backgroundAttrition, POOL_INITIAL } from './system'

describe('전국 의사 풀 — 세상에 존재하는 유한 의사 수', () => {
  it('초기 풀 = 각색 고정값, poolInitial은 표시용 사본', () => {
    const s = initSystem()
    expect(s.pool).toEqual(POOL_INITIAL)
    expect(s.poolInitial).toEqual(POOL_INITIAL)
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(POOL_INITIAL.THORACIC_SURGERY)
  })

  it('채용 증분만큼 잔여가 준다(이동, 창출 아님)', () => {
    const s = hireDelta(initSystem(), { CARDIOLOGY: 2 })
    expect(poolRemaining(s, 'CARDIOLOGY')).toBe(POOL_INITIAL.CARDIOLOGY - 2)
  })

  it('잔여 0이면 못 뽑는다(canHire=false) — 돈 있어도 못 사는 벽', () => {
    let s = initSystem()
    s = hireDelta(s, { THORACIC_SURGERY: POOL_INITIAL.THORACIC_SURGERY })
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(0)
    expect(canHire(s, 'THORACIC_SURGERY', 1)).toBe(false)
    expect(canHire(s, 'THORACIC_SURGERY', 0)).toBe(true)
  })

  it('풀은 0 밑으로 안 내려간다(클램프)', () => {
    const s = hireDelta(initSystem(), { THORACIC_SURGERY: 999 })
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(0)
  })

  it('배경 감소 — 매주 결정론으로 준다(내가 안 뽑아도 마른다)', () => {
    const s0 = initSystem()
    const s1 = backgroundAttrition(s0, 2)
    const total0 = Object.values(s0.pool).reduce((a, b) => a + b, 0)
    const total1 = Object.values(s1.pool).reduce((a, b) => a + b, 0)
    expect(total1).toBeLessThan(total0)
    expect(backgroundAttrition(s0, 2)).toEqual(backgroundAttrition(s0, 2)) // 결정론
  })

  it('배경 감소도 0 클램프 — 이미 빈 과는 음수 안 됨', () => {
    let s = initSystem()
    s.pool.THORACIC_SURGERY = 0
    for (let w = 2; w < 30; w++) s = backgroundAttrition(s, w)
    expect(Object.values(s.pool).every((n) => n >= 0)).toBe(true)
  })
})
