---
tags:
  - type/plan
---

# 내과 진료과 추가 + 복통 응급 세분 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내과(INTERNAL_MEDICINE)를 필수 배후과로 추가하고, catch-all `GENERAL_EMERGENCY`를 급성복증(외과 배후)·고열감염(내과 배후)으로 세분해 각자 그 과로 라우팅·점유 경쟁시키며, 소송·신문 무게를 비대칭(급성복증=소송+신문 / 고열감염=신문만)으로 건다.

**Architecture:** time-loop(시간 점유 모델) 위에 얹는다. 핵심은 `isCriticalEmergency` 하나가 겸하던 세 역할을 술어 2개(`requiresBackupCare`=배후·신문, `carriesLawsuitRisk`=소송)로 분리하는 것. `GENERAL_EMERGENCY`는 TypeScript exhaustive 도미노를 피하려 **점진 대체**(급성복증 추가 → 고열감염 추가 → GENERAL 제거)한다. 순수·결정론 유지.

**Tech Stack:** TypeScript, vitest, Next.js(App Router), React. 판정 로직은 `src/game/*.ts`(순수), UI는 `src/components/*.tsx`.

## Global Constraints

- **결정론 RNG-0**: 모든 무작위성은 seed 해시(`daysim.ts`). `Math.random`·`Date.now` 금지.
- **tsc 게이트**: 각 태스크 끝에 `npx tsc --noEmit` 0 필수 — vitest(esbuild)는 타입을 안 본다([vitest-no-typecheck-tsc-gate]).
- **판정=코드**: 부호·방향만 근거, 금액은 각색. 콜 델타는 **행위 단위**라 과별 차등(산부 61% 등)을 섞지 않는다(T-039).
- **show-don't-tell**: 해석 카피 0. 숫자·상태만.
- **내과 "안전과 아님"**: `essential: true`(미용·검진과 분리) + 적자. `lawsuitRisk: false`는 소송 미구현일 뿐 "안전"이 아니다 — 코드 주석에 명시.
- **I8 불변식**: |순이익| ≤ 4×예산(100억). 테스트로 안 잡히고 **브라우저 7일 완주로만** 검증.
- **한글 커밋**: T-026(`.commit-msg-tmp` UTF-8 + `git commit -F`) + AI추적 트레일러(`Skills-used:`~`Co-Authored-By:` 빈 줄 없이 연속).
- **문서 태그**: 새 md는 `type/*` 태그(pre-commit 검사).
- **윤리 가드(news)**: 40~60대·가공지역·실명 금지.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/game/types.ts` | 도메인 타입 | `Specialty`+INTERNAL_MEDICINE, `CallKind` 세분 |
| `src/game/setup.ts` | 위저드·경제 | `DEPARTMENTS`에 내과 |
| `src/game/receiving.ts` | 콜 판정·경제 | 술어 분리, `CALL_ECONOMICS`, patient, `hardlockReason`, `decide`, `DAY_PLANS`, `CALL_LABELS`, `PATIENT_OF` |
| `src/game/daysim.ts` | 시간 원시함수 | `DURATION_MIN` |
| `src/game/session.ts` | 상태기계 | `recordDay` 필터(신문·카운트) |
| `src/game/news.ts` | 아침 신문 | `PROFILE_BY_KIND` |

**0-침습(안 건드림)**: `adjudicate.ts`(requiredSpecialty 제네릭 판정), `doctor.ts`(`handlingDept`), `ledger.ts`, `daysim`의 seed 함수.

---

### Task 1: 내과 진료과 추가 (Specialty + DEPARTMENTS)

**Files:**
- Modify: `src/game/types.ts` (Specialty 유니온)
- Modify: `src/game/setup.ts` (DEPARTMENTS 배열)
- Test: `src/game/setup.test.ts`

**Interfaces:**
- Produces: `Specialty`에 `'INTERNAL_MEDICINE'`. `DEPARTMENTS`에 `{ key: 'INTERNAL_MEDICINE', ..., providesBackup: 'INTERNAL_MEDICINE' }`. `backupCareOf`/`buildHospital`이 내과 채용을 배후·segment에 반영.

- [ ] **Step 1: 실패 테스트 작성** — `src/game/setup.test.ts`에 추가

```ts
import { DEPARTMENTS, backupCareOf, buildHospital } from './setup'

