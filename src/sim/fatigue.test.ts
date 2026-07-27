import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createWorld, INITIAL_TREASURY_MANWON, type SimWorld } from './world'
import { placeRoom } from './build'
import { type Pawn } from './pawn'
import { hire } from './testHelpers'
import { tick } from './tick'
import { DAY_END_MIN, startNextDay } from './day'
import { startNextWeek } from './week'
import { deptRevenueSum, simDept, type SimDeptKey } from './dept'
import { ARRIVAL_WINDOW_MIN, EXAM_DURATION_MIN } from './patientFlow'
import { EMERGENCIES, EMERGENCY_INTENSITY, wardBeds } from './emergency'
import {
  FATIGUE_FREE_MIN, FATIGUE_MAX, FATIGUE_PER_OVER_HOUR, FATIGUE_RED, FATIGUE_REST,
  FATIGUE_SLOW_FROM, fatigueSlowFactor, stepFatigue,
} from '../game/doctor'
import { addWorkLoad, fatigueGain, fatigueOf, restOvernight, slowedDurationMin } from './fatigue'
import { STARVED_SLOW } from './needs'

/** 응급이 실제로 수용되는 세계 시드(emergency.test와 같은 근거 — 시드마다 그날 응급이 갈린다). */
const BOTH_KINDS_SEED = 4
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
function until(w: SimWorld, pred: (w: SimWorld) => boolean, limit = 200) {
  for (let i = 0; i < limit; i++) {
    if (pred(w)) return w
    w = tick(w, 1)
  }
  throw new Error('전제 실패 — 기다린 상태가 오지 않았다')
}

const theDoctor = (w: SimWorld) => w.pawns.find(p => p.kind === 'DOCTOR')!

