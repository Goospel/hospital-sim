---
tags:
  - type/spec
---

# 설계 스펙 — 응급 재설계: "받는 쪽으로 통합" (2막 뺑뺑이 미니게임 은퇴)

> **상태**: 확정 설계 (2026-07-19, brainstorming). 다음 = writing-plans로 구현 계획.
> **맥락**: 사용자 방향 재설정 — "일주일이 끝날 때 무조건 STEMI 발동은 억지, 응급은 STEMI만이 아니다." 2막(주말 STEMI 클라이맥스 + 골든타임 뺑뺑이 미니게임)을 은퇴시키고, **다양한 응급을 1막 '받는' 흐름으로 통합**한다. 플레이어는 항상 벽이다.
> **리서치 근거**: [medical-system-grounding.md](../../research/medical-system-grounding.md)(실제 뺑뺑이 사망은 다양한 과 부재 — 대구 신경외과·산부인과 사례) · [fee-schedule-and-subsidies.md](../../research/fee-schedule-and-subsidies.md)(급여 원가보전율).
> **관련**: [ai-scenario-generation.md](../../concept/ai-scenario-generation.md)(§5-A가 이미 "뺑뺑이 자유텍스트 입력 폐기"를 예고 — 이 스펙이 그 방향을 완성·확대) · [game-concept.md](../../concept/game-concept.md).

---

## 1. 목적 & 방향 (brainstorming 확정)

**문제**: 지금은 매주 7일차 밤에 **무조건 STEMI**가 발동하고, 배후 없으면 골든타임 뺑뺑이 미니게임(플레이어=전원 애원하는 피해자)이 돈다. 이는 (a) 타입 고정(STEMI만), (b) 시점 고정(항상 주말), (c) 시범 장치가 굳은 것 — **억지스럽고 현실과 어긋난다.** 실제 응급은 여러 종류이고 예고 없이 온다.

**방향 (사용자 결정)**:
| 축 | 결정 |
|---|---|
| 응급 다양화 | 일상 분산 + 주말은 결산 (둘 다) |
| 관점 | **받는 쪽으로 통합** — 모든 응급이 1막 콜. 못 받으면 그 환자가 다른 데서 뺑뺑이 = 내가 그 벽 |
| 골든타임 뺑뺑이 미니게임 | **은퇴** |

**메시지 상향**: 피해자 시점 미니게임은 플레이어를 동정받는 위치로 놨다. 없애면 플레이어가 계속 **돌려보내는 쪽**에 남아 책임이 선명해진다 — *"당신이 그 벽이다."* 실제 뺑뺑이 사망도 순환기만이 아니라 신경외과·산부인과 부재였다(grounding §4).

**스코프 밖 (⏸)**: 받는 콜에 골든타임 압박(수락 카운트다운) 재도입 · 소아(PEDIATRICS enum 신설) · LLM 서사.

---

## 2. 새 상태기계

```
전(현재):
LANDING → WORLD_EVENT → SETUP → (RECEIVING → DAY_END)×7 → INTERSTITIAL → EMERGENCY → WEEK_SUMMARY → nextWeek | endGame

후(이 스펙):
LANDING → WORLD_EVENT → SETUP → (RECEIVING → DAY_END)×7 → WEEK_SUMMARY → nextWeek | endGame
```

- 7일차 `DAY_END` → `INTERSTITIAL`/`EMERGENCY`를 거치지 않고 **바로 `WEEK_SUMMARY`**.
- `SessionPhase`에서 `INTERSTITIAL`·`EMERGENCY` 제거. `EmergencyState` 삭제.

---

## 3. 삭제 / 변경 목록 (실측 blast radius)

**완전 삭제 (게임)**: `round.ts`(attemptTransfer·GameState·startGame)·`round.test.ts` · `goldenTime.ts`·`goldenTime.test.ts` · `scenarios.ts`(createStemiScenario)·`scenarios.test.ts` · `debrief.ts`·`debrief.test.ts`.

**완전 삭제 (컴포넌트)**: `Interstitial.tsx` · `InHouseEmergency.tsx` · `TransferRound.tsx` · `Receipt.tsx`.

**트림 (일부 함수만 제거)**: `dialogue.ts` — 2막 전용 `fallbackLine`·`persuasionReply`(TransferRound가 유일 소비자) 제거. **1막용 `callerPleaAt`·`receivingLine`은 유지**(ReceivingPhase가 계속 씀). 해당 테스트도 트림.

