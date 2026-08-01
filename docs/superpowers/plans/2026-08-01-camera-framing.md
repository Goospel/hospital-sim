---
tags:
  - type/plan
---

# 시작 프레이밍 구현 계획 (아트 디렉션 ⑤)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임이 **부지 둘레로 배경이 2타일 보이는 배율**로 열리게 한다 — 지역 배경 12종이 기본 화면에서 읽히도록.

**Architecture:** 카메라 기제(줌·팬·클램프·하한·리사이즈)는 **한 줄도 안 고친다**. 순수 함수 `openingZoom(view)` 하나를 `simHud`에 더하고, 호출부 둘(`useCamera`의 측정 · `⌂` 버튼)이 그것을 읽는다. 하한 받침은 기존 `settledCamera`·`zoomedCamera`가 이미 하므로 새 함수는 하한을 모른다.

**Tech Stack:** TypeScript · React 19 · vitest(DOM 없음)

**선행 스펙:** [시작 프레이밍 설계](../specs/2026-08-01-camera-framing-design.md)

---

## 0. 착수 전 실측 — 이 계획이 서 있는 사실들

구현자는 아래를 **다시 조사하지 말고** 그대로 전제한다.

| 사실 | 근거 | 계획에 준 영향 |
|---|---|---|
| `openingZoom`은 **항상 1 이하**이고 범위가 [0.8889, 0.9231] | 창 13종 × 인셋 6종 = 78조합 실측(2026-08-01) + 산술 증명(스펙 §3-1) | 상한을 걸 필요가 없다 |
| 78조합 중 48개는 **`zoomFloor`가 더 높아 하한이 이긴다** | 같은 실측 | 전부 극단 형상이고 **지금도 이미 그 배율로 열린다**(`settledCamera`가 받친다) — 회귀가 아니다 |
| `zoomedCamera`가 `Math.max(zoomFloor(v), …)`로 **이미 하한을 받는다** | `simHud.ts:812` | `⌂`에 factor만 넘기면 하한 처리가 공짜다 |
| `settledCamera`도 `Math.max(zoomFloor(v), …)`를 한다 | `simHud.ts:791` | 측정 경로도 마찬가지 |
| `insets`는 `{top:0,left:0}`으로 시작해 **부모 effect가 나중에** 잰다 | `SimGame.tsx:576-594` | **첫 측정은 언제나 인셋 0** — 「첫 측정 때만」 규칙이 틀리는 이유(스펙 §5) |
| 휠 효과의 deps가 `[view, setCam]`이다 | `TileMap.tsx`의 `onWheel` useEffect | `setCam` 래퍼는 **`useCallback`으로 고정**해야 한다. 안 그러면 매 렌더 네이티브 리스너를 떼었다 붙인다 |
| `TileMap.tsx`는 `useCallback`을 **아직 임포트하지 않는다** | `TileMap.tsx:3-11` | import에 추가해야 한다 |
| simHud는 `TILE`을 임포트하지 않는다(React가 딸려 온다) | `simHud.test.ts:1650` 주석이 같은 이유로 `16`을 직접 적는다 | 여백 상수를 **px로** 두되 `2 * 16` 꼴로 적어 두 숫자를 다 보이게 한다 |
| 회귀 기준선 = **47 files / 1580 tests 전건 통과** | 이 워크트리 실측(2026-08-01, 의자 변종 머지 직후) | 이 수보다 줄면 파일이 빠진 것이다 |

### 이미 결정된 것 — 다시 고민하지 않는다

- **여백은 2타일.** 배경 그림 범위(`BACKDROP_MARGIN` 12×8)와 다른 값이다 — 그쪽은 축소의 바닥이고 이쪽은 처음 보여줄 만큼이다.
- **지역별 차등 없음**(스펙 §7).
- **줌 애니메이션 없음** — 기존 `⌂`도 즉시 이동이다.

---

## 1. 파일 구조

