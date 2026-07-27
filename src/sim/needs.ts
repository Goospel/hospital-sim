// 욕구 — 의사가 스스로 일을 끊고 자기를 돌보는 자리. 순수 함수(tick이 분당 1회 부른다).
//
// 담는 욕구는 둘이다. **피로의 행동화**: 지친 의사가 유휴일 때 휴게실 의자로 걸어가 한 블록
// 쉬고 책상으로 돌아온다. **허기의 행동화**: 배고픈 의사가 식당 의자로 걸어가 한 끼 먹고
// 돌아온다. LOUNGE는 1주차부터 지을 수 있었지만 아무도 쓰지 않는 장식이었고, 이 파일이 그 방에
// 처음으로 뜻을 준다 — **배치가 책상 체류 시간을 정한다**: 휴게실이 멀수록 왕복 보행에 분을
// 뺏겨 진료할 수 있는 시간이 줄어든다.
//
// 두 욕구는 **한 기계**(BREAKS 표)를 공유한다 — 개시·전이·종료·좌초가 갈래마다 복제되면
// 셋째 욕구가 붙을 때 한 벌만 고쳐지는 자리가 생긴다. 갈래별로 다른 것은 표의 여섯 칸뿐이고,
// **표의 순서가 곧 우선순위**다(휴식 먼저, 식사 나중 — BREAKS 주석).
//
// 회복 경로가 다른 것이 두 욕구를 한 필드로 못 합치는 이유다: 피로는 밤(FATIGUE_REST)과
// 휴식으로 내려가지만 허기는 **오직 식사로만** 내려간다. 그래서 식당이 없는 병원은 오후가
// 통째로 1.15배 느려지고(starvedSlowFactor), 그 감속은 스스로 풀리지 않는다.
//
// ⚠️ **"멀수록 덜 쉰다"가 아니다** — 초안 주석의 그 주장을 실측으로 정정한다(2026-07-27).
// 프로브(유휴 1명·하루 종주·LOUNGE x=16 vs x=40): 회복 **횟수는 같았고**(3/3·1/1) 달라진 것은
// 책상 체류 분(383 vs 359)뿐이었다. 근인은 임계 구조다 — 피로가 `FATIGUE_RED + REST_BREAK_RECOVER`
// (82) 이상이면 회복 직후에도 여전히 임계 위라 책상에 닿기 전에 돌아서고, 그러면 왕복 비용이
// 휴식 **횟수**를 못 줄인다. 거리가 깎는 것은 회복이 아니라 **일할 수 있는 시간**이다.
// 이 정정된 주장은 needs.test.ts의 근거리/원거리 결정론 대조가 잠근다.
//
// 설계 규칙은 환자 흐름(patientFlow)과 같다:
//  ① RNG 0 — 전부 결정론 상태 전이다. 이 파일은 seed를 읽지 않는다(새 무작위 축 없음).
//  ② 도착 판정은 **위치 == dest**다. `path.length === 0`은 길이가 끊겨 비워진 폰과 구별되지 않는다.
//  ③ 경로는 목적지가 정해질 때 1회만 계산한다(tick의 revalidate가 재탐색을 맡는다).
import { FATIGUE_RED } from '../game/doctor'
import { buildBlockedSet, findPath, type Pt } from './path'
import type { FurnitureKind, RoomType, SimWorld } from './world'
import type { Pawn } from './pawn'
import { fatigueOf } from './fatigue'
import { furnitureSpot, furnitureSpots } from './patientFlow'

/** 휴식 한 블록의 길이(분) — 각색·튜닝값. 왕복 보행 시간과 합쳐 "휴게실 하나가 의사를 얼마나
 *  오래 빼가나"를 정한다(그 시간만큼 그 과의 외래가 멎는다). */
export const REST_BREAK_MIN = 60

