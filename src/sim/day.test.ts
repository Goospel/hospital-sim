import { describe, it, expect } from 'vitest'
import { createWorld, INITIAL_TREASURY_MANWON } from './world'
import { placeRoom } from './build'
import { spawnDoctor, type Pawn, type PatientStage } from './pawn'
import { tick } from './tick'
import { DAY_END_MIN, settleDay } from './day'
import { EXAM_REVENUE_MANWON } from './patientFlow'

function hospitalWorld(seed: number) {
  const w = createWorld(seed)
  const r1 = placeRoom(w, { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  if (!r1.ok) throw new Error('전제 실패')
  const r2 = placeRoom(r1.world, { type: 'EXAM', x: 6, y: 6, w: 6, h: 5 })
  if (!r2.ok) throw new Error('전제 실패')
  return spawnDoctor(r2.world, 'INTERNAL_MEDICINE', { x: 8, y: 8 })
}

const runToDayEnd = (seed: number) => {
  let w = hospitalWorld(seed)
  for (let i = 0; i < DAY_END_MIN; i++) w = tick(w, 1)
  return w
}

describe('하루 마감', () => {
  it(`${DAY_END_MIN}분에 tick이 DAY_END로 멈추고, 그 뒤 tick은 no-op이다`, () => {
    const w = runToDayEnd(3)
    expect(w.phase).toBe('DAY_END')
    expect(w.minute).toBe(DAY_END_MIN)
    const frozen = tick(w, 60)
    expect(frozen).toEqual(w) // 멈춘 세계는 흐르지 않는다
  })

  it(`마감은 ${DAY_END_MIN}분에 정확히 걸린다 — 한 분 전은 아직 RUNNING이다`, () => {
    // 경계 앞에서 기준값을 캡처한다(T-085) — 600분까지 돌린 뒤에 재면 off-by-one이 안 보인다.
    let w = hospitalWorld(3)
    for (let i = 0; i < DAY_END_MIN - 1; i++) w = tick(w, 1)
    expect(w.minute).toBe(DAY_END_MIN - 1)
    expect(w.phase).toBe('RUNNING') // 599분에 미리 닫으면 여기서 걸린다
    expect(w.days).toEqual([])
    w = tick(w, 1)
    expect(w.phase).toBe('DAY_END')
    expect(w.days).toHaveLength(1)
  })

  it('정산: 진행 중 진료는 완료 인정(수익 지급), 대기·이동 환자는 이탈 집계 후 제거, 의사만 남는다', () => {
    const w0 = hospitalWorld(3)
    const built = INITIAL_TREASURY_MANWON - w0.treasuryManwon // 건설비를 마감 **전에** 캡처한다
    expect(built).toBeGreaterThan(0)
    const w = runToDayEnd(3)
    expect(w.pawns.every(p => p.kind === 'DOCTOR')).toBe(true)
    // 금고 불변식은 정산을 통과해도 유지된다 — 금고 = 초기 − 건설비 + 진료×30
    expect(w.treasuryManwon).toBe(INITIAL_TREASURY_MANWON - built + w.stats.examsDone * EXAM_REVENUE_MANWON)
  })

  it('정산은 IN_EXAM만 진료로 인정하고, 이미 집계된 퇴장 환자를 다시 세지 않는다', () => {
    // 자연 흐름의 600분엔 어떤 스테이지가 남아 있을지 시드에 달렸다 — 스테이지별 계약은
    // 손으로 세운 세계로 잠근다(아니면 정산 분기가 통째로 관측되지 않는다).
    const w = tick(hospitalWorld(3), 5) // 의사가 진료실에 자리잡은 뒤
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const patient = (id: string, stage: PatientStage): Pawn =>
      ({ id, kind: 'PATIENT', x: 20, y: 21, path: [], stage })
    const staged = {
      ...w,
      pawns: [
        doc,
        patient('in-exam', 'IN_EXAM'),
        patient('entering', 'ENTERING'),
        patient('waiting', 'WAITING'),
        patient('to-exam', 'TO_EXAM'),
        patient('leaving', 'LEAVING'),          // 진료 완료로 이미 집계됨
        patient('left-waiting', 'LEFT_WAITING'), // 이탈로 이미 집계됨
      ],
    }
    const s = settleDay(staged)
    expect(s.stats.examsDone).toBe(w.stats.examsDone + 1)  // IN_EXAM 1명만
    expect(s.stats.leftCount).toBe(w.stats.leftCount + 3)  // ENTERING·WAITING·TO_EXAM
    expect(s.treasuryManwon).toBe(w.treasuryManwon + EXAM_REVENUE_MANWON)
    expect(s.pawns).toEqual([doc]) // 환자는 전부 세계에서 빠지고 의사만 남는다
  })

  it('이탈 집계는 명시 목록(inclusion)이라 새 스테이지가 자동으로 이탈이 되지 않는다', () => {
    // 'PAYING'·'GONE'은 아직 아무도 만들지 않는 2주차 예약 스테이지다(pawn.ts). 집계를 denylist로
    // 쓰면 그 흐름이 붙는 순간 수납 걷는 환자가 조용히 이탈로 세진다 — 에러 없이 숫자만 틀린다.
    const w = tick(hospitalWorld(3), 5)
    const doc = w.pawns.find(p => p.kind === 'DOCTOR')!
    const patient = (id: string, stage: PatientStage): Pawn =>
      ({ id, kind: 'PATIENT', x: 20, y: 21, path: [], stage })
    const staged = {
      ...w,
      pawns: [doc, patient('paying', 'PAYING'), patient('gone', 'GONE'), patient('waiting', 'WAITING')],
    }
    const s = settleDay(staged)
    expect(s.stats.leftCount).toBe(w.stats.leftCount + 1) // WAITING 한 명만
  })

  it('settleDay는 입력 세계를 변형하지 않는다 (순수)', () => {
    const w = tick(hospitalWorld(3), 120)
    const snapshot = structuredClone(w)
    settleDay(w)
    expect(w).toEqual(snapshot)
  })

  it('DayRecord가 그날 수치를 굳힌다', () => {
    const w = runToDayEnd(3)
    expect(w.days).toHaveLength(1)
    const d = w.days[0]
    expect(d.day).toBe(1)
    expect(d.examsDone).toBe(w.stats.examsDone)
    expect(d.leftCount).toBe(w.stats.leftCount)
    expect(d.revenueManwon).toBe(w.stats.examsDone * EXAM_REVENUE_MANWON)
    expect(d.examsDone).toBeGreaterThan(0) // 계측기가 0으로 헛돌지 않았다
  })

  it('결정론: 같은 시드면 마감 세계가 완전 동일', () => {
    const run = () => { let w = hospitalWorld(11); for (let i = 0; i < DAY_END_MIN + 10; i++) w = tick(w, 1); return w }
    expect(run()).toEqual(run())
  })

  it('settleDay는 RUNNING이 아닌 세계를 거부한다(이중 정산 방지)', () => {
    const w = runToDayEnd(3)
    expect(() => settleDay(w)).toThrow()
  })
})
