import type { RejectionReason } from './types'

// 다음날 아침 신문 — 어제 돌려보낸 환자가 어떻게 됐는지.
//
// 순수·결정론(RNG 0). 결과는 코드가 정하고, 문장만 여기서 고른다 — 판정=코드 / 대사=문장층 원칙의 연장.
// 씨앗은 콜 id다(같은 날 같은 콜 → 항상 같은 기사).
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ 🔴 윤리 가드 — 헤드라인을 추가하기 전에 반드시 읽는다                        │
// │                                                                             │
// │ 대구 추락 10대(2023-03) · 용인 70대(2023-05) · 보은 33개월(2024-03) ·        │
// │ 부산 고교생(2025-10)은 **유족이 있는 실제 사건**이다. 허구 헤드라인이        │
// │ 이들을 연상시키면 2차 가해다.                                               │
// │                                                                             │
// │  1. 지역·연도·환자 프로필 중 **최소 두 개**를 실제와 어긋나게 고정한다.     │
// │     (이 파일은 지역=가공 + 프로필=40~60대로 **두 축 모두** 어긋나게 둔다)    │
// │  2. **실명·실제 병원명 금지.** 실제 보도조차 병원명을 안 밝힌다 —           │
// │     익명이 오히려 더 사실적이다.                                            │
// │  3. 게임 속 지역명은 **가공**으로 통일한다.                                 │
// │  4. 자극적 죽음 묘사 금지("죽었다" 금지 — 기사체는 "숨지다"), 특정 집단     │
// │     비난 금지 (game-concept.md §6).                                         │
// │                                                                             │
// │ 위반은 news.test.ts의 「🔴 윤리 가드」 describe가 red로 잡는다.             │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// 헤드라인 문법은 실제 보도 38건에서 뽑았다(docs/research/er-rejection-news-coverage.md §1):
//   [지역/환자] '뺑뺑이' + [N]곳 거부 … [T]시간 만에 + [사망 동사]
// - 말줄임표가 절 구분자다: A…B = "이런 일이 있었고 → 그래서 죽었다". **U+2026 한 글자**(`...` 아님).
// - '뺑뺑이'는 거의 항상 작은따옴표 안 — 속어라 언론이 거리를 두는 장치. 빠지면 게임 텍스트로 읽힌다.
// - "죽었다"는 절대 안 쓴다. "숨지다"가 기사체.
// - "또"는 개별 사건이 아니라 **패턴의 n번째**임을 선언한다.
// - 발생 기사는 거의 100% **무주체** — 병원명·의사명·환자명이 없다. 숫자가 스스로 말한다.
//   이건 우연히도 이 게임의 show-don't-tell 원칙과 정확히 같다: 뉴스는 "당신 탓"이라고 말하지 않는다.

/** 어제 돌려보낸 한 사람 — 기사 하나의 씨앗. */
export interface TurnedAway {
  callId: string
  reason: RejectionReason | null
}

export interface NewsItem {
  id: string
  headline: string
  outlet: string
  rejectionCount: number // 거부 병원 수(8~15)
  delayMinutes: number // 지연(80~300분)
}

/**
 * 실제 사건을 연상시키는 토큰 — **어떤 헤드라인에도 등장하면 안 된다.**
 * 테스트가 뱅크 전체를 훑어 이 목록을 검사한다(news.test.ts).
 */
export const FORBIDDEN_REAL_EVENT_TOKENS = [
  // 실제 사건 지역
  '대구', '용인', '보은', '부산',
  // 실제 사건 환자 프로필
  '10대', '70대', '33개월', '고교생', '고등학생',
] as const

/** 가공 지역 — 실재하지 않는 이름으로 통일한다(가드 3). */
const FICTIONAL_REGIONS = ['한내시', '서림시', '금하시', '백천시'] as const

/** 환자 지칭 — 이름 없이 나이대만. 실제 사건 프로필(10대·70대·33개월·고교생)을 피해 40~60대로 둔다(가드 1). */
const PATIENT_PROFILES = ['40대 남성', '50대 여성', '60대 남성', '50대 남성'] as const

