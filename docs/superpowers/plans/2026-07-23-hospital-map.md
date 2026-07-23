---
tags:
  - type/plan
---

# 병원 맵 (탑다운 픽셀 아바타 시각화 레이어) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RECEIVING 화면에 탑다운 2D 픽셀 병원 맵을 얹어 "누가 어느 진료실에서 진료 중인가 / 어느 과 방이 비어 있는가 / 환자가 침대를 몇 개 쓰는가 / 지금 몇 시인가"를 공간으로 보인다. 판정·경제·시간 전개는 한 줄도 안 바뀐다.

**Architecture:** 새 순수 모듈 `src/game/hospitalMap.ts`가 `ReceivingState` + 시각 `atMin` → `MapScene`(방·침대·아바타·조명)을 파생한다. 게임 상태는 0개 추가된다 — `busyUntil` 하나가 의사 위치와 침대 환자를 동시에 정한다. 컴포넌트는 `MapScene`을 백분율 좌표로 옮겨 그리는 순수 표시층이고, 콜 사이 시간 점프는 `atMin`을 N스텝 쓸어주는 훅이 담당한다(게임 루프·rAF 없음).

**Tech Stack:** TypeScript · Next.js(App Router) · React 19 · Tailwind v4 · vitest. 설계 근거: [2026-07-23-hospital-map-design.md](../specs/2026-07-23-hospital-map-design.md). 선행 레이어: [2026-07-20-doctor-roster-visualization-design.md](../specs/2026-07-20-doctor-roster-visualization-design.md).

## Global Constraints

모든 태스크의 요구사항에 암묵적으로 포함된다:

- **0 침습**: `src/game/`의 **기존 파일은 한 줄도 바꾸지 않는다**. 신규 `hospitalMap.ts`·`hospitalMap.test.ts`만 추가된다. `adjudicate`·`hardlockReason`·`decide`·`advanceDay`는 `MapScene`의 존재를 모른다.
- **기존 테스트 전부 그대로 green**: 회귀 0. 빨리감기를 스킵하든 끝까지 보든 게임 상태는 동일하다.
- **결정론**: `Date.now()`·`Math.random()` 금지(게임 원칙 RNG 0). 같은 `(receiving, atMin)`은 항상 같은 `MapScene`.
- **`NIGHT_START_MIN`은 [daysim.ts](../../../src/game/daysim.ts)에서 import 한다.** 야간 경계를 새로 정의하지 않는다 — 화면의 밤과 게임의 야간 판정이 구조적으로 어긋날 수 없게(이중 기재 회피).
- **show-don't-tell**: 맵에 해석 카피 0. 방 라벨·상태점·조명만. "순환기 과부하" 같은 문구 금지.
- **타입 게이트**: `npx tsc --noEmit` 0 필수(vitest는 esbuild라 타입을 안 본다 — 타입 회귀가 green으로 샌다).
- **컴포넌트는 유닛테스트 안 함**: 게임 로직(`hospitalMap.ts`)만 vitest. `HospitalMap`/`PixelSprite`/`ReceivingPhase`는 브라우저 실측(프로젝트 관례).
- **에셋 자체 제작**: ZEP 등 외부 스프라이트·타일셋을 추출해 쓰지 않는다. 전부 inline SVG `<rect>` 격자. 이미지 파일 0개.
- **한글 커밋**: T-026 절차(`.commit-msg-tmp` UTF-8 + `git commit -F`) + AI 트레일러(`Skills-used:`…`Co-Authored-By:` **빈 줄 없이 연속**, 그 앞에 본문과 분리하는 빈 줄 1개). 새 md는 `type/*` 태그.

---

## Task 1: `hospitalMap.ts` — 순수 파생 (`MapScene` · 조명 · 빨리감기 시각열)

이 슬라이스의 두뇌 전부. 네 묶음(조명 / 과 정렬 / 장면 파생 / 시각열)을 TDD로 쌓는다. 컴포넌트는 이 함수의 산출물만 그린다.

**Files:**
- Create: `src/game/hospitalMap.ts`
- Test: `src/game/hospitalMap.test.ts`
- Modify: `src/components/DoctorRoster.tsx:36-41` (중복된 정렬 규칙을 `compareDeptKeys`로 교체)

**Interfaces:**
- Consumes: `DeptKey`·`Doctor`(types.ts), `ReceivingState`(receiving.ts, **type-only**), `DEPARTMENTS`(setup.ts), `NIGHT_START_MIN`(daysim.ts)
- Produces:
  - `interface MapRoom { dept: DeptKey; label: string; col: number; staffed: boolean; lit: boolean }`
  - `interface MapBed { index: number; occupantDoctorId?: string }`
  - `type AvatarKind = 'DOCTOR' | 'PATIENT'` · `type AvatarZone = 'ROOM' | 'CORRIDOR' | 'BED'`
  - `interface MapAvatar { id: string; kind: AvatarKind; zone: AvatarZone; dept?: DeptKey; slot: number; busy: boolean }`
  - `type Lighting = 'DAY' | 'DUSK' | 'NIGHT'`
  - `interface MapScene { rooms: MapRoom[]; beds: MapBed[]; avatars: MapAvatar[]; lighting: Lighting; clockMin: number }`
  - `lightingAt(atMin: number): Lighting`
  - `compareDeptKeys(a: DeptKey, b: DeptKey): number`
  - `deriveMapScene(receiving: ReceivingState, atMin: number): MapScene`
  - `sweepMinutes(from: number, to: number, steps: number): number[]`
  - `sweepDurationMs(from: number, to: number): number`
  - 상수 `DUSK_LEAD_MIN`·`FAST_FORWARD_STEPS`·`FAST_FORWARD_MS_CAP`·`FAST_FORWARD_MS_PER_MIN`

> **설계 대비 의도적 편차 1개**: 스펙 §6은 기존 4개 패널 "무변경 재사용"이라 했으나, `DoctorRoster.tsx:37-41`의 과 정렬 규칙이 `deriveMapScene`의 방 순서와 **같은 규칙의 두 번째 사본**이 된다. 프로젝트 CLAUDE.md가 반복 경고하는 이중 기재라 `compareDeptKeys` 하나로 합친다. 동작은 완전히 동일하고(같은 비교자), 게임 로직은 안 건드린다.

### 1-A. 조명 — 게임이 이미 정한 경계선 재사용

- [ ] **Step 1: 실패하는 테스트 작성**

`src/game/hospitalMap.test.ts` 신규 생성:

```ts
import { describe, it, expect } from 'vitest'
import { lightingAt, DUSK_LEAD_MIN } from './hospitalMap'
import { NIGHT_START_MIN } from './daysim'

describe('lightingAt — 시각 → 조명 3단', () => {
  it('개장~석양 전은 DAY', () => {
    expect(lightingAt(0)).toBe('DAY')
    expect(lightingAt(NIGHT_START_MIN - DUSK_LEAD_MIN - 1)).toBe('DAY')
  })

  it('석양 구간은 DUSK (경계 포함)', () => {
    expect(lightingAt(NIGHT_START_MIN - DUSK_LEAD_MIN)).toBe('DUSK')
    expect(lightingAt(NIGHT_START_MIN - 1)).toBe('DUSK')
  })

  it('NIGHT_START_MIN부터 NIGHT — 게임의 야간 판정과 같은 경계선', () => {
    expect(lightingAt(NIGHT_START_MIN)).toBe('NIGHT')
    expect(lightingAt(NIGHT_START_MIN + 300)).toBe('NIGHT')
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

Expected: FAIL — `Failed to resolve import "./hospitalMap"`

- [ ] **Step 3: 최소 구현**

`src/game/hospitalMap.ts` 신규 생성:

```ts
import type { DeptKey, Doctor } from './types'
import type { ReceivingState } from './receiving' // type-only — 런타임 순환 없음
import { DEPARTMENTS } from './setup'
import { NIGHT_START_MIN } from './daysim'

