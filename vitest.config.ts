import { defineConfig } from 'vitest/config'

/**
 * vitest 설정 — **`.claude/worktrees/`를 테스트 대상에서 제외하는 게 이 파일의 존재 이유다.**
 *
 * 설정 파일이 없던 동안 vitest 기본 include(`**\/*.test.ts`)가 `.claude/worktrees/` 안의
 * **버려진 워크트리들**까지 잡아, 이 레포의 테스트 12파일 220건이 **33파일 510건**으로 보고됐다.
 * 초과분은 전부 **옛 코드를 대상으로 도는 옛 테스트**다 — green이어도 main에 대해 아무 말도 안 한다.
 *
 * 위험한 건 숫자가 틀린 것 자체가 아니라 **신뢰의 희석**이다:
 *   - "510 green"이 커밋 메시지에 박히면 나중에 아무도 검증 못 한다(그때 워크트리가 몇 개였는지 모른다).
 *   - 워크트리의 낡은 테스트가 실패하면 멀쩡한 작업이 막히고, 원인 추적에 시간이 든다.
 *   - 기본 exclude는 `node_modules`·`dist`만 막는다. `.claude/`는 아무도 안 막아준다.
 *
 * ⚠️ 워크트리 자체는 지우지 않는다 — 이전 세션의 작업이 들어 있을 수 있다(T-030 계열).
 * 테스트 대상에서 빼기만 한다.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.claude/**', '**/.next/**'],
  },
})
