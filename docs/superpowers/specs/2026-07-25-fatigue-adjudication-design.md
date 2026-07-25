---
tags:
  - type/spec
---

# 설계 스펙 — 피로 승격 (피로가 판정을 먹는다)

> **상태**: 확정 설계 (2026-07-25, brainstorming). 다음 = writing-plans → 구현.
> **맥락**: [의사 개인 유닛 스펙](2026-07-20-doctor-roster-visualization-design.md) §7이 열어 둔 **승격 문**을 연다. 그 슬라이스는 피로를 *"아무것도 안 바꾸는"* 순수 표시 레이어로 못박았고([session.ts](../../../src/game/session.ts) `fatigue` 주석: *"표시 전용·판정 무관"*), 그 자리에 승격 경로를 남겼다 — *"나중에 adjudicate가 fatigue를 읽어 판정 악화"*. 이 스펙이 그 경로를 실행한다.
> **주제 근거**: 시스템의 부하가 개인의 몸에 남기는 자국이 **되돌아와 시스템의 처리량을 깎는다**. 피로는 이제 장식이 아니라 원인이다.

---

## 1. 목적 & 스코프

### 문제
피로 막대는 8개월째 **아무것도 안 한다**. 레드존 순환기 의사와 0인 미용 의사가 나란히 있지만, 그 대조는 화면에만 있고 다음 날 병원에 아무 흔적도 남기지 않는다. 부하 → 피로 → (아무것도 없음)에서 인과가 끊긴다.

### 목표
- 피로가 **진료 소요시간을 늘려** 그 의사의 처리량을 깎는다 — 부하가 다음 날 부하를 키우는 악순환이 창발한다.
- 대응 수단은 **기존 레버뿐**(채용해서 분산 / 덜 받기). 새 조작을 만들지 않는다.
- 침식은 **조용하다** — 임계 벽·경보·해석 카피 없이, 이미 있는 표면(점유 시각·대기·맵)이 길어지는 것으로만 드러난다.

### 확정 결정 (brainstorming 3-fork)

| # | 결정 | 채택 | 기각한 대안 |
|---|---|---|---|
| A | 체감 템포 | **조용한 침식** (연속 배율) | 임계의 벽(레드존 직전 굴리기 최적화 유발) / 침식+포화 벽(스코프 과대) / 주 단위 압력(승격 취지에서 멂) |
| B | 대응 레버 | **기존 레버만** (채용·거절·범프) | 강제 휴무 지정(휴무 로테이션 퍼즐 발생) / 주말 회복 강화(주 간 누적 서사 약화) |
| C | 기전 | **진료가 느려진다** (`occupiedUntilMin` 합류) | 회복 간격 패딩(빈 침대인데 바쁜 시각적 거짓말) / 처리량 캡(은퇴시킨 개수 벽으로 회귀) |
| D | 흉부외과 | **이번에도 보류** | 콜 스트림 신설(F4 절단 근거 유효 — [T-049](../../../claude-docs/troubleshooting/T-049.md)) |
| E | 부하 척도 | **시간 × 강도** (표준강도분 — 구현 중 실측 반박으로 추가 결정, §2-3) | 건수(첫날 포화 유물, §2-1) / 시간 단독(많이 보는 과가 갈린다 — 미용이 D2 포화·필수과 0, §2-3) |
| F | 분담 핀 | **감속 지대 밖**(2인 분담 ≤ 34 미진입 + 주중 회복) | 당일 완전 0(solo "주 후반 60+"와 상수 하나로 양립 불가가 실측으로 증명 — 당직을 나눠도 밤은 밤이라 0이 아닌 게 정직) |

