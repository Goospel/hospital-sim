// 화면이 쓰는 **순수 파생**들 — 라벨·사유 문구·피로 단계·인원 집계. React를 모른다.
//
// 왜 컴포넌트 밖인가: 이 저장소의 테스트는 DOM 없이 돈다(jsdom·testing-library 미설치).
// 판정이 JSX 안에 있으면 **아무 테스트도 그 판정을 겨눌 수 없다** — 피로 경계가 34에서 44로
// 밀려도, 회차 사유가 전부 같은 문구로 접혀도 green이다. 그래서 "무엇을 보여줄지"를 정하는
// 조각만 여기로 내리고, 컴포넌트는 그 결과를 놓기만 한다(useSimClock의 minutesToTick과 같은 분리).
//
// ⚠️ 상대 경로 임포트 — 이 파일은 vitest(별칭 미설정)로도 돌기 때문에 `@/`를 쓸 수 없다.
import { FATIGUE_RED, FATIGUE_SLOW_FROM, RESIGN_SATURATED_DAYS } from '../game/doctor'
import { formatManwon as absManwon } from '../game/labels'
import { BUILD_COST, type BuildReason, type PlaceResult } from '../sim/build'
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from '../sim/dept'
import { emergencySpec, wardBeds, type EmergencyTurnAway, type TurnAwayReason } from '../sim/emergency'
import { resignationLetter, type ResignationLetter } from '../sim/narrative'
import { prefersRestOverExam, starvedSlowFactor } from '../sim/needs'
import { buildBlockedSet } from '../sim/path'
import { hasCashier, unservedDepts } from '../sim/patientFlow'
import { NURSE_WEEKLY_COST_MANWON } from '../sim/week'
import { computeRegions, type Region } from '../sim/regions'
import { examSlots } from '../sim/spots'
import { TRAITS, type TraitKey } from '../sim/traits'
import { priorityOf, type Pawn, type Priority } from '../sim/pawn'
import type { Pt } from '../sim/path'
import { GRID_W, GRID_H, tileIndex, type FurnitureKind, type RoomType, type SimWorld } from '../sim/world'
// 타입 전용 — 컴파일에 지워지므로 이 파일은 여전히 React를 모른다(vitest가 그대로 돈다).
import type { SimSpeed } from './useSimClock'

/**
 * 금액 한 곳 — **|금액| ≥ 1억이면 「N.N억」, 미만이면 「N만원」**(계획 §0-8).
 *
 * 접는 **경계와 자릿수는 `game/labels.formatManwon`이 소유**하고 이 함수는 손대지 않는다.
 * 여기서 다시 나누면 옛 게임과 이 층의 단위가 갈리고, 갈려도 화면엔 한쪽만 보인다(이 저장소가
 * 세 번 경고한 이중 기재). 이 함수가 더하는 것은 **음수 부호**뿐이다: 저쪽은 절대값을 찍으므로
 * (`Math.abs`) 금고가 −1.2억인 판이 화면에서 +1.2억으로 보인다 — 그 판이 이 게임의 절반이다.
 *
 * `formatSignedManwon`(game/labels)과의 분담: **부호가 정보인 자리**(순이익·증감)는 여전히
 * 그쪽이다(0에도 +를 붙여 "적자 아님"을 말한다). 이 함수는 **잔액·비용처럼 부호가 우연인 자리**용이라
 * 양수에 +를 붙이지 않는다 — HUD 금고에 "+5.0억"이 뜨면 그게 증감으로 읽힌다.
 *
 * ⚠️ 억은 소수 한 자리 **반올림**이다(152,340만원 = 15.234억 → 「15.2억」). 표시용이라 억 단위
 * 금액은 합계와 최대 500만원까지 어긋나 보일 수 있다 — 정산은 언제나 원본 숫자로 한다.
 */
export function formatManwon(manwon: number): string {
  return `${manwon < 0 ? '−' : ''}${absManwon(manwon)}`
}

export const ROOM_LABEL: Record<RoomType, string> = {
  EXAM: '진료실',
  WARD: '병동',
  WAITING: '대기실',
  LOUNGE: '휴게실',
  RECEPTION: '접수처',
  CAFETERIA: '식당',
}

/** 방 이름 — **진료실만 과가 붙는다**(다른 방엔 과 개념이 없다 — placeRoom이 dept를 떨군다).
 *  과 이름은 카탈로그(simDept)에서 온다: 화면에 과 이름을 따로 적으면 카탈로그와 두 벌이 된다. */
export function roomLabel(room: { type: RoomType; dept?: SimDeptKey }): string {
  const base = ROOM_LABEL[room.type]
  return room.type === 'EXAM' && room.dept ? `${base} · ${simDept(room.dept).label}` : base
}

/**
 * 되돌아간 응급 한 건의 **토스트 문구** — 사실만 쓴다.
 *
 * 톤 가드레일(스펙 §톤·character-design.md 계승): 플레이어를 탓하지 않는다. "놓쳤습니다"·
 * "받았어야 합니다" 같은 말이 붙는 순간 이 게임의 논지("시스템이 문제")가 "네가 못했다"로
 * 미끄러진다. 그래서 문구는 *무엇이 왔고 왜 못 받았는가*까지만 말하고 판단은 플레이어 몫이다.
 *
 * 사유에 따라 **할 일이 다르다**는 것이 이 문구가 존재하는 이유다: NO_SPECIALIST면 그 과를
 * 채용해야 하므로 과 이름이 반드시 들어가고, NO_BED면 병동을 지어야 하므로 과 이름은 오히려
 * 방해가 된다(엉뚱한 과를 뽑게 된다).
 */
export function turnAwayText(t: EmergencyTurnAway): string {
  const spec = emergencySpec(t.kind)
  const cause =
    t.reason === 'NO_SPECIALIST' ? `${simDept(spec.dept).label} 의사가 없습니다` : '병상이 없습니다'
  return `${spec.label} — ${cause}`
}

/**
 * **한 번에 여러 건**이 되돌아갔을 때의 토스트 문구.
 *
 * 회차는 한 건씩 오지 않는다: 3배속 한 프레임은 최대 15게임분이라 그 사이에 둘 이상이 붙을 수
 * 있고, 화면은 프레임 단위로만 관측한다. 마지막 한 건만 띄우면 나머지는 **흔적 없이** 사라진다 —
 * 회차는 폰이 만들어지지 않는 사건이라 토스트 말고 다른 단서가 없다(HUD 숫자는 늘지만 *왜*는
 * 안 보인다). 그래서 건수를 먼저 말하고 마지막 건의 사유를 붙인다.
 *
 * 한 건일 때 요약을 안 씌우는 건 흔한 경우의 문장을 짧게 두기 위함이고, 빈 배치에 빈 문자열을
 * 돌려주는 건 "띄우지 않는다"의 신호다(호출부가 길이를 다시 세지 않게).
 */
export function turnAwayBatchText(pending: readonly EmergencyTurnAway[]): string {
  if (pending.length === 0) return ''
  const last = turnAwayText(pending[pending.length - 1])
  return pending.length === 1 ? last : `응급 ${pending.length}건이 되돌아갔습니다 — 마지막: ${last}`
}

/**
 * 하루 결산에 괄호로 붙는 **미수** 한 조각 — 샌 돈이 없으면 빈 문자열.
 *
 * 0에 줄을 안 세우는 것이 요지다(`turnAwayBreakdownText`와 같은 규칙): 「못 받은 진료비 0」이
 * 떠 있으면 아무 일도 없던 날이 사고가 있던 날처럼 읽힌다. 빈 문자열이 "띄우지 않는다"의
 * 신호라, 호출부가 금액을 다시 비교하지 않아도 된다.
 *
 * 톤: **상태 서술만** 한다 — 「받지 못했습니다」이지 「놓쳤습니다」가 아니다(§톤 가드레일).
 */
export function unpaidText(manwon: number): string {
  return manwon > 0 ? `못 받은 진료비 ${formatManwon(manwon)}` : ''
}

/** 사유별 회차 집계 — 0도 자리를 지킨다(문구 쪽에서 0줄을 빼는 판단을 한다). */
export function turnAwayBreakdown(list: readonly EmergencyTurnAway[]): Record<TurnAwayReason, number> {
  const out: Record<TurnAwayReason, number> = { NO_SPECIALIST: 0, NO_BED: 0 }
  for (const t of list) out[t.reason] += 1
  return out
}

/** 결산 줄에 괄호로 붙는 사유 요약 — **있는 사유만** 쓴다. 회차 0건인 날에도 "의사 없음 0"이
 *  뜨면 아무 일도 없던 날이 사고가 있던 날처럼 읽힌다(수치 표시의 해석 오염). 빈 내역은 빈 문자열. */
export function turnAwayBreakdownText(list: readonly EmergencyTurnAway[]): string {
  const counts = turnAwayBreakdown(list)
  const parts: string[] = []
  if (counts.NO_SPECIALIST > 0) parts.push(`의사 없음 ${counts.NO_SPECIALIST}`)
  if (counts.NO_BED > 0) parts.push(`병상 없음 ${counts.NO_BED}`)
  return parts.join(' · ')
}

/** 피로 막대의 3단 — 평상 / 감속 / 레드존. */
export type FatigueTone = 'CALM' | 'SLOW' | 'RED'

