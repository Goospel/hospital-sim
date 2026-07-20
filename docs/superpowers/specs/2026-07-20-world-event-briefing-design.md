---
tags:
  - type/spec
---

# 설계 스펙 — 세계 이벤트 공문 브리핑 + 수가·재정 이벤트 덱(E1–E4)

> **상태**: 확정 설계 (2026-07-20, brainstorming). 다음 = writing-plans로 구현 계획.
> **맥락**: [2026-07-18-world-event-slice-design.md](2026-07-18-world-event-slice-design.md)(외생 이벤트 코어)·[2026-07-19-fiscal-neutral-opening-event-design.md](2026-07-19-fiscal-neutral-opening-event-design.md)(재정중립 개원 이벤트) 위에, **이벤트가 무엇을 어떻게 바꿨는지**를 병원장(경영자 vantage)이 실제 공문의 질감으로 읽게 한다.
> **리서치 근거**: [fee-schedule-and-subsidies.md](../../research/fee-schedule-and-subsidies.md) §2·§4·§6(가산·정책수가·재정중립 실측) · [current-korea-change-events.md](../../research/current-korea-change-events.md)(이벤트 덱 재료) · [player-is-multivantage 메모] 경영자 vantage.

---

## 1. 목적 & 스코프

**문제**: 세계 이벤트가 실제로 경제를 바꾸는데(개원 이벤트: 순환기 손익 개선), 그 변화가 **플레이어가 행동할 수 있는 모든 지점에서 안 보인다** — 이벤트 화면은 얼버무린 헤드라인 한 줄뿐이고([WorldEventCard.tsx](../../../src/components/WorldEventCard.tsx)), 개원 위저드는 손익을 **의도적으로 감춘다**([SetupWizard.tsx](../../../src/components/SetupWizard.tsx)). 병원장은 국가 공문을 ↑/↓로 받지 않는다 — 어떤 가산이 몇 %, 재원은 어디서, 무슨 행위 대상인지 **구체적 고시**로 받는다. 지금은 그 역할감이 증발한다.

**목적**: 각 세계 이벤트에 **실제 정책 도구로 채운 공문 브리핑**(조치 내용 + 재원/상쇄)을 붙여, 병원장이 매주 **결이 다른 구체적 고시**를 읽게 한다. 그리고 그 상쇄 방식이 이벤트마다 달라(검사 인하 / 순증 / 채용비 상승) "국가가 늘 뭘 깎아서 준다"는 반복을 없앤다.

**확정 결정 (brainstorming 2026-07-20)**:

| 축 | 결정 | 근거 |
|---|---|---|
| 구체성의 출처 | **실제 정책 도구**(가산율·정책수가·재원·상대가치점수)로 채운다 — 게임의 **각색 억 손익은 브리핑에 안 쓴다** | 억 델타(+6/−6)를 노출하면 현실에 없는 1:1 상쇄 정밀도를 주장 = fact-grounding 위반([fee §10] "계산으로 만들어내지 마라"). 실제 제도 도구는 역할감 + 사실성 둘 다 만족 |
| 개원 이벤트 상쇄 | **검사 과보상 인하 → 배후진료**(검진 −6 / 순환기 +6) | 2026 실제 개편의 정본([fee §2.2] 검체 190%→150%로 필수의료 재원). "과보상 검사를 필수로 돌려도 비급여(미용)는 못 건드린다"가 급여↔비급여 대비로 선명 |
| 덱 다양성 | **E1–E4 수가·재정 축** — 상쇄가 검사인하/순증/채용비로 갈림 | 반복 해소. 병원장이 매주 다른 결의 공문을 받는다 |
| 억 손익 노출 | 브리핑은 **조치·재원만**, 손익 숫자는 여전히 **장부에서** 겪는다 | show-don't-tell(설정의 손익 감춤)·정답-퍼즐 방지 유지. 공문이 P&L을 미리 계산해 주지 않음 |
| 시행 시차 | **이번엔 빼거나 "금주 시행"으로 정직하게** | 진짜 지연 발동(효과가 다음 주 발동)은 세션/월드 모델 변경 = 별도 슬라이스. 즉시 적용인데 "2주 후"라 쓰면 위저드 값과 불일치(거짓) |

**스코프 밖 (⏸ 다음 슬라이스)**: 규제 축(당직 의무화 → 수용능력↓)·여론 축(소송 리스크 변동) — **새 월드 노브**(capacity/lawsuit) 필요, 현 모델은 `departments` 채용 경제뿐([world.ts:5](../../../src/game/world.ts)). / 매주 재채용·경제 재계산(2주차+ 이벤트 실효화) / 진짜 시행 시차 발동 / 양방향 로테이션(개선 뒤 D형 상쇄 후속 페어링).

