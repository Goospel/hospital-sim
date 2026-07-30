// 이벤트 카탈로그와 효과 — **결정론 코드가 전부 확정한다.**
//
// 이 파일이 이 슬라이스의 계약선이다: 스토리텔러(LLM)는 *무엇을 언제 던질지 고르고 연출문을
// 쓸* 뿐이고, **효과·전제·가드레일은 여기 코드가 정한다.** 그래서 LLM이 없어도(무키·타임아웃·
// 치역 밖 응답) 게임은 폴백 디렉터로 완주하고, 같은 선택이면 **완전히 같은 전이**가 된다 —
// `applyEvent`가 순수 함수이고 상태 전이 규칙을 바꾸는 경로가 타입 수준에 없기 때문이다
// (LLM이 만질 수 있는 것은 선택지 enum과 연출문 string뿐이다).
//
// **거의 leaf다** — dept는 **타입만**, world는 타입 + 카탈로그 조회(simRegion) 하나뿐이다. 상위 층(patientFlow·emergency·director)의
// 값을 하나라도 당기면 T-093(값 임포트 순환)에 걸린다: `patientFlow`가 이 파일의 배율을 값으로
// 읽는데, 폴백 디렉터(`director.ts`)는 반대로 patientFlow의 시드 폴딩을 값으로 읽는다.
// 효과(여기)와 선택(director)을 두 파일로 가른 것이 그 순환을 끊는 방법이다.
//
// ⚠️ 예외 하나 — `regions.computeRegions`는 **값으로** 당긴다. 대량 응급의 전제("병동이 있는가")가
// 이제 파생값이라 타입만으로는 못 묻는다. 안전한 이유는 regions.ts 자신이 leaf여서다
// (world의 격자 상수 + dept 타입뿐 — 이 파일로 되돌아오는 경로가 없다). 상위 층을 당기는 것과
// 아래 leaf를 당기는 것은 다른 일이고, 갈리는 지점이 여기다.
import type { DeptMix, SimDeptKey } from './dept'
import { computeRegions } from './regions'
// ⚠️ 예외 둘 — `pawn`도 **값으로** 당긴다(priorityOf·setDoctorPriority). 위축이 우선순위를
// 건드리는데 그 읽기·쓰기 규칙을 여기 복제하면 폴백(?? 2)과 범위 검사가 두 벌이 된다.
// 안전한 이유는 regions와 같다: pawn은 world·dept·traits·path만 보고 이 파일로 되돌아오지
// 않는다(world→events는 타입 전용이라 그 경유로도 런타임 순환이 없다).
import { priorityOf, setDoctorPriority, type Pawn, type Priority } from './pawn'
// ⚠️ world를 **값으로도** 당긴다(simRegion) — 이 파일이 "거의 leaf"인 상태는 그대로다:
// world→events는 타입 전용이라(world.ts:5) 런타임 순환이 없고, computeRegions와 같은 예외다.
import { simRegion, tileIndex, type SimWorld } from './world'

/** 이벤트 종류 — **배열이 단일 출처**이고 유니온은 거기서 파생한다(traits.TRAIT_KEYS와 같은 형태).
 *  전수 순회(`eligibleEvents`·테스트)가 이 배열 하나만 보면 되므로 종류가 늘어도 빠뜨릴 자리가 없다. */
export const EVENT_KINDS = ['MASS_CASUALTY', 'EPIDEMIC', 'NEARBY_CLOSURE', 'LAWSUIT', 'MILD_SURGE'] as const

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
  MILD_SURGE: { kind: 'MILD_SURGE', label: '경증 쏠림' },
}

/** 의료소송 한 건의 즉시 비용(만원) — **돌려보낸 응급이 소송으로 돌아온다.**
 *  다른 이벤트가 배율(확률)로 아픈 것과 달리 이 하나만 금고를 직접 깎는다: 회차는 그 순간
 *  아무 대가가 없어서, 청구서가 며칠 뒤에 오는 형태가 아니면 "돌려보내도 그만"이 된다. */
export const LAWSUIT_COST_MANWON = 800

