import { describe, it, expect } from 'vitest'
import {
  materializeRoster, walkinDept, handlingDept, doctorCaseloads, stepFatigue,
  fatigueSlowFactor, FATIGUE_MAX, FATIGUE_SLOW_FROM, FATIGUE_RED, FATIGUE_FREE_MIN, FATIGUE_REST,
  stepSaturatedDays, RESIGN_SATURATED_DAYS, resigningDoctors, remapDoctorState, applyResignations,
} from './doctor'
import { createCallQueue, decide, initReceiving } from './receiving'
import { buildHospital, DEPARTMENTS } from './setup'
import { CANDIDATES, SPEED_OF_TIER } from './candidates'
import type { SetupChoices, IncomingCall } from './types'

const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

describe('materializeRoster — 인원수 → 개인 유닛', () => {
  it('과별 수만큼 유닛을 만들고 id·dept를 채운다', () => {
    const roster = materializeRoster(conscientious, DEPARTMENTS)
    expect(roster).toHaveLength(3) // 미용1 + 순환기2
    const cardio = roster.filter((d) => d.dept === 'CARDIOLOGY')
    expect(cardio.map((d) => d.id)).toEqual(['doc-CARDIOLOGY-1', 'doc-CARDIOLOGY-2'])
    expect(roster.every((d) => d.name.length >= 2)).toBe(true)
  })

  it('0명 과는 유닛이 없다', () => {
    const roster = materializeRoster(conscientious, DEPARTMENTS)
    expect(roster.some((d) => d.dept === 'CHECKUP')).toBe(false)
  })

  it('결정론 — 같은 선택은 항상 같은 명단(이름 포함)', () => {
    const a = materializeRoster(conscientious, DEPARTMENTS)
    const b = materializeRoster(conscientious, DEPARTMENTS)
    expect(a).toEqual(b)
  })
})

describe('walkinDept — 워크인 라벨로 미용/검진 판별', () => {
  it("'검진' 라벨은 CHECKUP, 그 외는 AESTHETICS", () => {
    expect(walkinDept('검진 패키지 문의')).toBe('CHECKUP')
    expect(walkinDept('보톡스 상담 워크인')).toBe('AESTHETICS')
  })
})

describe('handlingDept — 콜 한 통을 담당 과로', () => {
  it('필수 응급·배후과 예약은 requiredSpecialty 과로, 워크인은 라벨로', () => {
    const q = createCallQueue(1) // 월: [워크인, 순환기 예약, 워크인, 일반응급, STEMI](도착순)
    const stemi = q.find((c) => c.kind === 'STEMI')!
    const elective = q.find((c) => c.kind === 'SPECIALIST_ELECTIVE')!
    expect(handlingDept(stemi)).toBe('CARDIOLOGY')
    expect(handlingDept(elective)).toBe('CARDIOLOGY') // 월요일 예약은 순환기 배치(STEMI와 점유 경쟁)
    // 워크인은 라벨로 과가 갈린다 — 도착순 정렬이라 q[0]이 무엇인지는 고정이 아니므로 라벨로 집는다.
    expect(handlingDept(q.find((c) => c.label.includes('보톡스'))!)).toBe('AESTHETICS')
    expect(handlingDept(q.find((c) => c.label.includes('검진'))!)).toBe('CHECKUP')
  })

  it('고열감염은 내과(INTERNAL_MEDICINE)로 라우팅된다 — requiredSpecialty 권위 출처', () => {
    const q = createCallQueue(1)
    const medical = q.find((c) => c.kind === 'MEDICAL_EMERGENCY')!
    expect(handlingDept(medical)).toBe('INTERNAL_MEDICINE')
  })
})

