---
tags:
  - type/plan
---

# 피로 승격 구현 계획 (피로가 판정을 먹는다)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피로도가 진료 소요시간을 늘려 그 의사의 처리량을 깎게 한다 — 표시 전용이던 피로 막대가 처음으로 판정을 먹는다.

**Architecture:** 합류 지점은 `occupiedUntilMin` **한 자리**뿐이다(선택 인자 `fatigue = 0`이라 기본은 현행 동일). 그 전에 전제 두 개를 고친다 — ⓐ 피로 입력을 건수에서 **점유 분**으로(콜 제한 폐지 후 건수 기반은 첫날 포화) ⓑ 수용 로그에 **실제 담당의·실제 점유 종료**를 남겨 피로 장부와 판정 장부를 한 책으로. `adjudicate.ts`와 판정 우선순위·사유 종류는 **0줄** 바뀐다.

**Tech Stack:** TypeScript · Next.js · vitest · Tailwind. 순수 게임 로직만 유닛테스트, 컴포넌트는 브라우저 실측(프로젝트 관례).

**설계 스펙:** [2026-07-25-fatigue-adjudication-design.md](../specs/2026-07-25-fatigue-adjudication-design.md)

> ⚠️ **실행 중 개정(2026-07-25)**: Task 4의 "점유 분" 모델은 구현 중 실측으로 반박돼(시간만 재면 미용이 갈리고 필수과가 0 — 스펙 §2-3) **표준강도분(점유 분 × 강도)** 모델로 대체 확정됐다(스펙 §4-1 개정·결정 E·F). 이 문서의 Task 4 코드 블록은 착수 시점 기록으로 남긴다 — 최종 형태의 단일 출처는 스펙과 코드다(최종 상수: `FATIGUE_FREE_MIN=160`·`FATIGUE_PER_OVER_HOUR=15`, `doctorCaseloads`는 `loadMin`·`nightLoad` 반환).

---

## 파일 구조

| 파일 | 책임 | 이번 변경 |
|---|---|---|
| `src/game/doctor.ts` | **피로의 유일한 자리** — 상수·배율·적립 | 상수 교체 · `fatigueSlowFactor` 신설 · `doctorCaseloads`에 `busyMin` · `stepFatigue` 새 공식 |
| `src/game/daysim.ts` | **점유 계산의 유일한 자리** — 시간 원시함수 | `occupiedUntilMin`에 `fatigue = 0` 인자 (doctor.ts의 배율을 임포트) |
| `src/game/receiving.ts` | 하루 리듀서(판정·경제) | `log`에 `assigneeId`·`endMin` · `fatigueAtOpen` 상태 · `decide`/`applyBump`가 피로 전달·기록 |
| `src/game/session.ts` | 세션 상태기계 | `advanceDay`·`beginWeek`이 `state.fatigue`를 하루 스냅샷으로 전달 |
| `src/components/CallCard.tsx` | 콜 카드 | 점유 미리보기가 `occupiedUntilMin` 경유(베테랑 버그 수리 포함) |
| `src/components/DoctorRoster.tsx` | 의사 명단 스트립 | 막대 색 경계를 `doctor.ts` 상수에서 임포트 |

**의존 방향**: `daysim → doctor`(배율), `receiving → daysim + doctor`. 순환 없음(`doctor.ts`는 `daysim`을 임포트하지 않는다).

**태스크 순서 제약**: Task 1 → 2 → 3 → 4 (Task 4의 `busyMin`이 Task 3의 `endMin`을 읽는다) → 5 → 6 → 7.

---

### Task 1: 피로 배율 함수 (`fatigueSlowFactor`)

**Files:**
- Modify: `src/game/doctor.ts:86-90` (상수 블록)
- Test: `src/game/doctor.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/doctor.test.ts` 맨 아래에 추가. import 줄에 `fatigueSlowFactor, FATIGUE_SLOW_FROM, FATIGUE_RED`를 더한다.

```ts
describe('fatigueSlowFactor — 피로 → 진료 소요 배율(조용한 침식)', () => {
  it('정상 근무 구간(FATIGUE_SLOW_FROM 이하)은 정확히 1.0 — 무영향', () => {
    expect(fatigueSlowFactor(0)).toBe(1)
    expect(fatigueSlowFactor(FATIGUE_SLOW_FROM)).toBe(1)
  })

  it('레드존 경계에서 ×1.25, 포화에서 ×1.5', () => {
    expect(fatigueSlowFactor(FATIGUE_RED)).toBeCloseTo(1.25, 10)
    expect(fatigueSlowFactor(FATIGUE_MAX)).toBeCloseTo(1.5, 10)
  })

  it('단조증가 — 넘는 순간(임계 벽)이 없다', () => {
    for (let f = 0; f < FATIGUE_MAX; f++) {
      expect(fatigueSlowFactor(f + 1)).toBeGreaterThanOrEqual(fatigueSlowFactor(f))
    }
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/doctor.test.ts -t "fatigueSlowFactor"`
Expected: FAIL — `fatigueSlowFactor is not a function` (또는 import 에러)

- [ ] **Step 3: 최소 구현**

`src/game/doctor.ts`의 상수 블록(현재 `FATIGUE_PER_CASE` 등)을 다음으로 **교체**한다. `FATIGUE_PER_CASE`는 은퇴한다(§2-1 — 하루 콜 5통 시대의 유물).

