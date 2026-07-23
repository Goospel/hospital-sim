---
tags:
  - type/meta
---

# plan — 앞으로 할 일 (살아있는 계획)

> 범례: ✅완료 · 🔜다음 · ⬜예정 · ⏸의도적 보류(본선/v2) · ⚠️리스크·전제 · 🔴기각된 답(이력 보존)
> 관련 문서: [changeLog.md](changeLog.md)(완료 상세·역순) · [troubleshooting.md](troubleshooting.md) · [docs/concept/game-concept.md](../docs/concept/game-concept.md) · **[submission-plan.md](../docs/submission/submission-plan.md)**(25일 제출 로드맵 상세)
>
> 📏 **이 문서의 규율**: plan은 **"앞으로 할 일 + 살아있는 제약"**만 담는다. 구현이 끝나 changeLog에 기록된 완료 서사는 여기 쌓지 않는다 — 완료 마일스톤은 "무엇이 끝났나" **한 줄(지도)**로만, 상세는 changeLog·PR·git이 가진다. (2026-07-18 정리: 완료 서사 130줄을 걷어냈고, F1~F3의 📌 설계 근거는 [spec §13](superpowers/specs/2026-07-17-essential-care-economics-devices-design.md)으로 이관. 이 규율 자체가 "문서가 뚱뚱해진다"의 처방 — 읽기 패턴이 통독인 plan에 조회용 완료 기록이 섞이면 안 된다.)

## 목표

NAN 2026 (NHN Game × AI 해커톤) **사전 과제 제출**. 마감: **2026-08-10**. 본선(9/4~9/6)은 이 프로토타입을 확장.

**제출물 정의·진행 상태는 [docs/submission/requirements.md](../docs/submission/requirements.md)가 단일 출처다**(요강 5종 표 · 솔로라 1~4번 · 미확인 항목). 여기 목록을 다시 적지 않는다 — 두 곳에 적으면 한쪽이 낡는다.

전략: **최소 제출선 먼저** — LLM 없이 결정론 폴백으로 한 판 플레이+배포를 먼저 확보하고, 실LLM은 그 위에 **비파괴 가산 레이어**로. 핵심 원칙: **판정 = 결정론 코드 / 대사 = LLM**(2콜 분리). 게임 상태 전이는 절대 LLM이 정하지 않는다.

**AI 심사축(2026-07-16 결정)**: 심사 북극성 = **'디렉팅'**(AI를 어떻게 지휘해 게임을 만들었나, B축). 대화 LLM(게임 속 AI 기능, A축)은 B축의 대체재가 아니라 **최강 물증**이다 — 2콜 권한 경계(`adjudicate`에 설득 파라미터 부재 = 타입 수준 하드월)가 "AI를 어디까지 믿고 어디서 끊는가"의 디렉팅 그 자체. → 극소판 라이브 유지, 풀 2콜(X8)은 발전 가능성으로 후순위. ④ 문서는 B축으로 리드하고 A축을 물증으로 → [ai-usage-doc.md](../docs/submission/ai-usage-doc.md).

---

## ✅ 완료 — 지도만 (상세·회고는 changeLog가 단일 출처)

