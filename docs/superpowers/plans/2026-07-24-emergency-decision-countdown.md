---
tags:
  - type/plan
---

# 응급 결정화 + 카운트다운 (PR 1) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 응급 콜을 자동 판정에서 **플레이어가 직접 누르는 결정**(받기/돌려보내기 + 15초 실초 카운트다운)으로 바꾼다 — 하드락(구조의 벽)은 코드가 그대로 지킨다.

**Architecture:** 결정론 코어의 단일 관문 `decide`의 인자를 `accept: boolean` → `action: DecisionAction`으로 확장하고, `needsDecision`이 응급을 포함하게 넓힌다. 카운트다운은 UI 레이어(CallCard)가 실초로 재고, 만료 시 코어에 `'TIMEOUT'` 액션을 명시적으로 넣는다 — 코어는 실시간을 모른 채 결정론을 유지한다. 스펙: [2026-07-24-emergency-agency-fun-design.md](../specs/2026-07-24-emergency-agency-fun-design.md) §2·§4.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · vitest 4.

## Global Constraints

- **판정 = 결정론 코드.** `src/game/*`에 `Math.random`·`Date.now` 금지. 실시간(카운트다운)은 컴포넌트 레이어에만 둔다.
- **해석 카피 0 (show-don't-tell).** 화면에 "위험하다"·"당신 탓이다" 류 해석 문구를 쓰지 않는다 — 숫자·명사·사유 라벨만.
- **게이트:** 각 태스크 종료 시 `npm test` 전체 green **그리고** `npx tsc --noEmit` 0 에러(vitest는 타입체크를 안 한다 — 메모 vitest-no-typecheck-tsc-gate). 마지막 태스크에서 `npm run lint`까지.
- **한글 커밋:** 메시지를 `.commit-msg-tmp`(UTF-8)에 쓰고 `git commit -F .commit-msg-tmp` (PowerShell 인라인 한글 깨짐 회피, T-026). 트레일러(`Skills-used:` ~ `Co-Authored-By:`)는 **빈 줄 없이 연속**으로 맨 끝에.
- **새 md 문서에는 폴더별 frontmatter 태그**(`type/plan` 등) — pre-commit 검사기가 거부한다.
- 기존 코드의 주석 밀도·한국어 서술 스타일을 따른다(코드 리딩하면 바로 보임).

## 파일 지도 (이 PR이 만지는 곳 전부)

| 파일 | 무엇이 바뀌나 |
|---|---|
| `src/game/receiving.ts` | `DecisionAction` 신설, `decide` 시그니처·의미론, `needsDecision` 확장, `unacceptedGroups` outcome |
| `src/game/types.ts` | `RejectionReason`에 `'UNANSWERED'` 추가 |
| `src/game/news.ts` | `REASON_CLAUSE`에 `UNANSWERED` 문구 추가 (Record라 tsc가 강제) |
| `src/components/SessionClient.tsx` | `onDecide` 타입 전환 |
| `src/components/ReceivingPhase.tsx` | `onDecide` prop 타입, 자동 처리 액션 `'ACCEPT'`, CallCard에 `key` |
| `src/components/CallCard.tsx` | 응급 분기: 결과 표시+계속 → 받기/돌려보내기 버튼 + 하드락 배지 + 카운트다운 |
| `src/game/receiving.test.ts` · `src/game/session.test.ts` · `src/game/hospitalMap.test.ts` | 호출부 이관 + 신규 RED 테스트 |
| `README.md` · `claude-docs/changeLog.md` · `claude-docs/plan.md` · `docs/superpowers/specs/2026-07-19-received-side-emergency-redesign-design.md` | 문서 정합(Task 5) |

---

### Task 1: `DecisionAction` 도입 — 동작 보존 시그니처 전환

**Files:**
- Modify: `src/game/receiving.ts:542` (decide)
- Modify: `src/components/SessionClient.tsx:64-66`
- Modify: `src/components/ReceivingPhase.tsx:149-157,186`
- Modify: `src/components/CallCard.tsx:66-71,162,171,204`
- Modify: `src/game/receiving.test.ts` · `src/game/session.test.ts` · `src/game/hospitalMap.test.ts` (기계적 이관)

**Interfaces:**
- Produces: `export type DecisionAction = 'ACCEPT' | 'DECLINE' | 'TIMEOUT'` · `decide(state: ReceivingState, action: DecisionAction): ReceivingState` — Task 2~4가 이 시그니처를 쓴다.
- **이 태스크는 동작을 바꾸지 않는다**: 응급은 여전히 액션 무관 자동 판정(그 전환은 Task 2).

- [ ] **Step 1: receiving.ts에 타입·시그니처 전환**

`src/game/receiving.ts`의 `decide`를 다음으로 교체(주석 포함 — 본문 로직은 `accept` 도출 한 줄과 `effectiveAccept` 주석만 다르고 나머지는 기존 그대로):

```ts
/** 플레이어(또는 UI 타임아웃)가 콜 하나에 내리는 액션. TIMEOUT은 카운트다운 만료 — UI만 만들고 코어는 받기만 한다. */
export type DecisionAction = 'ACCEPT' | 'DECLINE' | 'TIMEOUT'

export function decide(state: ReceivingState, action: DecisionAction): ReceivingState {
  if (state.done) {
    throw new Error('receiving already done')
  }
  const call = state.queue[state.index]
  const roster = state.hospital.roster ?? []
  const reason = hardlockReason(state.hospital, call, state.busyUntil, roster)
  const disposition: CallDisposition = reason === null ? 'CHOICE' : 'HARDLOCK_REJECT'

  const arrivalMin = call.arrivalMin ?? 0
  // 대기까지 감안한 시작 시각 — 숫자면 (기다려서라도) 받을 수 있고, 문자열이면 못 받는다.
  const start = startMinFor(call, state.busyUntil, roster)
  const canStart = typeof start === 'number'

  const accept = action === 'ACCEPT'
  // ⚠️ 과도기(동작 보존): 응급은 아직 액션 무관 자동 판정이다 — 플레이어 의사로 바꾸는 건 다음 슬라이스.
  const effectiveAccept = disposition === 'CHOICE' && (isElective(call.kind) ? accept && canStart : true)
  /* …이하 기존 본문 그대로(busyUntil 점유·netProfitDelta·lawsuitExposure·logReason·log·index)… */
```

(이하 함수 본문은 기존 코드를 한 글자도 바꾸지 않는다 — `accept` 지역 변수가 기존 파라미터 이름을 그대로 대신한다.)

- [ ] **Step 2: 컴포넌트 호출부 이관**

`src/components/SessionClient.tsx`:

```tsx
import { decide, type DecisionAction } from "@/game/receiving";
// …
onDecide={(action: DecisionAction) =>
  setSession((s) => ({ ...s, receiving: decide(s.receiving!, action) }))
}
```

`src/components/ReceivingPhase.tsx` — prop 타입과 자동 처리:

```tsx
import { /* 기존 import에 추가 */ type DecisionAction } from "@/game/receiving";
// props: onDecide: (action: DecisionAction) => void;
// 자동 처리 effect 내부: onDecide(true) → onDecide('ACCEPT')
```

`src/components/CallCard.tsx` — prop 타입 `onDecide: (action: DecisionAction) => void`, 선택진료 버튼 `onDecide(true)` → `onDecide('ACCEPT')` / `onDecide(false)` → `onDecide('DECLINE')`, 응급 분기의 「계속」 버튼 `onDecide(true)` → `onDecide('ACCEPT')`.

- [ ] **Step 3: 테스트 3파일 기계적 이관**

```bash
# Grep 도구로 각 파일의 decide( 호출을 확인한 뒤, 각 파일에서:
#   decide(<...>, true)  → decide(<...>, 'ACCEPT')
#   decide(<...>, false) → decide(<...>, 'DECLINE')
# 대상: src/game/receiving.test.ts(30곳) · src/game/session.test.ts(3곳) · src/game/hospitalMap.test.ts(4곳)
```

⚠️ Git Bash sed는 이 파일들의 한글에서 무성 실패한다(글로벌 원칙 1) — **Edit 도구의 replace_all**로 `, true)` / `, false)` 패턴을 파일별로 치환하되, `decide(` 문맥인지 Grep으로 먼저 확인한다(다른 boolean 인자 함수 오치환 방지).

- [ ] **Step 4: 게이트 실행**

Run: `npm test && npx tsc --noEmit`
Expected: 전체 green, 타입 에러 0 (동작 보존이므로 기존 테스트가 그대로 통과해야 한다 — 하나라도 깨지면 이관 실수).

- [ ] **Step 5: 커밋**

`.commit-msg-tmp`(UTF-8)에 아래를 쓰고 `git add -A && git commit -F .commit-msg-tmp`:

```
refactor: decide 인자를 DecisionAction으로 — 응급 결정화의 발판 (동작 보존)

Skills-used: superpowers:writing-plans, superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 동작 보존 이관을 기존 스위트 green으로 검증
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 2: 응급 의미론 전환 — DECLINE·TIMEOUT·UNANSWERED

**Files:**
- Modify: `src/game/types.ts:72-86` (RejectionReason)
- Modify: `src/game/receiving.ts` (decide의 effectiveAccept·logReason, unacceptedGroups)
- Modify: `src/game/news.ts:92-101` (REASON_CLAUSE)
- Test: `src/game/receiving.test.ts` · `src/game/news.test.ts` · (드레인 이관) `src/game/session.test.ts` · `src/game/hospitalMap.test.ts`

**Interfaces:**
- Consumes: Task 1의 `DecisionAction` · `decide(state, action)`.
- Produces: 응급에서 `'DECLINE'` → `accepted:false·disposition:'CHOICE'·reason:null` / `'TIMEOUT'` → `reason:'UNANSWERED'`(하드락이면 하드락 사유 유지). `RejectionReason`에 `'UNANSWERED'`. 테스트 헬퍼 `drainAuto(s)` — Task 3 이후에도 각 테스트 파일이 쓴다.

- [ ] **Step 1: RED 테스트 작성** — `src/game/receiving.test.ts`의 `describe('decide (시간 점유) …')` 블록에 추가:

```ts
describe('응급 결정권 — 플레이어가 직접 받고 보낸다 (스펙 2026-07-24 §2)', () => {
  const dayStemi = () => ({ ...dayCall('STEMI'), nightShift: false })

  it('응급 DECLINE — 하드락이 없어도 내가 보낼 수 있다(자발 거절)', () => {
    const h = hospitalOf(conscientious) // 순환기 2 — 받을 수 있는 병원
    const after = decide(initReceiving(h, [dayStemi()]), 'DECLINE')
    expect(after.log[0].accepted).toBe(false)
    expect(after.log[0].disposition).toBe('CHOICE') // 구조가 막은 게 아니다
    expect(after.log[0].reason).toBeNull() // 내가 보냈다 — 사유를 지어내지 않는다
    expect(after.busyUntil).toEqual({}) // 아무도 점유되지 않는다
  })

  it('응급 TIMEOUT — 응답 없음(UNANSWERED)으로 기록된다', () => {
    const h = hospitalOf(conscientious)
    const after = decide(initReceiving(h, [dayStemi()]), 'TIMEOUT')
    expect(after.log[0].accepted).toBe(false)
    expect(after.log[0].reason).toBe('UNANSWERED')
  })

  it('하드락 응급은 액션 불문 하드락 거절 — TIMEOUT이어도 사유는 구조가 진실', () => {
    const noCardio = hospitalOf(collaborator) // 순환기 0 → NO_BACKUP_CARE
    for (const action of ['ACCEPT', 'DECLINE', 'TIMEOUT'] as const) {
      const after = decide(initReceiving(noCardio, [dayStemi()]), action)
      expect(after.log[0].accepted).toBe(false)
      expect(after.log[0].disposition).toBe('HARDLOCK_REJECT')
      expect(after.log[0].reason).toBe('NO_BACKUP_CARE')
    }
  })

  it('응급 ACCEPT는 기존 자동 수용과 동일 — 자유 의사 점유·적자 누적', () => {
    const h = hospitalOf(conscientious)
    const stemi = dayStemi()
    const after = decide(initReceiving(h, [stemi]), 'ACCEPT')
    expect(after.log[0].accepted).toBe(true)
    expect(after.netProfitDeltaManwon).toBe(callDelta('STEMI'))
    expect(Object.values(after.busyUntil)).toContain((stemi.arrivalMin ?? 0) + (stemi.durationMin ?? 0))
  })

  it('마감 목록 — UNANSWERED는 「응답 없음」으로 접힌다', () => {
    const h = hospitalOf(conscientious)
    const after = decide(initReceiving(h, [dayStemi()]), 'TIMEOUT')
    expect(unacceptedGroups(after)[0].outcome).toBe('응답 없음')
  })
})
```

`src/game/news.test.ts`에 추가:

```ts
it('UNANSWERED도 기사가 된다 — 사유 문구가 부제에 실린다', () => {
  const n = morningNews(2, [{ callId: 'd1c5', kind: 'STEMI', reason: 'UNANSWERED' }])[0]
  expect(n.headline).toBeTruthy()
  expect(n.outlet).toContain('응답 없음')
})
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run src/game/receiving.test.ts src/game/news.test.ts`
Expected: FAIL — `'UNANSWERED'` 타입 없음(컴파일 단계) 또는 응급 DECLINE이 수용됨(기존 자동 의미론).

- [ ] **Step 3: 구현**

`src/game/types.ts` — `RejectionReason` 유니온 마지막에 추가:

```ts
  /**
   * 수용 회신이 없었다 — 결정 카운트다운(UI 15초)이 끝나 환자가 다른 병원으로 넘어갔다.
   * 구조가 막은 것도(하드락 아님), 내가 보낸 것도(reason null 아님) 아니다 — 전화를 든 채 시간이 갔다.
   * 하드락과 겹치면 하드락 사유가 이긴다(구조가 막은 게 먼저 있었던 사실이다) — decide의 logReason 순서.
   */
  | 'UNANSWERED'
```

`src/game/news.ts` — `REASON_CLAUSE`에 추가(Record라 이 항목이 없으면 tsc가 잡는다):

```ts
  UNANSWERED: '응답 없음',
```

`src/game/receiving.ts` — `decide`의 두 줄 교체:

```ts
  const accept = action === 'ACCEPT'
  // 응급도 이제 플레이어 의사를 따른다 — 하드락(disposition)이 먼저 이기고, 그 안에서만 선택이 산다.
  const effectiveAccept = disposition === 'CHOICE' && accept && canStart
```

`logReason` 계산을 교체(TIMEOUT이 LEFT_WAITING보다 먼저 — 전화를 안 받은 게 시간상 먼저 일어난 사실):

```ts
  const logReason =
    reason ??
    (!effectiveAccept && action === 'TIMEOUT'
      ? 'UNANSWERED'
      : !effectiveAccept && start === 'LEFT_WAITING'
        ? 'LEFT_WAITING'
        : null)
```

`unacceptedGroups`의 outcome 매핑에 한 갈래 추가:

```ts
    const outcome =
      entry.reason === 'LEFT_WAITING'
        ? '기다리다 감'
        : entry.reason === 'UNANSWERED'
          ? '응답 없음'
          : entry.disposition === 'HARDLOCK_REJECT'
            ? '하드락'
            : '거절'
```

- [ ] **Step 4: 깨진 기존 테스트를 의도 기준으로 이관**

의미론 전환으로 **의도적으로** 깨지는 테스트들을 처리한다:

1. "응급은 accept 무관 자동" 계열(`receiving.test.ts:404,409-415,465,474` 부근) — 주석·의미가 옛 계약이다. `decide(…, 'DECLINE')`로 수용을 기대하던 것을 `'ACCEPT'`로 바꾸고, it 이름의 "자동"을 "ACCEPT"로 고친다(옛 "무관 자동" 단언 자체는 Step 1의 새 테스트가 대체).
2. 드레인 루프(`while (!s.done) s = decide(s, 'DECLINE')` — receiving.test.ts 4곳·session.test.ts·hospitalMap.test.ts) — 옛 자동 판정과 동등한 헬퍼로 교체. 각 테스트 파일 상단에 추가:

```ts
/** 옛 자동 판정과 동등한 드레인 — 응급은 받고(구조가 판정), 선택진료는 보낸다. */
function drainAuto(s: ReceivingState): ReceivingState {
  while (!s.done) s = decide(s, isElective(s.queue[s.index].kind) ? 'DECLINE' : 'ACCEPT')
  return s
}
```

(`isElective`는 receiving.ts에서 이미 export — session.test.ts·hospitalMap.test.ts는 import에 추가.) 루프 자리를 `s = drainAuto(s)`로 바꾼다. **1통만 처리하는 사이트**(`decide(s, 'DECLINE')` 단발 — 예: receiving.test.ts:483,671)는 그 콜이 응급이면 `'ACCEPT'`로, 선택진료면 그대로 둔다(큐 첫 콜의 kind를 픽스처에서 확인).

- [ ] **Step 5: 게이트**

Run: `npm test && npx tsc --noEmit`
Expected: 전체 green + 0 에러. 특히 `session.test.ts`의 '양심 경로'·I8 불변식이 그대로 통과해야 한다(드레인 헬퍼가 옛 동작과 동등하다는 증명).

- [ ] **Step 6: 커밋**

```
feat: 응급을 플레이어 결정으로 — DECLINE·TIMEOUT(응답 없음) 의미론

하드락은 액션 불문 코드가 지킨다(벽은 코드가, 버튼은 플레이어가).

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 의미론 전환의 Red를 먼저 보고 드레인 동등성을 스위트로 증명
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 3: `needsDecision` 확장 + 응급 카드 버튼 UI

**Files:**
- Modify: `src/game/receiving.ts:151-153` (needsDecision)
- Modify: `src/components/CallCard.tsx:178-210` (응급 분기)
- Modify: `src/components/ReceivingPhase.tsx:383` (key)
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Consumes: Task 2의 의미론(`'ACCEPT' | 'DECLINE'` 버튼 디스패치).
- Produces: `needsDecision`이 응급에 true — `useHospitalClock.flowTargetMin`과 ReceivingPhase 자동 처리 effect가 **이 술어 하나로** 응급에서 멈추고 카드를 세운다(두 소비처는 코드 무변경으로 따라온다 — 그게 단일 출처 계약의 목적).

- [ ] **Step 1: RED 테스트** — `src/game/receiving.test.ts`:

```ts
describe('needsDecision — 응급도 흐름을 멈추고 묻는다 (스펙 2026-07-24 §2)', () => {
  it('응급 6종 전부 true', () => {
    for (const kind of BACKUP_CARE_KINDS) {
      expect(needsDecision(dayCall(kind))).toBe(true)
    }
  })
  it('워크인은 여전히 자동(false), 배후과 예약은 여전히 결정(true)', () => {
    expect(needsDecision(dayCall('COSMETIC_WALKIN'))).toBe(false)
    expect(needsDecision(dayCall('SPECIALIST_ELECTIVE'))).toBe(true)
  })
})
```

(`BACKUP_CARE_KINDS`·`needsDecision`은 receiving.ts에서 이미 export. `dayCall` 픽스처는 파일에 이미 있다.)

- [ ] **Step 2: RED 확인**

Run: `npx vitest run src/game/receiving.test.ts -t needsDecision`
Expected: FAIL — 응급 6종이 false.

- [ ] **Step 3: 구현** — `src/game/receiving.ts`의 `needsDecision` 교체(독 주석도 갱신):

```ts
/**
 * 흐름을 멈추고 플레이어에게 물어야 하는 콜인가 — **배후과 예약 + 응급 6종**.
 *
 * 응급이 여기 들어온 건 방향 전환(스펙 2026-07-24)이다: 응급 판정을 자동으로 흘리면 이 게임의
 * 감정적 핵심("당신이 그 벽이다")에서 플레이어가 구경꾼이 된다. 이제 하드락이어도 카드는 서고,
 * 돌려보내는 버튼은 플레이어가 누른다 — 판정은 여전히 decide(코드)가 확정한다.
 *
 * 화면(`useHospitalClock`의 흐름 목표 · `ReceivingPhase`의 자동 처리)이 이 술어 하나를 공유한다.
 * 두 곳에 각자 조건을 적으면 흐름이 멈추는 지점과 카드가 뜨는 지점이 어긋난다.
 */
export function needsDecision(call: IncomingCall): boolean {
  return requiresBackupCare(call.kind) || (isElective(call.kind) && !isAutoAccept(call.kind))
}
```

- [ ] **Step 4: CallCard 응급 분기를 버튼으로** — `src/components/CallCard.tsx`의 `) : (` 이하 응급 분기 전체를 교체:

```tsx
      ) : (
        // 응급 — 이제 결과 통보가 아니라 결정이다. 하드락이면 그 사유가 도장으로 서고
        // 「받기」가 잠긴다 — 결과는 코드가 정했지만, 돌려보내는 버튼은 플레이어가 누른다.
        <div className="mt-auto flex flex-col gap-3">
          {reason !== null && (
            <p className="-rotate-[1.5deg] self-start rounded-stamp border-2 border-stamp bg-stamp-field px-3 py-1.5 font-serif text-lg leading-tight text-stamp-ink">
              전원 불가 · {REASON_CLAUSE[reason]}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onDecide('ACCEPT')}
              disabled={reason !== null}
              aria-label={`${call.label} 받기`}
              className="flex-1 rounded-xs bg-go py-3 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-desk disabled:text-on-desk/70 disabled:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
            >
              받기{reason === null && assignee ? ` · ${assignee.name}` : ""}
            </button>
            <button
              type="button"
              onClick={() => onDecide('DECLINE')}
              aria-label={`${call.label} 돌려보내기`}
              className="flex-1 rounded-xs border border-frame py-3 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
            >
              돌려보내기
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: ReceivingPhase에 콜별 key** — 카드가 콜마다 리마운트되게(다음 태스크의 카운트다운 리셋 전제):

```tsx
          <CallCard key={arrived.id} receiving={receiving} onDecide={onDecide} />
```

- [ ] **Step 6: 게이트 + 브라우저 검증**

Run: `npm test && npx tsc --noEmit` → 전체 green.
브라우저: dev 서버(`.claude/launch.json`의 `dev`)로 개원(순환기 포함) → 월요일 진행 → **고열·패혈증/STEMI 도착 시 흐름이 멈추고 받기/돌려보내기 카드가 뜨는지**, 순환기 미채용 병원에서 STEMI 카드에 도장+돌려보내기만 활성인지 확인.

- [ ] **Step 7: 커밋**

```
feat: 응급 카드 — 흐름이 멈추고 받기/돌려보내기를 플레이어가 누른다

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — needsDecision 확장을 술어 단위 Red로 잠금
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 4: 실초 카운트다운 15초 — 만료 시 TIMEOUT

**Files:**
- Modify: `src/components/CallCard.tsx` (EmergencyCountdown 신설·응급 분기에 삽입)

**Interfaces:**
- Consumes: Task 2의 `'TIMEOUT'` 액션 · Task 3의 콜별 `key`(리마운트로 카운트다운 리셋).
- Produces: UI 상수 `EMERGENCY_DECISION_SECONDS = 15` — 코어에는 어떤 실시간도 넣지 않는다.

- [ ] **Step 1: 구현** — `src/components/CallCard.tsx` 상단(컴포넌트 밖)에 추가:

```tsx
/**
 * 응급 결정 카운트다운(실초) — 구급대의 인내다. 만료면 환자는 다른 병원으로 넘어간다(TIMEOUT).
 *
 * 실시간은 여기 UI에만 있다 — 코어(decide)는 'TIMEOUT'이라는 명시 액션을 받을 뿐 시계를 모른다
 * (결정론 테스트에 실초가 새지 않는 경계, 스펙 §4). 값 조정은 이 상수 하나다.
 * 콜별 리셋은 ReceivingPhase의 key={call.id} 리마운트가 담당한다.
 */
const EMERGENCY_DECISION_SECONDS = 15;

function EmergencyCountdown({ onExpire }: { onExpire: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(EMERGENCY_DECISION_SECONDS);
  const firedRef = useRef(false); // StrictMode 이중 마운트·재렌더에서 TIMEOUT 1회 보장
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (secondsLeft <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire();
    }
  }, [secondsLeft, onExpire]);
  return (
    <div className="flex items-center gap-2">
      <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-xs bg-desk">
        <div
          className="h-full bg-alarm transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.max(0, (secondsLeft / EMERGENCY_DECISION_SECONDS) * 100)}%` }}
        />
      </div>
      {/* 해석 0 — 숫자만. 색(alarm) 단독 신호 금지라 초 숫자가 판정을 진다(스펙 §7). */}
      <span aria-live="polite" className="shrink-0 font-mono text-xs tabular-nums text-on-desk/70">
        {Math.max(0, secondsLeft)}초
      </span>
    </div>
  );
}
```

`import { useEffect, useRef } from "react"` → `import { useEffect, useRef, useState } from "react"`.

응급 분기의 도장 바로 아래(버튼 그룹 위)에 삽입:

```tsx
          <EmergencyCountdown onExpire={() => onDecide('TIMEOUT')} />