// 병원 맵 표시 레이어 — 순수·결정론. 판정·경제에 절대 닿지 않는다(0 침습).
// 새 게임 상태 0개: ReceivingState 하나에서 그 순간의 장면을 파생만 한다.

export type Lighting = 'DAY' | 'DUSK' | 'NIGHT'

/**
 * 석양 구간 길이(분) — 이 파일이 새로 정하는 **연출값**이다(판정 무관).
 * 반면 야간 경계는 정의하지 않고 daysim.ts의 NIGHT_START_MIN을 그대로 쓴다 —
 * 콜에 '야간' 배지를 붙이는 그 상수라, 화면의 밤과 게임의 야간이 어긋날 수 없다.
 */
export const DUSK_LEAD_MIN = 120

export function lightingAt(atMin: number): Lighting {
  if (atMin >= NIGHT_START_MIN) return 'NIGHT'
  if (atMin >= NIGHT_START_MIN - DUSK_LEAD_MIN) return 'DUSK'
  return 'DAY'
}
```

- [ ] **Step 4: 통과 확인**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

Expected: PASS (3 tests)

### 1-B. 과 표시 순서 — 단일 출처

- [ ] **Step 5: 실패하는 테스트 추가**

`src/game/hospitalMap.test.ts` 끝에 추가:

```ts
import { compareDeptKeys } from './hospitalMap'
import { DEPARTMENTS } from './setup'
import type { DeptKey } from './types'

describe('compareDeptKeys — 과 표시 순서(필수과 먼저)', () => {
  it('필수과가 수익과보다 앞선다', () => {
    expect(compareDeptKeys('CARDIOLOGY', 'AESTHETICS')).toBeLessThan(0)
    expect(compareDeptKeys('AESTHETICS', 'CARDIOLOGY')).toBeGreaterThan(0)
  })

  it('같은 군 안에서는 DEPARTMENTS 순', () => {
    // DEPARTMENTS: … CARDIOLOGY, THORACIC_SURGERY … → 순환기가 흉부외과보다 앞
    expect(compareDeptKeys('CARDIOLOGY', 'THORACIC_SURGERY')).toBeLessThan(0)
    expect(compareDeptKeys('AESTHETICS', 'CHECKUP')).toBeLessThan(0)
  })

  it('전체 정렬 결과가 고정된다(방 순서 = 명단 순서의 단일 출처)', () => {
    const ordered: DeptKey[] = DEPARTMENTS.map((d) => d.key).sort(compareDeptKeys)
    expect(ordered).toEqual([
      'CARDIOLOGY',
      'THORACIC_SURGERY',
      'OBSTETRICS',
      'NEUROSURGERY',
      'GENERAL_SURGERY',
      'INTERNAL_MEDICINE',
      'AESTHETICS',
      'CHECKUP',
    ])
  })
})
```

- [ ] **Step 6: 실패 확인**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

Expected: FAIL — `compareDeptKeys is not a function`

- [ ] **Step 7: 구현 추가**

`src/game/hospitalMap.ts`의 `lightingAt` 아래에 추가:

```ts
/**
 * 과 표시 순서 — 필수과 먼저(붕괴가 보이는 쪽) → 수익과, 같은 군은 DEPARTMENTS 순.
 * 맵의 방 순서와 DoctorRoster의 명단 순서가 **이 함수 하나**를 공유한다 —
 * 두 표면의 순서가 어긋나면 같은 병원이 두 개로 보인다.
 */
export function compareDeptKeys(a: DeptKey, b: DeptKey): number {
  const ia = DEPARTMENTS.findIndex((d) => d.key === a)
  const ib = DEPARTMENTS.findIndex((d) => d.key === b)
  const ea = DEPARTMENTS[ia].essential
  const eb = DEPARTMENTS[ib].essential
  if (ea !== eb) return ea ? -1 : 1
  return ia - ib
}

/** 방 배열의 열 순서 = 과 표시 순서. 모듈 로드 시 1회 계산(불변). */
const ORDERED_DEPTS = [...DEPARTMENTS].sort((a, b) => compareDeptKeys(a.key, b.key))
```

- [ ] **Step 8: 통과 확인**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 9: `DoctorRoster.tsx`의 중복 정렬 규칙 제거**

`src/components/DoctorRoster.tsx` — import에 추가:

```tsx
import { compareDeptKeys } from "@/game/hospitalMap";
```

그리고 36~41행을 아래로 교체:

```tsx
  // 필수과 먼저(붕괴가 보이는 쪽) → 수익과. 맵의 방 순서와 같은 비교자를 공유한다(단일 출처).
  const ordered = [...roster].sort((a, b) => compareDeptKeys(a.dept, b.dept));
```

교체 후 `deptMeta`는 여전히 카드 라벨(`deptMeta(doc.dept).label`)에 쓰이므로 **지우지 않는다**.

- [ ] **Step 10: 타입 게이트 + 전체 테스트**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 타입 에러 0, 기존 테스트 전부 PASS

### 1-C. `deriveMapScene` — 장면 파생

- [ ] **Step 11: 실패하는 테스트 추가 (방·조명·소등)**

`src/game/hospitalMap.test.ts` 끝에 추가:

```ts
import { deriveMapScene } from './hospitalMap'
import { initReceiving, createCallQueue, decide } from './receiving'
import { buildHospital } from './setup'
import type { Hospital, SetupChoices } from './types'
// ⚠️ NIGHT_START_MIN·DEPARTMENTS는 1-A·1-B 블록에서 이미 import 했다 — 다시 쓰지 않는다(중복 선언 = 타입 에러).

// 순환기 2명(24시간 배후 성립) + 미용 1명. 병상은 개원 기본값(FIXED_BEDS = 3).
const choices: SetupChoices = { hospitalName: '양심병원', doctors: { CARDIOLOGY: 2, AESTHETICS: 1 } }
const hospital: Hospital = buildHospital(choices).hospital
const base = initReceiving(hospital, createCallQueue(1))

describe('deriveMapScene — 방', () => {
  it('안 뽑은 과도 방을 차지한다(빈 방이 보여야 한다)', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.rooms).toHaveLength(DEPARTMENTS.length)
    const neuro = scene.rooms.find((r) => r.dept === 'NEUROSURGERY')!
    expect(neuro.staffed).toBe(false)
    expect(neuro.label).toBe('신경외과')
  })

  it('채용한 과는 staffed', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.rooms.find((r) => r.dept === 'CARDIOLOGY')!.staffed).toBe(true)
    expect(scene.rooms.find((r) => r.dept === 'AESTHETICS')!.staffed).toBe(true)
  })

  it('col은 표시 순서와 같고 0부터 연속이다', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.rooms.map((r) => r.col)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(scene.rooms[0].dept).toBe('CARDIOLOGY') // 필수과 먼저
  })
})

