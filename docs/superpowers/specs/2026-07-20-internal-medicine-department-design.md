---
tags:
  - type/spec
---

# 설계 — 내과 진료과 추가 + 복통 응급 세분(급성복증=외과 / 고열·감염=내과)

> **한 줄**: 진료과에 **내과(INTERNAL_MEDICINE)**를 추가하고, catch-all이던 `GENERAL_EMERGENCY`를 원인에 따라 **급성복증(외과 배후)**·**고열·감염(내과 배후)** 둘로 쪼갠다. 각 응급이 그 과로 정확히 라우팅돼 배후 게이트·점유 경쟁을 받고, 소송·신문 무게는 두 계열이 **비대칭**이다(급성복증=소송+신문 / 고열·감염=신문만, 소송은 이번 미구현).
>
> **관련**: [../../research/internal-medicine-emergency-grounding.md](../../research/internal-medicine-emergency-grounding.md)(4각도 26주장 검증 근거·무게 비대칭·법적리스크 미구현) · [2026-07-20-time-based-day-loop-design.md](2026-07-20-time-based-day-loop-design.md)(이 위에 얹는다 — 시간 점유 모델) · [../../research/physician-workflow-and-backup-occupancy.md](../../research/physician-workflow-and-backup-occupancy.md)(배후 분업) · [../../research/fee-schedule-and-subsidies.md](../../research/fee-schedule-and-subsidies.md)(내과 원가 72%)

---

## 1. 목표

- **내과를 필수 배후과로 추가.** 지금 과는 미용·검진 + 순환기·흉부외과·산부·신경외과·외과뿐이라, 고열·감염·비수술 복통을 받을 과가 없다(임시로 `GENERAL_EMERGENCY`를 배후 무관 catch-all로 추상화해 둠 = "설계 A").
- **일반응급을 원인에 따라 세분.** 복통은 원인에 따라 분업한다 — 수술적 복통(급성복증)은 외과, 비수술·고열·감염은 내과([grounding](../../research/internal-medicine-emergency-grounding.md) §7). `GENERAL_EMERGENCY`를 두 CallKind로 대체해 각자 그 과로 라우팅한다.
- **점유 경쟁 완성.** 내과 예약진료(SPECIALIST_ELECTIVE dept=내과)와 고열·감염 응급이 **같은 내과 의사**를 두고 경쟁 → 예약이 응급을 밀어내면 `NO_FREE_SPECIALIST` 벽. 외과도 예약·외상·급성복증이 경쟁.
- **소송·신문 무게 비대칭.** 급성복증(외과)은 인과 선명(지연=천공)이라 소송+신문, 고열·감염(내과)은 방어 성공이 전형이라 신문만(소송 미구현). 근거: [grounding](../../research/internal-medicine-emergency-grounding.md) §2.
- **0-침습 계승.** adjudicateTransfer(배후 판정)·시간 점유·야간 당직·boarding·아침 신문·소송비용 구조는 그대로.

## 2. 배경 — 왜 지금

time-loop([design](2026-07-20-time-based-day-loop-design.md))에서 응급이 배후과 의사를 시간만큼 점유하는 모델이 들어왔다. 그때 `GENERAL_EMERGENCY`(복통·고열)를 어느 과가 맡을지 문제가 됐는데, 팩트체크 결과 **복통은 원인에 따라 외과/내과로 분업**([grounding](../../research/internal-medicine-emergency-grounding.md))인데 게임에 내과가 없어 "특정 배후과 불필요"로 임시 추상화(설계 A)했다. 현재 코드에서 그 흔적:

- `receiving.ts` `generalPatient.requiredSpecialty = 'GENERAL_SURGERY'` — **명목값**(판정에 안 씀).
- `receiving.ts` `hardlockReason`의 `GENERAL_EMERGENCY` 케이스: `hasErOnCall`·`overcrowded`만 보고 `return null`(배후 무관).
- `receiving.ts` `decide`: `call.kind !== 'GENERAL_EMERGENCY'` 가드로 **아무 의사도 점유하지 않음**.

