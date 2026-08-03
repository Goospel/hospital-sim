/**
 * ── 컷 역산 프로브 ③ — **12주 3일(유일한 LAWSUIT 추첨일)에 위축 대상을 살려 두기.**
 *
 * ②에서 드러난 벽: 진료실을 받은 외과 의사는 **외래만으로도** 포화해 2~3주에 사직한다
 * (URBAN 외과 수요 12건/일 × 20분 × 강도 1.2 = 288 표준강도분 > 무료 160 → 하루 +12).
 * 그래서 12주 3일에 CHILL_DEPTS 의사가 한 명도 안 남아 「위축 고지」가 안 뜬다.
 * 여기서는 그를 살려 두는 조작 몇 가지를 비교한다.
 *
 * 실행: npx vitest run --config vitest.probe.config.ts scripts/cut-chill-probe.ts
 */
import { describe, it } from 'vitest'

import { DAYS_PER_WEEK, DAY_END_MIN, startNextDay } from '@/sim/day'
import { applyMorningEvent } from '@/sim/director'
import { hire, placeRoom, type RoomSpec } from '@/sim/testHelpers'
import { nurseGradeOf } from '@/sim/nurse'
import { hireNurse, setDoctorPriority } from '@/sim/pawn'
import { tick } from '@/sim/tick'
import { CAMPAIGN_WEEKS, settleWeek, startNextWeek } from '@/sim/week'
import { createWorld, regionHirePool, REGIONS, type SimRegionKey, type SimWorld } from '@/sim/world'
import { simDept, type SimDeptKey } from '@/sim/dept'

const place = (w: SimWorld, spec: RoomSpec): SimWorld => {
  const r = placeRoom(w, spec)
  if (!r.ok) throw new Error(`건설 거부(${r.reason}) — ${spec.type} @${spec.x},${spec.y}`)
  return r.world
}
const staffed = (w: SimWorld): SimWorld => {
  w = place(w, { type: 'RECEPTION', x: 40, y: 24, w: 6, h: 6 })
  for (let i = 0; i < nurseGradeOf(w).required; i++) w = hireNurse(w)
  return w
}
const docs = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR')

interface Variant {
  name: string
  region: SimRegionKey
  build: (w: SimWorld) => SimWorld
  /** 주말마다 부르는 보충 채용(사직 자리 메꾸기). */
  refill?: (w: SimWorld) => SimWorld
}

function play(v: Variant) {
  let w = v.build(createWorld(1, { region: v.region }))
  let lawsuit: { week: number; day: number; cost?: number; chilled?: string } | null = null
  let aliveAtCut = ''
  let weeksDone = 0
  const weekly: string[] = []
  while (w.phase !== 'CLOSED' && weeksDone < CAMPAIGN_WEEKS) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      if (w.week === 12 && w.day === 3) {
        aliveAtCut = docs(w).map(p => `${p.name}(${simDept(p.dept!).label}·피로${p.fatigue ?? 0})`).join(' ')
      }
      if (w.event?.kind === 'LAWSUIT') {
        lawsuit = { week: w.week, day: w.day, cost: w.event.costManwon, chilled: w.event.chilledName }
      }
      w = tick(w, DAY_END_MIN)
      if (w.phase === 'DAY_END') w = applyMorningEvent(startNextDay(w))
    }
    w = settleWeek(w)
    weeksDone++
    weekly.push(`${weeksDone}주 금고 ${w.treasuryManwon.toLocaleString('en-US')}`)
    if (w.phase === 'CLOSED') break
    w = startNextWeek(w)
    if (v.refill) w = v.refill(w)
    w = applyMorningEvent(w)
  }
  return { w, lawsuit, aliveAtCut, weeksDone, weekly }
}

