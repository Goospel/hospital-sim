import { describe, it, expect } from 'vitest'
import {
  createCallQueue, hardlockReason, initReceiving, decide, runningNetProfit,
  dayProgress, accruedSegments, CALL_ECONOMICS, callDelta,
  WORKUP_ECONOMICS, workupDelta, canOrderWorkup, isElective, isAutoAccept, requiresBackupCare, carriesLawsuitRisk,
  BACKUP_CARE_KINDS, outpatientForBeds, needsDecision, unacceptedGroups,
} from './receiving'
import type { ReceivingState } from './receiving'
import { buildHospital, DAYS_PER_WEEK, DEPARTMENTS, FIXED_BEDS } from './setup'
import type { CallKind, DeptKey, Doctor, Hospital, IncomingCall, SetupChoices } from './types'
import { DAY_LENGTH_MIN, NIGHT_START_MIN, patienceMin } from './daysim'

describe('무게 술어 분리 — requiresBackupCare / carriesLawsuitRisk', () => {
  it('두 술어는 기존 필수 응급 4종에 대해 참이다(리팩터 기준선)', () => {
    for (const k of ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY'] as const) {
      expect(requiresBackupCare(k)).toBe(true)
      expect(carriesLawsuitRisk(k)).toBe(true)
    }
  })
  it('선택진료·미용은 두 술어 모두 거짓이다', () => {
    for (const k of ['COSMETIC_WALKIN', 'SPECIALIST_ELECTIVE'] as const) {
      expect(requiresBackupCare(k)).toBe(false)
      expect(carriesLawsuitRisk(k)).toBe(false)
    }
  })
})

describe('급성복증(ABDOMINAL_EMERGENCY) — 외과 배후·소송+신문', () => {
  const noSurgery: Hospital = { id: 'p', name: 'x', beds: 3, hasErOnCall: true, overcrowded: false, backupCare: [], roundTheClockBackup: [], roster: [] }
  const abCall: IncomingCall = { id: 'c', kind: 'ABDOMINAL_EMERGENCY', label: '급성복증', patient: { id: 'a', requiredSpecialty: 'GENERAL_SURGERY', severity: 4 }, lawsuitRisk: true, nightShift: false, arrivalMin: 60, durationMin: 120 }

  it('외과 배후를 요구하고 소송·신문 대상이다(인과 선명)', () => {
    expect(requiresBackupCare('ABDOMINAL_EMERGENCY')).toBe(true)
    expect(carriesLawsuitRisk('ABDOMINAL_EMERGENCY')).toBe(true)
  })
  it('외과 배후가 없으면 NO_BACKUP_CARE 벽이다', () => {
    expect(hardlockReason(noSurgery, abCall, {}, [])).toBe('NO_BACKUP_CARE')
  })
  it('델타는 수술·처치 밴드(850/1000, STEMI 동형)다', () => {
    expect(callDelta('ABDOMINAL_EMERGENCY')).toBe(850 - 1000)
  })
})

describe('고열감염(MEDICAL_EMERGENCY) — 내과 배후·신문만(소송 X, 비대칭)', () => {
  const noInternal: Hospital = { id: 'p', name: 'x', beds: 3, hasErOnCall: true, overcrowded: false, backupCare: [], roundTheClockBackup: [], roster: [] }
  const meCall: IncomingCall = { id: 'c', kind: 'MEDICAL_EMERGENCY', label: '고열', patient: { id: 'm', requiredSpecialty: 'INTERNAL_MEDICINE', severity: 3 }, lawsuitRisk: false, nightShift: false, arrivalMin: 60, durationMin: 60 }

  it('내과 배후·신문 대상이되 소송은 안 쌓는다(방어 성공 전형)', () => {
    expect(requiresBackupCare('MEDICAL_EMERGENCY')).toBe(true)
    expect(carriesLawsuitRisk('MEDICAL_EMERGENCY')).toBe(false) // 급성복증과 다른 지점
  })
  it('내과 배후가 없으면 NO_BACKUP_CARE 벽이다', () => {
    expect(hardlockReason(noInternal, meCall, {}, [])).toBe('NO_BACKUP_CARE')
  })
  it('델타는 급여 원가미달 밴드(190/380)다', () => {
    expect(callDelta('MEDICAL_EMERGENCY')).toBe(190 - 380)
  })
})

describe('GENERAL_EMERGENCY 제거 — 세분 응급이 대체', () => {
  it('큐 어느 날에도 GENERAL_EMERGENCY는 없다', () => {
    for (let day = 1; day <= 7; day++) {
      for (const c of createCallQueue(day)) {
        expect(c.kind).not.toBe('GENERAL_EMERGENCY')
      }
    }
  })
  it('수용된 급성복증은 담당 외과 의사를 점유한다(GENERAL 특례 가드 제거)', () => {
    const roster: Doctor[] = [{ id: 'doc-GENERAL_SURGERY-1', name: '김외과', dept: 'GENERAL_SURGERY' }]
    const hospital: Hospital = { id: 'p', name: 'x', beds: 3, hasErOnCall: true, overcrowded: false, backupCare: ['GENERAL_SURGERY'], roundTheClockBackup: ['GENERAL_SURGERY'], roster }
    const call: IncomingCall = { id: 'c', kind: 'ABDOMINAL_EMERGENCY', label: '급성복증', patient: { id: 'a', requiredSpecialty: 'GENERAL_SURGERY', severity: 4 }, lawsuitRisk: true, nightShift: false, arrivalMin: 60, durationMin: 120 }
    const next = decide(initReceiving(hospital, [call]), 'ACCEPT')
    expect(next.busyUntil['doc-GENERAL_SURGERY-1']).toBe(180) // 60 + 120 점유
  })
})

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

function hospitalOf(c: SetupChoices): Hospital {
  return buildHospital(c).hospital
}

/** 한 과만 n명 채운 병원 — 배후과 유무·인원별 판정을 검증하는 픽스처. */
function hospitalWith(dept: DeptKey, n: number): Hospital {
  return buildHospital({ hospitalName: '테스트', doctors: { [dept]: n } as SetupChoices['doctors'] }).hospital
}

/**
 * 옛 자동 판정과 동등한 드레인 — 응급은 받고(구조가 판정), 선택진료는 보낸다.
 *
 * 응급이 플레이어 결정이 된 뒤로 `decide(s, 'DECLINE')` 루프는 "응급까지 전부 보낸다"가 됐다.
 * 하루를 그냥 흘려보내려는 테스트는 그 의미를 원한 적이 없어, 옛 동작을 이 헬퍼 한 곳에 고정한다.
 */
function drainAuto(s: ReceivingState): ReceivingState {
  while (!s.done) s = decide(s, isElective(s.queue[s.index].kind) ? 'DECLINE' : 'ACCEPT')
  return s
}

/** 병원의 개인 유닛 명단 — hardlockReason·decide가 점유 판정에 쓰는 로스터. */
function rosterOf(h: Hospital): Doctor[] {
  return h.roster ?? []
}

/** 한 주 큐 어디에든 있는 그 종류의 콜 한 통(없으면 예외 = 도달성 실패). nightShift로 시간대를 덮어쓴다. */
function dayCall(kind: CallKind, nightShift?: boolean): IncomingCall {
  for (let d = 1; d <= DAYS_PER_WEEK; d++) {
    const c = createCallQueue(d).find((x) => x.kind === kind)
    if (c) return nightShift === undefined ? c : { ...c, nightShift }
  }
  throw new Error(`no ${kind} call in week`)
}

/** 필수 응급 4종 ↔ 배후과 — 다양화의 핵심 매핑. */
const CRITICAL: { kind: CallKind; dept: DeptKey }[] = [
  { kind: 'STEMI', dept: 'CARDIOLOGY' },
  { kind: 'OBSTETRIC_EMERGENCY', dept: 'OBSTETRICS' },
  { kind: 'NEURO_EMERGENCY', dept: 'NEUROSURGERY' },
  { kind: 'TRAUMA_EMERGENCY', dept: 'GENERAL_SURGERY' },
]

