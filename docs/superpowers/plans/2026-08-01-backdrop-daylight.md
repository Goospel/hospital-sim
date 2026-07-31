---
tags:
  - type/plan
---

# 배경 12종 낮 전환 구현 계획 (아트 디렉션 ③)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 야경이던 배경 12종을 흐린 날 아침 빛으로 바꾸고, 도심을 무채색으로 되돌려 지역 4종이 색으로 갈리게 한다.

**Architecture:** `BACKDROP_PALETTE` 65색을 새 휘도 대역 + 색조 계열로 통째로 교체하고(값은 이 계획이 전부 계산해 들고 있다), 밤 장치(창불·전조등·가로등 웅덩이·짙은 비네트)를 낮 장치(햇빛 반사·옅은 비네트)로 바꾼다. 그리기 함수·좌표·구도는 한 줄도 안 바뀐다. 색조는 지금까지 무계측이었으므로 이번에 처음 테스트로 잠근다.

**Tech Stack:** Canvas 2D + vitest(`stubCtx`로 그리기 호출을 가로채는 기존 방식).

**스펙:** [2026-08-01-backdrop-daylight-design.md](../specs/2026-08-01-backdrop-daylight-design.md) · **브랜치:** `feat/backdrop-reband` (origin/main 기준, 생성 완료)

**공통 규약** (모든 태스크):
- 커밋 메시지는 한글 — `.commit-msg-tmp`(UTF-8, BOM 없음)에 쓰고 `git commit -F .commit-msg-tmp && rm .commit-msg-tmp`. 인라인 `-m` 한글 금지(훅 차단).
- 트레일러(`Skills-used:`…`Co-Authored-By:`)는 빈 줄 없이 연속.
- 한글 검색에 Git Bash grep 금지(무성 실패) — Grep 도구(ripgrep) 사용. `rg` 명령은 PATH에 없다.
- 돌연변이는 Edit 도구로만 심고 복원(T-139).
- 휘도는 프로덕션 `relativeLuminance`(0~255 스케일)를 쓴다. 부지 `OUTSIDE_FLOOR` = **176.02**.

---

### Task 1: 구간표를 낮 대역으로 + 요구 간격 재계산 (RED)

**Files:**
- Modify: `src/components/backdropPalette.test.ts` (CATEGORIES 표 8행 + 간격 3행)

배경 지식: 이 표가 곧 스펙이다. **대역과 요구 간격은 반드시 같은 커밋에서 움직인다** — 쪼개면 불변식이 깨진 커밋이 히스토리에 남는다(파일 주석의 경고). 지금까지 세 번은 대역을 **위로 밀었고** 이번은 **아래를 끌어올려 좁히는** 첫 사례라, 옛 간격(33.6/12.0/14.4)을 그대로 두면 통과가 **불가능**해진다.

- [ ] **Step 1: CATEGORIES 8행의 min/max를 새 대역으로 교체**

각 카테고리 객체의 `min`·`max`만 아래 값으로 바꾼다(`name`·`keys`는 그대로):

| 카테고리(이름 앞부분) | 현행 | **새 값** |
|---|---|---|
| 지면 base | 53~74 | **82~100** |
| 지면 노이즈 | 74~89 | **98~114** |
| 도로 | 77~94 | **92~108** |
| 인도·산책로 | 98~113 | **116~132** |
| 건물 본체 | 103~128 | **122~142** |
| 건물 디테일 | 129~147 | **143~156** |
| 풀포기·관목 | 98~123 | **104~128** |
| 랜드마크 | 132~154 | **134~152** |

- [ ] **Step 2: 요구 간격 3건을 새 대역 실측의 65%로 교체**

`it.each([...])`의 `gap` 값만 바꾼다:

```ts
    { what: '건물 본체 − 지면', a: BODY, b: GROUND, gap: 27.8 },
    { what: '인도 − 도로', a: WALK, b: ROAD, gap: 13.0 },
    { what: '건물 디테일 − 건물 본체', a: DETAIL, b: BODY, gap: 12.5 },
```

