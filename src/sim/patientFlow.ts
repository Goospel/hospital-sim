// 환자 라이프사이클 — 도착·대기·배정·진료·이탈. tick에서 분당 1회 호출한다.
// 여기가 시뮬을 "게임"으로 만드는 자리다: 방·가구·의사·시간이 여기서 처음으로 서로를 본다.
//
// 설계 규칙 셋:
//  ① RNG 0 — 도착 판정은 seed 해시(seededUnit)뿐이다. Math.random·Date.now 금지(결정론).
//  ② 도착 판정은 **위치 == dest**다. `path.length === 0`은 "길이 끊겨 비워진 폰"과 구별되지 않는다.
//  ③ 경로는 목적지가 정해질 때 1회만 계산한다. 매 분 재탐색하면 findPath(~3ms)가 인원수만큼 곱해진다.
import { seededUnit, callSeed } from '../game/daysim'
import { buildBlockedSet, findPath, type Pt } from './path'
// ENTRANCE(정문)는 world가 단일 출처다 — 격자에서 파생하는 상수이고, 의사의 출근(pawn.hireDoctor)도
// 같은 문을 쓴다. 여기 두면 하위 모듈인 pawn이 이 파일을 값으로 당겨 레이어가 뒤집힌다.
import { ENTRANCE, simRegion, tileIndex, type SimWorld } from './world'
// 방은 이제 **파생값**이다 — 선언형 사각형(w.rooms)이 아니라 벽·문이 낳은 영역이 규칙의 방이다.
import { computeRegions, type Region } from './regions'
// 좌표 파생은 spots.ts가 **단일 출처**다(leaf). 이 파일에 두면 욕구(needs)가 좌석을 찾느라
// 상위를 값으로 당겨 needs ⇄ patientFlow 순환이 된다 — spots.ts 머리말.
import { examSlots, furnitureSpots, ptKey, samePt, type ExamSlot } from './spots'
import { nurseCount, priorityOf, type Pawn, type PatientStage } from './pawn'
import {
  simDept, addExamToDeptStats, type DeptMix, type SimDeptKey, type SimDeptStats,
} from './dept'
import { applyWorkLoads } from './fatigue'
// 작업 소요식(피로 × 허기 감속)은 needs.ts가 **단일 출처**다(응급도 같은 함수를 부른다) —
// 여기서 식을 다시 적으면 진료만 느려지고 처치는 그대로인 병원이 조용히 생긴다.
import { prefersRestOverExam, workDurationMin } from './needs'
// events.ts는 **leaf**다(world·dept 타입만 본다) — 값으로 당겨도 순환이 없다. 폴백 디렉터는
// 반대로 이 파일의 시드 폴딩을 쓰므로 director.ts에 따로 산다(T-093 · events.ts 머리말).
import { arrivalDeptMixOf, arrivalProbMulOf } from './events'

export const EXAM_DURATION_MIN = 20
/** 대기 인내 — 이만큼 앉아 있었는데 안 불리면 떠난다(수익 0). */
export const PATIENCE_MIN = 90
export const ARRIVAL_WINDOW_MIN = 480     // 주간(09:00~17:00)에만 도착
export const ARRIVAL_PROB_PER_MIN = 1 / 8 // 평균 8분에 한 명

/** 도착 스트림 전용 salt — daysim.callSeed 주석의 레지스트리에 없는 값이라야 한다
 *  (사용 중: 1·2·3·7·11·12·13·15·17·19·23, 이 파일에서 29·31). 새 무작위 축은 새 salt를 받는다. */
const ARRIVAL_SALT = 29

/** 희망 과 스트림 전용 salt — **도착 판정(29)과 반드시 다른 축**이다.
 *  같은 salt를 쓰면 두 시드가 통째로 같아지고, 도착이 성립한 분은 정의상
 *  `seededUnit < ARRIVAL_PROB_PER_MIN`(0.125)이라 **들어온 환자가 전원 첫 구간(내과)**이 된다 —
 *  분포가 45/20/15/20이 아니라 100/0/0/0으로 붕괴하는데 에러는 하나도 안 난다. 그래서 이 두
 *  스트림의 비상관은 취향이 아니라 계약이고, 테스트가 구간 전수의 시드 집합 교집합으로 잠근다. */
const WANTS_DEPT_SALT = 31

/** **분당 독립 판정 스트림의 시드 폴딩 — 이 층의 모든 무작위 축이 여기 하나를 쓴다.**
 *  날 키(주,날)를 먼저 해시해 하루의 기점을 잡고, 분은 그 위에 더한다.
 *  분마다 독립 판정이라 (판,주,날,분) 조합마다 서로 다른 시드가 필요하다.
 *
 *  ⚠️ 분을 callSeed의 index 슬롯에 넣으면 안 된다 — 그 슬롯 폭은 97인데(`(…*97 + index)*101`)
 *  분은 0..479라, day+1이 index+97과 **정확히 같은 시드**가 된다. 그러면 매일이 전날의 97분
 *  시프트 재방송이다(실측: 인접 날 겹침 383/383, 전수 26,880 튜플 중 고유값 5,815). 에러 없이
 *  게임만 죽는 종류이고, daysim의 callSeed 독스트링이 "index를 스트림 축으로 쓰지 마라"고
 *  경고한 바로 그 함정이다([T-087](../../claude-docs/troubleshooting/T-087.md)). 그래서
 *  index에는 0을 넣어 **날 키 전용**으로만 쓰고, 스트림을 가르는 축은 **salt 하나뿐**이다.
 *
 *  week가 들어가는 것도 같은 이유로 핵심이다: startNextWeek이 day를 1로 되돌리므로 week가
 *  빠지면 2주차가 1주차의 재방송이 된다. 즉석 폴딩(week * 7_000 따위)을 새로 만들지 않는
 *  이유는 슬롯 폭을 또 계산해야 하고 그 계산이 틀리면 먼 주차에서 조용히 충돌하기 때문이다.
 *
 *  world.seed(어느 판인가)는 callSeed에 슬롯이 없어 XOR로 얹는다. 덧셈이 아닌 이유: 슬롯
 *  산술이 `index * 101 + salt`라 세계 시드를 더하면 seed 101이 옆 슬롯으로 미끄러진다.
 *  자기 해시(seededUnit)를 통과시켜 32비트에 고루 퍼뜨린 뒤 XOR하면 슬롯을 안 건드린다.
 *
 *  **축마다 이 폴딩을 복제하지 않는다**(도착·희망 과·응급 도착·응급 종류가 전부 같은 모양이다) —
 *  복제하면 T-087의 교훈("검증된 폴딩의 재사용도 슬롯 폭 확인을 면제하지 않는다")이 축 수만큼
 *  다시 걸리고, 한 곳을 고칠 때 나머지가 조용히 낡는다. 새 축은 **새 salt만** 받는다. */
