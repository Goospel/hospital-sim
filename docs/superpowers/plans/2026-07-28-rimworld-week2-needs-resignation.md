---
tags:
  - type/plan
---

# 림월드형 2주차 PR C — 욕구·우선순위·사직 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지금 의사는 지치기만 하고 아무 행동도 못 바꾼다. 욕구(피로의 행동화 + 허기)를 붙여 의사가 **스스로 일을 끊고 휴게실·식당으로 가게** 하고, 플레이어의 유일한 개입 수단인 **우선순위 토글**(진료/응급/휴식)을 세우고, 피로 포화가 누적되면 **사직해 전국 풀에서 영구히 사라지게** 한다 — "사람을 갈아넣는 구조는 결국 사람을 잃는다"가 장부가 아니라 인사(人事)에서 창발한다.

**Architecture:** 새 모듈 `src/sim/needs.ts`(휴식·식사 — 공용 브레이크 기계, 순수 함수)와 `pawn.ts`의 의사 필드 확장(`activity`·`hungerMin`·`priorities`·`saturatedDays`), `dept.ts`에 전국 풀, `week.ts`에 사직 파생·집행. tick에 `stepDoctors` 한 단계 추가. UI는 우선순위 패널·식당 건설·풀 표시·사직 통지. 기존 게임(`src/game/`) 0줄 원칙 유지(사직 상수는 **임포트 재사용** — 복제 금지).

**Tech Stack:** 기존 그대로(신규 라이브러리 0).

**공통 규약**: PR A·B와 동일 — `.commit-msg-tmp` + `git commit -F`·트레일러 연속·`Skills-used: none`(미호출 시)·게이트(`npx vitest run` green + `npx tsc --noEmit` 0)·상대 경로 임포트·복구는 백업 재기록([T-076](../../../claude-docs/troubleshooting/T-076.md))·경계 테스트는 [T-085](../../../claude-docs/troubleshooting/T-085.md)·새 스트림 축은 새 salt만([T-087](../../../claude-docs/troubleshooting/T-087.md) — **이 PR은 새 무작위 축이 없다**: 욕구·사직은 전부 결정론 상태 전이라 seed를 쓰지 않는다)·계약 주석은 사살 가능한 테스트와 짝([T-089](../../../claude-docs/troubleshooting/T-089.md))·**돌연변이는 개별 적용 + 죽은 테스트 특정**([T-090](../../../claude-docs/troubleshooting/T-090.md)).

**설계 결정(스펙 §2·기존 게임에서 파생 — 수치는 전부 각색·튜닝값)**:

- **욕구는 3개 중 2개만**: 피로(행동화)·허기 구현, **스트레스는 ⏸ 절단**. 근거: 스트레스의 행동 규칙("임계 초과 시 일 끊기")은 피로와 동형이라 이 슬라이스에선 같은 기계의 중복이고, 스트레스의 고유 가치(특성·개성과의 상호작용 — 워커홀릭 = 스트레스 축적↑)는 PR D(폰 서사)의 재료다. plan.md ⏸에 기록한다.
- **휴식(피로의 행동화)**: 유휴 의사가 `fatigue >= FATIGUE_RED`(67 — `src/game/doctor.ts` 임포트, 색 경계와 같은 출처)면 LOUNGE 의자로 가서 `REST_BREAK_MIN = 60`분 쉬고 `REST_BREAK_RECOVER = 15`를 내린 뒤 책상으로 복귀한다. **밤 회복(`FATIGUE_REST` 20)보다 약하다** — 낮잠이 밤잠을 이기면 안 된다. 회복은 블록이 **끝날 때 한 번에**(부하가 작업이 끝날 때 쌓이는 것과 대칭 — 정수 산술 유지). LOUNGE가 없거나 도달 불가면 못 쉰다(→ 포화 → 사직의 인과가 열린다). 배치 인과 ③(휴게실 거리 = 회복 빈도)은 왕복 보행 시간이 만든다.
- **허기**: `hungerMin`(마지막 식사 후 경과 분, 아침 0 리셋)이 `HUNGRY_AFTER_MIN = 300`을 넘으면 유휴 시 **CAFETERIA**(신설 방 타입) 의자로 가서 `MEAL_MIN = 20`분 먹고 0으로 리셋. 식당이 없으면 굶은 채 일한다 — 굶주림 상태(`hungerMin >= HUNGRY_AFTER_MIN`)로 **시작하는** 작업은 소요 `STARVED_SLOW = 1.15`배(피로 감속과 곱). "식당 없는 병원은 오후가 느리다"가 결정론 수치로 성립한다.
- **응급은 욕구를 끊는다**: 휴식·식사 중이어도 그 과 응급이 침대에서 기다리면 배정된다(응급 최우선 계승 — 회복·식사는 무효가 되고 activity만 해제). 단 Task 3의 `emergency = 0`(금지)이면 예외.
- **우선순위 토글**: 의사별 `priorities: { exam, emergency, rest }`, 각 값 `0(금지)·1(낮음)·2(보통)·3(높음)`, 기본 전부 2. 소비 규칙 —
  - `exam = 0` → 외래 배정 제외. 외래 후보 의사 정렬 = `exam` 내림차순 → 폰 배열 순(결정론).
  - `emergency = 0` → 응급 판정·배정에서 완전 제외. ⚠️ **NO_SPECIALIST 판정이 바뀐다**: "그 과 의사 ≥1" → "**응급을 켠(emergency > 0)** 그 과 의사 ≥1". 플레이어가 순환기 의사의 응급을 꺼서 회차시키는 것도 선택이고 그 대가(수익 상실·회차 카운트)를 치른다 — 하드락 원칙은 유지된다(켠 의사가 없으면 어떤 조작으로도 못 받는다). PR B의 계약 테스트·주석(108구성 프로브 서술 포함)을 이 정의로 **정정**한다.
  - `rest = 0` → 휴식 안 간다(포화 → 사직으로 직행하는 착취 레버 — 이게 이 게임이 플레이어에게 쥐여 주는 나쁜 선택지다). `rest > exam` → 피로 임계면 **대기 환자가 있어도** 외래 배정에서 선제 이탈해 쉬러 간다. `rest <= exam` → 유휴일 때만 쉰다.
  - 식사는 욕구라 토글이 없다(굶기는 레버는 "식당을 안 짓는다"로 이미 존재한다).
- **사직(기존 규칙 계승 — 상수 임포트)**: `saturatedDays`(의사별)가 `settleDay`에서 **마감 피로 == `FATIGUE_MAX`(100)인 날만 +1, 리셋 없음**(`src/game/doctor.ts` `stepSaturatedDays` 규칙 그대로 — 회복해도 그 날들은 몸에 남는다). `RESIGN_SATURATED_DAYS`(= 4, 임포트)를 채우면 **주간 결산에서 사직 통지 → `startNextWeek`이 제거**. 고정비는 사직 **전** 명단으로 청구된다(그 주를 일했다) — PR A의 "고정비 = 결산 시점 의사 수"는 **재검토 결과 유지**: 사직이 주 경계에서만 일어나므로 주 중 인원 변동은 여전히 채용뿐이고, 채용 주 전액 청구는 PR B에서 이미 수용된 각색이다. 새 시뮬 의사 id는 `doc-<nextId>`로 유일해 기존 게임의 id 재번호 함정(remap)은 **구조적으로 없다**.
- **전국 풀**: `SimDeptSpec`에 `nationalPool` 추가 — 미용 8 · 내과 5 · 외과 3 · 순환기 2(각색: **필수과일수록 얇다** — 기존 전국 풀·인력 제로섬 논지의 대소 계승). `createWorld`가 `hirePool`로 초기화, `hireDoctor`는 풀 0이면 거부(`HireResult` — `placeRoom`과 같은 형태). **사직자는 풀로 돌아가지 않는다**(다른 병원 이직이 아니라 필수의료를 떠난다 — 기존 규칙 계승). 완비 채용(미용 1·내과 1·외과 1·순환기 1)으로도 풀이 남아 게임은 성립하고, 사직이 반복되면 "뽑을 사람이 없다"가 온다.
- **밸런스**: PR B 이월(혼합 생존선)은 이 PR 범위 밖 유지. 다만 휴식·굶주림 감속·사직이 처리량을 흔드므로 **최종 리뷰가 부호 불변식 I-B1과 다주 종주를 프로브로 재실측**한다(커밋 테스트는 기존 회귀망 유지).

