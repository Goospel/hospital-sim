import { describe, it, expect } from 'vitest'
import { lightingAt, DUSK_LEAD_MIN } from './hospitalMap'
import { NIGHT_START_MIN, DAY_LENGTH_MIN } from './daysim'

describe('lightingAt — 시각 → 조명 3단', () => {
  it('개장~석양 전은 DAY', () => {
    expect(lightingAt(0)).toBe('DAY')
    expect(lightingAt(NIGHT_START_MIN - DUSK_LEAD_MIN - 1)).toBe('DAY')
  })

  it('석양 구간은 DUSK (경계 포함)', () => {
    expect(lightingAt(NIGHT_START_MIN - DUSK_LEAD_MIN)).toBe('DUSK')
    expect(lightingAt(NIGHT_START_MIN - 1)).toBe('DUSK')
  })

  it('NIGHT_START_MIN부터 NIGHT — 게임의 야간 판정과 같은 경계선', () => {
    expect(lightingAt(NIGHT_START_MIN)).toBe('NIGHT')
    expect(lightingAt(NIGHT_START_MIN + 300)).toBe('NIGHT')
  })
})

import { compareDeptKeys } from './hospitalMap'
import { DEPARTMENTS } from './setup'
import type { DeptKey } from './types'

describe('compareDeptKeys — 과 표시 순서(필수과 먼저)', () => {
  it('필수과가 수익과보다 앞선다', () => {
    expect(compareDeptKeys('CARDIOLOGY', 'AESTHETICS')).toBeLessThan(0)
    expect(compareDeptKeys('AESTHETICS', 'CARDIOLOGY')).toBeGreaterThan(0)
  })

  it('같은 군 안에서는 DEPARTMENTS 순', () => {
    // DEPARTMENTS: … CARDIOLOGY, THORACIC_SURGERY … → 순환기가 흉부외과보다 앞
    expect(compareDeptKeys('CARDIOLOGY', 'THORACIC_SURGERY')).toBeLessThan(0)
    expect(compareDeptKeys('AESTHETICS', 'CHECKUP')).toBeLessThan(0)
  })

  it('전체 정렬 결과가 고정된다(방 순서 = 명단 순서의 단일 출처)', () => {
    const ordered: DeptKey[] = DEPARTMENTS.map((d) => d.key).sort(compareDeptKeys)
    expect(ordered).toEqual([
      'CARDIOLOGY',
      'THORACIC_SURGERY',
      'OBSTETRICS',
      'NEUROSURGERY',
      'GENERAL_SURGERY',
      'INTERNAL_MEDICINE',
      'AESTHETICS',
      'CHECKUP',
    ])
  })
})

import { deriveMapScene, MAX_WAITING_AVATARS } from './hospitalMap'
import { initReceiving, createCallQueue, decide, type ReceivingState } from './receiving'
import { buildHospital } from './setup'
import type { Hospital, IncomingCall, SetupChoices } from './types'
// ⚠️ NIGHT_START_MIN·DEPARTMENTS는 1-A·1-B 블록에서 이미 import 했다 — 다시 쓰지 않는다(중복 선언 = 타입 에러).

// 순환기 2명(24시간 배후 성립) + 미용 1명. 병상은 개원 기본값(FIXED_BEDS = 3).
const choices: SetupChoices = { hospitalName: '양심병원', doctors: { CARDIOLOGY: 2, AESTHETICS: 1 } }
const hospital: Hospital = buildHospital(choices).hospital
const base = initReceiving(hospital, createCallQueue(1))

describe('deriveMapScene — 방', () => {
  it('안 뽑은 과도 방을 차지한다(빈 방이 보여야 한다)', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.rooms).toHaveLength(DEPARTMENTS.length)
    const neuro = scene.rooms.find((r) => r.dept === 'NEUROSURGERY')!
    expect(neuro.staffed).toBe(false)
    expect(neuro.label).toBe('신경외과')
  })

  it('채용한 과는 staffed', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.rooms.find((r) => r.dept === 'CARDIOLOGY')!.staffed).toBe(true)
    expect(scene.rooms.find((r) => r.dept === 'AESTHETICS')!.staffed).toBe(true)
  })

  it('col은 표시 순서와 같고 0부터 연속이다', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.rooms.map((r) => r.col)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(scene.rooms[0].dept).toBe('CARDIOLOGY') // 필수과 먼저
  })
})

