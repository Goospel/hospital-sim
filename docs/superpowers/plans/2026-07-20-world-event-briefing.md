---
tags:
  - type/plan
---

# 세계 이벤트 공문 브리핑 + 수가·재정 덱(E1–E4) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 각 세계 이벤트에 실제 정책 도구로 채운 공문 브리핑을 붙이고, 상쇄 방식이 다른 수가·재정 이벤트 덱(E1–E4)으로 반복을 없앤다.

**Architecture:** `WorldEvent`에 편집 텍스트 `briefing: string[]` 한 필드를 더한다(기계 판정 `effects`와 별개 층). 개원 이벤트 상쇄를 산부→검진으로 교체하고, 순환 카탈로그를 E2·E3·E4로 재구성한다. `WorldEventCard`가 브리핑을 고시 리스트로 렌더하고 용어집에 넘긴다.

**Tech Stack:** TypeScript · React 19 · Next.js 16 · vitest 4 · Tailwind 4.

**Spec:** [2026-07-20-world-event-briefing-design.md](../specs/2026-07-20-world-event-briefing-design.md)

## Global Constraints

- **판정=코드 (헌법)**: 이벤트는 `departments`(profit/hireCost)만 만진다. `briefing`은 `string[]`이라 `adjudicate`·`backupCare`·생사 판정 경로에 절대 닿지 않는다.
- **fact-grounding**: `briefing`에 **게임의 각색 억 손익을 쓰지 않는다**(테스트로 잠금 — 어떤 줄에도 `억` 토큰 없음). 구체 수치는 실제 제도 도구(가산 %, 상대가치점수 %, 정책수가 정액, 수련보조수당 만원)만.
- **show-don't-tell**: `briefing`은 조치·재원 사실만. "개혁은 무의미", "미용은 안전" 같은 해석/편집 금지.
- **수가는 행위에 붙지 과에 안 붙는다**: "중증·응급 최종치료 가산", "흉부외과 처치·수술 가산"처럼 행위/과목 조건 표현. "순환기내과 수가 인상" 금지.
- **재정중립(E1)**: 패키지 profit 델타 합 = 0(순환기 +6 + 검진 −6), 미용 불변.
- **게이트**: vitest 전체 green + `npx tsc --noEmit` 0 (vitest는 타입체크 안 함 — 별도 게이트 필수).
- 컴포넌트는 유닛테스트하지 않는다(프로젝트 관례) — Task 3은 브라우저 검증.

---

## File Structure

- `src/game/world.ts` — `WorldEvent.briefing` 필드 + 이벤트 덱 재구성(E1 오프셋·E2·E3·E4). 핵심 데이터 층.
- `src/game/world.test.ts` — OPENING 블록 갱신 + 카탈로그 재구성 여파 + 신규 briefing 단언.
- `src/game/session.test.ts` — 개원 오프셋 변경(산부→검진)으로 깨지는 2개 항목 갱신.
- `src/game/glossary.ts` — 브리핑 신규 용어 3항목(가산·상대가치점수·과보상).
- `src/game/glossary.test.ts` — 3항목 감지 테스트.
- `src/components/WorldEventCard.tsx` — 브리핑 `<ul>` 렌더 + 용어집에 브리핑 전달.

---

### Task 1: `WorldEvent.briefing` 필드 + 이벤트 덱 재구성

**Files:**
- Modify: `src/game/world.ts` (interface + `OPENING_EVENT` + `EVENT_CATALOG`)
- Test: `src/game/world.test.ts` (OPENING 블록·카탈로그·신규 briefing)
- Test: `src/game/session.test.ts:322`, `:345` (개원 오프셋 변경)

**Interfaces:**
- Produces: `WorldEvent.briefing: string[]`(필수 필드). `OPENING_EVENT` effects = `CARDIOLOGY +6` / `CHECKUP −6`. `EVENT_CATALOG` = `[OB_PEDS_POLICY_FEE(improve), SURGERY_ADD_ON(improve), LITIGATION_CHILL(worsen)]`.
- Consumes: 기존 `DeptEffect`·`applyEvent`·`selectEvent`(무변경).

