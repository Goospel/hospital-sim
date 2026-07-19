import type { RejectionReason, CallKind, IncomingCall } from './types'
import type { CallDisposition } from './receiving'

// 확정된 판정(코드)을 받는 쪽(내 병원) 담당자의 "대사"로 옮기는 결정론적 폴백.
// LLM이 붙기 전에도 게임이 돌아가고, 붙은 뒤에도 무키·실패 시 여기로 강등된다.
// 대사는 판정을 바꾸지 못한다 — 이미 정해진 결과를 연기할 뿐이다.

// ── 받는 쪽(내 병원) 다크코미디 폴백 ──
// 톤: 명랑한 시스템 대사와 인간의 대가 사이의 낙차. 과녁은 시스템의 태연함이지 환자가 아니다.

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
  COSMETIC_WALKIN: '물론이죠! 바로 접수해 드릴게요',
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
