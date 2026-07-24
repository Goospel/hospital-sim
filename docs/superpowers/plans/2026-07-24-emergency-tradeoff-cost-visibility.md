---
tags:
  - type/plan
---

# 트레이드오프 「예약 미루고 받기」 + 대가 가시화 (PR 2) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예약 카드에 수락 대가(담당의 점유·비활성 사유)를 사실로 표기하고, 응급이 왔는데 그 과 의사가 전원 예약 진료 중일 때 **「예약 미루고 받기」**(BUMP)로 진행 중 예약을 중단하고 응급을 받는 선택지를 연다 — 수익 포기를 대가로.

**Architecture:** 코어 리듀서 `decide`에 점유 **원인**을 추적하는 `busyWith` 필드를 순수 추가(additive)한 뒤, 그 위에 `'BUMP_ACCEPT'` 액션을 얹는다. BUMP는 하드락을 뚫지 못한다(하드락이면 무효 — 벽은 코드가 세운다). 대가 가시화는 `startMinFor`가 이미 계산하는 값을 화면에 **표시만** 추가하는 UI 전용 변경이다. 스펙: [2026-07-24-emergency-agency-fun-design.md](../specs/2026-07-24-emergency-agency-fun-design.md) §3·§5.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · vitest 4.

## Global Constraints