(Task 2 팔레트의 실측은 42.8 / 20.0 / 19.3이고 위 값은 그 65% — 이 저장소가 써 온 규율이다. 주석의 ⚠️ 문단에 이번이 **좁히는 방향의 첫 사례**임을 한 줄 덧붙인다.)

- [ ] **Step 3: RED 확인**

Run: `npx vitest run src/components/backdropPalette.test.ts`
Expected: FAIL 다수 — 팔레트가 아직 야경이라 전 카테고리가 구간 아래에 있다(예: `지면 base ... = 63.50`이 `toBeGreaterThanOrEqual(82)`에서 실패). 실패 목록을 눈으로 확인하고 넘어간다.

- [ ] **Step 4: 커밋** — 제목: `test: 배경 구간표를 낮 대역으로 — 아래를 끌어올려 좁힌다 (RED)`

---

### Task 2: 팔레트 65색을 낮 팔레트로 교체 (GREEN)

**Files:**
- Modify: `src/components/Backdrop.tsx` (`BACKDROP_PALETTE` 65줄 + 위 주석 문단)

배경 지식: 값은 이 계획이 전부 계산해 들고 있다 — 카테고리 안의 상대 위치를 보존한 채 새 대역으로 사상하고, 키 이름의 뜻으로 색조 계열을 배정한 결과다. **계산 결과는 계약 4건을 전부 통과함이 확인됐다**(서열 90.1 < 132.9 < 142.8 < 176.0 · 부지−랜드마크 33.2 ≥ 30 · 8개 카테고리 이탈 0 · 도심 표면 15/15 무채색).

- [ ] **Step 1: 65개 값을 아래 표대로 교체**

키 이름과 순서는 그대로 두고 hex만 바꾼다:

| 키 | 현행(야경) | **낮** |
|---|---|---|
| `ground` | #3e3e5b | **#575c62** |
| `grassBase` | #35463c | **#47683d** |
| `grassNoiseLight` | #3a5e3a | **#537847** |
| `grassNoiseDark` | #353e35 | **#405c36** |
| `tuft` | #4f7d6a | **#628e53** |
| `tuftShade` | #467362 | **#4f7344** |
| `shrub` | #597360 | **#577e4a** |
| `medianStrip` | #354635 | **#47673c** |
| `pavementBase` | #463c4f | **#575a5e** |
| `pavementNoiseLight` | #52525b | **#63676c** |
| `pavementNoiseDark` | #353e52 | **#54575b** |
| `pavementSeam` | #4f3559 | **#53565a** |
| `parkingLot` | #414165 | **#5e6165** |
| `dirtBase` | #4f3e30 | **#6d5a3b** |
| `dirtNoiseLight` | #605237 | **#7c6743** |
| `dirtNoiseDark` | #483e2b | **#695839** |
| `fieldFurrowLight` | #5b5235 | **#74603f** |
| `fieldFurrowDark` | #483e2b | **#695839** |
| `paddyBase` | #304d37 | **#556c3a** |
| `paddyCellLight` | #375b48 | **#546c3a** |
| `paddyCellDark` | #2b4635 | **#4d6235** |
| `forestFloor` | #2b4635 | **#37663b** |
| `houseYardShadow` | #353e2b | **#615034** |
| `road` | #485976 | **#666a6f** |
| `sidewalk` | #6a62a1 | **#72767b** |
| `laneShoulder` | #485948 | **#46653c** |
| `dirtLane` | #605937 | **#806a45** |
| `leveePath` | #766a46 | **#9c8154** |
| `seawall` | #4f7346 | **#707479** |
| `parkPath` | #7f654d | **#90784e** |
| `paddyBank` | #525932 | **#617c43** |
| `roofBase` | #7a6eb2 | **#828a92** |
| `roofEdge` | #7373b9 | **#858d95** |
| `roofVent` | #8686d8 | **#9399a1** |
| `roofVentShade` | #8e7dcc | **#889098** |
| `roofPenthouse` | #a88965 | **#a0998b** |
| `aptBody` | #7a6eb4 | **#828a92** |
| `aptEdge` | #7176b4 | **#878f97** |
| `aptTower` | #8e84d3 | **#9399a1** |
| `aptTowerLit` | #8689d6 | **#969da4** |
| `houseRoofWarm` | #957359 | **#b28563** |
| `houseRoofWarmShade` | #7d6c4a | **#a47551** |
| `houseRidgeWarm` | #a88965 | **#bc9476** |
| `houseRoofCool` | #846aaf | **#6d8ca2** |
| `houseRoofCoolShade` | #6767a6 | **#607f96** |
| `houseRidgeCool` | #9284d6 | **#859eb1** |
| `materialStack` | #82734d | **#8d8574** |
| `materialStackShade` | #7f6c4a | **#857d6c** |
| `breakwater` | #6a7390 | **#81868a** |
| `lampPost` | #7d7348 | **#8b8372** |
| `vehicleBlue` | #5e739a | **#6186bb** |
| `vehicleRed` | #a36273 | **#c2726a** |
| `vehicleGreen` | #597d59 | **#4c9959** |
| `treeCanopy` | #6c9c76 | **#5fa354** |
| `treeCanopyLit` | #6aa373 | **#68ac5e** |
| `treeShade` | #609c71 | **#5b9d51** |
| `forestCanopy` | #629c7f | **#57a15d** |
| `forestCanopyLit` | #65a376 | **#62aa68** |
| `forestCanopyDark` | #76927f | **#539a59** |
| `riverBase` | #6e8eb9 | **#5790ac** |
| `riverFlow` | #7395c0 | **#6a9cb5** |
| `seaBase` | #6e8eb9 | **#5790ac** |
| `seaRipple` | #7695c2 | **#6c9eb6** |
| `roofSkylight` | #a89265 | **#a6986f** |
| `bench` | #9a9059 | **#9d8d60** |