/**
 * 휴식 한 블록이 **끝날 때 한 번에** 내려가는 피로 — 각색·튜닝값.
 *
 * ⚠️ 밤 회복(`FATIGUE_REST` = 20)보다 **반드시 약하다**: 낮잠이 밤잠을 이기면 "쉬엄쉬엄 굴리면
 * 영원히 안 지친다"가 되어 피로 → 포화 → 사직의 인과가 통째로 끊긴다. 이 대소는 취향이 아니라
 * 계약이라 needs.test.ts가 잠근다.
 *
 * 회복이 블록 **끝**에 오는 것도 계약이다 — 부하가 작업이 끝날 때 쌓이는 것(fatigue.addWorkLoad)과
 * 대칭이고, 분마다 나눠 내리면 정수 산술이 깨져 같은 60분이 쪼개는 방식에 따라 다른 값을 낳는다.
 */
export const REST_BREAK_RECOVER = 15

/** 마지막 식사 후 이만큼 지나면 배고파진다(분) — 각색·튜닝값.
 *  개장 09:00 기준 300분이면 14:00라 **점심때**에 닿는다. 하루 운영이 600분(DAY_END_MIN)이라
 *  식당이 있는 병원은 하루 한 번쯤 식사가 걸리고, 없는 병원은 오후 내내 굶은 채 돈다. */
export const HUNGRY_AFTER_MIN = 300

/** 식사 한 블록의 길이(분) — 각색·튜닝값. 외래 한 건(`EXAM_DURATION_MIN`)과 같은 길이라,
 *  "밥 먹으러 가면 그 과 외래 한 건이 밀린다"가 플레이어에게 곧바로 읽힌다.
 *  휴식(60분)보다 훨씬 짧은 것이 계약은 아니지만, 그 대소가 두 방의 성격을 가른다. */
export const MEAL_MIN = 20

/**
 * 굶은 채 시작한 작업의 소요 배율 — 각색·튜닝값.
 *
 * ⚠️ 피로 최대 감속(`fatigueSlowFactor(FATIGUE_MAX)` = 1.5)보다 **반드시 완만하다**: 뒤집히면
 * 한 끼 거른 것이 포화까지 갈려나간 것보다 무거워져, 이 게임이 겨눈 인과(피로 → 포화 → 사직)의
 * 무게가 밥 한 끼에 가려진다. 이 대소는 취향이 아니라 계약이라 needs.test.ts가 잠근다.
 */
export const STARVED_SLOW = 1.15

const samePt = (a: { x: number; y: number }, b: Pt) => a.x === b.x && a.y === b.y
const ptKey = (p: Pt) => `${p.x},${p.y}`

/**
 * 지금 이 의사가 쉬러 나설 마음이 있는가 — **개시 임계의 단일 출처**다.
 *
 * 임계는 색 경계(`src/game/doctor.ts` FATIGUE_RED)와 같은 값을 쓴다 — 화면이 빨개지는 그
 * 지점에서 의사가 실제로 일을 끊는다. 리터럴로 복제하면 색과 행동이 조용히 갈린다.
 *
 * ⚠️ 술어를 함수로 뽑은 이유는 재사용이 아니라 **계측 가능성**이다: 조기 반환 가드와 개시
 * 판정이 임계를 각자 적고 있으면 한쪽을 지워도 다른 쪽이 가려 주어 아무 일이 안 일어나고,
 * 그래서 어떤 테스트도 그 실수를 못 잡는다(실측 2026-07-27 — 개시 임계를 지운 돌연변이가
 * 가드에 가려 869건 전부 통과했다). 두 곳이 같은 술어를 부르면 지우는 순간 함께 무너진다.
 */
function wantsRestNow(p: Pawn): boolean {
  return fatigueOf(p) >= FATIGUE_RED
}

/** 이 폰의 허기 — 없으면 0(환자·손세계 폰). `fatigueOf`와 같은 이유로 한 곳에 모은다. */
function hungerOf(p: Pawn | undefined): number {
  return p?.hungerMin ?? 0
}

/** 지금 이 의사가 밥을 먹으러 나설 마음이 있는가 — **허기 임계의 단일 출처**다.
 *  개시 판정(BREAKS)과 감속 판정(starvedSlowFactor)이 **같은 술어**를 부른다: 임계를 두 곳에
 *  리터럴로 적으면 "밥 먹으러는 가는데 느려지진 않는" 구간이 조용히 생긴다(wantsRestNow와 같은 계측 논리). */
