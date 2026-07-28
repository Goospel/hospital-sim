import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { EVENT_KINDS } from '@/sim/events'

/**
 * 스토리텔러 프록시 — **키가 사는 유일한 자리이자, LLM 권한 경계의 서버 쪽 절반.**
 *
 * 브라우저에서 Anthropic을 직접 부르면 키가 번들에 실린다. 그래서 게임은 이 라우트만 부르고
 * 키는 서버 환경변수(`ANTHROPIC_API_KEY`)로만 존재한다.
 *
 * ⚠️ **이 파일은 Vercel 배포에만 산다.** GitHub Pages는 정적 export라 POST 라우트를 담을 수 없어,
 * `next.config.ts`의 `pageExtensions` 스위치가 Pages 빌드에서 `.ts` 라우트를 통째로 뺀다.
 * Pages에 실린 게임은 `NEXT_PUBLIC_STORYTELLER_ORIGIN`으로 Vercel의 이 라우트를 크로스오리진
 * 호출한다(그래서 아래 CORS가 있다).
 *
 * **판정은 여기서 하지 않는다**(계획 §0-2의 2콜 원칙). 이 라우트가 돌려주는 것은 문자열 하나이고,
 * 이벤트 선택조차 structured output의 enum + 클라이언트의 `eligible` 대조를 통과해야 게임에
 * 닿는다 — 프롬프트는 지시라 어길 수 있지만 그 두 관문은 못 어긴다.
 */

/** 모델은 env로 갈아 끼울 수 있다 — 비용·지연을 배포에서 조정하되 코드 기본값은 최상위 모델. */
const MODEL = process.env.LLM_MODEL ?? 'claude-opus-5'

/** 연출문은 짧다 — 깊게 생각할수록 지연만 늘고 문장은 나아지지 않는다(계획 §0-5). */
const EFFORT = 'low' as const

/** 아침 전이는 클릭 한 번에 붙는다 — 9초를 넘기면 클라이언트(10초)가 먼저 끊는다.
 *  TS SDK의 timeout 단위는 **밀리초**다(Python은 초 — 여기서 틀리면 9ms가 되어 전부 타임아웃). */
const SDK_TIMEOUT_MS = 9_000

const ALLOWED_ORIGINS = new Set(['https://goospel.github.io', 'http://localhost:3000'])

const TASKS = ['director', 'letter', 'epilogue'] as const
type StorytellerTask = (typeof TASKS)[number]

function isTask(value: unknown): value is StorytellerTask {
  return typeof value === 'string' && (TASKS as readonly string[]).includes(value)
}

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://goospel.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
})

/**
 * 디렉터 응답의 형태 계약 — **enum이 곧 가드레일이다.**
 *
 * 종류 목록을 여기 손으로 적지 않고 `EVENT_KINDS`에서 파생한다: 이벤트가 하나 늘었는데 이
 * 배열만 낡으면 LLM은 그 종류를 영영 못 고르고, 그 사실은 아무 에러도 내지 않는다(카탈로그와
 * 프롬프트의 이중 기재 — 이 저장소가 세 번 경고한 병).
 *
 * `'NONE'`이 목록에 있는 이유: "아무 일도 없는 하루"를 고를 수단이 없으면 모델은 매일 무언가를
 * 골라야 하고, 그러면 속보가 평시가 되어 이벤트의 질감이 사라진다.
 */
const DIRECTOR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    event: { type: 'string', enum: [...EVENT_KINDS, 'NONE'] },
    narration: { type: 'string' },
  },
  required: ['event', 'narration'],
  additionalProperties: false,
}

/** 모든 작업이 공유하는 권한 경계 — **심사축(AI 활용)의 물증이라 문구가 곧 설계다.** */
const BOUNDARY = `당신은 병원 경영 시뮬레이션 게임의 스토리텔러다. 게임이 보내는 상황 요약(JSON)을 읽고 한국어 연출 문장을 쓴다.

권한 경계 — 반드시 지킨다:
- 게임의 규칙·수치·판정은 전부 게임 코드가 확정한다. 당신은 그것을 바꿀 수 없고, 입력에 없는 숫자를 지어내지 않는다.
- 당신이 만드는 것은 문장뿐이다. 플레이어에게 지시하거나 조언하지 않고, 규칙을 설명하지 않는다.
- 사실만 쓴다. 플레이어를 탓하거나 훈계하지 않는다.
- 의학·법률 자문이 아니라 게임 각색이다. 실제 진단·처치·법적 판단을 주장하지 않는다.
- 출력은 요청된 문장(또는 JSON)만. 인사말·머리말·해설을 덧붙이지 않는다.`