- [ ] **Step 2: 팔레트 위 주석에 다섯 번째 문단 추가**

`BACKDROP_PALETTE` 바로 위 JSDoc의 네 번째 ⚠️ 문단 뒤에 넣는다:

```
 * ⚠️ **다섯 번째 — 야경에서 낮으로**(2026-08-01). 앞의 넷은 어두운 화면 안에서 대역을 짜내거나
 * 통째로 밀어 올리는 싸움이었고 이번은 **방향이 반대다**: 지면(면적 지배)을 63.5 → 90.1로 끌어올려
 * 스프레드를 79 → 52로 **좁혔다**. 부지 176이 하드 천장이라 쨍한 정오는 불가능하고, 목표는
 * 「흐린 날 아침 빛」이다(랜드마크 평균이 146을 넘으면 「부지 − 랜드마크 ≥ 30」이 먼저 깨진다).
 * 그리고 **색조를 처음으로 손봤다** — ×2.4가 색상비를 보존한 탓에 도심이 청보라 74.8% ·
 * 무채색 0.5%였다(실행 화면의 캔버스 픽셀 실측). 도심 표면 15키를 전부 채도 8% 미만으로 되돌리고,
 * 지역별로 색조 계열을 갈랐다(도심=중성 / 신도시=냉 회백+조경 / 지방=황토·따뜻한 지붕 / 농어촌=논·숲·물).
 * 색조는 이제 `backdropPalette.test.ts`가 잠근다 — 그전까지는 **무계측이라 보라가 조용히 들어왔다**.
```

- [ ] **Step 3: GREEN 확인**

Run: `npx vitest run src/components/backdropPalette.test.ts`
Expected: PASS 전건. 실패가 남으면 그 키의 hex를 **표 값 그대로** 넣었는지 먼저 확인한다(오타가 가장 흔한 원인).

- [ ] **Step 4: 전체 게이트** — `npx tsc --noEmit && npm run lint && npm test` 통과.

- [ ] **Step 5: 돌연변이 2건** (Edit로 심고 원복, `git status` 깨끗 확인)
1. `pavementBase`를 옛 값 `#463c4f`로 → 지면 base 구간 하한(82) 위반 FAIL 확인 → 원복.
2. `treeCanopyLit`을 `#8fd47f`(휘도 ~180)로 → 랜드마크 상한(152) **그리고** 「부지 − 랜드마크 ≥ 30」 둘 다 FAIL 확인 → 원복.