| 파일 | 무엇을 진다 |
|---|---|
| `src/components/simHud.ts` | `OPENING_PAD_PX` · `openingZoom(view)` — 카메라 산술의 단일 출처에 얹는다 |
| `src/components/simHud.test.ts` | 계약 5건(1 이하 · 파생 구간 · 여백 정확 · 부지 전체 가시 · 하한과 함께 배경 덮음) |
| `src/components/TileMap.tsx` | `useCamera`의 측정 경로 + `setCam` 래퍼 · `⌂` 버튼 |

**새 파일 없음.** 카메라는 이미 두 파일로 갈려 있고(산술=simHud · 상태=TileMap) 이 변경이 그 경계를 그대로 따른다.

---

## Task 1: `openingZoom` — 순수 함수와 계약

**Files:**
- Modify: `src/components/simHud.ts` (`zoomFloor` 바로 아래)
- Test: `src/components/simHud.test.ts` (`describe('부지 카메라 …')` **안쪽 끝**)

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

테스트 파일 머리의 `./simHud` import 블록에 `openingZoom, OPENING_PAD_PX`를 더한다(`settledCamera`·`zoomFloor`는 이미 있다).

`describe('부지 카메라 — clampCamera · zoomedCamera · pannedCamera', () => {` 블록의 **마지막 `it` 뒤, 닫는 `})` 앞**에 붙인다 — 그 describe의 헬퍼(`BASE`·`viewOf`·`covers`)를 그대로 쓰기 위해서다:

```ts
  /*
    ── 시작 프레이밍 ────────────────────────────────────────────────────────
    `zoom 1`은 정의상 "부지 전체가 안전 영역에 맞는 배율"이라 부지가 화면을 꽉 채운다 —
    그러면 지역 배경 12종이 화면의 4%도 안 남는다(실측 2026-08-01). 게임은 그보다 한 겹
    빼서 열린다. 그 배율을 **매직 넘버가 아니라 여백에서 파생**시키는 것이 아래 계약의 요지다.
  */
  describe('openingZoom — 게임이 열리는 배율', () => {
    const padded = { w: BASE.w + 2 * OPENING_PAD_PX, h: BASE.h + 2 * OPENING_PAD_PX }
    /** 창 형상이 극단으로 갈려도 값은 이 둘 사이다 — `fit`이 짧은 축에서 결정되므로 식이
     *  그 축에서 `BASE / (BASE + 2·PAD)`로 접힌다(스펙 §3-1의 산술).
     *  ⚠️ **리터럴(0.8889/0.9231)로 적지 않는다** — 여백을 3타일로 바꾼 날 이 테스트가
     *  조용히 낡는다. 그건 이 기능이 배격한 매직 넘버가 검사기 안에서 되살아나는 것이다. */
    const LO = BASE.h / padded.h
    const HI = BASE.w / padded.w

    /** 창 하나로 화면 형상 한 벌 — `fit`도 안전 영역에서 파생시킨다(`useCamera`와 같은 식). */
    const frameOf = (w: number, h: number, insetTop: number, insetLeft: number): CameraView => {
      const safe = { x: insetLeft, y: insetTop, w: w - insetLeft, h: h - insetTop }
      return viewOf(safe, Math.min(safe.w / BASE.w, safe.h / BASE.h), { w, h })
    }
    const SHAPES: Array<[number, number]> = [
      [1280, 720], [1440, 900], [1920, 1080], [2560, 1440], [1366, 768],
      [3840, 800], [800, 1400], [600, 900], [3000, 600], [1024, 1366], [500, 400], [1200, 2400],
    ]
    const INSETS: Array<[number, number]> = [[0, 0], [42, 211], [64, 176], [120, 320]]
    /** 창 × 인셋 전수 — 한 조합만 재면 "그 창에서만 맞는 값"이 통과한다. */
    const each = (run: (v: CameraView, label: string) => void) => {
      for (const [w, h] of SHAPES) for (const [t, l] of INSETS) run(frameOf(w, h, t, l), `${w}x${h} 인셋 ${t}/${l}`)
    }

    it('어떤 창에서도 1을 넘지 않는다 — 넘으면 현행보다 **당겨서** 열린다', () => {
      each((v, label) => expect(openingZoom(v), label).toBeLessThanOrEqual(1))
    })

    it('여백에서 파생한 두 극값 사이에 있다 — 창 형상이 값을 흔들지 못한다', () => {
      each((v, label) => {
        expect(openingZoom(v), label).toBeGreaterThanOrEqual(LO - 1e-9)
        expect(openingZoom(v), label).toBeLessThanOrEqual(HI + 1e-9)
      })
    })

    it('짧은 축의 배경 여백이 정확히 지정한 만큼이다 — 이게 이 함수의 정의 그 자체다', () => {
      each((v, label) => {
        const s = v.fit * openingZoom(v)
        const padW = (v.safe.w - v.base.w * s) / 2
        const padH = (v.safe.h - v.base.h * s) / 2
        expect(Math.min(padW, padH), label).toBeCloseTo(OPENING_PAD_PX * s, 6)
      })
    })

    it('부지 전체가 여전히 안전 영역에 들어온다 — ⌂의 이름(「부지 전체 보기」)과 어긋나면 안 된다', () => {
      each((v, label) => {
        const s = v.fit * openingZoom(v)
        expect(v.base.w * s, label).toBeLessThanOrEqual(v.safe.w + 1e-9)
        expect(v.base.h * s, label).toBeLessThanOrEqual(v.safe.h + 1e-9)
      })
    })

    /** 시작 프레임에서 페이지 공백이 새면 첫인상이 그대로 결함이다. 하한 받침은 이 함수가 아니라
     *  `settledCamera`가 지므로, **둘을 함께** 태운 결과로 잰다(호출부와 같은 조합). */
    it('하한과 함께 쓰면 배경이 뷰포트를 덮는다', () => {
      each((v, label) => {
        const opened = settledCamera({ zoom: openingZoom(v), x: 0, y: 0 }, v)
        expect(covers(opened, v), label).toBe(true)
      })
    })
  })
```

