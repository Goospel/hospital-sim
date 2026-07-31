---
tags:
  - type/plan
---

# 밝은 아트 디렉션 구현 계획 (①팔레트 + 인물)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 화면을 어두운 저채도에서 밝은 병원 톤(흰색 + 수술복 청록)으로 전환하고, 밝아진 바닥에서 사라지는 의사를 3/4 시점 스프라이트로 되살린다.

**Architecture:** 배경 60여 색은 **RGB 채널 일괄 배수**로 올린다 — 이 프로젝트의 휘도 식이 RGB에 선형이라 배수 k를 곱하면 휘도가 정확히 k배가 되고, 색상비가 보존되며(T-115 파랑 폭주 경로 없음), 카테고리 간 간격도 k배로 늘어난다. 부지·실내는 목표값을 직접 지정한다. 인물은 정탑다운에서 3/4로 기울여 흰 가운이 옷으로 읽히게 하고, 누운 환자만 탑다운 예외로 남긴다.

**Tech Stack:** TypeScript · React 19 · Next.js 16 · vitest · SVG(인라인) · Canvas 2D(배경)

**스펙:** [밝은 아트 디렉션](../specs/2026-07-31-bright-art-direction-design.md)

---

## 파일 구조

| 파일 | 책임 | 이 계획에서 |
|---|---|---|
| `src/components/backdropPalette.test.ts` | 휘도 구간·서열·간격 계약 (**스펙이 곧 테스트**) | 구간표 갱신 — 먼저 실패시킨다 |
| `src/components/Backdrop.tsx` | 배경 팔레트 60여 색 + 캔버스 드로잉 | `BACKDROP_PALETTE` 값 일괄 상승 |
| `src/components/TileMap.tsx` | 부지 바닥·방 바닥/벽·조명 계수 | `OUTSIDE_FLOOR`·`ROOM_STYLE`·`NEUTRAL_STYLE` 밝기 전환 |
| `src/components/PixelSprite.tsx` | 인물·집기 스프라이트 + 과 색 | `Figure` 3/4 재작성 · `DEPT_COLOR` 교체 · 누운 자세 분기 |
| `src/components/pixelSprite.test.ts` | 과 색·변주 계약 | 과 색 8종 상호 구별 단언 강화 |
| `scripts/scale-backdrop-palette.mjs` | **일회용 변환기** | 신설 → 사용 후 삭제(커밋에 안 남긴다) |

---

## Task 1: 배경 팔레트 구간표를 새 대역으로 올린다 (실패 확인)

**Files:**
- Modify: `src/components/backdropPalette.test.ts:42-81`

- [ ] **Step 1: 구간표의 min/max에 일괄 ×2.4를 적용한다**

`CATEGORIES` 배열의 각 항목에서 `min`·`max`만 바꾼다. `name`과 `keys`는 손대지 않는다.

```ts
const CATEGORIES: ReadonlyArray<{ name: string; min?: number; max: number; keys: readonly PaletteKey[] }> = [
  {
    name: '지면 base(풀밭·포장면·논·밭 어두운 이랑·나대지)', min: 53, max: 74,
    keys: [
      'ground', 'grassBase', 'grassNoiseDark', 'medianStrip',
      'pavementBase', 'pavementNoiseDark', 'pavementSeam', 'parkingLot',
      'dirtBase', 'dirtNoiseDark', 'fieldFurrowDark',
      'paddyBase', 'paddyCellDark', 'forestFloor', 'houseYardShadow',
    ],
  },
  {
    name: '지면 노이즈(밝은 쪽)·논둑', min: 74, max: 89,
    keys: ['grassNoiseLight', 'pavementNoiseLight', 'dirtNoiseLight', 'fieldFurrowLight', 'paddyCellLight', 'paddyBank'],
  },
  { name: '도로', min: 77, max: 94, keys: ['road', 'laneShoulder', 'dirtLane'] },
  { name: '인도·산책로', min: 98, max: 113, keys: ['sidewalk', 'parkPath', 'leveePath', 'seawall'] },
  {
    name: '건물 본체·시설·차량(옥상·아파트·주택 지붕)', min: 103, max: 128,
    keys: [
      'roofBase', 'roofEdge', 'aptBody', 'aptEdge',
      'houseRoofWarm', 'houseRoofWarmShade', 'houseRoofCool', 'houseRoofCoolShade',
      'materialStack', 'materialStackShade', 'breakwater', 'lampPost',
      'vehicleBlue', 'vehicleRed', 'vehicleGreen',
    ],
  },
  {
    name: '건물 디테일(실외기·승강기탑·용마루·옥탑)', min: 129, max: 147,
    keys: ['roofVent', 'roofVentShade', 'roofPenthouse', 'aptTower', 'aptTowerLit', 'houseRidgeWarm', 'houseRidgeCool'],
  },
  { name: '풀포기·관목', min: 98, max: 123, keys: ['tuft', 'tuftShade', 'shrub'] },
  {
    name: '랜드마크(수관·숲·하천·바다·천창 불빛·벤치)', min: 132, max: 154,
    keys: [
      'treeCanopy', 'treeCanopyLit', 'treeShade',
      'forestCanopy', 'forestCanopyLit', 'forestCanopyDark',
      'riverBase', 'riverFlow', 'seaBase', 'seaRipple',
      'roofSkylight', 'bench',
    ],
  },
]
```

