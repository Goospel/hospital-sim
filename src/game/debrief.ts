import type { GameState, TransferAttempt } from './round'
import type { RejectionReason } from './types'
import { adjudicateTransfer } from './adjudicate'
import { REJECTION_LABEL } from './labels'

// 인과 디브리핑 — 한 판의 로그에서 "구조 변수"를 결정론적으로 산출한다.
//
// 원칙(판정=코드): 디브리핑도 순수 함수다. 같은 로그는 같은 해설을 낳는다.
// 논지: 결과를 가른 건 플레이어의 설득·속도가 아니라 배후진료(최종치료) 역량의 유무다.
// 그래서 두 개의 반사실을 나란히 둔다 — '당신을 바꿨다면'(불변) vs '구조를 바꿨다면'(가변).

export type EndOutcome = 'ACCEPTED' | 'DIED'

export interface StructuralFinding {
  key: 'BACKUP_BOTTLENECK' | 'BEDS_NOT_THE_PROBLEM' | 'CAPACITY_SCARCITY'
  headline: string
  detail: string
}

/** 반사실 1쌍 — 개인 축은 결과를 못 바꾸고, 구조 축은 바꾼다. */
export interface Counterfactual {
  personalChangesOutcome: boolean // 항상 false: 설득·속도는 판정 함수의 입력이 아니다
  structuralChangesOutcome: boolean // 배후진료 한 곳만 더 있었다면 결과가 달라지는가
  personal: string // "당신을 바꿨다면"
  structural: string // "구조를 바꿨다면"
}

export interface Debrief {
  outcome: EndOutcome
  rejectionCount: number
  dominantReason: RejectionReason | null // 최다 거절 사유(지배 병목)
  bedsAvailableButRejected: number // 병상이 있었는데 거절당한 병원 수
  backupCapableCount: number // 해당 과 배후진료를 표방한 병원 수
  actuallyAcceptableCount: number // 모든 게이트를 통과해 실제로 받을 수 있던 병원 수
  secondsSpent: number
  goldenSeconds: number
  findings: StructuralFinding[]
  counterfactual: Counterfactual
  landing: string
}

/** 거절 기록들 중 최다 사유. 동수면 먼저 등장한 사유가 이긴다(결정론). 거절이 없으면 null. */
function dominantReason(rejections: TransferAttempt[]): RejectionReason | null {
  const counts = new Map<RejectionReason, number>()
  for (const r of rejections) {
    const reason = r.verdict.reason
    if (!reason) continue
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  let best: RejectionReason | null = null
  let bestCount = 0
  for (const [reason, count] of counts) {
    if (count > bestCount) {
      best = reason
      bestCount = count
    }
  }
  return best
}

export function buildDebrief(state: GameState): Debrief {
  if (state.status !== 'ACCEPTED' && state.status !== 'DIED') {
    throw new Error(`debrief requires a finished game, got: ${state.status}`)
  }
  const outcome: EndOutcome = state.status
  const { patient, hospitals, timer, attempts } = state

  const rejections = attempts.filter((a) => !a.verdict.accepted)
  const rejectionCount = rejections.length

  const bedById = new Map(hospitals.map((h) => [h.id, h.beds]))
  const bedsAvailableButRejected = new Set(
    rejections.filter((r) => (bedById.get(r.hospitalId) ?? 0) > 0).map((r) => r.hospitalId),
  ).size

  const backupCapableCount = hospitals.filter((h) =>
    h.backupCare.includes(patient.requiredSpecialty),
  ).length
  const actuallyAcceptableCount = hospitals.filter(
    (h) => adjudicateTransfer(h, patient).accepted,
  ).length

  // 구조 레버: 병상·당직·과밀을 이미 통과하고 '배후진료 불가'로만 막힌 병원이 있으면,
  // 그 한 곳에 배후진료가 있었을 때 즉시 수용으로 뒤집힌다.
  const structuralChangesOutcome = hospitals.some(
    (h) => adjudicateTransfer(h, patient).reason === 'NO_BACKUP_CARE',
  )

  const dominant = dominantReason(rejections)
  const secondsSpent = timer.totalSeconds - timer.remainingSeconds

  const findings: StructuralFinding[] = []
  if (rejectionCount > 0 && dominant) {
    findings.push({
      key: 'BACKUP_BOTTLENECK',
      headline: `지배 병목: ${REJECTION_LABEL[dominant]}`,
      detail:
        dominant === 'NO_BACKUP_CARE'
          ? `${rejectionCount}번의 거절에서 가장 많이 들은 말은 '배후진료 불가' — 자리가 아니라 최종치료를 할 수 없어 못 받은 것입니다.`
          : `${rejectionCount}번의 거절 중 최다 사유는 '${REJECTION_LABEL[dominant]}'였습니다.`,
    })
  }
  if (bedsAvailableButRejected > 0) {
    findings.push({
      key: 'BEDS_NOT_THE_PROBLEM',
      headline: '병상은 문제가 아니었다',
      detail: `거절한 병원 중 ${bedsAvailableButRejected}곳은 병상이 있었습니다. 자리가 없어서가 아니라, 받아도 치료할 역량이 없어서였습니다.`,
    })
  }
  findings.push({
    key: 'CAPACITY_SCARCITY',
    headline: '받아줄 수 있는 곳은 처음부터 하나뿐이었다',
    detail: `순환기 배후진료를 표방한 곳은 ${backupCapableCount}곳이었지만, 병상·과밀·당직까지 다 통과해 실제로 받을 수 있던 곳은 ${actuallyAcceptableCount}곳뿐이었습니다.`,
  })

  const counterfactual: Counterfactual = {
    personalChangesOutcome: false,
    structuralChangesOutcome,
    personal:
      '당신이 더 빨리 돌리고 더 간절히 매달렸어도 결과는 같았습니다. 수화기 너머의 판단은 당신의 말로 바뀌지 않습니다.',
    structural:
      '이 지역에 배후진료(순환기 중재)가 가능한 병원이 한 곳만 더 있었다면, 첫 통화에서 이미 끝났을 판이었습니다.',
  }

  const landing =
    outcome === 'DIED'
      ? '당신의 판단은 틀리지 않았습니다. 바뀌어야 했던 건 당신이 아니라, 받아줄 구조였습니다.'
      : '당신은 살렸습니다. 그러나 받아줄 곳은 단 하나뿐이었습니다 — 다음 환자에게도 그 자리가 비어 있으리란 보장은 없습니다.'

  return {
    outcome,
    rejectionCount,
    dominantReason: dominant,
    bedsAvailableButRejected,
    backupCapableCount,
    actuallyAcceptableCount,
    secondsSpent,
    goldenSeconds: timer.totalSeconds,
    findings,
    counterfactual,
    landing,
  }
}