/**
 * 피로 → 막대 단계. 경계는 기존 게임의 상수 그대로다(`src/game/doctor.ts`) — **색 단계가 곧
 * 감속 구간**이라(SLOW = 배율이 붙기 시작하는 값, RED = ×1.25 이상) 여기서 숫자를 다시 정하면
 * 화면의 색과 실제 감속이 조용히 갈린다. 기존 게임 FatigueBar와 같은 판정이다(표현 계승).
 */
export function fatigueTone(fatigue: number): FatigueTone {
  if (fatigue >= FATIGUE_RED) return 'RED'
  if (fatigue >= FATIGUE_SLOW_FROM) return 'SLOW'
  return 'CALM'
}

/** 피로 단계별 색 — 기존 게임 FatigueBar와 같은 3단(회백 → 밝음 → 적).
 *  경계 숫자는 여기 없다: 단계 판정은 `fatigueTone`이 doctor.ts 상수로 하고 이 표는 칠만 한다.
 *  **막대가 두 곳(아바타·인사 패널)에 서기 때문에** 색표도 한 곳이어야 한다 — 각자 적으면
 *  같은 피로가 화면마다 다른 색으로 보이고, 그건 색을 판정으로 읽는 습관을 깨뜨린다. */
export const FATIGUE_COLOR: Record<FatigueTone, string> = {
  CALM: 'var(--on-desk-muted)',
  SLOW: 'var(--on-desk)',
  RED: 'var(--alarm)',
}

/** 과별 **의사** 수 — 채용 패널의 "현재 인원"이자 주급의 근거.
 *  환자를 세지 않는 것이 계약이다: 대기 환자가 인원으로 잡히면 패널의 주급 예상이 통째로 거짓이 된다
 *  (환자는 `wantsDept`를 들고 있어서 필드만 보면 의사와 구별되지 않는다).
 *  전 과를 0으로 채워 돌려준다 — 첫 판(의사 0명)에도 4줄이 서야 "무엇을 뽑을 수 있는가"가 보인다. */
export function doctorCountByDept(pawns: readonly Pawn[]): Record<SimDeptKey, number> {
  const out = Object.fromEntries(HIRABLE_DEPTS.map(k => [k, 0])) as Record<SimDeptKey, number>
  for (const p of pawns) {
    if (p.kind !== 'DOCTOR' || !p.dept) continue
    out[p.dept] += 1
  }
  return out
}

/** 우선순위 눈금의 이름 — **0이 「낮음」이 아니라 「금지」**인 것이 이 표의 요지다(pawn.Priority).
 *  화면 어디에서든 같은 말이 서야 한다: 패널의 칸과 도움말이 각자 이름을 지으면 "0으로 내렸다"와
 *  "껐다"가 다른 조작처럼 읽힌다. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  0: '금지',
  1: '낮음',
  2: '보통',
  3: '높음',
}

/**
 * 우선순위 칸을 한 번 눌렀을 때의 다음 값 — **2 → 3 → 1 → 0 → 2**.
 *
 * 오름차순(0→1→2→3)이 아닌 이유는 **기본값이 2**이기 때문이다: 손잡이를 처음 만지는 사람의
 * 첫 클릭이 곧바로 뜻을 가져야 하는데, 오름차순이면 2에서 3으로 갔다가 다음이 0(금지)이라
 * 한 칸 차이로 극단이 붙는다. 이 순서는 첫 클릭이 "올림", 그다음이 내림 두 칸(1·0)이라
 * **끄기까지 세 번**이면 닿으면서도 실수로 한 번에 꺼지지 않는다.
 *
 * ⚠️ 이 함수가 **`setDoctorPriority`에 들어가는 값의 유일한 생산자**다. 코어는 범위 밖 값에
 * 던지므로(pawn.setDoctorPriority), 여기가 0~3을 지키는 한 그 예외는 화면에서 **도달 불가**다 —
 * 그 사실을 화면 쪽에 방어 코드로 적지 않는 근거이고, simHud.test.ts가 범위를 잠근다.
 */
export function nextPriority(cur: Priority): Priority {
  const CYCLE: Record<Priority, Priority> = { 2: 3, 3: 1, 1: 0, 0: 2 }
  return CYCLE[cur]
}

/** 아바타에 얹는 행동 표시 — **글리프는 갈래**(휴식/식사)를, **라벨은 단계**(가는 중/하는 중)를 나른다. */
export interface ActivityMark {
  glyph: string
  label: string
}

/**
 * 지금 이 의사가 자기를 돌보고 있다면 그 표시 — 없으면 `null`(근무 중).
 *
 * 욕구는 폰이 책상을 비우는 유일한 정상 사유인데, 표시가 없으면 화면에서는 그냥 **의사가
 * 사라진 것**으로 보인다("왜 진료를 안 하지"). 휴게실·식당을 지은 보람이 화면에 없으면
 * 배치 인과(needs.ts 머리말)가 플레이어에게 전달되지 않는다.
 *
 * 걸어가는 중에도 같은 글리프를 다는 것이 계약이다: 자리를 비운 **이유**가 걷는 동안에도
 * 읽혀야 하고, 갈래별로 글리프가 하나면 "휴게실이 멀어서 오래 걷는다"가 눈으로 보인다.
 *
 * ⚠️ 네 상태를 **전부** 적는다(`Record<...>`라 상태가 늘면 tsc가 여기서 막는다). 한 줄이
 * 빠지면 그 상태의 의사만 조용히 표시를 잃고, 그건 에러가 아니라 "가끔 안 보인다"로 나타난다.
 */
const ACTIVITY_MARK: Record<NonNullable<Pawn['activity']>, ActivityMark> = {
  TO_LOUNGE: { glyph: 'zZ', label: '휴게실로 가는 중' },
  RESTING: { glyph: 'zZ', label: '쉬는 중' },
  TO_MEAL: { glyph: '식', label: '식당으로 가는 중' },
  EATING: { glyph: '식', label: '식사 중' },
}

export function doctorActivityMark(p: Pawn): ActivityMark | null {
  return p.activity ? ACTIVITY_MARK[p.activity] : null
}

/**
 * 사직 카운트다운 — 포화로 마감한 날이 하루라도 있으면 `포화 N/4일`, 없으면 `null`.
 *
 * 코어는 이 사람이 언제 떠나는지 이미 알지만(week.resigningSimDoctors) 그 사실은 **주말에 한 번**
 * 통지된다. 임계가 며칠뿐이라(RESIGN_SATURATED_DAYS) 주말에 처음 알면 대응할 시간이 없다 —
 * 이 줄은 코어 튜닝 없이 그 창을 넓히는 **표시**다: 첫날부터 세는 숫자가 보이면 휴게실을 짓거나
 * 우선순위를 바꿀 시간이 생긴다.
 *
 * 분모를 리터럴로 적지 않는 이유는 `fatigueTone`이 경계를 임포트하는 것과 같다 — 임계를 튜닝하면
 * 화면이 저절로 따라와야 하고, 안 그러면 "3/4일인데 떠났다"가 된다.
 *
 * 톤: 사실만 쓴다(§톤 가드레일). "무리하고 있습니다" 같은 말이 붙으면 구조의 결과가 관리의
 * 실수로 미끄러진다 — 판단은 플레이어 몫이다.
 */
export function saturationText(p: Pawn): string | null {
  const days = p.saturatedDays ?? 0
  return days >= 1 ? `포화 ${days}/${RESIGN_SATURATED_DAYS}일` : null
}

/** 결산 화면의 사직 통지 한 줄 — 문장은 `narrative`가, 과 이름은 카탈로그가 준다. */
export interface ResigningNotice extends ResignationLetter {
  /** 폰 id — 같은 과·같은 이름이 둘이어도 줄이 구별된다(index key와 달리 명단이 흔들려도 안전). */
  key: string
}

/**
 * 이번 주말에 떠나는 사람들의 **통지와 편지** — 결산 화면의 사직 줄.
 *
 * ⚠️ `doctorDeptOf`를 쓰지 않는다: 그 함수는 과 없는 폰에 **던지고**, 그 예외가 오버레이 렌더
 * 중에 나면 결산 화면이 통째로 죽어 플레이어는 사직 통지가 아니라 흰 화면을 본다. 한 줄을
 * 잃는 것과 화면을 잃는 것 중에서 고른 결과다(과 없는 폰은 채용을 안 거친 손세계 폰뿐이다).
 *
 * 같은 과가 둘이면 **두 줄**이다 — 떠나는 것은 과가 아니라 사람이라, 접으면 몇 명이 나갔는지가
 * 사라진다. 순서는 명단 그대로(코어의 폰 배열 순서)라 화면이 흔들리지 않는다.
 *
 * 이름이 없는 폰(손세계·옛 세계)에도 줄은 선다 — `undefined`가 문장에 새는 것이 화면에서는
 * 크래시보다 나쁘다(버그로 안 읽히고 그냥 이상한 글자로 남는다).
 */
export function resigningNotices(leaving: readonly Pawn[]): ResigningNotice[] {
  return leaving
    .filter(p => !!p.dept)
    .map(p => ({
      key: p.id,
      ...resignationLetter({
        name: p.name ?? '이름 미상',
        deptLabel: simDept(p.dept!).label,
        saturatedDays: p.saturatedDays ?? 0,
        traits: p.traits,
      }),
    }))
}

/** 인사 패널의 특성 배지 — 라벨은 칸에, 사연은 툴팁에. 카탈로그(`traits.TRAITS`)가 단일 출처다.
 *  ⚠️ **수치 효과가 없다**(traits.ts 머리말) — 이 배지는 사람을 부르는 이름표이지 능력치가 아니다.
 *  특성이 없는 폰은 빈 배열이라 패널이 죽지 않는다. */
