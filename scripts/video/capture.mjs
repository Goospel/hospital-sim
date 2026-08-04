// 심스피탈 컷 녹화 하네스 — node capture.mjs <컷이름>
// 산출물: raw/<컷>.webm(원본) · raw/<컷>.log(키 순간 경과초) · thumbs/(검증 썸네일은 verify.mjs)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/kimsa/AppData/Local/Temp/hs-video";
const BASE = process.env.HS_URL || "http://localhost:3001";
const GRID_W = 48, GRID_H = 32;

// ── 게임 안으로 주입 ────────────────────────────────────────────────────────
// rAF 가상 시계 — __ffwd가 켜지면 콜백에 넘기는 timestamp를 프레임당 +250ms
// (useSimClock의 MAX_FRAME_MS) 점프시킨다. 게임 로직은 결정론이라 결과는 안 바뀌고,
// 하루가 3× 기준 약 8초에 지나간다.
//
// ⚠️ Math.random은 **여기서 못 고정한다**: react-dom이 모듈 평가 시점에 Math.random으로
// 내부 이벤트 프로퍼티 키(`__reactProps$xxx`)를 만드는데, 상수를 돌려주면 앱의 react-dom과
// next-devtools가 품은 react-dom이 **같은 키**를 만들어 클릭이 통째로 죽는다(실측).
// 그래서 게임이 실제로 부르는 한 지점(배경 그림 추첨)에서만 잠깐 고정한다 — pickRegion 참조.
const INIT = () => {
  const raf = window.requestAnimationFrame.bind(window);
  let virt = 0, lastReal = null;
  window.__ffwd = false;
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      if (lastReal === null) lastReal = t;
      const real = t - lastReal;
      lastReal = t;
      virt += window.__ffwd ? 250 : real; // 단조증가 — 끄면 실경과만 더한다
      cb(virt);
    });
};

// ── 컷 기록기 ──────────────────────────────────────────────────────────────
function makeRec(cut) {
  const t0 = Date.now();
  const lines = [];
  return {
    at: () => (Date.now() - t0) / 1000,
    mark(label) {
      const s = ((Date.now() - t0) / 1000).toFixed(2);
      const line = `${s}\t${label}`;
      lines.push(line);
      console.log(`[${cut}] ${s}s  ${label}`);
      return Number(s);
    },
    flush() {
      fs.writeFileSync(path.join(ROOT, "raw", `${cut}.log`), lines.join("\n") + "\n", "utf8");
    },
  };
}

// ── 좌표 ───────────────────────────────────────────────────────────────────
const mapEl = (page) => page.getByRole("img", { name: /^병원 부지/ });
async function mapRect(page) {
  const b = await mapEl(page).boundingBox();
  if (!b) throw new Error("맵 rect를 못 읽었다");
  return b;
}
const tileXY = (r, tx, ty) => ({
  x: r.x + (tx + 0.5) * (r.width / GRID_W),
  y: r.y + (ty + 0.5) * (r.height / GRID_H),
});

/** 마지막으로 커서를 둔 자리 — glide가 여기서 출발한다(사람처럼 움직이는 오프닝 컷용). */
let cursor = { x: 960, y: 540 };

/** 사람처럼 커서를 옮긴다 — easeInOutQuad로 가속·감속. 클릭 전에 부르면 화면에서 손이 보인다. */
async function glide(page, x, y, ms = 900) {
  const n = Math.max(6, Math.round(ms / 30));
  const { x: sx, y: sy } = cursor;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
    await page.waitForTimeout(30);
  }
  cursor = { x, y };
}

/** 요소 한가운데로 glide한 뒤 누른다. */
async function glideClick(page, loc, ms = 800) {
  /* ⚠️ **먼저 스크롤해 화면 안으로 들인다.** 좌표 클릭이라 Playwright의 자동 스크롤이 없다 —
     모달(개원 준비 패널 1421px > 1080)의 아래쪽 버튼은 boundingBox가 뷰포트 밖 y를 돌려주고,
     그 좌표를 누르면 **에러 없이 아무 일도 안 일어난다**(실측: [개원 준비 시작]이 통째로 무시됨). */
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) throw new Error("glideClick: 요소가 화면에 없다");
  await glide(page, b.x + b.width / 2, b.y + b.height / 2, ms);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/** 타일 드래그 — PointerEvent 경로(down → 중간 이동 → up). click()으로는 안 된다. */
async function dragTiles(page, a, b, { steps = 10, stepMs = 40, holdMs = 0, onHold = null } = {}) {
  const r = await mapRect(page);
  const p1 = tileXY(r, a[0], a[1]);
  let p2 = tileXY(r, b[0], b[1]);
  // 한 칸짜리도 **드래그로** 놓는다 — 같은 좌표면 move 이벤트가 안 뜰 수 있어 타일 안에서 흔든다
  if (p1.x === p2.x && p1.y === p2.y) p2 = { x: p1.x + 3, y: p1.y + 3 };
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await page.mouse.move(p1.x + (p2.x - p1.x) * k, p1.y + (p2.y - p1.y) * k);
    if (stepMs) await page.waitForTimeout(stepMs);
  }
  if (onHold) await onHold();
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await page.waitForTimeout(120);
  cursor = p2;
}

/** 타일 한 칸 클릭 — **문 도구는 드래그가 아니다**(simHud.isDragTool: DOOR만 false).
 *  SimGame의 onTileDown이 pointerdown 시점에 곧바로 commit하므로 down/up 한 번이면 된다. */
async function clickTile(page, [x, y], { approachMs = 0, holdMs = 0 } = {}) {
  const r = await mapRect(page);
  const p = tileXY(r, x, y);
  if (approachMs) await glide(page, p.x, p.y, approachMs);
  else await page.mouse.move(p.x, p.y);
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(150);
  cursor = p;
}

// ── 팔레트 조작 ────────────────────────────────────────────────────────────
const btn = (page, name) => page.getByRole("button", { name, exact: true });

/* ⚠️ **팔레트는 드릴다운이다**(2026-08-05 · PR #201). 옛 아코디언은 카테고리·도구·용도·과가
   세로로 **누적**돼 [건설]이 늘 화면에 있었고, 그래서 `aria-expanded`를 보고 열기만 하면 됐다.
   지금은 한 계층만 **교체**돼 서므로 [건설] 버튼은 뿌리에서만 존재하고, 안에 들어가 있으면
   그 자리에 머리줄 「‹ 건설」이 선다(같은 접근성 이름이라 이름만으로는 구별이 안 된다).
   → 어느 계층에 있든 **먼저 뿌리로 되돌린 뒤** 카테고리를 누른다. */

/** 머리줄 「‹ …」 — 뿌리가 아닐 때만 선다(그래서 개수가 곧 "지금 계층 안인가"다). */
const backRow = (page) => page.locator("aside button").filter({ hasText: "‹" });

/** 팔레트를 뿌리(카테고리 둘)로 되돌린다.
 *  ESC가 도구·용도·과를 한 번에 놓고(SimGame의 escTarget "tool"), 남은 머리줄을 눌러 나온다.
 *  ⚠️ 모달이 떠 있으면 ESC가 그 모달부터 닫으므로(escTarget 우선순위) 모달이 없을 때만 부른다. */
async function goRoot(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  for (let i = 0; i < 4; i++) {
    if ((await backRow(page).count()) === 0) return;
    await backRow(page).first().click();
    await page.waitForTimeout(80);
  }
  throw new Error("팔레트 뿌리로 못 돌아간다");
}
async function openSection(page, label) {
  await goRoot(page);
  await btn(page, label).click();
  await page.waitForTimeout(80);
}
async function pickTool(page, label) {
  await openSection(page, "건설");
  await btn(page, label).click();
  await page.waitForTimeout(80);
}
/** 용도 도구 + 방 종류(+ 진료실이면 과)까지 무장. */
async function pickZone(page, room, dept) {
  await pickTool(page, "용도");
  await btn(page, room).click();
  if (dept) await btn(page, dept).click();
  await page.waitForTimeout(80);
}

// ── HUD 읽기 ───────────────────────────────────────────────────────────────
async function hud(page) {
  const text = await page.evaluate(() => document.querySelector("header")?.innerText ?? "");
  const flat = text.replace(/\s+/g, " ");
  const clock = /(\d{2}):(\d{2})/.exec(flat);
  const wd = /(\d+)주 (\d+)일/.exec(flat);
  const emg = /회차 (\d+)/.exec(flat);
  return {
    text: flat,
    minute: clock ? (Number(clock[1]) * 60 + Number(clock[2])) - 540 : NaN, // 개원 09:00 기준
    week: wd ? Number(wd[1]) : NaN,
    day: wd ? Number(wd[2]) : NaN,
    turnedAway: emg ? Number(emg[1]) : NaN,
  };
}

/** 마감·결산·속보 모달이 떠 있으면 닫아 판을 계속 굴린다. 닫았으면 true. */
async function pump(page) {
  for (const name of ["다음 날", "다음 주", "확인"]) {
    const b = btn(page, name);
    if (await b.count() > 0 && await b.first().isVisible().catch(() => false)) {
      await b.first().click();
      await page.waitForTimeout(200);
      return true;
    }
  }
  return false;
}

