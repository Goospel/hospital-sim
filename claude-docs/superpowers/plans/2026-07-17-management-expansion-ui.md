---
tags:
  - type/plan
---

# 경영 확장 UI 통합 (Part 2) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part 1 로직 코어(결정론 세션 상태기계) 위에 React UI를 배선해, API 없이 한 세션(위저드→콜큐→막간→응급→결말)을 완주하는 플레이어블을 만든다.

**Architecture:** `page.tsx → SessionClient`(오케스트레이터, `SessionState` 소유, `phase` 스위치). 기존 `GameClient`의 전원/영수증/장부 뷰를 표현 컴포넌트(`TransferRound`·`Receipt`·`LedgerPanel`)로 추출해 세션이 재사용한다. 게임 상태 전이는 전부 `src/game/session.ts` 순수함수 호출로만 일어나고 UI는 판정하지 않는다. 시각은 이미 배포된 단일 어두운 zinc 시스템 안에서 1막 초록→결말 빨강 액센트 아크로 톤을 만든다(밝은/어두운 화면 전환 없음).

**Tech Stack:** Next.js(App Router, breaking 버전 — 코드 작성 전 `node_modules/next/dist/docs/` 관련 가이드 확인) · TypeScript(strict) · Tailwind · vitest(순수 로직 TDD) · in-app 브라우저(Preview 도구)로 UI 검증.

**설계 근거(필독):** [2026-07-17-management-expansion-ui-design.md](../specs/2026-07-17-management-expansion-ui-design.md) — 진입 결정 A·컴포넌트 경계·통일 시각 토큰·페이즈별 화면·톤 가드레일이 전부 여기 있다. 부모 설계: [2026-07-16-management-expansion-design.md](../specs/2026-07-16-management-expansion-design.md).

## Global Constraints

모든 태스크의 요구사항에 암묵적으로 포함된다.

- **비파괴**: 기존 순수 모듈(`session`·`receiving`·`round`·`ledger`·`debrief`·`dialogue`·`adjudicate`·`goldenTime`·`scenarios`)의 **동작을 바꾸지 않는다**. `setup.ts`에는 **함수 추가만**(Task 1). 기존 92 tests는 계속 green이어야 한다.
- **판정=코드 경계**: UI 컴포넌트는 게임 상태 전이를 직접 계산하지 않는다. 오직 `session.ts`/`receiving.ts`/`round.ts`의 순수함수를 호출하고 그 반환값을 렌더한다.
- **결정론**: 게임 로직 경로에 `Math.random()`·`Date.now()`·`new Date()` 금지(실시간 타이머의 `setInterval`은 뷰 전용이며 상태는 순수 `tickTime`으로 전이 — 기존 패턴 유지).
- **한국어**: 모든 사용자 대면 텍스트는 한국어. 커밋 메시지도 한국어 — **T-026 절차**로만 커밋한다(아래).
- **통일 시각(사용자 1순위)**: 전 페이즈 단일 어두운 zinc 시스템. bg `zinc-950`, 카드 `bg-white/[0.03]` 또는 `bg-black/40`, 보더 `border-zinc-800`, 본문 `text-zinc-100`, 보조 `text-zinc-400/500/600`. 타입: 상황·버튼은 sans(기본), 숫자·타이머·손익·영수증은 `font-mono tabular-nums`. 액센트 아크: 1막 명랑 초록 `emerald-500/400`(`#059669`/`#34d399`), 1막 리스크 경고 `amber-500`(절제), 결말 빨강 `red-500`(`#ef4444`). **밝은 배경·라이트모드 화면 없음.** Tailwind 클래스는 기존 `GameClient.tsx` 관례를 따른다.
- **T-026 커밋(한글, Git Bash=Bash 도구)**:
  ```bash
  git add <files>
  cat > .commit-msg-tmp <<'EOF'
  <한글 커밋 메시지>

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp
  ```
  PowerShell 인라인 `-m "한글"`은 CP949로 깨지므로 금지.