/**
 * 콜당 수가/원가 — 설계 스펙 §3.2·§7 (2026-07-17-essential-care-economics-devices-design.md).
 *
 * ⚠️ 금액이 아니라 **부호와 대소만** 잠근다. PR #35의 −525억이 테스트 372개를 전부 통과한 이유가
 * "각색값을 스펙에 박고 테스트는 부호만 봤다"가 아니라 **아무도 스케일을 안 봐서**였다 —
 * 그래서 여기선 부호·대소·원가보전율 밴드를 잠그고, 스케일(I8)은 브라우저 7일 완주로 잡는다.
 *
 * 🔴 부호는 **행위 단위 표 하나**에서만 뽑는다(§2.6). 과 단위(심장내과 117%·응급의학과 103%)를
 * 여기 섞으면 정반대 부호가 나온다 — 초안이 정확히 그렇게 틀렸다(T-039). 과 단위 흑자는
 * 입력이 아니라 플레이어가 검사를 붙였을 때 **장부에서 창발**한다(F2).
 */
describe('CALL_ECONOMICS — 가격을 누가 정하는가', () => {
  it('가격 결정자: 미용만 병원(비급여), 나머지는 정부 고시(급여)', () => {
    expect(CALL_ECONOMICS.COSMETIC_WALKIN.priceSetter).toBe('HOSPITAL')
    expect(CALL_ECONOMICS.MEDICAL_EMERGENCY.priceSetter).toBe('GOVERNMENT')
    expect(CALL_ECONOMICS.STEMI.priceSetter).toBe('GOVERNMENT')
  })

  it('내역은 항상 수익 − 원가 = 델타로 닫힌다', () => {
    for (const kind of ['COSMETIC_WALKIN', 'MEDICAL_EMERGENCY', 'STEMI'] as CallKind[]) {
      const e = CALL_ECONOMICS[kind]
      expect(e.revenueManwon - e.costManwon).toBe(callDelta(kind))
      expect(e.costManwon).toBeGreaterThan(0) // 공짜로 보는 환자는 없다
    }
  })

  it('[I1] 고열감염 콜 델타 < 0 — 기본진료 50.5% / 응급의료수가 45.0%', () => {
    expect(callDelta('MEDICAL_EMERGENCY')).toBeLessThan(0)
  })

  it('[I3] STEMI 콜 델타 < 0, 단 |STEMI| < |고열감염| — 수술·처치 84.9% > 기본진료 50.5%', () => {
    expect(callDelta('STEMI')).toBeLessThan(0)
    expect(Math.abs(callDelta('STEMI'))).toBeLessThan(Math.abs(callDelta('MEDICAL_EMERGENCY')))
  })

  /*
    이 계약은 2026-07-23에 **0에서 되돌아왔다.** 하루 55통이 되면서 부문 손익과 콜 델타가 같은
    진료를 세는 이중 계상이 표면화됐고(T-069), 임시로 이 콜을 0으로 눌렀었다. 근본 처방은
    반대쪽 — 부문 손익을 고정비로 뒤집어 **수익을 이 층 하나로 모으는 것** — 이었고, 그러고 나니
    이 값이 되살아날 자리가 생겼다. 다시 0이 되면 미용 흑자의 출처가 사라진다.
  */
  it('미용 워크인 콜 델타 > 0 — 미용 흑자의 유일한 출처다', () => {
    expect(callDelta('COSMETIC_WALKIN')).toBeGreaterThan(0)
  })

  /**
   * 부호가 우연이 아니라 근거에서 나왔음을 잠근다 — 급여 콜의 수익/원가 비율이 곧 원가보전율이다.
   * 밴드가 넓은 건 금액이 각색이기 때문이고, 좁히면 각색값을 테스트에 박는 게 된다.
   */
  it('급여 콜의 원가보전율이 행위 유형 근거 밴드 안 — STEMI(84.9%)가 고열감염(50.5%)보다 높다', () => {
    const recovery = (k: CallKind) => CALL_ECONOMICS[k].revenueManwon / CALL_ECONOMICS[k].costManwon
    expect(recovery('MEDICAL_EMERGENCY')).toBeGreaterThan(0.4)
    expect(recovery('MEDICAL_EMERGENCY')).toBeLessThan(0.6)
    expect(recovery('STEMI')).toBeGreaterThan(0.75)
    expect(recovery('STEMI')).toBeLessThan(0.95)
    expect(recovery('STEMI')).toBeGreaterThan(recovery('MEDICAL_EMERGENCY'))
    expect(recovery('COSMETIC_WALKIN')).toBeCloseTo(2, 1) // 비급여 200% — 가격을 병원이 정한다
  })

  it('고열감염 수용은 오늘 진료 수익을 깎는다 — 받을수록 장부가 나빠진다', () => {
    const medical = createCallQueue().find((c) => c.kind === 'MEDICAL_EMERGENCY')!
    const s = initReceiving(hospitalWith('INTERNAL_MEDICINE', 2), [{ ...medical, nightShift: false }])
    const after = decide(s, 'ACCEPT')
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaManwon).toBeLessThan(0)
  })
})

describe('SPECIALIST_ELECTIVE (배후과 예약진료)', () => {
  it('선택진료로 분류(미용과 함께)', () => {
    expect(isElective('SPECIALIST_ELECTIVE')).toBe(true)
    expect(isElective('COSMETIC_WALKIN')).toBe(true)
    expect(isElective('STEMI')).toBe(false)
    expect(isElective('MEDICAL_EMERGENCY')).toBe(false)
  })
  it('흑자(delta > 0) — 배후과가 응급에 못 가는 이유는 돈 되는 예약이다', () => {
    expect(callDelta('SPECIALIST_ELECTIVE')).toBeGreaterThan(0)
  })
  it('CALL_ECONOMICS에 항목이 있다(부호 흑자)', () => {
    const e = CALL_ECONOMICS.SPECIALIST_ELECTIVE
    expect(e.revenueManwon).toBeGreaterThan(e.costManwon)
  })
})

describe('isAutoAccept (묻지 않고 받는 콜)', () => {
  it('워크인(보톡스·검진)만 자동 접수', () => {
    expect(isAutoAccept('COSMETIC_WALKIN')).toBe(true)
  })
  it('배후과 예약은 자동이 아니다 — 같은 의사를 응급과 두고 다투는 유일한 선택이라 플레이어가 정한다', () => {
    expect(isAutoAccept('SPECIALIST_ELECTIVE')).toBe(false)
  })
  it('응급은 자동 접수 대상이 아니다 — decide가 이미 action을 무시하고 판정한다', () => {
    for (const kind of BACKUP_CARE_KINDS) {
      expect(isAutoAccept(kind)).toBe(false)
    }
  })
  it('자동 접수는 선택진료의 부분집합 — 응급 판정 경로를 건드리지 않는다', () => {
    for (const kind of Object.keys(CALL_ECONOMICS) as CallKind[]) {
      if (isAutoAccept(kind)) expect(isElective(kind)).toBe(true)
    }
  })
})

describe('needsDecision — 응급도 흐름을 멈추고 묻는다 (스펙 2026-07-24 §2)', () => {
  it('응급 6종 전부 true', () => {
    for (const kind of BACKUP_CARE_KINDS) {
      expect(needsDecision(dayCall(kind))).toBe(true)
    }
  })
  it('워크인은 여전히 자동(false), 배후과 예약은 여전히 결정(true)', () => {
    expect(needsDecision(dayCall('COSMETIC_WALKIN'))).toBe(false)
    expect(needsDecision(dayCall('SPECIALIST_ELECTIVE'))).toBe(true)
  })
})

describe('createCallQueue (시간 큐)', () => {
  it('각 콜에 arrivalMin·durationMin이 붙고 도착순 정렬', () => {
    const q = createCallQueue(1)
    for (const c of q) {
      expect(c.arrivalMin).toBeGreaterThanOrEqual(0)
      expect(c.durationMin).toBeGreaterThan(0)
    }
    const times = q.map((c) => c.arrivalMin)
    expect([...times]).toEqual([...times].sort((a, b) => a! - b!))
  })
  it('결정론 — 같은 day는 항상 같은 큐(arrivalMin·durationMin 포함)', () => {
    expect(createCallQueue(3)).toEqual(createCallQueue(3))
  })
  it('nightShift는 arrivalMin ≥ NIGHT_START_MIN에서 파생', () => {
    const q = createCallQueue(1)
    for (const c of q) expect(c.nightShift).toBe(c.arrivalMin! >= NIGHT_START_MIN)
  })
  it('선택진료(미용·배후과 예약)와 응급이 섞여 있다', () => {
    const q = createCallQueue(1)
    expect(q.some((c) => isElective(c.kind))).toBe(true)
    expect(q.some((c) => !isElective(c.kind))).toBe(true)
  })
  it('선택진료 중 배후과 예약(SPECIALIST_ELECTIVE)이 실제로 큐에 있다', () => {
    const days = Array.from({ length: DAYS_PER_WEEK }, (_, i) => createCallQueue(i + 1))
    expect(days.some((q) => q.some((c) => c.kind === 'SPECIALIST_ELECTIVE'))).toBe(true)
  })
})