```ts
// 피로 상수 — 예시값(임상 주장 아님). 방향만 정직: 오래 점유될수록·야간일수록 ↑, 한가한 날 회복 ↓.
// ⚠️ FATIGUE_PER_CASE(건수 기반, 18)는 은퇴했다 — 콜 제한 폐지로 하루가 62~142명이 되면서
// 건수 척도가 개원 첫날 포화를 만들었다(보톡스 30분과 뇌수술 180분에 같은 값을 매기던 게 근인).
export const FATIGUE_FREE_MIN = 360 // 이 점유까지는 정상 근무 — 부하 0(하루 600분 중 6시간)
export const FATIGUE_PER_OVER_HOUR = 15 // 초과 1시간당 피로
export const FATIGUE_NIGHT_EXTRA = 12
export const FATIGUE_REST = 20
export const FATIGUE_MAX = 100

/** 막대 '중' 경계 — 여기까지 배율 1.0(정상 근무 무영향). DoctorRoster의 색 단계와 같은 출처. */
export const FATIGUE_SLOW_FROM = 34
/** 막대 '고'(레드존) 경계 — 표시 전용이지만 색과 감속 구간을 한 출처로 묶는다. */
export const FATIGUE_RED = 67
/** 포화(FATIGUE_MAX)에서의 추가 소요 비율 — +50%. */
export const FATIGUE_SLOW_MAX = 0.5

/**
 * 피로 → 진료 소요 배율. FATIGUE_SLOW_FROM 이하는 1.0, 거기서 FATIGUE_MAX까지 선형으로 오른다
 * (67 → ×1.25, 100 → ×1.5). **연속·단조**라 임계를 넘는 순간이 없다 — "레드존 직전까지 굴리기"
 * 같은 게이밍 표면을 만들지 않기 위한 형태 선택이다(스펙 §5 정답-퍼즐 방지).
 */
export function fatigueSlowFactor(fatigue: number): number {
  const over = Math.max(0, fatigue - FATIGUE_SLOW_FROM)
  return 1 + (FATIGUE_SLOW_MAX * over) / (FATIGUE_MAX - FATIGUE_SLOW_FROM)
}
```

같은 파일 맨 위 모듈 주석(현재 *"표시 레이어 순수 모듈. 판정·경제에 절대 닿지 않는다"*)을 고친다:

```ts
// 의사 개인 유닛 모듈 — 명단·담당 분배·**피로**의 단일 출처.
// ⚠️ 2026-07-25 승격: 피로는 더 이상 표시 전용이 아니다. fatigueSlowFactor가 daysim의
// occupiedUntilMin에 합류해 진료 소요를 늘린다(스펙 2026-07-25-fatigue-adjudication-design.md).
// 그 배율 하나를 빼면 이 모듈은 여전히 판정·경제에 닿지 않는다.
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/doctor.test.ts -t "fatigueSlowFactor"`
Expected: PASS (3 tests)

> ⚠️ 이 시점에 `stepFatigue`의 기존 테스트는 `FATIGUE_PER_CASE` 제거로 **깨진다**. Task 4에서 새 공식과 함께 고친다 — 그때까지 `doctor.test.ts` 전체는 red다(의도된 중간 상태).

- [ ] **Step 5: 커밋**

```bash
git add src/game/doctor.ts src/game/doctor.test.ts && git commit -F .commit-msg-tmp
```

`.commit-msg-tmp` 내용(T-026 — 한글은 파일 경유. 트레일러 블록 **앞에 빈 줄 하나**, 블록 **안엔 빈 줄 없이**):

```
feat: 피로 배율 함수 — 조용한 침식의 형태

FATIGUE_SLOW_FROM(34) 이하는 1.0, 거기서 포화까지 선형으로 ×1.5까지.
연속·단조라 임계를 넘는 순간이 없다 — 레드존 직전까지 굴리는 게이밍
표면을 안 만들려는 형태 선택이다. 막대 색 경계(34·67)를 상수로 승격해
DoctorRoster와 단일 출처로 묶을 준비를 한다.

건수 기반 FATIGUE_PER_CASE(18)는 은퇴한다 — 콜 제한 폐지로 하루가
62~142명이 된 뒤로 개원 첫날 포화를 만들던 유물이다.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 34/67/100의 경계값을 구현 전에 못박아 배율 형태가 흔들리지 않음
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 2: `occupiedUntilMin`에 피로 합류

**Files:**
- Modify: `src/game/daysim.ts:101-107`
- Test: `src/game/daysim.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/daysim.test.ts`의 `occupiedUntilMin` describe 블록에 추가한다.

```ts
  it('피로 미전달 = 현행 동일(하위호환 F-0)', () => {
    expect(occupiedUntilMin(base, 100, 90)).toBe(occupiedUntilMin(base, 100, 90, 0))
  })

  it('피로가 높을수록 점유가 같거나 늦다(F-1 단조성)', () => {
    const at = (f: number) => occupiedUntilMin(base, 0, 100, f)
    expect(at(34)).toBe(100) // 정상 근무 구간은 무영향
    expect(at(67)).toBe(125) // ×1.25
    expect(at(100)).toBe(150) // ×1.5
    expect(at(80)).toBeGreaterThan(at(50))
  })

  it('speedFactor와 합성된다 — 반올림은 끝에서 한 번', () => {
    // 베테랑(0.8) × 포화(1.5) = 1.2 → 100분이 120분
    expect(occupiedUntilMin({ ...base, speedFactor: 0.8 }, 0, 100, 100)).toBe(120)
  })
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/daysim.test.ts -t "occupiedUntilMin"`
Expected: FAIL — 네 번째 인자가 없어 `at(67)`이 100을 반환(125 기대)

- [ ] **Step 3: 최소 구현**

`src/game/daysim.ts` 맨 위 import에 추가:

```ts
import { fatigueSlowFactor } from './doctor'
```

`occupiedUntilMin`을 교체:

```ts
/**
 * 점유 종료 시각(분) — 의사 개인 속도 + **피로**를 반영. 점유 계산의 **유일한 자리**다
 * (decide·applyBump·CallCard 공유; 식이 두 곳에 살면 한쪽이 낡는다).
 *
 * fatigue 기본값 0이라 안 넘기면 배율 1.0으로 현행과 완전 동일하다(불변식 F-0) —
 * 승격 전 테스트·호출부가 그대로 green인 이유가 이 기본 인자다.
 * speedFactor와 곱으로 합성되고 **반올림은 끝에서 한 번**이라 지친 베테랑이 쌩쌩한
 * 신입과 비슷해지는 질감이 따로 코드를 쓰지 않고 나온다.
 */
