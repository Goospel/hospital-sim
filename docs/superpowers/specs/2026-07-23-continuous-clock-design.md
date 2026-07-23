---
tags:
  - type/spec
---

# 연속 시간 흐름 — RECEIVING을 턴제 점프에서 시뮬레이션으로

> 콜과 콜 사이를 **끊기지 않고 흐르는 시간**으로 바꾸고, 그 시간 동안 병원이 실제로
> 돌아가는 걸 보이게 한다. 게임 판정은 한 줄도 바뀌지 않는다.

## 0. 문제

지금 RECEIVING은 **정지가 기본이고 움직임이 예외**다.

플레이어가 보는 것: 콜 카드가 떠 있고 화면이 멈춰 있다 → 수락/거절을 누른다 →
1.5초 안에 시계가 쌔앵 지나간다 → 다시 멈춘다. 방치형·시뮬레이션이 아니라
**슬라이드쇼**다.

원인은 두 겹이다.

1. **시계가 너무 빠르다.** `FAST_FORWARD_MS_PER_MIN = 4`, `FAST_FORWARD_MS_CAP = 1500` —
   콜 사이 평균 120게임분이 0.48초에 끝난다.
2. **더 근본적으로, 늦춰봐야 아무도 안 움직인다.** 아바타 위치는 `deriveMapScene`이
   `atMin`에서 파생하는데, 자유 의사는 복도 슬롯에 **가만히 서 있다**. 진료가 끝나는
   순간에만 한 명이 방→복도로 이동한다. 시계를 6초로 늘리면 "느려진 정지 화면"이 될 뿐이다.

그리고 셋째, **하루의 끝이 화면에 없다.** 시계는 마지막 콜의 도착 시각(항상 600 미만)에서
멈추고 화면이 마감 요약으로 갈아치워진다 — 플레이어는 19:00을 한 번도 못 본다. 그런데
`session.ts`의 `boardedBusyUntilFrom`은 이미 마감 초과 점유를 계산해 다음 날 아침으로
넘기고 있다. **구현돼 있고, 돌아가고 있고, 아무도 못 본다.**

## 1. 무엇이 바뀌지 않는가 (먼저 못박음)

`src/game/receiving.ts` · `src/game/adjudicate.ts` · `src/game/daysim.ts` ·
`src/game/session.ts` — **0줄**.

`decide()`는 여전히 `clockMin`을 콜의 `arrivalMin`으로 점프시키고, 하드락 판정·점유·경제·
로그·이월이 전부 동일하다. 플레이어가 6초를 보든 즉시 건너뛰든 **같은 입력에 같은 결과**다.

기존 367개 테스트 중 `hospitalMap.test.ts`(30개)만 갱신되고 나머지 337개는 손대지 않는다.

이 슬라이스는 **0 침습 불변식**을 그대로 계승한다: 표시 레이어는 게임 상태를 만들지도
바꾸지도 않는다.

## 2. 시계 — 세 상태

```
[흐름]  atMin: 직전 콜 시각 ─────────→ 다음 콜 도착 시각
   ↓ 도착 (atMin === to)
[정지]  콜 카드 등장. 게임 시계 정지. 배경 모션은 계속
   ↓ 결정 (decide)
[흐름]  다음 구간 …

  마지막 콜 결정 후:
[흐름]  atMin: 마지막 콜 시각 ───────→ dayEndMin(busyUntil)
   ↓
[마감]  하루 요약 화면
```

### 2.1 속도 — 게임 1분 = 50ms, 캡 없음

| 상수 | 지금 | 바뀜 |
|---|---|---|
| `FAST_FORWARD_MS_PER_MIN = 4` | | `MS_PER_GAME_MIN = 50` |
| `FAST_FORWARD_MS_CAP = 1500` | | **삭제** |
| `FAST_FORWARD_STEPS = 12` | | `CLOCK_TICK_MS = 100` (스텝 수는 구간에서 파생) |

결과: 콜 사이 120게임분 → **6초**, 하루 600분 → 30초, 1주 7일 → 3.5분(스킵 안 할 때).

스텝은 100ms 실시간 틱마다 **2게임분**이라 시계 표시가 초당 10번 갱신된다 — 숫자가
"흐르는" 것으로 읽힌다.

