---
tags:
  - type/plan
---

# 병원 등급 자격(개원 위저드 파생 라벨) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개원 위저드에서 플레이어가 채운 필수 배후과 수에서 법적 응급의료기관 등급(미지정/지역기관/지역센터/권역)을 파생해 실시간 라벨로 보여준다.

**Architecture:** 등급은 `backupCare`를 읽는 순수 파생값이다 — 판정·경제 로직을 한 줄도 바꾸지 않는다. `hospitalTier()`(순수 함수) + `HospitalTier`(타입) + 위저드 라벨/사다리 UI가 전부. 위저드의 배후과 카운트는 `buildHospital`이 쓰는 것과 같은 `backupCareOf()`에서 나와 드리프트를 원천 차단한다.

**Tech Stack:** TypeScript · React 19(Next.js 16 App Router, client component) · vitest 4 · Tailwind CSS 4.

**설계 출처:** [2026-07-20-hospital-tier-credential-design.md](../specs/2026-07-20-hospital-tier-credential-design.md) · 근거 [emergency-tier-designation-law.md](../../research/emergency-tier-designation-law.md).

## Global Constraints

모든 태스크에 암묵적으로 적용된다:

- **판정·경제 불변식 0 침습**: `adjudicate.ts`·`receiving.ts`·`ledger.ts`·`world.ts`·`session.ts`의 동작을 바꾸지 않는다. `buildHospital`의 **산출(backupCare·economics·hospital 필드)도 불변** — Task 2는 내부 리팩터일 뿐 반환값이 같아야 한다.
- **불변식 상수 불변**: `FIXED_BEDS=3` · `SETUP_BUDGET_BILLIONS=100` · `MAX_DOCTORS_PER_DEPT` 안 건드린다.
- **show-don't-tell**: 등급 라벨·사다리는 **중립 사실**만. "자격 미달 / 더 뽑으세요 / 이게 유리" 같은 유도·해석 카피 금지. 이익·소송 정보는 여전히 노출하지 않는다.
- **한국어 UI**: 사용자에게 보이는 텍스트는 한글. 식별자·타입·enum 값은 영문.
- **게이트(매 태스크 커밋 전)**: `npm test`(vitest) 전부 green **그리고** `npx tsc --noEmit` 0 오류. vitest는 타입체크를 안 하므로 tsc는 별도 필수 게이트다.
- **커밋 메시지(한글)**: T-026 절차 — 메시지를 `.commit-msg-tmp`(UTF-8)에 쓰고 `git commit -F .commit-msg-tmp`. AI 활용 트레일러(`Skills-used:` … `Co-Authored-By:`)는 **빈 줄 없이 연속**으로 붙인다.

---

## File Structure

- `src/game/types.ts` (수정) — `HospitalTier` 타입 추가. 도메인 타입의 집.
- `src/game/tier.ts` (신규) — `HospitalTier` 파생 로직: `hospitalTier()` · `TIER_LABELS` · `TIER_ORDER`. 등급 표현의 단일 책임 파일.
- `src/game/tier.test.ts` (신규) — `tier.ts` 순수 로직 테스트.
- `src/game/setup.ts` (수정) — `backupCareOf()` 추출(위저드·`buildHospital` 공유 단일 출처).
- `src/game/setup.test.ts` (수정) — `backupCareOf` 테스트 + `buildHospital` 회귀.
- `src/components/SetupWizard.tsx` (수정) — DEPTS 스텝에 '자격' 라벨 + 4단 등급 사다리 실시간 표시.

---

## Task 1: 등급 파생 로직 (`hospitalTier` · `TIER_LABELS` · `TIER_ORDER`)

**Files:**
- Modify: `src/game/types.ts` (파일 끝에 타입 추가)
- Create: `src/game/tier.ts`
- Test: `src/game/tier.test.ts`

