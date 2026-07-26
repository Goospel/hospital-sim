"use client";

import { useEffect, useMemo, useState } from "react";
import TileMap, { ROOM_LABEL, type BuildPreview } from "@/components/TileMap";
import { useSimClock, type SimSpeed } from "@/components/useSimClock";
import { MS_PER_GAME_MIN } from "@/game/hospitalMap";
import { formatClockFromOpen } from "@/game/daysim";
import { createWorld, type RoomType, type SimWorld } from "@/sim/world";
import { placeRoom, roomCostManwon, COST_PER_TILE_MANWON, MIN_ROOM_W, MIN_ROOM_H, type PlaceResult } from "@/sim/build";
import { spawnDoctor } from "@/sim/pawn";
import { ARRIVAL_WINDOW_MIN } from "@/sim/patientFlow";

/**
 * /sim — 타일 병원의 첫 화면. 시뮬 코어(src/sim)를 **읽고 그리기만** 한다.
 *
 * 여기가 가진 상태는 셋뿐이다: 세계 · 배속 · 건설 드래그. 게임 규칙은 하나도 없다 —
 * 지을 수 있는지는 placeRoom이, 시간이 흐르는 건 useSimClock+tick이 정한다.
 * 미리보기 색조차 placeRoom을 **그대로 한 번 돌려** 정한다(검증 규칙을 여기 베끼면
 * 미리보기는 초록인데 손을 떼면 거부되는 어긋남이 생긴다 — 규칙의 단일 출처는 build.ts다).
 *
 * 기존 게임(/)과 공존한다. 이 라우트는 서버 기능을 쓰지 않아 Pages 정적 export에 그대로 실린다.
 */

const ROOM_TYPES: RoomType[] = ["EXAM", "WAITING", "WARD", "RECEPTION", "LOUNGE"];

const REASON_TEXT: Record<Exclude<PlaceResult, { ok: true }>["reason"], string> = {
  TOO_SMALL: `너무 좁습니다 — 최소 ${MIN_ROOM_W}×${MIN_ROOM_H}`,
  OUT_OF_BOUNDS: "부지 밖입니다 — 가장자리 한 칸은 비워 둡니다",
  OVERLAP: "다른 방과 겹칩니다",
  NO_MONEY: "자금이 부족합니다",
};

const SPEEDS: Array<{ value: SimSpeed; label: string; title: string }> = [
  { value: 0, label: "❚❚", title: "일시정지" },
  { value: 1, label: "1×", title: "보통 속도" },
  { value: 3, label: "3×", title: "3배속" },
];

/** 개원 시점의 세계 — 빈 부지 + 의사 2명. 의사는 입구 앞 통행 타일에 선다(방은 여기 못 짓는다). */
function initialWorld(): SimWorld {
  let w = createWorld(1);
  w = spawnDoctor(w, "INTERNAL_MEDICINE", { x: 22, y: 30 });
  w = spawnDoctor(w, "GENERAL_SURGERY", { x: 26, y: 30 });
  return w;
}

interface Drag {
  start: { x: number; y: number };
  cur: { x: number; y: number };
}

/** 두 타일이 만드는 사각형 — 어느 방향으로 끌든 같은 결과가 되게 정규화한다. */
function rectOf(d: Drag) {
  return {
    x: Math.min(d.start.x, d.cur.x),
    y: Math.min(d.start.y, d.cur.y),
    w: Math.abs(d.cur.x - d.start.x) + 1,
    h: Math.abs(d.cur.y - d.start.y) + 1,
  };
}

