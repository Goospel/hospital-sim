import type { RejectionReason, TransferVerdict, CallKind, IncomingCall } from './types'
import type { CallDisposition } from './receiving'

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
  // 과가 **없는 게 아니라** 지금 당직이 비었다 — NO_BACKUP_CARE와 섞이면 대사가 사실과 어긋난다.
  NO_NIGHT_BACKUP: [
    '순환기 당직이 오늘 밤은 안 섭니다. 낮에 오셨으면 받았을 겁니다.',
    '심장 시술팀이 야간 당직을 못 세웁니다. 한 명으로는 24시간이 안 돌아가요.',
    '주간에만 카테터실이 돌아갑니다. 지금은 부를 사람이 없어요.',
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
  NO_NIGHT_BACKUP: [
    '순환기 당직이 오늘 밤은 안 섭니다. 낮이었으면 받았습니다.',
    '한 명으로 24시간을 어떻게 세웁니까. 밤엔 부를 사람이 없어요.',
    '몇 번을 말해도 야간 당직은 없습니다. 아침까지 못 기다리는 환자면 다른 데로 가세요.',
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

// ── 1막 받는 쪽(내 병원) 다크코미디 폴백 ──
// 톤: 명랑한 시스템 대사와 인간의 대가 사이의 낙차. 과녁은 시스템의 태연함이지 환자가 아니다.
// (2막·결말은 냉정 — 여기 대사는 1막에서만.)

/** 걸려오는 쪽의 호소(발신자). */
export const CALLER_PLEA: Record<CallKind, string[]> = {
  STEMI: [
    '심근경색 환자입니다. 재관류 가능한 데가 없어요. 받아주실 수 있나요?',
    '벌써 네 번째 병원입니다. 순환기 되는 곳이… 거기 되나요?',
  ],
  GENERAL_EMERGENCY: [
    '복통 응급인데 병상이 없어서요. 자리 하나만 부탁드립니다.',
    '지금 받아줄 곳을 못 찾고 있어요. 입원 가능할까요?',
  ],
  COSMETIC_WALKIN: [
    '보톡스 상담 예약 가능할까요?',
    '검진 패키지 문의드려요. 오늘 접수되나요?',
  ],
}

/**
 * 발신자 호소 대사 선택 — seed로 같은 콜 종류 안에서 변주(결정론).
 * seed가 음수·범위 밖이어도 항상 풀 안의 유효한 대사로 clamp(fallbackLine과 동일 패턴).
 * 대사 선택 로직을 컴포넌트 인라인에서 순수 함수로 통일해 테스트로 잠근다.
 */
export function callerPlea(call: IncomingCall, seed = 0): string {
  const pool = CALLER_PLEA[call.kind]
  const index = ((seed % pool.length) + pool.length) % pool.length
  return pool[index]
}

/**
 * 콜 큐에서 index번째 콜의 호소 대사 — seed로 **같은 kind가 큐에 등장한 순번**(0,1,…)을 넘긴다.
 * callerPlea의 seed는 "같은 콜 종류 안에서의 변주"용이므로, 전역 큐 index가 아니라 kind 내 순번이라야
 * 라벨↔대사가 맞는다. (예: 2번째 COSMETIC_WALKIN='검진 패키지 문의' 콜 → 풀[1]='검진 …', 보톡스 대사 아님.)
 * 전역 index를 넘기면 같은 kind의 여러 콜이 index%len 충돌로 같은/엉뚱한 대사를 집는 버그가 난다.
 */
export function callerPleaAt(queue: IncomingCall[], index: number): string {
  const call = queue[index]
  let occurrence = 0
  for (let i = 0; i < index; i++) {
    if (queue[i].kind === call.kind) occurrence++
  }
  return callerPlea(call, occurrence)
}

/** 수용 시 시스템의 명랑한 확인. */
export const RECEIVE_ACCEPT: Record<CallKind, string> = {
  STEMI: '…받겠습니다. 준비하고 있겠습니다.',
  GENERAL_EMERGENCY: '네, 병상 하나 내드리죠. 보내세요.',
  COSMETIC_WALKIN: '물론이죠! 바로 접수해 드릴게요 🎉',
}

/** 선택 거절 시. */
export const RECEIVE_REJECT: Record<CallKind, string> = {
  STEMI: '죄송합니다. 지금은 저희도 받기가 어렵습니다.',
  GENERAL_EMERGENCY: '지금은 병상을 비워두겠습니다. 다른 곳을 알아보세요.',
  COSMETIC_WALKIN: '오늘은 예약이 다 찼습니다. 다음에 오세요.',
}

/** STEMI인데 내 병원도 순환기 배후가 없어 못 받는다 — 벽을 안쪽에서 배운다. */
export const RECEIVE_HARDLOCK =
  '자리는 있는데, 저희도 순환기 시술팀이 없습니다. 받아도 못 뚫어요.'

/**
 * STEMI인데 순환기는 있고 **야간 당직만** 비었다 — 낮이었으면 받았을 환자다.
 *
 * RECEIVE_HARDLOCK("저희도 순환기 시술팀이 없습니다")을 재사용하면 안 된다. 이 병원엔 있다.
 * 30억을 내고 뽑은 플레이어에게 게임이 거짓말을 하게 된다(T-042 계열 — 층이 다른 사실).
 */
export const RECEIVE_NIGHT_HARDLOCK =
  '순환기 당직이 오늘 밤은 없습니다. 낮이었으면 받았습니다.'

/**
 * 자리 소진(NO_BED) 하드락 — 오늘 진료 역량을 이미 다 썼다.
 * 톤은 1막의 명랑한 태연함 그대로 유지한다. 과녁은 시스템의 태연함이지 환자가 아니다.
 * 앞서 무엇을 받느라 자리가 없어졌는지는 말하지 않는다 — 플레이어가 자기 선택을 스스로 안다(show-don't-tell).
 */
export const RECEIVE_NO_BED =
  '오늘 자리가 다 찼습니다. 더는 못 받아요.'

/**
 * 하드락 사유별 받는 쪽 대사.
 * RECEIVE_HARDLOCK은 "**자리는 있는데**, 저희도 순환기 시술팀이 없습니다"라서 자리 소진에 재사용하면
 * 정면으로 거짓말이 된다 — 사유가 벽의 종류를 정하므로 대사도 사유를 따라간다.
 */
const RECEIVE_HARDLOCK_BY_REASON: Record<RejectionReason, string> = {
  NO_BED: RECEIVE_NO_BED,
  NO_ER_ONCALL: '지금 응급실 당직이 없습니다. 접수 자체가 안 됩니다.',
  ER_OVERCROWDED: '자리는 있어도 응급실이 꽉 차서 지금은 못 받습니다.',
  NO_BACKUP_CARE: RECEIVE_HARDLOCK,
  NO_NIGHT_BACKUP: RECEIVE_NIGHT_HARDLOCK,
}

/**
 * 콜 처리 결과 → 받는 쪽 폴백 대사(순수·결정론).
 * reason은 하드락일 때만 쓰인다 — 없으면 기존 동작(STEMI=배후 부재의 벽)으로 폴백한다.
 * seed는 아직 변주에 쓰이지 않는다(받는 쪽 대사는 종류별 1개) — 호출부 시그니처 유지용.
 */
export function receivingLine(
  call: IncomingCall,
  disposition: CallDisposition,
  accepted: boolean,
  _seed = 0,
  reason?: RejectionReason,
): string {
  if (disposition === 'HARDLOCK_REJECT') {
    if (reason) {
      // 자리 소진은 콜 종류를 안 가린다 — 워크인이든 STEMI든 같은 벽에 막힌다.
      return reason === 'NO_BED' && call.kind === 'COSMETIC_WALKIN'
        ? RECEIVE_REJECT[call.kind] // 워크인엔 '예약이 다 찼습니다'가 이미 정합(명랑 유지)
        : RECEIVE_HARDLOCK_BY_REASON[reason]
    }
    // STEMI 하드락은 배후 부재의 벽, 그 외 하드락은 일반 거절.
    return call.kind === 'STEMI' ? RECEIVE_HARDLOCK : RECEIVE_REJECT[call.kind]
  }
  return accepted ? RECEIVE_ACCEPT[call.kind] : RECEIVE_REJECT[call.kind]
}
