// 우선순위 토글 — **플레이어가 시뮬에 개입하는 유일한 손잡이**의 계약.
//
// 축이 셋(진료·응급·휴식)이고 값이 0~3인데, 그 값이 **네 모듈**에서 읽힌다:
// 응급 판정(emergency.maybeEmergency) · 응급 배정(assignEmergencyDoctors) ·
// 외래 배정(patientFlow.assignWaitingToExam) · 휴식 개시(needs). 계약이 모듈마다 흩어지면
// "0으로 껐는데 어딘가에서는 여전히 일한다"가 조용히 산다 — 그래서 토글의 계약만 이 파일에 모은다.
import { describe, it, expect } from 'vitest'
import { createWorld, ENTRANCE, type SimWorld } from './world'
import { placeRoom } from './build'
import {
  hireDoctor, priorityOf, setDoctorPriority, spawnDoctor,
  type Pawn, type Priority, type PriorityKind,
} from './pawn'
import { tick } from './tick'
import { ARRIVAL_WINDOW_MIN, PATIENCE_MIN } from './patientFlow'
import { EMERGENCY_WINDOW_MIN, emergencyArrivalAt, wardBeds, type EmergencyKind } from './emergency'
import { FATIGUE_RED } from '../game/doctor'

/** 순환기 진료실 둘 — 같은 과 의사 두 명이 **각자 방을 받아야** 외래 줄 정렬이 관측된다
 *  (방 없는 의사는 배정 후보에서 이미 빠져 정렬이 헛돈다). */
const EXAM_A = { type: 'EXAM' as const, dept: 'CARDIOLOGY' as const, x: 6, y: 6, w: 8, h: 8 }
const EXAM_B = { type: 'EXAM' as const, dept: 'CARDIOLOGY' as const, x: 6, y: 16, w: 8, h: 8 }
/** 의자 1개짜리 휴게실(needs.test.ts와 같은 규격) */
const LOUNGE_1 = { type: 'LOUNGE' as const, x: 16, y: 6, w: 4, h: 4 }
/** 침대 1개짜리 병동(emergency.test.ts와 같은 규격) */
const WARD_1BED = { type: 'WARD' as const, x: 30, y: 20, w: 4, h: 4 }

/** 하루(1주 1일)에 두 종류 응급이 다 오는 세계 시드 — emergency.test.ts와 같은 값이다. */
const BOTH_KINDS_SEED = 4

function place(w: SimWorld, spec: Parameters<typeof placeRoom>[1]): SimWorld {
  const r = placeRoom(w, spec)
  if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
  return r.world
}

const run = (w: SimWorld, minutes: number) => {
  for (let i = 0; i < minutes; i++) w = tick(w, 1)
  return w
}

function until(w: SimWorld, pred: (w: SimWorld) => boolean, limit = 120) {
  for (let i = 0; i < limit; i++) {
    if (pred(w)) return w
    w = tick(w, 1)
  }
  throw new Error('전제 실패 — 기다린 상태가 오지 않았다')
}

const docs = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR')
const docOf = (w: SimWorld, i = 0) => docs(w)[i]
const pawnById = (w: SimWorld, id: string) => w.pawns.find(p => p.id === id)

/** 순환기 의사 N명이 각자 책상 앞에 자리잡은 병원. 도착 창이 닫힌 뒤로 시계를 옮겨
 *  자연 도착(외래·응급)이 끼어들지 않게 한다 — 관측되는 건 손으로 세운 상황뿐이다. */
function deskWorld(
  { rooms = [] as Array<Parameters<typeof placeRoom>[1]>, doctors = 1, seed = 3 } = {},
): SimWorld {
  let w = place(createWorld(seed), EXAM_A)
  for (const spec of rooms) w = place(w, spec)
  for (let i = 0; i < doctors; i++) w = hireDoctor(w, 'CARDIOLOGY')
  w = until(w, x => docs(x).every(d => !!d.roomId && !!d.dest && d.x === d.dest.x && d.y === d.dest.y))
  return { ...w, minute: ARRIVAL_WINDOW_MIN }
}

