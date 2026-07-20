import { describe, it, expect } from 'vitest'
import {
  createCallQueue, hardlockReason, initReceiving, decide, runningNetProfit,
  dayProgress, accruedSegments, CALL_ECONOMICS, callDelta,
  WORKUP_ECONOMICS, workupDelta, canOrderWorkup, isElective, requiresBackupCare, carriesLawsuitRisk,
  callsForBeds,
} from './receiving'
import type { ReceivingState } from './receiving'
import { buildHospital, DAYS_PER_WEEK, DEPARTMENTS, FIXED_BEDS } from './setup'
import type { CallKind, DeptKey, Doctor, Hospital, IncomingCall, SetupChoices } from './types'
import { DAY_LENGTH_MIN, NIGHT_START_MIN } from './daysim'

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
  it('델타는 수술·처치 밴드(11/13, STEMI 동형)다', () => {
    expect(callDelta('ABDOMINAL_EMERGENCY')).toBe(11 - 13)
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
  it('델타는 급여 원가미달 밴드(3/6)다', () => {
    expect(callDelta('MEDICAL_EMERGENCY')).toBe(3 - 6)
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
    const next = decide(initReceiving(hospital, [call]), true)
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
      expect(e.revenueBillions - e.costBillions).toBe(callDelta(kind))
      expect(e.costBillions).toBeGreaterThan(0) // 공짜로 보는 환자는 없다
    }
  })

  it('[I1] 고열감염 콜 델타 < 0 — 기본진료 50.5% / 응급의료수가 45.0%', () => {
    expect(callDelta('MEDICAL_EMERGENCY')).toBeLessThan(0)
  })

  it('[I3] STEMI 콜 델타 < 0, 단 |STEMI| < |고열감염| — 수술·처치 84.9% > 기본진료 50.5%', () => {
    expect(callDelta('STEMI')).toBeLessThan(0)
    expect(Math.abs(callDelta('STEMI'))).toBeLessThan(Math.abs(callDelta('MEDICAL_EMERGENCY')))
  })

  it('미용 워크인만 흑자 — 가격 규제가 없는 유일한 콜', () => {
    expect(callDelta('COSMETIC_WALKIN')).toBeGreaterThan(0)
  })

  /**
   * 부호가 우연이 아니라 근거에서 나왔음을 잠근다 — 급여 콜의 수익/원가 비율이 곧 원가보전율이다.
   * 밴드가 넓은 건 금액이 각색이기 때문이고, 좁히면 각색값을 테스트에 박는 게 된다.
   */
  it('급여 콜의 원가보전율이 행위 유형 근거 밴드 안 — STEMI(84.9%)가 고열감염(50.5%)보다 높다', () => {
    const recovery = (k: CallKind) => CALL_ECONOMICS[k].revenueBillions / CALL_ECONOMICS[k].costBillions
    expect(recovery('MEDICAL_EMERGENCY')).toBeGreaterThan(0.4)
    expect(recovery('MEDICAL_EMERGENCY')).toBeLessThan(0.6)
    expect(recovery('STEMI')).toBeGreaterThan(0.75)
    expect(recovery('STEMI')).toBeLessThan(0.95)
    expect(recovery('STEMI')).toBeGreaterThan(recovery('MEDICAL_EMERGENCY'))
    expect(recovery('COSMETIC_WALKIN')).toBeGreaterThan(1) // 비급여는 원가를 넘겨 받는다
  })

  it('고열감염 수용은 오늘 진료 수익을 깎는다 — 받을수록 장부가 나빠진다', () => {
    const medical = createCallQueue().find((c) => c.kind === 'MEDICAL_EMERGENCY')!
    const s = initReceiving(hospitalWith('INTERNAL_MEDICINE', 2), [{ ...medical, nightShift: false }])
    const after = decide(s, true)
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaBillions).toBeLessThan(0)
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
    expect(e.revenueBillions).toBeGreaterThan(e.costBillions)
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
  it('하루 5통 중 마지막 1통이 야간 — 결정론', () => {
    // count=5면 슬롯 폭 120분, NIGHT_START_MIN=480은 슬롯 경계라 마지막 슬롯([480,600))만 야간이다.
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      const q = createCallQueue(day)
      expect(q.map((c) => c.nightShift)).toEqual([false, false, false, false, true])
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
    const recovery = WORKUP_ECONOMICS.revenueBillions / WORKUP_ECONOMICS.costBillions
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

  it('그 과 의사가 다 진료 중이면 응급은 벽(NO_FREE_SPECIALIST)', () => {
    const call = dayStemi()
    const roster = rosterOf(solo)
    // 그 유일 순환기 의사를 도착 시각 이후까지 점유시킨다 → 자유 의사 0.
    const busy = { [roster[0].id]: (call.arrivalMin ?? 0) + 1 }
    expect(hardlockReason(solo, call, busy, roster)).toBe('NO_FREE_SPECIALIST')
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

  it('네 종류 필수 응급 모두 그 과 의사가 점유되면 NO_FREE_SPECIALIST', () => {
    for (const { kind, dept } of CRITICAL) {
      const h = hospitalWith(dept, 1)
      const call = { ...dayCall(kind), nightShift: false }
      const roster = rosterOf(h)
      const busy = { [roster[0].id]: (call.arrivalMin ?? 0) + 1 }
      expect(hardlockReason(h, call, busy, roster)).toBe('NO_FREE_SPECIALIST')
      expect(hardlockReason(h, call, {}, roster)).toBeNull() // 자유면 통과
    }
  })
})

describe('decide (시간 점유) — 응급 자동 / 선택 점유', () => {
  it('응급 수용 시 담당 의사 busyUntil = arrivalMin + durationMin', () => {
    const h = hospitalOf(conscientious) // 순환기 2
    const stemi = { ...dayCall('STEMI'), nightShift: false }
    const after = decide(initReceiving(h, [stemi]), false) // 응급은 accept 무관 자동
    expect(after.log[0].accepted).toBe(true)
    expect(Object.values(after.busyUntil)).toContain((stemi.arrivalMin ?? 0) + (stemi.durationMin ?? 0))
  })

  it('응급은 accept 무관 자동 — 자유 의사 있으면 수용, 없으면 벽', () => {
    const stemi = { ...dayCall('STEMI'), nightShift: false }
    const cardio = hospitalOf(conscientious) // 자유 순환기 → 수용
    expect(decide(initReceiving(cardio, [stemi]), false).log[0].accepted).toBe(true)
    const noCardio = hospitalOf(collaborator) // 배후 없음 → 벽(수용 시도해도 못 받음)
    expect(decide(initReceiving(noCardio, [stemi]), true).log[0].accepted).toBe(false)
  })

  it('선택진료 수용 시 그 과 의사 점유 + 흑자 누적', () => {
    const h = hospitalOf(conscientious) // 순환기 2 — 월요일 예약은 순환기 배치
    const elective = dayCall('SPECIALIST_ELECTIVE')
    const after = decide(initReceiving(h, [elective]), true)
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaBillions).toBe(callDelta('SPECIALIST_ELECTIVE')) // 흑자 누적
    expect(Object.keys(after.busyUntil)).toHaveLength(1) // 그 과 의사 1명 점유
  })

  it('선택진료 스킵 시 의사 자유 유지, 수익 0', () => {
    const h = hospitalOf(conscientious)
    const elective = dayCall('SPECIALIST_ELECTIVE')
    const after = decide(initReceiving(h, [elective]), false)
    expect(after.log[0].accepted).toBe(false)
    expect(after.netProfitDeltaBillions).toBe(0)
    expect(after.busyUntil).toEqual({})
  })

  it('선택진료는 그 과 자유 의사가 없으면 accept=true여도 미수용(하드락 아님)', () => {
    const noCardio = hospitalOf(collaborator) // 순환기 0 — 월요일 순환기 예약은 담당 의사가 없다
    const elective = dayCall('SPECIALIST_ELECTIVE')
    const after = decide(initReceiving(noCardio, [elective]), true)
    expect(after.log[0].accepted).toBe(false)
    expect(after.log[0].disposition).toBe('CHOICE') // 구조가 막은 게 아니라 담당이 없어 못 받음
    expect(after.log[0].reason).toBeNull()
  })

  it('clockMin은 현재 콜 arrivalMin으로 전진', () => {
    const q = createCallQueue(1)
    const s = initReceiving(hospitalOf(conscientious), q)
    expect(s.clockMin).toBe(0)
    expect(decide(s, false).clockMin).toBe(q[0].arrivalMin)
  })

  it('원본 불변 — decide는 입력 state의 busyUntil을 변형하지 않는다', () => {
    const h = hospitalOf(conscientious)
    const s = initReceiving(h, [{ ...dayCall('STEMI'), nightShift: false }])
    decide(s, true)
    expect(s.busyUntil).toEqual({}) // 원본은 그대로
    expect(s.clockMin).toBe(0)
  })
})

describe('세분 응급 점유 — 급성복증·고열감염은 담당 과 의사를 점유한다(설계 B)', () => {
  it('자유 외과의가 있으면 급성복증 수용이 그 의사를 점유한다(설계 A 폐기 — 이제 점유함)', () => {
    const h = hospitalWith('GENERAL_SURGERY', 2) // 야간 당직까지 커버
    const roster = rosterOf(h)
    const ab = dayCall('ABDOMINAL_EMERGENCY', false)
    const after = decide(initReceiving(h, [ab]), false) // 응급은 accept 무관 자동
    expect(after.log[0].accepted).toBe(true)
    expect(after.busyUntil[roster[0].id]).toBe((ab.arrivalMin ?? 0) + (ab.durationMin ?? 0)) // 점유함
  })

  it('대조군 — 중증외상도 같은 외과의를 점유한다(필수응급 점유 보존)', () => {
    const h = hospitalWith('GENERAL_SURGERY', 2)
    const roster = rosterOf(h)
    const trauma = dayCall('TRAUMA_EMERGENCY', false)
    const after = decide(initReceiving(h, [trauma]), false)
    expect(after.log[0].accepted).toBe(true)
    expect(after.busyUntil[roster[0].id]).toBe((trauma.arrivalMin ?? 0) + (trauma.durationMin ?? 0))
  })
})

describe('dayProgress — 시간 기반(clockMin / DAY_LENGTH_MIN)', () => {
  it('진행 중엔 clockMin / DAY_LENGTH_MIN', () => {
    const q = createCallQueue(1)
    const s = decide(initReceiving(hospitalOf(conscientious), q), false) // 1통 처리, 미완
    expect(s.done).toBe(false)
    expect(dayProgress(s)).toBeCloseTo((q[0].arrivalMin ?? 0) / DAY_LENGTH_MIN)
  })

  it('콜 시작(clockMin 0)엔 0', () => {
    expect(dayProgress(initReceiving(hospitalOf(collaborator)))).toBe(0)
  })

  it('완료(done)엔 1 — 7일 완주 시 주간 전액 도달 등식을 보존한다', () => {
    let s = initReceiving(hospitalOf(collaborator), createCallQueue(1))
    while (!s.done) s = decide(s, false)
    expect(dayProgress(s)).toBe(1)
  })

  it('빈 큐(콜 없음)는 하루 완료로 보아 1', () => {
    expect(dayProgress(initReceiving(hospitalOf(collaborator), []))).toBe(1)
  })
})

describe('createCallQueue — 고정 5통(결정론)', () => {
  it('5통이고 STEMI·워크인·고열감염을 모두 포함', () => {
    const q = createCallQueue()
    expect(q).toHaveLength(5)
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
    expect(decide(s, true).log[0].reason).toBeNull() // 받은 콜엔 사유가 없다
    expect(decide(s, false).log[0].reason).toBeNull() // 내가 거절한 것도 '못 받은' 게 아니다
    const blocked = decide(decide(s, true), true) // 2번째 = STEMI, 순환기 없음
    expect(blocked.log[1].reason).toBe('NO_BACKUP_CARE')
  })
})

describe('decide 리듀서 — 장부·소송 누적', () => {
  it('워크인 수용 → 순이익 델타↑, 소송 노출 0', () => {
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const s = initReceiving(hospitalOf(collaborator), [walkin])
    const after = decide(s, true)
    expect(after.netProfitDeltaBillions).toBeGreaterThan(0)
    expect(after.lawsuitExposure).toBe(0)
    expect(after.done).toBe(true)
    expect(s.index).toBe(0) // 원본 불변 — decide는 입력 state를 변형하지 않는다
  })

  it('STEMI 하드락 콜은 accept=true여도 수용 안 됨(가드) — 델타·노출 불변', () => {
    const stemi = createCallQueue().find((c) => c.kind === 'STEMI')!
    const s = initReceiving(hospitalOf(collaborator), [stemi]) // 순환기 없음 → 하드락
    const after = decide(s, true)
    expect(after.log[0].disposition).toBe('HARDLOCK_REJECT')
    expect(after.log[0].accepted).toBe(false)
    expect(after.netProfitDeltaBillions).toBe(0)
    expect(after.lawsuitExposure).toBe(0)
  })

  it('양심 병원의 STEMI 수용 → 적자 델타 + 소송 노출 +1', () => {
    const stemi = createCallQueue().find((c) => c.kind === 'STEMI')!
    const s = initReceiving(hospitalOf(conscientious), [stemi])
    const after = decide(s, true)
    expect(after.log[0].disposition).toBe('CHOICE')
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaBillions).toBeLessThan(0)
    expect(after.lawsuitExposure).toBe(1)
  })

  it('선택 콜 거절 → 델타·노출 불변, 인덱스 전진', () => {
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const s = initReceiving(hospitalOf(collaborator), [walkin])
    const after = decide(s, false)
    expect(after.netProfitDeltaBillions).toBe(0)
    expect(after.index).toBe(1)
    expect(after.done).toBe(true)
  })

  it('전체 큐 소진 시 done, 이후 decide는 에러', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false)
    expect(s.done).toBe(true)
    expect(() => decide(s, false)).toThrow()
  })
})

