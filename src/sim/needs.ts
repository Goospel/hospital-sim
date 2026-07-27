// 욕구 — 의사가 스스로 일을 끊고 자기를 돌보는 자리. 순수 함수(tick이 분당 1회 부른다).
//
// 지금 담는 욕구는 **피로의 행동화** 하나다: 지친 의사가 유휴일 때 휴게실 의자로 걸어가
// 한 블록 쉬고 책상으로 돌아온다. LOUNGE는 1주차부터 지을 수 있었지만 아무도 쓰지 않는
// 장식이었고, 이 파일이 그 방에 처음으로 뜻을 준다 — **배치가 회복 빈도를 정한다**(휴게실이
// 멀수록 왕복 보행에 시간을 뺏겨 덜 쉰다). 그래서 회복량은 상수여도 병원마다 다르게 걸린다.
//
// 설계 규칙은 환자 흐름(patientFlow)과 같다:
//  ① RNG 0 — 전부 결정론 상태 전이다. 이 파일은 seed를 읽지 않는다(새 무작위 축 없음).
//  ② 도착 판정은 **위치 == dest**다. `path.length === 0`은 길이가 끊겨 비워진 폰과 구별되지 않는다.
//  ③ 경로는 목적지가 정해질 때 1회만 계산한다(tick의 revalidate가 재탐색을 맡는다).
import { FATIGUE_RED } from '../game/doctor'
import { buildBlockedSet, findPath, type Pt } from './path'
import type { SimWorld } from './world'
import type { Pawn } from './pawn'
import { fatigueOf } from './fatigue'
import { furnitureSpot, furnitureSpots } from './patientFlow'

/** 휴식 한 블록의 길이(분) — 각색·튜닝값. 왕복 보행 시간과 합쳐 "휴게실이 멀면 덜 쉰다"가 된다. */
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

/** 붙어 있던 욕구 행동을 뗀다(입력 불변) — 종료·좌초·응급 인터럽트의 **단일 출처**다.
 *  세 자리가 각자 필드를 지우면 Task 2에서 필드가 늘 때 한 곳만 조용히 낡는다. */
export function clearActivity(p: Pawn): Pawn {
  const next: Pawn = { ...p }
  delete next.activity
  delete next.restUntilMin
  return next
}

/** 욕구 행동을 끊고 **그 자리에 세운다**(dest·path까지 해제) — 응급이 의사를 낚아채는 자리.
 *  dest를 남기면 좌석 점유가 계속 잡혀 다른 의사가 그 의자에 못 앉고, path를 남기면 처치를
 *  시작한 의사가 휴게실을 향해 계속 걸어간다. 회복은 **없다** — 블록이 끝나야 내려간다. */
export function interruptActivity(p: Pawn): Pawn {
  const next: Pawn = { ...clearActivity(p), path: [] }
  delete next.dest
  return next
}

interface StepCtx {
  /** 누군가의 `doctorId`로 물려 있는 의사 — 외래·응급과 **같은 출처**의 바쁨 판정이다. */
  busy: Set<string>
  blocked: Set<number>
  /** 이미 임자가 있는 휴게실 좌석. 이번 분에 새로 잡은 자리도 여기 얹혀 둘이 겹치지 않는다. */
  taken: Set<string>
}

/**
 * 의사 한 분(分) — 개시·전이·종료·좌초. tick이 `stepEmergencies` **뒤**에 부른다.
 *
 * 의사마다 한 분에 **한 갈래만** 지난다: 쉬러 나선 그 분에 곧바로 앉지 않고, 회복한 그 분에
 * 곧바로 다시 나서지 않는다. 갈래를 이어 붙이면 "걸어가는 데 걸리는 시간"이 사라져 배치
 * 인과(휴게실이 멀수록 덜 쉰다)가 통째로 증발한다.
 */
