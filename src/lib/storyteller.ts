// 스토리텔러 클라이언트 — **LLM으로 가는 유일한 문이고, 그 문은 한쪽으로만 열린다.**
//
// 이 모듈이 지키는 계약은 하나다: **성공이 아니면 `null`**. 네트워크 오류·타임아웃·HTTP 비200·
// 거절·JSON 파싱 실패·치역 밖 이벤트가 전부 같은 값으로 내려오고, 화면은 `null` 하나만 보고
// 폴백(narrative 카탈로그 · fallbackDirectorChoice)으로 내려간다. 실패마다 다른 모양으로
// 돌려주면 화면이 그 경우의 수만큼 분기해야 하고, 빠뜨린 한 갈래가 곧 흰 화면이다.
//
// 여기서 **판정은 하지 않는다**(계획 §0-2의 2콜 경계). 돌려주는 것은 이벤트 종류 하나와 문자열뿐이고,
// 종류는 호출부가 준 후보 목록(`eligible`) 안에 있을 때만 통과한다 — 그래서 LLM이 아무 말을 해도
// 게임 규칙을 넘을 수 없다. 전제 검증의 단일 출처는 `sim/events.isEligibleEvent`이고 이 파일은
// 그 결과 목록을 대조만 한다(규칙을 여기 베끼면 두 벌이 된다).
import type { SimEventKind } from '../sim/events'

/** 한 판(새로고침 = 새 판)에 허용하는 프록시 호출 수.
 *  12주 완주에 아침 전이는 84회다 — 상한이 없으면 한 판이 프록시를 84번 두드리고, 그게 심사
 *  기간 내내 배포본에서 반복된다. 10회면 판의 앞부분(이벤트가 처음 뜨는 구간)과 결산·에필로그를
 *  덮으면서 비용이 예측 가능해진다. 소진 후에는 게임이 폴백 문장으로 조용히 완주한다. */
export const MAX_LLM_CALLS_PER_RUN = 10

/** 한 요청을 기다리는 최대 시간. 서버(SDK) 타임아웃 9초보다 **길게** 잡는다 —
 *  짧으면 서버가 정상 응답을 만들고 있는데 클라이언트가 먼저 끊어, 돈은 쓰고 문장은 못 받는다. */
export const LLM_TIMEOUT_MS = 10_000

export type StorytellerTask = 'director' | 'letter' | 'epilogue'

/**
 * 이 판이 쓴 호출 수 — **모듈 전역이 아니라 호출부가 들고 있는 값**이다.
 *
 * 모듈 상태로 두면 새 판(새로고침 없이 다시 시작하는 경로가 생기는 날)에 지난 판의 소모가
 * 그대로 남아 스토리텔러가 처음부터 꺼진 채로 시작한다. 값을 밖에 두면 "새 예산을 만드는 것"이
 * 곧 리셋이라 리셋 함수도, 리셋을 잊을 자리도 없다.
 */
export interface LlmBudget { used: number }

export function newLlmBudget(): LlmBudget {
  return { used: 0 }
}

/** 디렉터 응답 — `kind: null`은 실패가 아니라 **LLM이 고른 조용한 하루**('NONE')다.
 *  실패는 함수가 통째로 `null`을 돌려주는 것으로만 표현된다(두 층을 섞지 않는다). */
export interface DirectorReply {
  kind: SimEventKind | null
  narration: string
}

/** 프록시 주소 — 기본은 **같은 오리진**(Vercel 배포·로컬 dev). Pages 정적 export에는 라우트가
 *  실리지 않으므로(next.config의 pageExtensions 스위치) 거기서만 빌드 시 오리진이 주입된다. */
function endpoint(): string {
  const origin = process.env.NEXT_PUBLIC_STORYTELLER_ORIGIN
  return `${origin ?? ''}/api/storyteller`
}

/** 프록시에 한 번 묻는다 — 본문 문자열이거나 `null`. 실패의 모든 갈래가 여기서 합류한다. */
async function ask(budget: LlmBudget, task: StorytellerTask, state: unknown): Promise<string | null> {
  // 상한 판정이 증가보다 **먼저**다. 뒤집으면 11번째 호출이 fetch까지 갔다가 버려진다.
  if (budget.used >= MAX_LLM_CALLS_PER_RUN) return null
  // 실패한 호출도 소모로 센다 — 죽은 라우트(404·503)를 만난 판이 남은 내내 같은 벽을 다시
  // 두드리며 아침마다 10초씩 멈추는 것을 막는다.
  budget.used += 1

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, state }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const body: unknown = await res.json()
    const text = (body as { text?: unknown } | null)?.text
    // 빈 문자열은 성공이 아니다 — 연출문 자리에 빈 칸이 서느니 폴백 문장이 낫다.
    return typeof text === 'string' && text.length > 0 ? text : null
  } catch {
    // 네트워크 오류·타임아웃 abort·JSON 파싱 실패가 전부 여기로 온다.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 사직 편지·결말문 — 판정에 쓰이지 않는 순수 텍스트라 통과 조건이 "빈 문자열이 아님"뿐이다. */
export function requestNarrativeText(
  budget: LlmBudget,
  task: 'letter' | 'epilogue',
  state: unknown,
): Promise<string | null> {
  return ask(budget, task, state)
}

/**
 * 오늘의 이벤트를 LLM에게 묻는다 — **응답은 `eligible` 안에 있을 때만 통과한다.**
 *
 * 이 한 줄이 2콜 권한 경계의 클라이언트 쪽 절반이다(서버 쪽 절반은 라우트의 시스템 프롬프트와
 * structured output enum). 프롬프트는 지시일 뿐이라 어길 수 있지만 이 대조는 못 어긴다 —
 * 그래서 "LLM은 코드가 검증한 후보 중에서만 고른다"가 주장이 아니라 사실이 된다.
 */
export async function requestDirector(
  budget: LlmBudget,
  state: unknown,
  eligible: readonly SimEventKind[],
): Promise<DirectorReply | null> {
  const text = await ask(budget, 'director', state)
  if (text === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const { event, narration } = (parsed ?? {}) as { event?: unknown; narration?: unknown }
  if (typeof event !== 'string' || typeof narration !== 'string') return null
  if (event === 'NONE') return { kind: null, narration }
  if (!eligible.includes(event as SimEventKind)) return null
  return { kind: event as SimEventKind, narration }
}
