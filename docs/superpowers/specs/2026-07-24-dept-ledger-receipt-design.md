---
tags:
  - type/spec
---

# 설계 스펙 — 과별 손익 영수증: 하루·주간 마감에 과별 내역을 깐다

> **상태**: 확정 설계 (2026-07-24, brainstorming). 다음 = writing-plans로 구현 계획(구현은 별도 세션).
> **맥락**: 사용자 지적 — *"수익·손해를 보여주는 부분이 너무 단순하다. 어느 과가 손해를 얼마나 내는지 모르겠다."* 현재 하루 마감(DayEnd)은 순이익 큰 숫자 하나 + 달력, 주간 마감(WeekSummary)은 총액 4줄뿐이다. 과별 **고정비**는 데이터가 있는데(`hospital.economics.segments`) 과별 **수익** 집계가 어디에도 없다 — 콜 로그에 담당 과(`handlingDept`)가 전부 있어 계산은 지금 데이터로 가능하고, 없는 건 집계·표시 층뿐이다.
> **원칙**: 판정·경제 로직 0줄 변경 — 새로 만드는 건 **집계(순수 함수) + 저장 필드 1개 + 표시**뿐이다. 해석 카피 금지(메모 game-show-dont-tell): "순환기가 응급 때문에 적자"라고 말하지 않는다. 숫자 배치가 말하게 한다.

---

## 1. brainstorming 확정 결정 (사용자 선택)

| 축 | 결정 |
|---|---|
| 적용 화면 | **하루 마감 + 주간 마감 둘 다** — 하루 마감엔 오늘 과별 내역, 주간 마감엔 7일 합산 과별 내역. 결말 장부(LedgerPanel)·플레이 중 명랑 장부는 이번 슬라이스에서 **불변** |
| 과별 한 줄 정보량 | **환자 수 · 수익 · 고정비 · 순익** — 왜 그 과가 적자인지(환자를 못 받아서인지, 받을수록 밑지는지)까지 읽히는 수준. 놓친 환자(기다리다 감 등)는 이번 슬라이스 밖 |
| 구조 | **B안: `DayRecord`에 과별 스냅샷 저장** — 주간 마감 시점엔 지난 날들의 `receiving`이 버려져 있어(A안 즉석 계산 불가) 하루 마감 시점에 접어 저장한다. 고정비는 저장하지 않고 렌더 시 파생(병원 구성은 주 중 불변 + 미래 확정 값 이중 기재 금지 원칙) |

## 2. 데이터 층 — 과별 하루 스냅샷 (순수 함수, TDD)

### 2-1. `deptDayStats(receiving): DeptDayStats` (receiving.ts 또는 신규 모듈)

```ts
export type DeptDayStats = Partial<Record<DeptKey, { patients: number; revenueManwon: number }>>
```

- `receiving.log`에서 `accepted === true`인 엔트리만 순회, `handlingDept(receiving.queue[i])`로 접는다: `patients += 1`, `revenueManwon += callDelta(call.kind)`.
- **BUMP 정합은 공짜다**: `applyBump`가 밀린 예약의 로그 엔트리를 `accepted: false`로 되돌리므로, accepted만 세면 회수된 수익이 자동으로 빠진다. 별도 처리 금지.
- 워크인 과 분기(미용/검진)는 기존 `handlingDept` → `walkinDept(label)`가 이미 한다 — 여기서 라벨 파싱을 새로 만들지 않는다.

**불변식 I-A (테스트 필수)**: `Σ deptDayStats(...).revenueManwon === receiving.netProfitDeltaManwon`. `decide`가 accept마다 `callDelta`를 더하고 BUMP가 로그·델타를 함께 되돌리므로 항상 성립해야 한다 — 깨지면 집계가 거짓말하는 것.

### 2-2. `DayRecord.deptStats` 필드 추가 (session.ts)

- `recordDay`가 `deptStats: deptDayStats(receiving)`를 채운다. 기존 필드 전부 불변.
- `history`·`ledgerDays` 파급은 타입 전파뿐(추가 마이그레이션 없음 — 세션은 메모리 상태다).

### 2-3. `deptLedgerLines(days, hospital, departments): DeptLedgerLine[]` (신규 표시용 순수 함수)