```

- [ ] **Step 2: 게이트 + 브라우저 검증**

Run: `npm test && npx tsc --noEmit` → 전체 green (코어 무변경이라 기존 스위트에 영향 0이어야 한다).
브라우저: 응급 카드에서 ① 바·초가 줄어드는지 ② **끝까지 방치** → 카드가 닫히고 처리 스트림·하루 마감에 「응답 없음」이 남는지 ③ 다음 응급 카드에서 카운트다운이 15초로 리셋되는지 확인.

- [ ] **Step 3: 커밋**

```
feat: 응급 카드에 15초 실초 카운트다운 — 만료는 UNANSWERED

Skills-used: none
Skill-benefit: (UI 전용 슬라이스)
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 5: 문서 정합 + 최종 게이트

**Files:**
- Modify: `README.md` (「플레이 방법」 2번)
- Modify: `docs/superpowers/specs/2026-07-19-received-side-emergency-redesign-design.md` (§10 확장점 소화 역링크)
- Modify: `claude-docs/plan.md` · `claude-docs/changeLog.md`

**Interfaces:**
- Consumes: Task 1~4 완료 상태.
- Produces: PR 준비 완료 브랜치.

- [ ] **Step 1: README 「플레이 방법」 2번 갱신** — 기존 "발신자가 아무리 매달려도 판정은 안 바뀐다" 문장은 유지하되, 응급 결정을 반영해 2번 항목의 해당 대목을 다음 취지로 수정(문체는 주변과 맞춘다):