### 스코프 밖 (⏸ 의도적 보류)
- ⏸ **흉부외과 콜 스트림** — 콜이 없어 담당 0·피로 0인 건 현 구성에서 여전히 정직하다.
- ⏸ **사직·이탈** — 피로 포화가 인력 제로섬([system.ts](../../../src/game/system.ts))과 만나는 다음 승격 후보. 이번엔 안 닿는다.
- ⏸ **소송·생사 연동** — "개인의 실수" 프레임 위험([character-design.md](../../concept/character-design.md) §43 *"의사는 개인이 아니라 자리 하나"*). 피로는 **속도**만 건드리고 **결과의 옳고 그름**은 안 건드린다.
- ⏸ **새 레버**(강제 휴무 등) — 결정 B.
- ⏸ **주간 결산·성장 화면의 피로 요약** — 표시 확장은 별도 슬라이스. 이번 표면은 RECEIVING뿐.
- ⏸ **하루 안(intraday) 피로 변화** — 하루 단위 스텝 유지(§4-3).

---

## 2. 선결 문제 — 승격 전에 고쳐야 할 전제 2개

**이 둘을 안 고치고 배율만 얹으면 설계가 의도대로 작동하지 않는다.** 승격은 이 수리를 포함한다.

### 2-1. 피로 상수가 유물이다 (건수 기반 → 시간 기반)

`FATIGUE_PER_CASE = 18`은 **하루 콜 5통 시대**(2026-07-20)의 튜닝이다. 그 뒤 콜 제한이 폐지되면서([receiving.ts](../../../src/game/receiving.ts) `outpatientForBeds` = `beds × 20`) 하루가 **62~142명**이 됐다. 지금 바쁜 미용 의사는 담당 십수 명 × 18이라 **개원 첫날에 이미 100 포화**다 — 막대가 전부 빨강이고, 이 상태로 배율을 얹으면 "조용한 침식"이 아니라 **2일차부터 전원 최대 감속**이 된다.

근본 원인은 단위 불일치다: **건수는 부하의 대리물일 뿐**이고, 보톡스 30분 워크인 한 건과 뇌수술 180분 한 건이 같은 18을 매긴다. 시간 기반 하루 루프([daysim.ts](../../../src/game/daysim.ts))가 이미 **점유 분**이라는 정직한 부하 척도를 갖고 있으므로, 피로 입력을 그리로 옮긴다(§4-1).

### 2-2. 피로 장부가 판정 장부와 다른 책이다

피로 적립([doctor.ts](../../../src/game/doctor.ts) `doctorCaseloads`)은 **표시용 라운드로빈**으로 콜을 그 과 의사들에게 균등 분배한다. 그런데 실제 점유 배정은 [receiving.ts](../../../src/game/receiving.ts) `decide`의 `pickAssignee`(busyUntil 최소)라 **다른 규칙**이다. 표시 전용일 땐 무해했다 — 균등 분배가 오히려 카드 숫자를 안정시켰다.

판정을 먹이는 순간 이게 거짓이 된다: **막대가 A 의사를 지목하는데 실제로 느려지는 건 B 의사**일 수 있다. 인과의 가시화가 이 레이어의 존재 이유인데 그 인과가 어긋난다. 수용 로그에 **실제 담당의와 실제 점유 종료 시각**을 남겨 한 책으로 통일한다(§3-1).

> 같은 수리로 기존 버그 하나가 함께 잡힌다: [CallCard.tsx:237](../../../src/components/CallCard.tsx)의 점유 미리보기가 `start + durationMin`을 직접 계산해 **베테랑 `speedFactor` ×0.8이 빠져 있다**. `occupiedUntilMin`이 *"점유 계산의 유일한 자리"*라고 선언했는데(daysim.ts 주석) 이 한 곳이 그 계약 밖에 있었다. 배율이 붙으면 어긋남이 커지므로 이번에 합류시킨다.

### 2-3. 시간 단독도 틀렸다 — "많이 보는 과가 갈린다" (구현 중 실측 반박 → 결정 E)

