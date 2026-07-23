---
tags:
  - type/plan
---

# 연속 시간 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RECEIVING 화면을 "정지가 기본이고 움직임이 예외"인 슬라이드쇼에서, 콜과 콜 사이가 끊기지 않고 흐르는 시뮬레이션으로 바꾼다.

**Architecture:** 게임 시각 `atMin` 하나를 훅이 만들어 맵·HUD·명단이 공유한다(기존 구조 계승). 시계 속도를 게임 1분 = 50ms로 늦추고 캡을 없앤다. 시계만 늦추면 아무도 안 움직이므로, 움직임을 **게임 시계와 분리된 CSS 층**으로 따로 세운다 — 결정 대기로 시계가 멈춰도 병원은 계속 돈다. 하루의 끝은 `session.ts`가 이미 계산하던 마감 초과 점유(`busyUntil`)를 읽어 19시를 넘겨 재생한다.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · vitest

**설계 스펙:** `docs/superpowers/specs/2026-07-23-continuous-clock-design.md`

## Global Constraints

모든 태스크의 요구사항에 이 절이 암묵적으로 포함된다.

- **0 침습** — `src/game/receiving.ts` · `src/game/adjudicate.ts` · `src/game/daysim.ts` · `src/game/session.ts`를 **한 줄도 바꾸지 않는다.** 표시 레이어는 게임 상태를 만들지도 바꾸지도 않는다.
- **RNG 0** — `Math.random()` · `Date.now()` · 인자 없는 `new Date()` 금지. 모든 무작위성은 `seededUnit`(`src/game/daysim.ts`) 파생이다. 표시 레이어에도 똑같이 적용된다.
- **타입체크는 별도 게이트** — vitest는 esbuild라 타입을 안 본다. 매 태스크 `npx tsc --noEmit`을 따로 돌린다.
- **상수 정확값**:
  - `MS_PER_GAME_MIN = 50` · `CLOCK_TICK_MS = 100`
  - `wanderTiming`: `delayMs ∈ [0, 2000)` · `durationMs ∈ [2600, 4200)`
  - `ambientWalkers`: 개수 `DAY: 5` / `DUSK: 2` / `NIGHT: 0` · `delayMs ∈ [0, 8000)` · `durationMs ∈ [9000, 16000)` · `lane ∈ {0, 1, 2}`
- **해석 카피 0** — 맵과 HUD에 "순환기 과부하" 같은 주제 문구를 넣지 않는다. 사실(꺼진 방·시각·거절 사유)만 놓고 플레이어가 스스로 잇는다.
- **이미지 파일 0개** — 스프라이트는 전부 inline SVG `<rect>`. 새 에셋을 추가하지 않는다.
- **사용자 대면 텍스트는 한국어**. 코드·식별자·경로는 원문.
- **커밋** — 한글 메시지는 `.commit-msg-tmp`(UTF-8, BOM 없음) + `git commit -F`. PowerShell 5.1이 인라인 한글을 CP949로 깨뜨린다. AI 추적 트레일러(`Skills-used:` … `Co-Authored-By:`)는 **중간에 빈 줄 없이 연속**이어야 한다 — 빈 줄이 하나라도 있으면 git이 앞부분을 통째로 버린다.
- **새 md는 frontmatter 태그 필수** — `docs/superpowers/plans/`는 `type/plan`, `claude-docs/troubleshooting/`은 `type/troubleshooting`. pre-commit이 거부한다.

### 스펙에서 조정된 것 (리뷰어 참고)

스펙 §3은 배경 보행자도 `transform`으로 움직인다고 썼다. **실제로는 `left`를 애니메이션한다.** 이유: `transform: translateX(%)`의 백분율은 **자기 자신의 너비** 기준이라 20px 스프라이트가 112%를 가도 22px밖에 안 움직인다 — 복도를 가로지르려면 컨테이너 기준인 `left`여야 한다. 배경 보행자는 자기 레이어에 있고 `left`를 쓰는 다른 애니메이션이 없어 충돌이 없다. 스펙의 요지(**게임 시계와 무관한 CSS 층**)는 그대로다.

유휴 배회는 스펙대로 `transform`이다 — 그쪽은 바깥 div가 `left`/`top` 배치 transition을 쓰고 있어 속성을 갈라야만 한다.

---

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/game/hospitalMap.ts` | 순수 파생 — 장면·조명·**시계 구간**·**연출 파라미터**. 게임 상태를 안 만든다 | 1·2·3 |
| `src/game/hospitalMap.test.ts` | 위 순수 함수 전수 | 1·2·3 |
| `src/components/useHospitalClock.ts` | 상태 → `atMin` 하나. 훅은 게임을 안 건드린다 (`useFastForwardClock.ts` 대체) | 1 |
| `src/app/globals.css` | 연출 keyframes 2개 + reduced-motion 차단 | 2·3 |
| `src/components/HospitalMap.tsx` | `MapScene`을 그리는 표시층 + 배회 래퍼 + 배경 레이어 | 2·3 |
| `src/components/CallCard.tsx` | **신규** — 도착한 콜 한 통의 패널. `call`에서 파생되는 계산 전부를 담는다 | 4 |
| `src/components/ReceivingPhase.tsx` | 페이즈 조립 — 흐름/정지 분기, 마감 대기 | 1·4 |

---

## Task 1: 시계 — 게임 1분 = 50ms, 마감을 넘겨 흐른다

**Files:**
- Modify: `src/game/hospitalMap.ts` (140~163행 「빨리감기」 절 교체, 4행 import)
- Modify: `src/game/hospitalMap.test.ts` (222~257행 두 describe 교체, 3행 import)
- Create: `src/components/useHospitalClock.ts`
- Delete: `src/components/useFastForwardClock.ts`
- Modify: `src/components/ReceivingPhase.tsx` (23행 import, 155행 훅 호출, 249~253행 스킵 래퍼)

**Interfaces:**
- Consumes: `sweepMinutes(from, to, steps): number[]`(기존 유지) · `DAY_LENGTH_MIN`(`src/game/daysim.ts`, 값 600) · `ReceivingState.busyUntil: Record<string, number>`
- Produces:
  - `MS_PER_GAME_MIN = 50` · `CLOCK_TICK_MS = 100`
  - `flowDurationMs(from: number, to: number): number`
  - `flowStepCount(from: number, to: number): number`
  - `dayEndMin(busyUntil: Record<string, number>): number`
  - `useHospitalClock(receiving: ReceivingState): { atMin: number; flowing: boolean; skip: () => void }`
- 삭제되는 것(다른 태스크가 참조하면 안 됨): `FAST_FORWARD_STEPS` · `FAST_FORWARD_MS_CAP` · `FAST_FORWARD_MS_PER_MIN` · `sweepDurationMs`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/game/hospitalMap.test.ts`의 3행을 이렇게 바꾼다(`DAY_LENGTH_MIN` 추가 — 파일 뒤쪽에서 또 import 하면 중복 선언이다):

```ts
import { NIGHT_START_MIN, DAY_LENGTH_MIN } from './daysim'
```

그리고 **222행부터 파일 끝(257행)까지를 통째로** 아래로 교체한다:

```ts
import { sweepMinutes, flowDurationMs, flowStepCount, dayEndMin, MS_PER_GAME_MIN, CLOCK_TICK_MS } from './hospitalMap'

describe('sweepMinutes — 콜 사이 시각열', () => {
  it('마지막은 항상 목표 시각이고 개수는 steps다', () => {
    const seq = sweepMinutes(100, 220, 12)
    expect(seq).toHaveLength(12)
    expect(seq[seq.length - 1]).toBe(220)
  })

  it('단조 증가하고 출발 시각을 넘어선다(from은 포함하지 않는다)', () => {
    const seq = sweepMinutes(100, 220, 4)
    expect(seq[0]).toBeGreaterThan(100)
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1])
  })

  it('구간이 없거나(같은 시각·되감기) steps가 1 이하면 목표 하나만 — 즉시 점프', () => {
    expect(sweepMinutes(200, 200, 12)).toEqual([200])
    expect(sweepMinutes(300, 200, 12)).toEqual([200])
    expect(sweepMinutes(100, 220, 1)).toEqual([220]) // prefers-reduced-motion 경로
  })
})

describe('flowDurationMs — 게임 시간에 정비례(캡 없음)', () => {
  it('콜 사이 120분은 6초다', () => {
    expect(flowDurationMs(0, 120)).toBe(6000)
  })

  it('하루 600분을 그대로 재생하면 30초 — 긴 구간이 캡에 잘리지 않는다', () => {
    expect(flowDurationMs(0, DAY_LENGTH_MIN)).toBe(DAY_LENGTH_MIN * MS_PER_GAME_MIN)
  })

  it('되감기·0구간은 0ms', () => {
    expect(flowDurationMs(200, 200)).toBe(0)
    expect(flowDurationMs(300, 200)).toBe(0)
  })
})

describe('flowStepCount — 프레임 수', () => {
  it('100ms 틱마다 2게임분', () => {
    expect(CLOCK_TICK_MS / MS_PER_GAME_MIN).toBe(2)
    expect(flowStepCount(0, 120)).toBe(60)
  })

  it('아무리 짧아도 1프레임(0으로 나뉘지 않는다)', () => {
    expect(flowStepCount(0, 1)).toBe(1)
    expect(flowStepCount(200, 200)).toBe(1)
    expect(flowStepCount(300, 200)).toBe(1)
  })

  it('중복 프레임 불변식 — 어떤 구간에서도 같은 분이 두 번 나오지 않는다', () => {
    // steps > 구간분이면 sweepMinutes의 반올림이 같은 분을 반복해 무변화 프레임이 생긴다.
    // MS_PER_GAME_MIN(50) < CLOCK_TICK_MS(100)이라 steps ≈ 구간분/2 로 구조적으로 상한 아래다.
    for (let span = 1; span <= 300; span++) {
      const seq = sweepMinutes(0, span, flowStepCount(0, span))
      expect(new Set(seq).size, `구간 ${span}분에서 중복 프레임`).toBe(seq.length)
    }
  })
})

describe('dayEndMin — 하루가 실제로 끝나는 시각', () => {
  it('아무도 안 바쁘면 마감 시각', () => {
    expect(dayEndMin({})).toBe(DAY_LENGTH_MIN)
  })

  it('마감 전에 다 끝났으면 마감 시각 — 앞당기지 않는다', () => {
    expect(dayEndMin({ a: 300, b: 599 })).toBe(DAY_LENGTH_MIN)
  })

  it('마감을 넘겨 진료 중이면 그 종료 시각까지 — 19시가 하루의 끝이 아니다', () => {
    expect(dayEndMin({ a: 750, b: 300 })).toBe(750)
  })
})

describe('lightingAt — 마감을 넘긴 시각', () => {
  it('19시를 넘긴 시각도 밤이다(진료가 남아 있어도)', () => {
    expect(lightingAt(DAY_LENGTH_MIN + 150)).toBe('NIGHT')
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

기대: FAIL. `flowDurationMs`·`flowStepCount`·`dayEndMin`·`MS_PER_GAME_MIN`·`CLOCK_TICK_MS`가 `./hospitalMap`에 없다는 에러.

- [ ] **Step 3: `hospitalMap.ts`의 import 한 줄과 「빨리감기」 절을 교체한다**

4행을 바꾼다:

```ts
import { DAY_LENGTH_MIN, NIGHT_START_MIN } from './daysim'
```

그리고 **140행 `// ── 빨리감기(연출 전용) ───` 부터 파일 끝까지**를 아래로 교체한다:

```ts
// ── 시계 흐름(연출 전용) ────────────────────────────────────────────────
// 게임 상태와 무관하다. 중간에 끊기든 스킵하든 판정에 영향 0.

/**
 * 게임 1분당 재생 시간(ms). **캡이 없다.**
 *
 * 캡을 두면 "게임 1분 = 50ms" 계약이 긴 구간에서만 깨져, 같은 길이의 구간이
 * 어떤 날은 6초 어떤 날은 1.5초가 된다 — 화면 속도가 게임 시간과 어긋나는 게
 * 긴 구간을 기다리는 것보다 나쁘다. 긴 구간의 탈출구는 건너뛰기다.
 */
export const MS_PER_GAME_MIN = 50
/** 실시간 틱 간격(ms). 100ms마다 2게임분 → 시계 표시가 초당 10번 갱신돼 '흐르는' 것으로 읽힌다. */
export const CLOCK_TICK_MS = 100

/** 이 구간 재생에 쓸 총 시간(ms). 되감기·0구간은 0. */
export function flowDurationMs(from: number, to: number): number {
  return Math.max(0, to - from) * MS_PER_GAME_MIN
}

/**
 * 이 구간을 몇 프레임으로 쪼갤지 — 항상 1 이상이고 **구간 길이(분)를 넘지 않는다**.
 *
 * 상한이 중요하다: steps > 구간분이면 sweepMinutes의 반올림이 같은 분을 두 번 내
 * 무변화 프레임이 생긴다. MS_PER_GAME_MIN(50) < CLOCK_TICK_MS(100)이라
 * steps ≈ 구간분/2 로 그 상한 아래에 구조적으로 머문다(테스트가 전 구간 검증).
 */
export function flowStepCount(from: number, to: number): number {
  return Math.max(1, Math.round(flowDurationMs(from, to) / CLOCK_TICK_MS))
}

/**
 * 오늘이 **실제로** 끝나는 시각 — 마감(DAY_LENGTH_MIN)과 마지막 진료 종료 중 늦은 쪽.
 *
 * 새 숫자를 만들지 않는다: session.ts의 boardedBusyUntilFrom이 이미 이 초과분을
 * 내일 아침 점유로 넘기고 있다. 구현돼 있고 돌아가고 있는데 화면이 한 번도 안
 * 보여줬을 뿐이다 — 여기선 그걸 **보이게만** 한다.
 *
 * 상한: arrivalMin ≤ 599 + durationMin ≤ 180 = 779(22:59)라 자정을 안 넘는다.
 */
export function dayEndMin(busyUntil: Record<string, number>): number {
  return Math.max(DAY_LENGTH_MIN, ...Object.values(busyUntil))
}

/**
 * from(제외) → to(포함)를 steps개로 나눈 시각열.
 * 구간이 없거나 steps ≤ 1이면 [to] 하나 — 즉시 점프(prefers-reduced-motion 경로).
 *
 * ⚠️ steps > (to − from)이면 반올림이 같은 분을 여러 번 낸다(무변화 프레임).
 * 호출부는 flowStepCount를 쓴다 — 그게 이 상한을 구조적으로 지킨다.
 */
export function sweepMinutes(from: number, to: number, steps: number): number[] {
  if (to <= from || steps <= 1) return [to]
  const span = to - from
  return Array.from({ length: steps }, (_, i) => from + Math.round((span * (i + 1)) / steps))
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

기대: PASS (기존 30개 + 새 항목 전부).

- [ ] **Step 5: 훅을 신설한다**

`src/components/useHospitalClock.ts`를 만든다:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { CLOCK_TICK_MS, dayEndMin, flowStepCount, sweepMinutes } from "@/game/hospitalMap";
import type { ReceivingState } from "@/game/receiving";

/**
 * 이번 구간의 목표 시각 — 흐름이 어디서 멈추는가.
 *
 * 진행 중 → 다음 콜의 도착 시각(거기서 멈추고 플레이어가 결정한다)
 * 마감    → dayEndMin(19시를 넘겨 마지막 진료가 끝날 때까지 돈다)
 *
 * 빈 큐는 퇴화 케이스라 흐르지 않는다 — 아무 일도 없는 하루를 30초 재생할 이유가 없다.
 */
function flowTargetMin(receiving: ReceivingState): number {
  if (!receiving.done) return receiving.queue[receiving.index]?.arrivalMin ?? receiving.clockMin;
  if (receiving.queue.length === 0) return receiving.clockMin;
  return dayEndMin(receiving.busyUntil);
}

/**
 * 게임 시각 atMin 하나를 내놓는다 — 맵·HUD·명단이 이걸 공유한다.
 *
 * 게임 상태를 전혀 건드리지 않는다: 중간에 끊기든 스킵하든 판정은 동일하다.
 * 구간의 출발점은 상태에서 파생한다 — receiving.clockMin은 decide가 직전 콜의
 * arrivalMin으로 전진시킨 값이라 정확히 '지난 콜 시각'이다. 이전 상태를 ref에
 * 들고 있을 필요가 없다.
 */
export function useHospitalClock(receiving: ReceivingState): {
  atMin: number;
  flowing: boolean;
  skip: () => void;
} {
  const to = flowTargetMin(receiving);
  // 초기값은 목표가 아니라 **출발 시각**이다 — to로 시작하면 첫 페인트에서 뒤로 튀었다가 다시 감긴다.
  const [atMin, setAtMin] = useState(receiving.clockMin);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const from = receiving.clockMin;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seq = sweepMinutes(from, to, reduced ? 1 : flowStepCount(from, to));

    setAtMin(seq[0]);
    let i = 1;
    const tick = () => {
      if (i >= seq.length) return;
      setAtMin(seq[i++]);
      timer.current = setTimeout(tick, CLOCK_TICK_MS);
    };
    if (seq.length > 1) timer.current = setTimeout(tick, CLOCK_TICK_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [receiving.clockMin, to]);

  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAtMin(to);
  };

  return { atMin, flowing: atMin < to, skip };
}
```