> 응급 콜이 오면 15초 안에 받기/돌려보내기를 **당신이 직접** 누른다. 구조가 막으면(병상·당직·배후) 받기는 잠기고 사유 도장이 찍힌다 — 돌려보내는 버튼만 남는다. 시간을 흘리면 환자는 응답 없이 다른 병원으로 넘어간다.

- [ ] **Step 2: 2026-07-19 스펙 §10에 역링크 한 줄** — "받는 콜 골든타임 압박(수락 카운트다운)" 항목 뒤에:

```markdown
  → ✅ 소화(2026-07-24): [emergency-agency-fun 스펙](2026-07-24-emergency-agency-fun-design.md) PR 1로 구현.
```

- [ ] **Step 3: plan.md·changeLog.md 갱신** — plan.md의 해당 작업 줄을 ✅로(없으면 「재미 개선 3종」 섹션 신설: PR 1 ✅ · PR 2 🔜 트레이드오프+대가 가시화 · PR 3 ⬜ 폐업), changeLog.md 맨 위에 `## 2026-07-24 · 응급을 플레이어 결정으로 — 카드·카운트다운(재미 개선 PR 1)` 항목(PR 번호는 적지 않는다 — 프로젝트 changeLog 규약).

- [ ] **Step 4: trap 스윕(프로젝트 규약)** — 이번 브랜치에서 1분+ 근인 디버깅이 있었나(서브에이전트·리뷰어가 잡은 것 포함)? 있으면 `claude-docs/troubleshooting/T-###.md` 신설(frontmatter `summary` + 4필드), 없으면 넘어간다.