**개편 (변경)**:
- `session.ts`: `SessionPhase`에서 두 페이즈·`EmergencyState`·`beginEmergency`·`survivedEmergency` 제거. `completeWeek`을 `EMERGENCY` 요구 → `DAY_END`(7일차) 요구로. `advanceDay`의 7일차 분기를 `INTERSTITIAL` → `WEEK_SUMMARY` 직행으로. `buildEpilogue`에서 emergency/debrief 분기 제거(결산=누적 장부 + 주간 신문).
- `receiving.ts`·`types.ts`: `CallKind` 확장(§4).
- `news.ts`: STEMI 전용 → **응급 종류 불문** 일반화(§5).
- `SessionClient.tsx`: `INTERSTITIAL`·`EMERGENCY` 케이스·import 제거.
- `WeekSummary.tsx`: `survived`(2막 생존) prop 제거 → 그 주 **받은/돌려보낸 응급** 지표로 교체(§5).
- `Epilogue.tsx`: `Receipt`·`debrief` 제거.

---

## 4. 응급 CallKind 다양화

**기존 5개 배후 진료과를 재사용**(새 enum 0, YAGNI). 각 응급은 `requiredSpecialty`로 그 과 배후를 요구하고, 없으면 `adjudicateTransfer`가 **제네릭으로** `NO_BACKUP_CARE`를 건다(판정 로직 무변경).

| CallKind | 응급 | requiredSpecialty | 하드락 |
|---|---|---|---|
| `STEMI`(기존) | 급성심근경색 | CARDIOLOGY | 순환기 배후 |
| `OBSTETRIC_EMERGENCY`(신규) | 분만 응급 | OBSTETRICS | 산부 배후 |
| `NEURO_EMERGENCY`(신규) | 뇌출혈/뇌졸중 | NEUROSURGERY | 신경외과 배후 |
| `TRAUMA_EMERGENCY`(신규) | 중증외상 | GENERAL_SURGERY | 외과 배후 |
| `GENERAL_EMERGENCY`(기존) | 일반 응급 | — | 당직·과밀만(배후 무관, 저마진) |
| `COSMETIC_WALKIN`(기존) | 미용·검진 워크인 | — | 없음(명랑) |

> THORACIC_SURGERY용 응급은 이번 스코프 밖(중증외상을 GENERAL_SURGERY로 대표). 확장점에서 추가.

**경제 (급여·원가미달, 행위 단위, 각색 — 부호만 근거)**: 세 신규 응급은 모두 **수술·처치 84.9% 밴드**(STEMI와 동일 근거, `fee-schedule §2` 행위 단위)라 STEMI와 동형(예: 11/13). **과별 차등(산부 61%·소청 79% 등 과 단위)은 콜 델타에 섞지 않는다**(T-039 함정) — "산부가 더 밑진다"는 이미 재정중립 패키지가 만든 DEPARTMENTS 층(산부 −16)이 담당한다. 즉 배후과 채용 경제(과 단위)가 차등을 표현하고, 콜 델타(행위 단위)는 균일하게 급여·원가미달.

**속성**: 세 신규 응급은 `lawsuitRisk: true`(필수·고위험), `nightShift`는 기존 규칙(인덱스 파생) 재사용 — 야간이면 `roundTheClockBackup` 필요.

---

## 5. DAY_PLANS · 뉴스 · 결산

