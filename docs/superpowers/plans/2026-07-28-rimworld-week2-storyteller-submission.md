---
tags:
  - type/plan
---

# 림월드형 2주차 PR D — AI 스토리텔러 + 판 종결 + 랜딩 스왑·제출물 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 마지막 PR(사수 대상). 결정론 이벤트 엔진 + LLM 디렉터(실호출 · 무키/타임아웃 폴백 강등)로 게임에 스토리텔러를 얹고, 판 종결(인력 종결 + 캠페인 상한)을 넣어 "끝"을 만들고, 랜딩을 새 게임으로 스왑하고, 제출 문서(③④)를 새 게임 기준으로 재작성한다.

**Architecture:** 판정 = 결정론 코드 / 연출·선택 = LLM(2콜 원칙 유지). 이벤트의 **효과·전제·가드레일은 전부 코드**가 확정하고, LLM은 코드가 검증한 후보 중 "무엇을 언제 던질지" 선택 + 연출문만 생성한다. 무키·타임아웃·치역 밖 응답이면 **가중 랜덤 폴백**(시드 결정론)으로 강등 — Pages 정적 배포에서도 완주한다. 프록시(API 라우트)는 Vercel에만 살고, Pages 빌드는 그걸 크로스오리진으로 부른다.

**Tech Stack:** 기존 스택(Next.js App Router · TS · vitest) + `@anthropic-ai/sdk`(신규 의존성 — 프록시 라우트 전용).

**사용자 결정(2026-07-28):** ① 판 종결 = **인력 종결 + 캠페인 상한** ② Anthropic 콘솔 **결제 확인됨 — 실호출 포함**.

---

## 0. 설계 결정 요약 (구현 전 필독)

### 0-1. 판 종결 — 세 가지 엔딩

최종 리뷰가 확인한 구멍: 전원 사직 시 수익 0·고정비 0이라 폐업이 영영 안 오고(좀비), 완비 병원도 미용+내과만 남아 무한 지속된다. 종결은 **주간 결산(settleWeek) 한 곳**에서만 판정한다(정산의 단일 출처 계승).

| 엔딩 | 조건 | 우선순위 |
|---|---|---|
| `INSOLVENCY` | `insolvencyStreak >= 2` (기존 폐업 — 이름만 붙는다) | 1 (최우선) |
| `NO_PEOPLE` | (의사 수 − 이번 주말 사직자 수) === 0 **그리고** Σ hirePool === 0 | 2 |
| `CAMPAIGN_END` | `week >= CAMPAIGN_WEEKS`(= **12**) | 3 |

- `NO_PEOPLE`이 "돈이 아니라 **사람이 바닥나서** 끝난다"의 담지자 — 이 게임 메시지의 엔딩판.
  사직자는 `startNextWeek`에서 집행되지만 판정은 결산 시점에 **선반영**한다(`resigningSimDoctors`가
  주중에도 계산되는 것과 같은 계약) — "마지막 의사가 이번 주말 떠나고 전국에 사람이 없다"를
  결산 화면에서 통지와 함께 보여줄 수 있다.
- `CAMPAIGN_WEEKS = 12`: 최종 리뷰 다주 종주가 12주까지 실측한 범위이고, 완비 병원 폐업(~10주)을
  덮는 상한이다. 12주차 결산에서 무조건 에필로그 — 흑자 빌드(미용 단독 등)도 판이 끝난다.
- 구현: `SimWorld.ending?: EndingKind` 신설. `settleWeek`이 엔딩을 판정하면 `phase: 'CLOSED'` + `ending` 세팅.
  기존 CLOSED 소비처(WeekEndOverlay `closed` · startNextWeek phase 가드)는 그대로 동작한다.

### 0-2. 이벤트 엔진 — 카탈로그 4종 (결정론)

새 파일 `src/sim/events.ts`(효과·카탈로그 — **leaf**: world·dept 타입만 임포트)와
`src/sim/director.ts`(전제 판정·폴백 선택 — patientFlow의 시드 폴딩을 쓴다). MASS_CASUALTY 전제는
`rooms.some(WARD)`로 본다 — wardBeds(emergency)를 쓰면 events가 leaf가 아니게 되고, 최소 방(4×4)은
autoFurniture가 침대를 반드시 놓으므로 실질 등가다(Task 3 리뷰에서 확정).
**둘을 가르는 이유는 T-093(값 임포트 순환)**: patientFlow가 이벤트 배율을 읽어야 하는데(`events.ts`),
폴백 디렉터는 patientFlow의 `minuteStreamSeed`를 써야 한다 — 한 파일이면 순환이다.