export function minuteStreamSeed(w: SimWorld, salt: number): number {
  const worldMix = (seededUnit(w.seed) * 2 ** 32) | 0
  const dayBase = (seededUnit(callSeed(w.week, w.day, 0, salt) ^ worldMix) * 2 ** 32) | 0
  return (dayBase + w.minute) | 0
}

/** 도착 판정 시드. 이 함수가 도착 시드의 **단일 출처**다 — 테스트가 공식을 손으로 다시 쓰면
 *  (예전 경계 테스트가 그랬다) 한쪽이 조용히 낡는다. */
export function arrivalSeed(w: SimWorld): number {
  return minuteStreamSeed(w, ARRIVAL_SALT)
}

/** 희망 과 시드 — `arrivalSeed`와 **같은 폴딩**을 쓰고 다른 것은 salt 하나뿐이다.
 *  그 하나가 도착 판정과의 상관을 끊는다(WANTS_DEPT_SALT 주석). */
export function wantsDeptSeed(w: SimWorld): number {
  return minuteStreamSeed(w, WANTS_DEPT_SALT)
}

/** 도착 환자의 희망 과 분포 — 계획 표(내과 45 · 외과 20 · 순환기 15 · 미용 20)의 **단일 출처**다.
 *  값은 각 구간의 **누적 상한**이고, 배열 순서가 곧 구간 순서라 결정론의 일부다.
 *  왜 누적으로 적나: 개별 확률로 두면 합이 1인지 눈으로 확인할 수 없고, 한 과를 조정할 때
 *  나머지를 손으로 맞춰야 한다. 마지막 값 1.00이 곧 "합계 1" 검사다. */
export const ARRIVAL_DEPT_MIX: DeptMix = [
  ['INTERNAL_MEDICINE', 0.45],
  ['GENERAL_SURGERY', 0.65],
  ['CARDIOLOGY', 0.80],
  ['AESTHETICS', 1.00],
]

/** [0,1) 난수 → 희망 과. 구간은 아래가 닫히고 위가 열린다(`u < upper`).
 *  치역 밖 값이 오면 마지막 과로 접지 않고 던진다 — 접으면 상한 표가 틀려도(마지막이 0.9 따위)
 *  미용이 조용히 늘어날 뿐 아무도 모른다.
 *
 *  `mix`는 이벤트(전염병)가 분포를 통째로 갈아 끼우기 위한 자리다 — **기계는 하나**이고 표만
 *  바뀐다. **기본값을 두지 않는다**: 유일한 호출부가 이미 `?? ARRIVAL_DEPT_MIX`로 폴백을
 *  적으므로 기본값은 두 벌째 벨트이고, 두 벌이 되는 순간 어느 쪽이 이기는지가 계약이 된다.
 *  게다가 아무도 안 밟는 기본값은 표가 갈리는 날 조용히 낡는다 — 부를 때마다 어느 표인지
 *  적게 해서 그 선택을 호출부에 남긴다. */
export function pickWantsDept(u: number, mix: DeptMix): SimDeptKey {
  if (u >= 0) for (const [dept, upper] of mix) if (u < upper) return dept
  throw new Error(`pickWantsDept: [0,1) 밖의 값(${u}) — seededUnit의 치역을 벗어났다`)
}

/** 환자의 희망 과 — 없으면 던진다.
 *  `undefined`를 카탈로그에 넘기면 수익이 NaN이 되어 금고로 번지는데, NaN은 어떤 예외도 안 내고
 *  이후 모든 산술을 NaN으로 오염시킨다(simDept가 던지는 것과 같은 이유). 도착(maybeArrive)이
 *  모든 환자에게 배정하므로, 비어 있다는 건 손으로 세운 세계이거나 배정 경로가 빠진 것이다. */
/**
 * 이 병원이 그 과를 **보는가** — 그 과 의사가 한 명이라도 있는가.
 *
 * 접수처 반려(maybeArrive)와 그 경고(simHud.alertsOf)가 **같은 한 줄**을 봐야 한다.
 * 갈리면 "돌려보내고 있는데 경고는 안 뜨는" 구간이 조용히 생긴다.
 *
 * ⚠️ 배정(`assignWaitingToExam`)의 삼중 일치 중 **의사 축 하나**만 본다 — 방·슬롯까지 보면
 * 책상이 잠깐 찬 순간에도 문을 닫아 버린다(그건 반려가 아니라 대기다).
 */
export const servesDept = (w: SimWorld, dept: SimDeptKey): boolean =>
  w.pawns.some(p => p.kind === 'DOCTOR' && p.dept === dept)

/** 도착 표에는 있는데 **보는 의사가 없는** 과들 — 지금 문 앞에서 돌려보내고 있는 과다. */
export const unservedDepts = (w: SimWorld): SimDeptKey[] =>
  ARRIVAL_DEPT_MIX.map(([dept]) => dept).filter(d => !servesDept(w, d))

export function wantsDeptOf(p: Pawn): SimDeptKey {
  if (!p.wantsDept) throw new Error(`환자(${p.id})에 wantsDept가 없다 — 도착에서 과가 배정되지 않았다`)
  return p.wantsDept
}

// ─── 수납 ────────────────────────────────────────────────────────────────────

/** 수납 자리 — **접수처 안** 카운터의 앞 통행 타일들(카운터는 `blocksWalk` 참이라 그 위가
 *  아니다 — `occupySpot`이 그 갈림의 단일 출처다). 순서는 furniture 배열 순서(= 설치 순서)라
 *  대기실 좌석·병동 침대와 같은 규칙이고, 간호사가 설 자리와 환자가 갈 자리가 **같은 표**다:
 *  두 곳이 각자 좌표를 뽑으면 간호사가 선 창구와 환자가 가는 창구가 서로 다른 카운터가 된다. */