export function traitBadges(p: Pawn): Array<{ key: TraitKey; label: string; story: string }> {
  return (p.traits ?? []).map(key => ({ key, label: TRAITS[key].label, story: TRAITS[key].story }))
}

/**
 * 인사 명단 필터 하나 — 칩에 뜨는 **인원수와 그 목록이 같은 배열**이다.
 *
 * `count` 같은 숫자 필드를 따로 두지 않는 것이 이 타입의 요지다: 두 벌이 되는 순간 한쪽만 고치는
 * 날이 오고, 그러면 「3명」이라 적힌 칩이 두 명을 보여준다. 이 저장소가 세 번 경고한 이중 기재의
 * 가장 작은 판이다 — 배열 하나면 갈릴 자리가 없다.
 */
export interface RosterFilter {
  key: string
  label: string
  /** 이 필터에 걸린 의사들 — 칩의 숫자(`doctors.length`)이자 선택했을 때 뜨는 목록 그 자체. */
  doctors: Pawn[]
  /** 경고 톤으로 칠할 근거 — **색은 표시층이 정한다**(여기서 클래스 이름을 주지 않는다). */
  alarm?: boolean
}

/**
 * 인사 패널의 명단 필터 — **전체 → 과별 → 상태별** 순으로, 인원이 있는 것만.
 *
 * 명단이 길어지면(전국 풀이 총 18명이라 후반엔 두 자릿수) 손잡이를 찾는 데 스크롤이 든다.
 * 그런데 이 패널에서 찾는 대상은 늘 둘 중 하나다 — *어느 과를 통째로 조정할 것인가*, 아니면
 * *지금 갈리고 있는 사람이 누구인가*. 두 축이 곧 두 묶음의 칩이다.
 *
 * **인원수를 항상 함께 내는 것이 이 함수의 절반**이다: 「피로 위험 3」은 누르지 않아도 이미
 * 정보다. 그리고 그 숫자야말로 이 게임이 말하려는 것이라(사람이 갈린다) 칩은 편의 장치이면서
 * 동시에 인간 비용의 요약이 된다 — 우측 경고 스택(alertsOf)과 같은 자리의 같은 논리다.
 *
 * ⚠️ **인원 0인 칩은 아예 안 뜬다.** 「이번 주말 떠남 0」이 떠 있으면 아무 일도 없는 병원이
 * 사고가 난 병원처럼 읽힌다 — 회차 내역이 0줄을 빼는 것과 같은 규칙(`turnAwayBreakdownText`).
 * 전체 칩만은 0명이어도 남는다(패널이 "필터가 하나도 없는" 상태를 다룰 필요가 없게).
 *
 * ⚠️ **응급 끔에는 `alarm`을 달지 않는다.** 피로·사직은 사람에게 일어난 일이지만 응급 토글은
 * 플레이어의 선택이고, 그것을 붉게 칠하는 순간 화면이 "그러면 안 된다"고 말하게 된다 — 이
 * 패널이 카피에서 지키는 톤(*"응급을 끈 과는 그 과가 없는 것과 같습니다"*까지만)을 색에서도
 * 지킨다. 판단은 플레이어 몫이다.
 *
 * 판정은 전부 **이미 있는 술어**를 부른다(`fatigueTone`·`priorityOf`·코어의 사직 명단) — 여기서
 * 임계나 기본값을 다시 적으면 필터에 걸리는 사람과 화면이 붉게 칠하는 사람이 갈린다.
 */
export function rosterFilters(pawns: readonly Pawn[], resigningIds: ReadonlySet<string>): RosterFilter[] {
  const doctors = pawns.filter(p => p.kind === 'DOCTOR')
  const out: RosterFilter[] = [{ key: 'ALL', label: '전체', doctors }]
  // 과 순서는 **카탈로그 순서**다(HIRABLE_DEPTS) — 명단 등장 순(채용 순)으로 세우면 같은 병원을
  // 두 번 열었을 때 칩 순서가 달라 손이 기억하는 자리가 없어진다.
  for (const dept of HIRABLE_DEPTS) {
    const list = doctors.filter(p => p.dept === dept)
    if (list.length > 0) out.push({ key: `dept:${dept}`, label: simDept(dept).label, doctors: list })
  }
  const flags: Array<{ key: string; label: string; alarm?: true; match: (p: Pawn) => boolean }> = [
    { key: 'fatigue', label: '피로 위험', alarm: true, match: p => fatigueTone(p.fatigue ?? 0) === 'RED' },
    { key: 'leaving', label: '이번 주말 떠남', alarm: true, match: p => resigningIds.has(p.id) },
    { key: 'no-emergency', label: '응급 끔', match: p => priorityOf(p, 'emergency') === 0 },
  ]
  for (const f of flags) {
    const list = doctors.filter(f.match)
    if (list.length > 0) out.push({ key: f.key, label: f.label, doctors: list, alarm: f.alarm })
  }
  return out
}

/** 지금 누군가를 보고 있는 의사들 — 판정의 출처는 **환자의 `doctorId`**다(외래·응급·욕구가 쓰는 그 집합).
 *  의사 쪽에 바쁨 플래그를 따로 두면 환자가 사라질 때 되돌리는 걸 잊어 영영 안 풀린다. */
export function busyDoctorIds(pawns: readonly Pawn[]): Set<string> {
  return new Set(pawns.map(p => p.doctorId).filter((id): id is string => !!id))
}

/**
 * **태업** — 쉬라고 매겨 뒀고 지치기까지 했는데, 쉴 자리가 없어 아무것도 안 하고 있는 의사.
 *
 * `rest > exam`인 의사는 외래 유휴 풀에서 **미리 빠진다**(needs.prefersRestOverExam). 그런데
 * 휴게실이 없거나 의자가 다 찼으면 개시도 못 해서, 그는 진료도 휴식도 안 하는 상태로 선다.
 * 이건 규칙대로의 결과지만 화면에는 **아무 흔적이 없어** 플레이어에게는 "의사가 고장 났다"로
 * 보인다 — 이 술어가 그 한 줄을 만든다.
 *
 * 임계·토글 판정을 여기서 다시 적지 않고 코어 술어를 그대로 부르는 것이 핵심이다: 식을 복제하면
 * 시뮬이 "쉬고 싶다"고 보는 의사와 화면이 그렇게 보는 의사가 갈려, 힌트가 엉뚱한 사람에게 뜬다.
 *
 * 나머지 두 조건은 화면 쪽 사실이다 — `activity`가 붙었으면 **자리를 찾은 것**이고(개시는 같은
 * 분에 일어난다), `busy`면 노는 게 아니라 응급 처치 중이다(rest 우선 의사는 외래엔 안 잡힌다).
 */
export function noRestSpotIdle(p: Pawn, busy: ReadonlySet<string>): boolean {
  return prefersRestOverExam(p) && p.activity === undefined && !busy.has(p.id)
}

/*
  ── 온보딩 판정 3종 + 상태줄 ───────────────────────────────────────────────
  이 게임이 첫 화면에서 무너진 자리는 규칙이 아니라 **침묵**이었다(사용자 신고: "캐릭터가
  안 움직이고 방이 안 보인다" — 시뮬은 정상이었고 건설 성공이 0회였다). 아래 넷은 전부
  "왜 아무 일도 안 일어나는가"를 문장으로 만드는 판정이다. JSX가 아니라 여기 있는 이유는
  이 파일 머리말 그대로다 — 문구와 **우선순위**가 화면 계약인데, JSX 안에 있으면 그 계약을
  겨눌 수 있는 테스트가 하나도 없다.
*/

/*
  ── 건설 도구 팔레트 ────────────────────────────────────────────────────────
  방을 통째로 짓던 자리가 여덟 도구로 갈렸다(설계 §2). 화면이 알아야 할 것은 셋이다:
  **이름**(버튼) · **값**(가격표) · **조작**(드래그인가 클릭인가). 셋 다 여기 있는 이유는
  이 파일 머리말 그대로다 — JSX 안에 있으면 그 계약을 겨눌 테스트가 하나도 없다.
*/

/** 가구 4종은 이름이 곧 `FurnitureKind`다 — 도구에서 종류로 옮길 때 표를 하나 더 두지 않는다. */
export type BuildTool = FurnitureKind | 'WALL' | 'DOOR' | 'DESIGNATE' | 'DEMOLISH'

/** 팔레트에 서는 순서 — 벽 → 문 → 가구 → 용도 → 철거(건설 순서를 그대로 읽는다). */
export const BUILD_TOOLS: readonly BuildTool[] = [
  'WALL', 'DOOR', 'DESK', 'CHAIR', 'BED', 'COUNTER', 'DESIGNATE', 'DEMOLISH',
]

export const TOOL_LABEL: Record<BuildTool, string> = {
  WALL: '벽', DOOR: '문', DESK: '책상', CHAIR: '의자', BED: '침대', COUNTER: '카운터',
  DESIGNATE: '용도', DEMOLISH: '철거',
}

/** 드래그로 쓰는 도구인가 — 문·용도는 한 칸을 겨누는 클릭이라 사각형이 뜻을 갖지 않는다. */
export const isDragTool = (tool: BuildTool): boolean => tool !== 'DOOR' && tool !== 'DESIGNATE'

/** 팔레트 오른쪽 가격표 — 값은 **코어 표**(build.BUILD_COST)에서 온다.
 *  여기서 숫자를 다시 적으면 화면이 말하는 값과 금고에서 빠지는 값이 갈린다. */
