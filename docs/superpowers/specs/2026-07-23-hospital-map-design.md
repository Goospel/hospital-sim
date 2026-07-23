---
tags:
  - type/spec
---

# 설계 스펙 — 병원 맵 (탑다운 픽셀 아바타 시각화 레이어)

> **상태**: 확정 설계 (2026-07-23, brainstorming). 다음 = writing-plans로 구현 계획.
> **맥락**: 지금 RECEIVING 화면은 콜 카드 + 숫자 명단이다. 의사는 [DoctorRoster.tsx](../../../src/components/DoctorRoster.tsx)의 한 줄로, 병원은 어디에도 없다. 이 스펙은 그 위에 **탑다운 2D 픽셀 병원 맵**을 얹어 "누가 어느 진료실에서 진료 중인가 / 어느 과 방이 비어 있는가 / 지금 몇 시인가"를 **공간으로** 보이게 한다. 판정·경제·시간 전개는 무변경(0 침습).
> **선행 레이어**: [의사 개인 유닛 스펙](2026-07-20-doctor-roster-visualization-design.md)이 만든 `roster`·`busyUntil`·`fatigue`를 **소비만** 한다. 새 게임 상태 0개.
> **레퍼런스**: ZEP·Gather.town 계열의 탑다운 근접 아바타 맵. **형식만** 참조하고 에셋은 전량 자체 제작(§9).

---

## 1. 목적 & 스코프

### 문제

플레이어가 병원을 **경영**하는데 병원이 화면에 없다. 「순환기를 안 뽑았다」는 사실이 지금은 거절 시점에 `NO_BACKUP_CARE` 텍스트 한 줄로만 나타난다 — 뽑지 않은 대가가 **거절당하는 그 순간에야** 처음 보인다. 「지금 야간이다」도 배지 두 글자뿐이라, 왜 밤에만 막히는지가 공간적으로 안 잡힌다.

### 목표

- 배치한 진료과를 **방**으로, 채용한 의사를 **아바타**로 놓아 병원을 한 화면에 보인다.
- 진료 중인 의사가 **그 방 안에** 있고, 수용한 환자가 **침대 위에** 있게 한다.
- 시각에 따라 조명이 바뀌고, **야간에 24시간 안 돌아가는 과는 불이 꺼진다**.
- 콜과 콜 사이의 시간 점프를 **빨리감기**로 재생해 병원이 살아 있게 한다.

### 스코프 (v1 = 이 스펙)

- ✅ `deriveMapScene(receiving, atMin)` — 게임 상태 + 시각 → 그 순간의 장면(순수·결정론).
- ✅ 복도형 레이아웃(진료실 줄 / 복도 / 병동), 안 뽑은 과 = 빈 방.
- ✅ 조명 3단(주간·석양·야간) + 야간 소등 규칙.
- ✅ 콜 사이 빨리감기 재생(스킵 가능, reduced-motion 대응).
- ✅ RECEIVING 화면을 맵 주도 레이아웃으로 재배치(기존 4개 패널 재사용).

### 스코프 밖 (⏸ 의도적 보류)

- ⏸ **경로 탐색·벽 충돌** — 유닛 25개에 A\*는 과잉. 직선 보간 + CSS transition.
- ⏸ **아바타 클릭·툴팁** — 개인 정보는 명단이 담당. 본선 확장.
- ⏸ **환자 개인화**(이름·사연) — 회색 도트로 남긴다. 「문제는 개인이 아니라 시스템」 논지와 일치.
- ⏸ **SETUP·GROWTH·DAY_END·WEEK_SUMMARY·EPILOGUE 맵** — v1은 RECEIVING 하나.
- ⏸ **병상 부족이 판정을 막는 것** — 병상은 표시 전용(§7). 게임 로직을 건드려야 하므로 이 슬라이스 밖.
- ⏸ 사운드·줌·스크롤 — 한 화면 고정.

---

## 2. 확정 결정 (brainstorming 6-fork)

