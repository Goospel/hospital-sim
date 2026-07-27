// 하루의 마디 — 마감 정산(settleDay)과 다음 날 시작(startNextDay).
// 마감은 tick이 부르고(600분), 다음 날은 **플레이어가** 부른다 — 시계가 하루를 넘기면 결산을
// 읽을 틈이 없다. 7일차 밤은 다음 날이 아니라 주간 결산(WEEK_END)으로 간다.
import { freshStats, type SimWorld } from './world'
import type { Pawn, PatientStage } from './pawn'
import { buildBlockedSet } from './path'
import { examLoadMin, wantsDeptOf } from './patientFlow'
import { furnitureSpot } from './spots'
import {
  simDept, addExamToDeptStats, addRevenueToDeptStats, deptRevenueSum, type SimDeptStats,
} from './dept'
import { emergencyLoadMin, emergencySpec, emergencyKindOf } from './emergency'
import { applyWorkLoads, fatigueOf, restOvernight } from './fatigue'
import { clearActivity } from './needs'
import { FATIGUE_MAX } from '../game/doctor'

export const DAY_END_MIN = 600 // 09:00 개장 + 10시간 = 19:00 마감(기존 daysim.DAY_LENGTH_MIN과 같은 각색)
export const DAYS_PER_WEEK = 7

/**
 * 포화(`FATIGUE_MAX`)로 마감한 의사의 `saturatedDays`를 하나 올린다(입력 불변).
 *
 * 규칙은 기존 게임 `src/game/doctor.ts`의 `stepSaturatedDays`를 그대로 계승한다 — **포화로
 * 마감한 날만 세고 리셋은 없다**(*"회복해도 그 날들은 몸에 남는다"* · *"완편 병원은 이 카운터가
 * 영원히 0"*). ⚠️ 그 함수를 임포트해 부르지 못하는 이유는 시그니처뿐이다: 저쪽은
 * `Record<id, 피로>` → `Record<id, 일수>`를 다루는 반면 이 층의 상태는 폰 배열 위에 산다.
 * 상수(`FATIGUE_MAX`)는 임포트해 쓰므로 임계가 두 곳에 적히지는 않는다.
 *
 * 판정이 `>=`인 이유: 피로는 `FATIGUE_MAX`에서 클램프되므로(fatigue.addWorkLoad) `>`로 쓰면
 * **아무 날도 세지 않는다** — 사직이 통째로, 에러 하나 없이 죽는다.
 */
function stepSaturation(pawns: Pawn[]): Pawn[] {
  return pawns.map(p => (
    p.kind === 'DOCTOR' && fatigueOf(p) >= FATIGUE_MAX
      ? { ...p, saturatedDays: (p.saturatedDays ?? 0) + 1 }
      : p
  ))
}

/** 마감 시점에 "진료를 못 받고 돌아간" 것으로 세는 스테이지 — **명시 목록(inclusion)**이다.
 *  denylist(`stage !== 'LEAVING' && ...`)로 쓰면 새 스테이지가 생기는 순간 자동으로 이탈이 된다:
 *  예약된 'PAYING'(수납 대기)·'GONE'(퇴장 표현) 흐름이 붙으면 수납 걷던 환자가 조용히 이탈로
 *  세져 leftCount와 DayRecord·주간 결산까지 함께 틀어진다 — 에러 없이 숫자만 틀리는 무성 실패다.
 *  집계의 의미(무엇을 이탈로 볼 것인가)는 정산 소관이라 여기(day.ts)가 소유한다. */
export const COUNTS_AS_TURNED_AWAY: readonly PatientStage[] =
  ['ENTERING', 'WAITING', 'TO_EXAM', 'TO_BED', 'IN_BED']

export interface DayRecord {
  day: number
  examsDone: number
  leftCount: number
  /** 그날 진료 수익의 총액 — **`byDept`에서 유도한다**(Σ revenueManwon). 따로 세면 두 숫자가
   *  어긋날 수 있고, 어긋나도 화면엔 둘 중 하나만 보여서 아무도 모른다. */
  revenueManwon: number
  /** 그날 과별 진료·수익 — 결산 과별 표(계획 Task 5·6)의 입력. 기존 `DayRecord.deptStats`
   *  (src/game/session.ts)와 같은 자리의 같은 개념이다. */
  byDept: SimDeptStats
  /** 그날 응급 — 수용 몇 건, 되돌아간 몇 건. **사유별 내역은 여기 없다**(stats 쪽에 있다):
   *  하루 기록은 주간 결산이 합산하는 숫자판이고, 사유는 그날 그 순간의 메시지라 수명이 다르다. */
  emergencies: { accepted: number; turnedAway: number }
}