function wantsMealNow(p: Pawn): boolean {
  return hungerOf(p) >= HUNGRY_AFTER_MIN
}

/**
 * 굶주림 감속 배율 — 배고프면 `STARVED_SLOW`, 아니면 1. **이 파일이 유일한 출처**다.
 *
 * 외래(patientFlow)와 응급(emergency)이 각자 이 판정을 적으면 한쪽만 잊어도 에러가 안 난다:
 * 진료는 느려지는데 처치는 그대로인 병원이 되고, 그 차이는 하루 총 진료 수에만 나타나 추적이
 * 어렵다. 판정 시점은 **작업이 시작되는 그 분**이다(피로 감속과 같은 계약) — 진행 중에 배가
 * 고파졌다고 남은 시간이 늘어나지는 않는다.
 *
 * 인자가 `Pawn | undefined`인 이유는 `fatigueOf`와 같다: 담당 의사 조회(`pawns.find`)가
 * 손세계 폰에서 빌 수 있고, 그때 던지느니 "안 배고프다"(=1)로 접는 편이 안전하다.
 */
export function starvedSlowFactor(p: Pawn | undefined): number {
  return p && wantsMealNow(p) ? STARVED_SLOW : 1
}

/** 욕구 한 갈래의 정의 — 개시·전이·종료가 읽는 여섯 칸. 갈래가 늘어도 기계는 하나다. */
interface BreakDef {
  /** 자리로 **걸어가는 중**인 상태 이름 */
  going: NonNullable<Pawn['activity']>
  /** 자리에 **앉아 하는 중**인 상태 이름 */
  doing: NonNullable<Pawn['activity']>
  /** 그 자리가 있는 방과 가구 — 없는 병원에서는 이 욕구가 통째로 성립하지 않는다 */
  roomType: RoomType
  furnitureKind: FurnitureKind
  durationMin: number
  /** 지금 나설 마음이 있는가(임계) */
  wants(p: Pawn): boolean
  /** 블록이 **끝날 때 한 번에** 일어나는 일 — 회복·리셋이 여기 한 줄로 모인다.
   *  분마다 나눠 주면 정수 산술이 깨져 같은 블록이 쪼개는 방식에 따라 다른 값을 낳는다. */
  onEnd(p: Pawn): Pawn
}

/**
 * 욕구 표 — **배열 순서가 곧 우선순위**다.
 *
 * 휴식이 먼저인 것이 계약이다: 피로와 허기가 동시에 임계를 넘긴 의사는 **쉬러 간다**. 회복은
 * 사직(피로 포화)을 미루는 자원이지만 식사는 속도만 되돌리기 때문이다 — 되돌릴 수 없는 쪽이
 * 급하다. 순서를 뒤집으면 지친 의사가 밥부터 먹고, 20분 뒤 여전히 지친 채로 다시 나선다.
 * 이 순서는 needs.test.ts가 두 자리를 동시에 비워 둔 병원에서 잠근다.
 *
 * ⓘ 앞 갈래가 **자리를 못 찾으면** 다음 갈래를 본다(maybeStartBreak의 순회). 휴게실이 없는
 *   병원에서 지치고 배고픈 의사가 밥도 못 먹는 것은 벌이 아니라 버그라, 순서는 우선순위이지
 *   배타가 아니다.
 */
const BREAKS: readonly BreakDef[] = [
  {
    going: 'TO_LOUNGE', doing: 'RESTING',
    roomType: 'LOUNGE', furnitureKind: 'CHAIR',
    durationMin: REST_BREAK_MIN,
    wants: wantsRestNow,
    onEnd: p => ({ ...p, fatigue: Math.max(0, fatigueOf(p) - REST_BREAK_RECOVER) }),
  },
  {
    going: 'TO_MEAL', doing: 'EATING',
    roomType: 'CAFETERIA', furnitureKind: 'CHAIR',
    durationMin: MEAL_MIN,
    wants: wantsMealNow,
    // 허기는 **여기서만** 내려간다(그리고 아침 freshMorning). 이 한 줄을 빼면 식당에 다녀온
    // 의사가 여전히 배고픈 채라, 다음 분에 또 나서는 무한 왕복이 되고 감속도 안 풀린다.
    onEnd: p => ({ ...p, hungerMin: 0 }),
  },
]

