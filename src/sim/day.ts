// 하루의 끝 — 정산과 기록. 전이는 tick이 부르고, 다음 날 시작은 UI가 부른다(Task 2).
import type { SimWorld } from './world'
import type { PatientStage } from './pawn'
import { EXAM_REVENUE_MANWON } from './patientFlow'

export const DAY_END_MIN = 600 // 09:00 개장 + 10시간 = 19:00 마감(기존 daysim.DAY_LENGTH_MIN과 같은 각색)
export const DAYS_PER_WEEK = 7

/** 마감 시점에 "진료를 못 받고 돌아간" 것으로 세는 스테이지 — **명시 목록(inclusion)**이다.
 *  denylist(`stage !== 'LEAVING' && ...`)로 쓰면 새 스테이지가 생기는 순간 자동으로 이탈이 된다:
 *  예약된 'PAYING'(수납 대기)·'GONE'(퇴장 표현) 흐름이 붙으면 수납 걷던 환자가 조용히 이탈로
 *  세져 leftCount와 DayRecord·주간 결산까지 함께 틀어진다 — 에러 없이 숫자만 틀리는 무성 실패다.
 *  집계의 의미(무엇을 이탈로 볼 것인가)는 정산 소관이라 여기(day.ts)가 소유한다. */
export const COUNTS_AS_TURNED_AWAY: readonly PatientStage[] = ['ENTERING', 'WAITING', 'TO_EXAM']

export interface DayRecord {
  day: number
  examsDone: number
  leftCount: number
  revenueManwon: number
}

/** 운영 마감 정산 — RUNNING 세계에만 허용(이중 정산 방지).
 *  진행 중 진료(IN_EXAM)는 완료 인정(각색: 야근 연장은 범위 밖), 아직 진료를 못 받은 환자
 *  (`COUNTS_AS_TURNED_AWAY`)는 이탈 집계. 환자는 스테이지와 무관하게 전원 세계에서 빠진다.
 *  ⚠️ 이미 집계가 끝난 환자(LEAVING = 진료 완료 / LEFT_WAITING = 이탈)는 다시 세지 않는다 —
 *  세면 그 하루의 leftCount가 실제 인원보다 부풀어 DayRecord와 주간 결산까지 함께 틀어진다. */
export function settleDay(world: SimWorld): SimWorld {
  if (world.phase !== 'RUNNING') throw new Error(`settleDay: RUNNING이 아닌 세계(${world.phase})`)
  let exams = world.stats.examsDone
  let left = world.stats.leftCount
  for (const p of world.pawns) {
    if (p.kind !== 'PATIENT') continue
    if (p.stage === 'IN_EXAM') exams += 1
    else if (p.stage && COUNTS_AS_TURNED_AWAY.includes(p.stage)) left += 1
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
