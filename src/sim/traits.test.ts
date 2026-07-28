import { describe, it, expect } from 'vitest'
import { createWorld, ENTRANCE } from './world'
import { spawnDoctor } from './pawn'
import { DOCTOR_NAMES, TRAITS, TRAIT_KEYS, pickTraits } from './traits'

/** 스폰 한 명 — 방금 들어온 의사 폰만 꺼낸다. */
function spawned(seed: number, nextId: number) {
  const w0 = { ...createWorld(seed), nextId }
  const w = spawnDoctor(w0, 'CARDIOLOGY', ENTRANCE)
  return w.pawns[w.pawns.length - 1]
}

describe('특성·이름 카탈로그', () => {
  it('모든 특성 키가 라벨과 사연을 갖는다 — 빈 문자열은 없다', () => {
    expect(TRAIT_KEYS.length).toBeGreaterThanOrEqual(4) // 두 개를 서로 다르게 뽑을 여유
    for (const key of TRAIT_KEYS) {
      expect(TRAITS[key].label.length).toBeGreaterThan(0)
      expect(TRAITS[key].story.length).toBeGreaterThan(0)
    }
  })

  it('이름 목록은 비어 있지 않고 중복이 없다', () => {
    expect(DOCTOR_NAMES.length).toBeGreaterThan(0)
    expect(new Set(DOCTOR_NAMES).size).toBe(DOCTOR_NAMES.length)
  })

  it('두 특성은 **항상 서로 다르다** — 전수(0..999)로 잰다', () => {
    // 같은 특성 두 개를 받은 의사는 개성이 하나뿐인데 화면엔 두 줄로 뜬다(에러 0).
    // 인덱싱 산수가 틀리는 자리라 한 점이 아니라 전수로 잠근다.
    for (let nextId = 0; nextId < 1000; nextId++) {
      const [a, b] = pickTraits(nextId)
      expect(a).not.toBe(b)
    }
  })

  it('pickTraits는 nextId의 순수 함수다 — 같은 값이면 같은 특성', () => {
    expect(pickTraits(7)).toEqual(pickTraits(7))
    // 계측기가 헛돌지 않았다 — 서로 다른 nextId는 실제로 다른 조합을 낸다
    const combos = new Set(Array.from({ length: 40 }, (_, i) => pickTraits(i).join('/')))
    expect(combos.size).toBeGreaterThan(1)
  })
})

describe('spawnDoctor — 이름·특성 부여', () => {
  it('의사는 이름과 특성 두 개를 달고 온다', () => {
    const doc = spawned(1, 1)
    expect(DOCTOR_NAMES).toContain(doc.name)
    expect(doc.traits).toHaveLength(2)
    expect(TRAIT_KEYS).toContain(doc.traits![0])
    expect(TRAIT_KEYS).toContain(doc.traits![1])
  })

  it('부여는 nextId 인덱싱이라 **시드를 소비하지 않는다** — 판이 달라도 같은 사람이 온다', () => {
    // 이 계약이 깨지면(RNG로 뽑으면) 이름·특성이 도착·응급 스트림과 한 축을 나눠 갖게 되어,
    // "몇 번째로 뽑았나"가 아니라 "그 주에 무슨 일이 있었나"가 사람을 바꾼다.
    const a = spawned(3, 11)
    const b = spawned(999, 11)
    expect(a.name).toBe(b.name)
    expect(a.traits).toEqual(b.traits)
    expect(a.traits).toEqual(pickTraits(11))
  })

  it('nextId가 다르면 이름도 돌아간다 — 전원이 동명이인이 아니다', () => {
    const names = Array.from({ length: DOCTOR_NAMES.length }, (_, i) => spawned(1, i + 1).name)
    expect(new Set(names).size).toBe(DOCTOR_NAMES.length)
  })
})