describe('doctorCaseloads — 받은 콜을 유닛에 분배', () => {
  // 순환기 2명 병원에서 하루를 돌려 STEMI를 받으면 순환기 유닛에 담당이 붙는다.
  const hospital = buildHospital({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 2 } }).hospital
  const roster = materializeRoster({ hospitalName: '양심병원', doctors: { CARDIOLOGY: 2 } }, DEPARTMENTS)

  it('받은 콜만 계상하고 담당 과 유닛에 균등 분배한다', () => {
    let r = initReceiving(hospital, createCallQueue(1)) // 자리 3
    while (!r.done) r = decide(r, r.queue[r.index].kind === 'STEMI' ? 'ACCEPT' : 'DECLINE') // STEMI만 수용
    const { total } = doctorCaseloads(roster, r)
    const per = roster.map((d) => total.get(d.id)!)
    expect(per.reduce((a, b) => a + b, 0)).toBe(1) // 월요일 STEMI 1통(나머지 한 자리는 순환기 예약으로 바뀜)
    expect(Math.max(...per) - Math.min(...per)).toBeLessThanOrEqual(1) // 균등(2명에 1·0)
  })

  it('담당 과에 유닛이 없는 콜은 caseload에 안 붙는다(무배정 가드)', () => {
    // 순환기 유닛만 있는데 외과 응급(급성복증) 수용 로그가 있으면, 외과 유닛이 없어 아무에게도 안 붙는다.
    const abCall: IncomingCall = { id: 'ab', kind: 'ABDOMINAL_EMERGENCY', label: '급성복증', patient: { id: 'a', requiredSpecialty: 'GENERAL_SURGERY', severity: 4 }, lawsuitRisk: true, nightShift: false, arrivalMin: 60, durationMin: 120 }
    const r = { ...initReceiving(hospital, [abCall]), log: [{ callId: 'ab', accepted: true, disposition: 'CHOICE' as const, reason: null }] }
    const { total } = doctorCaseloads(roster, r)
    const sum = roster.map((d) => total.get(d.id)!).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0) // 외과 응급이라 순환기 유닛엔 안 붙는다
  })
})

describe('materializeRoster — hiredIds 지원자 반영', () => {
  const cardio = CANDIDATES.filter((c) => c.dept === 'CARDIOLOGY')
  const vet = cardio.find((c) => c.tier === 'VETERAN')!

  it('채용된 지원자의 이름·speedFactor·candidateId가 명단에 온다', () => {
    const roster = materializeRoster(
      { hospitalName: 'h', doctors: { CARDIOLOGY: 1 }, hiredIds: [vet.id] },
      DEPARTMENTS,
    )
    expect(roster).toHaveLength(1)
    expect(roster[0].name).toBe(vet.name)
    expect(roster[0].speedFactor).toBe(SPEED_OF_TIER.VETERAN)
    expect(roster[0].candidateId).toBe(vet.id)
    expect(roster[0].id).toBe('doc-CARDIOLOGY-1') // id 체계 불변 — busyUntil·피로 키 연속성
  })

  it('카운트가 지원자 수를 넘으면 초과분은 무명(이름 자동 생성·speedFactor 없음)', () => {
    const roster = materializeRoster(
      { hospitalName: 'h', doctors: { CARDIOLOGY: 2 }, hiredIds: [vet.id] },
      DEPARTMENTS,
    )
    expect(roster[0].candidateId).toBe(vet.id)
    expect(roster[1].candidateId).toBeUndefined()
    expect(roster[1].speedFactor).toBeUndefined()
    expect(roster[1].name).not.toBe(vet.name)
  })

  it('hiredIds가 없으면 기존과 동일(하위호환) · 같은 입력 = 같은 명단(결정론)', () => {
    const legacy = { hospitalName: 'h', doctors: { CARDIOLOGY: 2 } }
    expect(materializeRoster(legacy, DEPARTMENTS)).toEqual(materializeRoster(legacy, DEPARTMENTS))
    const withIds = { ...legacy, hiredIds: [vet.id] }
    expect(materializeRoster(withIds, DEPARTMENTS)).toEqual(materializeRoster(withIds, DEPARTMENTS))
  })
})