- [ ] **Step 6: 커밋** — 제목: `feat: 배경 팔레트를 낮으로 — 지면을 끌어올리고 도심을 무채색으로`

---

### Task 3: 색조 계약 신설 — 보라가 다시 못 들어오게

**Files:**
- Modify: `src/components/backdropPalette.test.ts` (describe 1개 추가)

배경 지식: 지금까지 이 파일은 **휘도만** 잰다. 그래서 도심이 청보라 74.8%가 되어도 전건 초록불이었다. 이번에 색조 축을 처음 잠근다. 지역별 fill 색 수집은 파일에 이미 있는 `stubCtx()`(그리기 호출을 가로채 `calls.fills`에 색을 모은다)를 그대로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성** — 파일 맨 끝에 추가

```ts
/** hex → [색상각(0~360), 채도(0~1)] — 색조 축 전용. 휘도는 위 describe가 relativeLuminance로 잰다. */
function hueSat(hex: string): [number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (mx + mn) / 2
  return [h, d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))]
}

/**
 * 색조 계약 — **이 축은 2026-08-01까지 무계측이었다.**
 * ×2.4 일괄 상승이 색상비를 보존한 탓에 도심 배경이 청보라 74.8% · 무채색 0.5%가 됐는데
 * (실행 화면 캔버스 픽셀 실측) 휘도만 보는 검사는 그것을 **전건 통과시켰다**.
 * 휘도 표가 "얼마나 밝은가"를 잠그듯, 여기서는 "무슨 색인가"를 잠근다.
 */
describe('BACKDROP_PALETTE 색조 — 도시는 무채색이고 지역은 색으로 갈린다', () => {
  /** 도심이 바닥·건물로 쓰는 표면 키 — 아스팔트·콘크리트·유리라 무채색이어야 한다. */
  const URBAN_SURFACE = [
    'pavementBase', 'pavementNoiseLight', 'pavementNoiseDark', 'pavementSeam', 'parkingLot',
    'road', 'sidewalk', 'roofBase', 'roofEdge', 'roofVent', 'roofVentShade',
    'aptBody', 'aptEdge', 'aptTower', 'aptTowerLit',
  ] as const

  it('도심 표면 키는 전부 무채색이다 — 채도 8% 미만', () => {
    for (const k of URBAN_SURFACE) {
      const hex = BACKDROP_PALETTE[k]
      const [, s] = hueSat(hex)
      expect(s, `${k}(${hex}) 채도 ${(s * 100).toFixed(1)}%`).toBeLessThan(0.08)
    }
  })

  /**
   * ⚠️ **대역을 250~310이 아니라 230~320으로 잡는 이유** — 조사에서 실측된 함정이다.
   * HSL 색상각은 순수 sRGB 파랑을 240°라 부르지만 그건 원색의 이름일 뿐 지각 좌표가 아니다.
   * 지각 공간(OKLCh)에서 재면 순수 파랑이 264°이고 **그 너머가 보라**인데, HSL 250~310으로 세면
   * `sidewalk`(248°) · `roofEdge`·`roofVent`·`aptTowerLit`(240°)가 전부 대역 **밖으로 빠진다** —
   * 팔레트 주석이 「인도가 보라색이 된다」라고 스스로 지목한 바로 그 키가 검사를 통과해 버린다.
   * 이 팔레트의 물색은 195~215°에 있으므로 230부터 막아도 진짜 파랑은 안 걸린다.
   */
  it('팔레트 어디에도 보라가 없다 — 색상각 230~320°는 이 게임의 색이 아니다', () => {
    for (const [k, hex] of Object.entries(BACKDROP_PALETTE)) {
      const [h, s] = hueSat(hex)
      if (s < 0.08) continue // 무채색은 색상각이 무의미하다
      expect(h < 230 || h > 320, `${k}(${hex}) 색상각 ${h.toFixed(0)}°`).toBe(true)
    }
  })

  it('자연 키는 유채색을 유지한다 — 무채색화가 초목·물까지 삼키면 지역이 안 갈린다', () => {
    for (const k of ['grassBase', 'paddyBase', 'forestCanopy', 'treeCanopy', 'seaBase', 'dirtBase'] as const) {
      const [, s] = hueSat(BACKDROP_PALETTE[k])
      expect(s, `${k} 채도 ${(s * 100).toFixed(1)}%`).toBeGreaterThan(0.15)
    }
  })

  /** 지역별 분리 — 그려진 색을 지역마다 모아 「무채색 비율」과 「초록 비율」의 서열을 잠근다.
   *  평균 색상각은 원형이라 평균이 뜻을 잃는다(0°와 350°의 평균이 175°). 비율로 잰다. */
  const share = (region: 'URBAN' | 'NEWTOWN' | 'PROVINCIAL' | 'RURAL') => {
    const { ctx, calls } = stubCtx()
    drawBackdrop(ctx, region, 1)
    const hexes = calls.fills.filter((f): f is string => typeof f === 'string' && /^#[0-9a-fA-F]{6}$/.test(f))
    const hs = hexes.map(hueSat)
    const n = hs.length || 1
    return {
      neutral: hs.filter(([, s]) => s < 0.08).length / n,
      green: hs.filter(([h, s]) => s >= 0.08 && h >= 70 && h <= 160).length / n,
    }
  }

  it('도심이 가장 무채색이고, 농어촌이 가장 초록이다', () => {
    const u = share('URBAN'), nt = share('NEWTOWN'), p = share('PROVINCIAL'), r = share('RURAL')
    const trace = `무채색 도심 ${u.neutral.toFixed(2)} / 신도시 ${nt.neutral.toFixed(2)} / 지방 ${p.neutral.toFixed(2)} / 농어촌 ${r.neutral.toFixed(2)}`
    expect(u.neutral, trace).toBeGreaterThan(p.neutral)
    expect(u.neutral, trace).toBeGreaterThan(r.neutral)
    const gtrace = `초록 도심 ${u.green.toFixed(2)} / 농어촌 ${r.green.toFixed(2)}`
    expect(r.green, gtrace).toBeGreaterThan(u.green)
  })
})
```

