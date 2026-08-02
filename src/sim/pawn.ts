// 폰 — 세계를 걸어다니는 개체(의사·환자)와 그 이동 계산. 순수 데이터·순수 함수.
// 경로는 목적지가 정해질 때 findPath로 1회 계산해 path에 저장하고, 틱은 소비만 한다
// (findPath는 최장 경로 ~3ms라 매 틱 재탐색하면 폰 수만큼 곱해져 프레임을 먹는다).
import { GRID_W, GRID_H, ENTRANCE, isWalkable, regionHirePool, type SimWorld } from './world'
import { candidateOf, type Candidate } from './candidate'
import { HIRABLE_DEPTS, type SimDeptKey } from './dept'
import type { EmergencyKind } from './emergency' // 타입 전용 — emergency.ts가 pawn을 되받아도 순환 무해
import type { Pt } from './path'
// traits.ts는 leaf라 값으로 당겨도 순환이 없다(아무것도 임포트하지 않는다).
import { doctorName, pickTraits, type TraitKey } from './traits'

/** 폰의 이동 속도 — 게임 분당 타일 수. 시간 분할 불변식이 성립하려면 정수여야 한다. */
export const PAWN_TILES_PER_MIN = 2

/**
 * 세계를 걸어다니는 개체의 종류.
 *
 * ⚠️ **`'NURSE'`는 의사의 사람 기계(피로·허기·욕구·우선순위)에 들어가지 않는다** — 그 전부가
 * `kind === 'DOCTOR'`를 보고 갈리며, 그 한 줄들이 유지되는 것이 이 슬라이스의 **계약**이지
 * 우연이 아니다(설계 §1 · payment.test가 잠근다). 그가 하는 일은 하나다 — **접수처 카운터에
 * 있으면 진료비가 걷힌다**(patientFlow.hasCashier).
 *
 * ⚠️ **사직은 예외다 — 다만 다른 기계다**(2026-07-30 N2). 간호사도 떠나지만 드라이버가 개인
 * 피로가 아니라 **배치 조건**이다: 간호등급이 미달인 날을 세고(`shortDays`) 그 날들이 임계에
 * 닿으면 떠난다(nurse.resigningNurses). 두 축은 서로를 안 읽는다 — 포화한 간호사도, SHORT를
 * 잔뜩 쌓은 의사도 상대 명단에 서지 않는다(payment.test·nurseAttrition.test가 함께 잠근다).
 */
export type PawnKind = 'DOCTOR' | 'PATIENT' | 'NURSE'

/**
 * 의사 한 명의 일 하나에 매기는 우선순위 — **0=금지 · 1=낮음 · 2=보통 · 3=높음**.
 *
 * 0이 "낮음"이 아니라 **금지**인 것이 이 눈금의 핵심이다: 플레이어가 시뮬에 개입하는 수단은
 * 이 손잡이 하나뿐이고, 그중 실제로 게임을 바꾸는 것은 "안 한다"를 말할 수 있는가다
 * (응급을 끈 순환기 의사가 있는 병원은 순환기가 **없는** 병원과 같은 판정을 받는다).
 */
export type Priority = 0 | 1 | 2 | 3

/** 토글이 붙은 일의 종류 — 진료·응급·휴식. **식사에는 없다**: 굶기는 레버는 토글이 아니라
 *  "식당을 안 짓는다"로 이미 존재한다(레버를 두 벌 두면 어느 쪽이 이기는지가 계약이 된다). */
export type PriorityKind = 'exam' | 'emergency' | 'rest'

/** 미지정 폰이 읽히는 값 — 손세계 폰·저장된 옛 세계가 전부 "보통"으로 산다.
 *  이 폴백이 없으면 `priorities`를 안 실은 픽스처가 전부 금지(0)로 접혀 조용히 아무 일도 안 한다. */
export const DEFAULT_PRIORITY: Priority = 2

/** 이 폰의 그 축 우선순위 — **조회의 단일 출처**다(`?? 2`를 호출부에 흩어 적지 않는다).
 *  네 모듈(외래·응급 판정·응급 배정·휴식)이 같은 폴백을 각자 적으면 한 곳만 잊어도 그 축이
 *  금지로 접히고, 그 차이는 "왜 이 의사는 아무 일도 안 하지"로만 나타나 추적이 어렵다. */
export function priorityOf(p: Pawn, kind: PriorityKind): Priority {
  return p.priorities?.[kind] ?? DEFAULT_PRIORITY
}

