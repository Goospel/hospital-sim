// 화면이 쓰는 **순수 파생**들 — 라벨·사유 문구·피로 단계·인원 집계. React를 모른다.
//
// 왜 컴포넌트 밖인가: 이 저장소의 테스트는 DOM 없이 돈다(jsdom·testing-library 미설치).
// 판정이 JSX 안에 있으면 **아무 테스트도 그 판정을 겨눌 수 없다** — 피로 경계가 34에서 44로
// 밀려도, 회차 사유가 전부 같은 문구로 접혀도 green이다. 그래서 "무엇을 보여줄지"를 정하는
// 조각만 여기로 내리고, 컴포넌트는 그 결과를 놓기만 한다(useSimClock의 minutesToTick과 같은 분리).
//
// ⚠️ 상대 경로 임포트 — 이 파일은 vitest(별칭 미설정)로도 돌기 때문에 `@/`를 쓸 수 없다.
import { FATIGUE_RED, FATIGUE_SLOW_FROM, RESIGN_SATURATED_DAYS } from '../game/doctor'
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from '../sim/dept'
import { emergencySpec, type EmergencyTurnAway, type TurnAwayReason } from '../sim/emergency'
import { prefersRestOverExam } from '../sim/needs'
import type { Pawn, Priority } from '../sim/pawn'
import type { RoomType } from '../sim/world'

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

/**
 * 이번 주말에 떠나는 사람들의 **과 이름** — 결산 화면의 사직 통지 줄.
 *
 * ⚠️ `doctorDeptOf`를 쓰지 않는다: 그 함수는 과 없는 폰에 **던지고**, 그 예외가 오버레이 렌더
 * 중에 나면 결산 화면이 통째로 죽어 플레이어는 사직 통지가 아니라 흰 화면을 본다. 한 줄을
 * 잃는 것과 화면을 잃는 것 중에서 고른 결과다(과 없는 폰은 채용을 안 거친 손세계 폰뿐이다).
 *
 * 같은 과가 둘이면 **두 줄**이다 — 떠나는 것은 과가 아니라 사람이라, 접으면 몇 명이 나갔는지가
 * 사라진다. 순서는 명단 그대로(코어의 폰 배열 순서)라 화면이 흔들리지 않는다.
 */
export function resigningDeptLabels(leaving: readonly Pawn[]): string[] {
  return leaving.filter(p => !!p.dept).map(p => simDept(p.dept!).label)
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
