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

// 09:00(DAY_OPEN_MIN) 기준 하루 시각(분)을 HH:MM으로. UI 표시 전용 포맷터(판정 로직 아님) —
// ReceivingPhase·CallCard 두 컴포넌트가 공유하는 단일 출처(중복 정의 시 한쪽이 낡는 병 방지).
export function formatClockFromOpen(clockMin: number): string {
  const total = DAY_OPEN_MIN + clockMin
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 종목별 소요시간 [min,max] 분(각색 — 임상 주장 아님, 상대 길이만 의미). 시술이 워크인보다 길다.
export const DURATION_MIN: Record<CallKind, readonly [number, number]> = {
  COSMETIC_WALKIN: [30, 60],
  STEMI: [60, 120],
  OBSTETRIC_EMERGENCY: [60, 120],
  NEURO_EMERGENCY: [90, 180],
  TRAUMA_EMERGENCY: [90, 180],
  ABDOMINAL_EMERGENCY: [90, 180], // 급성복증 — 응급 수술급 소요
  MEDICAL_EMERGENCY: [45, 90], // 고열·감염 — 입원·수액(수술 아님)
  SPECIALIST_ELECTIVE: [90, 180], // 예약 시술 — 응급 수술급 소요(그 과 의사를 오래 점유)
}

export function procedureDurationMin(kind: CallKind, week: number, day: number, index: number): number {
  const [min, max] = DURATION_MIN[kind]
  return min + Math.floor(seededUnit(callSeed(week, day, index, 1)) * (max - min + 1))
}

/**
 * 도착시각 — 하루 전체에 seed로 뿌린다. 정렬은 호출부(createCallQueue)가 한다.
 *
 * 과거엔 하루를 count개 슬롯으로 균등 분할해 슬롯 안에서만 지터를 줬다. 그 모델은
 * **최소 간격이 항상 (DAY_LENGTH_MIN / count) 이상**이라 도착이 구조적으로 절대 겹치지
 * 않았고, 그래서 대기열이 생길 수 없었다 — 새 환자가 올 때마다 앞사람은 이미 끝나 있다.
 * 병원이 북적이려면 몰릴 때 몰리고 빌 때 비어야 한다.
 *
 * 균등 난수를 하루에 뿌리면 간격이 지수분포에 가까워져 그 뭉침이 공짜로 나온다 —
 * 아침·점심 러시 같은 별도 피크 모델을 만들지 않는다(YAGNI). RNG는 여전히 0이다.
 */
export function arrivalMinFor(week: number, day: number, index: number): number {
  return Math.floor(seededUnit(callSeed(week, day, index, 2)) * DAY_LENGTH_MIN)
}

/**
 * 대기 한계(분) — 이 시간을 넘겨 기다리면 환자가 떠난다.
 *
 * 각색값이고 **상대 길이만** 의미가 있다(임상 주장 아님). STEMI가 가장 짧은 건 재관류
 * 골든타임이고(medical-system-grounding.md), 워크인이 짧은 건 위중해서가 아니라
 * 그냥 기다리기 싫어서다 — 같은 '떠남'이어도 뜻이 정반대라, 신문이 되는 건 응급뿐이다.
 */
export const PATIENCE_MIN: Record<CallKind, number> = {
  STEMI: 90, // 재관류 골든타임
  OBSTETRIC_EMERGENCY: 120,
  NEURO_EMERGENCY: 120,
  TRAUMA_EMERGENCY: 120,
  ABDOMINAL_EMERGENCY: 120,
  MEDICAL_EMERGENCY: 180, // 고열·감염 — 덜 급하다
  COSMETIC_WALKIN: 60, // 기다리다 그냥 간다
  SPECIALIST_ELECTIVE: 120, // 예약이라 어느 정도는 기다린다
}

export function patienceMin(kind: CallKind): number {
  return PATIENCE_MIN[kind]
}

/**
 * 그 과 유닛 중 **가장 빨리 비는 시각**. 그 과 유닛이 하나도 없으면 undefined.
 *
 * undefined와 0의 구분이 이 함수의 전부다: 0은 "지금 당장 자유"고, undefined는
 * "기다려도 영원히 안 생긴다"(미채용). 전자는 대기, 후자는 하드락으로 갈린다.
 */
export function earliestFreeMin(
  roster: Doctor[],
  busyUntil: Record<string, number>,
  dept: DeptKey,
): number | undefined {
  const docs = roster.filter((d) => d.dept === dept)
  if (docs.length === 0) return undefined
  return Math.min(...docs.map((d) => busyUntil[d.id] ?? 0))
}

/** 시각 atMin에 자유로운(busyUntil ≤ atMin) 그 과 유닛들. busyUntil 미기록=0(자유). */
export function freeDoctorsOfDept(
  roster: Doctor[],
  busyUntil: Record<string, number>,
  dept: DeptKey,
  atMin: number,
): Doctor[] {
  return roster.filter((d) => d.dept === dept && (busyUntil[d.id] ?? 0) <= atMin)
}

/** 자유 유닛 중 가장 일찍 비었던(busyUntil 최소) 유닛 — 부하 분산. */
export function pickAssignee(free: Doctor[], busyUntil: Record<string, number>): Doctor {
  return free.reduce((min, d) => ((busyUntil[d.id] ?? 0) < (busyUntil[min.id] ?? 0) ? d : min))
}