/**
 * 채용·스폰의 초기값 — 세 축 전부 보통.
 *
 * ⚠️ 초기값이 `DEFAULT_PRIORITY`(= 조회 폴백)와 **같은 상수를 쓰는 것은 의도한 등식**이다:
 * "새로 뽑은 의사"와 "필드가 아예 없는 폰"이 **같게 읽힌다**. 등식이 깨지면 저장된 옛 세계를
 * 불러온 병원이 새 병원과 다르게 굴러가는데, 그 차이는 어느 화면에도 안 뜬다.
 *
 * 초기값 디자인이 갈리는 날(예: 새 의사는 응급을 꺼 둔 채 온다)은 **그때 상수를 분리한다** —
 * 그리고 그때도 **폴백은 2로 남긴다**: 폴백은 "이 의사가 어떻게 시작했나"가 아니라 "값이 없을 때
 * 무엇으로 읽나"라, 초기값을 따라 움직이면 옛 세계의 의사들이 소급해서 성격이 바뀐다.
 */
const freshPriorities = (): NonNullable<Pawn['priorities']> => ({
  exam: DEFAULT_PRIORITY, emergency: DEFAULT_PRIORITY, rest: DEFAULT_PRIORITY,
})

/**
 * 의사 한 명의 축 하나를 갈아 끼운다(입력 불변 — 순수 함수) — **플레이어 개입의 유일한 진입점**.
 *
 * ⚠️ 시뮬 쪽 호출자가 **하나 있다**: 의료소송의 위축(`events.applyEvent`)이 `emergency`를 한
 * 단계 내릴 때 이 함수를 지난다. 거기서 폰 배열을 직접 갈아 끼우지 않는 이유가 아래 두 문단이다 —
 * 미지정 폰의 나머지 축 채우기와 범위 검사가 그 경로만 비켜 가면, 위축된 의사만 다른 계약으로 산다.
 *
 * 범위 밖 값·없는 폰·의사가 아닌 폰이면 **던진다**. 접거나(clamp) 조용히 무시하면 UI는 바뀐 값을
 * 보여주는데 시뮬은 다른 값으로 도는 상태가 되고, 그 어긋남은 "왜 껐는데 계속 일하지"로만
 * 관측된다(`simDept`·`wantsDeptOf`가 undefined에 던지는 것과 같은 이유).
 *
 * 미지정 폰에 이 함수를 쓰면 나머지 두 축이 **기본값으로 실린다** — 한 축을 건드렸다고 다른 축이
 * undefined로 남으면 이후 조회가 폴백에 의존해, "필드에 있는 값"과 "읽히는 값"이 갈린다.
 * 그 채움을 `freshPriorities()` 위에 얹는 형태로 적는 이유는 **축이 늘 때 고칠 자리를 하나로**
 * 두기 위해서다: 축을 손으로 나열하면 새 축이 여기서만 빠져 조용히 undefined로 남는다.
 */
export function setDoctorPriority(
  w: SimWorld, doctorId: string, kind: PriorityKind, value: Priority,
): SimWorld {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(`setDoctorPriority: 범위 밖 우선순위(${value}) — 0~3의 정수라야 한다`)
  }
  const target = w.pawns.find(p => p.id === doctorId)
  if (!target) throw new Error(`setDoctorPriority: 세계에 없는 폰(${doctorId})`)
  if (target.kind !== 'DOCTOR') {
    throw new Error(`setDoctorPriority: 의사가 아닌 폰(${doctorId}) — 우선순위는 의사만 갖는다`)
  }
  const priorities = { ...freshPriorities(), ...target.priorities, [kind]: value }
  return { ...w, pawns: w.pawns.map(p => (p.id === doctorId ? { ...p, priorities } : p)) }
}
/** ⚠️ 'PAYING'·'GONE'은 **2주차 예약**이라 지금은 아무도 만들지 않고 아무도 읽지 않는다.
 *  'PAYING'은 RECEPTION 경유 수납 흐름 자리, 'GONE'은 퇴장을 폰 제거가 아니라 상태로 남길 때의
 *  자리다(1주차는 입구에 닿으면 배열에서 바로 뺀다). 미사용이지만 지우지 않는다 — 흐름의 빈칸이
 *  타입에 보이는 편이 낫고, 2주차에 되살릴 때 이름이 흔들리지 않는다. */
/** ⚠️ 응급 3종('TO_BED'·'IN_BED'·'IN_TREATMENT')은 **응급 환자만** 거치는 갈래다(emergency.ts).
 *  외래가 대기실 의자를 거쳐 진료실로 가듯, 응급은 병동 침대로 곧장 가서 처치를 받는다.
 *  'IN_BED'가 따로 있는 이유: 침대에 누웠지만 아직 그 과 의사가 외래 중이라 처치가 시작되지
 *  않은 구간이 실재한다 — 이 구간을 'IN_TREATMENT'와 합치면 소요 90분이 의사가 오기 전부터
 *  흐르기 시작해, 바쁜 병원일수록 처치가 공짜로 빨라진다(에러 없이 숫자만 틀린다). */