- **게이트(전 태스크)**: 관련 `vitest` green + `npx tsc --noEmit` 통과. **UI 태스크**는 추가로 in-app 브라우저 관찰 검증(각 태스크의 검증 스텝). **최종(Task 7)**: `next build`(Turbopack) + 모바일 375px 가로 넘침 0 + `prefers-reduced-motion` 대체 확인.

## 소비하는 기존 인터페이스 (참조)

```ts
// session.ts
startSession(): SessionState
completeSetup(choices: SetupChoices): SessionState               // → RECEIVING, hospital, receiving 세팅
completeReceiving(state: SessionState): SessionState             // RECEIVING(done)→INTERSTITIAL
beginEmergency(state: SessionState): SessionState                // INTERSTITIAL→EMERGENCY (backupCare로 분기)
toEpilogue(state: SessionState): SessionState                    // EMERGENCY(종료)→EPILOGUE
buildEpilogue(state: SessionState): SessionEpilogue              // { survived, ledger: Ledger|null, debrief: Debrief|null }
type SessionPhase = 'SETUP'|'RECEIVING'|'INTERSTITIAL'|'EMERGENCY'|'EPILOGUE'
interface SessionState { phase: SessionPhase; hospital?: Hospital; receiving?: ReceivingState; emergency?: EmergencyState }
type EmergencyState = { mode:'IN_HOUSE' } | { mode:'TRANSFER'; game: GameState }
// setup.ts
DEPARTMENTS: DepartmentSpec[]; buildHospital(choices); hiringCost(choices): number; withinBudget(choices): boolean
FIXED_BEDS = 2; SETUP_BUDGET_BILLIONS = 100
// receiving.ts
createCallQueue(): IncomingCall[]  // 고정 5통
classifyCall(hospital, call): 'HARDLOCK_REJECT'|'CHOICE'
decide(state: ReceivingState, accept: boolean): ReceivingState   // 하드락은 accept=true여도 미수용(가드)
interface ReceivingState { hospital; queue: IncomingCall[]; index; netProfitDeltaBillions; lawsuitExposure; log; done }
// dialogue.ts
CALLER_PLEA: Record<CallKind,string[]>; receivingLine(call, disposition, accepted, seed): string
fallbackLine(verdict, seed); persuasionReply(verdict, priorAttempts)
// round.ts
startGame(patient, hospitals, totalGoldenSeconds): GameState
attemptTransfer(state, hospitalId, timeCostSeconds): GameState   // status: IN_PROGRESS|ACCEPTED|DIED
tickTime(state, elapsedSeconds): GameState
// debrief.ts / ledger.ts
buildDebrief(game): Debrief; interface Ledger { hospitalName; segments; netProfitBillions; hires; essentialSpecialty; essentialHires; totalHires }
// labels.ts
SPECIALTY_LABEL; REJECTION_LABEL; formatClock(totalSeconds): string
```

## File Structure

- **Create**: `src/components/SessionClient.tsx`(오케스트레이터) · `SetupWizard.tsx` · `ReceivingPhase.tsx` · `Interstitial.tsx` · `InHouseEmergency.tsx` · `TransferRound.tsx` · `Receipt.tsx` · `LedgerPanel.tsx`
- **Modify**: `src/game/setup.ts`(+`adjustDoctors`,`isSetupReady`) · `src/game/setup.test.ts`(+테스트) · `src/app/page.tsx`(→`SessionClient`)
- **Delete(마지막)**: `src/components/GameClient.tsx`(세션으로 대체 · 표현 뷰는 추출됨)

---

## Task 1: 위저드 순수 헬퍼 (TDD) — `adjustDoctors`, `isSetupReady`

위저드가 소비할 두 순수 헬퍼를 `setup.ts`에 추가한다. 음수/비정수 방어(이연 Minor 해소)와 진행 가능 판정을 컴포넌트 밖 순수 로직으로 뺀다.

**Files:**
- Modify: `src/game/setup.ts`
- Test: `src/game/setup.test.ts`

**Interfaces:**
- Consumes: `SetupChoices`, `DeptKey`(types.ts), 기존 `hiringCost`/`withinBudget`
- Produces:
  - `adjustDoctors(choices: SetupChoices, key: DeptKey, delta: number): SetupChoices` — 불변 갱신. 결과 수는 `Math.max(0, Math.floor(현재+delta))`로 클램프(음수·비정수 방어). 0이면 `doctors`에서 키를 제거(정규화).
  - `isSetupReady(choices: SetupChoices): boolean` — `hospitalName.trim().length > 0 && withinBudget(choices)`.

