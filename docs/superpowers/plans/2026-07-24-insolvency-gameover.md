---
tags:
  - type/plan
---

# 폐업 게임오버 — 금고 음수 연속 2주 (PR 3) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 금고가 음수인 채로 두 주 연속이 되면 병원이 폐업(강제 에필로그)하는 실패 상태를 넣는다 — 돈이 처음으로 "의미"를 가지게 하되, 주차는 무한 유지해 "몇 주 버텼는가"가 자연 점수가 되게 한다.

**Architecture:** 급여·고정비는 이미 `completeWeek`의 `weekNet` 경유로 금고에 반영된다 — **경제 배선은 무변경**, 판정만 추가한다. `SessionState.insolvencyStreak`를 신설해 `completeWeek`에서 금고 음수면 +1, 흑자면 0으로 리셋한다. streak가 2에 도달하면 `nextWeek`을 봉쇄하고 에필로그를 폐업(`closed`)으로 연다. 스펙: [2026-07-24-emergency-agency-fun-design.md](../specs/2026-07-24-emergency-agency-fun-design.md) §6.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · vitest 4.

## Global Constraints

- **판정 = 결정론 코드.** `src/game/*`에 `Math.random`·`Date.now` 금지.
- **경제 배선 무변경.** 금고 계산(`treasury = state.treasury + weekNet`)은 그대로 — 이 PR은 그 위에 **판정만** 얹는다. 급여·수익 산식을 건드리지 마라.
- **주차 무한 유지.** 유한 회차("4주 공략")를 만들지 않는다 — 정답-퍼즐화를 피한다. 흑자로 돌아오면 streak가 리셋돼 계속 갈 수 있다.
- **해석 카피 0 (show-don't-tell).** "당신은 실패했다" 류 금지. "폐업"·"잔고 −N만원"은 게임 규칙·숫자의 **사실**이라 허용 — 평가·훈계 문구만 금지.
- **게이트:** 각 태스크 종료 시 `npm test` 전체 green **그리고** `npx tsc --noEmit` 0 에러(vitest는 타입체크를 안 한다). 마지막 태스크에서 `npx eslint src`까지(경고는 `_seed`·`initSystem` 2건 선재 — 늘지만 않으면 된다).
- **한글 커밋:** `.commit-msg-tmp`(UTF-8) + `git commit -F`. 트레일러(`Skills-used:` ~ `Co-Authored-By:`)는 **빈 줄 없이 연속**으로 맨 끝에. `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. `Skills-used:`는 실제 `Skill` 도구 호출만(없으면 `none`).
- **새 md 문서에는 폴더별 frontmatter 태그**(`type/*`) — pre-commit 검사기가 거부한다.
- 기존 코드의 주석 밀도·한국어 서술 스타일을 따른다.
- ⚠️ **환경 — 좀비 워크트리**: 이 세션의 `.claude/worktrees/` 워크트리는 좀비(무시)라 **메인 저장소 `C:\Users\kimsa\ClaudeProjects\HospitalSimulation`에서 작업**한다([T-074](../../../claude-docs/troubleshooting/T-074.md)). 모든 Bash는 `cd "C:/Users/kimsa/ClaudeProjects/HospitalSimulation"`로 시작. **무관한 사전 변경 3건**(`.obsidian/app.json`·`claude-docs/troubleshooting/T-062.md`·`docs/superpowers/plans/2026-07-20-world-event-briefing.md`)은 스테이징하지 마라 — 태스크 파일만 골라 담는다.

## 베이스라인 (PR 2 머지 후)

- `origin/main` = `0340708`(PR1+PR2 포함). 이 브랜치 `feat/insolvency-gameover`는 그 기준. `npm test` **454/454 green**, `tsc` 0.
- 관련 현재 상태:
  - `SessionState`: `treasury: number` 있음. `insolvencyStreak`는 **없다**(신설 대상).
  - `SessionState`를 리터럴로 구성하는 초기화 지점 **4곳**: `startSession`(session.ts:77) · `enterWorldEvent`(:99) · `beginSetup`(:112) · `completeSetup`(:123). 전부 `treasury: …`를 갖는다.
  - `completeWeek`(session.ts:274): `const weekNet = …; return { ...state, phase:'WEEK_SUMMARY', history:[...], treasury: state.treasury + weekNet }`.
  - `nextWeek`(session.ts:295): `WEEK_SUMMARY → WORLD_EVENT`. `endGame`(session.ts:392): `WEEK_SUMMARY → EPILOGUE`.
  - `SessionEpilogue`(session.ts:399): `{ ledger, weekNews, poolDepletion }`. `closed`는 없다.
  - `buildEpilogue`(session.ts:410): 위 셋을 파생. `state.hospital!`·`weekTotals`·`renderNews`·`poolDepletion` 사용.
  - `WeekSummary.tsx`: prop `{week, weekNetManwon, cumulativeNetManwon, received, turnedAway, treasury, onNextWeek, onEnd}`. 「다음 주」·「종료」 버튼.
  - `Epilogue.tsx`: prop `{epilogue, onRestart}`. 상단 "결말" 배지 + title(turnedAway 기반).
  - `SessionClient.tsx`: `WEEK_SUMMARY` 케이스가 `WeekSummary`에 위 prop을 넘기고 `onNextWeek={() => setSession(nextWeek(session))}` `onEnd={() => setSession(endGame(session))}`. `EPILOGUE` 케이스가 `Epilogue`에 `buildEpilogue(session)`.

## 파일 지도

| 파일 | 무엇이 바뀌나 |
|---|---|
| `src/game/session.ts` | `SessionState.insolvencyStreak` 신설 · 초기화 4곳 · `completeWeek` streak 갱신 · `nextWeek` 폐업 봉쇄 · `isInsolvent` 헬퍼 · `SessionEpilogue.closed` · `buildEpilogue` closed 산출 |
| `src/components/WeekSummary.tsx` | 은행 통지(streak 1 경고 / streak 2 폐업) + 폐업 시 「다음 주」 제거 |
| `src/components/SessionClient.tsx` | `WeekSummary`에 `insolvencyStreak`(또는 파생 플래그) 전달 |
| `src/components/Epilogue.tsx` | `closed`면 상단 배지·title을 「폐업」으로 |
| `src/game/session.test.ts` | streak 전이·nextWeek throw·buildEpilogue closed 테스트 |
| `README.md` · `claude-docs/changeLog.md` · `claude-docs/plan.md` | 문서 정합(Task 3) |

---

### Task 1: `insolvencyStreak` 코어 — 판정·봉쇄·에필로그 플래그

**Files:**
- Modify: `src/game/session.ts`
- Test: `src/game/session.test.ts`

**Interfaces:**
- Produces:
  - `SessionState.insolvencyStreak: number` — 금고가 음수인 채 마감된 연속 주 수.
  - `completeWeek`이 그걸 갱신: 새 금고 < 0이면 `prev+1`, ≥ 0이면 `0`.
  - `isInsolvent(state: SessionState): boolean` — `state.insolvencyStreak >= 2`(폐업). Task 2가 UI에서 쓴다.
  - `nextWeek`이 `isInsolvent`면 throw.
  - `SessionEpilogue.closed: boolean` — 폐업으로 끝났는가. `buildEpilogue`가 `isInsolvent(state)`로 산출.

- [ ] **Step 1: RED 테스트** — `src/game/session.test.ts`에 추가. 기존 테스트가 `SessionState`를 스프레드로 만드는 헬퍼(예: `completeWeek`을 거쳐 상태를 얻는 픽스처)를 쓰는지 먼저 확인하고, 아래는 그 픽스처 스타일을 따른다. **7일차 DAY_END 상태에서 금고를 세팅해 `completeWeek`을 호출**하는 형태로:

```ts
import { startSession, completeWeek, nextWeek, isInsolvent, buildEpilogue } from './session'

describe('폐업 판정 — insolvencyStreak (스펙 2026-07-24 §6)', () => {
  // 7일차 DAY_END 상태를 만드는 최소 픽스처: completeWeek의 전제(phase DAY_END, isLastDay)만 충족시키고
  // ledgerDays의 netProfit 합으로 weekNet을 제어한다. treasury와 함께 금고 부호를 만든다.
  function dayEndState(over: Partial<SessionState>): SessionState {
    return {
      ...startSession(),
      phase: 'DAY_END', day: DAYS_PER_WEEK, hospital: {} as never,
      ledgerDays: [], history: [], treasury: 0, insolvencyStreak: 0,
      ...over,
    }
  }

  it('초기 상태의 insolvencyStreak는 0', () => {
    expect(startSession().insolvencyStreak).toBe(0)
  })

  it('금고가 음수로 마감되면 streak +1', () => {
    const s = completeWeek(dayEndState({ treasury: -100 }))
    expect(s.insolvencyStreak).toBe(1)
  })

  it('음수 연속 2주면 streak 2 (폐업 임계)', () => {
    const s = completeWeek(dayEndState({ treasury: -100, insolvencyStreak: 1 }))
    expect(s.insolvencyStreak).toBe(2)
    expect(isInsolvent(s)).toBe(true)
  })

  it('흑자로 마감되면 streak가 0으로 리셋', () => {
    const s = completeWeek(dayEndState({ treasury: 100, insolvencyStreak: 1 }))
    expect(s.insolvencyStreak).toBe(0)
    expect(isInsolvent(s)).toBe(false)
  })

  it('streak 1은 아직 폐업 아님(경고 단계)', () => {
    expect(isInsolvent(completeWeek(dayEndState({ treasury: -100 })))).toBe(false)
  })

  it('폐업 상태에서 nextWeek은 throw', () => {
    const insolvent = { ...completeWeek(dayEndState({ treasury: -100, insolvencyStreak: 1 })) }
    expect(() => nextWeek(insolvent)).toThrow()
  })

  it('buildEpilogue: 폐업이면 closed=true, 자발 종료면 false', () => {
    const closed = buildEpilogue({ ...dayEndState({ insolvencyStreak: 2 }), phase: 'EPILOGUE' })
    expect(closed.closed).toBe(true)
    const voluntary = buildEpilogue({ ...dayEndState({ insolvencyStreak: 0 }), phase: 'EPILOGUE' })
    expect(voluntary.closed).toBe(false)
  })
})
```

⚠️ `DAYS_PER_WEEK`·`SessionState` import가 테스트 파일에 있는지 확인하고 없으면 추가한다. `buildEpilogue`가 `state.hospital!`·`state.system` 등을 참조하므로, `dayEndState`의 `hospital`·`system`이 `buildEpilogue`를 통과할 최소값인지 확인하라 — 통과 못 하면 `buildEpilogue` 테스트는 기존 픽스처(실제 세션을 EPILOGUE까지 몬 것)를 재사용하고 `insolvencyStreak`만 덮어써라. **closed 산출이 `insolvencyStreak`만 본다는 계약이 핵심**이라, 그 한 가지를 검증할 수 있으면 픽스처 형태는 자유다.

- [ ] **Step 2: RED 확인**

Run: `cd "C:/Users/kimsa/ClaudeProjects/HospitalSimulation" && npx vitest run src/game/session.test.ts -t 폐업`
Expected: FAIL — `insolvencyStreak`·`isInsolvent` 미정의.

- [ ] **Step 3: 구현** — `src/game/session.ts`

`SessionState` 인터페이스에 `treasury` 아래 추가:

```ts
  /**
   * 금고가 음수인 채 마감된 **연속 주 수**. completeWeek이 갱신한다(음수면 +1, 흑자면 0 리셋).
   * 2에 도달하면 폐업(isInsolvent) — 다음 주로 못 넘어가고 강제 에필로그로 닫힌다(스펙 §6).
   * 주차 자체는 무한이라 이 값이 "몇 주 버텼나"의 압력을 만든다(유한 회차를 만들지 않아 정답-퍼즐화 회피).
   */
  insolvencyStreak: number
```

**초기화 4곳** — `startSession`·`enterWorldEvent`·`beginSetup`·`completeSetup`의 반환 객체에 각각 `insolvencyStreak: 0,`을 추가한다(`treasury: …` 줄 근처). 4곳 모두 빠짐없이 — 하나라도 빠지면 그 경로로 시작한 세션에서 `undefined`가 되어 `completeWeek`의 `prev+1`이 `NaN`이 된다.

`completeWeek`의 반환을 교체:

```ts
  const weekNet = state.ledgerDays.reduce((n, d) => n + d.netProfitManwon, 0)
  const treasury = state.treasury + weekNet
  // 금고가 음수인 채 마감되면 연속 카운트를 올리고, 흑자로 돌아오면 0으로 리셋한다.
  const insolvencyStreak = treasury < 0 ? state.insolvencyStreak + 1 : 0
  return {
    ...state,
    phase: 'WEEK_SUMMARY',
    history: [...state.history, ...state.ledgerDays],
    treasury,
    insolvencyStreak,
  }
```

`completeWeek` 앞(또는 `isLastDay` 근처)에 헬퍼 신설:

```ts
/** 폐업했는가 — 금고 음수 연속 2주. WEEK_SUMMARY에서 참이면 다음 주로 못 가고 강제 에필로그로 닫힌다. */
export function isInsolvent(state: SessionState): boolean {
  return state.insolvencyStreak >= 2
}
```

`nextWeek` 맨 앞(phase 검사 다음)에 봉쇄 추가:

```ts
  if (isInsolvent(state)) {
    throw new Error('nextWeek: 폐업 상태에서는 다음 주로 갈 수 없다 (강제 에필로그)')
  }
```

`SessionEpilogue`에 `closed` 추가:

```ts
  /** 폐업으로 끝났는가(금고 음수 연속 2주). 자발 종료(endGame)면 false. 머리글만 바꾸고 결산 내용은 동일. */
  closed: boolean
```

`buildEpilogue`의 반환에 `closed` 추가:

```ts
  return { ledger, weekNews, poolDepletion, closed: isInsolvent(state) }
```

- [ ] **Step 4: GREEN + 게이트**

Run: `cd "C:/Users/kimsa/ClaudeProjects/HospitalSimulation" && npm test && npx tsc --noEmit`
Expected: 461/461(454 + 신규 7), 타입 0. **기존 454가 안 깨져야 한다** — `insolvencyStreak` 초기화를 4곳에 다 넣었으면 기존 completeWeek 테스트도 통과한다(streak가 0에서 시작).

⚠️ 기존 `session.test.ts`가 `SessionState`를 직접 리터럴로 만드는 곳이 있으면 `insolvencyStreak` 누락으로 tsc가 깨진다 — 그런 곳을 찾아 `insolvencyStreak: 0`을 추가하라(스프레드 `...startSession()` 패턴이면 자동 전파).

- [ ] **Step 5: 커밋**

```
feat: insolvencyStreak — 금고 음수 연속 2주 폐업 판정 (스펙 §6)

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — streak 전이·nextWeek 봉쇄·closed 산출을 케이스별 Red로 잠금
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 2: 폐업 UI — 은행 통지 + 강제 에필로그

**Files:**
- Modify: `src/components/WeekSummary.tsx` · `src/components/SessionClient.tsx` · `src/components/Epilogue.tsx`
- Test: 없음(컴포넌트 하네스 없음 — 컨트롤러 브라우저 실측).

**Interfaces:**
- Consumes: Task 1의 `state.insolvencyStreak`·`isInsolvent`·`SessionEpilogue.closed`.
- Produces: 없음(UI).

- [ ] **Step 1: SessionClient가 폐업 상태를 WeekSummary에 전달** — `src/components/SessionClient.tsx`

`WEEK_SUMMARY` 케이스의 `<WeekSummary … />`에 prop 두 개 추가(기존 prop 유지):

```tsx
          insolvencyStreak={session.insolvencyStreak}
```

`isInsolvent`를 import에 추가(`@/game/session`에서). (WeekSummary가 streak 값으로 경고/폐업을 자체 판별하므로 boolean 파생은 컴포넌트 안에서 한다 — SessionClient는 값만 넘긴다.)

- [ ] **Step 2: WeekSummary — 은행 통지 + 폐업 시 「다음 주」 제거** — `src/components/WeekSummary.tsx`

prop 타입에 `insolvencyStreak: number` 추가. 컴포넌트 안에서 파생:

```tsx
  const warning = insolvencyStreak === 1;   // 아직 폐업 아님 — 경고
  const closed = insolvencyStreak >= 2;      // 폐업
```

금고 줄(`treasury` 표시) **아래**, 버튼 그룹 **위**에 은행 통지 삽입:

```tsx
      {(warning || closed) && (
        // 은행 통지 — 규칙의 사실만(해석 0). 경고는 "다음 주도 적자면 폐업", 폐업은 확정 통지.
        // 색 단독 신호 금지: 붉은 잉크 + 글자가 함께 판정을 진다.
        <p className="rounded-xs border border-stamp bg-stamp-field px-4 py-3 text-center text-sm font-medium text-stamp-ink">
          {closed
            ? `은행: 두 주 연속 적자입니다. 병원은 폐업합니다.`
            : `은행: 잔고 ${formatSignedManwon(treasury)}. 다음 주도 적자면 폐업합니다.`}
        </p>
      )}
```

버튼 그룹을 폐업 분기로 교체 — 폐업이면 「다음 주」를 없애고 「결말」 하나만(자발 종료와 같은 `onEnd` → endGame → EPILOGUE, 거기서 `closed` 에필로그):

```tsx
      <div className="flex flex-col gap-2.5">
        {!closed && (
          <button
            type="button"
            onClick={onNextWeek}
            className="rounded-xs bg-go py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            다음 주
          </button>
        )}
        <button
          type="button"
          onClick={onEnd}
          className={
            closed
              ? "rounded-xs bg-go py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
              : "rounded-xs border border-frame py-3 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          }
        >
          {closed ? "결말 보기" : "종료"}
        </button>
      </div>
```

(폐업이면 「결말 보기」가 유일 버튼이라 강조 스타일 `bg-go`로, 평시엔 「종료」가 보조라 테두리 스타일로 — 자연스러운 위계.)

- [ ] **Step 3: Epilogue — 폐업이면 머리글을 「폐업」으로** — `src/components/Epilogue.tsx`

`const { ledger, weekNews, poolDepletion } = epilogue;` 를 `closed`까지 구조분해:

```tsx
  const { ledger, weekNews, poolDepletion, closed } = epilogue;
```

상단 "결말" 배지와 title을 `closed` 분기로. 기존 배지:

```tsx
      <span className={`text-xs uppercase tracking-[0.25em] ${turnedAway > 0 ? "text-alarm" : "text-on-desk/70"}`}>
        결말
      </span>
```

를 다음으로 교체(폐업이면 「폐업」, 아니면 기존 「결말」):

```tsx
      <span className={`text-xs uppercase tracking-[0.25em] ${closed || turnedAway > 0 ? "text-alarm" : "text-on-desk/70"}`}>
        {closed ? "폐업" : "결말"}
      </span>
```

title도 폐업이면 그 사실을 앞세운다. 기존 `title`/`subtitle` 계산 뒤에 덮어쓰기:

```tsx
  const headline = closed ? "병원이 문을 닫았다" : title;
  const subhead = closed ? "두 주 연속 적자였다. 그동안의 기록은 아래에 남는다." : subtitle;
```

그리고 렌더의 `{title}`·`{subtitle}`을 `{headline}`·`{subhead}`로 바꾼다. 제목 색도 `closed`면 alarm:

```tsx
        <p className={`font-serif text-2xl font-bold ${closed || turnedAway > 0 ? "text-alarm" : "text-on-desk"}`}>
          {headline}
        </p>
```

내용(신문·장부·풀·다시 버튼)은 **그대로** 둔다 — 스펙 "머리글만 폐업, 내용은 동일".

- [ ] **Step 4: 게이트 + 브라우저 검증**

Run: `cd "C:/Users/kimsa/ClaudeProjects/HospitalSimulation" && npm test && npx tsc --noEmit`
Expected: 461/461(UI 전용 불변), 타입 0.
브라우저(컨트롤러): 금고를 음수로 만들어 ① streak 1에서 주간 결산에 은행 경고 + 「다음 주」 유지 ② streak 2에서 은행 폐업 통지 + 「다음 주」 사라지고 「결말 보기」만 ③ 결말이 「폐업 / 병원이 문을 닫았다」 머리글 + 기존 장부·신문 내용.

- [ ] **Step 5: 커밋**

```
feat: 폐업 UI — 은행 통지·강제 에필로그 머리글 (스펙 §6)

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 3: 문서 정합 + 최종 게이트

**Files:**
- Modify: `README.md`(플레이 방법) · `claude-docs/plan.md` · `claude-docs/changeLog.md`

**Interfaces:**
- Consumes: Task 1·2 완료.
- Produces: PR 준비 완료 브랜치.

- [ ] **Step 1: README 「플레이 방법」에 폐업 한 줄** — 3번(주간 결산) 항목에 다음 취지를 덧붙인다(기존 문장 유지, 문체는 주변과 맞춘다):

> 금고가 음수인 채 두 주 연속이면 은행이 폐업을 통지한다 — 그 주가 마지막이다. 흑자로 돌아오면 카운트는 리셋되고 계속 갈 수 있다.

- [ ] **Step 2: plan.md·changeLog.md 갱신** — plan.md의 「재미 개선 3종」 섹션에서 PR 3을 ✅로(3종 전부 완료), changeLog.md 맨 위에 `## 2026-07-24 · 폐업 게임오버 — 금고 음수 연속 2주 (재미 개선 PR 3)` 항목(PR 번호 생략 — 프로젝트 규약). 의도·결과 중심.

- [ ] **Step 3: trap 스윕(프로젝트 규약)** — 이번 브랜치에서 1분+ 근인 디버깅이 있었나(서브에이전트·리뷰어가 잡은 것 포함)? 있으면 `claude-docs/troubleshooting/T-###.md` 신설(현재 최신 확인 후 다음 번호, frontmatter `summary` + `tags: [type/troubleshooting]` + 4필드), 목차는 `powershell -File scripts/rebuild-troubleshooting-index.ps1`로 재생성(직접 편집 금지). 없으면 넘어간다.

- [ ] **Step 4: 최종 게이트 + 커밋**

Run: `cd "C:/Users/kimsa/ClaudeProjects/HospitalSimulation" && npm test && npx tsc --noEmit && npx eslint src`
Expected: 461/461 · tsc 0 · eslint 0 errors(선재 경고 2건만).

```
docs: 폐업 게임오버 반영 — README·plan/changeLog (재미 개선 3종 완료)

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## 셀프리뷰 기록

- **스펙 커버리지**: §6 전부 → Task 1(insolvencyStreak·completeWeek 갱신·nextWeek 봉쇄·closed)·Task 2(은행 통지·강제 에필로그·폐업 머리글). "주차 무한 유지"·"흑자 복귀 리셋" → Task 1의 `treasury < 0 ? +1 : 0`. "경제 배선 무변경" → completeWeek의 금고 계산 그대로, streak만 추가.
- **자리표시자**: 없음 — 모든 코드 블록이 실제 삽입물. 초기화 4곳·기존 테스트 리터럴은 구현자가 확인할 지점으로 명시.
- **타입 일관성**: `insolvencyStreak: number`(Task 1) → SessionClient가 넘기고 WeekSummary가 받음(Task 2). `SessionEpilogue.closed: boolean`(Task 1) → Epilogue가 구조분해(Task 2). `isInsolvent`(Task 1) → nextWeek·buildEpilogue가 소비.
- **경계**: 폐업 봉쇄가 2중 — `nextWeek` throw(코어)와 WeekSummary가 「다음 주」 버튼을 아예 안 그림(UI). UI가 정상 경로를 막고, throw가 프로그램적 오용을 막는다.
- **해석 카피**: 은행 통지·폐업 머리글은 규칙·사실("폐업"·"두 주 연속 적자"·"잔고 −N")만. 평가·훈계 없음.
