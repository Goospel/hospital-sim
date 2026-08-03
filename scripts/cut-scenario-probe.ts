/**
 * ── 제출 영상 후반 컷 역산 프로브 — **일회용 계측기**(커밋 대상 아님)
 *
 * 컷4(첫 속보) · 컷5(첫 회차) · 컷6(소송 + 위축 고지) · 컷7(사람이 바닥남 엔딩)의
 * 발생 조건을 헤드리스로 역산한다. `region-balance-probe.ts`의 형태를 따르되 한 가지가
 * 결정적으로 다르다: **아침 전이 직후 `applyMorningEvent`를 부른다.** 그게 없으면
 * 이벤트가 영영 안 붙어(밸런스 프로브가 그렇다) 컷4·컷6을 아예 못 잰다.
 *
 * 실행: npx vitest run --config vitest.probe.config.ts scripts/cut-scenario-probe.ts
 */
import { describe, it } from 'vitest'

import { DAYS_PER_WEEK, DAY_END_MIN, startNextDay } from '@/sim/day'
import { hire, placeRoom, type RoomSpec } from '@/sim/testHelpers'
import { nurseGradeOf } from '@/sim/nurse'
import { hireNurse } from '@/sim/pawn'
import { tick } from '@/sim/tick'
import { CAMPAIGN_WEEKS, settleWeek, startNextWeek, weekSummary } from '@/sim/week'
import { applyMorningEvent } from '@/sim/director'
import { SIM_EVENTS } from '@/sim/events'
import { createWorld, type SimRegionKey, type SimWorld } from '@/sim/world'
import { simDept, type SimDeptKey } from '@/sim/dept'
import { emergencySpec } from '@/sim/emergency'
import { RESIGN_SATURATED_DAYS, FATIGUE_MAX } from '@/game/doctor'

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

const place = (w: SimWorld, spec: RoomSpec): SimWorld => {
  const r = placeRoom(w, spec)
  if (!r.ok) throw new Error(`건설 거부(${r.reason}) — ${spec.type} @${spec.x},${spec.y}`)
  return r.world
}

const hireMany = (w: SimWorld, plan: Partial<Record<SimDeptKey, number>>): SimWorld => {
  for (const [dept, n] of Object.entries(plan) as [SimDeptKey, number][]) {
    for (let i = 0; i < n; i++) w = hire(w, dept)
  }
  return w
}

/** 접수처 + 간호등급 기준(⌈의사÷2⌉)을 채우는 간호사. 간호사는 **맨 뒤에** 뽑는다. */
const staffed = (w: SimWorld): SimWorld => {
  w = place(w, { type: 'RECEPTION', x: 40, y: 24, w: 6, h: 6 })
  const need = nurseGradeOf(w).required
  for (let i = 0; i < need; i++) w = hireNurse(w)
  return w
}

const doctorsOf = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR')

interface TurnAway { week: number; day: number; minute: number; kind: string; reason: string }
interface DayLog { week: number; day: number; event: string | null }

interface RunResult {
  days: DayLog[]
  turnAways: TurnAway[]
  ending: string
  lastWeek: number
  treasury: number
  weeks: Array<{ week: number; treasury: number; net: number; revenue: number; fixed: number }>
  lawsuits: Array<{ week: number; day: number; costManwon?: number; chilledName?: string }>
  /** 판 끝 시점의 의사별 (이름, 과, 피로, 포화일수) */
  doctorState: Array<{ name: string; dept: string; fatigue: number; saturatedDays: number }>
  /** 판 전체에서 관측된 의사별 최대 포화일수 (사직해 사라진 사람 포함) */
  peakSaturated: Map<string, { dept: string; peak: number; peakFatigue: number }>
  resigned: Array<{ week: number; names: string[] }>
}

interface RunOpts {
  region: SimRegionKey
  seed?: number
  weeks?: number
  /** 세계 초기 구성(1주 1일차 개원 시점). */
  make: (w: SimWorld) => SimWorld
  /** 매일 아침(이벤트 적용 후 · 시계 돌기 전) 부르는 조작 — 채용·건설의 자리. */
  onMorning?: (w: SimWorld, week: number, day: number) => SimWorld
  /** 분 단위 틱(회차 시각을 재려면 필수). 느리므로 필요한 실험에서만 켠다. */
  perMinute?: boolean
}

