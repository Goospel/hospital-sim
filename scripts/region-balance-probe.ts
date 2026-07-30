/**
 * ── 지역 밸런스 프로브 — **테스트가 아니라 계측기다**
 *
 * 네 지역을 같은 빌드로 12주 끝까지 돌려 장부를 비교한다. 단언이 거의 없는 것이 의도다:
 * 이 파일이 답하는 질문은 "규칙이 맞나"가 아니라 **"플레이어가 지역차를 느끼나"**이고,
 * 그 답은 통과/실패가 아니라 표다.
 *
 * ⚠️ **이 파일이 존재하는 이유가 재현성이다.** 2026-07-30 1차 프로브는 스크립트를 안 남겨
 * 수치가 재현 불가능했고, 리뷰어의 독립 프로브가 **정반대 순서**를 냈다. 원인은 밸런스가
 * 아니라 빌드였다 — 좌석·의사가 얇으면 도착 배율이 용량에 막혀 장부에 도달하지 못하고
 * 지역차가 임대료 하나로 축소된다. **프로브가 재는 것은 「지역」이 아니라 「지역 × 빌드」다.**
 * 그래서 빌드를 주석이 아니라 **코드로** 박고 커밋한다.
 *
 * 본 테스트 스위트에서는 빠져 있다(vitest.config.ts의 include가 `src/**`). 실행:
 *
 *   npm run probe
 *
 * 결과를 문서에 옮길 땐 **빌드 이름과 시드를 함께** 적는다. 안 적으면 다시 재현 불가능해진다.
 */
import { describe, it } from 'vitest'

import { DAYS_PER_WEEK, DAY_END_MIN, startNextDay } from '@/sim/day'
import { hire, placeRoom, withCashier, type RoomSpec } from '@/sim/testHelpers'
import { hireNurse } from '@/sim/pawn'
import { tick } from '@/sim/tick'
import { CAMPAIGN_WEEKS, settleWeek, startNextWeek, weekSummary, type WeekSummary } from '@/sim/week'
import { REGIONS, createWorld, type SimRegionKey, type SimWorld } from '@/sim/world'
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from '@/sim/dept'

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

/**
 * 수납 창구 n개 + 간호사 n명.
 *
 * ⚠️ **창구 하나는 병목이다**(실측 2026-07-30): 좌석 35짜리 병원에서도 진료비의 **약 70%가
 * 미수로 샜다**(수익 10,403 · 미수 27,120). `autoFurniture`가 RECEPTION 하나당 COUNTER를
 * **딱 하나** 놓기 때문에 방을 키워도 소용없고, 창구를 늘리려면 **방을 더 지어야** 한다.
 *
 * 이걸 모르고 재면 프로브가 「지역 밸런스」가 아니라 「창구 처리량」을 잰다 — 지역 규칙이
 * 만드는 차이보다 미수 누수가 몇 배 크기 때문이다.
 *
 * 좌표는 부지 오른쪽 기둥에 세로로 쌓는다(x40~45) — 다른 방들이 x≤38에 있어 겹치지 않는다.
 */
const cashiers = (w: SimWorld, n: number): SimWorld => {
  const spots = [24, 17, 10]
  if (n > spots.length) throw new Error(`창구 자리는 ${spots.length}개까지다`)
  for (let i = 0; i < n; i++) w = place(w, { type: 'RECEPTION', x: 40, y: spots[i], w: 6, h: 6 })
  // 간호사는 **맨 뒤에** — spawnSpotNear가 정문 근처를 가져가므로 앞에 두면 뒤 채용자가 밀린다
  // (testHelpers.withCashier와 같은 계약).
  for (let i = 0; i < n; i++) w = hireNurse(w)
  return w
}

interface Build {
  name: string
  /** 사람 수를 표에 적기 위한 기재 — 「빌드를 안 적으면 재현 불가」의 최소 단위다. */
  note: string
  make: (w: SimWorld) => SimWorld
}

/**
 * ① 얇은 빌드 — **1차 프로브가 쓴 그 빌드**(claude-docs/plan.md 기재값 재현).
 * 대기실 16×11(좌석 35) · 진료실 4(과당 1) · 병동 10×6(침대 8) · 접수처 · 의사 4 · 간호사 1.
 */
const THIN: Build = {
  name: 'thin',
  note: '좌석 35 · 진료실 4 · 침대 8 · 의사 4(과당 1) · 간호사 1',
  make: w => {
    w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
    w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 2, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 9, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 16, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 23, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'WARD', x: 31, y: 2, w: 10, h: 6 })
    w = hireMany(w, { INTERNAL_MEDICINE: 1, GENERAL_SURGERY: 1, CARDIOLOGY: 1, AESTHETICS: 1 })
    return withCashier(w)
  },
}

