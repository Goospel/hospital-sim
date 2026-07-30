---
tags:
  - type/spec
---

# 지역 선택 + 배경(backdrop) — 설계 (2026-07-30)

> **한 줄 요약**: 새 판 시작 시 플레이어가 **지역 4타입 중 하나만** 고르고, 배경은 그 지역의 후보 3종 중 **무작위 1종**이 선택돼 부지 둘레에 정적 캔버스 한 겹으로 그려진다. **이번 슬라이스는 배경만이다** — 지역이 규칙(환자·수가·채용)에 닿는 것은 범위 밖.

## 1. 목적 / 배경

- 사용자 컨셉(2026-07-30): 림월드가 시작 시 지형을 고르듯, 이 게임은 **대한민국의 어느 지역에 병원을 지을지** 고른다. 지역별 의료 시스템의 문제(지역 의료 격차)가 림월드의 지형 역할을 한다.
- 사용자 결정: **플레이어는 지역만 정한다. 배경은 그 지역 후보군(3종)에서 랜덤으로 하나.** 타입별 1안을 고르는 방식이 아니라 12종 전부 게임에 들어간다.
- 시각 시안은 이 세션에서 12종 제작·검수 완료(스크래치패드 `region-backgrounds.html` — 캔버스 절차 생성 코드가 곧 산출물이라 그대로 이식한다).

## 2. 지역 타입과 배경 후보 (확정)

| key | 이름 | 의료 격차 서사(연출 한 줄만 — 규칙 무효) | 배경 3종 (variant 0/1/2) |
|---|---|---|---|
| `URBAN` | 대도시 도심 | 병상 과잉·경쟁, 임대료 | 고층 블록 밀집 / 대로변 / 사거리 코너 |
| `NEWTOWN` | 신도시·중소도시 | 인구 유입, 소아과 대란 | 아파트 단지 / 상업지구+공원 / 계획도로+빈 필지 |
| `PROVINCIAL` | 지방 소도시 | 고령 환자, 의사 구인난 | 저층 주택가 / 읍내+밭 / 하천변 |
| `RURAL` | 농어촌 | 의료 공백, 응급 이송 거리 | 논 / 산기슭 / 해안 어촌 |

### ⚠️ 기존 지역 축과의 관계 — 이름을 공유하지 않는다

`src/game/types.ts`에는 이미 `RegionKey = 'CAPITAL' | 'METRO' | 'RURAL'`(수도권/광역시/지방, [2026-07-26-region-world-sim-design.md](2026-07-26-region-world-sim-design.md))이 있고 **뜻이 다르다**(그쪽 METRO=광역시, 이쪽은 부지 입지). 혼동을 막기 위해:

- 새 타입 이름은 **`SimRegionKey`**, `src/sim/world.ts`에 둔다(타일 시뮬 레이어 소유).
- 값 이름도 `METRO`를 **쓰지 않는다**(위 표의 4개).
- 나중에 지역이 규칙에 닿을 때의 매핑(예: URBAN→CAPITAL, NEWTOWN→METRO, PROVINCIAL·RURAL→RURAL)은 **그 설계의 몫**으로 남긴다 — 지금 매핑 코드를 만들지 않는다(닿지 않는 해상도 금지).

## 3. 데이터 모델 — `src/sim/world.ts`

```ts
export type SimRegionKey = 'URBAN' | 'NEWTOWN' | 'PROVINCIAL' | 'RURAL'

export interface SimWorld {
  // …기존 필드…
  /** 부지가 선 지역 — 이번 슬라이스에서는 배경 선택에만 쓰인다(규칙 무효). */
  region: SimRegionKey
  /** 지역 안에서 뽑힌 배경 변형(0..2) — 새 판 시작 때 한 번 정해지고 그 뒤 불변. */
  backdrop: number
}

export function createWorld(
  seed: number,
  start?: { region?: SimRegionKey; backdrop?: number },
): SimWorld
```

- `createWorld`는 **가산 변경**: 두 번째 인자 생략 시 `{ region: 'URBAN', backdrop: 0 }` — 기존 테스트 전부 무변.
- **무작위의 자리**: 시뮬은 완전 결정론(`Math.random` 0회)이 원칙이지만, 이 무작위는 시뮬이 아니라 **새 판을 여는 UI 이벤트 핸들러**에서 한 번 일어나고 결과가 world에 저장된다 — 이후의 모든 것은 결정론이다. 시드 파생으로 하지 않는 이유: 시드가 1로 고정돼 있어(`SimGame.initialWorld`) 파생하면 지역마다 배경이 영영 한 장으로 굳는다.

## 4. 지역 선택 UI — `SimGame`

