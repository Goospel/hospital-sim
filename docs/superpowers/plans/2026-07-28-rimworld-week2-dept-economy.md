---
tags:
  - type/plan
---

# 림월드형 2주차 PR B — 과·경제·응급·피로 이식 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지금은 모든 진료가 익명 30만원이다. 과(내과·외과·순환기·미용)를 세워 환자가 과별로 갈리고, 응급이 **배후과 없으면 되돌아가며**(메시지의 심장), 수가·고정비가 과별로 갈려 "옳은 의료를 할수록 장부가 나빠지는" 기존 게임의 수학이 새 시뮬에서 창발하게 한다. 피로가 진료를 늦춘다.

**Architecture:** 새 모듈 `src/sim/dept.ts`(과 카탈로그 — 기존 `src/game`의 경제·강도 상수를 **계승**, 값마다 출처 주석)와 `patientFlow`의 환자 종류·라우팅 확장, `src/sim/emergency.ts`(응급 도착·배후 판정), `pawn`의 피로 필드. UI는 건설 시 과 선택·채용 패널·응급/피로 표시·결산 과별 표. 기존 게임(`src/game/`) 0줄 원칙 유지.

**Tech Stack:** 기존 그대로(신규 라이브러리 0).

**공통 규약**: PR A와 동일 — `.commit-msg-tmp` + `git commit -F`·트레일러 연속·`Skills-used: none`(미호출 시)·게이트(`npx vitest run` green + `npx tsc --noEmit` 0)·상대 경로 임포트·**돌연변이 실측 의무**·복구는 백업 재기록([T-076](../../../claude-docs/troubleshooting/T-076.md))·경계 테스트는 [T-085](../../../claude-docs/troubleshooting/T-085.md)·**시드 폴딩 재사용 시 슬롯 폭 대조**([T-087](../../../claude-docs/troubleshooting/T-087.md) — 이 브랜치에서 새 스트림 축을 만들 때 `arrivalSeed` 패턴을 따르고 index 슬롯에 스트림 값 금지)·오버레이 세로 정렬은 `items-start`+`my-auto`([T-088](../../../claude-docs/troubleshooting/T-088.md)).

**설계 결정(스펙·기존 게임에서 파생 — 전부 각색·튜닝값, 부호만 근거 유지)**:
- **과 4개**: `INTERNAL_MEDICINE`(내과) · `GENERAL_SURGERY`(외과) · `CARDIOLOGY`(순환기) · `AESTHETICS`(미용 — 기존 `RevenueDept` 키 재사용). 나머지 과(산부·신경외과·흉부외과·검진)는 2주차 절단 — 카탈로그 구조는 열어 둔다.
- **부호 원칙**(기존 게임 §필수의료 경제 계승): 필수과(내과·외과·순환기)는 수가 낮고 고정비 높아 **과별 순익이 적자 경향**, 미용은 흑자. 수치는 아래 표가 시작점이고 구현 후 실측으로 조정 가능하되 **부호 불변식(Task 5의 I-B1)은 반드시 성립**해야 한다.

| 과 | 외래 수가(만원/건) | 주 고정비(만원/의사) | 강도 | 응급 |
|---|---|---|---|---|
| AESTHETICS | 30 | 2,500 | 0.3 | — |
| INTERNAL_MEDICINE | 12 | 3,000 | 1.0 | — |
| GENERAL_SURGERY | 25 | 4,000 | 1.2 | ACUTE_ABDOMEN(처치 300만원, 90분) |
| CARDIOLOGY | 25 | 5,000 | 1.2 | STEMI(PCI 850만원, 90분) |

- **외래 분포**(도착 환자의 희망 과, seed): 내과 45% · 외과 20% · 순환기 15% · 미용 20%. 자기 과 진료실+의사가 없으면 대기하다 인내 초과 이탈(기존 기계 재사용 — "그 과가 없으면 그 환자를 놓친다"가 자연 창발).
- **응급**: 주간(0..480) 평균 120분당 1건, STEMI/급성복증 50/50. **도착 즉시 결정론 판정** — 그 과 의사 ≥1명 **그리고** WARD 빈 침대 ≥1이면 수용(의사의 다음 작업으로 최우선 배치·WARD 침대에서 90분 처치), 아니면 `turnedAway`(사유: `NO_SPECIALIST` | `NO_BED`)로 즉시 회차. 기존 게임의 하드락 원칙 계승 — 어떤 조작으로도 못 뚫는다.
- **피로**: 기존 상수 계승(`src/game/doctor.ts` — `FATIGUE_SLOW_FROM=34`·`FATIGUE_SLOW_MAX=0.5`·`fatigueSlowFactor` 곡선·회복 20/밤). 축적은 표준강도분(진료 분 × 과 강도, 응급은 ×2.0)을 하루 160분 초과분부터. 효과: 진료 소요 × `fatigueSlowFactor(fatigue)`(1.0~1.5). **사직은 PR C** — 이번엔 감속까지만.
- **채용**: HUD [채용] 버튼 → 패널에서 과 선택 → 즉시 입구 스폰(채용 일시금 없음 — 주 고정비가 비용. 기존 게임의 계약금·후보 풀은 PR C/D 절단). 해고 없음.
- **EXAM 과 지정**: 건설 시 과 선택 필수(UI). 코어 `placeRoom`은 dept 미지정 EXAM을 `INTERNAL_MEDICINE`으로 기본 처리(기존 테스트 마이그레이션 최소화 — 이 기본값은 UI에서 도달 불가).

