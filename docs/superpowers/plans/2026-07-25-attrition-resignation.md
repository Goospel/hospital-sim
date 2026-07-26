---
tags:
  - type/plan
---

# 사직·이탈 구현 계획 (사람이 떠나면 장부가 좋아진다)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피로 포화가 누적된 필수과 의사가 주간 결산에서 사직하고, 전국 풀에서 영구히 사라진다 — 재채용은 풀과 금고가 남았을 때만.

**Architecture:** 새 상태는 `SessionState.saturatedDays` 하나. 판정·적용은 `completeWeek` 한 자리에서 순수 함수를 호출한다. 파급의 핵심은 **id 재번호 대응**(사직으로 `doc-<dept>-<i>`가 밀려 생존자가 사직자 상태를 물려받는 문제)이고, `materializeRoster`가 CANDIDATES 순서를 보존한다는 성질을 이용해 **과별 위치 대응**으로 푼다.

**Tech Stack:** TypeScript · Next.js · vitest · Tailwind. 순수 게임 로직만 유닛테스트, 컴포넌트는 브라우저 실측(프로젝트 관례).

**설계 스펙:** [2026-07-25-attrition-resignation-design.md](../specs/2026-07-25-attrition-resignation-design.md)

---

## 파일 구조

| 파일 | 책임 | 이번 변경 |
|---|---|---|
| `src/game/doctor.ts` | 명단·피로의 단일 출처 | `RESIGN_SATURATED_DAYS` · `stepSaturatedDays` · `resigningDoctors` · `remapDoctorState` · `applyResignations` |
| `src/game/system.ts` | 전국 의사 풀 | `releaseFromPool`(사직분 차감 — `hireDelta`의 대칭) |
| `src/game/session.ts` | 세션 상태기계 | `SessionState.saturatedDays` · `completeReceiving` 스텝 · `completeWeek` 적용 · `weekResignations` 노출 |
| `src/components/WeekSummary.tsx` | 주간 결산 | 사직 목록 한 줄씩(해석 카피 0) |
| `src/components/SessionClient.tsx` | 화면 배선 | 사직 목록 prop 전달 |

**태스크 순서 제약**: Task 1 → 2 → 3 → 4(3의 리맵을 쓴다) → 5 → 6 → 7.

---

### Task 1: 포화 일수 카운터

**Files:**
- Modify: `src/game/doctor.ts` (상수 블록 끝 + 새 함수)
- Modify: `src/game/session.ts` (`SessionState`·`startSession`·`enterWorldEvent`·`beginSetup`·`completeSetup`·`completeReceiving`)
- Test: `src/game/doctor.test.ts`, `src/game/session.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/doctor.test.ts` 맨 아래에 추가(import에 `stepSaturatedDays, RESIGN_SATURATED_DAYS` 추가):

```ts
describe('stepSaturatedDays — 포화로 마감한 날만 센다', () => {
  it('마감 피로가 FATIGUE_MAX면 +1', () => {
    expect(stepSaturatedDays({}, { a: FATIGUE_MAX })).toEqual({ a: 1 })
  })

  it('포화 미달은 그대로 — 리셋이 아니다', () => {
    expect(stepSaturatedDays({ a: 3 }, { a: FATIGUE_MAX - 1 })).toEqual({ a: 3 })
    expect(stepSaturatedDays({ a: 3 }, { a: 0 })).toEqual({ a: 3 })
  })

  it('누적한다', () => {
    let s = stepSaturatedDays({}, { a: FATIGUE_MAX })
    s = stepSaturatedDays(s, { a: FATIGUE_MAX })
    expect(s.a).toBe(2)
  })

  it('임계는 1보다 크다(하루 만에 안 떠난다)', () => {
    expect(RESIGN_SATURATED_DAYS).toBeGreaterThan(1)
  })
})
```

`src/game/session.test.ts`에 추가:

```ts
describe('포화 일수 — 세션 배선', () => {
  it('개원 시 빈 맵', () => {
    expect(completeSetup(conscientious).saturatedDays).toEqual({})
  })

  it('completeReceiving이 포화 일수를 스텝한다(피로와 같은 자리)', () => {
    let s = completeSetup({ hospitalName: 'h', doctors: { AESTHETICS: 1, CARDIOLOGY: 1 } })
    s = runDay(s, true)
    s = completeReceiving(s)
    // 1일차엔 아직 포화가 아니므로 0이거나 키가 없다 — 계약은 "타입이 맞고 예외가 없다"
    const solo = s.hospital!.roster!.find((d) => d.dept === 'CARDIOLOGY')!.id
    expect(s.saturatedDays[solo] ?? 0).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/doctor.test.ts -t "stepSaturatedDays"`