export function toolCostText(tool: BuildTool): string {
  if (tool === 'DESIGNATE') return '용도 지정 — 무료'
  if (tool === 'DEMOLISH') return '철거 — 건설비의 50% 환불'
  return `${TOOL_LABEL[tool]} 개당 ${BUILD_COST[tool]}만원`
}

/**
 * 포인터 위치 → 타일 좌표. 격자 밖으로 나가도 부지 안으로 물린다(드래그가 밖에서 끝나도 사각형이 성립).
 *
 * **타일 크기를 `rect`에서 파생하는 것**이 이 함수의 전부이자 계약이다 — `rect`는 화면에 그려진
 * 실제 크기(getBoundingClientRect)라 맵의 확대·축소가 자동으로 반영된다. 화면 상수 TILE로
 * 나누면 2배로 확대된 맵에서 좌표가 정확히 두 배로 어긋난다: 이 저장소는 같은 계열의 결함을
 * 이미 한 번 겪었다(헤더가 한 줄 늘어 맵이 32px 내려가자 7×6을 그렸는데 7×4가 지어졌다 —
 * SimGame 헤더 주석). 그 함정을 **산술에서 없앤 자리**가 여기다.
 *
 * 컴포넌트 밖인 이유는 이 파일의 머리말 그대로다 — DOM 없이 도는 테스트가 겨눌 수 있어야 한다.
 */
export function tileFromPoint(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
): Pt {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v))
  return {
    x: clamp(Math.floor((point.x - rect.left) / (rect.width / GRID_W)), GRID_W - 1),
    y: clamp(Math.floor((point.y - rect.top) / (rect.height / GRID_H)), GRID_H - 1),
  }
}

/*
  ── 부지 카메라 ─────────────────────────────────────────────────────────────
  부지를 밀고 당기는 산술. 옛 판은 부지 전체가 화면에 딱 맞는 배율 하나뿐이라(useFitScale)
  **가려진 타일을 피할 방법이 없었고**, 그래서 HUD를 맵 위에 겹치지 못했다(SimGame main 주석).
  카메라가 생기면 가려진 자리를 팬으로 끌어내 지을 수 있으므로 그 제약이 사라진다.

  DOM 없이 순수 함수인 이유는 이 파일 머리말 그대로다 — 클램프와 앵커 산술은 화면 계약인데
  이벤트 핸들러 안에 있으면 그것을 겨눌 수 있는 테스트가 하나도 없다(tileFromPoint와 같은 자리).
*/

/** 뷰포트·부지의 크기 한 쌍(px). */
export interface Size {
  w: number
  h: number
}

/**
 * 카메라가 기준으로 삼는 **안전 영역**(뷰포트 px) — 화면에서 HUD 바가 덮지 않는 사각형.
 *
 * 클램프의 기준이 뷰포트 전체가 아니라 이것인 것이 카메라의 계약이다. HUD는 맵 **위에 뜬
 * 오버레이**라 뷰포트를 줄이지 않으므로, 뷰포트 전체를 기준으로 잡으면 zoom 1에서 바깥쪽 타일
 * 줄이 늘 바 밑에 깔린다 — 게다가 그 배율에선 콘텐츠가 기준과 같은 크기라 **팬 슬랙이 0**이라
 * 꺼낼 수도 없다(의사가 처음 서는 입구가 영영 안 보였다 — T-102).
 *
 * 뷰포트를 그대로 넘기고 싶으면 `{ x: 0, y: 0, w, h }`다 — 인셋 0이 곧 옛 계약이다.
 */
export interface Rect extends Size {
  x: number
  y: number
}

/** HUD가 덮는 두께(px) — 상단 바의 높이와 좌측 도구 패널의 폭. 두 바뿐이라 둘뿐이다. */
export interface Insets {
  top: number
  left: number
}

/**
 * 뷰포트 − 인셋 = 안전 영역. 재는 쪽(TileMap.useCamera)이 쓰는 한 줄짜리 산술이지만 훅 밖에
 * 있는 이유는 이 파일 머리말 그대로다 — 안에 있으면 "좌측 폭이 실제로 빠지는가"를 겨눌 수 있는
 * 테스트가 하나도 없고, 그게 빠지지 않으면 맵이 팔레트 밑으로 밀린다(T-102의 가로판).
 *
 * ⚠️ **음수를 그대로 돌려준다** — 바가 화면을 다 먹는 극단(아주 좁은 창)에서 접을지 말지는
 * 호출부가 정한다. 여기서 0으로 자르면 "폭 0인 안전 영역"이 정상값처럼 흘러가 맵이 사라진다.
 */
export function safeArea(view: Size, insets: Insets): Rect {
  return { x: insets.left, y: insets.top, w: view.w - insets.left, h: view.h - insets.top }
}

export interface Camera {
  /** **fit 배율 대비 배수** — 1이면 부지 전체가 뷰포트에 딱 맞는다(옛 useFitScale이 주던 그 화면).
   *  fit 자체를 곱해 두지 않는 것이 계약이다: 창 크기가 바뀌면 fit은 갈리지만 "몇 배로 당겨 봤는가"는
   *  플레이어의 의도라 유지돼야 한다. */
  zoom: number
  /** 뷰포트 좌상단 기준 **맵 좌상단의 화면 px** — 왼쪽·위로 밀면 음수다. */
  x: number
  y: number
}

/** 최대 줌 — 타일 하나가 화면을 채우면 부지의 맥락이 사라져 오히려 짓기 어렵다. */
export const ZOOM_MAX = 3

/** 최소 줌 — **fit(1)보다 아래**여야 한다. 1에서 막으면 게임이 시작되는 배율이 곧 하한이라
 *  [−]와 휠아웃이 **처음부터 죽은 버튼**이다("확대만 되지 축소는 안 된다" — 실제 신고).
 *  부지 전체가 이미 보이는 배율이라도 둘레 여백까지 당겨 보는 것이 축소의 모습이다. */
export const ZOOM_MIN = 0.5

/** 그 배율에서 화면에 그려지는 맵 크기 — 클램프의 경계는 전부 여기서 나온다. */
const contentOf = (base: Size, scale: number): Size => ({ w: base.w * scale, h: base.h * scale })

/** 축 하나의 클램프. **콘텐츠가 안전 영역보다 작으면 중앙값**(팬을 무시한다) — zoom 1에서는 짧은
 *  쪽에 늘 여백이 남는데, 그 축을 밀 수 있으면 부지가 화면 밖으로 흘러가고 절반이 빈 배경이 된다.
 *  크면 [start + safe − content, start]로 자른다: 맵 가장자리가 안전 영역 **안쪽**으로 들어오면
 *  그쪽에 빈틈이 생긴다. 바깥(바 밑)으로 나가는 것은 막지 않는다 — 그게 줌인의 모습이다. */
function clampAxis(pan: number, start: number, safe: number, content: number): number {
  if (content <= safe) return start + (safe - content) / 2
  return Math.max(start + safe - content, Math.min(start, pan))
}

export function clampCamera(cam: Camera, safe: Rect, content: Size): Camera {
  return {
    zoom: cam.zoom,
    x: clampAxis(cam.x, safe.x, safe.w, content.w),
    y: clampAxis(cam.y, safe.y, safe.h, content.h),
  }
}

/**
 * 앵커(뷰포트 px) 아래의 맵 지점이 **줌 전후로 같은 화면 위치에 남도록** 팬을 다시 잡는다.
 *
 * 이 불변식이 줌의 전부다 — 없으면 휠을 굴릴 때마다 보던 곳이 화면 밖으로 밀려나 커서로
 * 다시 찾아가야 한다. 식은 배율 변화 k = s′/s에 대해 `x′ = ax − (ax − x)·k` 하나뿐이다.
 *
 * ⚠️ 기준이 **저장된 팬이 아니라 클램프된 유효 팬**인 것이 요점이다: zoom 1에서는 화면이 언제나
 * 중앙 정렬인데 저장값은 그와 다를 수 있어(직전 줌아웃이 남긴 값), 그대로 쓰면 첫 줌인이 튄다.
 *
 * ⚠️ 앵커는 안전 영역이 아니라 **뷰포트 px**다 — 커서는 바 위에도 올라간다. 인셋은 클램프에만 든다.
 */
export function zoomedCamera(
  cam: Camera,
  anchor: { x: number; y: number },
  factor: number,
  safe: Rect,
  base: Size,
  fit: number,
): Camera {
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom * factor))
  const k = zoom / cam.zoom
  const eff = clampCamera(cam, safe, contentOf(base, fit * cam.zoom))
  return clampCamera(
    { zoom, x: anchor.x - (anchor.x - eff.x) * k, y: anchor.y - (anchor.y - eff.y) * k },
    safe,
    contentOf(base, fit * zoom),
  )
}

/** 드래그 델타를 그대로 더하고 가장자리에서 자른다. */
export function pannedCamera(cam: Camera, dx: number, dy: number, safe: Rect, base: Size, fit: number): Camera {
  return clampCamera({ ...cam, x: cam.x + dx, y: cam.y + dy }, safe, contentOf(base, fit * cam.zoom))
}

/** 드래그 사각형이 낳는 타일 — 가구·철거는 **채움**, 벽은 **테두리**다(1줄이면 곧 직선 벽). */
export function rectTiles(a: Pt, b: Pt, mode: 'FILL' | 'BORDER'): Pt[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
  const out: Pt[] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    if (mode === 'FILL' || x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y })
  }
  return out
}