**캡을 없애는 이유**: 캡을 남기면 "게임 1분 = 50ms"라는 계약이 긴 구간에서만 깨져
화면 속도가 게임 시간과 어긋난다. 어떤 구간은 6초, 어떤 구간은 같은 길이인데 1.5초가
되는 게 더 나쁘다. 대가는 드문 긴 구간(최대 ~240분 = 12초)이고, 탈출구는 건너뛰기다.

### 2.2 목표 시각 `to`

```
receiving.done === false  →  queue[index].arrivalMin
receiving.done === true   →  dayEndMin(receiving.busyUntil)
  단, queue.length === 0  →  receiving.clockMin   (흐름 없음 — 퇴화 케이스 가드)
```

`dayEndMin`은 **새 숫자를 만들지 않는다** — 이미 `busyUntil`에 있는 값을 읽는다:

```ts
/** 오늘이 실제로 끝나는 시각 — 마감(19:00)과 마지막 진료 종료 중 늦은 쪽. */
export function dayEndMin(busyUntil: Record<string, number>): number {
  return Math.max(DAY_LENGTH_MIN, ...Object.values(busyUntil))
}
```

이 한 줄이 「19시 넘어도 응급실은 계속 진행된다」를 화면에 올린다. 21:30까지 수술한
의사가 있으면 시계가 21:30까지 돌고, 그동안 배경 환자는 0명이고 불은 다 꺼져 있고
**그 방 하나만 켜진 채로 남는다**. 그리고 다음 날 아침 그 의사가 아직 바쁜 건
`boardedBusyUntilFrom`이 이미 하고 있던 일이다 — 이제서야 **이유가 보인다**.

`atMin`이 `DAY_LENGTH_MIN`을 넘어도 아무것도 안 깨진다:
- `lightingAt(atMin)`은 `≥ NIGHT_START_MIN`이면 NIGHT — 초과 구간은 전부 밤(맞다).
- `formatClock`은 `DAY_OPEN_MIN + atMin`을 `% 24`로 접는다 — 750 → 21:30, 정상.
- 상한: `arrivalMin ≤ 599` + `durationMin ≤ 180` = **779**(21:59). 자정을 안 넘는다.

## 3. 움직임 — 두 층으로 나누고 시계와 분리한다

이게 이 설계의 핵심이다. 지금 아바타는 `left`/`top`이 `transition-all`로 걷는데,
그건 **장면이 바뀔 때만** 움직인다.

```
아바타 바깥 div  : left / top   ← atMin (배치)          결정 대기 중 멈춤
아바타 안쪽 div  : transform    ← CSS keyframes         결정 대기 중에도 계속
배경 환자 레이어 : transform    ← CSS keyframes         결정 대기 중에도 계속
```

**바깥이 `left`/`top`, 안쪽이 `transform`** — 두 애니메이션이 같은 속성을 잡으면 이동
중에 배회가 위치를 덮어써 아바타가 튄다. 속성을 갈라야 둘이 합성된다.

CSS 애니메이션이라 **게임 시계가 멈춰도 안 멈춘다.** 플레이어가 콜 카드를 30초 노려보는
동안에도 병원은 돌아간다 — 「방치형」 체감의 실제 출처가 여기다.

### 3.1 유휴 배회 — 기존 아바타

의사·환자 스프라이트가 제자리에서 느리게 흔들린다(수 px). 전원이 같은 박자로 흔들리면
기계처럼 보이므로 아바타마다 지연·주기를 흩는다:

```ts
/** 아바타별 배회 편차 — RNG 0(seededUnit 파생)이라 같은 id는 항상 같은 박자. */
export function wanderTiming(id: string): { delayMs: number; durationMs: number }
//   delayMs    : 0 ~ 1999
//   durationMs : 2600 ~ 4199
```

`hashId(id)`(비공개, 문자열 → 안정 정수)를 `seededUnit`에 먹인다. `Math.random` 금지
원칙을 표시 레이어에서도 지킨다 — 같은 세이브가 같은 화면을 낸다.

### 3.2 배경 환자 — 새 레이어

콜과 무관한 익명 환자들이 복도를 가로질러 지나간다(좌 → 우). 인원은 **조명 하나에서**
파생한다:

| 조명 | 배경 환자 수 |
|---|---|
| `DAY` | 5 |
| `DUSK` | 2 |
| `NIGHT` | **0** |

