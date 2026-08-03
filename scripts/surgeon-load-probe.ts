/**
 * ── 의사 부하·사직 밸런스 프로브 (계측기 — 게임 코드 아님)
 *
 * **무엇을 재나**: "의사가 왜 갈려나가는가"를 부하의 **원값**으로 분해한다. 피로는 100에서 접히고
 * 포화일수는 그 뒤에 세지므로, 피로만 보면 "얼마나 넘겼는지"가 안 보인다. 그래서 마감 시점의
 * `loadMinToday`(표준강도분)를 함께 찍는다 — 이 값이 밸런스 판정의 기준선이다.
 *
 * **기준선**: 하루 지속가능 부하 = `FATIGUE_FREE_MIN` + (`FATIGUE_REST` / `FATIGUE_PER_OVER_HOUR`) × 60
 * = 160 + 80 = **240 표준강도분**. 이보다 큰 날이 이어지면 피로는 하룻밤 회복으로 안 돌아온다.
 *
 * `cut-scenario-probe.ts`의 `run()` 하네스를 복사해 넷을 보탰다:
 *   ① 의사별·일별 (마감 피로 f, 포화일수 s, 하루 부하 L) 타임라인
 *   ② 그날 수용한 응급 건수 — 부하 급등이 응급 몰림에서 왔는지 외래에서 왔는지 가른다
 *   ③ 하루치 응급 되돌림 내역(kind·reason) — `stats.emergencyTurnedAway`는 아침마다 비므로
 *      마감 시점(DAY_END)에 통째로 걷는다. perMinute를 안 켜도 된다.
 *   ④ 대조군 S3(응급 전부 거절)·S5(방 고정 증원) — 응급 강도와 증원이 **실제로** 레버인지 잰다
 *
 * **1차 실측 결론(2026-08-04 · 서울 URBAN 시드 1 · 4주)** — 응급 강도는 사직의 손잡이가 아니다:
 *   · S3(응급 0건)에서도 외과 의사는 외래만으로 3주2일 포화 → 3주말 사직. 내과 의사도 마찬가지다.
 *   · 응급 강도를 1.7 → 1.3으로 내려 5개 시나리오를 다시 돌려도 **사직 주차가 하나도 안 바뀐다**
 *     (포화 시작만 S1에서 2일차 → 4일차로 밀린다).
 *   · 응급이 몰린 날은 하루 7건까지 오는데, 그 부하는 두 명이 나눠도 각자 500 표준강도분이 넘는다.
 *   → 손잡이는 `game/doctor.ts`의 세 상수(FREE_MIN·PER_OVER_HOUR·REST)나 외래 도착량 쪽이다.
 *
 * 실행: npx vitest run --config vitest.probe.config.ts scripts/surgeon-load-probe.ts
 */
import { describe, it } from 'vitest'

import { DAYS_PER_WEEK, DAY_END_MIN, startNextDay } from '@/sim/day'
import { hire, placeRoom, type RoomSpec } from '@/sim/testHelpers'
import { nurseGradeOf } from '@/sim/nurse'
import { hireNurse, setDoctorPriority } from '@/sim/pawn'
import { tick } from '@/sim/tick'
import { settleWeek, startNextWeek, weekSummary } from '@/sim/week'
import { applyMorningEvent } from '@/sim/director'
import { SIM_EVENTS } from '@/sim/events'
import { createWorld, type SimRegionKey, type SimWorld } from '@/sim/world'
import { type SimDeptKey } from '@/sim/dept'
import { computeRegions } from '@/sim/regions'
import { examSlots } from '@/sim/spots'
import { RESIGN_SATURATED_DAYS, FATIGUE_MAX } from '@/game/doctor'

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

const staffed = (w: SimWorld): SimWorld => {
  w = place(w, { type: 'RECEPTION', x: 40, y: 24, w: 6, h: 6 })
  const need = nurseGradeOf(w).required
  for (let i = 0; i < need; i++) w = hireNurse(w)
  return w
}

const doctorsOf = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR')

/** `accepted`는 그날 수용한 응급 건수 — `stats.emergencyAccepted`는 아침에 비므로 마감 시점에 읽는다. */
interface DayLog { week: number; day: number; event: string | null; accepted: number }
interface TimelineRow {
  week: number; day: number; name: string; dept: string
  fatigue: number; sat: number
  /** 그날 누적 표준강도분(`loadMinToday`) — 피로가 100에 접히면 크기를 못 보므로 원값을 같이 본다. */
  load: number
}
interface TurnRow { week: number; day: number; kind: string; reason: string }

interface RunResult {
  days: DayLog[]
  timeline: TimelineRow[]
  turnAways: TurnRow[]
  ending: string
  lastWeek: number
  treasury: number
  weeks: Array<{
    week: number; treasury: number; net: number; revenue: number; fixed: number
    accepted: number; turnedAway: number
  }>
  doctorState: Array<{ name: string; dept: string; fatigue: number; saturatedDays: number }>
  resigned: Array<{ week: number; names: string[] }>
}