/** pred가 참이 될 때까지 굴린다(모달은 자동으로 넘긴다). */
async function runUntil(page, pred, { timeoutMs = 180000, ffwd = false, poll = 120 } = {}) {
  if (ffwd) await page.evaluate(() => { window.__ffwd = true; });
  const t = Date.now();
  try {
    for (;;) {
      const h = await hud(page);
      if (await pred(h, page)) return h;
      if (Date.now() - t > timeoutMs) throw new Error(`runUntil 타임아웃: ${JSON.stringify(h)}`);
      await pump(page);
      await page.waitForTimeout(poll);
    }
  } finally {
    if (ffwd) await page.evaluate(() => { window.__ffwd = false; });
  }
}

// ── 공통 매크로 ────────────────────────────────────────────────────────────
async function pickRegion(page, label) {
  await page.getByRole("dialog", { name: "지역 선택" }).waitFor();
  /* 지역 점을 **응답할 때까지** 다시 누른다. 모달 DOM은 SSR로 먼저 서지만 하이드레이션 전에는
     클릭이 통째로 버려져(점만 하이라이트되고 옆 카드는 「지도에서 한 곳을 고르세요」로 남는다)
     뒤따르는 [여기에 짓는다]가 영영 안 생긴다 — 머신이 바쁠 때만 나는 레이스라 실측으로 두 번
     연속 밟았다(다른 컷은 우연히 통과). 카드가 실제로 열렸는지를 성공 판정으로 쓴다. */
  const dot = page.getByRole("button", { name: label, exact: true });
  const go = btn(page, "여기에 짓는다");
  for (let i = 0; ; i++) {
    await dot.click();
    if (await go.count() > 0) break;
    if (i >= 12) throw new Error(`지역 카드가 안 열린다: ${label}`);
    await page.waitForTimeout(600);
  }
  // 배경 그림 추첨(`Math.floor(Math.random()*BACKDROP_COUNT)`)만 고정한다 — 클릭 직전에 켜고
  // 직후에 되돌려, react-dom의 내부 키 생성에는 손대지 않는다(INIT 주석).
  await page.evaluate(() => { window.__realRandom = Math.random; Math.random = () => 0.1; });
  await btn(page, "여기에 짓는다").click();
  await page.getByRole("dialog", { name: "개원 준비 — 전국 인력 시장" }).waitFor();
  await page.evaluate(() => { if (window.__realRandom) Math.random = window.__realRandom; });
}

/* ── 채용 패널 — **과는 탭이다**(2026-08-05 · PR #202) ───────────────────────
 *
 * 옛 패널은 과마다 `<section>`이 세로로 서서 네 과의 카드가 한 화면에 다 있었다. 지금은 탭 줄
 * 하나 + **고른 한 과의 가로 선반**이라, 내과 후보를 누르려면 [내과] 탭을 **먼저** 눌러야 한다.
 * 안 누르면 첫 과(미용·피부)의 카드가 눌려 판 자체가 달라진다 — 조용히 틀리는 종류의 실패다. */

/** 과 탭 — 접근성 이름이 「내과 주급 1,500만원 · 현재 0명 · 잔여 5명」이라 이름 전체가 아니라
 *  **머리를 앵커**로 잡는다. 부분일치로 "내과"를 주면 「순환기내과」에도 걸린다(실측 위험). */
const deptTab = (dlg, dept) => dlg.getByRole("button", { name: new RegExp(`^${dept} 주급`) });

/** 지금 펴진 선반의 후보 카드 「채용」 — 카드 버튼의 접근성 이름은 `{이름} 채용`이다.
 *  `/채용$/`만 주면 **간호사 줄의 「채용」**(이름이 정확히 "채용")까지 걸리므로 앞을 요구한다. */
const cardHire = (dlg) => dlg.getByRole("button", { name: /\S 채용$/ });

/** 로스터 게이트 — roster: [[과이름, 인원], ...] · 간호사 nurses명. */
async function hireRoster(page, roster, nurses = 2) {
  const dlg = page.getByRole("dialog", { name: "개원 준비 — 전국 인력 시장" });
  for (const [dept, n] of roster) {
    await deptTab(dlg, dept).click();
    await page.waitForTimeout(120);
    for (let i = 0; i < n; i++) {
      await cardHire(dlg).first().click();
      await page.waitForTimeout(120);
    }
  }
  for (let i = 0; i < nurses; i++) {
    await dlg.getByRole("button", { name: "채용", exact: true }).click();
    await page.waitForTimeout(120);
  }
  await btn(page, "개원 준비 시작").click();
  await page.waitForTimeout(300);
}

/* ── 부지 배치 v2 — **벽과 문이 있는 진짜 방** ────────────────────────────────
 *
 * 옛 배치는 벽을 하나도 안 세워 부지가 "바닥 색만 칠한 마당"으로 보였다(사용자 지적 ①).
 * 이제 방마다 ① 벽 테두리(WALL은 rectModeOf가 BORDER라 드래그 사각형의 **테두리만** 선다)
 * ② 문 한 칸(placeDoor — 벽 타일만 전환) ③ 가구 ④ 용도 칠 순서로 짓는다.
 *
 * ⚠️ 순서가 계약이다: `paintZone`은 **벽·문 타일을 건너뛴다**. 그래서 방 사각형을 통째로 칠해도
 * 영역은 정확히 내부만 된다 — 벽을 먼저 세워야 그 스킵이 일어난다(칠을 먼저 하면 테두리까지
 * 칠해져 옆방과 영역이 이어진다).
 *
 * ⚠️ **문이 없으면 sealed room이다** — 체크리스트 「모든 영역에 길이 닿게」(setupSteps.sealed-rooms)가
 * 정문(24,31)에서 걸어 닿지 않는 영역을 세어 6/6을 막고, 환자·의사가 방에 못 들어간다.
 * 아래 좌표는 그 통행로를 전제로 짠 것이다:
 *   · 정문(24,31) → y30 빈칸 → 대기실 아래벽 문(24,29)
 *   · 대기실 위벽 문(24,24) → 복도 y23 → 접수처 아래벽 문(24,22)
 *   · 세로 복도 x15·16(식당↔대기실 사이)과 x32·33(대기실↔병동 사이)이 y23 ↔ y13을 잇는다
 *   · 진료실은 전부 아랫벽에 문을 내 복도 y13~17로 나온다
 */
const ROOM = {
  WAITING: { x0: 17, y0: 24, x1: 31, y1: 29, doors: [[24, 29], [24, 24]] },
  RECEPTION: { x0: 20, y0: 18, x1: 28, y1: 22, doors: [[24, 22]] },
  WARD: { x0: 34, y0: 23, x1: 45, y1: 29, doors: [[34, 26]] },
  CAFETERIA: { x0: 4, y0: 23, x1: 14, y1: 29, doors: [[14, 26]] },
};
const EXAM_ROOMS = [
  { x0: 4, y0: 5, x1: 12, y1: 12, doors: [[8, 12]] },
  { x0: 15, y0: 5, x1: 23, y1: 12, doors: [[19, 12]] },
  { x0: 26, y0: 5, x1: 34, y1: 12, doors: [[30, 12]] },
  { x0: 37, y0: 5, x1: 45, y1: 12, doors: [[41, 12]] },
];
// 셋째 자리는 같은 방 오른쪽 — 의자가 붙는 x0+6까지 방 **내부**(x0+1 ~ x1−1 = x0+7)다.
const deskSpots = (r) => [[r.x0 + 2, r.y0 + 2], [r.x0 + 2, r.y0 + 5], [r.x0 + 5, r.y0 + 2]];

const FAST = { steps: 6, stepMs: 15 };
const SHOW = { steps: 22, stepMs: 85, holdMs: 900 }; // 몽타주용 — 미리보기 라벨이 읽히는 속도

/** 벽 테두리 — 드래그 중 미리보기 라벨을 읽어 돌려준다(몽타주 검증용). */
async function wallsOf(page, r, opt, rec = null, label = "") {
  await pickTool(page, "벽");
  let seen = "";
  await dragTiles(page, [r.x0, r.y0], [r.x1, r.y1], {
    ...opt,
    onHold: rec ? async () => { seen = await previewLabelText(page); rec.mark(`${label} 벽 미리보기: ${seen}`); } : null,
  });
  return seen;
}
async function doorsOf(page, r, opt = {}) {
  // HS_NODOOR=1 — **돌연변이 확인용**. 문을 안 내면 체크리스트가 실제로 막히는지(= 이 절차가
  // 공허하지 않은지) 재는 스위치다. 평상시엔 쓰지 않는다.
  if (process.env.HS_NODOOR) return;
  await pickTool(page, "문");
  for (const d of r.doors) await clickTile(page, d, opt);
}
/** 용도 칠 — 방 사각형을 통째로 끈다(벽·문은 paintZone이 건너뛴다). */
async function zoneOf(page, r, room, dept, opt, rec = null, label = "") {
  await pickZone(page, room, dept);
  let seen = "";
  await dragTiles(page, [r.x0, r.y0], [r.x1, r.y1], {
    ...opt,
    onHold: rec ? async () => { seen = await previewLabelText(page); rec.mark(`${label} 용도 미리보기: ${seen}`); } : null,
  });
  return seen;
}