| 이벤트 | 효과(그날 하루) | 전제(코드 가드레일) |
|---|---|---|
| `MASS_CASUALTY` 대량 응급 | 응급 도착 확률 ×3 (1/120 → 1/40) | `week >= 2` **그리고** WARD 방 존재(병상 0 + 대량 응급 = 불공정 조합 차단 — 스펙 §4) |
| `EPIDEMIC` 전염병 유행 | 외래 도착 확률 ×1.6 + 희망 과 믹스를 내과 중심으로 교체(내과 0.75 / 외과 0.85 / 순환기 0.92 / 미용 1.0) | 없음 |
| `NEARBY_CLOSURE` 인근 병원 폐업 | 외래 도착 확률 ×1.4 (전 과) | 없음 |
| `LAWSUIT` 의료소송 | 즉시 금고 −`LAWSUIT_COST_MANWON`(= **800**) — 돌려보낸 응급이 소송으로 돌아온다 | `turnedAwayTotal >= 1` (신설 누적 카운터 — 아래) |

- **지속은 그날 하루뿐**: `SimWorld.event?: { kind: SimEventKind }`를 아침에 세팅, `freshMorning`이
  지운다(하루 필드 리셋의 기존 자리). 효과는 배율 함수로 읽는다:
  `arrivalProbMulOf(w)` · `emergencyProbMulOf(w)` · `arrivalDeptMixOf(w)`(events.ts) —
  `patientFlow.maybeArrive`와 `emergency.emergencyArrivalAt`이 이걸 곱한다/교체한다.
- **`SimWorld.turnedAwayTotal: number` 신설**(판 누적 회차 — LAWSUIT 전제 전용). `turnAway`가 +1.
  기존 `stats.emergencyTurnedAway`는 하루마다 리셋되고 `days`는 주마다 비워져 "판 전체" 축이 없다.
- **스펙의 「사직 파동」은 ⏸ 절단**: 사직은 이미 코어 규칙(포화 4일)이고, 이벤트로 강제 사직을
  얹으면 「통지=집행 단일 출처」 계약(resigningSimDoctors)이 깨진다. 본선 후보.
- **적용 시점**: 아침 전이 직후. UI가 `applyEvent(startNextDay(w), choice)` /
  `applyEvent(startNextWeek(w), choice)`로 합성한다(1주차 1일차는 아침 전이가 없어 이벤트 없음 — 유예일).
  `applyEvent(w, kind)`는 순수 함수이고 **전제 위반이면 throw**한다 — LLM 응답은 파싱 층이
  `eligibleEvents(w)`로 먼저 거르므로 도달 불가, throw는 배선 버그를 잡는 가드다.
- **폴백 디렉터**(무키·타임아웃·치역 밖): 시드 결정론 가중 랜덤.
  - `EVENT_PROB_PER_DAY = 0.25` — salt **43**(레지스트리: 1·2·3·7·11·12·13·15·17·19·23·29·31·37·41 사용 중).
  - 종류는 salt **47**의 누적 상한 표(`EVENT_MIX`): MASS_CASUALTY 0.30 / EPIDEMIC 0.60 / NEARBY_CLOSURE 0.85 / LAWSUIT 1.00
    (pickWantsDept와 같은 기계 — 치역 밖이면 throw).
  - 뽑힌 종류가 전제 미달이면 **그날은 이벤트 없음**(불발 — 재추첨하지 않는다: 재추첨은 전제
    미달이 다른 이벤트의 확률을 올리는 커플링을 만든다).
  - 시드는 `minuteStreamSeed`를 아침 세계(minute 0)에서 부른다 — **계약: 폴백 선택은 반드시
    minute 0 세계에서** (테스트가 잠근다).
- **LLM 유무 불변식**(스펙 §7의 재해석): "같은 선택이면 같은 전이"다 — `applyEvent`가 순수이고,
  LLM 응답이 무효(치역 밖·타임아웃)면 폴백 경로와 **완전 동일**해진다. LLM이 상태 전이 규칙 자체를
  바꾸는 경로는 타입 수준에서 없다(선택지 enum + 연출문 string뿐).

### 0-3. 특성·사연·이름 — 서사 재료 (수치 효과 없음)

- `Pawn.name?: string` + `Pawn.traits?: readonly [TraitKey, TraitKey]` 신설(의사만). `spawnDoctor`가
  결정론 부여(RNG 불필요 — 시드 소비 없음이 계약). **이름은 풀 소진량 파생 서수**
  (Σ(초기 풀 − 현재 풀) — 단조 증가·판 내 유일) × 이름 18개(= 전국 풀 총합 = 한 판 최대 채용)로
  **동명이인이 구조적으로 불가능**하다. ⚠️ 최초 설계는 nextId 인덱싱이었으나 nextId는 방·환자까지
  올리는 전역 카운터라 이름이 실제로 겹쳤다(스펙 리뷰 실측: 8명 중 「최민서」 2회) — Task 3 리뷰에서
  교체. traits는 nextId 인덱싱 유지(특성은 유형이라 겹쳐도 자연스럽다).
- **수치 효과는 ⏸ 본선**(스펙 §2의 "수치 효과는 결정론"은 개성 상호작용이 붙는 본선 재료 —
  PR C가 스트레스를 절단한 것과 같은 근거: 효과 없는 셋째 축은 새 결정을 안 낳는다).
  이번 PR에서 특성은 **사직 편지·연출문의 재료**이고 PriorityPanel에 표시된다.
- 카탈로그(라벨·사연 한 줄)는 `src/sim/traits.ts`(leaf).

