---
tags:
  - type/spec
---

# 설계 스펙 — 외생 이벤트 → WorldState 재구성 (최소 슬라이스)

> **상태**: 확정 설계 (2026-07-18, brainstorming). 다음 = writing-plans로 구현 계획.
> **맥락**: [ai-scenario-generation.md](../../concept/ai-scenario-generation.md)가 확정한 새 축("AI가 매주 현실 세계를 재구성")의 **첫 최소 슬라이스**. 이번엔 결정론 코어만 — 실제 LLM은 이 코어가 검증된 뒤 비파괴 가산.
> **리서치 근거**: [current-korea-change-events.md](../../research/current-korea-change-events.md)(이벤트 재료) · [current-korea-starting-world.md](../../research/current-korea-starting-world.md)(시작 세계관).

---

## 1. 목적 & 스코프

**목적**: "외생 이벤트 1개가 세계 파라미터를 재구성하고, 그 위에서 게임이 돈다"는 메커니즘을 **결정론 순수 함수로 잠근다**. 이벤트가 플레이어 채용 경제(DEPARTMENTS 수가)를 흔들어, 특히 **D형 비대칭**(개선책조차 상쇄됨 — 수가를 올려도 미용이 여전히 유리)을 값에서 자동으로 드러낸다.

**확정 결정 (brainstorming 2026-07-18)**:
| 축 | 결정 | 근거 |
|---|---|---|
| 시간 구조 | **1회 세팅** (한 주 단막극 유지) | 최소 침습, 기존 재사용 최대. '매주 반복'은 다음 슬라이스 |
| 작용 대상 | **플레이어 경제** (`DEPARTMENTS`) | D형 비대칭이 가장 선명, 순수 데이터라 TDD 쉬움 |
| AI 개입 | **결정론 먼저** | 이 프로젝트 원칙(결정론 먼저, LLM은 비파괴 가산) |
| 세계 표현 | **WorldState 도입** (필드는 `departments`만) | 확장 기반 + 오버빌드 방지 |
| 카탈로그 | **개선 1 + 악화 1** | 세계가 좋아지거나 나빠지는 양방향 |

**스코프 밖 (⏸ 다음 슬라이스)**: 실제 LLM 서사 생성 · 다주(N주) 루프 · 2막 전원 병원(scenarios.ts) 이벤트 · WorldState의 departments 외 필드.

---

## 2. 타입 (`src/game/world.ts` 신설)

```ts
/** 세계 상태 — 이번 슬라이스의 유일 필드는 departments. 확장점: hospitals·week·appliedEvents. */
export interface WorldState {
  departments: DepartmentSpec[]
}

/** 외생 이벤트 = 세계에 떨어지는 변경 1개. */
export interface WorldEvent {
  id: string
  headline: string        // 결정론 서사(신문 헤드라인). ⬅ 나중에 LLM이 대체할 슬롯
  direction: 'improve' | 'worsen'  // 양방향 태그(카탈로그 분류·표시용)
  effects: DeptEffect[]
}

/** 한 과의 한 값에 대한 델타. 부호·방향만 근거, 금액은 각색. */
export interface DeptEffect {
  dept: DeptKey
  field: 'profitPerDoctorBillions' | 'hireCostBillions'
  delta: number
}
```

`DepartmentSpec`·`DeptKey`는 기존 `types.ts` 재사용.

---

## 3. 이벤트 카탈로그 (`world.ts`, 결정론·리서치 근거)

부호·방향만 근거를 지키고 금액은 각색(예시값 — 구현 시 밸런싱 튜닝):

- **개선** `CARDIO_FEE_HIKE` "필수의료 정책수가 인상 — 순환기 배후 보상 상향"
  - `effects`: `[{ dept: 'CARDIOLOGY', field: 'profitPerDoctorBillions', delta: +6 }]` (−12 → −6)
  - 근거: [change-events §B](../../research/current-korea-change-events.md) 2023 필수의료 정책수가 패키지.
  - **D형 자동 시연**: 순환기 손익이 나아져도 미용 +70이 여전히 압도 → 플레이어는 여전히 미용을 뽑고, 2막 STEMI를 못 받는다. "개선을 줘도 구조는 안 뚫린다"가 값에서 드러남.
- **악화** `LITIGATION_CHILL` "필수과 소송 판결 여파 — 인력난 심화"
  - `effects`: `[{ dept: 'CARDIOLOGY', field: 'hireCostBillions', delta: +6 }]` (30 → 36)
  - 근거: [change-events §C·D](../../research/current-korea-change-events.md) 형사 송치→방어진료·기피, 상대유인 구조.

