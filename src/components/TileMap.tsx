"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { FATIGUE_MAX } from "@/game/doctor";
import { GRID_W, GRID_H, doorTile, type RoomType, type SimWorld } from "@/sim/world";
import { BedSprite, ChairSprite, DeskSprite, DoctorSprite, DEPT_COLOR, PatientSprite } from "./PixelSprite";
import { busyDoctorIds, doctorActivityMark, fatigueTone, FATIGUE_COLOR, roomLabel } from "./simHud";

/**
 * 타일 병원 맵 — SimWorld를 그대로 그리는 순수 표시층. 세계를 만들지도 고치지도 않는다.
 *
 * 기존 HospitalMap과 같은 규칙 하나를 공유한다: **폰은 절대 remount하지 않는다.**
 * key={pawn.id}를 유지한 채 left/top만 바꿔야 CSS transition이 타일 사이를 걷는다.
 * 부모가 바뀌거나 key가 흔들리면 이동이 remount가 되어 순간이동으로 보인다.
 *
 * HospitalMap과 다른 점은 좌표계다 — 저쪽은 연출용 백분율이고 여기는 **타일 격자**다.
 * 화면 위치는 전부 `타일 × TILE`이라 시뮬의 정수 좌표와 1:1로 대응한다(별도 좌표 함수 없음).
 *
 * ⚠️ 폰은 게임 1분에 PAWN_TILES_PER_MIN(2)타일을 **점프**한다. transition이 그 사이를
 * 직선 보간하므로 경로가 꺾이는 지점에서 대각선이 벽 모서리를 스칠 수 있다 — 1주차 수용 한계다.
 * 도착 판정은 위치 기반이라 시뮬 결과에는 영향이 없다(연출만의 문제).
 */

/** 타일 한 칸의 화면 크기(px). 맵 크기(768×512)가 여기서 파생된다. */
export const TILE = 16;

/**
 * 방 타입별 바닥·벽 색. 지면(desk) 팔레트에서 파생한 어두운 계열 — 사람(스프라이트)이
 * 시선을 먼저 받아야 하므로 방은 대조를 낮게 유지한다. 원시 유틸(zinc/emerald…) 대신
 * 리터럴 hex를 쓰는 건 PixelSprite·HospitalMap과 같은 **회화 레이어**의 관례다.
 */
export const ROOM_STYLE: Record<RoomType, { floor: string; wall: string }> = {
  EXAM: { floor: "#16232a", wall: "#2d4650" },
  WARD: { floor: "#1e1a2a", wall: "#3b3352" },
  WAITING: { floor: "#241f18", wall: "#4a4130" },
  LOUNGE: { floor: "#16241c", wall: "#2c4a39" },
  RECEPTION: { floor: "#261a1a", wall: "#4f3232" },
  // 식당 — 휴게실(녹)의 이웃 색조(황록). 두 방은 같은 "쉬는 곳"이라 계열을 붙이되, 한 화면에
  // 나란히 서도 구별되게 색상만 옮긴다. `Record<RoomType, …>`이라 이 줄이 없으면 tsc가 막는다.
  CAFETERIA: { floor: "#24220f", wall: "#4a4620" },
};

const OUTSIDE_FLOOR = "#0d0d11"; // 부지 바닥(방 밖) — 복도이자 마당
const GRID_LINE = "rgba(216,207,175,0.045)"; // 격자 — 타일 경계를 겨우 읽을 만큼만

/** 접수 카운터 — PixelSprite에 없는 유일한 가구라 여기서만 쓰는 8×8 격자로 둔다. */
function CounterSprite() {
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-full w-full" aria-hidden>
      <rect x="0" y="2" width="8" height="4" fill="#4a3f33" />
      <rect x="0" y="2" width="8" height="1" fill="#6b5a45" />
      <rect x="1" y="4" width="2" height="1" fill="#d8d3c0" />
      <rect x="5" y="4" width="2" height="1" fill="#d8d3c0" />
    </svg>
  );
}

/** 의사 아바타 위 피로 막대(타일 폭). 0이어도 트랙을 남긴다 — 눈금이 있어야 "아직 0"이 읽힌다. */
function FatigueBar({ fatigue }: { fatigue: number }) {
  const ratio = Math.max(0, Math.min(1, fatigue / FATIGUE_MAX));
  return (
    <div
      className="absolute left-0.5 right-0.5 -top-1 h-[2px] overflow-hidden"
      style={{ backgroundColor: "rgba(216,207,175,0.18)" }}
      aria-hidden
    >
      <div className="h-full" style={{ width: `${ratio * 100}%`, backgroundColor: FATIGUE_COLOR[fatigueTone(fatigue)] }} />
    </div>
  );
}

export interface BuildPreview {
  x: number;
  y: number;
  w: number;
  h: number;
  type: RoomType;
  /** 지금 손을 떼면 지어지는가 — 판정은 placeRoom(단일 출처)이 하고 여기선 색만 고른다. */
  ok: boolean;
  costManwon: number;
}

