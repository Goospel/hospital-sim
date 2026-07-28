import type { NextConfig } from "next";

/**
 * `PAGES_BASE_PATH` 가 있을 때만 **GitHub Pages 용 정적 export** 로 전환한다.
 *
 * 왜 하나의 env 로 둘(`output` + `basePath`)을 함께 켜는가 —
 * 이 둘은 **항상 같이 켜지고 같이 꺼진다**. Pages 는 `goospel.github.io/hospital-sim/`
 * 처럼 하위 경로로 서빙되므로 basePath 가 필요하고, Pages 는 서버가 없으므로 export 여야 한다.
 * 스위치를 둘로 나누면 "export 인데 basePath 를 안 준" 조합이 생기고 그건 링크가 전부 깨진 빌드다.
 *
 * env 가 없으면 이 파일은 **빈 설정**이다 — Vercel 배포는 지금까지와 완전히 동일하게
 * 서버 있는 빌드로 나간다(나중에 LLM 프록시 API 라우트가 붙을 곳이 여기다).
 * 즉 Pages 지원이 Vercel 쪽 동작을 한 글자도 바꾸지 않는다.
 */
const basePath = process.env.PAGES_BASE_PATH;

const nextConfig: NextConfig = basePath
  ? {
      output: "export",
      basePath,
      // export 모드에는 이미지 최적화 서버가 없다. 현재 next/image 미사용이지만
      // 나중에 쓰기 시작한 순간 빌드가 죽는 걸 막아둔다.
      images: { unoptimized: true },
      // ⚠️ **Pages 빌드에서 `.ts` 라우트를 통째로 뺀다** — 정적 export 는 서버가 없어
      // POST 라우트(`src/app/api/storyteller/route.ts`)를 담지 못하고, 남겨 두면 빌드가 죽는다.
      // 트리를 변형(CI 에서 rm)하지 않고 스위치 하나로 끄는 게 핵심이다: 로컬과 CI 가 같은
      // 명령으로 같은 결과를 내고, 파일을 지웠다 되돌리는 절차가 없어 되돌리기를 잊을 자리도 없다.
      //
      // 이 한 줄이 성립하는 전제는 **`src/app` 아래 page/layout 이 전부 `.tsx`** 라는 것이다
      // (2026-07-28 전수 확인: `.ts` 는 route.ts 하나뿐). 나중에 `.ts` 로 된 page/layout 을
      // 만들면 Pages 빌드에서 그 화면이 조용히 사라진다 — 그때는 확장자를 `.tsx` 로 두거나
      // 이 목록을 다시 손봐야 한다.
      pageExtensions: ["tsx"],
    }
  : {};

export default nextConfig;
