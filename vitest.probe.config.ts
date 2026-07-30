import { defineConfig } from 'vitest/config'

import base from './vitest.config'

/**
 * 프로브 전용 설정 — **본 스위트에 계측기를 섞지 않기 위한 파일이다.**
 *
 * `scripts/region-balance-probe.ts`는 네 지역 × 세 시드 × 두 빌드를 12주씩 돌린다. 단언이 거의
 * 없어 초록/빨강으로 말하는 게 없고, 대신 느리다 — `npm test`에 섞이면 매 커밋마다 그 비용을
 * 내면서 아무것도 못 잡는다. 반대로 프로브를 아예 커밋 안 하면 결과가 재현 불가능해진다
 * (1차 프로브가 그래서 리뷰어의 독립 프로브와 정반대 순서를 냈다).
 *
 * 그래서 **커밋은 하되 include는 분리**한다. 별칭(`@/`)은 base에서 물려받는다 — 여기 다시
 * 적으면 base를 고치는 날 이 파일만 옛 설정으로 남는다.
 *
 * ⚠️ **`mergeConfig`를 쓰지 않는다.** 그건 배열을 *이어붙여서* include가
 * `['src/**\/*.test.ts', 'scripts/**\/*-probe.ts']`가 된다 — 프로브를 돌리려는데 본 스위트
 * 1,447건이 같이 돌고(실측 123초) 정작 프로브 로그는 그 출력에 묻힌다. include는 **교체**해야
 * 하므로 base에서 필요한 것(`resolve`)만 집어 온다.
 */
export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ['scripts/**/*-probe.ts'],
    exclude: ['**/node_modules/**', '**/.claude/**', '**/.next/**'],
    // 12주 × 4지역 × 3시드 × 두 빌드. 기본 5초로는 못 끝낸다.
    testTimeout: 600_000,
    // 계측기라 병렬 실행의 이득보다 로그가 섞이는 손해가 크다.
    fileParallelism: false,
    // ⚠️ 이게 없으면 **표가 안 보인다.** vitest는 기본으로 console을 가로채 리포터에 넘기는데,
    // 이 파일의 산출물은 통과 여부가 아니라 그 표라서 가로채이면 프로브가 아무 일도 안 한 것과 같다.
    disableConsoleIntercept: true,
  },
})
