"use client";

import { useEffect, useRef, useState } from "react";
import { FAST_FORWARD_STEPS, sweepDurationMs, sweepMinutes } from "@/game/hospitalMap";
import type { ReceivingState } from "@/game/receiving";

/**
 * 콜 사이의 시간 점프를 재생한다 — 맵에 먹일 시각 atMin 하나만 내놓는다.
 *
 * 게임 상태를 전혀 건드리지 않는다: 중간에 끊기든 스킵하든 판정은 동일하다.
 * 구간 양끝은 상태에서 파생한다 — receiving.clockMin은 decide가 직전 콜의
 * arrivalMin으로 전진시킨 값이라 정확히 '지난 콜 시각'이고, 목표는 다음 콜의
 * 도착 시각이다. 이전 상태를 ref에 들고 있을 필요가 없다.
 */
export function useFastForwardClock(receiving: ReceivingState): {
  atMin: number;
  sweeping: boolean;
  skip: () => void;
} {
  const to = receiving.done ? receiving.clockMin : (receiving.queue[receiving.index]?.arrivalMin ?? receiving.clockMin);
  // 초기값은 목표가 아니라 **출발 시각**이다 — to로 시작하면 첫 페인트에서 뒤로 튀었다가 다시 감긴다.
  const [atMin, setAtMin] = useState(receiving.clockMin);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const from = receiving.clockMin;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seq = sweepMinutes(from, to, reduced ? 1 : FAST_FORWARD_STEPS);
    const interval = seq.length > 1 ? sweepDurationMs(from, to) / seq.length : 0;

    setAtMin(seq[0]);
    let i = 1;
    const tick = () => {
      if (i >= seq.length) return;
      setAtMin(seq[i++]);
      timer.current = setTimeout(tick, interval);
    };
    if (seq.length > 1) timer.current = setTimeout(tick, interval);

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

  return { atMin, sweeping: atMin < to, skip };
}