describe('deriveMapScene — 야간 소등', () => {
  it('주간엔 모든 방에 불이 켜져 있다', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.rooms.every((r) => r.lit)).toBe(true)
    expect(scene.lighting).toBe('DAY')
  })

  it('야간엔 24시간 배후과만 켜지고 나머지는 꺼진다', () => {
    const scene = deriveMapScene(base, NIGHT_START_MIN)
    expect(scene.lighting).toBe('NIGHT')
    expect(scene.rooms.find((r) => r.dept === 'CARDIOLOGY')!.lit).toBe(true) // 2명 = 당직 성립
    expect(scene.rooms.find((r) => r.dept === 'AESTHETICS')!.lit).toBe(false) // 수익과는 밤에 안 돈다
    expect(scene.rooms.find((r) => r.dept === 'NEUROSURGERY')!.lit).toBe(false) // 미채용
  })

  it('1명만 뽑은 배후과는 야간에 꺼진다 — 「의사 1명은 24시간을 못 버틴다」', () => {
    const solo = buildHospital({ hospitalName: '1인', doctors: { CARDIOLOGY: 1 } }).hospital
    const scene = deriveMapScene(initReceiving(solo, createCallQueue(1)), NIGHT_START_MIN)
    expect(scene.rooms.find((r) => r.dept === 'CARDIOLOGY')!.lit).toBe(false)
  })
})

describe('deriveMapScene — 의사 위치', () => {
  it('점유 중인 의사는 자기 진료실 안, 자유로운 의사는 복도', () => {
    const doc = hospital.roster![0]
    const r = { ...base, busyUntil: { [doc.id]: 200 } }
    const scene = deriveMapScene(r, 100)
    const a = scene.avatars.find((v) => v.id === doc.id)!
    expect(a.kind).toBe('DOCTOR')
    expect(a.zone).toBe('ROOM')
    expect(a.dept).toBe(doc.dept)
    expect(a.busy).toBe(true)

    const others = scene.avatars.filter((v) => v.kind === 'DOCTOR' && v.id !== doc.id)
    expect(others.every((v) => v.zone === 'CORRIDOR' && !v.busy)).toBe(true)
  })

  it('경계값 busyUntil === atMin 은 자유 쪽(freeDoctorsOfDept와 같은 부등호)', () => {
    const doc = hospital.roster![0]
    const scene = deriveMapScene({ ...base, busyUntil: { [doc.id]: 100 } }, 100)
    expect(scene.avatars.find((v) => v.id === doc.id)!.zone).toBe('CORRIDOR')
  })

  it('atMin이 전진하면 진료가 끝난 의사가 스스로 복도로 나온다(빨리감기의 근거)', () => {
    const doc = hospital.roster![0]
    const r = { ...base, busyUntil: { [doc.id]: 200 } }
    expect(deriveMapScene(r, 150).avatars.find((v) => v.id === doc.id)!.zone).toBe('ROOM')
    expect(deriveMapScene(r, 250).avatars.find((v) => v.id === doc.id)!.zone).toBe('CORRIDOR')
  })

  it('같은 방의 두 의사는 서로 다른 slot을 받는다', () => {
    const [d1, d2] = hospital.roster!.filter((d) => d.dept === 'CARDIOLOGY')
    const scene = deriveMapScene({ ...base, busyUntil: { [d1.id]: 200, [d2.id]: 200 } }, 100)
    const slots = scene.avatars.filter((v) => v.kind === 'DOCTOR' && v.zone === 'ROOM').map((v) => v.slot)
    expect([...slots].sort()).toEqual([0, 1])
  })
})

describe('deriveMapScene — 병상', () => {
  it('빈 침대도 칸이 남는다(길이 === hospital.beds)', () => {
    const scene = deriveMapScene(base, 0)
    expect(scene.beds).toHaveLength(hospital.beds)
    expect(scene.beds.every((b) => b.occupantDoctorId === undefined)).toBe(true)
    expect(scene.beds.map((b) => b.index)).toEqual([0, 1, 2])
  })

  it('진료 중인 의사 1명 = 침대 위 환자 1명', () => {
    const [d1, d2] = hospital.roster!.filter((d) => d.dept === 'CARDIOLOGY')
    const scene = deriveMapScene({ ...base, busyUntil: { [d1.id]: 200, [d2.id]: 200 } }, 100)
    const occupied = scene.beds.filter((b) => b.occupantDoctorId !== undefined)
    expect(occupied).toHaveLength(2)
    expect(occupied.map((b) => b.occupantDoctorId).sort()).toEqual([d1.id, d2.id].sort())

    const patients = scene.avatars.filter((v) => v.kind === 'PATIENT')
    expect(patients).toHaveLength(2)
    expect(patients.every((v) => v.zone === 'BED')).toBe(true)
  })

  it('점유가 병상을 넘으면 초과분 환자는 복도에서 대기한다(침대 칸 수는 고정)', () => {
    const many = buildHospital(
      { hospitalName: '만원', doctors: { CARDIOLOGY: 3, AESTHETICS: 3 } },
      DEPARTMENTS,
      3, // beds
    ).hospital
    const busyAll = Object.fromEntries(many.roster!.map((d) => [d.id, 500]))
    const scene = deriveMapScene({ ...initReceiving(many, createCallQueue(1)), busyUntil: busyAll }, 100)
    expect(scene.beds).toHaveLength(3)
    expect(scene.beds.filter((b) => b.occupantDoctorId).length).toBe(3)
    const patients = scene.avatars.filter((v) => v.kind === 'PATIENT')
    expect(patients).toHaveLength(6) // 진료 중 의사 6명 = 환자 6명
    expect(patients.filter((v) => v.zone === 'CORRIDOR')).toHaveLength(3) // 초과분
  })

  it('퇴원 — 담당의 busyUntil을 지난 시각에서 그 침대가 빈다', () => {
    const d1 = hospital.roster!.find((d) => d.dept === 'CARDIOLOGY')!
    const r = { ...base, busyUntil: { [d1.id]: 200 } }
    expect(deriveMapScene(r, 150).beds.filter((b) => b.occupantDoctorId).length).toBe(1)
    expect(deriveMapScene(r, 250).beds.filter((b) => b.occupantDoctorId).length).toBe(0)
  })

  it('하드락·거절 콜은 침대를 만들지 않는다(busyUntil이 안 생긴다)', () => {
    // 월요일 콜 = [미용 워크인, 순환기 예약, 검진 워크인, 고열감염, STEMI].
    // 신경외과 1명만 뽑으면 이 중 어느 것도 그 의사에게 안 붙고, STEMI는 NO_BACKUP_CARE로 하드락된다.
    // 하루를 전부 '수용'으로 돌려도 점유가 0이라 침대가 끝까지 빈다 — log를 안 봐도 거절이 자동 제외된다.
    const noCardio = buildHospital({ hospitalName: '무순환기', doctors: { NEUROSURGERY: 1 } }).hospital
    let r = initReceiving(noCardio, createCallQueue(1))
    const stemi = r.queue.find((c) => c.kind === 'STEMI')!
    while (!r.done) r = decide(r, true)
    const scene = deriveMapScene(r, stemi.arrivalMin!)
    expect(scene.beds.every((b) => b.occupantDoctorId === undefined)).toBe(true)
    expect(scene.avatars.filter((v) => v.kind === 'PATIENT')).toHaveLength(0)
  })
})