/** 붙어 있던 욕구 행동을 뗀다(입력 불변) — 종료·좌초·응급 인터럽트의 **단일 출처**다.
 *  세 자리가 각자 필드를 지우면 Task 2에서 필드가 늘 때 한 곳만 조용히 낡는다. */
export function clearActivity(p: Pawn): Pawn {
  const next: Pawn = { ...p }
  delete next.activity
  delete next.activityUntilMin
  return next
}

/** 욕구 행동을 끊고 **그 자리에 세운다**(dest·path까지 해제) — 응급이 의사를 낚아채는 자리.
 *  dest를 남기면 좌석 점유가 계속 잡혀 다른 의사가 그 의자에 못 앉고, path를 남기면 처치를
 *  **시작한 의사가 휴게실·식당을 향해 계속 걸어간다**(앉은 상태는 path가 이미 비어 등가라, 이
 *  줄이 실제로 값을 하는 구간은 **걸어가는 중**('TO_LOUNGE'·'TO_MEAL')의 인터럽트다 — 계약
 *  테스트도 거기서 잰다).
 *  회복도 허기 리셋도 **없다** — 블록이 끝나야 정산된다(먹다 끊긴 의사는 배고픈 채로 처치한다).
 *  ⓘ dest 해제의 대가: 인터럽트당한 의사는 의자 앞 타일에 그대로 남고, 좌석이 풀렸으므로 다른
 *    의사가 그 자리를 잡아 **두 폰이 한 타일에 겹칠 수 있다**. 결정론·장부에는 영향이 없고
 *    (겹침은 표시상의 일이다) 처치가 끝나면 책상으로 돌아가 저절로 풀린다 — 수용한 각색이다. */
export function interruptActivity(p: Pawn): Pawn {
  const next: Pawn = { ...clearActivity(p), path: [] }
  delete next.dest
  return next
}

interface StepCtx {
  /** 누군가의 `doctorId`로 물려 있는 의사 — 외래·응급과 **같은 출처**의 바쁨 판정이다. */
  busy: Set<string>
  blocked: Set<number>
  /** 이미 임자가 있는 욕구 좌석(휴게실 의자·식당 의자를 함께 담는다). 이번 분에 새로 잡은
   *  자리도 여기 얹혀 둘이 겹치지 않는다. */
  taken: Set<string>
}

/**
 * 의사 한 분(分) — 개시·전이·종료·좌초. tick이 `stepEmergencies` **뒤**에 부른다.
 *
 * 의사마다 한 분에 **한 갈래만** 지난다: 쉬러 나선 그 분에 곧바로 앉지 않고, 회복한 그 분에
 * 곧바로 다시 나서지 않는다. 갈래를 이어 붙이면 "걸어가는 데 걸리는 시간"이 사라져 배치
 * 인과(휴게실이 멀수록 책상 체류가 짧다 — 머리말의 실측)가 통째로 증발한다.
 *
 * 순회는 **폰 배열 순서**다 — 좌석이 모자랄 때 누가 먼저 앉는지가 그 순서로 정해진다
 * (외래 배정·응급 배정과 같은 타이브레이크라, 세 단계가 같은 근거로 결정론을 얻는다).
 */