const OUTLETS = ['한내일보', '서림신문', '지역언론 종합', '금하매일'] as const

/** 거절 사유별 부제 — 벽의 종류가 다르면 부제가 다르다. 전부 무주체(병원명 없음). */
const REASON_CLAUSE: Record<RejectionReason, string> = {
  NO_BED: '병상 부족',
  NO_ER_ONCALL: '응급실 당직 부재',
  ER_OVERCROWDED: '응급실 과밀',
  NO_BACKUP_CARE: '배후진료 불가',
  NO_NIGHT_BACKUP: '야간 당직 공백',
}

/**
 * 🔴 내가 그냥 거절한 경우(reason=null) — **사유를 지어내지 않는다.**
 *
 * 자리도 당직도 있는데 안 받은 걸 "병상 부족"이라고 쓰면 **신문이 거짓말을 한다.**
 * 플레이어는 자기가 방금 뭘 했는지 안다. 사유 없는 거절은 사유 없음으로 적는 게
 * 더 조용하고 더 정확하다 — 그리고 해석 카피 없이 더 아프다.
 */
const NO_REASON_GIVEN = '수용 거부'

/**
 * 결정론 해시 — 콜 id에서 숫자를 뽑는다. RNG를 쓰지 않는 게 이 게임의 원칙이다.
 *
 * ⚠️ 콜 id는 `d1c2`·`d1c5`처럼 **한 글자만 다르다.** 거칠게 섞으면(초안: `h*31 + code` 뒤 `>>3`)
 * 그 차이가 나눗셈에 먹혀 **같은 날 두 사람이 정확히 같은 시간 만에 숨지는 기사**가 나왔다.
 * 그래서 xorshift로 하위 비트까지 흩는다(FNV 계열 혼합).
 */
function seedOf(callId: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < callId.length; i++) {
    h ^= callId.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  // 최종 혼합 — 인접 입력의 하위 비트 차이를 상위로 퍼뜨린다.
  h ^= h >>> 15
  h = Math.imul(h, 2246822507) >>> 0
  h ^= h >>> 13
  return h >>> 0
}

function pick<T>(pool: readonly T[], seed: number, salt = 0): T {
  return pool[(seed + salt) % pool.length]
}

/** 분 → "N시간 M분 만에" / "N시간 만에" */
function formatDelay(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}시간 만에` : `${h}시간 ${m}분 만에`
}

/**
 * 어제 돌려보낸 사람들 → 오늘 아침 기사.
 *
 * day는 **오늘**이다 — 1일차 아침엔 어제가 없으니 신문도 없다.
 * 순서는 `turnedAway` 그대로다(어제 콜 순서). 2번째부터 "또"가 붙는다 — 패턴의 n번째라는 선언.
 */
export function morningNews(day: number, turnedAway: TurnedAway[]): NewsItem[] {
  if (day <= 1) return []
  return turnedAway.map((t, i) => {
    const seed = seedOf(t.callId)
    // 사유는 지어내지 않는다 — 내가 거절한 건 '수용 거부'다(신문이 거짓말하면 안 된다).
    const clause = t.reason === null ? NO_REASON_GIVEN : REASON_CLAUSE[t.reason]
    const rejectionCount = 8 + (seed % 8) // 8~15곳
    const delayMinutes = 80 + ((seed >>> 8) % 221) // 80~300분 (1시간 20분 ~ 5시간)
    const region = pick(FICTIONAL_REGIONS, seed >>> 20, i)
    const profile = pick(PATIENT_PROFILES, seed >>> 24, i)
    const outlet = pick(OUTLETS, seed >>> 28, i)
    // 무주체 골격: [지역] '뺑뺑이' … [N]곳 거부 … [T] 만에 [프로필] 숨져
    const lead = i === 0 ? '' : '또 '
    const headline =
      `${lead}${region} '뺑뺑이'… 병원 ${rejectionCount}곳 거부, ` +
      `${formatDelay(delayMinutes)} ${profile} 숨져`
    return {
      id: `news-${t.callId}`,
      headline,
      outlet: `${outlet} · ${clause}`,
      rejectionCount,
      delayMinutes,
    }
  })
}
