---
tags:
  - type/spec
---

# 설계 스펙 — 의사 개인 유닛 (담당 환자 수 · 피로도 표시 레이어)

> **상태**: 확정 설계 (2026-07-20, brainstorming). 다음 = writing-plans로 구현 계획.
> **맥락**: 지금 의사는 과별 **숫자**(`SetupChoices.doctors`)일 뿐이고 개인 엔티티도 피로 개념도 없다([setup.ts](../../../src/game/setup.ts) · [types.ts](../../../src/game/types.ts)). 부하는 병원 단위(하루 콜 5 vs 자리 3)로만 표현된다. 이 스펙은 채용 인원수를 **이름 붙은 의사 개인**으로 태우고, 플레이 중 각자의 **담당 환자 수 + 피로도**를 보여주는 **순수 표시 레이어**를 얹는다. 판정·경제·생사는 무변경(0 침습).
> **주제 근거**: `player-is-multivantage-not-just-doctor` 메모(경영자 vantage) · [game-show-dont-tell 메모]. 이 레이어는 "문제는 개인이 아니라 시스템"과 충돌하지 않는다 — **시스템의 부하가 개인의 몸에 남기는 자국**을 보이게 해 그 논지를 강화한다.

---

## 1. 목적 & 스코프

### 문제
이벤트·경제·부하는 다 돌아가는데, 플레이어가 **개인 단위의 부하를 느낄 창구가 없다**. "하루 콜 5 vs 자리 3"은 병원 총량 추상값이라, 미용 무풍지대와 순환기 붕괴의 대조가 **숫자 뒤에 숨는다**. 채용은 +/− 카운터라 내가 뽑은 게 "사람"이라는 감각도 없다.

### 목표
- 채용한 인원수를 **개인 의사 유닛**(이름·과)으로 만든다.
- 플레이 중 각 의사의 **오늘 담당 환자 수**(실수치)와 **피로도**(상대 막대)를 보여준다.
- 미용 의사(응급 0, 꿀) vs 순환기 의사(STEMI 도배, 레드존)의 **대조가 눈에 보이게** 한다.

### 스코프 (v1 = 이 스펙)
- ✅ `Doctor` 엔티티 + 개원 시 명단 materialize + 결정론 자동 명명.
- ✅ 담당 환자 수 파생(받은 콜 → 담당 과 → 그 과 의사들이 분담).
- ✅ 피로도 누적(주 간 유지) + 야간 가중 + 야간 회복.
- ✅ RECEIVING 화면에 의사 명단 스트립 1개.

### 스코프 밖 (⏸ 의도적 보류)
- ⏸ **피로도가 판정을 바꾸는 것** — brainstorming에서 "일단 보여주기만"으로 확정. 승격 문은 열어 두되(§7) 이 슬라이스 밖.
- ⏸ setup(SetupWizard) 상호작용 재설계 — "setup 유지"로 확정. 채용은 지금 +/− 카운터 그대로.
- ⏸ DAY_END/WEEK_SUMMARY 전용 의사 화면 — v1은 RECEIVING 스트립 하나만.
- ⏸ 개인차(배경·특성·결함/트레이드오프) — 사용자가 명시적으로 원치 않음(림월드를 그대로 빼다 박지 않음).

---

## 2. 확정 결정 (brainstorming 4-fork)

| # | 결정 | 채택 | 기각한 대안 |
|---|---|---|---|
| A | 피로도 성격 | **보여주기만** (판정 0 침습) | 결과도 바꿈(라지·정답퍼즐 위험·헌법 마찰) / 파생+약한 악순환 |
| B | 유닛 모델 | **개인 유닛 + setup 유지** (개원 때 자동 생성·명명) | setup도 명단식(SetupWizard 전면 개수) / 과 단위 게이지 |
| C | 피로도 호라이즌 | **주 간 누적·유지** (갈려나감 서사) | 매일 리셋(그림 안 됨) |
| D | 표면 | **RECEIVING 명단 스트립 1개** | DAY_END 전용 화면 |

담당 수 = **실제 받은 콜 count(정직)** / 피로도 = **상대 막대(예시적, 부호·방향만 정직)**.