export function stepDoctors(world: SimWorld): SimWorld {
  // 쉬는 중인 의사도 없고 임계에 닿은 의사도 없으면 이 단계는 통째로 건너뛴다 — 좌석·통행
  // 집합 계산은 그때만 값을 한다(분당 1회 지나는 길목이다). 행동이 같은 조기 반환이라
  // 관측되지 않는다(patientFlow·emergency의 앞머리 가드와 같은 형태).
  const relevant = world.pawns.some(
    p => p.kind === 'DOCTOR' && (p.activity !== undefined || wantsRestNow(p)),
  )
  if (!relevant) return world

  const ctx: StepCtx = {
    busy: new Set(world.pawns.map(p => p.doctorId).filter((id): id is string => !!id)),
    blocked: buildBlockedSet(world),
    // 좌석 점유는 **다른 의사의 dest**로 표현된다(환자 좌석 freeSeat와 같은 기계) — 별도
    // 점유 테이블을 두면 의사가 응급에 끌려가거나 아침이 오는 순간 되돌리는 걸 잊어
    // 의자가 영구히 잠긴다. dest는 어차피 재탐색용으로 이미 있다.
    taken: new Set(
      world.pawns.filter(p => p.activity && p.dest).map(p => ptKey(p.dest!)),
    ),
  }
  let changed = false
  const pawns = world.pawns.map(p => {
    if (p.kind !== 'DOCTOR') return p
    const next = stepDoctor(world, p, ctx)
    if (next !== p) changed = true
    return next
  })
  return changed ? { ...world, pawns } : world
}

function stepDoctor(w: SimWorld, p: Pawn, ctx: StepCtx): Pawn {
  switch (p.activity) {
    case 'TO_LOUNGE': {
      // ⓑ 전이 — 의자에 **닿는** 그 분에 앉는다. dest는 그대로 둔다(좌석 점유의 표현).
      if (p.dest && samePt(p, p.dest)) {
        return { ...p, activity: 'RESTING', restUntilMin: w.minute + REST_BREAK_MIN }
      }
      // ⓓ 좌초 — 못 닿았는데 경로가 비었다(tick의 재탐색이 실패했다는 뜻이고, 스스로는 절대
      //    못 벗어난다). 안 풀면 이 의사는 'TO_LOUNGE'인 채 굳어 외래에도 응급에도 안 잡힌다 —
      //    합법적인 건설 한 번으로 의사 하나가 영구 정지한다(환자 좌초 해소와 같은 병).
      if (p.path.length === 0) return backToDesk(w, clearActivity(p), ctx.blocked)
      return p
    }
    case 'RESTING': {
      // ⓒ 종료 — 예정 시각에 도달한 그 분에 한 번에 내려간다.
      if (w.minute < (p.restUntilMin ?? Infinity)) return p
      const rested: Pawn = {
        ...clearActivity(p),
        fatigue: Math.max(0, fatigueOf(p) - REST_BREAK_RECOVER),
      }
      return backToDesk(w, rested, ctx.blocked)
    }
    default:
      return maybeStartRest(w, p, ctx)
  }
}

/** ⓐ 개시 — 유휴 + 임계 + 갈 수 있는 빈 의자. 셋 다여야 나선다.
 *  "유휴"의 판정은 외래·응급과 **같은 출처**다(누군가 이 의사의 doctorId를 물고 있는가) —
 *  의사 쪽에 busy 플래그를 따로 두면 환자가 사라질 때 되돌리는 걸 잊어 영영 안 쉰다. */
function maybeStartRest(w: SimWorld, p: Pawn, ctx: StepCtx): Pawn {
  if (ctx.busy.has(p.id)) return p
  if (!wantsRestNow(p)) return p
  for (const spot of furnitureSpots(w, 'LOUNGE', 'CHAIR', ctx.blocked)) {
    if (ctx.taken.has(ptKey(spot))) continue
    // 첫 후보가 도달 불가라고 여기서 끝내지 않는다 — 봉인된 휴게실 하나가 멀쩡한 다른
    // 휴게실을 통째로 가려 아무도 못 쉬게 되고, 철거가 없어 세션 내 비가역이다
    // (patientFlow.freeSeat의 선례). 정상 상황에선 첫 후보가 곧바로 닿는다.
    const path = findPath(w, { x: p.x, y: p.y }, spot)
    if (!path) continue
    ctx.taken.add(ptKey(spot))
    return { ...p, activity: 'TO_LOUNGE', dest: spot, path }
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
