---
tags:
  - type/spec
---

# 지역 세계 시뮬 — 최소 슬라이스 설계 (2026-07-26)

> **한 줄 요약**: 지역 3계층(수도권/광역시/지방)의 과별 의사 수를 매주 결정론 드리프트 + 이벤트 쇼크로 굴리고, 그 결과를 **전원 콜 구성**과 **채용 풀** 두 채널로만 플레이어에게 번역한다. 주제 ③ 지방 의료 공백의 첫 메커니즘 구현.

## 1. 목적 / 배경

- 게임의 3대 주제(뺑뺑이·필수의료 붕괴·지방 의료 공백) 중 **③ 지방 의료 공백만 미구현**이다. 지역 세계 시뮬이 이를 메커니즘으로 구현하는 첫 슬라이스다.
- 이미 채택된 방향의 실행이다: [ai-scenario-generation.md](../../concept/ai-scenario-generation.md)의 3단 루프("병원 N곳 역량 → 외생 이벤트 → 파급을 세계에 반영"), [plan.md](../../../claude-docs/plan.md)의 ⏸ "지역 집계 장부"·"다병원 지역 집계".
- **범위 결정(사용자, 2026-07-26)**: 제출(8/10)용 **최소 슬라이스**. 출력 채널은 **전원 콜 구성 + 채용 풀** 2개. 구동 방식은 **드리프트 + 이벤트 쇼크 혼합**.

### 설계 원칙 (이 저장소의 기존 결정에서 상속)

1. **채널에 닿지 않는 해상도는 만들지 않는다** — 세계 상태는 두 채널을 구동하는 데 필요한 최소만. "색만 얹기"([entity-implementation-priority.md](../../concept/entity-implementation-priority.md)의 tier 비판) 금지.
2. **완전 결정론** — `seededUnit` 재사용, `Math.random`·`Date.now` 0회 유지.
3. **헌법 준수** — 세계 레이어는 `adjudicateTransfer`·`Hospital`·판정 경로에 타입 수준에서 손이 닿지 않는다([2026-07-18-world-event-slice-design.md](2026-07-18-world-event-slice-design.md) §헌법).
4. **이중 기재 금지** — 파생 가능한 값은 저장하지 않는다. 같은 변동을 두 시스템이 굴리지 않는다.

## 2. 데이터 모델 — [world.ts](../../../src/game/world.ts) 확장

```ts
type RegionKey = 'CAPITAL' | 'METRO' | 'RURAL'   // 수도권 / 광역시 / 지방

interface RegionState {
  key: RegionKey
  doctors: Record<Specialty, number>   // 지역 내 필수과 의사 수 (집계, 개체 아님)
  hospitals: number                    // 응급 수용 병원 수
}

interface WorldState {
  departments: DepartmentSpec[]        // 기존 그대로
  regions: RegionState[]               // 신규 — 항상 3개, CAPITAL/METRO/RURAL 순
}
```

- **파생값 (저장 금지)**: `backupHospitals(region, dept) = min(region.hospitals, floor(region.doctors[dept] / 2))` — 배후 병원 하나가 서려면 그 과 의사 2명. 플레이어 병원의 `ROUND_THE_CLOCK_MIN_DOCTORS ≥ 2`([receiving.ts](../../../src/game/receiving.ts))와 동일 규칙을 세계에 적용한 것.
- **초기값**: 리서치 근거([domain-entities-detail.md](../../concept/domain-entities-detail.md)의 응급의료취약지·지역격차 절)와 게임 밸런스를 절충해 상수 카탈로그로 둔다. 정확한 수치는 구현 계획에서 테스트와 함께 확정하되, **불변식**은 여기서 못박는다:
  - 시작 시점에 RURAL의 과별 의사 수는 CAPITAL보다 적다.
  - 시작 시점에 RURAL의 `backupHospitals`는 모든 필수과에서 ≥ 1 (0에서 시작하면 붕괴가 "과정"이 아니라 "전제"가 된다).
  - 전국 합계는 기존 `POOL_INITIAL`(흉부 2/순환기 4/산부 3/신경 3/외과 5/내과 6)과 **일관된 규모**여야 한다 — §6 채용 풀 승격 참조.

## 3. 드리프트 엔진 — `stepWorld(world, week): WorldState` 순수 함수

매주 1회 호출. 시드는 `week` 파생(기존 `callSeed` 계열 재사용).