- [ ] **Step 2: RED를 눈으로 확인한다**

실행: `npx vitest run src/components/simHud.test.ts`
기대: `openingZoom is not defined` 계열로 **실패**. **무엇이 빨간지 보고에 적는다.**

- [ ] **Step 3: `simHud.ts`에 함수를 낸다**

`zoomFloor`(786행 부근)의 **바로 아래**, `settledCamera` 위에 넣는다:

```ts
/**
 * 시작 프레이밍의 **여백**(px) — 부지 둘레로 배경이 이만큼 보이는 배율에서 게임이 열린다.
 *
 * `2 * 16` 꼴로 적는 것은 **2타일**임을 숨기지 않으려는 것이다. 타일 크기를 `TileMap.TILE`에서
 * 임포트하지 않는 이유는 이 파일의 오랜 관례다 — 그러면 React가 딸려 와 vitest가 무거워진다
 * (`simHud.test.ts`의 `BASE`도 같은 이유로 16을 직접 적는다).
 *
 * ⚠️ **`BACKDROP_MARGIN`(12×8타일)과 다른 값인 데 이유가 있다**: 그쪽은 배경 그림이 뻗는
 * 범위이자 **축소의 바닥**이고, 이쪽은 **처음 보여줄 만큼**이다. 배경을 다 보여주겠다고 12타일을
 * 빼면 부지가 화면의 1/4이 되어 게임이 안 읽힌다.
 */
export const OPENING_PAD_PX = 2 * 16

/**
 * 게임이 열리는 배율 — **부지 둘레로 배경이 `OPENING_PAD_PX`만큼 보이는 zoom**.
 *
 * `zoom 1`은 정의상 *"부지 전체가 안전 영역에 맞는 배율"*이라 부지가 화면을 꽉 채운다. 그러면
 * 지역 배경 12종이 화면의 4%도 안 남는다(1280×720 실측 3.8% · 2026-08-01). 지역 선택은 이
 * 게임의 **첫 결정**인데(랜딩에서 17곳 → 4타입) 그 보상이 기본 프레임에서 잘려 나가던 자리다.
 *
 * **매직 넘버를 안 쓰는 이유**: `fit`이 뷰포트에서 나오므로 "0.9로 시작"은 창마다 다른 그림을
 * 낸다. 보이고 싶은 것(여백 N px)을 직접 적으면 창이 어떻든 같은 그림이 나온다.
 *
 * ⚠️ **이 값은 1을 넘을 수 없다 — 산술로 보장된다.** `fit = min(safe/base)`이라 `fit`을 정하는
 * 축에서 식이 `base / (base + 2·PAD)`로 접힌다(가로면 768/832 = 0.923, 세로면 512/576 = 0.889).
 * 그래서 "현행보다 당겨서 열리는" 경우가 없고 상한을 따로 걸 필요도 없다.
 *
 * **하한은 여기서 안 받친다** — 호출부(`settledCamera`·`zoomedCamera`)가 이미 `zoomFloor`로
 * 받친다. 여기서 또 받치면 같은 판정이 두 곳에 생기고, 한쪽만 고쳐지는 날 갈린다.
 */
export function openingZoom(v: CameraView): number {
  const pad = 2 * OPENING_PAD_PX
  return Math.min(v.safe.w / ((v.base.w + pad) * v.fit), v.safe.h / ((v.base.h + pad) * v.fit))
}
```