### 0-4. 스토리텔러 표면 — 폴백 문장이 먼저 완성된다

- `src/sim/narrative.ts` — **사전 작성 한국어 문장 카탈로그**(전부 결정론):
  - 이벤트 연출문: 종류당 2~3종, `nextId`·`(week,day)` 결정론 선택. T-094(조사 보간 함정) 준수 —
    보간값 뒤에 조사를 두지 않는다.
  - 사직 편지: 과·이름·특성·포화 일수를 채우는 템플릿.
  - 에필로그 결말문: 엔딩 3종 × 누적 지표(주차·누적 이탈·사직 명단·금고).
- UI: ① **이벤트 카드**(아침에 새 이벤트가 붙으면 뜨는 오버레이 — 「속보/공문」 질감, 떠 있는 동안
  기존 `paused` 파생에 합류) ② 결산 오버레이의 **사직 편지**(사직 줄 확장) ③ CLOSED 오버레이의
  **에필로그 결말문**. LLM 텍스트가 도착해 있으면 그걸, 아니면 폴백 문장을 쓴다 — 판정·수치는 동일.

### 0-5. LLM 프록시 — Vercel 전용 API 라우트 + Pages 크로스오리진

- `src/app/api/storyteller/route.ts`(POST) — `@anthropic-ai/sdk`, 서버 전용 `ANTHROPIC_API_KEY`.
  task 3종: `director`(이벤트 선택+연출문 — **structured output**으로 JSON 보장) ·
  `letter`(사직 편지) · `epilogue`(결말문).
- 모델 **`claude-opus-5`**(기본 · `LLM_MODEL` env로 오버라이드 가능), `max_tokens: 1024`,
  `output_config: { effort: 'low' }`(짧은 연출문 — 지연 최소화). `stop_reason === 'refusal'`은
  실패로 취급 → 앱 폴백 강등(서버측 fallbacks 베타는 안 쓴다 — 게임 자체 폴백이 이미 최종 안전망이라
  베타 의존을 늘릴 이유가 없다). SDK 타임아웃 9,000ms(TS는 **밀리초**).
- CORS: `https://goospel.github.io` + localhost 허용(OPTIONS 프리플라이트 포함).
- 클라이언트 `src/lib/storyteller.ts`: AbortController 10초 · **판당 호출 상한 `MAX_LLM_CALLS_PER_RUN = 10`** ·
  모든 실패(네트워크·타임아웃·refusal·파싱·치역 밖)가 한 경로로 폴백 강등 + HUD에 「폴백」 배지.
  base URL: 같은 오리진(Vercel) / `NEXT_PUBLIC_STORYTELLER_ORIGIN`(Pages 빌드에서 Vercel 오리진 주입).
- **Pages 정적 export는 POST 라우트를 담지 못한다** → `next.config.ts`에서
  `pageExtensions: process.env.PAGES_BASE_PATH ? ['tsx'] : ['tsx', 'ts']`로 라우트 파일(`route.ts`)만
  Pages 빌드에서 떨군다(app 디렉터리의 page/layout은 전부 `.tsx`라 영향 없음 — **구현 시 전수 확인**).
  트리 변형(CI에서 rm) 없이 로컬·CI 양쪽에서 같은 스위치로 동작한다. ⚠️ T-059: PAGES_BASE_PATH
  빌드는 PowerShell에서 돌린다(Git Bash MSYS 경로 변환 오탐).
- **사용자 몫(코드 밖)**: Vercel 환경변수 `ANTHROPIC_API_KEY` 등록. `.env.example`에 키 목록 추가.

### 0-6. 밸런스 조정 (실측 근거 — 최종 리뷰 프로브)

| 손잡이 | 현행 → 변경 | 근거 |
|---|---|---|
| `EMERGENCY_INTENSITY` (emergency.ts) | 2.0 → **1.7** | 응급 1건 = 90×2.0 = 180 > 하루 상한 160이라 1건만 받아도 포화(응급이 포화의 유일 원천 실측). ≤1.78이면 "1건은 공짜, 2건부터 갈린다" — 대응 창이 넓어지고, MASS_CASUALTY 이벤트(응급 몰림)가 포화의 서사적 방아쇠가 된다 |
| `STARVED_SLOW` (needs.ts) | 1.15 → **1.3** | 굶주림 감속이 포화·사직에 무영향(반증)이라 식당이 순손실 건물. 1.3이면 오후(300분 이후) 전 작업이 1.3배 — 식당이 지을 가치가 생긴다 |

