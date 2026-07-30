"use client";

import { useEffect, useRef } from "react";
import { GRID_W, GRID_H, type SimRegionKey } from "@/sim/world";
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

/** 배경이 덮는 범위(타일) — 부지 48×32 + 좌우 12·상하 8타일 여백. 시안과 같은 비율이다. */
export const BACKDROP_W = 72;
export const BACKDROP_H = 48;
/** 배경 좌표계에서 부지가 앉는 자리 — 곧 캔버스를 부지 기준으로 얼마나 밀어 둘지이기도 하다. */
export const BACKDROP_OFF_X = 12;
export const BACKDROP_OFF_Y = 8;

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
  const GROUND = "#0b0b0e";

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

  function grass(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    px(c, x, y, w, h, "#0e120f");
    const r = rng(seed);
    for (let i = 0; i < w * h * 0.7; i++) {
      const gx = x * T + Math.floor(r() * w * T), gy = y * T + Math.floor(r() * h * T);
      pxf(c, gx, gy, 2, 2, r() < 0.5 ? "#111711" : "#0b0e0c");
    }
    for (let i = 0; i < w * h * 0.09; i++) {
      const gx = x * T + Math.floor(r() * w * T), gy = y * T + Math.floor(r() * h * T);
      pxf(c, gx, gy, 2, 3, "#1c2b20"); pxf(c, gx + 2, gy + 1, 1, 2, "#16221a");
    }
  }
  function roadH(c: Ctx, x: number, y: number, w: number, lanes: number) {
    const h = lanes * 2;
    px(c, x, y, w, h, "#15151b");
    c.fillStyle = "rgba(216,207,175,0.14)";
    for (let dx = 0; dx < w; dx += 3) c.fillRect((x + dx) * T, (y + h / 2) * T - 1, 2 * T - 4, 2);
    c.fillStyle = "rgba(216,207,175,0.07)";
    c.fillRect(x * T, y * T, w * T, 2); c.fillRect(x * T, (y + h) * T - 2, w * T, 2);
  }
  function roadV(c: Ctx, x: number, y: number, h: number, lanes: number) {
    const w = lanes * 2;
    px(c, x, y, w, h, "#15151b");
    c.fillStyle = "rgba(216,207,175,0.14)";
    for (let dy = 0; dy < h; dy += 3) c.fillRect((x + w / 2) * T - 1, (y + dy) * T, 2, 2 * T - 4);
    c.fillStyle = "rgba(216,207,175,0.07)";
    c.fillRect(x * T, y * T, 2, h * T); c.fillRect((x + w) * T - 2, y * T, 2, h * T);
  }
  /** 1차선 좁은 길 — 중앙선이 없는 것이 읍내·농로의 표식이다. */
  function laneH(c: Ctx, x: number, y: number, w: number) {
    px(c, x, y, w, 2, "#15151b");
    c.fillStyle = "rgba(216,207,175,0.07)";
    c.fillRect(x * T, y * T, w * T, 2); c.fillRect(x * T, (y + 2) * T - 2, w * T, 2);
  }
  function sidewalkH(c: Ctx, x: number, y: number, w: number) {
    px(c, x, y, w, 1, "#18181e");
    c.fillStyle = "rgba(216,207,175,0.05)";
    for (let dx = 0; dx < w; dx += 2) c.fillRect((x + dx) * T, y * T, 1, T);
  }
  function sidewalkV(c: Ctx, x: number, y: number, h: number) {
    px(c, x, y, 1, h, "#18181e");
    c.fillStyle = "rgba(216,207,175,0.05)";
    for (let dy = 0; dy < h; dy += 2) c.fillRect(x * T, (y + dy) * T, T, 1);
  }
  function crosswalk(c: Ctx, x: number, y: number, w: number, h: number) {
    c.fillStyle = "rgba(216,207,175,0.20)";
    if (w >= h) { for (let dy = 0; dy < h * T; dy += 6) c.fillRect(x * T, y * T + dy, w * T, 3); }
    else { for (let dx = 0; dx < w * T; dx += 6) c.fillRect(x * T + dx, y * T, 3, h * T); }
  }
  function tree(c: Ctx, x: number, y: number, seed: number) {
    const r = rng(seed);
    pxf(c, x * T + 2, y * T + 2, T * 2 - 4, T * 2 - 4, "#1a2e21");
    pxf(c, x * T + 4, y * T + 4, T * 2 - 8, T * 2 - 8, "#24402e");
    for (let i = 0; i < 7; i++) {
      pxf(c, x * T + 3 + Math.floor(r() * (T * 2 - 7)), y * T + 3 + Math.floor(r() * (T * 2 - 7)), 2, 2, "#142319");
    }
  }
  function lamp(c: Ctx, x: number, y: number) {
    pxf(c, x * T - 1, y * T - 1, 3, 3, "#3b3626");
    c.fillStyle = "rgba(216,207,175,0.06)";
    c.beginPath(); c.arc(x * T, y * T, T * 1.6, 0, 7); c.fill();
  }
  function car(c: Ctx, x: number, y: number, col: string, vert: boolean) {
    if (vert) pxf(c, x * T + 2, y * T + 1, T - 4, T * 2 - 3, col);
    else pxf(c, x * T + 1, y * T + 2, T * 2 - 3, T - 4, col);
    c.fillStyle = "rgba(216,207,175,0.10)";
    if (vert) c.fillRect(x * T + 3, y * T + 3, T - 6, 3);
    else c.fillRect(x * T + 3, y * T + 3, 3, T - 6);
  }
  /** 건물 옥상 덩어리 — 실외기·옥탑이 흩어진다. */
  function roof(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, "#131318");
    c.strokeStyle = "#1d1d25"; c.lineWidth = 2; c.strokeRect(x * T + 1, y * T + 1, w * T - 2, h * T - 2);
    for (let i = 0; i < (w * h) / 14; i++) {
      const gx = x + 1 + Math.floor(r() * (w - 3)), gy = y + 1 + Math.floor(r() * (h - 3));
      pxf(c, gx * T, gy * T, T + 2, T - 2, "#1b1b23"); pxf(c, gx * T + 2, gy * T + 2, T - 4, 2, "#101016");
    }
    if (r() < 0.8) {
      const gx = x + 1 + Math.floor(r() * (w - 4)), gy = y + 1 + Math.floor(r() * (h - 3));
      pxf(c, gx * T, gy * T, T * 2, T, "#2a2617"); pxf(c, gx * T + 2, gy * T + 2, T * 2 - 4, T - 4, "#3a3320");
    }
  }
  /** 판상형 아파트 동(옥상) — 승강기탑이 일정 간격. */
  function apt(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, "#15151c");
    c.strokeStyle = "#21212b"; c.lineWidth = 2; c.strokeRect(x * T + 1, y * T + 1, w * T - 2, h * T - 2);
    for (let gx = x + 2; gx < x + w - 2; gx += 5) {
      pxf(c, gx * T, (y + Math.floor(h / 2)) * T - 4, T + 4, T - 2, "#22222e");
      pxf(c, gx * T + 2, (y + Math.floor(h / 2)) * T - 2, T, 2, "#2c2c3a");
    }
    if (r() < 0.9) pxf(c, (x + w - 3) * T, (y + 1) * T, T, T - 4, "#2a2617");
  }
  /** 저층 주택(3×2) — 박공지붕 탑뷰. */
  function house(c: Ctx, x: number, y: number, seed: number) {
    const r = rng(seed);
    const warm = r() < 0.4;
    pxf(c, x * T, y * T, 3 * T, T, warm ? "#1e1712" : "#191720");            // 지붕 윗면
    pxf(c, x * T, (y + 1) * T, 3 * T, T, warm ? "#140f0a" : "#100f15");      // 지붕 아랫면(그늘)
    pxf(c, x * T, (y + 1) * T - 1, 3 * T, 2, warm ? "#2d2114" : "#242233");  // 용마루
    pxf(c, (x + 3) * T, y * T, 2, 2 * T, "#0c0e0b");                         // 마당 경계 그림자
  }
  /** 나대지·공사장 — 점선 가설 울타리와 자재 더미. */
  function dirtLot(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, "#15120c");
    for (let i = 0; i < w * h * 0.6; i++) {
      const gx = x * T + Math.floor(r() * w * T), gy = y * T + Math.floor(r() * h * T);
      pxf(c, gx, gy, 2, 2, r() < 0.5 ? "#181509" : "#110e08");
    }
    c.strokeStyle = "rgba(216,207,175,0.12)"; c.lineWidth = 2;
    c.setLineDash([6, 6]); c.strokeRect(x * T + 2, y * T + 2, w * T - 4, h * T - 4); c.setLineDash([]);
    pxf(c, (x + 2) * T, (y + 2) * T, T * 3, T, "#23201a");
    pxf(c, (x + 2) * T, (y + 3) * T + 2, T * 3, T - 4, "#1c1a15");
  }
  /** 밭 — 이랑 줄무늬. */
  function fieldDry(c: Ctx, x: number, y: number, w: number, h: number) {
    for (let dy = 0; dy < h; dy++) px(c, x, y + dy, w, 1, dy % 2 ? "#12100a" : "#0d0c07");
    c.fillStyle = "rgba(216,207,175,0.03)";
    for (let dy = 0; dy < h; dy += 2) c.fillRect(x * T, (y + dy) * T, w * T, 1);
  }
  /** 논배미 — 불규칙 격자 + 물빛. */
  function paddy(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, "#0d1513");
    let gy = y;
    while (gy < y + h) {
      const rh = 4 + Math.floor(r() * 4);
      let gx = x;
      while (gx < x + w) {
        const rw = 7 + Math.floor(r() * 7);
        const cw = Math.min(rw, x + w - gx), ch = Math.min(rh, y + h - gy);
        px(c, gx, gy, cw, ch, r() < 0.4 ? "#0e1714" : "#0c1310");
        c.fillStyle = "#1a1e12";
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
    px(c, x, y, w, h, "#0f1a13");
    for (let i = 0; i < w * h * 0.35; i++) {
      const gx = x * T + Math.floor(r() * (w * T - 8)), gy = y * T + Math.floor(r() * (h * T - 8));
      pxf(c, gx, gy, 8, 8, "#16281c"); pxf(c, gx + 2, gy + 2, 4, 4, r() < 0.5 ? "#1e3626" : "#12211a");
    }
  }
  /** 하천(세로) — 물 + 흐름 대시. */
  function river(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
    const r = rng(seed);
    px(c, x, y, w, h, "#0d141c");
    c.fillStyle = "#13202b";
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
    px(c, x, y, w, h, "#0b131a");
    c.fillStyle = "#122230";
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
  const approach = (c: Ctx) => px(c, LX + 23, SY, 2, 1, "#18181e");

  // ── ① 대도시 도심 ──────────────────────────────────────────────────────
  const urban0 = () => { // 고층 블록 밀집 — 사방이 이웃 건물 옥상
    grass(c, 0, 0, EW, EH, 101);
    roof(c, 0, 0, LX - 2, 22, 102); roof(c, 0, 24, LX - 2, 16, 103);
    roof(c, LX + LW + 2, 0, EW - LX - LW - 2, 14, 104); roof(c, LX + LW + 2, 16, EW - LX - LW - 2, 22, 105);
    roof(c, LX + 1, 0, 22, LY - 2, 106); roof(c, LX + 25, 0, 20, LY - 2, 107);
    sidewalkH(c, 0, SY + 1, EW); roadH(c, 0, SY + 2, EW, 2); sidewalkH(c, 0, SY + 6, EW);
    roof(c, 0, SY + 7, 30, EH - SY - 7, 108); roof(c, 34, SY + 7, EW - 34, EH - SY - 7, 109);
    crosswalk(c, LX + 23, SY + 2, 2, 4); car(c, 20, SY + 2, "#232b33", false); car(c, 52, SY + 4, "#2f2626", false);
    approach(c);
  };
  const urban1 = () => { // 대로변 — 왕복 6차선 + 중앙분리대
    grass(c, 0, 0, EW, EH, 111);
    sidewalkH(c, 0, SY + 1, EW);
    roadH(c, 0, SY + 2, EW, 1);                    // 상행 차로
    px(c, 0, SY + 4, EW, 1, "#10140f");            // 중앙분리대
    for (let x = 2; x < EW; x += 6) pxf(c, x * T + 2, (SY + 4) * T + 2, 6, 6, "#1e3626"); // 분리대 관목
    roadH(c, 0, SY + 5, EW, 1);                    // 하행 차로
    sidewalkH(c, 0, SY + 7, EW);                   // 딱 화면 끝
    roof(c, 0, 0, 8, SY - 14, 115); roof(c, LX + LW + 4, 0, EW - LX - LW - 4, 20, 116);
    crosswalk(c, LX + 23, SY + 2, 2, 5);
    car(c, 10, SY + 2, "#232b33", false); car(c, 40, SY + 2, "#2f2626", false);
    car(c, 26, SY + 5, "#262e26", false); car(c, 58, SY + 5, "#232b33", false);
    approach(c);
  };
  const urban2 = () => { // 사거리 코너 — 남·동 도로가 만나는 필지
    grass(c, 0, 0, EW, EH, 121);
    const RX = LX + LW + 2;
    sidewalkH(c, 0, SY + 1, RX); roadH(c, 0, SY + 2, EW, 2); sidewalkH(c, 0, SY + 6, RX);
    sidewalkV(c, RX, 0, SY + 1); roadV(c, RX + 1, 0, SY + 6, 2); sidewalkV(c, RX + 5, 0, SY + 1);
    px(c, RX + 1, SY + 2, 4, 4, "#15151b");
    roof(c, RX + 7, 0, EW - RX - 7, 18, 122); roof(c, RX + 7, 20, EW - RX - 7, 16, 123);
    roof(c, 0, 0, 9, 16, 124); roof(c, 0, 18, 9, 18, 125);
    sidewalkH(c, RX + 6, SY + 6, EW - RX - 6); roof(c, RX + 6, SY + 7, EW - RX - 6, EH - SY - 7, 126);
    roof(c, 0, SY + 7, 26, EH - SY - 7, 127);
    crosswalk(c, LX + 23, SY + 2, 2, 4); crosswalk(c, RX + 1, LY + 16, 4, 2); crosswalk(c, RX - 2, SY + 2, 2, 4);
    lamp(c, LX + 8, SY + 1); lamp(c, LX + 34, SY + 1); lamp(c, RX, LY + 6); lamp(c, RX, LY + 26);
    car(c, 14, SY + 2, "#232b33", false); car(c, 44, SY + 4, "#2f2626", false); car(c, RX + 1, 10, "#262e26", true);
    approach(c);
  };

  // ── ② 신도시·중소도시 ──────────────────────────────────────────────────
  const newtown0 = () => { // 아파트 단지 옆
    grass(c, 0, 0, EW, EH, 201);
    apt(c, 1, 2, 9, 3, 202); apt(c, 1, 9, 9, 3, 203); apt(c, 1, 16, 9, 3, 204); apt(c, 1, 23, 9, 3, 205);
    px(c, 1, 6, 9, 2, "#141419"); px(c, 1, 13, 9, 2, "#141419"); px(c, 1, 20, 9, 2, "#141419"); // 동 사이 주차열
    c.fillStyle = "rgba(216,207,175,0.10)";
    for (let i = 0; i < 4; i++) { c.fillRect((2 + i * 2) * T, 6 * T, 2, 2 * T); c.fillRect((2 + i * 2) * T, 13 * T, 2, 2 * T); }
    car(c, 2, 6, "#232b33", true); car(c, 6, 13, "#2f2626", true);
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
    px(c, PX2, 6, 1, SY - 6, "#1c1a12"); px(c, PX2, 20, EW - PX2 - 2, 1, "#1c1a12"); // 산책로
    ([[PX2 + 3, 8], [PX2 + 6, 13], [PX2 + 2, 17], [PX2 + 6, 24], [PX2 + 3, 29], [PX2 + 7, 4]] as const)
      .forEach((p, i) => tree(c, p[0], p[1], 225 + i));
    pxf(c, (PX2 + 4) * T, 22 * T, T + 4, 4, "#4a3f2c"); pxf(c, (PX2 + 7) * T, 27 * T, T + 4, 4, "#4a3f2c"); // 벤치
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
    px(c, RX2 + 1, SY + 2, 4, 4, "#15151b");
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
    px(c, 0, SY + 1, EW, 1, "#141414");
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
    px(c, 0, SY + 1, EW, 1, "#141414"); laneH(c, 0, SY + 2, EW);
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
    px(c, RV - 1, 0, 1, EH, "#1b1912");           // 제방길
    river(c, RV, 0, EW - RV, EH, 393);
    tree(c, RV - 4, 4, 394); tree(c, RV - 3, 14, 395); tree(c, RV - 4, 26, 396);
    fieldDry(c, 1, 2, 9, 16);
    grass(c, 0, 20, LX - 2, SY - 20, 397);
    sidewalkH(c, 0, SY + 1, RV - 1); roadH(c, 0, SY + 2, RV - 1, 2); sidewalkH(c, 0, SY + 6, RV - 1);
    px(c, RV - 1, SY + 2, 1, 4, "#1b1912");       // 제방길이 도로와 만남
    grass(c, 0, SY + 7, RV - 1, EH - SY - 7, 398);
    crosswalk(c, LX + 23, SY + 2, 2, 4);
    approach(c);
  };

  // ── ④ 농어촌 ───────────────────────────────────────────────────────────
  const rural0 = () => { // 논 한가운데
    paddy(c, 0, 0, EW, EH, 401);
    px(c, 0, SY + 1, EW, 1, "#171410");           // 농로(흙)
    laneH(c, 0, SY + 2, EW);
    paddy(c, 0, SY + 4, EW, EH - SY - 4, 402);
    px(c, LX + LW + 4, 0, 1, SY + 2, "#171410");  // 세로 농로
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
    px(c, 0, SY + 1, EW, 1, "#141414"); laneH(c, 0, SY + 2, EW);
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
    px(c, SX, 0, 1, EH, "#191d17");                          // 해안선 둑
    px(c, SX, 10, 6, 1, "#1c1c22"); px(c, SX + 5, 10, 1, 10, "#1c1c22"); // 방파제 L자
    c.fillStyle = "rgba(216,207,175,0.10)"; c.fillRect((SX + 5) * T, 19 * T, T, 3); // 등대 불
    pxf(c, (SX + 2) * T, 12 * T, T * 2 - 4, T - 2, "#232b33");
    pxf(c, (SX + 3) * T, 14 * T, T * 2 - 4, T - 2, "#2f2626"); // 배 두 척
    fieldDry(c, 1, 2, 9, 10);
    grass(c, 0, 14, LX - 2, SY - 14, 433);
    ([[2, 16], [6, 16], [2, 21], [6, 21], [2, 26], [6, 26]] as const)
      .forEach((p, i) => house(c, p[0], p[1], 434 + i));
    px(c, 0, SY + 1, SX, 1, "#141414"); laneH(c, 0, SY + 2, SX);
    px(c, SX, SY + 2, 1, 2, "#191d17");
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
  pxf(c, 0, 0, EW * T, EH * T, GROUND);
  (BLOCKS[region][variant] ?? BLOCKS[region][0])();
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
