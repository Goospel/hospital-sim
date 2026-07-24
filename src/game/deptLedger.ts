import type { DepartmentSpec, DeptKey, Hospital } from './types'
import type { ReceivingState } from './receiving'
import type { DayRecord } from './session'
import { callDelta } from './receiving'
import { handlingDept } from './doctor'
import { DAYS_PER_WEEK, DEPARTMENTS } from './setup'

// 과별 손익 영수증 — "어느 과가 얼마나 손해를 내는가"를 화면에 세운다.
// 스펙: docs/superpowers/specs/2026-07-24-dept-ledger-receipt-design.md
//
// 판정·경제는 한 줄도 안 건드린다 — 이 모듈은 **집계와 표시용 파생**뿐이다. 해석 카피 없음
// (메모 game-show-dont-tell): "순환기가 응급 때문에 적자"라고 말하지 않는다. 열 이름과 숫자만 놓는다.

/** 하루 과별 스냅샷 — 수용된 콜만, 담당 과(handlingDept)로 접은 {환자 수, 진료 델타 합(만원)}. */
export type DeptDayStats = Partial<Record<DeptKey, { patients: number; revenueManwon: number }>>

/**
 * 그날 수용된 콜을 담당 과로 접는다 — 하루 마감 시점(recordDay)에 한 번 계산해 DayRecord에 굳힌다.
 *
 * accepted만 세는 게 BUMP 정합의 전부다: applyBump이 밀린 예약 로그를 accepted:false로 되돌리므로
 * 회수된 수익·환자가 자동으로 빠진다(별도 처리 없음 — receiving.ts applyBump 참조).
 * 워크인의 미용/검진 분기는 handlingDept가 이미 라벨로 가른다 — 여기서 라벨을 다시 파싱하지 않는다.
 *
 * 불변식 I-A: Σ revenueManwon === receiving.netProfitDeltaManwon. decide가 accept마다 callDelta를
 * 더하고 BUMP가 로그·델타를 함께 되돌리므로 항상 성립한다 — 깨지면 이 집계가 거짓말하는 것이다.
 */
export function deptDayStats(receiving: Pick<ReceivingState, 'log' | 'queue'>): DeptDayStats {
  const out: DeptDayStats = {}
  receiving.log.forEach((entry, i) => {
    if (!entry.accepted) return
    const call = receiving.queue[i]
    const dept = handlingDept(call)
    const cur = out[dept] ?? { patients: 0, revenueManwon: 0 }
    cur.patients += 1
    cur.revenueManwon += callDelta(call.kind)
    out[dept] = cur
  })
  return out
}

/** 영수증 한 줄 — 한 과의 환자 수·진료(수가−원가)·고정비·순익(만원). fixedManwon은 음수. */
export interface DeptLedgerLine {
  key: DeptKey
  label: string
  patients: number
  revenueManwon: number // 진료 델타 합(수가 − 원가). 응급과는 음수다.
  fixedManwon: number // 고정비 = round(주간 고정비 / 7) × days.length (항상 ≤ 0)
  netManwon: number // revenueManwon + fixedManwon
}

/**
 * 날 배열 + 병원 → 과별 한 줄. **하루 마감(days 1개)과 주간 마감(days 7개)이 같은 함수를 쓴다** —
 * 두 화면 숫자가 구조적으로 어긋날 수 없다.
 *
 * 고정비 출처는 `hospital.economics.segments`(월드 이벤트가 적용된 실제 값)이고, segment↔과 조인은
 * **label 일치**로 한다(segments가 dept.label로 만들어진다 — setup.ts buildHospital). departments는
 * 라벨·순서·key의 출처다(호출부가 world?.departments를 넘긴다 — 라벨은 이벤트로 안 바뀌므로 조인 안정).
 *
 * 불변식 I-B: Σ netManwon === Σ days.netProfitManwon (오차 0).
 * 근거: 일 고정비를 round(주간/7)로 잡으면 accruedSegments(p=1)의 반올림과 자릿수까지 같고,
 * DayRecord.netProfitManwon이 바로 그 값 + netProfitDelta(= Σ 과별 진료)로 만들어졌다.
 * ⚠️ 주간 전액을 그대로 쓰면 7×round(주간/7) ≠ 주간 오차로 이 등식이 깨진다 — 반드시 일 단위 반올림 × 일수.
 */
export function deptLedgerLines(
  days: Pick<DayRecord, 'deptStats'>[],
  hospital: Hospital,
  departments: DepartmentSpec[] = DEPARTMENTS,
): DeptLedgerLine[] {
  const segments = hospital.economics?.segments ?? []

  // 날들에 걸쳐 과별 진료·환자를 합산한다.
  const agg = new Map<DeptKey, { patients: number; revenueManwon: number }>()
  for (const day of days) {
    for (const [key, stat] of Object.entries(day.deptStats ?? {}) as [DeptKey, { patients: number; revenueManwon: number }][]) {
      const cur = agg.get(key) ?? { patients: 0, revenueManwon: 0 }
      cur.patients += stat.patients
      cur.revenueManwon += stat.revenueManwon
      agg.set(key, cur)
    }
  }

  const lines: DeptLedgerLine[] = []
  for (const dept of departments) {
    const seg = segments.find((s) => s.label === dept.label)
    const stat = agg.get(dept.key)
    if (!seg && !stat) continue // 미채용·무활동 과는 줄이 없다
    const weeklyFixed = seg?.profitManwon ?? 0 // 음수(고정비의 음수). 없으면 0.
    const fixedManwon = Math.round(weeklyFixed / DAYS_PER_WEEK) * days.length
    const revenueManwon = stat?.revenueManwon ?? 0
    lines.push({
      key: dept.key,
      label: dept.label,
      patients: stat?.patients ?? 0,
      revenueManwon,
      fixedManwon,
      netManwon: revenueManwon + fixedManwon,
    })
  }
  return lines
}
