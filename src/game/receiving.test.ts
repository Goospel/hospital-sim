import { describe, it, expect } from 'vitest'
import {
  createCallQueue, hardlockReason, initReceiving, decide, runningNetProfit,
  dayProgress, accruedSegments, CALL_ECONOMICS, callDelta,
  WORKUP_ECONOMICS, workupDelta, canOrderWorkup,
} from './receiving'
import type { ReceivingState } from './receiving'
import { buildHospital, DAYS_PER_WEEK } from './setup'
import type { CallKind, DeptKey, Hospital, IncomingCall, SetupChoices } from './types'

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

function hospitalOf(c: SetupChoices): Hospital {
  return buildHospital(c).hospital
}

/** 한 과만 n명 채운 병원 — 배후과 유무·인원별 판정을 검증하는 픽스처. */
function hospitalWith(dept: DeptKey, n: number): Hospital {
  return buildHospital({ hospitalName: '테스트', doctors: { [dept]: n } as SetupChoices['doctors'] }).hospital
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
    expect(CALL_ECONOMICS.GENERAL_EMERGENCY.priceSetter).toBe('GOVERNMENT')
    expect(CALL_ECONOMICS.STEMI.priceSetter).toBe('GOVERNMENT')
  })

  it('내역은 항상 수익 − 원가 = 델타로 닫힌다', () => {
    for (const kind of ['COSMETIC_WALKIN', 'GENERAL_EMERGENCY', 'STEMI'] as CallKind[]) {
      const e = CALL_ECONOMICS[kind]
      expect(e.revenueBillions - e.costBillions).toBe(callDelta(kind))
      expect(e.costBillions).toBeGreaterThan(0) // 공짜로 보는 환자는 없다
    }
  })

  it('[I1] 일반 응급 콜 델타 < 0 — 기본진료 50.5% / 응급의료수가 45.0%', () => {
    expect(callDelta('GENERAL_EMERGENCY')).toBeLessThan(0)
  })

  it('[I3] STEMI 콜 델타 < 0, 단 |STEMI| < |일반 응급| — 수술·처치 84.9% > 기본진료 50.5%', () => {
    expect(callDelta('STEMI')).toBeLessThan(0)
    expect(Math.abs(callDelta('STEMI'))).toBeLessThan(Math.abs(callDelta('GENERAL_EMERGENCY')))
  })

  it('미용 워크인만 흑자 — 가격 규제가 없는 유일한 콜', () => {
    expect(callDelta('COSMETIC_WALKIN')).toBeGreaterThan(0)
  })

  /**
   * 부호가 우연이 아니라 근거에서 나왔음을 잠근다 — 급여 콜의 수익/원가 비율이 곧 원가보전율이다.
   * 밴드가 넓은 건 금액이 각색이기 때문이고, 좁히면 각색값을 테스트에 박는 게 된다.
   */
  it('급여 콜의 원가보전율이 행위 유형 근거 밴드 안 — STEMI(84.9%)가 일반 응급(50.5%)보다 높다', () => {
    const recovery = (k: CallKind) => CALL_ECONOMICS[k].revenueBillions / CALL_ECONOMICS[k].costBillions
    expect(recovery('GENERAL_EMERGENCY')).toBeGreaterThan(0.4)
    expect(recovery('GENERAL_EMERGENCY')).toBeLessThan(0.6)
    expect(recovery('STEMI')).toBeGreaterThan(0.75)
    expect(recovery('STEMI')).toBeLessThan(0.95)
    expect(recovery('STEMI')).toBeGreaterThan(recovery('GENERAL_EMERGENCY'))
    expect(recovery('COSMETIC_WALKIN')).toBeGreaterThan(1) // 비급여는 원가를 넘겨 받는다
  })

  it('일반 응급 수용은 오늘 진료 수익을 깎는다 — 받을수록 장부가 나빠진다', () => {
    const general = createCallQueue().find((c) => c.kind === 'GENERAL_EMERGENCY')!
    const s = initReceiving(hospitalOf(collaborator), [general])
    const after = decide(s, true)
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaBillions).toBeLessThan(0)
  })
})