- **M0·M1 — 셋업 + 순수 시뮬 코어**: Next+TS+Tailwind·배포 파이프라인·작업추적 3종 / 결정론 전원 판정(4게이트)·골든타임·상태기계·**병상0 하드락 불변식**. PR #1~#3
- **U1~U5 — 최소 제출선**: 한 판 UI 척추·거절 누적·설득 입력(하드락 유지)·인과 디브리핑(차가운 영수증)·병원 장부(흑자인데 필수과 채용 0)·Vercel 라이브. PR #6~#16
- **R3.5~R3.8 — 리서치·문서 정합 계열**: 거절 사유 배후진료 중심 4종 재설계 / game-concept를 코드·리서치 현재 상태에 lint 동기화 / AI활용 규칙 감사 + 훅 2개 승격 / troubleshooting 항목 1건=파일 1개 분할. PR #10·#11·#36·#42·#43
- **E — 경영 확장(2막)**: 위저드→콜큐→막간→응급→결말 플레이어블 / 7일 루프+달력(분기 폐기) / 하루 진료 자리 제한(과부하) / 랜딩 타이틀 카드. PR #17~#35 ⚠️ **아래 「응급 재설계 A」가 2막(주말 응급·뺑뺑이 미니게임)을 은퇴시켜 supersede**
- **응급 재설계 A — 2막 은퇴·받는 쪽 통합**: 주말 STEMI 클라이맥스·골든타임 뺑뺑이 미니게임 은퇴(12파일 삭제), 7일차 DAY_END→WEEK_SUMMARY 직행, 결산=돌려보낸 응급 수·에필로그=주간 신문+장부. 플레이어는 항상 받는 벽. 설계 [spec](../docs/superpowers/specs/2026-07-19-received-side-emergency-redesign-design.md)
- **응급 재설계 B — 응급 CallKind 다양화**: 분만(산부)·뇌출혈(신경외과)·중증외상(외과)을 받는 콜로 신설 — 4종이 hardlockReason 한 case를 공유(adjudicate 제네릭 재사용, 판정 무변경). DAY_PLANS 4종 분산 재구성, 하드락 대사·신문 헤드라인이 과를 정확히 따라감, 결산에 받은/돌려보낸 응급 병치. 재정중립 산부 −16 상쇄가 장부에서 체감. 233 vitest green + tsc 0 + 브라우저 라이브 검증
- **의사 개인 유닛 — 담당 수·피로도 표시 레이어**: 채용 인원수를 이름 붙은 개인 유닛으로(개원 시 결정론 명명), RECEIVING에 각 의사의 담당 환자 수(실시간)·피로 막대. 시스템 부하가 개인의 몸에 남기는 자국을 가시화(경영자 vantage). 순수 표시(판정·경제 0 침습), `doctor.ts`(런타임 임포트 0)+`Hospital.roster?`+`SessionState.fatigue`(주 간 누적). 268 vitest green + tsc 0 + 브라우저 검증. ⏸ 후속: **승격 문(피로→판정 먹이기)**·흉부외과는 라우팅 콜이 없어 항상 담당 0(현 콜 종류 구성상 정직) — 축 부여 시 함께
- **시간 기반 하루 루프 — 전문의 점유 벽**: 하루를 콜 5통 고정에서 9시~마감 시계로, 진료 소요시간(seed 결정론 `daysim.ts`)이 배후과 의사를 점유해 응급이 자유 전문의 없으면 벽(`NO_FREE_SPECIALIST`). 능동 거절 제거(응급 자동·선택진료만 결정), 병상 벽 제거, boarding=의사 점유 이월, dayProgress 시계 기반. 배후과 예약(SPECIALIST_ELECTIVE) 흑자원+점유 경쟁원(라벨 DEPARTMENTS 파생). 289 vitest green + tsc 0 + next build + 브라우저 실측(콘솔 0). 최종 리뷰 Ready(I8 구조 방어 — 흑자원 인원캡3·콜델타 큐고정). 설계 [spec](../docs/superpowers/specs/2026-07-20-time-based-day-loop-design.md)·[플랜](../docs/superpowers/plans/2026-07-20-time-based-day-loop.md)·[리서치](../docs/research/physician-workflow-and-backup-occupancy.md). → ✅ 아래 「내과 진료과 추가」로 실현(GENERAL_EMERGENCY 설계A 폐기)
- **내과 진료과 추가 + 복통 응급 세분**: 내과(INTERNAL_MEDICINE) 신설(저수가 박리다매 −5·essential·소송 미구현). `GENERAL_EMERGENCY`를 급성복증(`ABDOMINAL_EMERGENCY`, 외과)·고열감염(`MEDICAL_EMERGENCY`, 내과)으로 세분해 그 과로 라우팅·점유 경쟁. `isCriticalEmergency`를 `requiresBackupCare`(배후·신문)/`carriesLawsuitRisk`(소송) 술어 2개로 분리 → 무게 비대칭(급성복증=소송+신문 / 고열감염=신문만). 설계 A(GENERAL 무점유) 폐기→B(세분 응급 점유). 302 vitest green + tsc 0 + 브라우저 7일 완주(I8 +47억·콘솔 0). 설계 [spec](../docs/superpowers/specs/2026-07-20-internal-medicine-department-design.md)·[플랜](../docs/superpowers/plans/2026-07-20-internal-medicine-department.md)·[리서치](../docs/research/internal-medicine-emergency-grounding.md). ⏸ 후속: 내과 법적 리스크(소송) 구현·회색지대 노이즈·내과↔외과 오분류
- **병원 성장 시스템(재투자 루프)**: 주 사이 GROWTH 페이즈 — 금고(누적 순이익)로 배후과 채용·병상 증설. ①인력 제로섬(전국 유한 풀 `system.ts`·소진=못 뽑음·배경 감소) + ②금고 재정 지속불가 + ③병상 증설→콜 볼륨↑(3→5·5→7·7→9)로 커질수록 배후 없으면 더 뺑뺑이. 에필로그 전국·지방 병치(강원 40.3%·풀 소진). SDD 11태스크·**337 vitest**·tsc 0·next build·I8 결정론 계산(최대 353·수익과 3캡)·브라우저 e2e(돌려보냄 20→33). 설계 [spec](../docs/superpowers/specs/2026-07-20-hospital-growth-system-design.md)·[플랜](../docs/superpowers/plans/2026-07-20-hospital-growth-system.md)·[리서치](../docs/research/hospital-growth-dilemma-grounding.md)·[T-056](troubleshooting/T-056.md). ⏸ 후속: 상급종합 지위·③ 공간화·개원 채용 풀 차감(설계 확인)
- **병원 맵 — 의사를 숫자에서 아바타로**: RECEIVING 화면에 탑다운 픽셀 병원 맵을 얹었다. `deriveMapScene(receiving, atMin)` 순수 파생 하나가 방(8칸, 안 뽑은 과도 빈 방으로 존재)·의사 위치·`busyUntil` 파생 병상 환자·조명 3단을 전부 계산한다(새 게임 상태 0개, `src/game/*.ts` 그 외 무변경). `compareDeptKeys`로 맵 방 순서와 `DoctorRoster` 명단 순서를 단일 출처로 묶었다. inline SVG 자체 제작 스프라이트(`PixelSprite.tsx`) + 아바타 절대 좌표 한 레이어(`HospitalMap.tsx`)로 이동이 CSS transition으로 미끄러진다. 콜 사이 빨리감기(`useFastForwardClock` — 캡 1500ms·12스텝·reduced-motion 즉시 점프)와 맵 클릭 스킵을 얹어 맵 주도로 `ReceivingPhase` 레이아웃을 재편했다. SDD 5태스크·**367 vitest**(+30)·tsc 0·next build·브라우저 7일 완주 실측(8칸 빈 방·수용 시 아바타 입실+침대 점유·진료 종료 시 퇴실+침대 비움·17시 이후 🌙 전환·1인 배후과(외과) 야간 소등 vs 2인 배후과(순환기) 유지·빨리감기 애니메이션+스킵·모바일 375px 가로 스크롤 없음, 콘솔 에러 0). 설계 [spec](../docs/superpowers/specs/2026-07-23-hospital-map-design.md)·[플랜](../docs/superpowers/plans/2026-07-23-hospital-map.md) ⚠️ **아래 「연속 시간 흐름 — 콜 사이가 흐른다」가 빨리감기(`useFastForwardClock` — 캡 1500ms·12스텝)를 은퇴시켜 supersede**
- **연속 시간 흐름 — 콜 사이가 흐른다**: RECEIVING이 "정지가 기본이고 움직임이 예외"인 슬라이드쇼였다. 시계를 게임 1분 = 50ms로 늦추고 캡을 없애(콜 사이 0.48초 → 6초, `useHospitalClock`) 콜과 콜 사이가 끊기지 않고 흐른다. 시계만 늦추면 자유 의사가 복도에 서 있어 "느려진 정지 화면"이 되므로, 유휴 배회(`wanderTiming` — 아바타 안쪽 `transform`)와 배경 보행자(`ambientWalkers` — 조명 파생 주간 5/석양 2/야간 0, MapScene 밖 별도 레이어)를 **게임 시계와 분리된 CSS 층**으로 세웠다 — 결정 대기로 시계가 멈춰도 병원은 계속 돈다. 콜 카드는 도착해야 뜨고(`CallCard` 분리 — 마감 흐름에선 `queue[index]`가 undefined), 하루의 끝은 `session.ts`가 이미 계산해 내일 아침으로 넘기던 마감 초과 점유(`dayEndMin`)를 읽어 19시를 넘겨 재생한다(새 숫자 0개). 게임 로직(receiving·adjudicate·daysim·session) 0줄. 설계 [spec](../docs/superpowers/specs/2026-07-23-continuous-clock-design.md)·[플랜](../docs/superpowers/plans/2026-07-23-continuous-clock.md)