/**
 * 소송 한 건이 **응급 우선순위를 내리는 폭** — 방어진료의 위축이다.
 *
 * 1인 이유: 채용 초기값이 2(보통)라 **한 번은 경고, 두 번은 구조**가 된다. 첫 소송은 "높음
 * 대기 → 낮음"으로 아직 응급을 받고(플레이어가 되돌릴 여지가 있다), 두 번째가 0 = 하드락에
 * 닿아 그 과 응급이 통째로 되돌아간다(emergency.ts 머리말 — *응급을 끈 의사는 없는 의사다*).
 * 2였다면 첫 소송 한 건이 곧바로 하드락이라 경고 구간이 없고, 소송은 위축이 아니라 그냥
 * 두 번째 벌금이 된다.
 */
export const LAWSUIT_CHILL_STEP = 1

/**
 * 위축이 닿는 과 — **응급을 받을 수 있는 과**다. 다른 과 의사는 응급 호출을 받은 적이
 * 없으므로 소송으로 물러설 것도 없다.
 *
 * ⚠️ **단일 출처는 `emergency.EMERGENCIES`의 배후과인데 여기 한 벌 더 적혀 있다** — 이 파일이
 * emergency를 임포트하면 T-093 순환이다(emergency가 이 파일의 `emergencyProbMulOf`를 값으로
 * 읽는다 · 머리말). 두 벌이 갈리는 것은 `emergency.test.ts`가 집합 동일성으로 잰다: 테스트
 * 파일은 양쪽을 자유롭게 임포트할 수 있어 순환이 없다. **사람이 아니라 기계가 어긋남을 잡는다.**
 */
export const CHILL_DEPTS: readonly SimDeptKey[] = ['CARDIOLOGY', 'GENERAL_SURGERY']

/** MASS_CASUALTY가 열리는 최소 주차 — 1주차는 유예다(병원이 아직 방 하나짜리일 수 있다). */
export const MASS_CASUALTY_FROM_WEEK = 2

/** 대량 응급 — 응급 도착 확률 배율(1/120 → 1/40). */
export const MASS_CASUALTY_EMERGENCY_MUL = 3
/** 전염병 — 외래 도착 확률 배율. */
export const EPIDEMIC_ARRIVAL_MUL = 1.6
/** 인근 병원 폐업 — 외래 도착 확률 배율(전 과 고르게). */
export const NEARBY_CLOSURE_ARRIVAL_MUL = 1.4
/** 경증 쏠림 — 외래 도착 확률 배율(전 과 고르게 · EPIDEMIC 1.6과 NEARBY 1.4 사이).
 *  **믹스는 갈아 끼우지 않는다**(arrivalDeptMixOf가 null을 준다): 전염병은 한 과로 몰리는 사건이라
 *  확률과 믹스를 함께 흔들지만, 경증은 정의상 과를 가리지 않는다 — 여기서 내과를 올리면
 *  두 이벤트가 같은 사건의 세기 차이로 읽히고, 이 이벤트가 말하려는 **수요의 형태**가 사라진다. */
export const MILD_SURGE_ARRIVAL_MUL = 1.5

/**
 * 경증 쏠림이 서려면 병동에 병상이 **몇 개** 있어야 하는가.
 *
 * 2인 이유는 아래 `lockedWardBedCount`의 내림과 짝이다: floor(n/2)를 잠그면 ceil(n/2)가 남으므로
 * 2병상이면 정확히 1이 남는다. 1병상짜리 병동에 이 이벤트를 붙이면 잠금이 0이라 **병상 효과가
 * 통째로 없는 날**이 되고(그냥 바쁜 하루다), 반대로 규칙을 올림으로 바꾸면 유일한 병상이 잠겨
 * 플레이어가 할 수 있는 게 하나도 없다 — MASS_CASUALTY가 「병동 없는 병원」을 막는 것과 같은
 * 불공정이다. 전제로 그 구간을 통째로 잘라 낸다.
 */