export function stepDoctors(world: SimWorld): SimWorld {
  // ⓪ 허기는 **매 분** 오른다 — 일하든 쉬든 먹든 가리지 않는다(식사 중에도 오르고, 리셋은
  //    블록이 끝날 때 한 번이다: BREAKS의 onEnd). 이 줄이 아래 조기 반환보다 **앞**인 것이
  //    계약이다: 뒤에 두면 아무도 임계에 못 닿아 식사가 통째로 죽는다(에러 0의 무성 실패).
  const hasDoctor = world.pawns.some(p => p.kind === 'DOCTOR')
  const w = hasDoctor
    ? {
        ...world,
        pawns: world.pawns.map(p => (p.kind === 'DOCTOR' ? { ...p, hungerMin: hungerOf(p) + 1 } : p)),
      }
    : world

  // 욕구 행동 중인 의사도 없고 임계에 닿은 의사도 없으면 나머지는 통째로 건너뛴다 — 좌석·통행
  // 집합 계산은 그때만 값을 한다(분당 1회 지나는 길목이다). 행동이 같은 조기 반환이라
  // 관측되지 않는다(patientFlow·emergency의 앞머리 가드와 같은 형태).
  const relevant = w.pawns.some(
    p => p.kind === 'DOCTOR' && (p.activity !== undefined || wantsAnyBreak(p)),
  )
  if (!relevant) return w

  const ctx: StepCtx = {
    busy: new Set(w.pawns.map(p => p.doctorId).filter((id): id is string => !!id)),
    blocked: buildBlockedSet(w),
    // 좌석 점유는 **다른 의사의 dest**로 표현된다(환자 좌석 freeSeat와 같은 기계) — 별도
    // 점유 테이블을 두면 의사가 응급에 끌려가거나 아침이 오는 순간 되돌리는 걸 잊어
    // 의자가 영구히 잠긴다. dest는 어차피 재탐색용으로 이미 있다.
    // ⓘ 이 집합은 **분 시작 시점의 스냅샷**이라, 같은 분에 풀린 의자(그 분에 휴식이 끝났거나
    //   응급에 끌려간 자리)는 다음 분까지 예약된 것처럼 보인다 — 의도한 한 분의 지연이다.
    //   앞서 처리된 의사의 해제까지 반영하려면 순회 중에 집합을 되짚어야 하고, 그러면 결과가
    //   폰 배열 순서에 더 깊이 얽힌다. 한 분 늦게 앉는 것이 그 복잡도보다 싸다.
    // ⓘ 휴게실 의자와 식당 의자가 **한 집합**을 나눠 쓴다 — 키가 좌표라 방 종류를 안 봐도
    //   충돌하지 않고, 갈래마다 집합을 나누면 새 욕구가 붙을 때 한쪽만 낡는다.
    taken: new Set(
      w.pawns.filter(p => p.activity && p.dest).map(p => ptKey(p.dest!)),
    ),
  }
  const pawns = w.pawns.map(p => (p.kind === 'DOCTOR' ? stepDoctor(w, p, ctx) : p))
  return { ...w, pawns }
}

/** 이 의사가 지금 나설 만한 갈래가 하나라도 있는가 — 조기 반환 가드가 보는 축.
 *  개시(maybeStartBreak)와 **같은 표**를 훑는다: 가드가 임계를 따로 적으면 갈래를 더할 때
 *  한쪽만 낡아, 새 욕구가 "임계에 닿아도 아무 일이 안 일어나는" 상태로 조용히 죽는다. */
function wantsAnyBreak(p: Pawn): boolean {
  return BREAKS.some(def => def.wants(p))
}

