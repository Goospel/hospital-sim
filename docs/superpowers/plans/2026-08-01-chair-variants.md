---
tags:
  - type/plan
---

# 의자 변종 구현 계획 (아트 디렉션 ②-a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플레이어가 의자를 놓을 때 5종(스툴·플라스틱·벤치·소파·리클라이너) 중 하나를 골라 놓게 한다 — 외형만 다르고 기능·가격은 전부 같다.

**Architecture:** `FurnitureKind`를 쪼개지 않고 `Furniture`에 **선택 필드 `variant`**를 단다. 시뮬 코어는 이 필드를 한 번도 읽지 않는다 — 그게 "외형만 다르다"를 규칙이 아니라 **구조**로 보장한다. 건설 도구는 8개 그대로이고, `CHAIR`를 고르면 팔레트 아래에 변종 줄이 열린다. 표시층은 의자를 **두 번** 그리므로(가구 층 + 앉은 폰 위 좌면 앞단) 변종별 좌면 도형을 한 곳에 두고 둘이 공유한다.

**Tech Stack:** TypeScript · React 19 · 인라인 SVG 스프라이트 · vitest(DOM 없음)

**선행 스펙:** [의자 변종 설계](../specs/2026-07-31-chair-variants-design.md)

---

## 0. 착수 전 실측 — 이 계획이 서 있는 사실들

구현자는 아래를 **다시 조사하지 말고** 그대로 전제한다. 8개 서브에이전트가 전수로 확인한 것이다(2026-08-01).

| 사실 | 근거 | 계획에 준 영향 |
|---|---|---|
| 세이브 시스템이 **없다** | `src` 전체에 `localStorage`/`sessionStorage` 0건, `SimWorld` 직렬화 경로 0건 | 스펙 §3의 「기존 세이브가 그대로 열린다」는 **근거 없는 문장**이다. 마이그레이션에 시간을 쓰지 않는다 (Task 5에서 스펙을 고친다) |
| `kind === 'CHAIR'` 검사는 프로덕션 8곳, **전부 `kind`만 읽는다** | `world.ts:398` `blocksWalk` · `spots.ts:104` · `patientFlow.ts:151` · `patientFlow.ts:254` · `needs.ts:211` · `needs.ts:221` · `TileMap.tsx:397` · `TileMap.tsx:737` | variant를 달아도 **수정 0곳**. 스펙 §3의 주장이 코드로 확인됐다 |
| `build.test.ts:146`·`:424`가 가구 배열을 `toEqual`로 깊은 비교 | 저장소 전체에 `toStrictEqual` 0건 → vitest `toEqual`은 `undefined` 키를 무시 | **코어가 기본값을 채우면 두 테스트가 깨진다.** 미지정이면 `variant` 키를 아예 안 만든다 |
| 좌면 앞단 오버레이가 `seatTiles`(좌표 문자열 Set)를 읽는다 | `TileMap.tsx:396-399` → `885-897` | variant가 소실된다. **Map으로 바꿔야** 앉은 소파 위에 플라스틱 의자 좌면이 안 깔린다 |
| 그 Set을 spread하는 곳은 **885행 한 줄뿐** | `758`은 `.has()`라 Map에서도 동일 동작 | 집합을 둘로 가르지 말고 `[...m]`의 destructure만 고친다 |
| `simHud.test.ts:548-550`이 `BUILD_TOOLS` 길이 8·라벨 유일 8을 잠근다 | — | 「도구를 안 늘린다」가 이미 그물에 걸려 있다. 새 테스트를 쓸 필요 없다 |
| `npm test`는 **transpile-only라 타입 에러를 못 잡는다** | `.github/workflows/ci.yml:49-51` | `Furniture`에 필드를 더한 뒤 **반드시 `npm run build`**까지 돌린다 |
| 회귀 기준선 = **47 files / 1557 tests 전건 통과** | 이 워크트리 실측(2026-08-01) | 작업 후 이 수보다 줄면 파일이 빠진 것이다 |
| `testHelpers.runsByKind`가 `kind`로만 런을 묶어 variant를 버린다 | `testHelpers.ts:160-167` | **픽스처를 건드리지 않는다**(`build.test.ts:421-428`·`451-454`가 그 좌표를 실측으로 잠갔고 프로브도 이 헬퍼를 탄다) |
| 맵·오버레이·의자가 전부 `aria-hidden` | `TileMap.tsx:733`·`892`, `HospitalMap.tsx:260` | 접근성 새 표면은 **변종 버튼뿐**. `aria-pressed` 관례만 따른다 |
| `core.hooksPath`가 워크트리가 아니라 **메인 저장소** `.githooks`를 가리킨다 | 실측 | 훅 동작을 바꿀 생각을 하지 않는다(고쳐도 안 걸린다) |

### 이미 결정된 것 — 구현자가 다시 고민하지 않는다

- **변종은 sticky다**(도구를 바꿨다 돌아와도 유지). `roomType`·`examDept`를 비우는 세 곳(`SimGame.tsx:317-322`·`596-601`·`941-947`)에 **네 번째 줄을 더하지 않는다.** 이유: 그 셋은 *"안 고른 값으로 클릭이 열린다"*를 막는 장치인데, 변종은 기본값이 **늘 무장돼 있어** 그 위험이 애초에 없다. 대기실 한 줄을 같은 의자로 채우는 것이 정상 조작이라 매번 리셋되면 방해만 된다.
- **가격은 5종 전부 같다**(스펙 §5). `BUILD_COST`는 `Record<FurnitureKind|'WALL'|'DOOR', number>`라 변종 키를 받을 수 없고, 받게 고치면 `build.test.ts:22`의 객체 전체 동등이 깨진다. **손대지 않는다.**
- **`blocksWalk`를 variant로 가르지 않는다.** 벤치가 통행을 막게 하는 순간 경로·좌석 계약이 통째로 흔들린다.
- **아트 20색과 도형은 아래 §1에서 확정됐다**(휘도·색상 검산 + 5×6 크기 래스터 실측 완료). 구현자는 값을 **그대로 옮긴다**.

---

## 1. 확정 아트 — 20색과 도형

### 1-1. 팔레트

램프 폭은 현행 의자에서 역산한 **휘도 가산**이다(accent +30.9 · seat −9.1 · leg −15.7). 채널 곱을 쓰면 밝은 몸체에서 accent가 사람 톤을 넘어 실패했다.

| 변종 | body | accent | seat | leg | body 휘도 | 색상/채도 |
|---|---|---|---|---|---|---|
| STOOL | `#7b5f3e` | `#a27d51` | `#705638` | `#675034` | 98.6 | 32° / 33% |
| PLASTIC | `#3d4550` | `#5b6470` | `#343c46` | `#2f353e` | 68.1 | 215° / 13% |
| BENCH | `#586a78` | `#728a9c` | `#50616d` | `#4b5a66` | 103.2 | 206° / 15% |
| SOFA | `#3f5a54` | `#567b73` | `#38504b` | `#334944` | 83.8 | 167° / 18% |
| RECLINER | `#5a3c3a` | `#845855` | `#4e3432` | `#452e2c` | 66.2 | 4° / 22% |

**PLASTIC 네 값은 현행 `ChairSprite`의 값 그대로다** — 기본 변종의 픽셀이 한 점도 안 바뀐다.

검산 결과(전부 통과):
- 램프 방향 `accent > body > seat > leg`, **최소 단차 6.49**(스툴의 좌면−다리 · 89.36 − 82.87)
- 몸체 최대 103.2 < 간호사 가운 144.8 (여유 41.6) — 「집기 톤은 사람보다 낮게」
- 쌍 10개 전부 **ΔL ≥ 12 또는 (양쪽 채도 ≥ 12% 그리고 Δ색상 ≥ 40°)**

⚠️ **채도 하한이 이 계약의 핵심이다.** 그것 없이 색상만 보면 **무채색 벤치가 색상 178°로 스툴과 갈린다고 주장**하는데, 채도 4%에서 색상은 뜻이 없다 — 통과하는 단언이 아무것도 안 지키는 [T-144](../../../claude-docs/troubleshooting/T-144.md)의 형태다. 실제로 첫 후보 `#6a6e72`(채도 3.8%)가 이 함정에 걸려 지금 값으로 바꿨다.

### 1-2. 실루엣 — 스펙 §7의 미해결을 실측으로 닫는다

5종 × 16/20/24/32/48/96px를 4개 바닥 위에 래스터해 확인했다(헤드리스 Chrome).

| 변종 | 실루엣 신호 | 판정 |
|---|---|---|
| STOOL | **원형·등받이 없음·가장 작다** | 24px에서 즉시 갈린다 |
| PLASTIC | 각진 사각 + 등받이 띠 + 다리 2 | 현행 그림 |
| BENCH | **타일 폭을 꽉 채우고 좌우 잉크선이 없다** — 나란히 놓으면 실제로 하나로 이어진다 | 4칸 실측 확인 |
| SOFA | 팔걸이 + 등쿠션이 **이어진 U자 밝은 천**, 다리 없음 | 팔걸이를 몸체색으로 뒀을 땐 24px에서 녹색 덩어리였다 → accent로 바꿔 해결 |
| RECLINER | 머리받침이 **위로**, 발받침이 **아래로** 삐져나온다 | 소파와 폭·세로 실루엣이 갈린다 |