export const MILD_SURGE_MIN_BEDS = 2

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
 * 오늘 「관찰 점유」로 **잠기는 병상 수** — 경증 쏠림 날이면 절반(내림), 아니면 0.
 *
 * 이 함수가 이 이벤트의 정체다. 다른 회차 사유는 전부 **공급측**(그 과 의사가 없다 · 병상을 안
 * 지었다)이라, 지금까지 「병상 없음」은 언제나 "덜 지었다"로만 읽혔다. 경증 쏠림은 같은 사유를
 * **수요의 형태**로 만든다: 병상은 그대로인데 가벼운 증상들이 관찰 자리를 채워, 배후과 의사가
 * 멀쩡히 앉아 있는데도 응급이 돌아간다.
 *
 * 병상 수를 **인자로 받는다** — 세는 일은 `emergency.wardBeds`의 몫이고 이 파일은 leaf라 그걸
 * 임포트할 수 없다(T-093 · eslint leaf 가드). 그래서 효과의 **식**만 여기 두고, 그 식이 다른
 * 배율 함수들과 한자리에 모인다.
 *
 * ⚠️ **내림이 계약이다**: 남는 자리가 ceil(n/2)라 n ≥ 1이면 언제나 1 이상이다. 올림으로 바꾸면
 * 2병상 병원의 병동이 통째로 잠긴다(위 `MILD_SURGE_MIN_BEDS`).
 */
export function lockedWardBedCount(w: SimWorld, totalBeds: number): number {
  return w.event?.kind === 'MILD_SURGE' ? Math.floor(totalBeds / 2) : 0
}

/**
 * 병동에 놓인 침대 수 — 전제(`MILD_SURGE_MIN_BEDS`)가 묻는 값이다.
 *
 * ⚠️ `emergency.wardBeds`와 **다른 계산이고, 일부러 그렇다.** 저쪽은 침대까지 **설 수 있는가**
 * (막힌 앞 타일·중복 자리)까지 보므로 결과가 여기보다 적을 수 있다. 그 차이가 안전한 이유는
 * 잠금이 **저쪽이 센 수의 절반**이라서다: 전제가 조금 후하게 통과해도 실제 잠금은 실제 병상의
 * 내림 절반이라 「최소 한 자리는 남는다」가 그대로 성립한다. 갈릴 수 있는 것은 **이벤트가 후보에
 * 오르는가**뿐이고, 그 방향의 오차는 "잠금 0인 조용한 하루"로 끝난다.
 *
 * 정확한 쪽(wardBeds)을 못 부르는 이유는 순환이다 — spots·path는 leaf 금지 목록에 있다.
 */
function wardBedCount(w: SimWorld): number {
  const wards = computeRegions(w).filter(r => r.type === 'WARD')
  if (wards.length === 0) return 0
  return w.furniture.filter(
    f => f.kind === 'BED' && wards.some(r => r.tiles.has(tileIndex(f.x, f.y))),
  ).length
}

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
    // 병상이 하나뿐이면 잠글 것이 없고(내림 0), 없으면 잠글 병동이 없다 — 어느 쪽도 이 이벤트가
    // 하려는 말을 못 한다. 2 이상이라야 「절반은 잠기고 절반은 남는다」가 성립한다.
    case 'MILD_SURGE':
      return wardBedCount(w) >= MILD_SURGE_MIN_BEDS
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
 *
 * ⚠️ LAWSUIT은 **금고 밖에도 자국을 남긴다** — 위축(`chillTarget`)이 사람 하나의 응급
 * 우선순위를 내린다. 이벤트 중 유일하게 폰을 건드리는 자리이고, 그 근거는 이 게임의 논지다:
 * 소송의 대가는 합의금만이 아니라 **다음번에 손이 덜 올라가는 것**이다.
 */