| # | 결정 | 채택 | 기각한 대안 |
|---|---|---|---|
| A | 화면 구조 | **맵이 주인공, UI는 오버레이** | 상단 띠(맵이 장식으로 읽힘) / 탭 분리(살아있는 느낌 끊김) |
| B | 시간 흐름 | **콜 사이 빨리감기 재생** | 실시간 루프(턴제→실시간 전환, 게임 재작성) / 제자리 idle(움직임 약함) |
| C | 병상 환자 | **기존 기록에서 파생**(`busyUntil` — §4.3) | 실제 병상 압박(판정·테스트·밸런스 흔들림 + 논지 충돌) / 병상 미표시(성장 축 안 보임) |
| D | 렌더링 | **DOM + CSS**(의존성 0) | Canvas 2D(접근성 0·상태 동기화 코드) / PixiJS·Phaser(번들 수백KB·마감 리스크) |
| E | 레이아웃 | **복도형**(진료실/복도/병동 3단) | 로비 중심(이동 짧음) / 층 단면(층간 이동 어색·세로로 김) |
| F | 에셋 | **inline SVG 자체 제작** | CC0 타일셋(라이선스·통합 비용·병원 테마 희소) / AI 생성(일관성·시간) |

**D의 근거(실측)**: 동시 유닛 상한 = 의사 ~10 + 침대 환자 ≤ 7 + 대기 몇 = **25 내외**. 예산 100억([setup.ts](../../../src/game/setup.ts) `SETUP_BUDGET_BILLIONS`)과 과별 상한(`deptCap` = 병상 3~7)이 그 천장을 만든다. 이 규모에 게임 엔진은 순손실.

---

## 3. 데이터 모델 — `MapScene` (신규, 표시 전용)

새 **게임 상태는 0개**다. `MapScene`은 저장되지 않는 파생 산출물이다.

```ts
/** 방 한 칸. 안 뽑은 과도 칸을 차지한다(빈 방으로 보이는 게 목적). */
export interface MapRoom {
  dept: DeptKey
  label: string          // DEPARTMENTS의 라벨(단일 출처)
  col: number            // 진료실 줄에서의 열 인덱스(0-based)
  staffed: boolean       // 채용 인원 ≥ 1
  lit: boolean           // 조명 규칙(§5.2) — 야간 소등 여부
}

/** 침대 한 칸. beds 티어만큼 존재하고, 비어 있어도 칸은 남는다. */
export interface MapBed {
  index: number
  occupantDoctorId?: string   // 이 환자를 보고 있는 의사. 없으면 빈 침대(§4.3)
}

export type AvatarKind = 'DOCTOR' | 'PATIENT'
export type AvatarZone = 'ROOM' | 'CORRIDOR' | 'BED'

export interface MapAvatar {
  id: string             // 의사는 Doctor.id, 환자는 callId 파생
  kind: AvatarKind
  zone: AvatarZone
  dept?: DeptKey         // ROOM일 때 어느 방인지
  slot: number           // 그 zone 안에서의 자리 인덱스(좌표 계산의 입력)
  busy: boolean          // 의사 전용 — 진료 중인가
}

export type Lighting = 'DAY' | 'DUSK' | 'NIGHT'

export interface MapScene {
  rooms: MapRoom[]
  beds: MapBed[]
  avatars: MapAvatar[]
  lighting: Lighting
  clockMin: number       // 이 장면의 시각(디버그·표시용)
}
```

`slot`까지만 파생하고 **픽셀 좌표는 컴포넌트가 CSS grid로 계산한다** — 순수 함수가 레이아웃 상수(방 너비 px 등)를 몰라야 테스트가 렌더링에 안 묶인다.

---

## 4. 파생 — `deriveMapScene` (순수·결정론)

```ts
// src/game/hospitalMap.ts
export function deriveMapScene(receiving: ReceivingState, atMin: number): MapScene
```

`ReceivingState` 하나가 화면에 필요한 정보를 모두 담고 있어(§4.1~4.4) 게임에 아무것도 묻지 않는다.

### 4.1 방 — 배치한 과가 곧 방

`hospital.roster`의 과 집합이 아니라 **`DEPARTMENTS` 전체**를 순회한다. 안 뽑은 과도 칸을 차지해야 "저 방이 비어 있다"가 보인다. `staffed = roster에 그 과 유닛 ≥ 1`. 정렬은 [DoctorRoster.tsx](../../../src/components/DoctorRoster.tsx)와 같은 규칙(필수과 먼저 → 수익과, 같은 과는 `DEPARTMENTS` 순)을 **재사용**한다 — 두 표면의 순서가 어긋나면 같은 병원이 두 개로 보인다.

### 4.2 의사 — `busyUntil` 하나로 위치가 갈린다