interface RunOpts {
  region: SimRegionKey
  seed?: number
  weeks?: number
  make: (w: SimWorld) => SimWorld
}

function run(opts: RunOpts): RunResult {
  const { region, seed = 1, weeks = 4, make } = opts
  let w = make(createWorld(seed, { region }))

  const days: DayLog[] = []
  const timeline: TimelineRow[] = []
  const turnAways: TurnRow[] = []
  const weeksLog: RunResult['weeks'] = []
  const resigned: RunResult['resigned'] = []

  while (w.phase !== 'CLOSED' && weeksLog.length < weeks) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const dayLog: DayLog = { week: w.week, day: w.day, event: w.event?.kind ?? null, accepted: 0 }
      days.push(dayLog)
      w = tick(w, DAY_END_MIN)
      dayLog.accepted = w.stats.emergencyAccepted
      // 마감 시점 = 부하가 다 얹히고 포화일수까지 오른 뒤(settleDay), 아침 회복 전.
      for (const p of doctorsOf(w)) {
        timeline.push({
          week: w.week, day: w.day, name: p.name ?? p.id, dept: p.dept ?? '?',
          fatigue: p.fatigue ?? 0, sat: p.saturatedDays ?? 0, load: Math.round(p.loadMinToday ?? 0),
        })
      }
      for (const t of w.stats.emergencyTurnedAway) {
        turnAways.push({ week: w.week, day: w.day, kind: t.kind, reason: t.reason })
      }
      if (w.phase === 'DAY_END') w = applyMorningEvent(startNextDay(w))
    }
    if (w.phase !== 'WEEK_END') throw new Error(`주말에 닿지 못했다(${w.phase})`)
    const sum = weekSummary(w)
    const before = doctorsOf(w).map(p => ({ id: p.id, name: p.name ?? p.id }))
    w = settleWeek(w)
    weeksLog.push({
      week: sum.week, treasury: w.treasuryManwon, net: sum.netManwon,
      revenue: sum.revenueManwon, fixed: sum.fixedCostManwon,
      accepted: sum.emergencies.accepted, turnedAway: sum.emergencies.turnedAway,
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
    days, timeline, turnAways, weeks: weeksLog, resigned,
    ending: w.ending ?? '(미종결)',
    lastWeek: weeksLog.length,
    treasury: w.treasuryManwon,
    doctorState: doctorsOf(w).map(p => ({
      name: p.name ?? p.id, dept: p.dept ?? '?',
      fatigue: p.fatigue ?? 0, saturatedDays: p.saturatedDays ?? 0,
    })),
  }
}

const DEPT_LABEL: Record<string, string> = {
  INTERNAL_MEDICINE: '내과', GENERAL_SURGERY: '외과', AESTHETICS: '미용', CARDIOLOGY: '순환기',
}
const evLabel = (k: string | null) => (k ? SIM_EVENTS[k as keyof typeof SIM_EVENTS].label : '—')

function report(title: string, r: RunResult): void {
  const L = ['', `━━━ ${title} ━━━`]

  // 의사별 일별 타임라인 (일차 · 피로/포화)
  const names = [...new Set(r.timeline.map(t => t.name))]
  const deptOf = new Map(r.timeline.map(t => [t.name, t.dept]))
  L.push(['일차', ...names.map(n => `${n}(${DEPT_LABEL[deptOf.get(n)!] ?? deptOf.get(n)})`), '응급수용', '이벤트'].join('\t'))
  const dayKeys = [...new Set(r.timeline.map(t => `${t.week}/${t.day}`))]
  for (const key of dayKeys) {
    const [wk, dy] = key.split('/').map(Number)
    const cells = names.map(n => {
      const row = r.timeline.find(t => t.week === wk && t.day === dy && t.name === n)
      return row ? `f${row.fatigue} s${row.sat} L${row.load}` : '—'
    })
    const dayLog = r.days.find(d => d.week === wk && d.day === dy)
    L.push([`${(wk - 1) * 7 + dy}일차(${wk}주${dy}일)`, ...cells,
      `${dayLog?.accepted ?? 0}건`, evLabel(dayLog?.event ?? null)].join('\t'))
  }

  L.push('')
  L.push(['주', '수익', '순익', '고정비', '금고', '응급수용', '응급회차'].join('\t'))
  for (const wk of r.weeks) {
    L.push([wk.week, wk.revenue, wk.net, wk.fixed, wk.treasury, wk.accepted, wk.turnedAway]
      .map(String).join('\t'))
  }

  // 주별 응급 회차 내역(종류 × 사유)
  const bucket = new Map<string, number>()
  for (const t of r.turnAways) {
    const k = `${t.week}주 ${t.kind} ${t.reason}`
    bucket.set(k, (bucket.get(k) ?? 0) + 1)
  }
  if (bucket.size > 0) {
    L.push('')
    L.push('회차 내역(주 · 응급 종류 · 사유):')
    for (const [k, n] of bucket) L.push(`  ${k}\t${n}건`)
  }

  L.push('')
  L.push(`사직: ${r.resigned.map(x => `${x.week}주말 ${x.names.join('·')}`).join(' / ') || '없음'}`)
  L.push(`종료 ${r.ending} · ${r.lastWeek}주 · 금고 ${r.treasury.toLocaleString('en-US')}`)
  L.push(`임계: 포화 ${RESIGN_SATURATED_DAYS}일 · 피로 ${FATIGUE_MAX}`)
  console.log(L.join('\n'))
}

