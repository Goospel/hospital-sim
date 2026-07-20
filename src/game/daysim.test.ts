import { describe, it, expect } from 'vitest'
import { seededUnit, callSeed, procedureDurationMin, arrivalMinFor, DURATION_MIN, DAY_LENGTH_MIN } from './daysim'

describe('seededUnit', () => {
  it('같은 seed는 항상 같은 값(결정론)', () => {
    expect(seededUnit(12345)).toBe(seededUnit(12345))
  })
  it('[0,1) 범위', () => {
    for (const s of [0, 1, 7, 100, 999999]) {
      const u = seededUnit(s)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
  })
  it('다른 seed는 대체로 다른 값(무충돌 sanity)', () => {
    const vals = new Set([1, 2, 3, 4, 5].map(seededUnit))
    expect(vals.size).toBe(5)
  })
})

describe('procedureDurationMin', () => {
  it('결정론(같은 주/날/인덱스는 같은 소요)', () => {
    expect(procedureDurationMin('STEMI', 1, 1, 0)).toBe(procedureDurationMin('STEMI', 1, 1, 0))
  })
  it('종목별 [min,max] 범위 안', () => {
    for (const kind of Object.keys(DURATION_MIN) as (keyof typeof DURATION_MIN)[]) {
      const [min, max] = DURATION_MIN[kind]
      for (let i = 0; i < 8; i++) {
        const d = procedureDurationMin(kind, 1, 1, i)
        expect(d).toBeGreaterThanOrEqual(min)
        expect(d).toBeLessThanOrEqual(max)
      }
    }
  })
})

describe('arrivalMinFor', () => {
  it('결정론', () => {
    expect(arrivalMinFor(1, 1, 2, 5)).toBe(arrivalMinFor(1, 1, 2, 5))
  })
  it('[0, DAY_LENGTH_MIN) 범위이고 인덱스 증가에 대체로 단조(도착 순서)', () => {
    const count = 6
    const times = Array.from({ length: count }, (_, i) => arrivalMinFor(1, 1, i, count))
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(DAY_LENGTH_MIN)
    }
    // 인덱스 슬롯 기반이라 i가 클수록 시각이 크다(±지터 안에서 단조)
    expect(times[count - 1]).toBeGreaterThan(times[0])
  })
})

describe('callSeed', () => {
  it('결정론(같은 인자는 같은 seed)', () => {
    expect(callSeed(1, 1, 0, 1)).toBe(callSeed(1, 1, 0, 1))
  })
  it('salt가 다르면 seed도 달라 서로 다른 스트림(소요시간·도착시각 비상관)', () => {
    expect(callSeed(1, 1, 0, 1)).not.toBe(callSeed(1, 1, 0, 2))
  })
})