```ts
export interface DeptLedgerLine {
  key: DeptKey
  label: string          // departments spec의 label (단일 출처 — 새 라벨 맵 금지)
  patients: number
  revenueManwon: number
  fixedManwon: number    // 음수. Math.round(주간 고정비 / DAYS_PER_WEEK) × days.length
  netManwon: number      // revenueManwon + fixedManwon
}
```

- `days: DayRecord[]` — 하루 마감은 `[오늘]` 1개, 주간 마감은 `ledgerDays` 전체를 넘긴다. **두 화면이 같은 함수를 쓴다** — 하루/주간 숫자가 구조적으로 어긋날 수 없다.
- `departments`는 `state.world?.departments ?? DEPARTMENTS` (session.ts의 기존 패턴과 동일 — 월드 이벤트가 과 스펙을 바꿔도 라벨·비용이 따라온다).
- 과별 고정비 출처는 `hospital.economics.segments`이고, **segment↔과 조인은 label 일치**로 한다(segments가 `dept.label`로 만들어지므로 정확 조인 — setup.ts `buildHospital` 참조).
- 줄 포함 조건: 그 과에 segment가 있거나(=채용) `deptStats`에 엔트리가 있거나(방어적 — 정상 흐름에선 수용이 채용을 함의한다). 미채용·무활동 과는 줄 없음.
- **정렬은 `departments` 스펙 순서 고정** — 날마다 순서가 바뀌면 어제와 오늘을 비교할 수 없다. 손해 큰 과 강조는 정렬이 아니라 잉크(적자색)가 한다.

**불변식 I-B (테스트 필수)**: `Σ line.netManwon === Σ days.netProfitManwon` (오차 0).
- 근거: 일별 고정비를 `Math.round(주간/7)`로 잡으면 `accruedSegments`(p=1)의 반올림과 **자릿수까지 동일**하고, `DayRecord.segmentShareManwon`·`netProfitManwon`이 바로 그 값으로 만들어졌다. 검사 수익(`workupRevenueManwon`)은 Task 5 이후 항상 0이라 등식을 안 깬다.
- ⚠️ 주간 고정비를 segments에서 직접 (주간 전액 그대로) 가져오면 `7 × round(주간/7) ≠ 주간`인 반올림 오차로 이 등식이 깨진다. 반드시 **일 단위 반올림 × 일수**로 계산한다.

## 3. 표시 층 — 공유 컴포넌트 `DeptLedgerTable`

- **신규 `src/components/DeptLedgerTable.tsx`**: props `{ lines: DeptLedgerLine[] }`. 순수 표현, 판정 없음.
- 표: 4열 — `과 · 환자수 | 진료 | 고정비 | 순익`. `font-mono tabular-nums text-xs`, 헤더는 `font-sans text-ink-2`. 금액은 전부 `formatSignedManwon`(단일 출처 — 호출부 나누기 금지).
- **「진료」 열의 의미는 콜 델타(수가 − 원가)다** — 기존 장부의 「이번 주 진료 수익」(`netProfitDeltaManwon`)과 같은 정의. 총수가/원가를 따로 두 열로 벌리지 않는다(열 6개는 375px에서 안 서고, 게임의 다른 모든 장부가 델타 하나로 말한다). 헤더를 「수익」이 아니라 「진료」로 쓰는 이유: 응급과의 이 열은 음수인데 「수익 −822」는 자기모순으로 읽힌다.
- 잉크 규칙 기존 그대로: 순익 적자 `text-stamp-ink` / 흑자 `text-go`. 수익·고정비 열은 본문 잉크(`text-ink-2`) — 모든 열을 색칠하면 순익 색이 안 선다.
- ⚠️ **SegmentTree와 같은 함정**: 종이 잉크(ink/go/stamp-ink)는 `.paper-card` 위에서만 읽힌다. 이 컴포넌트는 **반드시 paper-card 안에서만** 쓴다(두 부모 모두 이미 paper-card라 배치만 지키면 됨).
- 모바일(375px): 4열이 `max-w-2xl` 전표 안에서 성립하는지 실측. 안 서면 과·환자수를 윗줄, 금액 3개를 아랫줄로 접는 2행 구성으로 폴백(구현 시 브라우저 검증으로 판단).

### 3-1. 하루 마감(DayEnd) 배치

- 큰 순이익 숫자 **아래**, 달력 **위**에 오늘 내역: `deptLedgerLines([today], hospital, departments)`.
- DayEnd가 현재 `hospital`을 안 받는다 — props에 `hospital`(+ `departments`) 추가, SessionClient에서 전달.

