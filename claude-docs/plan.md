# plan — 앞으로 할 일 (살아있는 계획)

> 범례: ✅완료 · 🔜다음 · ⬜예정 · `X`droppable upside · ⏸의도적 보류(본선/v2) · ⚠️리스크·전제
> 관련 문서: [changeLog.md](changeLog.md) · [troubleshooting.md](troubleshooting.md) · [docs/game-concept.md](../docs/game-concept.md) · **[docs/submission-plan.md](../docs/submission/submission-plan.md)** (25일 제출 로드맵 상세)

## 목표

NAN 2026 (NHN Game × AI 해커톤) **사전 과제 제출**. 마감: **2026-08-10**. 본선(9/4~9/6)은 이 프로토타입을 확장.

**필수 제출물 4종**: ① 플레이어블 빌드(공개 Vercel URL)+소스(GitHub public) · ② 플레이 영상(유튜브 30~60초) · ③ 게임 소개 PDF · ④ AI 활용 기술 PDF. (팀 소개·포트폴리오는 스킵)

전략: **최소 제출선 먼저** — LLM 없이 결정론 폴백으로도 한 판 플레이+배포를 먼저 확보하고, 실LLM은 그 위에 **비파괴 가산 레이어**로. 상세·리스크·영상 샷·PDF 목차는 → [docs/submission-plan.md](../docs/submission/submission-plan.md).

핵심 원칙: **판정 = 결정론적 코드 / 대사 = LLM** (2콜 분리). 게임 상태 전이는 절대 LLM이 정하지 않는다.

**AI 활용 심사축 결정 (2026-07-16)**: NHN 슬로건("AI를 활용하는 사람은 많다 — AI의 다음 단계를 설계할 디렉터를 찾는다")·본선 제출물(AI 에이전트 설계서·디렉팅 명세서) 리서치 → **심사 북극성 = '디렉팅'(AI를 어떻게 지휘해 게임을 만들었나, B축)**. 대화 LLM(게임 속 AI 기능, A축)은 B축의 **대체재가 아니라 최강 물증**이다 — 2콜 권한 경계 설계(`adjudicate`에 설득 파라미터 부재 = 타입 수준 하드월)는 "AI를 어디까지 믿고 어디서 끊는가"의 디렉팅 그 자체. 따라서 **극소판 라이브는 유지**(채우고 통제한 슬롯 > 설계만 한 빈 슬롯; Game×AI 제출물이 AI-제로로 안 읽히게), **풀 2콜(`X8`)은 발전 가능성으로 후순위**. ④ AI 활용 문서는 **B축으로 리드**하고 A축을 그 물증으로 배치 → `docs/submission/ai-usage-doc.md`.

---

## M0. 프로젝트 셋업

- ✅ Next.js + TS + Tailwind 스캐폴딩
- ✅ 작업추적 3종(plan/changeLog/troubleshooting) + learning-notes 생성
- ✅ .gitignore에 `.commit-msg-tmp` 추가
- ✅ vitest 도입(TDD 러너) + 첫 테스트 실행 확인
- ✅ git init + 초기 임포트 커밋(main) → 이후 작업은 브랜치(`feat/sim-core`)
- ✅ env 관리 체계: `.env.example`(커밋되는 변수 계약) / `.env.local`(gitignore, 기기별 실제 값) + 기기 간 이어 작업 문서(README). 시크릿은 서버 전용(`NEXT_PUBLIC_` 금지).

## M1. 순수 시뮬 코어 (LLM 없이 · TDD) ✅ 완료 — "하드락 벽"의 신뢰성 확보

- ✅ 도메인 타입 정의: 병원(숨은 제약)·환자·전원 판정·전원 시도·게임 상태
- ✅ 전원 **판정 규칙**(결정론적): 병상·당직 전문의 → 수용/거절/거절사유 태그 (`adjudicate.ts`, 4 tests)
- ✅ 병상 0 = 어떤 입력에도 **하드락 거절** 불변식 테스트 (설득 텍스트는 판정 함수 시그니처에 부재)
- ✅ 골든타임 타이머 (순수·불변, clamp, 음수 가드, 만료 판정) (`goldenTime.ts`, 5 tests)
- ✅ 한 판 진행 상태기계: 시작 → 전원 콜 반복 → 결과(수용/사망), 종료 후 가드 (`round.ts`, 6 tests)
- 전체 15 tests green · `tsc --noEmit` 통과

## 🔑 선결 — 오늘(7/16) **사용자** 확인/결정 (코드 아님 · 내가 대신 못 함)