Expected: FAIL — `stepSaturatedDays is not a function`

- [ ] **Step 3: 최소 구현**

`src/game/doctor.ts`의 `fatigueSlowFactor` 아래에 추가:

```ts
/**
 * 포화 상태로 일한 날이 이만큼 누적되면 사직한다(예시값 — 튜닝 대상).
 * 실측 곡선(전부 수용·순환기 1인): 1주차 2일 + 2주차 3일 → 2주차 결산에서 이탈.
 * 응급을 더 거절하면 피로가 덜 올라 시점이 미뤄진다 — 플레이어 선택이 움직인다.
 */
export const RESIGN_SATURATED_DAYS = 4

/**
 * 하루 마감 피로 → 포화 일수 누적. **리셋이 없다.**
 *
 * 포화(FATIGUE_MAX)로 마감한 날만 센다. 회복해도 그 날들은 몸에 남는다는 뜻이고, 무엇보다
 * 완편 병원은 실측상 34조차 안 넘어 이 카운터가 **영원히 0**이다 — 구조적으로 망가진
 * 배치에서만 돌아간다. 리셋 규칙을 두면 "며칠 쉬게 해 되돌리는" 최적화 표면이 생기는데,
 * 대응 레버가 채용뿐이라(피로 승격 결정 B) 그 조작은 애초에 불가능하다.
 */
export function stepSaturatedDays(
  prev: Record<string, number>,
  fatigue: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = { ...prev }
  for (const [id, f] of Object.entries(fatigue)) {
    if (f >= FATIGUE_MAX) next[id] = (next[id] ?? 0) + 1
  }
  return next
}
```

`src/game/session.ts` — `SessionState`에 필드 추가(`fatigue` 아래):

```ts
  /**
   * 유닛별 **피로 포화로 마감한 날 수**(누적·주 간 유지·리셋 없음). 사직 판정의 유일한 입력.
   * completeReceiving이 fatigue 스텝 직후 같은 자리에서 갱신한다.
   */
  saturatedDays: Record<string, number>
```

`startSession`·`enterWorldEvent`·`beginSetup`·`completeSetup` 네 곳의 리터럴에 `saturatedDays: {},`를 `fatigue: {},` 옆에 추가한다.

`completeReceiving`의 return을 교체:

```ts
  const fatigue = stepFatigue(state.fatigue, caseloads)
  return {
    ...state,
    phase: 'DAY_END',
    ledgerDays: [...state.ledgerDays, recordDay(state.day, state.receiving)],
    fatigue,
    saturatedDays: stepSaturatedDays(state.saturatedDays, fatigue),
  }
```

import에 `stepSaturatedDays`를 더한다.

- [ ] **Step 4: 통과 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 전량 PASS · tsc 0

- [ ] **Step 5: 커밋**

`.commit-msg-tmp`(T-026 · 트레일러 블록 앞에 빈 줄 하나, 블록 안엔 빈 줄 없이):

```
feat: 포화 일수 카운터 — 사직 판정의 유일한 입력

피로가 FATIGUE_MAX로 마감한 날만 센다. 리셋이 없는 게 핵심이다 —
완편 병원은 실측상 34조차 안 넘어 이 카운터가 영원히 0이라, 구조적으로
망가진 배치에서만 돌아간다. 리셋을 두면 며칠 쉬게 해 되돌리는 최적화
표면이 생기는데 대응 레버가 채용뿐이라 그 조작은 애초에 불가능하다.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — "미달은 리셋이 아니라 유지"를 먼저 못박아 조용한 의미 반전을 차단
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add src/game/doctor.ts src/game/doctor.test.ts src/game/session.ts src/game/session.test.ts && git commit -F .commit-msg-tmp
```

---

### Task 2: 사직 판정 (누가 떠나는가)

**Files:**
- Modify: `src/game/doctor.ts`
- Test: `src/game/doctor.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe('resigningDoctors — 임계를 넘긴 유닛', () => {
  const roster = materializeRoster({ hospitalName: 'h', doctors: { CARDIOLOGY: 2, AESTHETICS: 1 } }, DEPARTMENTS)
  const cardio1 = 'doc-CARDIOLOGY-1'
  const cardio2 = 'doc-CARDIOLOGY-2'

  it('임계 미달이면 아무도 안 떠난다', () => {
    expect(resigningDoctors(roster, { [cardio1]: RESIGN_SATURATED_DAYS - 1 })).toEqual([])
  })

  it('임계 도달 유닛만 떠난다', () => {
    const out = resigningDoctors(roster, { [cardio1]: RESIGN_SATURATED_DAYS, [cardio2]: 1 })
    expect(out.map((d) => d.id)).toEqual([cardio1])
  })

  it('여러 명이 동시에 떠날 수 있다', () => {
    const out = resigningDoctors(roster, {
      [cardio1]: RESIGN_SATURATED_DAYS, [cardio2]: RESIGN_SATURATED_DAYS + 3,
    })
    expect(out.map((d) => d.id).sort()).toEqual([cardio1, cardio2])
  })

  it('명단에 없는 키는 무시한다(구 상태 잔재)', () => {
    expect(resigningDoctors(roster, { 'doc-GHOST-9': 99 })).toEqual([])
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/doctor.test.ts -t "resigningDoctors"`
Expected: FAIL — `resigningDoctors is not a function`