/* 병동 — **체크리스트(setupSteps)에는 없다**. 그런데 alertsOf의 ops 경고 `no-bed`
   (「병상이 없습니다 — 응급을 받을 수 없습니다」)는 의사가 한 명이라도 있으면 병상 0인 판에
   무조건 뜨므로, 6/6을 채워도 우상단에 붉은 줄이 남는다. 그림에서 그 줄을 지우려면 실제로
   병상을 놓는 수밖에 없다(판정은 wardBeds ≠ 0 하나뿐).
   침대는 통행을 막지 않아(world.blocksWalk) 한 줄로 깔아도 앞칸에 설 수 있다. */
async function buildWard(page, opt, rec = null, bedOpt = null) {
  const r = ROOM.WARD;
  await wallsOf(page, r, opt);
  await doorsOf(page, r);
  await pickTool(page, "침대");
  if (rec) rec.mark("병동 침대 열 드래그 시작");
  await dragTiles(page, [36, 25], [42, 25], bedOpt ?? opt); // 7상 · 개당 300만원
  if (rec) rec.mark("병동 침대 7상 완성");
  await zoneOf(page, r, "병동", null, opt);
}

/**
 * 체크리스트 6/6까지 **벽·문 포함**으로 짓는다. roster는 hireRoster와 같은 형태.
 *  · ward:true → 병동+침대(붉은 no-bed 경고 제거) — 소송·폐업 컷은 병동 없음이 레시피라 false.
 *  · cafeteria:true → 식당 영역(굶는 의사 경고 ④ 제거 — 판정은 CAFETERIA 영역의 존재 하나뿐).
 *  · showcase:{rec} → **첫 진료실 한 칸을 아주 천천히** 짓는다(건설 몽타주 컷). 그 방을 맨 먼저
 *    지어 빈 부지에서 시작하는 그림이 되게 한다 — 나머지는 빠르게.
 */
async function buildHospital(page, roster, { slow = false, ward = false, cafeteria = false, showcase = null } = {}) {
  const opt = slow ? { steps: 14, stepMs: 90 } : FAST;
  const rec = showcase;

  /** 진료실 한 칸 — 벽 → 문 → 책상 → 의자 → 용도. */
  const examRoom = async (r, dept, n, o, narrate) => {
    await wallsOf(page, r, o, narrate, `[${dept}] 진료실`);
    if (narrate) narrate.mark(`[${dept}] 벽 테두리 완성`);
    await doorsOf(page, r, narrate ? { approachMs: 700, holdMs: 400 } : {});
    if (narrate) narrate.mark(`[${dept}] 문 설치 (${r.doors.map((d) => d.join(",")).join(" / ")})`);
    const spots = deskSpots(r).slice(0, n);
    await pickTool(page, "책상");
    for (const [x, y] of spots) await dragTiles(page, [x, y], [x, y], o);
    await pickTool(page, "의자");
    for (const [x, y] of spots) await dragTiles(page, [x + 1, y], [x + 1, y], o);
    if (narrate) narrate.mark(`[${dept}] 책상·의자 ${n}쌍 배치`);
    await zoneOf(page, r, "진료실", dept, o, narrate, `[${dept}]`);
    if (narrate) narrate.mark(`[${dept}] 용도 칠 완료 — 방 하나 완성`);
  };

  // 몽타주면 진료실 한 칸을 **맨 먼저** 천천히 — 빈 부지에서 벽이 서는 그림이 이 컷의 전부다.
  let first = 0;
  if (rec && roster.length > 0) {
    rec.mark("건설 몽타주 시작 — 빈 부지");
    await examRoom(EXAM_ROOMS[0], roster[0][0], roster[0][1], SHOW, rec);
    first = 1;
  }

  // 대기실 — 벽 → 문 2개(정문 쪽·복도 쪽) → 의자 → 용도
  await wallsOf(page, ROOM.WAITING, opt);
  await doorsOf(page, ROOM.WAITING);
  await pickTool(page, "의자");
  await dragTiles(page, [19, 26], [29, 26], opt);
  await dragTiles(page, [19, 28], [29, 28], opt);
  await zoneOf(page, ROOM.WAITING, "대기실", null, opt);
  if (rec) rec.mark("대기실 완성 (벽·문·의자 22석)");

  // 접수처 — 카운터는 내부 한가운데(24,20). 위아래 빈칸이 간호사·환자 자리가 된다(cashierSlots).
  await wallsOf(page, ROOM.RECEPTION, opt);
  await doorsOf(page, ROOM.RECEPTION);
  await pickTool(page, "카운터");
  await dragTiles(page, [24, 20], [24, 20], opt);
  await zoneOf(page, ROOM.RECEPTION, "접수처", null, opt);
  if (rec) rec.mark("접수처 완성 (벽·문·카운터)");

  // 남은 진료실 — 과마다 방 하나, 의사마다 책상+의자 한 쌍
  for (let i = first; i < roster.length; i++) {
    const [dept, n] = roster[i];
    await examRoom(EXAM_ROOMS[i], dept, n, opt, null);
  }
  if (rec && roster.length > first) rec.mark(`나머지 진료실 ${roster.length - first}칸 완성`);

  if (ward) await buildWard(page, opt, rec, rec ? SHOW : null);
  if (cafeteria) {
    await wallsOf(page, ROOM.CAFETERIA, opt);
    await doorsOf(page, ROOM.CAFETERIA);
    await zoneOf(page, ROOM.CAFETERIA, "식당", null, opt);
    if (rec) rec.mark("식당 완성");
  }

  // 도구 내려놓기 — 든 채로 두면 영역 오버레이가 계속 켜져 있다. 뿌리까지 나오는 것이 요점이다:
  // 건설 계층에 남으면 화면 왼쪽에 도구 8줄이 그대로 서 있어 부감·개원 그림이 공사장으로 읽힌다.
  await goRoot(page);
  await page.waitForTimeout(200);
}

/** 체크리스트가 사라졌는가(= 6/6). 남아 있으면 무엇이 미완인지 던진다. */
async function assertReady(page) {
  const panel = page.getByLabel("개원 준비", { exact: true });
  if (await panel.count() > 0 && await panel.isVisible().catch(() => false)) {
    throw new Error("체크리스트 미완:\n" + (await panel.innerText()));
  }
}

/** 드래그 중 맵 위에 뜨는 미리보기 라벨(「N칸 — 용도 지정」 / 「N칸 · 금액」). */
async function previewLabelText(page) {
  const l = page.locator("span").filter({ hasText: /^\d+칸( · | — )/ });
  return (await l.count()) > 0 ? (await l.last().innerText()).trim() : "(없음)";
}

const setSpeed = (page, title) => page.locator(`[title="${title}"]`).click();
const home = (page) => page.locator('[title="부지 전체 보기"]').click();

/** 우상단 경고칩(alertsOf) — 0개여야 하는 컷이 있다(부감). */
const chipsOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("div.pointer-events-none.absolute.right-2 > span")].map((s) => s.textContent));

