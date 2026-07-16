import { describe, it, expect } from 'vitest'
import { createCallQueue, classifyCall, initReceiving, decide } from './receiving'
import { buildHospital } from './setup'
import type { Hospital, SetupChoices } from './types'

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

function hospitalOf(c: SetupChoices): Hospital {
  return buildHospital(c).hospital
}

describe('createCallQueue — 고정 5통(결정론)', () => {
  it('5통이고 STEMI·워크인·일반응급을 모두 포함', () => {
    const q = createCallQueue()
    expect(q).toHaveLength(5)
    const kinds = new Set(q.map((c) => c.kind))
    expect(kinds).toContain('STEMI')
    expect(kinds).toContain('COSMETIC_WALKIN')
    expect(kinds).toContain('GENERAL_EMERGENCY')
    expect(q.every((c) => c.id)).toBe(true)
  })

  it('STEMI 콜은 lawsuitRisk=true, 워크인은 false', () => {
    const q = createCallQueue()
    expect(q.filter((c) => c.kind === 'STEMI').every((c) => c.lawsuitRisk)).toBe(true)
    expect(q.filter((c) => c.kind === 'COSMETIC_WALKIN').every((c) => !c.lawsuitRisk)).toBe(true)
  })

  it('결정론 — 같은 큐', () => {
    expect(createCallQueue()).toEqual(createCallQueue())
  })
})

describe('classifyCall — 하드락 vs 선택', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const general = q.find((c) => c.kind === 'GENERAL_EMERGENCY')!

  it('워크인은 늘 CHOICE(명랑하게 받을 수 있음)', () => {
    expect(classifyCall(hospitalOf(collaborator), walkin)).toBe('CHOICE')
  })

  it('STEMI: 순환기 없으면 하드락, 있으면 선택', () => {
    expect(classifyCall(hospitalOf(collaborator), stemi)).toBe('HARDLOCK_REJECT')
    expect(classifyCall(hospitalOf(conscientious), stemi)).toBe('CHOICE')
  })

  it('일반응급: 병상+응급실 있으면 선택(배후 무관)', () => {
    expect(classifyCall(hospitalOf(collaborator), general)).toBe('CHOICE')
  })
})

describe('decide 리듀서 — 장부·소송 누적', () => {
  it('워크인 수용 → 순이익 델타↑, 소송 노출 0', () => {
    // 첫 콜을 워크인으로 만들기 위해 큐를 직접 구성
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const s = initReceiving(hospitalOf(collaborator), [walkin])
    const after = decide(s, true)
    expect(after.netProfitDeltaBillions).toBeGreaterThan(0)
    expect(after.lawsuitExposure).toBe(0)
    expect(after.done).toBe(true)
    expect(s.index).toBe(0) // 원본 불변 — decide는 입력 state를 변형하지 않는다
  })

  it('STEMI 하드락 콜은 accept=true여도 수용 안 됨(가드) — 델타·노출 불변', () => {
    const stemi = createCallQueue().find((c) => c.kind === 'STEMI')!
    const s = initReceiving(hospitalOf(collaborator), [stemi]) // 순환기 없음 → 하드락
    const after = decide(s, true)
    expect(after.log[0].disposition).toBe('HARDLOCK_REJECT')
    expect(after.log[0].accepted).toBe(false)
    expect(after.netProfitDeltaBillions).toBe(0)
    expect(after.lawsuitExposure).toBe(0)
  })

  it('양심 병원의 STEMI 수용 → 적자 델타 + 소송 노출 +1', () => {
    const stemi = createCallQueue().find((c) => c.kind === 'STEMI')!
    const s = initReceiving(hospitalOf(conscientious), [stemi])
    const after = decide(s, true)
    expect(after.log[0].disposition).toBe('CHOICE')
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaBillions).toBeLessThan(0)
    expect(after.lawsuitExposure).toBe(1)
  })

  it('선택 콜 거절 → 델타·노출 불변, 인덱스 전진', () => {
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const s = initReceiving(hospitalOf(collaborator), [walkin])
    const after = decide(s, false)
    expect(after.netProfitDeltaBillions).toBe(0)
    expect(after.index).toBe(1)
    expect(after.done).toBe(true)
  })

  it('전체 큐 소진 시 done, 이후 decide는 에러', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false)
    expect(s.done).toBe(true)
    expect(() => decide(s, false)).toThrow()
  })
})