/** 대기실 + 그 과 진료실 + 그 과 의사 1명 — 외래만 도는 병원(병동이 없어 응급은 전부 회차). */
function outpatientWorld(dept: SimDeptKey, seed = 3): SimWorld {
  let w = place(createWorld(seed), { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  w = place(w, { type: 'EXAM', dept, x: 6, y: 6, w: 6, h: 5 })
  return hire(w, dept)
}

/** 외래 + 응급이 **같은 의사**를 두고 섞이는 병원(emergency.test의 mixedWorld와 같은 배치). */
function mixedWorld(seed = BOTH_KINDS_SEED): SimWorld {
  let w = place(createWorld(seed), { type: 'WAITING', x: 18, y: 20, w: 8, h: 6 })
  w = place(w, { type: 'EXAM', dept: 'CARDIOLOGY', x: 6, y: 6, w: 6, h: 5 })
  w = place(w, WARD_1BED)
  return hire(w, 'CARDIOLOGY')
}

/** 진료실 하나 + 그 과 의사 하나(대기실 없음 — 자연 도착이 폰조차 만들지 않는다).
 *  의사의 피로를 손으로 박아 **감속만** 격리해 관측한다. */
function fatiguedSoloWorld(dept: SimDeptKey, fatigue: number, seed = 3): SimWorld {
  const w = tick(hire(place(createWorld(seed), { type: 'EXAM', dept, x: 6, y: 6, w: 6, h: 5 }), dept), 40)
  if (!theDoctor(w).roomId) throw new Error('전제 실패 — 의사가 진료실에 배정되지 않았다')
  return { ...w, pawns: w.pawns.map(p => (p.kind === 'DOCTOR' ? { ...p, fatigue } : p)) }
}

/** 진료실 문 바로 바깥에 앉은 환자(patientFlow.test의 seatPatient와 같은 자리). */
function seatPatient(w: SimWorld, wantsDept: SimDeptKey): SimWorld {
  const at = { x: 9, y: 11 }
  const patient: Pawn = {
    id: 'pat-hand', kind: 'PATIENT', x: at.x, y: at.y, path: [], dest: at,
    stage: 'WAITING', arrivedMin: w.minute, wantsDept,
  }
  return { ...w, pawns: [...w.pawns, patient] }
}

const doc = (over: Partial<Pawn> = {}): Pawn =>
  ({ id: 'doc-hand', kind: 'DOCTOR', x: 1, y: 1, path: [], dept: 'CARDIOLOGY', fatigue: 0, loadMinToday: 0, ...over })

describe('피로 곡선 — 기존 게임에서 임포트(복제 금지)', () => {
  const simDir = fileURLToPath(new URL('.', import.meta.url))
  const simSources = readdirSync(simDir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(f => ({ file: f, code: stripComments(readFileSync(join(simDir, f), 'utf8')) }))

  /** 주석·문자열은 값이 아니라 **설명**이라 리터럴 검사에서 뺀다(출처 주석에 숫자가 나온다). */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')
  }

  it('fatigue.ts는 곡선 상수를 전부 임포트한다 — 숫자를 다시 적지 않는다', () => {
    const src = simSources.find(s => s.file === 'fatigue.ts')!.code
    expect(src).toMatch(/from\s+'\.\.\/game\/doctor'/)
    for (const name of ['FATIGUE_FREE_MIN', 'FATIGUE_PER_OVER_HOUR', 'FATIGUE_REST', 'FATIGUE_MAX', 'fatigueSlowFactor']) {
      expect(src).toContain(name)
    }
    // 곡선을 이루는 **값**이 코드에 리터럴로 나타나면 복제다 — 임포트가 있어도 한 줄이 리터럴로
    // 새면 그쪽만 조용히 낡는다. (60은 시간 단위 환산이라 곡선 상수가 아니다.)
    const curveValues = [
      FATIGUE_FREE_MIN, FATIGUE_PER_OVER_HOUR, FATIGUE_REST, FATIGUE_MAX, FATIGUE_SLOW_FROM,
    ]
    for (const v of curveValues) {
      expect(src).not.toMatch(new RegExp(String.raw`(?<![\w.])${v}(?![\d.])`))
    }
  })

  it('src/sim 어디에도 곡선을 다시 선언하지 않는다', () => {
    for (const { file, code } of simSources) {
      expect(code, file).not.toMatch(/const\s+FATIGUE_/)
      expect(code, file).not.toMatch(/function\s+fatigueSlowFactor/)
    }
  })

  it('계약: 하루 축적 − 아침 회복 == 기존 stepFatigue의 하루 델타(야간 없는 날)', () => {
    // 새 시뮬은 **축적을 낮 동안(건별), 회복을 아침에** 나눠 하지만 하루를 통으로 보면 옛 층과
    // 같은 곡선이어야 한다. 그래서 대조는 **실제 합성 경로**로 한다 — 건별 `addWorkLoad`를 쌓고
    // `restOvernight`로 아침을 지난 값이 옛 `stepFatigue`의 하루 델타와 같아야 한다.
    // 공식(`fatigueGain`)만 대조하면 곡선은 맞는데 그 공식을 **아무도 안 부르는** 구현도 통과한다.
    // 클램프에 안 걸리는 구간에서만 잰다(양쪽 다 [0,MAX]로 접기 때문).
    const days: Array<[number, number[]]> = [[30, [180, 220]], [50, [40, 60]], [10, [250, 150, 100]]]
    for (const [prev, jobs] of days) {
      const worked = jobs.reduce((d, load) => addWorkLoad(d, load), doc({ fatigue: prev }))
      const total = jobs.reduce((a, b) => a + b, 0)
      const legacy = stepFatigue({ d: prev }, { loadMin: new Map([['d', total]]), nightLoad: new Map() })
      expect(worked.loadMinToday).toBe(total)
      expect(restOvernight(worked).fatigue).toBe(legacy.d)
      // 이 하루가 실제로 클램프 밖이었다(양쪽이 0이나 100에서 우연히 만난 게 아니다).
      expect(legacy.d).toBe(prev + fatigueGain(total) - FATIGUE_REST)
    }
    // 계측기가 헛돌지 않았다 — 셋 중 하나는 실제로 문턱을 넘겨 피로가 올랐다.
    expect(fatigueGain(500)).toBeGreaterThan(FATIGUE_REST)
  })

  it('감속 배율은 기존 곡선 그대로 — 34 이하 1.0, 100에서 1.5', () => {
    expect(slowedDurationMin(EXAM_DURATION_MIN, 0)).toBe(EXAM_DURATION_MIN)
    expect(slowedDurationMin(EXAM_DURATION_MIN, FATIGUE_SLOW_FROM)).toBe(EXAM_DURATION_MIN)
    expect(slowedDurationMin(EXAM_DURATION_MIN, FATIGUE_RED)).toBe(25)   // ×1.25
    expect(slowedDurationMin(EXAM_DURATION_MIN, FATIGUE_MAX)).toBe(30)   // ×1.5
    expect(slowedDurationMin(EMERGENCIES.STEMI.durationMin, FATIGUE_MAX)).toBe(135)
    // 정수 분이되 곡선 자체는 기존 함수다 — 반올림 전 값이 어긋나면 여기서 걸린다.
    expect(slowedDurationMin(EMERGENCIES.STEMI.durationMin, FATIGUE_RED))
      .toBe(Math.round(EMERGENCIES.STEMI.durationMin * fatigueSlowFactor(FATIGUE_RED)))
  })

  it('정수화는 반올림이다 — 올림도 내림도 아니다(소요가 체계적으로 밀리지 않는다)', () => {
    // ⚠️ 위 표본은 전부 배율이 딱 떨어지는 지점(×1.0·×1.25·×1.5)이라 round·ceil·floor가
    // **같은 값**을 낸다 — 그래서 `Math.ceil`로 바꿔도 전체 green이었다(리뷰 실측). 즉
    // slowedDurationMin 독스트링이 한 문단 들여 적은 결정이 무계측으로 남아 있었다.
    // 딱 떨어지지 않는 두 점을 양방향으로 잡아 그 결정 자체를 잠근다.
    // 올림이면 배율 1.0 구간을 뺀 **모든** 건에 평균 +0.5분이 얹혀 곡선이 통째로 위로 밀린다.
    expect(slowedDurationMin(EXAM_DURATION_MIN, 36)).toBe(20) // ×1.0152 → 20.30 (올림이면 21)
    expect(slowedDurationMin(EXAM_DURATION_MIN, 60)).toBe(24) // ×1.1970 → 23.94 (내림이면 23)
  })
})

describe('축적 — 표준강도분', () => {
  it(`하루 ${FATIGUE_FREE_MIN} 표준강도분까지는 무료, 초과분만 시간당 ${FATIGUE_PER_OVER_HOUR}`, () => {
    // 경계 쌍으로 잰다(T-085) — 한쪽만 재면 공제를 지워도 안 걸린다.
    expect(addWorkLoad(doc(), FATIGUE_FREE_MIN).fatigue).toBe(0)
    expect(addWorkLoad(doc(), FATIGUE_FREE_MIN + 60).fatigue).toBe(FATIGUE_PER_OVER_HOUR)
    // 나눠 쌓아도 하루 총량이 같으면 결과가 같다(중간 반올림이 새지 않는다).
    expect(addWorkLoad(addWorkLoad(doc(), 300), 300).fatigue).toBe(addWorkLoad(doc(), 600).fatigue)
    expect(addWorkLoad(doc(), 10_000).fatigue).toBe(FATIGUE_MAX) // 상한
  })

  it('미용 의사(강도 0.3)는 하루 종일 봐도 무풍이다 — 피로가 오르지 않는다', () => {
    const w = run(outpatientWorld('AESTHETICS'), DAY_END_MIN - 1)
    const d = theDoctor(w)
    expect(w.stats.examsDone).toBeGreaterThan(5) // 계측기가 헛돌지 않았다(실제로 종일 봤다)
    // 부하는 **분이 아니라 표준강도분**이다 — 강도 곱을 빼면 이 부등식이 곧바로 깨진다
    // (강도 없이는 examsDone × 20 = 상한의 세 배가 넘는다).
    //
    // ⚠️ 등식이 아니라 **구간**인 이유: 이 병원엔 식당이 없어 의사가 `HUNGRY_AFTER_MIN`(300분)
    // 이후 굶은 채로 일한다(needs.starvedSlowFactor). 그 뒤 시작한 외래는 20분이 아니라 23분이라,
    // 건별 소요가 20과 `round(20 × STARVED_SLOW)` 사이에서 갈린다 — 몇 건이 어느 쪽인지는
    // 도착 시드가 정하므로 여기서 세지 않고 양쪽 끝만 잠근다. 무풍이라는 주장(피로 0)은 그대로다.
    // ⓘ 상한을 느슨하게 둔 대가는 **다른 파일이 치른다**: 굶주림 감속 자체(1.15배)는
    //    needs.test.ts 「굶은 의사의 외래는 1.15배 길다」가 단일 건으로 정확히 잡는다. 여기서
    //    구간이 넓다고 그 축이 무계측인 것은 아니다 — 이 테스트가 지는 몫은 **강도 곱**뿐이다.
    const base = w.stats.examsDone * simDept('AESTHETICS').intensity
    expect(d.loadMinToday!).toBeGreaterThanOrEqual(base * EXAM_DURATION_MIN)
    expect(d.loadMinToday!).toBeLessThanOrEqual(base * Math.round(EXAM_DURATION_MIN * STARVED_SLOW))
    expect(d.loadMinToday).toBeLessThan(FATIGUE_FREE_MIN)
    expect(d.fatigue).toBe(0)
  })

  it('순환기+응급 의사는 하루 만에 갈려 감속 지대로 넘어간다', () => {
    const w = run(mixedWorld(), DAY_END_MIN - 1)
    const d = theDoctor(w)
    expect(w.stats.examsDone).toBeGreaterThan(0)          // 전제: 외래를 봤다
    expect(w.stats.emergencyAccepted).toBeGreaterThan(0)  // 전제: 응급도 받았다
    expect(d.loadMinToday!).toBeGreaterThan(FATIGUE_FREE_MIN)
    expect(d.fatigue!).toBeGreaterThan(FATIGUE_SLOW_FROM)
    // 같은 하루를 미용 의사와 나란히 — "같은 시간을 일해도 필수의료가 더 갈린다"의 계측.
    expect(d.fatigue!).toBeGreaterThan(fatigueOf(theDoctor(run(outpatientWorld('AESTHETICS'), DAY_END_MIN - 1))))
  })

  it(`응급 한 건은 강도 ${EMERGENCY_INTENSITY}로 쌓인다 — 외래보다 무겁다`, () => {
    // 병동 + 순환기 의사 하나뿐인 세계(대기실이 없어 외래는 폰조차 안 생긴다) — 첫 처치가 끝난
    // 그 분의 부하 증가만 관측된다.
    let w = place(createWorld(BOTH_KINDS_SEED), WARD_1BED)
    w = hire(w, 'CARDIOLOGY')
    w = until(w, x => x.pawns.some(p => p.stage === 'IN_TREATMENT'), ARRIVAL_WINDOW_MIN)
    expect(theDoctor(w).loadMinToday).toBe(0) // 전제: 아직 아무것도 안 끝났다
    w = until(w, x => (theDoctor(x).loadMinToday ?? 0) > 0, EMERGENCIES.STEMI.durationMin + 5)
    expect(theDoctor(w).loadMinToday).toBe(EMERGENCIES.STEMI.durationMin * EMERGENCY_INTENSITY)
  })

  it('부하는 그 일을 한 의사에게만 붙는다', () => {
    let w = outpatientWorld('INTERNAL_MEDICINE')
    w = hire(w, 'AESTHETICS') // 방이 없어 놀기만 하는 의사
    w = until(w, x => x.stats.examsDone > 0, ARRIVAL_WINDOW_MIN)
    const idle = w.pawns.filter(p => p.kind === 'DOCTOR').find(p => p.dept === 'AESTHETICS')!
    expect(idle.loadMinToday).toBe(0)
    expect(w.pawns.find(p => p.dept === 'INTERNAL_MEDICINE')!.loadMinToday!).toBeGreaterThan(0)
  })
})

describe('감속 — 피로가 진료를 늦춘다', () => {
  it(`피로 ${FATIGUE_RED}(레드존) 의사의 진료는 ${EXAM_DURATION_MIN}분보다 길다`, () => {
    const w0 = seatPatient(fatiguedSoloWorld('CARDIOLOGY', FATIGUE_RED), 'CARDIOLOGY')
    const w = until(w0, x => x.pawns.some(p => p.stage === 'IN_EXAM'), 60)
    const p = w.pawns.find(x => x.stage === 'IN_EXAM')!
    expect(p.examUntilMin! - w.minute).toBe(25)
    expect(p.examUntilMin! - w.minute).toBeGreaterThan(EXAM_DURATION_MIN)
    // 실제로 그만큼 걸린다 — 예약된 시각만 늘고 완료가 20분에 나면 감속이 아니라 표시다.
    const mid = run(w, 24)
    expect(mid.stats.examsDone).toBe(0)
    expect(run(mid, 1).stats.examsDone).toBe(1)
  })

  it('피로 0 의사는 정확히 기본 소요다 — 감속은 레드존에서만 붙는다', () => {
    const w0 = seatPatient(fatiguedSoloWorld('CARDIOLOGY', 0), 'CARDIOLOGY')
    const w = until(w0, x => x.pawns.some(p => p.stage === 'IN_EXAM'), 60)
    expect(w.pawns.find(x => x.stage === 'IN_EXAM')!.examUntilMin! - w.minute).toBe(EXAM_DURATION_MIN)
  })

  it('응급 처치도 같은 배율로 늘어난다', () => {
    let w = place(createWorld(3), WARD_1BED)
    w = hire(w, 'CARDIOLOGY')
    w = { ...w, minute: ARRIVAL_WINDOW_MIN, pawns: w.pawns.map(p => ({ ...p, fatigue: FATIGUE_RED })) }
    const bed = wardBeds(w)[0]
    const emergency: Pawn = {
      id: 'emg-hand', kind: 'PATIENT', x: bed.x, y: bed.y, path: [], dest: bed,
      stage: 'IN_BED', emergency: 'STEMI', wantsDept: 'CARDIOLOGY',
    }
    w = tick({ ...w, pawns: [...w.pawns, emergency] }, 1)
    const p = w.pawns.find(x => x.id === 'emg-hand')!
    expect(p.stage).toBe('IN_TREATMENT')
    expect(p.treatUntilMin! - w.minute).toBe(slowedDurationMin(EMERGENCIES.STEMI.durationMin, FATIGUE_RED))
    expect(p.treatUntilMin! - w.minute).toBeGreaterThan(EMERGENCIES.STEMI.durationMin)
  })

  it('늘어난 소요만큼 부하도 늘어난다 — 감속이 축적을 우회하지 않는다', () => {
    const w0 = seatPatient(fatiguedSoloWorld('CARDIOLOGY', FATIGUE_RED), 'CARDIOLOGY')
    const w = until(w0, x => x.stats.examsDone > 0, 120)
    expect(theDoctor(w).loadMinToday).toBe(25 * simDept('CARDIOLOGY').intensity)
  })
})

describe('회복 — 아침', () => {
  it(`아침에 ${FATIGUE_REST} 회복하고 하루 누적을 0으로 되돌린다`, () => {
    const w = run(mixedWorld(), DAY_END_MIN)
    const before = theDoctor(w)
    expect(w.phase).toBe('DAY_END')
    expect(before.fatigue!).toBeGreaterThan(FATIGUE_REST) // 전제: 회복이 관측될 만큼 쌓였다
    expect(before.loadMinToday!).toBeGreaterThan(0)
    const next = theDoctor(startNextDay(w))
    expect(next.fatigue).toBe(before.fatigue! - FATIGUE_REST)
    expect(next.loadMinToday).toBe(0)
  })

  it('회복은 0 아래로 내려가지 않는다', () => {
    expect(restOvernight(doc({ fatigue: 5 })).fatigue).toBe(0)
  })

  it('누적 리셋이 없으면 이튿날 피로가 더 빨리 오른다 — 리셋은 표시가 아니라 계산의 일부다', () => {
    // 어제 문턱 근처까지 일한 의사가 오늘 100 표준강도분을 더 한다. 리셋이 돌면 오늘치는
    // 문턱 아래라 피로가 0이고, 안 돌면 어제 누적 위에 얹혀 곧바로 오른다.
    const yesterday = addWorkLoad(doc(), 200)
    expect(restOvernight(yesterday).loadMinToday).toBe(0)
    expect(addWorkLoad(restOvernight(yesterday), 100).fatigue).toBe(restOvernight(yesterday).fatigue)
    expect(addWorkLoad(yesterday, 100).fatigue!).toBeGreaterThan(yesterday.fatigue!)
  })

  it('주를 넘겨도 같은 아침이 열린다 — 회복은 freshMorning 하나가 소유한다', () => {
    // 7일차 밤은 startNextDay가 아니라 startNextWeek이 연다. 회복을 startNextDay에만 달면
    // **주의 첫날만** 회복 없이 시작하는데, 에러는 안 나고 숫자만 틀린다.
    const w = run(mixedWorld(), DAY_END_MIN)
    const before = theDoctor(w).fatigue!
    expect(before).toBeGreaterThan(FATIGUE_REST) // 전제: 회복이 관측될 만큼 쌓였다
    const next = theDoctor(startNextWeek({ ...w, phase: 'WEEK_END', weekSettled: true }))
    expect(next.fatigue).toBe(before - FATIGUE_REST)
    expect(next.loadMinToday).toBe(0)
  })
})

describe('불변식 — 피로가 붙어도 흔들리지 않는다', () => {
  it('금고 불변식: 소요가 늘어도 금고 = 초기 − 건설비 + Σ byDept', () => {
    const w0 = mixedWorld()
    const built = INITIAL_TREASURY_MANWON - w0.treasuryManwon
    const w = run(w0, DAY_END_MIN - 1)
    expect(theDoctor(w).fatigue!).toBeGreaterThan(FATIGUE_SLOW_FROM) // 전제: 실제로 감속 지대였다
    expect(deptRevenueSum(w.stats.byDept)).toBeGreaterThan(0)
    expect(w.treasuryManwon).toBe(INITIAL_TREASURY_MANWON - built + deptRevenueSum(w.stats.byDept))
  })

  it('결정론·시간 분할: 피로가 섞여도 같은 시드면 하루가 완전히 같다', () => {
    expect(run(mixedWorld(), DAY_END_MIN)).toEqual(run(mixedWorld(), DAY_END_MIN))
    expect(tick(mixedWorld(), 300)).toEqual(run(mixedWorld(), 300))
  })

  it('tick은 입력 세계를 변형하지 않는다 (피로 포함)', () => {
    const w = mixedWorld()
    const snapshot = structuredClone(w)
    tick(w, 300)
    expect(w).toEqual(snapshot)
  })
})