스펙 §7의 *"소파와 리클라이너가 24px에서 구별되는가"* → **구별된다**(색상 163° + 실루엣 축이 다르다). 16px은 실사용보다 불리한 최악 조건이다 — 실제 화면은 `16 × fit × zoom`이고 1920×1080에서 fit ≈ 2.0이라 기본 타일이 ~32px다.

---

## 2. 파일 구조

| 파일 | 무엇을 진다 |
|---|---|
| `src/sim/world.ts` | `ChairVariant` 타입 · `Furniture.variant` (데이터 모양의 단일 출처 — 스펙 §0) |
| `src/sim/build.ts` | `placeFurniture`의 4번째 인자 (가구를 만드는 유일한 프로덕션 지점) |
| `src/components/simHud.ts` | `CHAIR_VARIANTS` · `CHAIR_VARIANT_LABEL` · `DEFAULT_CHAIR_VARIANT` (목록·라벨 — `BUILD_TOOLS`/`TOOL_LABEL`과 같은 자리. DOM 테스트가 없어 JSX에 두면 아무도 못 겨눈다) |
| `src/components/PixelSprite.tsx` | `CHAIR_PALETTE` 20색 · 변종별 도형 · `ChairSprite`/`ChairSeatFrontSprite`의 `variant` 인자 |
| `src/components/TileMap.tsx` | `seatTiles`를 Map으로 · 두 렌더 지점에 variant 전달 |
| `src/components/SimGame.tsx` | `chairVariant` 상태 · 변종 줄 JSX · `runTool` 전달 |

**새 파일 없음.** 변종은 기존 축(가구 종류·도구 팔레트·스프라이트)에 얹히는 속성이지 새 서브시스템이 아니다.

---

## Task 1: 코어 — `ChairVariant` 타입과 `placeFurniture` 통과