---

## 3. 데이터 모델

### 3.1 `Doctor` 엔티티 (types.ts 신설)
```ts
export interface Doctor {
  id: string        // 'doc-CARDIOLOGY-1' 등 — 결정론 고유
  name: string      // 자동 생성 한글 이름 ('김민준' 등)
  dept: DeptKey     // 소속 과 (수익과 + 필수과)
}
```

### 3.2 명단 materialize (setup.ts)
```ts
// choices.doctors( 과→수 ) → 개인 유닛 배열. 결정론(RNG 0).
export function materializeRoster(choices: SetupChoices, departments = DEPARTMENTS): Doctor[]
```
- 각 과의 인원수만큼 유닛 생성. `id = 'doc-<dept>-<i>'`(1-based), `dept = 과 key`.
- **명명**: 성 풀 + 이름 풀에서 **전역 순번(전체 의사 인덱스)** 으로 골라 결정론. 같은 세션·같은 선택 → 항상 같은 이름. 중복 최소화를 위해 성/이름 인덱스를 서로 다른 보폭으로 진행(§3.4).
- `buildHospital`이 이걸 호출해 `hospital.roster`에 실어 나른다.

### 3.3 `Hospital.roster` (types.ts)
```ts
export interface Hospital {
  // ... 기존 필드 ...
  roster?: Doctor[]   // 개인 유닛 명단. 선택 필드(기존 테스트 병원은 생략 → 표시 레이어만 스킵)
}
```
- **선택 필드**인 이유: 기존 판정 테스트가 만드는 병원(roster 없음)은 그대로 통과해야 한다. roster는 표시에만 쓰이고 판정 경로(adjudicate·hardlockReason)는 절대 안 읽는다.

### 3.4 명명 풀 (labels.ts 또는 신규 doctor-names.ts)
- 성 풀(예: 김·이·박·최·정·강·조·윤·장·임 …), 이름 풀(예: 민준·서연·도윤·하은 …) — 각 ≥ 10개.
- 전역 인덱스 `k`(0-based)에 대해 `성 = 성풀[k % 성풀.len]`, `이름 = 이름풀[(k*7 + k/성풀.len) % 이름풀.len]` 류로 **결정론·저충돌**. 정확한 식은 플랜에서 확정하되 **RNG·Date 금지**.

---

## 4. 담당 환자 수 (파생 — 정직한 count)

### 4.1 콜 → 담당 과 매핑 (신규 const)
`patient.requiredSpecialty`는 미용·검진·일반응급에서 **명목값**이라 그대로 못 쓴다(walkin=CARDIOLOGY 명목). 담당 과 전용 매핑을 둔다:

`COSMETIC_WALKIN`은 kind만으론 미용/검진을 못 가른다(둘이 한 kind, 라벨로만 구분) → **kind 고정 매핑 + 워크인 전용 라벨 판별**로 분리한다. 담당 과를 구하는 단일 함수 `handlingDept(call)`를 두고, 그 안에서 갈래를 처리한다:

```ts
// kind만으로 담당 과가 정해지는 5종.
const HANDLING_DEPT: Record<Exclude<CallKind, 'COSMETIC_WALKIN'>, DeptKey> = {
  STEMI: 'CARDIOLOGY',
  OBSTETRIC_EMERGENCY: 'OBSTETRICS',
  NEURO_EMERGENCY: 'NEUROSURGERY',
  TRAUMA_EMERGENCY: 'GENERAL_SURGERY',
  GENERAL_EMERGENCY: 'GENERAL_SURGERY', // 명목상 외과 배정(외과 미채용 시 아무 유닛에도 안 붙음 — §4.3)
}

// 받은 콜 한 통을 어느 과 의사가 짊어지나. requiredSpecialty의 명목값 함정을 피한 단일 출처.
export function handlingDept(call: IncomingCall): DeptKey {
  return call.kind === 'COSMETIC_WALKIN' ? walkinDept(call.label) : HANDLING_DEPT[call.kind]
}
```