/** 응급만 관측되는 병원 — 진료실도 대기실도 없어 외래는 폰조차 생기지 않는다. */
function wardWorld({ doctors = 1, seed = BOTH_KINDS_SEED } = {}): SimWorld {
  let w = place(createWorld(seed), WARD_1BED)
  for (let i = 0; i < doctors; i++) w = hireDoctor(w, 'CARDIOLOGY')
  return w
}

/** 그 종류의 응급이 **처음 오는 분** — 판정식을 손으로 다시 쓰지 않고 구현을 부른다(T-085). */
function firstEmergencyMin(w0: SimWorld, kind: EmergencyKind, from = 1): number {
  for (let minute = from; minute < EMERGENCY_WINDOW_MIN; minute++) {
    if (emergencyArrivalAt({ ...w0, minute }) === kind) return minute
  }
  throw new Error(`전제 실패 — 하루 안에 ${kind}가 오지 않는 시드다`)
}

const tired = (w: SimWorld, fatigue: number): SimWorld => ({
  ...w,
  pawns: w.pawns.map(p => (p.kind === 'DOCTOR' ? { ...p, fatigue } : p)),
})

const waitingPatient = (id: string, spot: { x: number; y: number }, minute: number): Pawn => ({
  id, kind: 'PATIENT', x: spot.x, y: spot.y, path: [], dest: spot,
  stage: 'WAITING', arrivedMin: minute, wantsDept: 'CARDIOLOGY',
})

const inBed = (id: string, spot: { x: number; y: number }): Pawn => ({
  id, kind: 'PATIENT', x: spot.x, y: spot.y, path: [], dest: spot,
  stage: 'IN_BED', emergency: 'STEMI', wantsDept: 'CARDIOLOGY',
})

/** 대기 환자가 서 있을 자리 — 어느 방에도 속하지 않는 빈 타일이다. */
const OPEN_TILE = { x: 20, y: 20 }

/** 그 의사의 그 축만 갈아 끼운다(테스트가 구현의 단일 출처를 통과하게 한다). */
const withPriority = (w: SimWorld, kind: PriorityKind, value: Priority, i = 0) =>
  setDoctorPriority(w, docOf(w, i).id, kind, value)