export function applyEvent(w: SimWorld, kind: SimEventKind): SimWorld {
  if (!isEligibleEvent(w, kind)) {
    throw new Error(`applyEvent: 전제를 어긴 이벤트(${kind}) — eligibleEvents로 먼저 걸러야 한다`)
  }
  const next: SimWorld = { ...w, event: { kind } }
  if (kind !== 'LAWSUIT') return next
  // 소송 비용에는 **지역 배율**이 곱해진다(world.REGIONS): URBAN 0.5 = 400(옆 건물에도 병원이
  // 있으니 돌려보내도 책임이 절반만 돌아온다) · RURAL 2.0 = 1,600(한 시간 거리에 갈 곳이
  // 없었다). 만원 단위 정수가 유지되는지는 카탈로그 불변식 I-R6이 잠근다.
  const billed: SimWorld = {
    ...next,
    treasuryManwon: next.treasuryManwon - LAWSUIT_COST_MANWON * simRegion(w.region).lawsuitMul,
  }
  // 위축될 사람이 없어도(그 과 의사가 없거나 전부 이미 0) **금고는 그대로 깎인다** — 청구서는
  // 병원에 오지 사람에게 오지 않는다.
  const chilled = chillTarget(w)
  if (!chilled) return billed
  // 하한 0 — 위 필터가 `> 0`이라 지금은 음수가 불가능하지만, 폭이 2로 튜닝되는 날 조용히
  // 음수가 되는 대신 여기서 멈춘다(넘겨도 setDoctorPriority가 던진다 — 겹벨트).
  const lowered = Math.max(0, priorityOf(chilled, 'emergency') - LAWSUIT_CHILL_STEP) as Priority
  return {
    // 우선순위 쓰기는 **`setDoctorPriority` 한 곳**을 지난다(pawn.ts) — 여기서 폰 배열을 직접
    // 갈아 끼우면 미지정 폰의 나머지 축 채우기·범위 검사가 이 경로만 비켜 간다.
    ...setDoctorPriority(billed, chilled.id, 'emergency', lowered),
    // 이름을 이벤트에 실어 화면이 읽는다(narrative.chillNotice). 손세계 폰처럼 이름이 없으면
    // 필드도 없다 — 「undefined 의사가」라는 문장이 서느니 그 줄이 없는 편이 낫다.
    event: { kind, ...(chilled.name ? { chilledName: chilled.name } : {}) },
  }
}

/**
 * 이번 소송으로 위축될 사람 — **가장 노출된 의사 하나**. 시드를 소비하지 않는 결정론이다.
 *
 * 고르는 규칙은 둘이다: ① 응급 우선순위가 가장 높은 사람(가장 많이 불려 나간 사람이 가장 먼저
 * 물러선다) ② 동률이면 **폰 배열에서 먼저 나오는 사람**. ②를 id 문자열로 하면 `'doc-10' <
 * 'doc-2'`가 참이라 채용 순서와 어긋난다(에러 0 — 누가 위축됐는지만 조용히 갈린다).
 *
 * 이미 0인 의사는 후보가 아니다 — 응급을 끈 사람에게 더 뺄 것이 없고, 그 사람을 다시 세면
 * "대상이 있는데 아무것도 안 일어난 소송"이 생겨 화면이 이름을 못 싣는다.
 */
function chillTarget(w: SimWorld): Pawn | null {
  let best: Pawn | null = null
  for (const p of w.pawns) {
    if (p.kind !== 'DOCTOR' || !p.dept || !CHILL_DEPTS.includes(p.dept)) continue
    const pr = priorityOf(p, 'emergency')
    // `>`(≥ 아님)가 곧 ② 배열 순서 타이브레이크다 — 동률이면 먼저 만난 사람이 남는다.
    if (pr > 0 && (!best || pr > priorityOf(best, 'emergency'))) best = p
  }
  return best
}

/** 오늘의 **외래 도착 확률** 배율 — `patientFlow.maybeArrive`가 곱한다. 이벤트가 없으면 1이라
 *  이벤트 없는 날의 도착 스트림은 이 훅이 붙기 전과 **완전히 같다**(기존 결정론 보존). */
export function arrivalProbMulOf(w: SimWorld): number {
  switch (w.event?.kind) {
    case 'EPIDEMIC': return EPIDEMIC_ARRIVAL_MUL
    case 'NEARBY_CLOSURE': return NEARBY_CLOSURE_ARRIVAL_MUL
    case 'MILD_SURGE': return MILD_SURGE_ARRIVAL_MUL
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