describe('deriveMapScene — 견고성 · 결정론', () => {
  it('roster 없는 구형 병원도 던지지 않고 아바타 0으로 반환한다', () => {
    const legacy: Hospital = {
      id: 'legacy', name: '구형', beds: 3, hasErOnCall: true, overcrowded: false, backupCare: [],
    }
    const scene = deriveMapScene(initReceiving(legacy, createCallQueue(1)), 0)
    expect(scene.avatars).toHaveLength(0)
    expect(scene.rooms).toHaveLength(DEPARTMENTS.length)
    expect(scene.rooms.every((r) => !r.staffed)).toBe(true)
  })

  it('같은 입력은 항상 같은 장면(깊은 동일)', () => {
    const d1 = hospital.roster![0]
    const r = { ...base, busyUntil: { [d1.id]: 300 } }
    expect(deriveMapScene(r, 120)).toEqual(deriveMapScene(r, 120))
  })

  it('clockMin은 요청한 시각을 그대로 싣는다(receiving.clockMin이 아니다)', () => {
    expect(deriveMapScene(base, 240).clockMin).toBe(240)
  })
})
```

- [ ] **Step 12: 실패 확인**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

Expected: FAIL — `deriveMapScene is not a function`

- [ ] **Step 13: 구현 추가**

`src/game/hospitalMap.ts`의 `ORDERED_DEPTS` 아래에 추가:

```ts
/** 방 한 칸. 안 뽑은 과도 칸을 차지한다(빈 방으로 보이는 게 목적). */
export interface MapRoom {
  dept: DeptKey
  label: string
  col: number
  staffed: boolean
  lit: boolean
}

/** 침대 한 칸. beds 티어만큼 존재하고, 비어 있어도 칸은 남는다. */
export interface MapBed {
  index: number
  occupantDoctorId?: string
}

export type AvatarKind = 'DOCTOR' | 'PATIENT'
export type AvatarZone = 'ROOM' | 'CORRIDOR' | 'BED'

export interface MapAvatar {
  id: string
  kind: AvatarKind
  zone: AvatarZone
  /**
   * 의사의 소속 과 — ROOM이면 어느 방인지이고, CORRIDOR여도 그대로 실린다.
   * (설계 스펙 §3은 "ROOM일 때"라고 썼지만, 복도의 순환기 의사도 과 색으로 알아볼 수 있어야 해서 항상 싣는다.
   *  정보가 늘 뿐이라 소비자는 zone으로만 분기하면 된다.) 환자는 undefined.
   */
  dept?: DeptKey
  slot: number // 그 zone 안에서의 자리 인덱스 — 픽셀 좌표는 컴포넌트가 계산한다
  busy: boolean // 의사 전용
}

export interface MapScene {
  rooms: MapRoom[]
  beds: MapBed[]
  avatars: MapAvatar[]
  lighting: Lighting
  clockMin: number
}

/**
 * 그 순간의 병원 장면. 순수·결정론이고 **게임 상태를 만들지 않는다** — 저장되지 않는 파생 산출물이다.
 *
 * 핵심은 busyUntil 하나가 두 가지를 동시에 정한다는 것이다:
 *   (1) 의사가 진료실 안인가 복도인가
 *   (2) 지금 병원에 환자가 몇 명 누워 있는가
 * decide()가 수용 시 정확히 한 명을 arrivalMin+durationMin까지 점유하므로
 * **진료 중인 의사 1명 = 환자 1명**이다. log를 훑을 필요도, 배정을 재현할 필요도 없다
 * (log에는 담당 의사 id가 없어 재현 자체가 불가능하다 — 설계 스펙 §4.3).
 */
export function deriveMapScene(receiving: ReceivingState, atMin: number): MapScene {
  const { hospital } = receiving
  const lighting = lightingAt(atMin)
  const roundTheClock = hospital.roundTheClockBackup ?? []
  const roster = hospital.roster ?? []

  const rooms: MapRoom[] = ORDERED_DEPTS.map((d, col) => ({
    dept: d.key,
    label: d.label,
    col,
    staffed: roster.some((doc) => doc.dept === d.key),
    // 야간엔 24시간 배후가 서는 과만 켜진다. 수익과는 애초에 roundTheClockBackup에 없어 함께 꺼진다.
    // (some(===)을 쓰는 이유: roundTheClockBackup은 Specialty[]라 DeptKey를 includes에 못 넣는다.)
    lit: lighting !== 'NIGHT' || roundTheClock.some((s) => s === d.key),
  }))

  // 방 순서와 같은 규칙으로 정렬해 아바타 배치·침대 배정을 결정론으로 만든다.
  const ordered = [...roster].sort((a, b) => compareDeptKeys(a.dept, b.dept))
  const isBusy = (doc: Doctor) => (receiving.busyUntil[doc.id] ?? 0) > atMin

  const beds: MapBed[] = Array.from({ length: hospital.beds }, (_, index) => ({ index }))
  const avatars: MapAvatar[] = []
  const roomSlot = new Map<DeptKey, number>()
  let corridorSlot = 0 // 의사·환자가 한 카운터를 공유한다 — 복도에서 자리가 겹치지 않게
  let nextBed = 0

  for (const doc of ordered) {
    if (!isBusy(doc)) {
      avatars.push({ id: doc.id, kind: 'DOCTOR', zone: 'CORRIDOR', dept: doc.dept, slot: corridorSlot++, busy: false })
      continue
    }
    const slot = roomSlot.get(doc.dept) ?? 0
    roomSlot.set(doc.dept, slot + 1)
    avatars.push({ id: doc.id, kind: 'DOCTOR', zone: 'ROOM', dept: doc.dept, slot, busy: true })

    // 그 의사가 지금 보고 있는 환자. 침대가 남으면 눕고, 정원을 넘으면 복도에서 기다린다.
    const patient = { id: `pat-${doc.id}`, kind: 'PATIENT' as const, busy: false }
    if (nextBed < beds.length) {
      beds[nextBed].occupantDoctorId = doc.id
      avatars.push({ ...patient, zone: 'BED', slot: nextBed })
      nextBed++
    } else {
      avatars.push({ ...patient, zone: 'CORRIDOR', slot: corridorSlot++ })
    }
  }

  return { rooms, beds, avatars, lighting, clockMin: atMin }
}
```

- [ ] **Step 14: 통과 확인**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

Expected: PASS (전체 24 tests — 1-A 3 + 1-B 3 + 1-C 18)

### 1-D. 빨리감기 시각열

- [ ] **Step 15: 실패하는 테스트 추가**

`src/game/hospitalMap.test.ts` 끝에 추가:

```ts
import { sweepMinutes, sweepDurationMs, FAST_FORWARD_STEPS, FAST_FORWARD_MS_CAP } from './hospitalMap'

