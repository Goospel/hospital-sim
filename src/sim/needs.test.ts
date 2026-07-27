import { describe, it, expect } from 'vitest'
import { createWorld, type SimWorld } from './world'
import { placeRoom } from './build'
import { hireDoctor, type Pawn } from './pawn'
import { buildBlockedSet, findPath } from './path'
import { tick } from './tick'
import { freshMorning } from './day'
import { ARRIVAL_WINDOW_MIN, furnitureSpot, furnitureSpots } from './patientFlow'
import { wardBeds } from './emergency'
import { FATIGUE_RED, FATIGUE_REST } from '../game/doctor'
import { REST_BREAK_MIN, REST_BREAK_RECOVER } from './needs'

/** 순환기 진료실 — 8×8이라 의사가 책상에서 문까지 **여러 분** 방 안에 머문다.
 *  그 구간이 있어야 "방 안에 있는데도 외래 배정에서 빠진다"(activity 제외)가 관측된다:
 *  방을 벗어난 뒤엔 다른 조건(insideRoom)이 이미 걸러 계측력이 0이 된다. */
const EXAM_CARDIO = { type: 'EXAM' as const, dept: 'CARDIOLOGY' as const, x: 6, y: 6, w: 8, h: 8 }

/** 의자 1개짜리 휴게실 — 4×4의 내부는 2×2라 자동 배치가 의자를 하나만 놓는다
 *  (build.autoFurniture의 "둘째 의자는 한 칸 띄울 자리가 있을 때만"). 좌석 경합이 관측된다. */
const LOUNGE_1 = { type: 'LOUNGE' as const, x: 16, y: 6, w: 4, h: 4 }
/** 의자 2개짜리 휴게실 — 같은 자리에 폭만 넓힌다. LOUNGE_1과의 대조가 "한 번에 한 명"이 아니라
 *  **좌석 수**가 한도임을 보인다. */
const LOUNGE_2 = { type: 'LOUNGE' as const, x: 16, y: 6, w: 6, h: 4 }
/** LOUNGE_1의 문(18,9) 바로 앞 타일(18,10)을 벽으로 덮는 방 — 휴게실이 **도달 불가**가 된다. */
const SEALER = { type: 'WARD' as const, x: 16, y: 10, w: 4, h: 4 }
/** 봉인된 휴게실 너머의 멀쩡한 휴게실 — 후보 순서상 **두 번째**다. */
const FAR_LOUNGE = { type: 'LOUNGE' as const, x: 24, y: 6, w: 4, h: 4 }
/** 침대 1개짜리 병동(emergency.test.ts와 같은 규격) */
const WARD_1BED = { type: 'WARD' as const, x: 30, y: 20, w: 4, h: 4 }

function place(w: SimWorld, spec: Parameters<typeof placeRoom>[1]): SimWorld {
  const r = placeRoom(w, spec)
  if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
  return r.world
}

const run = (w: SimWorld, minutes: number) => {
  for (let i = 0; i < minutes; i++) w = tick(w, 1)
  return w
}

/** 조건이 참이 될 때까지 1분씩 — 전제가 성립 안 하면 조용히 통과하지 말고 터진다 */
function until(w: SimWorld, pred: (w: SimWorld) => boolean, limit = 120) {
  for (let i = 0; i < limit; i++) {
    if (pred(w)) return w
    w = tick(w, 1)
  }
  throw new Error('전제 실패 — 기다린 상태가 오지 않았다')
}

const doctors = (w: SimWorld) => w.pawns.filter(p => p.kind === 'DOCTOR')
const doctorOf = (w: SimWorld) => doctors(w)[0]
const at = (p: { x: number; y: number }) => ({ x: p.x, y: p.y })

/** 그 의사의 책상 앞 자리 — 파생식을 테스트가 다시 쓰지 않도록 구현의 단일 출처를 부른다. */
function deskSpot(w: SimWorld, p: Pawn = doctorOf(w)) {
  const spot = furnitureSpot(w, p.roomId!, 'DESK', buildBlockedSet(w))
  if (!spot) throw new Error('전제 실패 — 책상 앞 자리가 없다')
  return spot
}