/**
 * ①ʹ 얇은 빌드 + **창구 3**. ①과 딱 한 가지만 다르다 — 그래서 둘의 차가 곧 **미수 누수의 크기**다.
 *
 * 지역 규칙을 재려면 이쪽을 봐야 한다: ①은 지역차보다 누수가 커서 「지역 × 창구」를 재고 있다.
 */
const THIN_PAID: Build = {
  name: 'thin+창구3',
  note: '①과 동일하되 수납 창구 3 · 간호사 3',
  make: w => {
    w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
    w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 2, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 9, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 16, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 23, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'WARD', x: 31, y: 2, w: 10, h: 6 })
    w = hireMany(w, { INTERNAL_MEDICINE: 1, GENERAL_SURGERY: 1, CARDIOLOGY: 1, AESTHETICS: 1 })
    return cashiers(w, 3)
  },
}

/**
 * ② 두꺼운 빌드 — **네 지역 모두가 실제로 뽑을 수 있는 최대 인력**으로 맞춘다.
 *
 * 과당 상한은 가장 얇은 지역(RURAL: 미용 2·내과 3·외과 2·순환기 1)이 정한다. 그래야 인력이
 * **통제 변수**가 되어 나머지 축(도착·믹스·응급·임대료·소송)만 남는다 — URBAN이 더 뽑을 수
 * 있다는 사실 자체는 ①이 이미 보여 준다.
 *
 * 좌석·침대는 신도시의 ×1.2 도착을 흡수하도록 넉넉히 준다. 이게 이 프로브의 요점이다:
 * **용량이 병목이 아니게 만들었을 때도 지역차가 임대료뿐인가?**
 */
const THICK: Build = {
  name: 'thick',
  note: '좌석 53 · 진료실 8 · 침대 12 · 의사 8(미용2·내과3·외과2·순환1 = 전 지역 공통 상한) · 간호사 3',
  make: w => {
    w = place(w, { type: 'WAITING', x: 14, y: 17, w: 20, h: 13 })
    w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 2, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 9, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 16, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 23, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 30, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 37, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 9, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 9, y: 9, w: 6, h: 5 })
    w = place(w, { type: 'WARD', x: 16, y: 9, w: 14, h: 6 })
    w = hireMany(w, { INTERNAL_MEDICINE: 3, GENERAL_SURGERY: 2, CARDIOLOGY: 1, AESTHETICS: 2 })
    return cashiers(w, 3)
  },
}

interface Run {
  region: SimRegionKey
  seed: number
  ending: string
  weeksSurvived: number
  treasury: number
  revenue: number
  rent: number
  fixedCost: number
  exams: number
  left: number
  emgAccepted: number
  emgTurnedAway: number
  /**
   * 과별 **수익** 누계 — 진료 수는 여기 없다. `WeekDeptLine`이 안 들고 있기 때문이고,
   * 안 들고 있는 게 맞다: 그 줄의 수익은 외래 + **응급 처치**라 `수익 ÷ 수가`가 건수가 아니다
   * (응급 수가는 외래의 수십 배 — dept.ts 머리말).
   */
  byDept: Partial<Record<SimDeptKey, number>>
  /** 걷지 못한 진료비 — 「진료 수 × 수가」와 실제 수익이 벌어지는 폭을 설명하는 축이다. */
  unpaid: number
  /** 시작 의사 수 → 끝 의사 수. **고정비가 정원 급여보다 훨씬 작으면 병원이 빈 것**이고,
   *  그 사실을 안 재면 「지역 밸런스」로 읽은 표가 사실은 사직 속도의 표다. */
  doctorsStart: number
  doctorsEnd: number
}

const doctorCount = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR').length

function runCampaign(build: Build, region: SimRegionKey, seed: number): Run {
  let w = build.make(createWorld(seed, { region }))
  const doctorsStart = doctorCount(w)
  const weeks: WeekSummary[] = []
  // 미수는 주간 요약에 없다(하루의 축이다) — 주가 넘어가며 `days`가 비워지므로 여기서 걷는다.
  let unpaid = 0

  // 상한은 무한루프 방지용 — 정상 종료는 settleWeek의 `CLOSED`가 낸다.
  while (w.phase !== 'CLOSED' && weeks.length < CAMPAIGN_WEEKS + 2) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      w = tick(w, DAY_END_MIN)
      if (w.phase === 'DAY_END') w = startNextDay(w)
    }
    if (w.phase !== 'WEEK_END') throw new Error(`주말에 닿지 못했다(${w.phase}) — ${build.name}/${region}/${seed}`)
    unpaid += w.days.reduce((a, d) => a + d.unpaidManwon, 0)
    weeks.push(weekSummary(w))
    w = settleWeek(w)
    if (w.phase === 'CLOSED') break
    w = startNextWeek(w)
  }

  const sum = (f: (s: WeekSummary) => number) => weeks.reduce((a, s) => a + f(s), 0)
  const byDept: Run['byDept'] = {}
  for (const s of weeks) {
    for (const [dept, line] of Object.entries(s.byDept) as [SimDeptKey, { revenueManwon: number }][]) {
      byDept[dept] = (byDept[dept] ?? 0) + line.revenueManwon
    }
  }
  return {
    region, seed, byDept, unpaid, doctorsStart, doctorsEnd: doctorCount(w),
    ending: w.ending ?? '(미종결)',
    weeksSurvived: weeks.length,
    treasury: w.treasuryManwon,
    revenue: sum(s => s.revenueManwon),
    rent: sum(s => s.rentManwon),
    fixedCost: sum(s => s.fixedCostManwon),
    exams: sum(s => s.examsDone),
    left: sum(s => s.leftCount),
    emgAccepted: sum(s => s.emergencies.accepted),
    emgTurnedAway: sum(s => s.emergencies.turnedAway),
  }
}

