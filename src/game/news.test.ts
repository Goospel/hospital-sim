import { describe, it, expect } from 'vitest'
import { morningNews, renderNews, FORBIDDEN_REAL_EVENT_TOKENS, type TurnedAway } from './news'
import type { CallKind } from './types'

// 어제 돌려보낸 응급 한 건 — 기사 하나의 씨앗.
const one: TurnedAway[] = [{ callId: 'd1c5', kind: 'STEMI', reason: 'NO_BED' }]
const two: TurnedAway[] = [
  { callId: 'd1c4', kind: 'STEMI', reason: 'NO_NIGHT_BACKUP' },
  { callId: 'd1c5', kind: 'STEMI', reason: 'NO_BED' },
]

/**
 * 🔴 윤리 가드 — 이 describe가 이 파일에서 가장 중요하다.
 *
 * 대구 추락 10대(2023-03)·용인 70대(2023-05)·보은 33개월(2024-03)·부산 고교생(2025-10)은
 * **유족이 있는 실제 사건**이다. 허구 헤드라인이 이들을 연상시키면 2차 가해다.
 * 규칙: 지역·연도·환자 프로필 중 **최소 두 개**를 실제와 어긋나게. 실명·실제 병원명 금지.
 */
describe('🔴 윤리 가드 — 실제 사건과 겹치면 2차 가해', () => {
  it('실제 사건의 지역·프로필 토큰이 어떤 기사에도 등장하지 않는다 — 4종 응급 전부', () => {
    // 7일 × 모든 사유 × 4종 응급 조합을 훑어 뱅크 전체를 노출시킨다 — 한 번이라도 새면 red.
    // 다양화로 산부(산모)·뇌출혈·중증외상 프로필이 새로 생겼으니 이 스윕이 그 전부를 검사한다.
    const KINDS: CallKind[] = ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY']
    const all: string[] = []
    for (let day = 2; day <= 7; day++) {
      for (const reason of ['NO_BED', 'NO_NIGHT_BACKUP', 'NO_BACKUP_CARE', 'ER_OVERCROWDED'] as const) {
        for (const kind of KINDS) {
          for (let i = 1; i <= 5; i++) {
            all.push(...morningNews(day, [{ callId: `d${day - 1}c${i}`, kind, reason }]).map((n) => n.headline))
          }
        }
      }
    }
    expect(all.length).toBeGreaterThan(0)
    for (const token of FORBIDDEN_REAL_EVENT_TOKENS) {
      for (const headline of all) {
        expect(headline).not.toContain(token)
      }
    }
  })

  it('"죽었다"를 쓰지 않는다 — 기사체는 "숨지다"다', () => {
    for (let day = 2; day <= 7; day++) {
      for (const n of morningNews(day, two)) {
        expect(n.headline).not.toContain('죽')
      }
    }
  })

  it('환자는 이름 없이 나이대·속성으로만 지칭된다 — 익명이 오히려 더 사실적이다', () => {
    const n = morningNews(2, one)[0]
    expect(n.headline).toMatch(/\d+대/)
  })
})

describe('헤드라인 문법 — 실제 보도 38건에서 뽑은 규칙', () => {
  it("'뺑뺑이'는 작은따옴표 안에 있다 — 빠지면 기사가 아니라 게임 텍스트로 읽힌다", () => {
    expect(morningNews(2, one)[0].headline).toContain("'뺑뺑이'")
  })

  it('말줄임표는 세 점 문자 하나(U+2026) — 마침표 3개면 한국 기사처럼 안 보인다', () => {
    const h = morningNews(2, one)[0].headline
    expect(h).toContain('…')
    expect(h).not.toContain('...')
  })

  it('거부 병원 수는 8~15곳 — 숫자가 충격의 단위다', () => {
    for (let day = 2; day <= 7; day++) {
      for (let i = 1; i <= 5; i++) {
        const n = morningNews(day, [{ callId: `d${day - 1}c${i}`, reason: 'NO_BED' }])[0]
        expect(n.rejectionCount).toBeGreaterThanOrEqual(8)
        expect(n.rejectionCount).toBeLessThanOrEqual(15)
        expect(n.headline).toContain(String(n.rejectionCount))
      }
    }
  })

  it('지연은 1시간 20분~5시간 범위', () => {
    for (let i = 1; i <= 5; i++) {
      const n = morningNews(2, [{ callId: `d1c${i}`, reason: 'NO_BED' }])[0]
      expect(n.delayMinutes).toBeGreaterThanOrEqual(80)
      expect(n.delayMinutes).toBeLessThanOrEqual(300)
    }
  })
})

describe('“또” — 개별 사건이 아니라 패턴의 n번째', () => {
  it('첫 기사엔 "또"가 없다', () => {
    expect(morningNews(2, one)[0].headline.startsWith('또')).toBe(false)
  })

  it('2회차부터 "또"가 붙는다 — 반복 표지', () => {
    const second = morningNews(2, two)[1]
    expect(second.headline).toContain('또')
  })
})