---

## 2. 데이터 모델 — `WorldEvent`에 `briefing` 한 필드

```ts
export interface WorldEvent {
  id: string
  headline: string
  direction: 'improve' | 'worsen'
  effects: DeptEffect[]
  briefing: string[]   // ← 신설: 실제 정책 도구로 채운 공문 2–3줄(조치·재원). 각색 억 손익 금지.
}
```

- `briefing`은 **이벤트별로 저작하는 편집 텍스트**다 — `effects`(기계 판정)와 별개 층. effects는 여전히 profit/hireCost만 만지고, briefing은 화면에만 쓴다.
- **왜 파생 아니라 저작인가**: 브리핑의 구체성(가산 50%→100%, 검체 190%→150%, 대상 행위 수)은 `DeptEffect`(dept·field·delta)에 없는 **실제 제도 디테일**이다. 이걸 effects에 우겨넣으면 기계 모델이 표현 데이터로 오염된다. 이벤트가 4개(저볼륨)라 저작이 맞다 — drift는 테스트가 아니라 저작 시점 대조로 관리(각 이벤트의 briefing 존재·effects 방향 일치를 테스트가 잠근다).

---

## 3. 이벤트 덱 (`world.ts`)

각 이벤트 = 실제 정책. 금액(억 델타)은 각색, **부호·대소·제도 형태만 근거**.

### E1 — 개원 이벤트 (`OPENING_EVENT`): 필수의료 정책수가 개편 (검사 재분배)

```ts
export const OPENING_EVENT: WorldEvent = {
  id: 'FEE_REFORM_PACKAGE',
  headline: '보건당국, 필수의료 정책수가 개편 의결 — 중증·응급 최종치료 보상 상향',
  direction: 'improve',
  effects: [
    { dept: 'CARDIOLOGY', field: 'profitPerDoctorBillions', delta: +6 }, // 순환기 −12 → −6 (개혁 본체)
    { dept: 'CHECKUP',    field: 'profitPerDoctorBillions', delta: -6 }, // 검진(검사 과보상) +40 → +34 (재원)
  ],
  briefing: [
    '중증·응급 최종치료 가산 50% → 100% 상향 (심장중재술 등 배후진료 대상)',
    '재원: 검체검사 과보상 조정 (상대가치점수 190% → 150%)',
  ],
}
```

- **오프셋을 산부(현행) → 검진으로 교체**: 실제 2026 개편은 **검체·영상 과보상 인하로 필수의료 재원 마련**([fee §2.2]). 게임의 `CHECKUP`(건강검진, 흑자 비필수과)이 그 검사 층의 각색 매핑. 재정중립 = 패키지 profit 델타 합 0(+6−6), **미용(비급여)은 무풍지대**.
- **왜 검진이 더 나은가**: 산부↓(현행)는 "필수과 살리려 다른 필수과를 죽인다"라 [fee §6] 총점 고정으로 근거는 있으나, 실제 flagship 상쇄 대상은 **검사**다. 검진(급여 흑자)을 깎고 미용(비급여 흑자)은 못 깎는 대비가 **급여↔비급여**를 더 선명히 보여준다.

### E2–E4 — 순환 카탈로그 (`EVENT_CATALOG`, 2주차+)

```ts
export const EVENT_CATALOG: WorldEvent[] = [
  { // E2 — 분만·소아 정책수가 신설 (순증, 상쇄 없음)
    id: 'OB_PEDS_POLICY_FEE',
    headline: '보건당국, 분만·소아 정책수가 신설 — 고위험 분만 보상 대폭 확대',
    direction: 'improve',
    effects: [{ dept: 'OBSTETRICS', field: 'profitPerDoctorBillions', delta: +6 }],
    briefing: [
      '분만 안전정책수가 신설 (분만 건당 정액 가산)',
      '고위험 분만 가산 30% → 최대 200%',
      '신규 재정 투입 — 타 항목 조정 없음',
    ],
  },
  { // E3 — 흉부외과·외과 수술 가산 (순증). 흉부(100%) > 외과(30%) 대소 반영
    id: 'SURGERY_ADD_ON',
    headline: '보건당국, 흉부외과·외과 수술 가산 확대 시행',
    direction: 'improve',
    effects: [
      { dept: 'THORACIC_SURGERY', field: 'profitPerDoctorBillions', delta: +6 },
      { dept: 'GENERAL_SURGERY',  field: 'profitPerDoctorBillions', delta: +3 },
    ],
    briefing: [
      '흉부외과 처치·수술 가산 100% (201개 행위)',
      '외과 처치·수술 가산 30% (322개 행위)',
      '전공의 수련보조수당 병행 (흉부외과 월 150만원 등)',
    ],
  },
  { // E4 — 의료분쟁 배상 판결 (악화, 채용비↑). 여론/시장 이벤트 — 고시 아닌 속보 결
    id: 'LITIGATION_CHILL',
    headline: '의료분쟁 고액 배상 판결 잇따라 — 필수과 인력 확보 비용 상승',
    direction: 'worsen',
    effects: [{ dept: 'CARDIOLOGY', field: 'hireCostBillions', delta: +6 }],
    briefing: [
      '고액 배상 판결 잇따라 — 필수과 전문의 채용 시장 경색',
      '배후진료 인력 확보 비용 상승',
    ],
  },
]
```