- **의사 이동**: 매주 RURAL → CAPITAL로 1~2명. 빠지는 과는 시드 + **`lawsuitRisk` 가중 추첨** — 소송 위험 높은 과(산부·흉부)가 지방을 먼저 떠난다. 기존 `DepartmentSpec.lawsuitRisk`를 재활용하므로 새 파라미터가 없고, "필수과가 먼저 무너진다"가 규칙에서 창발한다.
- **비대칭이 필연을 만든다**: 의사는 줄지만 환자 발생(응급 콜 수)은 줄지 않는다 — 격차가 스스로 벌어진다. 게임 철학 "쟁취가 아니라 필연"의 수학적 형태.
- **`backgroundAttrition` 대체**: 기존 [system.ts](../../../src/game/system.ts)의 매주 전국 풀 1 감소는 이 시스템에 **흡수·삭제**한다. 같은 변동을 두 군데서 굴리면 이중 기재다.
- **하한**: 각 수치는 0 밑으로 내려가지 않는다. `hospitals`는 드리프트로 변하지 않는다(이벤트로만 변동 — §4).

## 4. 이벤트 쇼크 — `applyEvent` 확장

- 기존 `DeptEffect`(비용 델타)에 더해 **`RegionEffect`** 를 추가한다:

```ts
// 판별 유니온 — field가 태그다. 유니온으로 잠금: 판정 경로 침범 불가.
type RegionEffect =
  | { region: RegionKey; field: 'doctors'; dept: Specialty; delta: number }
  | { region: RegionKey; field: 'hospitals'; delta: number }
```

> 📌 **판별 유니온으로 승격**(2026-07-26 구현 중): 초안은 `field: 'doctors' | 'hospitals'` + `dept?: Specialty`("field가 doctors일 때 필수")였다. 그 조건부 필수성은 타입으로 강제되지 않아, `field:'doctors'`인데 `dept`를 빼먹으면 tsc가 통과하고 `applyEvent`의 `else if (e.dept)` 가드에 걸려 **조용히 no-op**이 된다(에러·경고 없음). 판별 유니온이면 그 조합이 표현 불가라 무성 실패의 원천이 사라지고, `applyEvent`의 조건 가드도 불필요해진다.

- 기존 세계 이벤트 카탈로그([world.ts](../../../src/game/world.ts))에 지역 효과를 가진 이벤트를 소수 추가한다(예: "○○도 거점병원 응급실 축소" → RURAL hospitals −1).
- **헌법 유지**: 이벤트가 만질 수 있는 것은 `departments` 비용 필드 + `regions` 수치뿐. `adjudicateTransfer`·`Hospital`·`providesBackup`은 여전히 타입 수준 불가침.

## 5. 채널 ① 전원 콜 구성 — [receiving.ts](../../../src/game/receiving.ts)

- 순수 파생 함수 `transferPressure(world)`가 세계 상태를 콜 생성 파라미터로 번역한다: RURAL의 `backupHospitals` 합이 줄수록 **원거리 전원 콜 비중과 중증 구성**이 올라간다.
- `createCallQueue(day, beds)` → `createCallQueue(day, beds, pressure)`로 시그니처 확장. 응급 스트림의 **콜 총수는 고정 유지**(기존 밸런스 결정 — 늘리면 신문·소송 배수로 결말 마비). 바뀌는 것은 구성뿐: 어느 지역발(發)인지, 중증도 믹스.
- `IncomingCall`에 `originRegion?: RegionKey` + 표시용 `originLabel?: string`을 추가. UI 콜 카드에 "△△군에서 전원 요청"이 뜬다 — 플레이어는 주차가 갈수록 **점점 먼 곳에서, 점점 나쁜 상태로** 오는 것을 콜 화면에서 직접 본다.
  - ✏️ **구현 중 정정 ①(발신 지명의 출처)**: 초안은 *"[news.ts](../../../src/game/news.ts)의 `FICTIONAL_REGIONS` 재사용"*이었다 → 실제로는 `world.ts`에 **`REGION_LABELS` 신설**이고, news.ts의 `FICTIONAL_REGIONS`와 **이름이 겹치지 않아야 한다**. 이유: news의 지명은 *다른 병원이 있는 도시*이고 REGION_LABELS는 *전원을 보내는 지역*이라 역할이 다른데, 같은 가공 도시가 두 상수에 살면 한쪽을 고칠 때 다른 쪽이 조용히 어긋나는 **이중 기재**다. 계획서 초안이 실제로 이 함정을 밟아(한내시·금하시 중복) 사람이 알아채 고쳤으므로, `world.test.ts`에 **비중복 검사기**를 세워 규약을 코드로 강제했다(`FICTIONAL_REGIONS`의 export는 그 테스트 전용 노출).
  - ✏️ **구현 중 정정 ②(중증도의 실제 도달 범위)**: *"점점 나쁜 상태로"*의 데이터 층은 RURAL발 응급의 `severity + 1`이지만, **응급 4종(STEMI·산과·신경외과·중증외상)은 이미 상한(`SEVERITY_MAX` = 5)이라 승격이 먹힌다** — 실질적으로 오르는 건 급성복증(4)·고열감염(3) **2종**뿐이다. 그래서 이 슬라이스에서 플레이어에게 **UI로 도달하는 축은 중증도 수치가 아니라 발신 지역**이다: RURAL발 콜에 「원거리 이송」 표기([CallCard.tsx](../../../src/components/CallCard.tsx)). 중증도 표시는 범위 밖(§9) — 승격을 체감시키려면 응급 종류 확충이나 상한 재설계가 먼저다.