> ⚠️ **Task 2 실측 후기(2026-07-28 — 위 표의 기대와 실측이 갈린 곳)**: ① "1건은 공짜"는
> **격리 조건(외래 0·전날 피로 0·비굶주림)에서만** 성립한다 — 표준 구성은 외래 부하가 이미
> 문턱(160) 근처(실측 130~155)라 1건인 날도 합산으로 넘는다(205.7~457.7). 코디네이터 결정:
> **1.7 유지·추가 튜닝 없음** — 외래 강도까지 흔들면 I-B1·사직 페이스가 통째로 재튜닝이고,
> MASS_CASUALTY 전제는 "이벤트 날이 평일보다 확실히 나쁘다"만 요구하므로 유효하다. 계약은
> fatigue.test.ts의 관계 단언(격리 조건 명시)이 잠근다. ② "식당이 지을 가치"는 처리량으로는
> 반증됐고(Δ외래 ±3건 — 식사 시간이 아낀 분을 되먹음), 실측된 가치는 **포화 축 보호**다:
> 굶은 채 시작한 응급이 117분 → 부하 198.9 > 160으로 단독 문턱 초과 — 식당이 그걸 막는다.
> MEAL_MIN·HUNGRY_AFTER_MIN·"유휴일 때만 먹는다" 손잡이는 ⏸(본선 후보).

- `src/sim` 자유값이라 옛 게임 무영향(튜닝 손잡이 소속 실측 — plan.md ⓕ).
- 변경 후 **재실측이 게이트다**: ① 부호 불변식 I-B1 커밋 회귀(4시드) green 유지 ② 프로브 —
  표준 구성에서 응급 1건 날 포화 0 / 2건 날 포화 1 ③ 식당 유무 대조 — 식당 있는 병원의 주간
  처리량·순익이 없는 병원보다 나빠지지 않는가.

### 0-7. 랜딩 스왑

- 시뮬 화면을 `src/components/SimGame.tsx`로 추출 → `/`(page.tsx)가 렌더. `/sim`은 같은 컴포넌트
  유지(문서·기존 링크 호환). 옛 게임은 `/classic`으로 이동(코드 무변경 — 라우트만).
- 메타데이터(title)·README·requirements.md의 진입 경로 서술 갱신.

### 0-8. 이월·절단 기록

- **jsdom UI 배선 테스트(PR A 이월)**: 이번에도 ⏸ — 제출 크리티컬 패스(문서·영상) 우선.
  스토리텔러 UI는 최종 게이트의 브라우저 실측이 덮는다. plan.md에 사유와 함께 재기록.
- `formatManwon` 단위 혼재(PR A 이월): **이번에 해소** — Task 4에 포함.
  정책: |금액| ≥ 10,000만원(1억)이면 「N.N억」, 미만이면 「N만원」. simHud 단일 함수.

---

## 파일 지도

- 신설: `src/sim/events.ts`(leaf) · `src/sim/director.ts` · `src/sim/traits.ts`(leaf) ·
  `src/sim/narrative.ts` · `src/app/api/storyteller/route.ts` · `src/lib/storyteller.ts` ·
  `src/components/EventCard.tsx` · `src/components/SimGame.tsx` · `src/app/classic/page.tsx`
- 수정: `world.ts`(ending·event·turnedAwayTotal) · `week.ts`(settleWeek 엔딩 판정) ·
  `day.ts`(freshMorning event 클리어) · `pawn.ts`(name·traits) · `patientFlow.ts`(배율·믹스 훅) ·
  `emergency.ts`(배율 훅·turnAway 카운터·INTENSITY 1.7) · `needs.ts`(STARVED_SLOW 1.3) ·
  `simHud.ts`(formatManwon·폴백 배지) · `PriorityPanel.tsx`(특성) · `WeekEndOverlay.tsx`(편지·에필로그) ·
  `src/app/page.tsx`·`src/app/sim/page.tsx` · `next.config.ts` · `.env.example` · README ·
  `docs/submission/game-intro.md`·`ai-usage-doc.md`·`requirements.md`
- 임포트 위상(T-093 준수): events·traits·narrative = leaf(world·dept 타입만) →
  patientFlow·emergency가 events를 임포트 → director가 patientFlow·emergency·events를 임포트 →
  tick은 무변경(이벤트 적용은 아침 전이라 tick 밖).

---

## Task 1: 판 종결 — 엔딩 3종 (world.ts · week.ts)

**Files:** Modify `src/sim/world.ts`, `src/sim/week.ts` · Test `src/sim/week.test.ts`(추가)

- [x] **Step 1: 실패하는 테스트** — ⓐ 좀비 반증: 의사 0·풀 전과 0·금고 양수 세계 → `settleWeek` →
  `phase === 'CLOSED'` && `ending === 'NO_PEOPLE'` ⓑ 마지막 의사가 이번 주말 사직 예정 + 풀 0 →
  같은 결산에서 `NO_PEOPLE`(선반영) ⓒ 12주차 흑자 결산 → `CAMPAIGN_END` ⓓ 12주차이면서
  insolvencyStreak 2 → `INSOLVENCY`(우선순위) ⓔ 의사 0인데 풀이 남았으면 엔딩 없음(재기 가능) —
  기존 WEEK_END 유지 ⓕ 11주차 정상 결산은 엔딩 없음(경계 — T-085: 기준을 결산 **전** 세계에서 캡처)
- [x] **Step 2: Red 확인** — `npx vitest run src/sim/week.test.ts`
- [x] **Step 3: 구현**

