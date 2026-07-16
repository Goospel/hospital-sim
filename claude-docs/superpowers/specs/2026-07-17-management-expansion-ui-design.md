# 경영 확장 UI 통합 설계 (Part 2) — "하나의 세계, 온도만 바뀐다"

> **한 줄 요약**
> Part 1(로직 코어, #20)에서 결정론·TDD로 완성한 2막 세션 상태기계 위에 React UI를 배선한다. 게임 전체를 **이미 배포된 단 하나의 어두운 시각 시스템** 안에 두고, 1막(경영·다크코미디)→2막·결말(냉정·비극)의 톤 아크를 **액센트 색과 카피·모션**으로만 만든다. 밝은 화면과 어두운 화면을 오가지 않는다 — 통일성이 1순위.

- **작성일**: 2026-07-17 (KST)
- **상태**: 브레인스토밍 종료 → 사용자 리뷰 대기 → 구현 계획(writing-plans)
- **부모 설계(확정)**: [2026-07-16-management-expansion-design.md](2026-07-16-management-expansion-design.md) — 톤·구조·경제·철학 다섯 결정은 여기서 확정됨. 이 문서는 그 **UI 구현**만 다룬다.
- **로직 코어(구현 완료)**: [../plans/2026-07-16-management-expansion-core.md](../plans/2026-07-16-management-expansion-core.md) · `src/game/{session,setup,receiving,dialogue}.ts` (92 green·tsc 0)
- **관련**: [plan.md](../../plan.md) · [docs/game-concept.md](../../../docs/game-concept.md)

---

## 0. 범위 — Part 2는 순수 UI 배선

판정·상태 전이·경제·대사는 **이미 순수함수로 존재**한다(Part 1). Part 2는 그 함수들을 React로 소비하는 표현 계층만 새로 만든다. **게임 상태 전이는 UI가 아니라 순수함수가 결정한다**(프로젝트 제1원칙)는 경계를 UI에서도 지킨다 — 컴포넌트는 `session.ts` 함수를 호출할 뿐, 자체 판정 로직을 두지 않는다.

소비할 로직 코어 공개 인터페이스:
- `session.ts` — `startSession / completeSetup(choices) / completeReceiving / beginEmergency / toEpilogue / buildEpilogue` · `SessionState{phase, hospital?, receiving?, emergency?}` · `EmergencyState = {mode:'IN_HOUSE'} | {mode:'TRANSFER', game}` · `SessionEpilogue{survived, ledger, debrief}`
- `setup.ts` — `DEPARTMENTS[]`(과 카탈로그) · `buildHospital(choices)` · `hiringCost(choices)` · `withinBudget(choices)` · `FIXED_BEDS`, `SETUP_BUDGET_BILLIONS`
- `receiving.ts` — `createCallQueue()` · `classifyCall(hospital, call)` · `decide(state, accept)` · `ReceivingState`
- `dialogue.ts` — 1막: `CALLER_PLEA`, `receivingLine(call, disposition, accepted, seed)`; 2막: 기존 `fallbackLine`, `persuasionReply`
- `labels.ts` — `SPECIALTY_LABEL`, `REJECTION_LABEL`, `formatClock`

---

## 1. 결정 A — 진입 구조: 세션이 THE 게임 (위저드-first)

`page.tsx → SessionClient`. 기존 단독 STEMI 한 판은 **2막 TRANSFER 분기로 흡수**된다(별도 모드·별도 경로 아님). spec 부모 문서의 "벽의 양쪽을 다 겪게" 감싸기에 가장 충실 — 1막 선택이 2막·에필로그로 흐르는 서사가 온전히 성립한다.

- **트레이드오프(수용)**: 라이브 진입 첫인상이 위저드로 바뀐다. 8/10 제출작 영상·스크린샷은 재촬영이 필요할 수 있으나, **8/10 빌드에 이 확장을 넣을지는 부모 spec §0대로 U5 배포가 잠긴 뒤 별도 판단**한다. Part 2는 그 판단과 독립적으로 브랜치에서 완주·검증한다.
- `다시 한 판`은 세션 처음(SETUP)으로 되돌린다.

## 2. 결정 B — 컴포넌트 아키텍처: 표현 컴포넌트 추출

기존 `GameClient.tsx`(자체 `newGame()`·자체 타이머·**하드코딩 한바다대학병원 장부**를 물고 있음)를 통째로 재사용하면 에필로그가 "내 병원"이 안 된다. 그래서 **표현 컴포넌트를 추출**해 `SessionClient`가 오케스트레이션한다.

```
page.tsx → SessionClient           (use client · SessionState 소유 · phase 스위치 · 전이 함수 호출)
 ├─ SetupWizard      (SETUP)        onComplete(choices)      — 이름·과·의사수·예산
 ├─ ReceivingPhase   (RECEIVING)    콜 1통씩 decide → onDone — 콜 큐 + 명랑 장부
 ├─ Interstitial     (INTERSTITIAL) onContinue()             — 분기 마감 → 시점 전환(붕괴)
 ├─ EMERGENCY 분기
 │   ├─ InHouseEmergency  (mode IN_HOUSE)  — 짧은 냉정 생존 비트
 │   └─ TransferRound     (mode TRANSFER)  — GameClient에서 추출(타이머·전원·설득·로그)
 └─ Epilogue         (EPILOGUE)     — Receipt(전원 시) + LedgerPanel ← buildEpilogue(session)
```

공유 표현 컴포넌트 `TransferRound` · `Receipt` · `LedgerPanel`은 세션 상태를 props로 받는 순수 뷰. `GameClient`는 은퇴(로직은 `TransferRound`로 이관, `page.tsx`는 `SessionClient`를 렌더). 에필로그 장부는 `buildLedger(GameState)`가 아니라 `buildEpilogue(session)`의 `ledger`(플레이어 병원 파생)를 쓴다.

- **타이머 소유**: `TransferRound`가 자체 `useEffect` 틱을 가진다(기존 GameClient 패턴 이관). SETUP·RECEIVING·INTERSTITIAL엔 실시간 타이머 없음.

## 3. 결정 C — 통일 시각 시스템 (1순위: 디자인 통일성)

**게임 전체가 이미 배포된 어두운 zinc 시스템 하나 안에 있다.** 두 시각 세계를 오가지 않는다. 1막의 "명랑함"은 밝은 배경이 아니라 **어두운 무대 위의 액센트·카피·모션**으로만 표현하고, 그 액센트가 막간→2막→결말에서 **초록에서 빨강으로 마른다.** 배포본이 이미 초록(수용·생존 `emerald-400`)·빨강(경보·거절 `red`)을 쓰므로 새 팔레트가 아니라 **밝기만 조정한 연속**이다.

### 3.1 토큰 (단일 출처 = 배포본)
- **캔버스**: `zinc-950 #09090b` 전체 · 카드 `rgba(255,255,255,0.03)` / `black/40` · 보더 `zinc-800 #27272a` · 라운드·간격은 배포본 값 그대로(`rounded-lg`, `px-4/py-3` 등).
- **타입**: sans(상황·버튼·유도 카피) + mono·`tabular-nums`(숫자·타이머·손익·영수증). 1·2막 동일 규칙.
- **액센트 아크**: 1막 명랑 초록 `emerald-500/400 (#059669 / #34d399)` → 결말 `red-500 #ef4444`. 앰버 `#f59f00`는 1막의 소송·적자 경고(⚠)에 절제해 사용 — UI가 슬쩍 축소하는 리스크 표기.
- **잉크**: `zinc-100 #e4e4e7`(본문) · `zinc-400/500/600`(보조·힌트).

### 3.2 톤 분업 (부모 spec §1 가드레일 준수)
- **1막(SETUP·RECEIVING·INTERSTITIAL 명랑)**: 어두운 프리미엄 콘솔(Linear/Vercel 대시보드 결). 초록 액센트 + 명랑 카피 + 절제된 축포(🎉/`ti-confetti` 1곳). 카니발 아님 — 낙차는 초록·카피가 만들고 무대는 침착.
- **2막·결말(EMERGENCY·EPILOGUE 냉정)**: 배포본 그대로. 모노·정렬 숫자·빨강뿐·해석 0(라벨+숫자, PR #13/#14 원칙).
- 농담의 과녁은 **언제나 시스템의 태연한 논리**. 죽는 환자·특정 집단은 과녁이 아니다.

### 3.3 시그니처 — 막간의 붕괴
1막에서 명랑하게 올린 순이익 숫자(예 `+287억`)가, 에필로그 장부 첫 줄에 **같은 숫자 그대로** 차갑게 다시 나타난다. `INTERSTITIAL`에서 [계속] 시 초록 액센트가 빠지고(탈색) 무대는 그대로 식으며 STEMI 경보가 뜬다 — "밝은→어두운 화면 전환"이 아니라 **같은 어두운 무대의 온도 하강**. `prefers-reduced-motion`이면 크로스페이드. 대담함은 이 한 순간에만.

---

## 4. 페이즈별 화면

| 페이즈 | 화면 | 톤 | 소비 함수 |
|---|---|---|---|
| **SETUP** | 병원 이름 입력 + 과 카드(명랑 유도 카피: `미용·피부 수익↑` `건강검진 흑자` `순환기내과 적자·소송⚠`) + 과별 의사 수 스테퍼 + **라이브 예산 미터(100억)**. **순환기 스킵 허용**(강제 최소 없음 = 공범 경로). 예산 초과 시 진행 잠금. | 명랑 | `DEPARTMENTS`, `hiringCost`, `withinBudget`, `completeSetup` |
| **RECEIVING** | 콜 1통씩(발신 호소 `CALLER_PLEA`) → `classifyCall`로 [수용]/[거절] 또는 **하드락 표시**(순환기 없으면 STEMI "받아도 못 뚫어요"). 옆 패널에 **명랑 장부**(순이익↑ · "이번 분기 흑자 🎉") 실시간 갱신. | 명랑 | `classifyCall`, `decide`, `receivingLine`, `completeReceiving` |
| **INTERSTITIAL** | "분기 마감. 순이익 +XXX억 🎉"(명랑) → 톤 꺾임 → "이번엔 **당신 응급실로** STEMI가 온다." → [계속]. **붕괴 시그니처.** | 전환 | `beginEmergency` |
| **EMERGENCY · IN_HOUSE** | 순환기 지음 → "내 순환기팀이 직접 PCI → 생존." 짧은 냉정 비트(전원 미니게임 없음). 장부는 적자·소송으로 피 흘림(결말에서). | 냉정 | `toEpilogue` |
| **EMERGENCY · TRANSFER** | 순환기 스킵 → **기존 전원 뺑뺑이 그대로**(`TransferRound`). 대개 놓치지만 출구는 열려 있음(정직한 벽). | 냉정 | 기존 `round`/`adjudicate`/`dialogue`, `toEpilogue` |
| **EPILOGUE** | `Receipt`(전원 시만) + `LedgerPanel`(내 병원 장부). 세 낙차(공범·사망 / 공범·생존 / 양심·생존). 카피 라벨+숫자·해석 0. | 냉정 | `buildEpilogue` |

---

## 5. 데이터 흐름 · 가드

```
SetupWizard ─completeSetup(choices)─▶ SessionState{RECEIVING, hospital, receiving}
        │
ReceivingPhase ─decide × N─▶ receiving.done ─completeReceiving─▶ {INTERSTITIAL}
        │
Interstitial ─beginEmergency─▶ backupCare? ─┬─ 있음 → {EMERGENCY, IN_HOUSE}
        │                                   └─ 없음 → {EMERGENCY, TRANSFER, game}
        ▼
(TransferRound/InHouse) ─toEpilogue─▶ {EPILOGUE} ─buildEpilogue─▶ {survived, ledger, debrief}
```

- 잘못된 전이는 이미 `session.ts`가 throw로 가드(`completeReceiving requires RECEIVING`, `receiving not done`, `emergency transfer not finished` 등). UI는 이 가드를 어기지 않는 순서로만 버튼을 노출한다.
- **위저드 입력 방어**: 의사 수 음수·비정수·예산 초과 차단(Part 1 이연 Minor "음수값 방어"가 여기서 자연 해소).

---

## 6. 테스트 전략 (TDD 원칙 + 브라우저 게이트)

- **순수 로직은 이미 92 green** — Part 2가 새로 만드는 순수 헬퍼(있다면)만 Red→Green→Refactor로 추가. 예: 위저드 입력 정규화, 명랑 장부 표시값 파생 등 순수 로직이 생기면 `*.test.ts`로 먼저 잠근다.
- **UI는 브라우저 관찰 검증**(부모 spec §9 게이트·기존 GameClient 선례 — 클라이언트 컴포넌트는 순수 로직을 밖으로 밀어내고 화면은 브라우저로 검증): **공범 경로**(순환기 스킵→콜큐 하드락 퍼레이드+흑자→2막 전원 뺑뺑이→흑자 장부+채용0)와 **양심 경로**(순환기 건설→2막 in-house 생존→적자·소송 장부) **양쪽 완주**를 실제 플레이로 확인 + 스크린샷.
- **게이트**: 전 테스트 green · `tsc --noEmit` · `next build`(Turbopack) · 모바일 375px 가로 넘침 0 · `prefers-reduced-motion` 붕괴 대체.

---

## 7. 이연 Minor 4건 처리
- `음수값 방어` → **Part 2 포함**(위저드 입력 검증에서 해소).
- `essentialHires 다필수과 확장` → 부모 spec ⓐ(이번 주 CARDIOLOGY-only)와 상충 없음 → **v2 보류**.
- `도달불가 방어분기 커버` · `STEMI_SPECIALTY export` → 경미·테스트 위생 → **별건 보류**(plan에 유지).

---

## 8. 성공 기준
- `page.tsx → SessionClient`로 **API 없이 한 세션 완주**: 병원 설립 → 콜 수용/거절(명랑 장부) → 막간 붕괴 → 2막 분기 → 내 병원 장부로 결말.
- **공범·양심 두 경로 모두 도달 가능** · 기존 불변식·8/10 제출 게임 비파괴.
- **디자인 통일성**: 전 페이즈가 하나의 어두운 zinc 시스템 안에 있고, 톤 아크는 액센트·카피·모션으로만 표현 — 밝은/어두운 화면 전환 없음.
- 전 테스트 green · `tsc` · `next build` · 브라우저 검증 · 다크코미디는 1막에, 냉정·비극은 2막·결말에.