describe('stepFatigue — 하루 강도 가중 부하로 피로 누적(주 간 유지)', () => {
  const load = (loadMin: [string, number][], nightLoad: [string, number][] = []) => ({
    total: new Map<string, number>(),
    loadMin: new Map(loadMin),
    nightLoad: new Map(nightLoad),
  })

  it('부하가 클수록 더 오른다', () => {
    const next = stepFatigue({}, load([['a', FATIGUE_FREE_MIN + 60], ['b', FATIGUE_FREE_MIN + 120]]))
    expect(next.b).toBeGreaterThan(next.a)
  })

  it('정상 근무(FATIGUE_FREE_MIN 이하)에 야간 0이면 회복만 남는다', () => {
    const next = stepFatigue({ a: 50 }, load([['a', FATIGUE_FREE_MIN]]))
    expect(next.a).toBe(50 - FATIGUE_REST)
  })

  it('야간은 강도에 비례해 가중된다 — 야간 STEMI(2.0)가 저녁 보톡스(0.3)보다 무겁다', () => {
    // 초과 4시간 — 양쪽 클램프(0·FATIGUE_MAX)에서 떨어져 대소가 살아남는다. 1시간이면 초과분(PER 15)이
    // 회복(FATIGUE_REST 20)에 통째로 먹혀 셋 다 0으로 붙는다 — 재튜닝(300/35 → 160/15)으로 드러난 마진이다.
    const over = FATIGUE_FREE_MIN + 240
    const next = stepFatigue({}, load([['a', over], ['b', over], ['c', over]], [['b', 0.3], ['c', 2]]))
    expect(next.b).toBeGreaterThan(next.a)
    expect(next.c).toBeGreaterThan(next.b)
  })

  it('무부하 날은 회복으로 내려간다(0 클램프)', () => {
    const next = stepFatigue({ a: 10 }, load([['a', 0]]))
    expect(next.a).toBe(0)
  })

  it('상한 클램프(FATIGUE_MAX 초과 없음)', () => {
    const next = stepFatigue({ a: 90 }, load([['a', FATIGUE_FREE_MIN * 4]], [['a', 4]]))
    expect(next.a).toBe(FATIGUE_MAX)
  })

  it('이전 값에 누적한다(리셋 아님)', () => {
    const day1 = stepFatigue({}, load([['a', FATIGUE_FREE_MIN + 120]]))
    const day2 = stepFatigue(day1, load([['a', FATIGUE_FREE_MIN + 120]]))
    expect(day2.a).toBeGreaterThan(day1.a)
  })
})

describe('doctorCaseloads — 부하는 시간 × 강도다(F-2)', () => {
  const soloChoices: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1 } }
  const soloHospital = buildHospital(soloChoices).hospital
  const soloRoster = materializeRoster(soloChoices, DEPARTMENTS)
  const stemi: IncomingCall = {
    id: 'c1', kind: 'STEMI', label: '급성심근경색 — 타 병원 전원 요청',
    patient: { id: 'p1', requiredSpecialty: 'CARDIOLOGY', severity: 5 },
    lawsuitRisk: true, nightShift: false, arrivalMin: 60, durationMin: 100,
  }

  const beautyChoices: SetupChoices = { hospitalName: 'h', doctors: { AESTHETICS: 1 } }
  const beautyHospital = buildHospital(beautyChoices).hospital
  const beautyRoster = materializeRoster(beautyChoices, DEPARTMENTS)
  const botox: IncomingCall = {
    id: 'w1', kind: 'COSMETIC_WALKIN', label: '보톡스 상담 워크인',
    patient: { id: 'p2', requiredSpecialty: 'CARDIOLOGY', severity: 1 }, // 명목값(판정 안 함)
    lawsuitRisk: false, nightShift: false, arrivalMin: 60, durationMin: 100,
  }

  it('응급 수술 100분은 강도 2.0이라 부하 200 — 담당 건수는 그대로 1', () => {
    const r = decide(initReceiving(soloHospital, [stemi]), 'ACCEPT')
    const { loadMin, total } = doctorCaseloads(soloRoster, r)
    expect(loadMin.get('doc-CARDIOLOGY-1')).toBe(200)
    expect(total.get('doc-CARDIOLOGY-1')).toBe(1)
  })

  it('같은 100분도 미용 워크인은 0.3이라 부하 30 — 보톡스 1분과 응급 PCI 1분은 같은 무게가 아니다', () => {
    const r = decide(initReceiving(beautyHospital, [botox]), 'ACCEPT')
    const { loadMin } = doctorCaseloads(beautyRoster, r)
    expect(loadMin.get('doc-AESTHETICS-1')).toBe(30)
  })

  it('거절한 콜은 부하가 0이고, 모든 유닛이 0으로 초기화된다', () => {
    const r = decide(initReceiving(soloHospital, [stemi]), 'DECLINE')
    const { loadMin, nightLoad } = doctorCaseloads(soloRoster, r)
    expect(loadMin.get('doc-CARDIOLOGY-1')).toBe(0)
    expect(nightLoad.get('doc-CARDIOLOGY-1')).toBe(0)
  })

  it('야간 콜은 강도만큼 nightLoad에 실린다 — 야간 STEMI 2.0', () => {
    const duoChoices: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 2 } } // 야간 당직은 2명부터
    const duoHospital = buildHospital(duoChoices).hospital
    const duoRoster = materializeRoster(duoChoices, DEPARTMENTS)
    const nightStemi: IncomingCall = { ...stemi, nightShift: true, arrivalMin: 500 }
    const r = decide(initReceiving(duoHospital, [nightStemi]), 'ACCEPT')
    const { nightLoad } = doctorCaseloads(duoRoster, r)
    expect(nightLoad.get('doc-CARDIOLOGY-1')).toBe(2)
  })

  it('피로로 늘어난 점유가 그대로 다음 부하가 된다(악순환)', () => {
    const r = decide(initReceiving(soloHospital, [stemi], {}, { 'doc-CARDIOLOGY-1': 100 }), 'ACCEPT')
    const { loadMin } = doctorCaseloads(soloRoster, r)
    expect(loadMin.get('doc-CARDIOLOGY-1')).toBe(300) // 점유 150분(100 × 1.5) × 강도 2.0
  })
})