- [ ] **Step 1: world.test.ts — OPENING 블록을 검진 오프셋으로 갱신(실패 확인용)**

기존 `describe('OPENING_EVENT …')` 블록(L73-100)을 아래로 교체:

```ts
describe('OPENING_EVENT — 1주차 개원: 필수의료 정책수가 개편(검사 재분배)', () => {
  it('다효과 패키지다 — 순환기 +6 / 검진 −6 (검사 과보상을 배후진료로)', () => {
    expect(OPENING_EVENT.effects).toHaveLength(2)
    const cardio = OPENING_EVENT.effects.find((e) => e.dept === 'CARDIOLOGY')!
    const checkup = OPENING_EVENT.effects.find((e) => e.dept === 'CHECKUP')!
    expect(cardio).toMatchObject({ field: 'profitPerDoctorBillions', delta: 6 })
    expect(checkup).toMatchObject({ field: 'profitPerDoctorBillions', delta: -6 })
  })

  it('[재정중립] 패키지 profit 델타 합이 0이다 — 올린 만큼 검사에서 상쇄', () => {
    const sum = OPENING_EVENT.effects
      .filter((e) => e.field === 'profitPerDoctorBillions')
      .reduce((n, e) => n + e.delta, 0)
    expect(sum).toBe(0)
  })

  it('적용하면 순환기 −6·검진 +34, 산부(−10)·미용(+70)은 불변 — 비급여 무풍지대', () => {
    const world = applyEvent(initWorld(), OPENING_EVENT)
    expect(deptProfit(world.departments, 'CARDIOLOGY')).toBe(-6) // -12 + 6
    expect(deptProfit(world.departments, 'CHECKUP')).toBe(34) // 40 - 6
    expect(deptProfit(world.departments, 'OBSTETRICS')).toBe(-10) // 손 안 댐
    expect(deptProfit(world.departments, 'AESTHETICS')).toBe(70) // 비급여 불변
  })

  it('명목상 개선으로 고지된다 (direction=improve) — 아이러니는 숫자에서', () => {
    expect(OPENING_EVENT.direction).toBe('improve')
  })
})
```

- [ ] **Step 2: world.test.ts — 카탈로그 재구성 여파 + 신규 briefing 단언 추가**

기존 `describe('world — 외생 이벤트 …')` 안에서, `selectEvent(0)`가 순환기를 가정하는 항목(L23-27, L52-57)을 아래로 교체하고, 파일 하단에 briefing describe를 추가:

```ts
// (교체) L23-27 — selectEvent(0)은 이제 분만·소아 정책수가(개선)
it('개선 이벤트(분만·소아 정책수가)는 산부 손익을 델타만큼 올린다', () => {
  const before = deptProfit(initWorld().departments, 'OBSTETRICS') // -10
  const world = applyEvent(initWorld(), selectEvent(0))
  expect(deptProfit(world.departments, 'OBSTETRICS')).toBe(before + 6) // -4
})

// (교체) L52-57 — 개선을 적용해도 미용이 그 개선 과보다 유리
it('개선 이벤트를 적용해도 미용이 여전히 유리하다 (D형 비대칭)', () => {
  const world = applyEvent(initWorld(), selectEvent(0))
  expect(deptProfit(world.departments, 'AESTHETICS')).toBeGreaterThan(
    deptProfit(world.departments, 'OBSTETRICS'),
  )
})
```

```ts
// (신규 describe) — 공문 브리핑 계약
describe('세계 이벤트 브리핑 — 실제 정책 도구(각색 억 손익 금지)', () => {
  const all = [OPENING_EVENT, ...EVENT_CATALOG]

  it('모든 이벤트가 비어 있지 않은 briefing을 갖는다', () => {
    for (const e of all) {
      expect(Array.isArray(e.briefing)).toBe(true)
      expect(e.briefing.length).toBeGreaterThan(0)
      for (const line of e.briefing) expect(line.trim().length).toBeGreaterThan(0)
    }
  })

  it('briefing 어느 줄에도 각색 억 손익 토큰이 없다 (fact-grounding 잠금)', () => {
    for (const e of all) for (const line of e.briefing) expect(line).not.toMatch(/억/)
  })

  it('E3(흉부·외과 가산)는 흉부 델타 > 외과 델타 — 실제 가산율 대소(100% > 30%)', () => {
    const e3 = EVENT_CATALOG.find((e) => e.id === 'SURGERY_ADD_ON')!
    const thoracic = e3.effects.find((x) => x.dept === 'THORACIC_SURGERY')!.delta
    const general = e3.effects.find((x) => x.dept === 'GENERAL_SURGERY')!.delta
    expect(thoracic).toBeGreaterThan(general)
  })
})
```

