---
tags:
  - type/meta
---

@AGENTS.md

## ⚙️ 환경 변수 · 기기 간 셋업 (데스크톱 ↔ 랩탑)

env 셋업 절차는 [README.md](README.md)의 "환경 변수(env) — 여러 기기에서 이어 작업하기" 섹션과 [.env.example](.env.example)에 있다(단일 계약). 요약: 값 목록만 `.env.example`(커밋), 실제 값은 각 기기 `.env.local`(gitignore). 새 기기는 `cp .env.example .env.local` 후 값만 채운다. 시크릿(API 키)은 git이 아니라 비밀번호 관리자 또는 배포 후 `vercel env pull`로 동기화하고, `NEXT_PUBLIC_`을 붙이지 않는다(붙이면 브라우저 번들 노출).

## 🏷️ 옵시디언 문서 태그 — frontmatter `type/*` (검사기로 강제)

옵시디언이 추적하는 **모든 git 마크다운**은 frontmatter에 문서 종류 태그 하나를 갖는다 — 옵시디언 그래프 뷰의 색 그룹 + Claude의 문서 인덱싱 필터의 단일 출처다.

```yaml
---
tags:
  - type/research
---
```

- **종류 = 폴더**: `type/troubleshooting`(claude-docs/troubleshooting/) · `type/research`(docs/research/) · `type/spec`(superpowers/specs/) · `type/plan`(superpowers/plans/) · `type/submission`(docs/submission/) · `type/game-concept`(docs/concept/) · `type/meta`(운영문서 — CLAUDE·AGENTS·README·plan·changeLog·troubleshooting 허브). 계층 태그(`type/*`)라 나중에 `status/*` 같은 다른 축을 더해도 이름이 안 겹친다.
- **새 문서도 반드시**: 새 md를 만들면 그 폴더의 type 태그를 넣는다. **안 넣으면 pre-commit이 거부한다** — `scripts/check-doc-tags.ps1`(테스트 `scripts/test-check-doc-tags.ps1`, TDD)이 git 추적 md 전수를 검사하고 `.githooks/pre-commit`이 md 를 건드리는 커밋마다 돌린다.
- **T-\*.md 안전**: troubleshooting 항목은 이미 frontmatter(`summary`)가 있어 `tags`를 그 안에 같이 둔다 — rebuild 검사기는 `summary`/`promoted`만 읽어 `tags`를 무시한다.
- **왜 검사기까지**: 태그는 소프트 규칙이라 새 문서에서 조용히 누락돼도 그래프에만 색 없는 노드로 뜨고 아무도 모른다. 바로 아래 「AI 활용 추적」이 뼈아프게 남긴 교훈 — *"검사기 없는 규약은 죽는 게 아니라 썩는다"* — 을 이번엔 규약 신설과 **동시에** 적용했다(그 규약은 검사기 없이 형식만 100% 준수되며 목적이 증발했다).

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

> ⚠️ **`Skills-used:`부터 `Co-Authored-By:`까지 빈 줄 없이 연속이어야 한다.** 중간에 빈 줄이 하나라도 있으면 git은 **마지막 문단만** 트레일러 블록으로 보고 그 앞을 통째로 버린다. Claude Code의 기본 습관이 `Co-Authored-By` 앞에 빈 줄을 넣는 것이라 **이 함정은 기본값 쪽으로 기울어 있다** — 실측(2026-07-17): 규칙 도입 이후 15커밋 중 **13개**가 이걸 밟아 `interpret-trailers` 파싱이 죽었다(준수율은 15/15 = 100%였다).

- **집계는 `--grep`으로 한다.** `git interpret-trailers --parse`는 위 빈 줄 함정 하나에 죽으므로 **집계 경로로 쓰지 않는다**(실측 파싱률 2/15 = 13%). 아래 명령은 형식 실수에 강해 같은 15커밋을 **15/15** 잡는다:

```bash
# (a) 스킬별 사용 빈도 — 분자
git log --format=%B | grep '^Skills-used:' | sed 's/^Skills-used: *//' \
  | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn

# (a) 분모 — 규칙 도입(69494bd) 이후 전체 커밋 대비 보고한 커밋
git rev-list --count 69494bd..HEAD
git log --grep='^Skills-used:' --format=%h 69494bd..HEAD | wc -l

# (b) 미사용 스킬 = 설치 카탈로그 − 위 목록 (오프라인 diff)
ls -d ~/.claude/plugins/cache/*/*/*/skills/*/ | sed 's|.*/skills/||; s|/$||' | sort -u
```
- **스킬 이름의 네임스페이스가 곧 플러그인**(`superpowers:*`, `vercel:*`, `anthropic-skills:*` …). 그래서 `Skills-used`만으로 플러그인 대부분이 드러난다. 플러그인의 MCP 툴·에이전트만 단독으로 쓴 경우엔 `Plugins-used`에 따로 적는다.
- **범위**: 스킬을 하나도 안 쓴 커밋은 `Skills-used: none`으로 명시한다 — 전체 커밋 대비 "스킬 쓴 커밋" 비율(빈도의 분모)을 얻기 위함.
- **`Skill-benefit`은 내 판단이 필요한 핵심 데이터**(목적 c) — 각 스킬이 이번 작업에 준 구체적 이점을 한 줄로. 스킬별로 줄을 나눠 적어도 된다(트레일러 키는 반복 가능).
- 한글 커밋 메시지는 T-026 절차(`.commit-msg-tmp` + `git commit -F`)를 따르므로 트레일러도 그 파일 안에 함께 쓴다.