describe('runningNetProfit — 러닝 순이익(소송 비용 제외, 1막 한정)', () => {
  function stateWith(
    segments: { label: string; profitBillions: number }[] | undefined,
    netProfitDeltaBillions: number,
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
    return { ...initReceiving(hospital, []), netProfitDeltaBillions }
  }

  it('양수 — 부문 손익 오늘치(1/7) 합 + 오늘 델타', () => {
    const s = stateWith(
      [
        { label: 'A', profitBillions: 70 }, // 주간 → 하루 10
        { label: 'B', profitBillions: 35 }, // 주간 → 하루 5
      ],
      3,
    )
    expect(runningNetProfit(s)).toBe(18) // 10 + 5 + 3
  })

  it('음수 — 부문 손익 합이 음수여도 그대로 더한다', () => {
    const s = stateWith([{ label: 'A', profitBillions: -140 }], -4) // 주간 −140 → 하루 −20
    expect(runningNetProfit(s)).toBe(-24)
  })

  it('segments 없음(economics undefined) — 오늘 델타만', () => {
    const s = stateWith(undefined, 7)
    expect(runningNetProfit(s)).toBe(7)
  })
})

describe('accruedSegments — 부문 손익의 오늘치를 진행률만큼 0에서 누적', () => {
  // collaborator = 미용 3명(70×3=210) + 검진 2명(40×2=80) — 이 숫자는 **이번 주 7일 전체** 손익이다.
  // 하루치 = 1/7 (미용 30 · 검진 11.43).
  it('콜 시작(clockMin 0)엔 전 부문 0(진료 전인데 이미 벌지 않는다)', () => {
    const s = initReceiving(hospitalOf(collaborator))
    expect(accruedSegments(s).every((x) => x.profitBillions === 0)).toBe(true)
  })

  it('하루 완료(done)엔 주간 손익의 1/7에 도달 — 전액이 아니다', () => {
    let s = initReceiving(hospitalOf(collaborator))
    while (!s.done) s = decide(s, false)
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitBillions).toBe(30) // 210 / 7
    expect(accruedSegments(s).find((x) => x.label === '건강검진')!.profitBillions).toBe(11) // 80/7=11.43
  })

  it('진행 중엔 clockMin 진행률만큼 비례 누적(반올림)', () => {
    const s = decide(initReceiving(hospitalOf(collaborator)), false) // 1통 처리, 미완
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitBillions).toBe(Math.round((210 / DAYS_PER_WEEK) * (s.clockMin / DAY_LENGTH_MIN)))
  })

  it('7일치를 합하면 주간 전액에 도달 — 결말 장부(composeLedger 전액)와 어긋나지 않는다', () => {
    let s = initReceiving(hospitalOf(collaborator))
    while (!s.done) s = decide(s, false)
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitBillions * DAYS_PER_WEEK).toBe(210) // 30 × 7 = 주간 전액
  })
})

