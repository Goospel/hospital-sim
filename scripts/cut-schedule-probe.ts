/**
 * ── 컷 역산 프로브 ② — **이벤트 추첨표는 세계와 무관하다**를 실측으로 세우고,
 *    거기서 나온 소송 날짜(12주 3일)에 **살아 있는 순환기/외과 의사**를 세우는 빌드를 찾는다.
 *    덤으로 Q4(NO_PEOPLE)의 구조적 불가 판정을 수치로 잠근다.
 *
 * 실행: npx vitest run --config vitest.probe.config.ts scripts/cut-schedule-probe.ts
 */
import { describe, it } from 'vitest'

import { seededUnit } from '@/game/daysim'
import { FATIGUE_FREE_MIN, FATIGUE_MAX, FATIGUE_PER_OVER_HOUR, FATIGUE_REST } from '@/game/doctor'
import { DAYS_PER_WEEK, DAY_END_MIN, startNextDay } from '@/sim/day'
import {
  EVENT_PROB_PER_DAY, applyMorningEvent, eventKindSeed, eventRollSeed, pickEventKind,
} from '@/sim/director'
import { SIM_EVENTS, type SimEventKind } from '@/sim/events'
import { hire, placeRoom, type RoomSpec } from '@/sim/testHelpers'
import { nurseGradeOf } from '@/sim/nurse'
import { hireNurse } from '@/sim/pawn'
import { tick } from '@/sim/tick'
import { CAMPAIGN_WEEKS, settleWeek, startNextWeek, weekSummary } from '@/sim/week'
import { createWorld, type SimRegionKey, type SimWorld } from '@/sim/world'
import { simDept, type SimDeptKey } from '@/sim/dept'
import { EXAM_DURATION_MIN } from '@/sim/patientFlow'
import { fatigueSlowFactor } from '@/game/doctor'

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
  for (let i = 0; i < nurseGradeOf(w).required; i++) w = hireNurse(w)
  return w
}

