// 피로 — 표준강도분 축적·진료 감속·아침 회복. 순수 계산(세계를 모르고 폰 하나만 본다).
//
// **곡선과 상수는 기존 게임(`src/game/doctor.ts`)에서 임포트한다 — 복제 금지.** 저쪽 주석이
// 그 수치의 튜닝 이력(300/35 → 160/15, 왜 건수가 아니라 시간×강도인가)을 통째로 들고 있어서,
// 숫자만 이쪽에 옮기면 근거가 사라진 채 두 곳이 조용히 갈린다. 이 파일에 곡선 값이 리터럴로
// 나타나지 않는다는 것은 테스트가 소스를 읽어 잠근다(fatigue.test.ts).
//
// 옛 층과 **다른 것은 시간 구조 하나**다: 저쪽 `stepFatigue`는 하루가 끝날 때 부하와 회복을
// 한 번에 처리하지만, 여기선 축적이 진료·처치가 **끝날 때마다**(그래야 오후의 감속이 그날
// 오전의 노동에서 나온다) 일어나고 회복은 **아침**에 따로 온다. 하루를 통으로 보면 같은
// 곡선이어야 하고, 그 등식을 계약 테스트가 `stepFatigue`와 대조해 잠근다.
import {
  FATIGUE_FREE_MIN, FATIGUE_MAX, FATIGUE_PER_OVER_HOUR, FATIGUE_REST, fatigueSlowFactor,
} from '../game/doctor'
import type { Pawn } from './pawn'

/** 분 → 시간 환산. 곡선 상수가 아니라 단위라 여기 둔다(FATIGUE_PER_OVER_HOUR가 '시간당'이다). */
const MIN_PER_HOUR = 60

/**
 * 하루 누적 **표준강도분** → 그날 쌓인 피로(정수·단조 증가·회복 이전 값).
 *
 * 누적치의 함수인 것이 핵심이다: 작업 한 건씩 따로 반올림해 더하면 같은 하루가 쪼개는 방식에
 * 따라 다른 피로를 낳는다(시간 분할 불변식의 피로판). 그래서 축적은 항상 **누적 전/후의 차**로
 * 얹고(addWorkLoad), 그 합은 정의상 하루치 gain 하나와 같다.
 */
export function fatigueGain(loadMin: number): number {
  const overHours = Math.max(0, loadMin - FATIGUE_FREE_MIN) / MIN_PER_HOUR
  return Math.round(overHours * FATIGUE_PER_OVER_HOUR)
}

/** 이 폰의 피로 — 없으면 0(환자·손세계 폰). 조회를 한 곳에 모아 `?? 0`이 흩어지지 않게 한다. */
export function fatigueOf(p: Pawn | undefined): number {
  return p?.fatigue ?? 0
}

/**
 * 작업 소요(분) — 기본 소요 × `fatigueSlowFactor`(34 이하 1.0, 100에서 1.5).
 *
 * **반올림(round)이지 올림이 아니다.** 소요는 분 단위 정수라야 마감·시간 분할 불변식이 성립하는데,
 * 올림으로 접으면 배율 1.0000…인 구간(피로 34 이하)만 빼고 **모든 건에 평균 +0.5분**이 얹혀
 * 곡선이 통째로 위로 밀린다(20분 진료면 +2.5%). 반올림은 연속 곡선에 가장 가까운 정수라
 * 그 편향이 없다. 어느 쪽이든 결정론은 같다(순수 함수).
 */
export function slowedDurationMin(baseMin: number, fatigue: number): number {
  return Math.round(baseMin * fatigueSlowFactor(fatigue))
}

/**
 * 끝난 작업 한 건의 표준강도분을 의사에게 얹는다(입력 불변 — tick의 순수성 계약).
 * 피로는 누적 전/후 gain의 **차**만큼 오르고 [0, FATIGUE_MAX]로 접힌다.
 */
export function addWorkLoad(p: Pawn, loadMin: number): Pawn {
  const before = p.loadMinToday ?? 0
  const after = before + loadMin
  const raised = fatigueOf(p) + fatigueGain(after) - fatigueGain(before)
  return { ...p, loadMinToday: after, fatigue: Math.max(0, Math.min(FATIGUE_MAX, raised)) }
}

/**
 * 의사별 표준강도분을 폰 배열에 한 번에 얹는다(입력 불변).
 *
 * 왜 모았다가 한 번에 얹나: 진료·처치의 완료는 **환자** 폰을 훑는 루프에서 관측되는데 그 시점에
 * 의사 폰은 이미 결과 배열로 넘어가 있다. 완료마다 배열을 되짚으면 O(폰²)이 되고, 무엇보다
 * 같은 분에 두 건이 끝난 의사(응급 처치 종료 + 외래 종료는 서로 다른 루프다)의 부하가
 * 덮어쓰기로 사라질 수 있다.
 */
export function applyWorkLoads(pawns: Pawn[], loadByDoctor: Map<string, number>): Pawn[] {
  if (loadByDoctor.size === 0) return pawns
  return pawns.map(p => {
    const load = p.kind === 'DOCTOR' ? loadByDoctor.get(p.id) : undefined
    return load === undefined ? p : addWorkLoad(p, load)
  })
}

/**
 * 하룻밤 회복 — 피로를 `FATIGUE_REST`만큼 내리고(하한 0) **하루 누적을 0으로 되돌린다**.
 *
 * 누적 리셋이 표시가 아니라 계산의 일부다: 안 되돌리면 이튿날 첫 진료가 어제 누적 위에 얹혀
 * 곧바로 문턱을 넘고, 그러면 `FATIGUE_FREE_MIN`("이만큼은 정상 근무")이 **하루 몫**이라는
 * 뜻을 잃는다. 의사가 아닌 폰은 손대지 않는다(피로는 의사만 갖는다).
 */
export function restOvernight(p: Pawn): Pawn {
  if (p.kind !== 'DOCTOR') return p
  return { ...p, fatigue: Math.max(0, fatigueOf(p) - FATIGUE_REST), loadMinToday: 0 }
}