- [ ] **Step 4: GREEN 확인**

- `npx vitest run src/components/simHud.test.ts` → 전건 PASS
- `npm test` → **47 files / 1585 tests**(1580 + 신규 5) 전건 PASS
- `npm run build` → 성공
- `npx eslint src/components/simHud.ts src/components/simHud.test.ts` → 무경고

- [ ] **Step 5: 돌연변이로 그물을 실측한다 (필수)**

이 저장소는 「통과하면서 아무것도 안 지키는 단언」에 **다섯 번** 물렸다([T-144](../../../claude-docs/troubleshooting/T-144.md)·[T-145](../../../claude-docs/troubleshooting/T-145.md)·[T-146](../../../claude-docs/troubleshooting/T-146.md) + 직전 브랜치의 두 건). **신규 5건 각각에 대해 실측하고 표로 보고한다.** 최소 이 다섯:

1. `openingZoom`의 `pad`를 `0`으로(= zoom 1과 같아진다) → 「여백이 정확히」가 잡는가
2. `Math.min`을 `Math.max`로 → 무엇이 깨지는가(부지 전체 가시·여백 둘 다 걸려야 한다)
3. `pad`를 `2 * OPENING_PAD_PX`가 아니라 `OPENING_PAD_PX`로(한 쪽만) → 「여백이 정확히」가 잡는가
4. `OPENING_PAD_PX`를 `3 * 16`으로 → **아무것도 안 깨져야 정상이다**(구간을 파생시켰으므로). 깨지면 어딘가에 리터럴이 남은 것이다 — 그 자리를 보고한다
5. `v.safe.w`를 `v.host.w`로(인셋 무시) → 인셋이 있는 조합에서 무엇이 깨지는가

**아무것도 안 잡는 테스트가 있으면 보고한다.** 돌연변이는 전부 되돌리고 `git status` 클린 + 전건 통과를 재확인한 뒤 커밋한다.

- [ ] **Step 6: 커밋**

한글 커밋은 `.commit-msg-tmp`(UTF-8, BOM 없음) + `git commit -F` 후 파일 삭제. 인라인 `-m` 한글은 훅이 차단한다. 트레일러는 **빈 줄 없이 연속**.

