// 폴백 디렉터 — **LLM이 없어도 이야기는 굴러간다.**
//
// 스토리텔러(LLM)가 무키·타임아웃·치역 밖 응답으로 못 쓰이면 이 파일이 그 자리를 대신한다:
// 시드 결정론 가중 랜덤으로 "오늘 이벤트가 있는가 / 무엇인가"를 고른다. 효과·전제는 여기
// 소관이 아니다(events.ts) — 이 파일이 하는 일은 **선택**뿐이고, 그래서 LLM 경로와 이 경로가
// 같은 종류를 고르면 전이는 완전히 같아진다.
//
// 위상: `events`(leaf) ← `patientFlow` ← **여기**. 시드 폴딩을 patientFlow에서 값으로 당기므로
// 이 파일은 leaf가 아니고, 그래서 이벤트 효과(events.ts)와 반드시 다른 파일이라야 한다(T-093).
import { seededUnit } from '../game/daysim'
import { minuteStreamSeed } from './patientFlow'
import { EVENT_KINDS, isEligibleEvent, type SimEventKind } from './events'
import type { SimWorld } from './world'

/** 이벤트 **발생** 스트림 전용 salt(43) — 등재처는 `daysim.callSeed` 주석이고 **거기가 레지스트리의
 *  단일 출처**다. 사용 중인 값 목록을 여기 복제하지 않는다: 복제본은 다른 파일이 새 salt를 열 때
 *  갱신되지 않아 조용히 낡고, 그걸 믿고 고른 값이 이미 쓰인 salt와 겹치면 두 스트림이 통째로
 *  같아진다(에러 없는 분포 붕괴 — 이 저장소가 세 번 경고한 이중 기재). */
const EVENT_ROLL_SALT = 43

/** 이벤트 **종류** 스트림 전용 salt — 발생 판정(43)과 반드시 다른 축이다.
 *  같은 salt면 두 시드가 통째로 같아지고, 이벤트가 성립한 날은 정의상
 *  `seededUnit < EVENT_PROB_PER_DAY`(0.25)라 **오는 이벤트가 전부 첫 구간(대량 응급)**이 된다 —
 *  30/30/25/15가 100/0/0/0으로 붕괴하는데 에러는 하나도 안 난다(희망 과·응급 종류와 같은 병). */
const EVENT_KIND_SALT = 47

/** 하루에 이벤트가 붙을 확률(각색·튜닝값) — 한 주 7일이면 기대 1.75일이다.
 *  더 올리면 이벤트가 평시가 되어 "속보"의 질감이 사라지고, 더 내리면 한 판(12주) 동안
 *  종류를 다 못 본다. */
export const EVENT_PROB_PER_DAY = 0.25

/** 이벤트 종류 분포 — 값은 각 구간의 **누적 상한**이고 배열 순서가 곧 구간 순서라 결정론의
 *  일부다(`patientFlow.ARRIVAL_DEPT_MIX`·`emergency.EMERGENCY_KIND_MIX`와 같은 형태).
 *  마지막 값 1.00이 곧 "합계 1" 검사다. */
export const EVENT_MIX: ReadonlyArray<readonly [SimEventKind, number]> = [
  ['MASS_CASUALTY', 0.30],
  ['EPIDEMIC', 0.60],
  ['NEARBY_CLOSURE', 0.85],
  ['LAWSUIT', 1.00],
]

/** [0,1) 난수 → 이벤트 종류. 구간은 아래가 닫히고 위가 열린다(`u < upper`).
 *  치역 밖이면 마지막으로 접지 않고 던진다 — 접으면 상한 표가 틀려도(마지막이 0.9 따위)
 *  소송이 조용히 늘어날 뿐 아무도 모른다(pickWantsDept·pickEmergencyKind와 같은 잣대). */
export function pickEventKind(u: number): SimEventKind {
  if (u >= 0) for (const [kind, upper] of EVENT_MIX) if (u < upper) return kind
  throw new Error(`pickEventKind: [0,1) 밖의 값(${u}) — seededUnit의 치역을 벗어났다`)
}

/** 발생 판정 시드(salt 43) — 도착·희망 과·응급과 **다른 축**이다. */
export function eventRollSeed(w: SimWorld): number {
  return minuteStreamSeed(w, EVENT_ROLL_SALT)
}

/** 종류 시드(salt 47) — 발생 판정과 다른 축이다(EVENT_KIND_SALT 주석). */
export function eventKindSeed(w: SimWorld): number {
  return minuteStreamSeed(w, EVENT_KIND_SALT)
}

/** 지금 이 세계에 설 수 있는 이벤트 — LLM에게 보여줄 후보 목록이자 응답 검증의 치역이다.
 *  전제는 `events.isEligibleEvent`가 단일 출처다(적용 시 방어와 같은 함수). */
export function eligibleEvents(w: SimWorld): SimEventKind[] {
  return EVENT_KINDS.filter(kind => isEligibleEvent(w, kind))
}

/**
 * 오늘 무슨 일이 있는가 — 없으면 `null`.
 *
 * ⚠️ **minute 0 세계에서만 부를 수 있다**(아침 전이 직후가 그 자리다). 시드 폴딩이 분을
 * 더하므로 하루 중간에 부르면 **조용히 다른 이벤트**가 나오고, 그 배선 실수는 "그날 이벤트가
 * 좀 달랐다"로만 나타나 아무도 못 잡는다. 그래서 계약을 주석이 아니라 throw로 세운다.
 *
 * ⚠️ **뽑힌 종류가 전제 미달이면 그날은 이벤트가 없다 — 재추첨하지 않는다.** 재추첨은 전제
 * 미달이 다른 이벤트의 확률을 올리는 커플링을 만든다: 병동을 안 지은 병원일수록 전염병이
 * 잦아지는 식으로, 아무도 의도하지 않은 인과가 생기고 상한 표의 30/30/25/15가 거짓이 된다.
 * 불발은 손해가 아니라 **조용한 하루**다.
 */
export function fallbackDirectorChoice(w: SimWorld): SimEventKind | null {
  if (w.minute !== 0) {
    throw new Error(`fallbackDirectorChoice: minute 0이 아닌 세계(${w.minute}) — 아침 전이 직후에만 부른다`)
  }
  if (seededUnit(eventRollSeed(w)) >= EVENT_PROB_PER_DAY) return null
  const kind = pickEventKind(seededUnit(eventKindSeed(w)))
  return isEligibleEvent(w, kind) ? kind : null
}