- [ ] **Step 1: 실패 테스트 작성** — `src/game/setup.test.ts`에 추가:

```ts
import { describe, it, expect } from 'vitest'
import { adjustDoctors, isSetupReady, SETUP_BUDGET_BILLIONS } from './setup'
import type { SetupChoices } from './types'

const base: SetupChoices = { hospitalName: '한바다', doctors: {} }

describe('adjustDoctors', () => {
  it('increments a department from zero', () => {
    expect(adjustDoctors(base, 'AESTHETICS', 1).doctors.AESTHETICS).toBe(1)
  })
  it('clamps to zero and removes the key on over-decrement', () => {
    const one = adjustDoctors(base, 'AESTHETICS', 1)
    const back = adjustDoctors(one, 'AESTHETICS', -5)
    expect(back.doctors.AESTHETICS).toBeUndefined()
  })
  it('floors non-integer deltas (never negative, never fractional)', () => {
    const r = adjustDoctors(base, 'CARDIOLOGY', 1.9)
    expect(r.doctors.CARDIOLOGY).toBe(1)
  })
  it('does not mutate the input', () => {
    const snapshot = JSON.parse(JSON.stringify(base))
    adjustDoctors(base, 'CHECKUP', 2)
    expect(base).toEqual(snapshot)
  })
})

describe('isSetupReady', () => {
  it('false when name is blank', () => {
    expect(isSetupReady({ hospitalName: '   ', doctors: { AESTHETICS: 1 } })).toBe(false)
  })
  it('false when over budget', () => {
    expect(isSetupReady({ hospitalName: '한바다', doctors: { NEUROSURGERY: 99 } })).toBe(false)
  })
  it('true for a named, within-budget build (including cardiology-skip 공범)', () => {
    expect(isSetupReady({ hospitalName: '한바다', doctors: { AESTHETICS: 2 } })).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/game/setup.test.ts` · Expected: FAIL(`adjustDoctors`/`isSetupReady` is not a function).
- [ ] **Step 3: 최소 구현** — `src/game/setup.ts`에 추가:

```ts
/** 불변 갱신 — 과별 의사 수를 delta만큼 조정. 음수·비정수 방어(0 클램프·정수화), 0이면 키 제거. */
export function adjustDoctors(choices: SetupChoices, key: DeptKey, delta: number): SetupChoices {
  const current = choices.doctors[key] ?? 0
  const next = Math.max(0, Math.floor(current + delta))
  const doctors = { ...choices.doctors }
  if (next === 0) delete doctors[key]
  else doctors[key] = next
  return { ...choices, doctors }
}

/** 세션을 시작할 수 있는 선택인가 — 이름이 있고 예산 이내. */
export function isSetupReady(choices: SetupChoices): boolean {
  return choices.hospitalName.trim().length > 0 && withinBudget(choices)
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/game/setup.test.ts` · Expected: PASS(신규 7 + 기존 setup 테스트). 이어 `npx vitest run` 전체 green, `npx tsc --noEmit` 통과.
- [ ] **Step 5: 커밋** — T-026, 예: `test/setup: 위저드 순수 헬퍼 adjustDoctors·isSetupReady (음수 방어 Minor 해소)`.

---

## Task 2: 표현 컴포넌트 추출 — `Receipt` · `LedgerPanel` · `TransferRound`

세션이 재사용할 뷰를 `GameClient.tsx`에서 떼어내 별도 컴포넌트로 만들고, `GameClient`가 그것들을 사용하도록 리팩터한다. 목적: 추출이 기존 게임과 **동일 렌더**임을 브라우저로 즉시 검증(디리스크). 로직은 옮기지 않고 그대로 이관한다.

**Files:**
- Create: `src/components/Receipt.tsx`, `src/components/LedgerPanel.tsx`, `src/components/TransferRound.tsx`
- Modify: `src/components/GameClient.tsx`(추출한 컴포넌트를 사용하도록)