export function cashierSpots(
  w: SimWorld, blocked: Set<number> = buildBlockedSet(w), regions?: readonly Region[],
): Pt[] {
  return furnitureSpots(w, 'RECEPTION', 'COUNTER', blocked, regions)
}

/**
 * 이 병원이 진료비를 걷는가 — **접수처 안 카운터 ≥ 1 그리고 간호사 ≥ 1**.
 *
 * **판정을 이 한 곳에 모으는 것이 계약이다**(`blocksWalk`·`servesDept`와 같은 이유): 환자
 * 흐름·응급·마감 정산·체크리스트·경고가 전부 이 함수를 본다. 계상 지점이 다섯이라 한 곳만
 * 따로 판정하면 "창구가 없는데 그 한 건만 걷히는" 구간이 조용히 생긴다.
 *
 * ⚠️ 간호사의 **도착 여부는 안 본다**(뽑혀 있으면 성립한다). 진료실은 의사 도착을 기다리지만
 * 수납까지 그러면 대기 상태가 하나 더 생기고, 화면상 간호사는 어차피 카운터로 걸어가므로
 * (assignNurseCounters) 대부분의 시간 어긋남이 없다 — 마감 12일 전에 그 복잡도는 안 산다.
 */
export function hasCashier(
  w: SimWorld, blocked: Set<number> = buildBlockedSet(w), regions?: readonly Region[],
): boolean {
  return nurseCount(w.pawns) > 0 && cashierSpots(w, blocked, regions).length > 0
}

/** 끝난 외래 한 건의 **표준강도분**(소요 × 과 강도) — 피로 축적의 입력.
 *  단위를 여기 한 곳에 모으는 이유: 진료의 완료는 두 곳에서 관측된다(정상 종료는
 *  `progressStages`, 마감에 걸린 건은 `day.settleDay`). 식을 양쪽에 적으면 한쪽만 강도를
 *  잊거나 폴백이 갈려도 에러 없이 피로만 어긋난다 — 마감 쪽이 실제로 그랬다.
 *  `workMin` 폴백은 손세계 폰(진료 시작을 거치지 않고 IN_EXAM으로 세운 세계)의 몫이다. */
export function examLoadMin(p: Pawn, dept: SimDeptKey): number {
  return (p.workMin ?? EXAM_DURATION_MIN) * simDept(dept).intensity
}

/** `regions`는 **호출부가 한 틱에 1회 계산해 넘긴다**(tick.ts · 설계 §1-2). 세 단계가 각자
 *  flood fill을 돌면 같은 답을 분마다 여러 번 다시 계산한다. 기본값은 테스트·단발 호출용이고,
 *  벽·문·용도는 틱 안에서 바뀌지 않으므로(건설은 UI 경로다) 답은 어느 쪽이든 같다. */
export function stepPatients(
  world: SimWorld, regions: readonly Region[] = computeRegions(world),
): SimWorld {
  let w = maybeArrive(world, regions)
  w = assignDoctorDesks(w, regions)
  w = assignNurseCounters(w, regions)
  w = assignWaitingToExam(w, regions)
  return progressStages(w, regions)
}

/** 이 폰이 그 영역 **안**에 서 있는가 — 옛 `insideRoom(rect, p)`의 자리다.
 *  사각형 포함이 아니라 타일 소속인 것이 요지다: 영역은 임의 모양이라 사각형으로 물을 수 없다. */
const insideRegion = (r: Region, p: { x: number; y: number }) => r.tiles.has(tileIndex(p.x, p.y))

// ─── 도착 ────────────────────────────────────────────────────────────────────

/** 대기실 좌석 = 의자 앞에 설 수 있는 타일들(자리 계약은 spots.furnitureSpots 주석).
 *  **좌표 파생과 달리 이 함수는 방 종류의 의미를 안다**("대기실") — 그래서 spots.ts로 내리지
 *  않고 여기 남는다(spots.ts 머리말의 경계). */
export function waitingSeats(
  w: SimWorld, blocked: Set<number> = buildBlockedSet(w), regions?: readonly Region[],
): Pt[] {
  return furnitureSpots(w, 'WAITING', 'CHAIR', blocked, regions)
}

/** 비어 있고 **입구에서 닿을 수 있는** 첫 좌석과 거기까지의 경로.
 *  좌석 점유는 환자의 dest로 표현된다 — 별도 점유 테이블을 두면 폰 제거·이동과 어긋날 수 있고,
 *  dest는 어차피 재탐색용으로 이미 있다. */
function freeSeat(
  w: SimWorld, blocked: Set<number>, regions: readonly Region[],
): { spot: Pt; path: Pt[] } | null {
  const taken = new Set(
    w.pawns
      .filter(p => (p.stage === 'ENTERING' || p.stage === 'WAITING') && p.dest)
      .map(p => ptKey(p.dest!)),
  )
  // 첫 후보가 도달 불가라고 여기서 끝내면 안 된다 — 봉인된 대기실의 의자 하나가 멀쩡한
  // 다른 대기실 전체를 가려 신규 도착이 영원히 0이 된다(철거가 없어 세션 내 비가역).
  // 정상 상황에선 첫 후보가 곧바로 닿아 findPath 호출 수가 지금까지와 같다 — 성능 계약 유지.
  for (const spot of waitingSeats(w, blocked, regions)) {
    if (taken.has(ptKey(spot))) continue
    const path = findPath(w, ENTRANCE, spot)
    if (path) return { spot, path }
  }
  return null
}

