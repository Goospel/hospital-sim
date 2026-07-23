"use client";

import { ambientWalkers, wanderTiming, type Lighting, type MapAvatar, type MapScene } from "@/game/hospitalMap";
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
    // 그 방 점유 인원 n명을 칸 안에 균등 분배: slot이 0..n-1이어도 (slot+1)/(n+1)은 항상
    // (0,1) 내부라 상한을 가정하지 않아도 구조적으로 칸을 못 벗어난다(혼자면 정중앙).
    const occupants = scene.avatars.filter((other) => other.zone === "ROOM" && other.dept === a.dept).length;
    return { left: `${col * cell + (cell * (a.slot + 1)) / (occupants + 1)}%`, top: `${ROOMS_H * 0.62}%` };
  }
  if (a.zone === "BED") {
    const cell = 100 / Math.max(1, scene.beds.length);
    // 병동 밴드 상단(ROOMS_H+CORRIDOR_H%)에서 침대 스프라이트 중심까지: pt-1.5(6px) +
    // sm:h-9 침대의 절반(18px) = 1.5rem(24px). %와 px를 더해야 해서 calc()가 필수다 —
    // 침대 스프라이트 크기(h-7/sm:h-9)가 바뀌면 이 1.5rem도 같이 바꿔야 한다.
    return { left: `${a.slot * cell + cell / 2}%`, top: `calc(${ROOMS_H + CORRIDOR_H}% + 1.5rem)` };
  }
  // 복도 — 의사·환자가 한 카운터를 공유해 자리가 겹치지 않는다. 사용 가능 폭은 6%~94%(88%)뿐이라
  // slot당 7% 고정이면 인원이 늘 때 화면 밖으로 밀려난다 — 인원수에 맞춰 간격을 줄여 마지막
  // 인원도 항상 94% 안에 들어오게 한다.
  const corridorCount = scene.avatars.filter((other) => other.zone === "CORRIDOR").length;
  const step = corridorCount > 1 ? Math.min(7, 88 / (corridorCount - 1)) : 7;
  return { left: `${6 + a.slot * step}%`, top: `${ROOMS_H + CORRIDOR_H / 2}%` };
}

export default function HospitalMap({ scene }: { scene: MapScene }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xs border border-frame bg-desk-2">
      {/* 진료실 줄 */}
      <div
        className="absolute inset-x-0 top-0 grid gap-1 p-1.5"
        style={{ height: `${ROOMS_H}%`, gridTemplateColumns: `repeat(${scene.rooms.length}, minmax(0, 1fr))` }}
      >
        {scene.rooms.map((room) => (
          <div
            key={room.dept}
            className={`flex flex-col justify-end rounded-xs border transition-colors duration-500 ${
              room.lit
                ? room.staffed
                  ? "border-frame bg-frame/70"
                  : "border-frame/60 bg-frame/25" // 빈 방 — 안 뽑은 과가 여기 보인다
                : "border-desk bg-black/60"
            }`}
          >
            {/*
              9px는 스펙의 12px 하한 아래라 대비를 깎을 여유가 없다 — 켜진 방은 잉크를 최대로 준다.
              (토큰화하며 /70으로 낮췄더니 2.37까지 떨어져 되돌렸다. 꺼진 방이 흐린 건 의도다 —
              불이 꺼졌다는 사실 자체가 "안 뽑은 과"를 보여주는 정보다.)
            */}
            <span
              className={`truncate px-1 pb-0.5 text-center text-[9px] leading-tight ${
                room.lit ? "text-on-desk" : "text-on-desk/25"
              }`}
            >
              {room.label}
            </span>
          </div>
        ))}
      </div>

      {/* 복도 */}
      <div
        className="absolute inset-x-0 border-y border-frame bg-desk"
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

      {/*
        배경 보행자 — 콜과 무관한 익명 통행. MapScene에 없다(게임 상태가 아니라 장식).
        CSS 애니메이션이라 게임 시계가 멈춰도 계속 걷는다 — 결정 대기 중에도 병원이 돈다.
        불투명도를 낮춰 침대 위의 '진짜' 환자와 구별한다.
      */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {ambientWalkers(scene.lighting).map((w) => (
          <div
            key={w.id}
            className="hm-walker absolute h-4 w-4 -translate-y-1/2 opacity-40 sm:h-5 sm:w-5"
            style={{
              // 복도 밴드(ROOMS_H% ~ ROOMS_H+CORRIDOR_H%) 안의 세 줄: 56% / 60% / 64%
              top: `${ROOMS_H + 4 + w.lane * 4}%`,
              animationDelay: `${w.delayMs}ms`,
              animationDuration: `${w.durationMs}ms`,
            }}
          >
            <PatientSprite />
          </div>
        ))}
      </div>

      {/* 아바타 레이어 — 이동이 곧 transition이다 */}
      <div className="absolute inset-0">
        {scene.avatars.map((a) => {
          const { left, top } = positionOf(a, scene);
          const wander = wanderTiming(a.id);
          return (
            <div
              key={a.id}
              className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-linear sm:h-6 sm:w-6"
              style={{ left, top }}
            >
              {/*
                안쪽은 transform 전용이다 — 바깥이 left/top(배치 이동)을 쓰므로 속성이
                갈려야 이동과 배회가 서로 안 덮어쓴다. 바깥의 -translate-*도 transform이지만
                별개 요소라 충돌하지 않는다.
              */}
              <div
                className="hm-wander h-full w-full"
                style={{ animationDelay: `${wander.delayMs}ms`, animationDuration: `${wander.durationMs}ms` }}
              >
                {a.kind === "DOCTOR" && a.dept ? <DoctorSprite dept={a.dept} busy={a.busy} /> : <PatientSprite />}
              </div>
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