```ts
// world.ts
export type EndingKind = 'INSOLVENCY' | 'NO_PEOPLE' | 'CAMPAIGN_END'
export interface SimWorld { /* 기존 + */ ending?: EndingKind }

// week.ts
export const CAMPAIGN_WEEKS = 12
/** 이 결산으로 판이 끝나는가 — 우선순위: 돈(INSOLVENCY) > 사람(NO_PEOPLE) > 시간(CAMPAIGN_END).
 *  NO_PEOPLE은 사직을 선반영한다(집행은 startNextWeek이지만 명단은 같은 함수 — 통지=집행 계약). */
function endingOf(w: SimWorld, insolvencyStreak: number): EndingKind | undefined {
  if (insolvencyStreak >= INSOLVENCY_WEEKS_TO_CLOSE) return 'INSOLVENCY'
  const doctors = w.pawns.filter(p => p.kind === 'DOCTOR').length
  const leaving = resigningSimDoctors(w).length
  const poolLeft = Object.values(w.hirePool).reduce((s, n) => s + n, 0)
  if (doctors - leaving === 0 && poolLeft === 0) return 'NO_PEOPLE'
  if (w.week >= CAMPAIGN_WEEKS) return 'CAMPAIGN_END'
  return undefined
}
// settleWeek 반환부를 교체:
//   const ending = endingOf(w, insolvencyStreak)
//   return { ...w, treasuryManwon, insolvencyStreak, weekSettled: true,
//            phase: ending ? 'CLOSED' : 'WEEK_END', ...(ending ? { ending } : {}) }
```

- [x] **Step 4: Green + 기존 회귀** — `npx vitest run src/sim/` (기존 INSOLVENCY 테스트가
  `ending === 'INSOLVENCY'`도 얻는지 확인·보강)
- [x] **Step 5: 돌연변이 실측(단독 적용·죽은 테스트 특정 — T-090)** — ① `doctors - leaving` → `doctors`
  (선반영 제거: ⓑ 사살 확인) ② `poolLeft === 0` 조건 삭제(ⓔ 사살) ③ `w.week >= CAMPAIGN_WEEKS` →
  `>`(ⓒ 사살) ④ 우선순위 뒤집기(ⓓ 사살)
- [x] **Step 6: 커밋** — `.commit-msg-tmp` + `git commit -F`(T-026), 트레일러 연속(빈 줄 금지)

## Task 2: 밸런스 조정 — EMERGENCY_INTENSITY 1.7 · STARVED_SLOW 1.3

**Files:** Modify `src/sim/emergency.ts`, `src/sim/needs.ts` + 값을 잠근 기존 테스트 갱신

- [x] **Step 1: 값을 잠근 테스트 목록화** — `grep -rn "2\.0\|1\.15\|180\|23" src/sim/*.test.ts`류로
  INTENSITY·STARVED_SLOW 의존 단언을 전수 확인(눈으로 — 숫자 grep은 오탐 많음)
- [x] **Step 2: 상수 변경 + 주석 갱신** — 각 상수 주석에 실측 근거(0-6 표)를 옮겨 적는다.
  특히 emergency.ts 108행 근처 주석의 "180 > 상한 160" 산수를 1.7 기준(153 < 160, 2건 306 > 160)으로
  다시 쓴다 — **커밋 메시지에는 실측 전 인과 주장 금지**(T-092)
- [x] **Step 3: 테스트 갱신 → green** — 기대값을 새 상수 파생으로 고친다(하드코딩 말고 상수 임포트 곱)
- [x] **Step 4: 프로브 실측(스크래치 스크립트 — 커밋 안 함)** — 0-6의 게이트 3종: I-B1 4시드 green ·
  응급 1건 날 포화 0 / 2건 날 포화 1 · 식당 유무 대조. 결과 수치를 커밋 메시지에 남긴다
- [x] **Step 5: 커밋**

## Task 3: 특성·이름 + 이벤트 엔진 코어 (events.ts · director.ts · 훅)

**Files:** Create `src/sim/events.ts`, `src/sim/director.ts`, `src/sim/traits.ts` ·
Modify `src/sim/world.ts`, `src/sim/day.ts`, `src/sim/pawn.ts`, `src/sim/patientFlow.ts`, `src/sim/emergency.ts` ·
Test `src/sim/events.test.ts`(신설)

- [x] **Step 1: 실패하는 테스트** —
  ⓐ `applyEvent` 순수·전제 위반 throw(WARD 없는 세계에 MASS_CASUALTY → throw)
  ⓑ 효과 실측: MASS_CASUALTY 날의 응급 도착 수가 평일의 약 3배(같은 시드 창 비교 — 배율이
  `emergencyArrivalAt` 판정식에 실제로 곱해지는지) / EPIDEMIC 날 내과 비중 급증 / NEARBY 1.4배
  ⓒ LAWSUIT: turnedAwayTotal 0이면 eligibleEvents에 없음 · 적용 시 금고 −800
  ⓓ 폴백 디렉터 결정론: 같은 (seed, week, day)에 같은 선택 · minute 0 계약
  ⓔ 불발: 전제 미달 종류가 뽑히면 null(재추첨 없음)
  ⓕ freshMorning이 event를 지운다 ⓖ turnAway가 turnedAwayTotal을 올리고 주 넘김에도 유지
  ⓗ spawnDoctor가 name·traits를 결정론 부여(같은 nextId → 같은 값·시드 미소비)