const loungeSeats = (w: SimWorld) => furnitureSpots(w, 'LOUNGE', 'CHAIR')

/** 그 폰이 자기 진료실 **안**에 서 있는가 — 외래 배정의 유휴 판정이 보는 축이다.
 *  activity 제외를 겨눈 테스트는 이 값이 참인 순간에 재야 계측력이 있다. */
function insideOwnRoom(w: SimWorld, p: Pawn): boolean {
  const r = w.rooms.find(x => x.id === p.roomId)
  return !!r && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
}

/** 순환기 의사 1명이 자기 책상 앞에 자리잡은 병원. 도착 창이 닫힌 뒤로 시계를 옮겨
 *  자연 도착(외래·응급)이 끼어들지 않게 한다 — 관측되는 건 손으로 세운 상황뿐이다.
 *  대기실이 없어 외래 폰은 애초에 생기지 않는다(문전박대). */
function restWorld(
  { lounge = [LOUNGE_1] as Array<Parameters<typeof placeRoom>[1]>, seed = 3 } = {},
): SimWorld {
  let w = place(createWorld(seed), EXAM_CARDIO)
  for (const spec of lounge) w = place(w, spec)
  w = hireDoctor(w, 'CARDIOLOGY')
  w = until(w, x => {
    const d = doctorOf(x)
    return !!d.roomId && !!d.dest && d.x === d.dest.x && d.y === d.dest.y
  }, 90)
  return { ...w, minute: ARRIVAL_WINDOW_MIN }
}

/** 모든 의사의 피로를 못박는다 — 임계 근처를 손으로 세워야 경계가 관측된다. */
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

describe('휴식 상수', () => {
  it('낮잠은 밤잠을 이기지 못한다 — REST_BREAK_RECOVER < FATIGUE_REST', () => {
    // 대소가 뒤집히면 "쉬엄쉬엄 굴리면 영원히 안 지친다"가 되어, 피로 → 포화 → 사직의
    // 인과가 통째로 끊긴다. 값이 아니라 **관계**가 계약이라 여기서 잠근다.
    expect(REST_BREAK_RECOVER).toBeLessThan(FATIGUE_REST)
    expect(REST_BREAK_RECOVER).toBeGreaterThan(0)
    expect(REST_BREAK_MIN).toBeGreaterThan(0)
  })
})