/**
 * 🔴 신문이 거짓말을 하면 안 된다 — 대사 거짓말(T-042 계열)과 같은 함정.
 * 자리가 있는데 내가 그냥 거절한 걸 "병상 부족"이라고 쓰면, 플레이어는 자기가 한 일을 안다.
 * 사유 없는 거절은 **사유 없음**으로 적는다. 그게 더 조용하고 더 정확하다.
 */
describe('🔴 신문은 거짓말하지 않는다', () => {
  it('내가 거절한 건(reason=null) "병상 부족"이 아니라 "수용 거부"다', () => {
    const mine = morningNews(2, [{ callId: 'd1c5', reason: null }])[0]
    expect(mine.outlet).not.toContain('병상 부족')
    expect(mine.outlet).toContain('수용 거부')
  })

  it('구조가 막은 건 그 벽의 이름이 그대로 적힌다', () => {
    expect(morningNews(2, [{ callId: 'd1c5', reason: 'NO_BED' }])[0].outlet).toContain('병상 부족')
    expect(morningNews(2, [{ callId: 'd1c5', reason: 'NO_NIGHT_BACKUP' }])[0].outlet).toContain('야간 당직 공백')
  })
})

describe('기사마다 다른 사건이어야 한다 — 해시 엔트로피', () => {
  /**
   * 콜 id는 `d1c2`·`d1c5`처럼 **한 글자만 다르다**. 시드를 거칠게 쓰면(예: `>>3`) 그 차이가
   * 나눗셈에 먹혀 사라지고, 같은 날 두 사람이 **정확히 같은 시간** 만에 숨지는 기사가 나온다.
   * 브라우저에서 실제로 그렇게 나왔다("2시간 50분 만에"가 두 기사 모두).
   */
  it('같은 날 인접한 콜들이 서로 다른 지연 시간을 갖는다', () => {
    const delays = [1, 2, 3, 4, 5].map(
      (i) => morningNews(2, [{ callId: `d1c${i}`, reason: 'NO_BED' }])[0].delayMinutes,
    )
    expect(new Set(delays).size).toBeGreaterThan(3) // 5개 중 4개 이상은 달라야 한다
  })

  it('같은 날 인접한 콜들이 서로 다른 거부 병원 수를 갖는다', () => {
    const counts = [1, 2, 3, 4, 5].map(
      (i) => morningNews(2, [{ callId: `d1c${i}`, reason: 'NO_BED' }])[0].rejectionCount,
    )
    expect(new Set(counts).size).toBeGreaterThan(3)
  })
})

describe('무엇이 기사가 되는가', () => {
  it('돌려보낸 사람이 없으면 신문도 없다', () => {
    expect(morningNews(2, [])).toEqual([])
  })

  it('1일차 아침엔 어제가 없다 — 신문도 없다', () => {
    expect(morningNews(1, one)).toEqual([])
  })

  it('결정론 — 같은 입력은 항상 같은 기사(RNG 0)', () => {
    expect(morningNews(3, two)).toEqual(morningNews(3, two))
  })

  /**
   * 사유는 **헤드라인이 아니라 부제**에 붙는다 — 실제 보도가 그렇다.
   * 표본 헤드라인("병원 15곳서 거부…5시간 뺑뺑이 끝에 환자 사망")엔 사유가 없다.
   * 헤드라인은 무주체·무사유고 숫자만 말한다. 왜 못 받았는지는 플레이어가 이미 어제 들었다
   * ("순환기 당직이 오늘 밤은 없습니다") — 신문은 그 **결과**를 가져온다.
   */
  it('사유는 헤드라인이 아니라 부제에 붙는다 — 벽의 종류가 다르면 부제가 다르다', () => {
    const bed = morningNews(2, [{ callId: 'd1c5', reason: 'NO_BED' }])[0]
    const night = morningNews(2, [{ callId: 'd1c5', reason: 'NO_NIGHT_BACKUP' }])[0]
    expect(bed.headline).toBe(night.headline) // 헤드라인은 무주체·무사유라 같다
    expect(bed.outlet).not.toBe(night.outlet)
    expect(night.outlet).toContain('야간 당직 공백')
    expect(bed.outlet).toContain('병상 부족')
  })

  /**
   * 무주체 프레임 — 실제 보도 38건 분석 결과 발생 기사는 거의 100%가 병원명·의사명·환자명이 없다.
   * 뉴스가 "당신 탓"이라고 말할 필요가 없다. 숫자(N곳, T시간)가 스스로 말한다.
   * 이건 우연히도 이 게임의 show-don't-tell 원칙과 정확히 같다.
   */
  it('무주체 — 플레이어 병원을 지목하지 않는다', () => {
    for (const n of morningNews(2, two)) {
      expect(n.headline).not.toContain('당신')
      expect(n.headline).not.toContain('양심병원')
    }
  })
})