- [x] **Step 2: Red 확인**
- [x] **Step 3: 구현** — 핵심 계약:

```ts
// events.ts (leaf — world·dept 타입만 임포트)
export type SimEventKind = 'MASS_CASUALTY' | 'EPIDEMIC' | 'NEARBY_CLOSURE' | 'LAWSUIT'
export const LAWSUIT_COST_MANWON = 800
export interface SimEventSpec { kind; label; narrationFallbacks: readonly string[] /* Task 4에서 채움 */ }
export function arrivalProbMulOf(w: SimWorld): number   // EPIDEMIC 1.6 · NEARBY 1.4 · 그외 1
export function emergencyProbMulOf(w: SimWorld): number // MASS_CASUALTY 3 · 그외 1
export function arrivalDeptMixOf(w: SimWorld): typeof ARRIVAL_DEPT_MIX | null // EPIDEMIC만 교체
export function applyEvent(w: SimWorld, kind: SimEventKind): SimWorld // 전제 위반 throw · LAWSUIT은 즉시 금고 차감 + event 세팅

// director.ts
export const EVENT_PROB_PER_DAY = 0.25
export function eligibleEvents(w: SimWorld): SimEventKind[]
export function fallbackDirectorChoice(w: SimWorld): SimEventKind | null // salt 43·47, minute 0 계약
```

  - `patientFlow.maybeArrive`: `ARRIVAL_PROB_PER_MIN * arrivalProbMulOf(w)` ·
    `pickWantsDept`에 넘길 믹스를 `arrivalDeptMixOf(w) ?? ARRIVAL_DEPT_MIX`로.
    `pickWantsDept(u, mix)` 시그니처 확장(기본값 유지 — 기존 호출 무변경).
  - `emergency.emergencyArrivalAt`: `EMERGENCY_PROB_PER_MIN * emergencyProbMulOf(w)`.
  - `emergency.turnAway`: `turnedAwayTotal: w.turnedAwayTotal + 1` 추가.
  - `world.ts`: `event?: { kind: SimEventKind }`(타입 전용 임포트) · `turnedAwayTotal: 0` 초기화.
  - `day.freshMorning`: `delete next.event` 대신 세계 필드라 `const { event: _e, ...rest }` 형태로 제거.
  - `pawn.spawnDoctor`: `name: DOCTOR_NAMES[w.nextId % DOCTOR_NAMES.length]`,
    `traits: pickTraits(w.nextId)`(traits.ts — 결정론 인덱싱, 두 특성이 항상 서로 다르게).
- [x] **Step 4: Green + 전체 회귀** — `npx vitest run` (도착 스트림을 건드렸다 — 기존 도착·응급
  결정론 테스트가 "이벤트 없는 날 배율 1"로 전부 무변경 green이어야 한다)
- [x] **Step 5: 돌연변이 실측** — ① 배율 훅 제거(ⓑ 사살) ② 불발을 재추첨으로(ⓔ 사살)
  ③ freshMorning 클리어 제거(ⓕ 사살) ④ salt 43→29 재사용(결정론 테스트 or 상관 테스트 사살 —
  patientFlow의 salt 비상관 계약 참조)
- [x] **Step 6: 커밋**

## Task 4: 스토리텔러 표면 — 폴백 문장·이벤트 카드·편지·에필로그·formatManwon

**Files:** Create `src/sim/narrative.ts`, `src/components/EventCard.tsx` ·
Modify `src/components/simHud.ts`, `PriorityPanel.tsx`, `WeekEndOverlay.tsx`, `src/app/sim/page.tsx` ·
Test `src/components/simHud.test.ts`(추가), `src/sim/narrative.test.ts`(신설)

- [x] **Step 1: 실패하는 테스트** — ⓐ narrative: 이벤트 연출문 결정론 선택·전 종류 폴백 존재·
  보간값 뒤 조사 없음(T-094 — 기존 simHud 조사 테스트 형태 계승) ⓑ 사직 편지에 이름·과·포화 일수
  포함 ⓒ 에필로그 3종이 엔딩별로 다른 문장 + 누적 지표 포함 ⓓ `formatManwon`: 9,999만원 → 「9,999만원」·
  10,000 → 「1.0억」· 음수 · 152,340 → 「15.2억」(반올림 정책 명시)
- [x] **Step 2: Red 확인**
- [x] **Step 3: 구현** — UI 배선: ⓐ 아침 전이 핸들러가 `applyEvent(...(전이)..., choice)` 합성 +
  새 이벤트가 붙으면 EventCard 오버레이(열려 있는 동안 `paused` 합류 — 건설·채용과 같은 파생) ·
  연출문은 LLM 도착분 우선, 없으면 `narrative` 폴백 ⓑ WeekEndOverlay: 사직 줄에 편지 표시 ·
  CLOSED면 `world.ending` 별 에필로그 ⓒ PriorityPanel: 이름·특성 라벨 표시 ⓓ HUD·오버레이 금액을
  `formatManwon` 하나로 통일