/** 드래그 도구별 사각형 해석 — 벽만 테두리다. */
export const rectModeOf = (tool: BuildTool): 'FILL' | 'BORDER' => (tool === 'WALL' ? 'BORDER' : 'FILL')

/** 드래그 미리보기에 뜨는 한 줄 — **철거는 환불**이라 부호가 뒤집힌다.
 *  이 한 곳에서 갈라 두지 않으면 "50만원이 나간다"와 "50만원이 들어온다"가 같은 문장으로 뜬다. */
export function previewLabel(tool: BuildTool, res: PlaceResult): string {
  const n = res.tiles.length
  if (tool === 'DESIGNATE') return `${n}칸 — 용도 지정`
  const money = formatManwon(Math.abs(res.deltaManwon))
  return tool === 'DEMOLISH' ? `${n}칸 철거 · 환불 ${money}` : `${n}칸 · ${money}`
}

/**
 * 건설 한 번의 결과를 토스트 한 줄로 — 말할 게 없으면 `null`.
 *
 * 성공까지 떠들지 않는 것이 계약이다(잘된 일마다 토스트가 뜨면 진짜 사유가 묻힌다). 다만
 * **부분 설치**는 예외다: 건너뛴 칸은 화면에 아무 흔적이 없어서, 5칸을 끌었는데 2칸만 선 이유를
 * 말해 줄 자리가 여기밖에 없다.
 */
export function buildResultText(tool: BuildTool, res: PlaceResult): string | null {
  if (res.ok) {
    if (res.skipped === 0) return null
    return tool === 'DEMOLISH'
      ? `${res.skipped}칸은 부술 것이 없어 지나갔습니다`
      : `${res.skipped}칸은 이미 차 있어 건너뛰었습니다`
  }
  return REASON_TEXT[res.reason](tool)
}

/** 코어 사유 → 화면 문구. 사유는 코어가, 말은 화면이 갖는다(옛 REASON_TEXT 관례 계승).
 *  NOTHING만 도구를 본다 — 철거의 "부술 게 없다"와 설치의 "놓을 자리가 없다"는 다른 상황이고,
 *  한 문구로 접으면 무엇을 고쳐야 하는지가 사라진다. */
const REASON_TEXT: Record<BuildReason, (tool: BuildTool) => string> = {
  NOTHING: tool => (tool === 'DEMOLISH' ? '부술 것이 없습니다' : '놓을 자리가 없습니다 — 이미 차 있습니다'),
  NO_MONEY: () => '자금이 부족합니다',
  NOT_WALL: () => '문은 벽 위에만 낼 수 있습니다',
  OUTDOORS: () => '둘러싸인 실내가 아닙니다 — 벽으로 두르고 문을 내세요',
}

/**
 * 지금 클릭이 거부되는 **말할 수 있는 사유** — 없으면 `null`.
 *
 * 용도 도구는 무슨 방인지(진료실이면 과까지) 골라야 열리는데, 안 고른 채로 부지를 누르면 코어에
 * 닿기도 전에 화면에서 삼켜져 미리보기도 토스트도 없다 — 플레이어에게는 **판이 죽은 것**으로
 * 보인다. 과 없는 EXAM은 코어가 아예 던지므로(build.designateRegion) 이 줄이 그 앞을 막는다.
 *
 * ⚠️ 도구를 아예 안 골랐을 때는 `null`이다: 그 클릭은 실패가 아니라 맵을 둘러보는 동작이라,
 * 여기에 사유를 붙이면 부지를 누를 때마다 토스트가 떠 진짜 사유가 묻힌다.
 */
export function buildBlockReason(
  tool: BuildTool | null, roomType: RoomType | null, dept: SimDeptKey | null,
): string | null {
  if (tool !== 'DESIGNATE') return null
  if (roomType === null) return '지정할 용도를 고르세요 — 아래 줄에서 방 종류를 고릅니다'
  if (roomType === 'EXAM' && dept === null) return '진료실은 과를 골라야 지정할 수 있습니다 — 아래에서 과를 고르세요'
  return null
}

/**
 * 자기 과 진료실이 없어 서 있는 의사의 표시 — 아니면 `null`.
 *
 * 방 배정은 **같은 과 EXAM**에만 붙으므로(patientFlow), 그 방이 없는 의사는 첫 분부터 마지막
 * 분까지 입구 앞에 서 있다. 규칙대로의 결과지만 화면에는 흔적이 없어 "폰이 멈췄다"로 읽힌다 —
 * `noRestSpotIdle`이 태업에 한 줄을 준 것과 같은 자리다.
 *
 * 활동(휴식·식사) 중이면 안 붙인다: 그건 자리가 없는 게 아니라 스스로 자리를 뜬 것이고,
 * 그 표시는 `doctorActivityMark`가 이미 갖고 있다(TileMap에서 그쪽이 우선한다).
 */
export function doctorRoomlessMark(p: Pawn): ActivityMark | null {
  // 정원이 방이 아니라 **책상**이 됐으므로(설계 §4) 문구도 일반화한다 — 자기 과 진료실이
  // 있는데도 빈 책상이 없어 서 있는 의사가 이제 실재한다.
  return p.kind === 'DOCTOR' && !p.deskAt && !p.activity
    ? { glyph: '?', label: '빈 진료 책상이 없어 대기 중' }
    : null
}

/**
 * 화면 우측에 쌓이는 경고 한 건 — 림월드 alerts의 이식.
 *
 * `kind`가 갈리는 이유는 **할 일의 종류**가 다르기 때문이다: `setup`은 "아무 일도 안 일어나는
 * 이유"(지어야 한다)이고 `ops`는 "지금 일어나고 있는 일"(사람·병상이 모자란다)이다.
 * `key`는 React key이자 테스트가 겨누는 이름 — 문구가 바뀌어도 그 경고의 신원은 안 흔들린다.
 */
export interface SimAlert {
  key: string
  kind: 'setup' | 'ops'
  severity: 'warn' | 'danger'
  text: string
}

/**
 * 지금 이 병원에 대해 할 말 전부 — **danger가 앞, 같은 등급 안에서는 고정 순서**.
 *
 * 상태줄이 한 줄뿐이라 배치 경고 하나만 말할 수 있었는데(statusLineText), 그 한 줄은 정지
 * 사유·토스트에 늘 밀린다 — 즉 **급한 말일수록 안 보였다**. 스택은 그 경합을 없앤다.
 *
 * 정렬을 sort가 아니라 두 필터의 이어붙이기로 하는 것은 **같은 등급 안의 순서가 계약**이라서다:
 * setup 체인 순서와 ops 나열 순서가 그대로 보존돼야 하고, 그건 정렬 안정성에 기대는 것보다
 * 여기서 눈에 보이는 편이 낫다.
 *
 * 의사가 0명이면 빈 배열이다 — 아직 아무것도 안 한 첫 판은 "잘못된 배치"가 아니고(그 자리는
 * 상태줄의 개원 안내가 맡는다), ops 셋도 전부 의사를 세는 판정이라 어차피 조용하다.
 */