### 🔜 다음
- ✅ **문서 부채(슬라이스 A/B 이월)**: README·docs/submission(ai-usage-doc·submission-plan)·docs/concept(ai-scenario-generation·game-concept) 5종의 '골든타임 뺑뺑이 간판'·삭제 모듈 거짓 현재서술을 받는 쪽 통합·응급 다양화로 정합(spec §8). 역사 문서는 전환 배너+단일 출처 포인터로 처리. (2026-07-20, 상세 changeLog)
- **F1~F3 — 필수의료 딜레마 장치**: 콜당 수가/원가("가격을 누가 정하나"가 부호를 가름) / 24시간 당직(F1b) / 검사+boarding(인과 사슬 닫힘) / 다음날 아침 신문. PR #38~#41. **📌 구현 후 설계 근거는 [spec §13](superpowers/specs/2026-07-17-essential-care-economics-devices-design.md)**
- **F4 — 가산금 배분(흉부외과)**: 🔴 **절단**(PR #44). 마감이 아니라 **사실이 세 번 거부** — 흉부외과는 1막에서 도달 불가 화면이었고, 역할을 주려 한 STEMI 게이트·응급 CABG·심장통합진료 삭감이 셋 다 거짓. 근거: [thoracic-surgery-role.md](../docs/research/thoracic-surgery-role.md) · [T-049](troubleshooting/T-049.md)
- **디자인 테마 Plan A — "의무기록·차트" 시스템**: 방향 확정(5안 심사)·토큰/폰트 3계층 기반(+Arial 버그 수정)·원형(TransferRound)/정점(Epilogue) 리스킨·안전한 카피. PR #49. 근거: [spec](superpowers/specs/2026-07-18-design-theme-dossier-design.md)·[Plan A](superpowers/plans/2026-07-18-design-theme-dossier-foundation.md)
  - ⬜ **디자인 Plan B(후속)**: 나머지 화면(랜딩·위저드·콜접수·달력·막간·원내응급) + **장부 종이화(SegmentTree+LedgerPanel+CheerfulLedger 한 단위)** 토큰 교체 — 별도 계획. (Plan A에서 SegmentTree는 부모 미리스킨으로 dark-on-dark라 zinc로 되돌림.)
  - ⬜ **카피/톤 세션(범위 밖 보존)**: 랜딩 태그라인 둘째 문장·Epilogue 헤드라인/부제·transfer placeholder 재작성 + 기관명 가공. 시각과 분리(게임 '내용' 변경).

---

## 🔑 선결 — 사용자 확인/결정 (코드 아님 · 내가 대신 못 함)

- ⬜ **제출 요강/폼 전문 정독** → **미확인 항목 목록은 [requirements.md 「❓ 아직 확인 못 한 것」](../docs/submission/requirements.md)이 단일 출처다**(여기 다시 적지 않는다). 확인한 항목은 그 문서에서 체크한다. — *최우선이던 「1번 비고 `GitHub Pages`가 예시인지 지정인지」는 **답을 기다리는 대신 Pages 배포를 추가해** 어느 쪽이든 충족하게 만들어 목록에서 내렸다(2026-07-22).*
- ⬜ **Anthropic 콘솔 결제/크레딧 활성 확인** (미설정이면 X8 스킵 전제 → ④PDF는 설계+로컬 시연 중심)
- ⬜ **FAQ '유료 API 부담 주체' 문의 발송 여부 결정** (초안은 준비, 발송은 승인 후)

## 크리티컬 패스 — 남은 것 (상세: [submission-plan.md](../docs/submission/submission-plan.md))

- 🔜 **엔딩 누적 결산형 — 이번 주 신문 아카이브** (진행 중): 에필로그에 7일 누적 돌려보낸 STEMI를 신문 헤드라인 아카이브로(결정론, 플레이 중 본 기사와 글자까지 동일). 7일차 거절이 증발하던 구멍을 메움 + '사람 명부↔돈 장부' 병치. 북극성 = **누적 결산형**(엔딩은 쟁취 아닌 필연 · 본선은 N주 확장). 근거: [game-concept.md §7 엔딩 구조](../docs/concept/game-concept.md)
- ✅ **주 반복 루프 — N주 확장 첫 삽** (2026-07-18, PR 예정): 게임이 한 주로 안 끝나고 `WEEK_SUMMARY`에서 **다음 주**(다음 세계 이벤트를 현재 세계에 누적·같은 병원으로 재개) / **종료**(`EPILOGUE`). 매주 재구성되는 세계를 여러 주에 걸쳐 노출 — "한 주면 끝나 변화가 안 보인다"(사용자) 해소. 응급 매주 반복(사용자 선택). 에필로그 장부는 **최종 주** 결산(N주 누적 장부는 구조 손익 ×N 스케일 + 일회성 채용 분리 필요 → ⏸ 후속); 주 간 누적은 WEEK_SUMMARY의 `cumulativeNetBillions`로 노출.
- ✅ **① GitHub Pages 배포 추가** (2026-07-22) — 요강 1번 비고(`GitHub Pages (링크)`)가 예시인지 지정인지 **확인을 기다리지 않고** 양쪽을 다 만족시켜 리스크를 없앴다. 이 게임은 API 라우트·서버 액션·동적 서버 API가 0개인 순수 클라이언트 앱이라 **코드 0줄 수정**으로 정적 export가 됐다 — `PAGES_BASE_PATH` 하나가 스위치([next.config.ts](../next.config.ts)), env 없으면 Vercel 빌드는 종전과 동일. → https://goospel.github.io/hospital-sim/
- 🔜 **③④ PDF 최종화** (P7, 8/3~8/7) — 제출 패키지 골격은 섰다(`docs/submission/final/` · `npm run pdf`로 재생성, 원본은 md). **남은 것만**: ~~ⓐ 저장소 공개 URL 확정치 기입~~ (완료 2026-07-22 — 플레이는 Pages, 소스는 저장소 URL로 3종 확정) ⓑ 스크린샷을 **배포본** 기준으로 재캡처(현재는 로컬 dev 빌드) ⓒ ④§6-4 런타임 LLM 프롬프트↔응답·폴백 강등 로그(U2 이후) ⓓ 제출 요강 재확인(마감 시각·타임존·빌드 제출 형식)
- ⬜ **U2 실LLM 극소판** — 거절 대사 1종만 실제 Anthropic 왕복으로 렌더(무키면 폴백) + 영상 20초 throwaway 유튜브 업로드 테스트·LLM 왕복 지연 실측. ⚠️ 결제 활성 확인 후(선결②). `ANTHROPIC_API_KEY` Vercel 환경변수 등록도 이때
- 🔜 **R3.7 research 나머지 26건 재검증** (P7 직전, 8/1~8/3) — "이 문장을 문서가 **의도적으로 비판**한 것인가" 렌즈를 추가해 다시 돌리거나 건별로 사람이 판정. **지금 목록을 그대로 적용하면 리서치를 코드에 맞춰 파괴한다.** 살릴 후보: `essential-care-economics` 내부 모순 3건(:42·:93·:99) · `fee-schedule:248` 단위 표기 · 깨진 앵커 2건

### P6. 플레이 영상 (8/1–8/3) — ②
- ⬜ U5 배포본으로 30~60초 촬영 → 유튜브 업로드 (시드 고정=자동 성립)
- ⬜ **스크린샷 이미지 캡처**(④ 제출 문서·P6/P7용) — in-app 브라우저 `screenshot`이 이 환경서 30초 스톨(T-034)이라 **사용자 로컬 화면에서**. 캡처 대상 체크리스트는 세션 요약 참조
- ⚠️ "라이브 AI 협상 구간"은 X8(실LLM) 착수 후에만 가능 — 미착수면 결정론 폴백 버전으로 촬영
- ⚠️ 콜드 로드 직후 첫 '전원 시작' 탭이 한 번 씹힘(하이드레이션 타이밍/자동화 레이스 가능성). 촬영 시 페이지 완전 로드 후 클릭. 신경 쓰이면 hydration 조사(별건)

### P7. 두 PDF (8/3–8/7) — ③④ · **여기서 4종 완성**
- ⬜ ③ 게임 소개 PDF (개요·플레이법·실행법·스크린샷·팩트시트)
- 🔜 ④ AI 활용 기술 PDF — 초안 집필됨([ai-usage-doc.md](../docs/submission/ai-usage-doc.md), 디렉팅 B축 스파인). 남은 일: PDF 변환·스크린샷·프롬프트 로그(극소판/X8 후 채움). ⚠️ **R3.6 lint 후에 써야** 존재하지 않는 게임을 설명하는 PDF가 안 나온다

### X8. LLM 2콜 풀버전 (droppable upside · **발전 가능성**: 디렉팅 물증 강화용, 사전과제 필수 아님 · P6·P7 조기완료 시 ≤8/7)
- ⬜ LLM 프록시(Next API 라우트, 서버 키·타입드 로더 검증) + 대사콜 풀버전(경영/협상 대사를 폴백 위에 얹음). ⚠️ **정적 export는 API 라우트를 담지 못한다** — 프록시는 Vercel에만 살고, Pages 빌드는 그걸 크로스오리진으로 부른다(CORS 헤더). 안 붙여도 Pages판은 결정론 폴백으로 완주하며 **판정이 코드라 게임 동작은 두 배포가 동일**하다(대사 표현만 갈림)
- ⬜ **정합성 테스트 TDD**: 코드 판정 == 최종 게임 상태 (LLM이 못 뒤집음)
- ⬜ 디브리핑콜(자연어) + 판당 호출 상한(6~10) + 무키/타임아웃 시 폴백 자동 강등
- ⬜ 협상 장면 재녹화 + ④PDF에 실제 프롬프트/응답 예시 갱신 — **이 안에서 ≤8/7 완결**(버퍼로 안 넘김)

### Z9. 버퍼 + 최종 제출 (8/8–8/10) — 코드프리즈 · 의존: **P6·P7만**
- ⬜ 배포 빌드 최종 QA(완주·콜드스타트·모바일·폴백 강등) + 4종 링크 전수 점검 → 폼 제출
- ⬜ 신규 기능·영상 재편집 금지

---

## ⏸ 보류 — 지금 안 하는 이유를 보존

### 최소 제출선 이후 / v2
- ⏸ 거절 병원이 붉게 꺼지는 **간이 지도** — 구현비 대비 임팩트 낮음, 리스트로 충족
- ⏸ 지방 거리·이송시간 축 / 즉사→연속 경사 예후 / 형사우려·방어진료 — 리서치엔 있으나 최소 제출선 이후로 보류
- ⏸ **지역 집계 장부** — 여러 병원 합산으로 "시스템 전체가 그렇게 굴러간다"를 형상화 (지금은 단일 병원)
- ✅ **재투자·조작 루프 코어 실현** (2026-07-21, 위 완료 지도 「병원 성장 시스템」) — 금고 재투자·병상 증설·전국 풀 제로섬으로 "내가 만든 벽에 내가 부딪힘"을 실현. ⏸ **잔여**: 상급종합 지위(④+② 정점)·③ 지방 공간화(지도·거리·타 병원)·개원 채용의 풀 차감·리치한 소송 이벤트·다병원 지역 집계
- ⏸ **changeLog 4필드 스키마** — 효과는 실측됐지만(항목당 6.8배→1.6배) 남은 PR 5~10개면 95~114KB가 돼도 **역순이라 아무 일도 안 일어난다.** 마감 전엔 불필요, 본선 확장 카드

### F 딜레마 — 남은 갈래
- ✅ **순환기 상한 재검토 — 안 좁힘(상한 3 유지)** (2026-07-18): 3명째는 코드에선 강지배지만 현실에선 동시 진료 처리량·당직 로테이션을 산다 → 좁히면 [T-042](troubleshooting/T-042.md)("코드가 표현 못 하는 걸 현실에 없는 것으로 착각")를 반복. 축 부여(B안=동시 처리량 모델링)는 ⏸ 본선 확장. 근거는 코드 옆 단일 출처(`setup.ts` `MAX_DOCTORS_PER_DEPT` 주석)
- ⏸ 7일차 거절의 **결말 후속 기사**("3년 만에 송치" 구조 — 그 의사가 플레이어). F4 절단됐으니 독립 판단, 인과는 F1~F3로 이미 닫혀 급하지 않음
- ⏸ **워크인 자격 (경영확장 3단계)** — 미용·검진 의사 ≥1이라야 워크인 수용(`revenueCare` 신설). 딜레마엔 영향 없어 뒤로
- 🔴 **기각된 답 — "위저드 상한 1"** (이력 보존, T-042): 코드가 이진값이니 게임도 이진으로 맞추자는 것 → **코드의 한계를 현실의 진실로 착각**(T-039 단위 혼용과 같은 계열). 사용자가 기각 — *"현실에선 순환기 의사가 2명 배치될 수 있잖아. 한 명으로 강제하면 게임이 저렴해 보인다."* 답은 이미 레포 안 리서치에 있었다(24시간 중재 순환기 PCI 병원 · 당직 1명이 3명 동시진료 · 인력부족 사유 2.3배)

### 본선 48시간 확장 (신청 이후 보류)
- 🔜 **F4 지정 티어 → 개원 등급 자격(파생 라벨) 슬라이스 = 스펙 확정** (2026-07-20): "권역응급의료센터" 등은 자칭 불가한 법적 지정 명칭이라([emergency-tier-designation-law.md](../docs/research/emergency-tier-designation-law.md)), 필수 배후과 수에서 등급을 **파생**해 위저드에 실시간 표시(A안 — 판정·경제 불변식 0 침습). 개원=경영자 창립 결정 자리로 두께 부여. **이 정체성 슬라이스는 마감 전 착수**. 설계: [2026-07-20-hospital-tier-credential-design.md](../docs/superpowers/specs/2026-07-20-hospital-tier-credential-design.md). ⏸ **본선 잔여**: 재지정/철회(연 단위 강등·다주차) · 등급이 실제 용량 변경(B/C) · 24h 가중 권역 예산벽 · 지역 신문 결과층. 재지정 재료(권역심뇌혈관센터 별표2·목포중앙병원 2022 철회, [thoracic-surgery-role.md](../docs/research/thoracic-surgery-role.md))는 보존.
- ✅ **세계 이벤트 공문 브리핑 + 수가·재정 덱 E1–E4** (2026-07-20): 각 이벤트에 실제 정책 도구로 채운 공문(`briefing`)을 붙여 병원장이 "무엇이 어떻게 바뀌나"를 고시 질감으로 읽게. 개원 상쇄를 산부→검진(검사 과보상 인하)으로 교체(2026 실제 개편 밀착), 덱을 E1(검사재분배)/E2·E3(순증)/E4(채용비)로 다양화해 반복 해소. 억 손익은 브리핑에 안 씀(거짓 정밀도 회피)·장부에서 겪음. 설계: [2026-07-20-world-event-briefing-design.md](../docs/superpowers/specs/2026-07-20-world-event-briefing-design.md). ⏸ **남은 것(본선)**: 규제·여론 축(capacity/lawsuit 노브) · 진짜 시행 시차 발동 · 양방향 로테이션(개선 뒤 D형 상쇄) · 매주 재구성 economics 실효(E2·E3·E4 효과 활성).
- ✅ **재정중립 제로섬 — 최소 슬라이스 착수** (2026-07-19): 개원 이벤트(`OPENING_EVENT`)를 순환기 +6 / 산부 −6(→ 2026-07-20 검진 오프셋으로 교체) 재정중립 정책수가 패키지로 — 급여 풀 profit 합=0, 미용(비급여) 무풍지대가 개원 위저드 숫자에서 드러남. "필수과 수가가 안 오르는 이유가 악의가 아니라 산수"를 값으로. 설계: [2026-07-19-fiscal-neutral-opening-event-design.md](../docs/superpowers/specs/2026-07-19-fiscal-neutral-opening-event-design.md), 근거: [fee-schedule-and-subsidies.md](../docs/research/fee-schedule-and-subsidies.md) §6. ⏸ **남은 것(본선)**: 산부 콜로 장부 체감 · 매주 재구성이 economics에 물리게(2주차+ 실효) · hireCost 손잡이 복원 — 정책 레이어 통째 신설은 여전히 마감 후 후보로 가장 강함
- ⏸ 음성 TTS(히어로 보이스) · 시나리오 추가(필수의료 붕괴·지방 의료 공백을 독립 시스템으로) · 방어진료 드리프트 누적 · 동적 디렉터(콜 밀도 에스컬레이션) · 소송·언론 인과 사슬 확장
