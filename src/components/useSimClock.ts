"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
// ⚠️ 상대 경로 임포트 — 이 파일은 vitest(별칭 미설정)로도 돌기 때문에 `@/`를 쓸 수 없다.
import { MS_PER_GAME_MIN } from "../game/hospitalMap";
import { tick } from "../sim/tick";
import type { SimWorld } from "../sim/world";

/** 배속 — 0은 일시정지. 시간 조작 UI가 고르는 값의 전부다(1주차). */
export type SimSpeed = 0 | 1 | 3;

/**
 * 프레임이 아무리 잘거나 굵어도 게임 시간이 새지 않게 — 흘러간 실시간을 **정수 분 + 이월 ms**로 쪼갠다.
 *
 * tick(world, minutes)은 정수 분만 받는다(시간 분할 불변식). 그래서 프레임마다 남는 자투리를
 * 버리면 배속·프레임레이트에 따라 게임 시각이 조용히 뒤처지고, 배속이 "같은 시간을 빨리"가
 * 아니라 "시간을 덜" 도는 게 된다. 남는 ms를 돌려주는 이유가 그것이다 — 호출부가 다음
 * 프레임 경과에 더해 주면 손실이 0이 된다.
 *
 * ⚠️ 나눗셈 순서가 계약의 일부다. `elapsedMs / (MS_PER_GAME_MIN / speed)`로 쓰면 50/3이
 * 부동소수에서 살짝 커져 **경계에서만 한 분씩 사라진다** — 3배속 250ms가 15분이 아니라 14분,
 * 500ms가 30분이 아니라 29분이 된다(실측: k=1..300 중 135개가 틀린다. 250·500처럼 딱 떨어지는
 * 입력도 틀리므로 "드문 값"이 아니다). 곱을 먼저 하는 `elapsedMs * speed / MS_PER_GAME_MIN`
 * 형태는 같은 범위에서 전부 맞는다. 아래 '정확히 k분치' 테스트가 이 순서를 잠근다.
 */
export function minutesToTick(elapsedMs: number, speed: number): { minutes: number; carryMs: number } {
  // 일시정지는 이월도 0이다 — 멈춘 동안 쌓아 뒀다가 재개 순간에 한꺼번에 쏟으면 정지가 아니다.
  if (speed <= 0) return { minutes: 0, carryMs: 0 };
  const ms = Math.max(0, elapsedMs);
  const minutes = Math.floor((ms * speed) / MS_PER_GAME_MIN);
  return { minutes, carryMs: ms - (minutes * MS_PER_GAME_MIN) / speed };
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