- [ ] **Step 6: 옛 훅을 지우고 호출부를 옮긴다**

```bash
git rm src/components/useFastForwardClock.ts
```

`src/components/ReceivingPhase.tsx` 23행:

```ts
import { useHospitalClock } from "./useHospitalClock";
```

155행:

```ts
  const { atMin, flowing, skip } = useHospitalClock(receiving);
```

249~253행의 스킵 래퍼(`sweeping` 두 곳):

```tsx
      <div
        onClick={flowing ? skip : undefined}
        className={flowing ? "cursor-pointer" : undefined}
        role="presentation"
      >
```

- [ ] **Step 7: 전체 게이트를 돌린다**

```bash
npx tsc --noEmit
```

기대: `TypeScript: No errors found`. (`sweeping`·`sweepDurationMs`·`FAST_FORWARD_*` 잔재가 있으면 여기서 잡힌다.)

```bash
npx vitest run
```

기대: 전체 PASS, 실패 0.

- [ ] **Step 8: 커밋**

```bash
cat > .commit-msg-tmp <<'EOF'
feat: 시계를 게임 1분 = 50ms로 늦추고 마감을 넘겨 흐르게 (연출 전용)

콜 사이 120게임분이 0.48초에서 6초가 된다. 캡을 없앤 이유는 캡이 "1분 = 50ms"
계약을 긴 구간에서만 깨뜨려 화면 속도가 게임 시간과 어긋나기 때문이다.

dayEndMin은 새 숫자를 만들지 않는다 — session.ts의 boardedBusyUntilFrom이 이미
계산해 내일 아침으로 넘기던 마감 초과 점유를 읽을 뿐이다.

게임 로직(receiving·adjudicate·daysim·session) 0줄.

Skills-used: superpowers:subagent-driven-development, superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 중복 프레임 불변식(구간 1~300분 전수)을 구현 전에 못박아, 옛 코드가 남긴 부정확한 docstring을 설명이 아니라 검사로 닫았다
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
git add -A && git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp
```

---

## Task 2: 유휴 배회 — 시계가 멈춰도 아바타는 움직인다

**Files:**
- Modify: `src/game/hospitalMap.ts` (파일 끝에 「배회·배경」 절 추가, 1~4행 import)
- Modify: `src/game/hospitalMap.test.ts` (파일 끝에 describe 추가)
- Modify: `src/app/globals.css` (파일 끝)
- Modify: `src/components/HospitalMap.tsx` (3~4행 import, 99~110행 아바타 레이어)

**Interfaces:**
- Consumes: `seededUnit(seed: number): number`(`src/game/daysim.ts`, [0,1) 반환)
- Produces: `wanderTiming(id: string): { delayMs: number; durationMs: number }` · CSS 클래스 `.hm-wander`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/game/hospitalMap.test.ts` **파일 끝에** 붙인다:

```ts
import { wanderTiming } from './hospitalMap'