- [ ] **Step 1-1: 요구 간격도 같은 배수로 올린다**

같은 파일의 간격 단언(`gap` 리터럴)을 함께 올린다.

```ts
    { name: '건물 본체 − 지면', gap: 33.6, a: BODY, b: GROUND },
    { name: '인도 − 도로', gap: 12.0, a: WALK, b: ROAD },
    { name: '건물 디테일 − 본체', gap: 14.4, a: DETAIL, b: BODY },
```

> ⚠️ **대역과 요구 간격은 반드시 같은 커밋에서 움직인다.** 이 파일의 주석이 그 이유를 이미 적어 뒀다 — *"대역을 넓혔으면 요구 간격도 함께 올려야 한다 — 안 그러면 다음 사람이 전 항목을 다시 눌러 담아도 초록불이 뜬다."* 요구값은 절대 숫자라, 팔레트만 2.4배 올리면 실측 간격도 2.4배가 되어 **가드가 1/2.4로 느슨해진다**(실측: 요구/실측 비율 65% → 27%).
>
> Task 2로 미루면 안 되는 이유가 하나 더 있다: 그때는 **단언과 그것을 만족시키는 값이 같은 커밋에 들어가 RED를 못 본다.** 이 8-Task 구성이 피하려던 상황이다.

또한 그 위 ⚠️ 주석에 남은 옛 배수·옛 요구값 서술("3.5배", "옛 값(4.0/1.5/1.5)")에 이번 ×2.4 갱신을 덧붙인다.

- [ ] **Step 2: 테스트를 돌려 실패를 눈으로 확인한다**

Run: `npx vitest run src/components/backdropPalette.test.ts`
Expected: FAIL — **13 failed / 35 passed**. 내역:
- 구간 검사 8건 (`ground(#1a1a26) = 26.xx` 형태로 현재 휘도가 찍힌다)
- 간격 3건 (Step 1-1에서 올린 요구값을 현 팔레트가 못 넘긴다)
- 「카테고리 상한이 부지보다 낮게」 + 「여유 5 이상」 2건 — **부지(`OUTSIDE_FLOOR` = 71.30)가 아직 안 올라가서** 난다. 이 2건은 **Task 3까지 계속 붉다**(Task 2 종료 시점에도 붉은 것이 정상이다).

서열 단언은 통과한다 — 값을 안 바꿨으므로 순서는 그대로다.

> ⚠️ 여기서 실패를 확인하지 않고 넘어가면, 뒤에서 통과했을 때 그것이 **고쳐서 통과한 것인지 원래 통과했던 것인지** 구별할 수 없다.

- [ ] **Step 3: 커밋**

```bash
git add src/components/backdropPalette.test.ts
git commit -m "test: 배경 휘도 구간표를 새 대역으로 올린다 (RED)"
```

---

## Task 2: 배경 팔레트 값을 일괄 상승시킨다

**Files:**
- Create: `scripts/scale-backdrop-palette.mjs` (일회용 — Step 5에서 삭제)
- Modify: `src/components/Backdrop.tsx` (`BACKDROP_PALETTE` 값 전부)

- [ ] **Step 1: 변환기를 만든다**