export type PatientStage =
  | 'ENTERING' | 'WAITING' | 'TO_EXAM' | 'IN_EXAM' | 'PAYING' | 'LEAVING' | 'GONE' | 'LEFT_WAITING'
  | 'TO_BED' | 'IN_BED' | 'IN_TREATMENT'

export interface Pawn {
  id: string
  kind: PawnKind
  x: number; y: number
  path: Pt[]
  /** 최종 목적지 — path와 별개로 남긴다. 둘을 겸하면 두 가지가 깨진다:
   *  ① 걷는 도중 진로가 막혔을 때 어디로 다시 길을 찾을지 모른다(재탐색 불가).
   *  ② 도착 판정을 `path.length === 0`으로 하게 되는데, 길이 끊겨 강제로 비워진 폰까지
   *     "도착"으로 오인한다 — 그래서 도착 판정은 항상 **위치 == dest**로 한다. */
  dest?: Pt
  // DOCTOR
  /** 사람 이름 — **의사·간호사**(환자는 익명이다). 부여는 셋 다 결정론이되 출처가 갈린다:
   *  의사 채용은 후보의 신원(candidate.candidateOf — (과, 슬롯) 전역 분할), 간호사와 손세계
   *  폴백은 서수(traits.doctorName). 어느 쪽이든 시드를 소비하지 않는다.
   *  optional인 이유는 손세계 폰·저장된 옛 세계 때문이다(우선순위 필드와 같은 계약). */
  name?: string
  /** 이 의사의 특성 두 개 — **의사만**. 서로 다른 두 값이 보장된다(traits.pickTraits).
   *  ⚠️ **수치 효과가 없다**(traits.ts 머리말) — 사직 편지·연출문의 재료이고 패널 표시용이다.
   *  `readonly [TraitKey, TraitKey]`로 길이를 타입에 박아 두는 이유: 화면이 "두 줄"을 전제로
   *  그리는데 배열이 비거나 셋이 되면 조용히 한 줄만 뜨거나 넘친다. */
  traits?: readonly [TraitKey, TraitKey]
  /** 전공과. 카탈로그 밖 과(2주차 절단)를 넣으면 라우팅이 런타임에 터지므로 `SimDeptKey`로
   *  좁혀 컴파일로 당긴다(Room.dept와 같은 이유). */
  dept?: SimDeptKey
  /** 이 의사가 앉은 **진료 책상의 좌표** — 배정의 담지자이자 **점유의 단일 출처**다(설계 §4).
   *  옛 `roomId`(진료실 하나 = 의사 하나)를 대체한다: 정원을 방이 아니라 책상이 정하므로
   *  배정 단위도 방일 수 없다. "이 책상이 찼는가"는 *다른 의사의 `deskAt`*으로만 묻는다 —
   *  별도 점유 테이블을 두면 의사가 사라질 때(사직) 되돌리는 걸 잊어 책상이 영구히 잠긴다.
   *  좌표라서 벽을 편집해도 승계된다(영역 id와 달리 파생값이 아니다) — 다만 그 책상을
   *  철거하면 슬롯이 사라지고, 그때 배정이 풀려 다음 분에 다시 붙는다(patientFlow). */
  deskAt?: Pt
  /** 누적 피로(0~`FATIGUE_MAX`) — **의사만** 갖는다. 채용 시 0에서 시작해 진료·처치가 끝날 때
   *  오르고 아침마다 `FATIGUE_REST`만큼 내린다(fatigue.ts). 효과는 하나다: 진료 소요가 늘어난다.
   *  하루로 리셋되지 **않는다** — 주를 넘겨도 이어지는 것이 "주 후반에 갈려나간다"의 담지자다. */
  fatigue?: number
  /** 지금 이 의사가 스스로 하고 있는 일 — 진료·처치가 아니라 **자기를 돌보는** 행동이다(needs.ts).
   *  없으면 근무 중이다. 이 필드가 있는 의사는 외래 배정 후보에서 빠지고(patientFlow), 응급이
   *  낚아채는 순간 해제된다(emergency — 회복 없이 끊긴다).
   *  휴식(LOUNGE)과 식사(CAFETERIA)가 **같은 기계**를 쓴다 — 갈래별 이름만 다르고 개시·전이·
   *  종료·좌초는 needs.ts의 브레이크 표 하나가 굴린다.
   *  왜 `busy` 같은 불리언이 아닌가: "쉬는 중"과 "쉬러 가는 중"은 다음 행동이 다르고(도착
   *  판정 vs 종료 시각), 상태 이름이 없으면 그 구별이 dest·path 같은 딴 필드로 새어 나간다. */
  activity?: 'TO_LOUNGE' | 'RESTING' | 'TO_MEAL' | 'EATING'
  /** 지금 붙은 욕구 블록이 **끝나는 시각**(게임 분) — `activity`가 앉은 상태('RESTING'·'EATING')일
   *  때만 있다. 시작 시각이 아니라 종료 시각인 이유는 환자의 `examUntilMin`과 같다: 매 분
   *  "끝났나"만 물으면 된다.
   *  ⚠️ 이름이 `restUntilMin`이 아닌 이유: 식사 블록이 **같은 타이머**를 쓰기 때문이다. 욕구마다
   *  필드를 따로 두면 종료 처리가 갈래마다 복제되고, 한쪽만 지우는 실수가 조용히 산다. */
  activityUntilMin?: number
  /** 마지막 식사 이후 지난 분 — **의사만**. 채용 시 0에서 시작해 RUNNING 분마다 +1 오르고
   *  (휴식·식사 중에도 오른다), 식사 블록이 **끝날 때** 0으로 되돌아간다(needs.ts).
   *  아침에도 0으로 리셋된다(day.freshMorning — 저녁을 먹고 출근한다는 각색).
   *  효과는 하나다: `HUNGRY_AFTER_MIN`을 넘긴 채 시작한 작업이 `STARVED_SLOW`배 길어진다.
   *  피로(fatigue)와 **다른 필드**인 이유: 회복 경로가 다르다 — 피로는 밤과 휴식으로 내려가고
   *  허기는 오직 식사로만 내려간다. 한 필드로 겸하면 식당이 휴게실의 복제가 된다. */
  hungerMin?: number
  /** 이 의사가 각 일에 매긴 우선순위 — **의사만**. 채용 시 세 축 모두 2에서 시작하고, 플레이어가
   *  `setDoctorPriority`로만 바꾼다(시뮬은 거의 스스로 안 건드린다 — 개입은 플레이어의 것이다).
   *  **예외 하나 — 의료소송**(`events.applyEvent`의 LAWSUIT)이 위축으로 `emergency`를 한 단계
   *  내린다. 개입은 플레이어의 것이지만 **위축은 사람의 것이다**: 소송을 겪은 손은 다음번에 덜
   *  올라간다. 플레이어는 인사 패널에서 언제든 다시 올릴 수 있고, **그 되돌림이 곧 이 게임의
   *  선택이다** — 올리면 그 사람이 갈린다.
   *  **없으면 전부 2로 읽힌다**(`priorityOf`) — 손세계 폰·저장된 옛 세계를 위한 폴백이다.
   *  축이 셋인 이유는 그 셋이 서로를 **밀어내기** 때문이다: rest를 exam 위로 올리면 대기 환자가
   *  있어도 쉬러 가고, emergency를 0으로 내리면 그 과 응급이 통째로 되돌아간다.
   *  하루·주를 넘겨도 유지된다(아침 리셋 없음) — 플레이어의 지시가 밤새 풀리면 손잡이가 아니다. */
  priorities?: { exam: Priority; emergency: Priority; rest: Priority }
  /**
   * **포화(`FATIGUE_MAX`)로 마감한 날**의 누적 — 의사만. 채용 시 0에서 시작하고 마감 정산이
   * 하루에 최대 1 올린다(day.settleDay). 이 값이 `RESIGN_SATURATED_DAYS`에 닿으면 그 사람은
   * 다음 주에 떠난다(week.resigningSimDoctors).
   *
   * ⚠️ **리셋이 없다** — 기존 게임 `src/game/doctor.ts`의 `stepSaturatedDays` 규칙을 그대로
   * 계승한다: *"회복해도 그 날들은 몸에 남는다"*. 아침 회복도(fatigue.restOvernight) 주 넘김도
   * (week.startNextWeek) 이 필드를 건드리지 않는다. 리셋 규칙을 두면 "며칠 쉬게 해 되돌리는"
   * 최적화 표면이 생기고, 그러면 사직은 구조의 결과가 아니라 관리의 실수가 된다.
   * 옛 주석대로 **완편 병원은 이 카운터가 영원히 0**이다 — 구조적으로 망가진 배치에서만 돈다.
   */
  saturatedDays?: number
  // NURSE
  /**
   * **간호등급이 미달(SHORT)인 채로 마감한 날**의 누적 — 간호사만. 채용 시 0에서 시작하고
   * 마감 정산이 하루에 최대 1 올린다(day.settleDay). 이 값이 자기 임계에 닿으면 그 사람은
   * 다음 주에 떠난다(nurse.resigningNurses).
   *
   * ⚠️ **오르는 조건이 그 사람이 아니라 배치다** — 그날 병원이 미달이면 재직 중인 **모든**
   * 간호사가 함께 오른다. 배치 미달은 특정인의 상태가 아니라 모두의 근무 환경이라, 개인별로
   * 갈라 세면 "누가 더 갈렸나"라는 없는 축이 생긴다.
   *
   * ⚠️ **리셋이 없다** — `saturatedDays`와 같은 규율이다: 기준을 채운 날이 끼어도 깎이지 않고
   * 아침(day.freshMorning)도 주 넘김(week.startNextWeek)도 이 필드를 건드리지 않는다. 리셋을
   * 두면 "하루만 제대로 배치해 되돌리는" 최적화 표면이 생기고, 그러면 이탈은 구조의 결과가
   * 아니라 관리의 실수가 된다. 소멸은 사직(사람이 나감)뿐이다.
   */
  shortDays?: number
  /** 채용된 주차 — 간호사만(`hireNurse`가 `w.week`을 싣는다). **신규 판별의 근거**다:
   *  재직이 `NURSE_NEW_WEEKS` 미만이면 임계가 절반이라 더 빨리 떠난다(nurse.ts).
   *  없으면 **1주차 채용**으로 읽힌다 — 폴백의 근거는 nurse.resignShortDaysOf 주석이다. */
  hiredWeek?: number
  /** 오늘 누적 **표준강도분**(소요 분 × 과 강도) — 의사만. 아침에 0으로 리셋된다.
   *  피로 증가가 이 누적치의 함수라(하루 `FATIGUE_FREE_MIN` 초과분만 쌓인다) 하루치를 들고 있어야
   *  한다. 건별로 따로 반올림해 더하면 같은 하루가 쪼개는 방식에 따라 다른 피로를 낳는다. */
  loadMinToday?: number
  // PATIENT
  stage?: PatientStage
  /** 이 환자가 보러 온 과 — **도착 시점에 배정되고 이후 바뀌지 않는다**(patientFlow.maybeArrive).
   *  진료가 성립하려면 환자·진료실·의사의 과가 셋 다 같아야 하고(삼중 일치), 진료 수익도
   *  이 과의 수가로 매겨진다. 즉 "그 과가 없으면 그 환자를 놓친다"의 담지자가 이 필드다. */
  wantsDept?: SimDeptKey
  arrivedMin?: number      // 대기 시작 시각(인내 계산)
  examUntilMin?: number
  doctorId?: string
  /** 응급 환자라는 표시이자 그 종류 — 없으면 외래다(emergency.ts가 유일한 생성자).
   *  종류가 배후과·수가·소요를 전부 결정하므로 이 한 필드가 응급의 신원이다. */
  emergency?: EmergencyKind
  /** 응급 처치 종료 시각 — `examUntilMin`과 **다른 필드**다. 겸하면 마감 정산이 외래 수가로
   *  응급을 계산하고(IN_EXAM 분기와 구별 불가) 850만원짜리 처치가 25만원으로 접힌다. */
  treatUntilMin?: number
  /** 지금 이 환자에게 붙은 작업(외래 진료·응급 처치)의 **확정 소요 분**.
   *  시작할 때 담당 의사의 피로 감속을 반영해 정해지고(fatigue.slowedDurationMin), 끝날 때
   *  표준강도분 축적의 입력이 된다. `*UntilMin`에서 되계산하지 않는 이유: 그러려면 시작 시각을
   *  따로 들거나 "그동안 의사의 피로가 안 변했다"는 성질에 기대야 하는데, 둘 다 이 한 필드보다
   *  깨지기 쉽다. 외래·응급이 한 폰에 겹치지 않아 필드는 하나면 된다. */
  workMin?: number
}