/**
 * 주간 누적 아카이브(결말 신문) — renderNews.
 *
 * 플레이 중 신문은 "어제→오늘 아침"으로만 왔다(morningNews, day<=1이면 빈 배열). 그래서 7일차에
 * 돌려보낸 사람들은 다음 아침이 없어 증발했다. 결말의 누적 아카이브가 그 구멍을 메운다 —
 * morningNews와 **같은 코어**(renderNews)를 써서 플레이 중 본 기사와 글자까지 동일하게(재인식).
 */
describe('주간 누적 아카이브(결말 신문) — renderNews', () => {
  it('돌려보낸 사람이 없으면 아카이브도 비어 있다', () => {
    expect(renderNews([])).toEqual([])
  })

  it('날짜 게이트 없이 넘긴 사람 전부를 기사로 만든다 — 7일차도 포함', () => {
    const week: TurnedAway[] = [
      { callId: 'd7c1', reason: 'NO_BACKUP_CARE' },
      { callId: 'd7c3', reason: null },
    ]
    expect(renderNews(week)).toHaveLength(2)
  })

  it('플레이 중 본 기사와 글자까지 동일 — morningNews와 같은 코어(재인식)', () => {
    const t: TurnedAway[] = [{ callId: 'd2c4', reason: 'NO_BED' }]
    expect(renderNews(t)[0].headline).toBe(morningNews(3, t)[0].headline)
  })

  it('결정론 — 같은 입력은 항상 같은 기사', () => {
    const week: TurnedAway[] = [
      { callId: 'd3c2', reason: 'NO_BED' },
      { callId: 'd7c5', reason: null },
    ]
    expect(renderNews(week)).toEqual(renderNews(week))
  })

  it('🔴 윤리 가드 — 아카이브에도 실제 사건 토큰이 없다', () => {
    const week: TurnedAway[] = [1, 2, 3, 4, 5].map((i) => ({
      callId: `d7c${i}`,
      reason: 'NO_BACKUP_CARE' as const,
    }))
    const headlines = renderNews(week).map((n) => n.headline)
    for (const token of FORBIDDEN_REAL_EVENT_TOKENS) {
      for (const h of headlines) expect(h).not.toContain(token)
    }
  })
})

/**
 * 종류별 헤드라인 — 다양화된 응급이 신문에 드러난다(슬라이스 B).
 *
 * STEMI만 기사가 되던 걸 4종으로 확대했다. 종류가 헤드라인에 실려야 플레이어가 **뭘** 돌려보냈는지
 * 신문에서 재인식한다 — 아니면 네 응급이 전부 "40대 남성 숨져"로 뭉개져 다양화가 신문에서 증발한다.
 * 분만은 산모로 지칭한다 — "40대 남성"이라고 쓰면 사실이 틀린다(이 게임의 핵심 = 메시지 정확도).
 */
describe('종류별 헤드라인 — 다양화된 응급이 신문에 드러난다', () => {
  const seed = (kind: CallKind, reason: TurnedAway['reason'] = 'NO_BACKUP_CARE'): TurnedAway => ({
    callId: 'd1c1',
    kind,
    reason,
  })

  it('응급 종류가 헤드라인에 반영된다 — 심근경색/뇌출혈/중증외상', () => {
    expect(renderNews([seed('STEMI')])[0].headline).toContain('심근경색')
    expect(renderNews([seed('NEURO_EMERGENCY')])[0].headline).toMatch(/뇌출혈|뇌졸중/)
    expect(renderNews([seed('TRAUMA_EMERGENCY')])[0].headline).toMatch(/외상/)
  })

  it('분만 응급은 산모로 지칭한다 — 나이대 남/녀 프로필이 아니다', () => {
    const ob = renderNews([seed('OBSTETRIC_EMERGENCY')])[0].headline
    expect(ob).toContain('산모')
    expect(ob).not.toMatch(/\d+대 (남성|여성)/)
  })

  it('종류가 달라도 무주체·"뺑뺑이"·"숨져" 골격은 유지 — 헤드라인 문법 불변', () => {
    for (const kind of ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY'] as CallKind[]) {
      const h = renderNews([seed(kind, 'NO_BED')])[0].headline
      expect(h).toContain("'뺑뺑이'")
      expect(h).toContain('숨져')
      expect(h).not.toContain('당신')
    }
  })

  it('결정론 — 같은 (종류, 콜 id)는 항상 같은 기사', () => {
    expect(renderNews([seed('TRAUMA_EMERGENCY', null)])).toEqual(renderNews([seed('TRAUMA_EMERGENCY', null)]))
  })
})