/**
 * 야간 당직 — 배후진료가 '있냐/없냐'가 아니라 '몇 시냐'가 된다(T-042·F1b).
 *
 * 순환기 1명은 24시간을 못 버틴다. 그래서 2번째 의사가 사는 건 처리량이 아니라 **시간대**다 —
 * 밤에 오는 STEMI를 받을 수 있느냐. 이게 없으면 2명째는 손익만 −12 깎는 순수 함정이었다.
 */
describe('야간 콜 — 시간대는 arrivalMin(도착시각)에서 파생(RNG 0)', () => {
  it('야간 배지는 도착시각 경계와 일치하고, 밤에도 사람이 온다 — 결정론', () => {
    // 균등 슬롯을 버리면서(콜 제한 폐지) '마지막 1통만 야간'은 더 이상 참이 아니다.
    // 계약은 '몇 통이냐'가 아니라 '경계와 일치하느냐 + 밤이 비지 않느냐'로 옮겼다.
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      const q = createCallQueue(day)
      for (const c of q) expect(c.nightShift).toBe(c.arrivalMin! >= NIGHT_START_MIN)
      expect(q.some((c) => c.nightShift)).toBe(true)
    }
    // 같은 day는 항상 같은 큐
    expect(createCallQueue(3).map((c) => c.nightShift)).toEqual(createCallQueue(3).map((c) => c.nightShift))
  })

  it('[도달성] 주간 큐에 야간 STEMI가 최소 하루는 온다 — 없으면 이 장치가 죽은 코드다', () => {
    const nightStemiDays = Array.from({ length: DAYS_PER_WEEK }, (_, i) => createCallQueue(i + 1)).filter((q) =>
      q.some((c) => c.kind === 'STEMI' && c.nightShift),
    )
    expect(nightStemiDays.length).toBeGreaterThan(0)
  })

  it('[도달성] 주간 STEMI도 최소 하루는 온다 — 순환기 1명이 뭔가는 받을 수 있어야 한다', () => {
    const dayStemiDays = Array.from({ length: DAYS_PER_WEEK }, (_, i) => createCallQueue(i + 1)).filter((q) =>
      q.some((c) => c.kind === 'STEMI' && !c.nightShift),
    )
    expect(dayStemiDays.length).toBeGreaterThan(0)
  })
})

describe('hardlockReason — 야간 배후진료', () => {
  const solo: Hospital = hospitalOf({ hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 1 } })
  const roundTheClock: Hospital = hospitalOf(conscientious) // 순환기 2
  const nightStemi = () => ({ ...createCallQueue(1).find((c) => c.kind === 'STEMI')!, nightShift: true })
  const dayStemi = () => ({ ...createCallQueue(1).find((c) => c.kind === 'STEMI')!, nightShift: false })

  it('순환기 1명 + 주간 STEMI(자유) → 받는다', () => {
    expect(hardlockReason(solo, dayStemi(), {}, rosterOf(solo))).toBeNull()
  })

  /**
   * 야간 공백은 **배후과 부재와 다른 사유**다 — 이 병원엔 순환기가 있다. 밤에 없을 뿐이다.
   * 같은 태그를 쓰면 대사가 "저희도 순환기 시술팀이 없습니다"가 되어, 30억을 내고 순환기를 뽑은
   * 플레이어에게 게임이 거짓말을 한다. 현실에서도 이 둘은 다른 사유고, 수용곤란 고지의 최대 증가분이
   * '인력부족'(1년 새 2.3배)이라 오히려 이쪽이 지배적이다(stemi-factsheet.md:19).
   */
  it('순환기 1명 + 야간 STEMI → NO_NIGHT_BACKUP (과는 있는데 당직이 비었다)', () => {
    expect(hardlockReason(solo, nightStemi(), {}, rosterOf(solo))).toBe('NO_NIGHT_BACKUP')
  })

  it('순환기 0명 + 야간 STEMI → NO_BACKUP_CARE — 과가 아예 없는 것과 구분된다', () => {
    const noCardio = hospitalOf(collaborator)
    expect(hardlockReason(noCardio, nightStemi(), {}, rosterOf(noCardio))).toBe('NO_BACKUP_CARE')
  })

  it('순환기 2명 + 야간 STEMI(자유) → 받는다 — 2번째 의사가 사는 게 이것이다', () => {
    expect(hardlockReason(roundTheClock, nightStemi(), {}, rosterOf(roundTheClock))).toBeNull()
  })

  it('미용·검진(선택진료)은 야간이어도 배후 판정을 받지 않는다 — 배후진료가 필요한 건 배후과 응급뿐', () => {
    const nightWalkin = { ...createCallQueue(1).find((c) => c.kind === 'COSMETIC_WALKIN')!, nightShift: true }
    expect(hardlockReason(solo, nightWalkin, {}, rosterOf(solo))).toBeNull()
  })
})

/**
 * 검사(WORKUP) 경제 상수 — 급여 환자의 부호를 뒤집는 유일 항목(검체 160.5% 밴드).
 *
 * Task 5는 플레이어의 검사 액션(withWorkup)을 제거했다 — 검사 흑자는 SPECIALIST_ELECTIVE가 계승한다.
 * 그래도 이 상수·헬퍼는 후속(완전 정리 Task)까지 보존하므로 부호·밴드를 계속 잠근다.
 */
describe('검사(WORKUP) 경제 상수 — 보존(부호·밴드)', () => {
  it('검사는 급여(정부 고시)이고 원가보전율이 검체 160.5% 밴드 안 — 유일하게 원가를 넘는 급여 항목', () => {
    expect(WORKUP_ECONOMICS.priceSetter).toBe('GOVERNMENT')
    const recovery = WORKUP_ECONOMICS.revenueManwon / WORKUP_ECONOMICS.costManwon
    expect(recovery).toBeGreaterThan(1.5)
    expect(recovery).toBeLessThan(1.8)
    expect(workupDelta()).toBeGreaterThan(0)
  })

  it('[I2] 고열감염 + 검사 > 0 — 검사가 부호를 뒤집는다', () => {
    expect(callDelta('MEDICAL_EMERGENCY')).toBeLessThan(0)
    expect(callDelta('MEDICAL_EMERGENCY') + workupDelta()).toBeGreaterThan(0)
  })

  it('[I2] STEMI + 검사 > 0 — 과 단위 117%가 여기서 창발한다(입력이 아니다)', () => {
    expect(callDelta('STEMI')).toBeLessThan(0)
    expect(callDelta('STEMI') + workupDelta()).toBeGreaterThan(0)
  })

  it('미용은 비급여라 검사 대상이 아니다 — 가격을 병원이 정하니 메꿀 게 없다', () => {
    expect(canOrderWorkup('COSMETIC_WALKIN')).toBe(false)
    expect(canOrderWorkup('MEDICAL_EMERGENCY')).toBe(true)
    expect(canOrderWorkup('STEMI')).toBe(true)
  })
})

/**
 * 점유 벽 (NO_FREE_SPECIALIST) — 벽이 병상(총량)에서 **전문의 점유(시간)**로 바뀐다.
 *
 * 그 과가 있어도(NO_BACKUP_CARE 아님), 당직이 서 있어도(NO_NIGHT_BACKUP 아님), 그 과 의사가
 * 지금 다른 진료로 다 차 있으면 못 받는다. 배후과 예약(SPECIALIST_ELECTIVE)이 그 의사를 점유해
 * 같은 날 같은 과 응급과 실제로 경쟁하는 것이 이 사유의 형상화다.
 */
