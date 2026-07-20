import { describe, it, expect } from 'vitest'
import { materializeRoster, walkinDept, handlingDept, doctorCaseloads, stepFatigue, FATIGUE_MAX } from './doctor'
import { createCallQueue, decide, initReceiving } from './receiving'
import { buildHospital, DEPARTMENTS } from './setup'
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
    expect(handlingDept(q[0])).toBe('AESTHETICS') // 보톡스 워크인(첫 도착)
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
    while (!r.done) r = decide(r, r.queue[r.index].kind === 'STEMI') // STEMI만 수용
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

describe('stepFatigue — 하루 담당으로 피로 누적(주 간 유지)', () => {
  const cl = (total: [string, number][], night: [string, number][] = []) => ({
    total: new Map(total),
    night: new Map(night),
  })

  it('담당이 많을수록 더 오른다', () => {
    const next = stepFatigue({}, cl([['a', 1], ['b', 3]]))
    expect(next.b).toBeGreaterThan(next.a)
  })

  it('야간 담당은 가중된다(같은 건수라도 야간이 더 높다)', () => {
    const next = stepFatigue({}, cl([['a', 1], ['b', 1]], [['b', 1]]))
    expect(next.b).toBeGreaterThan(next.a)
  })

  it('무부하 날은 회복으로 내려간다(0 클램프)', () => {
    const next = stepFatigue({ a: 30 }, cl([['a', 0]]))
    expect(next.a).toBeLessThan(30)
    expect(next.a).toBeGreaterThanOrEqual(0)
  })

  it('상한 클램프(FATIGUE_MAX 초과 없음)', () => {
    const next = stepFatigue({ a: 90 }, cl([['a', 3]], [['a', 3]]))
    expect(next.a).toBeLessThanOrEqual(FATIGUE_MAX)
  })

  it('이전 값에 누적한다(리셋 아님)', () => {
    const day1 = stepFatigue({}, cl([['a', 2]]))
    const day2 = stepFatigue(day1, cl([['a', 2]]))
    expect(day2.a).toBeGreaterThan(day1.a)
  })
})
