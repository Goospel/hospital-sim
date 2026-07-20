import type { RejectionReason, CallKind, IncomingCall, Specialty } from './types'
import { isCriticalEmergency, type CallDisposition } from './receiving'

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
  OBSTETRIC_EMERGENCY: [
    '분만 중인데 산부인과가 없어서요. 산모를 받아주실 수 있나요?',
    '태반조기박리 의심입니다. 분만 되는 데가… 거기 되나요?',
  ],
  NEURO_EMERGENCY: [
    '뇌출혈 의심 환자입니다. 신경외과 수술이 급해요. 받아주실 수 있나요?',
    '의식이 떨어지고 있어요. 신경외과 되는 곳을 못 찾고 있습니다.',
  ],
  TRAUMA_EMERGENCY: [
    '교통사고 중증외상입니다. 수술할 외과가 없어서요. 받아주실 수 있나요?',
    '다발성 외상이에요. 벌써 몇 군데를 돌았습니다. 거기 되나요?',
  ],
  COSMETIC_WALKIN: [
    '보톡스 상담 예약 가능할까요?',
    '검진 패키지 문의드려요. 오늘 접수되나요?',
  ],
  SPECIALIST_ELECTIVE: [
    '예약된 진료 때문에 연락드렸습니다. 오늘 시간 괜찮으실까요?',
    '정기 진료 예약 확인차 연락드려요.',
  ],
}

/**
 * 발신자 호소 대사 선택 — seed로 같은 콜 종류 안에서 변주(결정론).
 * seed가 음수·범위 밖이어도 항상 풀 안의 유효한 대사로 clamp한다(아래 % 이중 모듈로).
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
  OBSTETRIC_EMERGENCY: '…받겠습니다. 분만 준비하겠습니다.',
  NEURO_EMERGENCY: '…받겠습니다. 수술방 열어두겠습니다.',
  TRAUMA_EMERGENCY: '…받겠습니다. 외상팀 부르겠습니다.',
  GENERAL_EMERGENCY: '네, 병상 하나 내드리죠. 보내세요.',
  COSMETIC_WALKIN: '물론이죠! 바로 접수해 드릴게요',
  SPECIALIST_ELECTIVE: '네, 예약대로 진행하겠습니다.',
}

/** 선택 거절 시. */
export const RECEIVE_REJECT: Record<CallKind, string> = {
  STEMI: '죄송합니다. 지금은 저희도 받기가 어렵습니다.',
  OBSTETRIC_EMERGENCY: '죄송합니다. 지금은 저희도 받기가 어렵습니다.',
  NEURO_EMERGENCY: '죄송합니다. 지금은 저희도 받기가 어렵습니다.',
  TRAUMA_EMERGENCY: '죄송합니다. 지금은 저희도 받기가 어렵습니다.',
  GENERAL_EMERGENCY: '지금은 병상을 비워두겠습니다. 다른 곳을 알아보세요.',
  COSMETIC_WALKIN: '오늘은 예약이 다 찼습니다. 다음에 오세요.',
  SPECIALIST_ELECTIVE: '죄송하지만 예약을 다른 날로 옮겨야겠습니다.',
}

/** STEMI인데 내 병원도 순환기 배후가 없어 못 받는다 — 벽을 안쪽에서 배운다. (하위호환 export) */
export const RECEIVE_HARDLOCK =
  '자리는 있는데, 저희도 순환기 시술팀이 없습니다. 받아도 못 뚫어요.'

/**
 * STEMI인데 순환기는 있고 **야간 당직만** 비었다 — 낮이었으면 받았을 환자다. (하위호환 export)
 *
 * RECEIVE_HARDLOCK("저희도 순환기 시술팀이 없습니다")을 재사용하면 안 된다. 이 병원엔 있다.
 * 30억을 내고 뽑은 플레이어에게 게임이 거짓말을 하게 된다(T-042 계열 — 층이 다른 사실).
 */
export const RECEIVE_NIGHT_HARDLOCK =
  '순환기 당직이 오늘 밤은 없습니다. 낮이었으면 받았습니다.'