// ── 컷 시나리오 ────────────────────────────────────────────────────────────
const CUTS = {
  /**
   * **오프닝 한 판** — op1(지도) → op2(채용) → op3(건설 몽타주) → op4(개원) → ov(부감)를
   * **끊지 않고 한 판에서** 찍는다. 지시가 요구한 "서울 한 판처럼 보이는" 그림은 편집으로
   * 흉내 내는 것이 아니라 실제로 한 판이면 공짜로 얻어진다(op4·ov는 지시에도 「같은 판에서」).
   * 산출은 raw/op.webm 하나이고, 컷별 파일은 이 로그의 경과초로 잘라 만든다.
   *
   * 로스터가 4과 전원인 것은 **ov의 「경고칩 0개」가 그것을 요구하기 때문**이다(no-dept 칩은
   * 미용/외과 환자를 문 앞에서 돌려보내는 순간 뜬다 — cut3v2 주석 ⑤). 지시의 op2는 내과2·순환기1만
   * 말하지만, 그 셋으로 끝내면 같은 판의 ov가 원리적으로 실패한다.
   */
  async op(page, rec) {
    const roster = [["내과", 2], ["순환기내과", 1], ["미용·피부", 1], ["외과", 1]];

    // ── op1 — 지역 선택 지도 ────────────────────────────────────────────────
    await page.getByRole("dialog", { name: "지역 선택" }).waitFor();
    rec.mark("op1 시작 — 지역 선택 지도");
    await page.waitForTimeout(1000);
    const dot = page.getByRole("button", { name: "서울", exact: true });
    const go = btn(page, "여기에 짓는다");
    // 하이드레이션 전 클릭은 통째로 버려진다(옛 pickRegion 주석) — 카드가 열릴 때까지 다시 누른다.
    for (let i = 0; ; i++) {
      await glideClick(page, dot, i === 0 ? 1200 : 300);
      if (await go.count() > 0) break;
      if (i >= 12) throw new Error("지역 카드가 안 열린다: 서울");
      await page.waitForTimeout(600);
    }
    rec.mark(`op1 서울 클릭 — 우측 패널: ${(await page.getByRole("dialog", { name: "지역 선택" }).innerText()).replace(/\n/g, " | ").slice(0, 200)}`);
    await page.waitForTimeout(1700);
    // 배경 그림 추첨만 고정한다(INIT 주석 — react-dom의 내부 키 생성엔 손대지 않는다)
    await page.evaluate(() => { window.__realRandom = Math.random; Math.random = () => 0.1; });
    await glideClick(page, go, 900);
    await page.getByRole("dialog", { name: "개원 준비 — 전국 인력 시장" }).waitFor();
    await page.evaluate(() => { if (window.__realRandom) Math.random = window.__realRandom; });
    rec.mark("op1 끝 / op2 시작 — 로스터 게이트 오픈");

    // ── op2 — 채용 ─────────────────────────────────────────────────────────
    const dlg = page.getByRole("dialog", { name: "개원 준비 — 전국 인력 시장" });
    /* 과는 탭이다(hireRoster 머리말) — **탭을 누르는 손도 이 컷의 그림이다**: 옛 판에서는 네 과가
       한꺼번에 서 있어 "고른다"는 행위가 화면에 없었는데, 지금은 탭을 눌러 그 과의 선반이 펴지는
       것이 곧 그 행위다. 그래서 탭 클릭을 빠르게 넘기지 않고 glide로 보이게 누른다. */
    const tabText = async (d) => (await deptTab(dlg, d).innerText()).replace(/\n/g, " · ");
    await page.waitForTimeout(1200);

    // 내과 — 탭을 열고, 카드가 한 장씩 잔상으로 바뀌는 게 보이도록 간격을 크게
    await glideClick(page, deptTab(dlg, "내과"), 800);
    rec.mark(`op2 [내과] 탭 — ${await tabText("내과")}`);
    await page.waitForTimeout(800);
    for (let i = 0; i < 2; i++) {
      await glideClick(page, cardHire(dlg).first(), 750);
      rec.mark(`op2 내과 ${i + 1}명 채용 — ${await tabText("내과")}`);
      await page.waitForTimeout(950);
    }

    // 순환기내과 — 탭의 「잔여 2명」과 선반의 카드 두 장이 한 프레임에 든다 → 채용(2→1)
    await glideClick(page, deptTab(dlg, "순환기내과"), 800);
    rec.mark(`op2 순환기내과 탭 정지 — ${await tabText("순환기내과")} / 선반: ${(await dlg.getByText("이게 전부입니다").count()) > 0 ? "「이게 전부입니다」 표시" : "(없음)"}`);
    await page.waitForTimeout(1900);
    await glideClick(page, cardHire(dlg).first(), 600);
    rec.mark(`op2 순환기 1명 채용 — ${await tabText("순환기내과")}`);
    await page.waitForTimeout(1500);

    // 남은 두 과는 빠르게(ov의 경고칩 0개 조건 — 네 과가 다 있어야 no-dept가 안 뜬다)
    for (const dept of ["미용·피부", "외과"]) {
      await deptTab(dlg, dept).click();
      await page.waitForTimeout(200);
      await cardHire(dlg).first().click();
      await page.waitForTimeout(350);
    }
    rec.mark("op2 미용1·외과1 추가 채용 (ov 경고칩 0개 조건)");
    await glideClick(page, btn(page, "개원 준비 시작"), 700);
    await page.waitForTimeout(600);
    rec.mark("op2 개원 준비 시작 — 게이트 통과");

    // 평시 채용 패널 — 간호사. 간호 기준은 ⌈의사 5 ÷ 2⌉ = 3명이다.
    await openSection(page, "사람");
    await glideClick(page, btn(page, "채용"), 700);
    const hireDlg = page.getByRole("dialog", { name: "채용 — 전국 인력 시장" });
    await hireDlg.waitFor({ timeout: 10000 });
    rec.mark("op2 평시 채용 패널 오픈 (사람 > 채용)");
    await page.waitForTimeout(900);
    const nurseBtn = hireDlg.getByRole("button", { name: "채용", exact: true });
    for (let i = 0; i < 3; i++) {
      await glideClick(page, nurseBtn, i < 2 ? 700 : 250);
      rec.mark(`op2 간호사 ${i + 1}명 채용 — ${(await hireDlg.getByText(/현재 \d+명 · 기준 \d+명/).first().innerText()).trim()}`);
      await page.waitForTimeout(i < 2 ? 900 : 250);
    }
    await btn(page, "닫기").click();
    await page.waitForTimeout(400);
    rec.mark("op2 끝 — 채용 패널 닫음");

    // ── op3 — 건설 몽타주 ───────────────────────────────────────────────────
    await buildHospital(page, roster, { ward: true, cafeteria: true, showcase: rec });
    await assertReady(page);
    rec.mark("op3 끝 — 6/6 개원 준비 완료 (벽·문 포함 · 병동 · 식당)");
    await page.waitForTimeout(1200);

    // ── op4 — 개원 ─────────────────────────────────────────────────────────
    // 정문 쪽으로 살짝 줌인해 환자가 문으로 들어오는 게 보이게 한다(휠 = zoomedCamera).
    const r0 = await mapRect(page);
    const gate = tileXY(r0, 24, 28); // 정문 바로 안쪽 — 문과 대기실이 한 프레임에 든다
    await glide(page, gate.x, gate.y, 700);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(140); }
    await page.waitForTimeout(600);
    await setSpeed(page, "보통 속도");
    const t4 = rec.mark("op4 시작 — 1× 개원 (정문 줌인)");
    await page.waitForTimeout(16000);
    rec.mark(`op4 끝 — 16초 실속도 · HUD: ${(await hud(page)).text}`);

    // ── ov — 부감 ──────────────────────────────────────────────────────────
    await home(page);
    await setSpeed(page, "3배속");
    /* ⚠️ 지시는 「2일차 낮」이었는데 **1일차 11:00**으로 옮겼다 — 지시가 준 폴백("뜨면 시간대를
       앞뒤로 옮겨 재시도 · 1일차 오후가 안전할 수 있다") 그대로다. 실측(2026-08-03 1차 촬영):
       2일차 13:08에는 칩 0개인데 **13:17에 「피로 위험 의사 1명」이 떠서** 18초 구간의 중간·끝
       프레임이 요구를 못 지켰다. 피로는 누적이라 하루치가 덜 쌓인 1일차 낮이 구조적으로 안전하다
       (헤드리스 정찰: 1일차 12:05 칩 0개). 18초 구간은 11:00~12:20을 덮어 그 검증 구간 안이다. */
    rec.mark("ov 빨리감기 시작 — 1일차 11:00까지");
    await runUntil(page, (h) => h.week === 1 && h.day === 1 && h.minute >= 120, { ffwd: true, timeoutMs: 600000 });
    await home(page);
    await page.waitForTimeout(1200);
    const chips = [];
    const shot = async (tag) => {
      const c = await chipsOf(page);
      chips.push(c);
      rec.mark(`ov 경고칩[${tag}] ${c.length}개${c.length ? ": " + c.join(" / ") : " (0개 — 요구 충족)"}`);
    };
    const tov = rec.mark(`ov 실속도 3× 부감 시작 — HUD: ${(await hud(page)).text}`);
    await shot("시작");
    await page.waitForTimeout(9000);
    await shot("중간");
    await page.waitForTimeout(9000);
    await shot("끝");
    rec.mark(`ov 끝 — HUD: ${(await hud(page)).text}`);
    return { op4: t4, ov: tov, chips };
  },

  /** 정찰 — 녹화 없이(HS_NOREC=1) 벽 세트가 실제로 도는지만 본다.
   *  판정: ① 체크리스트 6/6 ② **진료 건수 > 0**(= 환자가 문을 지나 진료실에 실제로 들어갔다 —
   *  sealed room이면 여기가 0으로 굳는다) ③ 2일차 낮의 경고칩. */
  async probe(page, rec) {
    const roster = [["내과", 2], ["순환기내과", 1], ["미용·피부", 1], ["외과", 1]];
    await pickRegion(page, "서울");
    await hireRoster(page, roster, 3);
    await buildHospital(page, roster, { ward: true, cafeteria: true });
    const panel = page.getByLabel("개원 준비", { exact: true });
    const left = await panel.count() > 0 && await panel.isVisible().catch(() => false)
      ? (await panel.innerText()).replace(/\n/g, " / ") : "(없음 = 6/6)";
    rec.mark(`체크리스트 잔여: ${left}`);
    await setSpeed(page, "3배속");
    await runUntil(page, (h) => h.week === 1 && h.day === 1 && h.minute >= 180, { ffwd: true, timeoutMs: 300000 });
    rec.mark(`1일차 12:00 — ${(await hud(page)).text}`);
    rec.mark(`칩: ${JSON.stringify(await chipsOf(page))}`);
    await runUntil(page, (h) => h.week === 1 && h.day === 2 && h.minute >= 240, { ffwd: true, timeoutMs: 600000 });
    rec.mark(`2일차 13:00 — ${(await hud(page)).text}`);
    rec.mark(`칩: ${JSON.stringify(await chipsOf(page))}`);
    return {};
  },

  /**
   * nb — Vercel 속보 + 「AI 서사」 배지 **확대판**(옛 cut4 대체).
   * 배지가 작고 흐리다는 지적(⑤)에 대해, 카드가 뜬 상태에서 `body.style.zoom`을 올려 담는다.
   * 속보 카드가 떠 있는 동안 게임은 정지 상태라 배율은 판정에 닿지 않는다(cut7b_zoom과 같은 근거).
   */
  async nb(page, rec) {
    const roster = [["내과", 2], ["미용·피부", 1]];
    await pickRegion(page, "서울");
    await hireRoster(page, roster, 2);
    await buildHospital(page, roster, { ward: true });
    await assertReady(page);
    rec.mark("6/6 개원 준비 완료 (서울 · 벽·문 포함 · 병동)");

    await setSpeed(page, "3배속");
    rec.mark("3× 개원");
    await runUntil(page, async (_h, p) => (await p.getByRole("dialog", { name: "1주 2일차 마감" }).count()) > 0,
      { ffwd: true, timeoutMs: 300000 });
    rec.mark("2일차 마감 모달 — 여기서부터 실속도");

    const w0 = Date.now();
    let badge = "기본 서사";
    for (;;) {
      badge = (await hud(page)).text.includes("AI 서사") ? "AI 서사" : "기본 서사";
      const el = Date.now() - w0;
      if (badge === "AI 서사" && el >= 12000) break;
      if (el >= 22000) break;
      await page.waitForTimeout(400);
    }
    rec.mark(`배지 = 「${badge}」 (마감 모달에서 ${((Date.now() - w0) / 1000).toFixed(1)}초 대기)`);
    await page.waitForTimeout(1800);

    await btn(page, "다음 날").first().click();
    rec.mark("[다음 날] — 실속도");
    const card = page.getByRole("dialog", { name: /1주 3일차$/ });
    await card.waitFor({ timeout: 40000 });
    const label = await card.getAttribute("aria-label");
    const body = (await card.innerText()).replace(/\n/g, " | ");
    rec.mark(`속보 카드 등장: ${label}`);
    rec.mark(`카드 본문: ${body}`);
    const badgeEl = page.locator("header span").filter({ hasText: /^(AI 서사|기본 서사)$/ }).first();
    rec.mark(`카드 등장 시점 배지 = 「${(await badgeEl.innerText().catch(() => "?")).trim()}」`);
    await page.waitForTimeout(3200);
    rec.mark("원본 배율 3초 응시 끝");

    // 확대 — 배지가 뷰포트를 벗어나면 배율을 낮춘다(지시: 1.6 → 안 되면 1.3).
    let used = 0;
    for (const z of [1.6, 1.3, 1.15]) {
      await page.evaluate((v) => { document.body.style.zoom = String(v); }, z);
      await page.waitForTimeout(500);
      const bb = await badgeEl.boundingBox().catch(() => null);
      const cb = await card.boundingBox().catch(() => null);
      const fits = bb && cb && bb.x + bb.width <= 1920 && bb.y + bb.height <= 1080 && cb.x >= 0 && cb.y >= 0;
      rec.mark(`zoom ${z} — 배지 박스 ${bb ? `${Math.round(bb.x)},${Math.round(bb.y)} ${Math.round(bb.width)}×${Math.round(bb.height)}` : "없음"} · 카드 ${cb ? `${Math.round(cb.x)},${Math.round(cb.y)}` : "없음"} · ${fits ? "화면 안" : "화면 밖"}`);
      if (fits) { used = z; break; }
    }
    if (!used) { await page.evaluate(() => { document.body.style.zoom = "1.3"; }); used = 1.3; }
    const tz = rec.mark(`zoom ${used} 적용 — 여기서 2초`);
    await page.waitForTimeout(2600);
    rec.mark("확대 응시 끝");
    return { badge, label, body, zoom: used, tz };
  },

  /**
   * ta — 응급 회차(옛 cut5 대체). 정읍 · 벽 포함 · 미용1·내과2(순환기·외과 없음) · 병동 있음.
   * 벽·문이 생겨 동선이 길어졌으므로 첫 회차 시각은 옛 09:37과 달라질 수 있다 — **실측해 로그**한다.
   */
  async ta(page, rec) {
    const roster = [["미용·피부", 1], ["내과", 2]];
    await pickRegion(page, "전북 정읍시");
    await hireRoster(page, roster, 2);
    await buildHospital(page, roster, { ward: true });
    await assertReady(page);
    rec.mark("6/6 개원 준비 완료 (정읍 · 벽·문 · 미용1·내과2 · 병동)");

    await home(page);
    await setSpeed(page, "3배속");
    rec.mark("3× 개원 — 실속도 관측 시작");
    await page.waitForTimeout(5200); // 회차 **전** 5초를 실속도로 확보
    let firstAt = null, firstHud = null;
    const deadline = Date.now() + 200000;
    for (;;) {
      const h = await hud(page);
      if (h.turnedAway > 0) {
        firstAt = rec.mark(`첫 응급 회차 발생 — ${h.text}`);
        firstHud = h;
        break;
      }
      if (Date.now() > deadline) break;
      await pump(page);
      await page.waitForTimeout(80);
    }
    if (firstAt === null) throw new Error("첫 응급 회차를 못 잡았다");
    const line = await page.locator("aside p").last().innerText().catch(() => "");
    rec.mark(`상태줄: ${line.replace(/\n/g, " | ")}`);
    await page.waitForTimeout(6500);
    rec.mark("회차 후 6.5초 실속도 종료");
    return { hold: firstAt, note: `첫 회차 ${firstHud.week}주 ${firstHud.day}일 (개원 09:00 기준 +${firstHud.minute}분)` };
  },

  // 콜드오픈 — 빈 부지 부감 → 대기실을 천천히 드래그
  async cut1(page, rec) {
    await pickRegion(page, "전북 정읍시");
    await hireRoster(page, [["내과", 2], ["미용·피부", 1]], 2);
    rec.mark("로스터 게이트 통과");
    /* ⚠️ 지시와 다른 지점 — cut1은 `buildHospital`을 부르지 않는 컷이라(콜드오픈의 전부가
       "빈 부지에 첫 대기실을 그린다"), 거기에 병동을 넣어도 이 컷에는 닿지 않는다. 붉은
       no-bed 경고를 지우려면 **부감 전에** 병상을 놓는 수밖에 없어 여기서 먼저 짓는다 —
       그 대가로 부지가 문자 그대로 비어 있지는 않다(오른쪽 아래에 병동 한 칸). 완전히 빈
       부지 버전은 `raw/cut1_old.webm`으로 보존된다. */
    await buildWard(page, { steps: 6, stepMs: 15 });
    await page.keyboard.press("Escape");
    rec.mark("병동 선건설 (붉은 no-bed 경고 제거)");
    await home(page);
    rec.mark("부지 부감");
    await page.waitForTimeout(2500);

    await pickZone(page, "대기실");
    rec.mark("용도 → 대기실 무장");
    await page.waitForTimeout(400);
    rec.mark("대기실 드래그 시작");
    // 미리보기 라벨이 읽히도록 아주 천천히 — 손을 떼기 직전 라벨을 실제로 읽어 기록한다
    let label1 = "";
    await dragTiles(page, [16, 23], [32, 29], {
      steps: 26, stepMs: 95, holdMs: 900,
      onHold: async () => { label1 = await previewLabelText(page); rec.mark(`미리보기 라벨: ${label1}`); },
    });
    rec.mark("대기실 완성");
    await page.waitForTimeout(1200);

    await pickTool(page, "의자");
    rec.mark("의자 드래그 시작");
    let label2 = "";
    await dragTiles(page, [19, 25], [29, 25], {
      steps: 18, stepMs: 90, holdMs: 900,
      onHold: async () => { label2 = await previewLabelText(page); rec.mark(`미리보기 라벨: ${label2}`); },
    });
    rec.mark("의자 완성");
    await page.waitForTimeout(1500);
    return { labels: [label1, label2] };
  },

  // 채용 패널 — 서울(URBAN)에서 순환기내과 잔여 2명
  async cut2(page, rec) {
    await pickRegion(page, "서울");
    rec.mark("로스터 게이트 오픈");
    const dlg = page.getByRole("dialog", { name: "개원 준비 — 전국 인력 시장" });
    await page.mouse.move(960, 540);
    await page.waitForTimeout(2000);

    // 위에서 아래로 천천히 훑는다(모달 자체가 스크롤 컨테이너 — 1421 > 1080)
    rec.mark("패널 스크롤 시작 (아래로)");
    for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 25); await page.waitForTimeout(230); }
    rec.mark("바닥 — 미용 명단 끝");
    await page.waitForTimeout(1600);
    // 다시 위로 — 순환기내과는 맨 윗줄 오른쪽 칸이라 여기서 프레임에 든다
    rec.mark("위로 되돌림");
    for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, -25); await page.waitForTimeout(200); }
    await page.waitForTimeout(400);

    // 과가 탭이 된 뒤로는 「보이는 곳까지 스크롤」이 아니라 **탭을 눌러 그 선반을 편다**.
    await deptTab(dlg, "순환기내과").click();
    await page.waitForTimeout(300);
    const t = rec.mark("순환기내과 탭 정지 (잔여 2명 · 후보 2장 · 이게 전부입니다)");
    console.log("   탭 텍스트:", (await deptTab(dlg, "순환기내과").innerText()).replace(/\n/g, " | "));
    await page.mouse.move(1284, 320); // 순환기 칸 위에 커서를 둔다
    await page.waitForTimeout(4000);
    rec.mark("정지 끝");
    await page.waitForTimeout(1500);
    return { hold: t };
  },

  // 3× 부감 — 2일차 낮, 환자들이 걸어 다니는 화면
  async cut3(page, rec) {
    await pickRegion(page, "전북 정읍시");
    await hireRoster(page, [["내과", 2], ["미용·피부", 1]], 2);
    await buildHospital(page, [["내과", 2], ["미용·피부", 1]], { ward: true });
    await assertReady(page);
    rec.mark("6/6 개원 준비 완료 (병동 포함)");

    await setSpeed(page, "3배속");
    rec.mark("3× 개원");
    // 빨리감기로 2일차 240분(13:00)까지
    await runUntil(page, (h) => h.week === 1 && h.day === 2 && h.minute >= 240, { ffwd: true });
    rec.mark("2일차 13:00 도달 (빨리감기 종료)");
    await home(page);
    await page.waitForTimeout(1200);
    const t = rec.mark("실속도 3× 부감 시작");
    await page.waitForTimeout(18000);
    rec.mark("부감 끝");
    return { hold: t };
  },

  // 응급 회차 — 순환기·외과 없이 굴려 첫 회차를 잡는다
  async cut5(page, rec) {
    await pickRegion(page, "전북 정읍시");
    await hireRoster(page, [["내과", 2], ["미용·피부", 1]], 2);
    await buildHospital(page, [["내과", 2], ["미용·피부", 1]], { ward: true });
    await assertReady(page);
    rec.mark("6/6 개원 준비 완료 (순환기·외과 없음 · 병동 있음)");

    await home(page);
    await setSpeed(page, "3배속");
    rec.mark("3× 개원 — 실속도 관측 시작");
    await page.waitForTimeout(5200); // 회차 **전** 5초를 실속도로 확보
    let firstAt = null, firstHud = null;
    const deadline = Date.now() + 200000;
    for (;;) {
      const h = await hud(page);
      if (h.turnedAway > 0) {
        firstAt = rec.mark(`첫 응급 회차 발생 — ${h.text}`);
        firstHud = h;
        break;
      }
      if (Date.now() > deadline) break;
      await pump(page);
      await page.waitForTimeout(80);
    }
    if (firstAt === null) throw new Error("첫 응급 회차를 못 잡았다");
    console.log("   상태줄:", await page.locator("aside p").last().innerText().catch(() => ""));
    await page.waitForTimeout(6500);
    rec.mark("회차 후 6.5초 실속도 종료");
    return { hold: firstAt, note: `첫 회차 게임시각 ${firstHud.week}주 ${firstHud.day}일 ${firstHud.minute}분` };
  },

  // 첫 속보 + 「AI 서사」 배지 — Vercel(런타임 LLM 프록시가 있는 배포본)에서만 의미가 있다.
  // 2일차 마감 모달이 떠 있는 동안 클라이언트가 내일 이벤트를 미리 물어보고, 성공하면 배지가 바뀐다.
  async cut4(page, rec) {
    const roster = [["내과", 2], ["미용·피부", 1]];
    await pickRegion(page, "서울");
    await hireRoster(page, roster, 2);
    await buildHospital(page, roster, { ward: true });
    await assertReady(page);
    rec.mark("6/6 개원 준비 완료 (서울 · 병동 포함)");

    await setSpeed(page, "3배속");
    rec.mark("3× 개원");
    // 1일차 마감은 pump가 넘긴다. 2일차 마감 모달에서 멈춘다(pred가 pump보다 먼저 본다).
    await runUntil(page, async (_h, p) => (await p.getByRole("dialog", { name: "1주 2일차 마감" }).count()) > 0,
      { ffwd: true, timeoutMs: 240000 });
    rec.mark("2일차 마감 모달 — 여기서부터 실속도");

    // 배지가 「AI 서사」로 바뀔 때까지 지켜본다(왕복 10초까지 · 최소 12초는 무조건 기다린다).
    const w0 = Date.now();
    let badge = "기본 서사";
    for (;;) {
      badge = (await hud(page)).text.includes("AI 서사") ? "AI 서사" : "기본 서사";
      const el = Date.now() - w0;
      if (badge === "AI 서사" && el >= 12000) break;
      if (el >= 22000) break;
      await page.waitForTimeout(400);
    }
    rec.mark(`배지 = 「${badge}」 (마감 모달에서 ${((Date.now() - w0) / 1000).toFixed(1)}초 대기)`);
    await page.waitForTimeout(1800);

    await btn(page, "다음 날").first().click();
    rec.mark("[다음 날] — 실속도");
    const card = page.getByRole("dialog", { name: /1주 3일차$/ });
    await card.waitFor({ timeout: 40000 });
    const label = await card.getAttribute("aria-label");
    const body = (await card.innerText()).replace(/\n/g, " | ");
    rec.mark(`속보 카드 등장: ${label}`);
    rec.mark(`카드 본문: ${body}`);
    rec.mark(`카드 등장 시점 배지 = 「${(await hud(page)).text.includes("AI 서사") ? "AI 서사" : "기본 서사"}」`);
    await page.waitForTimeout(7000);
    rec.mark("카드 응시 끝");
    return { badge, label, body };
  },

  // 소송 + 위축 고지 — 병동 없이 11주를 굴려 회차를 쌓고, 12주 1일에 외과를 뽑는다.
  cut6: (page, rec) => lawsuit(page, rec, [["미용·피부", 1], ["내과", 2]], ["미용·피부"]),
  // 대안 조합 — 셋 다 미용(전원 가동 · 흑자 유지). 위 조합이 12주 전에 폐업하면 이쪽.
  cut6b: (page, rec) => lawsuit(page, rec, [["미용·피부", 3]], ["미용·피부"]),

  /**
   * 엔딩 「폐업」 — **진료실을 하나도 짓지 않는다**. 수익이 구조적으로 0이라 주간 손실이
   * 주급+간호+임대의 합으로 고정되고, 폐업 주차가 산수로 결정된다.
   *
   * ⚠️ 지시가 준 레시피(정읍 · 미용1·내과1·순환기1 · 병동 없음 → 7주차 INSOLVENCY 금고 −8,925)는
   * **헤드리스 프로브(Q3b)의 병원**에서 잰 값이고, 이 하네스가 UI로 짓는 병원에서는 재현되지
   * 않는다 — 정찰 실측(녹화 없이 9주): 금고가 4.9억 → 2.8억으로 **주 1,000만원씩만** 줄어
   * 12주 안에 음수가 되지 않았다. 2주차까지는 7~8,000만원씩 타다가 3주차부터 급감하는데,
   * 그 꺾임이 곧 필수과 의사의 포화·사직이다(주급이 함께 사라진다). 프로브의 병원은 벽·문까지
   * 세운 다른 배치라 포화 곡선이 다르다.
   * → 그래서 **사직이 끼어들 수 없는 판**으로 바꾼다: 진료실이 없으면 의사는 일하지 않으므로
   *   포화도 사직도 없고(프로브 ⑤⑥의 「놀고 있는 필수과 의사는 안 갈린다」와 같은 자리),
   *   금고는 정확히 주급만큼만 준다.
   *   내과2(3,000) + 외과1(4,500) + 간호 2명(600) + 정읍 임대(300) = **주 8,400만원** →
   *   5억이 6주차에 음수, 7주차에 두 번째 음수 = **7주차 폐업**(지시의 주차와 같다).
   */
  async cut7c(page, rec) {
    await pickRegion(page, "전북 정읍시");
    await hireRoster(page, [["내과", 2], ["외과", 1]], 2);
    await buildHospital(page, []); // 대기실·의자·접수처·카운터만 — 진료실도 병동도 없다
    rec.mark("개원 — 정읍 · 내과2·외과1 · 진료실 없음 · 병동 없음 (주 8,400만원 적자 고정)");

    await setSpeed(page, "3배속");
    rec.mark("3× 개원");
    // 몇 주차에 닫히든 **폐업한 결산**에서 멈춘다 — 주차를 문자로 박으면 산수가 한 주만 밀려도 죽는다.
    const closedDlg = page.getByRole("dialog", { name: /주차 결산$/ });
    await runUntil(page, async () => {
      if (await closedDlg.count() === 0) return false;
      return (await closedDlg.innerText()).includes("새로고침하면 다시 개원합니다");
    }, { ffwd: true, timeoutMs: 1_800_000 });
    const dlg = closedDlg;
    rec.mark(`폐업 결산 모달 등장 — ${await dlg.getAttribute("aria-label")} · 실속도`);
    await page.waitForTimeout(3000);
    rec.mark("적자 표 응시");
    await page.mouse.move(960, 540);
    for (let i = 0; i < 7; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(300); }
    rec.mark("에필로그까지 스크롤");
    await page.waitForTimeout(6000);
    const text = (await dlg.innerText()).replace(/\n/g, " | ");
    const nextWeek = await btn(page, "다음 주").count();
    rec.mark(`[다음 주] 버튼 ${nextWeek}개 · 「새로고침」 문구 ${text.includes("새로고침하면 다시 개원합니다") ? "있음" : "없음"}`);
    rec.mark(`결산 텍스트: ${text}`);
    await page.waitForTimeout(2500);
    return { text, nextWeek };
  },

  /**
   * 부감 v2 — **우상단 경고칩이 0개**인 화면이 검증 기준인 시각 완성도 컷.
   *
   * `alertsOf`가 낼 수 있는 칩은 여섯 종류다. 하나라도 남으면 실패이므로 전부 막는다:
   *   ① setup(첫 미완 단계)     → 체크리스트 6/6
   *   ② no-bed(병상 0)         → 병동 + 침대
   *   ③ fatigue-risk(피로 레드) → 2일차엔 안 뜬다
   *   ④ starving(굶는 의사)     → **식당 영역**(판정은 CAFETERIA 영역의 존재 하나뿐이다)
   *   ⑤ no-dept(접수처 반려)    → **네 과를 전부 채운다** ← 지시받은 로스터의 구멍이 여기였다
   *   ⑥ unpaid(미수)           → 개원 전에 카운터·접수처·간호사를 다 갖춘다
   *
   * ⚠️ 지시와 다른 지점: 로스터에 **미용·피부 1명을 더한다**. 지시안(내과2·외과1·순환기1)은
   * 미용이 비어 있어, 미용 환자가 문 앞에서 처음 돌아가는 순간 ⑤가 뜬다(`leftNoDept > 0`).
   * 서울(URBAN)은 deptMix가 네 과에 고르게 퍼져 있어 그 일은 1일차에 반드시 일어난다 — 즉
   * 지시안으로는 「칩 0개」가 원리적으로 불가능하다. 지금 cut3에 떠 있는 그 칩이 바로 ⑤다.
   */
  async cut3v2(page, rec) {
    const roster = [["미용·피부", 1], ["내과", 2], ["외과", 1], ["순환기내과", 1]];
    await pickRegion(page, "서울");
    await hireRoster(page, roster, 3); // 간호 기준 ⌈5/2⌉ = 3
    await buildHospital(page, roster, { ward: true });
    // 식당 — 영역만 있으면 ④가 안 뜬다(가구 판정이 없다). 진료실 줄 아래 빈 왼쪽에 놓는다.
    await pickZone(page, "식당");
    await dragTiles(page, [4, 23], [14, 29], { steps: 6, stepMs: 15 });
    await goRoot(page);
    await page.waitForTimeout(200);
    await assertReady(page);
    rec.mark("6/6 개원 완료 — 서울 · 4과 전원(미용1·내과2·외과1·순환기1) · 병동 · 식당");

    await setSpeed(page, "3배속");
    rec.mark("3× 개원");
    await runUntil(page, (h) => h.week === 1 && h.day === 2 && h.minute >= 240, { ffwd: true, timeoutMs: 600000 });
    rec.mark("2일차 13:00 도달 (빨리감기 종료)");
    await home(page);
    await page.waitForTimeout(1200);

    const chips = await page.evaluate(() =>
      [...document.querySelectorAll("div.pointer-events-none.absolute.right-2 > span")].map((s) => s.textContent));
    rec.mark(`경고칩 ${chips.length}개${chips.length ? ": " + chips.join(" / ") : " (요구 조건 충족)"}`);
    rec.mark(`HUD: ${(await hud(page)).text}`);

    const t = rec.mark("실속도 3× 부감 시작");
    await page.waitForTimeout(18000);
    rec.mark("부감 끝");
    return { hold: t, chips };
  },

  /**
   * 엔딩 「폐업」 v2 — **비싼 과를 잔뜩 뽑아 주급으로 태운다**(코디네이터 지시 2026-08-03).
   *
   * 산수: 순환기 8,000×2 + 외과 4,500×3 + 내과 1,500×2 = 32,500 · 간호 4명 1,200 · 서울 임대 1,200
   *      → **주 34,900만원**. 5억은 1주말에 ~1.5억, 2주말에 음수(1회), 3주말에 음수(2회) =
   *      **3주차 결산에서 INSOLVENCY**. 진료 수익이 얼마가 나오든 이 규모를 못 메운다.
   * v1(진료실을 아예 안 짓는 판)과 달리 **체크리스트 6/6인 멀쩡한 병원**이다 — 「필수과를 다
   * 갖췄더니 주급으로 망했다」가 이 컷의 논지라 화면이 더 정직하다. 병동만 없다.
   */
  async cut7cv2(page, rec) {
    const roster = [["순환기내과", 2], ["외과", 3], ["내과", 2]];
    await pickRegion(page, "서울");
    await hireRoster(page, roster, 4); // 간호 기준 ⌈7/2⌉ = 4명
    await buildHospital(page, roster); // 병동 없음
    await assertReady(page);
    rec.mark("6/6 개원 완료 — 서울 · 순환기2·외과3·내과2 · 간호4 (주급 합계 3.25억)");

    await setSpeed(page, "3배속");
    rec.mark("3× 개원");
    const dlg = page.getByRole("dialog", { name: /주차 결산$/ });
    let last = 0;
    await runUntil(page, async (h) => {
      if (h.week > last) { last = h.week; rec.mark(`${h.week}주 진입 — ${h.text}`); }
      if (await dlg.count() === 0) return false;
      return (await dlg.innerText()).includes("새로고침하면 다시 개원합니다");
    }, { ffwd: true, timeoutMs: 2_400_000 });
    rec.mark(`폐업 결산 모달 — ${await dlg.getAttribute("aria-label")} · 여기서부터 실속도`);

    await page.waitForTimeout(3000);
    rec.mark("적자 표 응시");
    await page.mouse.move(960, 540);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(280); }
    rec.mark("에필로그까지 스크롤");
    await page.waitForTimeout(8500);
    const text = (await dlg.innerText()).replace(/\n/g, " | ");
    const nextWeek = await btn(page, "다음 주").count();
    rec.mark(`[다음 주] 버튼 ${nextWeek}개 · 「새로고침」 문구 ${text.includes("새로고침하면 다시 개원합니다") ? "있음" : "없음"}`);
    rec.mark(`결산·에필로그 텍스트: ${text}`);
    await page.waitForTimeout(2500);
    return { text, nextWeek };
  },

  /**
   * 주간 결산 표 **확대판** — cut7b와 같은 판(서울 미용1·순환기1·내과1)인데, 모달이 뜬 뒤
   * `body.style.zoom`을 올려 표 숫자가 1080p에서 크게 읽히게 한다. 결산 모달이 떠 있는 동안은
   * 게임이 정지 상태라(화면의 `paused` 파생) 배율을 바꿔도 판정에 닿지 않는다 — 맵조차 안 보이는
   * 화면이라 T-101(팔레트 폭 → 맵 배율) 같은 전파 경로도 없다.
   */
  async cut7b_zoom(page, rec) {
    const roster = [["미용·피부", 1], ["순환기내과", 1], ["내과", 1]];
    await pickRegion(page, "서울");
    await hireRoster(page, roster, 2);
    await buildHospital(page, roster);
    await assertReady(page);
    rec.mark("6/6 개원 완료 (미용1·순환기1·내과1)");

    await setSpeed(page, "3배속");
    rec.mark("3× 개원");
    const dlg = page.getByRole("dialog", { name: "1주차 결산" });
    await runUntil(page, async () => (await dlg.count()) > 0, { ffwd: true, timeoutMs: 600000 });
    rec.mark("1주차 결산 모달 등장");
    await page.waitForTimeout(800);

    const zoom = Number(process.env.HS_ZOOM ?? "1.7");
    await page.evaluate((z) => { document.body.style.zoom = String(z); }, zoom);
    await page.waitForTimeout(700);
    rec.mark(`zoom ${zoom} 적용`);

    await page.mouse.move(960, 540);
    rec.mark("순이익 응시");
    await page.waitForTimeout(2600);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 70); await page.waitForTimeout(260); }
    rec.mark("7일 표");
    await page.waitForTimeout(2600);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 70); await page.waitForTimeout(260); }
    rec.mark("과별 표 (미용 흑자 · 순환기 적자)");
    await page.waitForTimeout(2800);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 70); await page.waitForTimeout(260); }
    rec.mark("합계·통지");
    await page.waitForTimeout(2600);
    rec.mark(`결산 텍스트: ${(await dlg.innerText()).replace(/\n/g, " | ")}`);
    return {};
  },

  /* 정찰 — 녹화 없이(HS_NOREC=1) 판만 굴려 주차별 금고를 찍는다. 레시피가 **UI 빌드에서도**
     성립하는지 12분짜리 녹화를 태우기 전에 확인하는 자리다(헤드리스 프로브의 병원은 벽·문까지
     세운 다른 병원이라 금고 곡선이 그대로 옮겨오지 않는다 — 실측으로 갈렸다). */
  async scout(page, rec) {
    const spec = JSON.parse(process.env.HS_SCOUT ?? '{"region":"전북 정읍시","roster":[["미용·피부",1],["내과",1],["순환기내과",1]],"weeks":9,"ward":false}');
    await pickRegion(page, spec.region);
    await hireRoster(page, spec.roster, 2);
    await buildHospital(page, spec.roster, { ward: spec.ward });
    rec.mark(`정찰 개원 — ${spec.region} · ${spec.roster.map(([d, n]) => `${d}${n}`).join("·")} · 병동 ${spec.ward ? "있음" : "없음"}`);
    await setSpeed(page, "3배속");
    let last = 0;
    await runUntil(page, async (h, p) => {
      if (h.week > last) { last = h.week; rec.mark(`${h.week}주 진입 — ${h.text}`); }
      if (await p.getByRole("dialog", { name: /주차 결산$/ }).count() > 0) {
        const d = page.getByRole("dialog", { name: /주차 결산$/ });
        const closed = (await d.innerText()).includes("새로고침하면 다시 개원합니다");
        if (closed) { rec.mark(`폐업! ${await d.getAttribute("aria-label")}`); return true; }
      }
      return h.week >= spec.weeks;
    }, { ffwd: true, timeoutMs: 2_400_000 });
    rec.mark(`정찰 종료 — ${(await hud(page)).text}`);
    return {};
  },

  // 타이틀 카드 PNG — 게임이 아니라 정적 HTML 한 장(메인이 따로 처리한다)
  async cut8() { throw new Error("cut8은 title.mjs가 만든다"); },

  // 주간 결산 표 — 미용1 · 순환기1 · 내과1
  cut7a: (page, rec) => week1(page, rec, "전북 정읍시"),
  /* cut7a의 **서울판**. 정읍(PROVINCIAL)은 카탈로그가 미용 수요를 5%로 눌러 놓아
     (world.REGIONS.PROVINCIAL.deptMix — *"흑자 엔진이 없는 도시"*) 미용이 구조적으로 적자다.
     지시가 요구한 「미용 흑자 / 순환기 적자」 병치는 deptMix가 균등한 URBAN에서만 성립한다. */
  cut7b: (page, rec) => week1(page, rec, "서울"),
};