export default function SimPage() {
  const [world, setWorld] = useState<SimWorld>(initialWorld);
  const [speed, setSpeed] = useState<SimSpeed>(1);
  const [selected, setSelected] = useState<RoomType | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /*
    건설 중 자동 일시정지 — 드래그 시작부터 확정까지 세계가 멈춘다.
    speed를 0으로 **덮어쓰지 않고** 파생값으로 두는 게 핵심이다: 저장·복원을 하면
    드래그가 취소(pointercancel)되거나 중간에 언마운트될 때 배속이 0에 갇힌다.
  */
  const running: SimSpeed = drag ? 0 : speed;
  useSimClock(running, setWorld);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const preview: BuildPreview | null = useMemo(() => {
    if (!drag || !selected) return null;
    const rect = rectOf(drag);
    // 판정을 베끼지 않고 실제 placeRoom을 돌려 본다 — 결과 세계는 버린다(순수 함수라 안전).
    const res = placeRoom(world, { type: selected, ...rect });
    return { ...rect, type: selected, ok: res.ok, costManwon: roomCostManwon(rect.w, rect.h) };
  }, [drag, selected, world]);

  const commit = (d: Drag) => {
    if (!selected) return;
    const res = placeRoom(world, { type: selected, ...rectOf(d) });
    // EXAM의 dept는 1주차엔 지정하지 않는다 — 과 배정은 2주차 몫이다.
    if (res.ok) setWorld(res.world);
    else setToast(REASON_TEXT[res.reason]);
  };

  const closed = world.minute >= ARRIVAL_WINDOW_MIN;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4">
      {/* ── 상단 바 — 시각·금고·오늘 집계·시간 조작 ── */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-frame bg-desk-2 px-4 py-2 font-mono text-sm tabular-nums text-on-desk">
        <span className="text-base font-semibold">{formatClockFromOpen(world.minute)}</span>
        <span>
          <span className="text-on-desk-muted">금고 </span>
          {world.treasuryManwon.toLocaleString()}만원
        </span>
        <span>
          <span className="text-on-desk-muted">진료 </span>
          {world.stats.examsDone}
        </span>
        <span>
          <span className="text-on-desk-muted">이탈 </span>
          <span className={world.stats.leftCount > 0 ? "text-alarm" : undefined}>{world.stats.leftCount}</span>
        </span>
        {closed && <span className="text-on-desk-muted">접수 마감</span>}
        <div className="ml-auto flex items-center gap-1">
          {drag && <span className="mr-2 text-xs text-on-desk-muted">건설 중 — 일시정지</span>}
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.title}
              aria-pressed={speed === s.value}
              onClick={() => setSpeed(s.value)}
              className={`min-w-9 border px-2 py-1 text-xs transition-colors ${
                speed === s.value
                  ? "border-on-desk-muted bg-frame text-on-desk"
                  : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <TileMap
        world={world}
        preview={preview}
        // 폰은 게임 1분마다 2타일을 건너뛴다 — 그 1분의 실시간 길이가 곧 전환 시간이다.
        stepMs={running > 0 ? MS_PER_GAME_MIN / running : 0}
        onTileDown={(t) => selected && setDrag({ start: t, cur: t })}
        onTileMove={(t) => setDrag((d) => (d ? { ...d, cur: t } : d))}
        onTileUp={(t) => {
          // 확정은 setState **바깥**에서 한다 — 업데이터 안에서 건설하면 StrictMode가
          // 업데이터를 두 번 불러 방이 두 번 지어지고 비용도 두 번 빠진다.
          if (drag) commit({ ...drag, cur: t });
          setDrag(null);
        }}
      />

      {/* ── 하단 바 — 방 타입 선택. 고른 뒤 부지를 드래그하면 그 사각형이 방이 된다. ── */}
      <footer className="flex flex-col gap-2 border border-frame bg-desk-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {ROOM_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={selected === t}
              onClick={() => setSelected((cur) => (cur === t ? null : t))}
              className={`border px-3 py-1.5 text-sm transition-colors ${
                selected === t
                  ? "border-on-desk-muted bg-frame text-on-desk"
                  : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
              }`}
            >
              {ROOM_LABEL[t]}
            </button>
          ))}
          <span className="ml-auto font-mono text-xs tabular-nums text-on-desk-muted">
            타일당 {COST_PER_TILE_MANWON}만원 · 최소 {MIN_ROOM_W}×{MIN_ROOM_H}
          </span>
        </div>
        <p className="min-h-5 text-xs">
          {toast ? (
            <span className="text-alarm">{toast}</span>
          ) : selected ? (
            <span className="text-on-desk-muted">
              {ROOM_LABEL[selected]} — 부지를 드래그해 크기를 정하세요. 건설하는 동안 시간이 멈춥니다.
            </span>
          ) : (
            <span className="text-on-desk-muted">
              방 타입을 고르면 건설할 수 있습니다. 환자는 대기실 의자에 앉고, 진료실의 의사가 차례로 부릅니다.
            </span>
          )}
        </p>
      </footer>
    </main>
  );
}