```
feat: 게임이 열리는 배율을 여백에서 파생시킨다

zoom 1은 정의상 「부지 전체가 안전 영역에 맞는 배율」이라 부지가 화면을
꽉 채우고, 그러면 지역 배경 12종이 화면의 4%도 안 남는다. 지역 선택이
이 게임의 첫 결정인데 그 보상이 기본 프레임에서 잘려 나갔다.

매직 넘버 대신 「부지 둘레로 배경이 2타일 보이는 배율」을 적었다. fit이
짧은 축에서 결정되므로 식이 그 축에서 base/(base+2·PAD)로 접혀, 창 형상과
무관하게 [512/576, 768/832]에 갇힌다 — 1을 넘을 수 없어 상한이 필요 없다.

하한은 여기서 안 받친다. settledCamera·zoomedCamera가 이미 zoomFloor로
받치므로 여기서 또 하면 같은 판정이 두 곳에 생긴다.

Skills-used: superpowers:test-driven-development
Plugins-used: superpowers
Skill-benefit: TDD — 구간 경계를 리터럴이 아니라 여백에서 파생시키게 만들어 검사기 안의 매직 넘버를 사전에 막음
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 2: 배선 — `useCamera`와 `⌂`

**Files:**
- Modify: `src/components/TileMap.tsx` — import 2곳 · `useCamera` · `⌂` 버튼

⚠️ **이 태스크에는 새 테스트가 없다.** DOM 테스트가 없어(jsdom 미설치) 적용 시점은 겨눌 수 없고, 판정은 Task 1의 순수 함수에 있다. 여기서는 **놓기만** 한다 — 새 판정을 컴포넌트에 만들지 않는다.

- [ ] **Step 1: import 둘을 더한다**

React import(3-11행)에 `useCallback`을 더한다:

```tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
```

`./simHud` import 블록(28-45행)에서 `FATIGUE_COLOR`와 `pannedCamera` 사이에 `openingZoom`을 더한다(그 목록은 대소문자 무시 알파벳 순이다).

- [ ] **Step 2: `useCamera`가 시작 배율을 앉히게 한다**

`useCamera` 안, `const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });` **바로 아래**에 넣는다:

```tsx
  /** 플레이어가 카메라를 **한 번이라도** 건드렸는가. 그전까지는 측정이 갱신될 때마다 시작
   *  프레임을 다시 앉힌다.
   *  ⚠️ **「첫 측정 때만」으로는 안 된다**: `insets`는 부모(SimGame)가 effect에서 재는데 React가
   *  자식 effect를 먼저 돌려, 이 컴포넌트의 첫 측정은 **언제나 인셋 0**인 상태로 일어난다.
   *  그 시점의 안전 영역은 실제와 달라 배율이 어긋난다(1440×900에서 0.923이어야 할 값이 0.889).
   *  건드림을 기준으로 두면 인셋이 뒤늦게 도착해도 첫 프레임이 의도한 그림으로 맞춰진다. */
  const touched = useRef(false);
```

그리고 `measure()` 안의 `setCam((c) => settledCamera(c, next));` 한 줄을 교체한다:

```tsx
      /* 건드리기 전이면 **시작 배율로 다시 앉힌다**. 건드린 뒤에는 옛 계약 그대로 줌을 유지하고
         하한만 받친다 — 창을 줄였다고 플레이어가 당겨 둔 배율까지 되돌리면 조작이 사라진다. */
      setCam((c) => settledCamera(touched.current ? c : { ...c, zoom: openingZoom(next) }, next));
```

- [ ] **Step 3: 밖으로 나가는 setter를 건드림 표시로 감싼다**

`useCamera`의 `return { cam, setCam, view };`(133행 부근)를 교체한다:

```tsx
  /** 밖으로 나가는 setter는 **건드림을 표시하는 래퍼**다 — 휠·줌 버튼·⌂·팬이 전부 이 반환값을
   *  쓰므로 호출부를 하나도 안 고쳐도 표시된다(위 `measure`만 원본 setter를 쓴다).
   *  ⚠️ `useCallback`이 필수다: 휠 효과의 deps가 `[view, setCam]`이라, 매 렌더 새 함수가 되면
   *  네이티브 리스너를 렌더마다 떼었다 붙인다. */
  const setCamByUser = useCallback<typeof setCam>((update) => {
    touched.current = true;
    setCam(update);
  }, []);
  return { cam, setCam: setCamByUser, view };
