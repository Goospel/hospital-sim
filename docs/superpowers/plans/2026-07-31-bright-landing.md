---
tags:
  - type/plan
---

# 랜딩(지역 선택) 밝은 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어두운 desk 토큰 위의 지역 선택 화면을 「밝은 종이 위 잉크 지도」로 전환한다 — 극성 반전(어두울수록 내용) + 수술복 청록 한 점.

**Architecture:** 랜딩 전용 팔레트를 TS 상수 모듈(`landingPalette.ts`) 하나에 두고 RegionPicker가 그것만 쓴다. 휘도 서열·간격·텍스트 대비는 `landingPalette.test.ts`가 잠근다(backdropPalette.test.ts 관례 — 스펙이 곧 테스트). `globals.css`의 desk 토큰은 건드리지 않는다(HUD는 아트 디렉션 ④의 몫).

**Tech Stack:** Next.js + React + Tailwind(임의 값은 CSS 변수 경유) + vitest.

**스펙:** [2026-07-31-bright-landing-design.md](../specs/2026-07-31-bright-landing-design.md) · **브랜치:** `feat/bright-landing` (origin/main 기준, 생성 완료)

**공통 규약** (모든 태스크):
- 커밋 메시지는 한글 — `.commit-msg-tmp`(UTF-8, BOM 없음)에 쓰고 `git commit -F .commit-msg-tmp && rm .commit-msg-tmp`. 인라인 `-m` 한글 금지(훅이 차단).
- 트레일러(`Skills-used:`…`Co-Authored-By:`)는 빈 줄 없이 연속으로 메시지 맨 끝에.
- 테스트는 `npx vitest run <파일>` 로 단건, `npm test` 로 전체.

---

### Task 1: 랜딩 팔레트 모듈 + 계약 테스트

**Files:**
- Create: `src/components/landingPalette.ts`
- Test: `src/components/landingPalette.test.ts`

배경 지식: 이 프로젝트는 색 계약을 테스트로 잠근다(`src/components/backdropPalette.test.ts`가 선례). 휘도 함수는 프로덕션이 export한 `relativeLuminance`(`src/components/Backdrop.tsx:147` — 0~255 채널 선형 가중합)를 그대로 쓴다 — 테스트가 자기 식을 따로 들면 구현과 갈린다. 단, WCAG 대비는 감마 보정 휘도가 필요한 **다른 측정**이라 테스트 안에 전용 함수를 둔다(목적이 다르다: 톤 서열 vs 텍스트 가독).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/landingPalette.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { relativeLuminance } from './Backdrop'
import { LANDING } from './landingPalette'

/**
 * 랜딩 팔레트의 회귀 가드 — 「밝은 종이 위 잉크 지도」의 서열을 숫자로 잠근다.
 *
 * 어두운 시절 랜딩의 서열은 "육지는 바탕, 점이 내용"(밝을수록 내용)이었다. 밝은 화면에서는
 * **어두울수록 내용**이므로 극성만 뒤집고 서열은 유지한다: 잉크 < 육지 < 배경 < 카드.
 * 색은 눈으로만 검수하면 다음 사람이 한 칸 밝히는 순간 조용히 되돌아간다 — 숫자로 잠근다.
 *
 * 톤 서열은 프로덕션의 relativeLuminance(선형 가중)로, 텍스트 가독은 WCAG 대비(감마 보정)로
 * 잰다 — 두 식이 공존하는 것은 측정 목적이 달라서다.
 */

