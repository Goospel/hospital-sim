"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
// ⚠️ 상대 경로 임포트 — 이 파일은 vitest(별칭 미설정)로도 돌기 때문에 `@/`를 쓸 수 없다.
import { tick } from "../sim/tick";
import type { SimPhase, SimWorld } from "../sim/world";

/** 배속 — 0은 일시정지. 시간 조작 UI가 고르는 값의 전부다(1주차). */
export type SimSpeed = 0 | 1 | 3;

/**
 * 시뮬 판(`/sim`)의 실시간 ↔ 게임분 환율. **페이싱 튜닝은 이 한 줄이다.**
 *
 * 600ms/분이면 폰이 분당 2타일이므로 1배속에서 초당 약 3.3타일 — 사람이 걷는 속도로 읽힌다.
 * 하루 600분은 1배속 약 6분, 3배속 약 2분.
 *
 * 클래식 판의 `MS_PER_GAME_MIN`(50)과 **일부러 분리했다** — 그쪽은 통화 재생 페이싱이자
 * `flowStepCount`의 불변식(`MS_PER_GAME_MIN < CLOCK_TICK_MS`)이 걸린 상수라, 체감 속도를
 * 고치려고 건드리면 관계없는 화면이 함께 망가진다.
 */
export const SIM_MS_PER_GAME_MIN = 600;

/**
 * 실제로 흐르는 배속 — 마감·결산 국면에서는 플레이어가 고른 배속과 **무관하게** 0이다.
 *
 * tick도 비RUNNING 세계를 그대로 돌려주므로 세계는 코어 수준에서 이미 안전하다. 그런데도
 * 여기서 한 번 더 세우는 이유는 화면 쪽 계약이 두 개 더 걸려 있어서다: 오버레이가 떠 있는
 * 동안 rAF가 매 프레임 setWorld를 부르는 낭비를 없애고, 같은 값이 TileMap의 폰 전환 시간
 * (stepMs)으로도 흘러 결산 화면 뒤에서 폰이 미끄러지지 않게 한다.
 *
 * 배속 선택(speed)을 0으로 **덮어쓰지 않고** 파생값으로 두는 건 건설 중 자동 일시정지와 같은
 * 이유다 — 상태를 저장·복원하면 국면이 바뀌는 순간 배속이 0에 갇힌다. 다음 날로 넘어가면
 * phase가 RUNNING으로 돌아오는 것만으로 원래 배속이 되살아난다.
 */
export function effectiveSpeed(phase: SimPhase, speed: SimSpeed): SimSpeed {
  return phase === "RUNNING" ? speed : 0;
}

/**
 * 프레임이 아무리 잘거나 굵어도 게임 시간이 새지 않게 — 흘러간 실시간을 **정수 분 + 이월 ms**로 쪼갠다.
 *
 * tick(world, minutes)은 정수 분만 받는다(시간 분할 불변식). 그래서 프레임마다 남는 자투리를
 * 버리면 배속·프레임레이트에 따라 게임 시각이 조용히 뒤처지고, 배속이 "같은 시간을 빨리"가
 * 아니라 "시간을 덜" 도는 게 된다. 남는 ms를 돌려주는 이유가 그것이다 — 호출부가 다음
 * 프레임 경과에 더해 주면 손실이 0이 된다.
 *
 * ⚠️ 나눗셈 순서가 계약의 일부다. `elapsedMs / (SIM_MS_PER_GAME_MIN / speed)`로 쓰면 환율이
 * 배속으로 딱 나뉘지 않을 때 몫이 부동소수에서 살짝 커져 **경계에서만 한 분씩 사라진다**
 * (50ms/분 시절 실측: 3배속 250ms가 15분이 아니라 14분, k=1..300 중 135개가 틀렸다).
 * 지금 값 600은 3으로 정확히 떨어져 그 증상이 드러나지 않지만, 페이싱은 또 바뀔 수 있으므로
 * 곱을 먼저 하는 `elapsedMs * speed / SIM_MS_PER_GAME_MIN` 형태를 유지한다.
 * 아래 '정확히 k분치' 테스트가 이 순서를 잠근다.
 */
export function minutesToTick(elapsedMs: number, speed: number): { minutes: number; carryMs: number } {
  // 일시정지는 이월도 0이다 — 멈춘 동안 쌓아 뒀다가 재개 순간에 한꺼번에 쏟으면 정지가 아니다.
  if (speed <= 0) return { minutes: 0, carryMs: 0 };
  const ms = Math.max(0, elapsedMs);
  const minutes = Math.floor((ms * speed) / SIM_MS_PER_GAME_MIN);
  return { minutes, carryMs: ms - (minutes * SIM_MS_PER_GAME_MIN) / speed };
}

/**
 * 한 프레임에 반영할 실시간 상한(ms). 탭이 백그라운드로 가면 rAF가 멈췄다가 돌아오는데,
 * 그 공백을 그대로 넘기면 한 프레임에서 수천 분을 돌려(= tick 루프 수천 회) 화면이 얼어붙는다.
 * 잘린 시간은 게임에서 사라지지만, 안 보이는 동안 병원이 하루를 지나 있는 것보다 낫다.
 */
const MAX_FRAME_MS = 250;

/**
 * 서버엔 레이아웃 단계가 없어 useLayoutEffect가 경고를 낸다(정적 프리렌더 대상이라 실제로 탄다).
 * 클라이언트에서만 레이아웃 효과를 쓰는 표준 우회 — 분기는 환경당 한 번 정해지므로 훅 순서는 불변이다.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * 실시간 → 게임 시간. requestAnimationFrame 루프가 경과분만큼 world를 전진시킨다.
 *
 * speed를 ref로 읽는 이유: 배속이 바뀔 때마다 effect를 재시작하면 그 순간 rAF가 끊겨
 * 프레임 하나만큼의 시간이 매번 증발하고, 이월(carry)도 함께 버려진다. 루프는 마운트 동안
 * 한 번만 돌고, 배속은 루프 안에서 최신 값을 본다.
 */
export function useSimClock(speed: SimSpeed, setWorld: (fn: (w: SimWorld) => SimWorld) => void): void {
  const speedRef = useRef(speed);
  const setWorldRef = useRef(setWorld);

  /*
    갱신 시점이 정확도의 일부다 — **레이아웃 효과**여야 한다.

    useEffect(passive)는 페인트 *뒤에* 스케줄러가 흘린다. 그런데 rAF 콜백은 페인트 *앞에*
    돈다 — 즉 배속을 바꾼 커밋과 그 값이 ref에 닿는 시점 사이에 프레임 하나가 낄 수 있고,
    그 프레임은 옛 배속으로 계산된다(3×·프레임 정체가 겹치면 최대 15게임분이 샌다).
    레이아웃 효과는 커밋 직후 **같은 태스크에서 동기로** 돌아 그 틈이 아예 없다.
    (렌더 중 직접 대입은 react-hooks/refs가 막는다 — 그래서 이 자리다.)
  */
  useIsomorphicLayoutEffect(() => {
    speedRef.current = speed;
    setWorldRef.current = setWorld;
  });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let carryMs = 0;

    const frame = (now: number) => {
      const elapsed = Math.min(now - last, MAX_FRAME_MS);
      last = now;
      const { minutes, carryMs: rest } = minutesToTick(carryMs + elapsed, speedRef.current);
      carryMs = rest;
      if (minutes > 0) setWorldRef.current((w) => tick(w, minutes));
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
