// 주의 마디 — 주간 결산(settleWeek)과 다음 주 시작(startNextWeek).
// 하루가 수익을 벌어들이는 자리라면, 주는 **비용이 청구되는** 자리다: 고정비를 여기서 한 번에
// 빼고, 금고가 음수로 끝난 주가 연속되면 병원이 닫힌다. 하루만 있으면 돈이 늘기만 해서 게임에
// 실패가 없다 — 폐업이 있어야 "한 판"이 성립한다.
import type { SimWorld } from './world'
import { freshMorning } from './day'

/** 의사 1인 주 고정비(각색·튜닝값 — PR B에서 과별 정밀화). */
export const WEEKLY_DOCTOR_COST_MANWON = 2_000
/** 금고 음수가 이만큼 **연속**되면 폐업(기존 게임 규칙 계승). */
export const INSOLVENCY_WEEKS_TO_CLOSE = 2

export interface WeekSummary {
  week: number
  revenueManwon: number
  fixedCostManwon: number
  netManwon: number
  examsDone: number
  leftCount: number
}

/** 이번 주 성적표 — 순수 읽기라 결산 전후 어느 쪽에서 불러도 같은 값이다(days·의사 수만 본다).
 *  그래서 결산 결과를 세계에 따로 저장하지 않는다: 같은 숫자를 두 곳에 두면 한쪽이 조용히 낡는다. */
export function weekSummary(w: SimWorld): WeekSummary {
  const revenueManwon = w.days.reduce((sum, d) => sum + d.revenueManwon, 0)
  // 월급은 **의사**만 받는다 — pawns에는 마감을 넘긴 환자가 섞여 있을 수 있다.
  const doctors = w.pawns.filter(p => p.kind === 'DOCTOR').length
  const fixedCostManwon = doctors * WEEKLY_DOCTOR_COST_MANWON
  return {
    week: w.week,
    revenueManwon,
    fixedCostManwon,
    netManwon: revenueManwon - fixedCostManwon,
    examsDone: w.days.reduce((sum, d) => sum + d.examsDone, 0),
    leftCount: w.days.reduce((sum, d) => sum + d.leftCount, 0),
  }
}

/** 주간 결산 — 고정비 차감·insolvencyStreak 갱신·연속 문턱을 채우면 CLOSED.
 *  수익은 진료가 끝난 그 순간 이미 금고에 들어와 있다(settleDay) — 여기서 또 더하면 이중 지급이다.
 *  ⚠️ 이중 정산 가드: 두 번 부르면 고정비가 두 번 빠져 멀쩡한 병원이 장부로만 망한다.
 *  phase는 결산 화면을 유지해야 해서 못 쓰므로(world.weekSettled 주석) 표시로 막는다. */
export function settleWeek(w: SimWorld): SimWorld {
  if (w.phase !== 'WEEK_END') throw new Error(`settleWeek: WEEK_END가 아닌 세계(${w.phase})`)
  if (w.weekSettled) throw new Error('settleWeek: 이번 주는 이미 결산했다(고정비 이중 차감)')
  const treasuryManwon = w.treasuryManwon - weekSummary(w).fixedCostManwon
  // 0은 음수가 아니다 — 딱 고정비만큼 벌어 금고를 비운 주는 살아남는다.
  const insolvencyStreak = treasuryManwon < 0 ? w.insolvencyStreak + 1 : 0
  return {
    ...w,
    treasuryManwon,
    insolvencyStreak,
    weekSettled: true,
    // `>=`인 이유: 등호는 문턱을 이미 넘긴 세계(streak 2에서 또 적자)를 폐업으로 안 보고 그냥 연다.
    phase: insolvencyStreak >= INSOLVENCY_WEEKS_TO_CLOSE ? 'CLOSED' : 'WEEK_END',
  }
}

/** 다음 주 — 결산을 읽은 플레이어가 부른다. 방·의사·금고는 그대로 이어지고 주간 기록만 비운다.
 *  결산하지 않은 주는 넘길 수 없다(weekSettled): 그 경로가 열려 있으면 [다음 주]를 누르는 것만으로
 *  고정비를 건너뛸 수 있고, 그건 폐업 규칙 자체를 무력화한다. CLOSED면 phase 검사에 걸려 닫힌다. */
export function startNextWeek(w: SimWorld): SimWorld {
  if (w.phase !== 'WEEK_END') throw new Error(`startNextWeek: WEEK_END가 아닌 세계(${w.phase})`)
  if (!w.weekSettled) throw new Error('startNextWeek: 이번 주 결산이 아직이다')
  return {
    ...freshMorning(w),
    phase: 'RUNNING',
    week: w.week + 1,
    day: 1,
    days: [],       // 주간 기록은 이번 주치 — 안 비우면 다음 주 7일차가 오기 전에 결산이 열린다
    weekSettled: false,
  }
}