- ⬜ **제출 요강/폼 전문 정독** → 필수항목·**마감 정확 시각/타임존**·빌드 제출 형식(라이브 URL만 vs 다운로드 웹빌드 아티팩트도?) 확정
- ⬜ **Anthropic 콘솔 결제/크레딧 활성 확인** (미설정이면 `X8` 스킵 전제 → ④PDF는 설계+로컬 시연 중심)
- ⬜ **FAQ '유료 API 부담 주체' 문의 발송 여부 결정** (초안은 내가 준비, 발송은 승인 후)

## 크리티컬 패스 — 최소 제출선 먼저 (상세: [submission-plan.md](../docs/submission/submission-plan.md))

> **U/P = 필수 최소 경로**(이것만으로 8/10 성립) · `X` = droppable upside · `Z` = 버퍼.
> 비평 반영: 패키징(P6→P7) **직렬화**, `Z9` 전제에서 `X8` 제외(버퍼 착시 제거), 실LLM 극소판을 **U2로 당김**(영상에 라이브 AI 확보), 간이 지도는 **v2 강등**.

### U1. 파이프라인 스파이크 (7/16) — 인프라 ✅ 배포 파이프라인 뚫림
- ✅ 로컬 **prod `next build`**(Turbopack) 통과 — Next 16 breaking change(`node_modules/next/dist/docs`) 정독 완료 (필수 게이트 해소)
- ✅ walking skeleton("수화기 너머의 벽") **Vercel 배포** → 공개 URL 렌더 확인 → https://hospital-sim-ashy.vercel.app/ (main 푸시 시 자동 재배포)
- ⬜ (U2와 겹쳐) 영상 20초 throwaway 유튜브 업로드 테스트 · LLM 단일 왕복 호출·지연 실측 — LLM 스파이크는 결제 활성 확인 후(선결②)
- ⏸ `ANTHROPIC_API_KEY` Vercel 환경변수 등록은 `X8`(실LLM) 착수 시

### U2. 한 판 UI 척추 + 실LLM 극소판 (7/16) — ① 🔜 진행중
- ✅ 결정론 코어를 React 배선(`GameClient.tsx`): 환자 도착 + **실시간 골든타임 카운트다운**(`tickTime`, TDD) / 병원 리스트 + '전원 콜' → `attemptTransfer` → 수용·거절 표시 / 종료 상태(ACCEPTED/DIED) UI + 입력 잠금 + '다시 한 판'
- ✅ 결정론 폴백 대사(`dialogue.ts`, TDD) + STEMI 시나리오(`scenarios.ts`, TDD·두 거절 사유 다 드러나되 풀림) 하드코딩 완주 — 브라우저 관찰 검증(NO_BED→NO_SPECIALIST→수용)
- ⬜ **실LLM 극소판**: 거절 대사 1종만 실제 Anthropic 왕복으로 렌더(무키면 폴백) — ⚠️ 결제 활성 확인 후(선결②)

### U3. 거절 누적 좌절 + 하드락 벽 (7/16) — ① ✅
- ✅ 거절 로그 리스트 + 사유 태그(병상없음/당직없음) 뱃지 + 병원별 재시도 횟수(`×N`)
- ✅ 자유 텍스트 설득 입력 — 매달릴수록 응답이 냉정해지되(`persuasionReply` 에스컬레이션, TDD) 병상0은 어떤 텍스트에도 `NO_BED` 유지. 불변식 테스트로 잠금(반복 재시도해도 절대 ACCEPTED 안 됨). 브라우저로 3회 매달림 관찰 검증
- ✅ 골든타임 임계 이하 화면 톤 경고(red vignette + 타이머 pulse, `lowTime` 로직 기반)
- ⏸ (v2 강등) 거절 병원이 붉게 꺼지는 간이 지도 — 구현비 대비 임팩트 낮음, 리스트로 충족

