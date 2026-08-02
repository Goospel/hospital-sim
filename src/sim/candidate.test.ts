import { describe, expect, it } from 'vitest'
import { candidateOf, freshHiredSlots, remainingCandidates } from './candidate'
import { HIRABLE_DEPTS, simDept } from './dept'
import { hireDoctor } from './pawn'
import { hire } from './testHelpers'
import { DOCTOR_NAMES } from './traits'
import { createWorld, regionHirePool } from './world'

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

describe('hireDoctor — 슬롯 지정 채용', () => {
  it('슬롯을 지정하면 정확히 그 후보의 이름·특성으로 폰이 선다', () => {
    const cand = candidateOf('CARDIOLOGY', 1)
    const res = hireDoctor(createWorld(1), 'CARDIOLOGY', 1)
    if (!res.ok) throw new Error('채용이 거부됐다')
    const doc = res.world.pawns.find(p => p.kind === 'DOCTOR')!
    expect(doc.name).toBe(cand.name)
    expect(doc.traits).toEqual(cand.traits)
    expect(res.world.hiredSlots.CARDIOLOGY).toEqual([1])
    expect(res.world.hirePool.CARDIOLOGY).toBe(1) // 카운트도 함께 준다
  })

  it('이미 소비된 슬롯·범위 밖 슬롯은 거부되고 세계는 그대로다', () => {
    const w1 = hireDoctor(createWorld(1), 'CARDIOLOGY', 0)
    if (!w1.ok) throw new Error('선행 채용이 거부됐다')
    expect(hireDoctor(w1.world, 'CARDIOLOGY', 0)).toEqual({ ok: false, reason: 'SLOT_TAKEN' })
    expect(hireDoctor(createWorld(1), 'CARDIOLOGY', 9)).toEqual({ ok: false, reason: 'SLOT_TAKEN' })
  })

  it('지역 축소 풀에서는 지역 범위 밖 슬롯이 거부된다 — 지방 순환기는 슬롯 0뿐', () => {
    const w = createWorld(1, { region: 'PROVINCIAL' })
    expect(hireDoctor(w, 'CARDIOLOGY', 1)).toEqual({ ok: false, reason: 'SLOT_TAKEN' })
    expect(hireDoctor(w, 'CARDIOLOGY', 0).ok).toBe(true)
  })

  it('불변식: hirePool[d] + hiredSlots[d].length === 지역 시작 풀 — 채용 열 뒤에도', () => {
    let w = createWorld(1, { region: 'NEWTOWN' })
    for (const [dept, slot] of [
      ['AESTHETICS', 3], ['INTERNAL_MEDICINE', 0], ['GENERAL_SURGERY', 1], ['AESTHETICS', 0],
    ] as const) {
      const res = hireDoctor(w, dept, slot)
      if (!res.ok) throw new Error(`${dept} ${slot} 채용이 거부됐다`)
      w = res.world
    }
    const start = regionHirePool('NEWTOWN')
    for (const dept of HIRABLE_DEPTS)
      expect(w.hirePool[dept] + w.hiredSlots[dept].length, dept).toBe(start[dept])
  })
})

describe('testHelpers.hire — 손세계 픽스처의 슬롯 폴백', () => {
  // 폴백은 코어(hireDoctor)가 아니라 이 헬퍼에 산다: 프로덕션은 슬롯을 반드시 지목해야 하고
  // (그래야 카드에서 고른 그 사람이 선다) 손세계 픽스처만 아무나 뽑으면 된다.
  it('슬롯을 안 주면 남은 최소 슬롯을 뽑는다', () => {
    const w1 = hireDoctor(createWorld(1), 'AESTHETICS', 0)
    if (!w1.ok) throw new Error('선행 채용이 거부됐다')
    const w2 = hire(w1.world, 'AESTHETICS')
    expect(w2.hiredSlots.AESTHETICS).toEqual([0, 1])
  })
})