/** 운영 마감 정산 — RUNNING 세계에만 허용(이중 정산 방지).
 *  진행 중 진료(IN_EXAM)는 완료 인정(각색: 야근 연장은 범위 밖) — **수익과 피로를 함께** 인정한다.
 *  둘 중 수익만 주면 그 노동은 장부에는 있고 의사 몸에는 없는 것이 된다. 아직 진료를 못 받은 환자
 *  (`COUNTS_AS_TURNED_AWAY`)는 이탈 집계. 환자는 스테이지와 무관하게 전원 세계에서 빠진다.
 *  ⚠️ 이미 집계가 끝난 환자(LEAVING = 진료 완료 / LEFT_WAITING = 이탈)는 다시 세지 않는다 —
 *  세면 그 하루의 leftCount가 실제 인원보다 부풀어 DayRecord와 주간 결산까지 함께 틀어진다. */
export function settleDay(world: SimWorld): SimWorld {
  if (world.phase !== 'RUNNING') throw new Error(`settleDay: RUNNING이 아닌 세계(${world.phase})`)
  let exams = world.stats.examsDone
  let left = world.stats.leftCount
  let byDept: SimDeptStats = world.stats.byDept
  // 마감에 인정한 진료의 수익만 따로 센다 — 하루 중에 끝난 건은 그때 이미 금고에 들어갔다.
  let lateRevenueManwon = 0
  /** 마감이 **완료로 인정한** 작업의 표준강도분 — 진료 중 끝난 건과 똑같이 의사에게 얹는다.
   *  수익만 인정하고 부하를 빼면 하루 상한이 통째로 어긋난다: 의사 한 명이 마감에 물고 있을 수
   *  있는 최대 노동(외래 20분 + 응급 90분 아님 — 각각 한 건씩)이 매일 공짜가 되고, 그만큼
   *  피로가 과소 계상돼 "갈려나간다"가 늦게 온다(에러 없이 곡선만 완만해진다). */
  const loadByDoctor = new Map<string, number>()
  const addLoad = (doctorId: string | undefined, load: number) => {
    if (!doctorId) return // 손세계 폰 — 담당 의사가 없으면 얹을 데도 없다
    loadByDoctor.set(doctorId, (loadByDoctor.get(doctorId) ?? 0) + load)
  }
  for (const p of world.pawns) {
    if (p.kind !== 'PATIENT') continue
    if (p.stage === 'IN_EXAM') {
      // 마감 시점의 진행 중 진료도 **그 환자의 과 수가**로 계산한다 — 여기만 상수로 두면
      // 하루의 마지막 몇 건이 다른 값으로 매겨지고, 그 차이는 장부 총액에만 나타나 추적이 어렵다.
      const dept = wantsDeptOf(p)
      exams += 1
      lateRevenueManwon += simDept(dept).examRevenueManwon
      byDept = addExamToDeptStats(byDept, dept)
      addLoad(p.doctorId, examLoadMin(p, dept))
    } else if (p.stage === 'IN_TREATMENT') {
      // 진행 중 **응급 처치**도 완료 인정 — 외래(IN_EXAM)와 같은 각색이다(야근 연장은 범위 밖).
      // 수가는 반드시 응급 카탈로그에서 온다: 외래 수가로 접으면 850만원짜리 처치가 25만원이
      // 되고, 그 차이는 장부 총액에만 나타나 추적이 어렵다.
      const spec = emergencySpec(emergencyKindOf(p))
      lateRevenueManwon += spec.revenueManwon
      byDept = addRevenueToDeptStats(byDept, spec.dept, spec.revenueManwon)
      addLoad(p.doctorId, emergencyLoadMin(p, spec))
    } else if (p.stage && COUNTS_AS_TURNED_AWAY.includes(p.stage)) left += 1
  }
  // 부하는 환자를 다 훑은 **뒤** 한 번에 얹는다 — 같은 의사가 외래와 응급을 동시에 물고 있을
  // 수는 없지만(doctorId는 하나), 모아서 얹는 계약을 진료 중 축적(applyWorkLoads)과 같게 둔다.
  // 포화 판정은 부하를 얹은 **뒤**다 — 앞에 두면 "마지막 한 건에 갈려 포화한 날"이 안 세지고,
  // 그만큼 사직이 늦게 온다(에러 없이 곡선만 완만해진다 — 마감 부하 인정과 같은 병).
  const doctors = stepSaturation(applyWorkLoads(world.pawns.filter(p => p.kind === 'DOCTOR'), loadByDoctor))
  const record: DayRecord = {
    day: world.day,
    examsDone: exams,
    leftCount: left,
    revenueManwon: deptRevenueSum(byDept),
    byDept,
    emergencies: {
      accepted: world.stats.emergencyAccepted,
      turnedAway: world.stats.emergencyTurnedAway.length,
    },
  }
  const days = [...world.days, record]
  return {
    ...world,
    // 주의 마지막 날은 하루가 아니라 **주**가 끝난다 — 그날 밤엔 다음 날이 아니라 주간 결산이 온다.
    // 판정을 정산 안에 두는 이유: days를 늘리는 곳과 "몇 일째인가"를 읽는 곳이 갈리면
    // 7일차 밤에 DAY_END와 WEEK_END가 서로 다른 근거로 갈릴 수 있다(단일 출처).
    // `>=`인 이유: 등호는 기록이 하나라도 더 붙은 세계에서 WEEK_END를 **말없이** 건너뛴다 —
    // 결산이 안 열리면 고정비도 폐업도 오지 않아 하루가 영원히 이어진다(에러 없는 실패).
    // 정상 흐름에선 startNextWeek이 days를 비워 7에서 딱 걸리므로 지금은 등가다.
    phase: days.length >= DAYS_PER_WEEK ? 'WEEK_END' : 'DAY_END',
    pawns: doctors,
    treasuryManwon: world.treasuryManwon + lateRevenueManwon,
    // 응급 집계는 마감이 손대지 않는다 — 수용·회차는 이미 도착 시점에 확정된 값이라,
    // 여기서 다시 세면 그날 숫자가 두 번 더해진다(외래의 leftCount 이중 집계와 같은 병).
    stats: { ...world.stats, examsDone: exams, leftCount: left, byDept },
    days,
  }
}