```

- [ ] **Step 4: `⌂`도 같은 프레임으로 되돌린다**

줌 버튼 목록(944행 부근)에서 `⌂` 줄을 교체한다:

```tsx
          { label: "⌂", title: "부지 전체 보기", run: () => setCam((c) => zoomedCamera(c, safeCenter, openingZoom(view) / c.zoom, view)) },
```

그리고 그 위 주석 블록의 *"⌂는 zoom 1 복귀"* 한 줄을 아래로 고친다 — **문장이 코드와 어긋난 채 남으면 안 된다**:

```tsx
          ⌂는 **시작 프레임 복귀**다(zoom 1이 아니다 — 게임이 열리는 배율은 그보다 한 겹 뺀
          `openingZoom`이고, 둘이 갈리면 화면에 「기본 화면」이 두 개 생긴다). 목표 배율을 현재
          배율로 나눈 배수를 한 번 태우면 클램프가 중앙 정렬까지 해 주고, 하한 받침은
          `zoomedCamera`가 안에서 한다.
```

- [ ] **Step 5: 게이트**

- `npm test` → **47 files / 1585 tests 전건 통과**(이 태스크는 테스트를 안 늘린다 — 수가 변하면 뭔가 잘못됐다)
- `npm run build` → 성공
- `npm run lint` → **error 0**. 기존 경고 1건(`src/game/dialogue.ts:172 '_seed'`)은 이 브랜치와 무관하니 그대로 둔다. `react-hooks/exhaustive-deps`가 **새로** 울면 보고한다

- [ ] **Step 6: 배선의 계측 공백을 잰다 (필수)**

DOM 테스트가 없어 이 태스크는 테스트가 못 겨눈다. **그 공백의 크기를 재는 것**이 여기서 할 일이다. 아래를 심고 무엇이 깨지는지(대개 아무것도 안 깨진다) 표로 보고한다:

1. `measure()`에서 `touched.current ? c : {...}` 삼항을 `c`로 고정(시작 배율 미적용) → 무엇이 깨지는가
2. 같은 삼항을 `{ ...c, zoom: openingZoom(next) }`로 고정(건드림 무시) → 무엇이 깨지는가
3. `⌂`의 factor를 `1 / c.zoom`(옛 동작)으로 되돌림 → 무엇이 깨지는가
4. `setCamByUser`에서 `touched.current = true`를 지움 → 무엇이 깨지는가

**전부 초록이면 그것이 결론이다** — 「이 배선 넷은 브라우저 실측 말고 게이트가 없다」를 명시적으로 보고한다. Task 3이 그 넷을 눈으로 확인하는 체크리스트로 쓴다.

- [ ] **Step 7: 커밋**

```
feat: 시작 프레임을 카메라에 배선 — ⌂도 같은 자리로 돌아온다

setCam을 「건드림을 표시하는 래퍼」로 감싼 것이 이 커밋의 요지다. 휠·줌
버튼·⌂·팬이 전부 그 반환값을 쓰므로 호출부를 하나도 안 고치고 판정이
한 곳으로 접힌다.

「첫 측정 때만」이 아니라 「건드리기 전까지」인 이유: insets는 부모가
effect에서 재는데 React가 자식 effect를 먼저 돌려, 첫 측정은 언제나
인셋 0인 상태로 일어난다. 그 시점의 안전 영역은 실제와 다르다.

⌂를 zoom 1이 아니라 시작 프레임으로 돌린다. 둘이 갈리면 화면에
「기본 화면」이 두 개 생기고, 처음 본 그림으로 돌아갈 길이 없어진다.