```ts
const busy = (receiving.busyUntil[doc.id] ?? 0) > atMin
// busy  → zone: 'ROOM', dept: doc.dept   (자기 진료실 안)
// 자유  → zone: 'CORRIDOR'               (복도)
```

이게 빨리감기가 공짜로 도는 이유다: `atMin`이 전진하면 진료가 끝난 의사가 스스로 복도로 나온다.

### 4.3 병상 환자 — `busyUntil`이 곧 환자다 (결정 C)

```
지금 누워 있는 환자 = busyUntil[doc.id] > atMin 인 의사 그 자체
```

[receiving.ts](../../../src/game/receiving.ts)의 `decide`가 수용 시 정확히 한 명을 `arrivalMin + durationMin`까지 점유하므로(`busyUntil[assignee.id] = …`), **진료 중인 의사 1명 = 지금 병원에 있는 환자 1명**이다. 별도 계산이 없다.

- 침대는 `roster` 순으로 채운다(결정론). 진료가 끝나면 그 침대가 빈다 = 퇴원.
- **정원 초과**: 진료 중 의사가 `hospital.beds`를 넘으면 초과분은 `zone: 'CORRIDOR'`로 보낸다(복도 대기). 침대 칸 수는 `beds`로 고정 — §8에서 잠근다. 과별 상한이 `deptCap`(≤ `beds`)이고 과가 8개라 이론상 초과가 가능하다.
- 거절·하드락 콜은 `busyUntil`을 만들지 않으므로 **자동으로 제외**된다. `log`를 볼 필요가 없다.

> ⚠️ **`log`에서 파생하지 않는 이유(설계 중 교정)**: `ReceivingState.log`는 `{callId, accepted, disposition, reason}`뿐이라 **담당 의사 id가 없다**. 초안은 `freeDoctorsOfDept`·`pickAssignee`를 재실행해 배정을 복원하려 했으나, 그 둘은 그 시점의 `busyUntil`을 입력으로 받으므로 **콜 순서대로 누적 상태를 다시 굴려야** 성립한다(단발 재실행으로는 틀린 답이 나온다). `busyUntil`을 직접 읽으면 그 시뮬레이션 전체가 불필요하고, `decide`와 같은 값을 보므로 어긋날 수도 없다.
>
> 대가는 **환자의 종류를 모른다**는 것(STEMI인지 미용인지). v1은 환자를 익명 회색 도트로 그리기로 확정했으므로(§1 스코프 밖) 손실이 없다. 종류별 아이콘이 필요해지면 그때 `log`에 담당 id를 실어야 하고, 그건 게임 상태 변경이라 0 침습이 깨진다 — 정직한 천장으로 §7에 둔다.

### 4.4 조명

`atMin` 하나의 함수다. 경계값은 §5.2.

---

## 5. 연출

### 5.1 빨리감기 (결정 B)

구간 양끝을 **상태에서 파생**한다 — 이전 상태를 ref에 들고 있을 필요가 없다:

```ts
const from = receiving.queue[receiving.index - 1]?.arrivalMin ?? 0
const to   = receiving.queue[receiving.index].arrivalMin
```

`from → to`를 N스텝(10~12)으로 나눠 `atMin`을 갱신하면, 각 스텝에서 `deriveMapScene`이 새 장면을 내고 **CSS transition이 스텝 사이를 걷는 걸로 메운다**. `requestAnimationFrame`도 게임 루프도 없다.

- 지속시간은 게임 시간에 비례하되 **최대 1.5초 캡** — 아침 첫 콜의 6시간을 그대로 기다리지 않는다.
- **클릭 시 즉시 스킵**(반복 플레이 필수).
- `prefers-reduced-motion`이면 스텝 1 = 즉시 점프.
- 게임 상태와 무관하므로 **중간에 끊겨도 판정에 영향 0**.

### 5.2 조명 — 게임이 이미 정한 경계선을 재사용

| 구간(개장 후 분) | 시각 | `lighting` |
|---|---|---|
| `0 ≤ t < NIGHT_START_MIN − 120` | 09:00~15:00 | `DAY` |
| `NIGHT_START_MIN − 120 ≤ t < NIGHT_START_MIN` | 15:00~17:00 | `DUSK` |
| `NIGHT_START_MIN ≤ t` | 17:00~ | `NIGHT` |

