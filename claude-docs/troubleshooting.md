# troubleshooting — 함정 + 승격

> 1분+ 디버깅했으면 원인 잡힌 직후 한 항목(`T-###`, 글로벌 시퀀스를 이음).
> 형식: 증상 / 원인 / 해결 / 재발방지. 같은 함정 다른 맥락 2회+ → 글로벌·훅으로 승격.
> 관련: [plan.md](plan.md) · [changeLog.md](changeLog.md)

## 목차

- [T-027](#t-027--main-머지-후-라이브-배포-지연을-배포-안-됨으로-오진) · main 머지 후 배포 지연을 '배포 고장'으로 오진
- [T-028](#t-028--워크트리에서-gh-pr-merge---delete-branch가-로컬-후처리에서-깨짐) · 워크트리에서 `gh pr merge --delete-branch` 로컬 후처리 실패(머지는 성공)
- [T-029](#t-029--windows에서-git-mv는-대상-디렉토리를-자동-생성하지-않음) · Windows `git mv`는 대상 디렉토리를 자동 생성 안 함 (mkdir -p 선행)

---

## T-027 · main 머지 후 라이브 배포 지연을 '배포 안 됨'으로 오진

- **증상**: main에 PR 머지 직후 라이브 Vercel URL이 최신 반영 안 됨(직전 버전 렌더). `gh api repos/.../deployments`에도 머지 커밋의 Production 배포 기록이 안 보여 "배포 파이프라인이 끊겼나" 의심.
- **원인**: (1) Vercel Production 전파에 머지 후 수 분 소요. (2) GitHub Deployments API 기록이 실제 Vercel 배포보다 늦게(또는 불완전하게) 남음 — 브랜치 푸시는 Preview로 바로 뜨는데 main 머지의 Production 기록은 지연. 둘 다 '무성 지연'이라 즉시 확인하면 스테일이 정상처럼 보인다.
- **해결**: 즉시 단정하지 말고 수 분 뒤, **GH API가 아니라 실제 라이브 사이트를 직접 완주**해 반영 확인. (이번엔 다음 PR(#15) 머지 시점에 이전(#14 장부)까지 함께 라이브 반영됨을 확인.)
- **재발방지**: main 머지 후 배포 검증은 (a) 몇 분 여유 두고 (b) 라이브 URL 실제 로드로 한다. GH Deployments API의 배포 누락/지연을 '파이프라인 고장'으로 단정하지 않는다.

---

## T-028 · 워크트리에서 `gh pr merge --delete-branch`가 로컬 후처리에서 깨짐

- **증상**: 워크트리(feature 브랜치) 안에서 `gh pr merge <N> --squash --delete-branch` 실행 → `failed to run git: fatal: 'main' is already used by worktree at ...`로 명령이 중단. "머지가 실패했나" 오인.
- **원인**: GitHub **API 머지 자체는 성공**하지만, `gh pr merge`의 **로컬 후처리 단계**(머지 후 기본 브랜치 main으로 체크아웃/갱신)가 main이 다른 워크트리에서 이미 사용 중이라 실패. 이 단계에서 중단돼 **원격 브랜치 삭제(`--delete-branch`)까지 실행되지 않는다.** 즉 "머지 O / 원격 브랜치 삭제 X / 로컬 정리 X"의 어정쩡한 상태로 남는다.
- **해결**: (1) 실패 메시지에 속지 말고 `gh pr view <N> --json state,mergeCommit`로 **실제 머지 여부 확인**(state=MERGED면 머지는 된 것). (2) 원격 브랜치 수동 삭제 `git push origin --delete <branch>`. (3) `git fetch origin --prune`. (4) 로컬 main 최신화는 main 워크트리에서 `git -C <main-worktree> pull --ff-only origin main`로 따로.
- **재발방지**: 워크트리 상시 사용 환경에선 `gh pr merge`의 자동 브랜치 정리에 의존하지 않는다. **머지(`--squash`)와 원격 브랜치 삭제·로컬 main ff를 별도 단계로 분리**해 수행한다. (main이 워크트리에 물려 있으면 `gh`/`git`이 그 ref를 직접 못 건드린다 — [T-027]과 같은 "머지는 됐는데 후속이 어긋남" 계열.)

---

## T-029 · Windows에서 `git mv`는 대상 디렉토리를 자동 생성하지 않음

- **증상**: 디렉토리 재구성 중 `git mv <src> <newdir>/<file>` 실행 → `fatal: renaming ... failed: No such file or directory`. 에러가 **소스 경로**를 가리켜 "소스가 없나" 오인. `&&`로 여러 mv를 묶었으면 여기서 체인이 끊겨 뒤 명령(learning-notes 삭제 등)이 통째로 스킵된다.
- **원인**: `git mv`는 대상의 **상위 디렉토리를 자동 생성하지 않는다** — 이미 존재하는 디렉토리로만 옮긴다. `claude-docs/superpowers/specs/`처럼 새 중첩 경로로 옮기면 그 디렉토리가 없어 실패하고, 메시지가 소스를 지목해 원인(대상 디렉토리 부재)을 가린다.
- **해결**: 이동 전 `mkdir -p <newdir>`로 대상 디렉토리를 먼저 만든 뒤 `git mv`. 체인이 끊겼으면 `git status`로 중단 지점 확인 후 나머지 재개.
- **재발방지**: 파일을 **새 하위 경로**로 옮길 땐 `mkdir -p` 선행을 기본으로. `&&` 체인 mv는 중간 실패가 조용히 나머지를 건너뛰므로, 묶음 mv 후 반드시 `git status`로 전수 반영 확인.

---

## 이 프로젝트에서 이미 알고 있는 전제(참고)

- **Next.js 16 breaking change**: 이 버전은 학습 데이터와 API/구조가 다를 수 있음. Next 관련 코드(App Router, route handler 등) 작성 전 `node_modules/next/dist/docs/` 의 해당 가이드를 먼저 볼 것. ([AGENTS.md](../AGENTS.md) 지침)
- **한글 커밋 메시지**: PowerShell 5.1 인라인 `-m`은 CP949로 깨짐 → `.commit-msg-tmp`(UTF-8) 파일 경유 `git commit -F` 사용(글로벌 T-026).