/**
 * 배후 부재(NO_BACKUP_CARE) 대사 — **그 응급의 배후과를 정확히 지목한다.**
 *
 * 다양화의 핵심 함정: "저희도 순환기 시술팀이 없습니다"를 산부/신경외과/외과 응급에 재사용하면
 * 과가 뒤바뀌어 게임이 거짓말을 한다(T-042 계열 — 층이 다른 사실). 그래서 사유가 벽의 종류를
 * 정하듯, 배후과가 대사의 과를 정한다. call.patient.requiredSpecialty로 조회한다.
 */
const RECEIVE_NO_BACKUP_BY_SPECIALTY: Record<Specialty, string> = {
  CARDIOLOGY: RECEIVE_HARDLOCK,
  OBSTETRICS: '자리는 있는데, 저희도 분만을 받을 산부인과가 없습니다.',
  NEUROSURGERY: '자리는 있는데, 저희도 신경외과가 없습니다. 받아도 수술을 못 해요.',
  GENERAL_SURGERY: '자리는 있는데, 저희도 중증외상을 감당할 외과가 없습니다.',
  THORACIC_SURGERY: '자리는 있는데, 저희도 흉부외과가 없습니다.',
  INTERNAL_MEDICINE: '자리는 있는데, 저희도 입원 진료할 내과가 없습니다.',
}

/** 야간 당직 공백(NO_NIGHT_BACKUP) 대사 — 과는 있는데 밤에 당직이 빈다(배후 부재와 다른 사유). */
const RECEIVE_NIGHT_BY_SPECIALTY: Record<Specialty, string> = {
  CARDIOLOGY: RECEIVE_NIGHT_HARDLOCK,
  OBSTETRICS: '산부인과 당직이 오늘 밤은 없습니다. 낮이었으면 받았습니다.',
  NEUROSURGERY: '신경외과 당직이 오늘 밤은 없습니다. 낮이었으면 받았습니다.',
  GENERAL_SURGERY: '외과 당직이 오늘 밤은 없습니다. 낮이었으면 받았습니다.',
  THORACIC_SURGERY: '흉부외과 당직이 오늘 밤은 없습니다. 낮이었으면 받았습니다.',
  INTERNAL_MEDICINE: '내과 당직이 오늘 밤은 없습니다. 낮이었으면 받았습니다.',
}

/**
 * 응급실 축 + 점유 벽 하드락(콜 종류·배후과와 무관한 벽).
 *
 * NO_FREE_SPECIALIST(그 과 의사가 다 진료 중)가 이제 실제 사유로 발생한다(점유 판정 = Task 5) —
 * 배후과 예약이 그 과 의사를 점유해 같은 날 응급을 밀어낸 상황이다. 병상 축(NO_BED)은 제거됐다.
 */
const RECEIVE_BY_STRUCTURAL_REASON: Record<'NO_ER_ONCALL' | 'ER_OVERCROWDED' | 'NO_FREE_SPECIALIST', string> = {
  NO_ER_ONCALL: '지금 응급실 당직이 없습니다. 접수 자체가 안 됩니다.',
  ER_OVERCROWDED: '자리는 있어도 응급실이 꽉 차서 지금은 못 받습니다.',
  NO_FREE_SPECIALIST: '그 과 의사가 지금 다른 진료 중입니다. 예약이 밀려 있어서요.',
}

/**
 * 콜 처리 결과 → 받는 쪽 폴백 대사(순수·결정론).
 * reason은 하드락일 때만 쓰인다 — 없으면 기존 동작(필수 응급=배후 부재의 벽)으로 폴백한다.
 * 배후/야간 사유는 call.patient.requiredSpecialty로 그 응급의 과를 정확히 지목한다(과 뒤바뀜 = 거짓말).
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
    const spec = call.patient.requiredSpecialty
    if (reason) {
      switch (reason) {
        case 'NO_BACKUP_CARE':
          return RECEIVE_NO_BACKUP_BY_SPECIALTY[spec]
        case 'NO_NIGHT_BACKUP':
          return RECEIVE_NIGHT_BY_SPECIALTY[spec]
        default:
          return RECEIVE_BY_STRUCTURAL_REASON[reason]
      }
    }
    // 사유 없이 하드락(하위호환) — 필수 응급이면 배후 부재의 벽, 그 외엔 일반 거절.
    return isCriticalEmergency(call.kind) ? RECEIVE_NO_BACKUP_BY_SPECIALTY[spec] : RECEIVE_REJECT[call.kind]
  }
  return accepted ? RECEIVE_ACCEPT[call.kind] : RECEIVE_REJECT[call.kind]
}