§2-1의 첫 처방은 "건수 대신 **점유 분**"이었다. 구현해서 7일을 실측하자 그것도 반박됐다: 콜 제한 폐지 후 하루 62~142명은 전부 외래(미용·검진)로 가고 응급은 2~4통뿐이라, **미용 1인이 워크인으로 600분을 채워 2일차에 포화하고 순환기는 주 내내 0**이었다. 시간만 재면 "많이 보는 과가 갈린다"는 엉뚱한 이야기가 된다.

빠진 축은 **강도**다(사용자 지적): 미용은 예약제 루틴 시술이라 진료 하나하나가 의사에게 큰 부담이 아니고 야간 당직도 없다. 필수의료는 생사·집중·체력이다. 보톡스 1분과 응급 PCI 1분은 같은 무게가 아니다. 이 축은 이 게임이 이미 딛고 선 근거와 연결된다 — 상대가치점수의 **"업무량"이 정확히 시간 × 강도**(정신적 노력·스트레스·기술)다([fee-schedule 리서치](../../research/fee-schedule-and-subsidies.md)).

그래서 부하 척도를 **표준강도분 = 점유 분 × 강도 계수**로 확정했다(§4-1). 이 비대칭이 이 게임의 논지를 피로 축에서 완성한다: **같은 시간을 일해도 필수의료가 더 갈리는데, 장부의 흑자는 미용이 가져간다** — 피로 막대(순환기 빨강·미용 저지대)와 과별 손익 영수증(미용 흑자·순환기 적자)이 한 화면에서 반대로 갈린다. 워라밸과 저수가, 필수의료 이탈의 두 원인이 동시에 보인다.

---

## 3. 데이터 모델

### 3-1. 로그가 실제 배정을 기록한다 (receiving.ts)

```ts
log: {
  callId: string
  accepted: boolean
  disposition: CallDisposition
  reason: RejectionReason | null
  startMin?: number
  assigneeId?: string  // 신설 — 실제로 이 콜을 맡은 의사(pickAssignee 결과)
  endMin?: number      // 신설 — 실제 점유 종료 시각(occupiedUntilMin 결과)
}[]
```

- **수용 엔트리에만** 실린다. 미수용·BUMPED 엔트리엔 `undefined`.
- 점유 분 = `endMin − startMin`. **재계산이 아니라 기록**이다 — `decide`가 실제로 쓴 값 그대로라 파생이 판정과 어긋날 여지가 구조적으로 없다.
- `applyBump`은 밀린 예약 엔트리를 `accepted:false`로 되돌리며 이 두 필드도 지운다(현행 `startMin: undefined` 처리와 같은 자리). **중단된 예약의 부분 점유는 계상하지 않는다** — 단순화이고, 범프는 드물다.
- 모든 수용 엔트리에 assignee가 반드시 있다: `effectiveAccept`는 `canStart`를 요구하고, `canStart`는 그 과에 의사가 존재함을 뜻한다. (병상 시대의 *"미채용 과인데 수용"* 경로는 이미 사라졌다.)

### 3-2. 하루 피로 스냅샷 (receiving.ts)

```ts
export interface ReceivingState {
  // ... 기존 ...
  /** 오늘 아침 유닛별 피로(0~100) — 하루 안에서 불변. 점유 계산이 이걸 읽는다. */
  fatigueAtOpen: Record<string, number>
}
```

`initReceiving(hospital, queue, boardedBusyUntil, fatigueAtOpen = {})` — 네 번째 선택 인자. **기본값이 빈 맵이라 안 넘기는 기존 호출부·테스트는 전부 현행 동작 그대로다**(불변식 F-0, §6).

**왜 스냅샷인가**: 피로는 하루 단위로 스텝된다(기존 계약 — 막대가 낮 동안 고정인 이유). 하루 안에서 실시간으로 변하게 하면 ⓐ 같은 콜이 아침·저녁에 다른 소요를 갖고 ⓑ 막대와 실제 감속이 또 어긋난다(§2-2의 재발). 아침 값으로 고정하면 **막대에 보이는 그 값이 오늘 하루의 배율**이다.

