"use client";

import { useEffect, useRef } from "react";
import { GRID_W, GRID_H, type SimRegionKey } from "@/sim/world";
import { BACKDROP_MARGIN } from "./simHud";
import { TILE } from "./TileMap";

/**
 * 부지 둘레의 풍경 — **정적 회화 레이어 한 장**이다.
 *
 * 캔버스에 한 번 그리고 끝난다(마운트 + 지역·변형이 갈릴 때만). 폰도 시계도 안 읽으므로
 * 프레임 비용이 0이고, 시뮬 좌표·통행 판정과는 애초에 무관하다(부지 밖은 격자 밖이다).
 *
 * **부지 안쪽(중앙 48×32)은 투명하게 비운다** — 마지막 `clearRect` 한 줄이 그 구멍을 뚫는다.
 * 이 캔버스는 TileMap transform div의 **첫 자식**이라 부모의 배경(OUTSIDE_FLOOR + 격자)보다
 * 위에 깔린다: 비우지 않으면 부지 바닥이 풀밭에 덮여 사라진다(자식은 부모 배경을 가린다).
 *
 * 그리기 코드는 시안(스크래치패드 `region-backgrounds.html`)에서 **좌표·색·시드 그대로** 옮겼다.
 * 시각 결과가 이미 검수된 산출물이라, 바뀐 값은 타일 크기 하나뿐이다(목업 10 → 게임 TILE 16).
 */

/** 배경이 덮는 범위(타일) — 부지 48×32 + 좌우·상하 여백. 시안과 같은 비율이다.
 *  ⚠️ 여백은 **카메라의 경계이기도 하므로**(배경 밖은 페이지 공백이라 화면에 들이지 않는다)
 *  숫자는 simHud의 `BACKDROP_MARGIN`이 소유하고 여기선 파생만 한다 — 여기에 다시 적으면
 *  배경을 넓힌 날 카메라가 그대로 남아 공백이 샌다. */
export const BACKDROP_W = GRID_W + 2 * BACKDROP_MARGIN.x;
export const BACKDROP_H = GRID_H + 2 * BACKDROP_MARGIN.y;
/** 배경 좌표계에서 부지가 앉는 자리 — 곧 캔버스를 부지 기준으로 얼마나 밀어 둘지이기도 하다. */
export const BACKDROP_OFF_X = BACKDROP_MARGIN.x;
export const BACKDROP_OFF_Y = BACKDROP_MARGIN.y;

/**
 * 배경 팔레트 — **이 파일의 모든 색이 여기 한 곳에 산다.** 그리기 함수는 참조만 한다.
 *
 * ⚠️ **왜 부지보다 어두운가**: 부지 바닥(`OUTSIDE_FLOOR`, 상대휘도 176.0)보다 **배경이 어두워야**
 * 시선이 병원에 먼저 간다. 배경이 더 밝으면 부지가 화면에 뚫린 "구멍"으로 읽힌다(실측된 회귀다).
 * 지역 구분은 밝기가 아니라 **색조와 패턴**이 진다 — 값을 바꿀 땐 hue를 지키고 밝기만 낮춘다.
 * (이 절의 옛 제목은 "왜 이렇게 어두운가"였다 — 천장이 20.4이던 시절엔 팔레트가 실제로 검정에 가까웠다.
 *  지금은 절대값이 아니라 **부지와의 상대 관계**가 계약이다.)
 *
 * ⚠️ **그렇다고 다 같이 어둡게 깔면 안 된다**(이것도 실측된 회귀다). 부지보다 어둡게만 맞췄더니 지면 9.2 ·
 * 건물 9.5~10.5로 **배경 내부의 스프레드가 함께 눌려** 건물 윤곽이 지면에 묻혔다 — 도심 상단 2/3가 균일한
 * 검정이 되고 아파트 동이 사라졌다. 스프레드를 되찾으려면 **천장이 필요했다**: 옛 부지 13.3 아래로는
 * 5~13밖에 없어 층위가 인지되지 않았고, 그래서 부지를 20.4로 올린 뒤 그 대역에 다시 펼쳤다.
 *
 * ⚠️ **20.4 천장으로도 부족했다**(2026-07-30 · 브라우저 실측). 배경 전체가 7~19에 갇혀 있어 서열이 맞아도
 * **화면에서는 그냥 검정**이었다 — 12종을 다 그려 놓고 부지 좌우가 빈 검정으로 보였다. 그래서 부지 천장을
 * 71.3으로 올리고 전 항목을 **서열·간격 그대로 3~3.5배** 옮겼다: 지면 22~31 → 도로 32~39 → 인도 41~47 →
 * 건물 본체 43~53 → 옥상 요철 54~61 → 랜드마크 55~64.
 * 옮길 때 **채도는 거의 안 올렸다** — 파랑의 휘도 가중치가 0.0722뿐이라 채도를 밀면 목표 휘도를 맞추려고
 * B가 폭주해 인도가 보라색이 된다(실측). 색은 표면이 아니라 아래 **발광 패스**가 낸다.
 *
 * ⚠️ **네 번째 확장 — 밝은 병원 톤으로 전환**(2026-07-31). 앞의 셋은 어두운 화면 안에서 대역을 짜내는
 * 싸움이었고 이번은 성격이 다르다: 화면 전체를 중간톤으로 올리는 **아트 디렉션 변경**이다(회귀 수정이 아니다).
 * 방식은 같다 — 서열·간격을 그대로 두고 **RGB 채널을 일괄 ×2.4**. 지금 대역은 지면 53~74 → 지면 노이즈
 * 74~89 → 도로 77~94 → 인도 98~113 → 건물 본체 103~128 → 건물 디테일 129~147 → 랜드마크 132~154이고,
 * 부지 천장이 그 위 176.0이다(풀포기·관목은 98~123으로 인도와 겹친다 — 면적이 작아 서열 축이 아니다).
 * ⚠️ 대역을 옮길 땐 `backdropPalette.test.ts`의 **요구 간격도 같은 배수로** 올려야 한다 — 안 그러면 통과
 * 기준만 2.4분의 1로 느슨해져, 다음 사람이 전 항목을 다시 눌러 담아도 초록불이 뜬다.
 * 그리고 이 전환은 **실내 조명 모델까지 끌고 갔다**: 밝은 알베도에서는 곱셈 계수가 바닥과 천장을 동시에
 * 뚫어, `TileMap.SHADE`가 "밝히기"를 버리고 그늘 전용(max 1.0)으로 바뀌었다 — 그쪽 주석이 단일 출처다.
 *
 * 카테고리별 휘도 **구간**(상한만이 아니라 하한도) · 평균 서열 · 최소 간격은 `backdropPalette.test.ts`가 잠근다.
 */
