import type { CallKind, DeptKey, Doctor } from './types'

// 순수 시간 원시함수. RNG 0 — 모든 무작위성은 seed 해시(Math.random·Date.now 금지).
// splitmix32류 정수 해시 → [0,1). 결정론이라 같은 seed=같은 값(테스트·재현).
export function seededUnit(seed: number): number {
  let z = (seed | 0) + 0x9e3779b9
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
  z = z ^ (z >>> 15)
  return (z >>> 0) / 4294967296
}

/** (주,날,콜인덱스,salt) → 안정 정수 seed. salt로 소요시간·도착시각을 서로 다른 스트림으로 가른다. */
export function callSeed(week: number, day: number, index: number, salt: number): number {
  return (((week * 7 + day) * 97 + index) * 101 + salt) | 0
}

export const DAY_OPEN_MIN = 9 * 60 // 표시 기준(09:00). 타임라인 내부는 0..DAY_LENGTH_MIN.
export const DAY_LENGTH_MIN = 600 // 운영일 10시간(각색·튜닝값).
export const NIGHT_START_MIN = 480 // 개장 후 8h = 17:00 이후 도착이 야간(각색·튜닝값).

// 종목별 소요시간 [min,max] 분(각색 — 임상 주장 아님, 상대 길이만 의미). 시술이 워크인보다 길다.
// ⚠️ SPECIALIST_ELECTIVE는 Task 3에서 CallKind union에 추가될 때 여기도 같이 추가된다(지금은 union에 없어 tsc가 거부).
export const DURATION_MIN: Record<CallKind, readonly [number, number]> = {
  COSMETIC_WALKIN: [30, 60],
  GENERAL_EMERGENCY: [45, 90],
  STEMI: [60, 120],
  OBSTETRIC_EMERGENCY: [60, 120],
  NEURO_EMERGENCY: [90, 180],
  TRAUMA_EMERGENCY: [90, 180],
}

export function procedureDurationMin(kind: CallKind, week: number, day: number, index: number): number {
  const [min, max] = DURATION_MIN[kind]
  return min + Math.floor(seededUnit(callSeed(week, day, index, 1)) * (max - min + 1))
}

/** 도착시각 — 하루를 count개 슬롯으로 나눠 슬롯 안에서 seed 지터. 인덱스순 ≈ 도착순. */
export function arrivalMinFor(week: number, day: number, index: number, count: number): number {
  const slot = DAY_LENGTH_MIN / count
  const jitter = seededUnit(callSeed(week, day, index, 2)) * slot
  return Math.min(DAY_LENGTH_MIN - 1, Math.floor(index * slot + jitter))
}
