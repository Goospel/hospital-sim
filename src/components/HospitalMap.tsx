"use client";

import { ambientWalkers, type Lighting, type MapAvatar, type MapScene } from "@/game/hospitalMap";
import type { DeptKey } from "@/game/types";
import { wanderTiming } from "@/game/hospitalMap";
import {
  BedSprite,
  ChairSprite,
  DeskSprite,
  DoctorSprite,
  ExamBedSprite,
  PatientSprite,
  PlanterSprite,
} from "./PixelSprite";

/**
 * 탑다운 병원 맵 — MapScene을 그대로 그리는 순수 표시층. 게임 상태를 만들지도 읽지도 않는다.
 *
 * 공간이 세 겹이다:
 *   1) 병원 밖 **거리**(하단 밴드) — 배경 보행자가 여기서만 지나간다. 외벽으로 안과 갈린다.
 *   2) 병원 **건물**(외벽 안) — 진료실 줄 · 복도 · 대기실/병동. 정적 배경(가구 포함)을 여기 깐다.
 *   3) **아바타 레이어**(건물 안 절대좌표 한 겹) — 이동이 곧 transition이라 절대 remount하지 않는다.
 *      방↔대기실↔병동을 DOM 부모 교체로 표현하면 이동이 remount가 되어 걸음이 죽는다 —
 *      key={id}를 유지한 채 left/top만 바꿔야 CSS transition이 사이를 걷는다.
 *
 * 좌표는 **건물 내부 백분율**이다(거리 밴드 제외한 건물 박스 기준). 가구와 아바타가 같은 좌표
 * 함수(chairPos·bedPos·examBedPos…)를 공유하므로 사람이 의자·침대·진료대 위에 정확히 겹친다.
 */

// ── 건물 내부 세로 밴드(건물 높이의 %) — 좌표 함수와 반드시 함께 움직인다 ──
const ROOMS_H = 46; // 진료실 줄: 0% ~ 46%
const CORRIDOR_H = 16; // 복도: 46% ~ 62%
const LOWER_TOP = ROOMS_H + CORRIDOR_H; // 62% — 대기실/병동 밴드 시작
const STREET_H = 15; // 거리 밴드(맵 높이의 %) — 건물 바깥, 하단

// 대기실(좌)·병동(우) x-범위(건물 폭의 %). 가운데 칸막이로 갈린다.
const WAIT_ZONE = { left: 3, width: 51 };
const WARD_ZONE = { left: 59, width: 38 };
const CHAIR_COUNT = 6; // = MAX_WAITING_AVATARS. 의자 수가 대기 표시 상한이다.

const LIGHT_WASH: Record<Lighting, string> = {
  DAY: "bg-transparent",
  DUSK: "bg-orange-950/30",
  NIGHT: "bg-indigo-950/60",
};

type Pos = { left: number; top: number }; // 건물 내부 %

function roomBox(col: number, roomCount: number) {
  const cell = 100 / roomCount;
  return { left: col * cell, cell };
}
function examBedPos(col: number, roomCount: number): Pos {
  const { left, cell } = roomBox(col, roomCount);
  return { left: left + cell * 0.68, top: ROOMS_H * 0.36 };
}
function deskPos(col: number, roomCount: number): Pos {
  const { left, cell } = roomBox(col, roomCount);
  return { left: left + cell * 0.3, top: ROOMS_H * 0.34 };
}
function doctorPos(col: number, roomCount: number, slot: number, n: number): Pos {
  const { left, cell } = roomBox(col, roomCount);
  return { left: left + (cell * (slot + 1)) / (n + 1), top: ROOMS_H * 0.74 };
}
function standerPos(col: number, roomCount: number, slot: number): Pos {
  // 진료대·병동이 다 찼을 때 방 안에 서서 받는 환자(slot ≥ 1) — 드문 경우라 가볍게 분산만.
  const { left, cell } = roomBox(col, roomCount);
  return { left: left + cell * (0.34 + 0.16 * ((slot - 1) % 3)), top: ROOMS_H * 0.56 };
}
function chairPos(i: number): Pos {
  const step = WAIT_ZONE.width / CHAIR_COUNT;
  return { left: WAIT_ZONE.left + step * (i + 0.5), top: LOWER_TOP + 19 };
}
function bedPos(i: number, total: number): Pos {
  const step = WARD_ZONE.width / Math.max(1, total);
  return { left: WARD_ZONE.left + step * (i + 0.5), top: LOWER_TOP + 15 };
}