- [ ] **Step 5: 최종 게이트 + 커밋**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 전부 통과.

```
docs: 응급 결정화 반영 — README·스펙 역링크·plan/changeLog

Skills-used: none
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## 셀프리뷰 기록

- **스펙 커버리지**: §2(결정 카드·DECLINE·TIMEOUT·하드락 유지) → Task 2·3 / §4(15초·결정론 경계) → Task 4 / §2 신문 확장(거절·UNANSWERED 기사화) → Task 2(뉴스는 `TurnedAway.reason`이 이미 `RejectionReason | null`이라 `recordDay`가 무변경으로 실어 나른다 — reason null(자발 거절) 프로필은 기존 구현·테스트가 이미 있고, UNANSWERED는 REASON_CLAUSE 추가로 흐른다). §3(BUMP)·§5(점유 미리보기)·§6(폐업)은 **PR 2·3 별도 계획**(스펙 §8 분해 그대로).
- **자리표시자**: 없음 — 모든 코드 블록이 실제 삽입물이고, "기존 본문 그대로" 참조는 대상 줄 범위가 명시돼 있다.
- **타입 일관성**: `DecisionAction`(Task 1 정의)을 2~4가 동일 철자로 소비. `UNANSWERED`는 types.ts 유니온 + news.ts Record + unacceptedGroups + 테스트에서 동일 철자. `drainAuto`는 세 테스트 파일에 동일 시그니처로 정의.