- [ ] **Step 3: 최소 구현**

```ts
/**
 * 임계를 넘긴 유닛 — 이번 주에 떠나는 사람들. 명단 순서를 보존한다(표시 안정).
 * 명단에 없는 키는 무시한다(사직·재구성으로 생긴 구 상태 잔재).
 */
export function resigningDoctors(roster: Doctor[], saturatedDays: Record<string, number>): Doctor[] {
  return roster.filter((d) => (saturatedDays[d.id] ?? 0) >= RESIGN_SATURATED_DAYS)
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/doctor.test.ts && npx tsc --noEmit`
Expected: PASS · tsc 0

- [ ] **Step 5: 커밋**

```bash
git add src/game/doctor.ts src/game/doctor.test.ts && git commit -F .commit-msg-tmp
```

메시지 본문: `feat: 사직 판정 — 임계를 넘긴 유닛만 떠난다` + 명단 순서 보존·구 상태 잔재 무시 이유. 트레일러는 Task 1과 동형(`Skill-benefit`은 "동시 사직·유령 키를 먼저 핀").

---

### Task 3: 상태 리맵 (⚠️ 이 슬라이스의 핵심 함정)

**Files:**
- Modify: `src/game/doctor.ts`
- Test: `src/game/doctor.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe('remapDoctorState — id 재번호에도 상태가 사람을 따라간다 [R-4]', () => {
  const before: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 2 } }
  const after: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1 } }
  const oldRoster = materializeRoster(before, DEPARTMENTS)
  const newRoster = materializeRoster(after, DEPARTMENTS)

  it('1번이 떠나면 생존자(옛 2번)가 자기 값을 유지한다 — 사직자 값을 상속하지 않는다', () => {
    const state = { 'doc-CARDIOLOGY-1': 99, 'doc-CARDIOLOGY-2': 7 }
    const survivors = oldRoster.filter((d) => d.id !== 'doc-CARDIOLOGY-1')
    const out = remapDoctorState(survivors, newRoster, state)
    expect(out).toEqual({ 'doc-CARDIOLOGY-1': 7 }) // 옛 2번의 7이 새 1번으로
  })

  it('사직자 키는 사라진다', () => {
    const state = { 'doc-CARDIOLOGY-1': 99, 'doc-CARDIOLOGY-2': 7 }
    const survivors = oldRoster.filter((d) => d.id !== 'doc-CARDIOLOGY-1')
    expect(Object.values(remapDoctorState(survivors, newRoster, state))).not.toContain(99)
  })

  it('과가 여러 개면 서로 섞이지 않는다', () => {
    const b: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 2, AESTHETICS: 2 } }
    const a: SetupChoices = { hospitalName: 'h', doctors: { CARDIOLOGY: 1, AESTHETICS: 2 } }
    const oldR = materializeRoster(b, DEPARTMENTS)
    const newR = materializeRoster(a, DEPARTMENTS)
    const state = {
      'doc-CARDIOLOGY-1': 1, 'doc-CARDIOLOGY-2': 2,
      'doc-AESTHETICS-1': 10, 'doc-AESTHETICS-2': 20,
    }
    const survivors = oldR.filter((d) => d.id !== 'doc-CARDIOLOGY-1')
    const out = remapDoctorState(survivors, newR, state)
    expect(out['doc-CARDIOLOGY-1']).toBe(2)
    expect(out['doc-AESTHETICS-1']).toBe(10)
    expect(out['doc-AESTHETICS-2']).toBe(20)
  })

  it('빈 상태는 빈 결과', () => {
    expect(remapDoctorState(oldRoster, newRoster, {})).toEqual({})
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/doctor.test.ts -t "remapDoctorState"`
Expected: FAIL — `remapDoctorState is not a function`

- [ ] **Step 3: 최소 구현**

