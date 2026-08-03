/**
 * ── 컷 역산 프로브 ④ — 위축 고지를 12주 3일에 세우는 **실용 레시피** 찾기.
 *
 * ③에서 확인된 두 벽:
 *   ⓐ 진료실을 받은 외과/순환기 의사는 외래만으로 2~3주에 포화·사직한다.
 *   ⓑ 놀고 있는(exam 0) 필수과 의사는 안 갈리지만 주급이 금고를 태워 10주 전후에 INSOLVENCY.
 * → 둘 다 피하는 길은 **늦게 뽑는 것**이다(그 사람은 소송 날에 갓 온 사람이라 멀쩡하다).
 *   신도시(미용 수요 35% × 도착 1.2)의 두꺼운 흑자로 버티는 길도 함께 잰다.
 *
 * 실행: npx vitest run --config vitest.probe.config.ts scripts/cut-chill2-probe.ts
 */
import { describe, it } from 'vitest'

import { DAYS_PER_WEEK, DAY_END_MIN, startNextDay } from '@/sim/day'
import { applyMorningEvent } from '@/sim/director'
import { hire, placeRoom, type RoomSpec } from '@/sim/testHelpers'
import { nurseGradeOf } from '@/sim/nurse'
import { hireNurse, setDoctorPriority } from '@/sim/pawn'
import { tick } from '@/sim/tick'
import { CAMPAIGN_WEEKS, settleWeek, startNextWeek } from '@/sim/week'
import { createWorld, type SimRegionKey, type SimWorld } from '@/sim/world'
import { simDept, type SimDeptKey } from '@/sim/dept'

const place = (w: SimWorld, spec: RoomSpec): SimWorld => {
  const r = placeRoom(w, spec)
  if (!r.ok) throw new Error(`건설 거부(${r.reason}) — ${spec.type} @${spec.x},${spec.y}`)
  return r.world
}
const addNurses = (w: SimWorld): SimWorld => {
  for (let i = 0; i < nurseGradeOf(w).required; i++) w = hireNurse(w)
  return w
}
const docs = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR')

interface Variant {
  name: string
  region: SimRegionKey
  build: (w: SimWorld) => SimWorld
  /** 매일 아침(이벤트 적용 후) 부르는 조작 — 늦은 채용의 자리. */
  morning?: (w: SimWorld) => SimWorld
}

function play(v: Variant) {
  let w = v.build(createWorld(1, { region: v.region }))
  let lawsuit: { week: number; day: number; cost?: number; chilled?: string } | null = null
  let aliveAtCut = ''
  let weeksDone = 0
  const weekly: string[] = []
  while (w.phase !== 'CLOSED' && weeksDone < CAMPAIGN_WEEKS) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      if (v.morning) w = v.morning(w)
      if (w.week === 12 && w.day === 3) {
        aliveAtCut = docs(w).map(p => `${p.name}(${simDept(p.dept!).label}·피로${p.fatigue ?? 0}·포화${p.saturatedDays ?? 0}일)`).join(' / ')
      }
      if (w.event?.kind === 'LAWSUIT') {
        lawsuit = { week: w.week, day: w.day, cost: w.event.costManwon, chilled: w.event.chilledName }
      }
      w = tick(w, DAY_END_MIN)
      if (w.phase === 'DAY_END') w = applyMorningEvent(startNextDay(w))
    }
    w = settleWeek(w)
    weeksDone++
    weekly.push(`${weeksDone}주 ${w.treasuryManwon.toLocaleString('en-US')}`)
    if (w.phase === 'CLOSED') break
    w = applyMorningEvent(startNextWeek(w))
  }
  return { w, lawsuit, aliveAtCut, weeksDone, weekly }
}

/** 미용 1명 + 진료실 1개 + 대기실 + 접수처. 병동은 안 짓는다(응급은 전부 되돌아간다). */
const leanAesthetic = (w: SimWorld, extraExam?: SimDeptKey): SimWorld => {
  w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
  w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
  if (extraExam) w = place(w, { type: 'EXAM', dept: extraExam, x: 9, y: 2, w: 6, h: 5 })
  w = hire(w, 'AESTHETICS')
  w = place(w, { type: 'RECEPTION', x: 40, y: 24, w: 6, h: 6 })
  return addNurses(w)
}

