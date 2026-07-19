"use client";

import type { WorldEvent } from "@/game/world";
import TermGlossary from "./TermGlossary";

/**
 * 외생 이벤트 고지 — 위저드 전에 "세상이 이렇게 바뀌었다"를 신문 속보로 보여준다.
 * 해석 카피 없이 헤드라인(사실)만 — show-don't-tell. 효과는 플레이어가 위저드·장부에서 스스로 겪는다.
 */
export default function WorldEventCard({
  event,
  onContinue,
  ctaLabel = "병원 설립으로",
  week,
}: {
  event: WorldEvent;
  onContinue: () => void;
  /** 진행 버튼 문구 — 1주차는 개원(기본), 2주차 이후는 "이번 주 진료로". */
  ctaLabel?: string;
  /** 주차 — 2주차 이후 속보 배지에 표시해 세계가 매주 바뀜을 드러낸다. */
  week?: number;
}) {
  const badge = week && week > 1 ? `${week}주차 · 속보 · 의료계` : "속보 · 의료계";
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-5 py-12 text-zinc-100 bg-zinc-950">
      <header className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{badge}</span>
        <h1 className="text-xl font-semibold leading-snug">{event.headline}</h1>
      </header>

      <TermGlossary text={event.headline} />

      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-zinc-100 py-3 text-base font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        {ctaLabel}
      </button>
    </main>
  );
}