```js
// scripts/scale-backdrop-palette.mjs
// BACKDROP_PALETTE 의 hex 를 RGB 채널 ×K 로 올린다.
// 휘도 식(0.2126R+0.7152G+0.0722B)이 RGB 에 선형이라 채널을 같은 배수로 곱하면
// 휘도가 정확히 K 배가 되고 색상비가 보존된다 — 채도를 미는 방식(T-115 파랑 폭주)과 다르다.
import { readFileSync, writeFileSync } from 'node:fs'

const K = 2.4
const PATH = 'src/components/Backdrop.tsx'
const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

const src = readFileSync(PATH, 'utf8')
const start = src.indexOf('export const BACKDROP_PALETTE = {')
const end = src.indexOf('\n}', start)
if (start < 0 || end < 0) throw new Error('BACKDROP_PALETTE 블록을 못 찾았다')

const clipped = []
const block = src.slice(start, end).replace(/"#([0-9a-fA-F]{6})"/g, (_, hex) => {
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
  const nr = Math.round(r * K), ng = Math.round(g * K), nb = Math.round(b * K)
  if (nr > 255 || ng > 255 || nb > 255) clipped.push(`#${hex} → (${nr},${ng},${nb}) L ${L(r, g, b).toFixed(1)}`)
  const c = (v) => Math.min(255, v).toString(16).padStart(2, '0')
  return `"#${c(nr)}${c(ng)}${c(nb)}"`
})

writeFileSync(PATH, src.slice(0, start) + block + src.slice(end), 'utf8')
console.log(clipped.length === 0 ? 'CLIP: 없음' : `CLIP: ${clipped.length}건\n  ${clipped.join('\n  ')}`)
```

- [ ] **Step 2: 변환기를 돌린다**

Run: `node scripts/scale-backdrop-palette.mjs`
Expected: `CLIP: 없음`

> 클리핑이 보고되면 그 색은 채널이 255를 넘어 **색상이 틀어진 것**이다. 해당 키만 손으로 낮춰 구간 안에 넣고, 서열이 유지되는지 Step 3에서 확인한다.

- [ ] **Step 3: 테스트를 돌려 통과를 확인한다**

Run: `npx vitest run src/components/backdropPalette.test.ts`
Expected: **2 failed / 46 passed** — 구간 8건과 간격 3건이 RED에서 GREEN으로 넘어가고, **부지 비교 2건만 붉게 남는다**(「상한이 부지보다 낮게」·「여유 5 이상」).

> ⚠️ 그 2건을 자기 실패로 오인해 `OUTSIDE_FLOOR`를 건드리지 마라. 부지는 **Task 3**이 올린다. 이 Task의 성공 판정은 "구간 8 + 간격 3이 GREEN, 부지 비교 2만 RED"다.
>
> 간격 3건이 통과하는 이유: 팔레트가 ×2.4로 오르면 실측 간격도 정확히 ×2.4가 되고(휘도식이 RGB에 선형이라 오차 없다), Task 1에서 요구값도 같은 배수로 올려 뒀으므로 **상대적 조임 강도가 보존된다**. 실측 여유가 현재의 정확히 2.4배로 남는다.

- [ ] **Step 4: 실제 화면을 확인한다**

Run: `npm run dev` 후 브라우저에서 지역 선택 → 아무 지역 → 개원.
Expected: 부지 바깥 도시가 검정 덩어리가 아니라 건물·도로 형태가 보인다. 아직 부지는 어둡다(Task 3에서 바꾼다).

- [ ] **Step 5: 변환기를 지우고 커밋한다**

```bash
rm scripts/scale-backdrop-palette.mjs
git add src/components/Backdrop.tsx
git commit -m "feat: 배경 팔레트를 중간톤으로 일괄 상승 (RGB 채널 x2.4)"
```

> 변환기를 커밋에 남기지 않는 이유: 한 번 쓰고 버리는 도구다. 남기면 다음 사람이 그것을 다시 돌려 팔레트를 또 2.4배 올릴 수 있다.

---

## Task 3: 부지·실내를 밝은 병원 톤으로 바꾼다

**Files:**
- Modify: `src/components/TileMap.tsx` (`OUTSIDE_FLOOR`·`ROOM_STYLE`·`NEUTRAL_STYLE`·`GRID_LINE`)

- [ ] **Step 1: 실패하는 단언을 먼저 추가한다**

`src/components/backdropPalette.test.ts` 맨 끝의 `describe` 블록 안에 추가한다:

```ts
  it('실내가 마당보다 밝다 — 실내로 들어오면 밝아져야 "안"으로 읽힌다', () => {
    const yard = relativeLuminance(OUTSIDE_FLOOR)
    for (const [type, style] of Object.entries(ROOM_STYLE)) {
      const floor = relativeLuminance(style.floor)
      expect(floor, `${type} 바닥 ${floor.toFixed(1)} vs 마당 ${yard.toFixed(1)}`).toBeGreaterThan(yard)
      const wall = relativeLuminance(style.wall)
      expect(wall, `${type} 벽 ${wall.toFixed(1)} vs 바닥 ${floor.toFixed(1)}`).toBeGreaterThan(floor)
    }
  })

  it('마당이 병원의 무대다 — 배경 랜드마크보다 확실히 밝다(간격 30 이상)', () => {
    const yard = relativeLuminance(OUTSIDE_FLOOR)
    const gap = yard - meanL(LANDMARK)
    expect(gap, `마당 ${yard.toFixed(1)} - 랜드마크 ${meanL(LANDMARK).toFixed(1)}`).toBeGreaterThanOrEqual(30)
  })
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npx vitest run src/components/backdropPalette.test.ts`
Expected: FAIL — `마당이 병원의 무대다`가 실패한다. 현재 마당은 71.3이고 랜드마크 평균이 2.4배 올라 약 143이므로 간격이 음수다.

- [ ] **Step 3: 부지·실내 값을 교체한다**

```ts
export const OUTSIDE_FLOOR = "#b9c0c4";
const GRID_LINE = "rgba(10,8,18,0.10)";
export const NEUTRAL_STYLE = { floor: "#c6cbd2", wall: "#dfe4e9" };

