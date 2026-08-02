import { describe, it, expect } from 'vitest'
import { EVENT_KINDS, type SimEventKind } from './events'
import { TRAITS, type TraitKey } from './traits'
import type { EndingKind } from './world'
import {
  EVENT_NARRATIONS, chillNotice, epilogueText, eventNarration, resignationLetter, settlementNotice,
} from './narrative'

/** ⚠️ 이 파일은 **문장 카탈로그의 계약**을 잰다: 전 종류에 폴백이 있는가 · 같은 (주,일)이면
 *  같은 문장인가 · 보간값 뒤에 조사가 없는가(T-094) · 엔딩 셋이 실제로 다른 말을 하는가.
 *  문구 자체(원고)는 재는 대상이 아니다 — 재면 문장을 다듬을 때마다 테스트가 깨지고,
 *  그러면 사람이 테스트를 문구에 맞춰 고치는 습관이 든다. */

const ENDINGS: readonly EndingKind[] = ['INSOLVENCY', 'NO_PEOPLE', 'CAMPAIGN_END']

/** 톤 가드레일 ① — **플레이어**를 탓하는 말(§톤 · simHud.test와 같은 목록). */
const BANNED = ['당신', '놓쳤', '실패', '했어야', '탓', '죽었']

/**
 * 톤 가드레일 ② — **온 사람**을 탓하는 말. A3(경증 쏠림)과 함께 생긴 축이다.
 *
 * ①과 겨누는 방향이 반대라 목록을 나눈다: 저쪽은 화면이 플레이어에게 하는 말이고, 이쪽은
 * 화면이 **환자에 대해** 하는 말이다. 경증 쏠림 서사가 특히 미끄러지기 쉽다 — "가벼운 증상이
 * 몰린다"를 쓰다 보면 한 걸음이 곧 "그 사람들이 잘못 왔다"라서, 구조의 문제(경증이 갈 곳이
 * 여기뿐이다)가 개인의 잘못으로 바뀐다. 아래 넷은 그 미끄러짐이 실제로 착지하는 표현들이다:
 * 증상을 의심하는 말(꾀병)·사람됨을 재는 말(몰상식·얌체)·존재를 민폐로 부르는 말(민폐).
 *
 * 이 축은 `narrative.ts`의 MILD_SURGE 주석에 선언돼 있었지만 **검사기가 없었다** — 이 저장소가
 * 세 번 적은 그 형태다(*검사기 없는 규약은 죽는 게 아니라 썩고, 썩음은 준수율로 안 잡힌다*).
 * 새 연출문을 쓰는 사람이 이 주석을 못 봐도 여기서 걸린다.
 */
const BANNED_ABOUT_PATIENTS = ['꾀병', '몰상식', '민폐', '얌체']