/**
 * 이 분에 외래 환자가 문을 들어서는가 — **도착 문턱 판정의 단일 출처**. 좌석·과·의사는 안 본다
 * (그건 들어선 뒤의 이야기다). 응급 축의 `emergency.emergencyArrivalAt`과 같은 자리이고,
 * 같은 이유로 **export 한다**: 배율의 *크기*를 재려면 40,320분 전수 표본이 필요한데 tick 경로로는
 * 하루치가 한계라(patientFlow.test 「건수가 카탈로그 배율에 붙는다」) 판정만 따로 부를 수 있어야
 * 한다. 테스트가 문턱 공식을 복제하면 훅을 통째로 떼어내도 초록으로 남는다.
 *
 * 실효 구간은 분 1~479다 — tick이 minute을 먼저 올리고 부르므로 0분은 판정 자체가 없고,
 * 480분은 창이 닫힌 쪽이다(경계 테스트가 이 두 끝을 잠근다).
 *
 * 분마다 독립 판정 — 이래야 도착이 몰릴 때 몰리고(대기열이 생기고) 빌 때 빈다.
 * 오늘의 이벤트 배율이 여기서 곱해진다(events.arrivalProbMulOf) — 이벤트가 없으면 1이라
 * **평일의 도착 스트림은 이 훅이 붙기 전과 완전히 같다**(기존 결정론 테스트가 그걸 잠근다).
 * 시드가 아니라 **문턱**을 곱하는 것이 핵심이다: 시드를 흔들면 이벤트 유무가 도착 시각의
 * 배열 자체를 바꿔 "평일 대비 몇 배"를 잴 수 없고, 문턱을 올리면 평일 도착이 부분집합으로 남는다.
 * 지역 배율도 **같은 자리에 곱으로 중첩된다**(world.REGIONS) — 같은 이유로 도착 분 집합이
 * RURAL(0.7) ⊂ URBAN(1.0) ⊂ NEWTOWN(1.2)의 부분집합 관계로 남는다. URBAN이 1이라
 * 기본 세계의 도착 스트림은 이 훅이 붙기 전과 완전히 같다(기존 결정론 회귀 보존).
 */
export function arrivalAt(w: SimWorld): boolean {
  if (w.minute >= ARRIVAL_WINDOW_MIN) return false
  const threshold = ARRIVAL_PROB_PER_MIN * arrivalProbMulOf(w) * simRegion(w.region).arrivalMul
  return seededUnit(arrivalSeed(w)) < threshold
}

function maybeArrive(w: SimWorld, regions: readonly Region[]): SimWorld {
  if (!arrivalAt(w)) return w
  // 무엇을 보러 왔는가는 문을 들어서는 순간 정해지고 이후 바뀌지 않는다. 시드는 (판·주·날·분)의
  // 순수 함수라 **호출 순서에 의존하지 않는다** — 발길을 돌린 사람 몫을 건너뛰어도 뒤 환자의
  // 과가 밀리지 않는다(순차 소비형 RNG였다면 좌석 수가 과 분포를 흔들었을 것이다).
  // 표는 **세 칸짜리 폴백 사슬**이고 순서가 계약이다 — 이벤트 > 지역 > 전국:
  // 전염병 날은 어느 지역이든 내과로 쏠린다(NEWTOWN의 미용 표가 그날 하루 꺼지는 것이 의도다).
  // 지역 표가 없으면(URBAN) 전국 표로 떨어져 기존 분포가 그대로 유지된다.
  const mix = arrivalDeptMixOf(w) ?? simRegion(w.region).deptMix ?? ARRIVAL_DEPT_MIX
  const wantsDept = pickWantsDept(seededUnit(wantsDeptSeed(w)), mix)
  /* 접수처 반려 — **그 과를 아예 안 보는 병원이면 대기실까지 들어오지 않는다.**
     좌석 판정보다 **먼저**인 것이 이 분기의 전부다: 뒤에 두면 안 보는 과 환자가 의자를 잡고
     PATIENCE_MIN(90분)을 앉아 있다가 떠나는데, 그동안 그 자리가 잠겨 **볼 수 있었던 환자까지**
     문간에서 돌아간다(한 명이 이탈을 두 건 만든다). 도착의 45%가 내과인 표에서 내과가 없으면
     대기실 절반이 영구히 잠기는 셈이었다.
     ⚠️ 판정은 **의사**가 기준이다(진료실이 아니다). 접수처가 아는 것은 "우리가 그 과를 보는가"이지
     방이 준비됐는가가 아니다 — 의사는 있는데 방이 없으면 그건 기다릴 만한 상태다(곧 지어진다).
     ⚠️ **놓쳤다는 숫자는 그대로 센다**(leftCount). 이 게임의 논지가 그 숫자다 — 안 뽑아서 못 본
     환자가 집계에서 사라지면 판이 "안 뽑는 게 이득"이라고 조용히 말하게 된다. */
  if (!servesDept(w, wantsDept)) {
    return { ...w, stats: { ...w.stats, leftCount: w.stats.leftCount + 1, leftNoDept: w.stats.leftNoDept + 1 } }
  }
  const seat = freeSeat(w, buildBlockedSet(w), regions)
  // 앉을 데가 없거나 거기까지 갈 수 없으면 문간에서 발길을 돌린다 — 폰을 만들지도 않는다.
  if (!seat) return { ...w, stats: { ...w.stats, leftCount: w.stats.leftCount + 1 } }
  const patient: Pawn = {
    id: `pat-${w.nextId}`, kind: 'PATIENT',
    x: ENTRANCE.x, y: ENTRANCE.y, path: seat.path, dest: seat.spot, stage: 'ENTERING',
    wantsDept,
  }
  return { ...w, nextId: w.nextId + 1, pawns: [...w.pawns, patient] }
}

// ─── 배정 ────────────────────────────────────────────────────────────────────

/** 진료 슬롯을 **책상 좌표 키**로 — 배정과 라우팅이 같은 표를 본다(짝짓기가 갈리면 의사가 앉은
 *  책상과 환자가 앉는 의자가 서로 다른 슬롯의 것이 된다). 순서는 영역 순서 × 설치 순서다. */
function examSlotIndex(
  w: SimWorld, regions: readonly Region[], blocked: Set<number>,
): Map<string, { region: Region; slot: ExamSlot }> {
  const out = new Map<string, { region: Region; slot: ExamSlot }>()
  for (const region of regions) {
    if (region.type !== 'EXAM') continue
    for (const slot of examSlots(w, region, blocked)) out.set(ptKey(slot.desk), { region, slot })
  }
  return out
}