export function occupiedUntilMin(
  doc: Doctor,
  startMin: number,
  durationMin: number,
  fatigue = 0,
): number {
  return startMin + Math.round(durationMin * (doc.speedFactor ?? 1) * fatigueSlowFactor(fatigue))
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/daysim.test.ts`
Expected: PASS (기존 `occupiedUntilMin` 테스트 포함 전부)

- [ ] **Step 5: 커밋**

```bash
git add src/game/daysim.ts src/game/daysim.test.ts && git commit -F .commit-msg-tmp
```

메시지 본문:

```
feat: 점유 계산에 피로 합류 — 승격의 유일한 침습 지점

occupiedUntilMin에 fatigue 선택 인자(기본 0)를 더한다. 기본값 덕에 안
넘기는 호출부·테스트는 배율 1.0으로 현행과 완전히 동일하다(불변식 F-0) —
승격의 하위호환을 타입 수준에서 보장하는 자리다.

speedFactor와 곱으로 합성하고 반올림은 끝에서 한 번이라, 지친 베테랑이
쌩쌩한 신입과 비슷해지는 질감이 추가 코드 없이 나온다.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 하위호환(F-0)·단조성(F-1)을 구현 전에 테스트로 고정
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 3: 로그가 실제 배정을 기록한다 + 하루 피로 스냅샷

**Files:**
- Modify: `src/game/receiving.ts` (`ReceivingState.log`·`fatigueAtOpen`·`initReceiving`·`decide`·`applyBump`)
- Test: `src/game/receiving.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/receiving.test.ts`에 새 describe를 추가한다. 기존 테스트의 `roster`/`hospital` 패턴을 따르되, 이 블록은 자체적으로 만든다.

```ts
describe('로그의 실제 배정 기록 + 하루 피로 스냅샷', () => {
  const choices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1 } }
  const hospital = buildHospital(choices).hospital
  const stemi: IncomingCall = {
    id: 'c1', kind: 'STEMI', label: '급성심근경색 — 타 병원 전원 요청',
    patient: { id: 'p1', requiredSpecialty: 'CARDIOLOGY', severity: 5 },
    lawsuitRisk: true, nightShift: false, arrivalMin: 60, durationMin: 100,
  }

  it('수용 엔트리에만 assigneeId·endMin이 실린다', () => {
    const r = decide(initReceiving(hospital, [stemi]), 'ACCEPT')
    expect(r.log[0].assigneeId).toBe('doc-CARDIOLOGY-1')
    expect(r.log[0].endMin).toBe(160) // 60 + 100, 피로 0
  })

  it('거절 엔트리엔 두 필드가 없다', () => {
    const r = decide(initReceiving(hospital, [stemi]), 'DECLINE')
    expect(r.log[0].assigneeId).toBeUndefined()
    expect(r.log[0].endMin).toBeUndefined()
  })

  it('fatigueAtOpen이 점유 종료를 늦춘다(포화 → ×1.5)', () => {
    const r = decide(initReceiving(hospital, [stemi], {}, { 'doc-CARDIOLOGY-1': 100 }), 'ACCEPT')
    expect(r.log[0].endMin).toBe(210) // 60 + round(100 × 1.5)
    expect(r.busyUntil['doc-CARDIOLOGY-1']).toBe(210) // 로그와 busyUntil이 같은 값
  })

  it('fatigueAtOpen 기본값은 빈 맵 — 현행과 동일(F-0)', () => {
    expect(initReceiving(hospital, [stemi]).fatigueAtOpen).toEqual({})
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/receiving.test.ts -t "실제 배정"`
Expected: FAIL — `assigneeId`가 타입에 없다(tsc) / `undefined` 반환

- [ ] **Step 3: 최소 구현**

**3-1.** `ReceivingState`의 `log` 타입에 두 필드를 더한다(기존 `startMin?` 주석 아래):

```ts
  log: {
    callId: string
    accepted: boolean
    disposition: CallDisposition
    reason: RejectionReason | null
    startMin?: number
    /**
     * 실제로 이 콜을 맡은 의사 — 표시용 라운드로빈이 아니라 pickAssignee의 결과다.
     * 피로 적립이 이 필드를 읽어 **막대가 지목한 의사와 실제로 느려지는 의사가 일치**한다(F-2).
     */
    assigneeId?: string
    /** 실제 점유 종료 시각 — occupiedUntilMin의 결과 그대로. 점유 분 = endMin − startMin. */
    endMin?: number
  }[]
```

**3-2.** `ReceivingState`에 스냅샷 필드를 더한다(`busyWith` 아래):

```ts
  /**
   * 오늘 아침 유닛별 피로(0~100) — **하루 안에서 불변**이라 아침 막대에 보이는 그 값이
   * 오늘 하루의 배율이다. 실시간으로 변하게 하면 같은 콜이 아침·저녁에 다른 소요를 갖고,
   * 막대와 실제 감속이 또 어긋난다(피로 장부와 판정 장부를 한 책으로 묶은 취지가 깨진다).
   */
  fatigueAtOpen: Record<string, number>
```

**3-3.** `initReceiving`에 네 번째 선택 인자:

```ts
export function initReceiving(
  hospital: Hospital,
  queue: IncomingCall[] = createCallQueue(),
  boardedBusyUntil: Record<string, number> = {},
  fatigueAtOpen: Record<string, number> = {},
): ReceivingState {
  return {
    hospital,
    queue,
    index: 0,
    clockMin: 0,
    busyUntil: { ...boardedBusyUntil },
    busyWith: {},
    fatigueAtOpen,
    netProfitDeltaManwon: 0,
    workupRevenueManwon: 0,
    workupCount: 0,
    lawsuitExposure: 0,
    log: [],
    done: queue.length === 0,
  }
}
```

**3-4.** `decide`의 점유 블록을 교체한다(기존 `let busyUntil = state.busyUntil` 부터 `}` 까지):

```ts
  let busyUntil = state.busyUntil
  let busyWith = state.busyWith
  let startMin: number | undefined
  let assigneeId: string | undefined
  let endMin: number | undefined
  if (effectiveAccept && canStart) {
    const free = freeDoctorsOfDept(roster, state.busyUntil, handlingDept(call), start)
    const assignee = pickAssignee(free, state.busyUntil)
    // 오늘 아침 피로가 이 진료를 늘린다 — 하루 안에서 고정이라 콜마다 배율이 흔들리지 않는다.
    const until = occupiedUntilMin(assignee, start, call.durationMin ?? 0, state.fatigueAtOpen[assignee.id] ?? 0)
    busyUntil = { ...state.busyUntil, [assignee.id]: until }
    busyWith = {
      ...state.busyWith,
      [assignee.id]: { callId: call.id, kind: call.kind, deltaManwon: callDelta(call.kind) },
    }
    startMin = start
    assigneeId = assignee.id
    endMin = until
  }
```

그리고 로그 push 줄을 교체:

```ts
  const log = [
    ...state.log,
    { callId: call.id, accepted: effectiveAccept, disposition, reason: logReason, startMin, assigneeId, endMin },
  ]
```

**3-5.** `applyBump`에서 ⓐ 밀린 엔트리의 두 필드를 지우고 ⓑ 피로를 반영해 재점유하고 ⓒ 새 엔트리에 기록한다:

```ts
  // 밀어낸 예약의 로그 엔트리를 BUMPED로 되돌린다(불변 map). 배정 기록도 함께 지운다 —
  // 중단된 예약의 부분 점유는 피로로 계상하지 않는다(스펙 §3-1).
  const log = state.log.map((e) =>
    e.callId === bumped.callId && e.accepted
      ? {
          ...e, accepted: false, disposition: 'BUMPED' as CallDisposition, reason: null,
          startMin: undefined, assigneeId: undefined, endMin: undefined,
        }
      : e,
  )

  const target = (state.hospital.roster ?? []).find((d) => d.id === targetId)!
  const until = occupiedUntilMin(target, arrivalMin, call.durationMin ?? 0, state.fatigueAtOpen[targetId] ?? 0)
  const busyUntil = { ...state.busyUntil, [targetId]: until }
```

그리고 `applyBump`의 return에서 로그 append 줄:

```ts
    log: [...log, {
      callId: call.id, accepted: true, disposition: 'CHOICE' as CallDisposition, reason: null,
      startMin: arrivalMin, assigneeId: targetId, endMin: until,
    }],
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/receiving.test.ts` 그리고 `npx tsc --noEmit`
Expected: receiving 테스트 전부 PASS · tsc 0 에러

- [ ] **Step 5: 커밋**

```bash
git add src/game/receiving.ts src/game/receiving.test.ts && git commit -F .commit-msg-tmp
```

메시지 본문:

```
feat: 로그에 실제 배정 기록 + 하루 피로 스냅샷

피로 적립은 표시용 라운드로빈이고 실제 점유 배정은 pickAssignee라 서로
다른 책이었다. 표시 전용일 땐 무해했지만 판정을 먹이면 막대가 지목한
의사와 실제로 느려지는 의사가 어긋난다 — 인과의 가시화가 이 레이어의
존재 이유인데 그 인과가 거짓이 된다.

수용 엔트리에 assigneeId·endMin을 남긴다. 재계산이 아니라 기록이라
파생이 판정과 어긋날 여지가 구조적으로 없다. 범프로 중단된 예약은 두
필드를 함께 지워 부분 점유가 피로로 안 잡힌다.

fatigueAtOpen은 하루 안에서 불변이다 — 아침 막대에 보이는 그 값이 오늘
하루의 배율이라, 같은 콜이 시각에 따라 다른 소요를 갖지 않는다.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 수용/거절/범프 세 경로의 필드 유무를 먼저 못박아 범프 되돌림에서 필드가 남는 실수를 차단
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 4: 피로 입력을 점유 시간으로 (`busyMin` + 새 `stepFatigue`)

**Files:**
- Modify: `src/game/doctor.ts` (`doctorCaseloads`·`stepFatigue`)
- Test: `src/game/doctor.test.ts` (기존 `stepFatigue` describe 교체)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`doctor.test.ts`의 기존 `describe('stepFatigue — 하루 담당으로 피로 누적(주 간 유지)')` 블록 **전체를 아래로 교체**한다(옛 `cl` 헬퍼는 건수 기반이라 함께 폐기).

```ts
describe('stepFatigue — 하루 점유 시간으로 피로 누적(주 간 유지)', () => {
  const load = (busy: [string, number][], night: [string, number][] = []) => ({
    total: new Map<string, number>(),
    night: new Map(night),
    busyMin: new Map(busy),
  })

  it('점유가 길수록 더 오른다', () => {
    const next = stepFatigue({}, load([['a', 400], ['b', 600]]))
    expect(next.b).toBeGreaterThan(next.a)
  })

  it('정상 근무(FATIGUE_FREE_MIN 이하)에 야간 0이면 회복만 남는다', () => {
    const next = stepFatigue({ a: 50 }, load([['a', FATIGUE_FREE_MIN]]))
    expect(next.a).toBe(50 - FATIGUE_REST)
  })

  it('야간 담당은 가중된다(같은 점유라도 야간이 더 높다)', () => {
    const next = stepFatigue({}, load([['a', 500], ['b', 500]], [['b', 1]]))
    expect(next.b).toBeGreaterThan(next.a)
  })

  it('무부하 날은 회복으로 내려간다(0 클램프)', () => {
    const next = stepFatigue({ a: 10 }, load([['a', 0]]))
    expect(next.a).toBe(0)
  })

  it('상한 클램프(FATIGUE_MAX 초과 없음)', () => {
    const next = stepFatigue({ a: 90 }, load([['a', 900]], [['a', 3]]))
    expect(next.a).toBe(FATIGUE_MAX)
  })

  it('이전 값에 누적한다(리셋 아님)', () => {
    const day1 = stepFatigue({}, load([['a', 600]]))
    const day2 = stepFatigue(day1, load([['a', 600]]))
    expect(day2.a).toBeGreaterThan(day1.a)
  })
})

describe('doctorCaseloads — busyMin은 실제 배정에서 나온다', () => {
  const choices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1 } }
  const hospital2 = buildHospital(choices).hospital
  const roster2 = materializeRoster(choices, DEPARTMENTS)
  const stemi: IncomingCall = {
    id: 'c1', kind: 'STEMI', label: '급성심근경색 — 타 병원 전원 요청',
    patient: { id: 'p1', requiredSpecialty: 'CARDIOLOGY', severity: 5 },
    lawsuitRisk: true, nightShift: false, arrivalMin: 60, durationMin: 100,
  }

  it('수용한 콜의 점유 분이 담당의에게 쌓인다(F-2)', () => {
    const r = decide(initReceiving(hospital2, [stemi]), 'ACCEPT')
    const { busyMin, total } = doctorCaseloads(roster2, r)
    expect(busyMin.get('doc-CARDIOLOGY-1')).toBe(100)
    expect(total.get('doc-CARDIOLOGY-1')).toBe(1)
  })

  it('거절한 콜은 점유가 0이고, 모든 유닛이 0으로 초기화된다', () => {
    const r = decide(initReceiving(hospital2, [stemi]), 'DECLINE')
    const { busyMin } = doctorCaseloads(roster2, r)
    expect(busyMin.get('doc-CARDIOLOGY-1')).toBe(0)
  })
})
```

import 줄에 `FATIGUE_FREE_MIN, FATIGUE_REST`를 더한다.

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/doctor.test.ts`
Expected: FAIL — `busyMin`이 반환에 없음 / `stepFatigue`가 건수를 읽음