describe('점유 벽 (NO_FREE_SPECIALIST)', () => {
  const solo = hospitalWith('CARDIOLOGY', 1) // 순환기 1명 — 자유/점유로 벽을 만든다
  const dayStemi = () => ({ ...dayCall('STEMI'), nightShift: false })

  /*
    점유 벽의 계약이 바뀌었다(2026-07-23) — 이제 **기다린다**. 잠깐 바쁜 건 벽이 아니고,
    한계를 넘겨야 벽이다. 그래서 같은 "다 진료 중"이 대기 길이에 따라 두 결과로 갈린다.
  */
  it('잠깐 바쁘면 벽이 아니다 — 기다렸다 받는다', () => {
    const call = dayStemi()
    const roster = rosterOf(solo)
    const busy = { [roster[0].id]: (call.arrivalMin ?? 0) + 1 } // 1분 뒤 자유
    expect(hardlockReason(solo, call, busy, roster)).toBeNull()
  })

  it('대기 한계를 넘기면 LEFT_WAITING — 자리는 났지만 늦었다', () => {
    const call = dayStemi()
    const roster = rosterOf(solo)
    const busy = { [roster[0].id]: (call.arrivalMin ?? 0) + patienceMin('STEMI') + 1 }
    expect(hardlockReason(solo, call, busy, roster)).toBe('LEFT_WAITING')
  })

  it('그 과 자유 의사가 있으면 통과(null)', () => {
    expect(hardlockReason(solo, dayStemi(), {}, rosterOf(solo))).toBeNull()
  })

  it('그 과 자체가 미채용이면 NO_BACKUP_CARE(기존 판정 유지 — 점유 벽보다 먼저 걸린다)', () => {
    const noCardio = hospitalOf(collaborator)
    expect(hardlockReason(noCardio, dayStemi(), {}, rosterOf(noCardio))).toBe('NO_BACKUP_CARE')
  })

  it('야간 콜은 당직 2인 규칙(roundTheClockBackup)이 점유 벽보다 먼저 — 1명이면 NO_NIGHT_BACKUP', () => {
    const nightStemi = { ...dayCall('STEMI'), nightShift: true }
    expect(hardlockReason(solo, nightStemi, {}, rosterOf(solo))).toBe('NO_NIGHT_BACKUP')
    const two = hospitalWith('CARDIOLOGY', 2)
    expect(hardlockReason(two, nightStemi, {}, rosterOf(two))).toBeNull()
  })

  it('네 종류 필수 응급 모두 그 과 의사가 한계 넘게 점유되면 LEFT_WAITING', () => {
    for (const { kind, dept } of CRITICAL) {
      const h = hospitalWith(dept, 1)
      const call = { ...dayCall(kind), nightShift: false }
      const roster = rosterOf(h)
      const busy = { [roster[0].id]: (call.arrivalMin ?? 0) + patienceMin(kind) + 1 }
      expect(hardlockReason(h, call, busy, roster)).toBe('LEFT_WAITING')
      expect(hardlockReason(h, call, {}, roster)).toBeNull() // 자유면 통과
    }
  })
})

describe('decide (시간 점유) — 응급 ACCEPT / 선택 점유', () => {
  it('응급 수용 시 담당 의사 busyUntil = arrivalMin + durationMin', () => {
    const h = hospitalOf(conscientious) // 순환기 2
    const stemi = { ...dayCall('STEMI'), nightShift: false }
    const after = decide(initReceiving(h, [stemi]), 'ACCEPT')
    expect(after.log[0].accepted).toBe(true)
    expect(Object.values(after.busyUntil)).toContain((stemi.arrivalMin ?? 0) + (stemi.durationMin ?? 0))
  })

  it('응급 ACCEPT — 자유 의사 있으면 수용, 없으면 벽(ACCEPT로도 못 뚫는다)', () => {
    const stemi = { ...dayCall('STEMI'), nightShift: false }
    const cardio = hospitalOf(conscientious) // 자유 순환기 → 수용
    expect(decide(initReceiving(cardio, [stemi]), 'ACCEPT').log[0].accepted).toBe(true)
    const noCardio = hospitalOf(collaborator) // 배후 없음 → 벽(수용 시도해도 못 받음)
    expect(decide(initReceiving(noCardio, [stemi]), 'ACCEPT').log[0].accepted).toBe(false)
  })

  it('선택진료 수용 시 그 과 의사 점유 + 흑자 누적', () => {
    const h = hospitalOf(conscientious) // 순환기 2 — 월요일 예약은 순환기 배치
    const elective = dayCall('SPECIALIST_ELECTIVE')
    const after = decide(initReceiving(h, [elective]), 'ACCEPT')
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaManwon).toBe(callDelta('SPECIALIST_ELECTIVE')) // 흑자 누적
    expect(Object.keys(after.busyUntil)).toHaveLength(1) // 그 과 의사 1명 점유
  })

  it('선택진료 스킵 시 의사 자유 유지, 수익 0', () => {
    const h = hospitalOf(conscientious)
    const elective = dayCall('SPECIALIST_ELECTIVE')
    const after = decide(initReceiving(h, [elective]), 'DECLINE')
    expect(after.log[0].accepted).toBe(false)
    expect(after.netProfitDeltaManwon).toBe(0)
    expect(after.busyUntil).toEqual({})
  })

  it('선택진료는 그 과 자유 의사가 없으면 action이 ACCEPT여도 미수용(하드락 아님)', () => {
    const noCardio = hospitalOf(collaborator) // 순환기 0 — 월요일 순환기 예약은 담당 의사가 없다
    const elective = dayCall('SPECIALIST_ELECTIVE')
    const after = decide(initReceiving(noCardio, [elective]), 'ACCEPT')
    expect(after.log[0].accepted).toBe(false)
    expect(after.log[0].disposition).toBe('CHOICE') // 구조가 막은 게 아니라 담당이 없어 못 받음
    expect(after.log[0].reason).toBeNull()
  })

  it('clockMin은 현재 콜 arrivalMin으로 전진', () => {
    const q = createCallQueue(1)
    const s = initReceiving(hospitalOf(conscientious), q)
    expect(s.clockMin).toBe(0)
    expect(decide(s, 'DECLINE').clockMin).toBe(q[0].arrivalMin)
  })

  it('원본 불변 — decide는 입력 state의 busyUntil을 변형하지 않는다', () => {
    const h = hospitalOf(conscientious)
    const s = initReceiving(h, [{ ...dayCall('STEMI'), nightShift: false }])
    decide(s, 'ACCEPT')
    expect(s.busyUntil).toEqual({}) // 원본은 그대로
    expect(s.clockMin).toBe(0)
  })
})

describe('응급 결정권 — 플레이어가 직접 받고 보낸다 (스펙 2026-07-24 §2)', () => {
  const dayStemi = () => ({ ...dayCall('STEMI'), nightShift: false })

  it('응급 DECLINE — 하드락이 없어도 내가 보낼 수 있다(자발 거절)', () => {
    const h = hospitalOf(conscientious) // 순환기 2 — 받을 수 있는 병원
    const after = decide(initReceiving(h, [dayStemi()]), 'DECLINE')
    expect(after.log[0].accepted).toBe(false)
    expect(after.log[0].disposition).toBe('CHOICE') // 구조가 막은 게 아니다
    expect(after.log[0].reason).toBeNull() // 내가 보냈다 — 사유를 지어내지 않는다
    expect(after.busyUntil).toEqual({}) // 아무도 점유되지 않는다
  })

  it('응급 TIMEOUT — 응답 없음(UNANSWERED)으로 기록된다', () => {
    const h = hospitalOf(conscientious)
    const after = decide(initReceiving(h, [dayStemi()]), 'TIMEOUT')
    expect(after.log[0].accepted).toBe(false)
    expect(after.log[0].reason).toBe('UNANSWERED')
  })

  it('하드락 응급은 액션 불문 하드락 거절 — TIMEOUT이어도 사유는 구조가 진실', () => {
    const noCardio = hospitalOf(collaborator) // 순환기 0 → NO_BACKUP_CARE
    for (const action of ['ACCEPT', 'DECLINE', 'TIMEOUT'] as const) {
      const after = decide(initReceiving(noCardio, [dayStemi()]), action)
      expect(after.log[0].accepted).toBe(false)
      expect(after.log[0].disposition).toBe('HARDLOCK_REJECT')
      expect(after.log[0].reason).toBe('NO_BACKUP_CARE')
    }
  })

  it('응급 ACCEPT는 기존 자동 수용과 동일 — 자유 의사 점유·적자 누적', () => {
    const h = hospitalOf(conscientious)
    const stemi = dayStemi()
    const after = decide(initReceiving(h, [stemi]), 'ACCEPT')
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaManwon).toBe(callDelta('STEMI'))
    expect(Object.values(after.busyUntil)).toContain((stemi.arrivalMin ?? 0) + (stemi.durationMin ?? 0))
  })

  it('마감 목록 — UNANSWERED는 「응답 없음」으로 접힌다', () => {
    const h = hospitalOf(conscientious)
    const after = decide(initReceiving(h, [dayStemi()]), 'TIMEOUT')
    expect(unacceptedGroups(after)[0].outcome).toBe('응답 없음')
  })
})