async function week1(page, rec, region) {
    const roster = [["미용·피부", 1], ["순환기내과", 1], ["내과", 1]];
    await pickRegion(page, region);
    await hireRoster(page, roster, 2);
    await buildHospital(page, roster);
    await assertReady(page);
    rec.mark("6/6 개원 준비 완료 (미용1·순환기1·내과1)");

    await setSpeed(page, "3배속");
    rec.mark("3× 개원");
    // 빨리감기로 7일차 마감 → 주간 결산 모달까지(결산 모달은 pump가 안 닫게 먼저 잡는다)
    await runUntil(
      page,
      async (h, p) => (await p.getByRole("dialog", { name: "1주차 결산" }).count()) > 0,
      { ffwd: true, timeoutMs: 240000 },
    );
    const t = rec.mark("주간 결산 모달 등장");
    const dlg = page.getByRole("dialog", { name: "1주차 결산" });
    await page.waitForTimeout(2600);
    rec.mark("순이익 응시");

    // 표 두 개를 차례로 — 모달 컨테이너를 천천히 스크롤
    await page.mouse.move(960, 540);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 55); await page.waitForTimeout(280); }
    const t7 = rec.mark("7일 표");
    await page.waitForTimeout(2600);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 55); await page.waitForTimeout(280); }
    const td = rec.mark("과별 표 (순환기 순익 음수)");
    await page.waitForTimeout(3000);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 55); await page.waitForTimeout(280); }
    rec.mark("합계·통지");
    await page.waitForTimeout(2600);
    console.log("   결산 텍스트:", (await dlg.innerText()).replace(/\n/g, " | "));
    return { hold: t, marks: { net: t, week: t7, dept: td } };
}

