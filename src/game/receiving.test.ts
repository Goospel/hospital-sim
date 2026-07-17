import { describe, it, expect } from 'vitest'
import {
  createCallQueue, classifyCall, initReceiving, decide, runningNetProfit,
  quarterProgress, accruedSegments,
} from './receiving'
import type { ReceivingState } from './receiving'
import { buildHospital } from './setup'
import type { Hospital, SetupChoices } from './types'

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

function hospitalOf(c: SetupChoices): Hospital {
  return buildHospital(c).hospital
}

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

describe('classifyCall — 하드락 vs 선택', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!
  const general = q.find((c) => c.kind === 'GENERAL_EMERGENCY')!

  it('워크인은 늘 CHOICE(명랑하게 받을 수 있음)', () => {
    expect(classifyCall(hospitalOf(collaborator), walkin)).toBe('CHOICE')
  })

  it('STEMI: 순환기 없으면 하드락, 있으면 선택', () => {
    expect(classifyCall(hospitalOf(collaborator), stemi)).toBe('HARDLOCK_REJECT')
    expect(classifyCall(hospitalOf(conscientious), stemi)).toBe('CHOICE')
  })

  it('일반응급: 병상+응급실 있으면 선택(배후 무관)', () => {
    expect(classifyCall(hospitalOf(collaborator), general)).toBe('CHOICE')
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

  it('양수 — 부문 손익 합 + 분기 델타', () => {
    const s = stateWith(
      [
        { label: 'A', profitBillions: 10 },
        { label: 'B', profitBillions: 5 },
      ],
      3,
    )
    expect(runningNetProfit(s)).toBe(18)
  })

  it('음수 — 부문 손익 합이 음수여도 그대로 더한다', () => {
    const s = stateWith([{ label: 'A', profitBillions: -20 }], -4)
    expect(runningNetProfit(s)).toBe(-24)
  })

  it('segments 없음(economics undefined) — 분기 델타만', () => {
    const s = stateWith(undefined, 7)
    expect(runningNetProfit(s)).toBe(7)
  })
})

describe('quarterProgress — 분기 진행률(콜 처리분/전체)', () => {
  it('콜 시작(index 0)엔 0, 절반쯤 처리하면 비례', () => {
    const s = initReceiving(hospitalOf(collaborator)) // 5-큐, index 0
    expect(quarterProgress(s)).toBe(0)
    const s2 = decide(decide(s, false), false) // index 2
    expect(quarterProgress(s2)).toBeCloseTo(0.4)
  })

  it('완료(done)엔 1', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false)
    expect(quarterProgress(s)).toBe(1)
  })

  it('빈 큐(콜 없음)는 분기 완료로 보아 1 — 기존 러닝 계산 회귀 방지', () => {
    expect(quarterProgress(initReceiving(hospitalOf(collaborator), []))).toBe(1)
  })
})

describe('accruedSegments — 부문 손익을 진행률만큼 0에서 누적', () => {
  // collaborator = 미용 3명(70×3=210) + 검진 2명(40×2=80).
  it('콜 시작(index 0)엔 전 부문 0(진료 전인데 이미 벌지 않는다)', () => {
    const s = initReceiving(hospitalOf(collaborator))
    expect(accruedSegments(s).every((x) => x.profitBillions === 0)).toBe(true)
  })

  it('완료(done)엔 전체 구조 손익에 도달', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false)
    expect(accruedSegments(s)).toEqual(s.hospital.economics!.segments)
  })

  it('진행률만큼 비례 누적(반올림)', () => {
    const s = decide(initReceiving(hospitalOf(collaborator)), false) // index 1 → 진행률 0.2
    const aesthetic = accruedSegments(s).find((x) => x.label === '미용·피부')!
    expect(aesthetic.profitBillions).toBe(42) // 210 × 0.2
  })
})

describe('runningNetProfit — 부문 손익도 진행률 누적(콜 시작 0에서 출발)', () => {
  it('콜 시작(index 0)엔 러닝 순이익이 0에서 출발(정적 선반영 제거)', () => {
    const s = initReceiving(hospitalOf(collaborator)) // 정적 합 290이지만 진행률 0
    expect(runningNetProfit(s)).toBe(0)
  })

  it('완료(전부 거절)엔 전체 부문 손익 합과 일치', () => {
    let s = initReceiving(hospitalOf(collaborator))
    for (let i = 0; i < 5; i++) s = decide(s, false) // 델타 0
    const full = s.hospital.economics!.segments.reduce((n, x) => n + x.profitBillions, 0)
    expect(runningNetProfit(s)).toBe(full) // 290
  })
})
