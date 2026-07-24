import { describe, it, expect } from 'vitest'
import {
  CANDIDATES, HIRE_COST_MULT, SPEED_OF_TIER,
  candidateById, hiringCostOfCandidates, doctorsCountsOf, toggleHired,
} from './candidates'
import { DEPARTMENTS, SETUP_BUDGET_MANWON } from './setup'

describe('CANDIDATES 풀 정합성', () => {
  it('id 전역 유일 · 과별 정확히 4명(신입1·중견2·베테랑1)', () => {
    expect(new Set(CANDIDATES.map((c) => c.id)).size).toBe(CANDIDATES.length)
    for (const d of DEPARTMENTS) {
      const pool = CANDIDATES.filter((c) => c.dept === d.key)
      expect(pool).toHaveLength(4)
      expect(pool.filter((c) => c.tier === 'ROOKIE')).toHaveLength(1)
      expect(pool.filter((c) => c.tier === 'STANDARD')).toHaveLength(2)
      expect(pool.filter((c) => c.tier === 'VETERAN')).toHaveLength(1)
    }
  })

  it('계약금 = 과 앵커 × 티어 배율(반올림) — 하드코딩 값과 DEPARTMENTS의 관계를 강제(이중 기재 방어)', () => {
    for (const c of CANDIDATES) {
      const anchor = DEPARTMENTS.find((d) => d.key === c.dept)!.hireCostManwon
      expect(c.hireCostManwon).toBe(Math.round(anchor * HIRE_COST_MULT[c.tier]))
    }
  })

  it('연차 밴드: 신입 0~2 · 중견 5~9 · 베테랑 12~20, resumeLine 비어있지 않음', () => {
    const band = { ROOKIE: [0, 2], STANDARD: [5, 9], VETERAN: [12, 20] } as const
    for (const c of CANDIDATES) {
      expect(c.careerYears).toBeGreaterThanOrEqual(band[c.tier][0])
      expect(c.careerYears).toBeLessThanOrEqual(band[c.tier][1])
      expect(c.resumeLine.length).toBeGreaterThan(0)
    }
  })

  it('속도: 베테랑 < 중견 < 신입 (진료 소요 배율)', () => {
    expect(SPEED_OF_TIER.VETERAN).toBeLessThan(SPEED_OF_TIER.STANDARD)
    expect(SPEED_OF_TIER.STANDARD).toBeLessThan(SPEED_OF_TIER.ROOKIE)
  })

  it('[밸런스] 필수 6과 베테랑 전원 채용은 예산 초과 — 올 베테랑은 불가능', () => {
    const cost = CANDIDATES
      .filter((c) => c.tier === 'VETERAN' && DEPARTMENTS.find((d) => d.key === c.dept)!.essential)
      .reduce((s, c) => s + c.hireCostManwon, 0)
    expect(cost).toBeGreaterThan(SETUP_BUDGET_MANWON)
  })
})

describe('파생 함수', () => {
  const vetCardio = CANDIDATES.find((c) => c.dept === 'CARDIOLOGY' && c.tier === 'VETERAN')!
  const rookieAesth = CANDIDATES.find((c) => c.dept === 'AESTHETICS' && c.tier === 'ROOKIE')!

  it('hiringCostOfCandidates — 합산, 모르는 id는 0', () => {
    expect(hiringCostOfCandidates([vetCardio.id, rookieAesth.id]))
      .toBe(vetCardio.hireCostManwon + rookieAesth.hireCostManwon)
    expect(hiringCostOfCandidates(['ghost'])).toBe(0)
  })

  it('doctorsCountsOf — 과별 카운트 파생', () => {
    const cardioStd = CANDIDATES.filter((c) => c.dept === 'CARDIOLOGY' && c.tier === 'STANDARD')
    expect(doctorsCountsOf([vetCardio.id, cardioStd[0].id, rookieAesth.id]))
      .toEqual({ CARDIOLOGY: 2, AESTHETICS: 1 })
  })

  it('toggleHired — 채용↔반려 토글, 과별 cap 도달 시 신규 무시, 모르는 id 무시', () => {
    const pool = CANDIDATES.filter((c) => c.dept === 'CARDIOLOGY')
    let hired: string[] = []
    hired = toggleHired(hired, pool[0].id, 3)
    expect(hired).toEqual([pool[0].id])
    hired = toggleHired(hired, pool[0].id, 3) // 반려
    expect(hired).toEqual([])
    hired = [pool[0].id, pool[1].id, pool[2].id]
    expect(toggleHired(hired, pool[3].id, 3)).toEqual(hired) // cap 3 도달 — 불변
    expect(toggleHired(hired, 'ghost', 3)).toEqual(hired)
  })

  it('candidateById — 존재/부재', () => {
    expect(candidateById(vetCardio.id)).toBe(vetCardio)
    expect(candidateById('ghost')).toBeUndefined()
  })
})
