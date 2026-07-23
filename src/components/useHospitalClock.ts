"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CLOCK_TICK_MS, dayEndMin, flowStepCount, sweepMinutes } from "@/game/hospitalMap";
import { needsDecision, type ReceivingState } from "@/game/receiving";

/**
 * 이번 구간의 목표 시각 — 흐름이 어디서 멈추는가.
 *
 * 진행 중 → **다음 '결정 필요' 콜**의 도착 시각. 없으면 마감까지 그냥 흐른다.
 * 마감    → dayEndMin(19시를 넘겨 마지막 진료가 끝날 때까지 돈다)
 *
 * 과거엔 **모든** 콜에서 멈췄다. 하루 5통일 땐 그게 게임의 박자였지만, 콜 제한을 없애 하루
 * 20~40통이 되면서 같은 규칙이 「계속」 40연타가 된다 — 그중 실제로 고를 게 있는 건 예약진료와
 * 응급뿐이다(합쳐 최대 15번, 스펙 2026-07-24 §2). 그래서 멈추는 자리를 결정이 있는 곳으로만
 * 좁혔다(needsDecision이 단일 출처). 나머지 콜은 흐르는 동안 처리되고, 그 결과는 맵과 처리
 * 스트림이 보여준다.
 *
 * 빈 큐는 퇴화 케이스라 흐르지 않는다 — 아무 일도 없는 하루를 30초 재생할 이유가 없다.
 */
function flowTargetMin(receiving: ReceivingState): number {
  if (receiving.queue.length === 0) return receiving.clockMin;
  if (receiving.done) return dayEndMin(receiving.busyUntil);
  const next = receiving.queue.slice(receiving.index).find(needsDecision);
  return next?.arrivalMin ?? dayEndMin(receiving.busyUntil);
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
  const from = receiving.clockMin;

  /*
    접근성 설정은 **한 번만** 읽는다(지연 초기화). 렌더마다 matchMedia를 부르지 않으려는
    것이고, 서버에선 false다 — 이 값은 첫 렌더 출력에 안 쓰이므로(아래 조정은 구간이
    *바뀔 때*만 발동한다) 하이드레이션 불일치가 생기지 않는다.
  */
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const seq = useMemo(
    () => sweepMinutes(from, to, reduced ? 1 : flowStepCount(from, to)),
    [from, to, reduced],
  );

  // 초기값은 목표가 아니라 **출발 시각**이다 — to로 시작하면 첫 페인트에서 뒤로 튀었다가 다시 감긴다.
  const [atMin, setAtMin] = useState(from);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    구간이 바뀌면 시각을 새 구간의 **첫 프레임**으로 즉시 되돌린다.

    이걸 effect에 두면 안 된다: effect는 페인트 **후에** 돌아, 새 구간의 첫 프레임이
    한 번은 이전 구간의 끝 시각으로 그려진다. 구간 길이가 0인 경우(to === from)엔 그
    한 프레임 동안 `flowing`이 참으로 잘못 계산돼 결정 카드가 깜빡인다.

    렌더 중 setState는 리액트가 바로 이 목적으로 문서화한 경로다(입력이 바뀔 때 상태
    조정) — 커밋 전에 즉시 재렌더되므로 화면에 중간 상태가 안 나가고, 그래서
    `react-hooks/set-state-in-effect`가 경고하는 연쇄 렌더도 아니다.
  */
  const [segment, setSegment] = useState({ from, to });
  if (segment.from !== from || segment.to !== to) {
    setSegment({ from, to });
    setAtMin(seq[0]);
  }

  useEffect(() => {
    // seq[0]은 위 조정(구간 전환) 또는 초기값이 이미 냈다 — 타이머는 그다음부터 이어 간다.
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
  }, [seq]);

  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAtMin(to);
  };

  return { atMin, flowing: atMin < to, skip };
}