const SEEDS = [1, 3, 5]
const REGION_KEYS = Object.keys(REGIONS) as SimRegionKey[]
const n = (v: number) => v.toLocaleString('en-US')

describe('지역 밸런스 프로브', () => {
  for (const build of [THIN, THIN_PAID, THICK]) {
    it(`${build.name} — ${build.note}`, () => {
      const runs = REGION_KEYS.flatMap(r => SEEDS.map(s => runCampaign(build, r, s)))

      const lines: string[] = []
      lines.push(``)
      lines.push(`━━━ 빌드 「${build.name}」 — ${build.note} · 시드 ${SEEDS.join('·')} ━━━`)
      lines.push(
        ['지역', '시드', '종료', '주', '의사', '금고', '금고+임대료', '수익', '미수', '수납률', '고정비', '임대료', '진료', '이탈', '응급 수용/반려']
          .join('\t'),
      )
      for (const r of runs) {
        const billed = r.revenue + r.unpaid
        lines.push([
          REGIONS[r.region].label, r.seed, r.ending, r.weeksSurvived,
          `${r.doctorsStart}→${r.doctorsEnd}`,
          n(r.treasury), n(r.treasury + r.rent), n(r.revenue), n(r.unpaid),
          billed === 0 ? '—' : `${Math.round((r.revenue / billed) * 100)}%`,
          n(r.fixedCost), n(r.rent), n(r.exams), n(r.left), `${r.emgAccepted}/${r.emgTurnedAway}`,
        ].join('\t'))
      }

      // 과별 수익 — 시드 하나만. 지역 믹스가 장부에 실제로 닿았는지는 이 줄에서만 보인다.
      lines.push(``)
      lines.push(`── 과별 수익 누계(시드 ${SEEDS[0]}, 만원 · 외래+응급) ──`)
      lines.push(['지역', ...HIRABLE_DEPTS.map(d => simDept(d).label)].join('\t'))
      for (const k of REGION_KEYS) {
        const r = runs.find(x => x.region === k && x.seed === SEEDS[0])!
        lines.push([
          REGIONS[k].label,
          ...HIRABLE_DEPTS.map(d => (r.byDept[d] === undefined ? '—' : n(r.byDept[d]!))),
        ].join('\t'))
      }

      // 지역별 중앙값으로 순서를 낸다 — 시드 하나로 순서를 말하면 그게 1차 프로브의 실수다.
      const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
      const byRegion = REGION_KEYS.map(k => {
        const rs = runs.filter(r => r.region === k)
        return {
          k,
          treasury: mid(rs.map(r => r.treasury)),
          neutral: mid(rs.map(r => r.treasury + r.rent)),
          exams: mid(rs.map(r => r.exams)),
          left: mid(rs.map(r => r.left)),
        }
      })
      const order = (f: (x: (typeof byRegion)[number]) => number) =>
        [...byRegion].sort((a, b) => f(b) - f(a)).map(x => `${REGIONS[x.k].label} ${n(f(x))}`).join(' > ')

      lines.push(``)
      lines.push(`금고 순서      : ${order(x => x.treasury)}`)
      lines.push(`임대료 중립 후 : ${order(x => x.neutral)}`)
      lines.push(`진료 수        : ${order(x => x.exams)}`)
      lines.push(`이탈 수        : ${order(x => x.left)}`)

      // 임대료를 되더했을 때 지역들이 모이면 = 다른 축이 장부에 도달하지 못한 것.
      const nv = byRegion.map(x => x.neutral)
      const spread = (Math.max(...nv) - Math.min(...nv)) / Math.max(...nv)
      lines.push(``)
      lines.push(`임대료 중립 후 편차 ${(spread * 100).toFixed(1)}% — 작을수록 「지역차가 임대료뿐」`)

      console.log(lines.join('\n'))
    })
  }
})
