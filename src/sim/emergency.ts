// 응급 — 도착·배후과 판정·병동 처치. **이 게임 메시지의 심장이 여기 있다.**
//
// 규칙 하나: 그 과 의사가 없거나 빈 침대가 없으면 응급은 **되돌아간다**. 어떤 배치로도,
// 금고가 아무리 두둑해도 뚫리지 않는다(기존 게임 `adjudicate`의 하드락 원칙 계승 —
// "받을 수 없는 환자는 받을 수 없다"가 게임의 항의 방식이다). 판정은 **도착 즉시** 끝나고,
// 거부면 폰을 만들지도 않는다(1주차 문전박대 선례 — 만들었다 내보내면 화면엔 같아 보여도
// nextId·경로 계산이 헛돌고, "몇 명이 문 앞에서 돌아섰나"가 관측되지 않는다).
//
// 값(수가·소요)의 **단일 출처는 이 파일**이다. 과 카탈로그(dept.ts)에 응급 열을 두지 않은
// 이유: 응급은 도착률·판정·처치 시간까지 한 덩어리라, 카탈로그가 절반만 들고 있으면 수가가
// 두 곳에 적힌다(이 저장소가 세 번 경고한 이중 기재).
import { seededUnit } from '../game/daysim'
import { buildBlockedSet, findPath, type Pt } from './path'
import { ENTRANCE, type SimWorld } from './world'
import type { Pawn } from './pawn'
import { addRevenueToDeptStats, type SimDeptKey, type SimDeptStats } from './dept'
import { ARRIVAL_WINDOW_MIN, furnitureSpots, minuteStreamSeed, toExit } from './patientFlow'
import { interruptActivity } from './needs'
import { applyWorkLoads, fatigueOf, slowedDurationMin } from './fatigue'

/** 응급 도착 스트림 전용 salt — `daysim.callSeed` 주석의 **레지스트리에 등재된 값**이다.
 *  (사용 중: 1·2·3·7·11·12·13·15·17·19·23·29·31, 이 파일에서 37·41.) */
const EMERGENCY_ARRIVAL_SALT = 37

/** 응급 **종류** 스트림 전용 salt — 도착 판정(37)과 반드시 다른 축이다.
 *  같은 salt면 두 시드가 통째로 같아지고, 응급이 성립한 분은 정의상
 *  `seededUnit < EMERGENCY_PROB_PER_MIN`(1/120)이라 **오는 응급이 전원 STEMI**가 된다 —
 *  50/50이 100/0으로 붕괴하는데 에러는 하나도 안 난다. 외과 응급은 영원히 오지 않고,
 *  그러면 "외과를 안 뽑으면 급성복증을 놓친다"는 이 슬라이스의 절반이 통째로 죽는다. */
const EMERGENCY_KIND_SALT = 41

/** 평균 120분당 1건(각색·튜닝값) — 하루 도착 창 480분이면 기대 4건이다. */
export const EMERGENCY_PROB_PER_MIN = 1 / 120

/** 응급도 **외래와 같은 주간 창**에만 온다(0..480). 야간 응급은 이번 슬라이스 밖이라
 *  창을 하나로 묶는다 — 480을 두 곳에 적으면 한쪽만 바뀌어 조용히 갈린다. */
export const EMERGENCY_WINDOW_MIN = ARRIVAL_WINDOW_MIN

export type EmergencyKind = 'STEMI' | 'ACUTE_ABDOMEN'
/** 되돌아간 이유 — 그대로 플레이어에게 보여줄 말이 된다(계획 Task 6의 토스트). */
export type TurnAwayReason = 'NO_SPECIALIST' | 'NO_BED'
export interface EmergencyTurnAway { kind: EmergencyKind; reason: TurnAwayReason }

export interface EmergencySpec {
  kind: EmergencyKind
  label: string
  /** 이 응급을 받을 수 있는 **배후과**. 이 과 의사가 0명이면 하드락이다. */
  dept: SimDeptKey
  /** 처치 한 건의 수익(만원). 외래 수가와 **다른 축**이다 — 응급은 한 건이 그 과 외래 수십
   *  건을 넘지만, 받으려면 24시간 대기(주 고정비)와 침대를 먼저 사야 한다. */
  revenueManwon: number
  /** 처치 소요(분). 그동안 그 과 의사 한 명이 통째로 묶인다. */
  durationMin: number
}

