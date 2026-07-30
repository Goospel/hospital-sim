import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// leaf가 당기면 안 되는 같은 층 상위 모듈 — **events.ts와 traits.ts가 나눠 쓴다.**
// 둘의 목록이 pawn 하나만 갈려서 배열을 공유하고 차이는 아래에서 얹는다: 손으로 두 벌 적으면
// 새 모듈이 한쪽에만 들어가 그 파일만 조용히 통과한다(이 파일이 이미 경고한 그 함정).
// ⚠️ 패턴 문자열을 **블록 주석 안에 쓰지 않는다** — 별 두 개 + 슬래시가 주석을 거기서 끝내
//    뒤따르는 한글이 코드로 파싱된다(실측: `Unexpected identifier 'src'`).
const SIM_LEAF_BANNED = [
  "**/build", "**/day", "**/director", "**/emergency", "**/fatigue",
  "**/needs", "**/path", "**/patientFlow", "**/spots",
  "**/tick", "**/week",
  // 옛 층 전체 — leaf가 다른 레이어를 아는 순간 leaf가 아니다.
  "**/game/*",
  // 테스트 헬퍼(위 블록의 금지가 이 블록에 덮이므로 여기 다시 적는다).
  "**/testHelpers",
];

const LEAF_MESSAGE =
  "events.ts·traits.ts는 leaf입니다 — world·dept의 타입 말고는 임포트할 수 없습니다. 상위 모듈을 당기면 값 임포트 순환이 됩니다(T-093: patientFlow가 events의 배율을 값으로 읽는데 events가 되당기면 초기화 중 undefined가 된다). 필요한 값은 호출부에서 인자로 넘겨받으세요.";

const leafImportRule = (group) => ({
  "no-restricted-imports": ["error", { patterns: [{ group, message: LEAF_MESSAGE }] }],
});

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
  {
    // ── leaf 계약 (T-093 재발 가드) ──────────────────────────────────────
    // `events.ts`·`traits.ts`는 **leaf**다: world·dept 말고는 아무것도 임포트하지 않는다.
    // 그 계약이 무너지면 나는 것은 에러가 아니라 **값 임포트 순환**이다 — patientFlow가
    // events의 배율을 값으로 읽는데 events가 patientFlow를 되당기면 한쪽 모듈이 초기화
    // 중에 undefined로 읽히고, 그 결과는 "왜 이 배율만 NaN이지"로만 나타난다(T-093).
    // 순환을 피하려고 효과(events)와 선택(director)을 **일부러 두 파일로 갈랐는데**, 그
    // 설계 의도는 주석에만 있어서 다음 사람이 한 줄 임포트로 되돌려 놓을 수 있었다.
    //
    // 왜 검사기까지 — 위 testHelpers 블록과 같은 이유다: 소프트 규칙은 안 지켜져도 그날은
    // green이고, 순환이 실제로 터지는 것은 임포트 순서가 바뀌는 먼 훗날이다.
    //
    // ⚠️ **금지 목록이다 — 허용 목록으로는 못 적는다.** `group: ["*", "!./world", "!./dept"]`을
    //    먼저 시도했고 실측으로 죽었다: `group`은 gitignore 문법(`ignore` 패키지)인데 거기서는
    //    *부모가 제외된 것을 자식에서 되살릴 수 없어* `*`가 전부를 먹은 뒤 `!` 예외가 무시된다
    //    (world·dept까지 error로 잡혔다). 그래서 자리를 하나하나 적는다.
    //
    //    ponytail: 금지 목록이라 **새 sim 모듈이 생기면 여기에 추가해야 한다**(빠뜨리면 그
    //    모듈만 조용히 통과). 지금은 sim 모듈이 손에 꼽아 감당되지만, 목록이 길어지거나
    //    실제로 한 번 빠뜨리는 날엔 「leaf가 자기 위층을 임포트하지 않는가」를 세는 테스트
    //    (import 문 파싱)로 승격한다 — 그쪽이 열거가 아니라 성질을 잰다.
    // ⚠️ **pawn 금지는 events.ts에서만 풀린다**(2026-07-30 방어진료 위축). 소송이 의사 하나의
    //    응급 우선순위를 내리는데, 그 읽기·쓰기 규칙(`priorityOf`의 폴백 2 · `setDoctorPriority`의
    //    범위 검사와 나머지 축 채우기)을 events에 복제하면 **위축된 의사만 다른 계약으로 산다**.
    //    순환이 아닌 근거: pawn은 world·dept·traits·path만 보고 events로 되돌아오지 않는다
    //    (world→events는 타입 전용이라 그 경유도 런타임 순환이 아니다 — regions 예외와 같은 형태).
    //    **traits.ts에는 그대로 금지다**: pawn이 traits를 값으로 읽으므로 되당기면 진짜 순환이다.
    files: ["src/sim/events.ts"],
    rules: leafImportRule(SIM_LEAF_BANNED),
  },
  {
    files: ["src/sim/traits.ts"],
    rules: leafImportRule([...SIM_LEAF_BANNED, "**/pawn"]),
  },
]);

export default eslintConfig;