- 상쇄 방식이 갈린다: E1 **검사 인하**(재정중립) / E2·E3 **순증**(안 깎음) / E4 **채용비 상승**(악화). → 반복 없음.
- `direction`: E2·E3 improve, E4 worsen → 카탈로그 양방향 유지(기존 `world.test.ts` 불변식 통과).
- E2·E3·E4 텍스처도 다름: E2·E3는 **정부 고시**, E4는 **시장 속보**(배상 판결) — 병원장이 받는 문서 종류 자체가 다양.

---

## 4. 렌더링 (`WorldEventCard.tsx` + 용어집)

브리핑을 헤드라인과 용어집 사이에 **고시 항목 리스트**로 렌더:

```
[속보 · 의료계]                          ← 기존 배지(2주차+ "N주차 · 속보")
보건당국, 필수의료 정책수가 개편 의결      ← 기존 헤드라인
 — 중증·응급 최종치료 보상 상향

• 중증·응급 최종치료 가산 50% → 100%      ← 신설: briefing[] 항목들
   (심장중재술 등 배후진료 대상)
• 재원: 검체검사 과보상 조정
   (상대가치점수 190% → 150%)

[용어 풀이 ▾]                             ← 기존 TermGlossary(opt-in)
[병원 설립으로]                           ← 기존 CTA
```

- `event.briefing`을 `<ul>`로 렌더(빈 배열이면 섹션 생략 — 하위호환).
- **용어집 확장**: `TermGlossary`에 넘기는 텍스트를 `headline` → `[headline, ...briefing].join(' ')`으로 바꿔, 브리핑의 신규 전문용어(가산·상대가치점수·과보상)도 opt-in 풀이 대상이 되게 한다.
- **[glossary.ts](../../../src/game/glossary.ts) 항목 추가**(정의만, 문제·게임효과 없음 — 기존 규칙):
  - `가산`: '기본 수가에 특정 조건(과목·시설·중증도)을 만족할 때 얹어 주는 추가 보상.'
  - `상대가치점수`: '의료 행위마다 매긴 상대적 가치 점수 — 수가 계산의 뼈대(점수 × 환산지수 × 가산율).'
  - `과보상`: '원가 대비 수가가 높게 책정된 상태(검체·영상 등) — 재분배 개편의 인하 대상.'

---

## 5. 코드 접점 (최소 침습 · 판정 불변)

| 파일 | 변경 | 판정(`adjudicate`) 영향 |
|---|---|---|
| `world.ts` | `WorldEvent`에 `briefing` 필드 · E1 오프셋 CHECKUP · E2·E3 신설 · E4(LITIGATION) 브리핑 | 0 (헌법: `DeptEffect.field` profit/hireCost 타입 제한) |
| `glossary.ts` | 항목 3개 추가 | 0 |
| `WorldEventCard.tsx` | briefing `<ul>` 렌더 + 용어집에 briefing 전달 | 0 |
| `session.ts` | **무변경** (`enterWorldEvent`은 이미 `OPENING_EVENT` 적용) | 0 |

**헌법**: 이벤트는 `departments`(채용 경제)만 만지고 `adjudicate`·`backupCare`·생사 판정은 한 줄도 안 건드린다. `briefing`은 string[]이라 판정 경로에 닿지 않는다.

---

## 6. 테스트 (TDD Red → Green)

**`world.test.ts` — 수정(오프셋 변경으로 깨지는 기존 항목)**:
- (L74-80) OPENING effects: `순환기 +6 / 산부 −6` → `순환기 +6 / 검진(CHECKUP) −6`.
- (L82-88) **재정중립 불변식 재정의**: "essential profit 합=0"(현) → **패키지 전체 profit 델타 합 = 0**(+6 −6) **AND 미용 불변**. 상쇄 대상이 비필수(검사)로 바뀌었으므로 essential 합 기준은 폐기.
- (L90-95) applyEvent 결과: `순환기 −6 / 검진 +34 / 산부 −10(불변) / 미용 70(불변)`.