/**
 * 응급 카탈로그(계획 표의 값 그대로 · 각색·튜닝값 — 임상·회계 주장 아님).
 *
 * ⚠️ 옛 층(`src/game/receiving.ts` CALL_ECONOMICS)의 STEMI 수가와 **일부러 다르다**. 저쪽은
 * "하루 60여 통의 콜"을 세는 스케일이고 여기는 "하루 몇 건의 외래를 소화하는가"라, 같은 숫자를
 * 옮기면 부호가 뒤집힌다(dept.ts 머리말과 같은 이유). 계승한 것은 **대소**다: 응급 한 건이
 * 그 과 외래 수십 건을 넘고, 심장중재(STEMI)가 개복(급성복증)보다 무겁다.
 */
export const EMERGENCIES: Record<EmergencyKind, EmergencySpec> = {
  STEMI: {
    kind: 'STEMI',
    label: '급성 심근경색',
    dept: 'CARDIOLOGY',
    // 350 ← 외래 수가(25)의 14배. "응급 한 건이 그 과 외래 십수 건 값"이라는 대소는 지키되,
    // **주급을 메우지는 못하는** 자리에 둔다: 순환기 주급 8,000을 채우려면 주 23건이 필요한데
    // 도착률(120분당 1건 × 50%)로는 실측 상한이 17건이다. 이 간격이 부호 불변식 I-B1 ⓑ
    // ("응급을 받아도 적자")의 수학이고, 그래서 이 값은 취향이 아니라 **불변식의 일부**다.
    // ⚠️ 최초 값은 850이었다 — 그때 순환기 병원은 응급만으로 주 +10,000 흑자였다(부호 역전).
    revenueManwon: 350,
    durationMin: 90,
  },
  ACUTE_ABDOMEN: {
    kind: 'ACUTE_ABDOMEN',
    label: '급성복증',
    dept: 'GENERAL_SURGERY',
    // 150 ← STEMI(350)의 절반 아래. 옛 층에서도 개복이 심장중재보다 수가가 낮았다(대소 계승).
    // 외과 주급(4,500)에 견주면 STEMI와 같은 관계다 — 주 30건을 받아야 메우는데 상한은 22건이다.
    revenueManwon: 150,
    durationMin: 90,
  },
}

/**
 * 응급 처치의 **피로 강도**(부하 = 소요 분 × 이 값). 두 종류가 같은 값이라 종류별 필드가 아니라
 * 모듈 상수다 — 갈리는 날 `EmergencySpec`으로 내리면 된다.
 *
 * 2.0 = `src/game/doctor.ts` FATIGUE_INTENSITY의 STEMI·ABDOMINAL_EMERGENCY **그대로**(각색 없음).
 * 저쪽 주석대로 "응급 수술·시술급 — 생사·집중"이라는 판단은 스케일과 무관하다. 외래 기준선(1.0)의
 * 두 배이고 필수과 외래(dept.ts 1.2)보다도 무겁다 — 90분짜리 처치 한 건이 하루 문턱
 * (`FATIGUE_FREE_MIN`)을 혼자 넘긴다는 뜻이고, **응급을 받는 과가 갈려나간다**는 이 게임의
 * 논지가 피로 축에서 완성되는 자리다. 값의 자리가 카탈로그(dept.ts)가 아니라 여기인 이유는
 * 이 파일 머리말과 같다: 응급은 도착·판정·수가·소요·강도까지 한 덩어리다.
 */
export const EMERGENCY_INTENSITY = 2.0

/** 끝난 응급 처치 한 건의 **표준강도분**(소요 × 응급 강도) — `patientFlow.examLoadMin`의 응급판이고
 *  같은 이유로 여기 하나다: 처치의 완료도 두 곳에서 관측된다(정상 종료는 `progressEmergencies`,
 *  마감에 걸린 건은 `day.settleDay`). 강도가 **과 강도가 아니라 응급 강도**인 것이 핵심이라,
 *  식이 흩어지면 한쪽만 과 강도(1.2)로 접혀도 아무 에러가 안 난다. */