- [ ] **Step 2: 실행**

Run: `npx vitest run src/components/backdropPalette.test.ts`
Expected: Task 2의 팔레트에서 **전건 PASS**(이 테스트는 이미 만족된 계약을 잠그는 것이라 RED 단계가 없다 — 대신 Step 3의 돌연변이가 계측기의 진위를 증명한다).

`share()`가 쓰는 `stubCtx`·`drawBackdrop` import가 파일 상단에 이미 있는지 확인하고, 없으면 추가한다. `calls.fills`의 실제 타입을 확인해 필터를 맞춘다(문자열 hex만 남기면 된다 — 그라디언트 객체가 섞여 있을 수 있다).

- [ ] **Step 3: 돌연변이 3건** (Edit로 심고 원복)
1. `road`를 옛 값 `#485976`(채도 22%)으로 → 「도심 표면 무채색」 FAIL 확인.
2. `sidewalk`를 옛 값 `#6a62a1`(색상각 247°)으로 → 무채색 FAIL. 이어 `#8a62d1`(색상각 265°)로 → 「보라가 없다」도 FAIL 확인.
3. `grassBase`를 `#5a5a5a`(무채색)로 → 「자연 키는 유채색」 FAIL 확인.
전부 원복 후 `git status` 깨끗 확인.

- [ ] **Step 4: 커밋** — 제목: `test: 배경 색조를 처음 잠근다 — 도심 무채색·보라 금지·지역 분리`

---

### Task 4: 밤 장치를 낮 장치로 — 발광 패스·비네트·크림색 디테일

**Files:**
- Modify: `src/components/Backdrop.tsx` (발광 상수·glow 호출 7곳·가로등 웅덩이·비네트·크림색 fill 다수)

배경 지식: 파일 주석이 스스로 경고한다 — *"`lighter`는 채널을 더하므로 어두운 배경에서만 빛으로 보이고 **밝은 면에 얹으면 그냥 하얗게 탄다**"*. 즉 Task 2가 팔레트를 밝히는 순간 이 패스는 **반드시** 손봐야 한다([T-140](../../../claude-docs/troubleshooting/T-140.md)과 같은 결: 안 건드린 계수는 유지되는 게 아니라 뜻이 바뀐다).