**Interfaces:**
- `Receipt({ debrief }: { debrief: Debrief })` — 현 `GameClient` 결말의 "전원 기록" 블록 JSX를 그대로(라벨+숫자·해석 0). `import type { Debrief } from '@/game/debrief'`, `REJECTION_LABEL`·`formatClock` 사용.
- `LedgerPanel({ ledger }: { ledger: Ledger })` — 현 "올해 장부" 블록 JSX 그대로. `import type { Ledger } from '@/game/ledger'`, `SPECIALTY_LABEL` 사용.
- `TransferRound({ game, onFinish }: { game: GameState; onFinish: (finalGame: GameState) => void })` — 현 `GameClient`의 **IN_PROGRESS 상호작용 전체**(골든타임 헤더+환자 카드+통화 내용+설득 입력+병원 리스트+거절 로그)를 캡슐화. 내부에서 `useState(game)`·실시간 `tickTime` 인터벌·`handleCall`(=`adjudicateTransfer`로 대사 선택 후 `attemptTransfer(prev, id, CALL_COST_SECONDS)`)·plea 상태를 소유한다. `status`가 `ACCEPTED`/`DIED`로 바뀌면 그 전이가 반영된 최종 상태로 `onFinish(final)`를 1회 호출한다(`useEffect`로 status 감시). 시작 게이트·재시작·결말 렌더는 포함하지 않는다(부모 책임). 상수 `CALL_COST_SECONDS = 12`, `LOW_TIME_THRESHOLD = 30`은 이 컴포넌트로 이관.

- [ ] **Step 1: `Receipt`·`LedgerPanel` 생성** — `GameClient` 결말 블록의 두 `div`(영수증/장부)를 각각 파일로 이동. props는 위 시그니처. 클래스·구조 그대로.
- [ ] **Step 2: `TransferRound` 생성** — `GameClient`의 `useState<GameState>`·타이머 `useEffect`·`nameById`/`countByHospital`/`lastVerdictByHospital` `useMemo`·`handleCall`·IN_PROGRESS `return` JSX를 이 컴포넌트로 이관. `onFinish` 호출은:
  ```tsx
  useEffect(() => {
    if (state.status === 'ACCEPTED' || state.status === 'DIED') onFinish(state)
  }, [state.status])  // eslint-disable-line react-hooks/exhaustive-deps
  ```
  초기 상태는 `useState(() => game)`. 시작 게이트가 없으므로 진입 즉시 타이머가 흐른다(`started` 개념 제거, 인터벌은 `status==='IN_PROGRESS'`일 때만).
- [ ] **Step 3: `GameClient` 리팩터** — `GameClient`는 시작 게이트 + `<TransferRound game={game} onFinish={setState}/>` + 결말(`<Receipt/>`+`<LedgerPanel/>`) + 재시작만 남긴다. 결말 장부는 기존 `buildLedger(state)` 유지(이 태스크에선 GameClient 동작 불변). 시작 게이트 클릭 시 `started=true`로 `TransferRound`를 마운트하도록 구성(현 `started` 로직 재사용).
- [ ] **Step 4: 타입/테스트 게이트** — Run: `npx tsc --noEmit` · `npx vitest run` · Expected: 통과·92 green.
- [ ] **Step 5: 브라우저 파리티 검증** — Preview(dev)로 `/` 로드 → 전원 시작 → STEMI 시나리오 완주(NO_BED→NO_BACKUP_CARE 등 거절 뱃지, 매달리기 ×N, 골든타임 소모, DIED/ACCEPTED 결말의 영수증+장부). Expected: 추출 전과 **동일 동작**. 콘솔 에러 0.
- [ ] **Step 6: 커밋** — T-026, 예: `refactor(ui): 전원/영수증/장부 뷰를 TransferRound·Receipt·LedgerPanel로 추출 (세션 재사용 준비)`.

---

## Task 3: `SetupWizard` + `SessionClient` 스켈레톤 → 세션 진입

SETUP 화면을 만들고, `page.tsx`를 세션으로 전환한다. `SessionClient`는 이 태스크에서 `SETUP`만 실제로 렌더하고 나머지 페이즈는 최소 플레이스홀더(다음 태스크에서 채움).

