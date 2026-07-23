import { describe, it, expect } from 'vitest'
import {
  seededUnit,
  callSeed,
  procedureDurationMin,
  arrivalMinFor,
  DURATION_MIN,
  DAY_LENGTH_MIN,
  freeDoctorsOfDept,
  pickAssignee,
  earliestFreeMin,
  patienceMin,
} from './daysim'
import type { Doctor } from './types'

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
    expect(arrivalMinFor(1, 1, 2)).toBe(arrivalMinFor(1, 1, 2))
  })
  it('[0, DAY_LENGTH_MIN) 범위', () => {
    for (let i = 0; i < 40; i++) {
      const t = arrivalMinFor(1, 1, i)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(DAY_LENGTH_MIN)
    }
  })
  /*
    이 테스트가 이번 변경의 핵심 계약이다 — 균등 슬롯이던 시절엔 구조적으로 불가능했다.
    슬롯 분할은 최소 간격이 항상 (600/count) 이상이라 절대 안 겹치고, 그래서 대기열이
    생길 수 없었다(도착할 때마다 의사가 이미 비어 있다). 뭉쳐야 병원이 북적인다.
  */
  it('도착이 뭉친다 — 최소 간격이 균등 분할 폭보다 작다', () => {
    const count = 20
    const times = Array.from({ length: count }, (_, i) => arrivalMinFor(1, 1, i)).sort((a, b) => a - b)
    const gaps = times.slice(1).map((t, i) => t - times[i])
    const evenSlot = DAY_LENGTH_MIN / count
    expect(Math.min(...gaps)).toBeLessThan(evenSlot)
  })
  it('하루 전체에 퍼진다 — 앞뒤로 몰리지 않는다', () => {
    const times = Array.from({ length: 30 }, (_, i) => arrivalMinFor(1, 1, i))
    expect(Math.min(...times)).toBeLessThan(DAY_LENGTH_MIN / 3)
    expect(Math.max(...times)).toBeGreaterThan((DAY_LENGTH_MIN * 2) / 3)
  })
})

describe('earliestFreeMin', () => {
  it('그 과 유닛 중 가장 빨리 비는 시각', () => {
    const busy = { 'doc-CARDIOLOGY-1': 200, 'doc-CARDIOLOGY-2': 120 }
    expect(earliestFreeMin(roster, busy, 'CARDIOLOGY')).toBe(120)
  })
  it('점유 기록이 없는 유닛은 0(자유)', () => {
    expect(earliestFreeMin(roster, { 'doc-CARDIOLOGY-1': 200 }, 'CARDIOLOGY')).toBe(0)
  })
  it('그 과 유닛이 아예 없으면 undefined — 기다려도 소용없다(대기 아닌 하드락)', () => {
    expect(earliestFreeMin(roster, {}, 'OBSTETRICS')).toBeUndefined()
  })
})

describe('patienceMin', () => {
  it('STEMI가 가장 짧다(골든타임)', () => {
    for (const kind of ['OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'MEDICAL_EMERGENCY'] as const) {
      expect(patienceMin('STEMI')).toBeLessThan(patienceMin(kind))
    }
  })
  it('모든 종목에 값이 있다', () => {
    for (const kind of Object.keys(DURATION_MIN) as (keyof typeof DURATION_MIN)[]) {
      expect(patienceMin(kind)).toBeGreaterThan(0)
    }
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

const roster: Doctor[] = [
  { id: 'doc-CARDIOLOGY-1', name: '이수아', dept: 'CARDIOLOGY' },
  { id: 'doc-CARDIOLOGY-2', name: '김민준', dept: 'CARDIOLOGY' },
  { id: 'doc-AESTHETICS-1', name: '박현우', dept: 'AESTHETICS' },
]

describe('freeDoctorsOfDept', () => {
  it('busyUntil <= atMin 인 그 과 유닛만 자유', () => {
    const busy = { 'doc-CARDIOLOGY-1': 120, 'doc-CARDIOLOGY-2': 0 }
    const free = freeDoctorsOfDept(roster, busy, 'CARDIOLOGY', 60)
    expect(free.map((d) => d.id)).toEqual(['doc-CARDIOLOGY-2'])
  })
  it('그 과 유닛이 다 점유면 빈 배열(=벽)', () => {
    const busy = { 'doc-CARDIOLOGY-1': 200, 'doc-CARDIOLOGY-2': 200 }
    expect(freeDoctorsOfDept(roster, busy, 'CARDIOLOGY', 60)).toEqual([])
  })
  it('미채용 과는 빈 배열', () => {
    expect(freeDoctorsOfDept(roster, {}, 'OBSTETRICS', 0)).toEqual([])
  })
})

describe('pickAssignee', () => {
  it('가장 일찍 자유로워진(busyUntil 최소) 유닛', () => {
    const busy = { 'doc-CARDIOLOGY-1': 0, 'doc-CARDIOLOGY-2': 30 }
    const free = [roster[0], roster[1]]
    expect(pickAssignee(free, busy).id).toBe('doc-CARDIOLOGY-1')
  })
})
