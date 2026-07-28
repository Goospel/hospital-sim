import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LLM_TIMEOUT_MS, MAX_LLM_CALLS_PER_RUN, newLlmBudget, requestDirector, requestNarrativeText,
} from './storyteller'
import type { SimEventKind } from '../sim/events'

/**
 * 스토리텔러 클라이언트 — **이 파일이 재는 것은 "언제 폴백으로 내려가는가" 하나다.**
 *
 * 게임의 안전망은 폴백이고(계획 §0-5), 폴백은 이 모듈이 `null`을 돌려줄 때만 선다. 그래서
 * 실패 경로가 하나라도 `null` 대신 값을 흘리면 화면은 LLM이 만든 치역 밖 이벤트를 적용하거나
 * (applyEvent throw = 흰 화면) 빈 문자열을 연출문 자리에 놓는다 — 둘 다 무성이 아니라 파손이다.
 *
 * fetch를 모킹하는 이유: 실호출은 결정론이 아니고(모델 응답이 매번 다르다) 네트워크·키에
 * 의존한다. 여기서 재는 것은 **응답의 모양에 대한 우리 쪽 반응**이라 서버가 필요 없다.
 */

/** 라우트가 돌려주는 봉투(`{ text }`)를 흉내 내는 Response. */
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** 성공 응답 한 건 — director는 텍스트 안에 JSON이 들어 있다(structured output). */
const directorRes = (event: string, narration: string) =>
  jsonRes({ text: JSON.stringify({ event, narration }) })

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

const ELIGIBLE: SimEventKind[] = ['EPIDEMIC', 'NEARBY_CLOSURE']
const STATE = { week: 3, day: 2 }

describe('requestDirector — 성공 경로', () => {
  it('후보 안의 이벤트와 연출문을 파싱한다', async () => {
    stubFetch(async () => directorRes('EPIDEMIC', '보건소가 주의보를 냈습니다.'))
    const reply = await requestDirector(newLlmBudget(), STATE, ELIGIBLE)
    expect(reply).toEqual({ kind: 'EPIDEMIC', narration: '보건소가 주의보를 냈습니다.' })
  })

  it("'NONE'은 실패가 아니라 **조용한 하루**다 — kind만 null이고 응답 자체는 유효하다", async () => {
    stubFetch(async () => directorRes('NONE', '오늘은 특별한 일이 없습니다.'))
    const reply = await requestDirector(newLlmBudget(), STATE, ELIGIBLE)
    expect(reply).toEqual({ kind: null, narration: '오늘은 특별한 일이 없습니다.' })
  })

  it('요청 본문에 task와 state를 싣는다', async () => {
    const spy = stubFetch(async () => directorRes('EPIDEMIC', '문장'))
    await requestDirector(newLlmBudget(), STATE, ELIGIBLE)
    const init = spy.mock.calls[0][1]
    expect(JSON.parse(String(init.body))).toEqual({ task: 'director', state: STATE })
  })
})

describe('requestDirector — 치역 밖 응답은 전부 폴백 강등(null)', () => {
  it('후보 목록에 없는 이벤트를 고르면 null이다 (가드레일: LLM은 코드가 검증한 후보 안에서만 고른다)', async () => {
    stubFetch(async () => directorRes('MASS_CASUALTY', '구급차가 옵니다.'))
    expect(await requestDirector(newLlmBudget(), STATE, ELIGIBLE)).toBeNull()
  })

  it('카탈로그에 아예 없는 이름이면 null이다', async () => {
    stubFetch(async () => directorRes('METEOR_STRIKE', '운석이 떨어졌습니다.'))
    expect(await requestDirector(newLlmBudget(), STATE, ELIGIBLE)).toBeNull()
  })

  it('JSON이 아니면 null이다', async () => {
    stubFetch(async () => jsonRes({ text: '오늘은 전염병입니다' }))
    expect(await requestDirector(newLlmBudget(), STATE, ELIGIBLE)).toBeNull()
  })

  it('필드 타입이 어긋나면 null이다', async () => {
    stubFetch(async () => jsonRes({ text: JSON.stringify({ event: 'EPIDEMIC', narration: 42 }) }))
    expect(await requestDirector(newLlmBudget(), STATE, ELIGIBLE)).toBeNull()
  })

  it('빈 text면 null이다 (거절·차단으로 본문이 비는 경우)', async () => {
    stubFetch(async () => jsonRes({ text: '' }))
    expect(await requestDirector(newLlmBudget(), STATE, ELIGIBLE)).toBeNull()
  })
})