export function emergencyLoadMin(p: Pawn, spec: EmergencySpec): number {
  return (p.workMin ?? spec.durationMin) * EMERGENCY_INTENSITY
}

/** 응급 종류 분포 — 계획 표의 STEMI/급성복증 50/50. 값은 각 구간의 **누적 상한**이고
 *  배열 순서가 곧 구간 순서라 결정론의 일부다(patientFlow.ARRIVAL_DEPT_MIX와 같은 형태). */
export const EMERGENCY_KIND_MIX: ReadonlyArray<readonly [EmergencyKind, number]> = [
  ['STEMI', 0.5],
  ['ACUTE_ABDOMEN', 1.0],
]

/** [0,1) 난수 → 응급 종류. 구간은 아래가 닫히고 위가 열린다(`u < upper`).
 *  치역 밖 값이면 마지막으로 접지 않고 던진다 — 접으면 상한 표가 틀려도 급성복증이 조용히 늘 뿐이다. */
export function pickEmergencyKind(u: number): EmergencyKind {
  if (u >= 0) for (const [kind, upper] of EMERGENCY_KIND_MIX) if (u < upper) return kind
  throw new Error(`pickEmergencyKind: [0,1) 밖의 값(${u}) — seededUnit의 치역을 벗어났다`)
}

/** 응급 조회 — 없는 종류에 undefined를 돌려주면 수익이 NaN으로 금고에 번지고, NaN은 어떤
 *  예외도 안 낸 채 이후 산술을 전부 오염시킨다(simDept가 던지는 것과 같은 이유). */
export function emergencySpec(kind: EmergencyKind): EmergencySpec {
  const spec = EMERGENCIES[kind]
  if (!spec) throw new Error(`emergencySpec: 카탈로그에 없는 응급(${kind}) — 오타이거나 절단된 종류다`)
  return spec
}

/** 이 폰이 든 응급 종류 — 없으면 던진다(`wantsDeptOf`와 같은 계약).
 *  응급 스테이지에 있는데 종류가 비었다면 손으로 세운 세계이거나 생성 경로가 빠진 것이다. */
export function emergencyKindOf(p: Pawn): EmergencyKind {
  if (!p.emergency) throw new Error(`폰(${p.id})에 응급 종류가 없다 — 응급으로 생성되지 않았다`)
  return p.emergency
}

/** 응급 도착 시드(salt 37) — 외래 도착·희망 과와 **다른 축**이다. */
export function emergencyArrivalSeed(w: SimWorld): number {
  return minuteStreamSeed(w, EMERGENCY_ARRIVAL_SALT)
}

/** 응급 종류 시드(salt 41) — 도착 판정과 다른 축이다(EMERGENCY_KIND_SALT 주석). */
export function emergencyKindSeed(w: SimWorld): number {
  return minuteStreamSeed(w, EMERGENCY_KIND_SALT)
}

/** 이 분에 응급이 오는가 — 온다면 그 종류. 도착 판정의 **단일 출처**다(테스트의 전제도 이걸
 *  부른다 — 판정식을 손으로 다시 쓰면 한쪽이 조용히 낡는다). 세계 상태를 안 보고 시각만 보므로
 *  "누가 왔는가"와 "받을 수 있는가"가 섞이지 않는다: 받을 수 없어도 **응급은 온다**. */
export function emergencyArrivalAt(w: SimWorld): EmergencyKind | null {
  if (w.minute >= EMERGENCY_WINDOW_MIN) return null
  if (seededUnit(emergencyArrivalSeed(w)) >= EMERGENCY_PROB_PER_MIN) return null
  return pickEmergencyKind(seededUnit(emergencyKindSeed(w)))
}

/** 병동 침대 자리 = 침대 앞에 설 수 있는 타일들. 대기실 좌석과 같은 기계다(furnitureSpots). */
export function wardBeds(w: SimWorld, blocked: Set<number> = buildBlockedSet(w)): Pt[] {
  return furnitureSpots(w, 'WARD', 'BED', blocked)
}

const ptKey = (p: Pt) => `${p.x},${p.y}`