/** 책상 없는 의사를 **자기 과의** 빈 진료 슬롯에 앉히고 그 책상 앞으로 보낸다
 *  (폰 순서 × 슬롯 순서 = 결정론).
 *
 *  ⚠️ 배정의 단위가 **방에서 책상으로** 내려온 것이 이 PR의 전부다: 큰 진료실에 책상을 셋 놓으면
 *  같은 과 의사가 셋 들어간다. 점유는 다른 의사의 `deskAt` 하나로만 판정하므로(별도 테이블 없음)
 *  같은 좌표에 둘이 앉는 일은 구조적으로 불가능하다.
 *
 *  ⚠️ 철거로 슬롯이 사라진 책상을 물고 있는 의사는 여기서 **배정이 풀린다**. 안 풀면 그 의사는
 *  존재하지 않는 책상을 문 채 영원히 놀고(라우팅이 그 슬롯을 못 찾아 환자도 안 받는다), 되돌릴
 *  방법이 없다 — 철거는 이제 플레이어가 언제든 누르는 도구다(설계 §2).
 *
 *  ⚠️ 과가 다른 방에 앉히지 않는 것은 그대로다: 그러면 그 의사는 영원히 놀면서 책상 하나를 물고
 *  있고(라우팅의 삼중 일치가 막는다), 같은 과 의사가 뒤에 와도 그 자리를 못 쓴다. */
function assignDoctorDesks(w: SimWorld, regions: readonly Region[]): SimWorld {
  if (!w.pawns.some(p => p.kind === 'DOCTOR')) return w
  const blocked = buildBlockedSet(w)
  const index = examSlotIndex(w, regions, blocked)
  const taken = new Set(
    w.pawns.map(p => p.deskAt).filter((d): d is Pt => !!d).map(ptKey).filter(k => index.has(k)),
  )
  const pawns = w.pawns.map(p => {
    if (p.kind !== 'DOCTOR') return p
    if (p.deskAt) {
      if (index.has(ptKey(p.deskAt))) return p
      const freed: Pawn = { ...p } // 책상이 철거됐거나 의자를 잃었다 — 다음 분에 다시 배정된다
      delete freed.deskAt
      return freed
    }
    // `p.activity`(needs.ts) — 욕구 행동 중인 의사는 **책상 배정도 받지 않는다**. 형제
    // (assignWaitingToExam)와 대칭인 이 한 줄이 없으면 배정이 그 의사의 dest·path를 책상으로
    // 덮어써, 휴게실로 걸어가던 사람이 **자기 책상에서 'RESTING'** 이 된다(실측: TO_LOUNGE
    // 도중 같은 과 진료실을 지으면 재현). 왕복 없이 회복 15가 들어오고, 의자를 안 쓰니 좌석
    // 한도도 우회되며, 배치 인과(거리가 책상 체류를 깎는다)가 통째로 증발한다 — 에러는 0이다.
    // 배정은 사라지지 않고 **미뤄질 뿐**이다: 휴식이 끝나면 다음 분에 다시 후보가 된다.
    if (p.activity) return p
    for (const [key, { region, slot }] of index) {
      if (taken.has(key)) continue
      // 과 없는 의사(손세계 폰)는 어떤 방과도 같지 않아 여기서 전부 걸러진다 — 의도된 결과다.
      if (region.dept !== p.dept) continue
      const path = findPath(w, { x: p.x, y: p.y }, slot.doctorSpot)
      if (!path) continue // 못 가는 자리는 다른 슬롯을 본다 — 배정은 다음 분에 다시 시도된다
      taken.add(key)
      return { ...p, deskAt: slot.desk, dest: slot.doctorSpot, path }
    }
    return p
  })
  return { ...w, pawns }
}

/**
 * 간호사를 카운터 앞으로 보낸다 — 의사의 책상 배정(`assignDoctorDesks`)과 같은 자리의 같은 기계.
 *
 * **아침 리셋(day.freshMorning)에 간호사 분기를 두지 않는 이유가 이것이다**: 아침은 모두의
 * `dest`·`path`를 비우므로, 매 분 도는 이 배정이 그 다음 분에 저절로 다시 붙인다. 두 곳에
 * 적으면 "아침에는 카운터로 가는데 낮에 뽑은 간호사는 입구에 서 있는" 비대칭이 생긴다.
 *
 * 자리는 **순서대로 하나씩** 나눠 갖는다(간호사 i ↔ 카운터 i). 남는 간호사는 그 자리에 선다 —
 * 한 자리에 둘을 보내면 스프라이트가 타일을 꽉 채우는 탓에 **두 명이 화면에서 한 명**이 된다
 * (`spawnSpotNear`가 점유를 보는 것과 같은 이유). 수납 판정은 인원수만 보므로(`hasCashier`)
 * 못 앉은 간호사가 있어도 창구는 그대로 성립한다.
 */
function assignNurseCounters(w: SimWorld, regions: readonly Region[]): SimWorld {
  const nurses = w.pawns.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'NURSE')
  if (nurses.length === 0) return w
  const spots = cashierSpots(w, buildBlockedSet(w), regions)
  if (spots.length === 0) return w // 창구가 아직 없다 — 있던 자리에 그대로 선다(의사의 "방 없음")
  const updates = new Map<number, Pawn>()
  for (const [n, { p, i }] of nurses.entries()) {
    const spot = spots[n]
    // 이미 그 자리를 겨누고 있으면 손대지 않는다 — 매 분 findPath를 다시 돌면(최장 ~3ms)
    // 인원수만큼 곱해져 프레임을 먹는다(이 파일 머리말 규칙 ③).
    if (!spot || (p.dest && samePt(p.dest, spot))) continue
    const path = findPath(w, { x: p.x, y: p.y }, spot)
    if (!path) continue // 못 가는 자리는 다음 분에 다시 시도한다
    updates.set(i, { ...p, dest: spot, path })
  }
  if (updates.size === 0) return w
  return { ...w, pawns: w.pawns.map((p, i) => updates.get(i) ?? p) }
}

