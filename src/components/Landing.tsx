"use client";

import { useEffect, useState } from "react";

/**
 * 랜딩 타이틀 카드 — 게임의 첫 화면(원본 97a012c "수화기 너머의 벽" 랜딩을 되살림).
 * 카피는 현재 게임(병원 경영 전체 아크)에 맞춰 재프레이밍: 세우고=채용 / 받고=콜큐·응급 / 대가를 치른다=결말.
 * 통일 시각의 다크 지면 위, CTA는 emerald — 초록(1막 유혹)→빨강(응급) 아크의 시작점(위저드 CTA와 동색).
 */
export default function Landing({ onStart }: { onStart: () => void }) {
  // 마운트 후 1회 fade-in. prefers-reduced-motion이면 아래 motion-reduce:transition-none이 전환을 없애
  // 콘텐츠가 즉시 표시된다(품질 바닥에서도 내용은 그대로).
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(true), []);

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-12 text-center text-zinc-100">
      <div
        className={`flex flex-col items-center transition-opacity duration-700 ease-out motion-reduce:transition-none ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      >
        <p className="mb-6 text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          대한민국 의료 시스템 시뮬레이션
        </p>

        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">수화기 너머의 벽</h1>

        <p className="mt-6 max-w-md text-base leading-7 text-zinc-400 sm:text-lg">
          병원을 세우고, 환자를 받고, 그 대가를 치른다.
          <br />
          최선을 다해도 결과를 정하는 건, 당신이 아니라{" "}
          <span className="text-zinc-200">구조</span>다.
        </p>

        <button
          type="button"
          onClick={onStart}
          className="mt-12 rounded-lg bg-emerald-600 px-10 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          시작
        </button>

        <p className="mt-16 text-xs tracking-wide text-zinc-600">NAN 2026 · 프로토타입</p>
      </div>
    </main>
  );
}