| 신설 상수 | 값 | 자리 | 근거 |
|---|---|---|---|
| `REST_BREAK_MIN` | 60 | needs.ts | 각색 — 한 시간 휴식 블록 |
| `REST_BREAK_RECOVER` | 15 | needs.ts | 밤(`FATIGUE_REST` 20)보다 약하게 |
| `HUNGRY_AFTER_MIN` | 300 | needs.ts | 개장 09:00 기준 점심때(14시경) 도달 |
| `MEAL_MIN` | 20 | needs.ts | 외래 한 건과 같은 길이 |
| `STARVED_SLOW` | 1.15 | needs.ts | 피로 최대 감속(1.5)보다 완만 |
| `nationalPool` | 8·5·3·2 | dept.ts | 필수과일수록 얇다(대소만 근거) |

---

### Task 1: 휴식 — LOUNGE 기능화 (`src/sim/needs.ts` 신설)

**Files:** Create `src/sim/needs.ts` / Modify `src/sim/pawn.ts`(`activity`·`restUntilMin`)·`src/sim/tick.ts`(`stepDoctors` 배선)·`src/sim/patientFlow.ts`(유휴 판정에서 activity 제외)·`src/sim/emergency.ts`(배정 시 activity 해제)·`src/sim/day.ts`(`freshMorning`이 activity 해제) / Test `src/sim/needs.test.ts`

- [ ] 동작: 의사 필드 `activity?: 'TO_LOUNGE' | 'RESTING'`(+Task 2에서 `'TO_MEAL' | 'EATING'` 확장)·`restUntilMin?: number`. `stepDoctors(w)`(needs.ts)가 분당 1회 — ⓐ 개시: 유휴(누구의 doctorId로도 안 물림·activity 없음) && `fatigue >= FATIGUE_RED` && LOUNGE 의자 자리(`furnitureSpots(w,'LOUNGE','CHAIR')` — 좌석 점유는 다른 의사의 dest, 환자 좌석과 같은 기계) 도달 가능 → `activity:'TO_LOUNGE'`·dest·path ⓑ 전이: 의자 도착(위치 == dest) → `RESTING`·`restUntilMin = minute + REST_BREAK_MIN` ⓒ 종료: `minute >= restUntilMin` → `fatigue -= REST_BREAK_RECOVER`(하한 0)·activity 해제·자기 방 책상으로 복귀(dest·path — `furnitureSpot` 재사용, 방 없으면 그 자리). 외래 배정(`assignWaitingToExam`)의 유휴 풀은 **activity 있는 의사 제외**. 응급 배정(`assignEmergencyDoctors`)은 activity 의사도 후보로 삼되 배정 시 activity·restUntilMin·dest 해제(휴식 무효 — 회복 없이 끊긴다). `freshMorning`은 activity·restUntilMin을 지운다(아침은 책상에서 시작). tick 순서: `stepEmergencies` **뒤**에 `stepDoctors`(응급이 먼저 의사를 집는다).
- [ ] 핵심 테스트: ⓐ 피로 67 유휴 의사 + LOUNGE → 걸어가 60분 쉬고 15 내려 복귀(전 구간 스테이지 실측) ⓑ LOUNGE 없으면 안 간다(피로 그대로) ⓒ 휴식 중 외래 배정 안 됨(대기 환자가 있어도) ⓓ 휴식 중 그 과 응급 IN_BED → 그 분에 배정되고 회복은 없다 ⓔ 시간 분할 불변식(tick(w,n) == 1분×n — 휴식 전이 포함) ⓕ freshMorning 후 activity 없음.
- [ ] 돌연변이 후보(개별 적용·죽은 테스트 특정): 개시 임계 제거(피로 0에도 휴식) / 회복량 0 / 외래 배정의 activity 제외 삭제(쉬면서 진료) / 응급의 activity 해제 삭제. 커밋 — `feat: 휴식 — 지친 의사가 스스로 휴게실로 간다`