Skills-used: none
Plugins-used: none
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 3: 브라우저 실측 · 문서 스윕 · PR

**Files:**
- Modify: `claude-docs/plan.md` · `claude-docs/changeLog.md`
- (해당하면) Create: `claude-docs/troubleshooting/T-###.md`

- [ ] **Step 1: 실제 화면에서 확인한다**

`preview_start`로 dev 서버를 띄우고(`.claude/launch.json`의 `dev`) 확인한다. **Task 2 Step 6이 「게이트 없음」으로 나온 넷이 여기 그대로 온다**:

1. **켜면 부지 둘레로 배경이 한 겹 돈다** — 지역을 골라 들어간 직후의 첫 화면
2. **줌을 당긴 뒤 창을 리사이즈해도 그 배율이 유지된다**(건드린 뒤에는 안 되돌린다)
3. **아무것도 안 건드린 채 창을 리사이즈하면 여전히 시작 프레임이다**(인셋이 늦게 와도 맞춰진다)
4. **`⌂`가 시작 프레임으로 돌아온다** — 당겨 놓고 눌렀을 때 zoom 1이 아니라 그 배율

브라우저 창이 표시돼 있지 않아 `computer{action:"screenshot"}`이 막히면, `javascript_tool`로 맵 컨테이너의 `style.transform`에서 `scale(...)`을 읽어 **수치로** 확인한다 — 1280×720·인셋 42/211 기준 기대값은 `fit × 0.889`다. 콘솔 에러 0도 `read_console_messages`로 확인한다.

- [ ] **Step 2: 문서 스윕**

⚠️ 규약을 먼저 읽는다: [changeLog 규약](../../../CLAUDE.md) — **PR 번호를 적지 않는다**(squash 머지 제목의 `(#N)`이 단일 출처).

- `claude-docs/plan.md` — **두 곳뿐이다**(완료 서사를 쌓지 않는다 · 그 파일 머리의 규율):
  1. 최상위 ✅ 한 줄을 「의자 변종 — 플레이어가 고르는 가구」 항목 **바로 위**에 넣는다(역순 목록의 맨 앞). ②·③·④ 항목과 같은 밀도로.
  2. 아트 디렉션 ① 항목 아래의 `⏸ **청진기·명찰의 확대 조건부 렌더링** … (②에서 판단)` 줄은 **그대로 둔다** — 이번 범위(⑤ 시작 프레이밍)가 아니다.
- `claude-docs/changeLog.md` — 맨 위에 `## 2026-08-01 · 제목` 한 항목. **왜/무엇을**만. 마지막 줄에 `구조적 문제 분류표 반영 상태 변경 없음(표현 층)`.
- **아트 디렉션 5단계가 이 커밋으로 완결된다** — plan.md의 ① 항목이 *"②집기·방 → ③배경 → ④HUD → ⑤카메라는 각각 별도 스펙"*이라 적고 있으니, 다섯이 다 끝났다는 사실을 새 항목 본문에 한 줄로 남긴다.

- [ ] **Step 3: 함정 스윕**

*"이번 브랜치에서 1분+ 근인 디버깅이 있었나 — 내가 아니라 서브에이전트·리뷰어가 잡은 것 포함"*을 **명시적으로** 묻는다([CLAUDE.md 「SDD trap 스윕」](../../../CLAUDE.md)). 있으면 `claude-docs/troubleshooting/T-###.md` 신설(frontmatter `summary:` + `tags: type/troubleshooting` + 4필드 *증상/원인/해결/재발방지*). T번호는 글로벌 시퀀스라 **기존 최대값 + 1**이다.

신설했으면 목차를 **자동 생성**한다(손으로 고치면 pre-commit이 거부한다):

```bash
powershell -ExecutionPolicy Bypass -File scripts/rebuild-troubleshooting-index.ps1 -HubPath claude-docs/troubleshooting.md
```

