"use client";

import type { WorldEvent } from "@/game/world";

/**
 * 외생 이벤트 고지 — 위저드 전에 "세상이 이렇게 바뀌었다"를 신문 속보로 보여준다.
 * 해석 카피 없이 헤드라인(사실)만 — show-don't-tell. 효과는 플레이어가 위저드·장부에서 스스로 겪는다.
 */
export default function WorldEventCard({
  event,
  onContinue,
}: {
  event: WorldEvent;
  onContinue: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 py-12 text-zinc-100 bg-zinc-950">
      <header className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">속보 · 의료계</span>
        <h1 className="text-xl font-semibold leading-snug">{event.headline}</h1>
      </header>
      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-zinc-100 py-3 text-base font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        병원 설립으로
      </button>
    </main>
  );
}