describe('컷 역산 프로브 ②', () => {
  /**
   * 추첨표 — `fallbackDirectorChoice`의 **전제 검사 앞단**만 재현한다. 발생 여부(salt 43)와
   * 종류(salt 47)는 minute 0의 (seed, week, day)만 보므로 **세계 구성과 완전히 무관**하다.
   * 즉 전제(병동·병상·회차 누계)는 이 표에서 **빼기만** 할 수 있고 새 날을 만들지 못한다.
   */
  it('S1 — 시드 1의 84일 추첨표(전제 무시 · 세계 무관)', () => {
    const base = createWorld(1)
    const rows: Array<{ n: number; week: number; day: number; kind: SimEventKind | null; roll: number }> = []
    for (let week = 1; week <= CAMPAIGN_WEEKS; week++) {
      for (let day = 1; day <= DAYS_PER_WEEK; day++) {
        const w: SimWorld = { ...base, week, day, minute: 0 }
        const roll = seededUnit(eventRollSeed(w))
        const kind = roll < EVENT_PROB_PER_DAY ? pickEventKind(seededUnit(eventKindSeed(w))) : null
        rows.push({ n: (week - 1) * 7 + day, week, day, kind, roll })
      }
    }
    const lines = ['', '━━━ S1 시드 1 · 84일 추첨표(전제 적용 전) ━━━']
    for (const r of rows.filter(r => r.kind)) {
      lines.push(`${r.n}일차(${r.week}주 ${r.day}일)\t${SIM_EVENTS[r.kind!].label}\t(roll ${r.roll.toFixed(4)})`)
    }
    const lawsuits = rows.filter(r => r.kind === 'LAWSUIT')
    lines.push('')
    lines.push(`추첨된 날 ${rows.filter(r => r.kind).length}/84일`)
    lines.push(`LAWSUIT 추첨일: ${lawsuits.map(r => `${r.n}일차(${r.week}주 ${r.day}일)`).join(' · ') || '없음'}`)
    const firstAny = rows.find(r => r.kind)
    lines.push(`첫 추첨일: ${firstAny!.n}일차 — ${SIM_EVENTS[firstAny!.kind!].label}`)
    // 1주차 유예·병동 전제에 걸리는 MASS_CASUALTY만 따로
    lines.push(`MASS_CASUALTY 추첨일: ${rows.filter(r => r.kind === 'MASS_CASUALTY').map(r => `${r.n}일차`).join(' · ')}`)
    lines.push(`MILD_SURGE 추첨일: ${rows.filter(r => r.kind === 'MILD_SURGE').map(r => `${r.n}일차`).join(' · ')}`)
    console.log(lines.join('\n'))
  })

  /** 12주 3일까지 살아남으면서 **위축 대상**(순환기·외과)이 재직 중인 빌드 찾기. */
  it('S2 — 컷6용 생존 빌드 후보 (12주 3일까지 버티고 위축 대상이 남는가)', () => {
    interface Cand {
      name: string; region: SimRegionKey
      exams: SimDeptKey[]; plan: Partial<Record<SimDeptKey, number>>; ward: boolean
    }
    const cands: Cand[] = [
      {
        name: '서울 · 미용1+외과1 · 병동 없음',
        region: 'URBAN', ward: false,
        exams: ['AESTHETICS', 'GENERAL_SURGERY'], plan: { AESTHETICS: 1, GENERAL_SURGERY: 1 },
      },
      {
        name: '서울 · 미용2+외과1 · 병동 없음',
        region: 'URBAN', ward: false,
        exams: ['AESTHETICS', 'AESTHETICS', 'GENERAL_SURGERY'],
        plan: { AESTHETICS: 2, GENERAL_SURGERY: 1 },
      },
      {
        name: '서울 · 미용2+순환기1 · 병동 없음',
        region: 'URBAN', ward: false,
        exams: ['AESTHETICS', 'AESTHETICS', 'CARDIOLOGY'],
        plan: { AESTHETICS: 2, CARDIOLOGY: 1 },
      },
      {
        name: '서울 · 미용3+순환기1 · 병동 없음',
        region: 'URBAN', ward: false,
        exams: ['AESTHETICS', 'AESTHETICS', 'AESTHETICS', 'CARDIOLOGY'],
        plan: { AESTHETICS: 3, CARDIOLOGY: 1 },
      },
      {
        name: '정읍 · 미용1+내과1+외과1 · 병동 없음',
        region: 'PROVINCIAL', ward: false,
        exams: ['AESTHETICS', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY'],
        plan: { AESTHETICS: 1, INTERNAL_MEDICINE: 1, GENERAL_SURGERY: 1 },
      },
      {
        name: '서울 · 미용1+외과1 · 병동 있음(응급 수용)',
        region: 'URBAN', ward: true,
        exams: ['AESTHETICS', 'GENERAL_SURGERY'], plan: { AESTHETICS: 1, GENERAL_SURGERY: 1 },
      },
    ]

    const lines = ['', '━━━ S2 컷6 생존 빌드 후보 ━━━']
    lines.push(['빌드', '종료', '주', '금고', '12주3일 도달', '위축 대상', '합의금', '회차'].join('\t'))

    for (const c of cands) {
      let w = createWorld(1, { region: c.region })
      w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
      c.exams.forEach((dept, i) => {
        w = place(w, { type: 'EXAM', dept, x: 2 + i * 7, y: 2, w: 6, h: 5 })
      })
      if (c.ward) w = place(w, { type: 'WARD', x: 31, y: 9, w: 10, h: 6 })
      w = hireMany(w, c.plan)
      w = staffed(w)

      let reached = false
      let chilled: string | undefined
      let cost: number | undefined
      let lawsuitDay: string | undefined
      let weeksDone = 0
      while (w.phase !== 'CLOSED' && weeksDone < CAMPAIGN_WEEKS) {
        for (let d = 0; d < DAYS_PER_WEEK; d++) {
          if (w.week === 12 && w.day === 3) reached = true
          if (w.event?.kind === 'LAWSUIT') {
            lawsuitDay = `${w.week}주 ${w.day}일`
            chilled = w.event.chilledName
            cost = w.event.costManwon
          }
          w = tick(w, DAY_END_MIN)
          if (w.phase === 'DAY_END') w = applyMorningEvent(startNextDay(w))
        }
        weekSummary(w)
        w = settleWeek(w)
        weeksDone++
        if (w.phase === 'CLOSED') break
        w = applyMorningEvent(startNextWeek(w))
      }
      lines.push([
        c.name, w.ending ?? '(미종결)', weeksDone, w.treasuryManwon.toLocaleString('en-US'),
        reached ? 'O' : 'X',
        chilled ? `${chilled}(${lawsuitDay})` : '—',
        cost ?? '—',
        w.turnedAwayTotal,
      ].join('\t'))
    }
    console.log(lines.join('\n'))
  })

  /**
   * Q4의 핵심 — **미용 의사는 포화(FATIGUE_MAX)에 구조적으로 닿을 수 없다.**
   * 닿지 못하면 사직도 없고, 농어촌 풀에 미용이 2명 있으므로 `poolLeft === 0`을 만들려면
   * 그 둘을 반드시 뽑아야 하는데 그 둘은 영영 안 떠난다 → `doctors − leaving === 0`이 불가능.
   */
  it('S3 — 미용 의사 피로 상한(해석 + 최대 그라인드 실측)', () => {
    // ① 해석 상한: 하루에 물릴 수 있는 작업 분의 상한 × 강도.
    //    진료 소요는 피로 감속으로 최대 ×1.5(20 → 30분)이고, 마감이 진행 중 1건을 통째로 인정하므로
    //    하루 부하의 상한은 (600분 + 진료 1건)의 강도분이다.
    const maxWorkMin = DAY_END_MIN + Math.round(EXAM_DURATION_MIN * fatigueSlowFactor(FATIGUE_MAX))
    const maxLoad = maxWorkMin * simDept('AESTHETICS').intensity
    const maxGain = Math.round((Math.max(0, maxLoad - FATIGUE_FREE_MIN) / 60) * FATIGUE_PER_OVER_HOUR)
    const lines = ['', '━━━ S3 미용 의사 포화 가능성 ━━━']
    lines.push(`미용 강도 ${simDept('AESTHETICS').intensity} · 하루 작업 분 상한 ${maxWorkMin}`)
    lines.push(`→ 하루 표준강도분 상한 ${maxLoad} (무료 구간 ${FATIGUE_FREE_MIN})`)
    lines.push(`→ 하루 피로 증가 상한 ${maxGain} · 하룻밤 회복 ${FATIGUE_REST} (증가 ≤ 회복 → 누적 불가)`)
    lines.push(`→ 포화 임계 ${FATIGUE_MAX}에 **도달 불가** (상한 ${maxGain} < ${FATIGUE_MAX})`)

    // ② 실측: 미용 수요가 가장 두꺼운 URBAN(믹스 20%)에서 미용 의사 **1명**만 두고 최대로 굴린다.
    let w = createWorld(1, { region: 'URBAN' })
    w = place(w, { type: 'WAITING', x: 14, y: 18, w: 16, h: 11 })
    w = place(w, { type: 'EXAM', dept: 'AESTHETICS', x: 2, y: 2, w: 6, h: 5 })
    w = hireMany(w, { AESTHETICS: 1 })
    w = staffed(w)
    let peakFatigue = 0
    let peakSat = 0
    let peakLoad = 0
    let weeksDone = 0
    while (w.phase !== 'CLOSED' && weeksDone < CAMPAIGN_WEEKS) {
      for (let d = 0; d < DAYS_PER_WEEK; d++) {
        w = tick(w, DAY_END_MIN)
        for (const p of w.pawns) {
          if (p.kind !== 'DOCTOR') continue
          peakFatigue = Math.max(peakFatigue, p.fatigue ?? 0)
          peakSat = Math.max(peakSat, p.saturatedDays ?? 0)
          peakLoad = Math.max(peakLoad, p.loadMinToday ?? 0)
        }
        if (w.phase === 'DAY_END') w = applyMorningEvent(startNextDay(w))
      }
      w = settleWeek(w)
      weeksDone++
      if (w.phase === 'CLOSED') break
      w = applyMorningEvent(startNextWeek(w))
    }
    lines.push('')
    lines.push(`실측(URBAN · 미용 1인 단독 12주): 최대 하루 표준강도분 ${peakLoad.toFixed(1)} · 최대 피로 ${peakFatigue} · 최대 포화일수 ${peakSat}`)
    lines.push(`종료 ${w.ending} · 금고 ${w.treasuryManwon.toLocaleString('en-US')}`)
    console.log(lines.join('\n'))
  })

  /**
   * Q4 보강 — 농어촌에서 **미용을 뺀 6명**(내과3·외과2·순환기1)을 전원 사직시킬 수 있는가.
   * 가능해도 미용 2명이 남으므로 NO_PEOPLE은 안 선다. 「가장 근접한 시도」의 수치를 남긴다.
   */
  it('S4 — 농어촌: 미용을 안 뽑고 6명만 갈아 넣는 최대 시도', () => {
    let w = createWorld(1, { region: 'RURAL' })
    w = place(w, { type: 'WAITING', x: 14, y: 17, w: 20, h: 13 })
    w = place(w, { type: 'EXAM', dept: 'INTERNAL_MEDICINE', x: 2, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'GENERAL_SURGERY', x: 9, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 16, y: 2, w: 6, h: 5 })
    w = place(w, { type: 'WARD', x: 23, y: 2, w: 14, h: 6 })
    // 한 번에 다 뽑으면 고정비 2만/주로 3주 만에 폐업한다 — **한 명씩 태우고 다음 사람**.
    w = hireMany(w, { GENERAL_SURGERY: 1, CARDIOLOGY: 1 })
    w = staffed(w)

    const log: string[] = []
    let weeksDone = 0
    const remain = { INTERNAL_MEDICINE: 3, GENERAL_SURGERY: 1, CARDIOLOGY: 0 } as Record<SimDeptKey, number>
    while (w.phase !== 'CLOSED' && weeksDone < CAMPAIGN_WEEKS) {
      for (let d = 0; d < DAYS_PER_WEEK; d++) {
        w = tick(w, DAY_END_MIN)
        if (w.phase === 'DAY_END') w = applyMorningEvent(startNextDay(w))
      }
      const before = w.pawns.filter(p => p.kind === 'DOCTOR').map(p => p.name ?? p.id)
      w = settleWeek(w)
      weeksDone++
      log.push(`${weeksDone}주\t금고 ${w.treasuryManwon.toLocaleString('en-US')}\t의사 ${before.join('·') || '없음'}`)
      if (w.phase === 'CLOSED') break
      w = startNextWeek(w)
      // 빈자리를 다음 사람으로 채운다(응급을 계속 받아 갈아 넣기 위함).
      for (const dept of ['GENERAL_SURGERY', 'CARDIOLOGY', 'INTERNAL_MEDICINE'] as SimDeptKey[]) {
        while (
          remain[dept] > 0
          && w.pawns.filter(p => p.kind === 'DOCTOR' && p.dept === dept).length === 0
        ) {
          w = hire(w, dept)
          remain[dept] -= 1
        }
      }
      w = applyMorningEvent(w)
    }
    const lines = ['', '━━━ S4 농어촌 · 미용 제외 6명 순차 투입 ━━━', ...log]
    lines.push('')
    lines.push(`종료 ${w.ending} · ${weeksDone}주 · 금고 ${w.treasuryManwon.toLocaleString('en-US')}`)
    lines.push(`남은 풀: ${(Object.entries(w.hirePool) as [SimDeptKey, number][]).map(([k, n]) => `${simDept(k).label} ${n}`).join(' · ')}`)
    lines.push(`풀 합계 ${Object.values(w.hirePool).reduce((a, b) => a + b, 0)} (NO_PEOPLE은 0이라야 한다)`)
    console.log(lines.join('\n'))
  })
})