/** 비어 있고 **입구에서 닿을 수 있는** 첫 침대와 거기까지의 경로.
 *  점유는 응급 환자의 dest로 표현된다(대기실 좌석과 같은 방식) — 별도 점유 테이블을 두면
 *  폰이 사라질 때(퇴장·마감) 되돌리는 걸 잊어 침대가 영구히 잠긴다.
 *  닿을 수 없는 침대를 여기서 끝내지 않고 다음 후보를 보는 이유도 좌석과 같다: 봉인된 병동
 *  하나가 멀쩡한 다른 병동을 통째로 가리면 수용이 영원히 0이 된다(철거가 없어 비가역). */
export function freeBed(w: SimWorld, blocked: Set<number>): { spot: Pt; path: Pt[] } | null {
  const taken = new Set(
    w.pawns.filter(p => p.emergency && p.dest && OCCUPIES_BED.includes(p.stage!)).map(p => ptKey(p.dest!)),
  )
  for (const spot of wardBeds(w, blocked)) {
    if (taken.has(ptKey(spot))) continue
    const path = findPath(w, ENTRANCE, spot)
    if (path) return { spot, path }
  }
  return null
}

/** 침대를 물고 있는 스테이지 — **명시 목록(inclusion)**이다(day.COUNTS_AS_TURNED_AWAY와 같은 이유).
 *  denylist로 쓰면 새 스테이지가 생기는 순간 침대가 자동으로 비어 두 환자가 한 침대에 겹친다. */
const OCCUPIES_BED: readonly NonNullable<Pawn['stage']>[] = ['TO_BED', 'IN_BED', 'IN_TREATMENT']

/** 응급 한 분 — 도착 판정 → 스테이지 전이 → 의사 배정.
 *  **배정이 전이 뒤인 것이 계약이다**: 침대에 막 닿은 환자(전이)와 방금 처치를 끝내 풀려난
 *  의사(전이)가 **같은 분 안에서** 만난다. 순서를 뒤집으면 둘 다 한 분씩 놀고, 그 한 분은
 *  응급이 몰릴수록 누적된다. */
export function stepEmergencies(world: SimWorld): SimWorld {
  const arrived = maybeEmergency(world)
  return assignEmergencyDoctors(progressEmergencies(arrived))
}

function turnAway(w: SimWorld, kind: EmergencyKind, reason: TurnAwayReason): SimWorld {
  return {
    ...w,
    stats: { ...w.stats, emergencyTurnedAway: [...w.stats.emergencyTurnedAway, { kind, reason }] },
  }
}

function maybeEmergency(w: SimWorld): SimWorld {
  const kind = emergencyArrivalAt(w)
  if (!kind) return w
  const spec = emergencySpec(kind)
  // ① 배후과 — **의사가 지금 한가한지는 묻지 않는다**. 외래 중이면 그걸 마치고 온다(응급이
  //    다음 작업의 최우선). 한가함을 조건으로 걸면 바쁜 병원일수록 응급을 못 받는 꼴이 되어,
  //    "그 과가 없으면 못 받는다"가 "그 과가 바쁘면 못 받는다"로 바뀐다 — 다른 게임이 된다.
  if (!w.pawns.some(p => p.kind === 'DOCTOR' && p.dept === spec.dept)) {
    return turnAway(w, kind, 'NO_SPECIALIST')
  }
  // ② 빈 침대. 의사를 **먼저** 보는 것이 사유의 순서 계약이다 — 둘 다 없을 때 플레이어가
  //    들어야 할 말은 "침대를 더 지으세요"가 아니라 "그 과가 없습니다"다(메시지의 심장).
  const bed = freeBed(w, buildBlockedSet(w))
  if (!bed) return turnAway(w, kind, 'NO_BED')
  const patient: Pawn = {
    id: `emg-${w.nextId}`, kind: 'PATIENT',
    x: ENTRANCE.x, y: ENTRANCE.y, path: bed.path, dest: bed.spot, stage: 'TO_BED',
    emergency: kind,
    // 응급 환자도 **과를 싣는다**(배후과로). 외래 라우팅은 stage로 갈려 이 환자를 집지 않지만,
    // 과가 비면 그 사실이 조용한 undefined로 남아 나중에 읽는 쪽에서 NaN·예외로 터진다.
    wantsDept: spec.dept,
  }
  return {
    ...w,
    nextId: w.nextId + 1,
    pawns: [...w.pawns, patient],
    stats: { ...w.stats, emergencyAccepted: w.stats.emergencyAccepted + 1 },
  }
}

