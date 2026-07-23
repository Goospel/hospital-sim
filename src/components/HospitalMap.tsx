"use client";

import type { Lighting, MapAvatar, MapScene } from "@/game/hospitalMap";
import { BedSprite, DoctorSprite, PatientSprite } from "./PixelSprite";

/**
 * 탑다운 병원 맵 — MapScene을 그대로 그리는 순수 표시층. 게임 상태를 만들지도 읽지도 않는다.
 *
 * 배경(방·복도·병동)은 정적으로 깔고 **아바타는 절대 좌표 한 레이어**에 둔다.
 * 방↔복도를 DOM 부모 교체로 표현하면 이동이 remount가 되어 애니메이션이 죽는다 —
 * key={id}를 유지한 채 left/top만 바꿔야 CSS transition이 사이를 걷는다.
 */

// 세로 밴드 — positionOf()의 top 값과 반드시 함께 움직인다.
const ROOMS_H = 52; // 진료실 줄: 0% ~ 52%
const CORRIDOR_H = 16; // 복도: 52% ~ 68%

const LIGHT_WASH: Record<Lighting, string> = {
  DAY: "bg-transparent",
  DUSK: "bg-orange-950/30",
  NIGHT: "bg-indigo-950/60",
};

/** zone·slot → 맵 안 백분율 좌표. 좌표를 순수 함수가 아니라 여기서 정하는 이유는 레이아웃 상수라서다. */
function positionOf(a: MapAvatar, scene: MapScene): { left: string; top: string } {
  if (a.zone === "ROOM") {
    const col = scene.rooms.find((r) => r.dept === a.dept)?.col ?? 0;
    const cell = 100 / scene.rooms.length;
    // 한 방에 최대 3명(deptCap 상한)이라 칸 안에서 30%·50%·70% 지점에 세운다.
    return { left: `${col * cell + cell * (0.3 + a.slot * 0.2)}%`, top: `${ROOMS_H * 0.62}%` };
  }
  if (a.zone === "BED") {
    const cell = 100 / Math.max(1, scene.beds.length);
    return { left: `${a.slot * cell + cell / 2}%`, top: `${ROOMS_H + CORRIDOR_H + 16}%` };
  }
  // 복도 — 의사·환자가 한 카운터를 공유해 자리가 겹치지 않는다.
  return { left: `${6 + a.slot * 7}%`, top: `${ROOMS_H + CORRIDOR_H / 2}%` };
}

export default function HospitalMap({ scene }: { scene: MapScene }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
      {/* 진료실 줄 */}
      <div
        className="absolute inset-x-0 top-0 grid gap-1 p-1.5"
        style={{ height: `${ROOMS_H}%`, gridTemplateColumns: `repeat(${scene.rooms.length}, minmax(0, 1fr))` }}
      >
        {scene.rooms.map((room) => (
          <div
            key={room.dept}
            className={`flex flex-col justify-end rounded-sm border transition-colors duration-500 ${
              room.lit
                ? room.staffed
                  ? "border-zinc-700 bg-zinc-800"
                  : "border-zinc-800 bg-zinc-800/40" // 빈 방 — 안 뽑은 과가 여기 보인다
                : "border-zinc-900 bg-black/60"
            }`}
          >
            <span
              className={`truncate px-1 pb-0.5 text-center text-[9px] leading-tight ${
                room.lit ? "text-zinc-400" : "text-zinc-700"
              }`}
            >
              {room.label}
            </span>
          </div>
        ))}
      </div>

      {/* 복도 */}
      <div
        className="absolute inset-x-0 border-y border-zinc-800 bg-zinc-950"
        style={{ top: `${ROOMS_H}%`, height: `${CORRIDOR_H}%` }}
      />

      {/* 병동 — 침대는 비어 있어도 칸이 남는다 */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-start justify-around px-1.5 pt-1.5"
        style={{ top: `${ROOMS_H + CORRIDOR_H}%` }}
      >
        {scene.beds.map((bed) => (
          <div key={bed.index} className="h-7 w-7 sm:h-9 sm:w-9">
            <BedSprite occupied={bed.occupantDoctorId !== undefined} />
          </div>
        ))}
      </div>

      {/* 아바타 레이어 — 이동이 곧 transition이다 */}
      <div className="absolute inset-0">
        {scene.avatars.map((a) => {
          const { left, top } = positionOf(a, scene);
          return (
            <div
              key={a.id}
              className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-linear sm:h-6 sm:w-6"
              style={{ left, top }}
            >
              {a.kind === "DOCTOR" && a.dept ? <DoctorSprite dept={a.dept} busy={a.busy} /> : <PatientSprite />}
            </div>
          );
        })}
      </div>

      {/* 조명 — 해석 카피 없이 밝기만 바뀐다 */}
      <div
        className={`pointer-events-none absolute inset-0 transition-colors duration-700 ${LIGHT_WASH[scene.lighting]}`}
        aria-hidden
      />
    </div>
  );
}
