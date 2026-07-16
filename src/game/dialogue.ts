import type { TransferVerdict } from './types'

// 확정된 판정(코드)을 전원 담당자의 "대사"로 옮기는 결정론적 폴백.
// LLM이 붙기 전에도 게임이 돌아가고, 붙은 뒤에도 무키·실패 시 여기로 강등된다.
// 대사는 판정을 바꾸지 못한다 — 이미 정해진 결과를 연기할 뿐이다.

const ACCEPT_LINES = [
  '…네, 저희가 받겠습니다. 지금 바로 보내세요.',
  '자리 확인됐어요. 출발시키세요, 준비하고 있겠습니다.',
]

const NO_BED_LINES = [
  '지금 중환자실이 다 찼습니다. 받을 자리가 없어요.',
  '병상이 하나도 없습니다. 다른 데를 알아보셔야 해요.',
  '죄송한데 지금 자리가 안 나요. 대기도 어렵습니다.',
]

const NO_SPECIALIST_LINES = [
  '그 환자 볼 당직 전문의가 지금 없습니다. 못 받아요.',
  '담당 과 당직이 비어서요… 저희로는 무리입니다.',
  '전문의가 없어서 받아도 처치를 못 합니다. 죄송합니다.',
]

/** 판정 결과 → 폴백 대사. seed로 같은 사유 안에서 대사를 변주한다(결정론). */
export function fallbackLine(verdict: TransferVerdict, seed = 0): string {
  const pool = verdict.accepted
    ? ACCEPT_LINES
    : verdict.reason === 'NO_BED'
      ? NO_BED_LINES
      : NO_SPECIALIST_LINES
  const index = ((seed % pool.length) + pool.length) % pool.length
  return pool[index]
}

// 매달릴수록(priorAttempts↑) 냉정해지는 응답 — 마지막 단계로 clamp.
// 어떤 말로도 병상·당직은 바뀌지 않는다는 걸 대사로 체감시킨다.
const NO_BED_ESCALATION = [
  '지금 중환자실이 다 찼습니다. 받을 자리가 없어요.',
  '말씀드렸잖아요, 병상이 없습니다. 없는 자리가 생기진 않아요.',
  '몇 번을 말해도 똑같습니다. 시간 버리지 마시고 다른 데 알아보세요.',
]

const NO_SPECIALIST_ESCALATION = [
  '그 환자 볼 당직 전문의가 지금 없습니다. 못 받아요.',
  '전문의가 없다니까요. 받아도 처치를 못 합니다.',
  '안 된다고 말씀드렸습니다. 이러실 시간에 다른 병원을 알아보세요.',
]

/**
 * 거절당한 뒤 "매달릴" 때의 담당자 응답. priorAttempts(그 병원에 이미 시도한 횟수)가
 * 늘수록 냉정해지지만, 판정 자체는 절대 바꾸지 못한다 — 설득으로 병상 0을 뚫을 수 없다.
 */
export function persuasionReply(verdict: TransferVerdict, priorAttempts: number): string {
  if (verdict.accepted) {
    return fallbackLine(verdict, priorAttempts)
  }
  const pool = verdict.reason === 'NO_BED' ? NO_BED_ESCALATION : NO_SPECIALIST_ESCALATION
  const index = Math.min(Math.max(0, priorAttempts), pool.length - 1)
  return pool[index]
}
