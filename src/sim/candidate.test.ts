import { describe, expect, it } from 'vitest'
import { candidateOf, freshHiredSlots, remainingCandidates } from './candidate'
import { HIRABLE_DEPTS, simDept } from './dept'
import { DOCTOR_NAMES } from './traits'
import { regionHirePool } from './world'

describe('candidateOf — (과, 슬롯)의 순수 함수', () => {
  it('같은 (과, 슬롯)은 언제나 같은 사람이다 — 세계 상태 없이 결정된다', () => {
    const a = candidateOf('CARDIOLOGY', 1)
    const b = candidateOf('CARDIOLOGY', 1)
    expect(b).toEqual(a)
    expect(a.name).toBeTruthy()
    expect(a.traits[0]).not.toBe(a.traits[1]) // pickTraits 계약 계승
  })

  it('전 슬롯 18명의 이름이 전부 다르다 — 전국 풀 기준 전역 분할', () => {
    const names = HIRABLE_DEPTS.flatMap(dept =>
      Array.from({ length: simDept(dept).nationalPool }, (_, s) => candidateOf(dept, s).name),
    )
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBe(DOCTOR_NAMES.length) // 18 = 18, 목록을 정확히 다 쓴다
  })

  it('과 오프셋 = 카탈로그 기재 순서의 누적합 — 미용 0·내과 8·외과 13·순환기 16', () => {
    expect(candidateOf('AESTHETICS', 0).name).toBe(DOCTOR_NAMES[0])
    expect(candidateOf('INTERNAL_MEDICINE', 0).name).toBe(DOCTOR_NAMES[8])
    expect(candidateOf('GENERAL_SURGERY', 0).name).toBe(DOCTOR_NAMES[13])
    expect(candidateOf('CARDIOLOGY', 0).name).toBe(DOCTOR_NAMES[16])
  })

  it('전국 풀 범위 밖 슬롯은 던진다 — 조용한 undefined 이름을 만들지 않는다', () => {
    expect(() => candidateOf('CARDIOLOGY', 2)).toThrow()
    expect(() => candidateOf('CARDIOLOGY', -1)).toThrow()
    expect(() => candidateOf('CARDIOLOGY', 0.5)).toThrow()
  })
})

describe('remainingCandidates — 지역 풀에서 소비분을 뺀 나머지', () => {
  it('빈 소비 목록이면 지역 풀 크기만큼, 슬롯 0부터 차례로 나온다', () => {
    const rest = remainingCandidates(regionHirePool('PROVINCIAL'), freshHiredSlots())
    expect(rest.CARDIOLOGY.map(c => c.slot)).toEqual([0]) // 지방 순환기는 1명뿐
    expect(rest.AESTHETICS.map(c => c.slot)).toEqual([0, 1, 2, 3])
  })

  it('소비된 슬롯은 빠지고 나머지 순서는 유지된다', () => {
    const hired = { ...freshHiredSlots(), AESTHETICS: [1] }
    const rest = remainingCandidates(regionHirePool('URBAN'), hired)
    expect(rest.AESTHETICS.map(c => c.slot)).toEqual([0, 2, 3, 4, 5, 6, 7])
  })
})