- **판정 = 결정론 코드.** `src/game/*`에 `Math.random`·`Date.now` 금지. 실시간은 컴포넌트 레이어에만.
- **하드락은 절대다.** 배후과 없음·야간 당직 공백은 어떤 액션(BUMP 포함)으로도 못 뚫는다 — BUMP는 "하드락이 아닌데 그 과 의사가 전원 예약 점유라 지금은 못 받는" 경우에만 유효하다.
- **해석 카피 0 (show-don't-tell).** 화면에 "위험하다"·"당신 탓이다" 류 해석 문구 금지 — 숫자·명사·사유 라벨만. BUMP 버튼 라벨도 사실만("예약 미루고 받기 — 김민준 진료 중단 · −10만원").
- **게이트:** 각 태스크 종료 시 `npm test` 전체 green **그리고** `npx tsc --noEmit` 0 에러(vitest는 타입체크를 안 한다 — 메모 vitest-no-typecheck-tsc-gate). 마지막 태스크에서 `npm run lint`까지(경고는 `_seed`·`initSystem` 2건이 `origin/main` 선재 — 이 브랜치가 늘리지만 않으면 된다).
- **한글 커밋:** 메시지를 `.commit-msg-tmp`(UTF-8)에 쓰고 `git commit -F .commit-msg-tmp`(T-026). 트레일러(`Skills-used:` ~ `Co-Authored-By:`)는 **빈 줄 없이 연속**으로 맨 끝에. `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. `Skills-used:`는 실제로 `Skill` 도구를 호출한 것만(안 썼으면 `none` — 실측 집계에 쓰인다).
- **새 md 문서에는 폴더별 frontmatter 태그**(`type/*`) — pre-commit 검사기가 거부한다.
- 기존 코드의 주석 밀도·한국어 서술 스타일을 따른다(이 저장소는 주석을 사실상 스펙으로 쓴다).

## 베이스라인 (PR 1 머지 후)

- `origin/main` = `c8a5234`(PR 1 포함). 이 브랜치 `feat/emergency-tradeoff-cost-visibility`는 그 기준.
- `npm test` **440/440 green**, `tsc --noEmit` 0, `lint` 0 errors / 2 warnings(선재).
- 관련 현재 상태:
  - `decide(state, action: DecisionAction)` — `DecisionAction = 'ACCEPT' | 'DECLINE' | 'TIMEOUT'`. 수용 시 `busyUntil = { ...busyUntil, [assignee.id]: start + durationMin }`.
  - `CallDisposition = 'HARDLOCK_REJECT' | 'CHOICE'`.
  - `ReceivingState`에 `busyUntil: Record<string, number>`(언제까지)만 있고 **원인은 없다**.
  - `CallCard.tsx` 예약 분기: `waitMin > 0`이면 「N분 대기 후 진료 시작 · {assignee.name}」 안내가 뜬다. 「받기」는 `disabled={!canStart}`이나 **비활성 사유는 무표시**.
  - daysim 헬퍼: `freeDoctorsOfDept(roster, busyUntil, dept, atMin)` · `pickAssignee(free, busyUntil)` · `earliestFreeMin(roster, busyUntil, dept)` · `handlingDept(call)`(from doctor.ts).

## 파일 지도 (이 PR이 만지는 곳)

| 파일 | 무엇이 바뀌나 |
|---|---|
| `src/game/receiving.ts` | `ReceivingState.busyWith` 신설 · `decide` 수용 시 busyWith 채움 · `CallDisposition`에 `'BUMPED'` · `bumpTarget`/`canBump` 신설 · `decide`의 `BUMP_ACCEPT` 분기 · `DecisionAction`에 `'BUMP_ACCEPT'` · `unacceptedGroups` outcome · `initReceiving` busyWith 초기화 · `occupancyPreview` 헬퍼(대가 표시) |
| `src/components/CallCard.tsx` | 예약 카드 점유 미리보기 + 비활성 사유(§5) · 응급 카드 BUMP 버튼(§3) |
| `src/components/ReceivingPhase.tsx` · `SessionClient.tsx` | `onDecide` 타입은 `DecisionAction`이라 자동 확장 — BUMP 배선 확인만 |
| `src/game/receiving.test.ts` | busyWith · bumpTarget/canBump · BUMP_ACCEPT · 점유 미리보기 테스트 |
| `README.md` · `claude-docs/changeLog.md` · `claude-docs/plan.md` | 문서 정합(Task 6) |

---

### Task 1: 대가 가시화 — 예약 카드 점유 미리보기 + 비활성 사유 (§5)

**Files:**
- Modify: `src/components/CallCard.tsx` (예약 분기 `elective ? (…)`)
- Test: 없음(레포에 컴포넌트 테스트 하네스 없음 — jsdom·testing-library 미설치). 컨트롤러 브라우저 실측으로 검증.

**Interfaces:**
- Consumes: 기존 `startMinFor`·`freeDoctorsOfDept`·`pickAssignee`·`callDelta`(전부 CallCard가 이미 import).
- Produces: 없음(UI 전용). 코어 무변경 — 이 태스크는 `src/game/`을 건드리지 않는다.

이 태스크가 먼저인 이유: 코어 무변경이라 위험이 없고, 그 자체로 "결정을 정보 있는 도박으로" 만드는 즉시 가치가 있다. BUMP(§3)의 코어 작업과 독립적이다.

- [ ] **Step 1: 점유 미리보기 — 「받기」 활성일 때 수락 결과를 표기**

`src/components/CallCard.tsx`의 예약 분기에서, 현재 `waitMin > 0` 안내는 **기다려야 하는 경우만** 뜬다. 「받기」가 활성(`canStart`)이면 **수락 시 담당의가 언제까지 점유되는지**를 항상 보여준다. 예약 분기 `<div className="mt-auto flex flex-wrap gap-3">`(받기/보내기 버튼 그룹) **바로 위**에 삽입:

```tsx
      {elective && canStart && assignee && (
        // 수락 결과를 사실로 — 「이 의사가 이 시각까지 묶인다」. 그 시간에 같은 과 응급이 오면
        // 못 받는다는 결론은 플레이어가 스스로 잇는다(해석 0). start·durationMin은 decide와 같은
        // 값이라(startMinFor 공유) 카드에 뜬 미리보기와 실제 점유가 어긋나지 않는다.
        <p className="rounded-xs border border-frame bg-desk px-3 py-2 font-mono text-xs text-on-desk/70">
          수락 시 {assignee.name} · {formatClock(start + (call.durationMin ?? 0))}까지 점유
        </p>
      )}
```

⚠️ `start`는 `startMinFor`의 반환이라 `number | 'LEFT_WAITING' | 'NO_FREE_SPECIALIST'` 유니온이다. `canStart`(= `typeof start === 'number'`) 가드 안에서만 `start + …`를 쓰므로 타입이 좁혀진다 — 조건 `elective && canStart && assignee`가 그걸 보장한다. `formatClock`은 이 파일에 이미 있나 확인하고, 없으면 `ReceivingPhase.tsx`의 `formatClock`(DAY_OPEN_MIN 기준 HH:MM)과 같은 규칙으로 이 파일 상단에 추가한다(중복이면 import).

**확인**: `formatClock`이 `CallCard.tsx`에 있는지 Grep으로 먼저 본다. `ReceivingPhase.tsx`에만 있고 export되지 않았으면, `daysim.ts`에 `formatClockFromOpen(min): string`를 신설해 두 컴포넌트가 공유하게 하거나(권장 — 단일 출처), CallCard에 지역 함수로 복제하되 그 사실을 주석에 남긴다. **단일 출처가 낫다** — 두 곳에 같은 시각 포맷을 적으면 한쪽이 낡는다.

- [ ] **Step 2: 비활성 사유 표시 — 「받기」가 disabled인 이유**

「받기」가 `!canStart`로 비활성일 때(그 과 의사가 아예 없거나 대기 한계 초과), 지금은 무표시다. 예약 분기의 대기 안내(`waitMin > 0`) 블록을 확장해, **비활성일 때 사유를 표기**한다. 현재 `{waitMin > 0 && (…)}` 블록을 다음으로 교체:

```tsx
      {elective && !canStart && (
        // 받기가 잠긴 이유를 사실로 — 「그 과 의사가 다 진료 중, N시에 자리」 또는 「그 과 의사 없음」.
        // 선택진료는 하드락이 아니라 사유 도장을 안 쓴다(그건 응급의 구조적 벽 전용). 담백한 한 줄.
        <p className="rounded-xs border border-frame bg-desk px-3 py-2 font-mono text-xs text-on-desk/70">
          {start === 'NO_FREE_SPECIALIST'
            ? `${DEPARTMENTS.find((d) => d.key === dept)?.label ?? dept} 의사가 없습니다`
            : `${DEPARTMENTS.find((d) => d.key === dept)?.label ?? dept} 의사가 모두 진료 중 · 오늘 자리 없음`}
        </p>
      )}
```

`DEPARTMENTS`는 `@/game/setup`에서 import(예약 분기가 과 라벨을 쓰므로). 이미 import돼 있는지 확인하고 없으면 추가. `dept`(= `handlingDept(call)`)는 이 컴포넌트에 이미 있다.

⚠️ `start === 'LEFT_WAITING'`도 `!canStart`에 포함된다(자리는 결국 나지만 늦음). 위 else 문구("모두 진료 중 · 오늘 자리 없음")가 그 경우도 사실에 부합한다 — 선택진료는 하루 안에 대기 한계를 넘기면 못 받으니 "오늘 자리 없음"이 맞다.

- [ ] **Step 3: 게이트 + 브라우저 검증**

Run: `npm test && npx tsc --noEmit`
Expected: 440/440 green(코어 무변경이라 불변), 타입 0.
브라우저(컨트롤러): 예약 카드에서 ① 받기 활성 시 「수락 시 … 까지 점유」 표기 ② 그 과 미채용/전원 점유 시 받기 비활성 + 사유 문구.

- [ ] **Step 4: 커밋**

```
feat: 예약 카드에 대가 가시화 — 점유 미리보기·비활성 사유 (스펙 §5)

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 2: `busyWith` 추적 필드 — 점유 원인 (동작 보존)

**Files:**
- Modify: `src/game/receiving.ts` (`ReceivingState` 인터페이스 · `initReceiving` · `decide` 수용 경로)
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Produces: `ReceivingState.busyWith: Record<string, { callId: string; kind: CallKind; deltaManwon: number }>` — Task 3·4가 읽는다. `decide`가 수용 시 담당의 id로 채운다.
- **동작 보존**: 이 필드는 순수 추가다. 아무 판정 로직도 아직 읽지 않으므로 게임 동작은 불변, 440/440이 그대로여야 한다.

- [ ] **Step 1: RED 테스트** — `src/game/receiving.test.ts`의 `describe('decide (시간 점유) …')` 인근에 추가:

```ts
describe('busyWith — 점유 원인 추적 (스펙 2026-07-24 §3)', () => {
  it('수용 시 담당의 id에 {callId, kind, deltaManwon}이 실린다', () => {
    const h = hospitalOf(conscientious) // 순환기 2 — 월요일 예약은 순환기
    const elective = dayCall('SPECIALIST_ELECTIVE')
    const after = decide(initReceiving(h, [elective]), 'ACCEPT')
    const entries = Object.values(after.busyWith)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      callId: elective.id,
      kind: 'SPECIALIST_ELECTIVE',
      deltaManwon: callDelta('SPECIALIST_ELECTIVE'),
    })
  })
  it('미수용이면 busyWith가 비어 있다', () => {
    const h = hospitalOf(conscientious)
    const after = decide(initReceiving(h, [dayCall('SPECIALIST_ELECTIVE')]), 'DECLINE')
    expect(after.busyWith).toEqual({})
  })
  it('초기 상태의 busyWith는 빈 맵', () => {
    expect(initReceiving(hospitalOf(conscientious)).busyWith).toEqual({})
  })
})
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run src/game/receiving.test.ts -t busyWith`
Expected: FAIL — `busyWith` 프로퍼티 없음(타입·런타임).

- [ ] **Step 3: 구현** — `src/game/receiving.ts`

`ReceivingState` 인터페이스에서 `busyUntil` 필드 **바로 아래**에 추가:

```ts
  /**
   * 각 유닛이 **무엇 때문에** 점유됐는가 — busyUntil("언제까지")의 짝이다.
   * BUMP(예약 미루고 받기)가 "밀어낼 선택진료 점유"를 찾고 그 수익을 회수하려면 원인이 필요하다.
   * 이월 점유(어제 넘어온 boardedBusyUntil)는 원인 콜 정보가 없어 여기 실리지 않는다 —
   * 그래서 어제 시작한 진료는 오늘 BUMP 대상이 아니다(어제 수익을 오늘 되돌리지 않는다).
   */
  busyWith: Record<string, { callId: string; kind: CallKind; deltaManwon: number }>
```

`initReceiving`의 반환 객체에 `busyUntil` 아래 추가:

```ts
    busyWith: {}, // 이월 점유는 원인 정보가 없어 비운다(위 필드 주석)
```

`decide`의 수용 경로(`if (effectiveAccept && canStart) { … }`)를 busyWith도 채우도록 교체:

```ts
  let busyUntil = state.busyUntil
  let busyWith = state.busyWith
  let startMin: number | undefined
  if (effectiveAccept && canStart) {
    const free = freeDoctorsOfDept(roster, state.busyUntil, handlingDept(call), start)
    const assignee = pickAssignee(free, state.busyUntil)
    busyUntil = { ...state.busyUntil, [assignee.id]: start + (call.durationMin ?? 0) }
    busyWith = {
      ...state.busyWith,
      [assignee.id]: { callId: call.id, kind: call.kind, deltaManwon: callDelta(call.kind) },
    }
    startMin = start
  }
```

그리고 `decide` 반환 객체에 `busyUntil` 아래 `busyWith,` 추가.

- [ ] **Step 4: GREEN + 게이트**

Run: `npm test && npx tsc --noEmit`
Expected: 443/443(440 + 신규 3), 타입 0. **기존 440이 하나도 안 깨져야 한다**(동작 보존 — busyWith를 읽는 판정이 아직 없다).

- [ ] **Step 5: 커밋**

```
feat: busyWith — 점유 원인 추적 필드 (BUMP의 발판, 동작 보존)

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 순수 추가 필드를 기존 440 불변 + 신규 3 green으로 잠금
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 3: BUMP 판정 헬퍼 — `bumpTarget` · `canBump`

**Files:**
- Modify: `src/game/receiving.ts`
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Consumes: Task 2의 `state.busyWith`.
- Produces:
  - `bumpTarget(state: ReceivingState, call: IncomingCall): string | undefined` — 밀어낼 의사 id(그 과 선택진료 점유 중 **가장 일찍 풀리는** 의사), 없으면 undefined.
  - `canBump(state: ReceivingState, call: IncomingCall): boolean` — BUMP 버튼을 열 조건. Task 4·5가 쓴다.

- [ ] **Step 1: RED 테스트** — `src/game/receiving.test.ts`:

```ts
describe('BUMP 판정 — bumpTarget · canBump (스펙 2026-07-24 §3)', () => {
  const soloCardio = hospitalWith('CARDIOLOGY', 1) // 순환기 1명
  const stemiDay = () => ({ ...dayCall('STEMI'), nightShift: false })
  const electiveCardio = () => ({ ...dayCall('SPECIALIST_ELECTIVE'), nightShift: false })

  // 순환기 1명이 예약으로 점유된 상태를 만든다: 예약 콜을 먼저 ACCEPT.
  function afterElectiveThenStemi() {
    const q = [electiveCardio(), stemiDay()]
    return decide(initReceiving(soloCardio, q), 'ACCEPT') // index 0(예약) 수용 → index 1(STEMI)이 현재
  }

  it('그 과 의사가 예약으로 다 점유면 bumpTarget = 그 의사', () => {
    const s = afterElectiveThenStemi()
    const target = bumpTarget(s, s.queue[s.index])
    expect(target).toBe(rosterOf(soloCardio)[0].id)
  })

  it('canBump = true — 하드락 아님 + 자유 의사 0 + 선택진료 점유 있음', () => {
    const s = afterElectiveThenStemi()
    expect(canBump(s, s.queue[s.index])).toBe(true)
  })

  it('그 과 의사가 자유면 canBump = false (BUMP 불필요)', () => {
    const s = initReceiving(soloCardio, [stemiDay()]) // 아무도 점유 안 함
    expect(canBump(s, s.queue[s.index])).toBe(false)
    expect(bumpTarget(s, s.queue[s.index])).toBeUndefined()
  })

  it('그 과 미채용이면 canBump = false (하드락 NO_BACKUP_CARE — 밀어낼 의사 없음)', () => {
    const noCardio = hospitalOf(collaborator)
    const s = initReceiving(noCardio, [stemiDay()])
    expect(canBump(s, s.queue[s.index])).toBe(false)
    expect(bumpTarget(s, s.queue[s.index])).toBeUndefined()
  })

  it('점유 원인이 응급이면 canBump = false (응급은 응급을 밀어내지 않는다)', () => {
    // 순환기 1명이 STEMI로 점유된 상태에서 또 STEMI가 오면, 그 점유는 응급이라 BUMP 불가.
    const q = [stemiDay(), stemiDay()]
    const s = decide(initReceiving(soloCardio, q), 'ACCEPT') // index 0(STEMI) 수용 → index 1이 현재
    expect(canBump(s, s.queue[s.index])).toBe(false)
    expect(bumpTarget(s, s.queue[s.index])).toBeUndefined()
  })

  it('야간 당직 공백(하드락)이면 canBump = false — BUMP는 하드락을 못 뚫는다', () => {
    const nightStemi = { ...dayCall('STEMI'), nightShift: true }
    const q = [electiveCardio(), nightStemi]
    const s = decide(initReceiving(soloCardio, q), 'ACCEPT')
    // 순환기 1명이라 야간엔 NO_NIGHT_BACKUP 하드락 — 예약 점유가 있어도 BUMP 무효
    expect(canBump(s, s.queue[s.index])).toBe(false)
  })
})
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run src/game/receiving.test.ts -t BUMP`
Expected: FAIL — `bumpTarget`·`canBump` 미정의.

- [ ] **Step 3: 구현** — `src/game/receiving.ts`의 `hardlockReason` 뒤에 추가:

```ts
/**
 * BUMP(예약 미루고 받기)로 밀어낼 의사 id — 그 과 의사 중 **선택진료로 점유된** 것 가운데
 * 가장 일찍 풀리는 하나. 없으면 undefined(밀어낼 예약이 없다).
 *
 * "선택진료로 점유"는 busyWith[id].kind가 선택진료인지로 판별한다 — 응급 점유는 후보가 아니다
 * (응급은 응급을 밀어내지 않는다, §3). 이월 점유는 busyWith에 없어 자동으로 제외된다.
 */
export function bumpTarget(state: ReceivingState, call: IncomingCall): string | undefined {
  const dept = handlingDept(call)
  const roster = state.hospital.roster ?? []
  const candidates = roster.filter((d) => {
    if (d.dept !== dept) return false
    const w = state.busyWith[d.id]
    return w !== undefined && isElective(w.kind)
  })
  if (candidates.length === 0) return undefined
  // 가장 일찍 풀리는 의사(pickAssignee와 같은 규칙 — busyUntil 오름차순).
  return candidates.reduce((min, d) =>
    (state.busyUntil[d.id] ?? 0) < (state.busyUntil[min.id] ?? 0) ? d : min,
  ).id
}

/**
 * 「예약 미루고 받기」 버튼을 열 조건 — 셋 다 참일 때만:
 *   1) 하드락이 아니다(disposition CHOICE) — BUMP는 구조의 벽을 못 뚫는다(하드락이면 무효, §2 표).
 *   2) 그 과에 지금 자유 의사가 0 — 자유 의사가 있으면 그냥 ACCEPT하면 되니 BUMP는 불필요.
 *   3) 밀어낼 선택진료 점유가 있다(bumpTarget ≠ undefined).
 */
export function canBump(state: ReceivingState, call: IncomingCall): boolean {
  const roster = state.hospital.roster ?? []
  if (hardlockReason(state.hospital, call, state.busyUntil, roster) !== null) return false
  const arrivalMin = call.arrivalMin ?? 0
  if (freeDoctorsOfDept(roster, state.busyUntil, handlingDept(call), arrivalMin).length > 0) return false
  return bumpTarget(state, call) !== undefined
}
```

- [ ] **Step 4: GREEN + 게이트**

Run: `npm test && npx tsc --noEmit`
Expected: 449/449(443 + 신규 6), 타입 0.

- [ ] **Step 5: 커밋**

```
feat: BUMP 판정 — bumpTarget·canBump (하드락은 못 뚫는다)

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 하드락 우선·응급 비대상·자유 의사 예외를 케이스별 Red로 잠금
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 4: `BUMP_ACCEPT` 액션 — 예약 중단·수익 회수·응급 수용

**Files:**
- Modify: `src/game/receiving.ts` (`DecisionAction` · `CallDisposition` · `decide` · `unacceptedGroups`)
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Consumes: Task 3의 `bumpTarget`·`canBump`, Task 2의 `busyWith`.
- Produces: `decide(state, 'BUMP_ACCEPT')` — 밀어낸 예약의 로그 엔트리를 `{accepted:false, disposition:'BUMPED', reason:null, startMin:undefined}`로 교체(수익 회수), 현재 응급을 수용(그 의사 재점유). `CallDisposition`에 `'BUMPED'`. `unacceptedGroups`에서 `'예약 중단'`.

- [ ] **Step 1: RED 테스트** — `src/game/receiving.test.ts`:

```ts
describe('BUMP_ACCEPT — 예약 미루고 받기 (스펙 2026-07-24 §3)', () => {
  const soloCardio = hospitalWith('CARDIOLOGY', 1)
  const stemiDay = () => ({ ...dayCall('STEMI'), nightShift: false })
  const electiveCardio = () => ({ ...dayCall('SPECIALIST_ELECTIVE'), nightShift: false })

  function bumped() {
    const q = [electiveCardio(), stemiDay()]
    const afterElective = decide(initReceiving(soloCardio, q), 'ACCEPT') // 예약 수용, STEMI가 현재
    return { before: afterElective, after: decide(afterElective, 'BUMP_ACCEPT') }
  }

  it('밀어낸 예약은 로그가 BUMPED로 바뀌고 수용에서 빠진다', () => {
    const { after } = bumped()
    const electiveEntry = after.log.find((e) => e.callId === 'd1c1' /* electiveCardio id */)
      ?? after.log[0]
    expect(after.log[0].accepted).toBe(false)
    expect(after.log[0].disposition).toBe('BUMPED')
    expect(after.log[0].reason).toBeNull()
  })

  it('응급은 수용된다 — 그 의사가 응급으로 재점유', () => {
    const { after } = bumped()
    const doctorId = rosterOf(soloCardio)[0].id
    // 마지막 로그(STEMI)가 accepted, busyWith가 STEMI로 갈렸다
    expect(after.log[after.log.length - 1].accepted).toBe(true)
    expect(after.busyWith[doctorId].kind).toBe('STEMI')
  })

  it('예약 수익은 회수되고 응급 델타가 더해진다', () => {
    const { before, after } = bumped()
    // before(예약만 수용) 순이익에서 예약 델타를 빼고 STEMI 델타를 더한 값
    const expected = before.netProfitDeltaManwon - callDelta('SPECIALIST_ELECTIVE') + callDelta('STEMI')
    expect(after.netProfitDeltaManwon).toBe(expected)
  })

  it('BUMP 불가 상태에서 BUMP_ACCEPT는 일반 판정으로 폴백한다(하드락이면 미수용)', () => {
    const noCardio = hospitalOf(collaborator) // NO_BACKUP_CARE
    const after = decide(initReceiving(noCardio, [stemiDay()]), 'BUMP_ACCEPT')
    expect(after.log[0].accepted).toBe(false)
    expect(after.log[0].disposition).toBe('HARDLOCK_REJECT')
  })

  it('마감 목록에서 BUMPED는 「예약 중단」으로 접힌다', () => {
    const { after } = bumped()
    const groups = unacceptedGroups(after)
    expect(groups.some((g) => g.outcome === '예약 중단')).toBe(true)
  })
})
```

⚠️ 위 `'d1c1'`은 `dayCall`이 만드는 id에 맞춰라 — `dayCall`/`createCallQueue`가 부여하는 실제 id를 픽스처에서 확인하고(예: 큐 배열 인덱스 기반), 안 맞으면 `after.log[0]`(첫 콜 = 예약)로 단언한다. 로그 순서는 큐 순서이므로 index 0이 예약이다.

- [ ] **Step 2: RED 확인**

Run: `npx vitest run src/game/receiving.test.ts -t BUMP_ACCEPT`
Expected: FAIL — `'BUMP_ACCEPT'`가 `DecisionAction`에 없음(타입) 또는 폴백 처리됨.

- [ ] **Step 3: 구현**

`DecisionAction`에 추가:

```ts
export type DecisionAction = 'ACCEPT' | 'DECLINE' | 'TIMEOUT' | 'BUMP_ACCEPT'
```

`CallDisposition`에 추가:

```ts
export type CallDisposition = 'HARDLOCK_REJECT' | 'CHOICE' | 'BUMPED'
```

`decide` 함수 **맨 앞**(현재 콜을 읽은 직후)에 BUMP 분기를 별도 경로로 처리한다 — 일반 경로와 로그 조작 방식이 달라 섞으면 복잡해진다. `decide` 본문 시작부(`const call = …` 다음)에 삽입:

```ts
  // BUMP는 별도 경로다: 과거 예약 로그를 되돌리고(수익 회수) 현재 응급을 수용한다.
  // 조건 불충족이면 일반 판정으로 폴백한다(BUMP_ACCEPT를 하드락 응급에 눌러도 안전).
  if (action === 'BUMP_ACCEPT' && canBump(state, call)) {
    return applyBump(state, call)
  }
```

그리고 `decide` 뒤에 `applyBump`를 신설:

```ts
/**
 * 「예약 미루고 받기」 실행 — 밀어낼 의사의 진행 중 예약을 중단하고 현재 응급을 그 의사로 받는다.
 * canBump가 참일 때만 불린다(bumpTarget ≠ undefined 보장).
 *
 * 로그 조작: 밀어낸 예약의 기존 엔트리(accepted:true)를 BUMPED로 되돌린다 — 받은 콜 수에서 빠지고
 * 그 수익도 netProfitDelta에서 회수된다. 응급은 현재 index에 accepted로 새로 남는다. 두 사건이
 * 로그에 다 보여야 "무엇을 포기하고 무엇을 받았나"가 마감 화면에 남는다.
 */
function applyBump(state: ReceivingState, call: IncomingCall): ReceivingState {
  const targetId = bumpTarget(state, call)! // canBump가 참이라 반드시 있다
  const bumped = state.busyWith[targetId] // 중단되는 예약의 원인 {callId, kind, deltaManwon}
  const arrivalMin = call.arrivalMin ?? 0

  // 밀어낸 예약의 로그 엔트리를 BUMPED로 되돌린다(불변 map).
  const log = state.log.map((e) =>
    e.callId === bumped.callId && e.accepted
      ? { ...e, accepted: false, disposition: 'BUMPED' as CallDisposition, reason: null, startMin: undefined }
      : e,
  )

  // 그 의사를 응급으로 재점유(지금부터 durationMin 동안). 예약 수익 회수 + 응급 델타 반영.
  const busyUntil = { ...state.busyUntil, [targetId]: arrivalMin + (call.durationMin ?? 0) }
  const busyWith = {
    ...state.busyWith,
    [targetId]: { callId: call.id, kind: call.kind, deltaManwon: callDelta(call.kind) },
  }
  const netProfitDeltaManwon = state.netProfitDeltaManwon - bumped.deltaManwon + callDelta(call.kind)
  const lawsuitExposure = call.lawsuitRisk ? state.lawsuitExposure + 1 : state.lawsuitExposure

  const index = state.index + 1
  return {
    ...state,
    clockMin: arrivalMin,
    busyUntil,
    busyWith,
    netProfitDeltaManwon,
    lawsuitExposure,
    log: [...log, { callId: call.id, accepted: true, disposition: 'CHOICE', reason: null, startMin: arrivalMin }],
    index,
    done: index >= state.queue.length,
  }
}
```

`unacceptedGroups`의 outcome 매핑에 BUMPED 추가(`entry.disposition === 'HARDLOCK_REJECT'` 검사 앞):

```ts
    const outcome =
      entry.reason === 'LEFT_WAITING'
        ? '기다리다 감'
        : entry.reason === 'UNANSWERED'
          ? '응답 없음'
          : entry.disposition === 'BUMPED'
            ? '예약 중단'
            : entry.disposition === 'HARDLOCK_REJECT'
              ? '하드락'
              : '거절'
```

- [ ] **Step 4: GREEN + 게이트**

Run: `npm test && npx tsc --noEmit`
Expected: 454/454(449 + 신규 5), 타입 0. 기존 테스트 불변(BUMP_ACCEPT는 새 액션이라 기존 호출부에 없다).

- [ ] **Step 5: 커밋**

```
feat: BUMP_ACCEPT — 예약 중단·수익 회수·응급 수용 (스펙 §3)

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 로그 되돌림·수익 회수·폴백을 케이스별 Red로 잠금
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 5: BUMP 버튼 UI + 배선

**Files:**
- Modify: `src/components/CallCard.tsx` (응급 분기에 조건부 제3 버튼)
- Test: 없음(컴포넌트 하네스 없음 — 컨트롤러 브라우저 실측).

**Interfaces:**
- Consumes: Task 3의 `canBump`·`bumpTarget`, Task 4의 `'BUMP_ACCEPT'` 액션. `onDecide` prop은 `(action: DecisionAction) => void`라 이미 BUMP_ACCEPT를 받는다(타입 자동 확장 — ReceivingPhase·SessionClient 무변경).
- Produces: 없음(UI).

- [ ] **Step 1: 응급 분기에 BUMP 버튼** — `src/components/CallCard.tsx`

응급 분기에서 `canBump`·밀어낼 의사 이름을 계산해, 조건 충족 시 「받기」/「돌려보내기」 그룹 **아래**에 제3 버튼을 렌더한다. 먼저 import에 `canBump, bumpTarget`를 `@/game/receiving`에서 추가하고, 응급 분기 진입부(도장·카운트다운 계산 근처)에 다음을 둔다:

```tsx
  const bumpable = !elective && canBump(receiving, call);
  const bumpDoctor = bumpable
    ? (receiving.hospital.roster ?? []).find((d) => d.id === bumpTarget(receiving, call))
    : undefined;
  const bumpedDelta = bumpDoctor ? receiving.busyWith[bumpDoctor.id]?.deltaManwon ?? 0 : 0;
```

응급 분기의 버튼 그룹 `<div className="flex flex-wrap gap-3">…받기…돌려보내기…</div>` **바로 아래**(같은 부모 `<div className="mt-auto flex flex-col gap-3">` 안)에 추가:

```tsx
          {bumpable && bumpDoctor && (
            // 「예약 미루고 받기」 — 라벨은 사실만: 누구의 진료를 중단하고 얼마를 잃는가(해석 0).
            // 하드락이면 canBump가 false라 이 버튼은 애초에 안 뜬다(구조의 벽은 못 뚫는다).
            <button
              type="button"
              onClick={() => onDecide('BUMP_ACCEPT')}
              aria-label={`예약 미루고 받기 — ${bumpDoctor.name} 진료 중단`}
              className="rounded-xs border border-frame bg-desk py-3 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
            >
              예약 미루고 받기 · {bumpDoctor.name} 진료 중단 · {formatSignedManwon(-bumpedDelta)}
            </button>
          )}
```

`formatSignedManwon`은 이 파일에 이미 import돼 있다(수가 내역에 쓰임). `-bumpedDelta`로 회수액을 음수로 표기한다(예: `−10만원`).

⚠️ `canBump`/`bumpTarget`은 순수 함수이고 인자가 `(receiving, call)`이다 — CallCard가 이미 `receiving`·`call`을 갖고 있으므로 그대로 넘긴다.

- [ ] **Step 2: 게이트 + 브라우저 검증**

Run: `npm test && npx tsc --noEmit`
Expected: 454/454 green(UI 전용 — 코어 무변경), 타입 0.
브라우저(컨트롤러): 순환기 1명으로 개원 → 순환기 예약을 받아 그 의사 점유 → 같은 날 순환기 응급(STEMI) 도착 시 ① 「예약 미루고 받기 · {이름} 진료 중단 · −N만원」 버튼이 뜨는지 ② 누르면 예약이 마감 목록에 「예약 중단」으로, STEMI가 수용으로 남는지 ③ 하드락 응급(내과 미채용 고열)에선 이 버튼이 **안 뜨는지**.

- [ ] **Step 3: 커밋**

```
feat: 「예약 미루고 받기」 버튼 — 응급 카드 제3 선택지 (스펙 §3)

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 6: 문서 정합 + 최종 게이트

**Files:**
- Modify: `README.md`(플레이 방법 2번) · `claude-docs/plan.md` · `claude-docs/changeLog.md`

**Interfaces:**
- Consumes: Task 1~5 완료.
- Produces: PR 준비 완료 브랜치.

- [ ] **Step 1: README 「플레이 방법」 2번에 트레이드오프·대가 한 줄 추가** — 기존 문장은 유지하고, 응급 결정 서술 뒤에 다음 취지를 덧붙인다(문체는 주변과 맞춘다):

> 그 과 의사가 전부 예약 진료 중이면 「예약 미루고 받기」가 열린다 — 진행 중 예약을 중단(수익 포기)하고 응급을 받는 선택. 예약 카드는 수락 시 담당의가 언제까지 묶이는지, 못 받으면 왜 못 받는지를 미리 보여준다.

- [ ] **Step 2: plan.md·changeLog.md 갱신** — plan.md의 「재미 개선 3종」 섹션에서 PR 2를 ✅로(PR 3은 🔜/⬜ 유지), changeLog.md 맨 위에 `## 2026-07-24 · 예약 미루고 받기 + 대가 가시화 (재미 개선 PR 2)` 항목(PR 번호 생략 — 프로젝트 규약). 의도·결과 중심으로.

- [ ] **Step 3: trap 스윕(프로젝트 규약)** — 이번 브랜치에서 1분+ 근인 디버깅이 있었나(서브에이전트·리뷰어가 잡은 것 포함)? 있으면 `claude-docs/troubleshooting/T-###.md` 신설(현재 최신 확인 후 다음 번호, frontmatter `summary` + `tags: [type/troubleshooting]` + 4필드), 목차는 `scripts/rebuild-troubleshooting-index.ps1`로 재생성(직접 편집 금지). 없으면 넘어간다.

- [ ] **Step 4: 최종 게이트 + 커밋**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 전부 통과. lint 경고는 선재 2건(`_seed`·`initSystem`)만 — 늘지 않았는지 확인.

```
docs: 예약 미루고 받기·대가 가시화 반영 — README·plan/changeLog

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## 셀프리뷰 기록

- **스펙 커버리지**: §3(트레이드오프) → Task 2(busyWith)·3(판정)·4(액션)·5(버튼) / §5(대가 가시화) → Task 1(점유 미리보기·비활성 사유). §2 표의 `BUMP_ACCEPT` 행 → Task 4. §6(폐업)은 **PR 3 별도 계획**(이 PR 스코프 밖).
- **자리표시자**: 없음 — 모든 코드 블록이 실제 삽입물. `formatClock` 공유 여부(Task 1)·`dayCall` id(Task 4)는 구현자가 확인할 지점으로 명시.
- **타입 일관성**: `busyWith: Record<string, {callId, kind, deltaManwon}>`가 Task 2 정의 → 3(bumpTarget)·4(applyBump)·5(bumpedDelta)에서 동일 형태로 소비. `DecisionAction`에 `'BUMP_ACCEPT'`(Task 4) → 5가 디스패치. `CallDisposition`에 `'BUMPED'`(Task 4) → applyBump·unacceptedGroups가 동일 철자.
- **동작 보존 경계**: Task 2는 순수 추가(440 불변), Task 4는 새 액션이라 기존 호출부 무영향 — 두 지점이 "기존 테스트가 안 깨진다"로 검증된다.
- **하드락 절대성**: canBump가 `hardlockReason !== null`이면 false를 먼저 반환(Task 3), applyBump는 canBump가 참일 때만 불린다(Task 4) — BUMP가 벽을 뚫는 경로가 구조적으로 없다.
