// 간호 인력의 판정 — **등급**(인원이 기준에 닿는가)과 **이탈**(그 미달이 사람을 데려가는가).
//
// 왜 week.ts가 아니라 별도 모듈인가: 등급 판정을 **하루 마감**(day.settleDay)이 읽어야 한다.
// SHORT로 마감한 날을 세는 자리가 거기이기 때문이다. 그런데 week.ts는 day.ts를 임포트하므로
// 판정이 week.ts에 있으면 순환이 된다. 판정식을 양쪽에 적는 것이 대안이었는데, 그러면 "그날
// 미달이었나"를 마감과 결산이 각자 판정해 **같은 주에 감산은 붙는데 일수는 안 오르는** 병원이
// 조용히 생긴다(설계 §1의 그 경고). 그래서 함수를 아래로 내리고 week.ts가 re-export한다 —
// 공개 API(`week`에서 임포트하던 기존 자리)는 그대로다.
//
// 이 모듈은 leaf에 가깝다: world·pawn만 본다(둘 다 이 파일을 되받지 않는다).
import { nurseCount, type Pawn } from './pawn'
import type { SimWorld } from './world'

/** 간호등급 3단 — 기준 초과 / 충족 / 미달. */
export type NurseGrade = 'BONUS' | 'MET' | 'SHORT'

/**
 * 이번 주말의 간호등급 — **주말 시점의 인원만** 본다(주중 변동은 이 슬라이스에 없다).
 *
 * 기준은 `ceil(의사 수 / 2)`다. 정확한 제도 재현이 아니라 **번역**이다 — 실제 등급제는 병상당·
 * 환자수당 7단계지만 이 병원은 외래 중심이라 "진료 규모 대비 간호 인력"의 최소 형태로 옮겼다.
 *
 * ⚠️ **의사가 0명이면 등급이 없다(MET 고정)** — 기준이 0이라 간호사 하나만 있어도 산술로는
 * BONUS가 서는데, 그 주는 **수익이 0이 아닐 수 있다**: 주중에 벌고 주말 전에 의사가 전부 떠난
 * 주가 실재한다(weekDeptTable 주석의 그 경우). 그러면 아무도 진료하지 않는 병원이 간호사만으로
 * 가산을 받는다. 기준이 없는 곳에는 초과도 없다 — 미달도 마찬가지라 감산도 없다.
 *
 * ⓘ **하루 마감도 이 함수를 읽는다**(day.settleDay) — 그날 SHORT면 간호사의 `shortDays`가 오른다.
 *   국면을 안 보므로 주중에 불러도 답한다: "지금 이 배치가 미달인가"는 주말만의 질문이 아니다.
 */
export function nurseGradeOf(w: SimWorld): { count: number; required: number; grade: NurseGrade } {
  const count = nurseCount(w.pawns)
  const required = Math.ceil(w.pawns.filter(p => p.kind === 'DOCTOR').length / 2)
  const grade: NurseGrade =
    required === 0 ? 'MET' : count > required ? 'BONUS' : count === required ? 'MET' : 'SHORT'
  return { count, required, grade }
}

/**
 * 기존 간호사가 떠나는 **SHORT 마감 일수** — 의사의 `RESIGN_SATURATED_DAYS`와 값이 같아도
 * **별도 상수**다: 포화(개인의 피로)와 인력 미달(배치 조건)은 다른 개념이라, 한쪽을 튜닝하면서
 * 다른 쪽이 함께 끌려가면 그건 우연히 같았던 값이 계약이 되어 버린다.
 *
 * 자리가 이 층(sim)인 이유는 기존 게임(`src/game/*`)에 대응 개념이 아예 없기 때문이다 —
 * 저쪽에는 간호사가 없다(의사 임계는 반대로 저쪽에서 임포트한다 · week.ts 머리말).
 */
export const NURSE_RESIGN_SHORT_DAYS = 4

/**
 * **신규** 간호사의 임계 — 절반이다.
 *
 * 이 가중이 악순환의 고리를 잠근다: 떠난 자리를 재채용으로 메꾸면 그 사람은 절반의 날에 떠나므로
 * **돈만으로는 안 풀린다**(신규 1년 사직률 52.8%의 게임 번역 — 부호만 이식하고 수치는 각색).
 */
export const NURSE_RESIGN_SHORT_DAYS_NEW = 2

/** 신규로 치는 재직 주수 — `week − hiredWeek`가 이 값 **미만**이면 신규다. */
export const NURSE_NEW_WEEKS = 4

/**
 * 이 간호사가 떠나는 SHORT 일수 — 재직 기간이 임계를 고른다.
 *
 * `hiredWeek`이 없는 폰(손세계·저장된 옛 세계)은 **1주차 채용**으로 읽는다. 스타팅 로스터의
 * 간호사를 과거로 각색하지 않는 것과 같은 규칙이고(설계 §2), 그래야 같은 세계가 언제 저장됐는지에
 * 따라 임계가 흔들리지 않는다 — `?? w.week`로 읽으면 옛 폰이 매 주 "방금 온 사람"이 된다.
 */
function resignShortDaysOf(p: Pawn, week: number): number {
  return week - (p.hiredWeek ?? 1) < NURSE_NEW_WEEKS
    ? NURSE_RESIGN_SHORT_DAYS_NEW
    : NURSE_RESIGN_SHORT_DAYS
}

/**
 * 이번 주말에 **떠나는 간호사들** — 미달로 마감한 날이 자기 임계에 닿은 사람.
 * 순수 파생이라 세계에 저장하지 않는다(`resigningSimDoctors`와 같은 계약).
 *
 * ⚠️ **통지와 집행의 단일 출처**다: 간호사 카드의 「이번 주말 떠남」과 결산의 사직 줄이 이
 * 함수를 읽고, `week.startNextWeek`이 **바로 이 함수로** 명단을 지운다. 두 자리가 각자 임계를
 * 적으면 안 떠난 사람이 통지되거나 통지 없이 사람이 사라지고, 그건 플레이어에게 "버그"가 아니라
 * "내가 뭘 놓쳤나"로 보인다.
 *
 * 간호사만 본다 — `shortDays`는 간호사만 갖는 상태이고(pawn.shortDays), 마감을 넘긴 환자가
 * pawns에 섞여 있을 수 있다(`resigningSimDoctors`의 `kind` 검사와 같은 이유).
 *
 * ⓘ 의사와 **다른 한 가지가 곧 메시지다**: 이 사람들은 필수의료를 떠나는 게 아니라 **유휴로
 *   돌아간다**(면허는 그대로다). 그래서 집행 쪽은 전국 풀을 건드리지 않고 누계 장부만 올린다
 *   (world.nursesResignedTotal) — 채용은 계속 무제한이다.
 */
export function resigningNurses(w: SimWorld): Pawn[] {
  return w.pawns.filter(
    p => p.kind === 'NURSE' && (p.shortDays ?? 0) >= resignShortDaysOf(p, w.week),
  )
}