**`NIGHT_START_MIN`을 [daysim.ts](../../../src/game/daysim.ts)에서 import 해 쓴다.** 콜에 「야간」 배지를 붙이는 그 상수다 — 재사용하면 화면의 밤과 게임의 야간이 **구조적으로** 어긋날 수 없다(프로젝트 CLAUDE.md가 반복 경고하는 이중 기재 회피). `DUSK`의 −120은 이 스펙이 새로 정하는 연출값이며 판정과 무관하다.

### 5.3 야간 소등 — 「의사 1명은 24시간을 못 버틴다」의 공간 표현

```ts
lit = lighting !== 'NIGHT' || (hospital.roundTheClockBackup ?? []).includes(dept)
```

순환기 의사를 1명만 뽑았으면 17시에 그 방 불이 꺼지고, 그 상태로 밤 STEMI가 `NO_NIGHT_BACKUP`으로 막힌다. [types.ts:30](../../../src/game/types.ts) 주석이 산문으로 말하는 것을 화면이 대신 말한다. **새 데이터 0개** — `roundTheClockBackup`은 이미 있다.

수익과(`AESTHETICS`·`CHECKUP`)는 `roundTheClockBackup`에 원래 없으므로 밤에 함께 꺼진다. 이건 사실과도 맞다(미용은 야간 응급을 안 받는다).

---

## 6. UX — 맵 주도 레이아웃

```
┌──────────────────────────────────────────┐
│ 목요일 · 콜 3/5                14:20  ☀  │  HUD
│         [ 병원 맵 · 복도형 ]              │  주인공(높이 60~70%)
├───────────────────────────┬──────────────┤
│  콜 카드 + 수가/원가 + 버튼 │  의료진 명단  │
│                           │  오늘 장부    │
└───────────────────────────┴──────────────┘
```

- `CallEconomicsBreakdown` · `DoctorRoster` · `CheerfulLedger` · `MorningPaper` **네 개 다 무변경 재사용**. `ReceivingPhase`는 배치만 바뀐다.
- `DoctorRoster`를 남기는 이유: 아바타는 진료 중/자유만 보이고 **피로도 막대**는 못 보인다. 맵이 순간 상태를, 명단이 누적을 담당한다.
- **반응형**: 폭이 좁으면 맵 높이를 줄이고 HUD를 접는다. 완성도는 데스크톱 우선(정직한 천장 §7).
- **show-don't-tell**: 맵에 해석 카피 0. 방 라벨·상태점·조명만 놓는다. "순환기 과부하" 같은 문구 금지 — 꺼진 방과 거절 사유를 플레이어가 스스로 잇는다.

---

## 7. 헌법 준수 · 정직한 천장

### 0 침습 (불변식)

- `src/game/` 아래 **기존 파일은 한 줄도 안 바뀐다**. 신규 `hospitalMap.ts`만 추가된다.
- `adjudicate`·`hardlockReason`·`decide`·`advanceDay`는 `MapScene`의 존재를 모른다.
- 기존 테스트 **전부 그대로 green**. 빨리감기를 스킵하든 끝까지 보든 게임 상태는 동일하다.

### 정직한 천장

| 천장 | 왜 지금 이대로인가 | 승격 경로 |
|---|---|---|
| 아바타가 직선으로 이동(벽 통과) | 방이 격자라 눈에 안 띈다. 유닛 25개에 A\*는 과잉 | 맵이 넓어지면 격자 BFS |
| 병상은 **표시 전용** | 「병상이 벽이 아니다」가 이 게임의 논지다([receiving.ts](../../../src/game/receiving.ts)) — 병상이 차서 못 받게 만들면 논지와 정면 충돌 | `ER_OVERCROWDED` 부활(게임 로직 변경 필요) |
| 환자가 익명 도트 | 개인 서사가 붙으면 "시스템이 문제"가 "이 환자가 안됐다"로 미끄러진다 | 의도적 영구 보류 |
| 환자의 **종류**를 모른다(STEMI/미용 구분 없음) | `busyUntil`은 누가 바쁜지만 알려준다. 익명 도트라 v1엔 손실 0(§4.3) | `log`에 담당 의사 id 추가 — **게임 상태 변경이라 0 침습이 깨진다**. 종류별 아이콘이 정말 필요할 때만 |
| 모바일은 축소 폴백 | 마감 18일. 심사 시연은 데스크톱 | 본선 확장 |