const samePt = (a: { x: number; y: number }, b: Pt) => a.x === b.x && a.y === b.y

function progressEmergencies(w: SimWorld): SimWorld {
  if (!w.pawns.some(p => p.emergency)) return w
  let treasuryManwon = w.treasuryManwon
  let leftCount = w.stats.leftCount
  let byDept: SimDeptStats = w.stats.byDept
  /** 이번 분에 끝난 처치의 표준강도분 — 외래와 같은 기계(fatigue.applyWorkLoads)로 얹는다. */
  const loadByDoctor = new Map<string, number>()
  const out: Pawn[] = []
  const keep = (p: Pawn | null) => { if (p) out.push(p) }

  for (const p of w.pawns) {
    if (!p.emergency) { out.push(p); continue }
    // 도착 판정은 **위치 == dest**다 — `path.length === 0`은 길이 끊겨 비워진 폰과 구별되지 않는다.
    const arrived = !!p.dest && samePt(p, p.dest)
    switch (p.stage) {
      case 'TO_BED':
        if (arrived) keep({ ...p, stage: 'IN_BED' })
        // 좌초 — 침대로 가는 길이 끊겼다(누가 병동 문 앞을 막았다). 안 풀면 그 폰이 침대를
        // 문 채 영구 정지해 병동이 통째로 잠긴다(외래 TO_EXAM 좌초와 같은 병).
        else if (p.path.length === 0) { leftCount++; keep(toExit(w, p, 'LEFT_WAITING')) }
        else keep(p)
        break
      // 침대에 누워 자기 과 의사를 기다린다. **인내가 없다** — 외래는 못 기다리면 떠나지만
      // 이 환자는 이미 병원이 받은 사람이다(수용 판정이 끝났다). 의사는 외래를 마치는 대로 온다.
      case 'IN_BED':
        keep(p)
        break
      case 'IN_TREATMENT':
        if (w.minute >= (p.treatUntilMin ?? Infinity)) {
          const spec = emergencySpec(emergencyKindOf(p))
          treasuryManwon += spec.revenueManwon
          // 응급 수가도 **그 과의 장부**로 들어간다 — 따로 두면 과별 순익이 응급을 모르는 채
          // 계산돼 "순환기는 응급을 받아도 적자"라는 이 게임의 논지를 잴 수 없다.
          byDept = addRevenueToDeptStats(byDept, spec.dept, spec.revenueManwon)
          // 처치도 **끝날 때** 부하가 쌓인다(외래와 같은 시점 계약). 강도는 과 강도가 아니라
          // 응급 강도다 — 같은 순환기 의사라도 90분 PCI와 20분 외래는 같은 무게가 아니다.
          if (p.doctorId) {
            const load = emergencyLoadMin(p, spec)
            loadByDoctor.set(p.doctorId, (loadByDoctor.get(p.doctorId) ?? 0) + load)
          }
          const done: Pawn = { ...p }
          delete done.doctorId      // 의사 해방 = 유휴 복귀의 단일 표현
          delete done.treatUntilMin
          delete done.workMin
          keep(toExit(w, done, 'LEAVING')) // 퇴장과 동시에 dest가 입구로 바뀌어 침대가 풀린다
        } else keep(p)
        break
      default:
        keep(p) // LEAVING·LEFT_WAITING의 퇴장·제거는 patientFlow.progressStages 소관이다
    }
  }
  return {
    ...w, treasuryManwon, pawns: applyWorkLoads(out, loadByDoctor),
    stats: { ...w.stats, leftCount, byDept },
  }
}