describe('deriveMapScene — 야간 소등', () => {
  it('주간엔 모든 방에 불이 켜져 있다', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.rooms.every((r) => r.lit)).toBe(true)
    expect(scene.lighting).toBe('DAY')
  })

  it('야간엔 24시간 배후과만 켜지고 나머지는 꺼진다', () => {
    const scene = deriveMapScene(base, NIGHT_START_MIN)
    expect(scene.lighting).toBe('NIGHT')
    expect(scene.rooms.find((r) => r.dept === 'CARDIOLOGY')!.lit).toBe(true) // 2명 = 당직 성립
    expect(scene.rooms.find((r) => r.dept === 'AESTHETICS')!.lit).toBe(false) // 수익과는 밤에 안 돈다
    expect(scene.rooms.find((r) => r.dept === 'NEUROSURGERY')!.lit).toBe(false) // 미채용
  })

  it('1명만 뽑은 배후과는 야간에 꺼진다 — 「의사 1명은 24시간을 못 버틴다」', () => {
    const solo = buildHospital({ hospitalName: '1인', doctors: { CARDIOLOGY: 1 } }).hospital
    const scene = deriveMapScene(initReceiving(solo, createCallQueue(1)), NIGHT_START_MIN)
    expect(scene.rooms.find((r) => r.dept === 'CARDIOLOGY')!.lit).toBe(false)
  })
})

describe('deriveMapScene — 의사 위치', () => {
  it('점유 중인 의사는 자기 진료실 안, 자유로운 의사는 복도', () => {
    const doc = hospital.roster![0]
    const r = { ...base, busyUntil: { [doc.id]: 200 } }
    const scene = deriveMapScene(r, 100)
    const a = scene.avatars.find((v) => v.id === doc.id)!
    expect(a.kind).toBe('DOCTOR')
    expect(a.zone).toBe('ROOM')
    expect(a.dept).toBe(doc.dept)
    expect(a.busy).toBe(true)

    const others = scene.avatars.filter((v) => v.kind === 'DOCTOR' && v.id !== doc.id)
    expect(others.every((v) => v.zone === 'CORRIDOR' && !v.busy)).toBe(true)
  })

  it('경계값 busyUntil === atMin 은 자유 쪽(freeDoctorsOfDept와 같은 부등호)', () => {
    const doc = hospital.roster![0]
    const scene = deriveMapScene({ ...base, busyUntil: { [doc.id]: 100 } }, 100)
    expect(scene.avatars.find((v) => v.id === doc.id)!.zone).toBe('CORRIDOR')
  })

  it('atMin이 전진하면 진료가 끝난 의사가 스스로 복도로 나온다(빨리감기의 근거)', () => {
    const doc = hospital.roster![0]
    const r = { ...base, busyUntil: { [doc.id]: 200 } }
    expect(deriveMapScene(r, 150).avatars.find((v) => v.id === doc.id)!.zone).toBe('ROOM')
    expect(deriveMapScene(r, 250).avatars.find((v) => v.id === doc.id)!.zone).toBe('CORRIDOR')
  })

  it('같은 방의 두 의사는 서로 다른 slot을 받는다', () => {
    const [d1, d2] = hospital.roster!.filter((d) => d.dept === 'CARDIOLOGY')
    const scene = deriveMapScene({ ...base, busyUntil: { [d1.id]: 200, [d2.id]: 200 } }, 100)
    const slots = scene.avatars.filter((v) => v.kind === 'DOCTOR' && v.zone === 'ROOM').map((v) => v.slot)
    expect([...slots].sort()).toEqual([0, 1])
  })
})