**병상을 그리는 것이 논지를 약화시키지 않는 이유**: 침대 7개 중 2개만 찬 게 눈에 보이는데도 STEMI가 거절되면, 플레이어는 "자리 있는데 왜?"를 스스로 묻게 된다. 그 질문이 이 게임이 하려는 말이다. 병상을 **안 그리면** 그 대조가 생기지 않는다.

---

## 8. 테스트 (TDD)

관례대로 **순수 로직만 유닛테스트, 컴포넌트는 브라우저 실측**. `vitest`는 타입체크를 안 하므로 `tsc --noEmit`도 게이트다([vitest-no-typecheck-tsc-gate 메모]).

`src/game/hospitalMap.test.ts` — **Red 먼저** 쓰고 실패를 눈으로 확인한 뒤 구현:

- **결정론**: 같은 `(receiving, atMin)` → 깊은 비교로 같은 `MapScene`.
- **의사 위치**: `busyUntil > atMin` ⇒ `zone: 'ROOM'` ∧ `dept = 소속과`; `≤ atMin` ⇒ `'CORRIDOR'`. 경계값(`=== atMin`)은 자유 쪽.
- **빈 방**: 채용 0인 과도 `rooms`에 존재하고 `staffed === false`. 방 개수 === `DEPARTMENTS.length`.
- **방 순서**: `DoctorRoster`와 같은 정렬(필수과 먼저).
- **조명**: 세 구간 경계값 각각. `atMin ≥ NIGHT_START_MIN` ⇒ `'NIGHT'`.
- **소등**: `NIGHT` ∧ `roundTheClockBackup`에 없는 과 ⇒ `lit === false`; 있는 과 ⇒ `true`. 주간엔 전부 `true`.
- **병상**: `beds.length === hospital.beds`(항상, 빈 침대 포함). 점유 수 ≤ `beds`. 초과분은 `CORRIDOR`.
- **의사=환자 대응**: 점유 침대의 `occupantDoctorId`는 전부 `busyUntil > atMin`인 의사이고, 그 수가 `min(진료 중 의사 수, beds)`와 같다.
- **퇴원**: 담당의 `busyUntil`을 지난 `atMin`에서 그 침대가 빈다.
- **거절 콜 미표시**: 하드락·거절만 있는 `receiving`에서 점유 침대 0(거절은 `busyUntil`을 만들지 않는다).
- **roster 없는 병원**(구형 테스트 픽스처): 던지지 않고 아바타 0으로 반환.
- **회귀 가드**: 기존 테스트 무변경 통과 + `tsc --noEmit` 0.

브라우저 실측(컴포넌트): 개원 → 7일 완주. 콜 수용 시 아바타가 방으로 들어가고 침대가 차는지, 17시 넘어 조명이 바뀌고 1인과 방이 꺼지는지, 빨리감기 스킵이 되는지, 콘솔 0 에러.

---

## 9. 에셋 — 자체 제작 (저작권)

**ZEP의 스프라이트·타일셋을 추출해 쓰지 않는다.** 이 저장소는 대회 제출물이라 실제 리스크다. 참조하는 것은 **형식**(2D 탑다운 + 근접 아바타 + 픽셀 그리드)이며, 이는 Gather.town·스타듀밸리·테마 호스피탈이 공유하는 장르 관습이다.

아바타·가구는 `PixelSprite.tsx`의 **inline SVG 픽셀 그리드**(`<rect>` 격자)로 그린다 — 이미지 파일 0개, 과별 색은 변수 하나, 정적 export·번들 영향 0.

---

## 10. 파일 영향

| 파일 | 변경 |
|---|---|
| `src/game/hospitalMap.ts` (신규) | `MapScene` 타입군 · `deriveMapScene` · 조명·소등 규칙 |
| `src/game/hospitalMap.test.ts` (신규) | §8 불변식 TDD |
| `src/components/HospitalMap.tsx` (신규) | `MapScene` → DOM(grid + absolute). 순수 표시 |
| `src/components/PixelSprite.tsx` (신규) | inline SVG 아바타·침대·가구 |
| `src/components/ReceivingPhase.tsx` | 맵 주도 레이아웃으로 재배치 + 빨리감기 훅. 기존 4개 패널은 그대로 호출 |
| `src/game/*.ts` (기존 전부) | **무변경** |

세부 코드·단계는 writing-plans에서 확정한다.
