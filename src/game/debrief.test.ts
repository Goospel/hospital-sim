import { describe, it, expect } from 'vitest'
import { buildDebrief } from './debrief'
import { startGame, attemptTransfer, type GameState } from './round'
import { createStemiScenario } from './scenarios'

// 실제 STEMI 판을 굴려 결말 상태를 만든다(디브리핑은 끝난 판만 읽는다).

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

describe('buildDebrief — 결정론 인과 디브리핑', () => {
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

  it('[핵심] 지배 병목은 배후진료 불가로 집계된다 — 가장 흔한 거절 사유', () => {
    const d = buildDebrief(playedOutDeath())
    expect(d.rejectionCount).toBe(3)
    expect(d.dominantReason).toBe('NO_BACKUP_CARE')
  })

  it('[핵심] 병상은 문제가 아니었다 — 거절한 병원 중 병상이 있던 곳을 센다', () => {
    const d = buildDebrief(playedOutDeath())
    // h1(2)·h2(4)·h3(3) 모두 병상이 있는데도 거절당했다.
    expect(d.bedsAvailableButRejected).toBe(3)
  })

  it('[핵심] 역량 희소성 — 배후진료를 표방한 곳은 여럿이나 실제 받을 수 있던 곳은 단 1곳', () => {
    const d = buildDebrief(playedOutDeath())
    // 순환기 배후진료 표방: h3·h4·h6 = 3곳. 그러나 병상·과밀·당직 다 통과해 실제 수용 가능: h6 뿐.
    expect(d.backupCapableCount).toBe(3)
    expect(d.actuallyAcceptableCount).toBe(1)
  })

  it('[핵심] 반사실 — 당신을 바꿔도 결과는 그대로, 구조(배후진료 +1)를 바꾸면 결과가 달라진다', () => {
    const d = buildDebrief(playedOutDeath())
    // 설득/속도는 판정 함수의 입력이 아니므로 개인 축은 결과를 못 바꾼다.
    expect(d.counterfactual.personalChangesOutcome).toBe(false)
    // 배후진료가 한 곳만 더 있었다면(첫 벽 h1이 병상·당직 이미 통과) 결과가 바뀐다.
    expect(d.counterfactual.structuralChangesOutcome).toBe(true)
  })

  it('반사실의 구조 레버는 배후진료를 가리킨다 — 병상이 아니라(톤 가드레일)', () => {
    const d = buildDebrief(playedOutDeath())
    expect(d.counterfactual.structural).toContain('배후진료')
    expect(d.counterfactual.structural).not.toContain('병상')
  })

  it('살린 판에도 디브리핑이 나오고, 역량 희소성(단 1곳)은 그대로 드러난다', () => {
    const d = buildDebrief(playedOutAccept())
    expect(d.outcome).toBe('ACCEPTED')
    expect(d.actuallyAcceptableCount).toBe(1)
    expect(d.counterfactual.structuralChangesOutcome).toBe(true)
  })

  it('거절 없이 첫 콜에 수용돼도(지배 사유 없음) 구조 희소성은 여전히 드러난다', () => {
    const s = createStemiScenario()
    let g = startGame(s.patient, s.hospitals, 180)
    g = attemptTransfer(g, 'h6', 20) // 곧장 수용
    const d = buildDebrief(g)
    expect(d.rejectionCount).toBe(0)
    expect(d.dominantReason).toBeNull()
    expect(d.actuallyAcceptableCount).toBe(1)
    expect(d.backupCapableCount).toBe(3)
  })

  it('표시용 카피(findings·landing)는 비어 있지 않다', () => {
    const d = buildDebrief(playedOutDeath())
    expect(d.findings.length).toBeGreaterThan(0)
    for (const f of d.findings) {
      expect(f.headline.length).toBeGreaterThan(0)
      expect(f.detail.length).toBeGreaterThan(0)
    }
    expect(d.landing.length).toBeGreaterThan(0)
  })
})
