---
tags:
  - type/spec
---

# 설계 스펙 — 재정중립 정책수가 패키지 = 1주차 개원 이벤트

> **상태**: 확정 설계 (2026-07-19, brainstorming). 다음 = writing-plans로 구현 계획.
> **맥락**: [2026-07-18-world-event-slice-design.md](2026-07-18-world-event-slice-design.md)가 잠근 외생 이벤트 코어(`WorldState`·`WorldEvent`·`applyEvent`) 위에 **첫 다효과(패키지) 이벤트**를 얹는다. 엔티티 우선순위 판정([entity-implementation-priority.md](../../concept/entity-implementation-priority.md))의 2·5위(재정중립·정책수가 패키지)를 한 이벤트로 구현.
> **리서치 근거**: [fee-schedule-and-subsidies.md](../../research/fee-schedule-and-subsidies.md)(급여수가·재정중립) · [current-korea-change-events.md](../../research/current-korea-change-events.md)(정책수가 패키지 이벤트 재료) · [medical-system-grounding.md](../../research/medical-system-grounding.md)(부호·대소 근거).

---

## 1. 목적 & 스코프

**목적**: "정책은 손잡이 하나가 아니라 **주고-뺏는 묶음**이고, 그 재분배는 **급여 풀 안에서 제로섬**이라 비급여(미용)를 못 이긴다"를 **개원 위저드 숫자에서 플레이어가 스스로 겪게** 한다. 두 도메인 엔티티를 한 이벤트로:
- **정책수가 패키지**(엔티티 5위): 단일 효과 → **다효과**(여러 과 동시 조정).
- **재정중립**(엔티티 2위): 순환기 수가를 올린 만큼 다른 급여과가 내려가 **급여 profit 합 = 0**. 비급여는 풀 밖이라 무풍지대.

**확정 결정 (brainstorming 2026-07-19)**:
| 축 | 결정 | 근거 |
|---|---|---|
| 배치 | **1주차 개원 이벤트**(`enterWorldEvent`)로. `CARDIO_FEE_HIKE` 자리 교체 | §2 발견 — 월드 이벤트가 경제에 물리는 유일 지점이 1주차 `completeSetup`뿐 |
| 상쇄 방식 | **과 간 profit 상쇄**(순환기 +6 / 산부 −6) | 재정중립의 정본(급여 풀 제로섬), 불변식이 "합=0"으로 깨끗 |
| hireCost 손잡이 | **제외** | 기존 `LITIGATION_CHILL`(hireCost +6)과 누적 충돌·불변식 흐림. profit 2효과로 두 개념 다 성립(YAGNI) |
| 스케줄링 | **불필요** | 1주차 고정이 곧 큐레이션. 2주차+ 순환 카탈로그는 무변경(헤드라인 flavor) |

**스코프 밖 (⏸ 다음 슬라이스)**: 산부인과 콜(상쇄를 장부에서 체감하게) · 매주 재채용/경제 재계산(2주차+ 이벤트 실효화) · hireCost 손잡이 · LLM 헤드라인 생성.

---

## 2. 핵심 발견 — 월드 이벤트는 1주차 개원 때만 경제에 물린다

`world.departments`(이벤트가 바꾸는 수가)가 병원 손익으로 흘러드는 지점은 코드에 **하나뿐**이다:

```ts
// session.ts:109 — completeSetup 안에서만
const { hospital } = buildHospital(choices, world.departments)  // 1주차 개원 시 economics 굳음
```

2주차 이후 `nextWeek`은 `world.departments`를 누적 변경하지만, `beginWeek`이 **기존 병원을 그대로 재사용**(재설립·재계산 없음)한다. 테스트도 이를 확인한다 — `session.test.ts:383`은 2주차에 `world`가 누적되는 것만 검증하고 `hospital.economics`가 바뀐다고는 주장하지 않는다.

**함의**: 2주차 이후 이벤트는 헤드라인(서사)만 뜨고 손익엔 0 반영이다. 그래서 재정중립을 **장부에서 겪게** 하려면 1주차 개원 이벤트여야 한다 → 배치 결정의 근거.

