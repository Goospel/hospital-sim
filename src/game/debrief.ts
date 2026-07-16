import type { GameState, TransferAttempt } from './round'
import type { RejectionReason } from './types'
import { adjudicateTransfer } from './adjudicate'

// 인과 디브리핑 — 한 판의 로그에서 '사실'만 결정론적으로 산출한다.
//
// 원칙(판정=코드): 디브리핑도 순수 함수다. 같은 로그는 같은 숫자를 낳는다.
// 게임은 결말에서 한마디도 해석하지 않는다 — 숫자만 찍고, 플레이어가 스스로 느낀다.
// (설득/속도는 판정 함수의 입력이 아니므로, 몇 번을 매달렸든 이 숫자는 안 바뀐다.)

export type EndOutcome = 'ACCEPTED' | 'DIED'

/** 거절 사유별 집계 한 줄. */
export interface RejectionTally {
  reason: RejectionReason
  count: number
}

export interface Debrief {
  outcome: EndOutcome
  transferAttempts: number // 전원 콜 총 횟수(수용 콜 포함)
  rejectionCount: number
  rejectionBreakdown: RejectionTally[] // 사유별 집계 — 첫 등장 순서(결정론)
  acceptableCount: number // 모든 게이트를 통과해 실제 받을 수 있던 병원 수
  hospitalCount: number // 전체 병원 수(희소성 분모)
  secondsSpent: number
  goldenSeconds: number
}

/** 거절 기록들을 사유별로 센다 — 첫 등장 순서 유지(Map 삽입 순서 = 결정론). */
function tallyRejections(rejections: TransferAttempt[]): RejectionTally[] {
  const counts = new Map<RejectionReason, number>()
  for (const r of rejections) {
    const reason = r.verdict.reason
    if (!reason) continue
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts].map(([reason, count]) => ({ reason, count }))
}

export function buildDebrief(state: GameState): Debrief {
  if (state.status !== 'ACCEPTED' && state.status !== 'DIED') {
    throw new Error(`debrief requires a finished game, got: ${state.status}`)
  }
  const outcome: EndOutcome = state.status
  const { patient, hospitals, timer, attempts } = state

  const rejections = attempts.filter((a) => !a.verdict.accepted)
  const acceptableCount = hospitals.filter(
    (h) => adjudicateTransfer(h, patient).accepted,
  ).length

  return {
    outcome,
    transferAttempts: attempts.length,
    rejectionCount: rejections.length,
    rejectionBreakdown: tallyRejections(rejections),
    acceptableCount,
    hospitalCount: hospitals.length,
    secondsSpent: timer.totalSeconds - timer.remainingSeconds,
    goldenSeconds: timer.totalSeconds,
  }
}
