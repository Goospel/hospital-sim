import { describe, it, expect } from 'vitest'
import { initSystem, poolRemaining, canHire, POOL_INITIAL, hirablePool, deriveSystem } from './system'
import { initWorld, stepWorld, regionOf, hireFromRegions } from './world'

describe('전국 의사 풀 — 세상에 존재하는 유한 의사 수', () => {
  it('초기 풀 = 각색 고정값, poolInitial은 표시용 사본', () => {
    const s = initSystem()
    expect(s.pool).toEqual(POOL_INITIAL)
    expect(s.poolInitial).toEqual(POOL_INITIAL)
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(POOL_INITIAL.THORACIC_SURGERY)
  })

  /*
    옛 세 테스트는 `hireDelta`(풀에서 직접 차감)로 잔여를 만들었다. 그 함수가 삭제되고
    차감의 원천이 **세계**(hireFromRegions)로 옮겨졌으므로, 같은 계약을 새 경로로 다시 잠근다 —
    "채용하면 잔여가 준다"·"0이면 못 뽑는다"·"음수 없음"은 여전히 이 게임의 벽이다(spec §6 인터페이스 불변).
  */
  it('채용 증분만큼 잔여가 준다(이동, 창출 아님) — 이제 세계에서 빠진 결과로 준다', () => {
    const s = deriveSystem(hireFromRegions(initWorld(), { CARDIOLOGY: 2 }, 2))
    expect(poolRemaining(s, 'CARDIOLOGY')).toBe(POOL_INITIAL.CARDIOLOGY - 2)
  })

  it('잔여 0이면 못 뽑는다(canHire=false) — 돈 있어도 못 사는 벽', () => {
    const s = deriveSystem(hireFromRegions(initWorld(), { THORACIC_SURGERY: POOL_INITIAL.THORACIC_SURGERY }, 2))
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(0)
    expect(canHire(s, 'THORACIC_SURGERY', 1)).toBe(false)
    expect(canHire(s, 'THORACIC_SURGERY', 0)).toBe(true)
  })

  it('풀은 0 밑으로 안 내려간다(클램프) — 요청이 존재 인원을 넘어도', () => {
    const s = deriveSystem(hireFromRegions(initWorld(), { THORACIC_SURGERY: 999 }, 2))
    expect(poolRemaining(s, 'THORACIC_SURGERY')).toBe(0)
  })
})

describe('채용 풀 = 세계의 파생 (spec §6)', () => {
  it('POOL_INITIAL은 초기 세계의 METRO+RURAL 합에서 파생된다 — 값은 기존(2/4/3/3/5/6) 그대로', () => {
    expect(POOL_INITIAL).toEqual({
      THORACIC_SURGERY: 2, CARDIOLOGY: 4, OBSTETRICS: 3,
      NEUROSURGERY: 3, GENERAL_SURGERY: 5, INTERNAL_MEDICINE: 6,
    })
    expect(hirablePool(initWorld().regions)).toEqual(POOL_INITIAL)
  })

  it('deriveSystem: 드리프트로 지방 의사가 빠지면 채용 풀도 그만큼 준다 — 수도권 정착 의사는 안 온다', () => {
    const drifted = stepWorld(initWorld(), 2)
    const system = deriveSystem(drifted)
    const total = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0)
    expect(total(system.pool)).toBeLessThan(total(POOL_INITIAL))
    expect(system.poolInitial).toEqual(POOL_INITIAL) // 표시용 초기 사본은 불변
  })
})

describe('hireFromRegions — 채용이 세계에서 사람을 빼간다', () => {
  it('1명 채용하면 METRO 또는 RURAL에서 정확히 1명 준다(CAPITAL 불변)', () => {
    const before = initWorld()
    const after = hireFromRegions(before, { CARDIOLOGY: 1 }, 2)
    const loss = (key: 'CAPITAL' | 'METRO' | 'RURAL') =>
      regionOf(before, key).doctors.CARDIOLOGY - regionOf(after, key).doctors.CARDIOLOGY
    expect(loss('CAPITAL')).toBe(0)
    expect(loss('METRO') + loss('RURAL')).toBe(1)
  })

  it('결정론: 같은 입력은 같은 결과', () => {
    expect(hireFromRegions(initWorld(), { OBSTETRICS: 2 }, 3))
      .toEqual(hireFromRegions(initWorld(), { OBSTETRICS: 2 }, 3))
  })

  it('풀이 빈 과의 채용 요청은 세계를 안 바꾼다(음수 없음)', () => {
    const world = initWorld()
    const after = hireFromRegions(world, { THORACIC_SURGERY: 99 }, 2)
    // 흉부는 METRO 0 + RURAL 2 — 2명까지만 빠지고 그 이상은 무시
    expect(regionOf(after, 'METRO').doctors.THORACIC_SURGERY).toBe(0)
    expect(regionOf(after, 'RURAL').doctors.THORACIC_SURGERY).toBe(0)
  })

  it('hireFromRegions는 입력 world를 변이하지 않는다', () => {
    const world = initWorld()
    const snapshot = JSON.parse(JSON.stringify(world))
    hireFromRegions(world, { CARDIOLOGY: 2 }, 2)
    expect(world).toEqual(snapshot)
  })
})
