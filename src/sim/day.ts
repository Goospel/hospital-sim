// 하루의 끝 — 정산과 기록. 전이는 tick이 부르고, 다음 날 시작은 UI가 부른다(Task 2).
import type { SimWorld } from './world'
import { EXAM_REVENUE_MANWON } from './patientFlow'

export const DAY_END_MIN = 600 // 09:00 개장 + 10시간 = 19:00 마감(기존 daysim.DAY_LENGTH_MIN과 같은 각색)
export const DAYS_PER_WEEK = 7

export interface DayRecord {
  day: number
  examsDone: number
  leftCount: number
  revenueManwon: number
}

/** 운영 마감 정산 — RUNNING 세계에만 허용(이중 정산 방지).
 *  진행 중 진료(IN_EXAM)는 완료 인정(각색: 야근 연장은 범위 밖), 나머지 환자는 이탈 집계 후 제거.
 *  ⚠️ 이미 집계가 끝난 환자(LEAVING = 진료 완료 / LEFT_WAITING = 이탈)는 다시 세지 않는다 —
 *  세면 그 하루의 leftCount가 실제 인원보다 부풀어 DayRecord와 주간 결산까지 함께 틀어진다. */
export function settleDay(world: SimWorld): SimWorld {
  if (world.phase !== 'RUNNING') throw new Error(`settleDay: RUNNING이 아닌 세계(${world.phase})`)
  let exams = world.stats.examsDone
  let left = world.stats.leftCount
  for (const p of world.pawns) {
    if (p.kind !== 'PATIENT') continue
    if (p.stage === 'IN_EXAM') exams += 1
    else if (p.stage !== 'LEAVING' && p.stage !== 'LEFT_WAITING') left += 1
  }
  const doctors = world.pawns.filter(p => p.kind === 'DOCTOR')
  const examsDelta = exams - world.stats.examsDone
  const record: DayRecord = {
    day: world.day,
    examsDone: exams,
    leftCount: left,
    revenueManwon: exams * EXAM_REVENUE_MANWON,
  }
  return {
    ...world,
    phase: 'DAY_END',
    pawns: doctors,
    treasuryManwon: world.treasuryManwon + examsDelta * EXAM_REVENUE_MANWON,
    stats: { examsDone: exams, leftCount: left },
    days: [...world.days, record],
  }
}