> `world.test.ts` 상단 import에 `EVENT_CATALOG`가 이미 있다(L2). 없으면 추가.

- [ ] **Step 3: 테스트 실행 → 실패(Red) 확인**

Run: `npx vitest run src/game/world.test.ts`
Expected: OPENING·briefing 신규 단언이 FAIL(현 `world.ts`는 `briefing` 없음·산부 오프셋).

- [ ] **Step 4: world.ts — interface + 덱 교체**

`WorldEvent` 인터페이스에 `briefing` 추가:

```ts
export interface WorldEvent {
  id: string
  headline: string
  direction: 'improve' | 'worsen'
  effects: DeptEffect[]
  /** 병원장이 읽는 공문 2–3줄 — 실제 정책 도구(가산·정책수가·상대가치점수)만. 각색 억 손익 금지. */
  briefing: string[]
}
```

`EVENT_CATALOG`를 아래로 교체(E2·E3·E4):

```ts
export const EVENT_CATALOG: WorldEvent[] = [
  {
    id: 'OB_PEDS_POLICY_FEE',
    headline: '보건당국, 분만·소아 정책수가 신설 — 고위험 분만 보상 대폭 확대',
    direction: 'improve',
    effects: [{ dept: 'OBSTETRICS', field: 'profitPerDoctorBillions', delta: 6 }],
    briefing: [
      '분만 안전정책수가 신설 (분만 건당 정액 가산)',
      '고위험 분만 가산 30% → 최대 200%',
      '신규 재정 투입 — 타 항목 조정 없음',
    ],
  },
  {
    id: 'SURGERY_ADD_ON',
    headline: '보건당국, 흉부외과·외과 수술 가산 확대 시행',
    direction: 'improve',
    effects: [
      { dept: 'THORACIC_SURGERY', field: 'profitPerDoctorBillions', delta: 6 },
      { dept: 'GENERAL_SURGERY', field: 'profitPerDoctorBillions', delta: 3 },
    ],
    briefing: [
      '흉부외과 처치·수술 가산 100% (201개 행위)',
      '외과 처치·수술 가산 30% (322개 행위)',
      '전공의 수련보조수당 병행 (흉부외과 월 150만원 등)',
    ],
  },
  {
    id: 'LITIGATION_CHILL',
    headline: '의료분쟁 고액 배상 판결 잇따라 — 필수과 인력 확보 비용 상승',
    direction: 'worsen',
    effects: [{ dept: 'CARDIOLOGY', field: 'hireCostBillions', delta: 6 }],
    briefing: [
      '고액 배상 판결 잇따라 — 필수과 전문의 채용 시장 경색',
      '배후진료 인력 확보 비용 상승',
    ],
  },
]
```

`OPENING_EVENT`를 검진 오프셋 + 브리핑으로 교체(주석도 갱신):

```ts
export const OPENING_EVENT: WorldEvent = {
  id: 'FEE_REFORM_PACKAGE',
  headline: '보건당국, 필수의료 정책수가 개편 의결 — 중증·응급 최종치료 보상 상향',
  direction: 'improve', // 명목상 개선으로 고지 — 아이러니는 플레이어가 숫자에서 발견(show-don't-tell)
  effects: [
    { dept: 'CARDIOLOGY', field: 'profitPerDoctorBillions', delta: 6 }, // 개혁 본체: 순환기 −12 → −6
    { dept: 'CHECKUP', field: 'profitPerDoctorBillions', delta: -6 }, // 재원: 검사 과보상 인하(검진 +40 → +34)
  ],
  briefing: [
    '중증·응급 최종치료 가산 50% → 100% (심장중재술 등 배후진료 대상)',
    '재원: 검체검사 과보상 조정 (상대가치점수 190% → 150%)',
  ],
}
```