describe('deriveMapScene — 병상', () => {
  it('빈 침대도 칸이 남는다(길이 === hospital.beds)', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.beds).toHaveLength(hospital.beds)
    expect(scene.beds.every((b) => b.occupantDoctorId === undefined)).toBe(true)
    expect(scene.beds.map((b) => b.index)).toEqual([0, 1, 2])
  })

  it('진료 중인 의사 1명 = 침대 위 환자 1명', () => {
    const [d1, d2] = hospital.roster!.filter((d) => d.dept === 'CARDIOLOGY')
    const scene = deriveMapScene({ ...base, busyUntil: { [d1.id]: 200, [d2.id]: 200 } }, 100)
    const occupied = scene.beds.filter((b) => b.occupantDoctorId !== undefined)
    expect(occupied).toHaveLength(2)
    expect(occupied.map((b) => b.occupantDoctorId).sort()).toEqual([d1.id, d2.id].sort())

    // waiting을 뺀다 — 이 계약은 '진료 중인 환자'에 대한 것이고, 대기 환자는 별개 축이다.
    const patients = scene.avatars.filter((v) => v.kind === 'PATIENT' && !v.waiting)
    expect(patients).toHaveLength(2)
    expect(patients.every((v) => v.zone === 'BED')).toBe(true)
  })

  it('점유가 병상을 넘으면 초과분 환자는 복도에서 대기한다(침대 칸 수는 고정)', () => {
    const many = buildHospital(
      { hospitalName: '만원', doctors: { CARDIOLOGY: 3, AESTHETICS: 3 } },
      DEPARTMENTS,
      3, // beds
    ).hospital
    const busyAll = Object.fromEntries(many.roster!.map((d) => [d.id, 500]))
    const scene = deriveMapScene({ ...initReceiving(many, createCallQueue(1)), busyUntil: busyAll }, 100)
    expect(scene.beds).toHaveLength(3)
    expect(scene.beds.filter((b) => b.occupantDoctorId).length).toBe(3)
    const patients = scene.avatars.filter((v) => v.kind === 'PATIENT' && !v.waiting)
    expect(patients).toHaveLength(6) // 진료 중 의사 6명 = 환자 6명
    expect(patients.filter((v) => v.zone === 'CORRIDOR')).toHaveLength(3) // 초과분
  })

  it('퇴원 — 담당의 busyUntil을 지난 시각에서 그 침대가 빈다', () => {
    const d1 = hospital.roster!.find((d) => d.dept === 'CARDIOLOGY')!
    const r = { ...base, busyUntil: { [d1.id]: 200 } }
    expect(deriveMapScene(r, 150).beds.filter((b) => b.occupantDoctorId).length).toBe(1)
    expect(deriveMapScene(r, 250).beds.filter((b) => b.occupantDoctorId).length).toBe(0)
  })

  it('하드락·거절 콜은 침대를 만들지 않는다(busyUntil이 안 생긴다)', () => {
    // 월요일 콜 = [미용 워크인, 순환기 예약, 검진 워크인, 고열감염, STEMI].
    // 신경외과 1명만 뽑으면 이 중 어느 것도 그 의사에게 안 붙고, STEMI는 NO_BACKUP_CARE로 하드락된다.
    // 하루를 전부 '수용'으로 돌려도 점유가 0이라 침대가 끝까지 빈다 — log를 안 봐도 거절이 자동 제외된다.
    const noCardio = buildHospital({ hospitalName: '무순환기', doctors: { NEUROSURGERY: 1 } }).hospital
    let r = initReceiving(noCardio, createCallQueue(1))
    const stemi = r.queue.find((c) => c.kind === 'STEMI')!
    while (!r.done) r = decide(r, true)
    const scene = deriveMapScene(r, stemi.arrivalMin!)
    expect(scene.beds.every((b) => b.occupantDoctorId === undefined)).toBe(true)
    expect(scene.avatars.filter((v) => v.kind === 'PATIENT')).toHaveLength(0)
  })
})

describe('deriveMapScene — 견고성 · 결정론', () => {
  it('roster 없는 구형 병원도 던지지 않고 아바타 0으로 반환한다', () => {
    const legacy: Hospital = {
      id: 'legacy', name: '구형', beds: 3, hasErOnCall: true, overcrowded: false, backupCare: [],
    }
    const scene = deriveMapScene(initReceiving(legacy, createCallQueue(1)), 0)
    expect(scene.avatars).toHaveLength(0)
    expect(scene.rooms).toHaveLength(DEPARTMENTS.length)
    expect(scene.rooms.every((r) => !r.staffed)).toBe(true)
  })

  it('같은 입력은 항상 같은 장면(깊은 동일)', () => {
    const d1 = hospital.roster![0]
    const r = { ...base, busyUntil: { [d1.id]: 300 } }
    expect(deriveMapScene(r, 120)).toEqual(deriveMapScene(r, 120))
  })

  it('clockMin은 요청한 시각을 그대로 싣는다(receiving.clockMin이 아니다)', () => {
    expect(deriveMapScene(base, 240).clockMin).toBe(240)
  })
})

import { sweepMinutes, flowDurationMs, flowStepCount, dayEndMin, MS_PER_GAME_MIN, CLOCK_TICK_MS } from './hospitalMap'

describe('sweepMinutes — 콜 사이 시각열', () => {
  it('마지막은 항상 목표 시각이고 개수는 steps다', () => {
    const seq = sweepMinutes(100, 220, 12)
    expect(seq).toHaveLength(12)
    expect(seq[seq.length - 1]).toBe(220)
  })

  it('단조 증가하고 출발 시각을 넘어선다(from은 포함하지 않는다)', () => {
    const seq = sweepMinutes(100, 220, 4)
    expect(seq[0]).toBeGreaterThan(100)
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1])
  })

  it('구간이 없거나(같은 시각·되감기) steps가 1 이하면 목표 하나만 — 즉시 점프', () => {
    expect(sweepMinutes(200, 200, 12)).toEqual([200])
    expect(sweepMinutes(300, 200, 12)).toEqual([200])
    expect(sweepMinutes(100, 220, 1)).toEqual([220]) // prefers-reduced-motion 경로
  })
})