### 3-2. 주간 마감(WeekSummary) 배치

- 주 순이익·응급 수용/돌려보냄 줄 **아래**, 누적·금고 블록 **위**: `deptLedgerLines(state.ledgerDays, hospital, departments)`.
- WeekSummary도 `hospital`·`departments`(또는 미리 계산한 `lines`)를 props로 받는다. **미리 계산한 `lines`를 넘기는 쪽을 권장** — 컴포넌트가 게임 상태를 몰라도 되고 스토리북식 테스트가 쉬워진다(DayEnd도 동일 방식 허용).

### 3-3. 이 표가 처음으로 보이게 만드는 것

- 응급을 받은 배후과의 마이너스: 순환기내과 줄에 「5명 · 진료 −430 · 고정비 −390 · 순익 −820」처럼 **받을수록 커지는 적자**가 잡힌다(STEMI 3건 −450 + 예약 2건 +20).
- 미용의 플러스: 「38명 · 진료 +570 · 고정비 −350 · 순익 +220」 — 채용이 곧 처리량이고 처리량이 곧 흑자라는 기존 설계가 화면에 창발한다.
- 해석 문장은 어디에도 없다. 열 이름과 숫자뿐.

## 4. 불변 범위 (이번 슬라이스에서 건드리지 않는 것)

- 판정·경제: `decide`·`callDelta`·`CALL_ECONOMICS`·`accruedSegments`·`runningNetProfit` 0줄 변경.
- 플레이 중 명랑 장부(ReceivingPhase의 SegmentTree)·결말 장부(LedgerPanel)·에필로그: 불변. 결말까지 과별 구조로 통일하는 건 후속 후보(사용자가 하루+주간만 선택).
- 놓친 환자(LEFT_WAITING 등) 열: 스코프 밖(사용자 선택). `unacceptedGroups`가 이미 있으므로 후속에서 열 하나로 붙일 수 있다.

## 5. 테스트 계획 (TDD — Red 먼저)

1. **`deptDayStats`**: 빈 로그 → `{}` / 미용·검진 워크인 각 1 수용 → AESTHETICS·CHECKUP 각 `{1, +15}` / STEMI 수용 → CARDIOLOGY `{1, −150}` / 거절·하드락·TIMEOUT은 미집계 / BUMP 후 밀린 예약 제외·응급 포함.
2. **불변식 I-A**: 실제 큐로 하루를 돌린 뒤 `Σ revenueManwon === netProfitDeltaManwon`.
3. **`recordDay` 통합**: `completeReceiving` 후 `ledgerDays[last].deptStats`가 채워진다.
4. **`deptLedgerLines`**: 1일 → `fixedManwon = round(주간/7)` / 7일 → ×7 / 정렬 = departments 순서 / 미채용 과 줄 없음.
5. **불변식 I-B**: 7일 완주 상태에서 `Σ netManwon === Σ ledgerDays.netProfitManwon` (오차 0).
6. **게이트**: `npx vitest run` + **`npx tsc --noEmit`**(vitest는 타입을 안 본다 — 메모 vitest-no-typecheck-tsc-gate) + 기존 전 테스트 무회귀.
7. **브라우저 검증**: 하루 마감·주간 마감 실제 렌더 스크린샷(모바일 375px 포함 — 4열 성립 여부 실측).

## 6. 구현 파일 목록 (예상)

| 파일 | 변경 |
|---|---|
| `src/game/receiving.ts` (또는 신규 `src/game/deptLedger.ts`) | `deptDayStats` · `DeptDayStats` — receiving.ts가 이미 47K라 **신규 모듈 권장**(handlingDept·callDelta 임포트, 순환 없음: doctor.ts와 receiving.ts는 type-only 관계 유지 확인) |
| `src/game/deptLedger.ts` (신규) | `deptLedgerLines` · `DeptLedgerLine` |
| `src/game/session.ts` | `DayRecord.deptStats` 필드 + `recordDay` 한 줄 |
| `src/components/DeptLedgerTable.tsx` (신규) | 표 컴포넌트 |
| `src/components/DayEnd.tsx` | 표 삽입 + props 확장 |
| `src/components/WeekSummary.tsx` | 표 삽입 + props 확장 |
| `src/components/SessionClient.tsx` | 두 화면에 lines(또는 hospital) 전달 |
| 테스트 | `deptLedger.test.ts` 신규 + `session.test.ts` 통합 1케이스 |