> `world.ts` 상단 주석의 "재정중립: 순환기 수가를 올린 만큼 급여 풀 안에서 산부가 내려간다"를 "…만큼 검사(검진) 과보상에서 상쇄한다 — 급여 안에서 재분배해도 비급여(미용)를 못 이긴다"로 갱신.

- [ ] **Step 5: session.test.ts — 개원 오프셋 변경 반영**

L322-326을 교체:

```ts
it('enterWorldEvent: 개원 패키지는 산부를 안 건드리고 검사(검진)에서 상쇄한다 (검진 +34)', () => {
  const s = enterWorldEvent(startSession())
  const checkup = s.world!.departments.find((d) => d.key === 'CHECKUP')!
  const ob = s.world!.departments.find((d) => d.key === 'OBSTETRICS')!
  expect(checkup.profitPerDoctorBillions).toBe(34) // 40 - 6 (재원 상쇄)
  expect(ob.profitPerDoctorBillions).toBe(-10) // 불변
})
```

L345-349를 교체(산부→검진 장부 반영):

```ts
it('completeSetup: 개원 패키지 세계에서 검진을 뽑으면 economics에 +34가 반영된다', () => {
  const world = applyEvent(initWorld(), OPENING_EVENT) // 검진 +34
  const s = completeSetup({ hospitalName: '검진병원', doctors: { CHECKUP: 1 } }, world)
  const seg = s.hospital!.economics!.segments.find((x) => x.label === '건강검진')!
  expect(seg.profitBillions).toBe(34) // 검사 과보상 인하가 장부에 반영(34 * 1)
})
```

> L314-320·L341·L353-355(순환기 −6 계열)은 순환기 +6이 그대로라 **무변경**. `건강검진` 라벨은 `DEPARTMENTS`의 `CHECKUP.label`([setup.ts:71](../../../src/game/setup.ts))과 일치.

- [ ] **Step 6: 전체 테스트 + 타입 게이트 → Green 확인**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS(전체) · tsc 0 errors.

- [ ] **Step 7: 커밋** (T-026 — `.commit-msg-tmp` UTF-8 + `git commit -F`, AI-usage 트레일러 포함)

```
feat: 세계 이벤트에 공문 브리핑 필드 + 수가·재정 덱 E1–E4 — 개원 상쇄를 검사 인하로
```

---

### Task 2: 용어집 3항목 추가 (가산·상대가치점수·과보상)

**Files:**
- Modify: `src/game/glossary.ts` (`GLOSSARY` 배열)
- Test: `src/game/glossary.test.ts`

**Interfaces:**
- Consumes: 기존 `GLOSSARY`·`termsInText`(무변경). 마스킹 매칭이 `상대가치점수 ⊃ 수가` 류 오탐을 이미 처리.

- [ ] **Step 1: glossary.test.ts — 신규 용어 감지 테스트(Red)**

기존 테스트 파일에 추가:

```ts
it('브리핑 용어(가산·상대가치점수·과보상)를 감지한다', () => {
  const text = '중증·응급 최종치료 가산 50% → 100%. 재원: 검체검사 과보상 조정(상대가치점수 190% → 150%)'
  const terms = termsInText(text).map((e) => e.term)
  expect(terms).toContain('가산')
  expect(terms).toContain('상대가치점수')
  expect(terms).toContain('과보상')
})
```

- [ ] **Step 2: 실행 → 실패(Red) 확인**

Run: `npx vitest run src/game/glossary.test.ts`
Expected: FAIL(항목 미존재).

- [ ] **Step 3: glossary.ts — 3항목 추가**

`GLOSSARY` 배열에 추가(정의만, 문제·게임효과 없음):