/**
 * 야간 당직 — 배후진료가 '있냐/없냐'가 아니라 '몇 시냐'가 된다(T-042·F1b).
 *
 * 순환기 1명은 24시간을 못 버틴다. 그래서 2번째 의사가 사는 건 처리량이 아니라 **시간대**다 —
 * 밤에 오는 STEMI를 받을 수 있느냐. 이게 없으면 2명째는 손익만 −12 깎는 순수 함정이었다.
 */
describe('야간 콜 — 시간대는 DAY_PLANS 위치에서 파생(RNG 0)', () => {
  it('하루 5통 중 마지막 2통이 야간 — 결정론', () => {
    for (let day = 1; day <= DAYS_PER_WEEK; day++) {
      const q = createCallQueue(day)
      expect(q.map((c) => c.nightShift)).toEqual([false, false, false, true, true])
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

  it('순환기 1명 + 주간 STEMI → 받는다', () => {
    expect(hardlockReason(solo, dayStemi(), 3)).toBeNull()
  })

  /**
   * 야간 공백은 **배후과 부재와 다른 사유**다 — 이 병원엔 순환기가 있다. 밤에 없을 뿐이다.
   * 같은 태그를 쓰면 대사가 "저희도 순환기 시술팀이 없습니다"가 되어, 30억을 내고 순환기를 뽑은
   * 플레이어에게 게임이 거짓말을 한다. 현실에서도 이 둘은 다른 사유고, 수용곤란 고지의 최대 증가분이
   * '인력부족'(1년 새 2.3배)이라 오히려 이쪽이 지배적이다(stemi-factsheet.md:19).
   */
  it('순환기 1명 + 야간 STEMI → NO_NIGHT_BACKUP (과는 있는데 당직이 비었다)', () => {
    expect(hardlockReason(solo, nightStemi(), 3)).toBe('NO_NIGHT_BACKUP')
  })

  it('순환기 0명 + 야간 STEMI → NO_BACKUP_CARE — 과가 아예 없는 것과 구분된다', () => {
    expect(hardlockReason(hospitalOf(collaborator), nightStemi(), 3)).toBe('NO_BACKUP_CARE')
  })

  it('순환기 2명 + 야간 STEMI → 받는다 — 2번째 의사가 사는 게 이것이다', () => {
    expect(hardlockReason(roundTheClock, nightStemi(), 3)).toBeNull()
  })

  it('자리 0이면 야간 여부와 무관하게 NO_BED — 게이트 우선순위 유지', () => {
    expect(hardlockReason(roundTheClock, nightStemi(), 0)).toBe('NO_BED')
  })

  it('미용·일반응급은 야간이어도 배후 판정을 받지 않는다 — 배후진료가 필요한 건 STEMI뿐', () => {
    const nightWalkin = { ...createCallQueue(1).find((c) => c.kind === 'COSMETIC_WALKIN')!, nightShift: true }
    const nightGeneral = { ...createCallQueue(1).find((c) => c.kind === 'GENERAL_EMERGENCY')!, nightShift: true }
    expect(hardlockReason(solo, nightWalkin, 3)).toBeNull()
    expect(hardlockReason(solo, nightGeneral, 3)).toBeNull()
  })
})

/**
 * 검사 + boarding — 설계 스펙 §3.3(척추). 인과 사슬을 닫는 슬라이스.
 *
 * 저수가(45~85%) → 검사로 메꿈(160%) → boarding → 자리 없음 → 수용 불가 → 뺑뺑이 → 다음날 신문.
 * 게임은 이 사슬을 한마디도 설명하지 않는다. 플레이어가 자기 손으로 만든다.
 */
describe('검사(WORKUP) — 급여 환자의 부호를 뒤집는다', () => {
  it('검사는 급여(정부 고시)이고 원가보전율이 검체 160.5% 밴드 안 — 유일하게 원가를 넘는 급여 항목', () => {
    expect(WORKUP_ECONOMICS.priceSetter).toBe('GOVERNMENT')
    const recovery = WORKUP_ECONOMICS.revenueBillions / WORKUP_ECONOMICS.costBillions
    expect(recovery).toBeGreaterThan(1.5)
    expect(recovery).toBeLessThan(1.8)
    expect(workupDelta()).toBeGreaterThan(0)
  })

  it('[I2] 일반 응급 + 검사 > 0 — 검사가 부호를 뒤집는다', () => {
    expect(callDelta('GENERAL_EMERGENCY')).toBeLessThan(0)
    expect(callDelta('GENERAL_EMERGENCY') + workupDelta()).toBeGreaterThan(0)
  })

  it('[I2] STEMI + 검사 > 0 — 과 단위 117%가 여기서 창발한다(입력이 아니다)', () => {
    expect(callDelta('STEMI')).toBeLessThan(0)
    expect(callDelta('STEMI') + workupDelta()).toBeGreaterThan(0)
  })

  it('미용은 비급여라 검사 대상이 아니다 — 가격을 병원이 정하니 메꿀 게 없다', () => {
    expect(canOrderWorkup('COSMETIC_WALKIN')).toBe(false)
    expect(canOrderWorkup('GENERAL_EMERGENCY')).toBe(true)
    expect(canOrderWorkup('STEMI')).toBe(true)
  })

  it('검사를 붙여 수용 → 검사 수익이 진료 수익과 별도로 쌓인다', () => {
    const general = createCallQueue().find((c) => c.kind === 'GENERAL_EMERGENCY')!
    const s = initReceiving(hospitalOf(collaborator), [general])
    const after = decide(s, true, true)
    expect(after.netProfitDeltaBillions).toBe(callDelta('GENERAL_EMERGENCY')) // 진료 수익은 여전히 음수
    expect(after.workupRevenueBillions).toBe(workupDelta()) // 덮는 건 검사다 — 두 줄이 나란히 있을 뿐
    expect(after.workupCount).toBe(1)
  })

  it('검사 없이 수용 → 검사 수익 0', () => {
    const general = createCallQueue().find((c) => c.kind === 'GENERAL_EMERGENCY')!
    const after = decide(initReceiving(hospitalOf(collaborator), [general]), true, false)
    expect(after.workupRevenueBillions).toBe(0)
    expect(after.workupCount).toBe(0)
  })

  it('미용에 검사를 요청해도 무시된다 — 가드', () => {
    const walkin = createCallQueue().find((c) => c.kind === 'COSMETIC_WALKIN')!
    const after = decide(initReceiving(hospitalOf(collaborator), [walkin]), true, true)
    expect(after.workupCount).toBe(0)
    expect(after.workupRevenueBillions).toBe(0)
  })

  it('거절한 콜엔 검사가 안 붙는다 — 안 받은 환자를 검사할 수는 없다', () => {
    const general = createCallQueue().find((c) => c.kind === 'GENERAL_EMERGENCY')!
    const after = decide(initReceiving(hospitalOf(collaborator), [general]), false, true)
    expect(after.workupCount).toBe(0)
  })
})

describe('boarding — 어제의 흑자가 오늘의 자리를 먹는다', () => {
  it('이월 0(기본값)이면 자리는 병상 전부 — 기존 동작 유지', () => {
    const h = hospitalOf(conscientious)
    expect(initReceiving(h).bedsFree).toBe(h.beds)
  })

  it('어제 검사 n건 → 오늘 자리 = 병상 − n', () => {
    const h = hospitalOf(conscientious)
    expect(initReceiving(h, createCallQueue(2), 2).bedsFree).toBe(h.beds - 2)
  })

  /**
   * 지뢰 3 — 자리 0 데드락이 **의도된 결과**임을 잠근다.
   * 어제 검사를 3건 붙이면 오늘 5통이 전부 NO_BED다. 이게 boarding의 대가고, 자기제한 장치다:
   * 자리가 없으면 검사 붙일 환자도 없으니 다음날 자리가 돌아온다 → 무한 악화가 구조적으로 불가능.
   */
  it('[지뢰 3] 어제 검사가 병상만큼이면 오늘 전 콜이 NO_BED — 데드락이 의도다', () => {
    const h = hospitalOf(conscientious)
    const s = initReceiving(h, createCallQueue(2), h.beds)
    expect(s.bedsFree).toBe(0)
    for (const call of s.queue) {
      expect(hardlockReason(h, call, s.bedsFree)).toBe('NO_BED')
    }
  })

  it('이월이 병상보다 커도 자리는 음수가 안 된다', () => {
    const h = hospitalOf(conscientious)
    expect(initReceiving(h, createCallQueue(2), 99).bedsFree).toBe(0)
  })
})

describe('createCallQueue — 고정 5통(결정론)', () => {
  it('5통이고 STEMI·워크인·일반응급을 모두 포함', () => {
    const q = createCallQueue()
    expect(q).toHaveLength(5)
    const kinds = new Set(q.map((c) => c.kind))
    expect(kinds).toContain('STEMI')
    expect(kinds).toContain('COSMETIC_WALKIN')
    expect(kinds).toContain('GENERAL_EMERGENCY')
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
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const general = q.find((c) => c.kind === 'GENERAL_EMERGENCY')!
  const OPEN = 3 // 자리 넉넉 — 이 describe는 자리 축이 아니라 자격 축만 본다

  it('워크인은 자리가 있으면 선택(사유 없음 = CHOICE)', () => {
    expect(hardlockReason(hospitalOf(collaborator), walkin, OPEN)).toBeNull()
  })

  it('STEMI: 순환기 없으면 하드락(사유 있음), 있으면 선택(사유 없음)', () => {
    expect(hardlockReason(hospitalOf(collaborator), stemi, OPEN)).not.toBeNull()
    expect(hardlockReason(hospitalOf(conscientious), stemi, OPEN)).toBeNull()
  })

  it('일반응급: 병상+응급실 있으면 선택(배후 무관)', () => {
    expect(hardlockReason(hospitalOf(collaborator), general, OPEN)).toBeNull()
  })
})

describe('자리(하루 진료 역량) 소진 — 능력 대비 환자가 많다', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const general = q.find((c) => c.kind === 'GENERAL_EMERGENCY')!

  it('자리가 0이면 어떤 콜이든 NO_BED 하드락 — 내 선택이 아니라 구조가 거절한다', () => {
    for (const call of [walkin, general, stemi]) {
      expect(hardlockReason(hospitalOf(collaborator), call, 0)).toBe('NO_BED')
    }
    // 순환기를 갖춘 양심 병원도 자리가 없으면 STEMI를 못 받는다(자격 ≠ 총량).
    expect(hardlockReason(hospitalOf(conscientious), stemi, 0)).toBe('NO_BED')
  })

  it('자리가 있어도 순환기가 없으면 STEMI는 NO_BACKUP_CARE — 자리로 못 메운다', () => {
    expect(hardlockReason(hospitalOf(collaborator), stemi, 3)).toBe('NO_BACKUP_CARE')
  })

  it('받을 수 있는 콜은 사유가 없다(null)', () => {
    expect(hardlockReason(hospitalOf(collaborator), walkin, 1)).toBeNull()
    expect(hardlockReason(hospitalOf(conscientious), stemi, 1)).toBeNull()
  })

  it('initReceiving — 자리는 병원 병상 수에서 출발', () => {
    const h = hospitalOf(collaborator)
    expect(initReceiving(h).bedsFree).toBe(h.beds)
  })

  it('수용하면 자리 −1, 거절하면 자리 불변', () => {
    const s = initReceiving(hospitalOf(collaborator), [walkin, walkin])
    expect(decide(s, true).bedsFree).toBe(s.bedsFree - 1)
    expect(decide(s, false).bedsFree).toBe(s.bedsFree)
  })

  it('하드락 콜은 수용 시도해도 자리를 먹지 않는다', () => {
    const s = initReceiving(hospitalOf(collaborator), [stemi]) // 순환기 없음 → 하드락
    expect(decide(s, true).bedsFree).toBe(s.bedsFree)
  })

  it('로그가 하드락 사유를 기록한다 — 왜 못 받았는지가 남는다', () => {
    const s = initReceiving(hospitalOf(collaborator), [walkin, stemi])
    expect(decide(s, true).log[0].reason).toBeNull() // 받은 콜엔 사유가 없다
    expect(decide(s, false).log[0].reason).toBeNull() // 내가 거절한 것도 '못 받은' 게 아니다
    const blocked = decide(decide(s, true), true) // 2번째 = STEMI, 순환기 없음
    expect(blocked.log[1].reason).toBe('NO_BACKUP_CARE')
  })

  it('자리를 다 쓰면 남은 콜은 전부 하드락 — 수용을 눌러도 안 받아진다', () => {
    // 병상 3 · 워크인 5통 → 3통까지만 받히고 나머지 2통은 구조가 거절한다.
    const queue = [walkin, walkin, walkin, walkin, walkin]
    let s = initReceiving(hospitalOf(collaborator), queue)
    expect(s.bedsFree).toBe(3)
    for (let i = 0; i < 5; i++) s = decide(s, true) // 전부 수용 시도

    expect(s.bedsFree).toBe(0)
    expect(s.log.filter((e) => e.accepted)).toHaveLength(3)
    expect(s.log.slice(3).every((e) => e.disposition === 'HARDLOCK_REJECT')).toBe(true)
    expect(s.log.slice(3).every((e) => !e.accepted)).toBe(true)
  })

  it('자리를 미용으로 채우면 그 뒤 STEMI는 못 받는다 — 미용 +8억의 진짜 가격', () => {
    const conscience = hospitalOf(conscientious) // 순환기 있음 = STEMI 자격 있음
    let s = initReceiving(conscience, [walkin, walkin, walkin, stemi])
    for (let i = 0; i < 3; i++) s = decide(s, true) // 미용으로 자리를 다 채운다
    expect(s.bedsFree).toBe(0)
    // 자격은 그대로인데 자리가 없다 — 벽의 종류가 바뀐다.
    expect(hardlockReason(conscience, stemi, s.bedsFree)).toBe('NO_BED')
    const after = decide(s, true)
    expect(after.log[3].accepted).toBe(false)
  })
})

describe('decide 리듀서 — 장부·소송 누적', () => {
  it('워크인 수용 → 순이익 델타↑, 소송 노출 0', () => {
    // 첫 콜을 워크인으로 만들기 위해 큐를 직접 구성
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

describe('dayProgress — 하루 진행률(콜 처리분/전체)', () => {
  it('콜 시작(index 0)엔 0, 절반쯤 처리하면 비례', () => {
    const s = initReceiving(hospitalOf(collaborator)) // 5-큐, index 0
    expect(dayProgress(s)).toBe(0)
    const s2 = decide(decide(s, false), false) // index 2
    expect(dayProgress(s2)).toBeCloseTo(0.4)
  })

  it('완료(done)엔 1', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false)
    expect(dayProgress(s)).toBe(1)
  })

  it('빈 큐(콜 없음)는 하루 완료로 보아 1 — 기존 러닝 계산 회귀 방지', () => {
    expect(dayProgress(initReceiving(hospitalOf(collaborator), []))).toBe(1)
  })
})

describe('accruedSegments — 부문 손익의 오늘치를 진행률만큼 0에서 누적', () => {
  // collaborator = 미용 3명(70×3=210) + 검진 2명(40×2=80) — 이 숫자는 **이번 주 7일 전체** 손익이다.
  // 하루치 = 1/7 (미용 30 · 검진 11.43).
  it('콜 시작(index 0)엔 전 부문 0(진료 전인데 이미 벌지 않는다)', () => {
    const s = initReceiving(hospitalOf(collaborator))
    expect(accruedSegments(s).every((x) => x.profitBillions === 0)).toBe(true)
  })

  it('하루 완료(done)엔 주간 손익의 1/7에 도달 — 전액이 아니다', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false)
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitBillions).toBe(30) // 210 / 7
    expect(accruedSegments(s).find((x) => x.label === '건강검진')!.profitBillions).toBe(11) // 80/7=11.43
  })

  it('진행률만큼 비례 누적(반올림)', () => {
    const s = decide(initReceiving(hospitalOf(collaborator)), false) // index 1 → 진행률 0.2
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitBillions).toBe(6) // 210 / 7 × 0.2
  })

  it('7일치를 합하면 주간 전액에 도달 — 결말 장부(composeLedger 전액)와 어긋나지 않는다', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false)
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitBillions * DAYS_PER_WEEK).toBe(210) // 30 × 7 = 주간 전액
  })
})

