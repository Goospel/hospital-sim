import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // ── 테스트 헬퍼 격리 ────────────────────────────────────────────────
    // `src/sim/testHelpers.ts`는 테스트 전제를 세우는 물건이다 — 전제가 깨지면 **던진다**.
    // 그게 테스트에선 옳지만(빨간불이 곧 신호다) 제품 코드에 실리면 플레이어가 흰 화면을
    // 본다. 게다가 헬퍼는 테스트 편의를 위해 언제든 시그니처가 바뀌는데, 제품 코드가
    // 그걸 쓰기 시작하면 그 자유가 조용히 사라진다.
    //
    // 왜 검사기까지 — 이건 "테스트 헬퍼는 테스트에서만"이라는 **소프트 규칙**이라, 안 지켜져도
    // 빌드도 테스트도 green이고 아무도 모른다. 이 저장소가 세 번 적은 교훈이 그것이다:
    // *검사기 없는 규약은 죽는 게 아니라 썩고, 썩음은 준수율로 안 잡힌다*(CLAUDE.md
    // 「AI 활용 추적」). 그래서 규칙을 세우는 자리에서 검사기를 함께 세운다.
    //
    // 예외는 둘뿐이다: 테스트 파일 자신과 헬퍼 파일 자신(아래 ignores).
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/sim/testHelpers.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/testHelpers", "**/testHelpers.js", "@/sim/testHelpers"],
              message:
                "testHelpers는 테스트 전용입니다 — 전제가 깨지면 던지도록 만들어져 제품 코드에 실리면 화면이 통째로 죽습니다. 필요한 동작은 src/sim의 공개 API를 쓰세요.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