### Task 2: 허기·식당 — CAFETERIA (`src/sim/needs.ts` 확장)

**Files:** Modify `src/sim/needs.ts`·`src/sim/pawn.ts`(`hungerMin`)·`src/sim/world.ts`(`RoomType`에 `'CAFETERIA'`)·`src/sim/build.ts`(`FURNITURE_OF.CAFETERIA = 'CHAIR'` — WAITING과 같은 격자 배치)·`src/sim/patientFlow.ts`·`src/sim/emergency.ts`(작업 시작 소요에 굶주림 배율)·`src/sim/day.ts`(`freshMorning`이 hungerMin 0) / Test `src/sim/needs.test.ts` 확장

- [ ] 동작: `hungerMin`(의사만, 초기 0)이 RUNNING 분마다 +1(`stepDoctors`). `hungerMin >= HUNGRY_AFTER_MIN`이면 휴식과 같은 기계로 CAFETERIA 의자에 가서 `MEAL_MIN`분 `EATING` 후 0 리셋(activity `'TO_MEAL' | 'EATING'`). **휴식이 식사보다 먼저다**(피로 임계와 허기 임계가 동시면 휴식 — 회복이 사직을 막는 쪽이 급하다, 이 우선순위를 테스트로 잠근다). 굶주림 배율: 작업(외래·응급) **시작 시점**에 `hungerMin >= HUNGRY_AFTER_MIN`이면 소요 = `slowedDurationMin(base, fatigue)` 계산 뒤 `× STARVED_SLOW` 반올림 — 식은 needs.ts의 `starvedSlowFactor(p)` 한 곳(피로 감속과 별개 축, 흩어 적으면 한쪽만 잊는다). `freshMorning`이 0 리셋(저녁을 먹었다는 각색).
- [ ] 핵심 테스트: ⓐ 식당 있는 병원 — 300분 넘긴 유휴 의사가 가서 20분 먹고 hungerMin 0 ⓑ 식당 없는 병원 — 굶은 채 시작한 진료가 1.15배 길다(같은 시드 대조) ⓒ 피로·허기 동시 임계 → 휴식 먼저 ⓓ 식사 중 응급 → 끊고 배정 ⓔ 시간 분할 불변식 유지.
- [ ] 돌연변이 후보(개별): hungerMin 증가 삭제(영원히 배부름) / 굶주림 배율 제거 / 리셋 누락(이튿날 아침부터 굶주림). 커밋 — `feat: 허기·식당 — 굶는 병원은 오후가 느리다`

### Task 3: 우선순위 토글 — 판이 읽는 표 (`src/sim/pawn.ts`·소비처 3곳)

**Files:** Modify `src/sim/pawn.ts`(`priorities`·`setDoctorPriority`)·`src/sim/patientFlow.ts`(외래 배정 정렬·제외)·`src/sim/emergency.ts`(**NO_SPECIALIST 판정 변경**·배정 정렬·제외)·`src/sim/needs.ts`(rest 소비) / Test `src/sim/pawn.test.ts`·`patientFlow.test.ts`·`emergency.test.ts` 확장

