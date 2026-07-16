@AGENTS.md

## 📊 AI 활용 추적 — 커밋 메시지에 사용 스킬·플러그인 명시 (이 프로젝트 한정 · 승격 후보)

**목적**: 어떤 스킬/플러그인이 (a) 얼마나 자주 쓰이는지, (b) 있는데 안 쓰이는 건 뭔지, (c) 실제로 어떤 이점을 줬는지 측정한다.

**규칙** — Claude가 이 프로젝트에서 커밋을 만들 때, 그 작업에서 실제로 호출한 스킬(`Skill` 도구)과 플러그인을 커밋 메시지 **트레일러**(`Key: value`, 메시지 맨 끝)로 남긴다:

```
Skills-used: superpowers:test-driven-development, superpowers:brainstorming
Plugins-used: superpowers
Skill-benefit: TDD — 결정론 회귀를 커밋 전에 잡음
Skill-benefit: brainstorming — 범위를 미리 좁혀 재작업 방지
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

- **트레일러 형식**이라 `git interpret-trailers --parse` / `git log --grep=Skills-used`로 기계 집계 가능 → 빈도 카운트·미사용 스킬 diff가 쉬워진다.
- **스킬 이름의 네임스페이스가 곧 플러그인**(`superpowers:*`, `vercel:*`, `anthropic-skills:*` …). 그래서 `Skills-used`만으로 플러그인 대부분이 드러난다. 플러그인의 MCP 툴·에이전트만 단독으로 쓴 경우엔 `Plugins-used`에 따로 적는다.
- **범위**: 스킬을 하나도 안 쓴 커밋은 `Skills-used: none`으로 명시한다 — 전체 커밋 대비 "스킬 쓴 커밋" 비율(빈도의 분모)을 얻기 위함.
- **`Skill-benefit`은 내 판단이 필요한 핵심 데이터**(목적 c) — 각 스킬이 이번 작업에 준 구체적 이점을 한 줄로. 스킬별로 줄을 나눠 적어도 된다(트레일러 키는 반복 가능).
- 한글 커밋 메시지는 T-026 절차(`.commit-msg-tmp` + `git commit -F`)를 따르므로 트레일러도 그 파일 안에 함께 쓴다.

**한계·승격 경로**: 이 규칙은 *소프트*(내가 자가보고 → 잊거나 오기억 가능)다. 목적 (a)·(b)의 **빈도/미사용 집계는 객관 데이터**라, `Skill` 도구 호출을 파일에 적는 `PostToolUse` 훅으로 뽑는 게 정확하다 — 유용성이 확인되면 그쪽으로 승격한다. 반면 (c) 이점 서술은 자동화 불가라 커밋 주석이 제자리다. (미사용 스킬 = 전체 스킬 카탈로그 − 커밋에 등장한 스킬 합집합, 오프라인 diff.)