- [ ] **Step 3: 최소 구현**

`doctorCaseloads`를 교체:

```ts
/**
 * 하루 부하 파생 — **로그의 실제 배정(assigneeId)** 으로 접는다. 표시용 라운드로빈이던 옛 분배는
 * 승격과 함께 폐기됐다: 감속당하는 의사와 카드에 뜨는 의사가 달라지면 이 레이어가 거짓말을 한다(F-2).
 *
 * total = 담당 건수(명단 스트립) · night = 그중 야간 · busyMin = 점유 분 합(피로 입력).
 * 모든 유닛을 0으로 초기화해 표시가 안정적이다(콜 0인 유닛도 카드에 0으로 뜬다).
 * 배정이 없는 수용 엔트리(구 로그·합성 테스트)는 아무에게도 안 붙는다.
 */
export function doctorCaseloads(
  roster: Doctor[],
  receiving: ReceivingState,
): { total: Map<string, number>; night: Map<string, number>; busyMin: Map<string, number> } {
  const total = new Map<string, number>()
  const night = new Map<string, number>()
  const busyMin = new Map<string, number>()
  for (const doc of roster) {
    total.set(doc.id, 0)
    night.set(doc.id, 0)
    busyMin.set(doc.id, 0)
  }
  receiving.log.forEach((entry, i) => {
    if (!entry.accepted) return
    const id = entry.assigneeId
    if (id === undefined || !total.has(id)) return // 무배정 — 아무에게도 안 붙음
    total.set(id, total.get(id)! + 1)
    if (receiving.queue[i]?.nightShift) night.set(id, night.get(id)! + 1)
    if (entry.startMin !== undefined && entry.endMin !== undefined) {
      busyMin.set(id, busyMin.get(id)! + Math.max(0, entry.endMin - entry.startMin))
    }
  })
  return { total, night, busyMin }
}
```