/** 이 의사의 전공과 — 없으면 던진다(`wantsDeptOf`·`emergencyKindOf`와 같은 계약).
 *  과가 곧 **주급**이라(dept.ts weeklyCostManwon) `undefined`를 0원으로 접으면 그 의사만
 *  공짜로 일하는 병원이 되고, 그 차이는 주간 결산 총액에만 나타나 추적이 어렵다.
 *  채용(hireDoctor)·스폰(spawnDoctor)이 반드시 과를 싣기 때문에, 비었다는 건 손으로 세운
 *  세계이거나 채용 경로를 건너뛴 것이다. */
export function doctorDeptOf(p: Pawn): SimDeptKey {
  if (!p.dept) throw new Error(`의사(${p.id})에 과가 없다 — 채용을 거치지 않은 폰이다`)
  return p.dept
}

/**
 * 이 판에서 지금까지 채용한 인원 — **손세계 폴백 전용 이름 인덱스**다(풀 소진량의 합).
 *
 * ⚠️ **채용 경로는 여기를 지나지 않는다**: `hireDoctor`가 후보에서 신원을 실어 오므로
 * (candidate.candidateOf — (과, 슬롯) 전역 분할) 뽑힌 의사의 이름은 이 합과 무관하다. 이 함수가
 * 남아 있는 건 `spawnDoctor`를 **직접** 부르는 손세계 폰(테스트)의 폴백 때문이고, 아래 논지는
 * 그 폴백 안에서만 유효하다.
 *
 * `nextId`를 쓰지 않는 이유: 그건 방·환자·응급까지 올리는 **전역** 카운터라 채용 순서와 무관하게
 * 뛴다 — 8명만 뽑아도 목록을 한 바퀴 돌아 동명이인이 났다(리뷰 실측). 풀은 **단조 감소**하고
 * (사직자는 돌아오지 않는다 — week.startNextWeek) 채용마다 정확히 1 줄어드니, 이 합은 판 안에서
 * 단조 증가하고 값마다 유일하다. 새 필드를 하나도 안 늘리고 그 성질을 얻는 것이 요점이다.
 *
 * ⚠️ **기준은 전국 풀이 아니라 그 지역의 시작 풀이다**(world.regionHirePool). 지역이 초기
 * 풀을 깎으면서 "초기 풀 = 전국 풀"이라는 옛 전제가 깨졌다: 전국 기준으로 세면 PROVINCIAL은
 * 아무도 안 뽑았는데 이미 8을 소진한 것으로 읽혀 **목록 8번부터** 이름이 붙는다 — 에러는
 * 하나도 안 나고 이름만 조용히 밀린다(traits.test.ts가 잠근다). 새 필드를 만들지 않는 것은
 * 그대로다: 시작 풀도 `region`의 순수 파생이라 이중 기재가 아니다.
 *
 * ⚠️ 손세계 폰은 풀을 안 건드리므로 전부 서수 0(목록의 첫 이름)을 받는다 — 의도된 결과다.
 * 이름의 유일성은 **채용 경로의 성질**(슬롯이 사람의 좌표다)이지 스폰의 성질이 아니다.
 */