/** 새 아침의 공통 초기화 — 분 0·당일 집계 0·**하룻밤 회복**·의사는 자기 진료실 책상 앞에서 다시 시작.
 *  하루를 넘길 때(startNextDay)와 주를 넘길 때(week.startNextWeek)가 **같은 아침**을 열어야 한다.
 *  7일차 밤엔 startNextDay가 없어서, 여기가 갈리면 주의 첫날만 지난주 stats를 들고 시작해
 *  그날 DayRecord가 지난주 진료까지 다시 센다(에러 없이 숫자만 틀린다).
 *  의사가 어제 걷던 경로·목적지를 버리는 이유: dest가 남으면 첫 틱의 도착 판정(위치 == dest)이
 *  어제 목적지를 보고 흔들린다. phase·day·week는 부르는 쪽이 정한다. */
export function freshMorning(world: SimWorld): SimWorld {
  const blocked = buildBlockedSet(world)
  const pawns = world.pawns.map(p => {
    // 하룻밤 회복도 여기 있어야 한다 — 7일차 밤엔 startNextDay가 없어서, 회복을 그쪽에 달면
    // **주의 첫날만** 지친 채로 시작한다(stats 리셋이 여기 있는 것과 같은 이유).
    // 어제 붙었던 욕구 행동(휴식)도 함께 뗀다 — **아침은 책상에서 시작한다**. 남기면
    // 'RESTING'인 채로 하루가 열려 그 의사가 외래 후보에서 통째로 빠지고, 어제의
    // activityUntilMin(예: 520분)이 오늘 0분엔 이미 지난 값이라 쉬지도 않은 회복이 들어온다.
    // 어떤 필드가 "욕구 행동"인지는 needs.clearActivity가 단일 출처다.
    const next: Pawn = { ...clearActivity(restOvernight(p)), path: [] }
    delete next.dest
    // 허기도 아침에 0으로 돌아간다 — **저녁을 먹고 출근했다**는 각색이다. 안 되돌리면 허기는
    // 식사 말고 내려갈 길이 없어서(피로와 달리 밤 회복이 없다), 식당 없는 병원의 의사는
    // 이튿날부터 **첫 진료부터** 영구히 1.15배가 된다. 리셋 자리가 여기인 이유는 피로 회복과
    // 같다: 7일차 밤엔 startNextDay가 없어 그쪽에 달면 주의 첫날만 굶은 채로 시작한다.
    if (p.kind === 'DOCTOR') next.hungerMin = 0
    // 방을 못 찾거나(배정 전) 책상 앞이 막혔으면 있던 자리에 그대로 둔다 — 다음 날 배정이 다시 본다.
    const spot = p.kind === 'DOCTOR' && p.roomId ? furnitureSpot(world, p.roomId, 'DESK', blocked) : null
    return spot ? { ...next, x: spot.x, y: spot.y } : next
  })
  return { ...world, minute: 0, pawns, stats: freshStats() }
}

/** 하루 넘기기 — DAY_END에서만(시계가 아니라 플레이어가 부른다).
 *  하루 집계(stats)는 비우고 주간 기록(days)은 남긴다 — 주간 결산이 그 배열을 합산한다. */
export function startNextDay(world: SimWorld): SimWorld {
  if (world.phase !== 'DAY_END') throw new Error(`startNextDay: DAY_END가 아닌 세계(${world.phase})`)
  return { ...freshMorning(world), phase: 'RUNNING', day: world.day + 1 }
}