describe('fatigueSlowFactor — 피로 → 진료 소요 배율(조용한 침식)', () => {
  it('정상 근무 구간(FATIGUE_SLOW_FROM 이하)은 정확히 1.0 — 무영향', () => {
    expect(fatigueSlowFactor(0)).toBe(1)
    expect(fatigueSlowFactor(FATIGUE_SLOW_FROM)).toBe(1)
  })

  it('레드존 경계에서 ×1.25, 포화에서 ×1.5', () => {
    expect(fatigueSlowFactor(FATIGUE_RED)).toBeCloseTo(1.25, 10)
    expect(fatigueSlowFactor(FATIGUE_MAX)).toBeCloseTo(1.5, 10)
  })

  it('단조증가 — 넘는 순간(임계 벽)이 없다', () => {
    for (let f = 0; f < FATIGUE_MAX; f++) {
      expect(fatigueSlowFactor(f + 1)).toBeGreaterThanOrEqual(fatigueSlowFactor(f))
    }
  })
})

describe('stepSaturatedDays — 포화로 마감한 날만 센다', () => {
  it('마감 피로가 FATIGUE_MAX면 +1', () => {
    expect(stepSaturatedDays({}, { a: FATIGUE_MAX })).toEqual({ a: 1 })
  })

  it('포화 미달은 그대로 — 리셋이 아니다', () => {
    expect(stepSaturatedDays({ a: 3 }, { a: FATIGUE_MAX - 1 })).toEqual({ a: 3 })
    expect(stepSaturatedDays({ a: 3 }, { a: 0 })).toEqual({ a: 3 })
  })

  it('누적한다', () => {
    let s = stepSaturatedDays({}, { a: FATIGUE_MAX })
    s = stepSaturatedDays(s, { a: FATIGUE_MAX })
    expect(s.a).toBe(2)
  })

  it('임계는 1보다 크다(하루 만에 안 떠난다)', () => {
    expect(RESIGN_SATURATED_DAYS).toBeGreaterThan(1)
  })
})

describe('resigningDoctors — 임계를 넘긴 유닛', () => {
  const roster = materializeRoster(
    { hospitalName: 'h', doctors: { CARDIOLOGY: 2, AESTHETICS: 1 } }, DEPARTMENTS,
  )
  const cardio1 = 'doc-CARDIOLOGY-1'
  const cardio2 = 'doc-CARDIOLOGY-2'

  it('임계 미달이면 아무도 안 떠난다', () => {
    expect(resigningDoctors(roster, { [cardio1]: RESIGN_SATURATED_DAYS - 1 })).toEqual([])
  })

  it('임계 도달 유닛만 떠난다', () => {
    const out = resigningDoctors(roster, { [cardio1]: RESIGN_SATURATED_DAYS, [cardio2]: 1 })
    expect(out.map((d) => d.id)).toEqual([cardio1])
  })

  it('여러 명이 동시에 떠날 수 있다', () => {
    const out = resigningDoctors(roster, {
      [cardio1]: RESIGN_SATURATED_DAYS, [cardio2]: RESIGN_SATURATED_DAYS + 3,
    })
    expect(out.map((d) => d.id).sort()).toEqual([cardio1, cardio2])
  })

  it('명단에 없는 키는 무시한다(구 상태 잔재)', () => {
    expect(resigningDoctors(roster, { 'doc-GHOST-9': 99 })).toEqual([])
  })
})

