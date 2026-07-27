// 주의 마디 — 주간 결산(settleWeek)과 다음 주 시작(startNextWeek).
// 하루가 수익을 벌어들이는 자리라면, 주는 **비용이 청구되는** 자리다: 고정비를 여기서 한 번에
// 빼고, 금고가 음수로 끝난 주가 연속되면 병원이 닫힌다. 하루만 있으면 돈이 늘기만 해서 게임에
// 실패가 없다 — 폐업이 있어야 "한 판"이 성립한다.
import type { SimWorld } from './world'
import { freshMorning } from './day'
import { doctorDeptOf, type Pawn } from './pawn'
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from './dept'
// 임계는 기존 게임에서 임포트한다 — 복제하면 옛 층과 이 층의 "몇 일이면 떠나는가"가 조용히 갈린다.
import { RESIGN_SATURATED_DAYS } from '../game/doctor'

/** 금고 음수가 이만큼 **연속**되면 폐업(기존 게임 규칙 계승). */
export const INSOLVENCY_WEEKS_TO_CLOSE = 2

/** 결산 표의 한 줄 — 그 과가 이번 주에 **번 돈과 나간 돈**.
 *  `netManwon`을 들고 있는 이유는 이게 표시용 스냅샷이라서다(WeekSummary 전체가 그렇다) —
 *  세계에 저장되지 않고 매번 다시 계산되므로, 두 곳이 갈릴 자리가 없다. */
export interface WeekDeptLine {
  /** 주말 시점 그 과의 의사 수 — 고정비의 근거다(주중 채용·이탈은 이 슬라이스에 없다). */
  doctors: number
  /** 그 과가 번 돈 — 외래 + **응급 처치**다(응급 수가도 그 과 장부로 들어간다).
   *  그래서 `revenueManwon === 진료 수 × 수가`는 응급이 없는 과에서만 성립한다. */
  revenueManwon: number
  fixedCostManwon: number
  netManwon: number
}

export interface WeekSummary {
  week: number
  revenueManwon: number
  fixedCostManwon: number
  netManwon: number
  examsDone: number
  leftCount: number
  /** 과별 표 — **관계가 있는 과만** 줄이 선다(의사가 있거나 그 주에 돈을 벌었거나).
   *  0줄을 채우지 않는 것은 `SimDeptStats`(dept.ts)의 Partial 계승이다. */
  byDept: Partial<Record<SimDeptKey, WeekDeptLine>>
  /** 이번 주 응급 — 몇 건 받았고 몇 건 되돌아갔나. **사유별 내역은 여기 없다**(그건 그날
   *  그 순간의 메시지라 `stats.emergencyTurnedAway`가 소유한다 — DayRecord와 같은 분담). */
  emergencies: { accepted: number; turnedAway: number }
}

/** 이번 주 성적표 — 순수 읽기라 결산 전후 어느 쪽에서 불러도 같은 값이다(days·의사 수만 본다).
 *  그래서 결산 결과를 세계에 따로 저장하지 않는다: 같은 숫자를 두 곳에 두면 한쪽이 조용히 낡는다. */
export function weekSummary(w: SimWorld): WeekSummary {
  const revenueManwon = w.days.reduce((sum, d) => sum + d.revenueManwon, 0)
  const byDept = weekDeptTable(w)
  // 총 고정비는 **과별 표에서 유도한다** — 따로 합산하면 표와 총액이 갈릴 수 있고, 갈려도
  // 화면엔 둘 중 하나만 보인다(DayRecord.revenueManwon이 byDept에서 유도되는 것과 같은 이유).
  const fixedCostManwon = Object.values(byDept).reduce((sum, line) => sum + line.fixedCostManwon, 0)
  return {
    week: w.week,
    revenueManwon,
    fixedCostManwon,
    netManwon: revenueManwon - fixedCostManwon,
    examsDone: w.days.reduce((sum, d) => sum + d.examsDone, 0),
    leftCount: w.days.reduce((sum, d) => sum + d.leftCount, 0),
    byDept,
    emergencies: {
      accepted: w.days.reduce((sum, d) => sum + d.emergencies.accepted, 0),
      turnedAway: w.days.reduce((sum, d) => sum + d.emergencies.turnedAway, 0),
    },
  }
}

/** 과별 표를 세운다 — **줄이 서는 과 = 의사가 있는 과 ∪ 그 주에 돈을 번 과**.
 *
 *  둘의 합집합인 것이 계약이다. 의사만 있고 수익이 0인 과는 "진료를 한 건도 안 봐도 주급은
 *  나간다"는 이 게임의 지출 쪽 절반이라 반드시 보여야 하고, 반대로 수익만 있고 의사가 0명인
 *  과(PR C의 사직이 붙으면 실재한다 — 주중에 벌고 주말 전에 떠난 과)를 빼면 Σ byDept가
 *  총수익과 어긋난다. 한쪽만 보면 둘 중 하나가 조용히 사라진다.
 *
 *  줄 순서는 카탈로그 순서(HIRABLE_DEPTS = 고정비 오름차순)라 화면이 흔들리지 않는다. */