### 4.2 미용·검진 판별 (워크인 전용)
`COSMETIC_WALKIN`의 라벨 풀은 `['보톡스 상담 워크인', '검진 패키지 문의']`. 라벨로 `AESTHETICS` vs `CHECKUP`를 가르는 순수 함수:
```ts
export function walkinDept(label: string): DeptKey  // 라벨에 '검진' 포함 → 'CHECKUP', 아니면 'AESTHETICS'
```
- ⚠️ 라벨 문자열 커플링이라 fragile. 하지만 표시 전용이고 라벨은 [receiving.ts](../../../src/game/receiving.ts) `CALL_LABELS`의 단일 출처라 허용. 라벨이 바뀌면 이 함수도 함께 바뀐다(테스트가 잡는다).

### 4.3 유닛별 담당 수 (순수 함수)
```ts
// receiving 상태(받은 콜들) + roster → 각 의사 id의 오늘 담당 환자 수.
export function doctorCaseloads(roster: Doctor[], receiving: ReceivingState): Map<string, number>
```
- `receiving.log`에서 **받은(accepted) 콜만** 골라 `handlingDept(call)`로 담당 과를 구하고(§4.1), 그 과 유닛들에 **라운드로빈으로 1씩** 분배(가장 적게 받은 유닛부터 — 균등).
- 담당 과에 채용된 유닛이 **없으면** 그 콜은 어디에도 안 붙는다(예: 외과 0인데 일반응급 수용 — 병상만으로 받았으므로 특정 의사 부재. 정직).
- **실시간**: 콜을 받을 때마다 `receiving.log`가 자라므로 이 함수 재호출로 카드가 즉시 갱신된다.

---

## 5. 피로도 (상대 막대 — 주 간 누적)

### 5.1 상태 위치
피로도는 **파생이되 stateful**하다(누적하려면 저장해야 한다). `SessionState`에 유닛별 피로 맵을 둔다:
```ts
export interface SessionState {
  // ... 기존 ...
  fatigue: Record<string, number>  // doctorId → 피로도(0~100 클램프). startSession에서 {}.
}
```
- roster에 직접 안 얹는 이유: roster는 `Hospital`(정적 정체성)이고 피로는 **시간에 따라 변하는 세션 상태**라 층이 다르다. `completeReceiving`(하루 마감)에서 갱신한다.

### 5.2 갱신 규칙 (하루 마감 시, 순수 함수)
```ts
// 하루 담당 수(주간/야간 가중) 더하고, 야간 회복 빼고, 0~100 클램프.
export function stepFatigue(
  prev: Record<string, number>,
  caseloads: Map<string, number>,   // 오늘 유닛별 담당 수
  nightCaseloads: Map<string, number>, // 그중 야간 콜 수
): Record<string, number>
```
- 규칙(예시적 — 판정 안 바꾸니 각색 억의 거짓정밀도 함정 무관, **부호·방향만 정직**):
  - 주간 담당 1건당 `+FATIGUE_PER_CASE`(예 18), 야간 담당 1건당 추가 `+FATIGUE_NIGHT_EXTRA`(예 +12).
  - 하루 끝 회복 `−FATIGUE_REST`(예 −20). 순변화 = 담당가중 − 회복.
  - `Math.max(0, Math.min(100, ...))` 클램프.
- **방향 정직성**(테스트로 고정): 담당 많을수록 ↑, 의사 적을수록(분담 안 됨) ↑, 야간 있을수록 ↑, 무부하 날엔 회복으로 ↓. 상수값은 예시(임상수치 주장 아님).
- **주 간 유지**: `nextWeek`이 `fatigue`를 리셋하지 않는다(병원·roster처럼 이월). `completeSetup`/`startSession`만 `{}`.

### 5.3 야간 담당 수
`receiving.queue[i].nightShift`가 야간 표식. `doctorCaseloads`와 같은 분배를 **야간 콜만**으로 한 번 더 돌려 `nightCaseloads`를 만든다(같은 라운드로빈 함수 재사용).

---

## 6. UX — RECEIVING 명단 스트립