function run(opts: RunOpts): RunResult {
  const { region, seed = 1, weeks = CAMPAIGN_WEEKS, make, onMorning, perMinute = true } = opts
  let w = make(createWorld(seed, { region }))

  const days: DayLog[] = []
  const turnAways: TurnAway[] = []
  const lawsuits: RunResult['lawsuits'] = []
  const weeksLog: RunResult['weeks'] = []
  const peakSaturated = new Map<string, { dept: string; peak: number; peakFatigue: number }>()
  const resigned: RunResult['resigned'] = []

  const notePeaks = (world: SimWorld) => {
    for (const p of doctorsOf(world)) {
      const key = p.id
      const cur = peakSaturated.get(key) ?? { dept: p.dept ?? '?', peak: 0, peakFatigue: 0 }
      cur.peak = Math.max(cur.peak, p.saturatedDays ?? 0)
      cur.peakFatigue = Math.max(cur.peakFatigue, p.fatigue ?? 0)
      peakSaturated.set(key, cur)
    }
  }

  while (w.phase !== 'CLOSED' && weeksLog.length < weeks) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      if (onMorning) w = onMorning(w, w.week, w.day)
      days.push({ week: w.week, day: w.day, event: w.event?.kind ?? null })
      if (w.event?.kind === 'LAWSUIT') {
        lawsuits.push({
          week: w.week, day: w.day,
          costManwon: w.event.costManwon, chilledName: w.event.chilledName,
        })
      }
      if (perMinute) {
        let seen = w.stats.emergencyTurnedAway.length
        for (let m = 0; m < DAY_END_MIN; m++) {
          w = tick(w, 1)
          const list = w.stats.emergencyTurnedAway
          while (seen < list.length) {
            turnAways.push({
              week: w.week, day: w.day, minute: w.minute,
              kind: list[seen].kind, reason: list[seen].reason,
            })
            seen++
          }
        }
      } else {
        w = tick(w, DAY_END_MIN)
      }
      notePeaks(w)
      if (w.phase === 'DAY_END') w = applyMorningEvent(startNextDay(w))
    }
    if (w.phase !== 'WEEK_END') throw new Error(`주말에 닿지 못했다(${w.phase})`)
    const sum = weekSummary(w)
    const before = doctorsOf(w).map(p => ({ id: p.id, name: p.name ?? p.id }))
    w = settleWeek(w)
    weeksLog.push({
      week: sum.week, treasury: w.treasuryManwon, net: sum.netManwon,
      revenue: sum.revenueManwon, fixed: sum.fixedCostManwon,
    })
    if (w.phase === 'CLOSED') break
    const weekJustEnded = w.week
    w = startNextWeek(w)
    const after = new Set(doctorsOf(w).map(p => p.id))
    const gone = before.filter(b => !after.has(b.id)).map(b => b.name)
    if (gone.length > 0) resigned.push({ week: weekJustEnded, names: gone })
    w = applyMorningEvent(w)
  }

  return {
    days, turnAways, lawsuits, weeks: weeksLog, peakSaturated, resigned,
    ending: w.ending ?? '(미종결)',
    lastWeek: weeksLog.length,
    treasury: w.treasuryManwon,
    doctorState: doctorsOf(w).map(p => ({
      name: p.name ?? p.id, dept: p.dept ?? '?',
      fatigue: p.fatigue ?? 0, saturatedDays: p.saturatedDays ?? 0,
    })),
  }
}

const evLabel = (k: string | null) => (k ? SIM_EVENTS[k as keyof typeof SIM_EVENTS].label : '—')
const reasonLabel = (r: string) => (r === 'NO_SPECIALIST' ? '그 과 의사가 없다' : '빈 병상이 없다')

// ── 빌드 ─────────────────────────────────────────────────────────────────────

/** 표준 방 구성 — 대기실 · 진료실(과별) · 병동 · 접수처. 진료실 좌표는 x = 2 + 7k. */
function standard(
  w: SimWorld,
  exams: SimDeptKey[],
  plan: Partial<Record<SimDeptKey, number>>,
  opts: { ward?: boolean } = {},
): SimWorld {
  const { ward = true } = opts
  w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
  exams.forEach((dept, i) => {
    w = place(w, { type: 'EXAM', dept, x: 2 + i * 7, y: 2, w: 6, h: 5 })
  })
  if (ward) w = place(w, { type: 'WARD', x: 31, y: 9, w: 10, h: 6 })
  w = hireMany(w, plan)
  return staffed(w)
}