`stepFatigue`를 교체:

```ts
/**
 * 하루 부하 → 유닛별 피로 갱신(0~FATIGUE_MAX 클램프). 이전 값에 누적한다(주 간 유지 — 리셋은 세션이 안 한다).
 *
 * 입력이 **점유 분**인 게 핵심이다: 건수는 부하의 대리물일 뿐이라 보톡스 30분과 뇌수술 180분에
 * 같은 값을 매겼고, 콜 제한 폐지 뒤 하루 62~142명에서 개원 첫날 포화를 만들었다.
 * 6시간(FATIGUE_FREE_MIN)까지는 부하 0이고 그 초과분만 시간당 쌓인다 — 완편 수익과가
 * 저지대를 유지하고 1인 필수과만 레드존으로 가는 대조가 여기서 나온다(채용이 곧 회복).
 */
export function stepFatigue(
  prev: Record<string, number>,
  load: { night: Map<string, number>; busyMin: Map<string, number> },
): Record<string, number> {
  const next: Record<string, number> = { ...prev }
  for (const [id, mins] of load.busyMin) {
    const nights = load.night.get(id) ?? 0
    const overHours = Math.max(0, mins - FATIGUE_FREE_MIN) / 60
    const delta = Math.round(overHours * FATIGUE_PER_OVER_HOUR) + nights * FATIGUE_NIGHT_EXTRA - FATIGUE_REST
    next[id] = Math.max(0, Math.min(FATIGUE_MAX, (prev[id] ?? 0) + delta))
  }
  return next
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/doctor.test.ts` 그리고 `npx tsc --noEmit`
Expected: PASS 전부 · tsc 0