- **위치**: `ReceivingPhase.tsx` 안, 콜 카드 영역 곁(위 또는 아래)에 의사 명단 스트립.
- **의사 카드 1장**: `이름` · `과 라벨` · `오늘 담당 N명` · `피로 막대`(0~100, 색: 저=녹/중=황/고=적). 배경·특성 없음.
- **정렬**: 필수과 먼저(붕괴가 보이는 쪽) → 수익과. 같은 과는 유닛 순번.
- **실시간**: 콜 수용마다 담당 수 갱신(피로는 하루 마감에 갱신되므로 낮 동안은 어제까지 누적치 고정 — 이게 맞다: 오늘 담당은 실시간, 피로는 하루 단위 스텝).
- roster 없으면(구형 병원) 스트립 미표시 — 옵셔널.
- 컴포넌트는 **브라우저 검증**(관례: 게임 로직만 유닛테스트, 컴포넌트는 실측).

---

## 7. 헌법 준수 · 정직한 천장

### 0 침습 (불변식)
- `adjudicate.ts`·`hardlockReason`·`decide`의 판정/경제 경로는 **한 줄도 안 바뀐다**. roster·fatigue는 표시 계산에만 쓰인다.
- 기존 판정·경제 테스트 **전부 그대로 green**(roster 옵셔널이라 구형 병원 무영향).
- 손익·생사·소송·신문 = 무변경. 이 레이어는 legibility뿐.

### show-don't-tell
- 카드에 해석 카피 없음(숫자·막대만). "과잉 노동" 같은 설명 금지 — 플레이어가 대조를 스스로 읽는다.

### 정직한 천장
- 피로도는 **아무것도 안 바꾼다**. 그래서 "휴식 최적화 퍼즐"이 생기지 않는다(정답-퍼즐 방지 유지).
- 승격 경로: 나중에 `hardlockReason`/`adjudicate`가 `fatigue`를 읽어 임계 초과 시 판정 악화 → "결과도 바꿈"(보류한 문). 지금 `fatigue`를 SessionState에 두고 하루 단위로 갱신하는 구조가 그 승격을 그대로 받는다.

---

## 8. 테스트 (TDD)

순수 게임 로직만 유닛테스트(관례: [vitest-no-typecheck-tsc-gate 메모] — `tsc --noEmit`도 게이트):

- `materializeRoster`: 과별 수만큼 유닛, id 형식, 결정론(같은 입력 → 같은 이름), 0명 과는 유닛 0.
- `walkinDept`: '검진' 라벨 → CHECKUP, 그 외 → AESTHETICS.
- `doctorCaseloads`: 받은 콜만 계상(거절·하드락 제외), 담당 과 분배 균등, 담당과 미채용 콜은 무배정, 실시간(로그 성장에 따라 증가).
- `stepFatigue`: 담당 많을수록 ↑, 야간 가중, 무부하 회복 ↓, 0~100 클램프, 주 간 누적(리셋 안 됨).
- **회귀 가드**: 기존 판정/경제 테스트 무변경 통과 + `tsc --noEmit` 0.

컴포넌트(ReceivingPhase 스트립)는 브라우저 실측: 개원 후 콜 수용 시 담당 수 증가, 피로 막대 렌더, 콘솔 0 에러.

---

## 9. 파일 영향

| 파일 | 변경 |
|---|---|
| `src/game/types.ts` | `Doctor` 인터페이스, `Hospital.roster?` 추가 |
| `src/game/doctor.ts` (신규) | `materializeRoster`·명명 풀·`HANDLING_DEPT`·`walkinDept`·`doctorCaseloads`·`stepFatigue` |
| `src/game/setup.ts` | `buildHospital`이 roster materialize |
| `src/game/session.ts` | `SessionState.fatigue`, `completeReceiving`에서 `stepFatigue`, `nextWeek`은 이월·`completeSetup`은 `{}` |
| `src/components/ReceivingPhase.tsx` | 의사 명단 스트립 렌더 |
| `src/components/DoctorRoster.tsx` (신규 가능) | 스트립·카드 컴포넌트 |
| 각 `*.test.ts` | 위 순수 함수 TDD |

세부 코드·단계는 writing-plans에서 확정한다.
