# troubleshooting — 함정 + 승격

> 1분+ 디버깅했으면 원인 잡힌 직후 한 항목(`T-###`, 글로벌 시퀀스를 이음).
> 형식: 증상 / 원인 / 해결 / 재발방지. 같은 함정 다른 맥락 2회+ → 글로벌·훅으로 승격.
> 관련: [plan.md](plan.md) · [changeLog.md](changeLog.md)

## 목차

- [T-027](#t-027--main-머지-후-라이브-배포-지연을-배포-안-됨으로-오진) · main 머지 후 배포 지연을 '배포 고장'으로 오진
- [T-028](#t-028--워크트리에서-gh-pr-merge---delete-branch가-로컬-후처리에서-깨짐) · 워크트리에서 `gh pr merge --delete-branch` 로컬 후처리 실패(머지는 성공)
- [T-029](#t-029--windows에서-git-mv는-대상-디렉토리를-자동-생성하지-않음) · Windows `git mv`는 대상 디렉토리를 자동 생성 안 함 (mkdir -p 선행)
- [T-030](#t-030--워크트리엔-node_modules가-없어-node_modules-상대링크가-깨진-것처럼-오진됨) · 워크트리엔 node_modules가 없어 `node_modules/...` 링크가 깨진 것처럼 오진됨
- [T-031](#t-031--브리프의-특정-플레이런-예시확인됨를-보편-불변식으로-오인할-뻔함) · 브리프의 특정 플레이런 예시("확인됨")를 보편 불변식으로 오인할 뻔함
- [T-032](#t-032--dev-서버가-켜진-채-next-build를-돌리면-nextdev-캐시가-손상돼-ise) · dev 서버 켠 채 `next build` → `.next/dev` 손상(ISE, 코드는 멀쩡)
- [T-033](#t-033--getcomputedstyle은-compositor-가속-cssopacityfiltertransform의-전환-중간값을-못-읽어-애니메이션이-무효처럼-보임) · getComputedStyle은 compositor 애니메이션(opacity/filter/transform) 중간값을 못 읽음
- [T-034](#t-034--in-app-브라우저-get_page_text가-페이즈-전환-후-stale-화면을-반환read_page는-최신) · in-app 브라우저 get_page_text가 전환 후 stale 화면 반환(read_page는 최신)
- [T-035](#t-035--darkreader-등-브라우저-확장의-html-속성-주입을-next-하이드레이션-버그로-오진) · DarkReader 등 확장이 하이드레이션 전 `<html>` 속성 주입 → hydration mismatch(우리 코드 무관, `suppressHydrationWarning`)
- [T-036](#t-036--in-app-브라우저-computer-left_click이-fast-refresh-churn-중-react-onclick에-안-잡힘native-click은-정상) · in-app 브라우저 `computer left_click`이 Fast Refresh churn 중 React onClick에 안 잡힘(native `.click()`은 정상)
- [T-037](#t-037--서브에이전트가-근거-문서의-일부만-읽고-게임-전제가-리서치와-모순된다고-과잉주장--같은-문서-6줄-아래가-그-전제를-확증하고-있었음) · 서브에이전트가 근거 문서 일부만 읽고 과잉주장 — 인용은 정확한데 결론이 틀림(문서 vs 코드, 어느 쪽이 낡았나부터)
- [T-038](#t-038--stale한-main에서-뗀-워크트리로-lint를-돌려-폐기된-개념을-문서에-새로-써넣음) · stale한 main에서 뗀 워크트리로 lint → 120에이전트가 낡은 코드를 읽고 폐기된 개념을 문서에 새로 써넣음

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

---

## T-034 · in-app 브라우저 get_page_text가 페이즈 전환 후 stale 화면을 반환(read_page는 최신)

- **증상**: SetupWizard 개원 버튼 클릭 후 `get_page_text`가 계속 SETUP 화면("병원 설립…")을 반환 → "클릭이 안 먹혔다"고 반복 재클릭. 실제로는 이미 RECEIVING으로 전환돼 있었다(`read_page`는 "보톡스 상담 워크인 수용/거절"을 최신 반영). 곁들여 `computer{screenshot}`이 30s 타임아웃으로 멈추고, React onClick이 `javascript_tool`의 `button.click()`(native click)에 반응하지 않아 혼란 가중.
- **원인**: (1) `get_page_text`는 캐시된 텍스트를 반환할 수 있어 클라이언트 라우팅/상태 전환 직후 **이전 화면**을 보여준다 — `read_page`(접근성 트리)는 실시간 DOM을 읽어 최신. (2) `computer{screenshot}`은 렌더러 상태에 따라 일시적으로 멈출 수 있으나 페이지 자체는 살아있다(텍스트 도구는 정상 응답). (3) React 합성 이벤트가 프로그램적 `.click()`에 항상 위임되진 않는다.
- **해결**: 페이즈/화면 전환 검증은 **`read_page`로 교차 확인**(`get_page_text`만으로 "전환 안 됨" 단정 금지). 클릭은 `computer{left_click, ref}`(read_page가 준 ref)로 — 활성화된 버튼은 이름 반영 후 read_page에 ref로 잡힌다. screenshot이 멈추면 텍스트 도구(read_page/get_page_text)로 우회.
- **재발방지**: SPA 상태 전환 후엔 **read_page를 진실원본으로** 신뢰. 컨트롤드 인풋 값이 안 들어가면(React state 미반영) `form_input` 대신 `computer{left_click}`+`type`으로 실제 입력, 버튼은 `.click()`(JS) 말고 ref 클릭. (T-032/T-033에 이은 "브라우저 검증 도구의 무성 오해" 계열.)

---

## T-035 · DarkReader 등 브라우저 확장의 `<html>` 속성 주입을 Next 하이드레이션 버그로 오진

- **증상**: 로컬 `localhost:3000` 첫 로드에서 Next dev 오버레이 "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties" (Console Error). diff가 `<html>`의 `data-darkreader-proxy-injected="true"`를 서버/클라 불일치로 지목 → "우리 `layout.tsx`의 하이드레이션 버그"로 오진할 뻔.
- **원인**: 브라우저 확장 **DarkReader**(다크모드)가 React 하이드레이션 **전에** `<html>`에 `data-darkreader-*` 속성을 주입 → 서버가 보낸 HTML엔 없던 속성이 클라 DOM에 생겨 속성 불일치. **우리 코드 무관.** 증거: (1) 속성 이름에 'darkreader' 명시, (2) 확장 없는 in-app 브라우저는 `<html>`에 lang·class만·에러 0, (3) Next 에러 문구가 "browser extension … messes with the HTML before React loaded" 명시. dev 오버레이 전용·기능 무해(프로덕션·확장 없는 사용자엔 안 뜸).
- **해결**: 루트 레이아웃 `<html>`에 `suppressHydrationWarning`(Next 16.2 공식 패턴 — `node_modules/next/dist/docs/.../preventing-flash-before-hydration.md`가 `<html … suppressHydrationWarning>` 예시). 이 **한 요소의 속성/텍스트 불일치만** 억제하며, 자식·컴포넌트의 실제 하이드레이션 버그는 그대로 잡힌다.
- **재발방지**: `data-*` 속성 불일치 하이드레이션 경고는 **코드 손대기 전 확장 유발부터 의심** — 속성 이름에 확장명이 박혀 있거나, 확장 없는 브라우저(시크릿/다른 브라우저/in-app)에서 재현 안 되면 확장 원인. 루트 `<html>`엔 `suppressHydrationWarning`를 기본 하드닝으로. (T-032~T-034에 이은 "브라우저 환경발 무성 오진" 계열.)

---

## T-036 · in-app 브라우저 `computer left_click`이 Fast Refresh churn 중 React onClick에 안 잡힘(native `.click()`은 정상)

- **증상**: 새 버튼(랜딩 "시작")을 `computer{left_click, ref}`로 2회 눌러도 페이즈 전이 없음. 버튼은 정상(좌표·크기 정확·`disabled=false`·`pointerEvents:auto`), 콘솔 에러 0. "onClick 배선/전이 로직이 틀렸나" 의심.
- **원인**: 코드는 정상. `javascript_tool`로 같은 버튼에 native `.click()`을 주니 **즉시 전이**(위저드 h1 "어떤 병원을 세우시겠습니까" 렌더)됨 → 핸들러·`beginSetup` 전이는 옳음. 직전 다수 편집으로 Fast Refresh(HMR) rebuild가 연달아 돌던 타이밍에 in-app 브라우저의 좌표 합성 클릭이 React 이벤트로 전달되지 못한 **도구 쪽 전달 실패**로 판단. ⚠️ **T-034와 정반대** — 거기선 native `.click()`이 안 먹고 ref 클릭이 정답이었는데, 여기선 ref 클릭이 새고 native `.click()`이 정답. 즉 **어느 클릭 방식도 100% 신뢰 불가**(HMR 몰릴 때 양방향으로 샘).
- **해결**: 클릭 반응이 없을 때 코드부터 의심하지 말고, 다른 클릭 방식으로 교차 검증 — ref 좌표 클릭이 안 먹으면 `javascript_tool`의 native `.click()`(또는 `dispatchEvent`)으로, 그 반대도. 전이 여부는 클릭 도구 반환이 아니라 **실제 상태 변화**(`read_page`/`get_page_text`의 h1·input 존재, 또는 JS로 상태 질의)로 판정.
- **재발방지**: in-app 브라우저에서 "버튼이 안 먹는다"를 UI/코드 버그로 단정하지 않는다(T-033/T-034와 같은 검증 도구 blind-spot 계열). Fast Refresh가 몰아친 직후엔 클릭이 어느 방식으로든 샐 수 있으니, **핸들러 자체를 native `.click()`로 격리 검증**하고 전이는 실제 DOM 상태로 확인한다.

---

## T-037 · 서브에이전트가 근거 문서의 일부만 읽고 "게임 전제가 리서치와 모순된다"고 과잉주장 — 같은 문서 6줄 아래가 그 전제를 확증하고 있었음

- **증상**: LLM Wiki 대조 워크플로우의 구멍분석 에이전트가 최우선 결함으로 *"`game-concept.md`의 병상 0 하드락 전제가 리서치와 모순되며 33커밋 동안 방치됐다"*고 보고. 근거로 `medical-system-grounding.md:12`("게임이 현실의 지배적 병목을 뒤집는다 — 1위는 전문의/배후진료 부재 41.9%, 병상은 15.0%로 3위")를 인용 — 인용 자체는 정확했다. 그대로 믿었으면 **게임의 핵심 메커니즘을 멀쩡한데 뜯어고칠 뻔했다.**
- **원인**: 인용은 맞지만 **문서의 나머지를 안 읽었다.** 같은 파일 `:19`가 「✅ 확증된 것」 섹션에서 정반대를 명시한다 — *"'NO_BED=0이면 어떤 설득에도 안 뚫린다'는 하드락 전제는 **현실적**"*. 리서치의 교정은 "하드락이 틀렸다"가 아니라 "**지배 병목의 비중**"에 관한 것이었고, 그 교정은 이미 PR #11로 `adjudicate.ts`에 4게이트로 반영돼 있었다. 즉 에이전트가 **한 문서 안의 「교정」 섹션만 읽고 「확증」 섹션을 못 봐서**, 낡은 것(문서)과 최신인 것(코드)의 방향을 거꾸로 짚었다.
- **해결**: 컨트롤러가 헤드라인 발견을 **직접 대조 검증**해 잡음(`medical-system-grounding.md` 앞부분 통독 + `adjudicate.ts` 실물 확인 + `git log -- docs/game-concept.md`로 무갱신 확인). 정확한 사실은 "게임이 틀렸다"가 아니라 **"리서치가 코드로는 흘러갔고 문서로는 안 흘러갔다"**였고, 이 교정이 결론을 뒤집기는커녕 더 날카롭게 만들었다. 후속 lint 워크플로우엔 이 사실을 **가드 문단으로 프롬프트에 못박아**(확증된 것/교정된 것 구분 + "게임 디자인 변경은 범위 밖") 투입 → 38건 중 16건 기각, 하드락 방어 성공.
- **재발방지**: 서브에이전트가 "X가 Y와 모순된다"고 보고하면 **인용의 정확성과 결론의 타당성을 따로 검증**한다 — 인용이 맞아도 결론이 틀릴 수 있다(문서의 다른 섹션이 뒤집을 수 있으므로). 특히 **문서 vs 코드가 어긋날 때 어느 쪽이 낡았는지를 먼저 확정**한다(`git log -- <file>`로 최종 수정 시점 대조). 리서치 문서를 근거로 쓰는 에이전트에겐 **「확증된 것」과 「교정된 것」을 구분해 보고하라**고 명시하고, 확증 항목은 건드리지 못하게 가드를 건다. ([[fact-grounding-before-mechanics]] 계열 — 사실 검증이 메커니즘에 선행하되, *검증 결과 자체도 검증*이 필요하다.)

---

## T-038 · stale한 main에서 뗀 워크트리로 lint를 돌려, 폐기된 개념을 문서에 새로 써넣음

- **증상**: `game-concept.md`가 낡았다는 걸 잡아 120에이전트 lint로 13건을 교정하고 PR #36까지 올린 뒤, 사실 재확인 중 `main`의 tip이 작업 base(`3fc255e`, #33)가 아니라 **`3afee90`(#35)** 임을 발견. 그 사이 #34(하루 자리 제한)·#35(7일 루프+달력, **분기 폐기**)가 머지돼 `src/` **15개 파일**이 바뀌어 있었다(`session.ts` +106, `receiving.ts` +162, `quarterProgress`→`dayProgress`, `DayEnd.tsx` 신설). **낡은 문서를 고치면서 이미 폐기된 개념("분기 손익"·"분기 진료 수익")을 새로 써넣었고**, 코어 루프도 `DAY_END`가 없는 옛 6페이즈로 적었다. 13건 중 3건 오염.
- **원인**: 워크트리를 **stale한 base에서 뗀 채로 시작**했고, 작업 내내 `git fetch`·`origin/main` 대조를 한 번도 하지 않았다. 글로벌 CLAUDE.md가 *"워크트리로 분리해 작업하기 전, 반드시 로컬 main을 먼저 최신화한다 … stale한 main에서 떼지 않는다"*로 정확히 이 사고를 막으려 명시하고 있었으나 지키지 않았다. **증폭 요인**: 120에이전트가 전부 그 낡은 트리를 읽어, 잘못된 전제가 병렬로 증폭되고 "적대 검증 3렌즈 통과"라는 신뢰 외피까지 입었다 — 검증은 *트리 안에서의 정합성*만 봤지 *트리 자체가 최신인지*는 아무도 안 봤다.
- **해결**: `git fetch origin` → `git log HEAD..origin/main`으로 놓친 커밋 확인 → `git merge origin/main`(리베이스는 changeLog 충돌 + 이미 push된 이력이라 머지-포워드 선택) → 새 코드(`setup.ts` `FIXED_BEDS=3`·`DAYS_PER_WEEK=7`, `ledger.ts` `'이번 주 진료 수익'`) 기준으로 오염 3건 재작성. `grep -n "분기" docs/game-concept.md` 0건으로 확인.
- **재발방지**: **작업 시작 시 `git fetch origin && git log --oneline HEAD..origin/main`을 먼저 돌린다** — 워크트리를 남이(또는 이전 세션이) 만들어 건네줬어도 base 신선도는 내가 확인한다. 특히 **코드를 근거로 문서를 고치는 작업(lint·동기화)은 base가 stale하면 결과가 통째로 무효**이므로, 서브에이전트를 대량 투입하기 **전에** 신선도를 검증한다(에이전트 120개를 낡은 트리에 태우면 비용도 결과도 함께 버린다). ⚠️ **T-027/T-028과 같은 "머지는 됐는데 후속이 어긋남" 계열**이되, 여기선 *내 base가* 어긋났다. 아이러니: 이 사고는 "문서가 코드를 못 따라간다"를 고치는 PR이 **같은 이유로 실패한 것**이라, feature-pull 진단([[not-llm-wiki-but-llm-run-workflow]])의 뜻밖의 자기 증명이 됐다.