// ── Q1 · 컷4: 첫 속보는 며칠차인가 ───────────────────────────────────────────

describe('컷 역산 프로브', () => {
  it('Q1 — 서울(URBAN) 내과2·미용1 표준 개원의 3주치 아침 이벤트', () => {
    const r = run({
      region: 'URBAN',
      weeks: 3,
      perMinute: false,
      make: w => standard(
        w,
        ['INTERNAL_MEDICINE', 'INTERNAL_MEDICINE', 'AESTHETICS'],
        { INTERNAL_MEDICINE: 2, AESTHETICS: 1 },
      ),
    })
    const lines = ['', '━━━ Q1 서울(URBAN) · 내과2·미용1 · 시드 1 ━━━']
    for (const d of r.days) {
      const n = (d.week - 1) * 7 + d.day
      lines.push(`${n}일차(${d.week}주 ${d.day}일)\t${evLabel(d.event)}`)
    }
    const first = r.days.find(d => d.event)
    lines.push('')
    lines.push(first
      ? `첫 속보 = ${(first.week - 1) * 7 + first.day}일차(${first.week}주 ${first.day}일) · ${evLabel(first.event)}`
      : '3주 안에 이벤트 없음')
    lines.push(`회차 누계 ${r.turnAways.length} · 금고 ${r.treasury.toLocaleString('en-US')}`)
    console.log(lines.join('\n'))
  })

  it('Q2 — 전북 정읍시(PROVINCIAL) 미용1·내과2, 첫 NO_SPECIALIST 회차', () => {
    const r = run({
      region: 'PROVINCIAL',
      weeks: 3,
      make: w => standard(
        w,
        ['AESTHETICS', 'INTERNAL_MEDICINE', 'INTERNAL_MEDICINE'],
        { AESTHETICS: 1, INTERNAL_MEDICINE: 2 },
      ),
    })
    const lines = ['', '━━━ Q2 정읍(PROVINCIAL) · 미용1·내과2 · 시드 1 ━━━']
    lines.push(['일차', '주', '일', '게임분', '응급', '사유'].join('\t'))
    for (const t of r.turnAways.slice(0, 12)) {
      const n = (t.week - 1) * 7 + t.day
      lines.push([
        `${n}일차`, t.week, t.day, `${t.minute}분`,
        emergencySpec(t.kind as 'STEMI').label, `${t.reason}(${reasonLabel(t.reason)})`,
      ].join('\t'))
    }
    lines.push('')
    lines.push(`3주 회차 총 ${r.turnAways.length}건 · 아침 이벤트: ${
      r.days.filter(d => d.event).map(d => `${(d.week - 1) * 7 + d.day}일차 ${evLabel(d.event)}`).join(' · ') || '없음'
    }`)
    console.log(lines.join('\n'))
  })

  it('Q3a — 정읍 미용1·내과2를 12주까지: 첫 LAWSUIT', () => {
    const r = run({
      region: 'PROVINCIAL',
      perMinute: false,
      make: w => standard(
        w,
        ['AESTHETICS', 'INTERNAL_MEDICINE', 'INTERNAL_MEDICINE'],
        { AESTHETICS: 1, INTERNAL_MEDICINE: 2 },
      ),
    })
    const lines = ['', '━━━ Q3a 정읍 · 미용1·내과2 · 12주 ━━━']
    for (const d of r.days.filter(x => x.event)) {
      lines.push(`${(d.week - 1) * 7 + d.day}일차(${d.week}주 ${d.day}일)\t${evLabel(d.event)}`)
    }
    lines.push('')
    lines.push(r.lawsuits.length
      ? r.lawsuits.map(l => `LAWSUIT ${(l.week - 1) * 7 + l.day}일차(${l.week}주 ${l.day}일) · 합의금 ${l.costManwon}만원 · 위축 ${l.chilledName ?? '(대상 없음)'}`).join('\n')
      : '12주 안에 LAWSUIT 없음')
    lines.push(`종료 ${r.ending} · ${r.lastWeek}주 · 금고 ${r.treasury.toLocaleString('en-US')}`)
    console.log(lines.join('\n'))
  })

  it('Q3b — 정읍 미용1·내과1·순환기1 + 병동 없음: 첫 LAWSUIT과 위축 대상', () => {
    const r = run({
      region: 'PROVINCIAL',
      make: w => standard(
        w,
        ['AESTHETICS', 'INTERNAL_MEDICINE', 'CARDIOLOGY'],
        { AESTHETICS: 1, INTERNAL_MEDICINE: 1, CARDIOLOGY: 1 },
        { ward: false },
      ),
    })
    const lines = ['', '━━━ Q3b 정읍 · 미용1·내과1·순환기1 · 병동 없음 · 12주 ━━━']
    lines.push('첫 회차 3건:')
    for (const t of r.turnAways.slice(0, 3)) {
      const n = (t.week - 1) * 7 + t.day
      lines.push(`  ${n}일차(${t.week}주 ${t.day}일) ${t.minute}분 · ${emergencySpec(t.kind as 'STEMI').label} · ${t.reason}`)
    }
    lines.push('아침 이벤트:')
    for (const d of r.days.filter(x => x.event)) {
      lines.push(`  ${(d.week - 1) * 7 + d.day}일차(${d.week}주 ${d.day}일)\t${evLabel(d.event)}`)
    }
    lines.push('')
    lines.push(r.lawsuits.length
      ? r.lawsuits.map(l => `LAWSUIT ${(l.week - 1) * 7 + l.day}일차(${l.week}주 ${l.day}일) · 합의금 ${l.costManwon}만원 · 위축 대상 ${l.chilledName ?? '(없음)'}`).join('\n')
      : '12주 안에 LAWSUIT 없음')
    lines.push(`종료 ${r.ending} · ${r.lastWeek}주 · 금고 ${r.treasury.toLocaleString('en-US')} · 회차 ${r.turnAways.length}건`)
    console.log(lines.join('\n'))
  })

  it('Q4 — RURAL 전원 채용 그라인드: NO_PEOPLE 도달 여부', () => {
    // 농어촌 풀 = 미용2·내과3·외과2·순환기1 = 8. NO_PEOPLE은 **여덟 전원**이 사직해야 선다.
    const r = run({
      region: 'RURAL',
      make: w => {
        w = place(w, { type: 'WAITING', x: 14, y: 17, w: 20, h: 13 })
        w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
        w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 9, y: 2, w: 6, h: 5 })
        w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 16, y: 2, w: 6, h: 5 })
        w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 23, y: 2, w: 6, h: 5 })
        w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 30, y: 2, w: 6, h: 5 })
        w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 37, y: 2, w: 6, h: 5 })
        w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 2, y: 9, w: 6, h: 5 })
        w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 9, y: 9, w: 6, h: 5 })
        w = place(w, { type: 'WARD', x: 16, y: 9, w: 14, h: 6 })
        w = hireMany(w, {
          AESTHETICS: 2, INTERNAL_MEDICINE: 3, GENERAL_SURGERY: 2, CARDIOLOGY: 1,
        })
        return staffed(w)
      },
      perMinute: false,
    })
    const lines = ['', '━━━ Q4 농어촌(RURAL) · 풀 전원 8명 즉시 채용 · 12주 ━━━']
    lines.push(['주', '금고', '순익', '수익', '고정비'].join('\t'))
    for (const wk of r.weeks) {
      lines.push([wk.week, wk.treasury.toLocaleString('en-US'), wk.net.toLocaleString('en-US'),
        wk.revenue.toLocaleString('en-US'), wk.fixed.toLocaleString('en-US')].join('\t'))
    }
    lines.push('')
    lines.push(`종료 ${r.ending} · ${r.lastWeek}주`)
    lines.push(`사직: ${r.resigned.map(x => `${x.week}주말 ${x.names.join('·')}`).join(' / ') || '없음'}`)
    lines.push('의사별 최대 포화일수 / 최대 피로 (임계 = 포화 ' + RESIGN_SATURATED_DAYS + '일 · 피로 ' + FATIGUE_MAX + '):')
    for (const [id, v] of r.peakSaturated) {
      lines.push(`  ${id}\t${simDept(v.dept as SimDeptKey).label}\t포화 ${v.peak}일\t최대 피로 ${v.peakFatigue}`)
    }
    console.log(lines.join('\n'))
  })
})