describe('세분 응급 점유 — 급성복증·고열감염은 담당 과 의사를 점유한다(설계 B)', () => {
  it('자유 외과의가 있으면 급성복증 수용이 그 의사를 점유한다(설계 A 폐기 — 이제 점유함)', () => {
    const h = hospitalWith('GENERAL_SURGERY', 2) // 야간 당직까지 커버
    const roster = rosterOf(h)
    const ab = dayCall('ABDOMINAL_EMERGENCY', false)
    const after = decide(initReceiving(h, [ab]), 'ACCEPT')
    expect(after.log[0].accepted).toBe(true)
    expect(after.busyUntil[roster[0].id]).toBe((ab.arrivalMin ?? 0) + (ab.durationMin ?? 0)) // 점유함
  })

  it('대조군 — 중증외상도 같은 외과의를 점유한다(필수응급 점유 보존)', () => {
    const h = hospitalWith('GENERAL_SURGERY', 2)
    const roster = rosterOf(h)
    const trauma = dayCall('TRAUMA_EMERGENCY', false)
    const after = decide(initReceiving(h, [trauma]), 'ACCEPT')
    expect(after.log[0].accepted).toBe(true)
    expect(after.busyUntil[roster[0].id]).toBe((trauma.arrivalMin ?? 0) + (trauma.durationMin ?? 0))
  })
})

describe('dayProgress — 시간 기반(clockMin / DAY_LENGTH_MIN)', () => {
  it('진행 중엔 clockMin / DAY_LENGTH_MIN', () => {
    const q = createCallQueue(1)
    const s = decide(initReceiving(hospitalOf(conscientious), q), 'DECLINE') // 1통 처리, 미완
    expect(s.done).toBe(false)
    expect(dayProgress(s)).toBeCloseTo((q[0].arrivalMin ?? 0) / DAY_LENGTH_MIN)
  })

  it('콜 시작(clockMin 0)엔 0', () => {
    expect(dayProgress(initReceiving(hospitalOf(collaborator)))).toBe(0)
  })

  it('완료(done)엔 1 — 7일 완주 시 주간 전액 도달 등식을 보존한다', () => {
    const s = drainAuto(initReceiving(hospitalOf(collaborator), createCallQueue(1)))
    expect(dayProgress(s)).toBe(1)
  })

  it('빈 큐(콜 없음)는 하루 완료로 보아 1', () => {
    expect(dayProgress(initReceiving(hospitalOf(collaborator), []))).toBe(1)
  })
})

describe('createCallQueue — 하루치 도착 흐름(결정론)', () => {
  it('STEMI·워크인·고열감염을 모두 포함', () => {
    const q = createCallQueue()
    const kinds = new Set(q.map((c) => c.kind))
    expect(kinds).toContain('STEMI')
    expect(kinds).toContain('COSMETIC_WALKIN')
    expect(kinds).toContain('MEDICAL_EMERGENCY')
    expect(q.every((c) => c.id)).toBe(true)
  })

  it('STEMI 콜은 lawsuitRisk=true, 워크인은 false', () => {
    const q = createCallQueue()
    expect(q.filter((c) => c.kind === 'STEMI').every((c) => c.lawsuitRisk)).toBe(true)
    expect(q.filter((c) => c.kind === 'COSMETIC_WALKIN').every((c) => !c.lawsuitRisk)).toBe(true)
  })

  it('결정론 — 같은 큐', () => {
    expect(createCallQueue()).toEqual(createCallQueue())
  })
})

describe('하드락 vs 선택 — hardlockReason의 null 여부가 곧 disposition', () => {
  const q = createCallQueue()
  const stemi = { ...q.find((c) => c.kind === 'STEMI')!, nightShift: false }
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const collab = hospitalOf(collaborator)
  const consc = hospitalOf(conscientious)

  it('워크인은 선택진료라 하드락 없음(사유 없음 = CHOICE)', () => {
    expect(hardlockReason(collab, walkin, {}, rosterOf(collab))).toBeNull()
  })

  it('STEMI: 순환기 없으면 하드락(사유 있음), 있으면 선택(사유 없음)', () => {
    expect(hardlockReason(collab, stemi, {}, rosterOf(collab))).not.toBeNull()
    expect(hardlockReason(consc, stemi, {}, rosterOf(consc))).toBeNull()
  })

})

describe('자격 벽 — 배후과 유무(자리/총량이 아니라 자격)', () => {
  const q = createCallQueue()
  const stemi = { ...q.find((c) => c.kind === 'STEMI')!, nightShift: false }
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const collab = hospitalOf(collaborator)
  const consc = hospitalOf(conscientious)

  it('순환기가 없으면 STEMI는 NO_BACKUP_CARE — 다른 벽으로 못 메운다', () => {
    expect(hardlockReason(collab, stemi, {}, rosterOf(collab))).toBe('NO_BACKUP_CARE')
  })

  it('받을 수 있는 콜은 사유가 없다(null)', () => {
    expect(hardlockReason(collab, walkin, {}, rosterOf(collab))).toBeNull()
    expect(hardlockReason(consc, stemi, {}, rosterOf(consc))).toBeNull()
  })

  it('로그가 하드락 사유를 기록한다 — 왜 못 받았는지가 남는다', () => {
    const s = initReceiving(collab, [walkin, stemi])
    expect(decide(s, 'ACCEPT').log[0].reason).toBeNull() // 받은 콜엔 사유가 없다
    expect(decide(s, 'DECLINE').log[0].reason).toBeNull() // 내가 거절한 것도 '못 받은' 게 아니다
    const blocked = decide(decide(s, 'ACCEPT'), 'ACCEPT') // 2번째 = STEMI, 순환기 없음
    expect(blocked.log[1].reason).toBe('NO_BACKUP_CARE')
  })
})

describe('decide 리듀서 — 장부·소송 누적', () => {
  it('워크인 수용 → 진료 수익 +, 소송 노출 0', () => {
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const s = initReceiving(hospitalOf(collaborator), [walkin])
    const after = decide(s, 'ACCEPT')
    expect(after.netProfitDeltaManwon).toBe(callDelta('COSMETIC_WALKIN'))
    expect(after.lawsuitExposure).toBe(0)
    expect(after.done).toBe(true)
    expect(s.index).toBe(0) // 원본 불변 — decide는 입력 state를 변형하지 않는다
  })

  it('STEMI 하드락 콜은 action이 ACCEPT여도 수용 안 됨(가드) — 델타·노출 불변', () => {
    const stemi = createCallQueue().find((c) => c.kind === 'STEMI')!
    const s = initReceiving(hospitalOf(collaborator), [stemi]) // 순환기 없음 → 하드락
    const after = decide(s, 'ACCEPT')
    expect(after.log[0].disposition).toBe('HARDLOCK_REJECT')
    expect(after.log[0].accepted).toBe(false)
    expect(after.netProfitDeltaManwon).toBe(0)
    expect(after.lawsuitExposure).toBe(0)
  })

  it('양심 병원의 STEMI 수용 → 적자 델타 + 소송 노출 +1', () => {
    const stemi = createCallQueue().find((c) => c.kind === 'STEMI')!
    const s = initReceiving(hospitalOf(conscientious), [stemi])
    const after = decide(s, 'ACCEPT')
    expect(after.log[0].disposition).toBe('CHOICE')
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaManwon).toBeLessThan(0)
    expect(after.lawsuitExposure).toBe(1)
  })

  it('선택 콜 거절 → 델타·노출 불변, 인덱스 전진', () => {
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const s = initReceiving(hospitalOf(collaborator), [walkin])
    const after = decide(s, 'DECLINE')
    expect(after.netProfitDeltaManwon).toBe(0)
    expect(after.index).toBe(1)
    expect(after.done).toBe(true)
  })

  it('전체 큐 소진 시 done, 이후 decide는 에러', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = s.queue.length; i > 0; i--) s = decide(s, 'DECLINE')
    expect(s.done).toBe(true)
    expect(() => decide(s, 'DECLINE')).toThrow()
  })
})