/** 대기 환자(도착순)와 유휴 의사를 짝짓는다. 의사의 "바쁨"은 환자의 doctorId로만 표현된다 —
 *  의사 쪽에 busy 플래그를 두면 환자가 사라질 때(제거·이탈) 되돌리는 걸 잊어 방이 영구히 잠긴다.
 *
 *  ⚠️ **삼중 일치**가 이 슬라이스의 심장이다: 환자의 희망 과 == 진료실의 과 == 의사의 과일
 *  때만 짝이 성립한다. 셋 중 하나라도 빼면 "아무 의사나 아무 환자를 본다"가 되어, 과를 세운
 *  의미(그 과가 없으면 그 환자를 놓친다)가 통째로 사라진다 — 게임은 계속 돌고 숫자만 거짓이 된다.
 *  방 축이 남아 있는 이유: 배정(assignDoctorRooms)이 이미 같은 과로 앉히지만, 그건 **다른 함수의
 *  성질**이라 여기서 다시 확인하지 않으면 그쪽이 느슨해지는 순간 조용히 새는 통로가 된다. */
function assignWaitingToExam(w: SimWorld, regions: readonly Region[]): SimWorld {
  const waiting = w.pawns
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.stage === 'WAITING')
    .sort((a, b) => (a.p.arrivedMin ?? 0) - (b.p.arrivedMin ?? 0) || a.i - b.i)
  if (waiting.length === 0) return w
  const blocked = buildBlockedSet(w)
  // 배정과 **같은 표**를 본다 — 의사가 앉은 책상에서 그 짝인 환자의자가 나온다.
  const index = examSlotIndex(w, regions, blocked)
  const busy = new Set(w.pawns.map(p => p.doctorId).filter((id): id is string => !!id))
  // 유휴 의사를 **과별 줄**로 세운다 — 과마다 대기열이 따로 서므로, 내과가 밀려도 미용은 돈다.
  const idleByDept = new Map<SimDeptKey, Array<{ doc: Pawn; i: number }>>()
  for (const [i, p] of w.pawns.entries()) {
    // `p.activity`(needs.ts) — 쉬러 나섰거나 쉬고 있는 의사는 유휴가 **아니다**. 이 축이
    // 없으면 진료실을 나서는 도중(아직 방 안이라 insideRoom이 참인 구간)에 환자가 붙어,
    // 의사는 휴게실로 걸어가는데 환자는 진료실 의자로 걸어가는 두 갈래가 생긴다.
    if (p.kind !== 'DOCTOR' || !p.deskAt || busy.has(p.id) || !p.dept || p.activity) continue
    // `exam === 0`은 **금지**다 — 이 의사는 대기 환자를 영원히 안 받는다(그 과에 다른 의사가
    // 없으면 그 환자들은 인내를 넘겨 떠난다). 플레이어가 고른 대가이고, 장부에 그대로 실린다.
    if (priorityOf(p, 'exam') === 0) continue
    // 슬롯이 사라진 책상(철거)이면 이번 분엔 못 받는다 — 배정이 다음 분에 풀린다.
    const seat = index.get(ptKey(p.deskAt))
    if (!seat || !insideRegion(seat.region, p)) continue // 아직 방으로 걸어가는 중이면 진료를 못 받는다
    if (seat.region.dept !== p.dept) continue            // 삼중 일치의 방 축
    // 휴식을 진료보다 높게 매긴 지친 의사는 **환자가 줄 서 있어도** 유휴 풀에서 빠진다.
    // (`needs.prefersRestOverExam`이 단일 출처다 — 식을 여기 복제하면 욕구 기계의 판정과 갈려,
    //  안 쉬는데 환자도 안 받는 구간이 생긴다. 순서상 삼중 일치 뒤에 두어 "라우팅이 성립하는가"와
    //  "그럼에도 안 받는가"를 갈라 놓는다 — 술어가 순수해 어느 자리든 결과는 같다.)
    //
    // ⚠️ 여기서 빠진 의사가 **반드시 쉬러 가는 것은 아니다.** 그 분의 stepDoctors는 빈 휴게실
    //    좌석을 찾지 못하면 아무 데도 안 보내고, 그러면 그 의사는 진료도 휴식도 없이 **논다**
    //    (피로 그대로 · 대기 환자는 인내를 넘겨 떠난다 · 에러 0).
    //
    //    이것은 버그가 아니라 **각색**이다: 쉬라고 지시해 놓고 쉴 곳을 안 지은 병원이 치르는
    //    대가이고, 플레이어가 명시로 고른 구성(rest > exam)에서만 온다. 비가역도 아니다 —
    //    밤 회복(FATIGUE_REST)이 피로를 임계 아래로 내리면 이튿날 저절로 풀리고, 토글을
    //    되돌리거나 휴게실을 지어도 풀린다. 세 갈래 다 needs.test·priority.test가 잠근다.
    //
    //    ⓘ Task 2의 「휴게실이 없으면 밥이라도 먹으러 간다」와 **다른 판정인 이유**: 그쪽은
    //      다른 욕구(식사)의 **자리가 있는데** 못 가게 막는 것이라 벌이 아니라 버그였다.
    //      이쪽은 그 욕구의 자리 **자체가 없다** — 갈 곳이 없는 것을 기계가 만들어낼 수는 없다.
    if (prefersRestOverExam(p)) continue
    const queue = idleByDept.get(p.dept)
    if (queue) queue.push({ doc: p, i })
    else idleByDept.set(p.dept, [{ doc: p, i }])
  }
  if (idleByDept.size === 0) return w
  // 줄 안의 순서는 **exam 내림차순, 동률이면 폰 배열 순서**다. 배열 인덱스를 명시적으로 들고
  // 타이브레이크에 쓰는 이유는 `Array.sort`의 안정성에 기대지 않기 위해서다 — 결정론이 런타임
  // 구현 세부에 얹히면 그 근거를 코드에서 읽을 수 없다(대기 환자 정렬과 같은 형태).
  for (const queue of idleByDept.values()) {
    queue.sort((a, b) => priorityOf(b.doc, 'exam') - priorityOf(a.doc, 'exam') || a.i - b.i)
  }
  const updates = new Map<number, Pawn>()
  for (const { p, i } of waiting) {
    // 삼중 일치의 환자 축 — 자기 과 줄에서만 의사를 꺼낸다. 그 과가 없거나 전원이 바쁘면
    // 이 환자는 이번 분에 못 불리고 계속 앉아 있다가 PATIENCE_MIN을 넘기면 떠난다.
    const queue = p.wantsDept ? idleByDept.get(p.wantsDept) : undefined
    const doc = queue?.shift()?.doc
    if (!doc) continue
    // **그 의사의 슬롯 환자의자** 앞이다 — 방의 첫 의자가 아니다. 책상이 여럿인 진료실에서
    // 방의 첫 의자를 잡으면 세 환자가 한 의자로 몰리고 진료실 정원이 다시 1로 접힌다.
    const spot = doc.deskAt && index.get(ptKey(doc.deskAt))?.slot.patientSpot
    const path = spot ? findPath(w, { x: p.x, y: p.y }, spot) : null
    // 갈 수 없으면 그 의사를 건너뛴다(이미 줄에서 뺐다). ⚠️ 도달 가능성은 **환자 위치에도**
    // 달렸으므로 다른 환자라면 갈 수 있었을 수 있다 — 즉 이건 공평한 판정이 아니라 재시도
    // 폭주를 막는 절충이다. 밀린 환자는 다음 분에 다시 후보가 되고, 계속 못 가면 인내가 상한을 친다.
    if (!spot || !path) continue
    updates.set(i, { ...p, stage: 'TO_EXAM', doctorId: doc.id, dest: spot, path })
  }
  if (updates.size === 0) return w
  return { ...w, pawns: w.pawns.map((p, i) => updates.get(i) ?? p) }
}

