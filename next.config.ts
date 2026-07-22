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
    }
  : {};

export default nextConfig;