describe('eventNarration — 이벤트 연출문 폴백(LLM 없이 완주한다)', () => {
  it('전 종류에 폴백이 **둘 이상** 있다 — 하나뿐이면 그 이벤트는 판 내내 같은 말을 한다', () => {
    for (const kind of EVENT_KINDS) {
      expect(EVENT_NARRATIONS[kind].length, `${kind}에 폴백이 모자란다`).toBeGreaterThanOrEqual(2)
      for (const line of EVENT_NARRATIONS[kind]) expect(line.length).toBeGreaterThan(0)
    }
  })

  it('같은 (종류, 주, 일)이면 **항상 같은 문장**이다 — 시드를 소비하지 않는 결정론', () => {
    for (const kind of EVENT_KINDS) {
      expect(eventNarration(kind, 3, 5)).toBe(eventNarration(kind, 3, 5))
    }
  })

  it('**주차가 선택에 참여한다** — 같은 요일이 판 내내 같은 속보를 내보내면 안 된다', () => {
    // 돌연변이 ①(주차 무시 = `day % n`)이 여기서 죽는다: 주만 흔들었는데 문장이 하나면
    // 12주 동안 화요일마다 똑같은 속보가 뜬다(에러 0 · 화면에서만 티가 난다).
    for (const kind of EVENT_KINDS) {
      const seen = new Set([1, 2, 3, 4].map(week => eventNarration(kind, week, 1)))
      expect(seen.size, `${kind}: 주차가 문장을 안 바꾼다`).toBeGreaterThan(1)
    }
  })

  it('요일도 선택에 참여한다 — 한 주 안에서도 말이 바뀐다', () => {
    for (const kind of EVENT_KINDS) {
      const seen = new Set([1, 2, 3, 4].map(day => eventNarration(kind, 2, day)))
      expect(seen.size, `${kind}: 요일이 문장을 안 바꾼다`).toBeGreaterThan(1)
    }
  })

  it('돌려주는 문장은 반드시 그 종류의 카탈로그 안에 있다 — 치역 밖 인덱스가 undefined로 새지 않는다', () => {
    for (const kind of EVENT_KINDS) {
      for (let week = 1; week <= 12; week++) {
        for (let day = 1; day <= 7; day++) {
          expect(EVENT_NARRATIONS[kind]).toContain(eventNarration(kind, week, day))
        }
      }
    }
  })

  it('종류가 다르면 문장도 다르다 — 카탈로그가 한 종류만 채워져 있으면 속보가 거짓말을 한다', () => {
    const sameDay = EVENT_KINDS.map(kind => eventNarration(kind, 2, 3))
    expect(new Set(sameDay).size).toBe(EVENT_KINDS.length)
  })

  it('톤 가드레일 — 어떤 연출문에도 비난 카피가 없다(플레이어에게도, 온 사람에게도)', () => {
    for (const kind of EVENT_KINDS) {
      for (const line of EVENT_NARRATIONS[kind]) {
        for (const word of [...BANNED, ...BANNED_ABOUT_PATIENTS]) {
          expect(line, `${kind}: ${line}`).not.toContain(word)
        }
      }
    }
  })
})

/** T-094 기계 검사 — 보간값 **바로 뒤**에 오는 글자가 받침에 따라 갈리는 조사이면 안 된다.
 *  (은/는 · 이/가 · 을/를 · 로/으로 · 와/과 · 아/야) */
const BATCHIM_PARTICLES = ['은', '는', '이', '가', '을', '를', '로', '와', '과', '아', '야']

/** 출력 안에서 보간값을 찾고, 그 **직후 한 글자**가 조사인지 본다. */
function particleAfter(text: string, value: string): string | null {
  const at = text.indexOf(value)
  if (at < 0) return null
  const next = text.slice(at + value.length, at + value.length + 1)
  return BATCHIM_PARTICLES.includes(next) ? next : null
}