export const ROOM_STYLE: Record<RoomType, { floor: string; wall: string }> = {
  EXAM: { floor: "#d3e0e2", wall: "#eef5f6" },
  WARD: { floor: "#dcd9e8", wall: "#f0eef8" },
  WAITING: { floor: "#e2ddd2", wall: "#f4f0e8" },
  LOUNGE: { floor: "#d6e2d8", wall: "#eaf3ec" },
  RECEPTION: { floor: "#e6dcda", wall: "#f6eeec" },
  CAFETERIA: { floor: "#e2e0cf", wall: "#f3f2e6" },
};
```

> `GRID_LINE`의 알파를 0.16에서 0.10으로 낮춘다 — 바닥이 밝아지면 같은 알파의 어두운 선이 훨씬 진하게 보여 격자가 화면을 지배한다.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `npx vitest run src/components/backdropPalette.test.ts`
Expected: PASS — 새 단언 2건 포함 전부 통과.

- [ ] **Step 5: 전체 테스트로 회귀를 확인한다**

Run: `npx vitest run`
Expected: PASS. 실패한다면 다른 테스트가 이 색 상수에 의존하고 있는 것이므로 그 테스트를 읽고 판단한다.

- [ ] **Step 6: 브라우저에서 확인하고 커밋한다**

Run: `npm run dev` → 개원 후 화면.
Expected: 부지가 밝은 회색, 방 바닥이 흰색에 가깝다. **의사가 바닥에 묻혀 잘 안 보인다** — 이것이 Task 4가 푸는 문제이고, 여기서 눈으로 확인해 둔다.

```bash
git add src/components/TileMap.tsx src/components/backdropPalette.test.ts
git commit -m "feat: 부지와 실내를 밝은 병원 톤으로 전환"
```

---

## Task 4: 과 색을 수술복 톤으로 교체한다

**Files:**
- Modify: `src/components/PixelSprite.tsx:24-33` (`DEPT_COLOR`)
- Modify: `src/components/pixelSprite.test.ts`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/components/pixelSprite.test.ts`의 `describe` 안에 추가한다:

