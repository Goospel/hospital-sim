"use client";

import { useEffect, useState } from "react";

/**
 * 랜딩 타이틀 카드 — 게임의 첫 화면(원본 97a012c "수화기 너머의 벽" 랜딩을 되살림).
 * 카피는 현재 게임(병원 경영 전체 아크)에 맞춰 재프레이밍: 세우고=채용 / 받고=콜큐·응급 / 대가를 치른다=결말.
 * 어두운 책상(desk) 위 표지 한 장. 제목만 명조(사람이 쓴 판정) — 나머지는 전부 고딕이다(스펙 §6).
 * CTA는 `bg-go` — 초록(1막 유혹)→붉은 잉크(결말 적자) 아크의 시작점(위저드 CTA와 동색).
 * 서술 카피는 손대지 않는다(스펙 §8-B: 카피 재작성은 별도 세션으로 보존).
 */
export default function Landing({ onStart }: { onStart: () => void }) {
  // 마운트 후 1회 fade-in. prefers-reduced-motion이면 아래 motion-reduce:transition-none이 전환을 없애
  // 콘텐츠가 즉시 표시된다(품질 바닥에서도 내용은 그대로).
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(true), []);

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-desk px-6 py-12 text-center text-on-desk">
      <div
        className={`flex flex-col items-center transition-opacity duration-700 ease-out motion-reduce:transition-none ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      >
        <p className="mb-6 text-xs font-medium uppercase tracking-[0.3em] text-on-desk/60">
          대한민국 의료 시스템 시뮬레이션
        </p>

        <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-6xl">수화기 너머의 벽</h1>

        {/* 제목 아래 얇은 괘선 — 서류의 머리줄. 장식이라 aria-hidden 없이도 의미가 없다. */}
        <span aria-hidden className="mt-5 block h-px w-24 bg-frame" />

        <p className="mt-6 max-w-md text-base leading-7 text-on-desk/70 sm:text-lg">
          병원을 세우고, 환자를 받고, 그 대가를 치른다.
          <br />
          최선을 다해도 결과를 정하는 건, 당신이 아니라{" "}
          <span className="text-on-desk">구조</span>다.
        </p>

        <button
          type="button"
          onClick={onStart}
          className="mt-12 rounded-xs bg-go px-10 py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        >
          시작
        </button>

        <p className="mt-16 font-mono text-xs tracking-wide text-on-desk/70">
          NAN 2026 · 프로토타입
        </p>
      </div>
    </main>
  );
}