describe('wanderTiming — 유휴 배회 박자', () => {
  it('같은 id는 항상 같은 박자(RNG 0 — Math.random 금지)', () => {
    expect(wanderTiming('doc-CARDIOLOGY-1')).toEqual(wanderTiming('doc-CARDIOLOGY-1'))
  })

  it('다른 id는 박자가 갈린다 — 전원이 같은 박자면 기계로 보인다', () => {
    const ids = ['doc-CARDIOLOGY-1', 'doc-CARDIOLOGY-2', 'doc-AESTHETICS-1', 'pat-doc-CARDIOLOGY-1']
    const beats = ids.map((id) => {
      const t = wanderTiming(id)
      return `${t.delayMs}/${t.durationMs}`
    })
    expect(new Set(beats).size).toBe(ids.length)
  })

  it('지연 0~2초, 주기 2.6~4.2초 안에 있다', () => {
    for (const id of ['', 'a', 'doc-CARDIOLOGY-1', 'pat-doc-AESTHETICS-3']) {
      const { delayMs, durationMs } = wanderTiming(id)
      expect(delayMs).toBeGreaterThanOrEqual(0)
      expect(delayMs).toBeLessThan(2000)
      expect(durationMs).toBeGreaterThanOrEqual(2600)
      expect(durationMs).toBeLessThan(4200)
    }
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

기대: FAIL. `wanderTiming`이 `./hospitalMap`에 없다.

- [ ] **Step 3: `wanderTiming`을 구현한다**

`src/game/hospitalMap.ts` 4행의 daysim import에 `seededUnit`을 더한다:

```ts
import { DAY_LENGTH_MIN, NIGHT_START_MIN, seededUnit } from './daysim'
```

파일 **끝에** 붙인다:

```ts
// ── 배회·배경(연출 전용) ────────────────────────────────────────────────
// CSS 애니메이션 파라미터만 만든다. 이 층은 게임 시계(atMin)와 분리돼 있어,
// 플레이어가 콜 카드를 노려보는 동안 시계가 멈춰도 병원은 계속 돈다.

/** 문자열 id → 안정 정수. seededUnit에 먹여 아바타마다 다른 박자를 만든다. */
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0
  return h
}

/**
 * 아바타별 유휴 배회 박자 — 전원이 같은 박자로 흔들리면 사람이 아니라 기계로 보인다.
 * seededUnit 파생이라 같은 id는 항상 같은 박자다(RNG 0 원칙은 표시 레이어에도 적용된다).
 */
export function wanderTiming(id: string): { delayMs: number; durationMs: number } {
  const h = hashId(id)
  return {
    delayMs: Math.floor(seededUnit(h) * 2000),
    // salt를 xor 해 지연과 주기를 서로 다른 스트림에서 뽑는다(같은 seed면 둘이 같이 움직인다).
    durationMs: 2600 + Math.floor(seededUnit(h ^ 0x5bf03635) * 1600),
  }
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

기대: PASS.

- [ ] **Step 5: keyframes를 넣는다**

`src/app/globals.css` **끝에** 붙인다:

```css
/* ── 병원 맵 연출 레이어 ────────────────────────────────────────────────
   게임 시계(atMin)와 분리된 층이다. 결정 대기로 시계가 멈춰도 병원은 계속 돈다.
   아바타 바깥 div가 배치 이동에 left/top + transition-all을 쓰므로, 배회는
   반드시 **안쪽 div의 transform**이어야 한다 — 같은 속성을 둘이 잡으면 이동
   중에 배회가 위치를 덮어써 아바타가 튄다. */
@keyframes hm-wander {
  0%,
  100% { transform: translate(0, 0); }
  25%  { transform: translate(1.5px, -1px); }
  50%  { transform: translate(0, 1.5px); }
  75%  { transform: translate(-1.5px, -0.5px); }
}

.hm-wander {
  animation-name: hm-wander;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  /* duration·delay는 wanderTiming이 인라인 style로 준다 */
}

@media (prefers-reduced-motion: reduce) {
  .hm-wander { animation: none; }
}
```

- [ ] **Step 6: 아바타 레이어에 안쪽 래퍼를 넣는다**

`src/components/HospitalMap.tsx` 3행 import에 `wanderTiming`을 더한다:

```ts
import { wanderTiming, type Lighting, type MapAvatar, type MapScene } from "@/game/hospitalMap";
```

99~110행의 아바타 `map`을 아래로 교체한다:

```tsx
        {scene.avatars.map((a) => {
          const { left, top } = positionOf(a, scene);
          const wander = wanderTiming(a.id);
          return (
            <div
              key={a.id}
              className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-linear sm:h-6 sm:w-6"
              style={{ left, top }}
            >
              {/*
                안쪽은 transform 전용이다 — 바깥이 left/top(배치 이동)을 쓰므로 속성이
                갈려야 이동과 배회가 서로 안 덮어쓴다. 바깥의 -translate-*도 transform이지만
                별개 요소라 충돌하지 않는다.
              */}
              <div
                className="hm-wander h-full w-full"
                style={{ animationDelay: `${wander.delayMs}ms`, animationDuration: `${wander.durationMs}ms` }}
              >
                {a.kind === "DOCTOR" && a.dept ? <DoctorSprite dept={a.dept} busy={a.busy} /> : <PatientSprite />}
              </div>
            </div>
          );
        })}
```

- [ ] **Step 7: 전체 게이트를 돌린다**

```bash
npx tsc --noEmit
```

기대: `TypeScript: No errors found`.

```bash
npx vitest run
```

기대: 전체 PASS.

- [ ] **Step 8: 커밋**

```bash
cat > .commit-msg-tmp <<'EOF'
feat: 유휴 배회 — 게임 시계가 멈춰도 아바타가 움직인다

시계만 늦추면 자유 의사가 복도에 가만히 서 있어 "느려진 정지 화면"이 된다.
배회를 CSS 층으로 분리해 결정 대기 중에도 병원이 돌게 한다.

박자는 wanderTiming(id) — seededUnit 파생이라 Math.random 없이 아바타마다 갈린다.
바깥 div가 left/top 배치 transition을 쓰므로 배회는 안쪽 div의 transform이어야 한다.

Skills-used: superpowers:subagent-driven-development, superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 박자가 id마다 실제로 갈리는지를 구현 전에 못박아, 전원이 같이 흔들리는 걸 브라우저에서야 발견하는 걸 막았다
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
git add -A && git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp
```

---

## Task 3: 배경 환자 — 병원이 돌아가는 곳으로 보인다

**Files:**
- Modify: `src/game/hospitalMap.ts` (「배회·배경」 절 끝에 추가)
- Modify: `src/game/hospitalMap.test.ts` (파일 끝에 describe 추가)
- Modify: `src/app/globals.css` (파일 끝)
- Modify: `src/components/HospitalMap.tsx` (import, 아바타 레이어 **앞에** 새 레이어)

**Interfaces:**
- Consumes: `hashId`(Task 2가 만든 비공개 헬퍼, 같은 파일 안) · `seededUnit` · `Lighting`
- Produces: `interface AmbientWalker { id: string; delayMs: number; durationMs: number; lane: number }` · `ambientWalkers(lighting: Lighting): AmbientWalker[]` · CSS 클래스 `.hm-walker`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/game/hospitalMap.test.ts` **파일 끝에** 붙인다:

```ts
import { ambientWalkers } from './hospitalMap'

describe('ambientWalkers — 배경 보행자(순수 장식)', () => {
  it('주간 5 · 석양 2 · 야간 0 — 밤에 텅 비는 것과 소등이 같은 출처다', () => {
    expect(ambientWalkers('DAY')).toHaveLength(5)
    expect(ambientWalkers('DUSK')).toHaveLength(2)
    expect(ambientWalkers('NIGHT')).toHaveLength(0)
  })

  it('같은 조명은 항상 같은 목록(RNG 0)', () => {
    expect(ambientWalkers('DAY')).toEqual(ambientWalkers('DAY'))
  })

  it('id가 고유하고, 인원이 줄어도 남는 사람은 key를 유지한다(리마운트로 걸음이 끊기지 않게)', () => {
    const day = ambientWalkers('DAY')
    expect(new Set(day.map((w) => w.id)).size).toBe(day.length)
    expect(ambientWalkers('DUSK').map((w) => w.id)).toEqual(day.slice(0, 2).map((w) => w.id))
  })

  it('lane은 복도 3줄 안(0|1|2)이고 지연·주기가 범위 안', () => {
    for (const w of ambientWalkers('DAY')) {
      expect([0, 1, 2]).toContain(w.lane)
      expect(w.delayMs).toBeGreaterThanOrEqual(0)
      expect(w.delayMs).toBeLessThan(8000)
      expect(w.durationMs).toBeGreaterThanOrEqual(9000)
      expect(w.durationMs).toBeLessThan(16000)
    }
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

기대: FAIL. `ambientWalkers`가 `./hospitalMap`에 없다.

- [ ] **Step 3: `ambientWalkers`를 구현한다**

`src/game/hospitalMap.ts` **끝에**(Task 2가 넣은 `wanderTiming` 아래) 붙인다:

```ts
/** 배경 보행자 한 명 — **게임 상태가 아니다**(순수 장식). 컴포넌트가 CSS 파라미터로 쓴다. */
export interface AmbientWalker {
  id: string
  delayMs: number
  durationMs: number
  /** 복도 안 세로 줄 0|1|2 — 컴포넌트가 px 위치로 옮긴다. */
  lane: number
}

/**
 * 조명별 배경 보행자 수. 밤에 텅 비는 것과 방이 꺼지는 것이 **같은 출처**(lighting)에서
 * 나온다 — 두 곳에 '밤'을 적으면 한쪽이 조용히 낡는다.
 */
const AMBIENT_COUNT: Record<Lighting, number> = { DAY: 5, DUSK: 2, NIGHT: 0 }

/**
 * 배경 보행자 목록 — 콜과 무관한 익명 통행이다.
 *
 * MapScene에 넣지 않는 이유: 이건 게임 상태 파생이 아니라 장식이라, avatars에 섞으면
 * (a) 「보이는 것 = 게임이 모델링하는 것」이 깨지고 (b) deriveMapScene의 테스트가
 * 장식을 검증하게 되고 (c) 복도 슬롯 카운터를 장식이 밀어낸다.
 *
 * id를 인덱스로 고정하는 이유: 조명이 바뀌어 인원이 줄어도 남는 사람은 같은 React key를
 * 유지해야 리마운트로 걸음이 끊기지 않는다.
 */
export function ambientWalkers(lighting: Lighting): AmbientWalker[] {
  return Array.from({ length: AMBIENT_COUNT[lighting] }, (_, i) => {
    const h = hashId(`amb-${i}`)
    return {
      id: `amb-${i}`,
      delayMs: Math.floor(seededUnit(h) * 8000),
      durationMs: 9000 + Math.floor(seededUnit(h ^ 0x2545f491) * 7000),
      lane: Math.floor(seededUnit(h ^ 0x1b873593) * 3),
    }
  })
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

기대: PASS.

- [ ] **Step 5: keyframes를 넣는다**

`src/app/globals.css` **끝에** 붙인다:

```css
/* 배경 보행자 — 콜과 무관한 익명 통행. 게임 상태가 아니라 장식이라 aria-hidden이다.
   transform: translateX(%)를 쓰지 않는 이유: 백분율이 **자기 너비** 기준이라 20px
   스프라이트가 112%를 가도 22px밖에 안 움직인다. 복도를 가로지르려면 컨테이너 기준인
   left여야 한다. 이 레이어는 left를 쓰는 다른 애니메이션이 없어 충돌하지 않는다. */
@keyframes hm-walk {
  from { left: -8%; }
  to   { left: 108%; }
}

.hm-walker {
  animation-name: hm-walk;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  /* backwards가 필수다 — 없으면 지연(최대 8초) 동안 from이 안 적용돼 left가 auto로
     남아, 보행자가 화면 왼쪽 끝에 멈춰 선 채로 8초를 서 있는다. */
  animation-fill-mode: backwards;
  /* duration·delay는 ambientWalkers가 인라인 style로 준다 */
}

@media (prefers-reduced-motion: reduce) {
  /* 애니메이션만 끄면 left가 auto가 돼 다섯 명이 왼쪽 끝에 겹쳐 선다.
     이 층은 존재 이유가 움직임이라 통째로 숨기는 게 맞다. */
  .hm-walker { display: none; }
}
```

- [ ] **Step 6: 배경 레이어를 넣는다**

`src/components/HospitalMap.tsx` 3행 import를 아래로 바꾼다:

```ts
import { ambientWalkers, wanderTiming, type Lighting, type MapAvatar, type MapScene } from "@/game/hospitalMap";
```

`{/* 아바타 레이어 — 이동이 곧 transition이다 */}` 블록 **바로 앞에** 붙인다(아바타보다 먼저 그려야 뒤에 깔린다):

```tsx
      {/*
        배경 보행자 — 콜과 무관한 익명 통행. MapScene에 없다(게임 상태가 아니라 장식).
        CSS 애니메이션이라 게임 시계가 멈춰도 계속 걷는다 — 결정 대기 중에도 병원이 돈다.
        불투명도를 낮춰 침대 위의 '진짜' 환자와 구별한다.
      */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {ambientWalkers(scene.lighting).map((w) => (
          <div
            key={w.id}
            className="hm-walker absolute h-4 w-4 -translate-y-1/2 opacity-40 sm:h-5 sm:w-5"
            style={{
              // 복도 밴드(ROOMS_H% ~ ROOMS_H+CORRIDOR_H%) 안의 세 줄: 56% / 60% / 64%
              top: `${ROOMS_H + 4 + w.lane * 4}%`,
              animationDelay: `${w.delayMs}ms`,
              animationDuration: `${w.durationMs}ms`,
            }}
          >
            <PatientSprite />
          </div>
        ))}
      </div>
```

- [ ] **Step 7: 전체 게이트를 돌린다**

```bash
npx tsc --noEmit
```

기대: `TypeScript: No errors found`.

```bash
npx vitest run
```

기대: 전체 PASS.

- [ ] **Step 8: 커밋**

```bash
cat > .commit-msg-tmp <<'EOF'
feat: 배경 보행자 — 병원이 돌아가는 곳으로 보인다

콜과 무관한 익명 통행을 복도에 얹는다. 인원은 조명 하나에서 파생한다
(주간 5 / 석양 2 / 야간 0) — 밤에 텅 비는 것과 방이 꺼지는 것이 같은 출처다.

MapScene에 넣지 않았다: 게임 상태 파생이 아니라 장식이라, avatars에 섞으면
"보이는 것 = 게임이 모델링하는 것"이 깨지고 복도 슬롯 카운터를 장식이 밀어낸다.

Skills-used: superpowers:subagent-driven-development, superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 조명이 줄 때 남는 보행자가 같은 key를 유지하는지(리마운트로 걸음이 끊기지 않는지)를 테스트로 먼저 고정했다
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
git add -A && git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp
```

---

## Task 4: 콜 카드는 도착해야 뜬다 — 패널 분리와 마감 대기

**Files:**
- Create: `src/components/CallCard.tsx`
- Modify: `src/components/ReceivingPhase.tsx` (import·조기 반환·패널 분기·카운터 클램프)

**Interfaces:**
- Consumes: `useHospitalClock(receiving): { atMin, flowing, skip }`(Task 1)
- Produces: `CallCard({ receiving, onDecide }: { receiving: ReceivingState; onDecide: (accept: boolean) => void })` — 기본 내보내기

**왜 분리가 필수인가:** `receiving.done && flowing`인 동안 `receiving.queue[receiving.index]`는 `undefined`다(`index === queue.length`). 지금 `ReceivingPhase`는 `call`을 최상위에서 읽어 `reason`·`plea`·`free`·`assignee`를 전부 파생하므로, 그대로 두면 마감 흐름에서 터진다.

- [ ] **Step 1: `CallCard.tsx`를 만든다**

`src/components/CallCard.tsx`:

```tsx
"use client";

import { callerPleaAt } from "@/game/dialogue";
import { formatSignedBillions } from "@/game/labels";
import {
  callDelta,
  hardlockReason,
  isElective,
  CALL_ECONOMICS,
  type ReceivingState,
} from "@/game/receiving";
import { freeDoctorsOfDept, pickAssignee } from "@/game/daysim";
import { handlingDept } from "@/game/doctor";
import { REASON_CLAUSE } from "@/game/news";
import type { IncomingCall } from "@/game/types";

/**
 * 콜당 수가/원가 내역 — "가격을 누가 정하는가"를 두 줄로만 놓는다.
 *
 * 해석 0 원칙(메모 game-show-dont-tell): "정부가 원가도 안 준다"고 쓰지 않는다.
 * 미용은 '진료비 (병원 책정)'이 원가보다 크고, 급여는 '수가 (정부 고시)'가 원가보다 작다 —
 * 그 대조가 콜마다 반복되면 플레이어가 스스로 읽는다. 라벨 한 단어가 전부다.
 */
function CallEconomicsBreakdown({ call }: { call: IncomingCall }) {
  const e = CALL_ECONOMICS[call.kind];
  const delta = callDelta(call.kind);
  const revenueLabel = e.priceSetter === "HOSPITAL" ? "진료비 (병원 책정)" : "수가 (정부 고시)";

  return (
    <dl className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-black/30 px-3 py-2.5 font-mono text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-zinc-400">{revenueLabel}</dt>
        <dd className="tabular-nums text-zinc-300">{formatSignedBillions(e.revenueBillions)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-zinc-400">원가</dt>
        <dd className="tabular-nums text-zinc-300">{formatSignedBillions(-e.costBillions)}</dd>
      </div>
      <div className="my-0.5 border-t border-zinc-800" />
      <div className="flex items-baseline justify-between gap-3">
        <dt className="sr-only">수용 시 손익</dt>
        <dd className="ml-auto tabular-nums font-semibold text-zinc-100">
          {formatSignedBillions(delta)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * 도착한 콜 한 통 — 라벨·대사·수가·행동.
 *
 * **흐름 중에는 렌더되지 않는다.** 마감 흐름(done)에서는 queue[index]가 undefined라
 * 아래 계산이 전부 터지므로, 호출부가 `flowing === false`일 때만 이걸 고른다.
 */
export default function CallCard({
  receiving,
  onDecide,
}: {
  receiving: ReceivingState;
  onDecide: (accept: boolean) => void;
}) {
  const call = receiving.queue[receiving.index];
  const roster = receiving.hospital.roster ?? [];
  const reason = hardlockReason(receiving.hospital, call, receiving.busyUntil, roster);
  const plea = callerPleaAt(receiving.queue, receiving.index);

  const elective = isElective(call.kind);
  const dept = handlingDept(call);
  const arrivalMin = call.arrivalMin ?? 0;
  const free = freeDoctorsOfDept(roster, receiving.busyUntil, dept, arrivalMin);
  // decide()와 같은 가드 — 담당 과 자유 의사가 있으면 점유한다(세분 응급 포함, GENERAL 특례 제거).
  const assignee = free.length > 0 ? pickAssignee(free, receiving.busyUntil) : undefined;

  return (
    <section className="flex flex-1 flex-col gap-3 rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-4">
      {/*
        야간 표시 — 왜 밤에만 막히는지 플레이어가 스스로 잇게 하려면 시간대가 보여야 한다.
        해석은 없다. '야간' 두 글자와, 순환기를 뽑고도 밤에 거절당하는 경험만 놓는다.
      */}
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-zinc-100">{call.label}</p>
        {call.nightShift && (
          <span className="rounded-full border border-indigo-800/70 bg-indigo-950/50 px-2 py-0.5 text-[10px] font-medium tracking-wider text-indigo-300">
            야간
          </span>
        )}
      </div>
      <p className="text-sm italic text-zinc-400">&ldquo;{plea}&rdquo;</p>

      <CallEconomicsBreakdown call={call} />

      {elective ? (
        // 선택진료 — 플레이어가 받기/보내기를 정한다. 하드락은 없다(reason은 항상 null) —
        // 그 과 자유 의사가 없으면 '받기'만 비활성(구조가 막은 게 아니라 자원이 없는 것).
        <div className="mt-1 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onDecide(true)}
            disabled={free.length === 0}
            aria-label={`${call.label} 받기`}
            className="flex-1 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            받기
          </button>
          <button
            type="button"
            onClick={() => onDecide(false)}
            aria-label={`${call.label} 보내기`}
            className="flex-1 rounded-lg border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            보내기
          </button>
        </div>
      ) : (
        // 응급 — decide가 accept를 무시하고 자동 판정한다. 여기선 그 결과만 먼저 보여주고
        // '계속'이 실제 decide(true)를 부른다(전개는 그대로, accept 값은 무의미).
        <div className="mt-1 flex flex-col gap-3">
          <div
            className={`rounded-lg border px-4 py-3 text-sm font-medium ${
              reason === null
                ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300"
                : "border-amber-800/60 bg-amber-950/30 text-amber-300"
            }`}
          >
            {reason === null ? `수용${assignee ? ` · ${assignee.name}` : ""}` : `전원 불가 · ${REASON_CLAUSE[reason]}`}
          </div>
          <button
            type="button"
            onClick={() => onDecide(true)}
            className="rounded-lg bg-zinc-100 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            계속
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: `ReceivingPhase.tsx`의 import 블록을 줄인다**

1~23행을 아래로 교체한다(콜 파생 계산이 전부 `CallCard`로 갔으므로 여기서 지운다):

```tsx
"use client";

import { receivingLine } from "@/game/dialogue";
import { formatSignedBillions } from "@/game/labels";
import {
  accruedSegments,
  runningNetProfit,
  DAY_LABELS,
  type ReceivingState,
} from "@/game/receiving";
import { DAY_OPEN_MIN } from "@/game/daysim";
import type { NewsItem } from "@/game/news";
import SegmentTree from "./SegmentTree";
import DoctorRoster from "./DoctorRoster";
import HospitalMap from "./HospitalMap";
import CallCard from "./CallCard";
import { deriveMapScene } from "@/game/hospitalMap";
import { useHospitalClock } from "./useHospitalClock";
```

이어서 **`CallEconomicsBreakdown` 함수 정의 전체(원본 33~64행)를 삭제한다** — `CallCard.tsx`로 옮겨갔다.

- [ ] **Step 3: 흐름 패널 컴포넌트를 더한다**

`MorningPaper` 함수 정의 **바로 아래**에 붙인다:

```tsx
/**
 * 흐름 중 패널 — 결정할 게 없는 동안 콜 카드 자리를 채운다.
 *
 * 직전 콜 결과를 여기 놓는 이유: 방금 내린 결정의 결과를 읽을 시간이 이 6초다.
 * 새 콜이 도착하면 관심은 새 콜로 옮겨가므로 그때는 사라져도 된다.
 */
function FlowPanel({
  prevLabel,
  prevLine,
  waitingForDayEnd,
  onSkip,
}: {
  prevLabel?: string;
  prevLine?: string;
  waitingForDayEnd: boolean;
  onSkip: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col gap-3 rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-4">
      {/*
        그날 첫 콜이라 직전이 없으면 아무 문구도 넣지 않는다 — 버튼만 남는다.
        「진료 중」 같은 채움말을 넣으면 개원 직후 아무도 진료 안 하는 시각에 거짓말이 된다.
      */}
      {prevLabel && prevLine && (
        <p className="text-sm text-zinc-400">
          직전 · <span className="text-zinc-300">{prevLabel}</span> → {prevLine}
        </p>
      )}
      {waitingForDayEnd && (
        <p className="text-xs text-zinc-600">
          오늘 콜은 모두 처리했습니다 · 마지막 진료가 끝나기를 기다립니다
        </p>
      )}
      <button
        type="button"
        onClick={onSkip}
        className="mt-auto rounded-lg border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        건너뛰기
      </button>
    </section>
  );
}
```

- [ ] **Step 4: 조기 반환과 본문 분기를 바꾼다**

`ReceivingPhase` 본체(원본 154행 `const dayLabel = …`부터 함수 끝까지)를 아래로 교체한다:

```tsx
  const dayLabel = `${DAY_LABELS[day - 1]}요일`;
  const { atMin, flowing, skip } = useHospitalClock(receiving);
  const scene = deriveMapScene(receiving, atMin);

  // 마감이어도 **흐르는 동안에는** 맵을 계속 보여준다 — 19시를 넘겨 마지막 진료가
  // 끝나는 걸 보는 게 이 슬라이스의 목적이라, 흐름이 끝난 뒤에만 요약으로 넘어간다.
  if (receiving.done && !flowing) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 bg-zinc-950">
        <header className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{dayLabel} · 전원 콜 접수</span>
          <h1 className="text-lg font-semibold">
            오늘의 콜 {receiving.queue.length}통을 모두 처리했습니다
          </h1>
        </header>

        <div className="flex flex-col gap-1.5">
          {receiving.log.map((entry, i) => {
            const call = receiving.queue[i];
            const label = entry.accepted
              ? "수용"
              : entry.disposition === "HARDLOCK_REJECT"
                ? "하드락"
                : "거절";
            return (
              <div
                key={entry.callId}
                className="flex items-center justify-between rounded-md border border-zinc-800 bg-white/[0.03] px-3 py-2 text-xs"
              >
                <span className="text-zinc-400">{call.label}</span>
                <span className={entry.accepted ? "text-emerald-400" : "text-zinc-600"}>{label}</span>
              </div>
            );
          })}
        </div>

        <CheerfulLedger receiving={receiving} />

        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          계속
        </button>
      </main>
    );
  }

  const prevCall = receiving.index > 0 ? receiving.queue[receiving.index - 1] : undefined;
  const prevLog = receiving.log[receiving.log.length - 1];
  const prevLine =
    prevCall && prevLog
      ? receivingLine(
          prevCall,
          prevLog.disposition,
          prevLog.accepted,
          receiving.index - 1,
          prevLog.reason ?? undefined,
        )
      : undefined;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 text-zinc-100 bg-zinc-950">
      {/*
        HUD — 요일·콜 진행·시각. 시각은 맵과 같은 atMin을 쓴다(흐르는 동안 시계도 함께 흐른다).
        해석 카피 0: 조명 이모지와 숫자만 놓는다.
        카운터는 클램프한다 — 마감 흐름에서는 index === queue.length라 「콜 6 / 5」가 된다.
      */}
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{dayLabel} · 전원 콜 접수</span>
          <h1 className="text-lg font-semibold">
            콜 {Math.min(receiving.index + 1, receiving.queue.length)} / {receiving.queue.length}
          </h1>
        </div>
        <span className="flex items-center gap-2 font-mono text-sm tabular-nums text-zinc-400">
          {formatClock(atMin)}
          <span aria-hidden>{scene.lighting === "NIGHT" ? "🌙" : scene.lighting === "DUSK" ? "🌆" : "☀"}</span>
        </span>
      </header>

      {/*
        맵이 주인공. 재생 중 아무 데나 눌러도 건너뛴다 — 편의용 중복 진입점이고,
        키보드 경로는 FlowPanel의 「건너뛰기」 버튼이 담당한다.
      */}
      <div
        onClick={flowing ? skip : undefined}
        className={flowing ? "cursor-pointer" : undefined}
        role="presentation"
      >
        <HospitalMap scene={scene} />
      </div>

      <MorningPaper news={news} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/*
          흐르는 동안엔 결정할 게 없어 카드가 없다. 도착해야 뜬다.
          (마감 흐름에서는 queue[index]가 undefined라 CallCard가 렌더되면 터진다.)
        */}
        {flowing ? (
          <FlowPanel
            prevLabel={prevCall?.label}
            prevLine={prevLine}
            waitingForDayEnd={receiving.done}
            onSkip={skip}
          />
        ) : (
          <CallCard receiving={receiving} onDecide={onDecide} />
        )}

        {/*
          명단을 남기는 이유: 아바타는 진료 중/자유만 보이고 피로도 막대는 못 보인다.
          맵이 순간 상태를, 명단이 누적을 담당한다.
        */}
        <div className="flex w-full flex-col gap-4 sm:w-72 sm:shrink-0">
          <DoctorRoster
            roster={receiving.hospital.roster ?? []}
            receiving={receiving}
            fatigue={fatigue}
            atMin={atMin}
          />
          <CheerfulLedger receiving={receiving} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: 전체 게이트를 돌린다**

```bash
npx tsc --noEmit
```

기대: `TypeScript: No errors found`. (미사용 import가 남아 있으면 여기 또는 lint에서 잡힌다.)

```bash
npx vitest run
```

기대: 전체 PASS.

```bash
npm run build
```

기대: `✓ Compiled successfully`.

- [ ] **Step 6: 커밋**

```bash
cat > .commit-msg-tmp <<'EOF'
feat: 콜 카드는 도착해야 뜬다 — 패널 분리와 마감 대기

흐르는 동안엔 결정할 게 없어 카드가 없다. 그 자리엔 직전 콜 결과와 건너뛰기 버튼을
놓는다 — 방금 내린 결정의 결과를 읽을 시간이 그 6초다.

CallCard 분리는 취향이 아니라 필수다: 마감 흐름(done)에서 queue[index]가 undefined라
콜 파생 계산이 최상위에 있으면 그대로 터진다. 같은 이유로 「콜 N / M」도 클램프했다.

건너뛰기를 진짜 button으로 둬 맵 클릭 래퍼(role=presentation)에 없던 키보드 경로가 생겼다.

Skills-used: superpowers:subagent-driven-development
Plugins-used: superpowers
Skill-benefit: SDD — 태스크별 리뷰가 done 흐름의 undefined 접근처럼 조건부 경로에서만 터지는 결함을 diff 단위로 잡게 했다
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
git add -A && git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp
```

---

## Task 5: 브라우저 실측 + 작업 추적 3종

**Files:**
- Modify: `claude-docs/plan.md` · `claude-docs/changeLog.md`
- Create(조건부): `claude-docs/troubleshooting/T-0NN.md` — 1분+ 근인 디버깅이 있었을 때만

**Interfaces:**
- Consumes: Task 1~4의 전체 산출물

- [ ] **Step 1: 개발 서버를 띄운다**

`.claude/launch.json`에 name `dev` 설정이 이미 있다. `preview_start`로 `{name: "dev"}`를 띄우고 `http://localhost:3000`을 연다. **`Bash`로 dev 서버를 돌리지 않는다.**

- [ ] **Step 2: 1주 완주 실측**

랜딩 → 병원 설립 위저드에서 **순환기내과 2 · 외과 1 · 미용·피부 1**로 개원 → 월~일 7일 전원 콜 접수.

스크린샷 compositing이 막혀 있으면(`the Browser pane is not displayed…`) `javascript_tool`로 DOM을 직접 질의한다. **T-064의 교훈을 적용한다: "이 값이 공식대로인가"가 아니라 "이 요소가 저 요소와 어떤 관계인가"로 질문을 쓴다.**

| # | 확인 | 어떻게 |
|---|---|---|
| 1 | 콜 사이가 실제로 ~6초 | 결정 클릭 시각과 콜 카드 재등장 시각을 `performance.now()`로 찍어 차이를 잰다. 구간 게임분 × 50ms 와 대조 |
| 2 | 흐름 중 카드가 없다 | 결정 직후 `document.querySelector` 로 「받기」/「계속」 버튼 부재 → 도착 시점에 등장 |
| 3 | **결정 대기 중에도 배경이 움직인다** | 카드가 뜬 상태에서 `.hm-walker` 하나의 `getBoundingClientRect().x`를 1초 간격 3회 측정 → 값이 계속 변한다 |
| 4 | 배회가 이동을 안 깬다 | 진료 종료로 아바타가 방→복도로 갈 때 좌표가 단조 이동(되돌아감·순간이동 없음) |
| 5 | 야간엔 아무도 없다 | NIGHT 진입 후 `.hm-walker` 개수 0 · DUSK에서 2 · DAY에서 5 |
| 6 | **마감이 19시를 넘는다** | 마지막 결정 후 시계가 19:00을 지나 계속 흐르고 `max(busyUntil)`에서 멈춘 뒤 요약이 뜬다 |
| 7 | 마감 시 켜진 방 | 그 시각에 진료 중인 의사의 방에만 아바타가 있고 나머지는 소등 |
| 8 | 건너뛰기 키보드 | Tab으로 「건너뛰기」에 도달 → Enter로 즉시 점프 |
| 9 | 카운터 클램프 | 마감 흐름 중 「콜 N / M」에서 N ≤ M |
| 10 | 콘솔 | 매 단계 `read_console_messages(onlyErrors: true)` → 에러 0 |
| 11 | 모바일 375px | `resize_window(375×812)` 후 `document.documentElement.scrollWidth === clientWidth === 375` |
| 12 | reduced-motion | `emulate`로 `prefers-reduced-motion: reduce` → 시계가 즉시 점프 · `.hm-wander`는 `getComputedStyle(...).animationName === "none"` · `.hm-walker`는 `display === "none"` |
| 13 | 보행자가 지연 중 안 보인다 | 페이지 로드 직후 `.hm-walker` 전원의 `getBoundingClientRect().right`가 맵 왼쪽 경계보다 작다(= `animation-fill-mode: backwards`가 먹었다). 이게 없으면 최대 8초간 왼쪽 끝에 서 있는다 |

문제를 찾으면 **소스를 고치고** 3번부터 다시 돈다. 고친 게 없으면 그대로 다음 단계.

- [ ] **Step 3: 흐름 패널 ↔ 콜 카드 높이 차를 잰다**

스펙 §7이 "먼저 재고, 실제로 거슬리면 그때 측정값으로 잡는다"로 남긴 항목이다. 손으로 찍은 상수를 넣지 않는다(T-064).

```
흐름 중 패널의 getBoundingClientRect().height
카드가 뜬 뒤 같은 자리의 height
```

두 값을 **기록한다.** 차이가 100px을 넘고 스크롤 위치가 눈에 띄게 밀리면 `FlowPanel`의 `<section>`에 측정값 기반 `min-h`를 넣는다. 넘지 않으면 **아무것도 안 한다** — 그 판단 근거(두 수치)를 리포트에 남긴다.

- [ ] **Step 4: 작업 추적 3종을 갱신한다**

`claude-docs/plan.md` — `## ✅ 완료 — 지도만` 절의 **마지막 항목(「병원 맵 — 의사를 숫자에서 아바타로」) 바로 아래**에 한 줄 추가한다. 이 절은 항목마다 `- **제목**: 서술` 형식이고 **항목별 ✅를 붙이지 않는다**(절 제목이 이미 ✅다):

```markdown
- **연속 시간 흐름 — 콜 사이가 흐른다**: RECEIVING이 "정지가 기본이고 움직임이 예외"인 슬라이드쇼였다. 시계를 게임 1분 = 50ms로 늦추고 캡을 없애(콜 사이 0.48초 → 6초, `useHospitalClock`) 콜과 콜 사이가 끊기지 않고 흐른다. 시계만 늦추면 자유 의사가 복도에 서 있어 "느려진 정지 화면"이 되므로, 유휴 배회(`wanderTiming` — 아바타 안쪽 `transform`)와 배경 보행자(`ambientWalkers` — 조명 파생 주간 5/석양 2/야간 0, MapScene 밖 별도 레이어)를 **게임 시계와 분리된 CSS 층**으로 세웠다 — 결정 대기로 시계가 멈춰도 병원은 계속 돈다. 콜 카드는 도착해야 뜨고(`CallCard` 분리 — 마감 흐름에선 `queue[index]`가 undefined), 하루의 끝은 `session.ts`가 이미 계산해 내일 아침으로 넘기던 마감 초과 점유(`dayEndMin`)를 읽어 19시를 넘겨 재생한다(새 숫자 0개). 게임 로직(receiving·adjudicate·daysim·session) 0줄. 설계 [spec](../docs/superpowers/specs/2026-07-23-continuous-clock-design.md)·[플랜](../docs/superpowers/plans/2026-07-23-continuous-clock.md)
```

`claude-docs/changeLog.md` — 맨 위에 항목 추가. **PR 번호를 적지 않는다**(프로젝트 override):

```markdown
## 2026-07-23 · 연속 시간 흐름 — 콜 사이가 흐른다

RECEIVING이 "정지가 기본이고 움직임이 예외"인 슬라이드쇼였다. 시계를 게임 1분 = 50ms로
늦추고(콜 사이 0.48초 → 6초) 캡을 없앴다. 시계만 늦추면 아무도 안 움직여 "느려진 정지
화면"이 되므로, 유휴 배회와 배경 보행자를 **게임 시계와 분리된 CSS 층**으로 세웠다 —
결정 대기로 시계가 멈춰도 병원은 계속 돈다.

하루의 끝은 session.ts가 이미 계산해 내일 아침으로 넘기던 마감 초과 점유(busyUntil)를
읽어 19시를 넘겨 재생한다. 새 숫자 0개 — 구현돼 있는데 화면이 한 번도 안 보여줬을 뿐이다.

게임 로직(receiving·adjudicate·daysim·session) 0줄.
```

- [ ] **Step 5: SDD 종료 trap 스윕 (프로젝트 규약 · 명시적으로 돈다)**

*"이번 브랜치에서 1분+ 근인 디버깅이 있었나 — 내가 아니라 서브에이전트·리뷰어가 잡은 것 포함?"*

- 있으면 `claude-docs/troubleshooting/T-0NN.md`를 신설한다. 번호는 `ls claude-docs/troubleshooting/`의 최댓값 + 1.
- 형식은 **frontmatter(`summary` + `tags: [type/troubleshooting]`) + 굵은 글머리 4필드**(`- **증상**:` / `- **원인**:` / `- **해결**:` / `- **재발방지**:`). 헤딩(`## 증상`)이 아니다 — 검사기가 거부한다.
- 허브 목차는 **자동 생성**이라 손대지 않는다:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rebuild-troubleshooting-index.ps1 -HubPath claude-docs/troubleshooting.md
```

기대: `INDEX-CHECK: REBUILT (NN entries)`.

없으면 신설하지 않고, 리포트에 **없었다고 명시**한다.

- [ ] **Step 6: 문서 검사기를 돌린다**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-doc-tags.ps1 claude-docs/plan.md claude-docs/changeLog.md
```

기대: `TAGS-CHECK: OK` · `LINKS-CHECK: OK`. (인자를 안 주면 0개를 검사하고 OK가 뜬다 — 반드시 경로를 넘긴다.)

- [ ] **Step 7: 최종 게이트**

```bash
npx tsc --noEmit
```

```bash
npx vitest run
```

```bash
npm run build
```

셋 다 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
cat > .commit-msg-tmp <<'EOF'
docs: 연속 시간 흐름 브라우저 실측 + 작업 추적 3종 갱신

1주 완주로 12개 항목 실측. 핵심은 "결정 대기 중에도 배경이 움직인다"와
"마감이 19시를 넘는다" 두 가지 — 둘 다 요소 간 관계로 질문을 써서 확인했다
(T-064: 값이 공식대로인가가 아니라 이 요소가 저 요소와 어떤 관계인가).

Skills-used: superpowers:subagent-driven-development
Plugins-used: superpowers
Skill-benefit: SDD — 실측을 별도 태스크로 떼어, 구현자가 자기 코드를 검증하는 대신 새 눈이 화면을 봤다
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
git add -A && git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp
```

---

## 부록 — 스펙 커버리지

| 스펙 절 | 어디서 구현되나 |
|---|---|
| §1 0 침습(게임 로직 0줄) | Global Constraints · 전 태스크의 `vitest run` 게이트 |
| §2.1 속도 50ms/캡 없음 | Task 1 Step 3 (`MS_PER_GAME_MIN`·`flowDurationMs`) |
| §2.1 100ms 틱 = 2게임분 | Task 1 Step 3 (`CLOCK_TICK_MS`·`flowStepCount`) |
| §2.2 목표 시각 분기 | Task 1 Step 5 (`flowTargetMin`) |
| §2.2 빈 큐 가드 | Task 1 Step 5 (`flowTargetMin` 2행) |
| §2.2 `dayEndMin` | Task 1 Step 3 · 테스트 Step 1 |
| §2.2 마감 초과가 안 깨진다 | Task 1 Step 1 (`lightingAt(DAY_LENGTH_MIN + 150)`) · Task 5 실측 6·7 |
| §3 두 층 분리 | Task 2 Step 5·6 (안쪽 `transform`) · Task 3 Step 5·6 (별도 레이어) |
| §3.1 `wanderTiming` | Task 2 전체 |
| §3.2 `ambientWalkers`·조명 파생 | Task 3 전체 |
| §3.2 MapScene에 안 넣는다 | Task 3 Step 6 (별도 레이어·`aria-hidden`) |
| §3.3 reduced-motion | Task 2 Step 5 · Task 3 Step 5 · Task 5 실측 12 |
| §4 흐름/정지 분기 | Task 4 Step 4 |
| §4.1 건너뛰기 버튼 | Task 4 Step 3 (`FlowPanel`) · Task 5 실측 8 |
| §4.2 `CallCard` 추출·조기 반환 | Task 4 Step 1·4 |
| §4.3 카운터 클램프 | Task 4 Step 4 · Task 5 실측 9 |
| §6 테스트 7항목 | Task 1 Step 1(1·2·3·4·7) · Task 2 Step 1(5) · Task 3 Step 1(6) |
| §6.1 브라우저 실측 9항목 | Task 5 Step 2 (12항목으로 확장 — 모바일·reduced-motion 추가) |
| §7 레이아웃 밀림 천장 | Task 5 Step 3 (재고 판단) |
