// 화면이 쓰는 **순수 파생**들 — 라벨·사유 문구·피로 단계·인원 집계. React를 모른다.
//
// 왜 컴포넌트 밖인가: 이 저장소의 테스트는 DOM 없이 돈다(jsdom·testing-library 미설치).
// 판정이 JSX 안에 있으면 **아무 테스트도 그 판정을 겨눌 수 없다** — 피로 경계가 34에서 44로
// 밀려도, 회차 사유가 전부 같은 문구로 접혀도 green이다. 그래서 "무엇을 보여줄지"를 정하는
// 조각만 여기로 내리고, 컴포넌트는 그 결과를 놓기만 한다(useSimClock의 minutesToTick과 같은 분리).
//
// ⚠️ 상대 경로 임포트 — 이 파일은 vitest(별칭 미설정)로도 돌기 때문에 `@/`를 쓸 수 없다.
import { FATIGUE_RED, FATIGUE_SLOW_FROM } from '../game/doctor'
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from '../sim/dept'
import { emergencySpec, type EmergencyTurnAway, type TurnAwayReason } from '../sim/emergency'
import type { Pawn } from '../sim/pawn'
import type { RoomType } from '../sim/world'

export const ROOM_LABEL: Record<RoomType, string> = {
  EXAM: '진료실',
  WARD: '병동',
  WAITING: '대기실',
  LOUNGE: '휴게실',
  RECEPTION: '접수처',
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