describe('휴식 — 개시·전이·종료', () => {
  it('피로 임계 의사는 휴게실로 걸어가 60분 쉬고 15를 내린 뒤 책상으로 돌아온다', () => {
    let w = tired(restWorld(), FATIGUE_RED)
    const desk = deskSpot(w)
    const seats = loungeSeats(w)
    expect(seats).toHaveLength(1)          // 전제: 의자 하나짜리 휴게실
    const seat = seats[0]
    expect(at(doctorOf(w))).toEqual(desk)  // 전제: 책상 앞에서 시작한다

    // ⓐ 개시 — 그 분에 목적지와 경로가 잡힌다
    w = tick(w, 1)
    let doc = doctorOf(w)
    expect(doc.activity).toBe('TO_LOUNGE')
    expect(doc.dest).toEqual(seat)
    expect(doc.path.length).toBeGreaterThan(0)
    expect(doc.fatigue).toBe(FATIGUE_RED)  // 나서기만 했다 — 회복은 아직 없다

    // ⓑ 전이 — 의자에 **닿는** 그 분에 RESTING
    w = until(w, x => doctorOf(x).activity === 'RESTING')
    doc = doctorOf(w)
    expect(at(doc)).toEqual(seat)
    expect(doc.restUntilMin).toBe(w.minute + REST_BREAK_MIN)
    expect(doc.dest).toEqual(seat)         // dest 유지 = 좌석 점유의 표현
    expect(doc.fatigue).toBe(FATIGUE_RED)
    const restStart = w.minute

    // 블록이 끝나기 전엔 아무것도 안 내려간다(회복은 끝날 때 한 번에)
    w = run(w, REST_BREAK_MIN - 1)
    expect(doctorOf(w).activity).toBe('RESTING')
    expect(doctorOf(w).fatigue).toBe(FATIGUE_RED)

    // ⓒ 종료 — 정확히 REST_BREAK_MIN분에
    w = run(w, 1)
    expect(w.minute).toBe(restStart + REST_BREAK_MIN)
    doc = doctorOf(w)
    expect(doc.activity).toBeUndefined()
    expect(doc.restUntilMin).toBeUndefined()
    expect(doc.fatigue).toBe(FATIGUE_RED - REST_BREAK_RECOVER)
    expect(doc.dest).toEqual(desk)         // 자기 방 책상으로 복귀

    // 실제로 걸어 돌아온다 — 회복 뒤엔 임계 아래라 다시 나가지 않는다
    w = until(w, x => at(doctorOf(x)).x === desk.x && at(doctorOf(x)).y === desk.y)
    expect(doctorOf(w).activity).toBeUndefined()
  })

  it('피로가 임계 미만이면 휴게실이 있어도 가지 않는다 — 문은 67에서 열린다', () => {
    // 임계를 지우면(피로 0에도 휴식) 이 두 단언이 함께 죽는다.
    const idle = run(tired(restWorld(), 0), 30)
    expect(doctorOf(idle).activity).toBeUndefined()
    const below = run(tired(restWorld(), FATIGUE_RED - 1), 30)
    expect(doctorOf(below).activity).toBeUndefined()
    expect(at(doctorOf(below))).toEqual(deskSpot(below)) // 자리도 그대로다
    const atRed = run(tired(restWorld(), FATIGUE_RED), 1)
    expect(doctorOf(atRed).activity).toBe('TO_LOUNGE')   // 경계는 닫힌 쪽(>=)이다
  })

  it('휴게실이 없으면 못 쉰다 — 피로도 자리도 그대로다', () => {
    // 이게 사직으로 가는 인과의 입구다: 못 쉬면 안 내려가고, 안 내려가면 포화한다.
    const w0 = tired(restWorld({ lounge: [] }), FATIGUE_RED)
    const before = at(doctorOf(w0))
    const w = run(w0, 100)
    const doc = doctorOf(w)
    expect(doc.activity).toBeUndefined()
    expect(doc.fatigue).toBe(FATIGUE_RED)
    expect(at(doc)).toEqual(before)
  })

  it('의자 하나에 둘이 앉지 않는다 — 좌석 점유는 다른 의사의 dest로 판정된다', () => {
    // 둘째 의사는 진료실이 하나뿐이라 방을 못 받는다 — 그래도 쉴 수는 있다(휴식은 방과 무관).
    const one = tired(hireDoctor(restWorld(), 'CARDIOLOGY'), FATIGUE_RED)
    expect(doctors(one)).toHaveLength(2)      // 전제
    expect(loungeSeats(one)).toHaveLength(1)  // 전제: 의자 하나
    const after = tick(one, 1)
    expect(doctors(after).filter(d => d.activity === 'TO_LOUNGE')).toHaveLength(1)

    // 대조 — 의자가 둘이면 둘 다 간다. "한 번에 한 명"이 아니라 **좌석 수**가 한도다.
    const two = tired(hireDoctor(restWorld({ lounge: [LOUNGE_2] }), 'CARDIOLOGY'), FATIGUE_RED)
    expect(loungeSeats(two)).toHaveLength(2)  // 전제
    const bothGone = tick(two, 1)
    const going = doctors(bothGone).filter(d => d.activity === 'TO_LOUNGE')
    expect(going).toHaveLength(2)
    // 서로 다른 의자다 — 점유를 안 보면 둘이 같은 칸을 목적지로 삼는다.
    expect(going[0].dest).not.toEqual(going[1].dest)
  })

  it('닿을 수 없는 의자는 건너뛰고 다음 후보를 본다 — 봉인된 휴게실이 전체를 가리지 않는다', () => {
    // 대기실 좌석(patientFlow.freeSeat)과 같은 규칙. 첫 후보에서 끝내면 봉인된 방 하나가
    // 멀쩡한 휴게실을 통째로 가려 아무도 못 쉬고, 철거가 없어 세션 내 비가역이다.
    let w = restWorld({ lounge: [LOUNGE_1, FAR_LOUNGE] })
    w = place(w, SEALER) // LOUNGE_1의 문 앞을 벽으로 덮는다
    w = tired(w, FATIGUE_RED)
    const seats = loungeSeats(w)
    expect(seats).toHaveLength(2)
    const [sealed, far] = seats
    // 전제: 봉인된 의자가 **첫** 후보이고 실제로 도달 불가다
    expect(sealed).toEqual({ x: 18, y: 7 })
    const doc0 = doctorOf(w)
    expect(findable(w, doc0, sealed)).toBe(false)
    expect(findable(w, doc0, far)).toBe(true)

    const after = tick(w, 1)
    expect(doctorOf(after).activity).toBe('TO_LOUNGE')
    expect(doctorOf(after).dest).toEqual(far)
  })

  it('휴게실 가던 길이 끊기면 휴식을 접고 책상으로 돌아온다 — 영구 정지 금지', () => {
    // tick의 재탐색 실패 결과(path 비움)를 손으로 만든다. 안 풀면 그 의사는 'TO_LOUNGE'인 채
    // 굳어 외래에도 응급에도 안 잡힌다(환자 좌초 해소와 같은 병).
    let w = tick(tired(restWorld(), FATIGUE_RED), 1)
    expect(doctorOf(w).activity).toBe('TO_LOUNGE') // 전제
    const desk = deskSpot(w)
    w = { ...w, pawns: w.pawns.map(p => (p.kind === 'DOCTOR' ? { ...p, path: [] } : p)) }
    w = tick(w, 1)
    const doc = doctorOf(w)
    expect(doc.activity).toBeUndefined()
    expect(doc.restUntilMin).toBeUndefined()
    expect(doc.dest).toEqual(desk)
    expect(doc.fatigue).toBe(FATIGUE_RED) // 쉬지 못했으니 회복도 없다
  })
})

