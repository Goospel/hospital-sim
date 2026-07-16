import type { RejectionReason, TransferVerdict } from './types'

// 확정된 판정(코드)을 전원 담당자의 "대사"로 옮기는 결정론적 폴백.
// LLM이 붙기 전에도 게임이 돌아가고, 붙은 뒤에도 무키·실패 시 여기로 강등된다.
// 대사는 판정을 바꾸지 못한다 — 이미 정해진 결과를 연기할 뿐이다.

const ACCEPT_LINES = [
  '…네, 저희가 받겠습니다. 지금 바로 보내세요.',
  '자리 확인됐어요. 출발시키세요, 준비하고 있겠습니다.',
]

// 사유별 폴백 대사. 각 사유가 "왜 못 받는지"를 서로 다른 결로 드러낸다.
// 특히 NO_BACKUP_CARE 는 "병상이 아니라 시술/처치를 못 한다"는 배후진료 부재가 핵심(리서치 반영).
const REJECTION_LINES: Record<RejectionReason, string[]> = {
  NO_BED: [
    '지금 중환자실이 다 찼습니다. 받을 자리가 없어요.',
    '병상이 하나도 없습니다. 다른 데를 알아보셔야 해요.',
    '죄송한데 지금 자리가 안 나요. 대기도 어렵습니다.',
  ],
  NO_ER_ONCALL: [
    '지금 응급실 당직 의사가 없습니다. 접수 자체가 안 됩니다.',
    '야간이라 응급실을 지킬 사람이 없어요. 환자를 받을 수가 없습니다.',
    '당직이 비어서 지금은 응급환자를 못 받습니다. 죄송합니다.',
  ],
  ER_OVERCROWDED: [
    '자리는 있어도 응급실이 꽉 차서 지금은 못 받습니다.',
    '대기 환자가 복도까지 누워 있어요. 더는 무리입니다.',
    '입원 대기가 밀려 응급실이 포화입니다. 지금은 어렵습니다.',
  ],
  NO_BACKUP_CARE: [
    '자리는 있는데, 심장 시술팀이 지금 다른 시술에 들어가 있습니다. 받아도 못 뚫어요.',
    '카테터실이 지금 안 돌아갑니다. 순환기 시술을 할 사람이 없어요.',
    '입원은 시켜도 급성심근경색 시술을 여기선 못 합니다. 헛걸음이에요.',
  ],
}

/** 판정 결과 → 폴백 대사. seed로 같은 사유 안에서 대사를 변주한다(결정론). */
export function fallbackLine(verdict: TransferVerdict, seed = 0): string {
  const pool = verdict.accepted ? ACCEPT_LINES : REJECTION_LINES[verdict.reason ?? 'NO_BED']
  const index = ((seed % pool.length) + pool.length) % pool.length
  return pool[index]
}

// 매달릴수록(priorAttempts↑) 냉정해지는 응답 — 마지막 단계로 clamp.
// 어떤 말로도 병상·당직·시술팀은 바뀌지 않는다는 걸 대사로 체감시킨다.
const REJECTION_ESCALATION: Record<RejectionReason, string[]> = {
  NO_BED: [
    '지금 중환자실이 다 찼습니다. 받을 자리가 없어요.',
    '말씀드렸잖아요, 병상이 없습니다. 없는 자리가 생기진 않아요.',
    '몇 번을 말해도 똑같습니다. 시간 버리지 마시고 다른 데 알아보세요.',
  ],
  NO_ER_ONCALL: [
    '지금 응급실 당직이 없습니다. 받아놓고 볼 사람이 없어요.',
    '사람이 없다니까요. 없는 인력이 생기진 않습니다.',
    '아무리 말씀하셔도 지킬 의사가 없습니다. 다른 병원을 알아보세요.',
  ],
  ER_OVERCROWDED: [
    '자리는 있어도 응급실이 꽉 차서 지금은 못 받습니다.',
    '복도까지 환자가 밀려 있다니까요. 명목상 병상이 실제 자리는 아닙니다.',
    '지금 받으면 그 환자도 복도에 눕힙니다. 시간 버리지 마세요.',
  ],
  NO_BACKUP_CARE: [
    '자리는 있는데, 심장 시술팀이 다른 시술에 묶여 있습니다. 받아도 못 뚫어요.',
    '자리가 문제가 아니라 시술할 사람이 없다니까요. 받으면 골든타임만 까먹습니다.',
    '몇 번을 말해도 시술팀이 없습니다. 여기 오면 환자만 잃습니다. 다른 데 알아보세요.',
  ],
}

/**
 * 거절당한 뒤 "매달릴" 때의 담당자 응답. priorAttempts(그 병원에 이미 시도한 횟수)가
 * 늘수록 냉정해지지만, 판정 자체는 절대 바꾸지 못한다 — 설득으로 구조의 벽을 뚫을 수 없다.
 */
export function persuasionReply(verdict: TransferVerdict, priorAttempts: number): string {
  if (verdict.accepted) {
    return fallbackLine(verdict, priorAttempts)
  }
  const pool = REJECTION_ESCALATION[verdict.reason ?? 'NO_BED']
  const index = Math.min(Math.max(0, priorAttempts), pool.length - 1)
  return pool[index]
}