---

## 3. 이벤트 정의 (`world.ts`)

```ts
/** 1주차 개원 전용 큐레이션 이벤트 — 순환 카탈로그(EVENT_CATALOG)와 별개. */
export const OPENING_EVENT: WorldEvent = {
  id: 'FEE_REFORM_PACKAGE',
  headline: '필수의료 정책수가 인상 의결 — 재정중립 원칙 따라 타 급여수가 동반 조정',
  direction: 'improve', // 명목상 개선으로 고지(아이러니는 숫자에서 발견 — show-don't-tell)
  effects: [
    { dept: 'CARDIOLOGY', field: 'profitPerDoctorBillions', delta: +6 }, // 개혁 본체: 순환기 −12 → −6
    { dept: 'OBSTETRICS', field: 'profitPerDoctorBillions', delta: -6 }, // 재정중립 상쇄: 산부 −10 → −16
  ],
}
```

- `WorldEvent`·`DeptEffect` 타입은 기존 [world-event-slice 스펙 §2](2026-07-18-world-event-slice-design.md) 재사용 — **신설 타입 0**.
- `EVENT_CATALOG`(2주차+ 순환)·`applyEvent`·`selectEvent`·`nextWeek` **무변경**.
- 금액(±6)은 각색이되 **부호(순환기 유리↑ / 산부 불리↑)와 합=0만 근거**. 정확한 수치는 밸런싱 불변식(예산 100억·손익 스케일 I8) 안에서 튜닝.

**왜 hireCost를 뺐나**: (a) 기존 `LITIGATION_CHILL`이 순환기 hireCost +6을 누적해 `session.test.ts:383`이 `hireCostBillions === 36`을 기대하는데, 개원 패키지가 hireCost를 또 건드리면 42가 되어 기존 테스트가 깨진다. (b) profit만 건드리면 재정중립 불변식이 "profit 합=0"으로 깨끗하다. profit 2효과만으로도 패키지(다효과)·재정중립(제로섬) 둘 다 성립한다.

---

## 4. 두 개념이 어떻게 성립하나

- **정책수가 패키지**: 지금 `CARDIO_FEE_HIKE`는 효과 1개(순환기 profit +6)다. 패키지는 **2개 과 동시 조정** — `applyEvent`의 다효과 루프(`world.ts:64`)가 이미 지원하던 걸 데이터로 처음 행사한다.
- **재정중립**: 순환기 +6 / 산부 −6 → 급여 풀 **profit 합 = 0**. 미용(+70)·검진(+40)은 비급여(HOSPITAL 가격결정, [world-event-slice 스펙])라 이 풀 밖이라 손 안 댐 → "급여 안에서 재분배해도 비급여를 못 이긴다"가 개원 위저드에서 값으로 드러난다.

> **층위 주의**(개념 정합): 재정중립은 **정부(건강보험 재정) 층**의 제로섬 제약이지 병원 내부 균형이 아니다. 그래서 헤드라인은 반드시 **정부 결정**("정책수가 인상 **의결**")으로 표현해 "병원이 알아서 맞추면 되잖아"라는 오독을 막는다. 게임은 그 정부 정책이 플레이어 병원 economics에 떨어진 **결과**를 보여줄 뿐이다.

---

## 5. 코드 접점 (최소 침습)

| 파일 | 변경 | 판정(`adjudicate`) 영향 |
|---|---|---|
| `world.ts` | `OPENING_EVENT` 상수 추가 | 0 (헌법: `field`가 profit/hireCost로 타입 제한) |
| `session.ts` | `enterWorldEvent`가 `selectEvent(0)` 대신 `OPENING_EVENT` 적용 | 0 |
| `WorldEventCard.tsx` | **무변경** (헤드라인 렌더) | 0 |

`enterWorldEvent` 변경 (그림):
```ts
// 전: const event = selectEvent(0)          // CARDIO_FEE_HIKE(단효과)
// 후: const event = OPENING_EVENT           // 재정중립 패키지(다효과)
const world = applyEvent(initWorld(), event)
```