export function alertsOf(w: SimWorld): SimAlert[] {
  const doctors = w.pawns.filter(p => p.kind === 'DOCTOR')
  if (doctors.length === 0) return []
  // **영역**을 센다 — 규칙이 보는 방과 경고가 세는 방이 갈리면, 벽이 뚫린 대기실(= 마당이라
  // 좌석이 안 열린다)에서 "대기실은 있는데 환자가 안 온다"가 되어 경고가 정확히 거짓말을 한다.
  // 한 번 계산해 아래 판정들이 나눠 쓴다 — 경고마다 다시 돌면 매 프레임 flood fill이 여러 번이다.
  const regions = computeRegions(w)
  const blocked = buildBlockedSet(w)

  const alerts: SimAlert[] = []
  const setup = setupAlert(w)
  if (setup) alerts.push(setup)

  // ── 운영 경고 — 배치는 끝났는데 지금 무언가가 모자란 상태. 셋 다 기존 판정·상수의 재사용이다.
  // 병상 0: 응급은 **문 앞에서** 되돌아가고 폰조차 안 만들어져(emergency.ts) 화면에 흔적이 없다.
  if (wardBeds(w, blocked, regions).length === 0) {
    alerts.push({ key: 'no-bed', kind: 'ops', severity: 'danger', text: '병상이 없습니다 — 응급을 받을 수 없습니다' })
  }
  // 임계를 다시 적지 않는다 — 막대가 붉어지는 그 판정(fatigueTone)이 곧 이 경고의 조건이다.
  const tired = doctors.filter(d => fatigueTone(d.fatigue ?? 0) === 'RED').length
  if (tired > 0) {
    alerts.push({
      key: 'fatigue-risk', kind: 'ops', severity: 'danger',
      text: `피로 위험 의사 ${tired}명 — 쉬지 못하면 사직으로 이어집니다`,
    })
  }
  // 허기 판정도 코어 술어를 지난다(needs.starvedSlowFactor) — 임계를 여기 적으면 "경고는 뜨는데
  // 안 느려지는" 구간이 조용히 생긴다. **식당이 없을 때만** 경고인 이유: 식당이 있으면 밥때가
  // 되는 대로 스스로 가므로 그건 문제가 아니라 대기다.
  const starving = doctors.filter(d => starvedSlowFactor(d) > 1).length
  if (starving > 0 && !regions.some(r => r.type === 'CAFETERIA')) {
    alerts.push({
      key: 'starving', kind: 'ops', severity: 'warn',
      text: `식당이 없어 굶는 의사 ${starving}명 — 모든 일이 느려집니다`,
    })
  }
  /* 접수처 반려 — 코어에서는 **폰조차 안 만들어지는** 사실이라(patientFlow.maybeArrive) 병상 0과
     똑같이 화면에 흔적이 없다. 그런데 이건 이 판에서 가장 큰 손실원이 될 수 있다(회귀 픽스처
     실측: 이탈 33건 중 32건).

     **실제로 돌려보낸 뒤에만** 뜬다(`leftNoDept > 0`). 상태만 보면 개원 직후 의사 0명일 때
     네 과 경고가 한꺼번에 서서, 아직 아무 일도 안 일어난 화면이 사고 난 것처럼 읽힌다.
     반대로 과 목록은 **지금** 상태에서 뽑는다 — 그 사이 채용했으면 그 과는 문장에서 빠진다
     (경고가 과거를 붙들면 채용한 보람이 화면에서 사라진다).

     ⚠️ warn이지 danger가 아니다. 안 뽑은 것은 사고가 아니라 **플레이어의 선택**이고, 붉게
     칠하는 순간 화면이 "그러면 안 된다"고 말하게 된다(인사 패널의 「응급 끔」과 같은 톤 규칙). */
  const unserved = w.stats.leftNoDept > 0 ? unservedDepts(w) : []
  if (unserved.length > 0) {
    alerts.push({
      key: 'no-dept', kind: 'ops', severity: 'warn',
      text: `${unserved.map(d => simDept(d).label).join('·')} 환자를 문 앞에서 돌려보내고 있습니다 — 그 과 의사가 없습니다`,
    })
  }
  /* 미수 — 진료는 했는데 창구가 없어 돈이 안 걷혔다(patientFlow.hasCashier). 코어에서는
     금고가 **안 움직이는** 사실이라 화면에 흔적이 없다: 진료 건수는 오르는데 수익만 0이라,
     경고가 없으면 플레이어에게는 "수가가 0인가"로 보인다.

     **실제로 샌 뒤에만** 뜬다(`unpaidManwon > 0`) — 상태만 보면 창구를 짓기도 전에 경고가
     서서 아직 아무 일도 안 일어난 화면이 사고 난 것처럼 읽힌다(no-dept와 같은 규칙이고,
     배치가 덜 끝난 동안은 어차피 setup 경고가 먼저다 — 그 섀도잉은 그대로 유지된다).

     ⚠️ warn이지 danger가 아니고 문구는 **상태 서술만** 한다: 「받지 못했습니다」이지
     「놓쳤습니다」가 아니다(톤 가드레일 — 「응급 끔」·no-dept와 같은 자리의 같은 규칙). */
  if (w.stats.unpaidManwon > 0) {
    alerts.push({
      key: 'unpaid', kind: 'ops', severity: 'warn',
      text: `진료비 ${formatManwon(w.stats.unpaidManwon)}을 받지 못했습니다 — 접수처 카운터에 간호사가 없습니다`,
    })
  }

  return [...alerts.filter(a => a.severity === 'danger'), ...alerts.filter(a => a.severity === 'warn')]
}

/**
 * 개원 전에 갖춰야 하는 것 — **순서대로**, 각 단계가 끝났는지와 함께.
 *
 * 사용자 결정(2026-07-29): *"튜토리얼을 필요로 하는 사용자에게는 건설도 안내해 줘야 한다고
 * 생각해. 림월드가 한국에서는 그렇게 일반적인 장르는 아니거든."*
 *
 * **순서 자체는 원래 `setupAlert` 체인에 있었다**(대기실 → 문 → 진료실 → 책상). 없던 것은 그
 * 순서를 **한눈에 보여주는 형태**뿐이라, 새 판정을 만들지 않고 이 함수를 단일 출처로 세운 뒤
 * 경고를 **첫 미완 단계**의 파생으로 뒤집었다. 두 곳이 각자 판정하면 "경고는 진료실을
 * 말하는데 체크리스트는 대기실에 체크가 없는" 화면이 나오고, 그 어긋남은 어디에도 안 뜬다.
 *
 * 순서가 곧 **인과**다: 대기실이 없으면 진료실을 아무리 지어도 환자가 안 온다. 그래서 경고는
 * 여전히 **한 건만** 낸다(넷을 쌓으면 무엇부터 할지가 사라진다) — 체크리스트만 전부 보여준다.
 *
 * `hint`가 `label`과 나란히 있는 이유: **조작을 모르면 할 일을 알아도 못 한다.** 이 장르의
 * 드래그 건설·용도 지정은 처음 보면 추측이 안 되는 조작이다.
 */
export interface SetupStep {
  /** 경고 key와 **같은 값** — 체크리스트 줄과 경고 칩이 같은 단계를 가리킨다는 증거다. */
  key: string
  /** 체크리스트 한 줄 — 할 일. */
  label: string
  /** 어떻게 하는가 — 눌러야 할 버튼 이름을 그대로 적는다(팔레트 라벨과 같은 말). */
  hint: string
  done: boolean
  /** 경고 칩에 뜨는 문구 — 왜 지금 아무 일도 안 일어나는가(단계가 안 끝났을 때만 읽힌다). */
  alert: string
}

export function setupSteps(w: SimWorld): SetupStep[] {
  const doctors = w.pawns.filter(p => p.kind === 'DOCTOR')
  const regions = computeRegions(w)
  const blocked = buildBlockedSet(w)

  // 문 없는 밀실 — 벽만 두르면 영역은 인식되지만 통로가 없어 아무도 못 들어간다(설계 §7).
  // 버그가 아니라 배치의 결과지만, 화면에는 멀쩡한 방으로 보여 이유를 영영 못 찾는다.
  const sealed = regions.filter(r => r.type && r.doors.size === 0).length
  const roomless = doctors.filter(d => !regions.some(r => r.type === 'EXAM' && r.dept === d.dept)).length
  // 방은 있는데 **앉을 책상**이 모자란 경우(설계 §4) — 정원은 방 크기가 아니라 슬롯 수다.
  // 과별로 세는 것이 계약이다: 미용 진료실에 책상이 남아돌아도 내과 의사는 못 앉는다.
  const byDept = new Map<SimDeptKey | undefined, number>()
  for (const d of doctors) byDept.set(d.dept, (byDept.get(d.dept) ?? 0) + 1)
  let missing = 0
  let lonelyDesks = 0 // 의자를 안 붙여 슬롯이 못 된 책상 — 있으면 할 일이 "책상 추가"가 아니다
  for (const [dept, count] of byDept) {
    const exams = regions.filter(r => r.type === 'EXAM' && r.dept === dept)
    const slots = exams.reduce((n, r) => n + examSlots(w, r, blocked).length, 0)
    if (slots >= count) continue
    missing += count - slots
    const desks = exams.reduce(
      (n, r) => n + w.furniture.filter(f => f.kind === 'DESK' && r.tiles.has(tileIndex(f.x, f.y))).length, 0,
    )
    lonelyDesks += desks - slots
  }

  return [
    {
      key: 'no-doctor',
      label: '의사를 뽑습니다',
      hint: '왼쪽 [사람] > [채용]. 과마다 주급과 수가가 다릅니다.',
      done: doctors.length > 0,
      // 접수처 반려가 생긴 뒤로 의사 0명은 **도착 0명**이다(patientFlow.servesDept) — 옛
      // "진료가 안 된다"보다 훨씬 센 상태라 문구도 그 사실을 그대로 말한다.
      alert: '의사가 없습니다 — 환자가 문 앞에서 전부 돌아갑니다',
    },
    {
      key: 'no-waiting',
      label: '대기실을 만듭니다',
      hint: '[건설] > [벽]으로 사각형을 끌고 → [문]으로 벽 한 칸을 뚫고 → [용도] > [대기실] → [의자]를 채웁니다.',
      done: regions.some(r => r.type === 'WAITING'),
      alert: '대기실이 없습니다 — 환자가 들어오지 못합니다',
    },
    {
      key: 'sealed-rooms',
      label: '모든 방에 문을 냅니다',
      hint: '[건설] > [문]으로 벽 한 칸을 클릭합니다. 문이 없으면 방이 아니라 밀실입니다.',
      /* ⚠️ **"문제가 없다"가 아니라 "실제로 갖췄다"가 done이다.** 방이 하나도 없는 빈 판에서
         `sealed === 0`만 보면 체크리스트가 「문 내기 ✅」로 떠 처음 보는 사람을 속인다.
         앞 조건이 붙어도 경고는 안 바뀐다 — 경고는 **첫** 미완 단계만 내는데, 방이 없는 판은
         그 앞의 `no-waiting`이 먼저 걸려 이 줄까지 오지 않는다(아래 둘도 같은 그늘). */
      done: regions.some(r => r.type) && sealed === 0,
      alert: `문이 없는 방 ${sealed}개 — 벽 한 칸을 골라 문을 내세요`,
    },
    {
      key: 'no-exam-room',
      label: '뽑은 과마다 진료실을 만듭니다',
      hint: '대기실과 같은 순서로 짓고 [용도] > [진료실] > 그 과를 고릅니다. 과가 다르면 못 들어갑니다.',
      done: doctors.length > 0 && roomless === 0,
      alert: `진료실 없는 의사 ${roomless}명 — 그 과 진료실을 지으세요`,
    },
    {
      key: 'no-desk',
      label: '진료실에 책상과 의자를 붙여 놓습니다',
      hint: '[건설] > [책상] 옆칸에 [의자]. **책상+의자 한 쌍이 의사 한 명 자리**라, 쌍이 모자라면 그만큼 못 앉습니다.',
      done: doctors.length > 0 && missing === 0,
      alert: lonelyDesks > 0
        ? `의자 없는 진료 책상 ${lonelyDesks}개 — 책상 옆에 의자를 붙이세요`
        : `진료 책상이 부족합니다 — 앉지 못한 의사 ${missing}명`,
    },
    {
      key: 'no-cashier',
      label: '수납 창구를 만듭니다',
      hint: '[건설] > [카운터]를 놓고 [용도] > [접수처]로 지정, [사람] > [채용]에서 간호사를 뽑습니다. 창구가 없으면 진료해도 돈을 받지 못합니다.',
      /* **체인의 맨 뒤인 것이 계약이다**: 진료가 돌기 전에 창구부터 지으라고 말하면 "순서가 곧
         인과"라는 이 목록의 전제가 뒤집힌다(창구만 있고 의사가 없는 병원은 걷을 돈이 없다).
         뒤에 있어도 늦지 않다 — 경고는 **첫** 미완 단계라, 앞을 다 마친 병원에서 곧바로 뜬다.
         판정은 코어(patientFlow.hasCashier)가 진다: 여기서 카운터와 간호사를 다시 세면
         체크리스트에 체크가 있는데 돈은 안 걷히는 화면이 생긴다. */
      done: hasCashier(w, blocked, regions),
      alert: '수납 창구가 없습니다 — 진료비를 받지 못합니다',
    },
  ]
}