### R3.5. 리서치 + 전제 교정 (7/16) — ① ✅ (계획 외 삽입, 의도 정확도 확보)
- ✅ 실제 통계 리서치 + 적대적 검증(11에이전트 워크플로우) → [docs/research/](../docs/research/) 팩트체크·STEMI 팩트시트 (PR #10)
- ✅ 거절 사유 배후진료 중심 **4종 재설계**(NO_BED/NO_ER_ONCALL/ER_OVERCROWDED/**NO_BACKUP_CARE**) — Hospital 모델 분리(초기수용/최종치료/과밀), STEMI 시나리오 재균형(지배 병목=배후진료 불가), 각색 고지+디스클레이머. TDD 38 green (PR #11)
- ⏸ (선택·v2) 지방 거리·이송시간 축 / 즉사→연속 경사 예후 / 형사우려·방어진료 — 리서치엔 있으나 최소 제출선 이후로 보류
- ⚠️ **U4 디브리핑은 이 4종 구조 변수를 읽어야 한다** — 병상 중심이 아니라 배후진료 중심으로

### U4. 인과 디브리핑 → **차가운 사실 영수증** (7/16) — ① ✅
- ✅ 로그 → **팩트만** 결정론 산출(`debrief.ts` 순수 함수, TDD 8 tests): 전원 시도·거절·**거절 사유별 집계(첫 등장 순서)**·받을 수 있던 곳 N/전체·골든타임 소요. 해석 카피 0 — 함수가 순수 팩트 추출기.
- ✅ 결말 화면 = 라벨+숫자 '전원 기록' 영수증만. 반사실 분할·findings 카드·착지 카피 제거, 유도 헤더("무엇이 죽였나")→중립 "전원 기록", 각주는 허구 고지만(통계·출처는 팩트시트로). GameClient 배선, 브라우저 검증(DIED 12통·사유별 집계·1/6 · ACCEPTED 1/6), 46 green·next build 통과.
- ↺ **설계 전환("보여주지 말고 겪게")**: 초판은 "당신이 아니라 구조"를 글로 설명했으나, 플레이로 이미 손끝에 겪은 무력감을 자막으로 받아쓰면 여운이 강의로 납작해짐 → 해석을 삭제하고 사실(특히 반복된 `배후진료 불가 ×8`)이 스스로 고발하게. (사용자 지정)

### U4.5. 병원 장부 — 필수의료 경제(장부 에필로그) (7/16) — ① ✅
- ✅ **단일 병원 장부**(한바다대학병원) 결정론 산출(`ledger.ts` 순수 함수, TDD 8 tests) + 결말 패널: 미용·검진으로 흑자(순이익 +287억)인데 환자가 필요했던 순환기내과 채용은 0 → "왜 배후진료 불가였나"의 경제적 뿌리. **`0명`은 하드코딩 아니라 backupCare(=NO_BACKUP_CARE의 뿌리)에서 파생.** 조작 없음(패시브 리빌), 톤은 영수증과 동일(라벨+숫자, 해석 0). 화면 병치가 논지. 브라우저 검증, 54 green·next build 통과. [[game-show-dont-tell]]
- ✅ **전제 근거(리서치 먼저)**: 경량 리서치+적대 검증 워크플로우로 필수의료 저수가·적자 vs 피부·미용 고마진 방향 검증(방어 가능) → [docs/research/essential-care-economics.md](../docs/research/essential-care-economics.md). 부호만 근거 준수, ₩ 각색([[fact-grounding-before-mechanics]]·R3.5 선례).
- ⏸ (v2) **지역 집계 장부** — 여러 병원 합산으로 "시스템 전체가 그렇게 굴러간다"를 형상화. (사용자 지정: 지금은 단일 병원, 지역은 plan에만 보류)
- ⏸ (v2·B안) 플레이어가 수익을 배분·채용하는 **조작 루프**(내가 만든 벽에 내가 부딪힘) — 멀티라운드·경제 밸런싱, 마감 이후.

### U5. 실배포 v1 → **최소 제출선** (7/16, 예정 앞당김) — ① ✅
- ✅ prod 빌드(`tsc --noEmit`·`next build`) 통과 → Vercel 공개 URL 라이브 + 모바일(375px 가로 넘침 0)·데스크톱 스모크. **시드 고정은 자동 성립**(RNG 전무·`goldenTime` 순수 → 같은 판 항상 동일).
- ✅ STEMI 팩트시트 갱신([stemi-factsheet.md](../docs/research/stemi-factsheet.md)): "초안" 뗌, 스테일 교정(거절 2종→4종·병원 4→6곳), 결말 영수증·장부 반영, 경제 근거([essential-care-economics.md](../docs/research/essential-care-economics.md)) 크로스링크. 출처 각주+각색 고지 유지, '감수' 문구 없음.
- ✅ README 정직화+보강: 태그라인 과장("라이브 AI") 제거→현재=무키 결정론 폴백 명시(LLM 대사콜은 예정 가산 레이어=`X8`), "무엇을 겪나"(두 축)·플레이법·팩트시트 링크 추가. **무키 완주=현재 기본 상태**(LLM 미통합). 스크린샷은 P6 때 일괄(플레이스홀더).

### P6. 플레이 영상 (8/1–8/3) — ②
- ⬜ U5 배포본으로 30~60초 촬영 → 유튜브 업로드 (시드 고정=자동 성립).
- ⚠️ "라이브 AI 협상 구간"은 `X8`(실LLM) 착수 후에만 가능 — 미착수면 결정론 폴백 버전으로 촬영.
- ⚠️ 관찰: 콜드 로드 직후 첫 '전원 시작' 탭이 한 번 씹힘(하이드레이션 타이밍/자동화 레이스 가능성). 촬영 시 페이지 완전 로드 후 클릭. 신경 쓰이면 hydration 조사(별건).

### P7. 두 PDF (8/3–8/7) — ③④ · **여기서 4종 완성**
- ⬜ ③ 게임 소개 PDF (개요·플레이법·실행법·스크린샷·팩트시트)
- 🔜 ④ AI 활용 기술 PDF — **작업 초안 집필됨**: [docs/submission/ai-usage-doc.md](../docs/submission/ai-usage-doc.md) (디렉팅 B축 스파인 · 지금 집필 가능분 완료 · 라이브 로그·스크린샷은 극소판/`X8` 후 채움). 남은 일: PDF 변환·스크린샷·프롬프트 로그

### `X8`. LLM 2콜 풀버전 (droppable upside · **발전 가능성**: 디렉팅 물증 강화용, 사전과제 필수 아님 · P6·P7 조기완료 시 ≤8/7)
- ⬜ LLM 프록시(Next API 라우트, 서버 키·타입드 로더 검증) + 대사콜 풀버전
- ⬜ **정합성 테스트 TDD**: 코드 판정 == 최종 게임 상태 (LLM이 못 뒤집음)
- ⬜ 디브리핑콜(자연어) + 판당 호출 상한(6~10) + 무키/타임아웃 시 폴백 자동 강등
- ⬜ 협상 장면 재녹화 + ④PDF에 실제 프롬프트/응답 예시 갱신 — **이 안에서 ≤8/7 완결**(버퍼로 안 넘김)

### Z9. 버퍼 + 최종 제출 (8/8–8/10) — 코드프리즈 · 의존: **P6·P7만**
- ⬜ 배포 빌드 최종 QA(완주·콜드스타트·모바일·폴백 강등) + 4종 링크 전수 점검 → 폼 제출
- ⬜ 신규 기능·영상 재편집 금지

---

## E. 경영 확장 — "벽의 양쪽" 2막 단막극 (결정론 · 7/16~ · 제출선과 독립)

> spec §0의 "빈 활주로(7/16~7/29)" 작업. 8/10 제출작(협상+디브리핑+장부)을 **비파괴로 감싸는** 상위 구조 — 전화를 *받는* 병원까지 플레이. 이번 주는 API 불필요(결정론), 다음 주 실LLM(X8)은 대사만 얹음. 설계: [docs/superpowers/specs/2026-07-16-management-expansion-design.md](superpowers/specs/2026-07-16-management-expansion-design.md).

- ✅ 설계 확정(브레인스토밍) → spec (PR #17)
- ✅ 근거 리서치 — 필수과 소송·방어진료 리스크의 **부호(결과의 중대성 축)** → [essential-care-litigation-risk.md](../docs/research/essential-care-litigation-risk.md) (PR #18)
- ✅ **로직 코어(Part 1)** — `setup`(위저드·과 카탈로그·예산) / `receiving`(콜 큐·하드락/선택·장부·소송 누적) / `session`(5페이즈·2막 분기) / `ledger` 재배선(플레이어 병원) / `dialogue`(1막 다크코미디). 전부 결정론·TDD, 92 green·tsc 0·비파괴 (PR #20). 계획: [docs/superpowers/plans/2026-07-16-management-expansion-core.md](superpowers/plans/2026-07-16-management-expansion-core.md)
- ✅ **UI 통합(Part 2)** — `SetupWizard`·`ReceivingPhase`·`SessionClient`·에필로그 배선(Task 2~6) + **통일 시각 최종 마감·막간 붕괴 시그니처·a11y/반응형·배포 게이트**(Task 7). 진입=세션이 THE 게임(위저드-first, 기존 STEMI는 2막 TRANSFER로 흡수)·통일 시각(단일 어두운 zinc 시스템 + 초록→빨강 액센트 아크, body/html 지면을 프리퍼런스 무관 다크로 고정해 밝은 화면·흰 플래시 0). 설계: [docs/superpowers/specs/2026-07-17-management-expansion-ui-design.md](superpowers/specs/2026-07-17-management-expansion-ui-design.md). (로직 코어 Minor 4건: 음수값 방어→Part2 해소 / essentialHires 다필수과·도달불가 분기 커버·STEMI_SPECIALTY export→v2·별건 보류). Task 7 롤업 결함(LedgerPanel 순이익 부호 하드코딩 `+-24억`)도 이때 수정 + 회귀 테스트.
  - ✅ **이연 Minor 3건 청소 (PR #27)** — `callerPlea` 순수 함수 추출(TDD·대사 선택 통일)·Interstitial 붕괴 타이머 `useEffect` cleanup·`firedRef` 중복 진입 가드(reduced-motion 경로 커버). tsc 0·vitest 309 green·next build·브라우저 공범 경로 검증. (`receivingLine` 미사용 seed warning은 pre-existing 별건.)
  - ✅ **양심 경로 완주 코드 검증 (2026-07-17)** — Preview로 양심대학병원(순환기 2명·60억) SETUP→RECEIVING(5콜·STEMI가 하드락 아닌 **선택**, 전부 수용)→INTERSTITIAL(−46억)→EMERGENCY(원내 PCI·**생존**)→EPILOGUE(환자 살림·순이익 **−96억**=순환기−24+진료−22+소송−50) 완주 확인. 콘솔 0. 공범(흑자)↔양심(−96억+소송) 낙차 정상. **발견→해소(PR #29)**: 콜 c3 라벨 "검진 패키지 문의"에 보톡스 대사가 붙던 라벨↔대사 불일치(`COSMETIC_WALKIN` 풀에서 c1·c3 둘 다 `index%2==0`→pool[0]) → `callerPleaAt(queue, index)`로 **kind 내 등장 순번**을 seed로 넘겨 정합(TDD, c3→pool[1] '검진 …'). 브라우저 검증 완료.
  - ⬜ (컨트롤러 몫, 코드 아님) Step 5 — **스크린샷 이미지 캡처**(④ 제출 문서·P6/P7용). in-app 브라우저 `screenshot` 도구가 이 환경에서 재차 30초 스톨(T-034)이라 이미지 미확보 — 최종 캡처는 사용자 로컬 화면에서. 캡처 대상 체크리스트는 세션 요약 참조.
  - ✅ **랜딩 타이틀 카드 (2026-07-17, 플레이테스트 폴리시)** — URL 진입 시 바로 위저드가 뜨던 걸, 앞에 다크 지면 타이틀 카드("수화기 너머의 벽")를 세워 첫 화면으로. 원본(97a012c) 느낌을 되살리되 카피는 경영 전체 아크로 재프레이밍("세우고=채용/받고=콜큐·응급/대가를 치른다=결말"). `LANDING`을 세션 페이즈로 승격(`startSession→LANDING`, `beginSetup` LANDING→SETUP 가드) — 재시작도 startSession 단일 진입점이라 자동 랜딩 리셋. TDD(+3)·tsc 0·vitest 316·브라우저 검증(시작→위저드·콘솔 0). 설계: [superpowers/specs/2026-07-17-landing-title-card-design.md](superpowers/specs/2026-07-17-landing-title-card-design.md).
  - ✅ **위저드 2단계 + 힌트 제거 (2026-07-17, 플레이테스트 폴리시)** — SETUP을 두 패널로: 이름 하나만(NAME) → 과 채용(DEPTS). 과 카드의 "수익 예상/적자·소송" 해석 라벨·색을 없애 **과 이름 + 채용비**만 노출, 상단 tell("순환기내과는 비워둬도…")도 중립 문구로. show-don't-tell을 SETUP까지 확장 — 흑자/적자·소송은 플레이어가 장부·결말로 스스로 알게. essential/lawsuitRisk 데이터·판정은 불변(표시만 감춤). `SetupWizard.tsx`만·tsc 0·vitest 316·브라우저 전체 플로우 검증.
- ⏸ (다음 주·`X8`) 실LLM 경영/협상 대사 — 폴백 대사 위에 얹음
- ⏸ (구조 2·본선 이후) 재투자 루프([U4.5](#u45-병원-장부--필수의료-경제장부-에필로그-716--)의 B안)·병동 증설·장비 업그레이드·다회차 캠페인·다양한 환자 축·리치한 소송 이벤트 시스템

## ⏸ 본선 48시간 확장 (신청 이후 보류)

- ⏸ 음성 TTS(히어로 보이스)
- ⏸ 시나리오 추가 — 필수의료 붕괴·지방 의료 공백을 독립 시스템으로
- ⏸ 방어진료 드리프트 누적(반복 플레이로 플레이어가 전원·회피로 기우는 체감)
- ⏸ 동적 디렉터(콜 밀도 에스컬레이션 — 슬로건 "디렉터"에 부응)
- ⏸ 소송·언론 인과 사슬 확장