---

### Task 1: 과 카탈로그 + EXAM 과 기본값 + 채용 코어 (`src/sim/dept.ts`)

**Files:** Create `src/sim/dept.ts` / Modify `src/sim/build.ts`(EXAM dept 기본값)·`src/sim/pawn.ts`(hireDoctor) / Test `src/sim/dept.test.ts`

- [ ] **Step 1: 실패하는 테스트** — 핵심 케이스:

```ts
// src/sim/dept.test.ts (발췌 — 전체는 구현자가 확장)
import { SIM_DEPTS, simDept, HIRABLE_DEPTS } from './dept'
import { createWorld } from './world'
import { placeRoom } from './build'
import { hireDoctor } from './pawn'

it('과 4개 — 필수과 셋은 수가 < 미용 고정비 대비 구조(부호 원칙의 원료)', () => {
  expect(HIRABLE_DEPTS).toEqual(['AESTHETICS', 'INTERNAL_MEDICINE', 'GENERAL_SURGERY', 'CARDIOLOGY'])
  expect(simDept('CARDIOLOGY').weeklyCostManwon).toBeGreaterThan(simDept('AESTHETICS').weeklyCostManwon)
  expect(simDept('INTERNAL_MEDICINE').examRevenueManwon).toBeLessThan(simDept('AESTHETICS').examRevenueManwon)
})
it('EXAM에 dept를 안 주면 INTERNAL_MEDICINE 기본(마이그레이션 절단 — UI는 항상 지정)', () => {
  const r = placeRoom(createWorld(1), { type: 'EXAM', x: 4, y: 4, w: 6, h: 5 })
  if (!r.ok) throw new Error('전제 실패')
  expect(r.world.rooms[0].dept).toBe('INTERNAL_MEDICINE')
})
it('hireDoctor — 입구 부근 통행 타일에 그 과 의사 스폰·nextId 증가·비용 0(주급이 비용)', () => {
  const w = hireDoctor(createWorld(1), 'CARDIOLOGY')
  expect(w.pawns).toHaveLength(1)
  expect(w.pawns[0]).toMatchObject({ kind: 'DOCTOR', dept: 'CARDIOLOGY' })
  expect(w.treasuryManwon).toBe(50_000)
})
```

- [ ] **Step 2: Red 실측** → **Step 3: 구현** — `SIM_DEPTS`는 위 표의 값 + **값마다 기존 근거 출처 주석**(`src/game/receiving.ts CALL_ECONOMICS`·`types.ts DEPARTMENTS.fixedCostPerDoctorManwon`·`doctor.ts FATIGUE_INTENSITY`를 읽고 계승 관계를 명시 — 1:1 복사가 아니라 새 시뮬 스케일로 각색했음을 적는다). `simDept(key)` 조회, `hireDoctor(world, dept)`는 기존 `spawnDoctor` 재사용(입구 부근 통행 타일 탐색 포함). 기존 `spawnDoctor` 직접 호출부(페이지 초기화)는 Task 6에서 채용 패널로 대체될 때까지 유지.
- [ ] **Step 4: 게이트** → **Step 5: 커밋** — `feat: 과 카탈로그 — 수가·고정비·강도(기존 경제 계승)`

### Task 2: 환자 종류·과 라우팅·과별 수익 (`src/sim/patientFlow.ts` 확장)

**Files:** Modify `src/sim/patientFlow.ts`·`src/sim/pawn.ts`(환자 `wantsDept`)·`src/sim/world.ts`(stats 확장) / Test `src/sim/patientFlow.test.ts` 확장