function weekDeptTable(w: SimWorld): Partial<Record<SimDeptKey, WeekDeptLine>> {
  const doctorsOf = new Map<SimDeptKey, number>()
  for (const p of w.pawns) {
    // 월급은 **의사**만 받는다 — pawns에는 마감을 넘긴 환자가 섞여 있을 수 있다.
    if (p.kind !== 'DOCTOR') continue
    const dept = doctorDeptOf(p)
    doctorsOf.set(dept, (doctorsOf.get(dept) ?? 0) + 1)
  }
  const revenueOf = new Map<SimDeptKey, number>()
  for (const rec of w.days) {
    for (const [key, stat] of Object.entries(rec.byDept) as [SimDeptKey, { revenueManwon: number }][]) {
      revenueOf.set(key, (revenueOf.get(key) ?? 0) + stat.revenueManwon)
    }
  }
  const table: Partial<Record<SimDeptKey, WeekDeptLine>> = {}
  for (const key of HIRABLE_DEPTS) {
    const doctors = doctorsOf.get(key) ?? 0
    const revenueManwon = revenueOf.get(key) ?? 0
    if (doctors === 0 && revenueManwon === 0) continue
    const fixedCostManwon = doctors * simDept(key).weeklyCostManwon
    table[key] = { doctors, revenueManwon, fixedCostManwon, netManwon: revenueManwon - fixedCostManwon }
  }
  return table
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

/**
 * 이번 주말에 **떠나는 사람들** — 포화로 마감한 날이 `RESIGN_SATURATED_DAYS`에 닿은 의사.
 * 순수 파생이라 세계에 저장하지 않는다(weekSummary와 같은 계약 — 저장하면 한쪽이 조용히 낡는다).
 *
 * ⚠️ **통지와 집행의 단일 출처**다: 결산 화면(계획 Task 5)이 사직 줄을 이 함수로 읽고,
 * `startNextWeek`이 **바로 이 함수로** 명단을 지운다. 두 자리가 각자 임계를 적으면 안 떠난
 * 사람이 통지되거나 통지 없이 사람이 사라지고, 그건 플레이어에게 "버그"가 아니라 "내가 뭘
 * 놓쳤나"로 보인다. 이 계약은 resignation.test.ts 「통지와 집행은 같은 명단이다」가 잠근다.
 *
 * 의사만 본다 — 포화는 의사만 갖는 상태이고(pawn.saturatedDays), 마감을 넘긴 환자가 pawns에
 * 섞여 있을 수 있다(weekDeptTable의 `kind` 검사와 같은 이유).
 *
 * ⓘ **주말이 아니어도 계산된다** — 국면을 안 보고 `saturatedDays`만 읽으므로, 임계에 닿은 그
 *   순간부터(주 3일차 저녁이든) 참이다. 그래서 화면은 이 함수로 "다음 주에 떠날 사람"을 주중에도
 *   미리 보여줄 수 있다(PriorityPanel의 「이번 주말 떠남」 배지). 집행은 여전히 `startNextWeek`
 *   한 곳뿐이라, 미리 읽는다고 사람이 일찍 사라지지는 않는다.
 */
export function resigningSimDoctors(w: SimWorld): Pawn[] {
  return w.pawns.filter(
    p => p.kind === 'DOCTOR' && (p.saturatedDays ?? 0) >= RESIGN_SATURATED_DAYS,
  )
}

/** 다음 주 — 결산을 읽은 플레이어가 부른다. 방·의사·금고는 그대로 이어지고 주간 기록만 비운다.
 *  결산하지 않은 주는 넘길 수 없다(weekSettled): 그 경로가 열려 있으면 [다음 주]를 누르는 것만으로
 *  고정비를 건너뛸 수 있고, 그건 폐업 규칙 자체를 무력화한다. CLOSED면 phase 검사에 걸려 닫힌다. */
export function startNextWeek(w: SimWorld): SimWorld {
  if (w.phase !== 'WEEK_END') throw new Error(`startNextWeek: WEEK_END가 아닌 세계(${w.phase})`)
  if (!w.weekSettled) throw new Error('startNextWeek: 이번 주 결산이 아직이다')
  // 사직은 **여기서만** 일어난다. 그래서 고정비(settleWeek)는 자동으로 **사직 전** 명단으로
  // 청구된다 — 그 주를 일한 사람의 주급은 나간다. 순서를 뒤집으면 갈려 나간 사람의 마지막 주가
  // 공짜 노동이 되고, 그건 이 게임이 하려는 말의 정반대다.
  // 명단을 `freshMorning` **전**에 뽑아도 결과는 같다 — 아침 리셋이 건드리는 것은 피로·부하·
  // 허기이고 `saturatedDays`에는 **리셋이 없다**(pawn.saturatedDays 주석). 순서가 무관하다는
  // 사실을 여기 적어 두는 이유는, 무관하지 않게 되는 날(포화 일수에 회복 규칙이 붙는 날)
  // 이 두 줄의 순서가 조용히 명단을 바꾸기 때문이다.
  const leaving = new Set(resigningSimDoctors(w).map(p => p.id))
  const morning = freshMorning(w)
  return {
    ...morning,
    // ⚠️ 떠난 사람은 `hirePool`로 **돌아가지 않는다**(그래서 여기서 풀을 손대지 않는다):
    // 다른 병원으로 옮긴 게 아니라 필수의료를 떠난 것이다(기존 게임 규칙 계승). 되돌리면
    // 사직이 벌이 아니라 "재채용 한 번"이 되어 인력 제로섬이 통째로 사라진다.
    // 사직자의 `priorities`도 함께 사라진다 — 같은 과를 다시 뽑으면 세 축이 2에서 시작하는 것은
    // **의도**다(그는 다른 사람이다).
    pawns: morning.pawns.filter(p => !leaving.has(p.id)),
    phase: 'RUNNING',
    week: w.week + 1,
    day: 1,
    days: [],       // 주간 기록은 이번 주치 — 안 비우면 다음 주 7일차가 오기 전에 결산이 열린다
    weekSettled: false,
  }
}