**패스 자체는 지우지 않는다** — 테스트가 12종 전부에서 `lighter` 합성과 `source-over` 복귀를, URBAN 변형 2에서 그라디언트 4개 이상을 잠근다. 무엇을 그리는지만 바꾼다.

- [ ] **Step 1: 발광 색 상수를 햇빛 반사로 교체** (`Backdrop.tsx:203-204`)

```ts
  /* 낮 전환(③) — 창불(밤)에서 **유리·금속에 튄 햇빛**으로 바뀌었다. 밝은 팔레트 위에서 additive는
     쉽게 타므로 색은 중성 백색에 가깝게, 알파는 밤 값의 1/3 수준으로 내린다. */
  const SUN_GLINT = "255,251,236";
  const SKY_GLINT = "226,240,255";
```

`WINDOW_WARM`·`WINDOW_COOL`은 삭제하고 아래 Step 2에서 호출부를 전부 새 상수로 바꾼다(미사용 상수가 남으면 lint가 잡는다).

- [ ] **Step 2: glow 호출 7곳의 색·알파 교체**

| 위치(현행 라인) | 무엇 | 현행 | **낮** |
|---|---|---|---|
| 286 | 가로등 | `"255,214,150", 0.2` | `SUN_GLINT, 0.05` |
| 295 | 전조등(세로) | `"255,240,200", 0.3` | `SUN_GLINT, 0.05` |
| 296 | 전조등(가로) | `"255,240,200", 0.3` | `SUN_GLINT, 0.05` |
| 310 | 천창 | `WINDOW_WARM, 0.3` | `SUN_GLINT, 0.12` |
| 314 | 사무동 창 | `WINDOW_COOL, 0.16` | `SKY_GLINT, 0.07` |
| 325 | 계단실 | `WINDOW_COOL, 0.18` | `SKY_GLINT, 0.07` |
| 329 | 아파트 세대 | `WINDOW_WARM, 0.2` | `SKY_GLINT, 0.06` |
| 342 | 주택 창 | `warm ? WINDOW_WARM : WINDOW_COOL, 0.22` | `warm ? SUN_GLINT : SKY_GLINT, 0.08` |

(호출 좌표·반경은 그대로 — 유리 위치는 낮에도 같은 자리다.) 342행의 삼항은 구조를 유지한다.

- [ ] **Step 3: 가로등 지면 웅덩이를 없앤다** (`Backdrop.tsx:281-283`)

낮에 가로등은 안 켜져 있으므로 바닥 광원 웅덩이는 거짓말이다. 그라디언트 호출 자체는 남기되(테스트가 세는 그라디언트 수는 발광 flush가 이미 채운다) 알파를 0으로 두지 말고 **호출을 제거**한다 — 죽은 그라디언트를 남기는 것이 더 나쁘다. `pxf(...)`로 그리는 **기둥은 남긴다**(낮에도 가로등은 서 있다).

제거 대상은 `const rad = T * 1.6;`부터 그 그라디언트를 `fill`하는 줄까지다. 제거 후 `npx tsc --noEmit`으로 미사용 변수가 없는지 확인한다.

- [ ] **Step 4: 비네트를 낮 값으로** (`Backdrop.tsx:658-659`)

```ts
  vig.addColorStop(0, "rgba(28,32,38,0)");
  vig.addColorStop(1, "rgba(28,32,38,0.22)");
```

(현행 `rgba(6,6,14,0.5)`는 거의 검정 50%라 밝은 배경의 네 귀퉁이를 진흙으로 만든다. 목적 — 시선을 가운데 부지로 모으기 — 은 유지하고 세기만 낮춘다.)

- [ ] **Step 5: 크림색 디테일을 어두운 선으로**

`rgba(216,207,175, …)`는 **어두운 바닥 위의 밝은 선**(횡단보도·이음매·차선)이었다. 밝은 바닥에서는 반대여야 한다. 아래 라인의 색만 `rgba(52,58,64, …)`로 바꾸고 **알파는 그대로 둔다**: 234 · 236 · 242 · 244 · 250 · 255 · 260 · 264 · 291 · 352 · 360 · 378 · 404 · 416 · 483.