- [ ] **Step 5: 커밋**

```bash
git add src/game/doctor.ts src/game/doctor.test.ts && git commit -F .commit-msg-tmp
```

메시지 본문:

```
feat: 피로 입력을 건수에서 점유 시간으로

FATIGUE_PER_CASE=18은 하루 콜 5통 시대의 튜닝이었다. 콜 제한 폐지로
하루가 62~142명이 된 뒤로는 바쁜 의사가 개원 첫날 100에 포화한다 —
이대로 배율을 얹으면 조용한 침식이 아니라 2일차 전원 최대 감속이다.
근인은 단위다: 건수는 부하의 대리물일 뿐이라 보톡스 30분과 뇌수술
180분에 같은 값을 매긴다.

6시간까지는 부하 0, 초과분만 시간당 15. 완편 수익과(1인 400분대)는
회복이 우세해 저지대를 유지하고 1인 필수과만 레드존으로 간다 —
대조의 레버가 채용이 된다.

doctorCaseloads는 이제 로그의 assigneeId로 접는다. 표시용 라운드로빈
분배는 폐기했다(F-2).

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 정상근무=회복만·야간 가중·클램프·주간 누적 네 방향을 새 공식으로 옮기며 하나도 안 흘림
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 5: 세션 배선 (피로가 다음 날로 흐른다)

**Files:**
- Modify: `src/game/session.ts` (`advanceDay`·`beginWeek`·`SessionState.fatigue` 주석)
- Test: `src/game/session.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/session.test.ts`에 추가한다.

```ts
describe('피로가 다음 날 판정으로 흐른다', () => {
  it('advanceDay가 어제 스텝된 피로를 오늘 스냅샷으로 넘긴다', () => {
    let s = completeSetup({ hospitalName: 'h', doctors: { CARDIOLOGY: 1, AESTHETICS: 1 } })
    while (!s.receiving!.done) s = { ...s, receiving: decide(s.receiving!, 'ACCEPT') }
    s = completeReceiving(s)
    const stepped = s.fatigue
    s = advanceDay(s)
    expect(s.receiving!.fatigueAtOpen).toEqual(stepped)
  })

  it('개원 첫날은 전원 쌩쌩(빈 스냅샷)', () => {
    const s = completeSetup({ hospitalName: 'h', doctors: { CARDIOLOGY: 1 } })
    expect(s.receiving!.fatigueAtOpen).toEqual({})
  })
})
```

> `beginWeek`(주 간 이월)은 7일 완주가 필요해 유닛테스트로 세우면 느리고 취약하다. 대신 Task 7의 브라우저 7일 완주 실측이 그 경로를 지난다 — 코드에서는 `advanceDay`와 **같은 한 줄**이라 회귀 위험이 낮다.

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/session.test.ts -t "피로가 다음 날"`
Expected: FAIL — `fatigueAtOpen`이 `{}`(전달 안 됨)

- [ ] **Step 3: 최소 구현**

`advanceDay`의 `initReceiving` 호출에 네 번째 인자를 더한다:

```ts
    receiving: initReceiving(
      state.hospital!, weekDayQueue(state.week, day, state.beds), boardedBusyUntilFrom(state.receiving), state.fatigue,
    ),
```

`beginWeek`의 호출도(이월 점유는 없고 피로만 넘어간다 — 주 간 유지):

```ts
    receiving: initReceiving(state.hospital, weekDayQueue(state.week, 1, state.beds), {}, state.fatigue),
```

`SessionState.fatigue` 주석을 고친다:

```ts
  /**
   * 유닛별 피로도(0~100). 하루 마감(completeReceiving)에 스텝, 주 간 유지.
   * ⚠️ 2026-07-25 승격: 더 이상 표시 전용이 아니다 — 다음 날 receiving의 fatigueAtOpen으로
   * 실려 진료 소요를 늘린다(occupiedUntilMin). 판정 우선순위·사유는 그대로다.
   */
```

- [ ] **Step 4: 통과 확인**

Run: `npm test` 그리고 `npx tsc --noEmit`
Expected: **전량 PASS**(승격 전 개수 + 새 테스트) · tsc 0

> 여기서 기존 `[I8]`·「양심 경로」 등 경제 가드가 함께 돌아간다. 실패하면 §6 튜닝 계약에 따라 `FATIGUE_PER_OVER_HOUR`·`FATIGUE_SLOW_MAX`만 조정한다(구조 불변).

- [ ] **Step 5: 커밋**

```bash
git add src/game/session.ts src/game/session.test.ts && git commit -F .commit-msg-tmp
```

메시지 본문:

```
feat: 피로가 다음 날 판정으로 흐른다

advanceDay·beginWeek이 state.fatigue를 그날 receiving의 fatigueAtOpen으로
넘긴다. 어제 갈린 만큼 오늘 진료가 느려지고, 느려진 만큼 오늘도 오래
점유돼 내일 더 갈린다 — 악순환이 별도 코드 없이 두 줄에서 창발한다.

개원 첫날만 빈 맵이다(전원 쌩쌩). 주 간 리셋은 하지 않는다(기존 계약).

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 스텝 시점(completeReceiving)과 전달 시점(advanceDay)의 순서를 테스트로 고정해 하루 밀림을 차단
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 6: UI 합류 (미리보기 수리 + 색·감속 단일 출처)

**Files:**
- Modify: `src/components/CallCard.tsx:17`(import), `:237`(점유 미리보기)
- Modify: `src/components/DoctorRoster.tsx:3`(import), `:19`(색 경계)

- [ ] **Step 1: `CallCard`의 점유 미리보기를 `occupiedUntilMin` 경유로**

import 줄에 `occupiedUntilMin`을 더한다:

```tsx
import { freeDoctorsOfDept, pickAssignee, occupiedUntilMin, formatClockFromOpen as formatClock } from "@/game/daysim";
```

미리보기 블록을 교체한다:

```tsx
      {elective && canStart && assignee && (
        // 수락 결과를 사실로 — 「이 의사가 이 시각까지 묶인다」. 그 시간에 같은 과 응급이 오면
        // 못 받는다는 결론은 플레이어가 스스로 잇는다(해석 0).
        // ⚠️ 옛 코드는 start + durationMin을 직접 더해 speedFactor·피로를 둘 다 빠뜨렸다 —
        // occupiedUntilMin이 "점유 계산의 유일한 자리"라는 계약 밖에 있던 한 곳이다.
        // 이제 decide와 같은 함수·같은 인자라 카드와 실제 점유가 어긋날 수 없다.
        <p className="rounded-xs border border-frame bg-desk px-3 py-2 font-mono text-xs text-on-desk/70">
          수락 시 {assignee.name} ·{" "}
          {formatClock(
            occupiedUntilMin(assignee, start, call.durationMin ?? 0, receiving.fatigueAtOpen[assignee.id] ?? 0),
          )}
          까지 점유
        </p>
      )}
```

- [ ] **Step 2: `DoctorRoster`의 막대 색을 상수에서**

import를 고친다:

```tsx
import { doctorCaseloads, FATIGUE_RED, FATIGUE_SLOW_FROM } from "@/game/doctor";
```

`FatigueBar`의 색 줄과 주석을 교체한다:

```tsx
/**
 * 피로 막대 — 저=회백/중=황/고=적. 해석 카피 없음(막대만).
 *
 * 경계는 doctor.ts의 상수다 — **색 단계가 곧 감속 구간**이라(중=배율 시작, 고=×1.25 이상)
 * 두 곳에 숫자를 적으면 한쪽이 조용히 낡는다. 색은 강조일 뿐이라 **길이**가 판정을 나른다.
 */