```ts
{
  term: '가산',
  match: ['가산'],
  def: '기본 수가에 특정 조건(과목·시설·중증도)을 만족할 때 얹어 주는 추가 보상.',
},
{
  term: '상대가치점수',
  match: ['상대가치점수', '상대가치'],
  def: '의료 행위마다 매긴 상대적 가치 점수 — 수가 계산의 뼈대(점수 × 환산지수 × 가산율).',
},
{
  term: '과보상',
  match: ['과보상'],
  def: '원가 대비 수가가 높게 책정된 상태(검체·영상 등) — 재분배 개편의 인하 대상.',
},
```

> 마스킹 매칭은 길이 내림차순 처리라 `상대가치점수`가 `수가`보다 먼저 구간을 claim한다(오탐 방지). `가산`은 `종별가산율` 등과 겹칠 수 있으나 브리핑 텍스트엔 단독 "가산"만 등장.

- [ ] **Step 4: 실행 → Green 확인**

Run: `npx vitest run src/game/glossary.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋** (T-026)

```
feat: 용어집에 가산·상대가치점수·과보상 추가 — 공문 브리핑 신규 전문용어 풀이
```

---

### Task 3: WorldEventCard 브리핑 렌더 + 용어집 연동

**Files:**
- Modify: `src/components/WorldEventCard.tsx`

**Interfaces:**
- Consumes: `event.briefing`(Task 1)·`TermGlossary`(기존, `text` prop)·glossary 3항목(Task 2).

- [ ] **Step 1: 브리핑 리스트 렌더 + 용어집에 브리핑 전달**

`<TermGlossary text={event.headline} />` 위에 브리핑 섹션을 넣고, 용어집 텍스트에 브리핑을 합친다:

```tsx
<header className="flex flex-col gap-2">
  <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{badge}</span>
  <h1 className="text-xl font-semibold leading-snug">{event.headline}</h1>
</header>

{event.briefing.length > 0 && (
  <ul className="flex flex-col gap-2 border-l-2 border-zinc-800 pl-4">
    {event.briefing.map((line, i) => (
      <li key={i} className="text-sm leading-relaxed text-zinc-300">
        {line}
      </li>
    ))}
  </ul>
)}

<TermGlossary text={[event.headline, ...event.briefing].join(" ")} />
```

> `briefing`이 빈 배열이면 섹션 생략(하위호환). 억 손익 미노출은 Task 1 데이터가 이미 보장(테스트 잠금) — 컴포넌트는 받은 문자열을 그대로 렌더할 뿐.

- [ ] **Step 2: 타입 게이트**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 브라우저 검증(유닛테스트 없음 — 프로젝트 관례)**

`.claude/launch.json`의 dev 서버로 preview → 랜딩 → 이벤트 화면에서 확인:
- 헤드라인 아래 브리핑 2줄(중증·응급 가산 50→100%, 검체검사 과보상 조정)이 리스트로 뜬다.
- "용어 풀이" 펼치면 가산·상대가치점수·과보상·정책수가 등이 풀이된다.
- 콘솔 에러 0(`read_console_messages`).
- 스크린샷으로 최종 확인(브라우저 pane 타임아웃 시 `read_page` 접근성 트리로 대체 — T-053/T-054).

- [ ] **Step 4: 커밋** (T-026)

```
feat: 이벤트 화면에 공문 브리핑 렌더 + 용어집 연동 — 병원장이 읽는 고시 질감
```

---

## Self-Review 체크

- **스펙 커버리지**: briefing 필드(§2)→T1 · E1 오프셋(§3)→T1 · E2·E3·E4(§3)→T1 · 렌더(§4)→T3 · 용어집(§4)→T2 · 테스트(§6)→T1·T2 · 톤 가드레일(§7)→T1 억토큰 잠금. 전 항목 태스크 대응.
- **타입 정합**: `briefing: string[]` 필수 → 모든 이벤트(OPENING+카탈로그 3)가 T1에서 동시 부여(컴파일 보장). `WorldEvent` 소비처(session.ts·WorldEventCard)는 필드 추가라 기존 코드 무변경으로 컴파일.
- **플레이스홀더 없음**: 모든 코드·테스트 블록 실체 포함.