**Interfaces:**
- Consumes: (없음 — 순수 로직)
- Produces:
  - `type HospitalTier = 'UNDESIGNATED' | 'LOCAL_INSTITUTION' | 'LOCAL_CENTER' | 'REGIONAL_CENTER'` (`types.ts`)
  - `hospitalTier(backupCareCount: number): HospitalTier` (`tier.ts`)
  - `TIER_LABELS: Record<HospitalTier, string>` (`tier.ts`)
  - `TIER_ORDER: HospitalTier[]` (`tier.ts`, 미지정→권역 오름차순)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/game/tier.test.ts` 신규 파일:

```ts
import { describe, it, expect } from 'vitest'
import { hospitalTier, TIER_LABELS, TIER_ORDER } from './tier'

describe('hospitalTier — 필수 배후과 수 → 법적 등급', () => {
  it('배후과 수에 따라 등급이 오른다(서열)', () => {
    expect(hospitalTier(0)).toBe('UNDESIGNATED')
    expect(hospitalTier(1)).toBe('LOCAL_INSTITUTION')
    expect(hospitalTier(2)).toBe('LOCAL_CENTER')
    expect(hospitalTier(3)).toBe('REGIONAL_CENTER')
  })

  it('3 이상은 모두 권역(상한 없음)', () => {
    expect(hospitalTier(4)).toBe('REGIONAL_CENTER')
    expect(hospitalTier(9)).toBe('REGIONAL_CENTER')
  })
})