예외 **606행**(`등대 불`)은 발광이므로 `rgba(255,251,236,0.10)`으로 바꾼다 — 낮의 등대는 안 켜지지만 이 자리는 흰 등탑의 햇빛 반사로 읽힌다.

- [ ] **Step 6: 게이트** — `npx tsc --noEmit && npm run lint && npm test` 전건 통과. 특히 `12종이 전부 발광 패스를 돌고 합성 모드를 되돌린다`와 `도심 변형 2의 그라디언트 4개 이상`이 살아 있는지 확인한다.

- [ ] **Step 7: 커밋** — 제목: `feat: 밤 장치를 낮 장치로 — 창불→햇빛 반사, 비네트·선 색 반전`

---

### Task 5: 브라우저 실측 12종 + 문서 스윕 + PR

**Files:**
- 보정: 실측에서 걸린 자리만
- Modify: `claude-docs/plan.md` · `claude-docs/changeLog.md`
- 확인만: `docs/concept/structural-problems-checklist.md`(표현 층이라 대체로 무변)

- [ ] **Step 1: 12장면 전수 실측**

dev 서버를 띄우고, 지역 선택 화면에서 **변형을 고정해** 12장면을 전부 본다. 변형은 `SimGame.tsx:1120`의 `Math.floor(Math.random() * BACKDROP_COUNT)`가 정하므로 브라우저에서 `Math.random`을 고정한다:

```js
// 지역 선택 화면에서 실행 — 0.1→변형0, 0.5→변형1, 0.9→변형2
Math.random = () => 0.9;
[...document.querySelectorAll('[role="dialog"] button')].find(b => b.getAttribute('title') === '서울')?.click();
```
(다음 tick에 「여기에 짓는다」를 클릭한다. aria 스냅샷이 낡을 수 있으니 상태 확인은 `evaluate_script`로 한다.)

배경 캔버스만 따로 보려면(HUD·딤에 안 가림):
```js
const c = document.querySelector('canvas');
const t = document.createElement('canvas');
t.width = c.width / 2; t.height = c.height / 2;
const tc = t.getContext('2d'); tc.imageSmoothingEnabled = false;
tc.drawImage(c, 0, 0, t.width, t.height);
return t.toDataURL('image/png').split(',')[1];   // base64 → 파일로 디코드해 본다
```

각 장면에서 확인할 것: ⓐ 낮으로 읽히는가(밤의 잔재 없음) ⓑ 부지가 여전히 무대인가(배경이 부지보다 밝아 보이지 않음) ⓒ 지역이 서로 구별되는가 ⓓ 발광이 하얗게 타지 않는가 ⓔ 비네트 귀퉁이가 진흙이 아닌가.

- [ ] **Step 2: 픽셀 재측정으로 진단 수치를 갱신**

각 지역에서 캔버스 픽셀의 평균 휘도·채도·무채색 비율·청보라 비율을 다시 재서 스펙 §0 표의 「전」에 대응하는 「후」 수치를 얻는다(측정 코드는 §0 표를 만든 것과 같은 방식 — 픽셀 순회 + HSL 변환). 도심 청보라가 **74.8% → 한 자릿수**로 떨어졌는지가 이번 작업의 합격선이다.

- [ ] **Step 3: 스크린샷 사용자 전달** (SendUserFile — 도심·농어촌 전후 대비 2~4장)

- [ ] **Step 4: 문서 스윕**
- `claude-docs/plan.md`: 아트 디렉션 항목의 ⏸「도시 배경의 보라 기미」를 ✅로 갱신 + 완료 항목 한 줄(진단이 「보라 기미」에서 「야경」으로 정정됐음을 명시).
- `claude-docs/changeLog.md` 맨 위 항목(PR 번호 없이).
- 트랩 스윕: 1분+ 근인 디버깅이 있었으면 `T-###` 신설(T-143 다음) + `scripts/rebuild-troubleshooting-index.ps1 -HubPath claude-docs/troubleshooting.md`.
- 스펙 §7 미해결 4건 중 해소된 것을 스펙에 반영.