describe('휴식과 일의 경합', () => {
  it('휴식하러 나선 의사는 대기 환자를 받지 않는다 — 자기 방 안에 있어도', () => {
    let w = tick(tired(restWorld(), FATIGUE_RED), 1)
    expect(doctorOf(w).activity).toBe('TO_LOUNGE')       // 전제: 나섰다
    expect(insideOwnRoom(w, doctorOf(w))).toBe(true)     // 전제: 아직 방 안 — 여기가 계측 지점이다
    w = { ...w, pawns: [...w.pawns, waitingPatient('pat-hand', { x: 20, y: 20 }, w.minute)] }

    w = tick(w, 1)
    // ⚠️ 이 단언이 죽으려면 의사가 **그 분에 방 안에 있어야** 한다 — 방을 벗어나면
    // insideRoom이 이미 걸러 activity 제외를 지워도 아무 일이 안 일어난다(공허한 테스트).
    expect(insideOwnRoom(w, doctorOf(w))).toBe(true)
    expect(doctorOf(w).activity).toBe('TO_LOUNGE')
    let pat = w.pawns.find(p => p.id === 'pat-hand')!
    expect(pat.stage).toBe('WAITING')
    expect(pat.doctorId).toBeUndefined()

    // 앉아서 쉬는 동안에도 마찬가지다(인내 90분 안에서 잰다)
    w = until(w, x => doctorOf(x).activity === 'RESTING')
    pat = w.pawns.find(p => p.id === 'pat-hand')!
    expect(pat.stage).toBe('WAITING')
    expect(pat.doctorId).toBeUndefined()

    // 대조 — 휴식이 끝나 책상으로 돌아오면 그 환자를 본다(제외가 영구 봉인이 아니다)
    w = until(w, x => x.pawns.find(p => p.id === 'pat-hand')?.stage !== 'WAITING', 200)
    expect(w.pawns.find(p => p.id === 'pat-hand')!.stage).toBe('TO_EXAM')
  })

  it('휴식 중이어도 그 과 응급이 침대에서 기다리면 그 분에 배정된다 — 회복은 없다', () => {
    let w = place(tired(restWorld(), FATIGUE_RED), WARD_1BED)
    w = until(w, x => doctorOf(x).activity === 'RESTING')
    const restUntil = doctorOf(w).restUntilMin!
    const fatigueBefore = doctorOf(w).fatigue
    const bed = wardBeds(w)[0]
    w = tick({ ...w, pawns: [...w.pawns, inBed('emg-hand', bed)] }, 1)

    const doc = doctorOf(w)
    expect(w.pawns.find(p => p.id === 'emg-hand')).toMatchObject({
      stage: 'IN_TREATMENT', doctorId: doc.id,
    })
    // 휴식이 **무효**가 된다 — activity·예정 종료·좌석 점유가 그 자리에서 사라진다.
    expect(doc.activity).toBeUndefined()
    expect(doc.restUntilMin).toBeUndefined()
    expect(doc.dest).toBeUndefined()
    expect(doc.path).toEqual([])
    expect(doc.fatigue).toBe(fatigueBefore)

    // 예정됐던 종료 시각을 지나도 회복은 오지 않는다 — 쉬지 않았기 때문이다.
    w = run(w, restUntil - w.minute + 5)
    expect(doctorOf(w).fatigue).toBe(fatigueBefore)
    expect(doctorOf(w).activity).toBeUndefined()
    expect(w.pawns.find(p => p.id === 'emg-hand')!.stage).toBe('IN_TREATMENT')
  })
})