describe('flowDurationMs — 게임 시간에 정비례(캡 없음)', () => {
  it('콜 사이 120분은 6초다', () => {
    expect(flowDurationMs(0, 120)).toBe(6000)
  })

  it('하루 600분을 그대로 재생하면 30초 — 긴 구간이 캡에 잘리지 않는다', () => {
    expect(flowDurationMs(0, DAY_LENGTH_MIN)).toBe(DAY_LENGTH_MIN * MS_PER_GAME_MIN)
  })

  it('되감기·0구간은 0ms', () => {
    expect(flowDurationMs(200, 200)).toBe(0)
    expect(flowDurationMs(300, 200)).toBe(0)
  })
})

describe('flowStepCount — 프레임 수', () => {
  it('100ms 틱마다 2게임분', () => {
    expect(CLOCK_TICK_MS / MS_PER_GAME_MIN).toBe(2)
    expect(flowStepCount(0, 120)).toBe(60)
  })

  it('아무리 짧아도 1프레임(0으로 나뉘지 않는다)', () => {
    expect(flowStepCount(0, 1)).toBe(1)
    expect(flowStepCount(200, 200)).toBe(1)
    expect(flowStepCount(300, 200)).toBe(1)
  })

  it('중복 프레임 불변식 — 어떤 구간에서도 같은 분이 두 번 나오지 않는다', () => {
    // steps > 구간분이면 sweepMinutes의 반올림이 같은 분을 반복해 무변화 프레임이 생긴다.
    // MS_PER_GAME_MIN(50) < CLOCK_TICK_MS(100)이라 steps ≈ 구간분/2 로 구조적으로 상한 아래다.
    for (let span = 1; span <= 800; span++) {
      const seq = sweepMinutes(0, span, flowStepCount(0, span))
      expect(new Set(seq).size, `구간 ${span}분에서 중복 프레임`).toBe(seq.length)
    }
  })
})

describe('dayEndMin — 하루가 실제로 끝나는 시각', () => {
  it('아무도 안 바쁘면 마감 시각', () => {
    expect(dayEndMin({})).toBe(DAY_LENGTH_MIN)
  })

  it('마감 전에 다 끝났으면 마감 시각 — 앞당기지 않는다', () => {
    expect(dayEndMin({ a: 300, b: 599 })).toBe(DAY_LENGTH_MIN)
  })

  it('마감을 넘겨 진료 중이면 그 종료 시각까지 — 19시가 하루의 끝이 아니다', () => {
    expect(dayEndMin({ a: 750, b: 300 })).toBe(750)
  })
})

describe('lightingAt — 마감을 넘긴 시각', () => {
  it('19시를 넘긴 시각도 밤이다(진료가 남아 있어도)', () => {
    expect(lightingAt(DAY_LENGTH_MIN + 150)).toBe('NIGHT')
  })
})

import { wanderTiming } from './hospitalMap'

describe('wanderTiming — 유휴 배회 박자', () => {
  it('같은 id는 항상 같은 박자(RNG 0 — Math.random 금지)', () => {
    expect(wanderTiming('doc-CARDIOLOGY-1')).toEqual(wanderTiming('doc-CARDIOLOGY-1'))
  })

  it('다른 id는 박자가 갈린다 — 전원이 같은 박자면 기계로 보인다', () => {
    const ids = ['doc-CARDIOLOGY-1', 'doc-CARDIOLOGY-2', 'doc-AESTHETICS-1', 'pat-doc-CARDIOLOGY-1']
    const beats = ids.map((id) => {
      const t = wanderTiming(id)
      return `${t.delayMs}/${t.durationMs}`
    })
    expect(new Set(beats).size).toBe(ids.length)
  })

  it('지연 0~2초, 주기 2.6~4.2초 안에 있다', () => {
    for (const id of ['', 'a', 'doc-CARDIOLOGY-1', 'pat-doc-AESTHETICS-3']) {
      const { delayMs, durationMs } = wanderTiming(id)
      expect(delayMs).toBeGreaterThanOrEqual(0)
      expect(delayMs).toBeLessThan(2000)
      expect(durationMs).toBeGreaterThanOrEqual(2600)
      expect(durationMs).toBeLessThan(4200)
    }
  })
})