describe('전송 실패는 전부 한 경로(null)로 내려간다', () => {
  it('HTTP 500 → null', async () => {
    stubFetch(async () => jsonRes({ error: 'boom' }, 500))
    expect(await requestDirector(newLlmBudget(), STATE, ELIGIBLE)).toBeNull()
  })

  it('HTTP 404 → null (Pages 정적 배포처럼 라우트가 아예 없는 환경)', async () => {
    stubFetch(async () => new Response('Not Found', { status: 404 }))
    expect(await requestDirector(newLlmBudget(), STATE, ELIGIBLE)).toBeNull()
  })

  it('HTTP 503 NO_KEY → null (키 미등록 배포본은 폴백으로 완주한다)', async () => {
    stubFetch(async () => jsonRes({ error: 'NO_KEY' }, 503))
    expect(await requestNarrativeText(newLlmBudget(), 'letter', STATE)).toBeNull()
  })

  it('네트워크 오류(fetch reject) → null', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    expect(await requestNarrativeText(newLlmBudget(), 'epilogue', STATE)).toBeNull()
  })

  it(`${LLM_TIMEOUT_MS}ms 안에 응답이 없으면 요청을 끊고 null이다`, async () => {
    vi.useFakeTimers()
    // 신호를 받아야만 끝나는 fetch — 타임아웃 배선이 없으면 이 프라미스는 영영 안 끝난다.
    const spy = stubFetch((_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = requestNarrativeText(newLlmBudget(), 'letter', STATE)
    await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS)
    expect(await pending).toBeNull()
    expect(spy.mock.calls[0][1].signal?.aborted).toBe(true)
  })
})

describe('판당 호출 상한 — 한 판이 프록시를 무한히 두드리지 않는다', () => {
  it(`${MAX_LLM_CALLS_PER_RUN}회를 쓰면 그다음부터는 fetch 자체를 부르지 않는다`, async () => {
    const spy = stubFetch(async () => directorRes('EPIDEMIC', '문장'))
    const budget = newLlmBudget()
    for (let i = 0; i < MAX_LLM_CALLS_PER_RUN; i++) {
      expect(await requestDirector(budget, STATE, ELIGIBLE)).not.toBeNull()
    }
    expect(await requestDirector(budget, STATE, ELIGIBLE)).toBeNull()
    expect(spy).toHaveBeenCalledTimes(MAX_LLM_CALLS_PER_RUN)
  })

  it('실패한 호출도 상한을 소모한다 — 죽은 라우트가 판 내내 재시도를 먹지 않게', async () => {
    const spy = stubFetch(async () => jsonRes({ error: 'boom' }, 500))
    const budget = newLlmBudget()
    for (let i = 0; i < MAX_LLM_CALLS_PER_RUN + 3; i++) {
      await requestNarrativeText(budget, 'letter', STATE)
    }
    expect(spy).toHaveBeenCalledTimes(MAX_LLM_CALLS_PER_RUN)
  })

  it('예산은 모듈 상태가 아니다 — 새 판(newLlmBudget)이면 처음부터 다시 쓴다', async () => {
    const spy = stubFetch(async () => directorRes('EPIDEMIC', '문장'))
    const first = newLlmBudget()
    for (let i = 0; i < MAX_LLM_CALLS_PER_RUN; i++) await requestDirector(first, STATE, ELIGIBLE)
    expect(await requestDirector(first, STATE, ELIGIBLE)).toBeNull()

    expect(await requestDirector(newLlmBudget(), STATE, ELIGIBLE)).not.toBeNull()
    expect(spy).toHaveBeenCalledTimes(MAX_LLM_CALLS_PER_RUN + 1)
  })
})

describe('보낼 곳 — 같은 오리진이 기본, Pages 빌드만 오리진을 주입한다', () => {
  it('env가 없으면 같은 오리진의 상대 경로', async () => {
    const spy = stubFetch(async () => jsonRes({ text: '편지' }))
    await requestNarrativeText(newLlmBudget(), 'letter', STATE)
    expect(spy.mock.calls[0][0]).toBe('/api/storyteller')
  })

  it('NEXT_PUBLIC_STORYTELLER_ORIGIN이 있으면 그 오리진으로 보낸다', async () => {
    vi.stubEnv('NEXT_PUBLIC_STORYTELLER_ORIGIN', 'https://example.vercel.app')
    const spy = stubFetch(async () => jsonRes({ text: '편지' }))
    await requestNarrativeText(newLlmBudget(), 'letter', STATE)
    expect(spy.mock.calls[0][0]).toBe('https://example.vercel.app/api/storyteller')
  })
})

describe('requestNarrativeText — 편지·결말문은 그냥 문자열이다', () => {
  it('본문을 그대로 돌려준다', async () => {
    stubFetch(async () => jsonRes({ text: '그동안 고마웠습니다.' }))
    expect(await requestNarrativeText(newLlmBudget(), 'letter', STATE)).toBe('그동안 고마웠습니다.')
  })
})