/** 개원 전에 반드시 뽑아야 하는 의사 수 — **하한이지 상한이 아니다**(더 뽑아도 된다).
 *
 *  왜 강제인가: 접수처 반려가 생긴 뒤로 의사 0명은 곧 **도착 0명**이라, 안 뽑으면 판이
 *  문자 그대로 아무 일도 안 일어난다(빈 화면과 고장이 구별되지 않는다).
 *  왜 3인가: 림월드의 개척자 3명과 같은 수이고, 전국 풀 18명(미용 8·내과 5·외과 3·순환기 2)에
 *  부담이 없으면서 **첫 결정이 곧 딜레마**가 되는 최소 인원이다 — 셋을 다 미용으로 뽑으면
 *  흑자지만 나머지 과 환자를 전부 돌려보낸다. 그 선택이 이 게임의 질문이다. */
export const STARTING_ROSTER_MIN = 3

/** 개원 게이트가 열렸는가 — 세는 것은 **의사**다(환자는 세지 않는다). */
export const startingRosterMet = (pawns: readonly Pawn[]): boolean =>
  pawns.filter(p => p.kind === 'DOCTOR').length >= STARTING_ROSTER_MIN

/**
 * 이 배치가 **구조적으로 아무 일도 안 일어나는** 상태면 그 한 건 — 아니면 `null`.
 *
 * `setupSteps`의 **첫 미완 단계**다. 판정을 여기서 다시 쓰지 않는 것이 계약이다(위 머리말).
 */
function setupAlert(w: SimWorld): SimAlert | null {
  const first = setupSteps(w).find(s => !s.done)
  return first ? { key: first.key, kind: 'setup', severity: 'warn', text: first.alert } : null
}

/** 상태줄이 쓰는 배치 경고 한 줄 — **`alertsOf`의 파생**이다(문구·판정의 단일 출처는 그쪽).
 *  줄이 하나뿐인 자리라 스택의 첫 setup만 취한다: 두 곳이 각자 판정하면 상태줄과 스택이
 *  서로 다른 배치 문제를 말하게 되고, 그 어긋남은 화면 어디에도 안 뜬다. */
export function setupWarningText(w: SimWorld): string | null {
  return alertsOf(w).find(a => a.kind === 'setup')?.text ?? null
}

/*
  ── 인스펙트 카드 ───────────────────────────────────────────────────────────
  폰을 클릭하면 뜨는 한 장. **세계에 이미 있는 사실만** 싣는다 — "오늘 진료 N건" 같은 폰별
  집계를 새로 들면 그건 표시가 아니라 시뮬 변경이다.

  이 카드가 필요한 이유는 특성과 사연이 지금까지 **사직 편지에서만** 보였다는 것이다:
  판이 끝나야 사람이 보이면 그 사람을 지킬 방법이 없다. 그래서 특성 줄이 이 카드의 첫 내용이다.
*/

/** 카드 한 장 — 제목 한 줄 + 본문 여러 줄. 색·배치는 화면이 정한다(여기는 문장만 만든다). */
export interface InspectCard {
  title: string
  lines: string[]
}

/** 환자 흐름의 단계 → 한국어. `Record`라 스테이지가 늘면 tsc가 여기서 막는다 — 한 칸이 비면
 *  그 단계의 환자만 조용히 말을 잃는다(ACTIVITY_MARK와 같은 계약).
 *  ⚠️ 'PAYING'·'GONE'은 코어에서 **아직 아무도 만들지 않는 2주차 예약**이지만(pawn.ts) 표는
 *  전부 채운다: 빈 칸을 남기면 그 갈래가 살아나는 날 화면만 조용히 뒤처진다. */
const STAGE_LABEL: Record<NonNullable<Pawn['stage']>, string> = {
  ENTERING: '입장 중',
  WAITING: '대기 중',
  TO_EXAM: '진료실로 이동',
  IN_EXAM: '진료 중',
  PAYING: '수납 중',
  LEAVING: '퇴장 중',
  GONE: '퇴장',
  LEFT_WAITING: '기다리다 떠남',
  TO_BED: '병상으로 이동',
  IN_BED: '병상에서 대기',
  IN_TREATMENT: '처치 중',
}

/**
 * 지금 이 의사가 하고 있는 일 한 문장 — **위가 이기는 체인**(statusLineText와 같은 관례).
 *
 * 넷 다 이미 화면 어딘가에 있는 판정이다: 진료는 아바타의 busy 색, 휴식·식사는 글리프,
 * 자리 없음은 물음표. 카드가 그것들을 **문장으로** 모으는 것이지 새로 판정하지 않는다 —
 * 여기서 다시 적으면 머리 위 표시와 카드가 서로 다른 말을 하는 순간이 생긴다.
 */
function doctorStatusText(p: Pawn, busy: ReadonlySet<string>): string {
  if (busy.has(p.id)) return '진료 중'
  return doctorActivityMark(p)?.label ?? doctorRoomlessMark(p)?.label ?? '대기 중'
}

/**
 * 클릭한 폰 한 명의 카드.
 *
 * ⚠️ **던지지 않는다** — 이 함수는 클릭 한 번으로 렌더 중에 불리므로, 과 없는 폰(손세계·옛
 * 세계)에 `simDept`를 그대로 태우면 클릭 한 번에 화면이 통째로 죽는다(resigningNotices가
 * `doctorDeptOf`를 피한 것과 같은 판단). 이름·과가 없으면 그 조각만 빠진다.
 *
 * 세계를 받는 이유는 **바쁨**뿐이다: "진료 중"의 단일 출처는 의사의 플래그가 아니라 환자의
 * `doctorId`라(busyDoctorIds) 폰 하나만 봐서는 알 수 없다.
 */
export function inspectCard(p: Pawn, w: SimWorld): InspectCard {
  /* 간호사 — **역할이 곧 신원**이다. 과가 없고(간호사는 과가 아니다) 피로·우선순위 줄도 없다:
     그 기계 밖의 사람이라는 것이 이 슬라이스의 계약이라(pawn.PawnKind), 빈 줄을 0으로 채우면
     화면이 "아직 안 지쳤다"고 말하게 되어 없는 축이 있는 척한다.
     주급은 **코어 상수**를 그대로 읽는다 — 여기서 숫자를 적으면 결산에서 빠지는 액수와 갈린다. */
  if (p.kind === 'NURSE') {
    return {
      title: p.name ? `${p.name} · 간호사` : '간호사',
      lines: ['수납 담당', `주급 ${formatManwon(NURSE_WEEKLY_COST_MANWON)}`],
    }
  }
  if (p.kind === 'DOCTOR') {
    const name = p.name ?? '이름 미상'
    const deptLabel = p.dept ? simDept(p.dept).label : null
    return {
      title: deptLabel ? `${name} · ${deptLabel}` : name,
      lines: [
        // 특성 — 라벨과 사연이 **한 줄에 함께** 간다. 라벨만 있으면 이름표일 뿐이라, 이 카드가
        // 생긴 이유(사람으로 보이게 하기)가 그대로 사라진다.
        ...traitBadges(p).map(t => `${t.label} — ${t.story}`),
        doctorStatusText(p, busyDoctorIds(w.pawns)),
        `피로 ${p.fatigue ?? 0} · 허기 ${p.hungerMin ?? 0}분`,
        // 폴백(필드 없음 = 보통)은 코어가 소유한다 — 화면이 `?? 2`를 따로 적으면 손세계 폰이
        // 카드에서만 「금지」로 보인다.
        `진료 ${priorityOf(p, 'exam')} · 응급 ${priorityOf(p, 'emergency')} · 휴식 ${priorityOf(p, 'rest')}`,
      ],
    }
  }
  // 환자는 **익명**이다(character-design.md: 환자에 개인 서사를 붙이지 않는다) — 제목이 「환자」인
  // 것이 그 계약이고, 그래서 이름·특성 줄이 아예 없다.
  return {
    title: '환자',
    lines: [
      ...(p.wantsDept ? [`원하는 과: ${simDept(p.wantsDept).label}`] : []),
      ...(p.stage ? [STAGE_LABEL[p.stage]] : []),
      // 응급은 종류까지 — 아바타의 붉은 링은 "응급이다"까지만 말하고, 무엇이 왔는지는
      // 어느 과가 붙잡히는지를 정하는 사실이다(emergency.ts의 배후과).
      ...(p.emergency ? [`응급 — ${emergencySpec(p.emergency).label}`] : []),
    ],
  }
}