describe('resignationLetter — 사직 편지(이름·과·특성·포화 일수)', () => {
  const TRAITS_2: readonly [TraitKey, TraitKey] = ['WORKAHOLIC', 'FAMILY_FIRST']
  const fields = {
    name: '김서준', deptLabel: '내과', saturatedDays: 4, traits: TRAITS_2,
  }
  const whole = (f: Parameters<typeof resignationLetter>[0]) => {
    const l = resignationLetter(f)
    return `${l.head} ${l.body}`
  }

  it('이름 · 과 · 포화 일수가 전부 들어간다 — 셋 중 하나라도 없으면 "누가 왜 떠났나"가 안 읽힌다', () => {
    const text = whole(fields)
    expect(text).toContain('김서준')
    expect(text).toContain('내과')
    expect(text).toContain('4')
  })

  it('포화 일수는 인자에서 온다 — 문장에 숫자를 박으면 임계를 튜닝해도 편지가 안 따라온다', () => {
    expect(whole({ ...fields, saturatedDays: 7 })).toContain('7')
  })

  it('특성 두 개의 라벨과 첫 사연이 들어간다 — 특성은 이 편지의 재료라서 있다(수치 효과가 없다)', () => {
    const text = whole(fields)
    expect(text).toContain(TRAITS.WORKAHOLIC.label)
    expect(text).toContain(TRAITS.FAMILY_FIRST.label)
    expect(text).toContain(TRAITS.WORKAHOLIC.story)
  })

  it('특성이 없는 폰(손세계·옛 세계)도 편지가 선다 — 한 줄이 짧아질 뿐이다', () => {
    const text = whole({ ...fields, traits: undefined })
    expect(text).toContain('김서준')
    expect(text).toContain('4')
    expect(text).not.toContain('undefined')
  })

  it('⚠️ T-094 — 보간값 **바로 뒤**에 받침 의존 조사가 없다(기계 검사)', () => {
    for (const name of ['김서준', '박지우']) {
      for (const deptLabel of ['내과', '순환기내과', '정형외과학']) {
        const text = whole({ ...fields, name, deptLabel })
        expect(particleAfter(text, name), `이름 뒤 조사: ${text}`).toBeNull()
        expect(particleAfter(text, deptLabel), `과 뒤 조사: ${text}`).toBeNull()
        expect(particleAfter(text, TRAITS.FAMILY_FIRST.label), `특성 뒤 조사: ${text}`).toBeNull()
      }
    }
  })

  it('⚠️ T-094 — 받침이 있는 값으로 바꿔도 **문장이 그대로**다(값을 도로 끼워 넣으면 바이트 동일)', () => {
    // 이게 조사 함정의 본질이다: 문장이 데이터의 받침에 의존하면 이름 하나 바뀔 때 문장이 깨진다.
    // 받침 없는 이름(박지우)과 있는 이름(김서준)의 출력이 **이름 자리만** 다르면 그 의존이 없다.
    const withBatchim = whole({ ...fields, name: '김서준', deptLabel: '정형외과학' })
    const without = whole({ ...fields, name: '박지우', deptLabel: '내과' })
    expect(withBatchim.replace('김서준', 'N').replace('정형외과학', 'D'))
      .toBe(without.replace('박지우', 'N').replace('내과', 'D'))
  })

  it('톤 가드레일 — 편지에도 비난 카피가 없다(구조의 결과이지 관리의 실수가 아니다)', () => {
    const text = whole(fields)
    for (const word of BANNED) expect(text).not.toContain(word)
  })
})

describe('chillNotice — 위축 고지(소송이 사람의 손을 끌어내린다)', () => {
  it('이름이 들어가고 문장이 선다', () => {
    const text = chillNotice('김서준')
    expect(text).toContain('김서준')
    expect(text.length).toBeGreaterThan('김서준'.length)
    expect(text).not.toContain('undefined')
  })

  it('⚠️ T-094 — 보간값 **바로 뒤**에 받침 의존 조사가 없다(기계 검사)', () => {
    for (const name of ['김서준', '박지우']) {
      expect(particleAfter(chillNotice(name), name), chillNotice(name)).toBeNull()
    }
  })

  it('⚠️ T-094 — 받침이 있는 이름으로 바꿔도 **문장 뼈대가 그대로**다(바이트 동일)', () => {
    expect(chillNotice('김서준').replace('김서준', 'N')).toBe(chillNotice('박지우').replace('박지우', 'N'))
  })

  it('톤 가드레일 — 사실만 말한다(비난도 평가도 없다)', () => {
    const text = chillNotice('김서준')
    // 공용 목록 + 위축 전용 어휘: 물러선 것이 **구조의 결과**이지 그 사람의 성격이 아니다.
    for (const word of [...BANNED, '겁', '회피', '몸을 사']) expect(text, text).not.toContain(word)
  })
})