describe('컷 역산 프로브 ③ — 위축 고지', () => {
  it('C1 — 위축 대상을 12주 3일까지 살려 두는 조작 비교', () => {
    const variants: Variant[] = [
      {
        name: '① 서울 · 미용1 + 외과1 · 외과 진료실 **안 지음** · 병동 없음',
        region: 'URBAN',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'GENERAL_SURGERY')
          return staffed(w)
        },
      },
      {
        name: '② 서울 · 미용1 + 외과1(진료실 있음, **exam 우선순위 0**) · 병동 없음',
        region: 'URBAN',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 9, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'GENERAL_SURGERY')
          const surgeon = docs(w).find(p => p.dept === 'GENERAL_SURGERY')!
          w = setDoctorPriority(w, surgeon.id, 'exam', 0)
          return staffed(w)
        },
      },
      {
        name: '③ 서울 · 미용1 + 외과(진료실 있음) · **사직할 때마다 재채용**(풀 3)',
        region: 'URBAN',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 9, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'GENERAL_SURGERY')
          return staffed(w)
        },
        refill: w => {
          while (
            w.hirePool.GENERAL_SURGERY > 0
            && docs(w).every(p => p.dept !== 'GENERAL_SURGERY')
          ) w = hire(w, 'GENERAL_SURGERY')
          return w
        },
      },
      {
        name: '④ 정읍 · 미용1+내과1 + 외과1(**exam 0**) · 병동 없음',
        region: 'PROVINCIAL',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 9, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 16, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'INTERNAL_MEDICINE')
          w = hire(w, 'GENERAL_SURGERY')
          const surgeon = docs(w).find(p => p.dept === 'GENERAL_SURGERY')!
          w = setDoctorPriority(w, surgeon.id, 'exam', 0)
          return staffed(w)
        },
      },
      {
        name: '⑤ 정읍 · 미용1+내과1 + 순환기1(**exam 0**) · 병동 없음',
        region: 'PROVINCIAL',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 9, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 16, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'INTERNAL_MEDICINE')
          w = hire(w, 'CARDIOLOGY')
          const cardio = docs(w).find(p => p.dept === 'CARDIOLOGY')!
          w = setDoctorPriority(w, cardio.id, 'exam', 0)
          return staffed(w)
        },
      },
      {
        name: '⑥ 서울 · 미용1 + 순환기1(**exam 0**) · 병동 없음',
        region: 'URBAN',
        build: w => {
          w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
          w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
          w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 9, y: 2, w: 6, h: 5 })
          w = hire(w, 'AESTHETICS')
          w = hire(w, 'CARDIOLOGY')
          const cardio = docs(w).find(p => p.dept === 'CARDIOLOGY')!
          w = setDoctorPriority(w, cardio.id, 'exam', 0)
          return staffed(w)
        },
      },
    ]

    const lines = ['', '━━━ C1 위축 고지 도달 실험 ━━━']
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

  it('C2 — NO_PEOPLE의 구조적 벽: 어느 지역이든 시작 풀에 미용이 들어 있다', () => {
    const lines = ['', '━━━ C2 지역별 시작 풀과 미용 비중 ━━━']
    lines.push(['지역', ...['AESTHETICS', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'CARDIOLOGY'].map(d => simDept(d as SimDeptKey).label), '합계'].join('\t'))
    for (const key of Object.keys(REGIONS) as SimRegionKey[]) {
      const pool = regionHirePool(key)
      lines.push([
        REGIONS[key].label,
        pool.AESTHETICS, pool.INTERNAL_MEDICINE, pool.GENERAL_SURGERY, pool.CARDIOLOGY,
        Object.values(pool).reduce((a, b) => a + b, 0),
      ].join('\t'))
    }
    lines.push('')
    lines.push('→ 풀 합계를 0으로 만들려면 미용 의사를 전원 뽑아야 하는데, 미용 의사는 포화(피로 100)에')
    lines.push('  구조적으로 못 닿아 영영 사직하지 않는다(프로브 ② S3). 따라서 `doctors − leaving === 0`이')
    lines.push('  성립할 수 없고, **NO_PEOPLE 엔딩은 어느 지역에서도 도달 불가**다.')
    console.log(lines.join('\n'))
  })
})