### 3-3. 세션 배선 (session.ts)

| 지점 | 넘기는 값 | 뜻 |
|---|---|---|
| `completeSetup` | (생략 → `{}`) | 개원 첫날은 전원 쌩쌩 |
| `advanceDay` | `state.fatigue` | `completeReceiving`이 방금 스텝한 어제까지의 누적 |
| `beginWeek` | `state.fatigue` | 주 간 이월(리셋 없음 — 기존 계약 유지) |

`SessionState.fatigue`의 *"표시 전용·판정 무관"* 주석은 이 스펙에서 폐기되고 판정 반영으로 고쳐 쓴다.

---

## 4. 기전

### 4-1. 피로 입력 — 표준강도분 (점유 시간 × 강도, 결정 E)

**강도 계수** — 축의 근거는 상대가치점수 "업무량"(시간 × 강도)이고, 값은 예시(임상 주장 아님):

```ts
export const FATIGUE_INTENSITY: Record<CallKind, number> = {
  COSMETIC_WALKIN: 0.3,      // 예약제 루틴 — 저강도
  SPECIALIST_ELECTIVE: 1.0,  // 외래+검사 — 기준선
  MEDICAL_EMERGENCY: 1.5,    // 입원·수액 — 응급이되 수술 아님
  STEMI: 2.0, OBSTETRIC_EMERGENCY: 2.0, NEURO_EMERGENCY: 2.0,
  TRAUMA_EMERGENCY: 2.0, ABDOMINAL_EMERGENCY: 2.0, // 응급 수술·시술급 — 생사·집중
}
```

`doctorCaseloads`가 로그의 `assigneeId`로 접어 세 값을 함께 낸다(하나의 파생 = 한 책):

```ts
export function doctorCaseloads(roster: Doctor[], receiving: ReceivingState): {
  total: Map<string, number>     // 담당 건수 — 명단 스트립 표시용(기존 소비처 유지)
  loadMin: Map<string, number>   // 표준강도분 = Σ (endMin − startMin) × 강도
  nightLoad: Map<string, number> // 야간 콜 강도 합 — 야간의 무게도 일의 강도에 비례
}
```

`nightLoad`가 강도 합인 덕에 **"미용은 야간 당직이 없다"가 별도 분기 없이 표 하나에서 나온다** — 야간 STEMI +2.0, 저녁 보톡스 +0.3. 모든 유닛을 0으로 초기화하는 현행 계약은 유지한다(콜 0인 유닛도 카드에 0으로 뜬다).

**새 스텝 공식** ([doctor.ts](../../../src/game/doctor.ts) `stepFatigue`):

```
delta = round(max(0, loadMin − FATIGUE_FREE_MIN) / 60 × FATIGUE_PER_OVER_HOUR
            + nightLoad × FATIGUE_NIGHT_EXTRA)
      − FATIGUE_REST
next  = clamp(0, FATIGUE_MAX, prev + delta)
```

| 상수 | 값 | 뜻 |
|---|---|---|
| `FATIGUE_FREE_MIN` | 160 | 이 부하까지는 정상 근무 — 델타 0. 단위가 **표준강도분**임에 주의(⚠️ [T-079](../../../claude-docs/troubleshooting/T-079.md) — raw 분 감각으로 잡으면 사문화된다) |
| `FATIGUE_PER_OVER_HOUR` | 15 | 초과 부하 1시간당 피로 |
| `FATIGUE_NIGHT_EXTRA` | 12 | 야간 콜 강도 1.0당 추가 |
| `FATIGUE_REST` | 20 | 하루 회복 (기존값 유지) |
| `FATIGUE_MAX` | 100 | 상한 (기존값 유지) |