- [ ] 동작: `priorities?: { exam: Priority; emergency: Priority; rest: Priority }`(`Priority = 0|1|2|3`), `spawnDoctor`가 전부 2로 초기화. `setDoctorPriority(w, doctorId, kind, value)` 순수 함수(UI가 부른다 — 범위 밖 값 throw). 소비: ⓐ 외래 유휴 풀에서 `exam === 0` 제외, 후보 정렬 `exam` 내림차순 → 폰 배열 순 ⓑ `maybeEmergency` ① 판정 = "**emergency > 0인** 그 과 의사 ≥1"(없으면 NO_SPECIALIST — **PR B 계약의 정의 확장**: emergency.ts 머리말·`assignEmergencyDoctors` 관련 주석·기존 계약 테스트를 이 정의로 정정하고, 미지정(`priorities` 없음 = 손세계 폰)은 기본 2로 읽어 기존 테스트가 최소 수정으로 지나가게 한다) ⓒ 응급 배정 후보에서 `emergency === 0` 제외·정렬 `emergency` 내림차순 → 배열 순 ⓓ 휴식 개시에 `rest === 0` 금지·`rest > exam`이면 외래 배정 유휴 풀에서도 선제 제외(피로 임계일 때 — 술어 `wantsRestNow(p)`를 needs.ts에 두고 patientFlow가 임포트, 식 복제 금지).
- [ ] 핵심 테스트: ⓐ 순환기 의사 1명 emergency=0 → STEMI가 NO_SPECIALIST(의사가 서 있는데도 — 하드락 정의 확장의 계약) ⓑ exam=0 의사는 대기 환자를 영원히 안 받는다 ⓒ exam 3·2 두 의사 — 3이 먼저 배정 ⓓ rest=0 + LOUNGE 있어도 안 쉼 ⓔ rest=3·exam=2 + 피로 임계 + 대기 환자 → 배정 대신 휴식 ⓕ setDoctorPriority 불변 입력·범위 밖 throw.
- [ ] 돌연변이 후보(개별): ⓑ의 emergency>0 조건 제거(꺼도 받는다) / 정렬 제거(배열 순만) / `wantsRestNow` 선제 제외 삭제. 커밋 — `feat: 우선순위 토글 — 플레이어의 유일한 사람 개입`

### Task 4: 사직·전국 풀 (`src/sim/week.ts`·`day.ts`·`dept.ts`·`pawn.ts`)

**Files:** Modify `src/sim/day.ts`(`settleDay` 포화 누적)·`src/sim/week.ts`(`resigningSimDoctors` 파생·`startNextWeek` 집행)·`src/sim/dept.ts`(`nationalPool`)·`src/sim/world.ts`(`hirePool`)·`src/sim/pawn.ts`(`saturatedDays`·`hireDoctor` → `HireResult`) / Test `src/sim/week.test.ts`·`day.test.ts`·`pawn.test.ts` 확장

- [ ] 동작: ⓐ `settleDay`가 부하 반영(`applyWorkLoads`) **뒤** 의사별 `fatigue >= FATIGUE_MAX`(임포트)면 `saturatedDays + 1`(리셋 없음 — `restOvernight`·`freshMorning`이 건드리지 않는 것을 테스트로 잠근다) ⓑ `resigningSimDoctors(w)`(week.ts, 순수) = `saturatedDays >= RESIGN_SATURATED_DAYS`(임포트) — WEEK_END에서 오버레이가 읽고 `startNextWeek`이 같은 함수로 제거(**단일 출처** — 통지와 집행이 갈리면 안 떠난 사람이 통지되거나 통지 없이 사라진다). 고정비 차감(`settleWeek`)은 사직 **전** 명단이므로 순서 무관하게 정합(사직은 startNextWeek에서만) ⓒ `hirePool: Record<SimDeptKey, number>`을 `createWorld`가 카탈로그 `nationalPool`로 초기화, `hireDoctor` → `HireResult = { ok: true; world } | { ok: false; reason: 'NO_POOL' }`(성공 시 차감·실패 시 세계 불변 — 호출부 `page.tsx`는 Task 5에서 갱신, 이 태스크에선 기존 테스트의 호출 형태만 정정) ⓓ 사직은 풀 미반환.
- [ ] 핵심 테스트: ⓐ 포화 마감 4일 누적 의사 — 주간 결산 통지에 있고 다음 주 pawns에 없다 ⓑ 3일이면 안 떠난다(경계 — T-085: 기준 캡처는 결산 전) ⓒ 포화 아닌 날은 누적 안 됨·회복해도 누적 유지 ⓓ 사직 후 hirePool 불변(미반환)·그 과 재채용은 풀이 남아 있을 때만 ⓔ 풀 0에서 `hireDoctor` → NO_POOL·세계 불변 ⓕ 사직한 과의 주간 표 줄 — 의사 0이어도 그 주 수익이 있으면 선다(week.ts 기존 합집합 계약이 실재화되는 첫 사례).
- [ ] 돌연변이 후보(개별): 포화 판정 `>=` → `>`(100에서 누적 안 됨) / `resigningSimDoctors` 임계 미달 포함 / 풀 차감 삭제(무한 채용) / 사직 시 풀 반환(+1). 커밋 — `feat: 사직·전국 풀 — 갈아넣은 사람은 돌아오지 않는다`