describe('setDoctorPriority — 손잡이 자체의 계약', () => {
  it('그 의사의 그 축만 갈아 끼우고 입력 세계는 건드리지 않는다', () => {
    const w0 = deskWorld({ doctors: 2, rooms: [EXAM_B] })
    const snapshot = structuredClone(w0)
    const id = docOf(w0).id
    const w = setDoctorPriority(w0, id, 'exam', 0)

    expect(w0).toEqual(snapshot)                                  // 입력 불변(tick의 순수성 계약)
    expect(priorityOf(pawnById(w, id)!, 'exam')).toBe(0)
    // 같은 의사의 **다른 축**과 다른 의사는 그대로다 — 한 축을 쓰면서 나머지를 리셋하면
    // 플레이어가 응급을 끄려다 휴식까지 되돌려 놓는 꼴이 된다.
    expect(priorityOf(pawnById(w, id)!, 'emergency')).toBe(2)
    expect(priorityOf(pawnById(w, id)!, 'rest')).toBe(2)
    expect(priorityOf(docOf(w, 1), 'exam')).toBe(2)
  })

  it('범위 밖 값은 던진다 — 0~3의 **정수**만 받는다', () => {
    const w = deskWorld()
    const id = docOf(w).id
    // 접어서 받으면(clamp) UI 실수가 조용히 다른 값으로 저장돼, 화면과 시뮬이 갈린다.
    for (const bad of [4, -1, 1.5]) {
      expect(() => setDoctorPriority(w, id, 'exam', bad as Priority)).toThrow()
    }
    // 경계는 양쪽 다 **열려 있다**(0도 3도 정상값) — 한쪽만 재면 상수를 잘못 좁혀도 안 걸린다.
    expect(priorityOf(pawnById(setDoctorPriority(w, id, 'exam', 0), id)!, 'exam')).toBe(0)
    expect(priorityOf(pawnById(setDoctorPriority(w, id, 'exam', 3), id)!, 'exam')).toBe(3)
  })

  it('없는 의사·의사가 아닌 폰은 던진다 — 조용히 무시하면 화면만 바뀐다', () => {
    let w = deskWorld()
    w = { ...w, pawns: [...w.pawns, waitingPatient('pat-x', OPEN_TILE, w.minute)] }
    expect(() => setDoctorPriority(w, 'doc-없음', 'exam', 1)).toThrow()
    expect(() => setDoctorPriority(w, 'pat-x', 'exam', 1)).toThrow()
  })

  it('채용된 의사는 세 축이 전부 2에서 시작하고, 미지정 폰도 2로 읽힌다', () => {
    // 기본값이 **필드에도** 실린다: `?? 2` 폴백이 있어도 필드가 실재해야 UI·저장이
    // "아직 안 건드린 의사"와 "필드가 없는 손세계 폰"을 구별할 수 있다(fatigue·hunger 선례).
    const spawned = docOf(spawnDoctor(createWorld(1), 'CARDIOLOGY', { x: 5, y: 5 }))
    expect(spawned.priorities).toEqual({ exam: 2, emergency: 2, rest: 2 })
    // 손세계 폰(priorities 없음)은 조회가 2로 접는다 — 이 폴백 덕에 기존 픽스처가 전부 산다.
    const handmade: Pawn = { id: 'doc-hand', kind: 'DOCTOR', x: 1, y: 1, path: [], dept: 'CARDIOLOGY' }
    for (const kind of ['exam', 'emergency', 'rest'] as const) {
      expect(priorityOf(handmade, kind)).toBe(2)
    }
  })

  it('priorities 없는 손세계 의사도 응급 판정·배정을 통과한다 — 기본 2가 라우팅까지 닿는다', () => {
    // ⚠️ 위 테스트의 `priorityOf(handmade, …)`만으로는 **폴백이 라우팅에 닿는지**를 못 잰다:
    //    채용 경로(spawnDoctor)가 필드를 항상 실어서, 폴백을 0으로 바꿔도 기존 894건은 **한 건도
    //    안 죽는다**(단독 실측 2026-07-27 — 그 변조가 죽인 건 위 조회 단언 하나뿐이었다).
    //    저장된 옛 세계·손세계 폰에는 이 필드가 없으므로, 그 의사가 실제로 **일하는지**를 잠근다.
    const w0: SimWorld = {
      ...wardWorld({ doctors: 0 }),
      pawns: [{
        id: 'doc-old', kind: 'DOCTOR', x: ENTRANCE.x, y: ENTRANCE.y, path: [], dept: 'CARDIOLOGY',
      }],
    }
    expect(docOf(w0).priorities).toBeUndefined() // 전제: 우선순위가 아예 없는 폰이다
    let w = run(w0, firstEmergencyMin(w0, 'STEMI'))
    expect(w.stats.emergencyAccepted).toBe(1)    // ① 판정 — "없는 의사"로 접히지 않았다
    w = until(w, x => x.pawns.some(p => p.stage === 'IN_TREATMENT'), 200)
    expect(w.pawns.find(p => p.stage === 'IN_TREATMENT')!.doctorId).toBe('doc-old') // ② 배정
  })
})