describe('remapDoctorState — id 재번호에도 상태가 사람을 따라간다 [R-4]', () => {
  const before: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 2 } }
  const after: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1 } }
  const oldRoster = materializeRoster(before, DEPARTMENTS)
  const newRoster = materializeRoster(after, DEPARTMENTS)

  it('1번이 떠나면 생존자(옛 2번)가 자기 값을 유지한다 — 사직자 값을 상속하지 않는다', () => {
    const state = { 'doc-CARDIOLOGY-1': 99, 'doc-CARDIOLOGY-2': 7 }
    const survivors = oldRoster.filter((d) => d.id !== 'doc-CARDIOLOGY-1')
    expect(remapDoctorState(survivors, newRoster, state)).toEqual({ 'doc-CARDIOLOGY-1': 7 })
  })

  it('사직자 값은 어디에도 남지 않는다', () => {
    const state = { 'doc-CARDIOLOGY-1': 99, 'doc-CARDIOLOGY-2': 7 }
    const survivors = oldRoster.filter((d) => d.id !== 'doc-CARDIOLOGY-1')
    expect(Object.values(remapDoctorState(survivors, newRoster, state))).not.toContain(99)
  })

  it('과가 여러 개면 서로 섞이지 않는다', () => {
    const b: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 2, AESTHETICS: 2 } }
    const a: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1, AESTHETICS: 2 } }
    const oldR = materializeRoster(b, DEPARTMENTS)
    const newR = materializeRoster(a, DEPARTMENTS)
    const state = {
      'doc-CARDIOLOGY-1': 1, 'doc-CARDIOLOGY-2': 2,
      'doc-AESTHETICS-1': 10, 'doc-AESTHETICS-2': 20,
    }
    const out = remapDoctorState(oldR.filter((d) => d.id !== 'doc-CARDIOLOGY-1'), newR, state)
    expect(out['doc-CARDIOLOGY-1']).toBe(2)
    expect(out['doc-AESTHETICS-1']).toBe(10)
    expect(out['doc-AESTHETICS-2']).toBe(20)
  })

  it('빈 상태는 빈 결과', () => {
    expect(remapDoctorState(oldRoster, newRoster, {})).toEqual({})
  })
})

describe('applyResignations — 명단·풀 델타를 한 번에', () => {
  const cardioCands = CANDIDATES.filter((c) => c.dept === 'CARDIOLOGY').slice(0, 2)
  const choices: SetupChoices = {
    hospitalName: 'h', doctors: { CARDIOLOGY: 2 }, hiredIds: cardioCands.map((c) => c.id),
  }
  const roster = materializeRoster(choices, DEPARTMENTS)

  it('과 인원이 줄고 hiredIds에서 사직자 후보가 빠진다 [R-3]', () => {
    const out = applyResignations(choices, [roster[0]], DEPARTMENTS)
    expect(out.choices.doctors.CARDIOLOGY).toBe(1)
    expect(out.choices.hiredIds).not.toContain(roster[0].candidateId)
    expect(out.choices.hiredIds).toContain(roster[1].candidateId)
    expect(materializeRoster(out.choices, DEPARTMENTS)).toHaveLength(1)
  })

  it('배후과 사직은 poolDelta에 실린다', () => {
    expect(applyResignations(choices, [roster[0]], DEPARTMENTS).poolDelta).toEqual({ CARDIOLOGY: 1 })
  })

  it('수익과 사직은 poolDelta가 비어 있다(풀 개념이 없다)', () => {
    const aes: SetupChoices = { hospitalName: 'h', doctors: { AESTHETICS: 1 } }
    const r = materializeRoster(aes, DEPARTMENTS)
    expect(applyResignations(aes, r, DEPARTMENTS).poolDelta).toEqual({})
  })

  it('사직자가 없으면 choices가 그대로다', () => {
    const out = applyResignations(choices, [], DEPARTMENTS)
    expect(out.choices.doctors.CARDIOLOGY).toBe(2)
    expect(out.poolDelta).toEqual({})
  })

  it('같은 과 2명이 동시에 떠나면 인원이 0이 된다', () => {
    const out = applyResignations(choices, roster, DEPARTMENTS)
    expect(out.choices.doctors.CARDIOLOGY).toBe(0)
    expect(out.poolDelta).toEqual({ CARDIOLOGY: 2 })
    expect(materializeRoster(out.choices, DEPARTMENTS)).toHaveLength(0)
  })
})