```ts
/**
 * 사직으로 id가 밀렸을 때 유닛별 상태(fatigue·saturatedDays)를 **사람을 따라** 옮긴다.
 *
 * ⚠️ 이게 없으면 조용한 데이터 오염이 난다: `Doctor.id`는 `doc-<dept>-<i>` 인덱스 기반이라
 * 1번이 사직하면 옛 2번이 그 번호를 물려받고, id로 키를 잡은 상태가 **사직자의 포화를
 * 생존자에게 상속**시킨다(방금 남은 사람이 즉시 사직 임계에 걸린다).
 *
 * 대응은 **과별 위치**로 한다: `materializeRoster`는 그 과의 hiredIds 지원자를 CANDIDATES
 * 순서로 앞 슬롯부터 앉히고 나머지를 무명으로 채우므로, **사직자를 뺀 옛 명단**과 새 명단은
 * 과별로 같은 순서다. 그래서 zip 한 번이 정확하고, 이름/후보 id 매칭보다 단순하다.
 *
 * `survivorsInOldOrder`는 옛 명단에서 사직자만 제거한 것이어야 한다(순서 보존).
 * 교차 주 상태는 fatigue·saturatedDays 둘뿐이다 — busyUntil·busyWith는 하루마다 리셋된다.
 */
export function remapDoctorState<T>(
  survivorsInOldOrder: Doctor[],
  newRoster: Doctor[],
  state: Record<string, T>,
): Record<string, T> {
  const byDept = (roster: Doctor[]) => {
    const m = new Map<DeptKey, Doctor[]>()
    for (const d of roster) {
      const list = m.get(d.dept) ?? []
      list.push(d)
      m.set(d.dept, list)
    }
    return m
  }
  const oldByDept = byDept(survivorsInOldOrder)
  const out: Record<string, T> = {}
  for (const [dept, newDocs] of byDept(newRoster)) {
    const oldDocs = oldByDept.get(dept) ?? []
    newDocs.forEach((nd, i) => {
      const od = oldDocs[i]
      if (od && state[od.id] !== undefined) out[nd.id] = state[od.id]
    })
  }
  return out
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/doctor.test.ts && npx tsc --noEmit`
Expected: PASS · tsc 0

- [ ] **Step 5: 커밋**

메시지 본문 요지: id 재번호로 생존자가 사직자의 포화를 상속하는 조용한 오염을 막는다. `materializeRoster`가 CANDIDATES 순서를 보존하므로 과별 위치 zip이 정확하다. 교차 주 상태가 fatigue·saturatedDays 둘뿐임을 확인했다.

```bash
git add src/game/doctor.ts src/game/doctor.test.ts && git commit -F .commit-msg-tmp
```

---

### Task 4: 사직 적용 — 명단·풀 동시 갱신

**Files:**
- Modify: `src/game/system.ts` (`releaseFromPool`)
- Modify: `src/game/doctor.ts` (`applyResignations`)
- Test: `src/game/system.test.ts`, `src/game/doctor.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/system.test.ts`:

```ts
describe('releaseFromPool — 사직은 세상에서 사람을 지운다', () => {
  it('배후과 사직분만큼 풀이 준다', () => {
    const s = releaseFromPool(initSystem(), { CARDIOLOGY: 1 })
    expect(s.pool.CARDIOLOGY).toBe(POOL_INITIAL.CARDIOLOGY - 1)
  })

  it('0 클램프 — 음수로 안 내려간다', () => {
    const s = releaseFromPool(initSystem(), { THORACIC_SURGERY: 99 })
    expect(s.pool.THORACIC_SURGERY).toBe(0)
  })

  it('poolInitial(표시용 초기 사본)은 안 바뀐다', () => {
    const s = releaseFromPool(initSystem(), { CARDIOLOGY: 1 })
    expect(s.poolInitial).toEqual(POOL_INITIAL)
  })
})
```

`src/game/doctor.test.ts`:

```ts
describe('applyResignations — 명단·풀·상태를 한 번에', () => {
  const cardio = CANDIDATES.filter((c) => c.dept === 'CARDIOLOGY').slice(0, 2)
  const choices: SetupChoices = {
    hospitalName: 'h', doctors: { CARDIOLOGY: 2 }, hiredIds: cardio.map((c) => c.id),
  }
  const roster = materializeRoster(choices, DEPARTMENTS)

  it('과 인원이 줄고 hiredIds에서 사직자 후보가 빠진다 [R-3]', () => {
    const out = applyResignations(choices, roster, [roster[0]], DEPARTMENTS)
    expect(out.choices.doctors.CARDIOLOGY).toBe(1)
    expect(out.choices.hiredIds).not.toContain(roster[0].candidateId)
    expect(out.choices.hiredIds).toContain(roster[1].candidateId)
    expect(materializeRoster(out.choices, DEPARTMENTS)).toHaveLength(1)
  })

  it('배후과 사직은 poolDelta에 실린다', () => {
    const out = applyResignations(choices, roster, [roster[0]], DEPARTMENTS)
    expect(out.poolDelta).toEqual({ CARDIOLOGY: 1 })
  })

  it('수익과 사직은 poolDelta가 비어 있다(풀 개념이 없다)', () => {
    const aes: SetupChoices = { hospitalName: 'h', doctors: { AESTHETICS: 1 } }
    const r = materializeRoster(aes, DEPARTMENTS)
    expect(applyResignations(aes, r, r, DEPARTMENTS).poolDelta).toEqual({})
  })

  it('사직자가 없으면 choices가 그대로다', () => {
    const out = applyResignations(choices, roster, [], DEPARTMENTS)
    expect(out.choices.doctors.CARDIOLOGY).toBe(2)
    expect(out.poolDelta).toEqual({})
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/system.test.ts src/game/doctor.test.ts -t "releaseFromPool|applyResignations"`
Expected: FAIL — 두 함수 모두 미정의

- [ ] **Step 3: 최소 구현**

`src/game/system.ts` (`hireDelta` 아래 — 대칭 위치):

```ts
/**
 * 사직분만큼 풀을 줄인다(0 클램프) — `hireDelta`의 대칭이되 **방향이 반대이고 되돌릴 수 없다**.
 * 사직은 "다른 병원으로 감"이 아니라 **필수의료를 떠남**이라 풀로 돌아오지 않는다
 * (설계 2026-07-25-attrition-resignation-design.md 결정 A). poolInitial은 표시용이라 불변.
 */
export function releaseFromPool(
  system: SystemState,
  deltas: Partial<Record<Specialty, number>>,
): SystemState {
  const pool = { ...system.pool }
  for (const key of Object.keys(deltas) as Specialty[]) {
    const d = deltas[key] ?? 0
    if (d > 0) pool[key] = Math.max(0, pool[key] - d)
  }
  return { ...system, pool }
}
```

`src/game/doctor.ts`:

```ts
/**
 * 사직을 명단에 반영한다 — 순수. `choices`(명단의 단일 출처)를 줄이고, 배후과 사직분을 낸다.
 *
 * `doctors` 카운트와 `hiredIds`를 **함께** 줄이는 게 정합의 핵심이다(둘 중 하나만 줄이면
 * materializeRoster가 무명 유닛으로 빈자리를 메워 사직이 없던 일이 된다).
 * 풀 차감은 호출부(session)가 `releaseFromPool`로 적용한다 — 이 모듈은 system.ts를 모른다.
 */
export function applyResignations(
  choices: SetupChoices,
  roster: Doctor[],
  resigning: Doctor[],
  departments: DepartmentSpec[],
): { choices: SetupChoices; poolDelta: Partial<Record<string, number>> } {
  if (resigning.length === 0) return { choices, poolDelta: {} }

  const doctors = { ...choices.doctors }
  const goneCandidateIds = new Set(resigning.map((d) => d.candidateId).filter(Boolean) as string[])
  const poolDelta: Partial<Record<string, number>> = {}

  for (const d of resigning) {
    doctors[d.dept] = Math.max(0, (doctors[d.dept] ?? 0) - 1)
    const backup = departments.find((x) => x.key === d.dept)?.providesBackup
    if (backup) poolDelta[backup] = (poolDelta[backup] ?? 0) + 1
  }

  const hiredIds = choices.hiredIds?.filter((id) => !goneCandidateIds.has(id))
  void roster // 명단은 호출부가 리맵에 쓴다 — 여기선 카운트만 줄인다
  return { choices: { ...choices, doctors, ...(hiredIds ? { hiredIds } : {}) }, poolDelta }
}
```

> ⚠️ `poolDelta`의 키 타입을 `string`으로 둔 건 `doctor.ts`가 `Specialty`를 이미 타입으로만 알기 때문이다. 호출부(`session.ts`)에서 `Partial<Record<Specialty, number>>`로 좁혀 `releaseFromPool`에 넘긴다.

- [ ] **Step 4: 통과 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 전량 PASS · tsc 0

- [ ] **Step 5: 커밋**

메시지 본문 요지: 사직을 명단의 단일 출처에 반영한다. `doctors`와 `hiredIds`를 함께 줄이는 게 정합의 핵심(하나만 줄이면 무명 유닛이 빈자리를 메워 사직이 없던 일이 된다). 풀 차감은 `releaseFromPool`로 분리해 모듈 경계를 지켰다.

```bash
git add src/game/system.ts src/game/system.test.ts src/game/doctor.ts src/game/doctor.test.ts && git commit -F .commit-msg-tmp
```