- `originRegion`은 **표시 + 구성 결정까지만** 쓰이고 판정(`adjudicateTransfer`·`startMinFor`)에는 들어가지 않는다 — 거리·이송시간 축은 범위 밖(§9).

## 6. 채널 ② 채용 풀 — [system.ts](../../../src/game/system.ts)

- `SystemState.pool`의 **원천을 세계로 승격**: 전국 채용 가능 풀 = `regions` 의사 수의 파생값(과별 합산에 채용 가능 비율을 적용한 결정론 파생). 매주 델타는 `backgroundAttrition` 대신 `stepWorld` 결과에서 나온다.
- **인터페이스**: `canHire`/`poolRemaining`의 시그니처와 소비자(GROWTH 페이즈, [candidates.ts](../../../src/game/candidates.ts) 경로)는 그대로. 원천만 바뀐다.
  > 📌 **구현 중 정정**(2026-07-27): 초안은 `hireDelta`도 유지 대상으로 적었으나, 채용 차감의 원천이 세계(`hireFromRegions` + `deriveSystem` 재파생)로 넘어가면서 `hireDelta`는 **완전 삭제**됐다 — pool을 직접 깎는 함수가 남아 있으면 "pool ≡ hirablePool(regions)" 불변식을 우회하는 두 번째 쓰기 경로가 된다(이중 기재).
- 플레이어가 채용하면 시드 추첨된 지역에서 차감된다(전국 합계·지역 합의 일관성 유지).
- 체감: "지방이 무너질수록 나도 사람을 못 뽑는다"가 채용 화면에서 보인다.

## 7. 통합 지점 — [session.ts](../../../src/game/session.ts)

- `stepWorld` 호출은 **주 경계 1회**, WORLD_EVENT 페이즈 진입 경로 — 구체적으로는 `nextWeek`(2주차+)에서. 1주차 진입(`enterWorldEvent`)은 아래 셋째 줄대로 드리프트를 굴리지 않는다. 새 페이즈 없음. [ai-scenario-generation.md](../../concept/ai-scenario-generation.md) §5-4의 "주기 = 주 사이" 확정과 일치.
- 순서: `stepWorld`(드리프트) → 이벤트 추첨·`applyEvent`(쇼크) → 그 주의 `transferPressure`·채용 풀은 갱신된 세계에서 파생.
- 1주차(첫 WORLD_EVENT)에도 드리프트를 1스텝 굴릴지는 구현 계획에서 결정하되, 기본값은 **굴리지 않음**(초기값 = 1주차 세계; 변동은 2주차부터 체감).

## 8. 테스트 전략

기존 패턴(모듈별 `*.test.ts`, vitest, TDD) 그대로:

- `world.test.ts` 확장 — `stepWorld` 결정론(같은 입력 = 같은 출력), 하한 불변식, `lawsuitRisk` 가중이 실제로 산부·흉부를 먼저 빼는지, `RegionEffect` 적용·경계.
- `receiving.test.ts` — `transferPressure` 파생 단조성(배후 감소 → 압력 증가), 콜 총수 불변, `originRegion` 부여.
- `system.test.ts` — 풀 파생 일관성(전국 합계 = 지역 합), `canHire` 회귀.
- 결정론 회귀: 고정 시드 세션 N주 진행 스냅샷.

## 9. 범위 밖 (명시적 보류 — 본선 확장 경로)

- 지역 지도 UI · 병원 개체 단위 시뮬 · 거리/이송시간이 판정에 개입하는 축 · 플레이어 병원의 지역 선택/이전.
- 신문 헤드라인 연동: 채널로 선정하지 않았으므로 제외. 단 `stepWorld` 결과를 한 문장으로 요약해 WORLD_EVENT 화면에 흘리는 것은 비용이 거의 0이라, 구현 중 여유가 있을 때만 붙이는 **선택 후보**로 남긴다.

## 10. 구현 분업

- 설계: Fable(이 문서). 구현: Opus 서브에이전트(글로벌 모델 분업 규칙 + 훅 하드가드).