test('내과는 필수 배후과이고 저수가 소폭 적자다', () => {
  const im = DEPARTMENTS.find((d) => d.key === 'INTERNAL_MEDICINE')
  expect(im).toBeDefined()
  expect(im!.essential).toBe(true) // 미용·검진과 분리 — 안전과 아님
  expect(im!.profitPerDoctorBillions).toBeLessThan(0) // 적자
  expect(im!.profitPerDoctorBillions).toBeGreaterThan(-8) // 24h 대기 배후과(-8~-15)보다 덜 적자
  expect(im!.lawsuitRisk).toBe(false) // 소송 미구현(안전이 아니라 미구현)
  expect(im!.providesBackup).toBe('INTERNAL_MEDICINE')
})

test('내과를 채용하면 배후진료에 INTERNAL_MEDICINE이 잡힌다', () => {
  const choices = { hospitalName: '내과병원', doctors: { INTERNAL_MEDICINE: 1 } }
  expect(backupCareOf(choices)).toContain('INTERNAL_MEDICINE')
  const { hospital } = buildHospital(choices)
  expect(hospital.backupCare).toContain('INTERNAL_MEDICINE')
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/game/setup.test.ts`. Expected: FAIL(INTERNAL_MEDICINE 없음, tsc 에러).

- [ ] **Step 3: 구현** — `types.ts` `Specialty`에 한 줄 추가:

```ts
export type Specialty =
  | 'THORACIC_SURGERY' // 흉부외과
  | 'GENERAL_SURGERY' // 외과
  | 'OBSTETRICS' // 산부인과
  | 'NEUROSURGERY' // 신경외과
  | 'CARDIOLOGY' // 순환기내과
  | 'INTERNAL_MEDICINE' // 내과 — 고열·감염·비수술 복통의 배후과
```

`setup.ts` `DEPARTMENTS` 배열 끝에 추가:

```ts
  // 내과: 24h 대기 고정비가 아니라 **저수가 외래 박리다매**라 배후과 중 덜 적자(원가 72%).
  // ⚠️ lawsuitRisk:false는 소송 '미구현'이지 "안전과"가 아니다 — essential:true·적자로 미용과 분리.
  { key: 'INTERNAL_MEDICINE', label: '내과', essential: true, profitPerDoctorBillions: -5, hireCostBillions: 20, lawsuitRisk: false, providesBackup: 'INTERNAL_MEDICINE' },
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/game/setup.test.ts && npx tsc --noEmit`. Expected: PASS + tsc 0.

- [ ] **Step 5: 커밋** — `.commit-msg-tmp`(UTF-8): `feat: 내과 진료과 추가 — 저수가 박리다매 배후과(소폭 적자, essential)` + 트레일러. 그 후:
```bash
git add src/game/types.ts src/game/setup.ts src/game/setup.test.ts && git commit -F .commit-msg-tmp
```

---

### Task 2: 무게 술어 분리 (requiresBackupCare / carriesLawsuitRisk)

`isCriticalEmergency`(=`CRITICAL_EMERGENCY_KINDS`) 하나가 겸하던 배후·소송·신문을 술어 2개로 분리한다. **이 태스크는 순수 리팩터**(동작 불변) — 두 집합이 아직 기존 4종으로 같다. 다음 태스크에서 급성복증만 소송에 편입해 비대칭이 생긴다.

**Files:**
- Modify: `src/game/receiving.ts` (술어 정의, `createCallQueue`의 lawsuitRisk)
- Modify: `src/game/session.ts` (import·`recordDay` 필터)
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Produces: `requiresBackupCare(kind: CallKind): boolean`(배후·신문·응급 카운트), `carriesLawsuitRisk(kind: CallKind): boolean`(소송 노출). `isCriticalEmergency` 제거.
- Consumes(session.ts): `requiresBackupCare`(turnedAway·receivedEmergency 필터).

- [ ] **Step 1: 실패 테스트 작성** — `src/game/receiving.test.ts`

```ts
import { requiresBackupCare, carriesLawsuitRisk } from './receiving'

test('두 술어는 기존 필수 응급 4종에 대해 참이다(리팩터 기준선)', () => {
  for (const k of ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY'] as const) {
    expect(requiresBackupCare(k)).toBe(true)
    expect(carriesLawsuitRisk(k)).toBe(true)
  }
})

test('선택진료·미용은 두 술어 모두 거짓이다', () => {
  for (const k of ['COSMETIC_WALKIN', 'SPECIALIST_ELECTIVE'] as const) {
    expect(requiresBackupCare(k)).toBe(false)
    expect(carriesLawsuitRisk(k)).toBe(false)
  }
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/game/receiving.test.ts`. Expected: FAIL(술어 미정의).

- [ ] **Step 3: 구현** — `receiving.ts`에서 `CRITICAL_EMERGENCY_KINDS`/`isCriticalEmergency`를 다음으로 교체:

```ts
/** 배후과(최종치료)를 요구하는 응급 — 배후 게이트·신문·응급 카운트의 단일 출처. */
export const BACKUP_CARE_KINDS: CallKind[] = ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY']
export function requiresBackupCare(kind: CallKind): boolean {
  return BACKUP_CARE_KINDS.includes(kind)
}

/** 소송 노출을 쌓는 응급 — 인과가 선명한(수용 시 배상 확정적) 계열만. requiresBackupCare의 부분집합. */
export const LAWSUIT_RISK_KINDS: CallKind[] = ['STEMI', 'OBSTETRIC_EMERGENCY', 'NEURO_EMERGENCY', 'TRAUMA_EMERGENCY']
export function carriesLawsuitRisk(kind: CallKind): boolean {
  return LAWSUIT_RISK_KINDS.includes(kind)
}
```

`createCallQueue` 내부의 `lawsuitRisk: isCriticalEmergency(kind)` → `lawsuitRisk: carriesLawsuitRisk(kind)`. `hardlockReason`·`isElective`·기존 `isCriticalEmergency` 참조를 전부 교체(hardlockReason의 배후 게이트 case는 그대로, `isCriticalEmergency` 이름만 정리).

`session.ts`: `import { ..., isCriticalEmergency, ... }` → `requiresBackupCare`로 변경. `recordDay`의 `turnedAway` 필터·`receivedEmergency` 필터의 `isCriticalEmergency(...)` → `requiresBackupCare(...)`.

기존 `receiving.test.ts`/`session.test.ts`에 `isCriticalEmergency`를 직접 부르는 테스트가 있으면 두 술어로 갱신.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npx tsc --noEmit`. Expected: 전량 PASS(동작 불변) + tsc 0.

- [ ] **Step 5: 커밋** — `feat: 응급 무게 술어 분리 — requiresBackupCare(배후·신문)/carriesLawsuitRisk(소송)` + 트레일러.

---

### Task 3: 급성복증 ABDOMINAL_EMERGENCY (외과 배후, 소송+신문)

**Files:**
- Modify: `src/game/types.ts` (CallKind)
- Modify: `src/game/receiving.ts` (CALL_ECONOMICS, patient, PATIENT_OF, CALL_LABELS, 두 술어 집합, hardlockReason)
- Modify: `src/game/daysim.ts` (DURATION_MIN)
- Test: `src/game/receiving.test.ts`

**Interfaces:**
- Produces: `CallKind`에 `'ABDOMINAL_EMERGENCY'`. `BACKUP_CARE_KINDS`·`LAWSUIT_RISK_KINDS` 둘 다 포함. `abdominalPatient`(requiredSpecialty=`'GENERAL_SURGERY'`).

- [ ] **Step 1: 실패 테스트** — `receiving.test.ts`

```ts
import { hardlockReason, createCallQueue, callDelta, requiresBackupCare, carriesLawsuitRisk } from './receiving'

test('급성복증은 외과 배후를 요구하고 소송·신문 대상이다', () => {
  expect(requiresBackupCare('ABDOMINAL_EMERGENCY')).toBe(true)
  expect(carriesLawsuitRisk('ABDOMINAL_EMERGENCY')).toBe(true) // 인과 선명 — 배상 확정적
})

test('외과 배후가 없으면 급성복증은 NO_BACKUP_CARE 벽이다', () => {
  const hospital = { id: 'p', name: 'x', beds: 3, hasErOnCall: true, overcrowded: false, backupCare: [], roundTheClockBackup: [], roster: [] }
  const call = { id: 'c', kind: 'ABDOMINAL_EMERGENCY', label: '급성복증', patient: { id: 'a', requiredSpecialty: 'GENERAL_SURGERY', severity: 4 }, lawsuitRisk: true, nightShift: false, arrivalMin: 60, durationMin: 120 }
  expect(hardlockReason(hospital, call, {}, [])).toBe('NO_BACKUP_CARE')
})

test('급성복증 델타는 수술·처치 밴드(11/13, STEMI 동형)다', () => {
  expect(callDelta('ABDOMINAL_EMERGENCY')).toBe(11 - 13)
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/game/receiving.test.ts`. Expected: FAIL.

- [ ] **Step 3: 구현**
  - `types.ts` `CallKind`에 추가: `| 'ABDOMINAL_EMERGENCY' // 급성복증(충수염·장폐색·복막염) — 외과 배후`
  - `receiving.ts` `BACKUP_CARE_KINDS`·`LAWSUIT_RISK_KINDS` 배열에 `'ABDOMINAL_EMERGENCY'` 추가.
  - `CALL_ECONOMICS`에 `ABDOMINAL_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueBillions: 11, costBillions: 13 }` (수술·처치 84.9% 밴드).
  - patient 추가: `const abdominalPatient: Patient = { id: 'call-abdominal', requiredSpecialty: 'GENERAL_SURGERY', severity: 4 }`. `PATIENT_OF`에 매핑.
  - `CALL_LABELS`에 `ABDOMINAL_EMERGENCY: ['급성복증 — 외과 전원 요청', '충수염 의심 — 수술 요청']`.
  - `hardlockReason` switch: STEMI 등 배후 게이트 case에 `case 'ABDOMINAL_EMERGENCY':` 추가(같은 로직).
  - `daysim.ts` `DURATION_MIN`에 `ABDOMINAL_EMERGENCY: [90, 180]`(수술급).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npx tsc --noEmit`. Expected: PASS + tsc 0.

- [ ] **Step 5: 커밋** — `feat: 급성복증(ABDOMINAL_EMERGENCY) 신설 — 외과 배후·소송+신문·수술 밴드` + 트레일러.

---

### Task 4: 고열감염 MEDICAL_EMERGENCY (내과 배후, 신문만·소송X)

**Files:** Task 3과 동일 세트(types, receiving, daysim, receiving.test).

**Interfaces:**
- Produces: `CallKind`에 `'MEDICAL_EMERGENCY'`. `BACKUP_CARE_KINDS`에 포함, **`LAWSUIT_RISK_KINDS`에는 제외**. `medicalPatient`(requiredSpecialty=`'INTERNAL_MEDICINE'`).

- [ ] **Step 1: 실패 테스트** — `receiving.test.ts`

```ts
test('고열감염은 내과 배후·신문 대상이되 소송은 안 쌓는다(비대칭)', () => {
  expect(requiresBackupCare('MEDICAL_EMERGENCY')).toBe(true)
  expect(carriesLawsuitRisk('MEDICAL_EMERGENCY')).toBe(false) // 방어 성공이 전형 — 소송 미구현
})

test('내과 배후가 없으면 고열감염은 NO_BACKUP_CARE 벽이다', () => {
  const hospital = { id: 'p', name: 'x', beds: 3, hasErOnCall: true, overcrowded: false, backupCare: [], roundTheClockBackup: [], roster: [] }
  const call = { id: 'c', kind: 'MEDICAL_EMERGENCY', label: '고열', patient: { id: 'm', requiredSpecialty: 'INTERNAL_MEDICINE', severity: 3 }, lawsuitRisk: false, nightShift: false, arrivalMin: 60, durationMin: 60 }
  expect(hardlockReason(hospital, call, {}, [])).toBe('NO_BACKUP_CARE')
})

test('고열감염 델타는 급여 원가미달 밴드(3/6)다', () => {
  expect(callDelta('MEDICAL_EMERGENCY')).toBe(3 - 6)
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/game/receiving.test.ts`. Expected: FAIL.

- [ ] **Step 3: 구현**
  - `types.ts` `CallKind`에: `| 'MEDICAL_EMERGENCY' // 고열·감염·패혈증 — 내과 배후(신문 O, 소송 미구현)`
  - `receiving.ts` `BACKUP_CARE_KINDS`에 `'MEDICAL_EMERGENCY'` 추가(**`LAWSUIT_RISK_KINDS`엔 넣지 않음** — 비대칭).
  - `CALL_ECONOMICS`에 `MEDICAL_EMERGENCY: { priceSetter: 'GOVERNMENT', revenueBillions: 3, costBillions: 6 }`.
  - `const medicalPatient: Patient = { id: 'call-medical', requiredSpecialty: 'INTERNAL_MEDICINE', severity: 3 }`. `PATIENT_OF` 매핑.
  - `CALL_LABELS`에 `MEDICAL_EMERGENCY: ['고열·패혈증 의심 — 내과 전원 요청', '중증 장염 — 입원 요청']`.
  - `hardlockReason` 배후 게이트 case에 `case 'MEDICAL_EMERGENCY':` 추가.
  - `daysim.ts` `DURATION_MIN`에 `MEDICAL_EMERGENCY: [45, 90]`(기존 GENERAL 계승).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npx tsc --noEmit`. Expected: PASS + tsc 0.

- [ ] **Step 5: 커밋** — `feat: 고열감염(MEDICAL_EMERGENCY) 신설 — 내과 배후·신문만(소송 비대칭)` + 트레일러.

---

### Task 5: GENERAL_EMERGENCY 제거 + DAY_PLANS 세분 + decide 가드 제거

이제 두 세분 응급이 있으니 catch-all을 걷어낸다.

**Files:**
- Modify: `src/game/types.ts` (CallKind에서 GENERAL 제거)
- Modify: `src/game/receiving.ts` (generalPatient·PATIENT_OF·CALL_ECONOMICS·CALL_LABELS·hardlockReason의 GENERAL 제거, `decide` 특례 가드 제거, DAY_PLANS 세분 배치)
- Modify: `src/game/daysim.ts` (DURATION_MIN에서 GENERAL 제거)
- Test: `src/game/receiving.test.ts`

- [ ] **Step 1: 실패 테스트** — `receiving.test.ts`

```ts
test('큐에 GENERAL_EMERGENCY는 더 이상 없고 세분 응급으로 대체된다', () => {
  for (let day = 1; day <= 7; day++) {
    for (const c of createCallQueue(day)) {
      expect(c.kind).not.toBe('GENERAL_EMERGENCY')
    }
  }
})

test('수용된 급성복증·고열감염은 담당 과 의사를 점유한다(GENERAL 특례 제거)', () => {
  const roster = [{ id: 'doc-GENERAL_SURGERY-1', name: '김외과', dept: 'GENERAL_SURGERY' }]
  const hospital = { id: 'p', name: 'x', beds: 3, hasErOnCall: true, overcrowded: false, backupCare: ['GENERAL_SURGERY'], roundTheClockBackup: ['GENERAL_SURGERY'], roster }
  const call = { id: 'c', kind: 'ABDOMINAL_EMERGENCY', label: '급성복증', patient: { id: 'a', requiredSpecialty: 'GENERAL_SURGERY', severity: 4 }, lawsuitRisk: true, nightShift: false, arrivalMin: 60, durationMin: 120 }
  const state = initReceiving(hospital, [call])
  const next = decide(state, true)
  expect(next.busyUntil['doc-GENERAL_SURGERY-1']).toBe(180) // 60 + 120 점유
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/game/receiving.test.ts`. Expected: FAIL.

- [ ] **Step 3: 구현**
  - `types.ts` `CallKind`에서 `| 'GENERAL_EMERGENCY' ...` 줄 제거.
  - `receiving.ts`: `generalPatient` 제거, `PATIENT_OF`·`CALL_ECONOMICS`·`CALL_LABELS`·`DURATION_MIN`(daysim)에서 `GENERAL_EMERGENCY` 항목 제거, `hardlockReason`의 `case 'GENERAL_EMERGENCY':` 블록 제거.
  - `decide`의 점유 가드에서 GENERAL 특례 제거: `if (effectiveAccept && free.length > 0 && call.kind !== 'GENERAL_EMERGENCY')` → `if (effectiveAccept && free.length > 0)`. (주석도 갱신 — 세분 응급은 담당 과를 점유한다.)
  - `DAY_PLANS`: `{ kind: 'GENERAL_EMERGENCY' }` 항목을 `ABDOMINAL_EMERGENCY`·`MEDICAL_EMERGENCY`로 교체하고, 같은 날 그 과 예약(SPECIALIST_ELECTIVE dept=GENERAL_SURGERY / INTERNAL_MEDICINE)과 함께 배치해 점유 경쟁을 만든다. **외과 부하(TRAUMA+급성복증)를 한 날에 몰지 않도록** 급성복증은 외상이 없는 날에, 고열감염은 내과 예약과 같은 날에 배치.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npx tsc --noEmit`. Expected: 전량 PASS(exhaustive 도미노 해소) + tsc 0.

- [ ] **Step 5: 커밋** — `feat: GENERAL_EMERGENCY 제거 — 급성복증·고열감염으로 세분, 점유 경쟁 편입` + 트레일러.

---

### Task 6: 아침 신문 종류별 프로필 (news PROFILE_BY_KIND)

**Files:**
- Modify: `src/game/news.ts` (`PROFILE_BY_KIND`)
- Test: `src/game/news.test.ts`

- [ ] **Step 1: 실패 테스트** — `news.test.ts`

```ts
import { renderNews } from './news'

test('급성복증·고열감염 신문은 종류별 프로필로 뜬다', () => {
  const ab = renderNews([{ callId: 'd1c1', kind: 'ABDOMINAL_EMERGENCY', reason: 'NO_FREE_SPECIALIST' }])
  expect(ab[0].headline).toContain('급성복증')
  const me = renderNews([{ callId: 'd1c1', kind: 'MEDICAL_EMERGENCY', reason: 'NO_BACKUP_CARE' }])
  expect(me[0].headline).toContain('고열') // 또는 '감염'
})

test('두 세분 응급 프로필도 윤리 가드(40~60대)를 지킨다', () => {
  for (const kind of ['ABDOMINAL_EMERGENCY', 'MEDICAL_EMERGENCY'] as const) {
    const n = renderNews([{ callId: 'd1c1', kind, reason: 'NO_BACKUP_CARE' }])
    for (const bad of ['10대', '70대', '33개월', '고교생']) expect(n[0].headline).not.toContain(bad)
  }
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/game/news.test.ts`. Expected: FAIL.

- [ ] **Step 3: 구현** — `news.ts` `PROFILE_BY_KIND`에 추가(40~60대 준수):

```ts
  ABDOMINAL_EMERGENCY: ['급성복증 50대 남성', '복막염 60대 남성', '급성복증 40대 여성', '장폐색 50대 남성'],
  MEDICAL_EMERGENCY: ['고열·감염 60대 남성', '패혈증 의심 50대 여성', '중증 감염 40대 남성', '고열 50대 남성'],
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/game/news.test.ts && npx tsc --noEmit`. Expected: PASS + tsc 0.

- [ ] **Step 5: 커밋** — `feat: 아침 신문 종류별 프로필 — 급성복증·고열감염(윤리 가드 준수)` + 트레일러.

---

### Task 7: 위저드 노출 확인 + 브라우저 7일 완주 (I8 밸런스)

**Files:**
- Verify: `src/components/SetupClient.tsx`(또는 위저드 컴포넌트) — 내과가 `DEPARTMENTS` 파생으로 자동 노출되는지 확인. 하드코딩된 과 목록이 있으면 수정.
- Verify: 브라우저 preview.

- [ ] **Step 1: 위저드 렌더 확인** — 위저드 컴포넌트가 `DEPARTMENTS`를 map으로 렌더하는지 grep. 하드코딩 목록이면 내과 추가. 렌더 확인 테스트가 있으면 내과 케이스 추가.

- [ ] **Step 2: 전체 게이트** — Run: `npx vitest run && npx tsc --noEmit`. Expected: 전량 PASS + tsc 0.

- [ ] **Step 3: 브라우저 7일 완주** — `preview_start`(dev 서버) → 위저드에서 내과 포함 채용 → 7일 진행 → **결말 순이익 |값| ≤ 400억(4×예산) 확인**(I8). 급성복증·고열감염 응급이 외과·내과로 라우팅·점유·신문 뜨는지 육안 확인. `read_console_messages`로 에러 0 확인.

- [ ] **Step 4: 밸런스 조정(필요 시)** — I8 위반이면 `CALL_ECONOMICS`·`DEPARTMENTS.internal`·`DAY_PLANS` 배치를 부호 유지한 채 각색 조정, 재완주.

- [ ] **Step 5: 커밋** — `feat: 내과·복통 세분 위저드 노출 + 7일 완주 밸런스 검증(I8)` + 트레일러. 필요 시 `changeLog.md` 한 줄·`plan.md` 체크박스 갱신 포함.

---

## Self-Review

**1. Spec coverage** — 스펙 §4(타입)=T1·T3·T4·T5, §5(술어 분리)=T2, §6(라우팅·게이트·점유)=T3·T4·T5, §7(경제)=T1·T3·T4, §8(위저드·DAY_PLANS·news)=T5·T6·T7, §9(TDD)=전 태스크, §10(리스크·I8)=T7. **누락 없음.** §11(0-침습)은 "안 건드림"이라 태스크 없음(의도).

**2. Placeholder scan** — 각 스텝에 실제 코드·테스트·명령·기대 출력 명시. TBD 없음. (T7 Step 1의 위저드 파일명만 "grep으로 확인" — 실제 컴포넌트 경로가 코드베이스 확인 사항이라 의도적.)

**3. Type consistency** — `requiresBackupCare`/`carriesLawsuitRisk`(T2 정의 → T3·T4에서 집합 확장 → T5·T6에서 사용) 이름 일관. `abdominalPatient`/`medicalPatient` requiredSpecialty(GENERAL_SURGERY/INTERNAL_MEDICINE) 일관. `CALL_ECONOMICS` 키가 CallKind와 exhaustive(T5에서 GENERAL 제거 시 동시 정리).