---

### Task 5: `completeWeek` 통합

**Files:**
- Modify: `src/game/session.ts`
- Test: `src/game/session.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe('사직 — completeWeek 통합', () => {
  /** 포화 일수를 직접 심어 임계를 만든다(7일을 여러 주 돌리지 않고 계약만 잠근다). */
  function seedSaturated(s: SessionState, id: string) {
    return { ...s, saturatedDays: { ...s.saturatedDays, [id]: RESIGN_SATURATED_DAYS } }
  }

  it('임계를 넘긴 순환기 1인이 사직하고 결산에 실린다', () => {
    let s = runWeek({ hospitalName: 'h', doctors: { AESTHETICS: 1, CARDIOLOGY: 1 } }, true)
    const solo = s.hospital!.roster!.find((d) => d.dept === 'CARDIOLOGY')!.id
    s = completeWeek(seedSaturated(s, solo))
    expect(s.weekResignations.map((r) => r.dept)).toEqual(['CARDIOLOGY'])
    expect(s.choices.doctors.CARDIOLOGY ?? 0).toBe(0)
  })

  it('사직은 풀을 줄인다 — 되돌릴 수 없다 [R-2]', () => {
    let s = runWeek({ hospitalName: 'h', doctors: { AESTHETICS: 1, CARDIOLOGY: 1 } }, true)
    const solo = s.hospital!.roster!.find((d) => d.dept === 'CARDIOLOGY')!.id
    const before = s.system.pool.CARDIOLOGY
    s = completeWeek(seedSaturated(s, solo))
    expect(s.system.pool.CARDIOLOGY).toBe(before - 1)
  })

  it('임계 미달이면 사직 0 — 승격 전과 동일 [R-0]', () => {
    const s = completeWeek(runWeek({ hospitalName: 'h', doctors: { AESTHETICS: 1, CARDIOLOGY: 1 } }, true))
    expect(s.weekResignations).toEqual([])
    expect(s.choices.doctors.CARDIOLOGY).toBe(1)
  })

  it('생존자가 사직자의 포화를 물려받지 않는다 [R-4]', () => {
    let s = runWeek({ hospitalName: 'h', doctors: { CARDIOLOGY: 2 } }, true)
    s = { ...s, saturatedDays: { 'doc-CARDIOLOGY-1': RESIGN_SATURATED_DAYS, 'doc-CARDIOLOGY-2': 1 } }
    s = completeWeek(s)
    expect(s.saturatedDays['doc-CARDIOLOGY-1']).toBe(1) // 옛 2번의 1이 새 1번으로
  })

  it('수익과만 있으면 7일을 완주해도 사직 0 [R-1]', () => {
    const s = completeWeek(runWeek(collaborator, true))
    expect(s.weekResignations).toEqual([])
  })
})
```

import에 `RESIGN_SATURATED_DAYS`를 더한다(`from './doctor'`).

- [ ] **Step 2: 실패를 눈으로 확인한다**

Run: `npx vitest run src/game/session.test.ts -t "completeWeek 통합"`
Expected: FAIL — `weekResignations`가 없다(tsc도 에러)

- [ ] **Step 3: 최소 구현**

`SessionState`에 추가:

```ts
  /** 이번 주에 사직한 유닛들(주간 결산 표시용). completeWeek이 채우고 nextWeek이 비운다. */
  weekResignations: Doctor[]
```

네 초기화 리터럴에 `weekResignations: [],` 추가. `Doctor` 타입 import 확인.

`completeWeek`을 교체:

```ts
export function completeWeek(state: SessionState): SessionState {
  if (state.phase !== 'DAY_END') {
    throw new Error(`completeWeek requires DAY_END, got ${state.phase}`)
  }
  if (!isLastDay(state)) {
    throw new Error('completeWeek requires the last day (day 7)')
  }
  const weekNet = state.ledgerDays.reduce((n, d) => n + d.netProfitManwon, 0)
  const treasury = state.treasury + weekNet
  const insolvencyStreak = treasury < 0 ? state.insolvencyStreak + 1 : 0

  // ── 사직 ──
  // ⏱️ 이번 주 숫자(weekNet)는 이미 마감된 ledgerDays로 계산됐다 — 사직은 그걸 바꾸지 않고,
  //    고정비·처리량이 달라지는 건 병원이 재구성되는 **다음 주**부터다(설계 §5 시점 계약).
  const deps = state.world?.departments ?? DEPARTMENTS
  const roster = state.hospital?.roster ?? []
  const resigning = resigningDoctors(roster, state.saturatedDays)
  const applied = applyResignations(state.choices, roster, resigning, deps)
  const resignedIds = new Set(resigning.map((d) => d.id))
  const survivors = roster.filter((d) => !resignedIds.has(d.id))
  const nextRoster = materializeRoster(applied.choices, deps)

  return {
    ...state,
    phase: 'WEEK_SUMMARY',
    history: [...state.history, ...state.ledgerDays],
    treasury,
    insolvencyStreak,
    choices: applied.choices,
    system: releaseFromPool(state.system, applied.poolDelta as Partial<Record<Specialty, number>>),
    fatigue: remapDoctorState(survivors, nextRoster, state.fatigue),
    saturatedDays: remapDoctorState(survivors, nextRoster, state.saturatedDays),
    weekResignations: resigning,
  }
}
```

