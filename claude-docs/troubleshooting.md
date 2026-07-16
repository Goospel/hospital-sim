# troubleshooting — 함정 + 승격

> 1분+ 디버깅했으면 원인 잡힌 직후 한 항목(`T-###`, 글로벌 시퀀스를 이음).
> 형식: 증상 / 원인 / 해결 / 재발방지. 같은 함정 다른 맥락 2회+ → 글로벌·훅으로 승격.
> 관련: [plan.md](plan.md) · [changeLog.md](changeLog.md)

## 목차

- [T-027](#t-027--main-머지-후-라이브-배포-지연을-배포-안-됨으로-오진) · main 머지 후 배포 지연을 '배포 고장'으로 오진
- [T-028](#t-028--워크트리에서-gh-pr-merge---delete-branch가-로컬-후처리에서-깨짐) · 워크트리에서 `gh pr merge --delete-branch` 로컬 후처리 실패(머지는 성공)
- [T-029](#t-029--windows에서-git-mv는-대상-디렉토리를-자동-생성하지-않음) · Windows `git mv`는 대상 디렉토리를 자동 생성 안 함 (mkdir -p 선행)
- [T-030](#t-030--워크트리엔-node_modules가-없어-node_modules-상대링크가-깨진-것처럼-오진됨) · 워크트리엔 node_modules가 없어 `node_modules/...` 링크가 깨진 것처럼 오진됨
- [T-031](#t-031--브리프의-특정-플레이런-예시-확인됨을-보편-불변식으로-오인할-뻔함) · 브리프의 특정 플레이런 예시("확인됨")를 보편 불변식으로 오인할 뻔함
- [T-032](#t-032--dev-서버가-켜진-채-next-build를-돌리면-nextdev-캐시가-손상돼-ise) · dev 서버 켠 채 `next build` → `.next/dev` 손상(ISE, 코드는 멀쩡)
- [T-033](#t-033--getcomputedstyle은-compositor-가속-cssopacityfiltertransform의-전환-중간값을-못-읽어-애니메이션이-무효처럼-보임) · getComputedStyle은 compositor 애니메이션(opacity/filter/transform) 중간값을 못 읽음

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

## T-030 · 워크트리엔 node_modules가 없어 `node_modules/...` 상대링크가 깨진 것처럼 오진됨

- **증상**: README의 `[Next.js env 가이드](node_modules/next/dist/docs/01-app/02-guides/environment-variables.md)` 링크가 "깨졌다"고 신고됨(PR #22 발견). 워크트리에서 `Glob node_modules/next/dist/docs/**/*environment*` → `No files found`. Next 16에서 docs 경로가 이동/개명된 것으로 오인.
- **원인**: git **워크트리는 기본적으로 node_modules를 공유하지 않는다** — 각 워크트리는 자체 `npm install`이 없으면 node_modules 자체가 비어 있다. 확인을 워크트리 안에서 하면 "파일 없음"이 나오지만, **메인 체크아웃엔 정확히 그 경로에 파일이 존재**한다(설치본 Next 16.2.10, `01-app/02-guides/environment-variables.md`, 제목 "How to use environment variables in Next.js"). 경로는 이동/개명된 적 없다 — 링크는 원래 정확했다.
- **해결**: node_modules 참조의 존재 검증은 **node_modules가 실제 설치된 체크아웃**(대개 메인 워크트리)에서 한다: `ls <main-worktree>/node_modules/next/dist/docs/...`. 그럼에도 `node_modules/...` 상대링크는 **gitignore라 GitHub 렌더 README·신규 클론에서는 죽는다** → 사람 대상 링크는 공식 URL을 병기(설치본 경로는 버전-정확 복사용 인라인 코드로 유지). ([AGENTS.md](../AGENTS.md)의 node_modules 가이드 참조 컨벤션은 유지.)
- **재발방지**: "워크트리에서 파일/모듈이 없다"를 곧바로 "삭제/이동됐다"로 단정하지 않는다 — **node_modules·빌드 산출물 등 gitignore 대상은 워크트리에 없는 게 기본**이다. 존재 검증은 설치본 있는 곳에서. node_modules 상대링크를 사람용 문서에 둘 땐 공식 URL 병기. (T-027/T-028과 같은 "성급한 오진" 계열.)

---

## T-031 · 브리프의 특정 플레이런 예시("확인됨")를 보편 불변식으로 오인할 뻔함

- **증상**: Task 7 브리프가 "1막 순이익 숫자(막간)는 결말 장부 첫 줄과 같은 값이다(데이터상 이미 일치 — 공범런 +228억↔+228억, 양심런 −24억↔−24억 확인됨)"라고 명시 → 이를 그대로 믿고 Interstitial에 "이 숫자, 결말 장부에도 그대로 남는다"(항상-동일 단언) 카피를 넣을 뻔함.
- **원인**: `session.ts`/`receiving.ts`/`ledger.ts`를 추적해보니 이 등식은 **`lawsuitExposure === 0`일 때만** 성립한다. 공범 경로(순환기 배후 없음)는 `adjudicateTransfer`가 STEMI 콜을 항상 `NO_BACKUP_CARE`로 하드락 거절하므로 소송 노출이 구조적으로 항상 0(등식 항상 성립). 그러나 양심 경로(순환기 배후 있음)는 STEMI 콜이 `CHOICE`로 열려 있어 **플레이어가 수용하면**(오히려 "양심적으로 환자를 받는다"는 서사와 자연스레 맞아떨어짐) `lawsuitExposure`가 올라가고, 결말 장부에서 소송 비용이 추가로 깎여 막간 숫자와 달라진다. 브리프의 "확인됨"은 **그 특정 플레이테스트 런**(마침 소송 노출 0)에서 참이었을 뿐, 코드가 보장하는 보편 불변식이 아니었다.
- **해결**: `adjudicate.ts`(게이트 우선순위)·`receiving.ts`(`decide`의 `lawsuitExposure` 누적)·`session.ts`(`buildEpilogue`)를 직접 추적해 등식이 조건부임을 확인 → 카피를 "그대로 남는다"(단언)에서 "오늘 손익은 여기서 끝나지 않는다 — 결말 장부로 이어진다"(항상 참인 인과 서술)로 낮춤.
- **재발방지**: 브리프·스펙이 "데이터상 이미 확인됨"이라고 제시하는 구체적 수치 예시는, 그 자체로 **코드가 보장하는 불변식이라는 증거가 아니다** — 사용자 대면 카피(특히 이 코드베이스처럼 "해석 0 / 사실만 단언" 원칙이 있는 곳)에 수치적 단언을 넣기 전엔, 근거 함수(판정·누적 로직)를 직접 추적해 **모든 분기에서** 참인지 확인한다. 예시 2개가 맞았다고 전체 분기가 맞다는 보장은 아니다.

---

## 이 프로젝트에서 이미 알고 있는 전제(참고)

- **Next.js 16 breaking change**: 이 버전은 학습 데이터와 API/구조가 다를 수 있음. Next 관련 코드(App Router, route handler 등) 작성 전 `node_modules/next/dist/docs/` 의 해당 가이드를 먼저 볼 것. ([AGENTS.md](../AGENTS.md) 지침)
- **한글 커밋 메시지**: PowerShell 5.1 인라인 `-m`은 CP949로 깨짐 → `.commit-msg-tmp`(UTF-8) 파일 경유 `git commit -F` 사용(글로벌 T-026).

## T-032 · dev 서버가 켜진 채 `next build`를 돌리면 `.next/dev` 캐시가 손상돼 ISE

- **증상**: `next dev` 서버가 떠 있는 상태에서 `next build`를 실행한 뒤, dev 서버가 500 Internal Server Error만 반환. dev 로그에 `ENOENT: build-manifest.json / routes-manifest.json`, `Cannot find module '.../[turbopack]_runtime.js'`, `Persisting failed: Unable to write SST file`, `Another write batch or compaction is already active`.
- **원인**: `next dev`와 `next build`가 **같은 `.next/`**(특히 `.next/dev`)에 동시에 쓴다. 빌드가 dev의 매니페스트/청크를 덮어써 dev 런타임이 참조하는 파일이 사라진다(Windows + Turbopack에서 특히 무성 파괴). 코드·타입은 멀쩡하고 **빌드 자체는 exit 0**인데 **dev 런타임만** 깨져 "내 코드가 깨뜨렸나"로 오진하기 쉽다.
- **해결**: dev 서버 중지(`preview_stop`) → `rm -rf .next` → dev 재시작(`preview_start`). 캐시 재생성으로 복구.
- **재발방지**: 브라우저 검증용 dev 서버가 떠 있는 동안 `next build`(배포 게이트)를 돌리지 않는다 — 게이트는 dev를 내린 뒤 실행. 서브에이전트에 "dev가 컨트롤러 세션에서 돌고 있으니 `next build` 금지, tsc·vitest까지만"을 명시(이번 손상은 명시 이전 실행에서 발생).

---

## T-033 · getComputedStyle은 compositor 가속 CSS(opacity/filter/transform)의 전환 중간값을 못 읽어 애니메이션이 무효처럼 보임

- **증상**: 막간 붕괴(transition) 검증 중 [계속] 클릭 후 여러 시점(100/250/450/600ms)에서 `getComputedStyle(el).filter/opacity/scale`을 읽으니 **전 구간 시작값**(grayscale(0)·opacity 1·scale 1)만 나와 "애니메이션이 전혀 안 먹는 중대 결함"으로 오진할 뻔함. 정작 전이 종료 시점엔 정확한 최종값(grayscale(1)·0.4·1.1).
- **원인**: `opacity`·`filter`·`transform`/`scale`은 **compositor 스레드에서 가속**돼, 메인 스레드의 `getComputedStyle`이 진행 중 보간값을 반영하지 못한다 — base 또는 target만 반환하고 **중간값은 절대 안 나온다**. 즉 "중간에 base로 읽힘"은 애니메이션 실패 증거가 아니다.
- **해결**: (1) 유틸 클래스가 실제 효과를 내는지는 **독립 프로브 요소**로 확인(`<div class="grayscale opacity-40 scale-110">`의 computed = grayscale(1)·0.4·scale 1.1). (2) 실제 요소는 collapsing className 부착 + `transition-property/duration` 선언 + **최종 상태** 정확성으로 판정 — CSS 시맨틱상 (transition 선언 + 속성 변화 + 최종값 도달)이면 브라우저가 보간한다.
- **재발방지**: compositor 속성 전환은 getComputedStyle **다시점 샘플로 매끄러움을 측정하지 않는다** — 클래스 적용·transition 선언·최종값으로 검증. (부수: Tailwind v4의 `scale-*`은 `transform`이 아니라 CSS `scale` 속성 → `.transform` 말고 `.scale`을 읽어야 함.)