/** WCAG 2.x 상대 휘도 기반 대비율 — 텍스트 가독 전용. */
function wcagContrast(a: string, b: string): number {
  const lin = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const ch = (v: number) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
  }
  const [hi, lo] = [lin(a), lin(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const L = (k: keyof typeof LANDING) => relativeLuminance(LANDING[k])

describe('랜딩 팔레트 — 종이 위 잉크 지도', () => {
  it('휘도 서열: 잉크 < 육지 < 배경 < 카드 (어두울수록 내용)', () => {
    expect(L('ink')).toBeLessThan(L('land'))
    expect(L('land')).toBeLessThan(L('backdrop'))
    expect(L('backdrop')).toBeLessThan(L('card'))
  })

  it('최소 간격: 층이 뭉개지지 않는다', () => {
    // 간격 하한은 후보값 실측에서 왔다(잉크↔육지 121 · 육지↔배경 50 · 배경↔카드 15).
    // 서열만 잠그면 "전부 비슷한 회색"이 초록불을 받는다 — backdropPalette가 실측한 그 회귀다.
    expect(L('land') - L('ink')).toBeGreaterThanOrEqual(80)
    expect(L('backdrop') - L('land')).toBeGreaterThanOrEqual(35)
    expect(L('card') - L('backdrop')).toBeGreaterThanOrEqual(10)
  })

  it('텍스트 대비: 카드 위 잉크·보조 텍스트가 WCAG 4.5:1 이상', () => {
    expect(wcagContrast(LANDING.ink, LANDING.card)).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(LANDING.inkMuted, LANDING.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('청록 대비: 버튼 글자는 WCAG 4.5:1, 육지 위 청록 점은 휘도 차 40 이상', () => {
    expect(wcagContrast(LANDING.onAccent, LANDING.accent)).toBeGreaterThanOrEqual(4.5)
    // 점은 텍스트가 아니라 면이라 WCAG 비율 대신 톤 휘도 차로 잰다.
    expect(L('land') - L('accent')).toBeGreaterThanOrEqual(40)
  })
})
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run src/components/landingPalette.test.ts`
Expected: FAIL — `./landingPalette` 모듈이 없어 로드 단계에서 죽는다 (vitest는 esbuild로 타입만 벗기므로 런타임 모듈 해석 실패로 나타난다).

- [ ] **Step 3: 팔레트 구현**

`src/components/landingPalette.ts`:

```ts
/**
 * 랜딩(지역 선택) 전용 팔레트 — 「밝은 종이 위 잉크 지도」.
 *
 * 본편이 밝은 병원 톤으로 전환된 뒤에도(실내 바닥 휘도 ~210대) 첫 화면은 어두운 desk 토큰
 * 위에 있었다 — 첫인상이 아트 디렉션과 정반대였다. 이 모듈이 랜딩만 먼저 밝힌다.
 *
 * ⚠️ **desk 토큰(globals.css)을 건드리지 않는 이유**: HUD·사이드바가 그 토큰 위에 있고,
 * HUD의 밝은 전환은 아트 디렉션 ④ 단계의 몫이다. 그때 이 값들이 출발점이 된다.
 *
 * ⚠️ **CSS 변수가 아니라 TS 상수인 이유**: 값이 TS에 있어야 휘도 서열·간격·WCAG 대비를
 * 테스트로 잠글 수 있다 — 서열·간격·대비는 landingPalette.test.ts가 단일 출처다.
 *
 * 서열(어두울수록 내용 — 어두운 시절의 극성 반전): ink < land < backdrop < card.
 */
export const LANDING = {
  /** 화면 배경 — 본편 실내 벽 톤(NEUTRAL_STYLE.wall) 대역의 밝은 중성. 불투명(딤 아님). */
  backdrop: "#d9dcd7",
  /** 카드(종이) — 배경보다 한 단 밝다. 카드가 무대다(「부지가 배경보다 밝다」와 같은 계약). */
  card: "#edeae3",
  /** 카드·패널 테두리 — 육지보다 밝은 중간톤(테두리가 지도와 경쟁하면 안 된다). */
  edge: "#b9bcb4",
  /** 지도 육지 — 종이에 인쇄된 지도의 중간톤. 카드·잉크 양쪽에서 충분히 떨어진다. */
  land: "#b0a999",
  /** 본문·지역 점의 잉크 — 본편 외곽선 잉크(#181426) 대역의 청회색. */
  ink: "#2b3138",
  /** 보조 텍스트 — 카드 위 WCAG 4.5:1을 지키는 하한 근처. 더 밝히면 대비 테스트가 막는다. */
  inkMuted: "#62666d",
  /** 수술복 청록 — 선택·확정에만 쓰는 화면의 유일한 유채색. 간호사 코트(#4fa39e)에서
   *  출발해 흰 글자 WCAG 4.5:1을 위해 어두운 쪽으로 내린 값. */
  accent: "#327974",
  /** 청록 위 글자. */
  onAccent: "#ffffff",
} as const;
```

- [ ] **Step 4: GREEN 확인**

Run: `npx vitest run src/components/landingPalette.test.ts`
Expected: PASS 4건. 만약 간격·대비 단언이 실패하면 **hex를 실패 방향으로 조정**한다(값은 후보, 테스트가 계약이다). 예: `inkMuted` 대비 미달이면 더 어둡게, `accent` 흰 글자 대비 미달이면 더 어둡게.

- [ ] **Step 5: 돌연변이 확인 (T-139 절차 — Edit 도구로만 심고 복원)**

테스트가 실제로 무는지 두 건 실측:
1. `landingPalette.ts`의 `backdrop`을 `card`보다 밝은 `#f5f2eb`로 Edit → 서열 테스트 FAIL 확인 → 원복.
2. `inkMuted`를 `#9a9ea6`으로 Edit → WCAG 대비 테스트 FAIL 확인 → 원복.
원복 후 `git status`로 워킹트리 깨끗한지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/components/landingPalette.ts src/components/landingPalette.test.ts
# .commit-msg-tmp 에 한글 메시지 작성 후:
git commit -F .commit-msg-tmp && rm .commit-msg-tmp
```

메시지 제목: `feat: 랜딩 팔레트 — 종이 위 잉크 지도 서열을 테스트로 잠근다`

---

### Task 2: RegionPicker 색 배선 교체

**Files:**
- Modify: `src/components/RegionPicker.tsx` (전체 — 색 클래스·주석 교체, 구조는 무변)

배경 지식: RegionPicker는 desk 토큰 tailwind 클래스(`bg-desk/85`·`bg-desk-2`·`border-frame`·`text-on-desk*`)로 칠해져 있다. 전부 `LANDING` 값으로 바꾼다. **hover·focus 상태는 inline style로 못 하므로** 다이얼로그 루트에 CSS 변수 두 개(`--lp-accent`·`--lp-ink`)를 심고 tailwind 임의 값 `bg-[var(--lp-accent)]` 류로 쓴다 — hex가 클래스 문자열에 박히지 않아 단일 출처(TS 모듈)가 유지된다.

레이아웃·동작(두 단계 선택 · `DOT_SPAN` · `HIT_SPAN` · % 좌표) 은 **한 글자도 바꾸지 않는다.**

- [ ] **Step 1: RegionPicker 교체**

`src/components/RegionPicker.tsx` 전문 (변경점: import 한 줄 추가, 색 클래스→LANDING 배선, 낡은 색 주석 갱신):

```tsx
"use client";

import { useState, type CSSProperties } from "react";

import { MAP_COLS, MAP_ROWS, PLACES, landRuns, type MapPlace } from "./koreaMap";
import { LANDING } from "./landingPalette";
import { formatManwon } from "./simHud";
import { simRegion, type SimRegionKey } from "@/sim/world";

/**
 * ── 지역 선택 — 판이 열리기 전의 첫 화면.
 *
 * 원래 카드 네 장이었다. 카드는 규칙을 정확히 말하지만 **어디인지는 말하지 않는다**. 림월드가
 * 시작 시 지형을 고르게 하듯, 여기서는 실제 대한민국을 펴 놓고 그 위의 한 점을 고른다 —
 * "지방 소도시"가 아니라 "전북 정읍시"를 고르는 것이 이 화면이 하려는 일이다.
 *
 * ⚠️ **두 단계다**(점 클릭 → 확정). 「고르고 나면 바꿀 수 없습니다」라고 써 놓고 한 번의 오클릭으로
 * 12주가 결정되게 두면 앞뒤가 안 맞는다. 카드 시절엔 목록이 곧 설명이라 한 번에 골라도 됐지만,
 * 지도의 점은 눌러 보기 전엔 무엇인지 모른다.
 *
 * 색은 `landingPalette`(밝은 종이 위 잉크 지도)가 단일 출처다 — desk 토큰을 쓰지 않는다
 * (HUD가 어두운 채 남아 있는 동안 랜딩만 먼저 밝다). **지역 타입별 색은 여전히 없다** — 점 크기가
 * 도시 규모다. 유채색은 수술복 청록 하나뿐이고, 선택·확정 표식에만 쓴다(지역 분류가 아니다).
 */

/** 타입별 점 지름(칸 단위) — 대도시가 가장 크다. 규칙의 세기가 아니라 **도시 규모**의 그림이다. */
const DOT_SPAN: Record<SimRegionKey, number> = {
  URBAN: 1.45,
  NEWTOWN: 1.1,
  PROVINCIAL: 0.85,
  RURAL: 0.62,
};

/**
 * 클릭 판(칸 단위) — 보이는 점보다 크다. 농어촌 점은 한 칸의 6할이라 그대로 두면 못 누른다.
 *
 * ⚠️ **1.5를 넘기면 안 된다.** 반지름이 0.75칸을 넘는 순간 이웃 칸에 있는 지역의 *중심*까지
 * 덮어, 나중에 그려진 점이 앞 점을 영영 못 누르게 가린다. 「두 지역이 같은 칸을 쓰지 않는다」
 * (koreaMap.test.ts)가 이 값의 안전을 받치는 불변식이다 — 두 값이 서로를 전제한다.
 */
const HIT_SPAN = 1.5;

const pct = (n: number, total: number) => `${(n / total) * 100}%`;

export default function RegionPicker({ onPick }: { onPick: (region: SimRegionKey) => void }) {
  const [picked, setPicked] = useState<MapPlace | null>(null);
  const spec = picked ? simRegion(picked.region) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="지역 선택"
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto p-4"
      /* 불투명 배경 — 어두운 시절의 85% 딤이 아니다. 첫 화면 전체가 밝은 병원 톤이어야 하고,
         뒤의 (아직 어두운) HUD는 완전히 가려진다. hover·focus는 inline style로 못 하므로
         CSS 변수를 여기 한 번 심어 tailwind 임의 값(var 참조)으로 쓴다 — hex는 TS 모듈에만 있다. */
      style={
        {
          background: LANDING.backdrop,
          "--lp-accent": LANDING.accent,
          "--lp-ink": LANDING.ink,
        } as CSSProperties
      }
    >
      {/* 세로 가운데는 아이의 `my-auto`로 잡는다 — 채용 패널과 같은 이유(T-088). */}
      <div
        className="my-auto flex w-full max-w-3xl flex-col gap-4 border px-5 py-5"
        style={{ background: LANDING.card, borderColor: LANDING.edge }}
      >
        <div>
          <h2 className="font-mono text-sm" style={{ color: LANDING.ink }}>
            어디에 병원을 지을까요
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: LANDING.inkMuted }}>
            지역마다 아픈 데가 다릅니다. 고르고 나면 바꿀 수 없습니다.
          </p>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* ── 지도 ── */}
          <div className="flex shrink-0 flex-col gap-2 self-center sm:self-start">
            <div
              className="relative aspect-[23/41] h-[56vh] max-h-[560px] min-h-[340px] w-auto"
              style={{ imageRendering: "pixelated" }}
            >
              {/* 육지 — 가로 런으로 묶어 42개다(칸마다 그리면 516개). 순수 장식이라
                  스크린리더에서 감춘다: 의미는 아래 버튼들이 이름으로 전부 갖고 있다.

                  종이에 인쇄된 지도의 중간톤 — 카드(종이)보다 확실히 어둡고 점(잉크)보다 확실히
                  밝아야 「육지는 바탕이고 점이 내용이다」가 밝기로 보인다. 서열·간격은
                  landingPalette.test.ts가 잠근다. */}
              <div aria-hidden className="absolute inset-0">
                {landRuns().map(r => (
                  <div
                    key={`${r.row}-${r.col}`}
                    className="absolute"
                    style={{
                      background: LANDING.land,
                      left: pct(r.col, MAP_COLS),
                      top: pct(r.row, MAP_ROWS),
                      width: pct(r.len, MAP_COLS),
                      height: pct(1, MAP_ROWS),
                    }}
                  />
                ))}
              </div>

              {/* 지역 — 진짜 <button>이라 탭 이동·엔터가 공짜다. 칸 좌표를 %로 환산해 얹으므로
                  컨테이너 크기를 재지 않는다(반응형이 CSS만으로 성립).
                  점은 잉크색, hover·선택은 청록 — 선택 전 미리보기와 선택 후가 같은 색 축을 쓴다. */}
              {PLACES.map(p => {
                const on = picked?.key === p.key;
                const dot = DOT_SPAN[p.region];
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPicked(p)}
                    aria-pressed={on}
                    title={p.label}
                    className="group absolute flex items-center justify-center focus:outline-none"
                    style={{
                      left: pct(p.col + 0.5 - HIT_SPAN / 2, MAP_COLS),
                      top: pct(p.row + 0.5 - HIT_SPAN / 2, MAP_ROWS),
                      width: pct(HIT_SPAN, MAP_COLS),
                      height: pct(HIT_SPAN, MAP_ROWS),
                    }}
                  >
                    <span
                      className={`block transition-colors ${
                        on
                          ? "bg-[var(--lp-accent)]"
                          : "bg-[var(--lp-ink)] group-hover:bg-[var(--lp-accent)] group-focus-visible:bg-[var(--lp-accent)]"
                      }`}
                      style={{ width: `${(dot / HIT_SPAN) * 100}%`, height: `${(dot / HIT_SPAN) * 100}%` }}
                    />
                    {/* 선택 표식 — 점만 청록이면 이웃과 구별이 약해, 고른 곳에는 테두리를 두른다. */}
                    {on && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 border border-[var(--lp-accent)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-center font-mono text-[10px]" style={{ color: LANDING.inkMuted }}>
              점 크기 = 도시 규모
            </p>
          </div>

          {/* ── 고른 곳 ── */}
          <div
            className="flex min-h-[180px] flex-1 flex-col border px-4 py-3"
            style={{ borderColor: LANDING.edge }}
          >
            {!picked || !spec ? (
              <p
                className="my-auto text-center text-xs leading-relaxed"
                style={{ color: LANDING.inkMuted }}
              >
                지도에서 한 곳을 고르세요.
                <br />
                무엇이 달라지는지 여기 나옵니다.
              </p>
            ) : (
              <>
                <p className="font-mono text-sm" style={{ color: LANDING.ink }}>
                  {picked.label}
                </p>
                <p className="mt-0.5 font-mono text-xs" style={{ color: LANDING.inkMuted }}>
                  {spec.label}
                </p>
                {/* 이름·분류·임대료만 — 나머지 규칙(배율·지정·서사)은 고른 뒤 판에서 드러난다.
                    첫 화면에서 여섯 축을 한꺼번에 읽히면 고르는 게 아니라 비교표를 푸는 일이 된다. */}
                <p
                  className="mt-2.5 font-mono text-[11px] leading-relaxed tabular-nums"
                  style={{ color: LANDING.inkMuted }}
                >
                  {spec.rentManwon === 0 ? "임대료 없음" : `임대료 주 ${formatManwon(spec.rentManwon)}`}
                </p>
                {/* 확정 — 화면의 유일한 유채색 면. hover는 두 번째 hex를 만들지 않으려고 필터로 밝힌다. */}
                <button
                  type="button"
                  onClick={() => onPick(picked.region)}
                  className="mt-auto w-full px-3 py-2 text-sm transition-[filter] hover:brightness-110"
                  style={{ background: LANDING.accent, color: LANDING.onAccent }}
                >
                  여기에 짓는다
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: desk 토큰 잔재 0 확인**

Run: `grep -nE "desk|frame" src/components/RegionPicker.tsx`
Expected: 0건 (클래스·주석 모두).

- [ ] **Step 3: 타입·린트·전체 테스트**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 전부 통과 (RegionPicker를 무는 테스트는 없지만 SimGame 경유 렌더가 있을 수 있다 — 실패하면 원인 파악 후 고친다).

- [ ] **Step 4: 커밋**

메시지 제목: `feat: 랜딩을 밝은 종이 톤으로 — desk 토큰 잔재 0`

---

### Task 3: 브라우저 실측 + 문서 스윕 + PR

**Files:**
- Modify: `claude-docs/plan.md` (항목 ✅) · `claude-docs/changeLog.md` (맨 위 한 항목, PR 번호 없이)
- 확인만: `docs/concept/structural-problems-checklist.md` (이번 작업은 A1~D3 반영 상태를 바꾸지 않으므로 대체로 무변 — 확인 후 그냥 넘어간다)

- [ ] **Step 1: dev 서버로 실측**

`.claude/launch.json`의 dev 서버를 preview로 띄우고(포트 3000) 첫 화면 스크린샷:
1. 배경이 불투명 밝은 중성인가(뒤의 어두운 HUD가 안 비치는가).
2. 카드가 배경보다 밝게 떠 있는가.
3. 육지 위 잉크 점이 읽히는가 · hover 시 청록으로 변하는가.
4. 지역 하나 클릭 → 점·테두리 청록, 「여기에 짓는다」 청록 버튼 + 흰 글자.
5. 확정 클릭 → 밝은 게임 화면으로 이어지는가.

- [ ] **Step 2: 스크린샷을 사용자에게 전달** (SendUserFile — 변경 전후가 갈리는 첫 화면 1장이면 충분)

- [ ] **Step 3: 문서 스윕**

- `claude-docs/plan.md`: 이번 작업 항목을 ✅로 (없으면 완료 상태로 한 줄 추가).
- `claude-docs/changeLog.md` 맨 위에 `## 2026-07-31 · 랜딩을 밝은 종이 톤으로 — 첫 화면과 본편의 명암 통일` 항목(왜/무엇을만, PR 번호 없이).
- 트러블슈팅 스윕: 이번 브랜치에서 1분+ 근인 디버깅이 있었나(서브에이전트가 잡은 것 포함) — 있으면 `claude-docs/troubleshooting/T-###` 신설(T번호는 머지된 main의 최대에서 이어서) + `scripts/rebuild-troubleshooting-index.ps1`.

- [ ] **Step 4: 커밋 + PR**

문서 커밋 후 push, `gh pr create` (본문 한글, `--body-file` UTF-8 경유). PR 본문에 스크린샷 요약과 스펙·계획 링크. **머지는 사용자에게 물은 뒤에만.**

---

## 실행 기록 (SDD · 2026-07-31)

- **Task 1** — 계획서 hex 그대로 4/4 GREEN(조정 0). 품질 리뷰 Important 2건: ⓐ 로컬 `wcagContrast` 식에 고정점 가드가 없어 식 돌연변이 3종(offset 완화 포함)이 생존 → 고정점 테스트 추가(`#050505`가 선형 분기를 깨우는 유일한 표본) ⓑ `edge`만 무단언 → 서열에 2줄 추가. 재검증에서 돌연변이 5종 전부 사살 확인.
- **Task 2** — 계획서 Step 2의 자기모순 실측: 붙이라고 준 전문에 "desk 토큰을 쓰지 않는다"는 산문이 있어 grep `desk` 0건이 성립 불가(잔재 0의 실질 판정은 토큰 클래스 기준). 품질 리뷰 Important 2건: ⓐ `hover:brightness-110`이 4.5:1을 런타임 우회 → `brightness-95`([T-142](../../../claude-docs/troubleshooting/T-142.md)) ⓑ 청록 포커스 점이 쉬는 잉크 점보다 흐린 표식 역전 → 잉크 아웃라인. 스펙 리뷰 Minor로 스펙 §3(CSS 변수 문구)·§5(border 예외)가 코드와 어긋나 스펙 쪽을 정정.
- **Task 3** — 브라우저 실측 전 항목 통과: 불투명 밝은 배경 · 카드 부상 · 잉크 점 가독 · 선택/포커스 청록+잉크 아웃라인(인접 점 침범 없음) · **hover 픽셀 `#2f736e` = 계산값**(sRGB 필터 전제 확정) · 확정 → 게임 진입. 부수 함정: 리뷰어의 `rm -rf .next && npm run build`가 가동 중 dev 서버 캐시를 지워 500 — 서버 재시작으로 해소(등재는 안 함: 재발 시 T 승격).

## 계획 자기 검토 (writing-plans self-review)

- **스펙 커버리지**: §1(전체 밝게·청록) → Task 2 · §2(서열) → Task 1 테스트 · §3(TS 단일 출처·desk 불가침) → Task 1+2 · §4(계약 테스트 4건) → Task 1 · §5(레이아웃 무변) → Task 2 전문이 구조 동일 · §7(청록 hex·edge 실측) → Task 1 Step 4 조정 규칙 + Task 3 실측. 공백 없음.
- **플레이스홀더**: 없음 — 모든 코드 스텝에 전문 수록.
- **타입 일관성**: `LANDING` 키(backdrop·card·edge·land·ink·inkMuted·accent·onAccent)가 Task 1 정의와 Task 2 사용처에서 일치.