import 보강: `./doctor`에서 `resigningDoctors`·`applyResignations`·`remapDoctorState`·`materializeRoster`, `./system`에서 `releaseFromPool`.

`nextWeek`의 return에 `weekResignations: []`를 추가한다(다음 주로 넘어가면 지난주 목록은 비운다).

> ⚠️ **`hospital`은 여기서 재구성하지 않는다.** 2주차 이후 병원 재구성은 `applyGrowth`가 담당하고(GROWTH), 그 입력이 방금 줄어든 `choices`다. `completeWeek`에서 병원을 바꾸면 결산 화면이 이미 없는 의사로 계산되어 그 주 숫자가 흔들린다.

- [ ] **Step 4: 통과 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 전량 PASS(기존 `[I8]`·폐업 흐름 포함) · tsc 0

- [ ] **Step 5: 커밋**

```bash
git add src/game/session.ts src/game/session.test.ts && git commit -F .commit-msg-tmp
```

메시지 본문 요지: 판정·적용·리맵을 `completeWeek` 한 자리로 모았다. 이번 주 숫자는 이미 마감된 `ledgerDays`로 계산되므로 사직이 그 주를 바꾸지 않고, 효과는 다음 주에 나타난다(설계 §5 시점 계약). `hospital`은 여기서 재구성하지 않는다 — GROWTH의 `applyGrowth`가 줄어든 `choices`를 받는다.

---

### Task 6: 주간 결산 표시 (사실 한 줄)

**Files:**
- Modify: `src/components/WeekSummary.tsx`
- Modify: `src/components/SessionClient.tsx`

- [ ] **Step 1: `WeekSummary`에 prop과 블록 추가**

props 타입에 추가:

```tsx
  resignations: { dept: DeptKey; name: string }[]; // 이번 주 사직 — 사유 없이 사실만
```

`import type { DeptKey } from "@/game/types";`와 `import { DEPARTMENTS } from "@/game/setup";`가 없으면 추가한다.

받은/돌려보낸 응급 숫자 블록 **아래**에 삽입:

```tsx
      {/*
        사직 — 사실 한 줄씩. **사유를 쓰지 않는다**: 피로 막대가 몇 주간 이미 말했고,
        사유를 설명하는 순간 "번아웃한 김 선생의 사연"이 된다(character-design §43).
        같은 화면의 오른 흑자와 나란히 놓이는 것 자체가 이 게임의 문장이다(설계 §5).
      */}
      {resignations.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {resignations.map((r) => (
            <li key={`${r.dept}-${r.name}`} className="font-mono text-xs text-stamp-ink">
              {DEPARTMENTS.find((d) => d.key === r.dept)?.label ?? r.dept} · {r.name} — 사직
            </li>
          ))}
        </ul>
      )}
```

- [ ] **Step 2: `SessionClient`에서 전달**

`WeekSummary`를 렌더하는 자리에 prop을 추가한다:

```tsx
          resignations={state.weekResignations.map((d) => ({ dept: d.dept, name: d.name }))}
```