/** 침대에서 기다리는 응급에게 그 과의 유휴 의사를 붙인다(폰 배열 순서 = 결정론).
 *  "바쁨"의 판정은 외래와 **같은 출처**(누군가 그 의사의 doctorId를 물고 있는가)라, 응급이
 *  의사를 잡으면 외래 배정(assignWaitingToExam)이 자동으로 그 의사를 건너뛴다.
 *
 *  ⚠️ **응급 우선순위가 성립하는 자리**: tick은 이 단계를 환자 흐름 **뒤**에 부른다. 외래
 *  진료가 끝나 의사가 풀리는 것은 그 분의 `progressStages`인데, 대기 외래를 짝짓는
 *  `assignWaitingToExam`은 이미 그 앞에서 지나갔다 — 그래서 방금 풀린 의사를 그 분에 집을 수
 *  있는 건 여기뿐이고, 줄 서 있던 외래는 다음 분에야 후보가 된다. */
function assignEmergencyDoctors(w: SimWorld): SimWorld {
  const waiting = w.pawns
    .map((p, i) => ({ p, i }))
    // `!p.doctorId`는 **방어적 중복이고, 사살 불가임을 알고 남긴다**: 의사가 붙는 순간
    // 스테이지가 IN_TREATMENT로 넘어가므로 "IN_BED인데 의사를 문" 폰은 현재 도달 불가다
    // (리뷰 실측 — 이 조건을 지워도 어떤 테스트도 안 죽는다). 그럼에도 지우지 않는 이유는
    // 이게 최적화가 아니라 **이중 배정 금지**라서다: 두 조건이 갈리는 스테이지가 하나라도
    // 생기면 한 의사가 두 환자를 동시에 처치한다. patientFlow의 "사살 불가 분기는 두지
    // 않는다"는 잣대는 **한 틱 아끼는 최적화**를 겨눈 것이라 여기엔 적용되지 않는다.
    .filter(({ p }) => p.emergency && p.stage === 'IN_BED' && !p.doctorId)
  if (waiting.length === 0) return w
  const busy = new Set(w.pawns.map(p => p.doctorId).filter((id): id is string => !!id))
  const updates = new Map<number, Pawn>()
  /** 응급에 끌려간 의사 — 휴식·식사(`activity`)를 **그 자리에서** 끊는다(needs.interruptActivity).
   *  후보 판정은 activity를 보지 **않는다**: 쉬는 중이라고 응급을 못 받으면 "그 과가 없으면
   *  못 받는다"가 "그 과가 쉬고 있으면 못 받는다"로 바뀌어 하드락의 뜻이 흐려진다.
   *  대신 붙는 순간 휴식이 무효가 된다 — **회복 없이** 끊긴다. 이 해제를 빼면 의사는 처치
   *  중에도 'RESTING'인 채라, 예정된 종료 시각에 쉬지도 않은 회복을 받고 책상으로 걸어간다. */
  const interrupted = new Map<string, Pawn>()
  for (const { p, i } of waiting) {
    const spec = emergencySpec(emergencyKindOf(p))
    const doc = w.pawns.find(d => d.kind === 'DOCTOR' && d.dept === spec.dept && !busy.has(d.id))
    if (!doc) continue // 그 과 의사가 전부 묶여 있다 — 이 환자는 침대에서 계속 기다린다
    busy.add(doc.id)
    if (doc.activity) interrupted.set(doc.id, interruptActivity(doc))
    // 외래와 같은 계약: 소요는 **시작하는 순간** 그 의사의 피로로 확정된다. 지친 의사의 PCI는
    // 90분이 아니라 그보다 길고, 그동안 그 과의 외래·다음 응급이 함께 밀린다.
    const workMin = slowedDurationMin(spec.durationMin, fatigueOf(doc))
    updates.set(i, {
      ...p, stage: 'IN_TREATMENT', doctorId: doc.id, treatUntilMin: w.minute + workMin, workMin,
    })
  }
  if (updates.size === 0) return w
  // 폰 id는 world.nextId에서 나와 전역 유일하다(`doc-*`·`pat-*`·`emg-*`) — 환자 갱신(index)과
  // 의사 갱신(id)이 한 map에서 섞여도 서로를 덮지 않는다.
  return { ...w, pawns: w.pawns.map((p, i) => updates.get(i) ?? interrupted.get(p.id) ?? p) }
}