describe('runningNetProfit — 러닝 순이익(소송 비용 제외, 1막 한정)', () => {
  function stateWith(
    segments: { label: string; profitManwon: number }[] | undefined,
    netProfitDeltaManwon: number,
  ): ReceivingState {
    const hospital: Hospital = {
      id: 'test',
      name: '테스트병원',
      beds: 2,
      hasErOnCall: true,
      overcrowded: false,
      backupCare: [],
      economics: segments === undefined ? undefined : { segments, hires: [], essentialHires: 0 },
    }
    return { ...initReceiving(hospital, []), netProfitDeltaManwon }
  }

  it('양수 — 부문 손익 오늘치(1/7) 합 + 오늘 델타', () => {
    const s = stateWith(
      [
        { label: 'A', profitManwon: 70 }, // 주간 → 하루 10
        { label: 'B', profitManwon: 35 }, // 주간 → 하루 5
      ],
      3,
    )
    expect(runningNetProfit(s)).toBe(18) // 10 + 5 + 3
  })

  it('음수 — 부문 손익 합이 음수여도 그대로 더한다', () => {
    const s = stateWith([{ label: 'A', profitManwon: -140 }], -4) // 주간 −140 → 하루 −20
    expect(runningNetProfit(s)).toBe(-24)
  })

  it('segments 없음(economics undefined) — 오늘 델타만', () => {
    const s = stateWith(undefined, 7)
    expect(runningNetProfit(s)).toBe(7)
  })
})

describe('accruedSegments — 부문 손익의 오늘치를 진행률만큼 0에서 누적', () => {
  // collaborator = 미용 3명(고정비 560×3 → −1,680) + 검진 2명(630×2 → −1,260). **이번 주 7일 전체** 고정비다.
  // 하루치 = 1/7 (미용 −240 · 검진 −180). 고정비가 7의 배수라 나눗셈이 딱 떨어진다(setup.ts 주석).
  it('콜 시작(clockMin 0)엔 전 부문 0(진료 전인데 이미 벌지 않는다)', () => {
    const s = initReceiving(hospitalOf(collaborator))
    expect(accruedSegments(s).every((x) => x.profitManwon === 0)).toBe(true)
  })

  it('하루 완료(done)엔 주간 고정비의 1/7에 도달 — 전액이 아니다', () => {
    const s = drainAuto(initReceiving(hospitalOf(collaborator)))
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitManwon).toBe(-240) // −1,680 / 7
    expect(accruedSegments(s).find((x) => x.label === '건강검진')!.profitManwon).toBe(-180) // −1,260 / 7
  })

  it('진행 중엔 clockMin 진행률만큼 비례 누적(반올림)', () => {
    const s = decide(initReceiving(hospitalOf(collaborator)), 'DECLINE') // 1통 처리, 미완
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitManwon).toBe(Math.round((-1680 / DAYS_PER_WEEK) * (s.clockMin / DAY_LENGTH_MIN)))
  })

  it('7일치를 합하면 주간 전액에 도달 — 결말 장부(composeLedger 전액)와 어긋나지 않는다', () => {
    const s = drainAuto(initReceiving(hospitalOf(collaborator)))
    // 고정비가 7의 배수라 **모든 과에서** 딱 떨어진다 — 옛 값은 미용(210)만 우연히 맞았다.
    for (const seg of accruedSegments(s)) {
      const weekly = hospitalOf(collaborator).economics!.segments.find((w) => w.label === seg.label)!
      expect(seg.profitManwon * DAYS_PER_WEEK).toBe(weekly.profitManwon)
    }
  })
})

describe('runningNetProfit — 오늘 순이익(부문 손익 오늘치 + 오늘 진료 수익)', () => {
  it('콜 시작(clockMin 0)엔 러닝 순이익이 0에서 출발(정적 선반영 제거)', () => {
    const s = initReceiving(hospitalOf(collaborator)) // 주간 합 290이지만 진행률 0
    expect(runningNetProfit(s)).toBe(0)
  })

  it('하루 완료(선택진료 전부 거절)엔 부문 손익 오늘치 합 + 수용된 응급 델타', () => {
    // 응급을 받는 드레인이라 '선택진료 전부 거절'이 델타 0을 뜻하지 않는다 — 받을 수 있는 응급은 받아진다.
    const s = drainAuto(initReceiving(hospitalOf(collaborator)))
    const structural = accruedSegments(s).reduce((n, x) => n + x.profitManwon, 0)
    expect(structural).toBe(-420) // 미용 −240 + 검진 −180
    expect(runningNetProfit(s)).toBe(structural + s.netProfitDeltaManwon)
  })
})

describe('createCallQueue(day) — 요일별 큐(결정론)', () => {
  it('7일 모두 같은 날은 항상 같은 큐(결정론)', () => {
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      expect(createCallQueue(day)).toEqual(createCallQueue(day))
    }
  })

  it('콜 id가 날짜별로 고유하다 — 로그·React key 충돌 방지', () => {
    const all = Array.from({ length: DAYS_PER_WEEK }, (_, i) => createCallQueue(i + 1)).flatMap((q) => q.map((c) => c.id))
    expect(new Set(all).size).toBe(all.length)
  })

  it('날마다 콜 구성이 같지는 않다 — 7일이 같은 하루의 반복이면 지루하다', () => {
    const kindsOf = (day: number) => createCallQueue(day).map((c) => c.kind).join(',')
    expect(new Set(Array.from({ length: DAYS_PER_WEEK }, (_, i) => kindsOf(i + 1))).size).toBeGreaterThan(1)
  })

  it('라벨↔대사 정합 — 같은 kind가 여러 번 나오면 라벨 풀을 고루 쓴다', () => {
    // callerPleaAt이 kind 내 등장 순번을 seed로 쓰므로(PR #29), 라벨도 같은 순번 규칙을 따라야 한다.
    // 워크인이 하루 12통이 되면서 라벨 풀(2종)보다 많아졌다 — '인접한 둘이 다르다'는 성립할 수 없다.
    // 계약은 '풀을 전부 쓰는가'로 옮긴다(순번 규칙이 죽으면 한 라벨만 나온다).
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      const walkins = createCallQueue(day).filter((c) => c.kind === 'COSMETIC_WALKIN')
      if (walkins.length >= 2) expect(new Set(walkins.map((c) => c.label)).size).toBe(2)
    }
  })

  it('모든 날에 필수 응급이 있다 — 필수의료를 외면할 기회가 매일 온다(STEMI 전용 아님)', () => {
    const CRITICAL_KINDS: CallKind[] = ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY']
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      expect(createCallQueue(day).some((c) => CRITICAL_KINDS.includes(c.kind))).toBe(true)
    }
  })
})

describe('SPECIALIST_ELECTIVE 라벨 — 과 정합(오표기 방지)', () => {
  it('라벨이 그 예약의 실제 대상 과를 반영한다 — 다른 과 용어로 오표기하지 않는다', () => {
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      const elective = createCallQueue(day).find((c) => c.kind === 'SPECIALIST_ELECTIVE')
      if (!elective) continue
      const deptLabel = DEPARTMENTS.find((d) => d.key === elective.patient.requiredSpecialty)!.label
      expect(elective.label).toContain(deptLabel)
    }
  })

  it('화요일(신경외과 예약) 라벨은 "심장"을 포함하지 않는다 — 브라우저 실측 회귀(과 오표기 버그)', () => {
    const tue = createCallQueue(2).find((c) => c.kind === 'SPECIALIST_ELECTIVE')!
    expect(tue.patient.requiredSpecialty).toBe('NEUROSURGERY')
    expect(tue.label).not.toContain('심장')
    expect(tue.label).toContain('신경외과')
  })
})