describe('응급 토글 — 끈 의사는 없는 의사다', () => {
  it('순환기 의사가 서 있어도 emergency=0이면 STEMI는 NO_SPECIALIST로 되돌아간다', () => {
    // ⚠️ **PR B 하드락 계약의 정의 확장**이다: "그 과 의사가 있는가"가 "그 과에서 응급을 켠
    //    의사가 있는가"로 좁아진다. 끄는 것은 플레이어의 자유이고, 그 대가는 회차 카운트로 청구된다.
    const w0 = withPriority(wardWorld(), 'emergency', 0)
    expect(docs(w0)).toHaveLength(1)                      // 전제: 그 과 의사가 **있다**
    const m = firstEmergencyMin(w0, 'STEMI')
    const w = run(w0, m)
    expect(w.stats.emergencyTurnedAway).toEqual([{ kind: 'STEMI', reason: 'NO_SPECIALIST' }])
    expect(w.stats.emergencyAccepted).toBe(0)
    expect(w.pawns.filter(p => p.emergency)).toEqual([])  // 문전박대는 폰을 만들지 않는다
  })

  it('대조 — 같은 세계에서 켜 두면(기본 2) 그 STEMI는 수용된다', () => {
    // 이 대조가 없으면 "응급을 통째로 못 받는" 구현도 위 단언을 통과한다(공허한 토글 테스트).
    const w0 = wardWorld()
    const w = run(w0, firstEmergencyMin(w0, 'STEMI'))
    expect(w.stats.emergencyAccepted).toBe(1)
    expect(w.stats.emergencyTurnedAway).toEqual([])
  })

  it('응급 배정은 emergency 내림차순 — 배열 앞이 낮으면 뒤가 먼저 처치한다', () => {
    let w = wardWorld({ doctors: 2 })
    w = { ...w, minute: EMERGENCY_WINDOW_MIN } // 자연 도착을 끊는다 — 침대는 손으로 채운다
    w = withPriority(w, 'emergency', 3, 1)     // 배열 **뒤**가 높다
    const bed = wardBeds(w)[0]
    const first = docOf(w, 0).id
    const second = docOf(w, 1).id
    w = tick({ ...w, pawns: [...w.pawns, inBed('emg-a', bed)] }, 1)
    expect(pawnById(w, 'emg-a')).toMatchObject({ stage: 'IN_TREATMENT', doctorId: second })

    // 대조 — 같은 값이면 **폰 배열 순서**가 타이브레이크다(정렬이 순서를 흔들지 않는다).
    let tie = wardWorld({ doctors: 2 })
    tie = { ...tie, minute: EMERGENCY_WINDOW_MIN }
    tie = tick({ ...tie, pawns: [...tie.pawns, inBed('emg-b', bed)] }, 1)
    expect(pawnById(tie, 'emg-b')).toMatchObject({ stage: 'IN_TREATMENT', doctorId: first })
  })

  it('emergency=0 의사는 휴식 중에도 낚아채이지 않는다 — 응급은 침대에서 계속 기다린다', () => {
    // 인터럽트는 배정의 부수효과라, 후보에서 빠진 의사는 인터럽트에서도 빠진다.
    // 이 축이 없으면 "판정·배정에선 껐는데 쉬던 의사는 끌려간다"가 조용히 남는다.
    let w = tired(deskWorld({ rooms: [LOUNGE_1, WARD_1BED] }), FATIGUE_RED)
    w = withPriority(w, 'emergency', 0)
    w = until(w, x => docOf(x).activity === 'RESTING')
    const bed = wardBeds(w)[0]
    w = run({ ...w, pawns: [...w.pawns, inBed('emg-c', bed)] }, 5)

    expect(pawnById(w, 'emg-c')!.stage).toBe('IN_BED')   // 처치가 시작되지 않았다
    expect(pawnById(w, 'emg-c')!.doctorId).toBeUndefined()
    expect(docOf(w).activity).toBe('RESTING')            // 휴식이 무효가 되지도 않았다
  })
})