function hiredEver(w: SimWorld): number {
  const initial = regionHirePool(w.region)
  return HIRABLE_DEPTS.reduce((sum, key) => sum + (initial[key] - w.hirePool[key]), 0)
}

export function spawnDoctor(
  w: SimWorld, dept: SimDeptKey, at: Pt,
  identity?: Pick<Candidate, 'name' | 'traits'>,
): SimWorld {
  // 피로·부하·허기를 **명시적으로 0**에서 시작한다 — `?? 0` 폴백이 있어도 필드가 실재해야 UI·저장이
  // "아직 일 안 한 의사"와 "필드가 없는 손세계 폰"을 구별할 수 있다.
  // 허기 0 = 밥을 먹고 출근했다(freshMorning의 아침 리셋과 같은 각색).
  // 우선순위도 같은 이유로 명시한다 — 새 의사는 세 축이 전부 '보통'이다.
  // 포화 일수도 명시적으로 0이다 — 이 사람은 아직 하루도 갈리지 않았다.
  // 이름·특성 둘 다 **시드를 소비하지 않는다**(traits.ts 머리말) — 채용 한 번이 도착·응급
  // 스트림을 밀지 않는다.
  //
  // 신원(`identity`)은 **채용 경로가 후보에서 실어 온다**(hireDoctor → candidate.candidateOf):
  // 카드에 미리 보인 사람과 실제로 선 폰이 같은 사람이어야 하므로, 여기서 다시 뽑으면 그 약속이
  // 스폰 시점에 조용히 깨진다. 미지정 폴백은 **채용을 거치지 않는 직접 호출**(테스트의 손세계 폰)
  // 전용이라 종전 서수 방식 그대로다 — 기존 손세계가 안 깨진다.
  const p: Pawn = {
    id: `doc-${w.nextId}`, kind: 'DOCTOR', x: at.x, y: at.y, path: [], dept,
    name: identity?.name ?? doctorName(hiredEver(w)),
    traits: identity?.traits ?? pickTraits(w.nextId),
    fatigue: 0, loadMinToday: 0, hungerMin: 0, saturatedDays: 0, priorities: freshPriorities(),
  }
  return { ...w, nextId: w.nextId + 1, pawns: [...w.pawns, p] }
}