- [x] **Step 4: Green + tsc + eslint**
- [x] **Step 5: 브라우저 실측(dev)** — 이벤트 카드 발동·일시정지·닫기 재개, 결산 편지, 에필로그
  3종(콘솔 조작으로 세계 강제 세팅 금지 — 시드 골라 자연 발동, 안 되면 테스트 전용 시드 탐색 스크립트)
- [x] **Step 6: 커밋**

## Task 5: LLM 프록시 + 실호출 레이어

**Files:** Create `src/app/api/storyteller/route.ts`, `src/lib/storyteller.ts` ·
Modify `next.config.ts`, `.env.example`, README(env 절), `src/components/SimGame.tsx`(배선 — Task 6 전이면 sim/page.tsx) ·
Test `src/lib/storyteller.test.ts`(신설 — fetch 모킹)

- [x] **Step 1: 실패하는 테스트(클라이언트 계약)** — ⓐ 타임아웃/네트워크 오류/HTTP 500 → null(폴백 강등)
  ⓑ 응답 event가 eligible 밖 → null ⓒ 호출 상한: 10회 이후 fetch 자체를 안 부른다
  ⓓ 성공 경로: {event, narration} 파싱 ⓔ 무키 환경(NEXT_PUBLIC_STORYTELLER_ORIGIN 미설정 + 라우트 404) → 강등
- [x] **Step 2: Red 확인**
- [x] **Step 3: 라우트 구현** — 핵심 형태(claude-api 스킬 확인 반영 — 함수명·파라미터는 이 코드가 기준):

```ts
// src/app/api/storyteller/route.ts — Vercel 전용(Pages 빌드는 pageExtensions로 제외)
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

const MODEL = process.env.LLM_MODEL ?? 'claude-opus-5'
const ALLOWED = new Set(['https://goospel.github.io', 'http://localhost:3000'])
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED.has(origin) ? origin : 'https://goospel.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
})
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin')) })
}
export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin'))
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'NO_KEY' }, { status: 503, headers })
  const body = await req.json() // { task, state } — task별 스키마 검증(치역 밖이면 400)
  const client = new Anthropic({ timeout: 9_000 }) // ms
  // director: structured output으로 JSON 보장 — event는 enum(eligible + 'NONE'), narration ≤ 200자
  const res = await client.messages.create({
    model: MODEL, max_tokens: 1024,
    output_config: body.task === 'director'
      ? { effort: 'low', format: { type: 'json_schema', schema: DIRECTOR_SCHEMA } }
      : { effort: 'low' },
    system: SYSTEM_PROMPTS[body.task], // 한국어 · 판정 불개입 명시("게임 규칙을 바꿀 수 없다")
    messages: [{ role: 'user', content: JSON.stringify(body.state) }],
  })
  if (res.stop_reason === 'refusal') return NextResponse.json({ error: 'REFUSAL' }, { status: 502, headers })
  // ④ 문서용 로그 — Vercel 로그에 프롬프트↔응답이 남는다(ai-usage-doc §6-4의 실측 재료)
  console.log('[storyteller]', body.task, JSON.stringify(res.usage))
  return NextResponse.json({ text: res.content.find(b => b.type === 'text')?.text ?? '' }, { headers })
}
```

  - DIRECTOR_SCHEMA: `{ event: enum(4종+'NONE'), narration: string }` · `additionalProperties: false`.
  - 클라이언트(`src/lib/storyteller.ts`): base = 같은 오리진, Pages에선 `NEXT_PUBLIC_STORYTELLER_ORIGIN`.
    AbortController 10초 · 판당 카운터 · 실패 전부 null 한 경로.
  ⚠️ **선택 확정은 아침 전이 클릭 시점 1회다**: `fallbackDirectorChoice`가 minute 0 밖 호출에
  throw하므로(Task 3에서 승격), 늦게 도착한 LLM 응답으로 이벤트를 **재적용하지 않는다** —
  클릭 시점에 도착해 있으면 그 선택, 아니면 폴백으로 즉시 확정하고, 이후 도착분은 **연출문
  텍스트만** 갱신할 수 있다(판정·수치 불변).
  - `next.config.ts`: `pageExtensions` 스위치(0-5) — **적용 전 `src/app` 아래 `.ts` page/layout/route
    전수 확인**(route.ts 하나뿐이어야 한다).
- [x] **Step 4: Green + 양 빌드** — `npm run build`(Vercel 형태 — 라우트 포함) ·
  PowerShell에서 PAGES_BASE_PATH 빌드(라우트 제외 export 성공) — T-059
- [x] **Step 5: 실호출 실측(로컬 dev · 키는 .env.local)** — director 1회·letter 1회·epilogue 1회 실제
  왕복, 지연 실측 기록(④ 문서 재료). 무키로 지우고 폴백 강등 재확인
- [x] **Step 6: 커밋** (키·응답 원문은 커밋 금지 — 로그 파일 .gitignore 확인)