**언제 집계하는가 (필수 — 이게 없으면 규칙이 있으나 마나다)**: 위 명령을 **④ `docs/submission/ai-usage-doc.md` §3-1을 갱신할 때**와 **P7(8/3~8/7) 최종화 때** 돌려 실측을 문서에 반영한다. 데이터의 소비자가 제출 문서라 마감이 집계를 강제한다 — 소비자를 지정하지 않은 규약은 지켜지면서도 죽는다(바로 아래).

**한계·승격 경로**: 최초 설계는 이 규칙의 위험을 *"소프트라서 내가 자가보고를 잊거나 오기억한다"*로 봤다. **그 예측이 틀렸다.** 실측(2026-07-17): 도입 이후 **15/15 = 100% 준수**. 잊은 적이 없다. 대신 아무도 예상 못 한 자리에서 실패했다 — **집계를 한 번도 돌리지 않았다(15커밋 동안 0회).** 집계는 내내 가능했는데(`--grep`으로 15/15) 실행한 사람이 없었다. 그리고 형식은 100% 준수됐지만 `interpret-trailers` 경로는 13커밋 동안 조용히 죽어 있었고, **읽는 사람이 없으니 아무도 몰랐다.**

→ **교훈: 소프트 규칙은 불이행으로 죽지 않는다. 준수되면서 목적만 증발한다.** 그래서 규약을 신설할 땐 (1) **누가 언제 이 데이터를 읽는가**를 같이 정하고(위 절), (2) **형식 규약에는 검사기를 같이 만든다** — 검사기 없는 규약은 죽는 게 아니라 **썩는데, 썩음은 준수율로 안 잡힌다.** 목적 (a)·(b)의 빈도/미사용 집계는 객관 데이터라 `Skill` 도구 호출을 파일에 적는 `PostToolUse` 훅이 더 정확하다 — 유용성이 확인되면 그쪽으로 승격한다. 반면 (c) 이점 서술은 자동화 불가라 커밋 주석이 제자리다.

## 📝 changeLog 규약 — PR 번호 생략 (글로벌 override · 승격 후보)

**규칙**: [changeLog.md](claude-docs/changeLog.md) 항목 제목에 **PR 번호를 적지 않는다** — `## 날짜 · 제목`까지만. 글로벌 `~/.claude/CLAUDE.md`의 `날짜 · 제목 (PR #번호)` 형식을 이 프로젝트에서 override 한다(프로젝트 CLAUDE.md가 글로벌보다 우선).

**왜**: PR 번호는 **머지돼야 확정**되는데 changeLog 항목은 그전(커밋)에 써진다 — 담을 값이 아직 없는 시점에 적어야 하는 **시간 역전**. 그래서 커밋 땐 `(진행 중 · PR 예정)`으로 비웠다가 머지 후 `(PR #N)`으로 손보는 sweep이 필요했다. 그 sweep은 소프트 규칙이라 잊히고, 게다가 이미 머지된 문서라 한 단어 고치자고 **새 PR이 또** 필요해 **stale이 조용히 누적**된다(#54·#55에서 2회 재발 — #54를 고치며 #55를 또 `PR 예정`으로 남겼다).

근본 원인은 「옵시디언 태그」·「troubleshooting 분할」이 경고한 것과 **같은 이중 기재**다: squash 머지 커밋 제목에 GitHub가 `(#N)`을 자동으로 붙여(`09fdb94 … (#55)`) **그게 이미 단일 출처**인데, changeLog가 번호를 다시 적으면 두 곳이 어긋난다. 미래에 확정되는 값을 문서에 안 두면 drift가 **구조적으로 불가능**해진다(= `MEMORY.md` 자동생성·파일=troubleshooting항목과 같은 발상). 특정 항목의 PR을 찾으려면 제목으로 `git log --grep`.

- **과거 항목**은 이미 붙은 `(PR #NN)`을 그대로 둔다(역사적 기록·정확함, stale 아님). 이 규칙 도입(2026-07-18) 이후 항목만 생략 — 새 항목에 번호가 없다고 '미머지'로 오독하지 않도록 **이 절이 그 출처**다.
- **승격 후보**: 이 stale은 squash 머지 + 브랜치 PR 흐름을 쓰는 **모든 프로젝트에 일반적**이라 글로벌 `~/.claude/CLAUDE.md`(「작업 추적 3종」의 changeLog 줄) 승격 대상이다. 글로벌은 별도 git 레포(main 브랜치·block-main-edit 훅으로 보호)라 그 레포에서 별도 브랜치·머지가 필요해, 이 프로젝트 override를 **1단계**로 둔다(프로젝트 → 글로벌 → 훅 파이프라인).
