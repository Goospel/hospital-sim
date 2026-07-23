"use client";

import { useEffect, useRef, useState } from "react";
import { CLOCK_TICK_MS, dayEndMin, flowStepCount, sweepMinutes } from "@/game/hospitalMap";
import type { ReceivingState } from "@/game/receiving";

/**
 * 이번 구간의 목표 시각 — 흐름이 어디서 멈추는가.
 *
 * 진행 중 → 다음 콜의 도착 시각(거기서 멈추고 플레이어가 결정한다)
 * 마감    → dayEndMin(19시를 넘겨 마지막 진료가 끝날 때까지 돈다)
 *
 * 빈 큐는 퇴화 케이스라 흐르지 않는다 — 아무 일도 없는 하루를 30초 재생할 이유가 없다.
 */
function flowTargetMin(receiving: ReceivingState): number {
  if (!receiving.done) return receiving.queue[receiving.index]?.arrivalMin ?? receiving.clockMin;
  if (receiving.queue.length === 0) return receiving.clockMin;
  return dayEndMin(receiving.busyUntil);
}

/**
 * 게임 시각 atMin 하나를 내놓는다 — 맵·HUD·명단이 이걸 공유한다.
 *
 * 게임 상태를 전혀 건드리지 않는다: 중간에 끊기든 스킵하든 판정은 동일하다.
 * 구간의 출발점은 상태에서 파생한다 — receiving.clockMin은 decide가 직전 콜의
 * arrivalMin으로 전진시킨 값이라 정확히 '지난 콜 시각'이다. 이전 상태를 ref에
 * 들고 있을 필요가 없다.
 */
export function useHospitalClock(receiving: ReceivingState): {
  atMin: number;
  flowing: boolean;
  skip: () => void;
} {
  const to = flowTargetMin(receiving);
  // 초기값은 목표가 아니라 **출발 시각**이다 — to로 시작하면 첫 페인트에서 뒤로 튀었다가 다시 감긴다.
  const [atMin, setAtMin] = useState(receiving.clockMin);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const from = receiving.clockMin;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seq = sweepMinutes(from, to, reduced ? 1 : flowStepCount(from, to));

    setAtMin(seq[0]);
    let i = 1;
    const tick = () => {
      if (i >= seq.length) return;
      setAtMin(seq[i++]);
      timer.current = setTimeout(tick, CLOCK_TICK_MS);
    };
    if (seq.length > 1) timer.current = setTimeout(tick, CLOCK_TICK_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [receiving.clockMin, to]);

  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAtMin(to);
  };

  return { atMin, flowing: atMin < to, skip };
}