밤에 텅 비는 것과 소등이 **같은 출처**(`scene.lighting`)에서 나온다 — 두 곳에 밤을
적지 않는다. 야간 응급이 불 꺼지고 아무도 없는 병원으로 들어오는 그림이 여기서 나온다.

```ts
export interface AmbientWalker {
  id: string        // React key. 조명이 바뀌어도 남는 인원은 같은 key를 유지한다
  delayMs: number   // 0 ~ 7999
  durationMs: number // 9000 ~ 15999 (한 번 가로지르는 데 걸리는 시간)
  lane: number      // 0 | 1 | 2 — 복도 안 세로 줄. 컴포넌트가 px로 옮긴다
}
export function ambientWalkers(lighting: Lighting): AmbientWalker[]
```

**`deriveMapScene`에 넣지 않는다.** 배경 환자는 게임 상태에서 파생되는 게 아니라 순수
장식이다. `MapScene.avatars`에 섞으면 (a) 「보이는 것 = 게임이 모델링하는 것」이 깨지고
(b) 기존 30개 테스트가 장식을 검증하게 되고 (c) 복도 슬롯 카운터를 장식이 밀어낸다.
`HospitalMap.tsx` 안의 **별도 레이어**로 두고 `aria-hidden`, 불투명도를 낮춰
침대의 진짜 환자와 구별한다.

### 3.3 `prefers-reduced-motion`

시계는 지금처럼 즉시 점프한다(기존 동작 유지). 배회·배경 환자 애니메이션은
CSS에서 차단한다:

```css
@media (prefers-reduced-motion: reduce) {
  .hm-wander, .hm-walker { animation: none; }
}
```

JS 분기가 필요 없다 — 미디어 쿼리 한 줄이 두 층을 동시에 끈다.

## 4. 콜 카드 — 도착해야 뜬다

```
flowing === true   →  흐름 패널 (마감 대기 문구 + 건너뛰기 버튼)
flowing === false  →  콜 카드 (지금과 동일)
```

흐름 중엔 결정할 게 없으므로 카드가 없다. 그 자리엔 마감 대기 문구와 건너뛰기 버튼만
남는 흐름 패널을 놓는다. **직전 콜 결과**(`prevLine`, 이미 계산되는 값)는 흐름 패널
안이 아니라 패널 행 위의 독립된 줄로 둔다 — 그래야 콜이 도착해 카드로 바뀐 뒤, 즉
플레이어가 다음 결정을 고민하는 동안에도 계속 읽을 수 있다. 맵 스프라이트는 전부
`aria-hidden`이라 이 줄이 스크린리더의 유일한 서술 경로다 — 흐름 패널 안에만 두면
콜이 도착하는 순간 화면에서 통째로 사라져 그 경로가 끊긴다. 그날 첫 콜이라 직전이
없으면 그 줄 자체가 없다.

### 4.1 건너뛰기는 진짜 버튼이다

지금 스킵은 맵을 감싼 `role="presentation"` div의 `onClick`이라 **키보드로 도달할 수
없다**(맵 슬라이스 최종 리뷰의 접근성 Minor). 6초 흐름에선 숨은 클릭 영역이 더더욱
못 찾는 UI라, 흐름 패널에 명시적 `<button>`을 둔다. 맵 클릭도 유지한다 — 같은 핸들러의
두 진입점이고, 키보드 경로는 버튼이 담당한다.

### 4.2 `done` 중 흐름 — 컴포넌트 분해가 필요한 이유

`receiving.done && flowing`인 동안 `queue[index]`는 **`undefined`**다(index === length).
그런데 지금 `ReceivingPhase`는 `call`을 최상위에서 읽어 `reason`·`plea`·`elective`·
`free`·`assignee`를 전부 파생한다 — 그대로 두면 마감 흐름에서 터진다.

→ 콜 패널을 `CallCard.tsx`로 **추출**한다. `call`에서 파생되는 모든 계산이 그 안으로
들어가고, `ReceivingPhase`는 `flowing ? <FlowPanel/> : <CallCard call={call}/>`만 고른다.
345줄짜리 파일에서 별개 책임 하나가 빠지는 거라 구조도 나아진다.

조기 반환도 바뀐다:

```
지금:  if (receiving.done) return <요약/>
바뀜:  if (receiving.done && !flowing) return <요약/>
```

### 4.3 HUD 콜 카운터 클램프

`done` 중 흐름에서 `receiving.index + 1`은 `queue.length + 1`이 된다 — `콜 6 / 5`.
`Math.min(receiving.index + 1, receiving.queue.length)`로 클램프한다.

## 5. 파일과 인터페이스

| 파일 | 변경 |
|---|---|
| `src/game/hospitalMap.ts` | 상수 교체 · `flowDurationMs` · `flowStepCount` · `dayEndMin` · `wanderTiming` · `ambientWalkers` 추가 · `sweepDurationMs` 삭제 |
| `src/game/hospitalMap.test.ts` | 새 함수 테스트 · `FAST_FORWARD_*` 참조 갱신 (TDD Red 먼저) |
| `src/components/useFastForwardClock.ts` → `useHospitalClock.ts` | 개명 + 목표 시각 분기 + `sweeping` → `flowing` |
| `src/components/HospitalMap.tsx` | 배회 래퍼(안쪽 div) + 배경 환자 레이어 |
| `src/app/globals.css` | `@keyframes` 2개 + reduced-motion 차단 |
| `src/components/CallCard.tsx` | **신규** — 콜 패널 추출 |
| `src/components/ReceivingPhase.tsx` | 흐름/정지 분기 · 마감 대기 · 카운터 클램프 |

### 5.1 새 공개 API (`src/game/hospitalMap.ts`)

```ts
export const MS_PER_GAME_MIN = 50
export const CLOCK_TICK_MS = 100

/** 이 구간 재생에 쓸 총 시간(ms). 캡 없음 — 구간 길이에 정비례. */
export function flowDurationMs(from: number, to: number): number

/** 이 구간을 몇 프레임으로 쪼갤지. 항상 1 이상이고 **구간 길이(분)를 넘지 않는다**. */
export function flowStepCount(from: number, to: number): number

/** 오늘이 실제로 끝나는 시각 — 마감과 마지막 진료 종료 중 늦은 쪽. */
export function dayEndMin(busyUntil: Record<string, number>): number

/** 아바타별 유휴 배회 박자(결정론). */
export function wanderTiming(id: string): { delayMs: number; durationMs: number }

/** 조명에서 파생한 배경 보행자 목록(결정론). */
export function ambientWalkers(lighting: Lighting): AmbientWalker[]
```

`sweepMinutes(from, to, steps)`는 **그대로 둔다** — 이미 테스트된 순수 함수이고
`flowStepCount`가 그 `steps` 인자를 채운다.

### 5.2 훅 계약

```ts
export function useHospitalClock(receiving: ReceivingState): {
  atMin: number      // 맵·HUD·명단이 공유하는 단 하나의 시각
  flowing: boolean   // atMin < to
  skip: () => void   // 즉시 to로 점프
}
```

## 6. 테스트

`hospitalMap.test.ts`에 추가(TDD — 실패를 먼저 확인한다):

| # | 무엇 |
|---|---|
| 1 | `flowDurationMs(0, 120) === 6000` · `flowDurationMs(500, 500) === 0` · 역방향(`600 → 500`)도 0 |
| 2 | `flowStepCount(0, 120) === 60` · 구간 1분이면 1 |
| 3 | **중복 프레임 불변식** — 구간 1~300분 전부에서 `sweepMinutes(from, to, flowStepCount(from, to))`에 같은 값이 두 번 안 나온다 |
| 4 | `dayEndMin({}) === 600` · `dayEndMin({a: 300}) === 600` · `dayEndMin({a: 750, b: 300}) === 750` |
| 5 | `wanderTiming` 결정론(같은 id → 같은 값) · 다른 id는 갈린다 · 범위 안 |
| 6 | `ambientWalkers` — DAY 5 / DUSK 2 / NIGHT 0 · 결정론 · `lane ∈ {0,1,2}` · id 고유 |
| 7 | `lightingAt(700) === 'NIGHT'` — 마감을 넘긴 시각도 밤 |

3번은 기존 `sweepMinutes` docstring의 부정확("from 제외"인데 짧은 구간에서 `from`이
반복될 수 있음, 맵 슬라이스 리뷰의 Minor)을 **불변식으로 못박아** 닫는다.
`flowStepCount ≤ 구간 길이`가 보장되므로 반올림 충돌이 구조적으로 불가능하다.