describe('불변식·경계', () => {
  it('시간 분할 불변: 휴식 전이가 섞여도 90분 한 번 = 1분 90번', () => {
    const w0 = tired(restWorld(), FATIGUE_RED)
    const once = tick(w0, 90)
    expect(once).toEqual(run(w0, 90))
    // 계측기가 헛돌지 않았다 — 그 90분 안에서 개시·전이·종료가 전부 지나갔다.
    expect(doctorOf(once).fatigue).toBe(FATIGUE_RED - REST_BREAK_RECOVER)
  })

  it('tick은 입력 세계를 변형하지 않는다 (휴식 포함)', () => {
    const w = tired(restWorld(), FATIGUE_RED)
    const snapshot = structuredClone(w)
    tick(w, 100)
    expect(w).toEqual(snapshot)
  })

  it('freshMorning은 activity·restUntilMin을 지운다 — 아침은 책상에서 시작한다', () => {
    // 남기면 'RESTING'인 채로 하루가 시작돼 그 의사가 진료 후보에서 통째로 빠지고,
    // 어제의 restUntilMin이 오늘 0분엔 이미 지난 값이라 쉬지도 않은 회복이 들어온다.
    let w = tired(restWorld(), FATIGUE_RED)
    w = until(w, x => doctorOf(x).activity === 'RESTING')
    expect(doctorOf(w).restUntilMin).toBeDefined() // 전제
    const desk = deskSpot(w)
    const morning = freshMorning(w)
    const doc = doctorOf(morning)
    expect(doc.activity).toBeUndefined()
    expect(doc.restUntilMin).toBeUndefined()
    expect(doc.dest).toBeUndefined()
    expect(at(doc)).toEqual(desk)
  })
})

/** 그 자리까지 길이 있는가 — 봉인 테스트의 전제를 실제로 확인한다(구현과 같은 findPath). */
function findable(w: SimWorld, p: Pawn, to: { x: number; y: number }): boolean {
  return findPath(w, { x: p.x, y: p.y }, to) !== null
}