/** 스폰 탐색의 4방향 순서 — findPath의 DIRS와 같은 (위·우·아래·좌). 이 순서가 동률 타이브레이크다. */
const SPAWN_DIRS: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]

/** 정문에서 가까운 순서로 통행 가능하고 **비어 있는** 첫 타일 — 채용한 의사가 설 자리.
 *  BFS라 거리순이 보장되고, 방향 순서(위·우·아래·좌)가 findPath와 같아 동률도 결정론이다.
 *
 *  ⚠️ 폰이 선 타일을 건너뛰는 것이 계약이다. 통행 판정(isWalkable)은 폰을 안 보므로 — 폰끼리는
 *  서로 통과한다(경로가 폰 때문에 막히면 병원이 교착한다) — 이 함수까지 그러면 연속 채용이
 *  전원 같은 칸에 겹쳐 서고, 스프라이트가 타일을 꽉 채우는 탓에 **세 명이 화면에서 한 명**이 된다.
 *  이동 규칙은 그대로 두고 **설 자리만** 비켜 두는 자리라 여기서만 점유를 본다.
 *
 *  ⚠️ 정문 자체는 방을 지을 수 없는 마지막 줄이라(placeRoom 경계) 첫 채용은 보통 곧바로 끝난다 —
 *  탐색이 도는 건 정문이 이미 찼거나 손으로 세운 세계처럼 막힌 경우다. */