**`world.test.ts` — 신설**:
- 카탈로그의 모든 이벤트(E1–E4)가 **비어 있지 않은 `briefing`**을 갖는다.
- 각 이벤트 `briefing`에 **각색 억 금액 토큰이 없다**(예: `/-?\d+억/` 미포함) — fact-grounding 잠금.
- E2 순증(단일 improve 효과)·E3 다효과(흉부 > 외과 대소: `THORACIC delta > GENERAL_SURGERY delta`)·E4 worsen(hireCost) 각 데이터 형태.
- 카탈로그 양방향 유지(improve·worsen 둘 다) — 기존 L59-62 통과.

**`world.test.ts` — 갱신(카탈로그 재구성 여파)**:
- (L23-27) `selectEvent(0)`가 순환기 profit↑ → **E2(산부 profit↑)**로 재서술.
- (L52-57) `selectEvent(0)` 적용 후 미용 > (해당 이벤트가 올린 과) 로 재서술.
- (L64-67) `selectEvent(0).direction === 'improve'` 유지(E2 improve).

**`session.test.ts` — 수정(오프셋 변경)**:
- (L322-326) `산부 −16` → **산부 −10(불변, 개원 이벤트가 산부를 안 건드림)** + **검진 +34**.
- (L345-349) `산부 economics −16` → **검진 뽑으면 +34 반영**으로 재서술.
- (L314-320) `enterWorldEvent` 세계 확정: 순환기 −6(유지) + 검진 +34.

**게이트**: vitest 전체 green + `tsc --noEmit` 0(vitest는 타입체크 안 함 — 별도 게이트 필수, [vitest-no-typecheck-tsc-gate 메모]).

---

## 7. 톤·팩트 가드레일

- 브리핑은 **조치·재원 사실만** — "이래서 개혁은 무의미하다"류 해석 카피 금지. "비급여(미용)는 안전하다" 같은 편집도 금지(플레이어가 위저드에서 발견).
- **각색 억 손익 노출 금지**(테스트로 잠금). 실측 통계 각색은 **제도 형태만**(가산 %·상대가치점수 %는 실제 제도 단위라 OK, [fee §4] 근거) — 병원 P&L 억 수치는 안 띄운다.
- "수가는 행위에 붙지 과에 안 붙는다"([fee §1]) — 브리핑은 **"중증·응급 최종치료 가산", "흉부외과 처치·수술 가산"**처럼 행위/과목 조건 표현을 쓰고, "순환기내과 수가 인상" 같은 표현은 안 쓴다.
- 실명·정파 없음.

---

## 8. 알아둘 천장 (정직하게)

- **E2·E3·E4의 profit/hireCost 효과는 현 모델에서 장부에 안 닿는다.** 월드 이벤트가 economics에 물리는 지점은 1주차 `completeSetup`뿐이고([2026-07-19 스펙 §2]), 2주차+는 `beginWeek`이 기존 병원을 재사용한다. 그래서 **이 슬라이스의 딜리버리는 "병원장이 읽는 공문의 구체성·다양성"**이고, 회전 이벤트의 억 효과는 **휴면**이다(매주 재채용 슬라이스가 붙으면 자동 활성 — 전방호환). 데이터에 effects를 정의해 두는 건 죽은 코드가 아니라 그 활성점을 위한 예약이다.
- **E1만 기계 효과가 실재**한다(개원 setup에서 검진 −6/순환기 +6이 위저드·장부에 반영).
- 시행 시차(발표→2~3주 지연 발동)는 세션 모델 변경이라 이번 스코프 밖 — 브리핑에 거짓 시행일을 안 박는다.

---

## 9. 확장점 (다음 슬라이스가 여기 붙는다)

- **매주 재채용/경제 재계산**: 2주차+ 이벤트가 economics에 물리게 → E2·E3·E4 효과 활성.
- **규제 축(capacity 노브)·여론 축(lawsuit 노브)**: 당직 의무화·소송 리스크 이벤트 → 새 월드 노브.
- **진짜 시행 시차**: 효과를 다음 주 발동으로(리서치가 지목한 후보).
- **양방향 로테이션**: 개선 카드 뒤 D형 상쇄 후속 페어링([current-korea-change-events §E]).
- **LLM 헤드라인·브리핑**: 결정론 effects는 유지, 서사 슬롯만 LLM 왕복.

---

## 재현 / 검증

1. 부착점은 코드로: `WorldEventCard.tsx`(briefing 렌더)·`world.ts`(덱)·`DeptEffect.field` 타입 제한(헌법).
2. fact-grounding 잠금: 각 briefing에 억 금액 토큰 없음을 테스트가 단언.
3. 재정중립: E1 패키지 profit 델타 합=0 + 미용 불변을 테스트가 잠금.