```ts
  it('과 색은 흰 가운과 충분히 갈린다 — 가운 안에 보이는 색이라 대조 대상은 바닥이 아니라 가운이다', () => {
    const COAT = 255
    for (const [dept, hex] of Object.entries(DEPT_COLOR)) {
      const L = relativeLuminance(hex)
      expect(COAT - L, `${dept}(${hex}) = ${L.toFixed(1)}`).toBeGreaterThanOrEqual(70)
    }
  })

  it('무채색 두 과가 없다 — 색상이 없으면 휘도로만 싸워야 하는데 그 축은 이미 6과가 쓴다', () => {
    for (const [dept, hex] of Object.entries(DEPT_COLOR)) {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      expect(spread, `${dept}(${hex}) 채널 폭 ${spread}`).toBeGreaterThanOrEqual(25)
    }
  })
```

파일 상단 import에 `relativeLuminance`를 더한다:

```ts
import { relativeLuminance } from './Backdrop'
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npx vitest run src/components/pixelSprite.test.ts`
Expected: FAIL — `무채색 두 과가 없다`에서 `AESTHETICS(#a1a1aa) 채널 폭 9`와 `CHECKUP(#71717a) 채널 폭 9`가 걸린다.

- [ ] **Step 3: 과 색을 교체한다**

```ts
export const DEPT_COLOR: Record<DeptKey, string> = {
  CARDIOLOGY: "#b23a3a",
  THORACIC_SURGERY: "#b56a2c",
  OBSTETRICS: "#b0487a",
  NEUROSURGERY: "#7a52a8",
  GENERAL_SURGERY: "#3a68a8",
  INTERNAL_MEDICINE: "#2f8f86",
  AESTHETICS: "#c8a34a",
  CHECKUP: "#4a7f5a",
};
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `npx vitest run src/components/pixelSprite.test.ts`
Expected: PASS — 새 단언 2건 + 기존 `과 색은 8과 전부에 있고 서로 다르다` 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/components/PixelSprite.tsx src/components/pixelSprite.test.ts
git commit -m "feat: 과 색을 채도 낮춘 수술복 톤으로 교체 (미용=금 검진=녹)"
```

---

## Task 5: 인물을 3/4 시점으로 다시 그린다

**Files:**
- Modify: `src/components/PixelSprite.tsx` (`Figure`·`DoctorSprite`·`NurseSprite`·`PatientSprite`)

> 스프라이트의 **형태**는 단위 테스트로 잡을 수 없다(SVG 패스의 좌표가 "가운처럼 보이는가"를 단언할 방법이 없다). 검증은 브라우저 실측이다. 대신 색 계약은 Task 4의 테스트가 이미 잠갔다.
>
> 참고 — **접지 그림자는 이미 있다.** `TileMap`이 폰마다 `radial-gradient` 한 겹을 스프라이트보다 먼저 깔고(*"이 한 겹이 없으면 아바타가 바닥에 붙지 않고 위에 얹힌 스티커로 보인다"*), 방향은 집기 낙영과 같은 남동쪽으로 통일돼 있다. 3/4 인물은 이 그림자와 오히려 더 잘 맞는다 — 손대지 않는다.

- [ ] **Step 1: `Figure`를 3/4 시점으로 재작성한다**

`Figure` 함수 전체를 아래로 교체한다. 16단위 좌표계를 유지하되 소매가 몸통 밖으로 나오도록 몸통 폭을 줄였다.