describe('sweepMinutes — 콜 사이 시각열', () => {
  it('마지막은 항상 목표 시각이고 개수는 steps다', () => {
    const seq = sweepMinutes(100, 220, FAST_FORWARD_STEPS)
    expect(seq).toHaveLength(FAST_FORWARD_STEPS)
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

describe('sweepDurationMs — 게임 시간에 비례하되 캡', () => {
  it('짧은 구간은 짧게 재생한다', () => {
    expect(sweepDurationMs(100, 110)).toBeLessThan(FAST_FORWARD_MS_CAP)
  })

  it('아침 첫 콜의 몇 시간을 그대로 기다리지 않는다(캡)', () => {
    expect(sweepDurationMs(0, 600)).toBe(FAST_FORWARD_MS_CAP)
  })

  it('되감기·0구간은 0ms', () => {
    expect(sweepDurationMs(200, 200)).toBe(0)
    expect(sweepDurationMs(300, 200)).toBe(0)
  })
})
```

- [ ] **Step 16: 실패 확인**

```bash
npx vitest run src/game/hospitalMap.test.ts
```

Expected: FAIL — `sweepMinutes is not a function`

- [ ] **Step 17: 구현 추가**

`src/game/hospitalMap.ts` 끝에 추가:

```ts
// ── 빨리감기(연출 전용) ────────────────────────────────────────────────
// 게임 상태와 무관하다. 중간에 끊기든 스킵하든 판정에 영향 0.

/** 한 구간을 몇 장면으로 쪼갤지. 사이는 CSS transition이 걷는 걸로 메운다(rAF·게임 루프 없음). */
export const FAST_FORWARD_STEPS = 12
/** 한 구간 재생의 상한(ms) — 아침 첫 콜의 6시간을 그대로 기다리지 않는다. */
export const FAST_FORWARD_MS_CAP = 1500
/** 게임 1분당 재생 시간(ms). 캡에 걸리기 전까지는 긴 점프가 길게 보인다. */
export const FAST_FORWARD_MS_PER_MIN = 4

/**
 * from(제외) → to(포함)를 steps개로 나눈 시각열.
 * 구간이 없거나 steps ≤ 1이면 [to] 하나 — 즉시 점프(prefers-reduced-motion 경로).
 */
export function sweepMinutes(from: number, to: number, steps: number): number[] {
  if (to <= from || steps <= 1) return [to]
  const span = to - from
  return Array.from({ length: steps }, (_, i) => from + Math.round((span * (i + 1)) / steps))
}

/** 이 구간 재생에 쓸 총 시간(ms). */
export function sweepDurationMs(from: number, to: number): number {
  return Math.min(FAST_FORWARD_MS_CAP, Math.max(0, to - from) * FAST_FORWARD_MS_PER_MIN)
}
```

- [ ] **Step 18: 전체 게이트**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 타입 에러 0, 전체 테스트 PASS(신규 30 + 기존 전부)

- [ ] **Step 19: 커밋**

`.commit-msg-tmp` 파일을 **UTF-8**로 생성(T-026 — PowerShell 5.1 인라인 한글은 CP949로 깨진다):

```
feat: 병원 맵 파생 — busyUntil 하나로 의사 위치와 침대 환자를 동시에 정한다 (T-063)

deriveMapScene(receiving, atMin) 신설. 새 게임 상태 0개 — ReceivingState에서
그 순간의 방·침대·아바타·조명을 파생만 한다. decide가 수용 시 정확히 한 명을
점유하므로 '진료 중인 의사 1명 = 환자 1명'이고, 그래서 log를 훑지 않는다
(log에는 담당 의사 id가 없어 배정 재현 자체가 불가능하다).

야간 경계는 daysim.ts의 NIGHT_START_MIN을 import 해 쓴다 — 화면의 밤과
게임의 야간 판정이 구조적으로 어긋날 수 없게. 과 표시 순서는 compareDeptKeys
하나로 모아 DoctorRoster의 중복 사본을 없앴다.

Skills-used: superpowers:writing-plans, superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 경계값(busyUntil === atMin)·정원 초과·구형 roster 없는 병원을 구현 전에 못박음
Skill-benefit: writing-plans — 파생 규칙을 코드로 확정해 구현 중 재설계 0
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```bash
git add src/game/hospitalMap.ts src/game/hospitalMap.test.ts src/components/DoctorRoster.tsx
```

```bash
git commit -F .commit-msg-tmp && rm .commit-msg-tmp
```

트레일러 파싱 확인(프로젝트 실측상 15커밋 중 13개가 빈 줄 하나로 깨졌다):

```bash
git log -1 --format=%B | git interpret-trailers --parse
```

Expected: 5줄(Skills-used / Plugins-used / Skill-benefit ×2 / Co-Authored-By) 전부 출력

---

## Task 2: `PixelSprite.tsx` — inline SVG 픽셀 스프라이트

이미지 파일 0개. 문자열 격자 하나를 `<rect>`로 펴는 게 전부다. 외부 에셋을 쓰지 않는 이유는 저작권(설계 스펙 §9)이다.

**Files:**
- Create: `src/components/PixelSprite.tsx`

**Interfaces:**
- Consumes: `DeptKey`(types.ts)
- Produces:
  - `DEPT_COLOR: Record<DeptKey, string>`
  - `<DoctorSprite dept={DeptKey} busy={boolean} />`
  - `<PatientSprite />`
  - `<BedSprite occupied={boolean} />`

- [ ] **Step 1: 파일 작성**

`src/components/PixelSprite.tsx` 신규 생성:

```tsx
import type { DeptKey } from "@/game/types";

/**
 * 픽셀 스프라이트 — inline SVG <rect> 격자. 이미지 파일 0개, 번들 영향 0, 정적 export 안전.
 *
 * ZEP 등 외부 스프라이트·타일셋을 추출해 쓰지 않는다(대회 제출물이라 실제 저작권 리스크).
 * 참조하는 것은 형식(2D 탑다운 + 픽셀 그리드)이고, 이는 Gather.town·스타듀밸리·
 * 테마 호스피탈이 공유하는 장르 관습이다.
 */

/** 과별 가운 강조색. 필수과는 채도 있는 색, 수익과는 옅은 색 — 해석 카피 없이 대조만 만든다. */
export const DEPT_COLOR: Record<DeptKey, string> = {
  CARDIOLOGY: "#ef4444",
  THORACIC_SURGERY: "#f97316",
  OBSTETRICS: "#ec4899",
  NEUROSURGERY: "#a855f7",
  GENERAL_SURGERY: "#3b82f6",
  INTERNAL_MEDICINE: "#14b8a6",
  AESTHETICS: "#a1a1aa",
  CHECKUP: "#71717a",
};

// 8×8 픽셀 인물. '.'=투명 'H'=머리 'S'=피부 'C'=가운 'A'=과 색 강조
const FIGURE = [
  "..HHHH..",
  ".HHHHHH.",
  ".HSSSSH.",
  "..SSSS..",
  ".ACCCCA.",
  ".CCCCCC.",
  "..CC.CC.",
  "..CC.CC.",
];

function PixelGrid({ rows, palette }: { rows: string[]; palette: Record<string, string> }) {
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-full w-full" aria-hidden>
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) =>
          palette[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[ch]} /> : null,
        ),
      )}
    </svg>
  );
}

/** 의사 — 흰 가운 + 과 색 어깨. busy면 가운이 밝아진다(상태점이 아니라 밝기로). */
export function DoctorSprite({ dept, busy }: { dept: DeptKey; busy: boolean }) {
  return (
    <PixelGrid
      rows={FIGURE}
      palette={{
        H: "#3f3f46",
        S: "#f0d3b4",
        C: busy ? "#fafafa" : "#d4d4d8",
        A: DEPT_COLOR[dept],
      }}
    />
  );
}

/**
 * 환자 — 익명 회색. 이름도 사연도 없다(의도적 영구 보류):
 * 개인 서사가 붙으면 "시스템이 문제"가 "이 환자가 안됐다"로 미끄러진다.
 */
export function PatientSprite() {
  return <PixelGrid rows={FIGURE} palette={{ H: "#52525b", S: "#d6c3ae", C: "#8b8b93", A: "#8b8b93" }} />;
}

// 침대 — 위에서 본 8×8. 'F'=프레임 'M'=매트리스 'P'=베개
const BED = [
  "FFFFFFFF",
  "FPPPPPPF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FFFFFFFF",
];

export function BedSprite({ occupied }: { occupied: boolean }) {
  return (
    <PixelGrid
      rows={BED}
      palette={{ F: "#3f3f46", P: "#e4e4e7", M: occupied ? "#4b5563" : "#27272a" }}
    />
  );
}
```

- [ ] **Step 2: 타입 게이트**

```bash
npx tsc --noEmit
```

Expected: 에러 0. (`DEPT_COLOR`가 `Record<DeptKey, string>`이라 과가 하나라도 빠지면 여기서 잡힌다.)

- [ ] **Step 3: 커밋**

`.commit-msg-tmp`(UTF-8):

```
feat: 픽셀 스프라이트 — inline SVG 격자로 아바타·침대 (T-063)

의사·환자·침대를 8×8 문자열 격자에서 <rect>로 편다. 이미지 파일 0개라
정적 export(GitHub Pages)와 번들에 영향이 없다. 외부 타일셋을 추출하지
않는 이유는 저작권이다 — 참조한 건 형식(2D 탑다운 픽셀)뿐이다.

환자는 익명 회색으로 남긴다: 개인 서사가 붙으면 '시스템이 문제'가
'이 환자가 안됐다'로 미끄러진다.

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```bash
git add src/components/PixelSprite.tsx
```

```bash
git commit -F .commit-msg-tmp && rm .commit-msg-tmp
```

---

## Task 3: `HospitalMap.tsx` — `MapScene` → DOM

순수 표시. 배경(방·복도·병동)은 정적 격자로 깔고, **아바타만 절대 좌표 한 레이어에** 놓아 `key={id}`로 신원을 유지한다 — 그래야 방↔복도 이동이 remount가 아니라 CSS transition이 된다.

**Files:**
- Create: `src/components/HospitalMap.tsx`

**Interfaces:**
- Consumes: `MapScene`·`MapAvatar`·`Lighting`(hospitalMap.ts), `DoctorSprite`·`PatientSprite`·`BedSprite`(PixelSprite.tsx)
- Produces: `<HospitalMap scene={MapScene} />` (default export)

- [ ] **Step 1: 파일 작성**

`src/components/HospitalMap.tsx` 신규 생성:

```tsx
"use client";

import type { Lighting, MapAvatar, MapScene } from "@/game/hospitalMap";
import { BedSprite, DoctorSprite, PatientSprite } from "./PixelSprite";

/**
 * 탑다운 병원 맵 — MapScene을 그대로 그리는 순수 표시층. 게임 상태를 만들지도 읽지도 않는다.
 *
 * 배경(방·복도·병동)은 정적으로 깔고 **아바타는 절대 좌표 한 레이어**에 둔다.
 * 방↔복도를 DOM 부모 교체로 표현하면 이동이 remount가 되어 애니메이션이 죽는다 —
 * key={id}를 유지한 채 left/top만 바꿔야 CSS transition이 사이를 걷는다.
 */

// 세로 밴드 — positionOf()의 top 값과 반드시 함께 움직인다.
const ROOMS_H = 52; // 진료실 줄: 0% ~ 52%
const CORRIDOR_H = 16; // 복도: 52% ~ 68%

const LIGHT_WASH: Record<Lighting, string> = {
  DAY: "bg-transparent",
  DUSK: "bg-orange-950/30",
  NIGHT: "bg-indigo-950/60",
};

/** zone·slot → 맵 안 백분율 좌표. 좌표를 순수 함수가 아니라 여기서 정하는 이유는 레이아웃 상수라서다. */
function positionOf(a: MapAvatar, scene: MapScene): { left: string; top: string } {
  if (a.zone === "ROOM") {
    const col = scene.rooms.find((r) => r.dept === a.dept)?.col ?? 0;
    const cell = 100 / scene.rooms.length;
    // 한 방에 최대 3명(deptCap 상한)이라 칸 안에서 30%·50%·70% 지점에 세운다.
    return { left: `${col * cell + cell * (0.3 + a.slot * 0.2)}%`, top: `${ROOMS_H * 0.62}%` };
  }
  if (a.zone === "BED") {
    const cell = 100 / Math.max(1, scene.beds.length);
    return { left: `${a.slot * cell + cell / 2}%`, top: `${ROOMS_H + CORRIDOR_H + 16}%` };
  }
  // 복도 — 의사·환자가 한 카운터를 공유해 자리가 겹치지 않는다.
  return { left: `${6 + a.slot * 7}%`, top: `${ROOMS_H + CORRIDOR_H / 2}%` };
}

export default function HospitalMap({ scene }: { scene: MapScene }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
      {/* 진료실 줄 */}
      <div
        className="absolute inset-x-0 top-0 grid gap-1 p-1.5"
        style={{ height: `${ROOMS_H}%`, gridTemplateColumns: `repeat(${scene.rooms.length}, minmax(0, 1fr))` }}
      >
        {scene.rooms.map((room) => (
          <div
            key={room.dept}
            className={`flex flex-col justify-end rounded-sm border transition-colors duration-500 ${
              room.lit
                ? room.staffed
                  ? "border-zinc-700 bg-zinc-800"
                  : "border-zinc-800 bg-zinc-800/40" // 빈 방 — 안 뽑은 과가 여기 보인다
                : "border-zinc-900 bg-black/60"
            }`}
          >
            <span
              className={`truncate px-1 pb-0.5 text-center text-[9px] leading-tight ${
                room.lit ? "text-zinc-400" : "text-zinc-700"
              }`}
            >
              {room.label}
            </span>
          </div>
        ))}
      </div>

      {/* 복도 */}
      <div
        className="absolute inset-x-0 border-y border-zinc-800 bg-zinc-950"
        style={{ top: `${ROOMS_H}%`, height: `${CORRIDOR_H}%` }}
      />

      {/* 병동 — 침대는 비어 있어도 칸이 남는다 */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-start justify-around px-1.5 pt-1.5"
        style={{ top: `${ROOMS_H + CORRIDOR_H}%` }}
      >
        {scene.beds.map((bed) => (
          <div key={bed.index} className="h-7 w-7 sm:h-9 sm:w-9">
            <BedSprite occupied={bed.occupantDoctorId !== undefined} />
          </div>
        ))}
      </div>

      {/* 아바타 레이어 — 이동이 곧 transition이다 */}
      <div className="absolute inset-0">
        {scene.avatars.map((a) => {
          const { left, top } = positionOf(a, scene);
          return (
            <div
              key={a.id}
              className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-linear sm:h-6 sm:w-6"
              style={{ left, top }}
            >
              {a.kind === "DOCTOR" && a.dept ? <DoctorSprite dept={a.dept} busy={a.busy} /> : <PatientSprite />}
            </div>
          );
        })}
      </div>

      {/* 조명 — 해석 카피 없이 밝기만 바뀐다 */}
      <div
        className={`pointer-events-none absolute inset-0 transition-colors duration-700 ${LIGHT_WASH[scene.lighting]}`}
        aria-hidden
      />
    </div>
  );
}
```

> ⚠️ 색은 Tailwind v4 기본 팔레트에 **실재하는 토큰만** 썼다(`zinc-800/40`·`indigo-950/60`·`orange-950/30`). `zinc-850`·`indigo-990` 같은 중간 단계는 존재하지 않으므로 조정이 필요하면 불투명도(`/40`)로 한다 — 없는 토큰은 조용히 무시돼 스타일이 안 먹는다.

- [ ] **Step 2: 타입 게이트**

```bash
npx tsc --noEmit
```

Expected: 에러 0

- [ ] **Step 3: 커밋**

`.commit-msg-tmp`(UTF-8):

```
feat: 병원 맵 컴포넌트 — 아바타를 절대 좌표 한 레이어에 (T-063)

MapScene을 그대로 그리는 순수 표시층. 배경(방·복도·병동)은 정적으로 깔고
아바타만 절대 좌표 레이어에 둔다 — 방↔복도를 DOM 부모 교체로 표현하면
이동이 remount가 되어 CSS transition이 죽기 때문이다. key=id를 유지한 채
left/top만 바꾸면 스텝 사이를 브라우저가 걷는다(rAF·게임 루프 없음).

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```bash
git add src/components/HospitalMap.tsx
```

```bash
git commit -F .commit-msg-tmp && rm .commit-msg-tmp
```

---

## Task 4: 빨리감기 훅 + `ReceivingPhase` 맵 주도 레이아웃

콜과 콜 사이의 시간 점프를 재생하고, 화면을 맵 주도로 재배치한다. 기존 4개 패널(`CallEconomicsBreakdown`·`DoctorRoster`·`CheerfulLedger`·`MorningPaper`)은 **호출 위치만** 바뀐다.

**Files:**
- Create: `src/components/useFastForwardClock.ts`
- Modify: `src/components/ReceivingPhase.tsx` (import 추가 + 활성 콜 화면 레이아웃)

**Interfaces:**
- Consumes: `sweepMinutes`·`sweepDurationMs`·`FAST_FORWARD_STEPS`·`deriveMapScene`(hospitalMap.ts), `ReceivingState`(receiving.ts)
- Produces: `useFastForwardClock(receiving: ReceivingState): { atMin: number; sweeping: boolean; skip: () => void }`

- [ ] **Step 1: 훅 작성**

`src/components/useFastForwardClock.ts` 신규 생성:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { FAST_FORWARD_STEPS, sweepDurationMs, sweepMinutes } from "@/game/hospitalMap";
import type { ReceivingState } from "@/game/receiving";

/**
 * 콜 사이의 시간 점프를 재생한다 — 맵에 먹일 시각 atMin 하나만 내놓는다.
 *
 * 게임 상태를 전혀 건드리지 않는다: 중간에 끊기든 스킵하든 판정은 동일하다.
 * 구간 양끝은 상태에서 파생한다 — receiving.clockMin은 decide가 직전 콜의
 * arrivalMin으로 전진시킨 값이라 정확히 '지난 콜 시각'이고, 목표는 다음 콜의
 * 도착 시각이다. 이전 상태를 ref에 들고 있을 필요가 없다.
 */
export function useFastForwardClock(receiving: ReceivingState): {
  atMin: number;
  sweeping: boolean;
  skip: () => void;
} {
  const to = receiving.done ? receiving.clockMin : (receiving.queue[receiving.index]?.arrivalMin ?? receiving.clockMin);
  // 초기값은 목표가 아니라 **출발 시각**이다 — to로 시작하면 첫 페인트에서 뒤로 튀었다가 다시 감긴다.
  const [atMin, setAtMin] = useState(receiving.clockMin);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const from = receiving.clockMin;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seq = sweepMinutes(from, to, reduced ? 1 : FAST_FORWARD_STEPS);
    const interval = seq.length > 1 ? sweepDurationMs(from, to) / seq.length : 0;

    setAtMin(seq[0]);
    let i = 1;
    const tick = () => {
      if (i >= seq.length) return;
      setAtMin(seq[i++]);
      timer.current = setTimeout(tick, interval);
    };
    if (seq.length > 1) timer.current = setTimeout(tick, interval);

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

  return { atMin, sweeping: atMin < to, skip };
}
```

- [ ] **Step 2: `ReceivingPhase.tsx` import 추가**

`src/components/ReceivingPhase.tsx`의 import 블록(20행 `import DoctorRoster from "./DoctorRoster";` 아래)에 추가:

```tsx
import HospitalMap from "./HospitalMap";
import { deriveMapScene } from "@/game/hospitalMap";
import { useFastForwardClock } from "./useFastForwardClock";
```

같은 파일 1행이 이미 `"use client";`이므로 훅 사용에 추가 조치는 없다.

- [ ] **Step 3: 훅 호출을 컴포넌트 최상단으로**

⚠️ `ReceivingPhase`는 `receiving.done`일 때 **조기 return** 한다(152행). 훅은 조기 return **앞**에 있어야 한다(Rules of Hooks). `const dayLabel = …` 바로 다음 줄(151행 뒤)에 삽입:

```tsx
  const { atMin, sweeping, skip } = useFastForwardClock(receiving);
  const scene = deriveMapScene(receiving, atMin);
```

`receiving.done` 분기는 그대로 둔다 — 마감 화면은 콜 목록·장부가 주인공이라 맵을 넣지 않는다(스코프 밖).

- [ ] **Step 4: 활성 콜 화면을 맵 주도로 재배치**

224행 `return (` 부터 파일 끝까지를 아래로 교체. 내부 패널 컴포넌트(`MorningPaper`·`CallEconomicsBreakdown`·`DoctorRoster`·`CheerfulLedger`)는 **전부 그대로 호출**한다:

```tsx
  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 text-zinc-100 bg-zinc-950">
      {/*
        HUD — 요일·콜 진행·시각. 시각은 맵과 같은 atMin을 쓴다(빨리감기 중에는 시계도 함께 흐른다).
        해석 카피 0: 조명 이모지와 숫자만 놓는다.
      */}
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{dayLabel} · 전원 콜 접수</span>
          <h1 className="text-lg font-semibold">
            콜 {receiving.index + 1} / {receiving.queue.length}
          </h1>
        </div>
        <span className="flex items-center gap-2 font-mono text-sm tabular-nums text-zinc-400">
          {formatClock(atMin)}
          <span aria-hidden>{scene.lighting === "NIGHT" ? "🌙" : scene.lighting === "DUSK" ? "🌆" : "☀"}</span>
        </span>
      </header>

      {/* 맵이 주인공. 재생 중 아무 데나 누르면 즉시 건너뛴다(반복 플레이 필수). */}
      <div
        onClick={sweeping ? skip : undefined}
        className={sweeping ? "cursor-pointer" : undefined}
        role="presentation"
      >
        <HospitalMap scene={scene} />
      </div>

      <MorningPaper news={news} />

      {prevLine && (
        <p className="text-xs text-zinc-600">
          직전 · {prevCall!.label} → {prevLine}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
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

        {/*
          명단을 남기는 이유: 아바타는 진료 중/자유만 보이고 피로도 막대는 못 보인다.
          맵이 순간 상태를, 명단이 누적을 담당한다.
        */}
        <div className="flex w-full flex-col gap-4 sm:w-72 sm:shrink-0">
          <DoctorRoster roster={receiving.hospital.roster ?? []} receiving={receiving} fatigue={fatigue} />
          <CheerfulLedger receiving={receiving} />
        </div>
      </div>
    </main>
  );
}
```

> 바뀐 것은 셋뿐이다: ① `max-w-2xl` → `max-w-5xl`(맵이 들어갈 폭) ② 헤더 시각이 `receiving.clockMin` → `atMin`(+ 조명 글리프) ③ `<HospitalMap>` 블록 삽입. 나머지 마크업은 원본 그대로다.

- [ ] **Step 5: 타입 게이트 + 전체 테스트 + 빌드**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: 타입 0, 테스트 전부 PASS, 빌드 성공

- [ ] **Step 6: 커밋**

`.commit-msg-tmp`(UTF-8):

```
feat: RECEIVING 맵 주도 레이아웃 + 콜 사이 빨리감기 (T-063)

useFastForwardClock이 atMin 하나만 내놓고, 그걸 deriveMapScene과 HUD 시계가
공유한다. 구간 양끝은 상태에서 파생한다 — receiving.clockMin이 decide가
전진시킨 '직전 콜 시각'이라 ref가 필요 없다. 게임 상태를 안 건드리므로
재생이 끊기든 스킵되든 판정은 동일하다.

기존 4개 패널(콜 카드·수가 내역·의료진 명단·오늘 장부)은 호출 위치만 바뀐다.
명단을 남기는 이유는 아바타가 피로도 막대를 못 보이기 때문이다 —
맵이 순간을, 명단이 누적을 담당한다.

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```bash
git add src/components/useFastForwardClock.ts src/components/ReceivingPhase.tsx
```

```bash
git commit -F .commit-msg-tmp && rm .commit-msg-tmp
```

---

## Task 5: 브라우저 실측 + 문서 갱신

컴포넌트는 유닛테스트를 안 하므로(프로젝트 관례) **여기가 유일한 검증 관문**이다. 스펙 §8의 브라우저 항목을 하나씩 확인한다.

**Files:**
- Modify: `plan.md` · `claude-docs/changeLog.md`
- (조건부) Create: `claude-docs/troubleshooting/T-0NN.md`

- [ ] **Step 1: 개발 서버 실행**

`.claude/launch.json`이 없으면 아래 내용으로 생성한 뒤 preview_start로 띄운다:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "hospital-sim", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }
  ]
}
```

- [ ] **Step 2: 7일 완주 실측**

랜딩 → 개원(순환기 2명 + 미용 1명 정도) → 7일 완주하며 확인:

| 확인 항목 | 기대 |
|---|---|
| 방 개수 | 8칸, 안 뽑은 과도 빈 방으로 존재 |
| 방 순서 | 필수과 6개 먼저 → 미용·검진. 우측 명단 순서와 일치 |
| 콜 수용 시 | 담당 의사 아바타가 그 과 방으로 들어가고 침대 하나가 찬다 |
| 진료 종료 | 시각이 지나면 의사가 복도로 나오고 침대가 빈다 |
| 17:00 이후 | 화면이 어두워지고 HUD 글리프가 🌙로 바뀐다 |
| 1인 배후과 | 야간에 그 방 불이 꺼진다(2인 과는 켜져 있다) |
| 빨리감기 | 콜 사이에 아바타가 미끄러지듯 움직인다. 맵 클릭 시 즉시 종료 |
| 콘솔 | 에러 0 |

- [ ] **Step 3: 반응형 확인**

`resize_window`로 mobile(375×812) 확인 — 맵이 가로 스크롤을 만들지 않고 축소만 되는지. 데스크톱 우선이므로 축소 폴백이면 통과(정직한 천장).

- [ ] **Step 4: 발견된 문제 수정**

문제가 있으면 소스를 고치고 Step 2로 돌아간다. **1분 이상 원인 추적이 필요했던 문제는 `claude-docs/troubleshooting/T-0NN.md`를 신설한다** — frontmatter(`summary` + `tags: - type/troubleshooting`) + 4필드(증상/원인/해결/재발방지). T번호는 기존 최대 + 1.

> ⚠️ 이 스윕을 명시적으로 돈다: *"이번 브랜치에서 1분+ 근인 디버깅이 있었나 — 서브에이전트/리뷰어가 잡은 것 포함."* 프로젝트 CLAUDE.md가 기록한 실패 모드다(T-054 이후 8 PR 동안 트러블슈팅 0개).

- [ ] **Step 5: `plan.md` 체크박스 갱신**

해당 항목을 ✅로 바꾸고 하위 체크박스를 실제 구현에 맞춘다.

- [ ] **Step 6: `claude-docs/changeLog.md` 항목 추가**

맨 위에 `## 2026-07-23 · 병원 맵 — 의사를 숫자에서 아바타로` 한 항목. **PR 번호는 적지 않는다**(프로젝트 override — squash 머지 제목의 `(#N)`이 단일 출처). 의도·결과만, 코드 세부는 커밋에.

- [ ] **Step 7: 문서 태그 검사**

```bash
pwsh -File scripts/check-doc-tags.ps1 (git ls-files '*.md')
```

Expected: `TAGS-CHECK: OK` / `LINKS-CHECK: OK`

- [ ] **Step 8: 최종 게이트 + 커밋**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

`.commit-msg-tmp`(UTF-8):

```
docs: 병원 맵 브라우저 실측 + 작업 추적 3종 갱신 (T-063)

7일 완주로 확인: 빈 방 8칸, 수용 시 아바타 입실·침대 점유, 진료 종료 시
퇴실·퇴원, 17시 이후 조명 전환, 1인 배후과 야간 소등, 빨리감기 스킵.

Skills-used: none
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```bash
git add plan.md claude-docs/
```

```bash
git commit -F .commit-msg-tmp && rm .commit-msg-tmp
```

- [ ] **Step 9: PR 생성**

```bash
git push -u origin claude/zep-metaverse-platform-6b5842
```

PR 본문은 한국어로, 위 5개 태스크 요약 + 브라우저 실측 결과 표 + 정직한 천장(스펙 §7 표)을 담는다. **PR을 올린 뒤 머지 여부를 사용자에게 묻고 멈춘다.**

---

## 부록: 스펙 커버리지

| 스펙 절 | 태스크 |
|---|---|
| §3 `MapScene` 데이터 모델 | Task 1-C |
| §4.1 방(빈 방 포함·정렬) | Task 1-B, 1-C |
| §4.2 의사 위치 | Task 1-C |
| §4.3 병상 환자(`busyUntil` 파생·정원 초과·거절 제외) | Task 1-C |
| §4.4 / §5.2 조명 3단 + `NIGHT_START_MIN` 재사용 | Task 1-A |
| §5.1 빨리감기(캡·스킵·reduced-motion) | Task 1-D, Task 4 |
| §5.3 야간 소등 | Task 1-C |
| §6 맵 주도 레이아웃 · 4패널 재사용 | Task 4 |
| §7 0 침습 · 회귀 가드 | Global Constraints, Task 1 Step 18 |
| §8 TDD 불변식 | Task 1 (27 tests) |
| §8 브라우저 실측 | Task 5 |
| §9 자체 제작 에셋 | Task 2 |
| §10 파일 영향 | Task 1~4 |