`FATIGUE_PER_CASE = 18`은 **은퇴했다**(§2-1). 방향성 계약(부하 클수록 ↑ · 야간은 강도 비례 가중 · 한가한 날 ↓ · 클램프 · 주 간 누적)은 기존 테스트에서 그대로 이어진다.

**실측 곡선**(2026-07-25, 전부 수용 7일 결정론 시뮬 — 위 상수로 확정):

| 시나리오 | D1 | D2 | D3 | D4 | D5 | D6 | D7 |
|---|---|---|---|---|---|---|---|
| 순환기 1인 (+미용1) | 52 | 94 | 93 | 100 | 100 | 94 | 78 |
| 순환기 1인 **2주차**(이월) | 100 | 82 | 82 | 95 | 100 | 95 | 100 |
| 순환기 2인 (#1/#2) | 20/16 | 10/8 | 0/4 | 0/0 | 3/0 | 0/0 | 0/4 |
| 미용·검진 (1인이든 완편이든) | ≤1 | 0 | 0 | 0 | 0 | 0 | 0 |

- **1인 필수과**: D1부터 감속 지대(34+), D2부터 60+, 2주차엔 이월로 82 밑으로 안 내려간다 — 주가 갈수록 더 갈린다(갈려나감 서사 = 이 기능의 존재 이유).
- **2인 분담**: 최대 20으로 감속 지대(34) 밖, 주중 회복 — 단 야간 몫이 있어 0은 아니다(결정 F).
- **미용·검진**: 무풍. 600분을 꽉 채워도 강도 0.3이면 표준강도분 200이라 문턱 아래.

즉 대조의 레버가 **채용**이 된다. "채용이 곧 처리량이고 처리량이 곧 흑자"(receiving.ts)에 **"채용이 곧 회복"**이 겹친다.

### 4-2. 판정 합류 — 배율 한 자리

```ts
export const FATIGUE_SLOW_FROM = 34   // 막대 '중' 경계 — 여기까지는 배율 1.0
export const FATIGUE_RED = 67         // 막대 '고' 경계
export const FATIGUE_SLOW_MAX = 0.5   // 포화(100)에서 +50%

export function fatigueSlowFactor(f: number): number {
  return 1 + FATIGUE_SLOW_MAX * Math.max(0, f - FATIGUE_SLOW_FROM) / (FATIGUE_MAX - FATIGUE_SLOW_FROM)
}
```

- 34 이하 → **정확히 1.0**. 정상 근무는 무영향(임계 벽이 아니라 침식의 시작점).
- 67 → ×1.25 / 100 → ×1.5. 연속·단조증가라 넘는 순간이 없다.
- 경계 34·67은 [DoctorRoster.tsx](../../../src/components/DoctorRoster.tsx) `FatigueBar`의 색 단계와 **같은 상수를 임포트**한다 — 막대 색이 곧 감속 구간이 되고, 두 곳에 숫자를 적어 한쪽이 낡는 병을 막는다.

**합류 지점은 기존 함수 하나뿐이다** ([daysim.ts](../../../src/game/daysim.ts)):

```ts
export function occupiedUntilMin(doc: Doctor, startMin: number, durationMin: number, fatigue = 0): number {
  return startMin + Math.round(durationMin * (doc.speedFactor ?? 1) * fatigueSlowFactor(fatigue))
}
```

- **기본값 0**이라 안 넘기면 `fatigueSlowFactor(0) = 1`로 현행과 완전 동일(F-0).
- 반올림은 **끝에서 한 번**. 베테랑 `speedFactor` ×0.8과 자연 합성된다 — 지친 베테랑이 쌩쌩한 신입과 비슷해지는 질감이 공짜로 나온다.
- 호출부는 `decide`·`applyBump`·`CallCard` 셋이고, 셋 다 `receiving.fatigueAtOpen[assignee.id] ?? 0`을 넘긴다.

### 4-3. 침식이 보이는 곳 — 새 표면 0

새 카피·새 UI·새 사유·새 판정 분기가 **없다**(show-don't-tell). 이미 있는 채널이 길어질 뿐이다:

- **예약 카드 미리보기** — *"수락 시 김민준 · 17:40까지 점유"*의 시각이 늦어진다(§2-2의 버그 수리로 이 줄이 처음으로 진실을 말한다).
- **맵** — 진료가 오래 걸리고 침대가 늦게 빈다(`busyUntil` 파생이라 자동).
- **벽** — `LEFT_WAITING`(기다리다 감)과 점유 하드락(`NO_FREE_SPECIALIST`)이 잦아진다. **판정 우선순위·사유 종류는 0개 변경**이다.
- **장부** — 처리량이 줄어 수익이 준다.

---

## 5. 헌법 준수

- **판정 침습의 정확한 범위**: `adjudicate.ts`는 **한 줄도 안 바뀐다**. `hardlockReason`의 게이트 순서·사유도 무변경. 바뀌는 건 `occupiedUntilMin`이 내는 **숫자 하나**이고, 기존 벽들이 그 숫자를 읽어 자동으로 반응한다.
- **정답-퍼즐 방지**: 새 레버가 없으므로 "휴식 최적화 로테이션" 같은 공략 표면이 생기지 않는다(결정 B). 배율이 연속·단조라 "레드존 직전까지 굴리기" 같은 임계 게이밍도 없다(결정 A). 대응은 채용(금고)과 거절(돌려보낸 환자)뿐이고 **둘 다 이미 대가가 있다**.
- **개인이 아니라 시스템**: 피로는 속도만 바꾸고 판단의 옳고 그름·소송·생사는 안 건드린다. 느려진 의사가 "실수한 의사"가 되지 않는다 — 시스템이 사람을 갈아 처리량을 잃을 뿐이다.
- **결정론**: RNG·Date 0. 같은 seed·같은 선택 → 같은 결과(기존 원칙 유지).

---

## 6. 불변식 & 테스트 (TDD)

### 새 불변식
- **[F-0] 하위호환**: `fatigueAtOpen`이 빈 맵이면 판정·경제 결과가 승격 전과 **완전히 동일**하다. (`occupiedUntilMin`의 기본 인자가 이걸 타입 수준에서 보장한다.)
- **[F-1] 단조성**: 같은 콜·같은 의사에서 피로가 높을수록 점유 종료가 같거나 늦다.
- **[F-2] 장부 일치**: 피로 적립의 담당의 = 실제 점유된 의사(`assigneeId`). 표시 담당 수와 감속 대상이 어긋나지 않는다.

### 기존 불변식 (전부 green 유지)
`[I8-a]` 전부 거절하면 반드시 적자 · `[I8-b]` 부문 손익 ≤ 0 · `[I3]` |STEMI| < |고열감염| · 「양심 경로는 적자」 · `[I-A]` Σ 과별 진료 = netProfitDelta · `[I-B]` Σ 과별 순익 = Σ 일별 순이익. **침식은 처리량을 깎아 수익을 줄이는 방향이라 이 가드들과 방향이 같다.**

### 단위 테스트 (Red 먼저)

| 대상 | 핀 고정할 계약 |
|---|---|
| `fatigueSlowFactor` | 0·34 → 정확히 1.0 · 67 → 1.25 · 100 → 1.5 · 단조증가 |
| `occupiedUntilMin` | fatigue 미전달 = 현행 동일 · speedFactor와 합성 · 반올림 1회 |
| `doctorCaseloads` | `assigneeId` 기반 접기 · loadMin = Σ(endMin−startMin)×강도 · nightLoad = 야간 강도 합 · 미수용 제외 · 범프 중단분 제외 · 전 유닛 0 초기화 |
| `stepFatigue` | 부하↑ → 피로↑ · `FATIGUE_FREE_MIN` 이하 & 야간 0 → 정확히 −REST · 야간은 강도 비례 가중(STEMI 2.0 > 보톡스 0.3) · 0~100 클램프 · 주 간 누적. ⚠️ 입력은 상수 상대값 + 클램프 양쪽에서 마진(하한: 초과 1시간은 회복에 통째로 먹혀 전부 0 — [T-079](../../../claude-docs/troubleshooting/T-079.md)) |
| `decide` / `applyBump` | 수용 엔트리에만 `assigneeId`·`endMin` · 범프 시 두 필드 제거 · `fatigueAtOpen`이 점유 종료를 늦춤 |
| `session` | `advanceDay`가 스텝된 피로를 다음 날 스냅샷으로 · `beginWeek` 주 간 이월 · `completeSetup` 빈 맵 |
| `session` 곡선 핀 | solo: 하루 뒤 > 0 **그리고** 7일 후 ≥ 34(주말까지 감속 지대) · duo: 하루 뒤 0 < v < 34 **그리고** 7일 후 < 34 & max(D7) ≤ max(D1)(주가 갈수록 안 갈린다) — 결정 F의 계약형 핀(절대값 핀 금지: daysim 변경에 부러진다) |

### 실측 (관례: 컴포넌트는 브라우저)
1인 순환기 병원으로 7일 완주 — 주 후반 점유 미리보기가 길어지는지 · 막대 레드존이 그와 동반하는지 · 돌려보냄이 주 초반보다 느는지 · **완편 미용은 저지대를 유지하는지** · 콘솔 에러 0. 게이트: `vitest` 전량 green + `tsc --noEmit` 0 + `next build`.

### 튜닝 계약
§4-1의 상수는 **실측 곡선으로 확정된 값**이다(2026-07-25, 두 차례 재튜닝 이력: 건수→시간→시간×강도는 §2 / FREE 300→160·PER 35→15는 결정 F). 앞으로 곡선을 다시 만질 일이 생기면 `FATIGUE_INTENSITY`·`FATIGUE_FREE_MIN`·`FATIGUE_PER_OVER_HOUR`·`FATIGUE_SLOW_MAX`만 만진다 — 구조·시그니처는 불변. 제약 셋이 울타리다: ① 미용·검진 무풍(< 34) ② solo·duo 곡선 핀(§6) ③ I8 경제 가드.

---

## 7. 파일 영향

| 파일 | 변경 |
|---|---|
| `src/game/doctor.ts` | 상수 교체(`FATIGUE_PER_CASE` 은퇴 → `FATIGUE_FREE_MIN`·`FATIGUE_PER_OVER_HOUR`) · `FATIGUE_INTENSITY`·`FATIGUE_SLOW_FROM`·`FATIGUE_RED`·`FATIGUE_SLOW_MAX`·`fatigueSlowFactor` 신설 · `doctorCaseloads` assigneeId 기반 + `loadMin`·`nightLoad` · `stepFatigue` 새 공식 |
| `src/game/daysim.ts` | `occupiedUntilMin`에 `fatigue = 0` 인자 |
| `src/game/receiving.ts` | `log`에 `assigneeId`·`endMin` · `ReceivingState.fatigueAtOpen` · `initReceiving` 4번째 인자 · `decide`·`applyBump`가 피로 전달 및 기록 |
| `src/game/session.ts` | `advanceDay`·`beginWeek`이 `state.fatigue` 전달 · `fatigue` 주석 갱신(표시 전용 → 판정 반영) |
| `src/components/CallCard.tsx` | 점유 미리보기가 `occupiedUntilMin` 경유(베테랑 버그 수리 + 피로 반영) |
| `src/components/DoctorRoster.tsx` | `FatigueBar` 색 경계를 `doctor.ts` 상수에서 임포트 |
| 각 `*.test.ts` | §6 TDD |
| `claude-docs/plan.md` · `changeLog.md` | ⏸ 승격 문 해제 · 완료 기록 |

세부 단계는 writing-plans에서 확정한다.