- [ ] **Step 5: 커밋 + PR** — push 후 `gh pr create`(본문 한글, `--body-file` UTF-8). **머지는 사용자에게 물은 뒤에만.**

---

## 실행 기록 (SDD · 2026-08-01)

- **Task 1** — RED 확인: 6개 카테고리가 전부 **하한 미달**(상한 초과 0). 예상대로 야경 팔레트가 낮 대역에 못 미친다.
- **Task 2** — ⚠️ **이 계획서의 표가 틀렸다.** 65색 중 **13개**가 대역 경계에 정확히 붙어 hex 반올림으로 0.01~0.55씩 새어 나갔다(가장 아슬한 것: `aptTowerLit` 156.0172 vs 상한 156). 값을 카테고리 안 상대 위치의 **양 끝에 정확히** 사상한 것이 원인이다. 구현자가 값을 임의로 고치지 않고 멈춰 보고했고, 채널 ±1 보정으로 닫았다(지각 척도 ΔE76 최대 **0.777**로 식별 한계 아래 — 색조 영향 없음). **다음에 대역표를 뽑을 땐 양쪽에 2 이상 여유를 두고 잡는다.**
- **Task 3** — 리뷰가 **§5-3이 명목상만 충족**임을 잡았다: 지역 분리 단언이 **옛 보라 팔레트에서도 전건 통과**했다(분모 사고 — 무채색 키가 지역마다 1개씩인데 도심의 분모만 작았다). 서열 → 최소 격차로 교체하고 4지역·3변형 전수로 넓혀 옛 팔레트가 5건 FAIL로 죽는 것을 확인([T-144](../../../claude-docs/troubleshooting/T-144.md)). 함께 닫은 것: 요구 간격 무계측(→ 구간표 중점에서 파생 · 양방향으로 문다) · 대역 여유 0.03 붕괴(→ 양쪽 2) · 채도 6.67% 보라와 주황색 잔디가 전 단언을 빠져나가던 두 구멍.
- **Task 4** — 계획대로. 부수 발견: 가로등 지면 웅덩이를 제거하자 「가로등이 방사형 그라디언트를 만든다」 테스트가 겨누던 대상이 사라졌다. **삭제할 뻔했는데 돌연변이가 막았다** — 발광 flush의 `createRadialGradient`를 단색 `fillStyle`로 바꾸는 돌연변이를 심으니 「발광 패스」 테스트가 **안 물었다**. 즉 승계가 없어 지웠으면 커버리지가 실제로 줄었다. 삭제 대신 **취지를 다시 써서** 발광 큐의 그라디언트를 겨누도록 했다(별도 커밋 `9ae8ef1`).
- **Task 5** — 브라우저 실측 전 항목 통과. 발광이 하얗게 탄 자리 **0%**로 T-140 계열 재발 없음을 확인.

## 계획 자기 검토 (writing-plans self-review)

- **스펙 커버리지**: §0 진단 → Task 5 Step 2가 「후」 수치로 닫는다 · §1-1 낮 전환 → Task 1·2·4 · §1-2 지역 분화 → Task 2 색조 배정 + Task 3 분리 단언 · §2 천장 산술 → Task 1 대역표(계산 검증 완료) · §3 지역 톤 표 → Task 2 · §4 발광 패스 용도 변경 → Task 4 · §5 계약 3항 → Task 1(구간·간격) + Task 3(색조) · §6 YAGNI → 어느 태스크도 좌표·구도·부지 천장·시간대 전환을 안 건드린다 · §7 미해결 → Task 5 Step 4. 공백 없음.
- **플레이스홀더**: 없음 — 65색 전부와 발광 8곳·비네트·선 색이 실제 값으로 들어 있다. Task 4 Step 5의 라인 번호 목록은 현행 파일 실측이고, Task 3 Step 2의 "`calls.fills` 실제 타입 확인"은 구현 시점 확인이 필요한 의도된 지시다.
- **타입 일관성**: `SUN_GLINT`·`SKY_GLINT`(Task 4 Step 1 정의 → Step 2 사용) · `hueSat`·`share`(Task 3 안에서 정의·사용) · 카테고리 이름은 기존 테스트의 `name` 문자열을 그대로 쓴다.