function stepDoctor(w: SimWorld, p: Pawn, ctx: StepCtx): Pawn {
  const going = BREAKS.find(def => def.going === p.activity)
  if (going) {
    // ⓑ 전이 — 자리에 **닿는** 그 분에 앉는다. dest는 그대로 둔다(좌석 점유의 표현).
    if (p.dest && samePt(p, p.dest)) {
      return { ...p, activity: going.doing, activityUntilMin: w.minute + going.durationMin }
    }
    // ⓓ 좌초 — 못 닿았는데 경로가 비었다(tick의 재탐색이 실패했다는 뜻이고, 스스로는 절대
    //    못 벗어난다). 안 풀면 이 의사는 걸어가던 상태인 채 굳어 외래에도 응급에도 안 잡힌다 —
    //    합법적인 건설 한 번으로 의사 하나가 영구 정지한다(환자 좌초 해소와 같은 병).
    if (p.path.length === 0) return backToDesk(w, clearActivity(p), ctx.blocked)
    return p
  }

  const doing = BREAKS.find(def => def.doing === p.activity)
  if (doing) {
    // ⓒ 종료 — 예정 시각에 도달한 그 분에 한 번에 정산한다(회복·허기 리셋: BREAKS의 onEnd).
    //
    // `?? Infinity`(= 끝나지 않는다)는 **의도한 방향**이다. 이 상태는 현 생성 경로로는
    // 도달 불가지만(앉은 상태는 ⓑ에서만 만들어지고 거기서 activityUntilMin이 함께 실린다),
    // 손으로 세운 세계에서는 올 수 있다. 두 폴백 중 하나를 골라야 하고 —
    //  · Infinity: 안 끝난다(그 의사가 놀지만 **장부는 정직하다**)
    //  · 0·현재분: 곧바로 끝난다(쉬지도 먹지도 않은 정산을 **공짜로** 준다)
    // — 조용히 틀리는 쪽은 후자다. 회복은 이 게임에서 사직을 미루는 자원이라, 공짜로
    // 새면 피로 → 포화 → 사직의 인과가 에러 없이 약해진다. 던지지 않는 이유는 형제
    // 루프(patientFlow의 `examUntilMin ?? Infinity`·emergency의 `treatUntilMin ?? Infinity`)와
    // 같은 모양을 유지하기 위해서다 — 셋이 갈리면 손세계 픽스처가 자리마다 다르게 터진다.
    // 이 선택은 주석으로만 두지 않는다: needs.test.ts가 "종료 시각 없는 RESTING은 회복하지
    // 않는다"로 잠근다(폴백을 0으로 돌리면 그 테스트가 죽는다).
    if (w.minute < (p.activityUntilMin ?? Infinity)) return p
    return backToDesk(w, doing.onEnd(clearActivity(p)), ctx.blocked)
  }

  return maybeStartBreak(w, p, ctx)
}

/** ⓐ 개시 — 유휴 + 임계 + 갈 수 있는 빈 자리. 셋 다여야 나선다.
 *  "유휴"의 판정은 외래·응급과 **같은 출처**다(누군가 이 의사의 doctorId를 물고 있는가) —
 *  의사 쪽에 busy 플래그를 따로 두면 환자가 사라질 때 되돌리는 걸 잊어 영영 안 쉰다.
 *
 *  표를 **순서대로** 훑는다 — 그 순서가 곧 우선순위다(BREAKS 주석). 임계에 닿았는데 자리가
 *  없으면(방이 없거나 전부 찼거나 못 간다) 다음 갈래를 본다: 휴게실 없는 병원의 지치고
 *  배고픈 의사가 밥까지 굶을 이유는 없다. */
function maybeStartBreak(w: SimWorld, p: Pawn, ctx: StepCtx): Pawn {
  if (ctx.busy.has(p.id)) return p
  for (const def of BREAKS) {
    if (!def.wants(p)) continue
    for (const spot of furnitureSpots(w, def.roomType, def.furnitureKind, ctx.blocked)) {
      if (ctx.taken.has(ptKey(spot))) continue
      // 첫 후보가 도달 불가라고 여기서 끝내지 않는다 — 봉인된 휴게실 하나가 멀쩡한 다른
      // 휴게실을 통째로 가려 아무도 못 쉬게 되고, 철거가 없어 세션 내 비가역이다
      // (patientFlow.freeSeat의 선례). 정상 상황에선 첫 후보가 곧바로 닿는다.
      const path = findPath(w, { x: p.x, y: p.y }, spot)
      if (!path) continue
      ctx.taken.add(ptKey(spot))
      return { ...p, activity: def.going, dest: spot, path }
    }
  }
  return p
}

/** 자기 방 책상 앞으로 복귀 — 방이 없거나 못 가면 dest를 지우고 그 자리에 선다(멈춘 채 두느니).
 *  책상 앞 좌표는 `furnitureSpot`이 **단일 출처**다(day.freshMorning이 아침마다 쓰는 그 함수) —
 *  파생식을 복제하면 복귀 자리와 아침 자리가 갈려 의사가 어제와 다른 칸에 선다. */
function backToDesk(w: SimWorld, p: Pawn, blocked: Set<number>): Pawn {
  const spot = p.roomId ? furnitureSpot(w, p.roomId, 'DESK', blocked) : null
  const path = spot ? findPath(w, { x: p.x, y: p.y }, spot) : null
  if (!spot || !path) {
    const stay: Pawn = { ...p, path: [] }
    delete stay.dest
    return stay
  }
  return { ...p, dest: spot, path }
}