/**
 * 소송 컷 — 서울 · **병동 없음**(응급을 전부 되돌려 회차를 쌓는다) · 11주 마르게 진행 →
 * 12주 1일 아침에 외과 「배준영」 채용 → 12주 3일 속보에 「의료소송」과 위축 고지 2줄.
 *
 * `roster`는 뽑는 의사, `roomDepts`는 그중 **진료실을 지어 줄** 과다(나머지는 방 없이 논다).
 * 로스터 게이트가 의사 3명을 요구하는데 헤드리스 레시피는 미용 하나로 말랐던 판이라, 그 차이를
 * 어디서 흡수하느냐가 조합이다. 외과 진료실은 **비워 둔 채** 미리 짓는다 — 12주에 뽑은 사람이
 * 그날로 앉아야 소송·위축이 그 사람 이름으로 뜬다.
 */
async function lawsuit(page, rec, roster, roomDepts) {
  await pickRegion(page, "서울");
  await hireRoster(page, roster, 2);
  const rooms = roster.filter(([d]) => roomDepts.includes(d)).concat([["외과", 1]]);
  await buildHospital(page, rooms); // ward 없음 — 레시피의 핵심이다
  rec.mark(`개원 — 로스터 ${roster.map(([d, n]) => `${d}${n}`).join("·")} / 진료실 ${rooms.map(([d]) => d).join("+")}`);
  const panel = page.getByLabel("개원 준비", { exact: true });
  if (await panel.count() > 0 && await panel.isVisible().catch(() => false)) {
    rec.mark(`체크리스트 미완(의도): ${(await panel.innerText()).replace(/\n/g, " / ")}`);
  }

  await setSpeed(page, "3배속");
  rec.mark("3× 개원 — 11주 빨리감기");
  /* 84일 빨리감기는 혼자 돌면 ~11분이지만 다른 녹화와 겹치면 프레임이 굶어 3배까지 늘어난다
     (실측: 4개 동시에서 15분 동안 5주). 여유를 크게 준다 — 병렬로 돌리지 않는 것이 먼저다.
     ⚠️ **빨리감기는 화면이 무거워질수록 느려진다** — `__ffwd`가 프레임당 250게임분을 넘기므로
     걸리는 시간은 게임 안 날수가 아니라 **실제 렌더 프레임 수**다. 2026-08-05 재촬영에서
     40분(옛 상한)이 11주 6일에서 끊겼다: 8/3에는 28분이면 12주 1일이었는데 팔레트 상주
     로스터가 매 프레임 다시 그려지며 1.5배로 늘었다. 상한을 90분으로 올린다 — 조건이 서면
     즉시 빠져나오므로 남는 시간은 비용이 아니라 여유다. */
  await runUntil(page, (h) => h.week === 12 && h.day === 1, { ffwd: true, timeoutMs: 5_400_000 });
  rec.mark(`12주 1일 도달 — ${(await hud(page)).text}`);

  await openSection(page, "사람");
  await btn(page, "채용").click();
  const dlg = page.getByRole("dialog", { name: "채용 — 전국 인력 시장" });
  await dlg.waitFor({ timeout: 10000 });
  // 배준영은 외과다 — 탭을 안 누르면 첫 과(미용·피부)의 선반이 펴져 있어 그 카드가 아예 없다.
  await deptTab(dlg, "외과").click();
  await page.waitForTimeout(200);
  await dlg.getByRole("button", { name: "배준영 채용" }).click();
  await page.waitForTimeout(400);
  await btn(page, "닫기").click();
  await page.waitForTimeout(300);
  rec.mark("외과 배준영 채용");

  await runUntil(page, async (_h, p) => (await p.getByRole("dialog", { name: "12주 2일차 마감" }).count()) > 0,
    { ffwd: true, timeoutMs: 300000 });
  rec.mark("12주 2일차 마감 — 여기서부터 실속도");
  await page.waitForTimeout(3000);
  await btn(page, "다음 날").first().click();
  rec.mark("[다음 날] 클릭");

  const card = page.getByRole("dialog", { name: /12주 3일차$/ });
  await card.waitFor({ timeout: 60000 });
  const label = await card.getAttribute("aria-label");
  const body = (await card.innerText()).replace(/\n/g, " | ");
  rec.mark(`12주 3일 속보: ${label}`);
  rec.mark(`본문: ${body}`);
  await page.waitForTimeout(9000);
  rec.mark("카드 응시 끝");
  return { label, body };
}