내과를 추가하면 이 추상화를 걷어내고 고열·감염이 내과로, 급성복증이 외과로 정확히 라우팅된다.

## 3. 확정 설계 결정 (브레인스토밍 2026-07-20)

| 갈림 | 결정 | 근거 |
|---|---|---|
| 세분 여부 | **2갈래 세분**(급성복증/고열감염) | 복통 원인별 분업 |
| 무게 | **비대칭**: 급성복증 소송+신문 / 고열감염 신문만 | [grounding](../../research/internal-medicine-emergency-grounding.md) §2 |
| 내과 경제 | **저수가 박리다매(소폭 적자)** — 24h 대기 아님 | 원가 72%·박리다매 |
| 내과 법적 리스크 | **이번 미구현**(후속 리서치) — 단 "안전과 아님" | [grounding](../../research/internal-medicine-emergency-grounding.md) §5 |
| 부수 재료(노이즈·오분류·지연암) | **⏸ 후속 보류** | 스코프 통제 |

## 4. 타입 (`src/game/types.ts`)

- `Specialty`에 `'INTERNAL_MEDICINE' // 내과` 추가 → `DeptKey`·`providesBackup`·`backupCare`가 자동 반영.
- `CallKind`: `'GENERAL_EMERGENCY'` **제거**, 둘로 대체:
  - `'ABDOMINAL_EMERGENCY'` — 급성복증(충수염·장폐색·복막염). **외과(GENERAL_SURGERY) 배후.**
  - `'MEDICAL_EMERGENCY'` — 고열·감염·패혈증. **내과(INTERNAL_MEDICINE) 배후.**
- `RejectionReason`: 변경 없음(기존 5종으로 충분 — NO_BACKUP_CARE/NO_FREE_SPECIALIST/NO_NIGHT_BACKUP가 두 세분 응급에 그대로 적용).

## 5. ⭐ 무게 술어 분리 (`src/game/receiving.ts`)

현재 `isCriticalEmergency`(=`CRITICAL_EMERGENCY_KINDS`) **하나가 세 역할을 겸한다**: ① 배후 게이트(`hardlockReason`) ② 소송 노출(`decide`의 `lawsuitRisk`) ③ 신문 대상(`session.ts` `recordDay`의 `turnedAway`/`receivedEmergency`). 비대칭을 위해 **술어 2개로 분리**한다:

| 술어 | 집합 | 쓰이는 곳 |
|---|---|---|
| `requiresBackupCare(kind)` | STEMI, OB, NEURO, TRAUMA, **ABDOMINAL, MEDICAL** (6종) | `hardlockReason` 배후 게이트 · `recordDay` 신문(turnedAway)·receivedEmergency 카운트 |
| `carriesLawsuitRisk(kind)` | STEMI, OB, NEURO, TRAUMA, **ABDOMINAL** (5종, MEDICAL 제외) | `createCallQueue`의 `lawsuitRisk` |

- 기존 `CRITICAL_EMERGENCY_KINDS`/`isCriticalEmergency`는 **`carriesLawsuitRisk`로 개명·재정의**(급성복증 추가). `session.ts`가 import하는 신문/카운트 필터는 **`requiresBackupCare`로 교체**(고열·감염도 신문·카운트 대상).
- 결과: 고열·감염 = **배후 벽·점유 경쟁·신문은 받되 소송 노출 0**. 워크플로우 발견("초기 장염 구별 불가라 방어 성공/무죄가 전형")의 코드화.

## 6. 라우팅·게이트·점유 (`receiving.ts` · `doctor.ts`)