- 첫 마운트에 **지역 선택 오버레이**가 뜬다(4장의 카드: 지역명 + 서사 한 줄). 게임은 어차피 일시정지로 시작하므로 뒤 세계는 기본값으로 만들어 두고, 카드를 누르면 `setWorld(createWorld(1, { region, backdrop: Math.floor(Math.random()*3) }))`로 **세계를 갈아끼운다**(정지 상태라 안전).
- 오버레이는 한 번 닫히면 다시 안 뜬다(상태 `useState(false)` 하나). 저장/불러오기가 없는 현재 구조에서 "새 판 = 새로고침"이므로 이것으로 충분하다.
- 카드 문구는 연출이다 — 규칙 차이가 없는 지금, 차이가 있는 것처럼 읽히는 수치·약속을 쓰지 않는다(서사 한 줄만).
- 훅 순서 제약: `world`를 nullable로 만들지 않는다(조기 return이 훅 규칙과 충돌). 기본 세계 + 오버레이 덮기가 최소 diff다.

## 5. 배경 렌더 — `src/components/Backdrop.tsx` (신규, 회화 레이어)

- `<canvas>` 한 장. props `{ region, variant }`, `useEffect`에서 한 번 그리고 끝(폰·시뮬과 무관한 **정적 레이어** — 프레임 비용 0).
- **TileMap의 transform div 첫 자식**으로 둔다: 절대 배치 `left: -12*TILE, top: -8*TILE`, 크기 `72×48타일`(부지 48×32 + 좌우 12·상하 8타일 여백 — 시안과 동일 비율). 카메라 transform을 그대로 상속하므로 줌·팬에 배경이 따라온다. 부모 transform div는 overflow를 안 자르므로 음수 오프셋이 그대로 보인다.
- 그리기 코드는 시안 HTML(`region-backgrounds.html`)의 함수들을 TS로 이식: `grass/roadH/roadV/laneH/sidewalk*/crosswalk/tree/lamp/car/roof/apt/house/dirtLot/fieldDry/paddy/forest/river/sea` + 지역×변형별 조립 함수 12개. `T`는 목업의 10이 아니라 **TILE(16)** 을 쓴다(함수들이 T 파라미터화돼 있어 그대로 통함).
- 팔레트는 시안 그대로(전부 리터럴 hex — PixelSprite·TileMap 회화 레이어 관례): 바탕 `#0b0b0e`, 풀 `#0e120f` 계열, 도로 `#15151b`, 크림 강조 `rgba(216,207,175,α)`.
- 부지 안쪽(중앙 48×32)은 **그리지 않는다** — 그 위에 기존 transform div의 `OUTSIDE_FLOOR`+격자가 이미 있다(배경 캔버스는 뒤에 깔릴 뿐).
- 가장자리 처리: 캔버스 바깥은 페이지 배경(`OUTSIDE_FLOOR #0d0d11`)으로 떨어진다. 바탕색(#0b0b0e)과 거의 같아 이음선이 사실상 안 보인다 — 별도 페이드는 넣지 않는다(필요해지면 바깥 1~2타일 링을 어둡게 뭉개는 것으로 충분).
- 시뮬 좌표·통행 판정에는 **아무 영향 없다**(부지 밖은 애초에 격자 밖).

## 6. 테스트 (TDD 순서)

1. `createWorld(1)` — region/backdrop 기본값(`URBAN`/0), 기존 필드 무변 (Red→Green).
2. `createWorld(1, { region: 'RURAL', backdrop: 2 })` — 저장 확인.
3. `backdrop` 범위 밖(3, -1) 방어 — **clamp가 아니라 0..2로 나머지 연산** 또는 기본값 폴백 중 하나로 확정하고 테스트로 못박기(구현 시 결정, 단 조용한 NaN 금지).
4. Backdrop 컴포넌트·오버레이는 회화 레이어 관례대로 단위 테스트 없음(TileMap·PixelSprite와 동일). 지역 선택이 world에 반영되는 것은 1·2가 커버한다.

## 7. 범위 밖 (명시)

- 지역별 **규칙 차이**(환자 구성·수가·채용 풀·응급 이송) — 다음 설계. 그때 `src/game`의 3계층 세계 시뮬과의 매핑을 함께 정한다.
- 저장/불러오기, 지역 재선택 UI, 줌아웃(zoom<1) 허용, 시드 선택.
- 기존 5종 시안(A~E, [background-concept-status] 메모리) — 12종 체계로 대체됐다(A≈1b·C≈1a 등 겹치는 안은 12종 쪽 채택).

## 8. 구현 파일 요약

| 파일 | 변경 |
|---|---|
| `src/sim/world.ts` | `SimRegionKey`, `SimWorld.region/backdrop`, `createWorld` 두 번째 인자 |
| `src/sim/world.test.ts` | §6의 1~3 |
| `src/components/Backdrop.tsx` | 신규 — 캔버스 배경 12종 |
| `src/components/TileMap.tsx` | `region`/`backdrop` props 추가, transform div 첫 자식으로 `<Backdrop>` |
| `src/components/SimGame.tsx` | 지역 선택 오버레이 + `createWorld(1, …)` 갈아끼우기, TileMap에 props 전달 |
| `claude-docs/plan.md`, `claude-docs/changeLog.md` | 규약대로 갱신 |