export const BACKDROP_PALETTE = {
  /** 배경 전체의 바탕 — 어느 블록도 안 덮은 자리에 남는 색. */
  ground: "#3e3e5b",

  // ── 지면 — 면적을 지배하므로 가장 어둡다. 이게 스프레드의 바닥이다. ──
  grassBase: "#35463c",
  grassNoiseLight: "#3a5e3a",
  grassNoiseDark: "#353e35",
  tuft: "#4f7d6a",
  tuftShade: "#467362",
  shrub: "#597360",
  medianStrip: "#354635",
  /** 도심 포장면 — 저채도 회색. 도심인데 잔디가 깔려 있으면 도심으로 안 읽힌다. */
  pavementBase: "#463c4f",
  pavementNoiseLight: "#52525b",
  pavementNoiseDark: "#353e52",
  pavementSeam: "#4f3559",
  parkingLot: "#414165",
  dirtBase: "#4f3e30",
  dirtNoiseLight: "#605237",
  dirtNoiseDark: "#483e2b",
  fieldFurrowLight: "#5b5235",
  fieldFurrowDark: "#483e2b",
  paddyBase: "#304d37",
  paddyCellLight: "#375b48",
  paddyCellDark: "#2b4635",
  forestFloor: "#2b4635",
  houseYardShadow: "#353e2b",

  // ── 도로·인도·길 — 인도가 도로보다 밝아야 둘이 갈린다 ──
  road: "#485976",
  sidewalk: "#6a62a1",
  laneShoulder: "#485948",
  dirtLane: "#605937",
  leveePath: "#766a46",
  seawall: "#4f7346",
  parkPath: "#7f654d",
  paddyBank: "#525932",

  // ── 건물·시설·차량 — 지면보다 확실히 위(평균 +14 이상). 디테일은 본체보다 또 한 단 위. ──
  roofBase: "#7a6eb2",
  roofEdge: "#7373b9",
  roofVent: "#8686d8",
  roofVentShade: "#8e7dcc",
  roofPenthouse: "#a88965",
  aptBody: "#7a6eb4",
  aptEdge: "#7176b4",
  aptTower: "#8e84d3",
  aptTowerLit: "#8689d6",
  houseRoofWarm: "#957359",
  houseRoofWarmShade: "#7d6c4a",
  houseRidgeWarm: "#a88965",
  houseRoofCool: "#846aaf",
  houseRoofCoolShade: "#6767a6",
  houseRidgeCool: "#9284d6",
  materialStack: "#82734d",
  materialStackShade: "#7f6c4a",
  breakwater: "#6a7390",
  lampPost: "#7d7348",
  vehicleBlue: "#5e739a",
  vehicleRed: "#a36273",
  vehicleGreen: "#597d59",

  // ── 랜드마크 — 배경에서 가장 밝지만 부지(71.3) 아래를 지킨다. 지역 식별의 핵심이라 여기가 상단이다. ──
  treeCanopy: "#6c9c76",
  treeCanopyLit: "#6aa373",
  treeShade: "#609c71",
  forestCanopy: "#629c7f",
  forestCanopyLit: "#65a376",
  forestCanopyDark: "#76927f",
  riverBase: "#6e8eb9",
  riverFlow: "#7395c0",
  seaBase: "#6e8eb9",
  seaRipple: "#7695c2",
  roofSkylight: "#a89265",
  bench: "#9a9059",
} as const;

/**
 * `#rrggbb`의 상대휘도(0..255 스케일) — **톤 서열의 단일 계산식**이다.
 * 테스트가 자기 식을 따로 들면 구현과 갈리므로, 검사도 이 함수를 import해서 쓴다.
 */
export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

type Ctx = CanvasRenderingContext2D;

/**
 * 지역·변형 하나를 캔버스에 그린다.
 *
 * ⚠️ **함수 전체가 한 겹의 클로저**인 것에는 이유가 있다: `TILE`을 모듈 최상위에서 읽으면
 * 안 된다(TileMap이 이 파일을 import하므로 순환이고, 그 시점의 `TILE`은 아직 TDZ다).
 * 호출은 언제나 두 모듈이 다 평가된 뒤라, 본문에서 읽으면 안전하다.
 */