function spawnSpotNear(w: SimWorld, from: Pt): Pt {
  const taken = new Set(w.pawns.map(p => `${p.x},${p.y}`))
  // 통행은 되는데 사람이 서 있던 첫 타일 — 부지가 통째로 찼을 때의 폴백이다(겹침이 봉쇄보다 낫다).
  let occupied: Pt | null = null
  const seen = new Set<string>([`${from.x},${from.y}`])
  const queue: Pt[] = [from]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (isWalkable(w, cur.x, cur.y)) {
      if (!taken.has(`${cur.x},${cur.y}`)) return cur
      occupied ??= cur
    }
    for (const d of SPAWN_DIRS) {
      const nx = { x: cur.x + d.x, y: cur.y + d.y }
      const key = `${nx.x},${nx.y}`
      if (seen.has(key)) continue
      if (nx.x < 0 || nx.y < 0 || nx.x >= GRID_W || nx.y >= GRID_H) continue
      seen.add(key)
      queue.push(nx)
    }
  }
  // 빈 통행 타일이 없다 — 사람이 서 있더라도 통행 타일이면 거기(겹쳐 서는 것이 못 뽑는 것보다 낫다),
  // 통행 타일 자체가 하나도 없으면 정문에 세운다. 채용을 조용히 삼키지 않는 것이 요점이다.
  // 막힌 칸에 낀 폰도 findPath가 출발지를 선검사하지 않아 스스로 걸어 나올 수 있다(의도된 비대칭).
  return occupied ?? from
}

/** 채용의 결과 — 건설(`build.PlaceResult`)과 **같은 모양**이다. 화면이 두 실패를 같은 코드로
 *  다룰 수 있고, 무엇보다 실패를 "그냥 아무 일도 안 일어난 세계"로 돌려주지 않는다:
 *  그러면 채용 버튼이 조용히 먹히고 플레이어는 왜 안 뽑히는지 알 길이 없다. */
export type HireResult =
  | { ok: true; world: SimWorld }
  | { ok: false; reason: 'NO_POOL' | 'SLOT_TAKEN' }

/** 채용 — 그 과 의사 한 명이 정문으로 걸어 들어오고, **전국에 남은 그 과 사람이 하나 줄어든다**.
 *  **일시금이 없다**(금고 무변): 기존 게임의 계약금(DEPARTMENTS.hireCostManwon)은 PR C/D 절단이고,
 *  이 슬라이스에서 채용의 대가는 오직 **주 고정비**(dept.ts weeklyCostManwon)다 — 그래야 "뽑는
 *  순간 아픈" 게 아니라 "주말마다 청구되는" 형태가 되고, 필수과의 적자가 주 단위로 드러난다.
 *
 *  그 대신 **사람 쪽 대가**가 여기 있다: 풀이 0인 과는 돈이 아무리 많아도 못 뽑는다(응급의
 *  배후과 하드락과 같은 형태의 비협상 제약이다). 실패한 채용은 세계를 스치지도 않는다 —
 *  차감만 하고 폰을 안 세우거나 그 반대면 인원과 풀이 조용히 갈린다.
 *
 *  ⚠️ 뽑히는 것은 **특정 후보 한 명**이다(candidate.ts): `slot`이 그 사람을 가리키고, 채용은
 *  그 슬롯을 소비한다(`hiredSlots`). 카운트(`hirePool`)도 함께 하나 줄어 둘이 늘 맞는다 —
 *  쓰기 경로가 이 함수 하나뿐이라 어긋날 면이 없고, 불변식 테스트가 그걸 잠근다. */
