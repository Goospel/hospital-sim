// 후보 실체화 — (과, 슬롯) → 사람. 채용 화면이 "숫자 N"이 아니라 "이 사람들"을 보여주기
// 위한 층이다(스펙 2026-08-03-talent-market-design.md §2).
//
// **순수 함수가 계약이다**: RNG 0, 세계 상태 무관. 같은 (과, 슬롯)은 어느 판·어느 시점에도
// 같은 사람이다 — 그래야 카드에 미리 보인 사람과 뽑힌 폰이 같은 사람이고, 채용 한 번이
// 도착·응급 스트림을 밀지 않는다(traits.ts 머리말의 계약 계승).
//
// 이름은 **전국 풀 기준 전역 분할**이다: DOCTOR_NAMES 18개를 전국 풀 합계(8+5+3+2=18)에
// 1:1로 나눠, 과가 달라도 이름이 절대 겹치지 않는다. 지역 축소 풀은 앞 슬롯부터 N명만
// 존재하는 부분집합이라 유일성이 자동 성립한다.
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from './dept'
import { DOCTOR_NAMES, pickTraits, type TraitKey } from './traits'

export interface Candidate {
  dept: SimDeptKey
  /** 과내 슬롯(0..전국 풀−1). 지역 축소 풀은 슬롯 0부터 N명만 존재한다. */
  slot: number
  name: string
  traits: readonly [TraitKey, TraitKey]
}

/** 과 오프셋 — 카탈로그 기재 순서(HIRABLE_DEPTS)의 전국 풀 누적합.
 *  지역 풀이 아니라 **전국 풀** 기준인 것이 유일성의 근거다: 지역 기준이면 지역마다
 *  같은 슬롯이 다른 이름이 되어 "같은 (과, 슬롯) = 같은 사람"이 깨진다. */
function deptOffset(dept: SimDeptKey): number {
  let off = 0
  for (const key of HIRABLE_DEPTS) {
    if (key === dept) return off
    off += simDept(key).nationalPool
  }
  throw new Error(`deptOffset: 카탈로그에 없는 과(${dept})`)
}

export function candidateOf(dept: SimDeptKey, slot: number): Candidate {
  const n = simDept(dept).nationalPool
  // 범위 밖은 던진다 — undefined 이름이 폰에 실리면 사직 편지가 "undefined이(가) 떠났다"가
  // 되고, 그 오타는 화면에서야 관측된다(simDept가 던지는 것과 같은 이유).
  if (!Number.isInteger(slot) || slot < 0 || slot >= n)
    throw new Error(`candidateOf: ${dept} 슬롯 범위 밖(${slot}) — 전국 풀은 ${n}명이다`)
  const global = deptOffset(dept) + slot
  return { dept, slot, name: DOCTOR_NAMES[global], traits: pickTraits(global) }
}

/** 과별 빈 소비 목록 — SimWorld.hiredSlots의 초기값(createWorld가 쓴다). */
export function freshHiredSlots(): Record<SimDeptKey, number[]> {
  // `[] as number[]` — 그냥 `[]`면 TS가 `never[]`로 좁혀 캐스트가 막힌다(값 타입이 안 겹친다).
  return Object.fromEntries(
    HIRABLE_DEPTS.map(key => [key, [] as number[]]),
  ) as Record<SimDeptKey, number[]>
}

/** 남은 후보 — 지역 시작 풀(regionHirePool 결과)에서 소비된 슬롯을 뺀 나머지.
 *  세계를 통째로 받지 않는 이유: 이 모듈은 leaf에 가깝게 두고(world 순환 회피),
 *  호출부(SimGame)가 세계에서 두 값을 꺼내 넘긴다 — 화면이 세지 않는다는 규약 그대로. */
export function remainingCandidates(
  startPool: Record<SimDeptKey, number>,
  hiredSlots: Record<SimDeptKey, number[]>,
): Record<SimDeptKey, Candidate[]> {
  return Object.fromEntries(
    HIRABLE_DEPTS.map(dept => [
      dept,
      Array.from({ length: startPool[dept] }, (_, s) => s)
        .filter(s => !hiredSlots[dept].includes(s))
        .map(s => candidateOf(dept, s)),
    ]),
  ) as Record<SimDeptKey, Candidate[]>
}