- [ ] **Step 4: 최종 확인 후 PR**

```bash
npm test && npm run build && npm run lint
```

`gh pr create --body-file`(UTF-8)로 올린다. **머지는 하지 않는다** — 사용자에게 물어 결정을 받는다.

---

## 2. 실행 기록 — 이 계획이 틀렸던 곳

계획을 고쳐 쓰면서 **무엇이 왜 틀렸는지는 지우지 않는다**(직전 두 플랜의 관례).

| 어디 | 무엇이 틀렸나 | 어떻게 드러났나 |
|---|---|---|
| 스펙 §5 · 계획 Task 2 | 「**첫 측정 때만**」 적용이라고 적었는데, `insets`가 부모 effect에서 오고 React가 자식 effect를 먼저 돌려 **첫 측정은 언제나 인셋 0**이다. 그러면 시작 배율이 늘 실제와 다른 안전 영역에서 계산된다 | 계획 작성 중 `SimGame.tsx:576`을 읽다 발견. 규칙을 「건드리기 전까지」로 바꿔 해소 |
| 계획 Task 1 · 계약 5 | 「하한과 함께 쓰면 배경이 뷰포트를 덮는다」가 **48조합 중 1개에서 성립 불가**였다 — `600×900` + 인셋 `120/320`은 덮는 데 zoom 3.214가 필요한데 `ZOOM_MAX`가 3이다 | Task 1 구현자가 프로브로 실측. `zoomFloor` 자기 주석과 기존 테스트가 **이미 잠가 둔 천장**이라 카메라 기제를 안 고치는 한 참으로 만들 수 없다 |
| 계획 Task 1 · 계약 5의 취지 | 그 단언이 「페이지 공백이 새지 않는다」를 잡는다고 적었는데 **유한한 값이면 무엇이든 통과**한다(`settledCamera`가 받치고 `clampCamera`가 커버리지를 강제한다). 실측: `999`·`−1`·`0` 생존, `NaN`만 사망 | 같은 구현자가 추가 프로브로 확인하고 스스로 보고. 주석·제목을 실측대로 정정 |

**세 번째는 이 저장소가 반복해 밟는 병이다** — 단언이 약속하는 것과 실제로 무는 것이 갈리는 것([T-144](../../../claude-docs/troubleshooting/T-144.md)·[T-145](../../../claude-docs/troubleshooting/T-145.md)). 이번엔 **구현자가 커밋 전에** 잡았다.

### 남는 결함 — 이번 범위 밖

**극단 형상 창에서는 최대 줌에서도 배경이 뷰포트를 못 덮는다**(예: `600×900` + 인셋 `120/320`). 이 브랜치가 만든 것이 아니라 **원래 있던 천장**이고 `zoomFloor` 주석이 이미 적어 뒀다 — *"배경 비율(72×48타일)을 벗어난 극단 창은 최대 줌에서도 다 못 덮는다. 그때는 공백이 남는 것이 이 창의 천장이고, 올리려면 `BACKDROP_MARGIN`을 키워야 한다."* 고치려면 배경 그림이 뻗는 범위를 바꿔야 하므로 **아트 작업**이고 시작 프레이밍과 별개 축이다.

---

## 3. 범위 밖 — 이번에 하지 않는 것

| 무엇 | 왜 |
|---|---|
| **건설 중 자동 추적·폰 따라가기** | 카메라가 플레이어 손을 뺏는 순간 조작 감각이 통째로 바뀐다. 별도 설계가 필요하다 |
| **줌 애니메이션** | 기존 `⌂`도 즉시 이동이다. 여기만 부드럽게 하면 조작이 갈린다 |
| **지역별 차등 배율** | 스펙 §7 — 값이 4개로 늘고 같은 게임인데 지역마다 화면 크기가 달라진다 |
| **`BACKDROP_MARGIN` 확대** | 배경 그림 범위를 늘리는 것은 아트 작업이고, 시작 프레이밍과 별개 축이다 |
