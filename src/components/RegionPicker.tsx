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