```tsx
function Figure({
  coat, coatShade, accent, hair, skin, sleeveCuff,
}: {
  coat: string; coatShade: string; accent: string; hair: string; skin: string; sleeveCuff?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <path d="M3.6 7.4 q-1.5 3 -1 5.6 l1.7 .4 q-.4 -3 1 -5.4 Z" fill={coat} stroke={INK} strokeWidth={EDGE} />
      <path d="M12.4 7.4 q1.5 3 1 5.6 l-1.7 .4 q.4 -3 -1 -5.4 Z" fill={coatShade} stroke={INK} strokeWidth={EDGE} />
      {sleeveCuff && (
        <>
          <path d="M2.5 12.6 l1.7 .4 l-.3 1.4 l-1.7 -.4 Z" fill={sleeveCuff} stroke={INK} strokeWidth={EDGE} />
          <path d="M13.5 12.6 l-1.7 .4 l.3 1.4 l1.7 -.4 Z" fill={sleeveCuff} stroke={INK} strokeWidth={EDGE} />
        </>
      )}
      <path d="M6.2 6.6 h3.6 q.9 4.4 .9 8.8 h-5.4 q0 -4.4 .9 -8.8 Z" fill={accent} stroke={INK} strokeWidth={EDGE} />
      <path d="M6.2 6.4 q-2.6 .6 -2.8 3 q-.4 3.6 0 6.2 h2.6 q-.2 -6 .2 -9.2 Z" fill={coat} stroke={INK} strokeWidth={EDGE} />
      <path d="M9.8 6.4 q2.6 .6 2.8 3 q.4 3.6 0 6.2 h-2.6 q.2 -6 -.2 -9.2 Z" fill={coatShade} stroke={INK} strokeWidth={EDGE} />
      <path d="M6.2 6.4 q.7 1.9 1.8 2.3 q-.5 .8 -1.8 .8 q-.8 -1.6 0 -3.1 Z" fill={coat} stroke={INK} strokeWidth={EDGE * 0.7} />
      <path d="M9.8 6.4 q-.7 1.9 -1.8 2.3 q.5 .8 1.8 .8 q.8 -1.6 0 -3.1 Z" fill={coatShade} stroke={INK} strokeWidth={EDGE * 0.7} />
      <ellipse cx="8" cy="4" rx="2.9" ry="3.1" fill={skin} stroke={INK} strokeWidth={EDGE} />
      <path d="M5.2 3 A2.9 3.1 0 0 1 10.8 3 q-.9 -.7 -2.8 -.7 q-1.9 0 -2.8 .7 Z" fill={hair} />
    </svg>
  );
}
```

- [ ] **Step 2: 세 호출부를 새 시그니처에 맞춘다**

```tsx
export function DoctorSprite({ dept, busy, variantKey }: { dept: DeptKey; busy: boolean; variantKey?: string }) {
  const v = variantKey ? spriteVariant(variantKey) : DEFAULT_LOOK;
  return (
    <Figure
      coat={busy ? "#ffffff" : "#f1f4f7"}
      coatShade={busy ? "#e4e9ee" : "#d8dee5"}
      accent={DEPT_COLOR[dept]}
      sleeveCuff={DEPT_COLOR[dept]}
      hair={v.hair}
      skin={v.skin}
    />
  );
}

export function NurseSprite({ variantKey }: { variantKey?: string }) {
  const v = variantKey ? spriteVariant(variantKey) : DEFAULT_LOOK;
  return <Figure coat="#4fa39e" coatShade="#37827e" accent="#3f8f8b" hair={v.hair} skin={v.skin} />;
}

export function PatientSprite() {
  return <Figure coat="#a8b0b8" coatShade="#8d959d" accent="#98a0a8" hair="#4a4a55" skin="#dcc4a8" />;
}
```

> 간호사·환자는 `sleeveCuff`를 안 넘긴다 — 커프스는 "가운 안에 다른 옷"을 말하는 장치인데 둘은 가운을 안 입는다. 넘기지 않으면 그 두 패스가 렌더되지 않는다.

- [ ] **Step 3: 타입 검사와 전체 테스트를 돌린다**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: 브라우저에서 실측한다**

Run: `npm run dev` → 개원 → 의사가 방에 서 있는 상태.
확인할 것:
1. 흰 가운이 밝은 바닥 위에서 보이는가 (Task 3에서 묻혔던 것이 풀렸는가)
2. 소매가 몸통 밖으로 나와 실루엣이 간호사·환자와 다른가
3. 과 색이 가슴과 소매 끝 **두 곳**에 보이는가
4. 기본 줌(타일 약 24px)에서 셋이 구별되는가

> 4번이 안 되면 스프라이트를 더 다듬는 것이 아니라 **몸통 폭·소매 돌출을 키운다**. 24px에서는 얇은 단서가 전부 사라진다는 것이 설계 단계의 실측 결론이다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/PixelSprite.tsx
git commit -m "feat: 인물을 3/4 시점으로 재작성 — 흰 가운 안에 과 색 수술복"
```

---

## Task 6: 누운 환자만 탑다운 예외로 그린다

**Files:**
- Modify: `src/components/PixelSprite.tsx` (`LyingPatientSprite` 신설)
- Modify: `src/components/TileMap.tsx` (침대 타일 위 폰의 분기)

- [ ] **Step 1: 누운 자세 스프라이트를 만든다**

`PatientSprite` 바로 아래에 추가한다.

```tsx
/** 누운 환자 — **탑다운 예외**다(설계 §2). 이불 덮은 사람은 위에서 보는 것이 자연스럽고,
 *  자세마다 3/4 포즈를 그리면 인물 종류 × 자세로 그림이 3배가 된다. */
