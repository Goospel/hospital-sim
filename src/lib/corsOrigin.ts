// 프록시를 부를 수 있는 오리진인가 — **순수 함수 하나.**
//
// 라우트 안에 있던 판정을 여기로 내렸다. 이유는 하나다: `route.ts`는 `@anthropic-ai/sdk`를
// 임포트해서 테스트에서 부르기 무겁고, 그래서 **이 게임의 유일한 지출 관문이 무테스트로 남아
// 있었다**. 판정은 문자열 비교뿐이라 SDK도 요청 객체도 필요 없다.
//
// `storyteller.ts`(클라이언트)와 **다른 파일**인 것도 의도다 — 이건 서버 전용 판정이고,
// 클라이언트 모듈에 얹으면 브라우저 번들에 서버 로직이 섞여 들어간다.
//
// ⚠️ **이건 CORS이지 인증이 아니다.** `Origin`은 브라우저가 붙이는 값이라 `curl -H Origin:`
// 한 줄로 위조된다. 여기서 막는 것은 *브라우저에 열린 남의 페이지*가 우리 지갑을 쓰는 경로뿐이고,
// 최종 방어선은 코드 밖(Vercel Firewall rate-limit · Anthropic 지출 상한)이다 — route.ts 주석.

/** 브라우저에서 이 프록시를 부를 수 있는 오리진(Pages 배포 · 로컬 dev). */
export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://goospel.github.io',
  // dev 서버가 3000이 아닌 포트로 떠도 아래 같은-오리진 규칙이 덮는다. 이 줄이 필요한 자리는
  // **Pages 빌드를 로컬 3000에서 띄워 다른 오리진의 프록시로 쏘는 대조 실험**이다.
  'http://localhost:3000',
])

/**
 * 이 요청을 받아 줄 오리진인가 — 아니면 `null`(라우트가 403으로 끊는다).
 *
 * 허용 목록에 더해 **같은 오리진**을 반드시 통과시켜야 한다: Vercel 배포본은 게임과 프록시가
 * 한 도메인에 있어 브라우저가 `Origin: https://<그 배포>`를 붙여 보낸다. 목록만 보면
 * **주 배포가 자기 자신을 403으로 막는다**.
 *
 * 호스트 비교는 **정확 일치**다 — 포트가 다르면 다른 오리진이고(브라우저의 동일 출처 정의),
 * 접미사 비교로 느슨하게 풀면 `evil-goospel.github.io` 같은 이름이 통과한다.
 */
export function allowedOrigin(origin: string | null, host: string | null): string | null {
  // 브라우저는 POST에 Origin을 항상 붙인다 — 없으면 브라우저가 아니다.
  if (origin === null) return null
  if (ALLOWED_ORIGINS.has(origin)) return origin
  if (host === null) return null
  return origin === `https://${host}` || origin === `http://${host}` ? origin : null
}
