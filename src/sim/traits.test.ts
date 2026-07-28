import { describe, it, expect } from 'vitest'
import { createWorld, ENTRANCE, type SimWorld } from './world'
import { spawnDoctor } from './pawn'
import { tick } from './tick'
import { HIRABLE_DEPTS, simDept } from './dept'
import { hire, placeRoom } from './testHelpers'
import { DOCTOR_NAMES, TRAITS, TRAIT_KEYS, pickTraits } from './traits'

/** 한 판에 뽑을 수 있는 인원의 상한 — 전국 풀의 합(카탈로그 파생이라 튜닝을 따라온다). */
const TOTAL_POOL = HIRABLE_DEPTS.reduce((s, k) => s + simDept(k).nationalPool, 0)

/**
 * 풀이 마를 때까지 전 과를 채용한다 — 한 판에서 실제로 만날 수 있는 의사 전원.
 *
 * ⚠️ **채용 사이에 시간을 흘리는 것이 계측의 핵심이다.** 채용만 연달아 하면 `nextId`가 채용마다
 * 정확히 1씩 올라 채용 서수와 (오프셋 하나 빼고) 같아진다 — 그 픽스처에서는 이름을 nextId로
 * 매겨도 18명이 전부 다른 이름을 받아 **동명이인 버그가 재현되지 않는다**(실측: 그 변조가
 * 유일성 단언을 못 죽였다). 실제 병원에서는 환자 폰이 같은 카운터를 훨씬 빨리 올려 목록이
 * 한 바퀴 돈다 — 리뷰가 8명 채용에서 잡은 「최민서」 2회가 그 모습이다. `busy`가 대기실을 짓고
 * 틱을 돌려 그 조건을 만든다.
 *
 * ⓘ 반대로 **시드 무관함을 재는 자리에는 `busy`를 쓰면 안 된다**: 틱을 돌리면 그 판에 몇 명이
 *   왔느냐가 `nextId`를 바꾸고, 특성은 nextId 인덱싱이라 시드마다 갈린다. 그건 버그가 아니라
 *   정의다 — 계약은 "spawnDoctor가 **난수를 뽑지 않는다**"이지 "달리 굴러간 판에서도 같은
 *   사람이 온다"가 아니다. 조용한 픽스처라야 그 계약만 고립해서 잰다.
 */
function hireEveryone(seed = 1, { busy = false } = {}): SimWorld {
  let w = createWorld(seed)
  if (busy) {
    const placed = placeRoom(w, { type: 'WAITING', x: 2, y: 2, w: 16, h: 11 })
    if (!placed.ok) throw new Error(`전제 실패 — 건설 거부(${placed.reason})`)
    w = placed.world
  }
  for (const dept of HIRABLE_DEPTS) {
    for (let i = 0; i < simDept(dept).nationalPool; i++) {
      w = hire(w, dept)
      if (busy) w = tick(w, 20) // 환자가 nextId를 함께 올린다 — 채용 서수와 갈라놓는 축
    }
  }
  return w
}

const doctorsOf = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR')

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

  it('이름 목록은 중복이 없고 **한 판 최대 채용 인원을 덮는다**', () => {
    expect(new Set(DOCTOR_NAMES).size).toBe(DOCTOR_NAMES.length)
    // 목록이 전국 풀 합계보다 짧으면 이름이 돌아 동명이인이 생긴다. 풀을 튜닝해 늘리는 날
    // 이 단언이 먼저 터져 목록을 함께 늘리게 한다(카탈로그 파생 — 숫자를 손으로 안 적는다).
    expect(DOCTOR_NAMES.length).toBeGreaterThanOrEqual(TOTAL_POOL)
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

  it('특성은 nextId 인덱싱이다 — 특성이 겹치는 것은 유형이라 자연스럽다', () => {
    expect(spawned(1, 11).traits).toEqual(pickTraits(11))
  })

  it('이름은 **채용 서수**다 — 한 판에서 동명이인이 없다(풀 소진까지)', () => {
    // ⚠️ nextId로 매기면 겹친다: nextId는 방·환자·응급까지 올리는 **전역** 카운터라
    //    채용 순서와 무관하게 뛴다(실측: 8명 채용에 같은 이름 2회). 채용 서수는 풀 소진량
    //    합계라 판 안에서 단조 증가·유일이고, 사직자는 풀로 안 돌아와 되감기지도 않는다.
    const w = hireEveryone(1, { busy: true })
    const docs = doctorsOf(w)
    expect(docs.length).toBe(TOTAL_POOL)          // 계측기 자기검사 — 풀을 실제로 다 썼다
    expect(w.nextId).toBeGreaterThan(TOTAL_POOL * 2) // 환자가 nextId를 충분히 밀었다
    expect(new Set(docs.map(p => p.name)).size).toBe(TOTAL_POOL)
  })

  it('이름은 0번부터 순서대로 붙는다 — 채용이 목록을 건너뛰지 않는다', () => {
    // hireDoctor가 spawnDoctor를 **차감 전에** 부르므로 첫 채용자의 서수가 0이다.
    // 차감 후로 바뀌면 목록의 첫 이름이 영영 안 쓰인다(에러 0).
    expect(doctorsOf(hireEveryone(1, { busy: true })).map(p => p.name))
      .toEqual(DOCTOR_NAMES.slice(0, TOTAL_POOL))
  })

  it('이름·특성 어느 쪽도 **난수를 뽑지 않는다** — 같은 채용 순서면 같은 사람이 온다', () => {
    // 이 계약이 깨지면(RNG로 뽑으면) 이름·특성이 도착·응급 스트림과 한 축을 나눠 갖게 되어,
    // 채용 순서가 아니라 "그 주에 무슨 일이 있었나"가 사람을 바꾼다.
    // 조용한 픽스처(busy 없음)를 쓰는 이유는 hireEveryone 주석 참조.
    const roster = (seed: number) =>
      doctorsOf(hireEveryone(seed)).map(p => ({ name: p.name, traits: p.traits }))
    expect(roster(3)).toEqual(roster(999))
  })
})