/** 그 과 의사가 아직 없고 지정 주차·일차에 닿았으면 한 명 뽑는다(+ 간호 기준 보충). */
const hireAt = (dept: SimDeptKey, week: number, day: number) => (w: SimWorld): SimWorld => {
  if (w.week !== week || w.day !== day) return w
  if (docs(w).some(p => p.dept === dept)) return w
  w = hire(w, dept)
  const { count, required } = nurseGradeOf(w)
  for (let i = count; i < required; i++) w = hireNurse(w)
  return w
}

describe('컷 역산 프로브 ④ — 위축 고지 레시피', () => {
  it('D1 — 늦은 채용 / 신도시 흑자로 12주 3일에 위축 대상 세우기', () => {
    const variants: Variant[] = [
      {
        name: '① 서울 · 미용1(마른 병원) + **12주 1일에 외과1 채용**(진료실 있음) · 병동 없음',
        region: 'URBAN',
        build: w => leanAesthetic(w, 'GENERAL_SURGERY'),
        morning: hireAt('GENERAL_SURGERY', 12, 1),
      },
      {
        name: '② 서울 · 미용1 + **11주 1일에 외과1 채용**(진료실 있음) · 병동 없음',
        region: 'URBAN',
        build: w => leanAesthetic(w, 'GENERAL_SURGERY'),
        morning: hireAt('GENERAL_SURGERY', 11, 1),
      },
      {
        name: '③ 서울 · 미용1 + **12주 1일에 순환기1 채용**(진료실 있음) · 병동 없음',
        region: 'URBAN',
        build: w => leanAesthetic(w, 'CARDIOLOGY'),
        morning: hireAt('CARDIOLOGY', 12, 1),
      },
      {
        name: '④ 정읍 · 미용1 + **12주 1일에 순환기1 채용**(진료실 있음) · 병동 없음',
        region: 'PROVINCIAL',
        build: w => leanAesthetic(w, 'CARDIOLOGY'),
        morning: hireAt('CARDIOLOGY', 12, 1),
      },
      {
        name: '⑤ 신도시 · 미용1 + 외과1(진료실 없음 · 개원 시부터) · 병동 없음',
        region: 'NEWTOWN',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'GENERAL_SURGERY')
          w = place(w, { type: 'RECEPTION', x: 40, y: 24, w: 6, h: 6 })
          return addNurses(w)
        },
      },
      {
        name: '⑥ 신도시 · 미용1 + 외과1(진료실 있음 · **exam 0**) · 병동 없음',
        region: 'NEWTOWN',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 9, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'GENERAL_SURGERY')
          const s = docs(w).find(p => p.dept === 'GENERAL_SURGERY')!
          w = setDoctorPriority(w, s.id, 'exam', 0)
          w = place(w, { type: 'RECEPTION', x: 40, y: 24, w: 6, h: 6 })
          return addNurses(w)
        },
      },
      {
        name: '⑦ 신도시 · 미용1 + 순환기1(진료실 있음 · **exam 0**) · 병동 없음',
        region: 'NEWTOWN',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 9, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'CARDIOLOGY')
          const c = docs(w).find(p => p.dept === 'CARDIOLOGY')!
          w = setDoctorPriority(w, c.id, 'exam', 0)
          w = place(w, { type: 'RECEPTION', x: 40, y: 24, w: 6, h: 6 })
          return addNurses(w)
        },
      },
    ]

    const lines = ['', '━━━ D1 위축 고지 레시피 ━━━']
    for (const v of variants) {
      const r = play(v)
      lines.push('')
      lines.push(v.name)
      lines.push(`  종료 ${r.w.ending ?? '(미종결)'} · ${r.weeksDone}주 · 금고 ${r.w.treasuryManwon.toLocaleString('en-US')} · 회차 ${r.w.turnedAwayTotal}`)
      lines.push(`  12주3일 재직: ${r.aliveAtCut || '(도달 못 함)'}`)
      lines.push(`  LAWSUIT: ${r.lawsuit
        ? `${r.lawsuit.week}주 ${r.lawsuit.day}일 · 합의금 ${r.lawsuit.cost}만원 · 위축 ${r.lawsuit.chilled ?? '(대상 없음)'}`
        : '없음'}`)
      lines.push(`  주별 금고: ${r.weekly.join(' / ')}`)
    }
    console.log(lines.join('\n'))
  })
})