export function LyingPatientSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <rect x="4.6" y="1.2" width="6.8" height="13.6" rx="3" fill="#c9cfd6" stroke={INK} strokeWidth={EDGE} />
      <rect x="4.6" y="6" width="6.8" height="8.8" rx="2.4" fill="#98a0a8" />
      <ellipse cx="8" cy="3.4" rx="2.4" ry="2.2" fill="#dcc4a8" stroke={INK} strokeWidth={EDGE} />
      <path d="M5.6 2.6 A2.4 2.2 0 0 1 10.4 2.6 Z" fill="#4a4a55" />
    </svg>
  );
}
```

- [ ] **Step 2: `TileMap`이 침대 위 환자를 이 스프라이트로 그리게 한다**

`TileMap.tsx`에 **이미 `const lying = bedTiles.has(...)`가 있다**(폰 렌더 루프 안). 그리고 지금은 그 `lying`이 래퍼 div에 `transform: rotate(90deg) scale(0.8)`을 걸어 **서 있는 스프라이트를 눕혀** 쓴다. 3/4 인물을 90° 돌리면 옆으로 누운 사람이 아니라 **옆으로 넘어진 사람**이 되므로 이 회전을 환자에 한해 걷어낸다.

import에 `LyingPatientSprite`를 더하고, 래퍼와 스프라이트 선택을 이렇게 바꾼다:

```tsx
<div className="absolute inset-0" style={{ transform: lying && p.kind !== "PATIENT" ? "rotate(90deg) scale(0.8)" : undefined }}>
  {p.kind === "NURSE" ? (
    <NurseSprite variantKey={p.id} />
  ) : p.kind === "DOCTOR" && p.dept ? (
    <DoctorSprite dept={p.dept} busy={busyDoctors.has(p.id)} variantKey={p.id} />
  ) : lying ? (
    <LyingPatientSprite />
  ) : (
    <PatientSprite />
  )}
</div>
```

> ⚠️ **래퍼 div는 조건부로 감싸지 않는다** — 이 파일 주석이 못박은 계약이다(*"조건부로 감싸면 React 트리가 갈려 이동 transition이 remount로 끊긴다"*). 위 코드는 래퍼를 늘 두고 `transform` 값만 바꾼다.
>
> ⚠️ 접지 그림자는 이미 `hidden={lying}`로 처리돼 있다(*"누운 폰은 바닥에 서 있지 않으므로 접지가 없다"*). 새 스프라이트를 써도 그 분기는 그대로 맞다 — 손대지 않는다.

- [ ] **Step 2-1: 이동 transition이 안 끊기는지 확인한다**

스프라이트 컴포넌트가 바뀌면 내부 SVG는 remount된다. transition은 바깥 위치 div의 `left`/`top`에 걸려 있으므로 영향이 없어야 한다.

Run: `npm run dev` → 환자가 침대로 걸어가 눕는 것을 본다.
Expected: 걷는 동안 순간이동이 없고, 침대에 도착하는 순간 누운 그림으로 바뀐다.

- [ ] **Step 3: 타입 검사와 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: 브라우저에서 확인한다**

병동을 짓고 응급 환자가 침대에 눕는 상황을 만든다(또는 배속 3×로 대기).
Expected: 침대 위 환자가 위에서 본 모습으로 눕고, 걸어다니는 환자는 3/4로 서 있다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/PixelSprite.tsx src/components/TileMap.tsx
git commit -m "feat: 누운 환자는 탑다운으로 그린다 (3/4 예외)"
```

---

## Task 7: 앉은 폰이 의자 위에 서 있어 보이는지 확인하고 고친다

**Files:**
- Modify: `src/components/TileMap.tsx` (`SEAT_LIFT` 주변)

> 설계에서 남긴 미해결 항목이다 — 3/4 인물에 기존 들어올림 트릭을 그대로 쓰면 "의자 위에 서 있는 사람"이 된다. **실제로 그런지 먼저 보고** 판단한다.