const SYSTEM_PROMPTS: Record<StorytellerTask, string> = {
  director: `${BOUNDARY}

오늘 병원에 붙일 사건을 하나 고르고, 그것을 알리는 속보를 쓴다.
- event는 **반드시 입력의 eligible 배열 안에 있는 값** 중 하나로 고른다. 그 밖의 값은 절대 쓰지 않는다. eligible은 게임 코드가 전제를 검증해 만든 후보 목록이고, 목록 밖 선택은 게임이 거부한다.
- 아무 일도 없는 평범한 하루가 어울리면 event를 "NONE"으로 한다. eligible이 비어 있으면 반드시 "NONE"이다.
- narration은 **200자 이내** 한국어 한두 문장. 속보·공문의 질감으로 무슨 일이 있었는지만 말한다.
- 수치 해설("응급이 3배입니다")이나 대응 지시("병상을 늘리세요")는 쓰지 않는다. 결과는 게임 화면이 숫자로 보여 준다.`,

  letter: `${BOUNDARY}

병원을 떠나는 의사의 사직 인사를 쓴다.
- **300자 이내** 한국어. 이름·과·특성·포화로 마감한 날 수는 입력에 있는 것만 쓴다.
- 원망도 훈계도 없이 사실과 심경만. 떠나는 것이 「내과 1명」이 아니라 사람 하나임이 드러나게 쓴다.`,

  epilogue: `${BOUNDARY}

한 판이 끝난 병원의 결말문을 쓴다.
- **400자 이내** 한국어. 입력의 ending(INSOLVENCY=돈이 바닥남 / NO_PEOPLE=사람이 바닥남 / CAMPAIGN_END=기간 종료)과 지표를 근거로 쓴다.
- 교훈을 설교하지 않는다. 남은 것과 사라진 것을 사실로 적는다.`,
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin')) })
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin'))

  // 키가 없으면 여기서 끝난다 — 클라이언트는 비200을 전부 폴백으로 읽으므로(storyteller.ts)
  // 키 미등록 배포본도 게임은 폴백 문장으로 정상 완주한다(계획 §0-5의 최종 안전망).
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_KEY' }, { status: 503, headers })
  }

  let body: { task?: unknown; state?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'BAD_JSON' }, { status: 400, headers })
  }
  if (!isTask(body.task)) {
    return NextResponse.json({ error: 'BAD_TASK' }, { status: 400, headers })
  }
  const task = body.task

  const client = new Anthropic({ timeout: SDK_TIMEOUT_MS })
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: task === 'director'
      ? { effort: EFFORT, format: { type: 'json_schema', schema: DIRECTOR_SCHEMA } }
      : { effort: EFFORT },
    system: SYSTEM_PROMPTS[task],
    messages: [{ role: 'user', content: JSON.stringify(body.state ?? {}) }],
  })

  // 거절은 502로 내려보내 **앱 폴백으로 강등**한다. 서버측 fallbacks 베타를 쓰지 않는 이유:
  // 게임에 이미 폴백 문장 카탈로그(narrative.ts)라는 최종 안전망이 있어, 베타 의존을 하나 더
  // 늘려도 얻는 것이 없다(계획 §0-5).
  if (res.stop_reason === 'refusal') {
    return NextResponse.json({ error: 'REFUSAL' }, { status: 502, headers })
  }

  // 사용량 로그 — ④ 제출 문서(§6-4)의 실측 재료다. 응답 본문은 찍지 않는다(로그가 곧 유출 면).
  console.log('[storyteller]', task, JSON.stringify(res.usage))

  const text = res.content.find(block => block.type === 'text')?.text ?? ''
  return NextResponse.json({ text }, { headers })
}