function FatigueBar({ value }: { value: number }) {
  const color =
    value >= FATIGUE_RED ? "bg-alarm" : value >= FATIGUE_SLOW_FROM ? "bg-on-desk" : "bg-on-desk-muted";
```

- [ ] **Step 3: 게이트 확인**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 전부 0 에러 · 테스트 전량 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/components/CallCard.tsx src/components/DoctorRoster.tsx && git commit -F .commit-msg-tmp
```

메시지 본문:

```
fix: 점유 미리보기가 실제 점유와 어긋나던 것 수리 + 막대 색을 감속 구간과 한 출처로

CallCard는 start + durationMin을 직접 더해 베테랑 speedFactor(×0.8)를
빠뜨리고 있었다 — occupiedUntilMin이 "점유 계산의 유일한 자리"라고
선언했는데 이 한 곳이 그 계약 밖에 있었다. 피로 배율이 붙으면 어긋남이
커지므로 이번에 합류시킨다. 이제 카드가 decide와 같은 함수·같은 인자라
미리보기와 실제가 구조적으로 같다.

막대 색 경계(34·67)는 doctor.ts 상수를 임포트한다 — 색 단계가 곧 감속
구간이라(중=배율 시작, 고=×1.25 이상) 두 곳에 적으면 한쪽이 낡는다.

Skills-used: none
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 7: 실측 · 문서 · 마무리

**Files:**
- Modify: `claude-docs/plan.md` (⏸ 승격 문 해제), `claude-docs/changeLog.md` (항목 1건)
- 신설 가능: `claude-docs/troubleshooting/T-###.md` (1분+ 디버깅이 있었으면 — SDD trap 스윕)

- [ ] **Step 1: 전체 게이트**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```
Expected: 테스트 전량 PASS · tsc 0 · eslint 0 · next build 성공

- [ ] **Step 2: 브라우저 7일 완주 실측**

`preview_start`로 dev 서버를 띄우고 **순환기 1명 + 미용 3명**으로 개원해 7일을 완주한다. 확인할 것:

1. 1일차 막대 전원 0(개원 첫날 쌩쌩)
2. 주 후반 순환기 막대가 중/고 구간으로 오른다
3. 같은 시점 **미용 막대는 저지대 유지**(완편 수익과 = 회복 우세)
4. 예약 카드의 「…까지 점유」 시각이 주 초반보다 늦다
5. 돌려보냄(기다리다 감·점유 하드락)이 주 초반보다 는다
6. 콘솔 에러 0

**목표 곡선에서 벗어나면**(예: 순환기가 3일차에 이미 포화, 또는 7일 내내 34 미만) `FATIGUE_PER_OVER_HOUR`(15)·`FATIGUE_SLOW_MAX`(0.5) **두 상수만** 조정하고 게이트를 다시 돌린다. 구조는 안 바꾼다.

- [ ] **Step 3: 문서 갱신**

`claude-docs/plan.md`의 「의사 개인 유닛」 줄에서 `⏸ 후속: **승격 문(피로→판정 먹이기)**` 을 지우고(흉부외과 보류는 남긴다), 완료 항목을 「✅ 완료」 지도에 추가한다:

```markdown
- ✅ **피로 승격 — 피로가 판정을 먹는다**: 8개월째 아무것도 안 바꾸던 피로 막대가 진료 소요를 늘린다(조용한 침식). 합류는 `occupiedUntilMin` 한 자리(`fatigue = 0` 기본이라 하위호환 F-0). 전제 2개를 함께 수리 — 건수 기반 피로 상수를 **점유 분**으로(콜 제한 폐지 후 첫날 포화였다), 수용 로그에 `assigneeId`·`endMin`을 남겨 피로 장부와 판정 장부를 한 책으로(F-2). `adjudicate.ts` 0줄·판정 우선순위 0개 변경. 덤으로 CallCard 점유 미리보기가 `speedFactor`를 빠뜨리던 기존 버그 수리. 설계 [spec](../docs/superpowers/specs/2026-07-25-fatigue-adjudication-design.md)·[플랜](../docs/superpowers/plans/2026-07-25-fatigue-adjudication.md) ⏸ 후속: 사직·이탈(피로 포화 × 인력 제로섬)
```

`claude-docs/changeLog.md` 맨 위에 항목을 추가한다(**PR 번호는 적지 않는다** — 프로젝트 규약):

```markdown
## 2026-07-25 · 구현 — 피로 승격(피로가 판정을 먹는다)

- **무엇을**: 표시 전용이던 피로가 `occupiedUntilMin`에 합류해 진료 소요를 늘린다(34 이하 1.0 → 100에서 ×1.5, 연속·단조). 피로 입력을 건수에서 **점유 분**으로 바꾸고(6시간 초과분만 시간당 15), 수용 로그에 `assigneeId`·`endMin`을 남겨 피로 적립을 실제 배정에서 뽑는다. 세션은 `advanceDay`·`beginWeek`이 `state.fatigue`를 그날 `fatigueAtOpen`으로 넘긴다.
- **왜**: 부하 → 피로 → **아무것도 없음**에서 인과가 끊겨 있었다. 승격 전 두 전제가 막고 있었다 — 건수 상수는 콜 제한 폐지 후 개원 첫날 포화라 침식이 아니라 즉시 전원 최대 감속이 되고, 피로 적립(라운드로빈)과 실제 배정(pickAssignee)이 다른 책이라 막대가 지목한 의사와 느려지는 의사가 어긋났다. 대응 레버는 기존 것뿐이라(채용·거절) 휴식 최적화 퍼즐이 안 생긴다.
- **결과**: (게이트·실측 수치를 여기 채운다)
```

- [ ] **Step 4: SDD trap 스윕**

*"이번 브랜치에서 1분+ 근인 디버깅이 있었나 — 서브에이전트/리뷰어가 잡은 것 포함"*. 있으면 `claude-docs/troubleshooting/T-###.md`를 신설한다(frontmatter `summary`·`tags: type/troubleshooting` + 증상/원인/해결/재발방지 4필드). 허브 목차는 자동 생성이라 손대지 않는다.

- [ ] **Step 5: 커밋 + PR**

```bash
git add claude-docs/plan.md claude-docs/changeLog.md && git commit -F .commit-msg-tmp
git push -u origin claude/doctor-fatigue-system-status-bb1be7
gh pr create --title "feat: 피로 승격 — 피로가 판정을 먹는다" --body-file .pr-body-tmp
```

PR 본문에는 설계 링크·전제 수리 2건·게이트 결과·브라우저 실측 수치를 넣는다. **PR을 올린 뒤 사용자에게 머지 여부를 묻고 멈춘다**(글로벌 규약 — 선제 머지 금지).

---

## 자체 점검 (계획 ↔ 스펙)

| 스펙 요구 | 담당 태스크 |
|---|---|
| §2-1 건수 → 점유 분 | Task 1(상수 은퇴) + Task 4(공식) |
| §2-2 피로 장부 = 판정 장부 | Task 3(`assigneeId`·`endMin`) + Task 4(`busyMin`) |
| §2-2 각주 CallCard 버그 | Task 6 |
| §3-1 로그 필드 | Task 3 |
| §3-2 `fatigueAtOpen` 스냅샷 | Task 3 |
| §3-3 세션 배선 3지점 | Task 3(`completeSetup` 기본값) + Task 5(`advanceDay`·`beginWeek`) |
| §4-1 새 스텝 공식 | Task 4 |
| §4-2 `fatigueSlowFactor` + 합류 | Task 1 + Task 2 |
| §4-2 색·감속 단일 출처 | Task 6 |
| §4-3 새 표면 0 | Task 6(기존 표면만 수정) — 신규 UI 태스크 없음이 곧 준수 |
| §6 F-0 / F-1 / F-2 | Task 2(F-0·F-1) · Task 3·4(F-2) |
| §6 기존 불변식 green | Task 5 Step 4(전량) · Task 7 Step 1 |
| §6 실측 | Task 7 Step 2 |
| §6 튜닝 계약 | Task 5 Step 4 주석 · Task 7 Step 2 |
| §7 문서 | Task 7 Step 3 |
