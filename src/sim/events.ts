// 이벤트 카탈로그와 효과 — **결정론 코드가 전부 확정한다.**
//
// 이 파일이 이 슬라이스의 계약선이다: 스토리텔러(LLM)는 *무엇을 언제 던질지 고르고 연출문을
// 쓸* 뿐이고, **효과·전제·가드레일은 여기 코드가 정한다.** 그래서 LLM이 없어도(무키·타임아웃·
// 치역 밖 응답) 게임은 폴백 디렉터로 완주하고, 같은 선택이면 **완전히 같은 전이**가 된다 —
// `applyEvent`가 순수 함수이고 상태 전이 규칙을 바꾸는 경로가 타입 수준에 없기 때문이다
// (LLM이 만질 수 있는 것은 선택지 enum과 연출문 string뿐이다).
//
// **거의 leaf다** — world·dept는 **타입만** 임포트한다. 상위 층(patientFlow·emergency·director)의
// 값을 하나라도 당기면 T-093(값 임포트 순환)에 걸린다: `patientFlow`가 이 파일의 배율을 값으로
// 읽는데, 폴백 디렉터(`director.ts`)는 반대로 patientFlow의 시드 폴딩을 값으로 읽는다.
// 효과(여기)와 선택(director)을 두 파일로 가른 것이 그 순환을 끊는 방법이다.
//
// ⚠️ 예외 하나 — `regions.computeRegions`는 **값으로** 당긴다. 대량 응급의 전제("병동이 있는가")가
// 이제 파생값이라 타입만으로는 못 묻는다. 안전한 이유는 regions.ts 자신이 leaf여서다
// (world의 격자 상수 + dept 타입뿐 — 이 파일로 되돌아오는 경로가 없다). 상위 층을 당기는 것과
// 아래 leaf를 당기는 것은 다른 일이고, 갈리는 지점이 여기다.
import type { DeptMix } from './dept'
import { computeRegions } from './regions'
import type { SimWorld } from './world'

/** 이벤트 종류 — **배열이 단일 출처**이고 유니온은 거기서 파생한다(traits.TRAIT_KEYS와 같은 형태).
 *  전수 순회(`eligibleEvents`·테스트)가 이 배열 하나만 보면 되므로 종류가 늘어도 빠뜨릴 자리가 없다. */
export const EVENT_KINDS = ['MASS_CASUALTY', 'EPIDEMIC', 'NEARBY_CLOSURE', 'LAWSUIT'] as const

export type SimEventKind = (typeof EVENT_KINDS)[number]

export interface SimEventSpec {
  kind: SimEventKind
  /** 화면에 뜨는 이름(속보·공문 질감의 제목). */
  label: string
}

/** 이벤트 카탈로그(각색 — 임상·법률 주장 아님). */
export const SIM_EVENTS: Record<SimEventKind, SimEventSpec> = {
  MASS_CASUALTY: { kind: 'MASS_CASUALTY', label: '대량 응급' },
  EPIDEMIC: { kind: 'EPIDEMIC', label: '전염병 유행' },
  NEARBY_CLOSURE: { kind: 'NEARBY_CLOSURE', label: '인근 병원 폐업' },
  LAWSUIT: { kind: 'LAWSUIT', label: '의료소송' },
}

/** 의료소송 한 건의 즉시 비용(만원) — **돌려보낸 응급이 소송으로 돌아온다.**
 *  다른 이벤트가 배율(확률)로 아픈 것과 달리 이 하나만 금고를 직접 깎는다: 회차는 그 순간
 *  아무 대가가 없어서, 청구서가 며칠 뒤에 오는 형태가 아니면 "돌려보내도 그만"이 된다. */
export const LAWSUIT_COST_MANWON = 800

/** MASS_CASUALTY가 열리는 최소 주차 — 1주차는 유예다(병원이 아직 방 하나짜리일 수 있다). */
export const MASS_CASUALTY_FROM_WEEK = 2

/** 대량 응급 — 응급 도착 확률 배율(1/120 → 1/40). */
export const MASS_CASUALTY_EMERGENCY_MUL = 3
/** 전염병 — 외래 도착 확률 배율. */
export const EPIDEMIC_ARRIVAL_MUL = 1.6
/** 인근 병원 폐업 — 외래 도착 확률 배율(전 과 고르게). */
export const NEARBY_CLOSURE_ARRIVAL_MUL = 1.4

/** 전염병 날의 희망 과 분포 — 평시(45/20/15/20)를 **내과 중심**(75/10/7/8)으로 갈아 끼운다.
 *  누적 상한이고 배열 순서가 곧 구간 순서다(`patientFlow.ARRIVAL_DEPT_MIX`와 같은 기계라
 *  `pickWantsDept` 하나가 둘 다 읽는다). 마지막 값 1.00이 곧 "합계 1" 검사다.
 *
 *  ⚠️ 도착 **확률**과 **믹스**를 함께 흔드는 것이 이 이벤트의 전부다: 확률만 올리면 그냥 바쁜
 *  날이고, 믹스까지 갈려야 "내과가 없는 병원은 이 날 아무것도 못 한다"가 성립한다. */