// ── 메인 ───────────────────────────────────────────────────────────────────
const cut = process.argv[2];
if (!CUTS[cut]) {
  console.error(`컷 이름이 필요하다: ${Object.keys(CUTS).join(" | ")}`);
  process.exit(1);
}
fs.mkdirSync(path.join(ROOT, "raw"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "thumbs"), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  // HS_NOREC=1 — 정찰용. 1920×1080 인코딩이 통째로 빠져 빨리감기가 몇 배 빨라진다.
  ...(process.env.HS_NOREC ? {} : { recordVideo: { dir: path.join(ROOT, "raw", "_tmp"), size: { width: 1920, height: 1080 } } }),
  locale: "ko-KR",
});
await context.addInitScript(INIT);
const page = await context.newPage();
const rec = makeRec(cut);
rec.mark("컨텍스트 생성 · 녹화 시작");

let failure = null;
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // dev 서버의 Next 개발 배지는 화면 구석에 찍히므로 녹화에서 지운다(게임 코드는 안 건드린다)
  await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast]{display:none!important}" });
  rec.mark("페이지 로드");
  await CUTS[cut](page, rec);
  rec.mark("컷 종료");
} catch (e) {
  failure = e;
  rec.mark(`실패: ${e.message}`);
  await page.screenshot({ path: path.join(ROOT, "thumbs", `${cut}-fail.png`) }).catch(() => {});
}

const video = page.video();
await context.close();
if (video) await video.saveAs(path.join(ROOT, "raw", `${cut}.webm`));
await browser.close();
rec.flush();
if (failure) { console.error(failure); process.exit(1); }
console.log(`[${cut}] 완료 → raw/${cut}.webm`);