### Task 5: UI — 우선순위 패널·식당·풀·사직 통지

**Files:** Create `src/components/PriorityPanel.tsx` / Modify `src/app/sim/page.tsx`·`src/components/HirePanel.tsx`(풀 표시·소진 비활성)·`WeekEndOverlay.tsx`(사직 줄)·`simHud.ts`(라벨·표시 판정 헬퍼)·`TileMap.tsx`(휴식/식사 의사 표시) / Test `simHud.test.ts` 확장

- [ ] 동작: ⓐ HUD [인사] 버튼 → PriorityPanel(의사 × 진료/응급/휴식 3열, 클릭 순환 2→3→1→0→2 — 기본 2에서 한 번 누르면 "올림"이 되게, `setDoctorPriority` 연결, 열림 = 일시정지 합류 `paused = drag || hireOpen || priorityOpen`) ⓑ 건설 바에 식당(CAFETERIA) 버튼·`ROOM_LABEL` 추가 ⓒ HirePanel 과별 "전국 잔여 N명" 표시·0이면 버튼 비활성+사유 문구(NO_POOL 거부 방어는 이중 벨트) ⓓ WeekEndOverlay — `resigningSimDoctors` 통지 줄("○○과 의사가 병원을 떠납니다 — 전국 풀로 돌아가지 않습니다", 톤 가드레일: 비난 카피 금지) ⓔ TileMap 의사 아바타에 휴식/식사 상태 표시(RESTING 'zZ'·EATING 식사 글리프 등 — 판정은 `simHud.ts` 헬퍼로 분리해 테스트) ⓕ `hire` 콜백을 `HireResult` 형태로 갱신.
- [ ] 게이트: 전체 green·tsc 0·`npm run build` + Pages export(PowerShell — [T-059](../../../claude-docs/troubleshooting/T-059.md)) + 브라우저 실측([T-086](../../../claude-docs/troubleshooting/T-086.md) 프레임 대체): 순환기+내과 채용·LOUNGE 없이 며칠 굴려 피로 레드존 → LOUNGE 건설 후 휴식 왕복 관찰 → CAFETERIA 없는 오후 감속 vs 건설 후 식사 → 우선순위 패널에서 순환기 emergency=0 → STEMI 회차 토스트 → 며칠 포화 누적 → 주간 결산 사직 통지·다음 주 의사 소멸·HirePanel 잔여 감소 확인. 콘솔 0·모바일 375px.
- [ ] 커밋 — `feat: 욕구·우선순위·사직이 보인다 — UI 일괄`

### Task 6: 문서 스윕 + 최종 게이트

- [ ] plan.md(PR C ✅·스트레스 ⏸ 기록·PR D 🔜)·changeLog 항목·trap 스윕(**서브에이전트·리뷰어가 잡은 것 포함** — 1분+ 근인 디버깅 → T-###)·최종 리뷰(다주 종주·부호 불변식 I-B1 프로브 재실측 — 휴식·감속·사직이 처리량을 흔든 뒤에도 부호 유지 확인, 흔들리면 카탈로그 조정은 dept.ts 주석 규약대로)·전체 게이트 재확인. 커밋 — `docs: 2주차 PR C 마무리 — plan·changeLog`