export const EPIDEMIC_DEPT_MIX: DeptMix = [
  ['INTERNAL_MEDICINE', 0.75],
  ['GENERAL_SURGERY', 0.85],
  ['CARDIOLOGY', 0.92],
  ['AESTHETICS', 1.00],
]

/**
 * 이 이벤트가 이 세계에 **설 수 있는가** — 가드레일의 단일 출처다.
 *
 * `director.eligibleEvents`(LLM에게 보여줄 후보)와 `applyEvent`(적용 시 방어)가 **같은 이 함수**를
 * 부른다. 두 곳에 각자 적으면 후보엔 있는데 적용은 던지는(또는 그 반대의) 조합이 생기고, 그
 * 어긋남은 배선이 실제로 그 종류를 뽑는 날에만 터진다.
 *
 * `default`를 두지 않은 것이 의도다 — 종류가 늘면 여기서 컴파일이 막힌다. `default: true`로
 * 두면 새 이벤트가 **전제 없이** 조용히 통과한다.
 */
export function isEligibleEvent(w: SimWorld, kind: SimEventKind): boolean {
  switch (kind) {
    // 병상 0인 병원에 대량 응급을 떨어뜨리면 플레이어가 할 수 있는 게 하나도 없다(전원 회차).
    // "받을 수 없는 환자는 받을 수 없다"는 하드락이 **불공정**으로 읽히는 유일한 조합이라 막는다.
    case 'MASS_CASUALTY':
      return w.week >= MASS_CASUALTY_FROM_WEEK && computeRegions(w).some(r => r.type === 'WARD')
    // 돌려보낸 응급이 하나도 없으면 소송의 원인이 없다 — 판 누적 카운터라 하루·주로 리셋되지 않는다.
    case 'LAWSUIT':
      return w.turnedAwayTotal >= 1
    case 'EPIDEMIC':
    case 'NEARBY_CLOSURE':
      return true
  }
}

/**
 * 이벤트를 그날 세계에 붙인다(입력 불변 — 순수 함수).
 *
 * **전제 위반이면 던진다.** 정상 흐름에선 파싱 층이 `eligibleEvents`로 먼저 거르므로 도달할 수
 * 없고, 그래서 이 throw는 사용자 입력 검증이 아니라 **배선 버그를 잡는 가드**다 — 조용히 붙이면
 * 가드레일이 통째로 사라진 판이 서고 그 사실은 어느 화면에도 안 뜬다.
 *
 * LAWSUIT만 **즉시 금고를 깎는다**. 나머지는 필드를 세우기만 하고, 효과는 그날 판정식이
 * 배율 함수로 읽어 간다 — 즉 세계 어딘가에 "오늘의 보정치"가 따로 저장되지 않는다(저장하면
 * 이벤트 필드와 보정치가 갈릴 수 있다).
 */
export function applyEvent(w: SimWorld, kind: SimEventKind): SimWorld {
  if (!isEligibleEvent(w, kind)) {
    throw new Error(`applyEvent: 전제를 어긴 이벤트(${kind}) — eligibleEvents로 먼저 걸러야 한다`)
  }
  const next: SimWorld = { ...w, event: { kind } }
  return kind === 'LAWSUIT'
    ? { ...next, treasuryManwon: next.treasuryManwon - LAWSUIT_COST_MANWON }
    : next
}

/** 오늘의 **외래 도착 확률** 배율 — `patientFlow.maybeArrive`가 곱한다. 이벤트가 없으면 1이라
 *  이벤트 없는 날의 도착 스트림은 이 훅이 붙기 전과 **완전히 같다**(기존 결정론 보존). */
export function arrivalProbMulOf(w: SimWorld): number {
  switch (w.event?.kind) {
    case 'EPIDEMIC': return EPIDEMIC_ARRIVAL_MUL
    case 'NEARBY_CLOSURE': return NEARBY_CLOSURE_ARRIVAL_MUL
    default: return 1
  }
}

/** 오늘의 **응급 도착 확률** 배율 — `emergency.emergencyArrivalAt`이 곱한다. */
export function emergencyProbMulOf(w: SimWorld): number {
  return w.event?.kind === 'MASS_CASUALTY' ? MASS_CASUALTY_EMERGENCY_MUL : 1
}

/** 오늘의 희망 과 분포 — 갈아 끼울 게 없으면 `null`이다(호출부가 `?? ARRIVAL_DEPT_MIX`로 받는다).
 *  평시 표를 여기서 돌려주지 않는 이유: 그러면 이 leaf가 patientFlow의 값을 임포트해야 해서
 *  T-093 순환이 그대로 돌아온다. */
export function arrivalDeptMixOf(w: SimWorld): DeptMix | null {
  return w.event?.kind === 'EPIDEMIC' ? EPIDEMIC_DEPT_MIX : null
}
