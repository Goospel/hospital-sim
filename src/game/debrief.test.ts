import { describe, it, expect } from 'vitest'
import { buildDebrief } from './debrief'
import { startGame, attemptTransfer, type GameState } from './round'
import { createStemiScenario } from './scenarios'

// 실제 STEMI 판을 굴려 결말 상태를 만든다(디브리핑은 끝난 판만 읽는다).
// 디브리핑은 순수 '팩트 추출기'다 — 해석 카피 없이 숫자만 뱉는다(같은 로그 → 같은 숫자).

/** 배후진료 벽 → 과밀에 부딪히다 골든타임을 소진해 사망한 한 판. */
function playedOutDeath(): GameState {
  const s = createStemiScenario()
  let g = startGame(s.patient, s.hospitals, 180)
  g = attemptTransfer(g, 'h1', 60) // NO_BACKUP_CARE (병상 있음)
  g = attemptTransfer(g, 'h2', 60) // NO_BACKUP_CARE (병상 있음)
  g = attemptTransfer(g, 'h3', 60) // ER_OVERCROWDED → 여기서 골든타임 0 → DIED
  return g
}

/** 배후진료 벽 한 번 부딪힌 뒤 유일한 출구(h6)에 수용된 한 판. */
function playedOutAccept(): GameState {
  const s = createStemiScenario()
  let g = startGame(s.patient, s.hospitals, 180)
  g = attemptTransfer(g, 'h1', 30) // NO_BACKUP_CARE
  g = attemptTransfer(g, 'h6', 30) // 수용
  return g
}

describe('buildDebrief — 결정론 팩트 영수증', () => {
  it('진행중인 판은 디브리핑할 수 없다 — throw', () => {
    const s = createStemiScenario()
    const g = startGame(s.patient, s.hospitals, 180)
    expect(() => buildDebrief(g)).toThrow()
  })

  it('결말(ACCEPTED/DIED)을 그대로 싣고, 소요/골든타임을 계산한다', () => {
    const dead = buildDebrief(playedOutDeath())
    expect(dead.outcome).toBe('DIED')
    expect(dead.goldenSeconds).toBe(180)
    expect(dead.secondsSpent).toBe(180) // 60*3

    const saved = buildDebrief(playedOutAccept())
    expect(saved.outcome).toBe('ACCEPTED')
    expect(saved.secondsSpent).toBe(60) // 30*2
  })

  it('전원 시도 통수 = 전체 콜 횟수(수용 콜 포함)', () => {
    expect(buildDebrief(playedOutDeath()).transferAttempts).toBe(3)
    expect(buildDebrief(playedOutAccept()).transferAttempts).toBe(2)
  })

  it('거절 횟수를 센다', () => {
    expect(buildDebrief(playedOutDeath()).rejectionCount).toBe(3)
    expect(buildDebrief(playedOutAccept()).rejectionCount).toBe(1)
  })

  it('[핵심] 거절을 사유별로 쪼갠다 — 첫 등장 순서(결정론), 합은 거절 횟수와 같다', () => {
    const d = buildDebrief(playedOutDeath())
    // h1·h2 = NO_BACKUP_CARE(먼저 등장), h3 = ER_OVERCROWDED(다음)
    expect(d.rejectionBreakdown).toEqual([
      { reason: 'NO_BACKUP_CARE', count: 2 },
      { reason: 'ER_OVERCROWDED', count: 1 },
    ])
    const sum = d.rejectionBreakdown.reduce((n, r) => n + r.count, 0)
    expect(sum).toBe(d.rejectionCount)
  })

  it('[핵심] 희소성 — 6곳 중 실제 받을 수 있던 곳은 단 1곳', () => {
    const d = buildDebrief(playedOutDeath())
    expect(d.acceptableCount).toBe(1)
    expect(d.hospitalCount).toBe(6)
  })

  it('살린 판도 똑같이 숫자만 — 희소성(1/6)은 그대로 드러난다', () => {
    const d = buildDebrief(playedOutAccept())
    expect(d.outcome).toBe('ACCEPTED')
    expect(d.rejectionBreakdown).toEqual([{ reason: 'NO_BACKUP_CARE', count: 1 }])
    expect(d.acceptableCount).toBe(1)
    expect(d.hospitalCount).toBe(6)
  })

  it('거절 없이 첫 콜에 수용돼도 — 거절 0·집계 빈 배열, 희소성은 여전', () => {
    const s = createStemiScenario()
    let g = startGame(s.patient, s.hospitals, 180)
    g = attemptTransfer(g, 'h6', 20) // 곧장 수용
    const d = buildDebrief(g)
    expect(d.transferAttempts).toBe(1)
    expect(d.rejectionCount).toBe(0)
    expect(d.rejectionBreakdown).toEqual([])
    expect(d.acceptableCount).toBe(1)
    expect(d.hospitalCount).toBe(6)
  })
})