- **환자 정의**: `abdominalPatient`(requiredSpecialty=`'GENERAL_SURGERY'`), `medicalPatient`(requiredSpecialty=`'INTERNAL_MEDICINE'`). `handlingDept`는 이미 `patient.requiredSpecialty` 기반이라 **라우팅 자동**(doctor.ts 무변경).
- **`hardlockReason`**: `GENERAL_EMERGENCY` 케이스 제거. `ABDOMINAL_EMERGENCY`·`MEDICAL_EMERGENCY`를 STEMI 등과 **같은 배후 게이트 분기**로(adjudicateTransfer가 requiredSpecialty로 제네릭 판정 → NO_BACKUP_CARE / 야간 NO_NIGHT_BACKUP / 점유 NO_FREE_SPECIALIST). 종류별 분기 불필요.
- **`decide`**: `call.kind !== 'GENERAL_EMERGENCY'` 특례 가드 **제거**. 이제 두 세분 응급 모두 수용 시 담당 과(외과/내과) 자유 의사를 `arrivalMin + durationMin`까지 점유(`pickAssignee`). GENERAL_EMERGENCY의 "아무도 점유 안 함" 예외가 사라져 로직이 단순해진다.
- **야간 당직**: 두 세분 응급도 `requiresBackupCare`라 `nightShift` 시 `roundTheClockBackup` 게이트를 받는다(기존 4종과 동일). 밸런스 영향은 §10.

## 7. 경제

### 7.1 콜 경제 (`CALL_ECONOMICS`, `DURATION_MIN`)

`GENERAL_EMERGENCY` 항목 제거, 둘로 대체(부호=행위 단위 밴드, 금액 각색 — T-039 준수):

| kind | revenue/cost | 비율 | 근거 | durationMin |
|---|---|---|---|---|
| `ABDOMINAL_EMERGENCY` | 11/13 | ≈85% | 수술·처치 84.9% 밴드(STEMI 동형) | 90~180(수술급) |
| `MEDICAL_EMERGENCY` | 3/6 | ≈50% | 기본진료 50.5%·응급 45%(기존 GENERAL 계승) | 45~90 |

### 7.2 과 경제 (`DEPARTMENTS`, `setup.ts`)

`INTERNAL_MEDICINE` 한 줄 추가:
```
{ key: 'INTERNAL_MEDICINE', label: '내과', essential: true,
  profitPerDoctorBillions: -5, hireCostBillions: 20,
  lawsuitRisk: false, providesBackup: 'INTERNAL_MEDICINE' }
```
- `profitPerDoctorBillions: -5` — **소폭 적자**(24h 대기 고정비인 −8~−15보다 덜). 의미는 "저수가 박리다매"(외래 고volume 원가 72%)지 대기비가 아니다. `setup.ts:60`의 "24h 대기 고정비" 주석 프레임과 다른 제3지대임을 주석으로 명시.
- `lawsuitRisk: false` — **이번 미구현**([grounding](../../research/internal-medicine-emergency-grounding.md) §5). ⚠️ 이는 "내과=안전"이 **아니다** — `essential: true`(미용·검진과 분리)·적자·기피과로 안전과 오독을 막는다. 이 의도를 코드 주석에 못 박는다.
- 금액은 각색(부호·대소만 근거): 내과(−5)는 산부(−10~−16)보다 덜 적자(원가 72% > 61%)이되 미용(+70)과 정반대.

### 7.3 내과 예약진료

`SPECIALIST_ELECTIVE`는 이미 존재(10/6 ≈ 167%, 검체 160% 밴드). `DAY_PLANS`에 `dept: 'INTERNAL_MEDICINE'` 엔트리를 추가하면 내과 예약↔고열감염 응급이 점유 경쟁한다(코드 무변경, 데이터만).

## 8. 위저드·DAY_PLANS·신문 (표시/데이터층)

- **위저드**(SetupClient 등): 내과가 8번째 채용 과로 자동 노출(`DEPARTMENTS` 파생). `materializeRoster`·병원 등급 자격·예산/상한 제약은 파생이라 무변경.
- **`DAY_PLANS`**(receiving.ts): `GENERAL_EMERGENCY` 자리를 `ABDOMINAL_EMERGENCY`·`MEDICAL_EMERGENCY`로 교체하고, 각 세분 응급과 같은 날 같은 과 예약(외과/내과)을 배치해 점유 경쟁을 만든다. **외과 부하 집중**(TRAUMA+ABDOMINAL 둘 다 외과) 조율 필요(§10).
- **`CALL_LABELS`**: `ABDOMINAL_EMERGENCY`(예: '급성복증 — 외과 전원', '충수염 의심 — 수술 요청'), `MEDICAL_EMERGENCY`(예: '고열·패혈증 의심 — 내과 전원', '중증 장염 — 입원 요청'). 라벨을 계열별로 명확히 갈라 정직성 유지.
- **`news.ts` `PROFILE_BY_KIND`**: 두 kind 프로필 추가(예 급성복증='급성복증 50대 남성', 고열감염='고열·감염 60대 여성'). 윤리 가드(40~60대·가공지역·실명 금지) 준수.