- [ ] 동작: 도착 시 `wantsDept`를 seed 분포(45/20/15/20)로 배정(스트림 축 주의 — `arrivalSeed(w)`에서 파생하되 **별도 salt·T-087 준수**). `assignWaitingToExam`은 **환자 wantsDept == 방 dept == 의사 dept**일 때만 짝짓는다. 진료 수익 = `simDept(wantsDept).examRevenueManwon`. `stats`·`DayRecord`에 `byDept: Partial<Record<DeptKey, { patients: number; revenueManwon: number }>>` 추가(합계 불변식: Σ byDept.revenue == revenueManwon — 기존 deptLedger의 불변식 계승).
- [ ] 핵심 테스트(계약): ⓐ 내과 의사·내과 방만 있는 병원에서 미용 환자는 진료받지 못하고 이탈 ⓑ 분포 전제 단언(표본 하루에서 4과 전부 등장하는 시드 고정) ⓒ Σ byDept == 총수익 불변식 ⓓ 금고 불변식 유지(과별 수가 반영으로 식 갱신 — Σ(과별 환자 × 과 수가)) ⓔ 결정론.
- [ ] 돌연변이 후보: 라우팅의 dept 일치 조건 제거(아무 의사나 진료) / byDept 집계 누락 / 분포 salt 제거(wantsDept가 도착 판정과 상관). 커밋 — `feat: 환자에 과가 생겼다 — 라우팅·과별 수가`

### Task 3: 응급 — 배후과 벽 (`src/sim/emergency.ts`)

**Files:** Create `src/sim/emergency.ts` / Modify `src/sim/tick.ts`(호출)·`src/sim/pawn.ts`(응급 필드)·`src/sim/world.ts`·`src/sim/day.ts`(DayRecord 확장) / Test `src/sim/emergency.test.ts`

- [ ] 동작: 도착(평균 120분당 1건·주간·별도 salt) → **즉시 판정**(그 과 의사 ≥1 && WARD 빈 침대 ≥1) → 수용이면 환자를 WARD 침대로(90분 처치·해당 과 의사의 다음 작업 최우선 — 현재 외래 진료는 마치고 옴), 처치 완료 시 응급 수가 가산. 거부면 `stats.emergencyTurnedAway`에 `{ kind, reason: 'NO_SPECIALIST' | 'NO_BED' }` 누적·폰은 즉시 회차(입구 퇴장) 또는 미생성(도착 즉시 판정이므로 거부 시 폰 미생성 — 1주차 문전박대 선례). `DayRecord`에 `emergencies: { accepted: number; turnedAway: number }`.
- [ ] 핵심 테스트: ⓐ 순환기 0명 병원에 STEMI → NO_SPECIALIST(어떤 배치·금고로도 불변 — 하드락) ⓑ WARD 없으면 NO_BED ⓒ 수용 시 침대 점유·90분 후 수익 850 가산·침대 해제 ⓓ 의사가 외래 중이면 외래 종료 후 응급 우선(예약된 대기 환자보다 먼저) ⓔ 결정론·금고 불변식 유지.
- [ ] 돌연변이 후보: 판정에서 의사 조건 제거(맨손 수용) / 침대 조건 제거 / 응급 우선순위 제거 / turnedAway 미집계. 커밋 — `feat: 응급 — 배후과 없으면 되돌아간다(하드락)`

### Task 4: 피로 — 표준강도 축적·감속·밤 회복 (`src/sim/fatigue.ts`)

**Files:** Create `src/sim/fatigue.ts`(순수 계산 — 기존 `src/game/doctor.ts` 곡선 **임포트 재사용**, 복제 금지) / Modify `src/sim/patientFlow.ts`(진료 소요 × slowFactor·강도분 축적)·`src/sim/emergency.ts`(강도 2.0)·`src/sim/day.ts`(`startNextDay`·`startNextWeek`의 아침에 회복) / Test `src/sim/fatigue.test.ts`

- [ ] 동작: `Pawn.fatigue?: number`(의사만, 초기 0). 진료·처치가 끝날 때 `표준강도분 = 소요분 × simDept(...).intensity`(응급 2.0)를 하루 누적, 하루 160분 초과분에 대해 `FATIGUE_PER_OVER_HOUR`(기존 15/시간) 비율로 피로 증가(기존 `stepFatigue` 계승 — 가능하면 임포트, 시그니처가 안 맞으면 얇은 어댑터). 진료 시작 시 소요 = 기본 20분 × `fatigueSlowFactor(fatigue)`(기존 임포트 — 34 이하 1.0, 100에서 1.5). 아침(`freshMorning`)에 `FATIGUE_REST`(20) 회복.
- [ ] 핵심 테스트: ⓐ 미용 의사(강도 0.3)는 하루 종일 봐도 피로 임계 미만, 순환기+응급은 임계 초과(기존 게임의 "무풍/갈려나감" 대비 계승) ⓑ 피로 67(레드존)이면 진료 소요가 20분보다 길다 ⓒ 아침 회복 ⓓ 감속 곡선은 **기존 함수 그대로**(복제 검출: `src/sim`에 곡선 리터럴이 없을 것) ⓔ 금고 불변식은 소요 변화와 무관하게 유지.
- [ ] 커밋 — `feat: 피로 이식 — 표준강도 축적·감속·밤 회복`