describe('응급 다양화 — 4종 필수 응급이 각 배후과를 요구한다(슬라이스 B)', () => {
  it('네 종류 모두 한 주 큐에 등장한다 — 다양화가 실제로 콜에 반영', () => {
    const kinds = new Set(
      Array.from({ length: DAYS_PER_WEEK }, (_, i) => createCallQueue(i + 1)).flatMap((q) => q.map((c) => c.kind)),
    )
    for (const { kind } of CRITICAL) expect(kinds.has(kind)).toBe(true)
  })

  it('배후과 없으면 NO_BACKUP_CARE, 있으면(2명·자유) 받는다 — adjudicate 제네릭 재사용(판정 무변경)', () => {
    const noBackup = hospitalOf(collaborator) // 미용/검진만 — 어떤 배후과도 없다
    for (const { kind, dept } of CRITICAL) {
      const day = { ...dayCall(kind), nightShift: false }
      expect(hardlockReason(noBackup, day, {}, rosterOf(noBackup))).toBe('NO_BACKUP_CARE')
      const h = hospitalWith(dept, 2)
      expect(hardlockReason(h, day, {}, rosterOf(h))).toBeNull()
    }
  })

  it('배후과 1명 + 야간 → NO_NIGHT_BACKUP (과는 있는데 당직이 빈다), 2명이면 받는다', () => {
    for (const { kind, dept } of CRITICAL) {
      const night = { ...dayCall(kind), nightShift: true }
      const one = hospitalWith(dept, 1)
      const two = hospitalWith(dept, 2)
      expect(hardlockReason(one, night, {}, rosterOf(one))).toBe('NO_NIGHT_BACKUP')
      expect(hardlockReason(two, night, {}, rosterOf(two))).toBeNull()
    }
  })

  it('네 종류 모두 콜 델타 < 0, 원가보전율 수술·처치 밴드(0.75~0.95), 급여라 검사 대상', () => {
    for (const { kind } of CRITICAL) {
      expect(callDelta(kind)).toBeLessThan(0)
      const e = CALL_ECONOMICS[kind]
      const recovery = e.revenueManwon / e.costManwon
      expect(recovery).toBeGreaterThan(0.75)
      expect(recovery).toBeLessThan(0.95)
      expect(canOrderWorkup(kind)).toBe(true)
    }
  })

  /**
   * 세 신규 응급의 콜 경제는 STEMI와 **동형**이다 — 과별 차등(산부 61%·소청 79% 등 과 단위)을
   * 콜 델타(행위 단위)에 섞으면 T-039 함정이다. "산부가 더 밑진다"는 재정중립 패키지가 만든
   * DEPARTMENTS 층(산부 −16)이 담당하지, 콜 델타가 아니다.
   */
  it('세 신규 응급의 콜 델타는 STEMI와 동일 — 과별 차등은 콜 델타에 섞지 않는다', () => {
    for (const { kind } of CRITICAL) expect(callDelta(kind)).toBe(callDelta('STEMI'))
  })

  it('네 종류 모두 lawsuitRisk=true(필수·고위험), 고열감염·워크인은 false', () => {
    for (const { kind } of CRITICAL) expect(dayCall(kind).lawsuitRisk).toBe(true)
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      const q = createCallQueue(d)
      expect(q.filter((c) => c.kind === 'MEDICAL_EMERGENCY').every((c) => !c.lawsuitRisk)).toBe(true)
      expect(q.filter((c) => c.kind === 'COSMETIC_WALKIN').every((c) => !c.lawsuitRisk)).toBe(true)
    }
  })
})

describe('DAY_PLANS — 4종 응급 분산(재구성)', () => {
  const CRITICAL_KINDS: CallKind[] = ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY']
  const criticalCount = (day: number) => createCallQueue(day).filter((c) => CRITICAL_KINDS.includes(c.kind)).length

  it('뒤로 갈수록 필수 응급 밀도가 는다 — 후반 3일 합 > 전반 3일 합', () => {
    const front = criticalCount(1) + criticalCount(2) + criticalCount(3)
    const back = criticalCount(5) + criticalCount(6) + criticalCount(7)
    expect(back).toBeGreaterThan(front)
  })

  /*
    야간 배지는 이제 '마지막 1통'이 아니라 arrivalMin에서만 파생한다 — 균등 슬롯을 버리고
    하루 전체에 뿌리면서 야간 콜 수가 날마다 달라졌다(그게 자연스럽다). 계약은 '몇 통이냐'가
    아니라 '경계와 일치하느냐'로 옮겼다.
  */
  it('야간 배지는 arrivalMin 경계와 정확히 일치한다', () => {
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      for (const c of createCallQueue(d)) {
        expect(c.nightShift).toBe(c.arrivalMin! >= NIGHT_START_MIN)
      }
    }
  })

  it('매일 야간에도 사람이 온다 — 밤이 비지 않는다', () => {
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      expect(createCallQueue(d).some((c) => c.nightShift)).toBe(true)
    }
  })
})