- **DAY_PLANS 재구성**: 7일 × 5통 고정 유지. STEMI 편중을 **4종 응급 분산**으로 교체. 원칙 보존 — (1) 매일 응급이 있다, (2) 뒤로 갈수록 응급 밀도↑, (3) 자리 3 < 5통이라 매일 2통은 못 받는다. 한 병원이 4개 배후과를 다 못 갖추므로 **어떤 종류든 하드락이 난다** = 필수의료 붕괴가 여러 과에서 동시에.
- **`news.ts` 일반화**: 지금은 못 받은 **STEMI**만 기사가 된다. → 못 받은 **모든 응급**(종류 라벨 포함)이 기사가 되게. `renderNews`·`TurnedAway`에 응급 종류를 실어 종류별 헤드라인. `FORBIDDEN_REAL_EVENT_TOKENS` 가드는 유지.
- **결산(`WeekSummary`)**: `survived`(2막 생존 여부) 대신 그 주 **받은 응급 수 / 돌려보낸 응급 수**(종류 무관 집계)를 보여준다. 해석 카피 없이 숫자만(show-don't-tell).

---

## 6. 테스트 전략 (TDD Red→Green)

- **삭제 슬라이스**: 삭제되는 모듈의 테스트는 함께 제거하되, **삭제 후 전체 스위트 green + `tsc --noEmit` 0**이 회귀 잠금(고아 import·죽은 참조 0 확인).
- **상태기계**: `session.test.ts` — 7일차 `DAY_END → WEEK_SUMMARY` 직행 전이(신규 RED), `completeWeek` 가드 변경, `buildEpilogue`가 emergency 없이 누적 장부·신문만 담음.
- **응급 다양화**: `receiving.test.ts` — 신규 CallKind 3종이 각 배후과 없으면 `NO_BACKUP_CARE` 하드락, 있으면 수용. 경제 델타 급여·원가미달. `news.test.ts` — 종류별 기사 생성 + 실명 토큰 가드 유지.
- 게이트: 전체 vitest green + `tsc --noEmit` 0.

---

## 7. 구현 분해 (2 슬라이스 — 각각 독립 PR)

**슬라이스 A — 2막 은퇴 + 상태기계 단순화** (큰 삭제, 그 자체로 동작하는 더 단순한 게임):
- 두 페이즈·EmergencyState·minigame·scenarios·debrief·4 컴포넌트 삭제, dialogue 트림.
- 7일차 → WEEK_SUMMARY 직행. WeekSummary/Epilogue에서 생존·debrief 제거.
- 산출: STEMI 받기 + 결산으로만 도는 1막 전용 게임. green + tsc 0.

**슬라이스 B — 응급 CallKind 다양화** (A 위에):
- `OBSTETRIC_EMERGENCY`·`NEURO_EMERGENCY`·`TRAUMA_EMERGENCY` 추가, DAY_PLANS 재구성, news 일반화, WeekSummary 집계.
- 산출: 다양한 응급을 받는 벽으로서의 게임.

> A를 먼저 머지해 삭제를 격리(리뷰·회귀 쉬움), B로 다양성을 얹는다.

---

## 8. 다운스트림 문서 영향 (같이 갱신)

- **README.md**: 게임 소개가 "골든타임 180초 자유텍스트 전원 협상"을 간판으로 설명 → 받는 쪽 통합·응급 다양화로 갱신.
- **docs/submission/**: ai-usage-doc·submission-plan이 실시간 뺑뺑이 협상을 승부축으로 서술한 부분 정합(ai-scenario-generation §5-B가 이미 "라이브 반증 포기·문서 강조"로 선회했으므로 그 연장).
- **ai-scenario-generation.md**: §5-A(뺑뺑이 자유텍스트 입력 폐기)를 이 스펙이 완성·확대했음을 반영.
- **changeLog/plan**: 각 슬라이스 머지 시 갱신.

---

## 9. 비용 · 리스크 (정직하게)

- **가장 공들인 부분을 지운다**: 골든타임 뺑뺑이 미니게임(타이머·병원 리스트·거절 사유·TransferRound)은 현재 게임의 간판이다. 은퇴는 되돌리기 큰 삭제다 — 그래서 사용자 명시 확인 후 진행(2026-07-19).
- **긴장의 성격 변화**: 액션(초 단위 골든타임) → 경영(자리 3<5 · 누적 신문). 게임이 조용해진다. 의도된 방향이나, 체감은 브라우저 완주로 확인 필요.
- **마감(2026-08-10) 리스크**: 척추 교체라 범위가 크다. 2 슬라이스 분해로 완주 가능성을 지킨다.
- **문서 정합 부채**: README·제출문서가 함께 바뀌어야 해 슬라이스마다 sweep 필요.

---

## 10. 확장점

- THORACIC_SURGERY 응급(대동맥박리 등) 추가로 5개 배후 전부 게이트화.
- 소아 응급(PEDIATRICS enum 신설).
- 받는 콜 골든타임 압박(수락 카운트다운) — 은퇴한 시간 긴장을 받는 쪽에서 재도입.
  → ✅ 소화(2026-07-24): [emergency-agency-fun 스펙](2026-07-24-emergency-agency-fun-design.md) PR 1로 구현.
- LLM 서사(응급·뉴스 헤드라인 생성, 판정은 코드).

---

## 재현 / 검증

1. 부착점은 코드로: `adjudicateTransfer`(제네릭 판정, 무변경)·`hardlockReason`(kind별 분기)·`SessionClient` 페이즈 스위치.
2. 삭제 회귀는 `tsc --noEmit` 0(고아 참조 없음) + 전체 vitest green으로 잠근다.
3. 응급 다양화는 신규 CallKind별 NO_BACKUP_CARE 하드락 테스트로 잠근다.