**Files:**
- Create: `src/components/SetupWizard.tsx`, `src/components/SessionClient.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- `SetupWizard({ onComplete }: { onComplete: (choices: SetupChoices) => void })` — 로컬 `useState<SetupChoices>({ hospitalName: '', doctors: {} })`. `DEPARTMENTS`를 카드로, 각 카드에 `−/+` 스테퍼(`onClick={() => set(c => adjustDoctors(c, dept.key, ±1))}`), 이름 `input`, 라이브 예산 미터(`hiringCost(choices)` / `SETUP_BUDGET_BILLIONS`), 시작 버튼(`disabled={!isSetupReady(choices)}` → `onComplete(choices)`).
- `SessionClient()` — `useState<SessionState>(startSession)`. `phase`로 스위치:
  ```tsx
  'use client'
  export default function SessionClient() {
    const [session, setSession] = useState<SessionState>(startSession)
    switch (session.phase) {
      case 'SETUP':
        return <SetupWizard onComplete={(choices) => setSession(completeSetup(choices))} />
      case 'RECEIVING':   return <PhasePlaceholder label="RECEIVING (Task 4)" />
      case 'INTERSTITIAL':return <PhasePlaceholder label="INTERSTITIAL (Task 5)" />
      case 'EMERGENCY':   return <PhasePlaceholder label="EMERGENCY (Task 5)" />
      case 'EPILOGUE':    return <PhasePlaceholder label="EPILOGUE (Task 6)" />
    }
  }
  ```
  `PhasePlaceholder`는 이 파일 안 임시 컴포넌트(다음 태스크에서 교체).
- `page.tsx`: `import SessionClient from '@/components/SessionClient'; export default function Home(){ return <SessionClient/> }`.

**시각(spec §3):** 어두운 콘솔. 과 카드는 `bg-white/[0.03] border-zinc-800`; 수익과는 emerald 힌트(`미용·피부 · 수익 예상 ↑`), 필수과는 amber 경고(`순환기내과(PCI) · 적자 예상 · 소송 ⚠`). 예산 미터는 초과 시 red. 숫자는 `font-mono tabular-nums`.

- [ ] **Step 1: `SetupWizard` 작성** — 위 계약대로. 유도 카피는 `DEPARTMENTS`의 `label`+`essential`/`profitPerDoctorBillions`/`lawsuitRisk`에서 파생(수익과 초록·필수과 앰버). **순환기 스킵 허용**(강제 최소 없음).
- [ ] **Step 2: `SessionClient`+`page` 배선** — 위 스켈레톤. `import`: `startSession, completeSetup, type SessionState`(session.ts), `SetupWizard`.
- [ ] **Step 3: 게이트** — `npx tsc --noEmit` 통과.
- [ ] **Step 4: 브라우저 검증** — Preview로 `/` → 위저드 렌더. (a) 이름 비우면 시작 비활성, (b) `+`로 미용 2 담으면 예산 미터 20/100·시작 활성, (c) 순환기 30억 추가 후 흉부 32억·산부 28억 더하면 90/100까지 되고 초과 시 미터 red·시작 비활성, (d) 순환기 0으로도 시작 가능(공범 허용), (e) 시작 클릭 → RECEIVING 플레이스홀더로 전환. 콘솔 에러 0.
- [ ] **Step 5: 커밋** — T-026, 예: `feat(ui): SetupWizard + SessionClient 스켈레톤 — page를 세션 진입으로 전환(위저드-first)`.

---

## Task 4: `ReceivingPhase` — 콜 큐 + 명랑 장부

RECEIVING 페이즈. 콜을 한 통씩 처리(수용/거절/하드락), 옆에서 명랑 장부가 갱신. 큐 소진 시 막간으로 넘어가는 [계속].

**Files:**
- Create: `src/components/ReceivingPhase.tsx`
- Modify: `src/components/SessionClient.tsx`

**Interfaces:**
- `ReceivingPhase({ receiving, onDecide, onContinue }: { receiving: ReceivingState; onDecide: (accept: boolean) => void; onContinue: () => void })`
  - 현재 콜 = `receiving.queue[receiving.index]`(단, `receiving.done`이면 요약+[계속]).
  - `const disposition = classifyCall(receiving.hospital, call)`. `HARDLOCK_REJECT`면 [수용] 비활성 + `RECEIVE_HARDLOCK`/거절 대사, 안내("받아도 못 뚫어요"). `CHOICE`면 [수용]`onDecide(true)`/[거절]`onDecide(false)`.
  - 발신 호소: `CALLER_PLEA[call.kind]` 중 `receiving.index`로 변주. 처리 결과 대사: `receivingLine(call, disposition, accepted, seed)`(직전 로그 기반, 선택적).
  - 명랑 장부(사이드): `receiving.hospital.economics.segments`(부문 손익) + 라이브 "분기 진료 수익 `+{receiving.netProfitDeltaBillions}억`" + 러닝 순이익(둘 합). "이번 분기 흑자 🎉"는 순이익>0일 때. `receiving.lawsuitExposure`는 **1막에선 표시하지 않는다**(냉정한 소송 비용은 결말에서 실현 — 명랑 UI가 리스크를 축소하는 게 논지). 숫자는 `font-mono tabular-nums`, emerald.
- `SessionClient` RECEIVING 케이스:
  ```tsx
  case 'RECEIVING':
    return <ReceivingPhase
      receiving={session.receiving!}
      onDecide={(accept) => setSession(s => ({ ...s, receiving: decide(s.receiving!, accept) }))}
      onContinue={() => setSession(completeReceiving(session))} />
  ```

- [ ] **Step 1: `ReceivingPhase` 작성** — 위 계약. 콜 1통 카드 + 명랑 장부 사이드. 하드락 콜은 [수용] 비활성(가드는 `decide`도 하지만 UI에서 선제 표기).
- [ ] **Step 2: `SessionClient` 배선** — RECEIVING 케이스 교체. `import`: `decide`(receiving.ts), `completeReceiving`(session.ts), `classifyCall`도 컴포넌트에서 import.
- [ ] **Step 3: 게이트** — `npx tsc --noEmit` 통과.
- [ ] **Step 4: 브라우저 검증(양 병원 유형)** — (A) 순환기 스킵 병원으로 진행: c2/c5 STEMI 콜이 **하드락**(수용 비활성)로 뜨고, 워크인은 명랑 수용, 장부 흑자↑. 5통 소진 → [계속] 노출 → 막간(플레이스홀더). (B) 순환기 포함 병원: STEMI 콜이 **CHOICE**(수용/거절 선택) — 수용 시 순이익 감소(-20)·거절 시 유지. 콘솔 에러 0.
- [ ] **Step 5: 커밋** — T-026, 예: `feat(ui): ReceivingPhase — 콜 큐(하드락/선택) + 명랑 장부(1막 다크코미디)`.

---

## Task 5: `Interstitial` + `InHouseEmergency` + EMERGENCY(TRANSFER) 배선

막간(시점 전환·붕괴 시그니처의 자리)과 2막 분기 두 화면을 만들고, `beginEmergency`로 분기 배선한다.

**Files:**
- Create: `src/components/Interstitial.tsx`, `src/components/InHouseEmergency.tsx`
- Modify: `src/components/SessionClient.tsx`

**Interfaces:**
- `Interstitial({ hospital, receiving, onContinue }: { hospital: Hospital; receiving: ReceivingState; onContinue: () => void })` — "분기 마감. 순이익 `+{net}억` 🎉"(명랑, `net` = `hospital.economics.segments` 합 + `receiving.netProfitDeltaBillions`) → 톤 꺾임 카피 "이번엔 **당신 응급실로** STEMI가 온다." → [계속]`onContinue()`. (붕괴 애니메이션은 Task 7에서 이 컴포넌트에 얹는다.)
- `InHouseEmergency({ onContinue }: { onContinue: () => void })` — "내 순환기팀이 직접 PCI → 생존." 짧은 냉정 비트 + [계속]`onContinue()`(→ toEpilogue). 전원 미니게임 없음.
- `SessionClient`:
  ```tsx
  case 'INTERSTITIAL':
    return <Interstitial hospital={session.hospital!} receiving={session.receiving!}
      onContinue={() => setSession(beginEmergency(session))} />
  case 'EMERGENCY': {
    const em = session.emergency!
    if (em.mode === 'IN_HOUSE')
      return <InHouseEmergency onContinue={() => setSession(toEpilogue(session))} />
    return <TransferRound game={em.game}
      onFinish={(final) => setSession(toEpilogue({ ...session, emergency: { mode: 'TRANSFER', game: final } }))} />
  }
  ```
  `toEpilogue`는 `emergency.game.status`가 종료여야 통과 → `onFinish`가 넘긴 `final`을 세션에 반영한 뒤 호출.

- [ ] **Step 1: `Interstitial`·`InHouseEmergency` 작성** — 위 계약. 냉정 카피(해석 0 원칙, 톤은 꺾인 뒤 냉정).
- [ ] **Step 2: `SessionClient` 배선** — INTERSTITIAL·EMERGENCY 케이스 교체. `import`: `beginEmergency`,`toEpilogue`(session.ts), `TransferRound`.
- [ ] **Step 3: 게이트** — `npx tsc --noEmit` 통과.
- [ ] **Step 4: 브라우저 검증(양 분기)** — (A) **공범**(순환기 스킵) 세션: 막간 → [계속] → `TransferRound`(STEMI 전원 뺑뺑이, 기존 UI) 진입·플레이·DIED/ACCEPTED로 EPILOGUE 플레이스홀더 전환. (B) **양심**(순환기 포함) 세션: 막간 → [계속] → `InHouseEmergency`(생존 비트) → [계속] → EPILOGUE 플레이스홀더. 콘솔 에러 0.
- [ ] **Step 5: 커밋** — T-026, 예: `feat(ui): 막간(시점 전환) + 2막 분기 — InHouseEmergency / TransferRound 배선`.

---

## Task 6: `Epilogue` — 내 병원 영수증 + 장부 (세 낙차), `GameClient` 제거

결말을 `buildEpilogue(session)` 파생으로 렌더한다. 장부는 이제 하드코딩 병원이 아니라 **플레이어 병원**. 세션이 완성되므로 `GameClient`를 제거한다.

**Files:**
- Create: `src/components/Epilogue.tsx`
- Modify: `src/components/SessionClient.tsx`
- Delete: `src/components/GameClient.tsx`

**Interfaces:**
- `Epilogue({ epilogue, onRestart }: { epilogue: SessionEpilogue; onRestart: () => void })` — `epilogue.survived`로 헤더(생존/사망, 톤 냉정). `epilogue.debrief`가 있으면(전원 경로만) `<Receipt debrief={epilogue.debrief}/>`. `epilogue.ledger`가 있으면 `<LedgerPanel ledger={epilogue.ledger}/>`(공범=흑자·순환기 채용 0 / 양심=적자+소송 비용 줄+채용 N — 전부 `buildEpilogue`가 파생, 하드코딩 없음). `다시 한 판` → `onRestart()`. 허구 고지 각주 유지.
- `SessionClient`:
  ```tsx
  case 'EPILOGUE':
    return <Epilogue epilogue={buildEpilogue(session)} onRestart={() => setSession(startSession())} />
  ```
- `page.tsx`는 이미 `SessionClient` 렌더 중 → `GameClient` 참조 없음. 삭제 안전.

- [ ] **Step 1: `Epilogue` 작성** — 위 계약. `Receipt`(전원 시)·`LedgerPanel`(항상) 재사용. 세 분기(공범·사망 / 공범·생존 / 양심·생존)는 `survived`·`debrief` 유무·`ledger` 값에서 자연 파생 — 분기별 하드코딩 카피 최소(라벨+숫자).
- [ ] **Step 2: `SessionClient` 배선 + `GameClient` 삭제** — EPILOGUE 케이스 교체(`import buildEpilogue, startSession`). `PhasePlaceholder` 임시 컴포넌트 제거. `rm src/components/GameClient.tsx`.
- [ ] **Step 3: 게이트** — `npx tsc --noEmit`(GameClient 참조 잔재 0 확인) · `npx vitest run` 92 green.
- [ ] **Step 4: 브라우저 검증(양 경로 결말)** — (A) **공범**: 전원 실패 → 영수증(배후진료 불가 ×N·받을 수 있던 곳 1/6) + 내 장부(흑자·순환기 채용 **0**). (B) **양심**: in-house 생존 → 영수증 없음 + 내 장부(적자·**소송 비용** 줄·순환기 채용 **N**). 병원 이름이 위저드 입력값. `다시 한 판` → SETUP. 콘솔 에러 0.
- [ ] **Step 5: 커밋** — T-026, 예: `feat(ui): Epilogue — 내 병원 영수증+장부(세 낙차) · GameClient 제거(세션이 대체)`.

---

## Task 7: 통일 시각 마감 + 막간 붕괴 시그니처 + QA 게이트

전 페이즈의 통일 시각을 최종 점검하고, 시그니처(막간 탈색 전환)를 얹고, 배포 게이트를 통과시킨다.

**Files:**
- Modify: `src/components/Interstitial.tsx`(붕괴 전환) · `src/app/globals.css`(필요 시 keyframe) · 각 페이즈 컴포넌트(시각 통일 미세 조정)

**Interfaces:** 신규 순수 로직 없음(시각·QA).

- [ ] **Step 1: 통일 시각 점검** — spec §3 토큰 대조: 전 페이즈 bg `zinc-950`·보더 `zinc-800`·숫자 `font-mono tabular-nums` 일관. 1막 액센트 emerald·리스크 amber, 결말 red. 밝은 배경 화면이 하나도 없는지 확인(있으면 어두운 시스템으로 교정).
- [ ] **Step 2: 막간 붕괴 시그니처** — `Interstitial`에서 [계속] 시 초록 액센트가 빠지고(탈색) STEMI 경보로 무대가 식는 전환(CSS transition/keyframe). `@media (prefers-reduced-motion: reduce)`면 즉시 크로스페이드. 1막에서 올린 순이익 숫자가 결말 장부 첫 줄과 **같은 값**임을 시각적으로 잇는다(카피/배치).
- [ ] **Step 3: 접근성·반응형** — 키보드 포커스 가시성(버튼·스테퍼·입력), `prefers-reduced-motion` 존중, 모바일 375px 가로 넘침 0(위저드 카드·콜 큐·장부 스택).
- [ ] **Step 4: 최종 게이트** — Run: `npx tsc --noEmit` · `npx vitest run`(92 green) · `next build`(Turbopack, breaking 버전 가이드 준수) · Expected: 전부 통과.
- [ ] **Step 5: 양 경로 완주 스크린샷** — Preview로 공범 경로·양심 경로 각각 한 세션 완주하며 위저드/콜큐-명랑장부/막간붕괴/2막/결말 스크린샷 확보(④ 제출 문서 ⏳ 슬롯·plan P6/P7용).
- [ ] **Step 6: 커밋** — T-026, 예: `feat(ui): 통일 시각 마감 + 막간 붕괴 시그니처 + 반응형/접근성 · 배포 게이트 통과`.

---

## Self-Review 메모(작성자)

- **Spec 커버리지**: 진입 A(Task 3·`page`) · 컴포넌트 추출(Task 2) · 5페이즈(SETUP T3·RECEIVING T4·INTERSTITIAL/EMERGENCY T5·EPILOGUE T6) · 통일 시각·붕괴(T7) · 음수 방어(T1) — spec 전 결정 매핑됨.
- **타입 일관성**: 컴포넌트 props는 기존 export 타입(`Debrief`·`Ledger`·`GameState`·`SetupChoices`·`ReceivingState`·`SessionEpilogue`)만 사용. 신규 타입 없음.
- **비파괴 검증 지점**: Task 2 Step 5(추출 파리티), Task 6 Step 3(GameClient 제거 후 tsc·92 green).
- **열린 세부(구현 중 확정, spec §11)**: 명랑 장부의 정확한 표기 구성(부문 손익 노출 범위)·막간 붕괴 전환의 정확한 연출 강도 — TDD 대상 아님(순수 로직 아님), 브라우저에서 톤 가드레일 따라 조율.