describe('TIER_LABELS / TIER_ORDER', () => {
  it('모든 등급에 한글 라벨이 있다', () => {
    expect(TIER_LABELS.UNDESIGNATED).toContain('미지정')
    expect(TIER_LABELS.LOCAL_INSTITUTION).toBe('지역응급의료기관')
    expect(TIER_LABELS.LOCAL_CENTER).toBe('지역응급의료센터')
    expect(TIER_LABELS.REGIONAL_CENTER).toBe('권역응급의료센터')
  })

  it('TIER_ORDER는 미지정→권역 오름차순 4단', () => {
    expect(TIER_ORDER).toEqual(['UNDESIGNATED', 'LOCAL_INSTITUTION', 'LOCAL_CENTER', 'REGIONAL_CENTER'])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/game/tier.test.ts`
Expected: FAIL — `Failed to resolve import "./tier"` (파일 없음).

- [ ] **Step 3: `HospitalTier` 타입 추가**

`src/game/types.ts` **파일 맨 끝**에 추가:

```ts
/**
 * 응급의료기관 법적 등급 — backupCare 수에서 파생하는 자칭 불가 지정 명칭(획득 자격).
 * 판정에 쓰이지 않는 표현 전용 파생값이다. 근거: docs/research/emergency-tier-designation-law.md.
 */
export type HospitalTier = 'UNDESIGNATED' | 'LOCAL_INSTITUTION' | 'LOCAL_CENTER' | 'REGIONAL_CENTER'
```

- [ ] **Step 4: `tier.ts` 구현**

`src/game/tier.ts` 신규 파일:

```ts
import type { HospitalTier } from './types'

// 병원 등급 = 획득한 법적 자격(파생 라벨). backupCare 수만 읽는 순수 파생이라
// 판정·경제 불변식을 건드리지 않는다(설계: docs/superpowers/specs/2026-07-20-hospital-tier-credential-design.md).
// "권역응급의료센터" 등은 자칭 불가한 지정 명칭이라 요건(필수 배후과)을 채워야 열린다
// (근거: docs/research/emergency-tier-designation-law.md).

/** 등급 한글 명칭 — 위저드·결말 표시용. */
export const TIER_LABELS: Record<HospitalTier, string> = {
  UNDESIGNATED: '미지정 (일반 병원)',
  LOCAL_INSTITUTION: '지역응급의료기관',
  LOCAL_CENTER: '지역응급의료센터',
  REGIONAL_CENTER: '권역응급의료센터',
}

/** 등급 오름차순(미지정→권역) — 위저드 사다리 표시가 소비한다. */
export const TIER_ORDER: HospitalTier[] = ['UNDESIGNATED', 'LOCAL_INSTITUTION', 'LOCAL_CENTER', 'REGIONAL_CENTER']

/**
 * 필수 배후과 수 → 법적 등급. 서열(더 많은 배후 = 상위)만 근거, 임계는 각색이다.
 * 미용·검진은 응급 배후 역량이 아니라 등급과 무관하다 — 입력은 backupCare 수뿐.
 */
export function hospitalTier(backupCareCount: number): HospitalTier {
  if (backupCareCount >= 3) return 'REGIONAL_CENTER'
  if (backupCareCount === 2) return 'LOCAL_CENTER'
  if (backupCareCount === 1) return 'LOCAL_INSTITUTION'
  return 'UNDESIGNATED'
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/game/tier.test.ts`
Expected: PASS (2 describe, 3 it 전부 green).

- [ ] **Step 6: 타입 게이트**

Run: `npx tsc --noEmit`
Expected: 오류 0.

- [ ] **Step 7: 커밋**

`.commit-msg-tmp`(UTF-8)에 아래를 쓰고 `git add src/game/tier.ts src/game/tier.test.ts src/game/types.ts && git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp`:

```
feat: 병원 등급 파생 로직 — hospitalTier·TIER_LABELS·TIER_ORDER

필수 배후과 수 → 법적 등급(미지정/지역기관/지역센터/권역) 순수 파생.
판정·경제 불변식 무관. 설계: 2026-07-20-hospital-tier-credential-design.md.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 등급 경계(0/1/2/≥3)·서열을 구현 전 Red로 못박음
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 2: `backupCareOf()` 추출 — 위저드·buildHospital 단일 출처

**Files:**
- Modify: `src/game/setup.ts` (함수 추가 + `buildHospital` 내부 한 줄 교체)
- Test: `src/game/setup.test.ts` (테스트 추가 + import 확장)

**Interfaces:**
- Consumes: `SetupChoices`·`DepartmentSpec`·`Specialty`(기존 타입), `DEPARTMENTS`(기존 상수).
- Produces: `backupCareOf(choices: SetupChoices, departments?: DepartmentSpec[]): Specialty[]` — 위저드(Task 3)가 `.length`로 등급 입력을 얻는다.

**배경:** 현재 `buildHospital`(`setup.ts`)은 `backupCare`를 내부에서 계산한다:

```ts
const staffed = departments.map((dept) => ({ dept, n: count(choices, dept.key) })).filter((x) => x.n > 0)
const backupCare: Specialty[] = staffed
  .filter((x) => x.dept.providesBackup)
  .map((x) => x.dept.providesBackup as Specialty)
```

위저드도 같은 수가 필요하므로, 이 파생을 함수로 빼 **한 출처**로 만든다(드리프트 방지).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/game/setup.test.ts` 상단 import에 `backupCareOf`를 추가한다. 현재:

```ts
import { adjustDoctors, isSetupReady, DEPARTMENTS, FIXED_BEDS, MAX_DOCTORS_PER_DEPT, ROUND_THE_CLOCK_MIN_DOCTORS, SETUP_BUDGET_BILLIONS, buildHospital, hiringCost, withinBudget, withinDeptCaps } from './setup'
```

→ `backupCareOf`를 목록에 더한다:

```ts
import { adjustDoctors, isSetupReady, DEPARTMENTS, FIXED_BEDS, MAX_DOCTORS_PER_DEPT, ROUND_THE_CLOCK_MIN_DOCTORS, SETUP_BUDGET_BILLIONS, buildHospital, backupCareOf, hiringCost, withinBudget, withinDeptCaps } from './setup'
```

그리고 파일 끝에 describe 추가(`collaborator`·`conscientious`는 파일 상단에 이미 정의돼 있으니 재사용):

```ts
describe('backupCareOf — 필수 배후과 목록(tier 단일 출처)', () => {
  it('필수과만 배후에 넣는다(미용·검진 제외)', () => {
    expect(backupCareOf(collaborator)).toEqual([]) // 미용3·검진2 → 배후 0
    expect(backupCareOf(conscientious)).toContain('CARDIOLOGY') // 미용1·순환기2 → 순환기 배후
  })

  it('buildHospital의 backupCare와 정확히 같다(드리프트 방지)', () => {
    const choices: SetupChoices = { hospitalName: 't', doctors: { CARDIOLOGY: 1, OBSTETRICS: 2, AESTHETICS: 1 } }
    expect(backupCareOf(choices)).toEqual(buildHospital(choices).hospital.backupCare)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/game/setup.test.ts`
Expected: FAIL — `backupCareOf`가 export되지 않음(`does not provide an export named 'backupCareOf'`).

- [ ] **Step 3: `backupCareOf` 구현 + `buildHospital` 리팩터**

`src/game/setup.ts`의 `buildHospital` 함수 **바로 위**에 추가:

```ts
/**
 * 위저드 선택 → 배후진료 가능 진료과 목록. buildHospital과 위저드 등급 표시가 공유하는 단일 출처.
 * providesBackup이 있고 1명 이상 채운 과만 배후로 잡는다(미용·검진 제외).
 */
export function backupCareOf(choices: SetupChoices, departments: DepartmentSpec[] = DEPARTMENTS): Specialty[] {
  return departments
    .filter((d) => d.providesBackup && count(choices, d.key) > 0)
    .map((d) => d.providesBackup as Specialty)
}
```

그리고 `buildHospital` 안의 backupCare 계산 3줄:

```ts
  const backupCare: Specialty[] = staffed
    .filter((x) => x.dept.providesBackup)
    .map((x) => x.dept.providesBackup as Specialty)
```

을 아래 한 줄로 교체:

```ts
  const backupCare: Specialty[] = backupCareOf(choices, departments)
```

(`staffed`는 `roundTheClockBackup`·`segments`·`hires` 계산에 계속 쓰이므로 남겨둔다. `Specialty` 타입은 `setup.ts` 상단 import에 이미 있다.)

- [ ] **Step 4: 테스트 통과 확인(신규 + 회귀)**

Run: `npx vitest run src/game/setup.test.ts`
Expected: PASS — 신규 2개 + 기존 `buildHospital` 테스트 전부 green(반환값 불변이라 회귀 없음).

- [ ] **Step 5: 전체 스위트 + 타입 게이트**

Run: `npm test`
Expected: 전체 vitest green.
Run: `npx tsc --noEmit`
Expected: 오류 0.

- [ ] **Step 6: 커밋**

`.commit-msg-tmp`(UTF-8) 후 `git add src/game/setup.ts src/game/setup.test.ts && git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp`:

```
refactor: backupCareOf 추출 — 위저드·buildHospital 배후과 단일 출처

buildHospital 내부 backupCare 파생을 순수 함수로 빼 위저드 등급 표시가
같은 출처를 쓰게 한다(드리프트 방지). 반환값 불변 — 기존 테스트 회귀 없음.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — buildHospital.backupCare 동치 단언으로 리팩터 회귀를 잠금
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 3: 위저드에 '자격' 라벨 + 등급 사다리

**Files:**
- Modify: `src/components/SetupWizard.tsx` (DEPTS 스텝)

**Interfaces:**
- Consumes: `hospitalTier`·`TIER_LABELS`·`TIER_ORDER`(Task 1), `backupCareOf`(Task 2), `HospitalTier`(Task 1).
- Produces: (UI만 — 다른 태스크가 소비하는 export 없음)

**배경:** `SetupWizard.tsx`의 DEPTS 스텝은 과 카드 목록 다음에 '채용 예산' 패널(`<div className="rounded-lg border border-zinc-800 bg-black/40 …">`)과 '병원 개원' 버튼이 온다. 그 예산 패널 **바로 앞**에 '자격' 패널을 넣는다. 이 컴포넌트는 프로젝트에 컴포넌트 단위 테스트가 없으므로 검증은 브라우저 프리뷰로 한다.

- [ ] **Step 1: import 추가**

`SetupWizard.tsx` 상단 import 블록에 추가:

```tsx
import { hospitalTier, TIER_LABELS, TIER_ORDER } from "@/game/tier";
```

그리고 기존 setup import(`import { DEPARTMENTS, SETUP_BUDGET_BILLIONS, adjustDoctors, hiringCost, isSetupReady } from "@/game/setup";`)에 `backupCareOf`를 더한다:

```tsx
import { DEPARTMENTS, SETUP_BUDGET_BILLIONS, adjustDoctors, backupCareOf, hiringCost, isSetupReady } from "@/game/setup";
```

- [ ] **Step 2: 등급 파생값 계산**

DEPTS 스텝 렌더 직전(`const cost = hiringCost(choices, departments);`가 있는 구역)에 한 줄 추가:

```tsx
  const tier = hospitalTier(backupCareOf(choices, departments).length);
```

- [ ] **Step 3: '자격' 패널 JSX 삽입**

DEPTS 스텝의 **'채용 예산' 패널 `<div>` 바로 앞**에 삽입:

```tsx
      <div className="rounded-lg border border-zinc-800 bg-black/40 px-4 py-3">
        <div className="flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-600">
          <span>자격</span>
        </div>
        <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{TIER_LABELS[tier]}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
          {TIER_ORDER.map((t, i) => (
            <span key={t} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-zinc-700">›</span>}
              <span className={t === tier ? "font-semibold text-emerald-400" : "text-zinc-600"}>
                {t === "UNDESIGNATED" ? "미지정" : TIER_LABELS[t]}
              </span>
            </span>
          ))}
        </div>
      </div>
```

(사다리에서 미지정은 짧게 '미지정'으로 표기한다 — 전체 라벨은 위 큰 글씨에 이미 나온다. **요건 수치·이익·소송은 표시하지 않는다** — show-don't-tell.)

- [ ] **Step 4: 브라우저 검증**

프리뷰로 실제 동작을 확인한다(수동 확인 요청 금지 — 직접 검증):
1. `preview_start`로 dev 서버 기동(`.claude/launch.json`에 dev 설정이 없으면 `name: "dev"`, `runtimeExecutable: "npm"`, `runtimeArgs: ["run","dev"]`, `port: 3000`으로 생성).
2. 랜딩 → 세계 이벤트 → 병원 이름 입력 → 다음, DEPTS 스텝 진입.
3. `read_page`로 '자격' 패널 확인: 초기(채용 0) = "미지정 (일반 병원)", 사다리 첫 칸 강조.
4. `computer`로 순환기내과 +1 → 자격이 "지역응급의료기관"으로, +산부인과 → "지역응급의료센터", +외과 → "권역응급의료센터"로 오르는지 `read_page`로 확인.
5. `read_console_messages`로 에러 0 확인.
6. `computer {action:"screenshot"}`로 권역 상태 캡처(증빙).

Expected: 필수과를 더할수록 자격 라벨이 미지정→기관→센터→권역으로 상승, 미용·검진만 더하면 미지정 유지, 콘솔 에러 없음.

- [ ] **Step 5: 타입 게이트 + 전체 스위트**

Run: `npx tsc --noEmit`
Expected: 오류 0.
Run: `npm test`
Expected: 전체 green(로직 변경 없음 — UI만).

- [ ] **Step 6: 커밋**

`.commit-msg-tmp`(UTF-8) 후 `git add src/components/SetupWizard.tsx .claude/launch.json && git commit -F .commit-msg-tmp && rm -f .commit-msg-tmp` (launch.json을 만들었을 때만 포함):

```
feat: 개원 위저드에 병원 등급 자격 라벨·사다리

필수 배후과 채용에서 파생한 등급(미지정→기관→센터→권역)을 DEPTS 스텝에
실시간 표시. 요건·이익·소송은 감춤(show-don't-tell). 판정 로직 무변경.

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## 최종 검증 (전 태스크 후)

- [ ] `npm test` 전체 green.
- [ ] `npx tsc --noEmit` 0 오류.
- [ ] 브라우저 7일 완주 스모크: 미지정 빌드(미용만)와 권역 빌드(필수 3과)로 각각 개원 → 라벨이 맞고, **판정·장부 동작이 종전과 동일**(등급이 게임 상태를 안 바꿈)한지 확인.
- [ ] grep 확인: `hospitalTier`가 `adjudicate.ts`·`receiving.ts`·`ledger.ts`에 등장하지 않음(파생 읽기 전용, 판정 무관).

---

## 스코프 밖 (설계 §8 확장점 — 이 계획에 없음)

24h 가중 임계(권역 예산벽) · 등급을 결말/장부에 표시 · 재지정/철회(다주차) · 고유명에 등급 명칭 입력 차단 · 지역 신문 결과층 · 등급이 실제 병상/예산 변경(B/C안).