describe('외래 토글 — 진료를 끈 의사와 줄 순서', () => {
  it('exam=0 의사는 대기 환자를 영원히 받지 않는다 — 환자는 인내를 넘겨 떠난다', () => {
    let w = withPriority(deskWorld(), 'exam', 0)
    w = { ...w, pawns: [...w.pawns, waitingPatient('pat-off', OPEN_TILE, w.minute)] }
    // ⚠️ 기준값은 **환자를 앉힌 뒤** 캡처한다. 이 세계는 시계를 480분으로 옮기기 전에 의사가
    //    책상까지 걸어가는 동안 굴렀고, 대기실이 없어 그때 온 외래가 전원 문전박대로
    //    leftCount를 이미 올려 뒀다 — 절대값으로 재면 그 잔고를 이 환자 몫으로 오독한다.
    const leftBefore = w.stats.leftCount
    for (let i = 0; i < PATIENCE_MIN + 2; i++) {
      w = tick(w, 1)
      // 한 분이라도 배정되면 여기서 잡힌다 — 끝 상태만 재면 "붙었다 떨어진" 경로를 놓친다.
      expect(pawnById(w, 'pat-off')?.doctorId).toBeUndefined()
    }
    // 시계가 도착 창 밖이라 이 구간엔 자연 도착이 없다 — 늘어난 1건은 그 환자다.
    expect(w.stats.leftCount).toBe(leftBefore + 1)
  })

  it('대조 — 같은 세계에서 exam이 기본 2면 그 환자는 곧바로 불린다', () => {
    let w = deskWorld()
    w = tick({ ...w, pawns: [...w.pawns, waitingPatient('pat-on', OPEN_TILE, w.minute)] }, 1)
    expect(pawnById(w, 'pat-on')).toMatchObject({ stage: 'TO_EXAM', doctorId: docOf(w).id })
  })

  it('과별 줄은 exam 내림차순 — 같은 값이면 폰 배열 순서다', () => {
    const base = deskWorld({ doctors: 2, rooms: [EXAM_B] })
    const first = docOf(base, 0).id
    const second = docOf(base, 1).id

    // 배열 **뒤** 의사만 3으로 올린다 — 정렬이 없으면 앞이 집힌다.
    let raised = withPriority(base, 'exam', 3, 1)
    raised = tick({ ...raised, pawns: [...raised.pawns, waitingPatient('pat-hi', OPEN_TILE, raised.minute)] }, 1)
    expect(pawnById(raised, 'pat-hi')).toMatchObject({ stage: 'TO_EXAM', doctorId: second })

    // 대조 — 둘 다 기본 2면 배열 순서(먼저 채용된 의사)가 잡는다.
    const tie = tick({ ...base, pawns: [...base.pawns, waitingPatient('pat-tie', OPEN_TILE, base.minute)] }, 1)
    expect(pawnById(tie, 'pat-tie')).toMatchObject({ stage: 'TO_EXAM', doctorId: first })
  })
})

describe('휴식 토글 — 끄기와 선제 이탈', () => {
  it('rest=0이면 휴게실이 있고 피로가 임계여도 쉬지 않는다', () => {
    const off = run(withPriority(tired(deskWorld({ rooms: [LOUNGE_1] }), FATIGUE_RED), 'rest', 0), 30)
    expect(docOf(off).activity).toBeUndefined()
    expect(docOf(off).fatigue).toBe(FATIGUE_RED) // 회복도 없다 — 안 갔으니까
    // 대조 — 같은 세계에서 기본 2면 그 분에 나선다(휴게실·피로 전제가 헛돌지 않았다).
    const on = tick(tired(deskWorld({ rooms: [LOUNGE_1] }), FATIGUE_RED), 1)
    expect(docOf(on).activity).toBe('TO_LOUNGE')
  })

  it('rest > exam이면 대기 환자가 있어도 먼저 쉬러 간다 — 선제 이탈', () => {
    // 기본 규칙은 "유휴일 때만 쉰다"라, 환자가 줄 서 있는 한 지친 의사는 계속 붙잡힌다.
    // rest를 exam 위로 올리는 것이 그 규칙을 뒤집는 **유일한** 수단이다.
    let w = withPriority(tired(deskWorld({ rooms: [LOUNGE_1] }), FATIGUE_RED), 'rest', 3)
    w = tick({ ...w, pawns: [...w.pawns, waitingPatient('pat-wait', OPEN_TILE, w.minute)] }, 1)
    expect(docOf(w).activity).toBe('TO_LOUNGE')
    expect(pawnById(w, 'pat-wait')).toMatchObject({ stage: 'WAITING' })
    expect(pawnById(w, 'pat-wait')!.doctorId).toBeUndefined()
  })

  it('rest <= exam이면 대기 환자가 있는 한 붙잡힌다 — 쉬는 건 유휴일 때뿐', () => {
    // 대조가 **경계에 붙어 있다**(rest 2 == exam 2): 비교를 `>=`로 넓히면 여기서 걸린다.
    let w = tired(deskWorld({ rooms: [LOUNGE_1] }), FATIGUE_RED)
    w = tick({ ...w, pawns: [...w.pawns, waitingPatient('pat-busy', OPEN_TILE, w.minute)] }, 1)
    expect(pawnById(w, 'pat-busy')).toMatchObject({ stage: 'TO_EXAM', doctorId: docOf(w).id })
    expect(docOf(w).activity).toBeUndefined()
  })
})