> ⚠️ 카탈로그 값은 **부호(개선=순환기 유리↑ / 악화=순환기 불리↑)만 근거**. 정확한 수치는 구현 시 기존 밸런싱 불변식(예산 100억·손익 스케일) 안에서 튜닝하고, 헤드라인 카피는 톤 가드레일(실명 금지·특정집단 비난 금지)을 지킨다.

---

## 4. 순수 함수 (`world.ts`)

```ts
export function initWorld(): WorldState          // { departments: DEPARTMENTS 복제 }
export function applyEvent(world: WorldState, event: WorldEvent): WorldState
export function selectEvent(index: number): WorldEvent   // 카탈로그에서 결정론 선택
```

- `applyEvent`: 각 effect를 해당 과의 해당 field에 델타 적용. **순수·불변**(새 배열/객체 반환, 입력 안 변형).
- **⚠️ 판정 불변 원칙(이 슬라이스의 헌법)**: `applyEvent`는 `departments`만 만진다. `adjudicateTransfer`·`Hospital`·`backupCare` 판정 경로는 **절대 안 건드린다.** 세계 파라미터(채용 경제)는 바꾸되 개별 생사 판정은 코드가 잠근다는 원칙의 한 계층 위 연장. 이벤트는 "누가 채용될 유인"을 바꿀 뿐, "이 환자가 수용되는가"는 못 바꾼다.

---

## 5. 세션 통합 (최소 침습)

**5.1 phase 추가**: `LANDING → WORLD_EVENT → SETUP → …(기존)`
- `SessionState`에 `world: WorldState` 추가.
- 새 `WORLD_EVENT` 화면: `event.headline`을 신문/공문 형태로 고지(서사 표면). "확인" → SETUP.

**5.2 setup 함수 파라미터화**: `buildHospital`·`hiringCost`·`withinDeptCaps`·`adjustDoctors`·`isSetupReady`가 카탈로그를 인자로 받도록 리팩터.
- 시그니처: `hiringCost(choices, departments = DEPARTMENTS)` 식 — **기본값=`DEPARTMENTS`로 하위호환**(기존 호출부·테스트 무변경).
- 위저드는 `world.departments`(=이벤트 적용본)를 넘겨 변형된 수가로 딜레마를 띄운다.

**5.3 전이 & 이벤트 선택**: `LANDING → WORLD_EVENT`로 새 전이 함수(예: `enterWorldEvent(state)`), `WORLD_EVENT → SETUP`은 기존 `beginSetup` 계열. 이벤트는 이 슬라이스에서 **결정론 고정**(`selectEvent(0)` = 개선 이벤트)으로 확정 — 시드 회전은 §8 확장점. 기존 상태기계 가드 패턴(phase 체크·throw) 준수.

---

## 6. 테스트 (TDD Red→Green)

- **`world.test.ts`** (신규):
  - `applyEvent`: effect 적용 정확성(개선·악화 각각) · 불변성(입력 안 변형) · 다중 effect 합성.
  - **판정 무영향**: 이벤트 적용 전후로 `adjudicateTransfer`(동일 Hospital·Patient) 결과 불변 — 헌법 회귀 잠금.
  - `initWorld`: 기본 DEPARTMENTS와 동치(복제본).
  - `selectEvent`: 인덱스별 결정론.
- **`session.test.ts`** (확장): `WORLD_EVENT` phase 전이 · `world`가 SETUP 위저드에 반영.
- **회귀**: 기존 `vitest` 219 green 유지(setup 함수 기본값 하위호환으로 무변경 확인) · `tsc --noEmit` 0.

---

## 7. 컴포넌트 경계 (단일 책임)

| 유닛 | 하는 일 | 의존 |
|---|---|---|
| `world.ts` | 세계 상태·이벤트·적용 (순수) | types.ts |
| `setup.ts`(리팩터) | 위저드 경제 (departments 주입받음) | types.ts |
| `session.ts`(확장) | WORLD_EVENT phase·world 보유 | world.ts, setup.ts |
| WORLD_EVENT UI | headline 고지 | session.ts |

`world.ts`는 세션·UI를 모른다(순수). 판정(`adjudicate.ts`)은 이 슬라이스에서 **한 줄도 안 바뀐다**.

---

## 8. 확장점 (다음 슬라이스가 여기에 붙는다)

- **LLM 서사**: `WorldEvent.headline`을 실제 Anthropic 왕복으로 렌더(무키 폴백). 파라미터 재구성은 여전히 결정론.
- **다주 루프**: `WorldState`에 `week`·`appliedEvents[]` 추가, 세션이 N주 반복하며 매주 `applyEvent`.
- **전원 병원 이벤트**: `WorldState.hospitals` 추가, 이벤트가 2막 NPC 분포도 변형.
- **D형 상쇄 페어링**: 개선 이벤트 뒤 '현장은 그대로' 후속(change-events 설계 규칙).