**판정 불변 원칙(헌법)**: 이벤트는 `departments`(채용 경제)만 만지고 `adjudicateTransfer`·`backupCare`·생사 판정은 한 줄도 안 건드린다 — [world-event-slice 스펙 §4](2026-07-18-world-event-slice-design.md)의 연장. `DeptEffect.field` 타입 제한이 이를 구조적으로 강제한다.

---

## 6. 테스트 (TDD Red→Green)

**`world.test.ts`** (신규 항목):
- **재정중립 불변식**(핵심 단언): `OPENING_EVENT.effects` 중 급여과(essential) profit 델타 합 === 0. ← "중립" 주장을 코드로 못박음.
- `OPENING_EVENT`가 다효과(2개)이며 각각 순환기 +6·산부 −6.
- `applyEvent(initWorld(), OPENING_EVENT)` → 순환기 −6·산부 −16 (불변성 포함).

**`session.test.ts`** (기존 확장):
- `enterWorldEvent`: 순환기 −6(기존 통과 유지) **+ 산부 −16**(신규) + `direction === 'improve'`.
- `completeSetup`이 산부 −16을 economics.segments에 반영(산부 채용 시).
- **회귀**: `session.test.ts:383`(2주차 누적: 순환기 −6 보존·hireCost 36) **그대로 통과**해야 한다(패키지가 hireCost 무관이라 유지) — 이 통과가 hireCost 제외 결정의 회귀 잠금이다.

**게이트**: 기존 vitest green 유지 + `tsc --noEmit` 0(vitest는 타입체크 안 함 — 별도 게이트 필수).

---

## 7. 톤·팩트 가드레일

- 헤드라인은 **사실만**(무슨 정책이 의결됐나). "이래서 개혁은 무의미하다" 같은 해석 카피 금지 — 아이러니는 플레이어가 숫자에서 발견(show-don't-tell).
- **미검증 수치 노출 없음**: 금액은 각색(±6), 화면에 실측 통계(28%↓·90% 등)를 띄우지 않는다.
- **실명·정파 없음**: "재정중립"은 실제 복지부/건정심 정책 원칙이라 특정 인물·집단 지목이 아니다. 안전.

---

## 8. 알아둘 천장 (정직하게)

산부 −6 상쇄는 **위저드 숫자·헤드라인엔 사실로 노출**되지만, 플레이어가 산부를 안 뽑으면(현재 산부 콜이 없어 뽑을 유인이 없다) **장부에는 안 잡힌다**. 완전한 "장부 체감"(개혁을 줬는데 순효과 0을 결산에서 겪음)은 **산부인과 콜**(엔티티 4위)이 붙을 때 온다. 이번 스코프는 **사실 노출까지**.

---

## 9. 확장점 (다음 슬라이스가 여기에 붙는다)

- **산부 콜 신설**: 상쇄를 장부에서 체감 → 재정중립의 페이오프 완성(스코프 밖 1순위).
- **매주 재채용/경제 재계산**: 2주차+ 월드 이벤트가 economics에 물리게 → 재정중립을 후속 주에도 배치 가능(ai-scenario-generation의 미해결 "매주 채용 재편" 열린 질문).
- **hireCost 손잡이 복원**: 재채용이 생기면 "인력지원 축소"를 3번째 효과로 되살릴 수 있다.
- **LLM 헤드라인**: `OPENING_EVENT.headline`을 실제 왕복으로 렌더(무키 폴백). profit 재구성·불변식은 여전히 결정론 코드.

---

## 재현 / 검증

1. 부착점은 문서 주장이 아니라 코드로: `session.ts:109`(월드→economics 유일 연결)·`world.ts:64`(다효과 루프)·`DeptEffect.field` 타입 제한(헌법).
2. 재정중립 불변식은 `effects`의 급여과 profit 합=0으로 테스트가 잠근다.
3. 회귀 잠금: `session.test.ts:383`이 계속 통과하면 hireCost 제외가 유지된 것.