컴포넌트(`HospitalMap`·`CallCard`·`ReceivingPhase`)와 훅은 단위 테스트를 두지 않고
**브라우저 실측**으로 검증한다 — 이 저장소의 기존 경계와 같다.

### 6.1 브라우저 실측 항목

T-064의 교훈을 적용한다: **"이 값이 공식대로인가"가 아니라 "이 요소가 저 요소와 어떤
관계인가"로 쓴다.**

| 확인 | 어떻게 |
|---|---|
| 콜 사이가 실제로 ~6초 | 결정 직후부터 카드 재등장까지 벽시계 측정 |
| 흐름 중 카드가 없다 | 카드 DOM 부재 → 도착 시점에 등장 |
| 결정 대기 중에도 배경이 움직인다 | 카드가 뜬 상태에서 보행자 `getBoundingClientRect().x`가 시간에 따라 변한다 |
| 배회가 이동을 안 깬다 | 방→복도 이동 중 아바타 좌표가 단조 이동(튐 없음) |
| 야간 0명 | NIGHT 진입 후 보행자 DOM 0개 |
| 마감 초과 | 마지막 결정 후 시계가 19:00을 **지나** `max(busyUntil)`에서 멈춘다 |
| 마감 시 켜진 방 | 그 시각에 진료 중인 의사의 방만 아바타를 담고 있다 |
| 건너뛰기 키보드 | Tab → Enter로 스킵 동작 |
| `콜 N / M` 클램프 | 마감 흐름 중 N ≤ M |

## 7. 정직한 천장

| 천장 | 왜 지금 이대로인가 |
|---|---|
| 배경 환자는 게임과 무관한 순수 장식 | 대기줄 길이처럼 "숫자를 말하는" 연출을 넣으면 장부·판정과 어긋나는 **이중 기재**가 된다. 이 저장소가 세 번 경고한 병이다 |
| 배회는 제자리 흔들림, 경로 없음 | 실제 보행 경로엔 길찾기가 필요하고 유닛 ~50개에 과잉(맵 슬라이스의 「직선 이동」 천장 계승) |
| 긴 구간 최대 ~12초 | 캡 대신 건너뛰기로. 캡은 속도 계약을 구간마다 깨뜨린다 |
| 결정 대기 중 게임 시계 정지 | 시간 압박을 안 넣기로 한 결정의 필연. 이 게임의 논지는 개인의 반응속도가 아니라 시스템이라, 고민 시간을 채점하면 논지가 흔들린다 |
| 흐름 패널 ↔ 콜 카드 높이 차로 레이아웃이 밀린다 | 맞추려면 카드 높이를 손으로 찍은 상수가 필요한데, 그게 정확히 T-064가 남긴 함정이다. **먼저 브라우저에서 재고**, 실제로 거슬리면 그때 측정값으로 잡는다 |
| 배경 환자 수가 조명 3단계에만 반응 | 요일·수용 건수 같은 다른 축을 물리면 장식이 게임 데이터를 말하기 시작한다(위 이중 기재) |

## 8. 결정 기록

| 결정 | 선택 | 기각한 것 |
|---|---|---|
| 시간의 무게 | **연출만 — 판정 무관** | 시간 압박(오래 끌면 콜 상실) — 판정·결정론·테스트·리플레이가 전부 바뀌고, "못 받은 이유"가 구조가 아니라 플레이어의 손 속도가 된다 |
| 움직임 범위 | **유휴 배회 + 배경 환자 유동** | 배회만(3~4명으로는 방치형 체감 미달) · 대기실 줄 추가(게임이 모델링 않는 숫자를 화면이 말함) |
| 속도 | **콜 사이 ~6초** (1분 = 50ms) | ~3초(이동을 "보고 있다"는 느낌 부족) · 속도 토글(상태·UI가 늘고 클릭-스킵과 역할 겹침) |
| 마감 | **마지막 진료가 끝날 때까지 흘린다** | 즉시 마감(하루의 끝이 장면이 아님) · 야간 창 확대(밸런스 변경) · 하루 24시간화(테스트 74곳·밸런스 통째로) |