describe('병상 연동 콜 볼륨 — 커지면 환자도 더 온다', () => {
  it('외래 통수 = beds × 20 (3→60, 5→100, 7→140)', () => {
    expect(outpatientForBeds(3)).toBe(60)
    expect(outpatientForBeds(5)).toBe(100)
    expect(outpatientForBeds(7)).toBe(140)
  })

  it('콜 id는 고유(볼륨 늘어도 React key 충돌 없음)', () => {
    const ids = createCallQueue(1, 7).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('야간은 arrivalMin에서 파생 — 볼륨 늘어도 정합', () => {
    const q = createCallQueue(1, 7)
    expect(q.every((c) => c.nightShift === (c.arrivalMin! >= NIGHT_START_MIN))).toBe(true)
  })
})

/*
  이번 변경의 계약. 하루의 끝을 '개수'가 아니라 '시각'이 정하게 만든 결과를 잠근다 —
  콜 총량은 병상 티어에서 파생하고, 그중 응급만 티어와 무관하게 고정이다.
  (스펙: docs/superpowers/specs/2026-07-23-unbounded-arrival-flow-design.md)
*/
describe('콜 제한 폐지 — 외래가 밀려들고 응급은 그대로', () => {
  const emergencyCount = (q: IncomingCall[]) => q.filter((c) => requiresBackupCare(c.kind)).length

  it('총량 = 그날 응급 + 외래(beds × 5)', () => {
    for (const beds of [3, 5, 7]) {
      for (let d = 1; d <= DAYS_PER_WEEK; d++) {
        const q = createCallQueue(d, beds)
        expect(q.length - emergencyCount(q)).toBe(outpatientForBeds(beds))
      }
    }
  })

  it('병상이 커져도 응급 통수는 그대로 — 신문·소송이 배수로 늘지 않는다', () => {
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      const base = emergencyCount(createCallQueue(d, 3))
      expect(emergencyCount(createCallQueue(d, 5))).toBe(base)
      expect(emergencyCount(createCallQueue(d, 7))).toBe(base)
    }
  })

  it('하루 60명 이상이 온다 — 개수가 상한이던 시절(5~9통)의 10배 이상', () => {
    expect(createCallQueue(1, FIXED_BEDS).length).toBeGreaterThanOrEqual(60)
    expect(createCallQueue(1, 7).length).toBeGreaterThanOrEqual(140)
  })

  /*
    동시 인원 = 도착률 × 체류시간(리틀의 법칙). 하루 600분에 60명이면 10분에 한 명이고
    진료가 45분이라 평균 5명이 병원에 있다 — 이게 '북적임'의 산술적 근거다.
    도착이 뭉치는 것만으로는 이 평균을 못 올린다(뭉침은 분산이지 평균이 아니다).
  */
  it('평균 도착 간격이 진료 시간보다 짧다 — 그래야 사람이 겹쳐 남는다', () => {
    const q = createCallQueue(1, FIXED_BEDS)
    expect(DAY_LENGTH_MIN / q.length).toBeLessThan(30) // 워크인 최단 진료(30분)보다 촘촘
  })

  it('외래는 워크인 위주 + 예약진료 소수(12통당 1) — 예약이 결정 지점이다', () => {
    const q = createCallQueue(1, 3)
    expect(q.filter((c) => c.kind === 'SPECIALIST_ELECTIVE')).toHaveLength(5)
    expect(q.filter((c) => c.kind === 'COSMETIC_WALKIN')).toHaveLength(55)
  })

  // needsDecision이 응급 6종까지 넓어진 뒤(스펙 2026-07-24 §2) 이 총량은 예약(≤11) + 응급(≤4) =
  // 최대 15다. 옛 기준(≤12)은 예약만 세던 시절 값이라 응급이 늘어나며 조용히 깨졌다(실측 최대
  // beds=7: 15). 사람이 하루 흐름 중 실제로 누르는 결정 카드 수의 상한을 잡는 게 이 테스트의 목적.
  it('하루 결정 횟수는 손에 잡히는 수준 — 예약+응급이 15통을 넘지 않는다', () => {
    for (const beds of [3, 5, 7]) {
      for (let d = 1; d <= DAYS_PER_WEEK; d++) {
        expect(createCallQueue(d, beds).filter(needsDecision).length).toBeLessThanOrEqual(15)
      }
    }
  })

  it('도착순 정렬 · 결정론 유지', () => {
    const q = createCallQueue(3, 5)
    expect(q.map((c) => c.arrivalMin)).toEqual([...q.map((c) => c.arrivalMin!)].sort((a, b) => a - b))
    expect(createCallQueue(3, 5)).toEqual(q)
  })

  it('도착이 뭉친다 — 같은 30분 안에 2명 이상 겹치는 구간이 있다', () => {
    const times = createCallQueue(1, 3).map((c) => c.arrivalMin!)
    const crowded = times.some((t) => times.filter((o) => o >= t && o < t + 30).length >= 2)
    expect(crowded).toBe(true)
  })
})

describe('대기 — 버티면 받고 못 버티면 떠난다', () => {
  const cardioHospital = (roster: Doctor[]): Hospital => ({
    id: 'p', name: 'x', beds: 3, hasErOnCall: true, overcrowded: false,
    backupCare: ['CARDIOLOGY'], roundTheClockBackup: ['CARDIOLOGY'], roster,
  })
  const solo: Doctor[] = [{ id: 'doc-CARDIOLOGY-1', name: '김민준', dept: 'CARDIOLOGY' }]
  const stemiAt = (arrivalMin: number, id = 'c1'): IncomingCall => ({
    id, kind: 'STEMI', label: 'STEMI', patient: { id: 's', requiredSpecialty: 'CARDIOLOGY', severity: 5 },
    lawsuitRisk: true, nightShift: false, arrivalMin, durationMin: 60,
  })

  it('자유 의사가 있으면 도착 즉시 시작(startMin = arrivalMin)', () => {
    const s = decide(initReceiving(cardioHospital(solo), [stemiAt(100)]), 'ACCEPT')
    expect(s.log[0].accepted).toBe(true)
    expect(s.log[0].startMin).toBe(100)
  })

  it('다 바쁘면 가장 빨리 비는 시각까지 기다렸다 시작한다', () => {
    // 첫 콜이 100분에 와서 160분까지 점유 → 두 번째 콜(120분 도착)은 160분까지 대기(40분 < 90분 한계)
    const state = initReceiving(cardioHospital(solo), [stemiAt(100, 'c1'), stemiAt(120, 'c2')])
    const after = decide(decide(state, 'ACCEPT'), 'ACCEPT')
    expect(after.log[1].accepted).toBe(true)
    expect(after.log[1].startMin).toBe(160)
    expect(after.busyUntil['doc-CARDIOLOGY-1']).toBe(220) // 160 + 60
  })

  it('대기가 한계(STEMI 90분)를 넘으면 LEFT_WAITING으로 떠난다', () => {
    // 첫 콜 100분 도착·180분 소요 → 280분까지 점유. 두 번째가 150분에 오면 130분 대기 > 90분
    const long: IncomingCall = { ...stemiAt(100, 'c1'), durationMin: 180 }
    const state = initReceiving(cardioHospital(solo), [long, stemiAt(150, 'c2')])
    const after = decide(decide(state, 'ACCEPT'), 'ACCEPT')
    expect(after.log[1].accepted).toBe(false)
    expect(after.log[1].reason).toBe('LEFT_WAITING')
    expect(after.log[1].startMin).toBeUndefined() // 진료를 시작한 적이 없다
  })

  it('그 과 의사가 아예 없으면 대기 없이 하드락 — 기다려도 소용없다', () => {
    const noDocs = cardioHospital([])
    expect(hardlockReason(noDocs, stemiAt(100), {}, [])).toBe('NO_FREE_SPECIALIST')
  })

  it('워크인은 참을성이 짧아 응급보다 먼저 떠난다', () => {
    expect(patienceMin('COSMETIC_WALKIN')).toBeLessThan(patienceMin('STEMI'))
  })
})

describe('경제 축소 — 금액은 각색, 비율이 근거(외래 4배에도 I8 유지)', () => {
  const ratio = (k: CallKind) => CALL_ECONOMICS[k].revenueManwon / CALL_ECONOMICS[k].costManwon

  it('미용은 비급여 200% — 급여 콜과 달리 원가를 넘긴다', () => {
    expect(ratio('COSMETIC_WALKIN')).toBeCloseTo(2, 1)
  })
  it('급여 수술 4종+STEMI는 원가 미달(80~85% 밴드)', () => {
    for (const k of ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY', 'ABDOMINAL_EMERGENCY'] as const) {
      expect(ratio(k)).toBeGreaterThan(0.8)
      expect(ratio(k)).toBeLessThan(0.86)
    }
  })
  it('고열·감염은 기본진료 밴드 50%', () => {
    expect(ratio('MEDICAL_EMERGENCY')).toBeCloseTo(0.5, 2)
  })
  it('예약진료는 검체 흑자 밴드 160%대', () => {
    expect(ratio('SPECIALIST_ELECTIVE')).toBeGreaterThan(1.6)
  })
  it('부호가 보존된다 — 미용·예약은 흑자, 급여 응급은 전부 적자', () => {
    expect(callDelta('COSMETIC_WALKIN')).toBeGreaterThan(0)
    expect(callDelta('SPECIALIST_ELECTIVE')).toBeGreaterThan(0)
    for (const k of BACKUP_CARE_KINDS) expect(callDelta(k)).toBeLessThan(0)
  })
})

describe('unacceptedGroups — 못 받은 콜을 라벨·사유로 접어 횟수만 센다', () => {
  const entry = (
    callId: string,
    accepted: boolean,
    disposition: 'CHOICE' | 'HARDLOCK_REJECT' | 'RECEIVE_REJECT',
    reason: 'LEFT_WAITING' | null = null,
  ) => ({ callId, accepted, disposition, reason } as ReceivingState['log'][number])
  const call = (id: string, label: string) => ({ id, label } as IncomingCall)

  it('같은 라벨·같은 사유는 한 줄로 접히고 count가 쌓인다', () => {
    const state = {
      queue: [call('c1', '보톡스 상담 워크인'), call('c2', '보톡스 상담 워크인'), call('c3', '보톡스 상담 워크인')],
      log: [entry('c1', false, 'RECEIVE_REJECT'), entry('c2', false, 'RECEIVE_REJECT'), entry('c3', false, 'RECEIVE_REJECT')],
    }
    expect(unacceptedGroups(state)).toEqual([{ label: '보톡스 상담 워크인', outcome: '거절', count: 3 }])
  })

  it('라벨이 같아도 사유가 다르면 안 합친다', () => {
    const state = {
      queue: [call('c1', '순환기내과 예약 진료'), call('c2', '순환기내과 예약 진료')],
      log: [entry('c1', false, 'RECEIVE_REJECT'), entry('c2', false, 'CHOICE', 'LEFT_WAITING')],
    }
    expect(unacceptedGroups(state)).toEqual([
      { label: '순환기내과 예약 진료', outcome: '거절', count: 1 },
      { label: '순환기내과 예약 진료', outcome: '기다리다 감', count: 1 },
    ])
  })

  it('수용된 콜은 아예 안 들어간다 — 이 목록은 남은 사람만 센다', () => {
    const state = {
      queue: [call('c1', '검진 패키지 문의'), call('c2', '검진 패키지 문의')],
      log: [entry('c1', true, 'CHOICE'), entry('c2', false, 'RECEIVE_REJECT')],
    }
    expect(unacceptedGroups(state)).toEqual([{ label: '검진 패키지 문의', outcome: '거절', count: 1 }])
  })

  it('순서는 첫 등장 순서다 — 하루의 흐름이 뒤집히지 않는다', () => {
    const state = {
      queue: [call('c1', '보톡스 상담 워크인'), call('c2', '검진 패키지 문의'), call('c3', '보톡스 상담 워크인')],
      log: [entry('c1', false, 'RECEIVE_REJECT'), entry('c2', false, 'RECEIVE_REJECT'), entry('c3', false, 'RECEIVE_REJECT')],
    }
    expect(unacceptedGroups(state).map((g) => g.label)).toEqual(['보톡스 상담 워크인', '검진 패키지 문의'])
    expect(unacceptedGroups(state)[0].count).toBe(2)
  })

  it('하드락은 거절과 다른 줄이다 — 내가 보낸 것과 구조가 막은 것은 같은 사건이 아니다', () => {
    const state = {
      queue: [call('c1', 'STEMI'), call('c2', 'STEMI')],
      log: [entry('c1', false, 'HARDLOCK_REJECT'), entry('c2', false, 'RECEIVE_REJECT')],
    }
    expect(unacceptedGroups(state)).toEqual([
      { label: 'STEMI', outcome: '하드락', count: 1 },
      { label: 'STEMI', outcome: '거절', count: 1 },
    ])
  })

  it('빈 로그는 빈 목록이다', () => {
    expect(unacceptedGroups({ queue: [], log: [] })).toEqual([])
  })
})