describe('runningNetProfit — 오늘 순이익(부문 손익 오늘치 + 오늘 진료 수익)', () => {
  it('콜 시작(index 0)엔 러닝 순이익이 0에서 출발(정적 선반영 제거)', () => {
    const s = initReceiving(hospitalOf(collaborator)) // 주간 합 290이지만 진행률 0
    expect(runningNetProfit(s)).toBe(0)
  })

  it('하루 완료(전부 거절)엔 주간 부문 손익의 1/7 합과 일치', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false) // 델타 0
    expect(runningNetProfit(s)).toBe(41) // 미용 30 + 검진 11
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

describe('응급 다양화 — 4종 필수 응급이 각 배후과를 요구한다(슬라이스 B)', () => {
  it('네 종류 모두 한 주 큐에 등장한다 — 다양화가 실제로 콜에 반영', () => {
    const kinds = new Set(
      Array.from({ length: DAYS_PER_WEEK }, (_, i) => createCallQueue(i + 1)).flatMap((q) => q.map((c) => c.kind)),
    )
    for (const { kind } of CRITICAL) expect(kinds.has(kind)).toBe(true)
  })

  it('배후과 없으면 NO_BACKUP_CARE, 있으면(2명) 받는다 — adjudicate 제네릭 재사용(판정 무변경)', () => {
    const noBackup = hospitalOf(collaborator) // 미용/검진만 — 어떤 배후과도 없다
    for (const { kind, dept } of CRITICAL) {
      const day = { ...dayCall(kind), nightShift: false }
      expect(hardlockReason(noBackup, day, 3)).toBe('NO_BACKUP_CARE')
      expect(hardlockReason(hospitalWith(dept, 2), day, 3)).toBeNull()
    }
  })

  it('배후과 1명 + 야간 → NO_NIGHT_BACKUP (과는 있는데 당직이 빈다), 2명이면 받는다', () => {
    for (const { kind, dept } of CRITICAL) {
      const night = { ...dayCall(kind), nightShift: true }
      expect(hardlockReason(hospitalWith(dept, 1), night, 3)).toBe('NO_NIGHT_BACKUP')
      expect(hardlockReason(hospitalWith(dept, 2), night, 3)).toBeNull()
    }
  })

  it('자리 0이면 배후과 유무와 무관하게 NO_BED — 게이트 우선순위 유지', () => {
    for (const { kind, dept } of CRITICAL) {
      expect(hardlockReason(hospitalWith(dept, 2), dayCall(kind), 0)).toBe('NO_BED')
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

  it('네 종류 모두 lawsuitRisk=true(필수·고위험), 일반응급·워크인은 false', () => {
    for (const { kind } of CRITICAL) expect(dayCall(kind).lawsuitRisk).toBe(true)
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      const q = createCallQueue(d)
      expect(q.filter((c) => c.kind === 'GENERAL_EMERGENCY').every((c) => !c.lawsuitRisk)).toBe(true)
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

  it('여전히 하루 5통이고 야간은 마지막 2통 — 시간대 파생 규칙 보존', () => {
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      const q = createCallQueue(d)
      expect(q).toHaveLength(5)
      expect(q.map((c) => c.nightShift)).toEqual([false, false, false, true, true])
    }
  })
})