- [ ] **Step 1: 현재 상태를 눈으로 확인한다**

대기실을 짓고 환자가 앉을 때까지 기다린다(배속 3×).
Expected: 판단이 필요하다 — 앉은 것으로 읽히면 Step 3으로 건너뛴다.

- [ ] **Step 2: 안 읽히면 겹침 순서로 고친다**

폰을 들어 올리는 대신 **의자를 폰 위에 겹쳐** 등받이가 어깨 뒤로 보이게 한다. `SEAT_LIFT`를 0으로 두고 의자 스프라이트의 z 순서를 폰보다 앞으로 옮긴다.

```tsx
const SEAT_LIFT = 0;
```

의자를 그리는 JSX 블록을 폰을 그리는 블록 **뒤로** 옮긴다(뒤에 그린 것이 위에 온다).

- [ ] **Step 3: 커밋**

```bash
git add src/components/TileMap.tsx
git commit -m "fix: 3/4 인물이 의자에 앉은 것으로 읽히게 겹침 순서를 조정"
```

> Step 1에서 이미 앉은 것으로 읽혔다면 이 Task는 커밋 없이 종료한다. 안 고친 것도 결과다 — 그 경우 계획서의 이 항목에 "확인함, 변경 불필요"를 적는다.

---

## Task 8: 전체 회귀와 최종 확인

- [ ] **Step 1: 결정론 회귀를 돌린다**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: 전부 통과. 색만 바꿨으므로 시뮬 테스트는 영향이 없어야 한다 — 실패하면 색 상수를 읽는 로직이 있다는 뜻이므로 그 자리를 읽는다.

- [ ] **Step 2: 프로브로 밸런스 무변을 확인한다**

Run: `npm run probe`
Expected: 12주 장부 수치가 **변경 전과 동일**하다. 이 작업은 표시층만 건드렸으므로 하나라도 다르면 시뮬을 건드린 것이다.

- [ ] **Step 3: 브라우저 최종 확인**

기본 줌에서 스크린샷을 찍어 설계 목표와 대조한다.
확인 목록:
1. 도시 배경이 검정 덩어리가 아니라 형태가 보인다
2. 병원 부지가 화면에서 가장 밝은 무대다
3. 의사·간호사·환자가 24px에서 구별된다
4. 과 색이 가슴과 소매에 보인다
5. 누운 환자와 선 환자가 각각 자연스럽다

- [ ] **Step 4: 문서 갱신 세트**

- `claude-docs/changeLog.md` 맨 위에 항목 추가 (왜/무엇을)
- 1분 이상 디버깅한 함정이 있었으면 `claude-docs/troubleshooting/T-###.md` 신설 후 `powershell -File scripts/rebuild-troubleshooting-index.ps1 -HubPath claude-docs/troubleshooting.md`
- `docs/concept/structural-problems-checklist.md` — 표현 층 작업이라 반영 상태 변경 없음(확인만)

- [ ] **Step 5: PR**

```bash
git push -u origin feat/bright-art-direction
gh pr create --base main --title 'feat: 밝은 아트 디렉션 — 팔레트 전환과 3/4 인물' --body-file <(echo "설계: docs/superpowers/specs/2026-07-31-bright-art-direction-design.md")
```

---

## 자체 검토 결과

**스펙 커버리지** — §2 확정 결정 7건 대조: 톤(Task 2·3) · 배경 중간톤(Task 2) · 인물 3/4(Task 5) · 의사 가운 형태(Task 5) · 누운 환자 예외(Task 6) · 과 색 A′(Task 4) · 청진기 확대 조건부(**미포함**).

**의도적 제외**: 청진기·명찰의 확대 조건부 렌더링은 스펙 §7에서 미해결로 남긴 항목이고, 배율을 읽는 분기가 새로 필요해 이 계획의 범위를 넘는다. ②에서 판단한다.

**타입 일관성** — `Figure`에 `sleeveCuff?: string`를 더했고 Task 5 Step 2의 세 호출부가 모두 새 시그니처를 쓴다. `LyingPatientSprite`는 Task 6에서 정의하고 같은 Task에서만 쓴다. `relativeLuminance`는 `Backdrop.tsx`가 이미 export하고 있다(테스트가 그것을 import 중).