// ─── 스테이지 전이 ────────────────────────────────────────────────────────────

/** 퇴장 준비 — 입구로 향하게 한다. null이면 그 자리에서 사라진다(GONE).
 *  응급(emergency.ts)도 처치가 끝나면 이 함수로 내보낸다 — 퇴장의 단일 출처라, 여기 규칙
 *  (경로가 끊긴 폰은 남기지 않는다)이 응급에서만 갈리는 일이 없다.
 *  퇴장 경로가 끊긴 폰을 남겨두면 영원히 서서 좌석·집계를 갉아먹는다.
 *  이미 입구에 선 폰은 path가 빈 채로 살아 나가고 다음 틱에 제거된다 — 여기서 미리 걸러
 *  한 틱을 아낄 수 있지만, 그 분기는 어떤 테스트로도 관측되지 않는(=사살 불가) 최적화라 두지 않는다. */
export function toExit(w: SimWorld, p: Pawn, stage: PatientStage): Pawn | null {
  const path = findPath(w, { x: p.x, y: p.y }, ENTRANCE)
  return path ? { ...p, stage, dest: ENTRANCE, path } : null
}

function progressStages(w: SimWorld, regions: readonly Region[]): SimWorld {
  let treasuryManwon = w.treasuryManwon
  let { examsDone, leftCount, unpaidManwon } = w.stats
  // 과별 집계는 갈아끼우기(재할당)로만 갱신한다 — 입력 세계의 객체를 건드리면 tick의 순수성이 깨진다.
  let byDept: SimDeptStats = w.stats.byDept
  /** 이번 분에 끝난 진료의 **표준강도분**을 의사별로 모은다 — 의사 폰은 이 루프의 앞머리에서
   *  이미 `out`으로 넘어가므로 여기서 직접 못 고친다(applyWorkLoads 주석). */
  const loadByDoctor = new Map<string, number>()
  const out: Pawn[] = []
  const keep = (p: Pawn | null) => { if (p) out.push(p) }
  /** 수납 자리 — **처음 필요할 때 한 번만** 계산한다. 진료가 하나도 안 끝나는 분이 대부분이라
   *  분마다 미리 뽑으면 가구 스캔이 공짜로 480번 돈다(`blocked` 집합을 공유하는 것과 같은 결). */
  let cashier: Pt[] | undefined
  const cashierAt = (): Pt | undefined => {
    if (cashier === undefined) {
      const blocked = buildBlockedSet(w)
      cashier = hasCashier(w, blocked, regions) ? cashierSpots(w, blocked, regions) : []
    }
    return cashier[0]
  }

  for (const p of w.pawns) {
    if (p.kind !== 'PATIENT') { out.push(p); continue }
    const arrived = !!p.dest && samePt(p, p.dest)
    // 좌초 — 목적지에 못 닿았는데 경로가 비었다. tick의 재탐색이 실패했다는 뜻이고,
    // 스스로는 절대 못 벗어난다(경로는 목적지가 정해질 때만 계산된다). 여기서 안 풀면
    // 그 폰은 영구 정지하고, TO_EXAM이면 doctorId를 문 채라 진료실까지 같이 잠긴다.
    // 합법적인 건설 한 번(예: 진료실 문 앞을 막는 방)으로 병원 전체가 멎을 수 있다.
    const stranded = !arrived && p.path.length === 0
    switch (p.stage) {
      case 'ENTERING':
        if (arrived) keep({ ...p, stage: 'WAITING', arrivedMin: w.minute })
        else if (stranded) { leftCount++; keep(toExit(w, p, 'LEFT_WAITING')) }
        else keep(p)
        break
      case 'WAITING':
        if (w.minute - (p.arrivedMin ?? w.minute) > PATIENCE_MIN) {
          leftCount++
          keep(toExit(w, p, 'LEFT_WAITING'))
        } else keep(p)
        break
      case 'TO_EXAM':
        if (arrived) {
          // 소요는 **시작하는 순간** 담당 의사의 피로·허기로 확정된다(진료 중에 늘었다 줄었다
          // 하지 않는다). 그 의사는 이 환자를 문 채라 진료가 끝날 때까지 다른 일을 못 하므로,
          // 이번 분 안에서 그의 상태가 바뀔 길도 없다.
          //
          // 감속식(곱 순서·이중 반올림)은 `needs.workDurationMin`이 **단일 출처**다 — 응급
          // 처치(emergency.assignEmergencyDoctors)가 부르는 그 함수다. 식을 여기 다시 적으면
          // 같은 상태의 의사가 진료와 처치에서 다른 배율을 받는다.
          // ⚠️ **곱 순서는 외래에서 계측되지 않는다**(등가 돌연변이 · STARVED_SLOW 1.3 기준으로
          //    재측정 2026-07-28): 20분은 순서를 뒤집어도 FATIGUE_RED에서 33분으로 일치한다
          //    (전수 실측 — 피로 0..100 중 갈리는 값 23개뿐). 그 계약을 잠그는 것은 응급 90분
          //    경로다(needs.test.ts 「곱이 쌓인다 — 응급」이 147 vs 146으로 잡는다) — 두 자리가
          //    **한 함수를 공유하게 된 지금** 그 계측 하나가 이 경로까지 함께 덮는다.
          const doc = w.pawns.find(d => d.id === p.doctorId)
          const workMin = workDurationMin(EXAM_DURATION_MIN, doc)
          keep({ ...p, stage: 'IN_EXAM', examUntilMin: w.minute + workMin, workMin })
        } else if (stranded) {
          leftCount++
          const freed: Pawn = { ...p }
          delete freed.doctorId // 의사부터 풀어준다 — 안 풀면 진료실이 통째로 잠긴다
          keep(toExit(w, freed, 'LEFT_WAITING'))
        } else keep(p)
        break
      // IN_EXAM은 자리에 앉아 있어 이동하지 않는다 — 좌초할 수 없다.
      case 'IN_EXAM':
        if (w.minute >= (p.examUntilMin ?? Infinity)) {
          // 수익은 **환자가 보러 온 과의 수가**다 — 같은 20분이어도 미용 30만원, 내과 12만원.
          // 이 한 줄이 "옳은 의료를 할수록 장부가 나빠진다"의 수입 쪽 절반이다(지출 쪽은 주 고정비).
          // ⚠️ **여기서 계상하지 않는다** — 진료가 끝난 것과 돈을 받은 것은 이제 다른 사건이다
          //    (아래 수납 갈림). `examsDone`과 부하만 여기서 확정된다: 그 둘은 창구와 무관하게
          //    이미 일어난 노동이라, 수납이 없다고 진료 건수가 줄거나 의사가 안 지치면 거짓이 된다.
          const dept = wantsDeptOf(p)
          examsDone++
          // 부하는 **끝날 때** 쌓인다 — 그리고 그 단위는 분이 아니라 **표준강도분**(소요 × 과 강도)이다.
          // 강도를 빼면 "많이 보는 과가 갈린다"가 되어 미용이 포화하고 필수과가 무풍이 된다
          // (src/game/doctor.ts FATIGUE_INTENSITY 주석의 실측). 감속으로 길어진 소요는 그대로
          // 부하가 되므로 피로가 피로를 부른다 — 그게 "갈려나간다"의 형태다.
          // `workMin` 폴백은 손세계 폰(진료 시작을 거치지 않고 IN_EXAM으로 세운 세계)의 몫이다.
          if (p.doctorId) {
            const load = examLoadMin(p, dept)
            loadByDoctor.set(p.doctorId, (loadByDoctor.get(p.doctorId) ?? 0) + load)
          }
          // doctorId를 지우는 것이 곧 의사의 유휴 복귀다(busy 판정의 단일 출처).
          // 갓 만든 복사본만 건드리므로 입력 세계는 그대로다(tick의 순수성 계약).
          const done: Pawn = { ...p }
          delete done.doctorId
          delete done.examUntilMin
          delete done.workMin // 끝난 작업의 소요는 남기지 않는다 — 다음 작업이 물려받으면 안 된다
          /* 수납 갈림 — 이 게임에서 **진료와 수금이 갈리는 유일한 자리**다(설계 §3).
             창구가 있으면 카운터 앞까지 걸어가 **거기 닿는 분에** 낸다(아래 'PAYING').
             없으면 그 수가는 통째로 샌다 — 이탈이 아니라 **미수**다: 이 사람은 진료를 받고 갔고,
             장부에만 안 들어왔다. 두 숫자를 한 축으로 접으면 결산이 "의자를 더 놓으라"고 말하는데
             실제로는 창구를 지어야 하는 상황이 생긴다(leftNoDept가 갈라진 것과 같은 이유).
             ⚠️ 카운터가 있어도 **길이 끊겼으면** 미수다 — 못 가는 곳에서 돈을 걷을 수는 없다. */
          const spot = cashierAt()
          const path = spot ? findPath(w, { x: p.x, y: p.y }, spot) : null
          if (spot && path) keep({ ...done, stage: 'PAYING', dest: spot, path })
          else {
            unpaidManwon += simDept(dept).examRevenueManwon
            keep(toExit(w, done, 'LEAVING'))
          }
        } else keep(p)
        break
      // 카운터 앞으로 걸어가는 구간 — **도착한 분에 낸다**. 진료실 의자와 달리 여기선 이동이
      // 있으므로 좌초가 실재한다(누가 접수처 문 앞을 막았다).
      case 'PAYING':
        if (arrived) {
          const dept = wantsDeptOf(p)
          treasuryManwon += simDept(dept).examRevenueManwon
          byDept = addExamToDeptStats(byDept, dept)
          keep(toExit(w, p, 'LEAVING'))
        } else if (stranded) {
          // 진료비는 못 받지만 **사람은 내보낸다** — 이탈로 세지 않는 것이 계약이다(진료는 받았다).
          unpaidManwon += simDept(wantsDeptOf(p)).examRevenueManwon
          keep(toExit(w, p, 'LEAVING'))
        } else keep(p)
        break
      case 'LEAVING':
      case 'LEFT_WAITING':
        // 입구에 닿았거나(정상 퇴장) 길이 끊겼으면(갇힘) 세계에서 제거한다.
        if (!arrived && p.path.length > 0) keep(p)
        break
      default:
        keep(p)
    }
  }
  // 응급 집계(수용·회차)는 이 단계가 만들지 않으므로 입력 값을 그대로 통과시킨다 —
  // 필드를 손으로 나열하면 새 집계가 늘 때마다 여기서 조용히 0으로 리셋된다.
  return {
    ...w, treasuryManwon, pawns: applyWorkLoads(out, loadByDoctor),
    stats: { ...w.stats, examsDone, leftCount, byDept, unpaidManwon },
  }
}