/** 아바타 하나의 건물 내부 좌표. 가구와 같은 함수를 써 사람이 집기 위에 정확히 겹친다. */
function positionOf(a: MapAvatar, scene: MapScene): Pos {
  const roomCount = scene.rooms.length;
  const colOf = (dept: DeptKey) => scene.rooms.find((r) => r.dept === dept)?.col ?? 0;

  if (a.kind === "DOCTOR" && a.dept) {
    const n = scene.avatars.filter((o) => o.kind === "DOCTOR" && o.dept === a.dept).length;
    return doctorPos(colOf(a.dept), roomCount, a.slot, n);
  }
  // 환자
  if (a.zone === "ROOM" && a.dept) {
    return a.slot === 0 ? examBedPos(colOf(a.dept), roomCount) : standerPos(colOf(a.dept), roomCount, a.slot);
  }
  if (a.zone === "BED") return bedPos(a.slot, scene.beds.length);
  return chairPos(a.slot); // WAITING
}

export default function HospitalMap({
  scene,
  onRoomClick,
}: {
  scene: MapScene;
  onRoomClick?: (dept: DeptKey) => void;
}) {
  const roomCount = scene.rooms.length;

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xs border border-frame bg-black">
      {/* ── 병원 밖 거리 — 배경 보행자는 여기서만 지나간다 ── */}
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden border-t-2 border-[#2e2e36] bg-[#0b0b0e]"
        style={{ height: `${STREET_H}%` }}
        aria-hidden
      >
        {/* 보도 점선 */}
        <div
          className="absolute inset-x-0"
          style={{
            top: "50%",
            height: "1px",
            backgroundImage: "repeating-linear-gradient(90deg, #1d1d24 0 14px, transparent 14px 28px)",
          }}
        />
        {/* 가로수 화분 — 거리 양 끝 */}
        <div className="absolute h-4 w-4 sm:h-5 sm:w-5" style={{ left: "1.5%", top: "18%" }}>
          <PlanterSprite />
        </div>
        <div className="absolute h-4 w-4 sm:h-5 sm:w-5" style={{ right: "1.5%", top: "18%" }}>
          <PlanterSprite />
        </div>
        {/* 지나가는 사람 — 게임 상태가 아니라 장식. 낮 5·석양 2·밤 0(ambientWalkers). */}
        {ambientWalkers(scene.lighting).map((w) => {
          const reverse = w.lane % 2 === 1;
          return (
            <div
              key={w.id}
              className={`hm-walker absolute h-4 w-4 opacity-45 sm:h-5 sm:w-5 ${reverse ? "hm-walker-rev" : ""}`}
              style={{
                top: reverse ? "56%" : `${24 + w.lane * 4}%`,
                animationDelay: `${w.delayMs}ms`,
                animationDuration: `${w.durationMs}ms`,
              }}
            >
              <PatientSprite />
            </div>
          );
        })}
      </div>

      {/* ── 병원 건물 — 외벽 안이 안전지대. 좌표계 원점이 이 박스다 ── */}
      <div
        className="absolute rounded-xs border-2 border-[#3a3a44] bg-desk-2"
        style={{ left: "2%", right: "2%", top: "2%", bottom: `${STREET_H}%` }}
      >
        {/* 진료실 줄 */}
        <div
          className="absolute inset-x-0 top-0 grid gap-1 p-1"
          style={{ height: `${ROOMS_H}%`, gridTemplateColumns: `repeat(${roomCount}, minmax(0, 1fr))` }}
        >
          {scene.rooms.map((room) => {
            const roomCls = `relative flex flex-col justify-start rounded-xs border transition-colors duration-500 ${
              room.lit
                ? room.staffed
                  ? "border-frame bg-frame/70"
                  : "border-frame/60 bg-frame/25" // 빈 방 — 안 뽑은 과가 여기 보인다
                : "border-desk bg-black/60"
            }`;
            // 방 이름은 조명과 무관하게 같은 잉크 — 라벨은 명패이지 방 안의 불빛이 아니다.
            const label = (
              <span className="truncate px-1 pt-0.5 text-center text-[9px] leading-tight text-on-desk/70">
                {room.label}
              </span>
            );
            // 문 개구부 — 방 하단 벽을 뚫어 복도로 이어진다(환자 동선의 입구).
            const door = (
              <div
                className="absolute bottom-0 left-1/2 h-[3px] w-1/3 -translate-x-1/2 translate-y-1/2 bg-desk-2"
                aria-hidden
              />
            );
            // SETUP에서만 방이 클릭 타깃이다(지원서 오버레이). RECEIVING은 onRoomClick을 안 넘겨 현행 그대로.
            return onRoomClick ? (
              <button
                key={room.dept}
                type="button"
                onClick={() => onRoomClick(room.dept)}
                aria-label={`${room.label} 지원서 보기`}
                className={`${roomCls} cursor-pointer hover:border-on-desk-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted`}
              >
                {label}
                {door}
              </button>
            ) : (
              <div key={room.dept} className={roomCls}>
                {label}
                {door}
              </div>
            );
          })}
        </div>

        {/*
          진료실 가구(정적) — 책상·진료대. 사람이 아니라 집기다. 아바타 레이어와 **같은 좌표 함수**
          (deskPos·examBedPos)를 써 건물-절대 좌표로 놓으므로 진료대 위에 환자가 정확히 겹친다
          (의자·병동 침대와 같은 규칙 — 가구를 방 셀에 넣으면 셀 패딩 때문에 아바타와 어긋난다).
          소등되면 흐려진다. pointer-events-none이라 SETUP 방 버튼 클릭을 삼키지 않는다.
        */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {scene.rooms.map((room) => {
            const dp = deskPos(room.col, roomCount);
            const ep = examBedPos(room.col, roomCount);
            const dim = room.lit ? "opacity-100" : "opacity-25";
            return (
              <div key={`furn-${room.dept}`}>
                <div
                  className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 sm:h-5 sm:w-5 ${dim}`}
                  style={{ left: `${dp.left}%`, top: `${dp.top}%` }}
                >
                  <DeskSprite />
                </div>
                <div
                  className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 sm:h-6 sm:w-6 ${dim}`}
                  style={{ left: `${ep.left}%`, top: `${ep.top}%` }}
                >
                  <ExamBedSprite />
                </div>
              </div>
            );
          })}
        </div>

        {/* 복도 — 진료실 줄과 대기실/병동을 잇는 통로 */}
        <div
          className="absolute inset-x-0 border-y border-frame bg-desk"
          style={{ top: `${ROOMS_H}%`, height: `${CORRIDOR_H}%` }}
        />

        {/* 하단 — 대기실(좌) · 칸막이 · 병동(우) */}
        <div className="absolute inset-x-0 bottom-0" style={{ top: `${LOWER_TOP}%` }}>
          {/* 대기실 바닥 */}
          <div
            className="absolute bottom-0 top-0 bg-[#1f1f26]"
            style={{ left: `${WAIT_ZONE.left - 2}%`, width: `${WAIT_ZONE.width + 3}%` }}
          >
            <span className="absolute left-1 top-0.5 text-[8px] text-on-desk/70">대기실</span>
          </div>
          {/* 칸막이 벽 */}
          <div className="absolute bottom-0 top-0 w-[2px] bg-[#3a3a44]" style={{ left: `${WARD_ZONE.left - 3}%` }} />
          {/* 병동 바닥 */}
          <div className="absolute bottom-0 top-0 bg-[#191920]" style={{ left: `${WARD_ZONE.left - 1}%`, right: "1%" }}>
            <span className="absolute left-1 top-0.5 text-[8px] text-on-desk/70">병동</span>
          </div>

          {/* 의자(정적 가구) — 6석. 앉는 사람은 아바타 레이어가 겹친다. */}
          {Array.from({ length: CHAIR_COUNT }, (_, i) => {
            const p = chairPos(i);
            return (
              <div
                key={`chair-${i}`}
                className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 opacity-90 sm:h-4 sm:w-4"
                style={{ left: `${p.left}%`, top: `${((p.top - LOWER_TOP) / (100 - LOWER_TOP)) * 100}%` }}
                aria-hidden
              >
                <ChairSprite />
              </div>
            );
          })}

          {/* 병동 침대(정적 가구) — 비어 있어도 칸이 남는다. */}
          {scene.beds.map((bed, i) => {
            const p = bedPos(i, scene.beds.length);
            return (
              <div
                key={bed.index}
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 sm:h-7 sm:w-7"
                style={{ left: `${p.left}%`, top: `${((p.top - LOWER_TOP) / (100 - LOWER_TOP)) * 100}%` }}
                aria-hidden
              >
                <BedSprite occupied={bed.occupantDoctorId !== undefined} />
              </div>
            );
          })}
        </div>

        {/* 입구 — 건물 바깥벽(하단)을 뚫는 유리 이중문 + 십자 간판. 거리에서 대기실로 들어오는 문. */}
        <div
          className="absolute flex overflow-hidden border border-[#3d5866] bg-[#263640]"
          style={{ bottom: "-3px", left: "22%", width: "12%", height: "6px" }}
          aria-hidden
        >
          <div className="flex-1 border-r border-[#3d5866]" />
          <div className="flex-1" />
        </div>
        <div className="absolute" style={{ bottom: "3px", left: "28%", transform: "translateX(-50%)" }} aria-hidden>
          <svg viewBox="0 0 8 8" className="h-3 w-3" shapeRendering="crispEdges">
            <rect x="0" y="0" width="8" height="8" fill="#f4f4f5" />
            <rect x="3" y="1" width="2" height="6" fill="#e5484d" />
            <rect x="1" y="3" width="6" height="2" fill="#e5484d" />
          </svg>
        </div>

        {/*
          아바타 레이어 — 이동이 곧 transition이다. inset-0로 건물 전체를 덮으므로 반드시
          pointer-events-none이어야 한다: 안 그러면 이 투명 레이어가 아래 방 버튼(SETUP의
          onRoomClick)을 덮어 실제 클릭을 삼킨다. 아바타는 장식이라 상호작용이 없다.
        */}
        <div className="pointer-events-none absolute inset-0">
          {scene.avatars.map((a) => {
            const p = positionOf(a, scene);
            const wander = wanderTiming(a.id);
            return (
              <div
                key={a.id}
                className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-linear sm:h-6 sm:w-6"
                style={{ left: `${p.left}%`, top: `${p.top}%` }}
              >
                {/* 안쪽은 transform 전용(배회) — 바깥이 left/top(배치 이동)이라 속성이 갈려야 안 튄다. */}
                <div
                  className="hm-wander h-full w-full"
                  style={{ animationDelay: `${wander.delayMs}ms`, animationDuration: `${wander.durationMs}ms` }}
                >
                  {a.kind === "DOCTOR" && a.dept ? (
                    <DoctorSprite dept={a.dept} busy={a.busy} variantKey={a.candidateId} />
                  ) : (
                    <PatientSprite />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/*
          대기실 의자에 다 못 앉힌 대기 인원. 의자가 6석뿐이라 넘기면 겹쳐 세는 게 불가능해진다 —
          넘친 사람을 지우는 대신 숫자로 남긴다(게임은 상한을 모른다).
        */}
        {scene.waitingOverflow > 0 && (
          <div
            className="pointer-events-none absolute rounded-xs border border-frame bg-desk px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-on-desk"
            style={{ left: `${WAIT_ZONE.left + WAIT_ZONE.width - 4}%`, top: `${LOWER_TOP + 4}%` }}
          >
            +{scene.waitingOverflow}
          </div>
        )}
      </div>

      {/* 조명 — 해석 카피 없이 밝기만 바뀐다. 거리·건물 전부를 덮어 같은 밤으로 읽힌다. */}
      <div
        className={`pointer-events-none absolute inset-0 transition-colors duration-700 ${LIGHT_WASH[scene.lighting]}`}
        aria-hidden
      />
    </div>
  );
}