export function hireDoctor(w: SimWorld, dept: SimDeptKey, slot?: number): HireResult {
  const remaining = w.hirePool[dept]
  if (remaining <= 0) return { ok: false, reason: 'NO_POOL' }
  const regionN = regionHirePool(w.region)[dept]
  const taken = w.hiredSlots[dept]
  // 생략 = 남은 최소 슬롯(기존 호출부 하위호환). remaining > 0이면 불변식상 반드시 있다.
  const pick = slot ?? Array.from({ length: regionN }, (_, s) => s).find(s => !taken.includes(s))
  // SLOT_TAKEN 하나로 접는 이유: UI는 remainingCandidates가 준 슬롯만 넘기므로 이 거부는
  // 연타·stale 스냅샷 경로뿐이고, 플레이어에게 할 말은 "그 사람은 이미 없다" 하나다.
  if (pick === undefined || !Number.isInteger(pick) || pick < 0 || pick >= regionN || taken.includes(pick))
    return { ok: false, reason: 'SLOT_TAKEN' }
  const world = spawnDoctor(w, dept, spawnSpotNear(w, ENTRANCE), candidateOf(dept, pick))
  return {
    ok: true,
    world: {
      ...world,
      hirePool: { ...world.hirePool, [dept]: remaining - 1 },
      hiredSlots: { ...world.hiredSlots, [dept]: [...taken, pick] },
    },
  }
}

/** 이 병원의 간호사 수 — 수납 판정(patientFlow.hasCashier)·주급(week)이 **같은 한 줄**을 본다.
 *  세는 식을 호출부마다 적으면 "창구는 성립하는데 주급은 안 나가는" 병원이 조용히 생긴다. */
export const nurseCount = (pawns: readonly Pawn[]): number =>
  pawns.filter(p => p.kind === 'NURSE').length

/**
 * 간호사 채용 — 한 명이 정문으로 걸어 들어온다.
 *
 * **실패가 없어서 `HireResult`가 아니다**(hireDoctor와 갈리는 유일한 지점): 간호사는 과가
 * 없으므로 전국 풀(`hirePool`)도 없고, 채용 일시금도 없다(의사와 같다 — 대가는 주말의 주급뿐).
 * 거부 사유가 하나도 없는 자리에 결과 타입을 씌우면 화면이 도달 불가능한 분기를 떠안는다.
 *
 * 이름은 **의사 목록을 나눠 쓴다**(`doctorName`). 인덱스는 **지금까지 뽑은 총수**다 —
 * 재직 인원(`nurseCount`)만 세면 사직이 인원을 줄이면서 **같은 이름이 재등장한다**(N2 이후
 * 실재하는 경로다: 옛 주석의 "간호사는 사직이 없어 단조 증가한다"는 전제가 깨졌다). 재직 +
 * 누계 사직이면 채용마다 정확히 1 늘어 판 안에서 단조 증가하고 값마다 유일하다 —
 * `hiredEver`(의사 쪽)가 풀의 단조 감소에서 같은 성질을 얻는 것과 같은 형태다.
 * 의사와 같은 이름이 나올 수 있지만 카드가 늘 역할을 함께 적어 구별된다.
 *
 * ⚠️ 피로·허기·우선순위·특성을 **명시적으로도 싣지 않는다** — 필드가 없는 것이 곧 "이 사람은
 * 그 기계 밖"이라는 표현이다(PawnKind 주석의 계약). 0으로 채우면 그 기계가 나중에 조용히
 * 이 사람을 집는다. 반대로 `shortDays`·`hiredWeek`은 **싣는다**: 간호사가 실제로 들어가 있는
 * 기계(이탈)의 필드라, 없으면 "아직 안 겪은 사람"과 "기계 밖 폰"이 구별되지 않는다.
 */
export function hireNurse(w: SimWorld): SimWorld {
  const at = spawnSpotNear(w, ENTRANCE)
  const p: Pawn = {
    id: `nur-${w.nextId}`, kind: 'NURSE', x: at.x, y: at.y, path: [],
    name: doctorName(nurseCount(w.pawns) + w.nursesResignedTotal),
    shortDays: 0, hiredWeek: w.week,
  }
  return { ...w, nextId: w.nextId + 1, pawns: [...w.pawns, p] }
}

/** 경로를 분 예산만큼 소비 — tick의 이동 절반.
 *  Math.min 캡이 없으면 남은 경로보다 예산이 클 때 path[steps-1]이 undefined가 되어
 *  폰 좌표가 NaN으로 오염된다(도착 직전 폰은 거의 항상 이 상황이다). */
export function stepMove(p: Pawn, minutes: number): Pawn {
  const steps = Math.min(p.path.length, minutes * PAWN_TILES_PER_MIN)
  if (steps === 0) return p
  const nextPos = p.path[steps - 1]
  return { ...p, x: nextPos.x, y: nextPos.y, path: p.path.slice(steps) }
}