/** 표준 방 구성 — 대기실 · 진료실(과별) · 병동 · 접수처. */
function standard(
  w: SimWorld, exams: SimDeptKey[], plan: Partial<Record<SimDeptKey, number>>,
): SimWorld {
  w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
  exams.forEach((dept, i) => {
    w = place(w, { type: 'EXAM', dept, x: 2 + i * 7, y: 2, w: 6, h: 5 })
  })
  w = place(w, { type: 'WARD', x: 31, y: 9, w: 10, h: 6 })
  w = hireMany(w, plan)
  return staffed(w)
}

const surgeonOf = (w: SimWorld) =>
  w.pawns.find(p => p.kind === 'DOCTOR' && p.dept === 'GENERAL_SURGERY')!

describe('외과 부하 프로브 (서울 URBAN · 시드 1 · 4주)', () => {
  it('S1 재현 — 내과2·외과1·미용1', () => {
    report('S1 내과2·외과1·미용1', run({
      region: 'URBAN',
      make: w => standard(
        w,
        ['INTERNAL_MEDICINE', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'AESTHETICS'],
        { INTERNAL_MEDICINE: 2, GENERAL_SURGERY: 1, AESTHETICS: 1 },
      ),
    }))
  })

  it('S2 외과 증원 — 내과2·외과2·미용1 (외과 진료실 2칸)', () => {
    // 정원 확인: placeRoom의 EXAM 자동 가구는 **책상 1 + 의자 1**이라 방 하나 = 슬롯 하나다.
    const probe = standard(
      createWorld(1, { region: 'URBAN' }),
      ['GENERAL_SURGERY'], { GENERAL_SURGERY: 1 },
    )
    const regs = computeRegions(probe)
    const surgeryRoom = regs.find(rg => rg.type === 'EXAM' && rg.dept === 'GENERAL_SURGERY')!
    console.log(`\n[정원 확인] 외과 진료실 1칸의 진료 슬롯 = ${examSlots(probe, surgeryRoom).length}개`)

    report('S2 내과2·외과2·미용1 (외과 방 2칸)', run({
      region: 'URBAN',
      make: w => standard(
        w,
        ['INTERNAL_MEDICINE', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'GENERAL_SURGERY', 'AESTHETICS'],
        { INTERNAL_MEDICINE: 2, GENERAL_SURGERY: 2, AESTHETICS: 1 },
      ),
    }))
  })

  it('S3 응급 거절 레버 — S1과 같되 외과 의사 emergency=0', () => {
    report('S3 내과2·외과1(응급 0)·미용1', run({
      region: 'URBAN',
      make: w => {
        w = standard(
          w,
          ['INTERNAL_MEDICINE', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'AESTHETICS'],
          { INTERNAL_MEDICINE: 2, GENERAL_SURGERY: 1, AESTHETICS: 1 },
        )
        return setDoctorPriority(w, surgeonOf(w).id, 'emergency', 0)
      },
    }))
  })

  /* S2는 의사와 **진료실**을 함께 늘린다 — 그러면 외래 처리량이 같이 늘어 1인당 부하가 안 준다.
     "증원이 부하를 나눈다"를 곧이곧대로 재려면 방을 고정한 채 사람만 늘려야 한다. */
  it('S5 방 고정 증원 — 내과2·외과2·미용1 (외과 진료실 1칸)', () => {
    report('S5 내과2·외과2·미용1 (외과 방 1칸)', run({
      region: 'URBAN',
      make: w => standard(
        w,
        ['INTERNAL_MEDICINE', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'AESTHETICS'],
        { INTERNAL_MEDICINE: 2, GENERAL_SURGERY: 2, AESTHETICS: 1 },
      ),
    }))
  })

  it('S4 순환기 대조 — 내과2·순환기1·미용1', () => {
    report('S4 내과2·순환기1·미용1', run({
      region: 'URBAN',
      make: w => standard(
        w,
        ['INTERNAL_MEDICINE', 'INTERNAL_MEDICINE', 'CARDIOLOGY', 'AESTHETICS'],
        { INTERNAL_MEDICINE: 2, CARDIOLOGY: 1, AESTHETICS: 1 },
      ),
    }))
  })
})