export interface TileMapProps {
  world: SimWorld;
  preview?: BuildPreview | null;
  /** 폰 이동 transition 길이(ms). 배속이 오르면 짧아진다 — 0이면 전환 없이 즉시(일시정지). */
  stepMs: number;
  onTileDown?: (t: { x: number; y: number }) => void;
  onTileMove?: (t: { x: number; y: number }) => void;
  /** 손을 뗐다 — **확정**. 여기서만 건설이 일어난다. */
  onTileUp?: (t: { x: number; y: number }) => void;
  /** 포인터가 취소됐다 — **파기**. 타일 좌표를 넘기지 않는 것이 계약이다(확정과 섞이지 않게). */
  onTileCancel?: () => void;
}

/** 포인터 위치 → 타일 좌표. 격자 밖으로 나가도 부지 안으로 물린다(드래그가 밖에서 끝나도 사각형이 성립). */
function tileOf(e: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } {
  const r = e.currentTarget.getBoundingClientRect();
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  return {
    x: clamp(Math.floor((e.clientX - r.left) / TILE), GRID_W - 1),
    y: clamp(Math.floor((e.clientY - r.top) / TILE), GRID_H - 1),
  };
}

export default function TileMap({
  world,
  preview,
  stepMs,
  onTileDown,
  onTileMove,
  onTileUp,
  onTileCancel,
}: TileMapProps) {
  // 진료 중인 의사 — 환자의 doctorId가 "바쁨"의 단일 출처다(patientFlow와 같은 규칙).
  // 집합을 만드는 식 자체도 simHud가 든다: 인사 패널이 태업 판정에 같은 집합을 쓰므로
  // 여기서 따로 적으면 두 화면이 각자의 "바쁨"을 갖게 된다.
  const busyDoctors = busyDoctorIds(world.pawns);

  return (
    <div className="overflow-x-auto">
      <div
        className="relative touch-none select-none border border-frame"
        style={{
          width: GRID_W * TILE,
          height: GRID_H * TILE,
          backgroundColor: OUTSIDE_FLOOR,
          backgroundImage: `repeating-linear-gradient(90deg, ${GRID_LINE} 0 1px, transparent 1px ${TILE}px), repeating-linear-gradient(180deg, ${GRID_LINE} 0 1px, transparent 1px ${TILE}px)`,
        }}
        role="img"
        aria-label={`병원 부지 ${GRID_W}×${GRID_H} 타일 — 방 ${world.rooms.length}개, 인원 ${world.pawns.length}명`}
        onPointerDown={(e) => {
          // 순서가 의미를 갖는다 — 캡처가 먼저면 setPointerCapture가 던질 때(이미 끝난
          // 포인터 등 NotFoundError) 드래그가 아예 시작되지 않는다. 시작을 먼저 알리면
          // 최악의 경우도 "맵 밖으로 나가면 놓친다"로 그친다.
          const t = tileOf(e);
          onTileDown?.(t);
          try {
            e.currentTarget.setPointerCapture(e.pointerId); // 드래그가 맵 밖으로 나가도 안 끊기게
          } catch {
            /* 캡처 실패는 연출 손해일 뿐이라 삼킨다 */
          }
        }}
        onPointerMove={(e) => onTileMove?.(tileOf(e))}
        onPointerUp={(e) => onTileUp?.(tileOf(e))}
        // 취소는 **확정과 다른 경로**여야 한다. 한때 이 자리에서 onTileUp을 불렀는데,
        // 그러면 브라우저가 드래그를 가로챌 때(스크롤 제스처·포인터 강제 해제 등)
        // 손을 떼지도 않은 사각형이 그대로 지어진다 — 철거 수단이 없어 비가역이다.
        onPointerCancel={() => onTileCancel?.()}
      >
        {/* 방 — 벽은 **테두리 한 타일 전체**다(blockedPerimeter). 얇은 선으로 그리면 안쪽이 실제보다
            넓어 보여, 왜 여기 못 서는지 설명이 안 된다. inset 그림자로 타일 두께 그대로 두른다. */}
        {world.rooms.map((r) => {
          const style = ROOM_STYLE[r.type];
          const door = doorTile(r);
          return (
            <div key={r.id}>
              <div
                className="absolute"
                style={{
                  left: r.x * TILE,
                  top: r.y * TILE,
                  width: r.w * TILE,
                  height: r.h * TILE,
                  backgroundColor: style.floor,
                  boxShadow: `inset 0 0 0 ${TILE}px ${style.wall}`,
                }}
              />
              {/* 문 — 벽 한 칸을 뚫는다. 유일한 출입구라 통행 전체가 여기를 지난다. */}
              <div
                className="absolute"
                style={{
                  left: door.x * TILE,
                  top: door.y * TILE,
                  width: TILE,
                  height: TILE,
                  backgroundColor: style.floor,
                  boxShadow: `inset 0 -2px 0 ${style.wall}`,
                }}
              />
              {/* 과 표시 — 진료실만. 바닥에 과 색을 옅게 깔아 **어느 방이 무슨 과인지 한눈에**
                  갈리게 한다(환자는 자기 과 진료실에만 들어간다 — 그 규칙이 안 보이면 이탈이
                  설명되지 않는다). 색만으로는 판정을 지지 않는다: 아래 라벨이 과 이름을 함께 쓴다
                  (색 단독 신호 금지 — 기존 게임의 관통 규칙). */}
              {r.type === "EXAM" && r.dept && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: (r.x + 1) * TILE,
                    top: (r.y + 1) * TILE,
                    width: (r.w - 2) * TILE,
                    height: (r.h - 2) * TILE,
                    backgroundColor: DEPT_COLOR[r.dept],
                    opacity: 0.14,
                  }}
                  aria-hidden
                />
              )}
              <span
                className="pointer-events-none absolute font-mono text-[9px] leading-none text-on-desk/45"
                style={{ left: r.x * TILE + TILE + 1, top: r.y * TILE + TILE + 1 }}
              >
                {roomLabel(r)}
              </span>
            </div>
          );
        })}

        {/* 가구 — 집기라 상호작용이 없다. 타일 자체가 막혀 있어(buildBlockedSet) 폰이 그 위에 못 선다. */}
        {world.furniture.map((f) => (
          <div
            key={`${f.roomId}-${f.kind}-${f.x}-${f.y}`}
            className="pointer-events-none absolute"
            style={{ left: f.x * TILE, top: f.y * TILE, width: TILE, height: TILE }}
            aria-hidden
          >
            {f.kind === "DESK" ? (
              <DeskSprite />
            ) : f.kind === "CHAIR" ? (
              <ChairSprite />
            ) : f.kind === "BED" ? (
              <BedSprite occupied={false} />
            ) : (
              <CounterSprite />
            )}
          </div>
        ))}

        {/* 폰 — key는 id로 고정한다(위 주석). 이동은 left/top transition이 걷는다. */}
        {world.pawns.map((p) => {
          // 욕구 표시는 의사만 갖는 상태라 환자에는 언제나 null이다(activity 필드가 없다) —
          // 그래서 kind로 한 번 더 거르지 않는다.
          const activityMark = doctorActivityMark(p);
          return (
          <div
            key={p.id}
            className="pointer-events-none absolute"
            style={{
              left: p.x * TILE,
              top: p.y * TILE,
              width: TILE,
              height: TILE,
              transition: stepMs > 0 ? `left ${stepMs}ms linear, top ${stepMs}ms linear` : "none",
              zIndex: 2,
            }}
          >
            {/* 응급 환자 — 붉은 링. 스프라이트는 익명 회색 하나뿐이라(character-design.md: 환자에
                개인 서사를 붙이지 않는다) 링만으로 "지금 병원 안에 응급이 있다"를 나른다. */}
            {p.emergency && (
              <div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: "inset 0 0 0 1.5px var(--alarm)" }}
                aria-hidden
              />
            )}
            {p.kind === "DOCTOR" && p.dept ? (
              <DoctorSprite dept={p.dept} busy={busyDoctors.has(p.id)} variantKey={p.id} />
            ) : (
              <PatientSprite />
            )}
            {/* 피로 막대 — 의사 머리 위. 기존 게임 FatigueBar의 표현 계승(저=회백 / 중=밝음 /
                고=적)이고 경계 판정은 simHud.fatigueTone 하나가 진다. 색이 아니라 **길이**가
                판정을 나르는 것도 그대로다 — 흑백으로 찍어도 읽힌다. */}
            {p.kind === "DOCTOR" && <FatigueBar fatigue={p.fatigue ?? 0} />}
            {/* 휴식·식사 글리프 — 책상을 비운 의사가 아무 표시 없이 걸어가면 화면에서는 그냥
                **의사가 사라진 것**으로 보인다("왜 진료를 안 하지"). 휴게실·식당을 지은 보람이
                여기 있다: 걷는 동안에도 글리프가 붙어 있어 왕복에 걸리는 시간이 눈에 보인다.
                표시 판정은 simHud.doctorActivityMark(단일 출처)가 하고 여기선 놓기만 한다. */}
            {activityMark && (
              <span
                className="pointer-events-none absolute -right-1 -top-1 font-mono text-[8px] leading-none text-on-desk"
                style={{ textShadow: "0 0 2px var(--desk)" }}
                title={activityMark.label}
              >
                {activityMark.glyph}
              </span>
            )}
          </div>
          );
        })}

        {/* 건설 미리보기 — 지금 손을 떼면 무엇이 생기는지. 거부될 사각형은 붉게 남아 사유 토스트와 짝이 된다. */}
        {preview && (
          <div
            className="pointer-events-none absolute border-2 border-dashed"
            style={{
              left: preview.x * TILE,
              top: preview.y * TILE,
              width: preview.w * TILE,
              height: preview.h * TILE,
              borderColor: preview.ok ? ROOM_STYLE[preview.type].wall : "var(--alarm)",
              backgroundColor: preview.ok ? "rgba(216,207,175,0.10)" : "rgba(229,72,77,0.14)",
              zIndex: 3,
            }}
          >
            <span className="absolute -top-4 left-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-on-desk">
              {preview.w}×{preview.h} · {preview.costManwon.toLocaleString()}만원
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