## 9. 결정론·테스트 (TDD)

Red→Green→Refactor. `vitest` 전량 green + **`tsc --noEmit` 0**(esbuild가 타입 안 봄 — [vitest-no-typecheck-tsc-gate]).

TDD 대상(plan에서 태스크화):
- 술어 분리: `requiresBackupCare`/`carriesLawsuitRisk` 경계(급성복증 소송 O, 고열감염 소송 X·신문 O).
- 라우팅: 급성복증→외과 배후 게이트, 고열감염→내과 배후 게이트(NO_BACKUP_CARE), 각 점유(NO_FREE_SPECIALIST)·야간(NO_NIGHT_BACKUP).
- decide 점유: 두 세분 응급이 담당 과 의사를 점유(GENERAL 특례 제거 회귀).
- 경제: 급성복증 11/13·고열감염 3/6 델타, 내과 −5 segment.
- 신문/카운트: 고열감염 못 받으면 turnedAway·receivedEmergency에 포함, 수용해도 lawsuitExposure 불변(소송 X).
- 세션 회귀: DAY_PLANS 교체 후 큐 결정론·7일 흐름.

## 10. 리스크·미해결

- **경제 밸런스(I8: |순이익| ≤ 4×예산)**: 내과(−5)+내과 예약 흑자+세분 응급 델타가 스케일을 흔들 수 있다. **부호·방향만 근거, 금액 각색**하고 **브라우저 7일 완주로만** 검증(plan 필수 태스크).
- **외과 부하 집중**: 외과가 TRAUMA+ABDOMINAL 2개 중증을 진다. DAY_PLANS 배치·외과 예약 경쟁으로 조율하되, 과부하로 외과가 "무조건 뽑아야"가 되면 정답-퍼즐. 내과·외과 배치를 여러 날에 분산.
- **정답-퍼즐(내과 소폭 적자)**: 내과가 "덜 아픈 배후과"라 항상 뽑는 정답이 될 수 있다. 방어: 내과 채용비(20)·예약 흑자와 다른 과 예산 경쟁, 고열감염 응급 자체는 적자(3/6).
- **"내과=안전과" 오독**: lawsuitRisk 미구현이 미용처럼 읽힐 위험. `essential=true`+적자+주석으로 방어(§7.2).
- **thesis 정합**: "배후 부재가 벽"이 내과로도 성립(재이송 41.9% [grounding](../../research/internal-medicine-emergency-grounding.md) §3). 기존 essential-care 서술과 톤 정합 확인.

## 11. 0-침습 경계 (안 건드리는 것)

- `adjudicateTransfer`(배후 판정 requiredSpecialty) 무변경 — INTERNAL_MEDICINE도 제네릭 자동 판정.
- `daysim`(시간 원시함수)·`session` 상태기계·`world`·에필로그 장부·`ledger` 소송비용·boarding·야간 당직 구조 유지.
- `handlingDept`(doctor.ts) 무변경 — requiredSpecialty 기반이라 라우팅 자동 계승.

## 12. 스코프 밖 (지금 안 함 — 후속 슬라이스)

- **내과 법적 리스크(소송) 구현** — [grounding](../../research/internal-medicine-emergency-grounding.md) §5의 미래 방향(불확실성·예견가능성 모델). 추가 리서치 선결.
- **회색지대 노이즈 카드**(대동맥박리 사망인데 "뺑뺑이 아니다" 반박), **감염↔심장 처치방향 오분류**, **지연형 고액 소송**(암 17억).
- **내과↔외과 오분류를 플레이어 판단 요소로** — 세분은 결정론적 CallKind로 명확히 갈리고, "겉은 복통인데 정체는 외과" 오분류 메커니즘은 후속.