## Task 6: 랜딩 스왑

**Files:** Create `src/components/SimGame.tsx`, `src/app/classic/page.tsx` ·
Modify `src/app/page.tsx`, `src/app/sim/page.tsx`, `src/app/layout.tsx`(metadata), README

- [x] **Step 1**: sim/page.tsx 본문을 `SimGame.tsx`로 추출(로직 무변경 — 파일 이동 수준).
  `/`·`/sim` 둘 다 `<SimGame />` 렌더. 옛 게임 page.tsx 본문 → `/classic`으로 이동(임포트 경로만 수정)
- [x] **Step 2**: metadata title·설명을 새 게임 기준으로. README 진입 경로·스크린샷 서술 갱신
- [x] **Step 3**: 게이트 — tsc·eslint·vitest 전체·양 빌드. 브라우저: `/` 새 게임 완주 여정 1회 ·
  `/classic` 옛 게임 기동 확인 · `/sim` 동일 렌더
- [x] **Step 4**: 커밋

## Task 7: 제출 문서 재작성 — ③ game-intro · ④ ai-usage-doc

**Files:** Modify `docs/submission/game-intro.md`, `docs/submission/ai-usage-doc.md`,
`docs/submission/requirements.md`(체크리스트), `docs/concept/game-concept.md`(전환 배너 정합) · `npm run pdf`

- [x] **Step 1**: requirements.md 재독(제출물 작업 시작 전 필독 — CLAUDE.md 계약) + `npm run pdf`
  콘솔 리마인더 확인
- [x] **Step 2**: ③ game-intro — 새 게임(타일 병원·건설·채용·우선순위·사직·스토리텔러·판 종결) 기준
  개요·플레이법·실행법 재작성. 진입 URL = Pages `/`(스왑 후). 스크린샷 자리는 표식만(재캡처는 사용자 몫)
- [x] **Step 3**: ④ ai-usage-doc — 디렉팅 B축 스파인 유지 + 물증 갱신: 2콜 경계가 스토리텔러에서
  어떻게 구현됐나(선택지 enum·전제 코드 가드·폴백 강등 = "AI를 어디까지 믿고 어디서 끊는가"),
  §6-4에 Task 5의 실호출 로그·지연 실측 기입. **집계 의무**(CLAUDE.md): `Skills-used` 트레일러
  `--grep` 집계 + `rtk gain`을 여기서 돌려 §3-1 갱신
- [x] **Step 4**: `npm run pdf` 재생성 · requirements.md 체크리스트 상태 갱신(③④ 손질 내용 반영)
- [x] **Step 5**: 커밋

## Task 8: 문서 스윕 + 최종 게이트

- [x] plan.md(PR D ✅ + 이월 갱신 — jsdom ⏸ 사유·사직 파동 ⏸·특성 수치 효과 ⏸) ·
  changeLog 항목(PR 번호 없이) · **trap 스윕**(SDD 종료 관문 — 서브에이전트가 잡은 1분+ 디버깅
  포함 T-### 신설) · troubleshooting 허브 재생성
- [ ] 최종 브랜치 리뷰(reviewer · xhigh): 게이트 5종(vitest 전체·tsc·eslint·양 빌드·`src/game` 0줄 —
  ⚠️ 이번 PR은 `/classic` 라우트 신설로 src/app은 변하지만 **src/game 본체는 여전히 0줄**이 계약) +
  다주 종주(이벤트 포함 시드 수 축소 가능 — 3구성×3시드×12주) + 판 종결 3종 실도달 +
  브라우저 핵심 여정(콘솔 0·375px) + 폴백 강등 실측(무키)
- [ ] PR 생성(`gh pr create` · 한글 body는 `--body-file`) → **사용자에게 머지 여부 질문 후 정지**

---

## 사용자 몫 (코드 밖 — PR과 병행)

1. **Vercel 환경변수 `ANTHROPIC_API_KEY` 등록**(대시보드) — 등록 전까지 배포본은 폴백으로 완주(의도).
2. **스크린샷 재캡처**(배포본 기준 — T-034로 사용자 로컬 화면에서) → ③④에 삽입.
3. **플레이 영상 30~60초 촬영 + 유튜브 업로드**(P6) — 랜딩 스왑 머지 후 Pages `/`에서.

## Self-Review 결과

- 스펙 §4 커버리지: 이벤트 엔진 ✅ / LLM 디렉터 ✅ / 무키 폴백 ✅ / 폰 서사 표면(사직 편지 ✅ ·
  환자 항의문 ⏸ — 편지와 같은 기계의 반복이라 본선) / 가드레일 ✅. §2 개성: 라벨·사연 ✅ ·
  수치 효과 ⏸(0-3 근거).
- 타입 일관성: `SimEventKind`·`EndingKind`·`turnedAwayTotal` 명명이 Task 1~5에서 동일함 확인.
- 플레이스홀더 없음 확인. 프롬프트 본문(SYSTEM_PROMPTS)·연출문 카탈로그 원고는 구현 시 작성 —
  계약(한국어·판정 불개입·길이 상한·T-094)만 여기 잠근다.