### Task 5: 결산 확장 — 과별 고정비·과별 표·응급 줄·부호 불변식 (`src/sim/week.ts` 확장)

**Files:** Modify `src/sim/week.ts`(고정비 = Σ 의사별 `simDept(dept).weeklyCostManwon` — `WEEKLY_DOCTOR_COST_MANWON` 상수 은퇴)·`src/sim/day.ts` / Test `src/sim/week.test.ts` 확장

- [ ] `WeekSummary`에 `byDept`(과·의사 수·진료 수익·고정비·순익)와 `emergencies` 합산. **부호 불변식 I-B1(신설·회귀 잠금)**: 같은 표준 시나리오(고정 시드·동일 방 배치)에서 ⓐ 미용 1명 병원의 주 순익 > 순환기 1명 병원의 주 순익 ⓑ 순환기 1명 병원은 응급을 받아도 과별 순익 ≤ 0(수가+응급 수익 < 고정비 — "옳은 의료가 장부를 이기지 못한다"). 수치 조정이 필요하면 **카탈로그 값을 조정**하되 이 불변식은 유지(각색 허용·부호 불변).
- [ ] 커밋 — `feat: 결산 과별 — 고정비 정밀화·부호 불변식`

### Task 6: UI — 과 선택 건설·채용 패널·응급/피로 표시·결산 표

**Files:** Modify `src/app/sim/page.tsx`·`src/components/TileMap.tsx`·`WeekEndOverlay.tsx`·`DayEndOverlay.tsx` / Create `src/components/HirePanel.tsx`

- [ ] 동작: ⓐ EXAM 버튼 → 과 4개 서브버튼(선택 후 드래그 — 방 색·라벨이 과를 표시) ⓑ HUD [채용] → 패널(과별 현재 인원·주급·[채용] — `hireDoctor` 연결·시계 일시정지) — 초기 의사 2명 하드코딩(`spawnDoctor`) 제거, 시작은 **의사 0명**(채용이 첫 결정이 된다) ⓒ 응급 폰 붉은 링·HUD 응급 수용/회차 카운트·회차 시 짧은 토스트(사유 — `NO_SPECIALIST`: "순환기 의사가 없습니다", 톤 가드레일: 비난 카피 금지) ⓓ 의사 아바타 위 피로 막대(기존 게임 표현 계승 — 34/67 색 전환) ⓔ 결산 오버레이에 과별 표(과·인원·수익·고정비·순익)와 응급 줄(수용 N·회차 N — 사유별).
- [ ] 게이트: 전체 green·tsc 0·`npm run build`(PowerShell) + 브라우저 실측(T-086 프레임 대체): 채용 0명 시작→미용만 채용→미용 환자만 진료·타과 이탈→순환기 채용+WARD 건설→STEMI 수용(침대·수익)→순환기 해고 불가하므로 새 판에서 순환기 0명+STEMI 회차 토스트→주간 결산 과별 표·부호 확인. 콘솔 0.
- [ ] 커밋 — `feat: 과·채용·응급·피로가 보인다 — UI 일괄`

### Task 7: 문서 스윕 + 최종 게이트

- [ ] plan.md(PR B ✅·PR C/D 🔜)·changeLog 항목·trap 스윕(1분+ 디버깅 → T-###)·전체 게이트 재확인. 커밋 — `docs: 2주차 PR B 마무리 — plan·changeLog`

---

## Self-Review 기록

- **스펙 커버리지**: 스펙 §5 이식 지도의 "과 카탈로그·수가/고정비"(Task 1·5), "피로 표준강도·감속"(Task 4), "하드락 판정 원칙"(Task 3 — 배후과 없으면 응급 불가), §2 환자 라이프사이클 확장(Task 2). 사직(§5)·욕구 3종은 PR C, 스토리텔러는 PR D — 의도적 이월. 채용은 스펙 §3 "인게임 건설+채용으로 흡수"의 최소판.
- **플레이스홀더 스캔**: Task 2~6은 계약+핵심 테스트 목록 방식 — PR A 실적(구현자들이 계약에서 정확한 코드를 냈고 돌연변이 의무가 구멍을 잡음)에 근거한 의도적 압축. 수치 표·분포·판정 조건·불변식은 전부 명시돼 해석 여지 없음.
- **타입 일관성**: `DeptKey`·`AESTHETICS`는 기존 `src/game/types.ts:104-107` 실존 확인. `byDept` 구조는 기존 `deptLedger.ts DeptDayStats`와 동형(계승 관계 주석 지시). `fatigueSlowFactor`·`FATIGUE_*`는 `src/game/doctor.ts` 실존 확인(1주차 grep).
- **T-087 선반영**: 새 스트림 축 2개(wantsDept·응급 도착)에 슬롯 폭 주의를 공통 규약과 각 태스크에 명시.