describe('settlementNotice — 합의금 고지(얼마가 나갔는가)', () => {
  it('액수가 들어가고, **이미 나갔다는 사실**까지 말한다', () => {
    // 12주 실플레이 관측: 합의금이 이벤트 발생 즉시 금고에서 빠지는데 액수가 어느 화면에도
    // 없었다. 액수만 말하고 시점을 빼면 이번엔 "주말에 또 빠지나"가 남는다 — 결산표가 이 돈을
    // 총액에 안 넣는 이유(WeekSummary.lawsuitManwon)와 같은 사실을 카드도 말해야 한다.
    const text = settlementNotice('400만원')
    expect(text).toContain('400만원')
    expect(text).toContain('이미')
    expect(text).not.toContain('undefined')
  })

  it('⚠️ T-094 — 보간값 **바로 뒤**에 받침 의존 조사가 없다(기계 검사)', () => {
    // 「400만원이」는 지금 우연히 맞다(받침 ㄴ). 그런데 액수 표기는 화면 층이 소유하고
    // (simHud.formatManwon) 1억을 넘으면 「1.2억」으로 접힌다 — 표기 정책이 바뀌는 날 조사가
    // 조용히 틀린다. 값 뒤는 고정 문자만 온다.
    for (const cost of ['400만원', '1,600만원', '1.2억']) {
      expect(particleAfter(settlementNotice(cost), cost), settlementNotice(cost)).toBeNull()
    }
  })

  it('⚠️ T-094 — 액수를 바꿔도 **문장 뼈대가 그대로**다(바이트 동일)', () => {
    expect(settlementNotice('400만원').replace('400만원', 'N'))
      .toBe(settlementNotice('1.2억').replace('1.2억', 'N'))
  })

  it('톤 가드레일 — 사실만 말한다(비난도 평가도 없다)', () => {
    const text = settlementNotice('400만원')
    for (const word of BANNED) expect(text, text).not.toContain(word)
  })
})

describe('epilogueText — 엔딩 3종의 결말문', () => {
  const stats = {
    week: 9, leftCount: 42, resignedNames: ['김서준', '이도현'], treasuryText: '−1.2억',
  }

  it('엔딩마다 **다른 문장**이다 — 셋이 같으면 왜 끝났는지가 화면에서 사라진다', () => {
    // 돌연변이 ②(엔딩 분기 하나 접기)가 여기서 죽는다.
    const texts = ENDINGS.map(e => epilogueText(e, stats))
    expect(new Set(texts).size).toBe(ENDINGS.length)
  })

  it('셋 다 마지막 주 지표와 금고를 싣는다 — 주차 · 그 주 이탈 합 · 마지막 금고', () => {
    for (const ending of ENDINGS) {
      const text = epilogueText(ending, stats)
      expect(text, ending).toContain('9')
      expect(text, ending).toContain('42')
      expect(text, ending).toContain('−1.2억')
    }
  })

  it('사직 명단이 있으면 이름이 전부 실린다 — 떠난 사람이 숫자로만 남지 않게', () => {
    for (const ending of ENDINGS) {
      const text = epilogueText(ending, stats)
      for (const name of stats.resignedNames) expect(text, ending).toContain(name)
    }
  })

  it('사직자가 없으면 그 줄 자체가 없다 — 빈 명단에 「떠난 사람:」만 뜨면 거짓 신호다', () => {
    const text = epilogueText('CAMPAIGN_END', { ...stats, resignedNames: [] })
    expect(text).not.toContain('떠난 사람')
    expect(text).toContain('9')
  })

  it('금액은 **받은 문자열 그대로** 쓴다 — 접는 정책(억/만원)은 화면 층 한 함수가 소유한다', () => {
    expect(epilogueText('INSOLVENCY', { ...stats, treasuryText: '+7,700만원' })).toContain('+7,700만원')
  })

  it('⚠️ T-094 — 보간값 뒤에 받침 의존 조사가 없다', () => {
    for (const ending of ENDINGS) {
      for (const treasuryText of ['−1.2억', '+7,700만원']) {
        const text = epilogueText(ending, { ...stats, treasuryText })
        expect(particleAfter(text, treasuryText), text).toBeNull()
        expect(particleAfter(text, '김서준'), text).toBeNull()
        expect(particleAfter(text, '이도현'), text).toBeNull()
      }
    }
  })

  it('톤 가드레일 — 결말문에도 비난 카피가 없다', () => {
    for (const ending of ENDINGS) {
      for (const word of BANNED) expect(epilogueText(ending, stats)).not.toContain(word)
    }
  })
})

describe('카탈로그 전수 — 종류가 늘면 여기서 막힌다', () => {
  it('EVENT_NARRATIONS가 SimEventKind를 **전부** 덮는다', () => {
    // `Record<SimEventKind, …>`라 tsc가 먼저 막지만, 빈 배열로 채우는 우회는 tsc가 못 잡는다.
    const keys = Object.keys(EVENT_NARRATIONS) as SimEventKind[]
    expect([...keys].sort()).toEqual([...EVENT_KINDS].sort())
  })
})