describe('runningNetProfit — 오늘 순이익(부문 손익 오늘치 + 오늘 진료 수익)', () => {
  it('콜 시작(clockMin 0)엔 러닝 순이익이 0에서 출발(정적 선반영 제거)', () => {
    const s = initReceiving(hospitalOf(collaborator)) // 주간 합 290이지만 진행률 0
    expect(runningNetProfit(s)).toBe(0)
  })

  it('하루 완료(전부 거절 시도)엔 부문 손익 오늘치 합 + 자동 수용된 응급 델타', () => {
    // 응급은 자동 수용이라 '전부 거절'이 델타 0을 뜻하지 않는다 — 일반 응급이 자동으로 받아진다.
    let s = initReceiving(hospitalOf(collaborator))
    while (!s.done) s = decide(s, false)
    const structural = accruedSegments(s).reduce((n, x) => n + x.profitBillions, 0)
    expect(structural).toBe(41) // 미용 30 + 검진 11
    expect(runningNetProfit(s)).toBe(structural + s.netProfitDeltaBillions)
  })
})

describe('createCallQueue(day) — 요일별 고정 큐(결정론)', () => {
  it('7일 모두 5통이고, 같은 날은 항상 같은 큐(결정론)', () => {
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      expect(createCallQueue(day)).toHaveLength(5)
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

  it('라벨↔대사 정합 — 같은 kind가 큐에 여러 번 나와도 각기 다른 호소를 집는다', () => {
    // callerPleaAt이 kind 내 등장 순번을 seed로 쓰므로(PR #29), 라벨도 같은 순번 규칙을 따라야 한다.
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      const q = createCallQueue(day)
      const walkins = q.filter((c) => c.kind === 'COSMETIC_WALKIN')
      if (walkins.length >= 2) expect(walkins[0].label).not.toBe(walkins[1].label)
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
      const recovery = e.revenueBillions / e.costBillions
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

  it('여전히 하루 5통이고 야간은 마지막 1통 — 시간대 파생 규칙 보존', () => {
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      const q = createCallQueue(d)
      expect(q).toHaveLength(5)
      expect(q.map((c) => c.nightShift)).toEqual([false, false, false, false, true])
    }
  })
})

describe('병상 연동 콜 볼륨 — 커지면 환자도 더 온다', () => {
  it('콜 수 = beds + 2 (3→5, 5→7, 7→9)', () => {
    expect(callsForBeds(3)).toBe(5)
    expect(callsForBeds(5)).toBe(7)
    expect(callsForBeds(7)).toBe(9)
  })

  it('기본(beds 미지정)은 5통 — 기존 동작 불변', () => {
    expect(createCallQueue(1)).toHaveLength(5)
    expect(createCallQueue(1, FIXED_BEDS)).toHaveLength(5)
  })

  it('큰 병원은 더 많은 콜(같은 날 결정론)', () => {
    expect(createCallQueue(1, 5)).toHaveLength(7)
    expect(createCallQueue(1, 7)).toHaveLength(9)
    expect(createCallQueue(1, 7)).toEqual(createCallQueue(1, 7)) // 결정론
  })

  it('콜 id는 고유(볼륨 늘어도 React key 충돌 없음)', () => {
    const ids = createCallQueue(1, 7).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('야간은 arrivalMin에서 파생 — 볼륨 늘어도 정합', () => {
    const q = createCallQueue(1, 7)
    expect(q.every((c) => c.nightShift === (c.arrivalMin! >= 480))).toBe(true)
  })
})
