# changeLog — 완료 기록 (역순)

> 매 작업(대체로 PR) 완료 시 맨 위에 한 항목. 코드 세부는 PR·커밋에, 여기선 **왜/무엇을**만.
> 날짜는 KST 절대일자. 관련: [plan.md](plan.md) · [troubleshooting.md](troubleshooting.md)

## 2026-07-17 · 문서 lint 패스 — game-concept를 코드·리서치 현재 상태에 동기화 (PR TBD · claude/llm-wiki-usage-650f84)

- **무엇을**: `docs/game-concept.md` 13건 교정 + `plan.md` 2건. 부트스트랩(`93f18ea`) 이후 **34커밋 무갱신**이라 문서가 **게임 1막(설립 위저드·콜 트리아지) 전체를 모르고** 있었다. (1) 숨은 제약 2종(가용 병상·당직 전문의) → **4종**(병상·응급실 당직·과밀·**배후진료 역량**) — `types.ts:14-17`이 폐기 선언한 옛 개념 제거. (2) 코어 루프 → 실제 6페이즈(LANDING→SETUP→RECEIVING→INTERSTITIAL→EMERGENCY→EPILOGUE) + IN_HOUSE/TRANSFER 분기. (3) 2막 구조·설립 위저드·병원 장부를 시점·메커니즘·MVP 절단선에 도입. (4) 코드에 0건인 것(반사실 분할·간이 지도·문진 채팅·LLM 저지)에 ⏸ 표기. (5) 디브리핑을 "AI 1콜"→**결정론 순수 함수**로 정정하고 해석 카피("당신은 옳았다, 문제는 구조였다") 제거 — `debrief.ts:5-8`·팩트시트 §59가 명시 거부하는 show-don't-tell 위반이었음. (6) 톤 가드레일은 **본문 복제 대신 리서치 포인터 한 줄**. (7) 깨진 앵커 2건(`#7-…-축` / `…축--결정됨` → 실제 슬러그 `…축---결정됨`). (8) `plan.md`: learning-notes 삭제 사실 반영 + 판정 규칙 2종→4종.
- **왜**: **P7(8/3~8/7)에 ③게임소개 PDF를 이 문서에서 쓴다** — lint 전이었다면 존재하지 않는 게임을 설명하는 PDF가 나온다. 계기는 Karpathy **LLM Wiki 패턴 대조**(46에이전트)였고 판정은 **"우리는 LLM Wiki가 아니다"**(9요소 중 strong 0/partial 1/stretch 6/부재 2): 트리거가 source-push가 아니라 **feature-pull**이라 기존 페이지를 재검토할 계기가 원리적으로 없고, 그래서 지식이 문서가 아니라 **코드로 굳는다**. 이 lint가 그 진단의 실물 증거이자 첫 역류(리서치·코드 → 문서) 1건이다.
- **범위**: 문서만, **코드 변경 0**. 120에이전트 lint(5축 스윕 → 3렌즈 적대검증)로 38건 중 **16건 기각**. 손대지 않은 것: **병상 0 하드락**(medical-system-grounding.md:19가 "현실적"이라 명시 확증 — 교정 대상은 하드락이 아니라 *지배 병목의 비중*이고 그건 PR #11로 이미 코드 반영됨) · 3대 문제 절의 퍼센트(단일 출처는 리서치, 이중 기재는 새 drift 소스) · 136줄 "AI가 연기하는 전원 담당자"(구현 현황이 아니라 **설계 결정 기록**). 검증: 앵커 2/2 OK · 상대링크 4/4 실존 · 0 broken.

## 2026-07-17 · 부문 손익을 분기 진행률만큼 누적 — t=0 선반영 제거 (PR #33)

- **무엇을**: RECEIVING 러닝 장부의 "부문 손익"이 콜 1/5(진료 0)부터 과별 손익(건강검진 +40 등)을 **전액 선반영**하던 걸, **분기 진행률(처리한 콜/전체)만큼 0에서 누적**하도록 변경. 콜 0/5→전 부문 0, 콜을 처리할수록 각 과가 자기 구조 손익을 향해 자라고, 분기말(done)에 전체 수치 도달. `quarterProgress(state)`·`accruedSegments(state)` 순수 함수 추가, `runningNetProfit`이 누적 부문 손익을 쓰도록 변경, `CheerfulLedger`(ReceivingPhase)가 `accruedSegments`를 렌더.
- **왜**: "진료를 볼수록 흑자/적자"가 시뮬의 논리인데, 진료 전인 t=0에 이미 벌어놓은 건(예: 건강검진 시작부터 +40억) 부자연스럽고, 게다가 어느 과가 흑자/적자인지 처음부터 흘려 show-don't-tell(PR #32 취지)과도 어긋남. 진행률 누적이 둘 다 해소. **금액·부호는 불변**(각 과의 최종 구조 손익은 그대로, 도달 타이밍만 바꿈). 결말 `buildSessionLedger`(1년치 완료)·Interstitial(진행률 1)은 값 불변.
- **범위**: `receiving.ts`(+quarterProgress·accruedSegments·runningNetProfit 변경)·`receiving.test.ts`(+8 TDD)·`ReceivingPhase.tsx`(accruedSegments 렌더). `tsc` 0 · `vitest` **324 green**(+8) · 브라우저 검증(콜1/5 전 부문 0·러닝 0·흑자 배지 없음 → 콜2/5 미용+28·검진+8·러닝+44·배지 등장 → done 전액 도달·콘솔 0). TDD Red(runningNetProfit index0=290, 기대 0)→Green. 기존 runningNetProfit 테스트는 빈 큐(진행률 1)라 회귀 0.

## 2026-07-17 · 위저드 2단계 분리 + 과 카드 해석 힌트 제거(show-don't-tell) (PR #32)

- **무엇을**: SETUP 위저드 개편. (1) **2단계 분리** — 랜딩 다음 첫 화면은 **병원 이름 하나만**(NAME 스텝, 딱 한 가지에 집중) → "다음" → 과 채용(DEPTS 스텝). 정보 과부하("너무 많은 정보")를 덜고 이름 확정 후 과 구성에만 집중하게. (2) **해석성 힌트 제거** — 과 카드의 "수익 예상 ↑"(emerald)·"적자 예상 · 소송 ⚠"(amber) 라벨과 색 구분을 없앰. 카드는 이제 **과 이름 + 채용비(N억/명)**만 노출(중립 사실). 상단 tell "순환기내과는 비워둬도 시작할 수 있습니다"도 중립 문구("예산 100억 안에서 진료과를 꾸립니다")로 교체.
- **왜**: 어느 과가 흑자고 어느 과가 적자·소송인지 미리 라벨로 흘리면 핵심 딜레마가 스포일된다. 플레이어가 **장부·결말을 겪으며 스스로 알게** 유도 — show-don't-tell 원칙(결말 한정이던 걸 SETUP까지 확장). `essential`/`lawsuitRisk`/`profit` 데이터는 게임 로직(backupCare·장부·소송 노출)이 그대로 쓰므로 **표시만 감추고 데이터·판정은 불변**.
- **범위**: `SetupWizard.tsx`만(내부 `step` state·카드 힌트 제거·중립 부제·"← 이름 수정" 뒤로가기). `setup.ts` 데이터·`session.ts` 무변경 → `onComplete(choices)` 계약 불변. `tsc` 0 · `vitest` **316**(로직 무변경) · 브라우저 전체 플로우 검증(랜딩→이름→다음→과 채용[힌트 0·tell 0]→개원→RECEIVING·뒤로가기 이름 보존·콘솔 0).

## 2026-07-17 · 랜딩 타이틀 카드 — 첫 화면 신설(LANDING 페이즈 승격) (PR #31)

- **무엇을**: URL 진입 시 곧장 위저드(채용 폼)가 뜨던 걸, 앞에 다크 지면 타이틀 카드("수화기 너머의 벽")를 세워 사용자가 처음 보는 화면으로. 원본 랜딩(97a012c)의 느낌을 되살리되 카피는 현재 게임(경영 전체 아크)에 맞춰 재프레이밍: "병원을 세우고, 환자를 받고, 그 대가를 치른다 / 최선을 다해도 결과를 정하는 건 당신이 아니라 **구조**다"(세우고=채용·받고=콜큐/응급·대가=결말). CTA=emerald(초록 1막 유혹→빨강 응급 아크의 시작점, 위저드 CTA와 동색)·마운트 fade-in(reduced-motion 존중). `LANDING`을 세션 페이즈로 **승격** — `startSession()→LANDING`, 신규 전이 `beginSetup()`(LANDING→SETUP, 가드). 재시작은 startSession 단일 진입점이라 자동으로 랜딩 리셋.
- **왜**: 첫 화면이 맥락 없는 채용 폼이면 세계관·논지 없이 던져진다. 타이틀 카드로 톤과 "구조" 논지를 먼저 세운다. UI 전용 boolean 대신 페이즈로 승격한 건, 이 레포가 모든 상태 전이를 결정론 순수 함수로 TDD하는 구조라 랜딩만 예외로 두면 결이 어긋나기 때문(exhaustive switch가 tsc에서 누락도 잡음).
- **범위**: `session.ts`(+LANDING·beginSetup)·`session.test.ts`(+3, 기존 `startSession→SETUP` 테스트를 →LANDING으로 갱신)·`Landing.tsx`(신규)·`SessionClient.tsx`(LANDING 케이스). 스펙 [superpowers/specs/2026-07-17-landing-title-card-design.md](superpowers/specs/2026-07-17-landing-title-card-design.md). `tsc` 0 · `vitest` **316 green**(+2) · 브라우저 검증(랜딩 렌더·카피 정확·시작→위저드 전이·콘솔 0). TDD Red(startSession→LANDING·beginSetup 부재로 실패)→Green. 검증 함정 [troubleshooting.md](troubleshooting.md) T-036.

## 2026-07-17 · 하이드레이션 경고 억제 — 루트 <html>에 suppressHydrationWarning (PR #30)

- **무엇을**: 로컬 첫 로드에서 뜨던 Next dev 하이드레이션 오버레이("some attributes of the server rendered HTML didn't match")를 잡음. 원인은 **우리 코드 아님** — 사용자 Chrome의 **DarkReader 확장**이 하이드레이션 전 `<html>`에 `data-darkreader-proxy-injected` 속성을 주입해 서버/클라 속성 불일치. 루트 레이아웃 `<html>`에 `suppressHydrationWarning` 추가(Next 16.2 공식 패턴).
- **왜**: 확장이 `<html>`/`<body>`를 건드리는 건 흔하고 프로덕션에선 조용히 넘어가지만 dev 오버레이가 플레이테스트를 방해. 표준 하드닝으로 제거. `<html>` 한 요소의 속성 불일치만 억제 — 자식·컴포넌트의 실제 하이드레이션 버그는 그대로 잡힌다.
- **범위**: `layout.tsx` 1속성 + 주석. 코드 로직 무변경. `tsc` 0 · `next build` 통과 · 브라우저 회귀 없음(확장 없는 in-app은 원래 에러 없음 → 최종 확인은 사용자 DarkReader Chrome에서 재로드). 진단 함정 → [troubleshooting.md](troubleshooting.md) T-035.

## 2026-07-17 · 발신자 대사 라벨↔대사 정합 — callerPleaAt(kind 내 등장 순번 seed) (PR #29)

- **무엇을**: RECEIVING 콜 c3 "검진 패키지 문의" 라벨에 보톡스 대사("보톡스 상담 예약 가능할까요?")가 붙던 불일치 수정. `callerPlea(call, seed)`의 seed는 "같은 kind 안에서의 변주"용인데 컴포넌트가 **전역 큐 index**(0,2,…)를 넘겨, 두 COSMETIC_WALKIN 콜이 `index%2==0`→pool[0]로 충돌했음. 순수 함수 `callerPleaAt(queue, index)` 추가 — kind 내 **등장 순번**(0,1,…)을 계산해 seed로 넘김 → c1(순번0)→pool[0] 보톡스 / c3(순번1)→pool[1] 검진. `ReceivingPhase`가 이 함수를 쓰도록 배선.
- **왜**: 제출 영상·스크린샷(P6/④)에 그대로 노출되면 리뷰어가 알아챌 유일한 실콘텐츠 결함이라 캡처 전에 잠금. `callerPlea`의 docstring이 이미 "같은 콜 종류 안에서 변주"라 규정 — 전역 index는 그 계약 위반이었고, 등장 순번이 계약에 맞는 seed.
- **범위**: `dialogue.ts`(+`callerPleaAt`)·`dialogue.test.ts`(+5 회귀/변주/결정론/범위)·`ReceivingPhase.tsx`(1줄 배선). `callerPlea`/#27 테스트 유지. `tsc` 0 · `vitest` **314 green**(+5) · `next build` 통과 · 브라우저 검증(콜 3이 검진 대사 렌더·콘솔 0). TDD Red(회귀 테스트가 전역-index 버그를 잡음)→Green.

## 2026-07-17 · 양심 경로 완주 코드 검증 + Step 5 스크린샷 상태 정리 (docs)

- **무엇을**: Preview로 **양심 경로**를 처음부터 끝까지 완주 검증(이번 세션 이전엔 공범 경로만 검증됨). 양심대학병원(순환기 2명·60억) SETUP→RECEIVING(콜 5통·STEMI가 하드락 아닌 **선택**으로 뜸→전부 수용)→INTERSTITIAL(러닝 −46억)→EMERGENCY("내 순환기팀이 직접 PCI"→**생존**)→EPILOGUE("환자를 살렸습니다"·올해 장부 순이익 **−96억**=순환기 −24 + 진료 −22 + **소송 −50**). 콘솔 에러 0. 공범(흑자·하드락 사망)↔양심(−96억·생존·소송 노출) 세 낙차 정상 동작 확인. plan/changeLog 반영.
- **왜**: Part 2(#26)에서 "양경로 완주 검증"이라 적었으나 실제론 공범 경로만 텍스트 확인돼 있었음 — 양심 경로의 코드 정확성(순환기 보유 시 STEMI=선택·원내 생존·소송비 실현)을 제출 전 잠금. 결말이 "살렸는데도 −96억+소송"으로 나오는 게 필수의료 붕괴 논지의 물증.
- **범위**: 문서 2개(plan·changeLog). 코드 무변경. **발견(별건)**: 콜 c3 "검진 패키지 문의" 라벨에 보톡스 대사가 붙는 라벨↔대사 불일치 — `COSMETIC_WALKIN` 풀에서 c1(index0)·c3(index2) 둘 다 `index%2==0`→pool[0]이라 딱 맞는 pool[1]('검진 패키지 문의드려요…')이 안 쓰임. pre-existing·저위험 콘텐츠 결함, callerPlea 리팩터(#27)와 무관(선택식 동일 보존). 수정은 콜별 plea 명시/kind 내 등장순 선택 등 설계 텍스처가 있어 별건 슬라이스로 이연. **스크린샷 이미지**는 in-app `screenshot` 도구 재차 스톨(T-034)로 미확보 → 최종 캡처는 사용자 로컬 몫.

## 2026-07-17 · PR #26 이연 Minor 3건 청소 — callerPlea 순수화·Interstitial 타이머 cleanup·useRef 가드 (PR #27)

- **무엇을**: Part 2(#26) 최종 리뷰가 추적 이연한 Minor 3건 정리. (1) **CALLER_PLEA 변주** — `ReceivingPhase` 인라인 표현식(`pleaPool[index % len]`)을 `dialogue.ts` 순수 함수 `callerPlea(call, seed)`로 추출(음수·범위 밖 clamp, `fallbackLine`과 동일 패턴). 대사 선택이 전부 `dialogue.ts` 순수 함수가 되도록 통일 + TDD 5케이스. (2) **Interstitial 타이머 cleanup** — 붕괴 `setTimeout`을 `useEffect`로 옮겨 언마운트/재렌더 시 `clearTimeout`(누수·stale `onContinue` 호출 방지). (3) **중복 진입 가드** — state(`collapsing`)에서 `firedRef` 동기 가드로(reduced-motion 경로·배칭 지연까지 커버).
- **왜**: 리뷰 이연 항목을 방치하지 않고 청소. plea 선택을 순수 함수로 통일해 회귀를 테스트로 잠그고, 막간 타이머·중복클릭 UI 위생을 정석 패턴으로.
- **범위**: 4파일(`dialogue.ts`·`dialogue.test.ts`·`ReceivingPhase.tsx`·`Interstitial.tsx`). `tsc` 0 · `vitest` **309 green**(+5, 회귀 0) · `next build` 통과 · 브라우저 공범 경로 완주 검증(plea 렌더·막간→응급 타이머 전이·콘솔 0). `receivingLine`의 미사용 `seed` warning은 pre-existing(kind별 단일 대사라 변주 소스 없음)이라 별건·유지. 검증 중 도구 함정 [troubleshooting.md](troubleshooting.md) T-034.

## 2026-07-17 · 경영 확장 UI 통합 (Part 2) — 위저드→콜큐→막간→응급→결말 플레이어블 (PR #26)

- **무엇을**: Part 1 결정론 로직 코어 위에 React UI를 배선해 API 없이 한 세션을 완주하는 플레이어블 완성. `page.tsx→SessionClient`(오케스트레이터·`SessionState` 소유·phase 스위치)로 진입 전환, 기존 하드코딩 `GameClient`를 표현 컴포넌트(`SetupWizard`·`ReceivingPhase`·`Interstitial`·`InHouseEmergency`·`TransferRound`·`Receipt`·`LedgerPanel`·`EmergencyChrome`·`SegmentTree`·`Epilogue`)로 분해·재사용 후 삭제. 5페이즈: 설정 위저드(과별 채용·예산 게이트) → 1막 콜 큐(하드락/선택 + 명랑 장부) → 막간(시점 전환) → 2막(순환기 있으면 원내 생존 / 없으면 전원 뺑뺑이) → 결말(내 병원 영수증+장부, 세 낙차 공범·사망/공범·생존/양심·생존). 시그니처 **막간 붕괴**(초록 탈색→응급 고조 ~700ms 전환, `prefers-reduced-motion` 시 즉시). 통일 시각(단일 어두운 zinc 시스템·1막 emerald→결말 red 아크·다크 지면 고정으로 흰 플래시 차단)·접근성(`focus-visible`)·375px 반응형. 롤업 결함 수정(적자 `+-24억`→`−24억` 부호 포맷터 `formatSignedBillions` 단일화) + 러닝 순이익을 순수 `runningNetProfit`로 승격(판정=코드 경계 강화).
- **왜**: 사용자 #1 우선순위 "**디자인의 통일성**" — 밝은/어두운 화면 전환 없이 하나의 어두운 세계에서 액센트 온도(초록→빨강)로만 톤 아크를 만들고, 게임 주제("이익 챙기기가 당신이 책임질 응급으로 곤두박질친다")를 막간 붕괴 한 제스처로 구현. 판정=코드 경계·비파괴·결정론 유지(상태 전이는 전부 `src/game/` 순수함수, 뷰 타이머는 연출만).
- **범위**: subagent-driven TDD(태스크별 구현자+리뷰어 게이트 7태스크 + 최종 whole-branch 리뷰 opus + 폴리시). `tsc --noEmit` 0 · `vitest run` **106 green**(Part1 92 + Part2 신규 14) · `next build`(Turbopack) 통과 · 브라우저 양경로 완주 검증(공범·양심, 데스크톱+375px, 콘솔 0). 최종 리뷰 **Ready to merge**(Critical·Important 0), Minor 3건 추적 이연(Interstitial 타이머 unmount cleanup·중복클릭 useRef 가드·CALLER_PLEA 라벨-변주). 로직코어 이연 Minor 중 음수값 방어 해소(T1). 계획: [superpowers/plans/2026-07-17-management-expansion-ui.md](superpowers/plans/2026-07-17-management-expansion-ui.md) · 설계: [superpowers/specs/2026-07-17-management-expansion-ui-design.md](superpowers/specs/2026-07-17-management-expansion-ui-design.md).

## 2026-07-17 · CLAUDE.md에 AI 활용 추적 규칙 — 커밋 트레일러로 사용 스킬·플러그인 명시 (PR #25)

- **무엇을**: `CLAUDE.md`에 프로젝트 한정 규칙 신설 — 커밋 생성 시 실제 호출한 스킬·플러그인을 트레일러(`Skills-used`/`Plugins-used`/`Skill-benefit`)로 남긴다. 스킬 미사용 커밋은 `Skills-used: none`으로 명시해 빈도의 분모를 확보.
- **왜**: 스킬/플러그인의 (a) 사용 빈도 (b) 있는데 미사용인 것 (c) 실제로 얻은 이점을 측정하기 위함. 트레일러 형식이라 `git interpret-trailers --parse`·`git log --grep`로 기계 집계 가능.
- **범위**: `CLAUDE.md` 규칙 1개 + 이 changeLog. 코드 무변경. **소프트 규칙**(내 자가보고)이며, (a)·(b) 객관 집계는 추후 `Skill` 도구 호출을 기록하는 `PostToolUse` 훅으로 승격 여지를 남김. (c) 이점 서술은 자동화 불가라 커밋 주석이 제자리.

## 2026-07-16 · ④ AI 활용 문서 시각화판 — "디렉터의 운영체계" 라이브 아티팩트 (PR #24)

- **무엇을**: 제출물 ④(AI 활용)의 시각화·PDF판을 `docs/submission/ai-usage-directing.html`로 신설 — 자기완결 HTML(라이트/다크·`@media print` PDF 최적화). 실제 셋업 근거: 글로벌 CLAUDE.md 8갈래 · 프로젝트 규칙(AGENTS.md·판정=코드/대사=LLM) · 활성 플러그인 5종·훅 3종(`settings.json` 실측) · superpowers 스킬 체인 실사용(#17→#18→#20) · 서브에이전트 팬아웃 · **프롬프트↔실행 로그** · 메모리 4종 · 되먹임 사다리. §1에 **라이브 PR 타임라인**(문서 상단 `DATA` 한 곳에서 렌더).
- **왜**: 기존 텍스트 초안(`ai-usage-doc.md`, #19)과 상보 — 텍스트가 "게임 속 AI 아키텍처"라면 시각화판은 "AI를 지휘한 운영체계" 전체. 사용자가 라이브 아티팩트 URL로 보며 Part 2 구현과 함께 계속 발전시킬 목적(런타임 프롬프트 로그·UI 스크린샷은 이후 채움). 최종엔 브라우저 인쇄로 PDF화. 색: teal=코드/판정 · indigo=LLM/대사(2콜 분리를 색으로 인코딩).
- **범위**: 문서 추가 1(HTML) + 텍스트 초안 상호링크. 코드 무변경. 아티팩트는 비공개(claude.ai). 문서 성장에 따라 브랜치를 열어 둠(제출 준비 시 머지). **+** `submission-plan.md`를 `docs/submission/`으로 이동해 제출 문서 일원화(참조 링크 전수 갱신 · game-concept·research는 내부 문서로 docs/ 유지).

## 2026-07-16 · README env 가이드 링크 — 공식 URL 병기 (오진된 "깨진 링크") (PR TBD · fix/readme-nextjs-doc-link)

- **무엇을**: README 82번째 줄 `[Next.js env 가이드]` 링크를 공식 URL(https://nextjs.org/docs/app/guides/environment-variables)로 바꾸고, 설치본 경로(`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`)는 버전-정확 복사용 인라인 코드로 병기. troubleshooting **T-030** 신설.
- **왜**: PR #22에서 "깨진 링크"로 신고됐으나, **검증 결과 링크는 정확했다** — 파일은 설치본(Next 16.2.10) 그 경로에 존재. 깨진 듯 보인 건 확인을 node_modules 없는 워크트리에서 했기 때문(T-030). 다만 `node_modules/...` 상대링크는 gitignore라 GitHub 렌더 README·신규 클론에서 죽으므로, 사람 대상 링크에 공식 URL을 병기해 실질 강건성만 개선. AGENTS.md의 node_modules 가이드 참조 컨벤션은 유지.
- **범위**: README 1줄 + 추적 문서(troubleshooting T-030·이 항목). 코드 무변경.

## 2026-07-16 · 디렉토리 정리 — Claude 작업문서 `claude-docs/` 통합 · learning-notes 제거 (PR #22)

- **무엇을**: Claude가 생성·운영하는 md를 `claude-docs/` 한 곳으로 격리. 루트 3종(plan·changeLog·troubleshooting)과 `docs/superpowers/`(브레인스토밍 spec·구현계획)를 `claude-docs/`(및 `claude-docs/superpowers/{specs,plans}`)로 이동, 프로젝트 미사용인 `learning-notes.md`(빈 골격)는 삭제. 이동으로 깨지는 문서 간 상대링크를 9개 파일에서 전수 조사·수정하고 66개 링크 재해석 검증(0 broken). `docs/`의 제품·리서치·submission 문서는 유지.
- **왜**: 루트에 흩어진 Claude 운영 로그를 사용자 지시로 한 곳에 모아 저장소 루트 정리. PKM learning-notes 파이프라인은 이 프로젝트 미사용. 글로벌 컨벤션(3종=repo 루트)과 달리 이 프로젝트는 `claude-docs/` 배치 채택 — README 내비게이터가 새 위치를 가리킴.
- **함정**: 이동 중 `git mv`가 대상 디렉토리 없으면 실패 → [troubleshooting.md](troubleshooting.md) T-029.

## 2026-07-16 · 경영 확장 로직 코어 (Part 1) — setup/receiving/session/ledger/dialogue (결정론·TDD) (PR #20)

- **무엇을**: 경영 확장(spec #17)의 **결정론 순수 로직 코어**를 subagent-driven TDD(구현자+리뷰어 태스크별 게이트)로 구축. 5개 모듈 + types 추가, 전 테스트 92 green(+38), `tsc --noEmit` 0, 비파괴.
  - `setup.ts` — 과 카탈로그(수익 미용·검진 흑자 / 필수 순환기·흉부외과 등 적자·소송⚠) + `buildHospital(choices)`(위저드→플레이어 병원+경제) + 예산 헬퍼.
  - `ledger.ts` — 순수 코어 `composeLedger` 추출 + `buildSessionLedger`(플레이어 병원 + 1막 콜 델타 + 소송 비용 한 줄). 기존 `buildLedger(state)` **동작 보존**(라인 대조 확인).
  - `receiving.ts` — 1막 콜 큐(`classifyCall` 하드락/선택 — 기존 `adjudicateTransfer` 재사용, `decide` 불변 리듀서: 장부·소송 노출 누적).
  - `session.ts` — 5페이즈 상태기계(SETUP→RECEIVING→INTERSTITIAL→EMERGENCY→EPILOGUE) + `beginEmergency` 분기(순환기 있으면 in-house 생존 / 없으면 기존 STEMI 뺑뺑이 재사용) + `buildEpilogue`(영수증+장부).
  - `dialogue.ts` — 1막 받는 쪽 다크코미디 폴백 대사(호소·명랑수용🎉·하드락). 기존 발신 대사 무손상.
- **왜**: 사용자 "전화도 받고 싶어" 요청의 결정론 뼈대 — 벽의 양쪽(받는 쪽 `classifyCall` ↔ 보내는 쪽 2막)에 **같은 판정 로직**. agency가 결과에 닿음(순환기 건설 여부가 2막 생사·결말 장부를 가름). 소송 비용은 "짓기가 아니라 **수용에서 실현**"(리서치 [essential-care-litigation-risk.md](../docs/research/essential-care-litigation-risk.md) 축 C 부호). [[fact-grounding-before-mechanics]]·판정=코드 원칙 유지.
- **범위**: 로직 코어만(Part 1). **UI 통합(Part 2)**—SetupWizard·ReceivingPhase·SessionClient·에필로그 배선—은 후속. 최종 whole-branch 리뷰(opus) Ready to merge, Minor 5 중 1(공허 단언) 수정·4(spec ⓐ 의도 단순화/도달불가) Part 2 이연. 계획: [docs/superpowers/plans/2026-07-16-management-expansion-core.md](superpowers/plans/2026-07-16-management-expansion-core.md).

## 2026-07-16 · 필수과 소송·방어진료 리스크 — 게임 "소송 리스크 ⚠" 근거 리서치 (PR #18)

- **무엇을**: 경영 확장(spec #17)의 위저드 카피 "순환기·흉부외과·산부인과 = 소송 리스크 ⚠"와 결말 장부 '소송 비용 한 줄'의 **부호 근거**를, 5갈래 병렬 웹 리서치 → 주장별 적대적 검증 → 종합 워크플로우(29에이전트, PR #10 패턴)로 산출 → [docs/research/essential-care-litigation-risk.md](../docs/research/essential-care-litigation-risk.md). 검증 통과 23건(기각 0), 5축(중대결과 집중·의료 형사화·초고액 단건 배상·방어진료·이탈 → 미용 대조) + 각색 허용표 + 경계·주의 12항.
- **왜**: [[fact-grounding-before-mechanics]] — 게임 각색 수치가 현실 부호를 안 어기게 근거 선행(#10/#14 선례). **적대 검증이 잡은 핵심 교정**: 성립하는 부호는 '분쟁 빈도'가 아니라 **결과의 중대성(사망·중증장애·형사기소)**이다 — 미용도 분쟁 '건수'는 오히려 산부인과보다 많으므로 카피는 "미용은 소송 없다"(❌)가 아니라 "미용·검진은 중대 결과 리스크가 낮다"(✅)로. 형사 배율(수백 배)·유죄율 등 단일출처 과장 수치는 화면 인용 금지로 §5에 못박음.
- **범위**: 근거 문서만. 경영 확장 구현 계획(writing-plans)·코드는 후속.

## 2026-07-16 · 경영 확장 설계 — "벽의 양쪽" 2막 단막극 (브레인스토밍 확정) (PR #17)

- **무엇을**: 게임을 '전화를 받는 병원'까지 플레이하는 **2막 단막극**으로 감싸는 경영 확장 설계 확정 → [docs/superpowers/specs/2026-07-16-management-expansion-design.md](superpowers/specs/2026-07-16-management-expansion-design.md). 흐름: 설정 위저드(병원명·과·의사 수=투자) → 콜 큐(수용/거절 = `adjudicate`를 플레이어가 직접) → 명랑한 장부 → 막간 시점전환 → 2막(순환기 지었으면 in-house 생존 / 스킵했으면 기존 STEMI 뺑뺑이 재사용) → 내 병원 데이터로 결말. 5개 설계 결정 잠금(톤=합리적 공범 다크코미디, 2막 구조, 사전확정 투자, agency가 결과에 닿음, 양쪽 다 값을 치름).
- **왜**: 사용자 요청("전화도 받고 싶어"·병원 설립·필수과 딜레마)을 브레인스토밍으로 방향 확정. 시퀀싱: 이번 주 결정론 구현(API 불필요) → 다음 주 실LLM. 기존 8/10 제출작을 **비파괴로 감싸는** 상위 구조라 제출선을 위협하지 않음.
- **범위**: 설계 문서만. 근거 리서치(#18)·구현(writing-plans)은 후속.

## 2026-07-16 · 세션 마무리 — troubleshooting T-027 + 문서 정합 (PR #16)

- **무엇을**: 세션 산출을 문서에 정착. troubleshooting **T-027** 신설(main 머지 후 라이브 배포 지연을 '배포 고장'으로 오진 — GH Deployments API·즉시 확인의 무성 지연). plan **P6**에 실LLM 미착수 시 결정론 버전 촬영 note + 콜드로드 첫 '전원 시작' 탭 씹힘 관찰(하이드레이션 타이밍) note.
- **왜**: 세션을 지워도 이번 작업(#13~#15)과 그 과정의 함정·관찰이 문서에 남도록. plan/changeLog/README/팩트시트는 각 PR에서 이미 갱신됐고, 마지막 gap이던 troubleshooting을 채움. (참고: 자동 메모리 `game-show-dont-tell`은 디스크에 영속, MEMORY.md는 다음 세션 훅이 재생성.)

## 2026-07-16 · U5 최소 제출선 마감 — 팩트시트·README·배포 스모크 (PR #15)

- **무엇을**: 최소 제출선(①플레이어블 빌드) 패키징·검증. (1) prod 빌드(tsc·next build) 통과 재확인 + 라이브 Vercel URL 완주 스모크(데스크톱·모바일 375px 가로 넘침 0). 시드 고정은 코드에 RNG가 없어(Math.random 0건·goldenTime 순수) 자동 성립. (2) STEMI 팩트시트 갱신: "초안" 뗌, 스테일 교정(거절 사유 2종→4종·병원 4→6곳), 결말 영수증·장부 반영, 경제 근거 문서 크로스링크. (3) README 정직화: 태그라인이 라이브 LLM을 암시하던 것을 현재=무키 결정론 폴백으로 바로잡고(LLM 대사콜은 예정 가산 레이어), "무엇을 겪나"(응급실 뺑뺑이+필수의료 붕괴 두 축)·플레이법·팩트시트 링크 추가. 스크린샷은 P6 때 일괄(플레이스홀더).
- **왜**: 제출 4종 중 ①이 성립하려면 공개 URL이 키 없이 완주되고, 소개 문서가 실제 빌드를 정직하게 기술해야 한다. 특히 README가 아직 없는 실LLM을 "AI 실시간 협상"으로 과장하던 것을 교정(제출 정직성). 시드 고정·무키 완주는 결정론 아키텍처 덕에 이미 성립 → 확인·문서화만.
- **비고**: #14(장부)의 Production 배포는 머지 직후라 전파 중이었으나, 이 PR 머지 커밋이 다시 Production 배포되어 장부가 라이브에 오른다(머지 후 재확인).

## 2026-07-16 · 병원 장부 — "수익은 흑자, 필수과 채용은 0" (결정론·TDD) (PR #14)

- **무엇을**: 게임의 두 번째 문제 축(필수의료 붕괴)을 켜는 '병원 장부' 에필로그. 영수증 아래에 결정론 패널 추가 — 한 대학병원(한바다대학병원)이 미용·검진으로 흑자(순이익 +287억)인데, 환자가 필요했던 순환기내과 신규 채용은 0. `ledger.ts` 순수 함수(TDD 8 tests): 부문 손익·순이익·신규 채용 집계. **필수 배후과 채용 수는 하드코딩이 아니라 `backupCare`(=거절 사유 `NO_BACKUP_CARE`의 뿌리)에서 파생** — 그 과 배후진료가 없으면 0, 있으면 데이터값. `types`에 `Hospital.economics`+`HospitalEconomics`(각색 수치, 부호만 근거 준수), `scenarios` h1에 경제 데이터. GameClient 결말에 패널 배선(부문 손익/순이익/신규 채용). 총 54 green, tsc·next build 통과, 브라우저로 결말 장부 관찰 검증.
- **왜**: "왜 배후진료 불가였나"의 경제적 뿌리를 보여준다 — 필수과는 적자(저수가), 미용·비급여는 흑자라 병원이 합리적으로 적자과에 투자하지 않는다(수요측) + 뽑을 인력 자체가 없다(공급측). 아무도 악당이 아닌데 환자가 죽는 구조. [[game-show-dont-tell]] 원칙 준수 — "필수의료 붕괴입니다"라고 쓰지 않고 순이익 +287억과 채용 0명을 병치해 플레이어가 스스로 잇게. 전제는 [fact-grounding-before-mechanics] 원칙대로 경량 리서치+적대 검증으로 근거([essential-care-economics.md](../docs/research/essential-care-economics.md), 방어 가능 판정), 구체 ₩는 각색.
- **범위 밖(v2 보류)**: 지역 집계 장부(여러 병원 합산) · 플레이어가 수익 배분·채용하는 조작 루프 — plan U4.5에 기록.

## 2026-07-16 · 인과 디브리핑 → 차가운 사실 영수증 ("보여주지 말고 겪게") (PR #13)

- **무엇을**: U4 결말의 강의식 해설을 전부 걷어내고 라벨+숫자만의 '전원 기록' 영수증으로 교체. 제거: 반사실 분할("당신을 바꿨다면/구조를 바꿨다면"), findings 카드 3장, "당신이 아니라 구조" 착지 카피, "무엇이 죽였나" 유도 헤더. `debrief.ts`를 순수 팩트 추출기로 슬림화 — 카피 필드(findings/counterfactual/landing)·안 쓰는 파생값 제거, 거절 사유별 집계(`rejectionBreakdown`, 첫 등장 순서=결정론) 추가. 영수증: 전원 시도 N통 / 거절 N회(사유별 ×N) / 받을 수 있던 곳 1·6 / 골든타임 소요. 각주는 허구 고지만 남기고 통계·출처 문장 제거(이미 [팩트시트](../docs/research/stemi-factsheet.md)에 있음). TDD 재작성 8 tests, 총 46 green, tsc·next build 통과. 브라우저로 DIED(12통·`배후진료 불가 ×8`·1/6)·ACCEPTED 양쪽 검증.
- **왜**: 게임이 결말에서 "구조가 문제였다"를 **글로 설명**하면, 플레이 중 이미 손끝으로 겪은 무력감이 강의로 납작해진다("이건 좋은 게임이 아니야"—사용자). 좋은 게임은 플레이어가 플레이로 겪고 스스로 깨닫게 한다 → 해석을 삭제하고 사실(특히 반복된 `배후진료 불가 ×8`)이 스스로 고발하게. "판정=결정론"에 이어 디브리핑도 순수 함수를 유지하되, 이제 설득 카피를 안 들어 함수가 더 깨끗해짐.

## 2026-07-16 · U4 인과 디브리핑 — "당신이 아니라 구조" (결정론·TDD) (PR #12)

- **무엇을**: 한 판 로그에서 구조 변수를 결정론적으로 산출하는 순수 함수 `debrief.ts`(TDD 10 tests) 신설 + GameClient 결말 화면 배선. 디브리핑 3사실: ① 지배 병목=배후진료 불가(최다 거절 사유) ② 병상은 문제가 아니었다(병상 있는데 거절한 병원 수) ③ 역량 희소성(순환기 배후진료 표방 3곳 중 실제 수용 가능 1곳). 반사실 1쌍 분할 화면(당신을 바꿨다면=결과 불변 / 구조를 바꿨다면=배후진료 +1이면 첫 콜 수용). 결말별 착지 카피 + 톤 가드레일. ACCEPTED/DIED 둘 다 디브리핑. 브라우저로 양쪽 결말 관찰 검증, 48 tests green, tsc·next build 통과.
- **왜**: 최소 제출선의 마지막 코어 비트 — 플레이어의 무력감을 "네 탓이 아니라 구조 탓"으로 인지 전환시키는 게임의 논지 착지점. 디브리핑도 `판정=결정론` 원칙을 따라 순수 함수로 만들어 같은 로그가 같은 해설을 낳게 하고(설득/속도는 결과를 못 바꾸고 배후진료 한 곳이 결과를 바꾼다는 반사실로 논지를 데이터로 증명), 4종 구조 변수를 병상이 아니라 배후진료 중심으로 읽게 함(R3.5 경고 반영).

## 2026-07-16 · 전제 교정 — 거절 사유 배후진료 중심 4종 재설계 (PR #11)

- **무엇을**: 리서치(#10) 반영해 결정론 코어를 교정. Hospital 모델을 `onCallSpecialties`(뭉뚱그린 당직) → `hasErOnCall`(초기수용) + `backupCare`(최종치료) + `overcrowded`(과밀)로 분리. 거절 사유 2종 → 4종(`NO_BED`/`NO_ER_ONCALL`/`ER_OVERCROWDED`/**`NO_BACKUP_CARE`**), adjudicate 게이트 우선순위 재정의. STEMI 시나리오를 "최다 거절=배후진료 불가, 첫 병원부터 병상은 있는데 시술팀 없음"으로 재균형. dialogue 사유별 4종. 각색 고지(180초=실제 90~120분) + 결말 디스클레이머 추가. TDD 총 38 green, 브라우저로 4종 태그+수용 관찰.
- **왜**: 게임의 '구조 = 병상 0' 형상화가 현실의 지배 병목을 뒤집고 있었다 — 실제 재이송 1위는 전문의/배후진료 부재(41.9%), 병상은 15%(3위). 안 고치면 "문제의 틀린 원인을 극화"해 게임 의도에 타격. 하드락 메커니즘은 유지하되 벽의 정체를 배후진료로 바로잡음.

## 2026-07-16 · 리서치 — 게임 전제 팩트체크 + STEMI 팩트시트 (PR #10)

- **무엇을**: 5개 도메인 웹 리서치(출처 필수) + 적대적 검증 워크플로우(11에이전트)로 게임 전제를 실제 통계·사례로 검증. 산출물 [docs/research/medical-system-grounding.md](../docs/research/medical-system-grounding.md)(확증/교정/누락/톤/출처) · [docs/research/stemi-factsheet.md](../docs/research/stemi-factsheet.md)(검증 사실+각색 고지+출처 12+).
- **왜**: "의도가 생명인 게임을 리서치 없이 진행하면 나중에 의도 타격" 우려. 지어낸 통계가 제출용 PDF에 새지 않도록 출처 검증을 선행. 핵심 발견 = 지배 병목이 병상이 아니라 배후진료 부재(→ #11로 반영).

## 2026-07-16 · U3 하드락 벽 — 매달려도 병상0은 안 뚫린다 (PR #9)

- **무엇을**: 자유 텍스트 설득 입력 + 재콜(매달리기) 허용. 매달릴수록 담당자 응답이 냉정해지지만(`persuasionReply` 에스컬레이션, TDD 4케이스) 판정은 절대 안 바뀜. 거절 로그가 사유 태그로 쌓이고(`병상 없음 ×N`), 골든타임 임계 시 화면 톤 경고. 라운드 불변식 테스트로 "병상0은 반복 재시도해도 절대 ACCEPTED 안 됨" 잠금. 총 31 tests green. 브라우저로 3회 매달림 관찰(에스컬레이션 0→2단계, 끝까지 거절).
- **왜**: 게임의 심장 — "개인이 아무리 간절히 설득해도 구조(병상·당직)는 안 바뀐다"를 손끝으로 체감. 판정 함수에 설득 파라미터가 애초에 없어 타입 수준에서 보장되는 걸, UI에서 무력감으로 드러냄.

## 2026-07-16 · U2 한 판 UI 척추 — 결정론으로 완주 가능 (PR #8)

- **무엇을**: 시뮬 코어를 React에 배선(`GameClient.tsx`)해 STEMI 한 판이 손끝으로 완주된다 — 실시간 골든타임 카운트다운, 전원 콜→수용/거절, 거절 사유 태그, 폴백 대사, 결말(살림/놓침)+다시하기. 순수 로직 TDD 신규: `tickTime`(실시간 소모, 인터벌 레이스 안전 no-op), `fallbackLine`(판정→폴백 대사), `createStemiScenario`(두 거절 사유 다 드러나되 풀림). 총 26 tests green. 브라우저로 한 판 관찰 검증(NO_BED→NO_SPECIALIST→수용→살림).
- **왜**: "플레이어블 빌드"의 척추. LLM 없이 결정론 폴백만으로도 데모 4비트 중 3비트(압박·거절 누적·결말)가 화면에서 돈다 → 최소 제출선의 코어 확보. 실LLM 극소판은 결제 확인 후 이 위에 얹는다.

## 2026-07-16 · U1 파이프라인 스파이크 — 배포 뚫림 (PR #6)

- **무엇을**: 기본 Next 템플릿을 walking skeleton("수화기 너머의 벽" 다크 랜딩)으로 교체(`src/app/page.tsx`·`layout.tsx`, lang=ko·메타데이터) + `.claude/launch.json`. prod `next build`(Turbopack) 통과 확인 후 **Vercel 배포** → https://hospital-sim-ashy.vercel.app/ 공개 URL 렌더 검증. 15 tests green 유지.
- **왜**: 로드맵 최상위 리스크는 코드가 아니라 미검증 배포 파이프라인(첫 Next 16 prod 빌드·Vercel). 게임 완성 전에 이걸 먼저 뚫어, 마감 직전 터질 리스크를 제거하고 이후 모든 작업을 "이미 되는 배포" 위에 얹는다.

## 2026-07-16 · 사전 과제 25일 제출 로드맵 확정

- **무엇을**: 실제 제출 폼(필수 4종: 플레이어블 빌드·플레이 영상·게임소개 PDF·AI활용 PDF) 확인 후, [docs/submission-plan.md](../docs/submission/submission-plan.md) 신설 + plan.md 로드맵을 크리티컬 패스(U1~Z9)로 재정렬. 마감 8/10·본선 9/4~6 웹검증. 3관점(의존성·리스크·데모서사) 설계 → 종합 → 적대적 비평 워크플로우(5에이전트).
- **왜**: 기존엔 "GitHub 링크만 내면 됨"으로 오인 → 실제는 필수 4종. "최소 제출선 먼저(폴백 1판+배포)" 전략으로 마감 리스크 최소화, 실LLM은 비파괴 upside로 격리.
- **비평 반영**: 패키징 직렬화·버퍼에서 실LLM 제외(착시 제거) / 실LLM 극소판을 UI 단계로 당겨 영상에 라이브 AI 확보 / 요강·결제키 확인을 첫날로 / '의학 감수 문구' → 출처 각주+각색 고지.

## 2026-07-16 · env 관리 체계 (기기 간 이어 작업)

- **무엇을**: `.env.example`(커밋되는 변수 계약, 값 없음) 신설 · `.gitignore`에 `!.env.example` 예외 추가 · README에 "환경 변수 / 여러 기기에서 이어 작업" 섹션(파일 규칙표·렙탑 셋업·시크릿 규칙). 첫 변수로 `ANTHROPIC_API_KEY`(서버 전용) 문서화.
- **왜**: 데스크톱↔렙탑을 오가며 작업하려면 "필요한 값 목록"은 git에 두되 실제 시크릿은 각 기기 `.env.local`(gitignore)에만 둬야 한다. 렙탑에서 템플릿 복사→값만 채우면 바로 이어감. 실제 코드 소비·검증(타입드 로더)은 키가 필요해지는 M2에서.

## 2026-07-16 · 한 판 상태기계 (PR #3)

- **무엇을**: `round.ts` — startGame / attemptTransfer. 판정+타이머를 엮어 도착→전원 콜 반복→결과(ACCEPTED/DIED). 불변 업데이트, 종료 후 가드. TDD 6케이스. (M1 시뮬 코어 완료: 15 tests green)
- **왜**: 게임의 한 판 흐름. 거절이 누적되고 골든타임이 소진되면 사망하는, 메시지의 뼈대.

## 2026-07-16 · 골든타임 타이머 (PR #2)

- **무엇을**: 순수·불변 골든타임 카운트다운(`src/game/goldenTime.ts`) — advance/clamp/만료판정, 음수 경과 가드. TDD 5케이스.
- **왜**: 전원 콜·문진이 시간을 소모하고 0이 되면 환자가 죽는, 게임의 압박 시계. Date.now 미사용으로 결정론·테스트 용이.

## 2026-07-16 · 결정론적 전원 판정 코어 (PR #1)

- **무엇을**: `adjudicateTransfer`(`src/game/adjudicate.ts`) — 병상·당직으로 수용/거절 판정. 설득 텍스트는 시그니처에 부재. TDD 4케이스.
- **왜**: "판정=코드/대사=LLM" 2콜 분리의 코드 절반. LLM 굴복으로 상태가 뒤집히는 붕괴를 타입 수준에서 차단.

## 2026-07-16 · 프로젝트 부트스트랩 & 컨셉 확정

- **무엇을**: 병원 시뮬 게임 저장소 초기 셋업 — Next.js + TS + Tailwind 스캐폴딩, 작업추적 3종·learning-notes 생성, 게임 컨셉 문서([docs/game-concept.md](../docs/game-concept.md)) 작성.
- **왜**: NAN 2026 (NHN Game × AI 해커톤) 신청용 프로토타입을 만들기 위한 출발점. 브레인스토밍으로 방향(의료진 시점 · 응급실 뺑뺑이/필수의료/지방격차 3축) 확정.
- **결정**: AI 핵심 축 = **실시간 전원 협상 + 인과 디브리핑**(6개 설계안 4렌즈 교차채점으로 선정). 아키텍처 원칙 = **판정=코드 / 대사=LLM** 2콜 분리.