- [ ] **Step 3: 게이트 확인**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 0 에러 · 전량 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/components/WeekSummary.tsx src/components/SessionClient.tsx && git commit -F .commit-msg-tmp
```

메시지 본문 요지: 결산에 사직을 사실 한 줄로. 사유를 쓰지 않는 이유(§43 금지선)와, 오른 흑자와 나란히 놓이는 것이 곧 문장이라는 것(§5). `Skills-used: none`.

---

### Task 7: 실측 · 문서 · 마무리

- [ ] **Step 1: 전체 게이트**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 2: 브라우저 3주 완주 실측**

`preview_start`로 dev 서버를 띄우고 **순환기 1인 + 미용 3인**으로 개원해 3주를 완주한다. 확인:

1. 1주차 결산 — 사직 0
2. 2주차 결산 — `순환기내과 · <이름> — 사직` 한 줄, 사유 문구 없음
3. 3주차 GROWTH — 순환기 재채용 가능 여부(풀 잔여 확인)
4. 재채용 **안 하고** 3주차 진행 → 순환기 응급이 상시 하드락(`NO_BACKUP_CARE`)
5. **3주차 순이익 > 2주차 순이익**(설계 §5 — 사직 다음 주에 나타난다)
6. 순환기 0명 상태에서도 맵·명단·콘솔 에러 0

**목표에서 벗어나면**(예: 1주차에 사직, 또는 5주차까지 무사) `RESIGN_SATURATED_DAYS`만 조정하고 게이트를 다시 돌린다.

- [ ] **Step 3: 문서 갱신**

`claude-docs/plan.md`의 「피로 승격」 줄에서 `⏸ 후속: 사직·이탈(피로 포화 × 인력 제로섬)`을 지우고 완료 항목을 추가한다:

```markdown
- ✅ **사직·이탈 — 사람이 떠나면 장부가 좋아진다**: 피로 포화로 마감한 날이 누적되면(`RESIGN_SATURATED_DAYS`) 주간 결산에서 사직하고 **전국 풀에서 영구히 사라진다**(필수의료를 떠남 — 재채용 불가). 완편 병원은 카운터가 영원히 0이라 구조적으로 망가진 배치에서만 돈다. 핵심 함정은 id 재번호(생존자가 사직자 포화를 상속) — `materializeRoster`의 순서 보존을 이용한 과별 위치 리맵으로 해결(불변식 R-4). **의도된 결과: 필수과가 떠나면 고정비·적자 콜이 줄어 다음 주 흑자가 오른다**(§5, 해석 카피 0). 설계 [spec](../docs/superpowers/specs/2026-07-25-attrition-resignation-design.md)·[플랜](../docs/superpowers/plans/2026-07-25-attrition-resignation.md) ⏸ 후속: 사직 신문 기사·전 배후과 0명 결말·소송 방아쇠 축
```

`claude-docs/changeLog.md` 맨 위에 항목 1건(**PR 번호 없이** — 프로젝트 규약). 무엇을/왜/결과 3줄.

- [ ] **Step 4: SDD trap 스윕**

*"이번 브랜치에서 1분+ 근인 디버깅이 있었나 — 서브에이전트/리뷰어가 잡은 것 포함"*. 있으면 `claude-docs/troubleshooting/T-###.md` 신설(frontmatter `summary`·`tags: type/troubleshooting` + 증상/원인/해결/재발방지). 허브 목차는 자동 생성이라 손대지 않는다. **id 재번호 상태 오염은 설계 단계에서 잡아 실제 디버깅이 없었으므로, 밟지 않았다면 등재하지 않는다**(사후 각색 금지).

- [ ] **Step 5: 커밋 + PR**

```bash
git add claude-docs/plan.md claude-docs/changeLog.md && git commit -F .commit-msg-tmp
git push -u origin feat/attrition-resignation
gh pr create --title "feat: 사직·이탈 — 사람이 떠나면 장부가 좋아진다" --body-file .pr-body-tmp
```

PR 본문: 설계 링크 · 3-fork 결정 · id 재번호 함정과 해법 · §5 의도된 결과 · 게이트·실측 수치 · 불변식 R-0~R-4. **PR을 올린 뒤 사용자에게 머지 여부를 묻고 멈춘다**(글로벌 규약 — 선제 머지 금지).

---

## 자체 점검 (계획 ↔ 스펙)

| 스펙 요구 | 담당 태스크 |
|---|---|
| §2-1 포화 카운터(리셋 없음) | Task 1 |
| §2-2 임계 `RESIGN_SATURATED_DAYS` | Task 1(상수) · Task 7(튜닝) |
| §2-3 수익과 자동 제외 | Task 4(`poolDelta` 빈 맵) · Task 5([R-1] 테스트) |
| §3-1 세 곳 동시 갱신 | Task 4 + Task 5 |
| §3-2 id 재번호 리맵 | Task 3 + Task 5([R-4]) |
| §3-3 재채용은 기존 레버 | 코드 변경 없음 — Task 7 실측 ③④가 확인 |
| §3-4 도미노는 저절로 | 코드 변경 없음(설계상 무개입) |
| §4 표시 사실 한 줄 | Task 6 |
| §5 흑자 증가 + 시점 계약 | Task 5 주석 · Task 7 실측 ⑤ |
| §6 [R-0]~[R-4] | Task 5 테스트 · Task 3 테스트 |
| §6 기존 불변식 green | Task 5 Step 4 · Task 7 Step 1 |
| §6 실측 | Task 7 Step 2 |
| §7 문서 | Task 7 Step 3 |