export function drawBackdrop(c: Ctx, region: SimRegionKey, variant: number) {
  const T = TILE;
  const EW = BACKDROP_W, EH = BACKDROP_H;
  const LX = BACKDROP_OFF_X, LY = BACKDROP_OFF_Y, LW = GRID_W, LH = GRID_H;
  /** 부지 남쪽 변 바로 아래 줄 — 시안의 도로·농로가 전부 이 좌표에서 시작한다. */
  const SY = LY + LH;
  const P = BACKDROP_PALETTE;

  /** 시안의 결정론 난수(mulberry32) — 시드가 같으면 같은 풍경이 나온다. */
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 타일 단위 사각형. */
  const px = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col; c.fillRect(x * T, y * T, w * T, h * T);
  };
  /** px 단위 사각형 — 타일보다 잔 무늬(자갈·물결·차창)는 이쪽이다. */
  const pxf = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col; c.fillRect(x, y, w, h);
  };

  /**
   * 발광 큐 — **밝기를 올리는 것만으로는 "켜져 있다"가 안 생긴다**(밝은 회색 판이 된다).
   * 창문·간판·전조등·가로등을 additive 한 겹으로 얹어야 밤 풍경이 된다.
   *
   * ⚠️ **바로 그리지 않고 모아 두는 것이 계약이다.** 12종 변형은 각자 순서로 블록을 쌓으므로
   * (도로를 나중에 깔는 변형도 있다) 그리는 자리에서 발광을 찍으면 뒤에 오는 불투명 fill이 덮는다.
   * 큐에 넣고 **블록이 다 그려진 뒤 한 번에** 부으면 어느 변형에서든 맨 위에 온다.
   *
   * 좌표는 타일 단위(px 변환은 flush가 한다) — 헬퍼들이 이미 타일로 생각하고 있다.
   */
  const glows: Array<{ x: number; y: number; rad: number; col: string; a: number }> = [];
  const glow = (x: number, y: number, rad: number, col: string, a: number) => {
    glows.push({ x, y, rad, col, a });
  };
  /** 창문 불빛 — 건물 헬퍼 셋이 공유한다. 옥상 탑뷰라 빛은 **건물 둘레로 새어** 지면에 떨어진다. */
  const WINDOW_WARM = "255,222,150";
  const WINDOW_COOL = "196,222,255";

  function grass(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    px(c, x, y, w, h, P.grassBase);
    const r = rng(seed);
    for (let i = 0; i < w * h * 0.7; i++) {
      const gx = x * T + Math.floor(r() * w * T), gy = y * T + Math.floor(r() * h * T);
      pxf(c, gx, gy, 2, 2, r() < 0.5 ? P.grassNoiseLight : P.grassNoiseDark);
    }
    for (let i = 0; i < w * h * 0.09; i++) {
      const gx = x * T + Math.floor(r() * w * T), gy = y * T + Math.floor(r() * h * T);
      pxf(c, gx, gy, 2, 3, P.tuft); pxf(c, gx + 2, gy + 1, 1, 2, P.tuftShade);
    }
  }
  /** 도심 바닥 — 아스팔트·콘크리트 포장. 미세 노이즈 + 드문 이음매.
   *  `grass`와 시그니처가 같아 도심 3종에서 호출만 갈아끼운다(좌표는 그대로). */
  function pavement(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    px(c, x, y, w, h, P.pavementBase);
    const r = rng(seed);
    for (let i = 0; i < w * h * 0.7; i++) {
      const gx = x * T + Math.floor(r() * w * T), gy = y * T + Math.floor(r() * h * T);
      pxf(c, gx, gy, 2, 2, r() < 0.5 ? P.pavementNoiseLight : P.pavementNoiseDark);
    }
    c.fillStyle = P.pavementSeam;
    for (let gy = y + 4; gy < y + h; gy += 6 + Math.floor(r() * 7)) c.fillRect(x * T, gy * T, w * T, 1);
    for (let gx = x + 5; gx < x + w; gx += 9 + Math.floor(r() * 10)) c.fillRect(gx * T, y * T, 1, h * T);
  }
  function roadH(c: Ctx, x: number, y: number, w: number, lanes: number) {
    const h = lanes * 2;
    px(c, x, y, w, h, P.road);
    c.fillStyle = "rgba(216,207,175,0.14)";
    for (let dx = 0; dx < w; dx += 3) c.fillRect((x + dx) * T, (y + h / 2) * T - 1, 2 * T - 4, 2);
    c.fillStyle = "rgba(216,207,175,0.07)";
    c.fillRect(x * T, y * T, w * T, 2); c.fillRect(x * T, (y + h) * T - 2, w * T, 2);
  }
  function roadV(c: Ctx, x: number, y: number, h: number, lanes: number) {
    const w = lanes * 2;
    px(c, x, y, w, h, P.road);
    c.fillStyle = "rgba(216,207,175,0.14)";
    for (let dy = 0; dy < h; dy += 3) c.fillRect((x + w / 2) * T - 1, (y + dy) * T, 2, 2 * T - 4);
    c.fillStyle = "rgba(216,207,175,0.07)";
    c.fillRect(x * T, y * T, 2, h * T); c.fillRect((x + w) * T - 2, y * T, 2, h * T);
  }
  /** 1차선 좁은 길 — 중앙선이 없는 것이 읍내·농로의 표식이다. */
  function laneH(c: Ctx, x: number, y: number, w: number) {
    px(c, x, y, w, 2, P.road);
    c.fillStyle = "rgba(216,207,175,0.07)";
    c.fillRect(x * T, y * T, w * T, 2); c.fillRect(x * T, (y + 2) * T - 2, w * T, 2);
  }
  function sidewalkH(c: Ctx, x: number, y: number, w: number) {
    px(c, x, y, w, 1, P.sidewalk);
    c.fillStyle = "rgba(216,207,175,0.05)";
    for (let dx = 0; dx < w; dx += 2) c.fillRect((x + dx) * T, y * T, 1, T);
  }
  function sidewalkV(c: Ctx, x: number, y: number, h: number) {
    px(c, x, y, 1, h, P.sidewalk);
    c.fillStyle = "rgba(216,207,175,0.05)";
    for (let dy = 0; dy < h; dy += 2) c.fillRect(x * T, (y + dy) * T, T, 1);
  }
  function crosswalk(c: Ctx, x: number, y: number, w: number, h: number) {
    c.fillStyle = "rgba(216,207,175,0.13)";
    if (w >= h) { for (let dy = 0; dy < h * T; dy += 6) c.fillRect(x * T, y * T + dy, w * T, 3); }
    else { for (let dx = 0; dx < w * T; dx += 6) c.fillRect(x * T + dx, y * T, 3, h * T); }
  }
  function tree(c: Ctx, x: number, y: number, seed: number) {
    const r = rng(seed);
    pxf(c, x * T + 2, y * T + 2, T * 2 - 4, T * 2 - 4, P.treeCanopy);
    pxf(c, x * T + 4, y * T + 4, T * 2 - 8, T * 2 - 8, P.treeCanopyLit);
    for (let i = 0; i < 7; i++) {
      pxf(c, x * T + 3 + Math.floor(r() * (T * 2 - 7)), y * T + 3 + Math.floor(r() * (T * 2 - 7)), 2, 2, P.treeShade);
    }
  }
  /** 가로등 — 불빛은 **방사형 그라디언트**여야 한다. 단색 원반은 회색 얼룩으로 읽힌다(실측).
   *  등 자체의 원반은 여기서 그리고(지면에 닿는 빛), 공중의 헤일로는 발광 큐가 맨 위에 얹는다. */
  function lamp(c: Ctx, x: number, y: number) {
    pxf(c, x * T - 1, y * T - 1, 3, 3, P.lampPost);
    const rad = T * 1.6;
    const g = c.createRadialGradient(x * T, y * T, 0, x * T, y * T, rad);
    g.addColorStop(0, "rgba(216,207,175,0.10)");
    g.addColorStop(1, "rgba(216,207,175,0)");
    c.fillStyle = g;
    c.beginPath(); c.arc(x * T, y * T, rad, 0, 7); c.fill();
    glow(x, y, 1.9, "255,214,150", 0.2);
  }
  function car(c: Ctx, x: number, y: number, col: string, vert: boolean) {
    if (vert) pxf(c, x * T + 2, y * T + 1, T - 4, T * 2 - 3, col);
    else pxf(c, x * T + 1, y * T + 2, T * 2 - 3, T - 4, col);
    c.fillStyle = "rgba(216,207,175,0.10)";
    if (vert) c.fillRect(x * T + 3, y * T + 3, T - 6, 3);
    else c.fillRect(x * T + 3, y * T + 3, 3, T - 6);
    // 전조등 — 진행 방향 끝. 차 한 대에 점 하나뿐이라 도로가 붐비지 않는다.
    if (vert) glow(x + 0.5, y + 2, 1.1, "255,240,200", 0.3);
    else glow(x + 2, y + 0.5, 1.1, "255,240,200", 0.3);
  }
  /** 건물 옥상 덩어리 — 실외기·옥탑이 흩어진다. */
  function roof(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, P.roofBase);
    c.strokeStyle = P.roofEdge; c.lineWidth = 2; c.strokeRect(x * T + 1, y * T + 1, w * T - 2, h * T - 2);
    for (let i = 0; i < (w * h) / 14; i++) {
      const gx = x + 1 + Math.floor(r() * (w - 3)), gy = y + 1 + Math.floor(r() * (h - 3));
      pxf(c, gx * T, gy * T, T + 2, T - 2, P.roofVent); pxf(c, gx * T + 2, gy * T + 2, T - 4, 2, P.roofVentShade);
    }
    if (r() < 0.8) {
      const gx = x + 1 + Math.floor(r() * (w - 4)), gy = y + 1 + Math.floor(r() * (h - 3));
      pxf(c, gx * T, gy * T, T * 2, T, P.roofPenthouse); pxf(c, gx * T + 2, gy * T + 2, T * 2 - 4, T - 4, P.roofSkylight);
      glow(gx + 1, gy + 0.5, 1.5, WINDOW_WARM, 0.3);   // 천창 — 옥탑에서 새는 빛
    }
    // 사무동 창문 — 건물 둘레를 따라 몇 점. 위치가 시드 파생이라 같은 판에서 같은 자리다.
    for (let i = 0; i < Math.max(1, Math.round(w * 0.45)); i++) {
      glow(x + 0.4 + r() * (w - 0.8), y + h, 0.85, WINDOW_COOL, 0.16);
    }
  }
  /** 판상형 아파트 동(옥상) — 승강기탑이 일정 간격. */
  function apt(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, P.aptBody);
    c.strokeStyle = P.aptEdge; c.lineWidth = 2; c.strokeRect(x * T + 1, y * T + 1, w * T - 2, h * T - 2);
    for (let gx = x + 2; gx < x + w - 2; gx += 5) {
      pxf(c, gx * T, (y + Math.floor(h / 2)) * T - 4, T + 4, T - 2, P.aptTower);
      pxf(c, gx * T + 2, (y + Math.floor(h / 2)) * T - 2, T, 2, P.aptTowerLit);
      glow(gx + 0.5, y + Math.floor(h / 2), 1.2, WINDOW_COOL, 0.18);   // 계단실 — 밤에도 켜져 있는 자리
    }
    // 세대 창문 — 아파트는 **아래 변에 여러 점**이다(판상형이라 한 면에 세대가 늘어선다).
    for (let i = 0; i < Math.max(2, Math.round(w * 0.7)); i++) {
      glow(x + 0.5 + r() * (w - 1), y + h, 0.9, WINDOW_WARM, 0.2);
    }
    if (r() < 0.9) pxf(c, (x + w - 3) * T, (y + 1) * T, T, T - 4, P.roofPenthouse);
  }
  /** 저층 주택(3×2) — 박공지붕 탑뷰. */
  function house(c: Ctx, x: number, y: number, seed: number) {
    const r = rng(seed);
    const warm = r() < 0.4;
    pxf(c, x * T, y * T, 3 * T, T, warm ? P.houseRoofWarm : P.houseRoofCool);                  // 지붕 윗면
    pxf(c, x * T, (y + 1) * T, 3 * T, T, warm ? P.houseRoofWarmShade : P.houseRoofCoolShade);  // 지붕 아랫면(그늘)
    pxf(c, x * T, (y + 1) * T - 1, 3 * T, 2, warm ? P.houseRidgeWarm : P.houseRidgeCool);      // 용마루
    pxf(c, (x + 3) * T, y * T, 2, 2 * T, P.houseYardShadow);                                   // 마당 경계 그림자
    // 창문 — 집마다 하나. 불이 꺼진 집도 있어야 마을이 산다(시드 파생이라 판마다 고정).
    if (r() < 0.75) glow(x + 0.6 + r() * 1.8, y + 2, 1.0, warm ? WINDOW_WARM : WINDOW_COOL, 0.22);
  }
  /** 나대지·공사장 — 점선 가설 울타리와 자재 더미. */
  function dirtLot(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, P.dirtBase);
    for (let i = 0; i < w * h * 0.6; i++) {
      const gx = x * T + Math.floor(r() * w * T), gy = y * T + Math.floor(r() * h * T);
      pxf(c, gx, gy, 2, 2, r() < 0.5 ? P.dirtNoiseLight : P.dirtNoiseDark);
    }
    c.strokeStyle = "rgba(216,207,175,0.12)"; c.lineWidth = 2;
    c.setLineDash([6, 6]); c.strokeRect(x * T + 2, y * T + 2, w * T - 4, h * T - 4); c.setLineDash([]);
    pxf(c, (x + 2) * T, (y + 2) * T, T * 3, T, P.materialStack);
    pxf(c, (x + 2) * T, (y + 3) * T + 2, T * 3, T - 4, P.materialStackShade);
  }
  /** 밭 — 이랑 줄무늬. */
  function fieldDry(c: Ctx, x: number, y: number, w: number, h: number) {
    for (let dy = 0; dy < h; dy++) px(c, x, y + dy, w, 1, dy % 2 ? P.fieldFurrowLight : P.fieldFurrowDark);
    c.fillStyle = "rgba(216,207,175,0.03)";
    for (let dy = 0; dy < h; dy += 2) c.fillRect(x * T, (y + dy) * T, w * T, 1);
  }
  /** 논배미 — 불규칙 격자 + 물빛. */
  function paddy(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, P.paddyBase);
    let gy = y;
    while (gy < y + h) {
      const rh = 4 + Math.floor(r() * 4);
      let gx = x;
      while (gx < x + w) {
        const rw = 7 + Math.floor(r() * 7);
        const cw = Math.min(rw, x + w - gx), ch = Math.min(rh, y + h - gy);
        px(c, gx, gy, cw, ch, r() < 0.4 ? P.paddyCellLight : P.paddyCellDark);
        c.fillStyle = P.paddyBank;
        c.fillRect(gx * T, gy * T, cw * T, 2); c.fillRect(gx * T, gy * T, 2, ch * T); // 논둑
        if (r() < 0.5) {
          c.fillStyle = "rgba(216,207,175,0.05)";
          c.fillRect(gx * T + 4 + Math.floor(r() * cw * T * 0.6), gy * T + 4 + Math.floor(r() * ch * T * 0.6), 4, 1);
        }
        gx += rw;
      }
      gy += rh;
    }
  }
  /** 숲 덩어리 — 촘촘한 수관. */
  function forest(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, P.forestFloor);
    for (let i = 0; i < w * h * 0.35; i++) {
      const gx = x * T + Math.floor(r() * (w * T - 8)), gy = y * T + Math.floor(r() * (h * T - 8));
      pxf(c, gx, gy, 8, 8, P.forestCanopy); pxf(c, gx + 2, gy + 2, 4, 4, r() < 0.5 ? P.forestCanopyLit : P.forestCanopyDark);
    }
  }
  /** 하천(세로) — 물 + 흐름 대시. */
  function river(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, P.riverBase);
    c.fillStyle = P.riverFlow;
    for (let i = 0; i < w * h * 0.5; i++) {
      const gx = x * T + Math.floor(r() * (w * T - 2)), gy = y * T + Math.floor(r() * (h * T - 6));
      c.fillRect(gx, gy, 2, 5);
    }
    c.fillStyle = "rgba(216,207,175,0.05)";
    for (let i = 0; i < h; i += 4) c.fillRect((x + 1) * T + Math.floor(r() * ((w - 2) * T)), (y + i) * T, 2, 8);
  }
  /** 바다 — 남색 + 잔물결. */
  function sea(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, P.seaBase);
    c.fillStyle = P.seaRipple;
    for (let i = 0; i < w * h * 0.7; i++) {
      const gx = x * T + Math.floor(r() * (w * T - 6)), gy = y * T + Math.floor(r() * h * T);
      c.fillRect(gx, gy, 5, 1);
    }
    c.fillStyle = "rgba(216,207,175,0.05)";
    for (let i = 0; i < w * h * 0.06; i++) {
      const gx = x * T + Math.floor(r() * (w * T - 6)), gy = y * T + Math.floor(r() * h * T);
      c.fillRect(gx, gy, 4, 1);
    }
  }
  /** 정문 앞 접근로 — 부지 남쪽 변 바로 아래 두 칸. 문이 어디로 이어지는지를 말한다. */
  const approach = (c: Ctx) => px(c, LX + 23, SY, 2, 1, P.sidewalk);

  // ── ① 대도시 도심 ──────────────────────────────────────────────────────
  const urban0 = () => { // 고층 블록 밀집 — 사방이 이웃 건물 옥상
    pavement(c, 0, 0, EW, EH, 101);
    roof(c, 0, 0, LX - 2, 22, 102); roof(c, 0, 24, LX - 2, 16, 103);
    roof(c, LX + LW + 2, 0, EW - LX - LW - 2, 14, 104); roof(c, LX + LW + 2, 16, EW - LX - LW - 2, 22, 105);
    roof(c, LX + 1, 0, 22, LY - 2, 106); roof(c, LX + 25, 0, 20, LY - 2, 107);
    sidewalkH(c, 0, SY + 1, EW); roadH(c, 0, SY + 2, EW, 2); sidewalkH(c, 0, SY + 6, EW);
    roof(c, 0, SY + 7, 30, EH - SY - 7, 108); roof(c, 34, SY + 7, EW - 34, EH - SY - 7, 109);
    crosswalk(c, LX + 23, SY + 2, 2, 4); car(c, 20, SY + 2, P.vehicleBlue, false); car(c, 52, SY + 4, P.vehicleRed, false);
    approach(c);
  };
  const urban1 = () => { // 대로변 — 왕복 6차선 + 중앙분리대
    pavement(c, 0, 0, EW, EH, 111);
    sidewalkH(c, 0, SY + 1, EW);
    roadH(c, 0, SY + 2, EW, 1);                    // 상행 차로
    px(c, 0, SY + 4, EW, 1, P.medianStrip);            // 중앙분리대
    for (let x = 2; x < EW; x += 6) pxf(c, x * T + 2, (SY + 4) * T + 2, 6, 6, P.shrub); // 분리대 관목
    roadH(c, 0, SY + 5, EW, 1);                    // 하행 차로
    sidewalkH(c, 0, SY + 7, EW);                   // 딱 화면 끝
    /* 북쪽 — **대로 뒤 이면 블록**. 이 띠가 없으면 부지 위 8줄(y 0~7)이 통째로 빈 포장면이라
       대로변이 "허허벌판에 도로 하나"로 읽힌다(실측으로 잡은 결함). 대로와 평행한 뒷길을 하나
       깔고 그 너머에 상가 줄을 세우면, 대로가 블록의 *가장자리*라는 것이 화면에 드러난다. */
    roof(c, 0, 0, 17, 3, 117); roof(c, 19, 0, 15, 3, 118);
    roof(c, 36, 0, 19, 3, 119); roof(c, 57, 0, EW - 57, 3, 120);
    sidewalkH(c, 0, 3, EW);
    laneH(c, 0, 4, EW);                            // 이면도로 — 중앙선이 없어 대로와 구별된다
    sidewalkH(c, 0, 6, EW);
    car(c, 14, 4, P.vehicleGreen, false); car(c, 48, 4, P.vehicleBlue, false);
    // 좌우 — 대로변 필지. 위 띠와 겹치지 않게 부지 높이(y=LY)에서 시작한다.
    roof(c, 0, LY, 9, 15, 115); roof(c, 0, LY + 17, 9, 14, 131);
    roof(c, LX + LW + 3, LY, EW - LX - LW - 3, 13, 116);
    roof(c, LX + LW + 3, LY + 15, EW - LX - LW - 3, 16, 132);
    crosswalk(c, LX + 23, SY + 2, 2, 5);
    car(c, 10, SY + 2, P.vehicleBlue, false); car(c, 40, SY + 2, P.vehicleRed, false);
    car(c, 26, SY + 5, P.vehicleGreen, false); car(c, 58, SY + 5, P.vehicleBlue, false);
    approach(c);
  };
  const urban2 = () => { // 사거리 코너 — 남·동 도로가 만나는 필지
    pavement(c, 0, 0, EW, EH, 121);
    const RX = LX + LW + 2;
    sidewalkH(c, 0, SY + 1, RX); roadH(c, 0, SY + 2, EW, 2); sidewalkH(c, 0, SY + 6, RX);
    sidewalkV(c, RX, 0, SY + 1); roadV(c, RX + 1, 0, SY + 6, 2); sidewalkV(c, RX + 5, 0, SY + 1);
    px(c, RX + 1, SY + 2, 4, 4, P.road);
    roof(c, RX + 7, 0, EW - RX - 7, 18, 122); roof(c, RX + 7, 20, EW - RX - 7, 16, 123);
    roof(c, 0, 0, 9, 16, 124); roof(c, 0, 18, 9, 18, 125);
    sidewalkH(c, RX + 6, SY + 6, EW - RX - 6); roof(c, RX + 6, SY + 7, EW - RX - 6, EH - SY - 7, 126);
    roof(c, 0, SY + 7, 26, EH - SY - 7, 127);
    crosswalk(c, LX + 23, SY + 2, 2, 4); crosswalk(c, RX + 1, LY + 16, 4, 2); crosswalk(c, RX - 2, SY + 2, 2, 4);
    lamp(c, LX + 8, SY + 1); lamp(c, LX + 34, SY + 1); lamp(c, RX, LY + 6); lamp(c, RX, LY + 26);
    car(c, 14, SY + 2, P.vehicleBlue, false); car(c, 44, SY + 4, P.vehicleRed, false); car(c, RX + 1, 10, P.vehicleGreen, true);
    approach(c);
  };

  // ── ② 신도시·중소도시 ──────────────────────────────────────────────────
  const newtown0 = () => { // 아파트 단지 옆
    grass(c, 0, 0, EW, EH, 201);
    apt(c, 1, 2, 9, 3, 202); apt(c, 1, 9, 9, 3, 203); apt(c, 1, 16, 9, 3, 204); apt(c, 1, 23, 9, 3, 205);
    px(c, 1, 6, 9, 2, P.parkingLot); px(c, 1, 13, 9, 2, P.parkingLot); px(c, 1, 20, 9, 2, P.parkingLot); // 동 사이 주차열
    c.fillStyle = "rgba(216,207,175,0.10)";
    for (let i = 0; i < 4; i++) { c.fillRect((2 + i * 2) * T, 6 * T, 2, 2 * T); c.fillRect((2 + i * 2) * T, 13 * T, 2, 2 * T); }
    car(c, 2, 6, P.vehicleBlue, true); car(c, 6, 13, P.vehicleRed, true);
    apt(c, LX + 2, 1, 14, 3, 206); apt(c, LX + 20, 1, 14, 3, 207);
    apt(c, LX + LW + 3, 4, 8, 3, 208); apt(c, LX + LW + 3, 11, 8, 3, 209); apt(c, LX + LW + 3, 18, 8, 3, 210);
    tree(c, LX + LW + 4, 25, 211); tree(c, LX + LW + 7, 29, 212);
    sidewalkH(c, 0, SY + 1, EW); roadH(c, 0, SY + 2, EW, 2); sidewalkH(c, 0, SY + 6, EW);
    grass(c, 0, SY + 7, EW, EH - SY - 7, 213); apt(c, 6, SY + 9, 20, 3, 214); apt(c, 36, SY + 9, 20, 3, 215);
    crosswalk(c, LX + 23, SY + 2, 2, 4);
    approach(c);
  };
  const newtown1 = () => { // 상업지구 가장자리 + 근린공원
    grass(c, 0, 0, EW, EH, 221);
    roof(c, LX + 1, 0, 20, LY - 2, 222); roof(c, LX + 25, 0, 19, LY - 2, 223); roof(c, 0, 0, LX - 2, 14, 224);
    const PX2 = LX + LW + 2;
    px(c, PX2, 6, 1, SY - 6, P.parkPath); px(c, PX2, 20, EW - PX2 - 2, 1, P.parkPath); // 산책로
    ([[PX2 + 3, 8], [PX2 + 6, 13], [PX2 + 2, 17], [PX2 + 6, 24], [PX2 + 3, 29], [PX2 + 7, 4]] as const)
      .forEach((p, i) => tree(c, p[0], p[1], 225 + i));
    pxf(c, (PX2 + 4) * T, 22 * T, T + 4, 4, P.bench); pxf(c, (PX2 + 7) * T, 27 * T, T + 4, 4, P.bench); // 벤치
    grass(c, 0, 16, LX - 2, EH - 16, 231);
    tree(c, 3, 20, 232); tree(c, 6, 28, 233);
    sidewalkH(c, 0, SY + 1, EW); roadH(c, 0, SY + 2, EW, 2); sidewalkH(c, 0, SY + 6, EW);
    grass(c, 0, SY + 7, EW, EH - SY - 7, 234); roof(c, 8, SY + 8, 22, 7, 235); roof(c, 40, SY + 8, 24, 7, 236);
    crosswalk(c, LX + 23, SY + 2, 2, 4);
    approach(c);
  };
  const newtown2 = () => { // 계획도로와 빈 필지
    grass(c, 0, 0, EW, EH, 241);
    const RX2 = LX + LW + 2;
    sidewalkH(c, 0, SY + 1, EW); roadH(c, 0, SY + 2, EW, 2); sidewalkH(c, 0, SY + 6, EW);
    sidewalkV(c, RX2, 0, SY + 1); roadV(c, RX2 + 1, 0, SY + 2, 2); sidewalkV(c, RX2 + 5, 0, SY + 1);
    px(c, RX2 + 1, SY + 2, 4, 4, P.road);
    dirtLot(c, LX + 6, 1, 18, 6, 242);              // 북쪽 나대지
    dirtLot(c, 0, SY + 7, 24, EH - SY - 7, 243);    // 길 건너 공사장(잘린 채 보임)
    grass(c, 26, SY + 7, EW - 26, EH - SY - 7, 244);
    apt(c, 30, SY + 9, 18, 3, 245);                 // 먼저 들어선 아파트 한 동
    dirtLot(c, 1, 2, 9, 14, 246); grass(c, 0, 18, LX - 2, SY - 18, 247);
    crosswalk(c, LX + 23, SY + 2, 2, 4);
    lamp(c, LX + 10, SY + 1); lamp(c, LX + 36, SY + 1);
    approach(c);
  };

  // ── ③ 지방 소도시·구도심 ───────────────────────────────────────────────
  const provincial0 = () => { // 저층 주택가
    grass(c, 0, 0, EW, EH, 301);
    const HS = [
      [1, 3], [5, 3], [1, 7], [5, 7], [1, 12], [5, 12], [1, 17], [5, 17], [1, 22], [5, 22],
      [LX + 2, 1], [LX + 7, 1], [LX + 13, 1], [LX + 19, 1], [LX + 27, 1], [LX + 33, 1], [LX + 39, 1],
      [LX + LW + 3, 2], [LX + LW + 8, 2], [LX + LW + 3, 6], [LX + LW + 8, 6], [LX + LW + 3, 11], [LX + LW + 8, 11],
      [LX + LW + 3, 16], [LX + LW + 8, 16], [LX + LW + 3, 21], [LX + LW + 8, 21],
    ] as const;
    HS.forEach((p, i) => house(c, p[0], p[1], 302 + i));
    px(c, 0, SY + 1, EW, 1, P.laneShoulder);
    laneH(c, 0, SY + 2, EW);
    grass(c, 0, SY + 4, EW, EH - SY - 4, 340);
    ([[4, SY + 6], [10, SY + 6], [18, SY + 6], [26, SY + 6], [34, SY + 6], [42, SY + 6], [52, SY + 6], [60, SY + 6]] as const)
      .forEach((p, i) => house(c, p[0], p[1], 341 + i));
    tree(c, LX - 3, SY - 4, 360); tree(c, LX + LW + 1, SY - 6, 361);
    crosswalk(c, LX + 23, SY + 2, 2, 2);
    approach(c);
  };
  const provincial1 = () => { // 읍내 중심가 + 밭
    grass(c, 0, 0, EW, EH, 371);
    fieldDry(c, LX + LW + 3, 1, EW - LX - LW - 4, 20);
    paddy(c, LX + LW + 3, 22, EW - LX - LW - 4, EH - 22, 372);
    fieldDry(c, 1, 2, 9, 12);
    grass(c, 0, 16, LX - 2, SY - 16, 373); tree(c, 3, 20, 374); tree(c, 6, 26, 375);
    px(c, 0, SY + 1, EW, 1, P.laneShoulder); laneH(c, 0, SY + 2, EW);
    grass(c, 0, SY + 4, EW, EH - SY - 4, 376);
    ([[8, SY + 6], [14, SY + 6], [20, SY + 6], [28, SY + 6], [36, SY + 6], [44, SY + 6]] as const)
      .forEach((p, i) => house(c, p[0], p[1], 377 + i));
    roof(c, 52, SY + 5, 14, 6, 383); // 읍내 마트
    crosswalk(c, LX + 23, SY + 2, 2, 2);
    approach(c);
  };
  const provincial2 = () => { // 하천변
    grass(c, 0, 0, EW, EH, 391);
    const RV = LX + LW + 6;
    grass(c, RV - 4, 0, 4, EH, 392);              // 둔치
    px(c, RV - 1, 0, 1, EH, P.leveePath);           // 제방길
    river(c, RV, 0, EW - RV, EH, 393);
    tree(c, RV - 4, 4, 394); tree(c, RV - 3, 14, 395); tree(c, RV - 4, 26, 396);
    fieldDry(c, 1, 2, 9, 16);
    grass(c, 0, 20, LX - 2, SY - 20, 397);
    sidewalkH(c, 0, SY + 1, RV - 1); roadH(c, 0, SY + 2, RV - 1, 2); sidewalkH(c, 0, SY + 6, RV - 1);
    px(c, RV - 1, SY + 2, 1, 4, P.leveePath);       // 제방길이 도로와 만남
    grass(c, 0, SY + 7, RV - 1, EH - SY - 7, 398);
    crosswalk(c, LX + 23, SY + 2, 2, 4);
    approach(c);
  };

  // ── ④ 농어촌 ───────────────────────────────────────────────────────────
  const rural0 = () => { // 논 한가운데
    paddy(c, 0, 0, EW, EH, 401);
    px(c, 0, SY + 1, EW, 1, P.dirtLane);           // 농로(흙)
    laneH(c, 0, SY + 2, EW);
    paddy(c, 0, SY + 4, EW, EH - SY - 4, 402);
    px(c, LX + LW + 4, 0, 1, SY + 2, P.dirtLane);  // 세로 농로
    grass(c, 0, 0, 6, 6, 403); tree(c, 1, 1, 404);
    house(c, 2, SY + 6, 405); house(c, 7, SY + 6, 406); // 농가 두 채
    crosswalk(c, LX + 23, SY + 2, 2, 2);
    approach(c);
  };
  const rural1 = () => { // 산기슭
    grass(c, 0, 0, EW, EH, 411);
    forest(c, 0, 0, EW, LY - 2, 412);             // 북쪽 숲
    forest(c, 0, LY - 2, LX - 3, EH - LY - 4, 413); // 서쪽 숲
    fieldDry(c, LX + LW + 4, 2, EW - LX - LW - 5, 14);
    grass(c, LX + LW + 3, 18, EW - LX - LW - 3, SY - 18, 414);
    tree(c, LX + LW + 5, 20, 415); tree(c, LX + LW + 9, 26, 416);
    px(c, 0, SY + 1, EW, 1, P.laneShoulder); laneH(c, 0, SY + 2, EW);
    grass(c, 0, SY + 4, EW, EH - SY - 4, 417);
    forest(c, 0, SY + 6, 20, EH - SY - 6, 418);
    house(c, 30, SY + 7, 419); house(c, 40, SY + 7, 420);
    crosswalk(c, LX + 23, SY + 2, 2, 2);
    approach(c);
  };
  const rural2 = () => { // 해안 어촌
    grass(c, 0, 0, EW, EH, 431);
    const SX = LX + LW + 4;
    sea(c, SX, 0, EW - SX, EH, 432);
    px(c, SX, 0, 1, EH, P.seawall);                          // 해안선 둑
    px(c, SX, 10, 6, 1, P.breakwater); px(c, SX + 5, 10, 1, 10, P.breakwater); // 방파제 L자
    c.fillStyle = "rgba(216,207,175,0.10)"; c.fillRect((SX + 5) * T, 19 * T, T, 3); // 등대 불
    pxf(c, (SX + 2) * T, 12 * T, T * 2 - 4, T - 2, P.vehicleBlue);
    pxf(c, (SX + 3) * T, 14 * T, T * 2 - 4, T - 2, P.vehicleRed); // 배 두 척
    fieldDry(c, 1, 2, 9, 10);
    grass(c, 0, 14, LX - 2, SY - 14, 433);
    ([[2, 16], [6, 16], [2, 21], [6, 21], [2, 26], [6, 26]] as const)
      .forEach((p, i) => house(c, p[0], p[1], 434 + i));
    px(c, 0, SY + 1, SX, 1, P.laneShoulder); laneH(c, 0, SY + 2, SX);
    px(c, SX, SY + 2, 1, 2, P.seawall);
    grass(c, 0, SY + 4, SX, EH - SY - 4, 441);
    ([[8, SY + 6], [16, SY + 6], [26, SY + 6], [36, SY + 6]] as const)
      .forEach((p, i) => house(c, p[0], p[1], 442 + i));
    crosswalk(c, LX + 23, SY + 2, 2, 2);
    approach(c);
  };

  /** 지역 × 변형(0..2) 카탈로그 — 12종 전부가 게임에 들어간다(고른 한 안이 아니다). */
  const BLOCKS: Record<SimRegionKey, ReadonlyArray<() => void>> = {
    URBAN: [urban0, urban1, urban2],
    NEWTOWN: [newtown0, newtown1, newtown2],
    PROVINCIAL: [provincial0, provincial1, provincial2],
    RURAL: [rural0, rural1, rural2],
  };

  // 다시 그릴 때(지역이 갈릴 때) 이전 그림이 비쳐서는 안 된다 — 바탕부터 통째로 덮는다.
  c.clearRect(0, 0, EW * T, EH * T);
  pxf(c, 0, 0, EW * T, EH * T, P.ground);
  (BLOCKS[region][variant] ?? BLOCKS[region][0])();

  /* 발광 — 블록이 다 그려진 뒤 한 번에. `lighter`는 채널을 **더하므로** 어두운 배경에서만
     빛으로 보이고(밝은 면에 얹으면 그냥 하얗게 탄다), 그래서 이 패스는 팔레트를 낮게 유지하는
     쪽과 짝이다. 반경 안쪽에서 0.45 지점까지만 세게 주고 바깥은 급히 죽인다 — 넉넉히 퍼뜨리면
     화면이 안개처럼 흐려진다(시안에서 실측했다). */
  c.globalCompositeOperation = "lighter";
  for (const { x, y, rad, col, a } of glows) {
    const px0 = x * T, py0 = y * T, r0 = rad * T;
    const g = c.createRadialGradient(px0, py0, 0, px0, py0, r0);
    g.addColorStop(0, `rgba(${col},${a})`);
    g.addColorStop(0.45, `rgba(${col},${a * 0.34})`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    c.beginPath(); c.arc(px0, py0, r0, 0, 7); c.fill();
  }
  /* ⚠️ **반드시 되돌린다.** 남겨 두면 다음 렌더(지역 교체)의 첫 fill이 additive로 그려져 배경이
     하얗게 탄다 — 캔버스 상태는 렌더 사이에 살아 있다(테스트가 마지막 합성 모드를 단언한다). */
  c.globalCompositeOperation = "source-over";

  /* 비네트 — 네 귀퉁이를 떨어뜨려 시선을 가운데(부지)로 모은다. 배경을 밝힌 대가로 화면 주변이
     시끄러워졌는데, 이 한 겹이 그걸 되돌리면서 「부지가 무대다」를 밝기로 다시 말한다. */
  const vx = (EW * T) / 2, vy = (EH * T) / 2;
  const vr = Math.max(EW, EH) * T * 0.62;
  const vig = c.createRadialGradient(vx, vy, Math.min(EW, EH) * T * 0.34, vx, vy, vr);
  vig.addColorStop(0, "rgba(6,6,14,0)");
  vig.addColorStop(1, "rgba(6,6,14,0.5)");
  c.fillStyle = vig;
  c.fillRect(0, 0, EW * T, EH * T);

  // 부지 구멍 — 위 주석의 계약. 이 한 줄이 없으면 부지 바닥·격자가 풍경에 덮인다.
  c.clearRect(LX * T, LY * T, LW * T, LH * T);
}

export interface BackdropProps {
  region: SimRegionKey;
  /** 배경 변형(0..2) — 세계가 든 값 그대로다(범위 방어는 `createWorld`가 이미 했다). */
  variant: number;
}

export default function Backdrop({ region, variant }: BackdropProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    drawBackdrop(ctx, region, variant);
  }, [region, variant]);
  return (
    <canvas
      ref={ref}
      width={BACKDROP_W * TILE}
      height={BACKDROP_H * TILE}
      /* 부지 좌상단이 원점이므로 여백만큼 **음수로** 민다. 부모 transform div는 overflow를 안
         자르므로 화면에 그대로 보이고, 카메라 transform은 부모가 지고 있어 줌·팬에 따라온다. */
      className="pointer-events-none absolute"
      style={{ left: -BACKDROP_OFF_X * TILE, top: -BACKDROP_OFF_Y * TILE }}
      aria-hidden
    />
  );
}