/*
  ── 키보드 최소셋 ───────────────────────────────────────────────────────────
  스페이스(일시정지)·ESC(한 겹 닫기) 둘뿐이다. **어떤 기능도 키보드 전용이 되지 않는다** —
  "마우스 클릭·드래그만으로 완주"는 제출 문서의 계약이라, 이 둘은 이미 마우스로 되는 일의
  가속 수단이다(배속 버튼 · 패널 닫기 버튼이 각각 제자리에 남는다).

  판정이 컴포넌트 밖인 이유는 이 파일 머리말 그대로다 — 리스너 안에 있으면 "무엇을 먼저
  닫는가"라는 화면 계약을 겨눌 수 있는 테스트가 하나도 없다.
*/

/** 스페이스 한 번 — 돌고 있으면 멈추고, 멈춰 있으면 **직전 배속**으로 돌아간다.
 *  1×로 되돌리지 않는 것이 요점이다: 3배속으로 보던 사람이 잠깐 멈췄다 풀 때마다 속도를
 *  다시 골라야 하면, 토글이 아니라 "정지 + 배속 초기화" 두 조작이 된다.
 *  `lastRun`을 인자로 받는 것은 기억의 소유가 화면 상태이기 때문이다(이 함수는 순수하다). */
export const toggledSpeed = (cur: SimSpeed, lastRun: SimSpeed): SimSpeed => (cur === 0 ? lastRun : 0)

/** ESC 한 번이 닫는 겹 — 없으면 `null`(아무 일도 안 한다). */
export type EscTarget = 'modal' | 'inspect' | 'tool' | null

/**
 * 지금 ESC가 겨누는 것 — **위가 이긴다**(statusLineText 체인과 같은 관례).
 *
 * 순서의 근거는 화면을 덮은 순서다: 모달이 떠 있는데 뒤의 도구를 놓으면 아무 일도 안 일어난
 * 것처럼 보이고(모달이 그대로다), 카드가 떠 있는데 도구를 놓으면 그 다음 ESC가 할 일이
 * 바뀐다. 한 번에 한 겹씩 벗겨야 ESC가 예측 가능한 손잡이가 된다.
 *
 * ⚠️ **결산 오버레이(DAY_END·WEEK_END)는 입력에 없다** — 닫으면 다음 행동([다음 날] 버튼)이
 * 화면에서 통째로 사라져 판이 멈춘 것처럼 보인다. 넣지 않은 것이 곧 계약이다.
 */
export function escTarget(s: { modalOpen: boolean; inspectOpen: boolean; tool: BuildTool | null }): EscTarget {
  if (s.modalOpen) return 'modal'
  if (s.inspectOpen) return 'inspect'
  if (s.tool !== null) return 'tool'
  return null
}

/**
 * 지금 **영역 오버레이**(과 색 틴트 + 방 이름표)를 그리는가 — 안 그리는 것이 기본이다.
 *
 * 이 판정이 생긴 이유는 그 오버레이가 늘 켜져 있었기 때문이다. 부지를 채워 갈수록 색 블록과
 * 이름표가 서로 겹쳐(방이 좁으면 이름이 옆방까지 넘친다) 정작 봐야 할 사람·가구·벽이 그 밑에
 * 묻혔다 — 주석이 지도를 덮은 꼴이다. 영역은 **물어볼 때만** 답하는 층이어야 한다.
 *
 * ⚠️ **용도 도구를 들면 토글과 무관하게 켜진다.** 안 그러면 어디가 이미 지정됐는지 안 보이는
 * 채로 지정해야 해서, 이 변경이 건설 흐름을 통째로 망가뜨린다(꺼진 기본값이 곧 함정이 된다).
 * 도구를 놓을 때 토글을 되돌리지 않는 것도 계약이다 — 도구는 잠깐 빌려 쓸 뿐 소유하지 않는다.
 */
export const regionOverlayOn = (s: { toggled: boolean; tool: BuildTool | null }): boolean =>
  s.toggled || s.tool === 'DESIGNATE'

/** 시계를 세운 것이 무엇인가 — 없으면 안 멈춰 있다. */
export type PauseCause = 'BUILD' | 'HIRE' | 'PRIORITY' | 'EVENT' | null

/** 정지 사유별 문구 — 넷을 한 문구로 접으면 "왜 멈췄나"가 사라진다(`Record`라 갈래가 늘면 tsc가 막는다). */
const PAUSE_TEXT: Record<NonNullable<PauseCause>, string> = {
  BUILD: '건설 중 — 일시정지',
  HIRE: '채용 중 — 일시정지',
  PRIORITY: '인사 중 — 일시정지',
  EVENT: '속보 — 일시정지',
}

export interface StatusLineInput {
  /** 지금 떠 있는 토스트 문구 — 방금 일어난 일이라 무엇보다 먼저다. */
  toast: string | null
  pause: PauseCause
  /** 플레이어가 **스스로** 멈춰 둔 상태인가(배속 0 + 운영 중). */
  idle: boolean
  /** `setupWarningText`의 결과 — 이 배치에서 아무 일도 안 일어나는 이유. */
  warning: string | null
  tool: BuildTool | null
  /** 용도 도구가 지정할 방 종류 — 다른 도구에서는 뜻이 없다. */
  roomType: RoomType | null
  dept: SimDeptKey | null
}

/** 도구별 조작 안내 — 드래그인지 클릭인지가 첫 문장이다(조작을 모르면 도구가 없는 것과 같다). */
const TOOL_HINT: Record<BuildTool, string> = {
  WALL: '벽 — 부지를 드래그하면 사각형 테두리로 벽이 섭니다(한 줄이면 직선 벽).',
  DOOR: '문 — 벽 한 칸을 클릭해 문을 냅니다. 문이 없으면 아무도 드나들지 못합니다.',
  DESK: '책상 — 드래그한 사각형을 채웁니다. 진료실엔 책상 옆에 의자가 필요합니다.',
  CHAIR: '의자 — 드래그한 사각형을 채웁니다. 대기실 의자가 곧 좌석 수입니다.',
  BED: '침대 — 드래그한 사각형을 채웁니다. 응급은 병동 침대에 눕습니다.',
  COUNTER: '카운터 — 드래그한 사각형을 채웁니다. 접수처의 표시물입니다.',
  DESIGNATE: '용도 — 벽으로 둘러싸인 실내를 클릭해 무슨 방인지 정합니다.',
  DEMOLISH: '철거 — 드래그한 사각형의 벽·문·가구를 없애고 절반을 돌려받습니다.',
}

/**
 * footer 상태줄 한 줄 — **위가 이기는 우선순위 체인**.
 *
 * 이 줄이 헤더가 아니라 footer에 있는 것이 이 함수의 존재 이유다. 한때 정지 사유가 헤더에
 * 끼어들었는데, 드래그를 시작하는 **그 순간** 문구가 생겨 헤더가 한 줄 늘고 맵이 32px 내려가
 * 드래그 좌표가 두 타일 어긋났다(합성 포인터 실측: 7×6을 그렸는데 7×4가 지어졌다). 맵 아래의
 * 높이 고정 줄(min-h-5)로 옮기면 문구가 어떻게 바뀌어도 맵이 안 움직인다.
 *
 * 체인 순서의 근거: ① 토스트(방금 일어난 일) ② 정지 사유(지금 화면이 안 도는 이유) ③ 스스로
 * 멈춤(그 상태에서 할 일 = 개원) ④ 배치 경고(시계는 도는데 아무 일이 없는 이유) ⑤ 선택 안내.
 * ②가 ③보다 위인 이유는 건설 중에 "1×를 누르세요"가 뜨면 지금 할 일이 뒤집히기 때문이고,
 * ③이 ④보다 위인 이유는 멈춰 있으면 무엇을 지어도 아무 일이 안 일어나기 때문이다.
 */
export function statusLineText(s: StatusLineInput): string {
  if (s.toast) return s.toast
  if (s.pause) return PAUSE_TEXT[s.pause]
  if (s.idle) return '일시정지 — 방을 짓고 의사를 뽑은 뒤 1×를 눌러 개원하세요'
  if (s.warning) return s.warning
  const blocked = buildBlockReason(s.tool, s.roomType, s.dept)
  if (blocked) return blocked
  if (s.tool === null) {
    return '벽으로 공간을 두르고 → 문을 내고 → 용도를 지정하고 → 가구를 놓으세요. 진료실엔 책상+의자, 대기실엔 의자가 필요합니다.'
  }
  // 용도는 무슨 방인지까지 정해져야 뜻이 선다 — 그 이름을 문장에 실어 클릭 전에 확인시킨다.
  if (s.tool === 'DESIGNATE' && s.roomType) {
    return `${roomLabel({ type: s.roomType, dept: s.dept ?? undefined })}로 지정합니다 — 둘러싸인 실내를 클릭하세요.`
  }
  return TOOL_HINT[s.tool]
}