**Files:**
- Modify: `src/sim/world.ts:208-213`
- Modify: `src/sim/build.ts:110-119`
- Test: `src/sim/build.test.ts` (파일 끝에 새 describe)

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/sim/build.test.ts` 맨 끝에 붙인다. 파일 머리의 import에 `type ChairVariant`를 더한다:

```ts
import { createWorld, isWalkable, tileIndex, GRID_W, blocksWalk, type ChairVariant, type FurnitureKind, type RoomType, type SimWorld } from './world'
```

(`blocksWalk`가 이미 임포트돼 있으면 중복해서 넣지 않는다.)

```ts
/*
  ── 의자 변종 ──────────────────────────────────────────────────────────────
  `variant`는 **선택 필드**다. 그 선택성이 계약인 이유가 이 describe의 절반이다:
  코어가 기본값을 채우면 가구 배열을 통째로 비교하는 회귀(위 146·424행)가 깨지고,
  읽는 쪽이 「없음」과 「기본값」 둘을 구별해야 한다. 기본값은 **읽는 쪽에서** 접는다.
*/
describe('의자 변종 — 겉모습만 싣고 규칙은 안 건드린다', () => {
  const ALL: ChairVariant[] = ['STOOL', 'PLASTIC', 'BENCH', 'SOFA', 'RECLINER']

  it.each(ALL)('%s를 넘기면 그 값이 가구에 실린다', (v) => {
    const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]), v)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.furniture).toEqual([{ kind: 'CHAIR', x: 5, y: 5, variant: v }])
  })

  it('안 넘기면 **키 자체가 없다** — undefined를 채우면 깊은 비교 회귀가 깨진다', () => {
    const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.world.furniture[0])).toEqual(['kind', 'x', 'y'])
  })

  it('의자가 아닌 가구는 변종을 안 받는다 — 「소파 책상」이 데이터에 생길 자리를 없앤다', () => {
    for (const kind of ['DESK', 'BED', 'COUNTER'] as const) {
      const r = placeFurniture(createWorld(1), kind, pts([5, 5]), 'SOFA')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(Object.keys(r.world.furniture[0]), kind).toEqual(['kind', 'x', 'y'])
    }
  })

  it('드래그 여러 칸이면 전부 같은 변종이 실린다', () => {
    const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5], [6, 5], [7, 5]), 'BENCH')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.furniture.map(f => f.variant)).toEqual(['BENCH', 'BENCH', 'BENCH'])
  })

  /* 아래 셋이 **「외형만 다르다」(②-a)의 실체**다 — 규칙 세 축이 변종에 무감각함을 실제로 잰다.
     ②-b에서 안락함이 붙으면 이 셋 중 무엇이 갈리는지가 그 설계의 범위가 된다. */
  it('가격이 변종과 무관하다 — 외형이 값을 가르면 선택이 아니라 손해가 된다(스펙 §5)', () => {
    for (const v of ALL) {
      const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]), v)
      // 기준선을 **절대값에 묶는다** — 다른 호출과 비교하면 「둘 다 맞음」과 「둘 다 똑같이
      // 틀림」이 구별되지 않는다(placeFurniture가 통째로 죽어도 0 === 0으로 초록이었다 · T-144).
      expect(r.deltaManwon, v).toBe(-BUILD_COST.CHAIR)
    }
  })

  it('철거 환불도 변종과 무관하다 — 환불은 `kind`에서 파생한다', () => {
    for (const v of ALL) {
      const built = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]), v)
      expect(built.ok).toBe(true)
      if (!built.ok) return
      const gone = demolish(built.world, pts([5, 5]))
      expect(gone.deltaManwon, v).toBe(refundOf('CHAIR'))
    }
  })

  it('통행 판정이 변종에 무감각하다 — 벤치가 길을 막으면 좌석·경로 계약이 통째로 흔들린다', () => {
    for (const v of ALL) {
      expect(blocksWalk({ kind: 'CHAIR', x: 0, y: 0, variant: v }), v).toBe(false)
      const r = placeFurniture(createWorld(1), 'CHAIR', pts([5, 5]), v)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(isWalkable(r.world, 5, 5), v).toBe(true)
    }
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

실행: `npx vitest run src/sim/build.test.ts`
기대: `ChairVariant`가 없다는 트랜스파일 에러 또는 `variant` 단언 실패로 **RED**. 위 8개 중 「키 자체가 없다」·「가격 무관」·「환불 무관」 셋은 지금도 통과할 수 있다(아직 아무것도 안 실으니까) — 나머지가 빨간지 확인한다.

- [ ] **Step 3: `world.ts`에 타입을 낸다**

`src/sim/world.ts:208`의 `FurnitureKind` 줄 **아래**에 넣고, `Furniture`를 아래로 교체한다:

```ts
export type FurnitureKind = 'DESK' | 'CHAIR' | 'BED' | 'COUNTER'

/**
 * 의자의 겉모습 — **종류가 아니라 하위 속성**이다(설계 §3).
 *
 * 새 `FurnitureKind`로 쪼개지 않은 이유: `kind === 'CHAIR'` 검사가 프로덕션에만 여덟 곳이고
 * (`blocksWalk`·`spots`·`patientFlow`×2·`needs`×2·`TileMap`×2), 하나라도 집합 검사로 못 바꾸면
 * **앉을 수 없는 소파**가 생기는데 그 버그는 에러 없이 조용하다 — 화면엔 의자가 있는데 폰이 안 앉는다.
 * `variant`는 그 여덟 곳을 **전부 무변으로** 통과한다.
 *
 * ⚠️ **시뮬은 이 필드를 한 번도 읽지 않는다.** 그게 "외형만 다르다"(②-a)를 규칙이 아니라 구조로
 * 보장하는 자리다 — 기능 차이는 ②-b에서 안락함 수치로 들어온다.
 */
export type ChairVariant = 'STOOL' | 'PLASTIC' | 'BENCH' | 'SOFA' | 'RECLINER'

/** 집기 한 점 — **소속 필드가 없다**(설계 §1-1). 이 가구가 어느 방의 것인지는 좌표가 말한다:
 *  `regions.computeRegions`가 낳은 영역 중 이 타일을 담은 것이 곧 이 가구의 방이다.
 *  옛 `roomId`를 지운 이유는 이중 기재다 — 벽을 옮겨 영역이 갈라지거나 합쳐지면 그 필드는
 *  갱신할 자리가 없어 조용히 낡고, 그때부터 화면의 방과 규칙의 방이 달라진다. */
export interface Furniture {
  kind: FurnitureKind
  x: number
  y: number
  /** 의자에만 실린다. **미지정이면 키를 만들지 않는 것이 계약이다** — 이유는 둘이다:
   *  ① 진짜 기본값을 채우면 가구 배열을 통째로 비교하는 회귀가 깨진다(EXAM 자동 가구).
   *  ② 읽는 쪽이 「없음」과 「기본값」 둘을 구별해야 한다.
   *  ⚠️ 반면 `undefined`를 **값으로** 싣는 것은 그 회귀가 **못 잡는다** — vitest `toEqual`이
   *  undefined 키를 무시하고 이 저장소엔 `toStrictEqual`이 0건이다(돌연변이 실측). 그래서
   *  build.test의 `Object.keys` 단언이 그 경로의 **유일한 가드**다 — 「깊은 비교가 이미
   *  잡으니 중복」이라 판단해 지우면 안 된다(T-145).
   *  기본값은 그리는 쪽이 접는다(PixelSprite.ChairSprite). */
  variant?: ChairVariant
}
```

> ⚠️ **이 계획서가 처음에 틀렸던 자리다**(2026-08-01 품질 리뷰가 잡음). 옛 판은 *"`undefined`를 채워 넣으면 깊은 비교 회귀가 깨진다"*라고 적었는데 **반대**다 — `toEqual`은 undefined 키를 무시해 안 깨지고, 잡는 것은 `Object.keys` 단언 하나뿐이다. §0 표에는 「기본값을 채우면」이라고 맞게 적혀 있었는데 인라인 주석으로 옮기며 뒤집혔다. 틀린 이유는 없는 이유보다 나쁘다 — 그 주석을 믿으면 유일 가드를 「중복」이라 지우게 된다(T-145의 사고 그대로).

- [ ] **Step 4: `build.ts`가 그 값을 흘려보내게 한다**

`src/sim/build.ts:6`의 import에 `type ChairVariant`를 더한다:

```ts
import { GRID_W, GRID_H, tileIndex, type ChairVariant, type FurnitureKind, type RoomType, type SimWorld, type ZonePaint } from './world'
```

`placeFurniture`(110-119행)를 교체한다:

```ts
/** 가구 — 벽과 같은 부분 설치 규칙. 마당에도 놓인다(기능은 용도 영역 안에서만 — 경고가 잡는다).
 *
 *  `variant`는 **의자에만, 넘어왔을 때만** 실린다. 미지정에 기본값을 채우지 않는 이유는
 *  `Furniture.variant` 주석에 있다(깊은 비교 회귀 + 「없음」과 「기본값」의 이중 표현). */
export function placeFurniture(
  w: SimWorld,
  kind: FurnitureKind,
  tiles: readonly Pt[],
  variant?: ChairVariant,
): PlaceResult {
  return install(w, tiles, kind, (world, targets) => ({
    ...world,
    // 요청 순서를 그대로 유지한다 — 가구 배열 순서가 스팟 선택의 타이브레이크다(spots.ts).
    furniture: [...world.furniture, ...targets.map(i => {
      const at = { kind, x: i % GRID_W, y: (i - (i % GRID_W)) / GRID_W }
      // 의자가 아니면 버린다 — 「소파 책상」이 데이터에 생길 자리를 아예 없앤다.
      return kind === 'CHAIR' && variant !== undefined ? { ...at, variant } : at
    })],
  }))
}
```

- [ ] **Step 5: 통과를 확인한다**

실행: `npx vitest run src/sim/build.test.ts`
기대: 전건 PASS. 기존 `toEqual` 회귀(146·424행)도 그대로 초록이어야 한다 — 빨개졌다면 어딘가에서 기본값을 채운 것이다.

- [ ] **Step 6: 커밋**

`.commit-msg-tmp`(UTF-8, BOM 없음)에 쓰고 `git commit -F .commit-msg-tmp`. 트레일러는 `Skills-used:`부터 `Co-Authored-By:`까지 **빈 줄 없이 연속**이다.

```
feat: 의자에 variant 선택 필드 — 종류를 쪼개지 않고 겉모습만 나눈다

FurnitureKind를 늘리면 kind === 'CHAIR' 검사 여덟 곳을 전부 집합 검사로
바꿔야 하고, 하나만 빠뜨려도 「앉을 수 없는 소파」가 에러 없이 생긴다.
선택 필드는 그 여덟 곳을 무변으로 통과한다.

미지정에 기본값을 안 채우는 것이 계약이다 — 채우면 가구 배열을 통째로
비교하는 회귀가 깨지고, 읽는 쪽이 「없음」과 「기본값」을 구별해야 한다.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 「키를 안 만든다」를 먼저 단언해 기본값 채우기 유혹을 구조로 막음
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 2: 변종 목록과 라벨 (simHud)

**Files:**
- Modify: `src/components/simHud.ts:565-577` 부근(`BUILD_TOOLS`/`TOOL_LABEL` 바로 아래) · `:1390`(`TOOL_HINT.CHAIR`)
- Test: `src/components/simHud.test.ts` (「건설 도구 — 라벨·비용·조작」 describe 바로 뒤)

**왜 여기인가:** 이 저장소엔 DOM 테스트가 없다(jsdom·testing-library 미설치). 목록·라벨·기본값을 JSX에 두면 **어떤 테스트도 그 계약을 겨눌 수 없다** — `simHud.ts` 머리말이 정확히 그 이유를 적어 뒀다.

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/components/simHud.test.ts`의 import 블록에 더한다: `CHAIR_VARIANTS, CHAIR_VARIANT_LABEL, DEFAULT_CHAIR_VARIANT`. `../sim/world` import 블록에는 `type ChairVariant`.

「건설 도구 — 라벨·비용·조작」 describe 바로 뒤에 붙인다:

```ts
/*
  ── 의자 변종 줄 ────────────────────────────────────────────────────────────
  도구는 여덟 그대로이고 변종은 그 **아래**에 열린다(설계 §4). 변종마다 도구를 만들면
  `BuildTool`↔`FurnitureKind` 동일성이 깨지고 매핑 표가 하나 더 생긴다 —
  종류가 늘수록 나빠지는 구조라, 위 describe의 `toHaveLength(8)`이 그 벨트로 남는다.
*/
describe('의자 변종 — 목록·라벨·기본값', () => {
  it('다섯 종이 전부 이름을 갖고 서로 다르다 — 이름 없는 버튼이 줄에 서지 않는다', () => {
    expect(CHAIR_VARIANTS).toHaveLength(5)
    for (const v of CHAIR_VARIANTS) expect(CHAIR_VARIANT_LABEL[v].length, v).toBeGreaterThan(0)
    expect(new Set(CHAIR_VARIANTS.map(v => CHAIR_VARIANT_LABEL[v])).size).toBe(5)
  })

  it('목록에 중복이 없다 — 같은 변종이 두 번 서면 버튼 하나가 죽은 채로 보인다', () => {
    expect(new Set(CHAIR_VARIANTS).size).toBe(CHAIR_VARIANTS.length)
  })

  it('기본값이 목록 안에 있다 — 밖이면 손에 든 변종에 해당하는 버튼이 없다', () => {
    expect(CHAIR_VARIANTS).toContain(DEFAULT_CHAIR_VARIANT)
  })

  /** 기본값이 **현행 의자**여야 한다 — 아니면 이 PR이 기존 화면의 의자 그림까지 바꾼다. */
  it('기본값은 플라스틱이다 — 지금까지 놓인 의자의 그림이 안 바뀐다', () => {
    expect(DEFAULT_CHAIR_VARIANT).toBe('PLASTIC')
  })

  it('도구 목록은 여전히 여덟이다 — 변종이 도구로 승격되지 않았다(설계 §4)', () => {
    expect(BUILD_TOOLS).toHaveLength(8)
    for (const v of CHAIR_VARIANTS) expect(BUILD_TOOLS as readonly string[]).not.toContain(v)
  })

  /** 변종 줄의 존재를 말하는 **화면상의 유일한 문장**이다 — 팔레트 버튼 하이라이트 말고는
   *  어디서도 안내하지 않는다(`toolCostText`·`previewLabel`·`buildResultText`가 전부
   *  `TOOL_LABEL[tool]`='의자'만 쓴다). */
  it('의자 안내가 「종류」를 말한다 — 안 그러면 변종 줄이 있다는 걸 화면이 아무 데서도 안 알린다', () => {
    const text = statusLineText({
      toast: null, pause: null, idle: false, warning: null,
      tool: 'CHAIR', roomType: null, dept: null,
    })
    expect(text).toContain('종류')
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

실행: `npx vitest run src/components/simHud.test.ts`
기대: `CHAIR_VARIANTS is not defined` 계열로 **RED**.

- [ ] **Step 3: 목록·라벨·기본값을 낸다**

`src/components/simHud.ts`의 import에 `type ChairVariant`를 더한다(`../sim/world`에서 가져오는 줄에 합친다 — 없으면 새 줄):

```ts
import { type ChairVariant } from '../sim/world'
```

`TOOL_LABEL`(569-572행) **바로 아래**에 넣는다:

```ts
/**
 * 의자 변종 — 팔레트에서 [의자]를 고르면 그 아래에 열리는 줄(설계 §4).
 *
 * **도구를 늘리지 않는다.** `CHAIR_SOFA` 같은 도구를 만들면 위 `BuildTool`의 계약
 * (*"가구 4종은 이름이 곧 `FurnitureKind`다"*)이 깨지고 매핑 표가 하나 더 생기며, 팔레트가
 * 8개에서 12개로 늘어난다 — **종류가 늘수록 나빠지는 구조**다. 여기 두면 나중에 책상·침대에
 * 변종이 생겨도 같은 자리에 붙는다.
 */
export const CHAIR_VARIANTS: readonly ChairVariant[] = ['STOOL', 'PLASTIC', 'BENCH', 'SOFA', 'RECLINER']

/** 버튼 문구 — 짧게 둔다. 팔레트 폭(`w-40`)이 맵 배율의 기준이라(SimGame의 `insets.left`)
 *  라벨이 길어 폭이 밀리면 맵이 흔들린다. */
export const CHAIR_VARIANT_LABEL: Record<ChairVariant, string> = {
  STOOL: '스툴', PLASTIC: '플라스틱', BENCH: '벤치', SOFA: '소파', RECLINER: '리클라이너',
}

/** 손에 처음 들리는 변종 — **현행 의자 그대로다**(PixelSprite의 PLASTIC 네 색이 옛 값과 같다).
 *  기본값이 다른 것이면 이 변경이 지금까지 놓인 의자의 그림까지 바꾼다. */
export const DEFAULT_CHAIR_VARIANT: ChairVariant = 'PLASTIC'
```

- [ ] **Step 4: 의자 안내에 한 줄을 더한다**

`src/components/simHud.ts:1390`을 교체한다. **변종 줄의 존재를 말하는 화면상의 유일한 문장이다** — 팔레트 버튼 하이라이트 말고는 어디서도 안내하지 않는다.

```ts
  CHAIR: '의자 — 드래그한 사각형을 채웁니다. 종류는 아래 줄에서 고릅니다. 대기실 의자가 곧 좌석 수입니다.',
```

- [ ] **Step 5: 통과를 확인한다**

실행: `npx vitest run src/components/simHud.test.ts`
기대: 전건 PASS.

- [ ] **Step 6: 커밋**

```
feat: 의자 변종 목록·라벨을 simHud에 — JSX에 두면 겨눌 테스트가 없다

목록·라벨·기본값을 컴포넌트 밖에 두는 것은 이 저장소의 오랜 규약이다
(DOM 테스트가 없어 JSX 안의 판정은 어떤 테스트도 못 잡는다).

기본값을 PLASTIC으로 못박는 테스트가 이 커밋의 요지다 — 다른 값이면
지금까지 놓인 의자의 그림까지 이 PR이 바꾼다.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 「기본값 = 현행 그림」을 단언으로 고정해 회귀 범위를 잠금
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 3: 스프라이트 5종 (PixelSprite)

**Files:**
- Modify: `src/components/PixelSprite.tsx:305-341` (`ChairSeatFront`·`ChairSprite`·`ChairSeatFrontSprite` 교체)
- Test: `src/components/pixelSprite.test.ts` (파일 끝에 새 describe)

**핵심 제약:** 의자는 화면에 **두 번** 그려진다 — 가구 층의 `ChairSprite`와 앉은 폰 위에 덧까는 `ChairSeatFrontSprite`. 옛 코드가 `ChairSeatFront()` 하나로 도형을 공유한 이유가 그것이고(*"문자열을 양쪽에 두면 한쪽만 고쳐져 빈 의자와 앉은 의자의 좌면 모양이 갈린다"*), **변종 5종에서도 그 공유를 유지해야 한다.**

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/components/pixelSprite.test.ts`의 import를 고친다:

```ts
import { spriteVariant, DEPT_COLOR, CHAIR_PALETTE } from './PixelSprite'
import { relativeLuminance } from './Backdrop'
import { CHAIR_VARIANTS } from './simHud'
import type { DeptKey } from '@/game/types'
```

파일 끝에 붙인다:

```ts
/*
  ── 의자 변종 팔레트 ────────────────────────────────────────────────────────
  그림(패스 좌표)은 눈이 판정한다 — 이 저장소의 스프라이트 관행이다. 여기서 재는 것은
  **판단이 드는 값**뿐이다: 다섯이 실제로 갈리는가, 사람보다 어두운가, 셰이딩이 뒤집히지 않았는가.
*/
describe('의자 변종 팔레트 — 다섯이 실제로 갈린다', () => {
  /** HSL 색상·채도. 「채도」를 함께 재는 이유는 아래 분리 계약의 주석에 있다. */
  function hueSat(hex: string): { h: number; s: number } {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2
    if (d === 0) return { h: 0, s: 0 }
    const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
    return { h: (h + 360) % 360, s: (d / (1 - Math.abs(2 * l - 1))) * 100 }
  }
  const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

  it('다섯 변종이 전부 네 색(body·accent·seat·leg)을 갖는다', () => {
    expect(Object.keys(CHAIR_PALETTE)).toHaveLength(5)
    for (const v of CHAIR_VARIANTS) {
      const p = CHAIR_PALETTE[v]
      for (const slot of ['body', 'accent', 'seat', 'leg'] as const) {
        expect(p[slot], `${v}.${slot}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  /** 셰이딩 램프의 **방향**이 계약이다. accent가 body보다 어두우면 등받이·쿠션이 사라지고
   *  좌면이 몸체보다 밝으면 앞단이 튀어나온 게 아니라 파인 것처럼 읽힌다. */
  it('변종 안에서 accent > body > seat > leg 순으로 어두워진다', () => {
    for (const v of CHAIR_VARIANTS) {
      const p = CHAIR_PALETTE[v]
      const [a, b, s, g] = [p.accent, p.body, p.seat, p.leg].map(relativeLuminance)
      expect(a, `${v} accent ${a.toFixed(1)} vs body ${b.toFixed(1)}`).toBeGreaterThan(b)
      expect(b, `${v} body ${b.toFixed(1)} vs seat ${s.toFixed(1)}`).toBeGreaterThan(s)
      expect(s, `${v} seat ${s.toFixed(1)} vs leg ${g.toFixed(1)}`).toBeGreaterThan(g)
    }
  })

  /** 「집기 톤은 사람보다 낮게 — 아바타가 시선을 먼저 받는다」(PixelSprite 집기 절 머리말).
   *  대조 대상은 **사람 중 가장 어두운 것**(간호사 가운)이다. 지배 면인 `body`로 잰다 —
   *  세부(침대 베개 `#f7f5f1` = 245)까지 묶으면 이미 있는 집기가 규칙을 어긴 것이 된다. */
  it('몸체가 사람보다 어둡다 — 간호사 가운과 20 이상 벌어진다', () => {
    const NURSE = relativeLuminance('#4fa39e')
    for (const v of CHAIR_VARIANTS) {
      const L = relativeLuminance(CHAIR_PALETTE[v].body)
      expect(NURSE - L, `${v}(${CHAIR_PALETTE[v].body}) = ${L.toFixed(1)}`).toBeGreaterThanOrEqual(20)
    }
  })

  /**
   * 쌍별 분리 — **휘도로 갈리거나, 둘 다 유채색이면서 색상으로 갈리거나**.
   *
   * ⚠️ **채도 하한이 이 단언의 핵심이다.** 그것 없이 색상만 보면 무채색 회색이 "색상 178°로
   * 갈린다"고 주장하는데 채도 4%에서 색상은 뜻이 없다 — **통과하면서 아무것도 안 지키는**
   * [T-144](../../claude-docs/troubleshooting/T-144.md)의 형태다. 실제로 첫 벤치 후보(#6a6e72,
   * 채도 3.8%)가 여기 걸려 지금 값으로 바뀌었다.
   */
  it('두 변종끼리 반드시 갈린다 — 휘도 12 이상, 또는 양쪽 채도 12% 이상에서 색상 40° 이상', () => {
    for (let i = 0; i < CHAIR_VARIANTS.length; i++) {
      for (let j = i + 1; j < CHAIR_VARIANTS.length; j++) {
        const [va, vb] = [CHAIR_VARIANTS[i], CHAIR_VARIANTS[j]]
        const [ha, hb] = [CHAIR_PALETTE[va].body, CHAIR_PALETTE[vb].body]
        const dL = Math.abs(relativeLuminance(ha) - relativeLuminance(hb))
        const [ca, cb] = [hueSat(ha), hueSat(hb)]
        const byHue = ca.s >= 12 && cb.s >= 12 && hueGap(ca.h, cb.h) >= 40
        expect(
          dL >= 12 || byHue,
          `${va}(${ha}) ↔ ${vb}(${hb}): ΔL=${dL.toFixed(1)} Δ색상=${hueGap(ca.h, cb.h).toFixed(0)}° 채도 ${ca.s.toFixed(0)}/${cb.s.toFixed(0)}%`,
        ).toBe(true)
      }
    }
  })

  /** 앉은 폰 위에 덧까는 층도 변종끼리 갈려야 한다 — 좌면만 보이는 각도가 실제로 생긴다. */
  it('좌면 색도 서로 같지 않다', () => {
    expect(new Set(CHAIR_VARIANTS.map(v => CHAIR_PALETTE[v].seat)).size).toBe(5)
  })

  /** 기본 변종이 **옛 의자 그대로**임을 못박는다 — 이 네 값이 밀리면 기존 화면이 조용히 바뀐다. */
  it('플라스틱 네 색이 전환 전 의자와 같다', () => {
    expect(CHAIR_PALETTE.PLASTIC).toEqual({
      body: '#3d4550', accent: '#5b6470', seat: '#343c46', leg: '#2f353e',
    })
  })
})
```

- [ ] **Step 2: 실패를 눈으로 확인한다**

실행: `npx vitest run src/components/pixelSprite.test.ts`
기대: `CHAIR_PALETTE` 없음으로 **RED**.

- [ ] **Step 3: 팔레트와 도형을 쓴다**

`src/components/PixelSprite.tsx`의 305-341행(`ChairSeatFront`부터 `ChairSeatFrontSprite`까지)을 **통째로** 아래로 교체한다. 파일 머리의 import에 `ChairVariant`를 더한다:

```tsx
import type { ChairVariant } from "@/sim/world";
```

```tsx
/**
 * 의자 변종 5종의 색 — 한 변종당 네 슬롯(몸체·강조·좌면·다리).
 *
 * 셰이딩 램프는 **휘도 가산**으로 잡았다(강조 +30.9 · 좌면 −9.1 · 다리 −15.7). 채널을 곱하면
 * 밝은 몸체에서 강조가 사람 톤을 넘어간다(벤치 후보가 실제로 172.2까지 올라가 간호사 가운
 * 144.8을 넘겼다) — 폭이 아니라 **비율**이 일정한 램프의 함정이다.
 *
 * ⚠️ **PLASTIC 네 값은 전환 전 의자 그대로다.** 기본 변종이 옛 그림이라 이 변경으로 지금까지
 * 놓인 의자의 픽셀이 한 점도 안 바뀐다 — 테스트가 이 네 값을 리터럴로 잠근다.
 *
 * ⚠️ **벤치를 무채색으로 두지 않는다.** 첫 후보 `#6a6e72`는 채도 3.8%였는데, 그러면 스툴과의
 * 분리를 「색상 178°」가 떠맡는다 — 채도가 없는 색의 색상은 아무것도 뜻하지 않으므로 그 단언은
 * 통과하면서 아무것도 안 지킨다(T-144). 지금 값은 채도 15%라 그 분리가 실재한다.
 */
export const CHAIR_PALETTE: Record<ChairVariant, { body: string; accent: string; seat: string; leg: string }> = {
  /** 원목 스툴 — 등받이가 없어 실루엣이 원 하나다(가장 강한 구분 신호). */
  STOOL: { body: "#7b5f3e", accent: "#a27d51", seat: "#705638", leg: "#675034" },
  /** 플라스틱 의자 — 전환 전 대기실 의자. 기본값이자 회귀의 기준선. */
  PLASTIC: { body: "#3d4550", accent: "#5b6470", seat: "#343c46", leg: "#2f353e" },
  /** 강철빛 연결 벤치 — 타일 폭을 꽉 채워 옆칸과 이어진다. */
  BENCH: { body: "#586a78", accent: "#728a9c", seat: "#50616d", leg: "#4b5a66" },
  /** 청록 패브릭 소파 — 팔걸이와 등쿠션이 이어진 U자가 곧 "소파"다. */
  SOFA: { body: "#3f5a54", accent: "#567b73", seat: "#38504b", leg: "#334944" },
  /** 적갈 가죽 리클라이너 — 머리받침이 위로, 발받침이 아래로 삐져나온다. */
  RECLINER: { body: "#5a3c3a", accent: "#845855", seat: "#4e3432", leg: "#452e2c" },
};

/**
 * 변종별 **좌면 앞단** — 그림을 여기 한 번만 적는다.
 *
 * `ChairSprite`(빈 의자)와 `ChairSeatFrontSprite`(앉은 폰 위에 덧까는 층)가 같은 좌면을 그려야
 * 하는데, 도형을 양쪽에 두면 한쪽만 고쳐져 빈 의자와 앉은 의자의 좌면이 갈린다. 변종이 다섯이
 * 되면서 그 위험이 **다섯 배**가 됐으므로 표 하나로 접었다.
 *
 * 각 도형은 그 변종 몸체의 **아래 띠를 정확히** 따라간다 — 어긋나면 앉은 폰의 하체가 좌면 밖으로
 * 삐져나와 "앉음"이 깨진다.
 */
function ChairSeatFront({ variant }: { variant: ChairVariant }) {
  const c = CHAIR_PALETTE[variant];
  switch (variant) {
    case "STOOL":
      /* 원 좌면의 아래 초승달. 끝점은 원 위의 점이어야 한다:
         중심(8,7.6) 반지름 4.9, y=9.8에서 8 ± √(4.9²−2.2²) = 3.622 / 12.378.
         sweep 0이 y-down에서 아래로 지난다(머리카락 호가 sweep 1로 위를 지나는 것의 반대). */
      return <path d="M3.622 9.8 A4.9 4.9 0 0 0 12.378 9.8 Z" fill={c.seat} stroke={INK} strokeWidth={EDGE} />;
    case "PLASTIC":
      /* 몸체 rect(x2.4 y2.6 w11.2 h10.8 rx2.2)의 아래 띠 — 바닥 y=13.4, 직선 구간 x4.6~11.4. */
      return (
        <path
          d="M2.4 10.6 h11.2 v.6 a2.2 2.2 0 0 1 -2.2 2.2 h-6.8 a2.2 2.2 0 0 1 -2.2 -2.2 Z"
          fill={c.seat}
          stroke={INK}
          strokeWidth={EDGE}
        />
      );
    case "BENCH":
      /* 타일 폭을 꽉 채운다. **좌우에 잉크선을 긋지 않는 것이 이 변종의 요지다** —
         위·아래 가로선만 그어야 옆칸의 벤치와 하나로 이어진다(4칸 래스터로 확인). */
      return (
        <>
          <rect x="0" y="10" width="16" height="2.6" fill={c.seat} />
          <path d="M0 10 h16 M0 12.6 h16" stroke={INK} strokeWidth={EDGE} fill="none" />
        </>
      );
    case "SOFA":
      /* 팔걸이까지 포함한 **전폭** 앞 립이다 — 팔걸이 사이만 덮으면 앉은 폰의 커프스가
         양옆으로 삐져나온다(소파는 몸체가 넓어 폰보다 바깥까지 간다). */
      return (
        <path
          d="M1.2 9.8 h13.6 v2.2 a2.4 2.4 0 0 1 -2.4 2.4 h-8.8 a2.4 2.4 0 0 1 -2.4 -2.4 Z"
          fill={c.seat}
          stroke={INK}
          strokeWidth={EDGE}
        />
      );
    case "RECLINER":
      /* 몸체가 위로 올라붙어(y1.2~11.8) 좌면도 그만큼 높다. 아래의 발받침은 이 띠 **밖**이라
         앉은 폰의 발이 발받침 위에 얹혀 보인다 — 리클라이너로선 그게 맞는 그림이다. */
      return (
        <path
          d="M2.8 9 h10.4 v.8 a2 2 0 0 1 -2 2 h-6.4 a2 2 0 0 1 -2 -2 Z"
          fill={c.seat}
          stroke={INK}
          strokeWidth={EDGE}
        />
      );
  }
}

/**
 * 의자 — 5종. 등받이·좌면 앞단·다리의 구성은 변종마다 다르지만 **좌면 앞단만은 위 표에서 온다**.
 *
 * `variant`가 없으면 플라스틱이다. 기본값을 **읽는 쪽에서 접는 것이 계약**이다(코어는 미지정에
 * 값을 안 채운다 — `Furniture.variant` 주석). 그래서 `/classic`의 `HospitalMap`처럼 세계 데이터
 * 없이 `<ChairSprite />`만 부르는 자리가 그대로 동작한다.
 */
export function ChairSprite({ variant = "PLASTIC" }: { variant?: ChairVariant }) {
  const c = CHAIR_PALETTE[variant];
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      {variant === "STOOL" && (
        <>
          {/* 다리를 먼저(뒤에) — 원 좌면 밑으로만 삐져나온다. 간격을 좁히면 버섯으로 읽힌다(실측). */}
          <rect x="4.3" y="11.4" width="1.7" height="3.8" rx=".5" fill={c.leg} />
          <rect x="10" y="11.4" width="1.7" height="3.8" rx=".5" fill={c.leg} />
          <circle cx="8" cy="7.6" r="4.9" fill={c.body} stroke={INK} strokeWidth={EDGE} />
          {/* 방석 — 등받이가 없으니 이 안쪽 원이 유일한 두 번째 면이다 */}
          <circle cx="8" cy="7.6" r="3.1" fill={c.accent} />
        </>
      )}
      {variant === "PLASTIC" && (
        <>
          <rect x="2.4" y="2.6" width="11.2" height="10.8" rx="2.2" fill={c.body} stroke={INK} strokeWidth={EDGE} />
          <rect x="3.6" y="3.6" width="8.8" height="3.6" rx="1.6" fill={c.accent} />
        </>
      )}
      {variant === "BENCH" && (
        <>
          {/* 좌우 잉크선 없음 — 옆칸과 이어지는 것이 「연결 벤치」의 전부다 */}
          <rect x="0" y="3.4" width="16" height="9.2" fill={c.body} />
          <path d="M0 3.4 h16" stroke={INK} strokeWidth={EDGE} fill="none" />
          <rect x="0" y="4.3" width="16" height="2.6" fill={c.accent} />
        </>
      )}
      {variant === "SOFA" && (
        <>
          <rect x="1.2" y="2.4" width="13.6" height="12" rx="2.4" fill={c.body} stroke={INK} strokeWidth={EDGE} />
          <rect x="4" y="3.4" width="8" height="3.4" rx="1.4" fill={c.accent} />
          {/* 팔걸이 — **강조색이라야 한다.** 몸체색으로 두면 잉크선만으로 갈려 24px에서 녹색
              덩어리가 된다(실측). 강조로 두면 등쿠션과 이어져 U자 천이 되고, 그게 소파다. */}
          <rect x="1.2" y="2.4" width="3" height="12" rx="2.4" fill={c.accent} stroke={INK} strokeWidth={EDGE} />
          <rect x="11.8" y="2.4" width="3" height="12" rx="2.4" fill={c.accent} stroke={INK} strokeWidth={EDGE} />
        </>
      )}
      {variant === "RECLINER" && (
        <>
          {/* 발받침 — 몸체(y1.2~11.8) 밖에 떨어져 있다. 실루엣이 아래로 자라는 것이 구분 신호다 */}
          <rect x="4.6" y="12.4" width="6.8" height="2.6" rx=".8" fill={c.body} stroke={INK} strokeWidth={EDGE} />
          <rect x="2.8" y="1.2" width="10.4" height="10.6" rx="2" fill={c.body} stroke={INK} strokeWidth={EDGE} />
          {/* 머리받침 — 몸체 **위로** 삐져나온다(위아래로 자라는 실루엣이 소파와 갈리는 축) */}
          <rect x="5.2" y=".4" width="5.6" height="1.8" rx=".8" fill={c.accent} stroke={INK} strokeWidth={EDGE} />
          <rect x="3.9" y="2" width="8.2" height="4.4" rx="1.5" fill={c.accent} />
        </>
      )}
      <ChairSeatFront variant={variant} />
      {variant === "PLASTIC" && (
        <>
          <rect x="4.4" y="13.2" width="2" height="2.2" rx=".6" fill={c.leg} />
          <rect x="9.6" y="13.2" width="2" height="2.2" rx=".6" fill={c.leg} />
        </>
      )}
      {variant === "BENCH" && (
        <>
          {/* 다리는 타일 **안쪽**에만 둔다 — 이음매에 걸리면 이어진 벤치에 세로 이물이 생긴다 */}
          <rect x="2.6" y="12.6" width="1.8" height="2.4" rx=".5" fill={c.leg} />
          <rect x="11.6" y="12.6" width="1.8" height="2.4" rx=".5" fill={c.leg} />
        </>
      )}
    </svg>
  );
}

/** 의자 좌면 앞단만 — 앉은 폰 **위에** 덧까는 층이다(왜인지는 TileMap의 해당 레이어 주석).
 *  변종을 안 받으면 앉은 소파 위에 플라스틱 의자의 좌면이 깔린다 — 에러는 안 난다. */
export function ChairSeatFrontSprite({ variant = "PLASTIC" }: { variant?: ChairVariant }) {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <ChairSeatFront variant={variant} />
    </svg>
  );
}
```

- [ ] **Step 4: 통과를 확인한다**

실행: `npx vitest run src/components/pixelSprite.test.ts`
기대: 전건 PASS.

- [ ] **Step 5: 타입 구멍까지 확인한다**

실행: `npm run build`
기대: 성공. `npm test`는 transpile-only라 `Record<ChairVariant, …>`의 완전성을 안 본다 — 여기서만 드러난다.

- [ ] **Step 6: 커밋**

```
feat: 의자 스프라이트 5종 — 좌면 도형은 변종마다 한 곳에만 적는다

의자는 화면에 두 번 그려진다(가구 층 + 앉은 폰 위 좌면 앞단). 도형을 양쪽에
적으면 빈 의자와 앉은 의자의 좌면이 갈리는데, 변종이 다섯이 되면 그 위험도
다섯 배다. 표 하나로 접어 구조적으로 막았다.

벤치를 무채색으로 두지 않은 이유가 팔레트 주석에 있다 — 채도 없는 색의
색상 차이는 통과하면서 아무것도 안 지킨다(T-144).

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 램프 방향·톤 상한·쌍별 분리를 값으로 잠가 눈 검수의 사각을 덮음
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 4: 화면 배선 — TileMap과 SimGame

**Files:**
- Modify: `src/components/TileMap.tsx:396-399`(memo) · `:735-743`(가구 층) · `:885-897`(좌면 층)
- Modify: `src/components/SimGame.tsx` — 상태 추가 · `runTool` · `preview` deps · 변종 줄 JSX

⚠️ **여기엔 테스트가 없다**(DOM 테스트 부재). 그래서 판정을 JSX에 새로 만들지 않는다 — 목록·라벨·기본값은 Task 2에서 이미 순수 모듈에 있고, 여기서는 **놓기만** 한다.

- [ ] **Step 1: `TileMap`의 좌표 집합에 변종을 싣는다**

`src/components/TileMap.tsx:394-399`를 교체한다:

```tsx
  /* 의자 타일 → 그 의자의 변종. 건설로만 갈리는 값이라 `world.furniture` identity에 memo를 건다
     (지형 memo와 같은 계약: 폰이 매 프레임 움직여도 이 집합을 다시 만들지 않는다).
     ⚠️ **Set이 아니라 Map인 이유**: 아래 좌면 앞단 층이 변종별로 다른 도형을 깔아야 하는데,
     좌표만 담으면 그 정보가 여기서 소실돼 앉은 소파 위에 플라스틱 의자의 좌면이 얹힌다(에러 없음). */
  const seatTiles = useMemo(
    () =>
      new Map(
        world.furniture
          .filter((f) => f.kind === "CHAIR")
          .map((f) => [`${f.x},${f.y}`, f.variant] as const),
      ),
    [world.furniture],
  );
```

`:758` 부근의 `seatTiles.has(...)`는 **고치지 않는다** — `Map#has`가 `Set#has`와 같이 동작한다.

- [ ] **Step 2: 두 렌더 지점에 변종을 넘긴다**

`:737-738`:

```tsx
            ) : f.kind === "CHAIR" ? (
              <ChairSprite variant={f.variant} />
```

`:885-897`의 루프를 destructure로 고친다(Map을 spread하면 `[key, value]` 튜플이 나온다 — 이 한 줄만 바꾸면 된다):

```tsx
        {[...seatTiles].map(([key, variant]) => {
          const [x, y] = key.split(",").map(Number);
          return (
            <div
              key={`seat-front-${key}`}
              className="pointer-events-none absolute"
              style={{ left: x * TILE, top: y * TILE, width: TILE, height: TILE, zIndex: 2 }}
              aria-hidden
            >
              <ChairSeatFrontSprite variant={variant} />
            </div>
          );
        })}
```

- [ ] **Step 3: `SimGame`에 손에 든 변종을 둔다**

`src/components/SimGame.tsx:137`의 `tool` 상태 **바로 아래**에 넣는다:

```tsx
  /** 손에 든 의자 변종 — 겉모습만 가른다(기능·가격은 같다).
   *  ⚠️ **도구를 바꿔도 안 비운다 — `roomType`·`examDept`와 다른 점이다.** 그 둘을 비우는 이유는
   *  *"안 고른 값으로 클릭이 열린다"*인데, 변종은 기본값이 늘 무장돼 있어 그 위험이 애초에 없다.
   *  반대로 매번 리셋하면 대기실 한 줄을 같은 의자로 채우는 정상 조작이 방해받는다. */
  const [chairVariant, setChairVariant] = useState<ChairVariant>(DEFAULT_CHAIR_VARIANT);
```

import를 더한다:
- `@/components/simHud`에서 `CHAIR_VARIANTS, CHAIR_VARIANT_LABEL, DEFAULT_CHAIR_VARIANT`
- `@/sim/world`에서 `type ChairVariant`

- [ ] **Step 4: 코어로 흘려보낸다**

`:397`:

```tsx
    return placeFurniture(world, t, tiles, chairVariant);
```

`:408`의 `preview` useMemo 의존성 배열에 `chairVariant`를 더한다. **eslint-disable이 걸려 있어 자동 갱신이 안 된다** — 지금은 미리보기 문구가 변종과 무관해 무해하지만, 바로 위 주석이 *"runTool은 아래 값들의 파생이다"*라고 적혀 있으므로 그 문장을 참으로 유지한다:

```tsx
  }, [drag, tool, ready, roomType, examDept, chairVariant, world]);
```

- [ ] **Step 5: 변종 줄을 놓는다**

`SimGame.tsx`의 `{section === "BUILD" && (…)}` 블록이 닫히는 `)}` **바로 뒤**, `{tool === "DESIGNATE" && (…)}` 앞에 넣는다. ⚠️ 상태줄 `<p className="mt-auto …">`(1037행) **아래로 가면 안 된다** — `mt-auto`가 패널 바닥에 붙는 것을 그 줄이 밀어낸다.

```tsx
        {/* 의자 종류 — [의자]를 고르면 열린다. **도구를 늘리는 대신 여기 붙는다**(설계 §4):
            변종마다 도구를 만들면 `BuildTool`↔`FurnitureKind` 동일성이 깨지고 팔레트가 8→12로 는다.
            가로로 감싸는 것은 다섯이 세로로 서면 패널이 그만큼 길어지기 때문이다(용도 6종과 다른 점).
            선택 표시는 팔레트와 **같은 `bg-frame`**이다 — 청록(LANDING.accent)은 확정 버튼 전용이라
            여기 쓰면 화면에서 「선택」의 색이 둘로 갈린다. */}
        {tool === "CHAIR" && (
          <div className="flex flex-col gap-1.5 border-t border-frame pt-2">
            <span className="text-xs text-on-desk-muted">종류</span>
            <div className="flex flex-wrap gap-1.5">
              {CHAIR_VARIANTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={chairVariant === v}
                  onClick={() => setChairVariant(v)}
                  className={`border px-2.5 py-1 text-xs transition-colors ${
                    chairVariant === v
                      ? "border-on-desk-muted bg-frame text-on-desk"
                      : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
                  }`}
                >
                  {CHAIR_VARIANT_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
        )}
```

⚠️ 다른 팔레트 버튼과 달리 **토글이 아니다**(`setChairVariant(v)`이지 `cur === v ? null : v`가 아니다). 변종은 반드시 하나가 골라져 있어야 하므로 「아무것도 안 고른 상태」가 존재하면 안 된다.

- [ ] **Step 6: 회귀와 타입을 확인한다**

실행: `npm test`
기대: **47 files / 1557 + 새 테스트** 전건 통과(파일 수가 줄면 뭔가 빠진 것이다).

실행: `npm run build`
기대: 성공.

실행: `npm run lint`
기대: 경고 0.

- [ ] **Step 7: 커밋**

```
feat: 변종 줄을 팔레트에 배선 — 좌면 오버레이까지 같은 변종을 본다

seatTiles를 Set에서 Map으로 바꾼 것이 이 커밋의 요지다. 좌표만 담으면
앉은 폰 위에 덧까는 좌면 층이 변종을 모르고, 소파 위에 플라스틱 의자의
좌면이 얹힌다 — 에러 없이 그림만 틀린다.

변종은 도구를 바꿔도 안 비운다. roomType·examDept를 비우는 이유(안 고른
값으로 클릭이 열린다)가 변종엔 없다 — 기본값이 늘 무장돼 있다.

Skills-used: none
Plugins-used: none
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 5: 브라우저 실측 · 문서 스윕 · PR

**Files:**
- Modify: `docs/superpowers/specs/2026-07-31-chair-variants-design.md` (§3의 사실 오류 · §7의 미해결 정산)
- Modify: `claude-docs/plan.md` · `claude-docs/changeLog.md`
- (해당하면) Create: `claude-docs/troubleshooting/T-###.md`

- [ ] **Step 1: 실제 화면에서 다섯을 놓아 본다**

⚠️ **이 단계가 이 브랜치에서 유일한 게이트인 축이 넷 있다.** 테스트가 겨누지 못하는 것을 실측으로 확인한 목록이다:

| 무엇 | 왜 테스트가 못 잡나 | 실측 확인 |
|---|---|---|
| 좌면 **도형** | `ChairSeatFront`의 SOFA 분기를 PLASTIC 패스로 바꿔도 1580건 전건 통과(Task 3 실측) | 각 변종의 좌면이 몸체 아래 띠와 맞는가 |
| `placeFurniture`에 변종 전달 | 4번째 인자를 떼도 전건 통과(Task 4 실측) | 「종류」에서 고른 변종이 실제로 심어지는가 |
| `ChairSprite`·`ChairSeatFrontSprite`의 prop | 떼도 전건 통과(lint 경고는 잉여 변수 부작용일 뿐) | 소파에 앉은 폰 위의 띠가 **소파의** 좌면인가 |
| `seatTiles` Map의 값 | `undefined` 고정해도 전건 통과 | 같은 위 |

기본 절차: `preview_start`로 dev 서버를 띄우고(`.claude/launch.json`) —
1. [건설] → [의자] → 종류 줄이 열리는가
2. 다섯을 각각 골라 놓고 **화면에서 갈리는가**
3. **벤치를 가로로 3칸 이상** 놓아 하나로 이어지는가 · **혼자 놓인 벤치 1칸**이 바닥에 번져 보이지 않는가(좌우 잉크가 아예 없다 — 4칸만 래스터했고 1칸은 미확인)
4. 폰이 앉았을 때 **그 변종의 좌면**이 하체를 덮는가
5. 도구를 벽으로 바꿨다 의자로 돌아왔을 때 **고른 변종이 유지되는가**(sticky)
6. `read_console_messages`로 에러 0

**Task 3 리뷰가 산술로 못 닫아 넘긴 것 — 우선순위 순**:

1. ~~**[최우선] 리클라이너에 앉은 의사의 커프스가 살아남는가.**~~ → **살아남는다. 현행 유지로 확정**(2026-08-01 실측).
   - 문제 제기: 좌면 띠 윗변이 변종마다 다르다(PLASTIC 10.6 · BENCH 10.0 · STOOL/SOFA 9.8 · **RECLINER 9.0**). 폰은 `SEAT_LIFT = TILE/4` = 4단위 올라가 커프스(폰 좌표 y12.6~14.4)가 타일 좌표 8.6~10.4에 온다 → PLASTIC은 **0%** 가리는데 리클라이너는 상당 부분을 가린다. 커프스는 계약이다(*"과 색의 두 번째 출현 — 없으면 가슴 색이 무늬로 읽힌다"* · PixelSprite 머리말). 그리고 **의사도 의자에 앉는다**(`needs.ts`의 LOUNGE `['BED','CHAIR']` · CAFETERIA `['CHAIR']`).
   - **실측**: 의사(`sleeveCuff` 포함)를 다섯 변종에 `SEAT_LIFT`까지 적용해 앉히고 40/72/128px로 래스터했다. **다섯 전부에서 커프스가 보인다.** 리클라이너는 면적 기준 **약 36%만 남지만**(좌면이 x2.8~13.2를 덮어 바깥 조각과 y<9.0 조각이 남는다) 붉은 표시가 양 소매 끝에 그대로 읽히고, **가슴 수술복은 다섯 다 온전하다** — 계약이 나르는 정보("가운 안에 다른 옷을 입었다")는 성립한다.
   - **처방안을 만들어 비교했고 기각했다**: 몸체를 1단위 내리면(y1.2→2.2 · 발받침 12.4→13.2 · 좌면 9→10) 커프스가 조금 더 보이지만 리클라이너가 타일 안에서 아래로 처져 **폰이 의자에 덜 「들어가」 보인다.** 이득이 미미한 반면 구도를 잃는다. 그리고 **의자에 깊이 파묻히는 것 자체가 리클라이너의 의미**라, 좌면이 더 높이 올라오는 것이 사물에 맞다.
2. **리클라이너 좌면 바닥(11.8) ↔ 발받침 윗변(12.4) 사이 0.6단위 틈** — 그 띠로 앉은 폰의 다리가 비친다. 의도이긴 하나 좌면이 떠 보이지 않는지.
3. **벤치 잉크 굵기** — 좌면선 합성이 벤치 α=0.70 · 플라스틱 0.83 · 소파 0.91로 갈린다. 벤치 줄과 플라스틱 의자를 나란히 놓아 선 무게가 튀지 않는지.
4. **소파 U자가 24~32px에서 유지되는가** — 전폭 앞 립(9.8~14.4)이 팔걸이 아래 4.6단위를 덮어 U는 y2.4~9.8 구간만이다. (계획 §1-2의 래스터는 **이 립을 포함한 상태**로 찍은 것이라 이미 확인됐다 — 그래도 실화면 배율에서 재확인한다.)
5. **소파 팔걸이 모서리** — 96px로 띄워 좌상·좌하에 이중 잉크가 보이는지(`rx` 감축 때문에 0.25단위 삐져나온다).

스크린샷을 남겨 PR 본문에 넣는다.

- [ ] **Step 2: 스펙의 사실 오류를 고친다**

`docs/superpowers/specs/2026-07-31-chair-variants-design.md`:

- **§3 「세이브 호환」 문단**을 교체한다. 원문은 *"`variant`는 선택 필드다. 없으면 기본 의자로 읽는다. 기존 세이브가 그대로 열린다."* — 뒷문장이 **근거 없다**(이 저장소에 세이브 시스템이 없다). 아래로 바꾼다:

```md
**선택 필드인 이유**: `variant`는 없으면 기본 의자(플라스틱)로 읽는다. 기본값을 **코어가 채우지 않는 것**이 계약이다 — 채우면 가구 배열을 통째로 비교하는 회귀가 깨지고, 읽는 쪽이 「없음」과 「기본값」 둘을 구별해야 한다.

> 옛 판에는 *"기존 세이브가 그대로 열린다"*가 적혀 있었는데 **근거 없는 문장이었다** — 이 저장소엔 세이브 시스템이 없다(`localStorage`·`SimWorld` 직렬화 경로 0건, 2026-08-01 전수 확인). 선택 필드의 값은 세이브 호환이 아니라 위의 **회귀 보존**에 있다.
```

- **§7 미해결** 세 항목 중 앞의 둘을 정산한다(셋째 「장식 오브젝트」는 그대로 남긴다):

```md
- ~~**라인업 5종의 적정성**~~ → **확정**(2026-08-01): 스툴 · 플라스틱 · 벤치 · 소파 · 리클라이너. 한국 병원 맥락에서 교체할 종류가 없었고, 다섯이 색상·휘도·실루엣 세 축에서 전부 갈린다.
- ~~**변종별 스프라이트가 24px에서 갈리는가**~~ → **갈린다**(2026-08-01 실측): 5종 × 16/20/24/32/48/96px를 4개 바닥 위에 래스터해 확인했다. 소파와 리클라이너는 색상 163° + 실루엣 축(소파는 가로로 넓고, 리클라이너는 머리받침·발받침으로 세로로 자란다)으로 갈린다. 실제 화면은 `16 × fit × zoom`이라 기본 타일이 ~32px이고 16px은 최악 조건이다.
  - 실측 중 **두 시안이 죽었다**: 소파 팔걸이를 몸체색으로 두면 24px에서 녹색 덩어리가 됐고(강조색으로 바꿔 U자 천이 됐다), 무채색 벤치는 스툴과의 분리를 채도 없는 색상에 떠맡겨 계약이 헛돌았다(T-144 형태 — 채도 15%인 청회색으로 교체).
```

- [ ] **Step 3: 작업 추적 3종을 스윕한다**

⚠️ 규약을 먼저 읽는다: [changeLog 규약](../../../CLAUDE.md) — **PR 번호를 적지 않는다**(squash 머지 제목의 `(#N)`이 단일 출처).

- `claude-docs/plan.md` — **두 곳뿐이다.** 완료 서사를 쌓지 않는다(그 파일 머리의 규율).
  1. **최상위 ✅ 한 줄**을 「배경 12종 낮 전환 — 아트 디렉션 ③」 항목 **바로 위**에 넣는다(역순 목록의 맨 앞). ③·④ 항목과 같은 밀도로: 날짜·SDD 태스크 수·spec/플랜 링크·핵심 결정 두셋·테스트 수. 서브불릿으로 ⏸ **②-b 안락함**과 ⬜ **장식 오브젝트**를 남긴다.
  2. 아트 디렉션 ① 항목 아래의 이 줄을 뒤집는다 — 원문:
     ```md
       - ⏸ **②-a 의자 변종 구현** — 스펙만 있다([chair-variants-design](../docs/superpowers/specs/2026-07-31-chair-variants-design.md))
     ```
     → `✅ … 위 「의자 변종 …」(2026-08-01)로 해소` 형태로. 같은 항목의 `⏸ **청진기·명찰의 확대 조건부 렌더링** … (②에서 판단)`은 **그대로 둔다** — 이번 범위(②-a)가 아니라 ②의 나머지다.
- `claude-docs/changeLog.md`: 맨 위에 `## 2026-08-01 · 제목` 한 항목. **왜/무엇을**만 — 코드 세부는 PR·커밋에 있다. [구조적 문제 분류표](../../concept/structural-problems-checklist.md)는 **고칠 행이 없다**(표현 층 변경) — 최근 3개 항목의 관례대로 마지막 줄에 `분류표 반영 상태 변경 없음(표현 층)` 한 마디만 남긴다.

- [ ] **Step 4: 함정 스윕 — 「1분+ 근인 디버깅이 있었나」**

SDD 종료 직전의 명시 관문이다([CLAUDE.md 「SDD trap 스윕」](../../../CLAUDE.md)). **내가 아니라 서브에이전트·리뷰어가 잡은 것도 포함**한다. 있으면 `claude-docs/troubleshooting/T-###.md`를 신설한다(frontmatter `summary:` + `tags: type/troubleshooting` + 4필드 *증상/원인/해결/재발방지*).

신설했으면 목차를 **자동 생성**한다(손으로 고치면 pre-commit이 거부한다):

```bash
powershell -ExecutionPolicy Bypass -File scripts/rebuild-troubleshooting-index.ps1 -HubPath claude-docs/troubleshooting.md
```

- [ ] **Step 5: 최종 확인 후 PR**

```bash
npm test && npm run build && npm run lint
```

`gh pr create --body-file`(UTF-8)로 올린다. **머지는 하지 않는다** — 사용자에게 물어 결정을 받는다.

- [ ] **Step 6: 문서 커밋**

```
docs: 의자 변종 문서 스윕 — 스펙의 세이브 문장 정정 + 실측으로 미해결 정산

스펙 §3의 「기존 세이브가 그대로 열린다」는 근거 없는 문장이었다.
이 저장소엔 세이브 시스템이 없다 — 선택 필드의 값은 세이브 호환이 아니라
가구 배열 깊은 비교 회귀의 보존에 있다.

§7의 미해결 둘(라인업 적정성·24px 판별)을 래스터 실측으로 닫았다.

Skills-used: none
Plugins-used: none
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## 3. 실행 기록 — 이 계획서가 틀렸던 곳

계획을 고쳐 쓰면서 **무엇이 왜 틀렸는지는 지우지 않는다**(자유 영역 플랜의 관례). 계획서의 권위는 맞아서가 아니라 틀린 자리가 드러나 있어서 선다.

| 어디 | 무엇이 틀렸나 | 어떻게 드러났나 |
|---|---|---|
| Task 1 · `Furniture.variant` 주석 | *"`undefined`를 채워 넣으면 깊은 비교 회귀가 깨진다"* → **반대**다. `toEqual`이 undefined 키를 무시해 안 깨지고, `Object.keys` 단언이 유일한 가드다. §0 표에는 「**기본값**을 채우면」이라고 맞게 적혀 있었는데 인라인 주석으로 옮기며 뒤집혔다 | 품질 리뷰의 돌연변이 M2(전 가구에 `variant: undefined`) — 깊은 비교 회귀 두 곳이 **전부 초록**이고 신규 단언만 깨졌다 |
| Task 1 · 「가격이 변종과 무관하다」 | 기준선을 `base.deltaManwon`(다른 호출)에 두어 **공허 통과**했다. `placeFurniture`가 통째로 죽어 42건이 깨지는 돌연변이에서 이 테스트만 `0 === 0`으로 살아남았다 | 같은 리뷰의 돌연변이 M10. 처방(`toBe(-BUILD_COST.CHAIR)`)까지 실측으로 확인 — 그 돌연변이에서 42 → 43건 |
| Task 2 · `statusLineText` 호출 | 인자 모양을 `phase·paused·pauseCause`로 잘못 적었다. 실제는 `toast·pause·idle·warning·tool·roomType·dept` | 착수 전 코디네이터가 `simHud.ts:1416`을 대조하다 발견 |

**둘 다 같은 병이다** — 통과하면서 아무것도 안 지키거나([T-144](../../../claude-docs/troubleshooting/T-144.md)), 틀린 이유를 남겨 다음 사람이 유일 가드를 지우게 만드는 것([T-145](../../../claude-docs/troubleshooting/T-145.md)). 이 저장소가 두 번 물린 자리에 **세 번째로** 물렸고, 이번엔 돌연변이 리뷰가 커밋 다음 단계에서 잡았다.

---

## 4. 범위 밖 — 이번에 하지 않는 것

| 무엇 | 왜 |
|---|---|
| **②-b 안락함** | 수치가 붙으면 밸런스 작업(피로 회복·대기 이탈)과 프로브 회귀가 따라온다. 스펙 §6이 분리한 그대로 |
| **책상·침대·카운터의 변종** | 기제가 일반적이라 나중에 같은 자리에 붙는다. 지금 만들면 안 쓰이는 자산이 된다 |
| **놓은 뒤 변종 바꾸기** | 철거 후 재설치로 된다. 붙이려면 `TileMap.tsx:730`의 React key(`${f.kind}-${f.x}-${f.y}`)에 변종을 넣어야 한다 — 안 넣으면 같은 key로 DOM이 재사용돼 그림이 안 바뀐다 |
| **장식 오브젝트** | 통행 무관·`world.furniture` 밖의 별개 기제. ②의 나머지 |
| **`HospitalMap`의 앉은 아바타가 의자를 삼키는 결함** | `/classic`·`ReceivingPhase`·`SetupWizard`가 쓰는 다른 화면이고 plan.md에 ⬜로 이미 서 있다. 여기 끌어들이면 이 PR이 두 화면을 동시에 건드린다 |