import { ambientWalkers } from './hospitalMap'

describe('ambientWalkers — 배경 보행자(순수 장식)', () => {
  it('주간 5 · 석양 2 · 야간 0 — 밤에 텅 비는 것과 소등이 같은 출처다', () => {
    expect(ambientWalkers('DAY')).toHaveLength(5)
    expect(ambientWalkers('DUSK')).toHaveLength(2)
    expect(ambientWalkers('NIGHT')).toHaveLength(0)
  })

  it('같은 조명은 항상 같은 목록(RNG 0)', () => {
    expect(ambientWalkers('DAY')).toEqual(ambientWalkers('DAY'))
  })

  it('id가 고유하고, 인원이 줄어도 남는 사람은 key를 유지한다(리마운트로 걸음이 끊기지 않게)', () => {
    const day = ambientWalkers('DAY')
    expect(new Set(day.map((w) => w.id)).size).toBe(day.length)
    expect(ambientWalkers('DUSK').map((w) => w.id)).toEqual(day.slice(0, 2).map((w) => w.id))
  })

  it('lane은 복도 3줄 안(0|1|2)이고 지연·주기가 범위 안', () => {
    for (const w of ambientWalkers('DAY')) {
      expect([0, 1, 2]).toContain(w.lane)
      expect(w.delayMs).toBeGreaterThanOrEqual(0)
      expect(w.delayMs).toBeLessThan(8000)
      expect(w.durationMs).toBeGreaterThanOrEqual(9000)
      expect(w.durationMs).toBeLessThan(16000)
    }
  })
})

/*
  대기 환자 — 북적임의 시각화(2026-07-23). 이전까지 맵에 뜨는 환자는 '진료 중인 의사 수'가
  상한이라(의사 3명이면 환자 최대 3명) 병원이 구조적으로 북적일 수 없었다. 이제 도착했지만
  아직 진료를 시작하지 못한 사람이 복도에 선다. 새 게임 상태는 0개 — log에서 파생만 한다.
*/
describe('deriveMapScene — 대기 환자(복도에 쌓인다)', () => {
  const solo: SetupChoices = { hospitalName: '한칸병원', doctors: { CARDIOLOGY: 1 } }
  const soloHospital: Hospital = buildHospital(solo).hospital
  const stemi = (id: string, arrivalMin: number, durationMin = 120): IncomingCall => ({
    id, kind: 'STEMI', label: 'STEMI', patient: { id: 's', requiredSpecialty: 'CARDIOLOGY', severity: 5 },
    lawsuitRisk: true, nightShift: false, arrivalMin, durationMin,
  })
  const waitingCount = (s: ReceivingState, atMin: number) =>
    deriveMapScene(s, atMin).avatars.filter((a) => a.kind === 'PATIENT' && a.waiting).length

  it('도착 전에는 아무도 없다', () => {
    const s = initReceiving(soloHospital, [stemi('c1', 100)])
    expect(waitingCount(s, 50)).toBe(0)
  })

  it('도착했는데 아직 처리 전이면 대기 중으로 선다', () => {
    const s = initReceiving(soloHospital, [stemi('c1', 100)])
    expect(waitingCount(s, 100)).toBe(1)
  })

  it('진료가 시작되면 대기에서 빠진다 — 두 번 세지 않는다', () => {
    const after = decide(initReceiving(soloHospital, [stemi('c1', 100)]), true)
    expect(waitingCount(after, 150)).toBe(0)
  })

  it('앞사람 때문에 기다리는 사람이 복도에 쌓인다', () => {
    // 순환기 1명. 100분 도착분이 220분까지 점유 → 110·120분 도착분은 그때까지 대기한다.
    const q = [stemi('c1', 100), stemi('c2', 110), stemi('c3', 120)]
    let s = initReceiving(soloHospital, q)
    for (let i = 0; i < 3; i++) s = decide(s, true)
    expect(waitingCount(s, 150)).toBe(2) // c2·c3이 서 있다
  })

  it('표시 상한을 넘으면 아바타는 자르고 넘친 인원수를 남긴다(복도 폭은 유한하다)', () => {
    const q = Array.from({ length: 20 }, (_, i) => stemi(`c${i}`, 100 + i))
    let s = initReceiving(soloHospital, q)
    for (let i = 0; i < q.length; i++) s = decide(s, true)
    const scene = deriveMapScene(s, 130)
    expect(scene.avatars.filter((a) => a.waiting).length).toBeLessThanOrEqual(MAX_WAITING_AVATARS)
    expect(scene.waitingOverflow).toBeGreaterThan(0)
  })
})
